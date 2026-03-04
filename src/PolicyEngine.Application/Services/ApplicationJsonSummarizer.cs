using System.Text.Json;

namespace PolicyEngine.Application.Services;

/// <summary>
/// Extracts only policy-decision-relevant fields from a mortgage application JSON,
/// stripping noise (GUIDs, interest component catalogs, contact details, addresses,
/// reference linkages) to reduce LLM prompt token consumption by ~75-80%.
///
/// Strategy: Whitelist extraction of known fields from the Dutch mortgage application
/// (AMA/HDN) format. Falls back to truncated raw JSON for unknown formats.
/// </summary>
public static class ApplicationJsonSummarizer
{
    private static readonly JsonSerializerOptions WriteOpts = new()
    {
        WriteIndented = false, // compact output for minimal tokens
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// Produce a condensed version of the application JSON containing only
    /// the fields relevant for policy compliance evaluation.
    /// </summary>
    /// <returns>
    /// A compact JSON string with decision-relevant fields only.
    /// Original size ~22KB → summarized ~3-4KB (75-80% reduction).
    /// </returns>
    public static string Summarize(string applicationJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(applicationJson);
            var root = doc.RootElement;

            var summary = new Dictionary<string, object?>();
            int fieldsExtracted = 0;

            // ── Top-level fields ──
            fieldsExtracted += CopyIfExists(root, summary, "productLineReference");
            fieldsExtracted += CopyIfExists(root, summary, "assessmentType");
            fieldsExtracted += CopyIfExists(root, summary, "riskRating");
            fieldsExtracted += CopyIfExists(root, summary, "actualPurchasePrice");
            fieldsExtracted += CopyIfExists(root, summary, "hasNHG");
            fieldsExtracted += CopyIfExists(root, summary, "hasPreliminaryNote");
            fieldsExtracted += CopyIfExists(root, summary, "spendingTargetType");
            fieldsExtracted += CopyIfExists(root, summary, "arrangementType");
            fieldsExtracted += CopyIfExists(root, summary, "originalApplicationDate");
            fieldsExtracted += CopyIfExists(root, summary, "referenceDate");

            // ── Applicants ──
            fieldsExtracted += ExtractApplicants(root, summary);

            // ── Real estate (primary property only) ──
            fieldsExtracted += ExtractPrimaryRealEstate(root, summary);

            // ── Loan details (strip interest component catalog) ──
            fieldsExtracted += ExtractLoanDetails(root, summary);

            // ── Financing costs (all items – small and policy-relevant) ──
            fieldsExtracted += ExtractFinancingCosts(root, summary);

            // ── Calculations (LTV, LTI, maximumFunding, etc.) ──
            fieldsExtracted += ExtractCalculations(root, summary);

            // ── BKR information ──
            fieldsExtracted += ExtractBkr(root, summary);

            // ── Morality (VIS/IVR hits) ──
            fieldsExtracted += ExtractMorality(root, summary);

            // If we extracted at least some fields, return the summary
            if (fieldsExtracted > 3)
            {
                return JsonSerializer.Serialize(summary, WriteOpts);
            }

            // Fallback: unknown format — truncate raw JSON
            return TruncateFallback(applicationJson);
        }
        catch
        {
            return TruncateFallback(applicationJson);
        }
    }

    /// <summary>
    /// Returns the original and summarized lengths for logging purposes.
    /// </summary>
    public static (string summarizedJson, int originalLength, int summarizedLength) SummarizeWithStats(string applicationJson)
    {
        var summarized = Summarize(applicationJson);
        return (summarized, applicationJson.Length, summarized.Length);
    }

    // ────────────────────────────────────────────────────────────
    //  Extraction helpers
    // ────────────────────────────────────────────────────────────

    private static int ExtractApplicants(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("applicantCollection", out var collection) ||
            !collection.TryGetProperty("applicants", out var applicants) ||
            applicants.ValueKind != JsonValueKind.Array)
            return 0;

        var applicantList = new List<Dictionary<string, object?>>();
        int count = 0;

