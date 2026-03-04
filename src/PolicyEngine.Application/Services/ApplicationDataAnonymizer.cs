using System.Globalization;
using System.Text.Json;
using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Services;

/// <summary>
/// Anonymizes personally identifiable information (PII) in summarized mortgage
/// application JSON before it is sent to the LLM, while preserving all
/// policy-decision-relevant semantics.
///
/// Strategy:
/// - dateOfBirth → ageInYears (LLM needs age for AOW/pension, not calendar date)
/// - countryOfNationality/Birth → zone classification (NL / EU_EEA / NON_EU)
/// - income startDate → yearsEmployed (tenure matters, not calendar date)
/// - income country → zone classification
///
/// Fields that are policy-critical and RETAINED as-is:
/// - gender (insurance/pension calculations)
/// - maritalStatus (income combination rules, liability sharing)
/// - all financial amounts (LTV, LTI, income — decision-critical)
///
/// All transformations are tracked in a report for user transparency (GDPR Article 13/14).
/// </summary>
public static class ApplicationDataAnonymizer
{
    // EU 27 + EEA 3 (IS, LI, NO) + CH — treated as "EU_EEA" for Dutch mortgage policy
    private static readonly HashSet<string> EuEeaCountries = new(StringComparer.OrdinalIgnoreCase)
    {
        "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
        "DE", "GR", "EL", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
        "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
        "IS", "LI", "NO",  // EEA non-EU
        "CH"               // Switzerland (EU-equivalent in most Dutch mortgage policies)
    };

