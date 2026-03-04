using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;

namespace PolicyEngine.Infrastructure.Services;

/// <summary>
/// Translates policy documents into structured business rules compatible with
/// the Assessment Configuration API (AddBusinessRuleRequest schema).
///
/// Strategy:
///  1. Receive a list of PolicyDto (from a policy document) or raw text.
///  2. Build a detailed prompt that includes:
///     - The policy descriptions
///     - The available parameters from the options API
///     - The expression node grammar (ExpressionNode schema)
///     - The valid enum values (CategoryType, RejectionType, ArrangementType, etc.)
///  3. Send to GPT-4o with structured output (json_schema) to produce business rules.
///  4. Parse and return the generated rules.
/// </summary>
public class BusinessRuleParser : IBusinessRuleParser
{
    private readonly IConfiguration _config;
    private readonly ILogger<BusinessRuleParser> _logger;
    private readonly HttpClient _httpClient;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public BusinessRuleParser(
        IConfiguration config,
        ILogger<BusinessRuleParser> logger,
        IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("OpenAI");
    }

    // ─── Public entry points ─────────────────────────────────────────────

    public async Task<GenerateBusinessRulesResponse> GenerateBusinessRulesAsync(
        List<PolicyDto> policies, CancellationToken ct = default)
    {
        if (policies.Count == 0)
            return new GenerateBusinessRulesResponse { Warnings = new List<string> { "No policies provided." } };

        var policyText = BuildPolicyTextFromDtos(policies);
        return await GenerateFromPolicyTextAsync(policyText, ct);
    }

    public async Task<GenerateBusinessRulesResponse> GenerateBusinessRulesFromTextAsync(
        string policyText, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(policyText))
            return new GenerateBusinessRulesResponse { Warnings = new List<string> { "No policy text provided." } };