        foreach (var applicant in applicants.EnumerateArray())
        {
            var a = new Dictionary<string, object?>();

            count += CopyIfExists(applicant, a, "applicantType");
            count += CopyIfExists(applicant, a, "countryOfNationality");
            count += CopyIfExists(applicant, a, "maritalStatus");
            count += CopyIfExists(applicant, a, "hasBeenDivorced");
            count += CopyIfExists(applicant, a, "foreignTaxpayer");
            count += CopyIfExists(applicant, a, "relevantIncomeExcludingOtherIncome");
            count += CopyIfExists(applicant, a, "gender");
            count += CopyIfExists(applicant, a, "dateOfBirth");
            count += CopyIfExists(applicant, a, "isFirstMortgageEver");
            count += CopyIfExists(applicant, a, "totalYearlyIncome");
            count += CopyIfExists(applicant, a, "isForeignBKRCheckRequired");
            count += CopyIfExists(applicant, a, "isCustomerWithEmploymentAfterRetirement");
            count += CopyIfExists(applicant, a, "isCustomerWithPensionAndPayrollIncome");
            count += CopyIfExists(applicant, a, "countryOfBirth");

            // Extract income details (strip noise, keep decision-relevant fields)
            count += ExtractIncomes(applicant, a);

            if (a.Count > 0)
                applicantList.Add(a);
        }

        if (applicantList.Count > 0)
            summary["applicants"] = applicantList;