    private static readonly JsonSerializerOptions WriteOpts = new()
    {
        WriteIndented = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    /// <summary>
    /// Anonymize the summarized application JSON and return both the anonymized
    /// JSON and a transparency report of all transformations performed.
    /// </summary>
    public static AnonymizationResult Anonymize(string summarizedJson, DateTime? referenceDate = null)
    {
        var report = new List<AnonymizedFieldDto>();

        try
        {
            using var doc = JsonDocument.Parse(summarizedJson);
            var root = doc.RootElement;

            // Extract referenceDate from JSON if not provided externally
            var refDate = referenceDate ?? ExtractReferenceDate(root) ?? DateTime.UtcNow;

            var result = new Dictionary<string, object?>();

            foreach (var prop in root.EnumerateObject())
            {
                if (prop.Name == "applicants" && prop.Value.ValueKind == JsonValueKind.Array)
                {
                    result["applicants"] = AnonymizeApplicants(prop.Value, refDate, report);
                }
                else
                {
                    result[prop.Name] = DeserializeElement(prop.Value);
                }
            }

            var anonymizedJson = JsonSerializer.Serialize(result, WriteOpts);
            return new AnonymizationResult(anonymizedJson, report);
        }
        catch
        {
            // If parsing fails, return original unchanged with empty report
            return new AnonymizationResult(summarizedJson, report);
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Applicant-level anonymization
    // ────────────────────────────────────────────────────────────

    private static List<Dictionary<string, object?>> AnonymizeApplicants(
        JsonElement applicantsElement, DateTime refDate, List<AnonymizedFieldDto> report)
    {
        var anonymizedApplicants = new List<Dictionary<string, object?>>();
        int index = 0;

        foreach (var applicant in applicantsElement.EnumerateArray())
        {
            var a = new Dictionary<string, object?>();
            string prefix = $"applicants[{index}]";

            foreach (var prop in applicant.EnumerateObject())
            {
                switch (prop.Name)
                {
                    case "dateOfBirth":
                        AnonymizeDateOfBirth(prop.Value, a, prefix, refDate, report);
                        break;

                    case "countryOfNationality":
                        AnonymizeCountry(prop.Value, a, "nationalityZone", prefix, "countryOfNationality",
                            "Nationality converted to zone — policies check NL/EU/Non-EU, not specific country", report);
                        break;

                    case "countryOfBirth":
                        AnonymizeCountry(prop.Value, a, "birthCountryZone", prefix, "countryOfBirth",
                            "Birth country converted to zone — policies check NL/EU/Non-EU, not specific country", report);
                        break;

                    case "incomes":
                        if (prop.Value.ValueKind == JsonValueKind.Array)
                            a["incomes"] = AnonymizeIncomes(prop.Value, prefix, refDate, report);
                        else
                            a[prop.Name] = DeserializeElement(prop.Value);
                        break;

                    default:
                        // All other fields (gender, maritalStatus, financial data) pass through unchanged
                        a[prop.Name] = DeserializeElement(prop.Value);
                        break;
                }
            }

            anonymizedApplicants.Add(a);
            index++;
        }

        return anonymizedApplicants;
    }

    // ────────────────────────────────────────────────────────────
    //  Income-level anonymization
    // ────────────────────────────────────────────────────────────

    private static List<Dictionary<string, object?>> AnonymizeIncomes(
        JsonElement incomesElement, string applicantPrefix,
        DateTime refDate, List<AnonymizedFieldDto> report)
    {
        var anonymizedIncomes = new List<Dictionary<string, object?>>();
        int index = 0;

        foreach (var income in incomesElement.EnumerateArray())
        {
            var inc = new Dictionary<string, object?>();
            string prefix = $"{applicantPrefix}.incomes[{index}]";

            foreach (var prop in income.EnumerateObject())
            {
                switch (prop.Name)
                {
                    case "startDate":
                        AnonymizeStartDate(prop.Value, inc, prefix, refDate, report);
                        break;

                    case "country":
                        AnonymizeCountry(prop.Value, inc, "incomeCountryZone", prefix, "country",
                            "Income country converted to zone — policies check domestic vs. foreign income", report);
                        break;

                    default:
                        inc[prop.Name] = DeserializeElement(prop.Value);
                        break;
                }
            }

            anonymizedIncomes.Add(inc);
            index++;
        }

        return anonymizedIncomes;
    }

    // ────────────────────────────────────────────────────────────
    //  Field-level transformations
    // ────────────────────────────────────────────────────────────

    private static void AnonymizeDateOfBirth(
        JsonElement value, Dictionary<string, object?> target,
        string prefix, DateTime refDate, List<AnonymizedFieldDto> report)
    {
        var dateStr = value.GetString();
        if (dateStr != null && DateTime.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dob))
        {
            int age = CalculateAge(dob, refDate);
            target["ageInYears"] = age;

            report.Add(new AnonymizedFieldDto(
                FieldPath: $"{prefix}.dateOfBirth",
                Category: "PII",
                OriginalHint: $"{dob.Year}-**-**",
                AnonymizedValue: $"{age} years",
                Reason: "Date of birth converted to age — LLM needs age for AOW/pension calculations, not calendar date"
            ));
        }
        else
        {
            report.Add(new AnonymizedFieldDto(
                FieldPath: $"{prefix}.dateOfBirth",
                Category: "PII",
                OriginalHint: "[unparseable]",
                AnonymizedValue: "[removed]",
                Reason: "Date of birth removed — could not parse for age conversion"
            ));
        }
    }

    private static void AnonymizeCountry(
        JsonElement value, Dictionary<string, object?> target,
        string newFieldName, string prefix, string originalFieldName,
        string reason, List<AnonymizedFieldDto> report)
    {
        var country = value.GetString();
        if (!string.IsNullOrWhiteSpace(country))
        {
            var zone = ClassifyCountryZone(country);
            target[newFieldName] = zone;

            report.Add(new AnonymizedFieldDto(
                FieldPath: $"{prefix}.{originalFieldName}",
                Category: "LOCATION",
                OriginalHint: country,
                AnonymizedValue: zone,
                Reason: reason
            ));
        }
    }

    private static void AnonymizeStartDate(
        JsonElement value, Dictionary<string, object?> target,
        string prefix, DateTime refDate, List<AnonymizedFieldDto> report)
    {
        var dateStr = value.GetString();
        if (dateStr != null && DateTime.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var startDate))
        {
            int years = Math.Max(0, (int)((refDate - startDate).TotalDays / 365.25));
            target["yearsEmployed"] = years;

            report.Add(new AnonymizedFieldDto(
                FieldPath: $"{prefix}.startDate",
                Category: "TEMPORAL",
                OriginalHint: $"{startDate.Year}-**-**",
                AnonymizedValue: $"{years} years",
                Reason: "Employment start date converted to tenure — LLM needs duration, not calendar date"
            ));
        }
        else
        {
            report.Add(new AnonymizedFieldDto(
                FieldPath: $"{prefix}.startDate",
                Category: "TEMPORAL",
                OriginalHint: "[unparseable]",
                AnonymizedValue: "[removed]",
                Reason: "Start date removed — could not parse for tenure conversion"
            ));
        }
    }

    // ────────────────────────────────────────────────────────────
    //  Helpers
    // ────────────────────────────────────────────────────────────

    private static DateTime? ExtractReferenceDate(JsonElement root)
    {
        if (root.TryGetProperty("referenceDate", out var refDateEl) &&
            refDateEl.ValueKind == JsonValueKind.String)
        {
            var dateStr = refDateEl.GetString();
            if (dateStr != null && DateTime.TryParse(dateStr, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                return date;
        }
        return null;
    }

    private static string ClassifyCountryZone(string countryCode)
    {
        if (countryCode.Equals("NL", StringComparison.OrdinalIgnoreCase))
            return "NL";
        if (EuEeaCountries.Contains(countryCode))
            return "EU_EEA";
        return "NON_EU";
    }

    private static int CalculateAge(DateTime dob, DateTime refDate)
    {
        int age = refDate.Year - dob.Year;
        if (refDate < dob.AddYears(age))
            age--;
        return Math.Max(0, age);
    }

    private static object? DeserializeElement(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Null => null,
        _ => JsonSerializer.Deserialize<object>(element.GetRawText())
    };
}

/// <summary>
/// Result of the anonymization process: anonymized JSON + transparency report.
/// </summary>
public record AnonymizationResult(
    string AnonymizedJson,
    List<AnonymizedFieldDto> Report
);