        return await GenerateFromPolicyTextAsync(policyText, ct);
    }

    // ─── Core generation logic ───────────────────────────────────────────

    private async Task<GenerateBusinessRulesResponse> GenerateFromPolicyTextAsync(
        string policyText, CancellationToken ct)
    {
        var systemPrompt = BuildSystemPrompt();
        var userPrompt = BuildUserPrompt(policyText);

        _logger.LogInformation("Generating business rules from {Chars} chars of policy text", policyText.Length);

        var (rules, tokenUsage) = await CallOpenAiStructuredAsync(systemPrompt, userPrompt, ct);

        _logger.LogInformation("Generated {Count} business rules", rules.Count);

        // Assign sequential codes starting from 701
        for (int i = 0; i < rules.Count; i++)
        {
            rules[i] = rules[i] with { Code = 700 + i + 1 };
        }

        return new GenerateBusinessRulesResponse
        {
            BusinessRules = rules,
            TotalGenerated = rules.Count,
            TokenUsage = tokenUsage,
            Warnings = new List<string>()
        };
    }

    // ─── Build policy text from DTOs ─────────────────────────────────────

    private static string BuildPolicyTextFromDtos(List<PolicyDto> policies)
    {
        var sb = new StringBuilder();
        foreach (var p in policies)
        {
            sb.AppendLine($"## Policy {p.Code} — {p.Title}");
            sb.AppendLine($"Category: {p.Category}");
            sb.AppendLine($"Section: {p.Section}");
            sb.AppendLine($"Description: {p.Description}");
            sb.AppendLine();
        }
        return sb.ToString();
    }

    // ─── Prompt construction ─────────────────────────────────────────────

    private static string BuildSystemPrompt() =>
        """
        You are an expert Dutch mortgage business rule engineer. Your task is to translate 
        mortgage policy documents into structured business rules that can be executed by 
        the Assessment Configuration API.

        ## Output format
        Each business rule must have:
        - **code**: An integer (will be overwritten, use 0)
        - **description**: A concise Dutch description of the rule (max 800 chars)
        - **startDate**: ISO-8601 datetime, use "2025-01-01T00:00:00Z" as default
        - **endDate**: null unless the policy has an explicit expiry
        - **nhgApplicableType**: One of "OnlyNotNhg", "OnlyNhg", "Both"
        - **categoryType**: One of: Conditions, RealEstate, CurrentProperty, ChangeExistingMortgage, Subsidy, Insurance, Applicant, EmploymentSituation, FinancialObligations, Depots, Interest, Other, Guarantees, OfferMotivations, ConstructionAccount, DeedPassing, Financial, Collateral, ResidualDebtFinancing, CurrentMortgageElsewhere, FRB
        - **rejectionType**: One of: GV, O, GG, P, F2, BB, V, VZ, F1
        - **employeeExplanation**: Dutch explanation for employees (max 1000 chars)
        - **customerExplanation**: Dutch explanation for customers (max 1000 chars, nullable)
        - **jsonExpression**: An expression tree using the ExpressionNode schema (see below). This is the executable logic of the rule. Can be null if the rule is purely procedural.
        - **arrangementTypes**: Array of applicable arrangement types from: None, NoArrangement, FirstMortgage, SequentialMortgageSameLender, SequentialMortgageOtherLender, FurtherAdvance, Conversion, Remortgage, ConversionAndAdvance, ConversionAndSequentialMortgage, ContinuationNewInterest, ContinuationMortgage, SecondOrHigherInRankMortgage, RelayMortgage
        - **decisionGroups**: Array of decision group names. Use: ["Rabobank acceptatiebeleid"] as default
        - **productLines**: Array of product line names. Use: ["Woningfinanciering Plus", "Woningfinanciering Basis"] as default
        - **datePolicyType**: One of: "ApplicationStartDate", "BindingOfferDate". Default: "ApplicationStartDate"

        ## ExpressionNode Schema
        The jsonExpression is a recursive tree. Each node has a "type" and type-specific fields:

        ### Node types and their fields:
        - **Constant**: { type: "Constant", valueType: "Boolean"|"Decimal"|"String"|"DateTime"|"Enum", value: <value>, enumType?: <string> }
        - **Parameter**: { type: "Parameter", name: "<parameterName>", parameterType: "Boolean"|"Decimal"|"String"|"DateTime" }
        - **Characteristic**: { type: "Characteristic", name: "<name>", value: <value> }
        - **And**: { type: "And", left: <node>, right: <node> }
        - **Or**: { type: "Or", left: <node>, right: <node> }
        - **Equals**: { type: "Equals", left: <node>, right: <node> }
        - **NotEquals**: { type: "NotEquals", left: <node>, right: <node> }
        - **GreaterThan**: { type: "GreaterThan", left: <node>, right: <node> }
        - **LessThan**: { type: "LessThan", left: <node>, right: <node> }
        - **GreaterThanOrEqual**: { type: "GreaterThanOrEqual", left: <node>, right: <node> }
        - **LessThanOrEqual**: { type: "LessThanOrEqual", left: <node>, right: <node> }
        - **Add**: { type: "Add", left: <node>, right: <node> }
        - **Subtract**: { type: "Subtract", left: <node>, right: <node> }
        - **Multiply**: { type: "Multiply", left: <node>, right: <node> }
        - **Divide**: { type: "Divide", left: <node>, right: <node> }
        - **Min**: { type: "Min", left: <node>, right: <node> }
        - **Max**: { type: "Max", left: <node>, right: <node> }
        - **IsNull**: { type: "IsNull", expression: <node> }
        - **IsNotNull**: { type: "IsNotNull", expression: <node> }
        - **IsNullOrZero**: { type: "IsNullOrZero", expression: <node> }
        - **IsNullReturn**: { type: "IsNullReturn", expression: <node>, returnValue: <number> }
        - **If**: { type: "If", condition: <node>, trueExpression: <node>, falseExpression: <node> }
        - **ForEach**: { type: "ForEach", collection: "<collectionName>", expression: <node> }
        - **ForAtLeastOne**: { type: "ForAtLeastOne", collection: "<collectionName>", expression: <node> }
        - **IsOneOf**: { type: "IsOneOf", expression: <node>, values: [<value>, ...] }
        - **SubtractDate**: { type: "SubtractDate", left: <node>, right: <node>, subtractionType: "Days"|"Months"|"Years" }

        ### Expression logic:
        - The expression must evaluate to a boolean: **true** = rule passes, **false** = rule fails (triggers rejection).
        - Use **If** nodes to create conditional logic: if the condition applies, check the rule; otherwise return true (pass).
        - Use **IsNullReturn** to handle nullable parameters gracefully (provide a safe default).
        - Use **ForEach** / **ForAtLeastOne** for collection-based checks (e.g. iterate over "Aanvragers", "Leningdelen", "Onderpanden").

        ## Available Parameters
        YOU MUST ONLY use parameter names from the following list. Do NOT invent parameter names.
        If a policy concept cannot be mapped to an available parameter, set jsonExpression to null
        and add a note in employeeExplanation that the rule requires manual configuration.

        Available parameters:
        TotaleInschrijving, RestantTotaleHoofdsomInProces, OnderpandStatus, DatumOntbindendeVoorwaarden,
        Vandaag, OnderpandType, OuderdomTaxatie, Onderpanden, BedragEBV, BedragEBB,
        TotaalBedragRestschuldFinanciering, Verstrekkingspercentage, NHGVolledigheidstoets,
        IsTeFinancierenObject, EigenBewoning, VerhuurType, IsVerhuur, AanvragerLeeftijd, Aanvragers,
        OnderpandBouwSoort, HeeftBouwdepot, ProefTijdVerstreken, AanvragerDienstverbanden,
        OnderpandHeeftOverbruggingJN, Land, AanvragerNationaliteitEULandJN, AanvragerNationaliteitEERLand,
        Nationaliteit, AanvragerTypeVerblijfsvergunning, AanvragerInkomensMeetellenJN,
        DienstverbandOuderdomOudsteInkomensverklaring, MoraliteitsToetsResultaat, MarktwaardeBepaling,
        MarktwaardePeildatum, OverigInkomenSoort, OverigeInkomens, AandeelInEigendom, BouwSoort,
        LTVVoorVerbouw, Verbouwingskosten, StartsomBouwdepot,
        DienstverbandOuderdomOudstePerspectiefverklaring, RiskRating,
        DienstverbandOuderdomOudsteWerkgeversVerklaring, DienstverbandType,
        OnderpandMetAppartementsrechtJN, SomTeVerkopenWoningen, RestschuldBestaandeFinanciering,
        SomTeVerkopenWoningenZonderDatumOntbVoorw, BetrouwbaarheidCalcasaRapport, IsErfpacht,
        VerkoopOnderVoorwaardeType, TotaleHoofdsomZonderOverbrugging, OverbruggingJN,
        HoofdsomOverbrugging, BedragTotaleFinancieringskosten, HoofdsomNieuw, OverbruggingLooptijd,
        Overbruggingen, EersteHypotheekOoit, AflossingsVorm, FiscaalRegimeOvergangsrechtType,
        Leningdelen, HeeftLoonbeslag, AanvragerGeldigheidstermijnUWVVerzekeringsbericht, WoonachtigIn,
        IsNieuweLening, LeningdeelBedragConsumptief, OnterechteVerbintenisJN, AantalAanvragers,
        TypeContractant, Burgelijkestaat, BurgerlijkeStaatAanvragersZijnGelijkAanElkaar,
        AanvullendeDossierGegevensOmschrijving, AanvullendeDossierGegevens,
        BeschikbareRuimteWoonLastenAnnuitaireMaandlast, BeschikbareRuimteWoonLastenMaximaalToegestaneMaandlast,
        BeschikbareRuimteWoonLastenWerkelijkeMaandlast, BeschikbareRuimteWoonLasten,
        AantalHandmatigeRentecomponenten, AanvragerOuderdomOudsteSalarisstrook,
        AanvragerAlleSalarisstrokenHebbenGeldigeDatums, MutatieType, LeningdeelLooptijd,
        InkomenUitNederland, DienstverbandLandCode, BKRContractHeeftCode1OfA,
        BkrContractPraktischeAflosDatum, BKRContractBkrHeeftHCodering, BkrContracten,
        BKRContractHeeftCode2tm5, LaatsteCodering, BKRContractKredietSoort, LaatsteBijzonderheid,
        VruchtGebruik, TotaalAflossingsvrijBestaandLeningen, TotaalAflossingsvrijBestaandEldersLeningen,
        TotaalAflossingsvrijVerplichtingEigenBewoningLeningen, BerekendeMarktwaarde,
        TotaalAflossingsvrijNieuwLeningen, SomAflossingsvrijLeningen, LTIPercentage,
        LopendeHypotheekEldersHeeftBetereRang, BevatCustomRenteComponentZwarteLijst, IsBestaandeLening,
        VrijeVerkoopwaardeNaVerbouw, ProductNaam, TotaleGroenhypotheekHoofdsom,
        VerkoopOnderVoorwaardenJN, TotaleAanschafkosten, HeeftVasteInschrijving, HoofdverblijfJN,
        OnderpandBerekendeMarktwaarde, OuderdomCalcasarapport, OuderdomInJaren, EengezinswoningType,
        LeningdeelHoofdsom, LangstLopendeRestschuldFinanciering, LangstLopendeNietRestschuldFinanciering,
        Recreatiewoning, MaximaleVerstrekkingObvMarktwaardeEBVenEBB,
        TotaleHoofdsomZonderOverbruggingMetLHE, AnnuitaireMaandLastJaar10,
        MaximaalToegestaneMaandLastJaar10, BeschikbareRuimteWoonLastenJaar,
        BeschikbareRuimteWoonLastenDatum, AOWDatumJongsteAanvrager, DoelgroepIsSeniorJN,
        RenteGedrag, VasteRenteEindDatum, RestantRentevastPeriode, RestantLooptijd,
        BedragLeningdelenEindNaAOWLeeftijdJongsteAanvrager, AantalMaatwerkoplossingenUitLijst,
        WoningVanAanvraag, TotaalWerkelijkeMaandbedragLopendeHypothekenElders,
        TotaalCanonMaandbedragLopendeHypothekenElders, BeschikbareRuimteWoonLastenErfpachtMaandlast,
        BeschikbareRuimteWoonLastenBox1Maandlast, BeschikbareRuimteWoonLastenBox3Maandlast,
        TotaleOorspronkelijkeHoofdsomLopendeHypothekenEldersLigtInDeToekomst, Zelfbouw, IsCPO,
        NieuwbouwgarantieVanToepassingJN, AchterstalligOnderhoud, Hoofdsom, OnderpandMarktwaarde,
        LeningDeelNHG, BinnenGeldigheidstermijnInkomensverklaringOndernemer, Omschrijving,
        UitbetalenBijPasseren, BouwdepotRubrieken,
        RestschuldLeningdelenEindNaAOWLeeftijdJongsteAanvrager,
        TotaleRestschuldLopendeHypothekenEldersTeInlossen, BkrContractIsLopend, EindDatum,
        VerwachtePasseerdatum, HeeftGeweigerdeRenteArrangementInDonorlening,
        IsDonorLeningRestschuldfinanciering, NieuweOverbruggingJN, MaxOverbruggingsbedrag,
        TekortOverBruggingsBedragComply, HeeftSVN, BedragSVN, LopendeHypotheekEldersHypotheeknemer,
        VerbondenOnderpandIsTeFinancierenObject, Inlossen, LopendeHypotheekElders,
        OnderdeelVanHypotheekMetSVn, Rentevastperiode, TussenpersoonGemachtigd, TussenpersoonStatus,
        BijzonderWoningType, EengezinswoningJN, FlatwoningJN, WoningType, HeeftGarageJN,
        DubbeleLastenBerekeningUitgevoerd, TekortDubbeleLasten, MaximaleDubbeleLasten,
        WerkelijkeDubbeleLasten

        ## Collections (for ForEach / ForAtLeastOne):
        Aanvragers, Leningdelen, Onderpanden, Overbruggingen, AanvragerDienstverbanden,
        OverigeInkomens, BkrContracten, AanvullendeDossierGegevens, BouwdepotRubrieken,
        LopendeHypotheekElders

        ## Key rules for expression generation:
        1. The expression must evaluate to **true** when the rule PASSES and **false** when it FAILS.
        2. If a policy only applies under certain conditions, wrap with If: condition → check → true (pass by default).
        3. Use IsNullReturn for nullable decimals with a safe default (typically 0).
        4. Prefer simple, readable expressions. Use And/Or for combining conditions.
        5. For percentage checks, values are expressed as decimals (e.g., 100% = 100, not 1.0).
        6. For date comparisons, use SubtractDate with the appropriate unit.
        7. If you cannot express the rule as an expression (e.g., purely procedural/qualitative), set jsonExpression to null.
        """;

    private static string BuildUserPrompt(string policyText) =>
        $"""
        ## Policy Document Content
        {policyText}

        ## Instructions
        Translate each distinct policy rule from the document above into a business rule.
        For each rule:
        1. Determine the correct categoryType, rejectionType, and nhgApplicableType.
        2. Write a clear Dutch description and employee/customer explanations.
        3. Build a jsonExpression tree using ONLY the available parameters listed in the system prompt.
        4. Select appropriate arrangementTypes (use all common types if the rule applies broadly).
        5. If the rule cannot be expressed as a jsonExpression (procedural/qualitative), set jsonExpression to null.

        Generate the business rules now.
        """;

    // ─── OpenAI structured output call ───────────────────────────────────

    private async Task<(List<GeneratedBusinessRuleDto> Rules, TokenUsageDto? Usage)> CallOpenAiStructuredAsync(
        string systemPrompt, string userPrompt, CancellationToken ct)
    {
        var apiKey = _config["OpenAI:ApiKey"] ?? throw new InvalidOperationException("OpenAI API key not configured");
        var model = _config["OpenAI:Model"] ?? "gpt-4o";
        var endpoint = _config["OpenAI:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";

        var requestBody = new
        {
            model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "business_rules_generation",
                    strict = false,
                    schema = GetBusinessRuleSchema()
                }
            },
            temperature = 0.1,
            max_tokens = 8000
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOpts);
        TokenUsageDto? tokenUsage = null;

        // Retry up to 3 times with exponential back-off
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Add("Authorization", $"Bearer {apiKey}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                _logger.LogInformation("Business rule generation AI attempt {Attempt} using {Model}", attempt, model);

                var response = await _httpClient.SendAsync(request, ct);

                if (!response.IsSuccessStatusCode)
                {
                    var errorBody = await response.Content.ReadAsStringAsync(ct);
                    _logger.LogError("OpenAI returned {StatusCode}: {ErrorBody}", response.StatusCode, errorBody);
                    response.EnsureSuccessStatusCode();
                }

                var responseJson = await response.Content.ReadAsStringAsync(ct);
                var doc = JsonDocument.Parse(responseJson);

                // Extract token usage
                if (doc.RootElement.TryGetProperty("usage", out var usage))
                {
                    var promptTokens = usage.GetProperty("prompt_tokens").GetInt32();
                    var completionTokens = usage.GetProperty("completion_tokens").GetInt32();
                    var totalTokens = usage.GetProperty("total_tokens").GetInt32();
                    tokenUsage = new TokenUsageDto("BusinessRuleGeneration", model, promptTokens, completionTokens, totalTokens);
                    _logger.LogInformation("Business rule generation token usage: {Prompt} prompt + {Completion} completion = {Total} total",
                        promptTokens, completionTokens, totalTokens);
                }

                var content = doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                if (string.IsNullOrEmpty(content))
                    throw new InvalidOperationException("Empty response from AI");

                var wrapper = JsonSerializer.Deserialize<BusinessRulesRawWrapper>(content, JsonOpts);
                var rules = (wrapper?.BusinessRules ?? new List<BusinessRuleRawItem>())
                    .Select(raw =>
                    {
                        object? parsedExpression = null;
                        if (!string.IsNullOrWhiteSpace(raw.JsonExpressionText))
                        {
                            try
                            {
                                parsedExpression = JsonSerializer.Deserialize<object>(raw.JsonExpressionText, JsonOpts);
                            }
                            catch
                            {
                                _logger.LogWarning("Could not parse jsonExpressionText for rule {Code}", raw.Code);
                            }
                        }

                        return new GeneratedBusinessRuleDto
                        {
                            Code = raw.Code,
                            Description = raw.Description,
                            StartDate = raw.StartDate,
                            EndDate = string.IsNullOrWhiteSpace(raw.EndDate) ? null : raw.EndDate,
                            NhgApplicableType = raw.NhgApplicableType,
                            CategoryType = raw.CategoryType,
                            RejectionType = raw.RejectionType,
                            EmployeeExplanation = raw.EmployeeExplanation,
                            CustomerExplanation = string.IsNullOrWhiteSpace(raw.CustomerExplanation) ? null : raw.CustomerExplanation,
                            JsonExpression = parsedExpression,
                            ArrangementTypes = raw.ArrangementTypes,
                            DecisionGroups = raw.DecisionGroups,
                            ProductLines = raw.ProductLines,
                            DatePolicyType = raw.DatePolicyType
                        };
                    })
                    .ToList();

                _logger.LogInformation("AI generated {Count} business rules", rules.Count);
                return (rules, tokenUsage);
            }
            catch (Exception ex) when (attempt < 3)
            {
                _logger.LogWarning(ex, "Business rule generation attempt {Attempt} failed, retrying in {Delay}s...",
                    attempt, attempt * 3);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 3), ct);
            }
        }

        _logger.LogError("Failed to generate business rules after 3 attempts");
        return (new List<GeneratedBusinessRuleDto>(), tokenUsage);
    }

    // ─── Response wrappers ─────────────────────────────────────────────

    private record BusinessRuleRawItem
    {
        public int Code { get; init; }
        public string Description { get; init; } = string.Empty;
        public string StartDate { get; init; } = string.Empty;
        public string EndDate { get; init; } = string.Empty;
        public string NhgApplicableType { get; init; } = "Both";
        public string CategoryType { get; init; } = string.Empty;
        public string RejectionType { get; init; } = "O";
        public string EmployeeExplanation { get; init; } = string.Empty;
        public string CustomerExplanation { get; init; } = string.Empty;
        public string JsonExpressionText { get; init; } = string.Empty;
        public List<string> ArrangementTypes { get; init; } = new();
        public List<string> DecisionGroups { get; init; } = new();
        public List<string> ProductLines { get; init; } = new();
        public string DatePolicyType { get; init; } = "ApplicationStartDate";
    }

    private record BusinessRulesRawWrapper
    {
        public List<BusinessRuleRawItem> BusinessRules { get; init; } = new();
    }

    // ─── JSON Schema for structured output ───────────────────────────────

    /// <summary>
    /// Defines the JSON schema for OpenAI structured output.
    /// The jsonExpression field is left as a free-form object (no strict sub-schema)
    /// because the expression tree is deeply recursive and OpenAI structured output
    /// does not support recursive $ref schemas well.
    /// </summary>
    private static object GetBusinessRuleSchema()
    {
        // Build item properties as a Dictionary so we can use "enum" as a key
        // ("enum" is a C# keyword — anonymous types would serialize @enum)
        var itemProperties = new Dictionary<string, object>
        {
            ["code"] = new { type = "integer" },
            ["description"] = new { type = "string" },
            ["startDate"] = new { type = "string" },
            ["endDate"] = new { type = "string" },
            ["nhgApplicableType"] = new Dictionary<string, object>
            {
                ["type"] = "string",
                ["enum"] = new[] { "OnlyNotNhg", "OnlyNhg", "Both" }
            },
            ["categoryType"] = new { type = "string" },
            ["rejectionType"] = new Dictionary<string, object>
            {
                ["type"] = "string",
                ["enum"] = new[] { "GV", "O", "GG", "P", "F2", "BB", "V", "VZ", "F1" }
            },
            ["employeeExplanation"] = new { type = "string" },
            ["customerExplanation"] = new { type = "string" },
            ["jsonExpressionText"] = new { type = "string", description = "The JSON expression tree as a JSON string. Use an empty string if no expression." },
            ["arrangementTypes"] = new { type = "array", items = new { type = "string" } },
            ["decisionGroups"] = new { type = "array", items = new { type = "string" } },
            ["productLines"] = new { type = "array", items = new { type = "string" } },
            ["datePolicyType"] = new Dictionary<string, object>
            {
                ["type"] = "string",
                ["enum"] = new[] { "ApplicationStartDate", "BindingOfferDate" }
            }
        };

        return new
        {
            type = "object",
            properties = new
            {
                businessRules = new
                {
                    type = "array",
                    items = new
                    {
                        type = "object",
                        properties = itemProperties,
                        required = new[]
                        {
                            "code", "description", "startDate", "endDate",
                            "nhgApplicableType", "categoryType", "rejectionType",
                            "employeeExplanation", "customerExplanation", "jsonExpressionText",
                            "arrangementTypes", "decisionGroups", "productLines", "datePolicyType"
                        },
                        additionalProperties = false
                    }
                }
            },
            required = new[] { "businessRules" },
            additionalProperties = false
        };
    }
}