        return count;
    }

    private static int ExtractIncomes(JsonElement applicant, Dictionary<string, object?> target)
    {
        if (!applicant.TryGetProperty("incomeCollection", out var collection) ||
            !collection.TryGetProperty("incomes", out var incomes) ||
            incomes.ValueKind != JsonValueKind.Array)
            return 0;

        var incomeList = new List<Dictionary<string, object?>>();
        int count = 0;

        foreach (var income in incomes.EnumerateArray())
        {
            var inc = new Dictionary<string, object?>();

            count += CopyIfExists(income, inc, "incomeType");
            count += CopyIfExists(income, inc, "employmentType");
            count += CopyIfExists(income, inc, "annualIncome");
            count += CopyIfExists(income, inc, "incomePeriod");
            count += CopyIfExists(income, inc, "startDate");
            count += CopyIfExists(income, inc, "country");
            count += CopyIfExists(income, inc, "majorShareholder");
            count += CopyIfExists(income, inc, "cashPayment");
            count += CopyIfExists(income, inc, "hasWageGarnishment");
            count += CopyIfExists(income, inc, "probationaryPeriod");
            count += CopyIfExists(income, inc, "isFlexWork");

            // Extract wage additions if present (policy-relevant for income calculation)
            if (income.TryGetProperty("wageAdditions", out var wages) &&
                wages.ValueKind == JsonValueKind.Object)
            {
                var w = new Dictionary<string, object?>();
                foreach (var prop in wages.EnumerateObject())
                {
                    w[prop.Name] = GetJsonValue(prop.Value);
                    count++;
                }
                if (w.Count > 0)
                    inc["wageAdditions"] = w;
            }

            if (inc.Count > 0)
                incomeList.Add(inc);
        }

        if (incomeList.Count > 0)
            target["incomes"] = incomeList;

        return count;
    }

    private static int ExtractPrimaryRealEstate(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("realEstateCollection", out var collection) ||
            !collection.TryGetProperty("realEstates", out var realEstates) ||
            realEstates.ValueKind != JsonValueKind.Array)
            return 0;

        int count = 0;

        // Extract ALL real estates but mark which is the primary — policies may
        // reference secondary properties (e.g., overbrugging, foreign property rules)
        var reList = new List<Dictionary<string, object?>>();

        foreach (var re in realEstates.EnumerateArray())
        {
            var r = new Dictionary<string, object?>();

            count += CopyIfExists(re, r, "realEstateType");
            count += CopyIfExists(re, r, "specificHouseType");
            count += CopyIfExists(re, r, "isToBeFinanced");
            count += CopyIfExists(re, r, "mainResidence");
            count += CopyIfExists(re, r, "isCooperativeHouse");
            count += CopyIfExists(re, r, "hasCooperativeRestrictiveOwnership");
            count += CopyIfExists(re, r, "yearOfConstruction");
            count += CopyIfExists(re, r, "hasPurchasingCosts");
            count += CopyIfExists(re, r, "ownerOccupied");
            count += CopyIfExists(re, r, "country");
            count += CopyIfExists(re, r, "propertyStatus");
            count += CopyIfExists(re, r, "marketValue");
            count += CopyIfExists(re, r, "commercialPercentage");
            count += CopyIfExists(re, r, "commercialPercentageAfterRenovation");
            count += CopyIfExists(re, r, "isCommune");
            count += CopyIfExists(re, r, "isHomeOfApplication");
            count += CopyIfExists(re, r, "isHolidayHome");
            count += CopyIfExists(re, r, "hasGarage");
            count += CopyIfExists(re, r, "realEstateRentalType");
            count += CopyIfExists(re, r, "activeVVE");
            count += CopyIfExists(re, r, "hasMaintenanceFund");

            // Building type (extract type + purchasePrice, skip addresses)
            if (re.TryGetProperty("buildingType", out var bt) && bt.ValueKind == JsonValueKind.Object)
            {
                var btSummary = new Dictionary<string, object?>();
                count += CopyIfExists(bt, btSummary, "type");
                count += CopyIfExists(bt, btSummary, "purchasePrice");
                count += CopyIfExists(bt, btSummary, "movableProperty");
                count += CopyIfExists(bt, btSummary, "landPurchasePrice");
                count += CopyIfExists(bt, btSummary, "hasOverdueMaintenanceGreaterThan10PercentMarketValue");
                count += CopyIfExists(bt, btSummary, "overdueMaintenance");
                if (btSummary.Count > 0)
                    r["buildingType"] = btSummary;
            }

            // Valuation (decision-critical for LTV)
            if (re.TryGetProperty("valuation", out var val) && val.ValueKind == JsonValueKind.Object)
            {
                var v = new Dictionary<string, object?>();
                count += CopyIfExists(val, v, "value");
                count += CopyIfExists(val, v, "valueBeforeRenovation");
                count += CopyIfExists(val, v, "source");
                count += CopyIfExists(val, v, "date");
                count += CopyIfExists(val, v, "hasContaminatedSoil");
                count += CopyIfExists(val, v, "maintenanceCondition");
                if (v.Count > 0)
                    r["valuation"] = v;
            }

            // Energy label
            if (re.TryGetProperty("energyLabel", out var el) && el.ValueKind == JsonValueKind.Object)
            {
                var e = new Dictionary<string, object?>();
                count += CopyIfExists(el, e, "energyLabelType");
                if (e.Count > 0)
                    r["energyLabel"] = e;
            }

            if (r.Count > 0)
                reList.Add(r);
        }

        if (reList.Count > 0)
            summary["realEstates"] = reList;

        return count;
    }

    private static int ExtractLoanDetails(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("agreementCollection", out var ac) ||
            !ac.TryGetProperty("agreements", out var agreements) ||
            agreements.ValueKind != JsonValueKind.Array)
            return 0;

        var loanList = new List<Dictionary<string, object?>>();
        int count = 0;

        foreach (var agreement in agreements.EnumerateArray())
        {
            if (!agreement.TryGetProperty("loanCollection", out var lc) ||
                !lc.TryGetProperty("loan", out var loans) ||
                loans.ValueKind != JsonValueKind.Array)
                continue;

            foreach (var loan in loans.EnumerateArray())
            {
                var l = new Dictionary<string, object?>();

                count += CopyIfExists(loan, l, "loanType");
                count += CopyIfExists(loan, l, "productType");
                count += CopyIfExists(loan, l, "productName");
                count += CopyIfExists(loan, l, "loanAmount");
                count += CopyIfExists(loan, l, "loanTermInMonths");
                count += CopyIfExists(loan, l, "hasNHG");
                count += CopyIfExists(loan, l, "fiscalRegime");
                count += CopyIfExists(loan, l, "repaymentMethod");
                count += CopyIfExists(loan, l, "interestPeriodInMonths");
                count += CopyIfExists(loan, l, "interestProductBehaviour");
                count += CopyIfExists(loan, l, "mutationType");
                count += CopyIfExists(loan, l, "startDate");
                count += CopyIfExists(loan, l, "endDate");
                count += CopyIfExists(loan, l, "originalDurationNumberOfMonths");
                count += CopyIfExists(loan, l, "remainingLoanAmount");
                count += CopyIfExists(loan, l, "nonTaxDeductableLoanAmount");
                count += CopyIfExists(loan, l, "isInRRAPeriod");
                count += CopyIfExists(loan, l, "hasTRA");

                // Extract only the final interest rate, NOT the 29-item component catalog
                if (loan.TryGetProperty("interestOffer", out var io) &&
                    io.TryGetProperty("interestComposition", out var ic))
                {
                    var interest = new Dictionary<string, object?>();
                    count += CopyIfExists(ic, interest, "finalRate");
                    if (interest.Count > 0)
                        l["interestRate"] = interest;
                }

                if (l.Count > 0)
                    loanList.Add(l);
            }
        }

        if (loanList.Count > 0)
            summary["loans"] = loanList;

        return count;
    }

    private static int ExtractFinancingCosts(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("financingCosts", out var costs) ||
            costs.ValueKind != JsonValueKind.Object)
            return 0;

        var c = new Dictionary<string, object?>();
        int count = 0;

        // Copy all financing cost fields (they're all small and policy-relevant)
        foreach (var prop in costs.EnumerateObject())
        {
            c[prop.Name] = GetJsonValue(prop.Value);
            count++;
        }

        if (c.Count > 0)
            summary["financingCosts"] = c;

        return count;
    }

    private static int ExtractCalculations(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("calculationsInformation", out var calc) ||
            calc.ValueKind != JsonValueKind.Object)
            return 0;

        var c = new Dictionary<string, object?>();
        int count = 0;

        // Pick decision-critical calculation fields (skip reference linkages)
        count += CopyIfExists(calc, c, "loanToValuePercentage");
        count += CopyIfExists(calc, c, "spaceAllowedExpenseComply");
        count += CopyIfExists(calc, c, "maximumFundingBasedOnMarketValue");
        count += CopyIfExists(calc, c, "ltiSufficient10Years");
        count += CopyIfExists(calc, c, "ltiSufficientFullDuration");
        count += CopyIfExists(calc, c, "totalFinancingCostsAmount");
        count += CopyIfExists(calc, c, "ltvBasedOnMarketValue");
        count += CopyIfExists(calc, c, "maximumEnergySavingBudget");
        count += CopyIfExists(calc, c, "sumInterestOnlyAmountExceeded");
        count += CopyIfExists(calc, c, "sumInterestOnlyAmountExceededCustomArrangement");
        count += CopyIfExists(calc, c, "totalInterestOnlyNew");
        count += CopyIfExists(calc, c, "hasResidualDebtFinancing");
        count += CopyIfExists(calc, c, "hasOnlyResidualDebtFinancing");
        count += CopyIfExists(calc, c, "totalAmountOtherIncome");
        count += CopyIfExists(calc, c, "lowestIncomeWithin10Years");
        count += CopyIfExists(calc, c, "principalNew");
        count += CopyIfExists(calc, c, "maximumBridgingAmount");
        count += CopyIfExists(calc, c, "principalBridgingLoan");
        count += CopyIfExists(calc, c, "totalAmountMortgageWithGreenDiscount");

        if (c.Count > 0)
            summary["calculations"] = c;

        return count;
    }

    private static int ExtractBkr(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("bkrInformation", out var bkr) ||
            bkr.ValueKind != JsonValueKind.Object)
            return 0;

        var b = new Dictionary<string, object?>();
        int count = 0;

        foreach (var prop in bkr.EnumerateObject())
        {
            b[prop.Name] = GetJsonValue(prop.Value);
            count++;
        }

        if (b.Count > 0)
            summary["bkrInformation"] = b;

        return count;
    }

    private static int ExtractMorality(JsonElement root, Dictionary<string, object?> summary)
    {
        if (!root.TryGetProperty("moralityInformation", out var morality) ||
            morality.ValueKind != JsonValueKind.Object)
            return 0;

        var m = new Dictionary<string, object?>();
        int count = 0;

        foreach (var prop in morality.EnumerateObject())
        {
            m[prop.Name] = GetJsonValue(prop.Value);
            count++;
        }

        if (m.Count > 0)
            summary["moralityInformation"] = m;

        return count;
    }

    // ────────────────────────────────────────────────────────────
    //  Utility methods
    // ────────────────────────────────────────────────────────────

    /// <summary>
    /// Copy a property from a JsonElement to a dictionary if it exists.
    /// Returns 1 if copied, 0 if not found.
    /// </summary>
    private static int CopyIfExists(JsonElement source, Dictionary<string, object?> target, string propertyName)
    {
        if (source.TryGetProperty(propertyName, out var value))
        {
            target[propertyName] = GetJsonValue(value);
            return 1;
        }
        return 0;
    }

    /// <summary>
    /// Convert a JsonElement to a .NET object suitable for serialization.
    /// </summary>
    private static object? GetJsonValue(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => element.GetRawText() // arrays/objects — serialize as-is
    };

    private static string TruncateFallback(string json) =>
        json.Length > 4000 ? json[..4000] : json;
}
