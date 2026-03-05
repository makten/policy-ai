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

    // ─── Options.json parameter reference (built once, reused for every prompt) ──

    private static readonly Lazy<string> _parameterRef = new(LoadParameterRef);

    private record OptionsDoc
    {
        public List<OptionsParam> Parameters { get; init; } = [];
        public List<OptionsRefItem> ProductLines { get; init; } = [];
        public List<OptionsRefItem> DecisionGroups { get; init; } = [];
        public List<string> Arrangements { get; init; } = [];
        public List<string> Categories { get; init; } = [];
    }

    private record OptionsParam
    {
        public string Name { get; init; } = string.Empty;
        public string Type { get; init; } = string.Empty;
        public List<OptionsParam>? Children { get; init; }
    }

    private record OptionsRefItem
    {
        public string Reference { get; init; } = string.Empty;
        public string Value { get; init; } = string.Empty;
    }

    private static string LoadParameterRef()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "context", "options.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "context", "options.json"),
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "context", "options.json"),
        };

        var path = candidates.FirstOrDefault(File.Exists);
        if (path is null)
            return "<!-- options.json not found: specify parameters manually -->";

        try
        {
            var doc = JsonSerializer.Deserialize<OptionsDoc>(File.ReadAllText(path), JsonOpts);
            if (doc?.Parameters is null or { Count: 0 })
                return "<!-- no parameters found in options.json -->";

            var sb = new StringBuilder();

            // ── Arrangement Types ──
            if (doc.Arrangements is { Count: > 0 })
            {
                sb.AppendLine("### Arrangement types (use these exact values in the arrangementTypes array)");
                sb.AppendLine($"  {string.Join(" · ", doc.Arrangements)}");
                sb.AppendLine();
            }

            // ── Categories ──
            if (doc.Categories is { Count: > 0 })
            {
                sb.AppendLine("### Categories (use these exact values for categoryType)");
                sb.AppendLine($"  {string.Join(" · ", doc.Categories)}");
                sb.AppendLine();
            }

            // ── Product Lines ──
            if (doc.ProductLines is { Count: > 0 })
            {
                sb.AppendLine("### Product lines (use the display value in the productLines array)");
                foreach (var pl in doc.ProductLines)
                    sb.AppendLine($"  - \"{pl.Value}\"");
                sb.AppendLine();
            }

            // ── Decision Groups ──
            if (doc.DecisionGroups is { Count: > 0 })
            {
                sb.AppendLine("### Decision groups (use the display value in the decisionGroups array)");
                foreach (var dg in doc.DecisionGroups)
                    sb.AppendLine($"  - \"{dg.Value}\"");
                sb.AppendLine();
            }

            // ── Parameters ──
            var topLevel = doc.Parameters.Where(p => p.Type != "Loop").ToList();
            var loops    = doc.Parameters.Where(p => p.Type == "Loop").ToList();

            sb.AppendLine("### Top-level parameters (use directly in expressions)");
            foreach (var grp in topLevel.GroupBy(p => p.Type).OrderBy(g => g.Key))
                sb.AppendLine($"  {grp.Key}: {string.Join(", ", grp.Select(p => p.Name))}");

            sb.AppendLine();
            sb.AppendLine("### Loop parameters (MUST be accessed inside ForEach/ForAtLeastOne)");
            sb.AppendLine("  NESTING RULE: A child parameter can ONLY appear inside a ForEach/ForAtLeastOne");
            sb.AppendLine("  over its parent loop. Nested loops require nested ForEach nodes.");
            sb.AppendLine();

            foreach (var loop in loops)
                RenderLoop(sb, loop, 0);

            return sb.ToString();
        }
        catch (Exception ex)
        {
            return $"<!-- failed to load options.json: {ex.Message} -->";
        }
    }

    private static void RenderLoop(StringBuilder sb, OptionsParam loop, int depth)
    {
        var indent = new string(' ', depth * 4);
        sb.AppendLine($"{indent}  [Loop: {loop.Name}] → ForEach/ForAtLeastOne(\"{loop.Name}\", ...)");

        if (loop.Children is { Count: > 0 })
        {
            var simple  = loop.Children.Where(c => c.Type != "Loop").ToList();
            var nested  = loop.Children.Where(c => c.Type == "Loop").ToList();

            foreach (var grp in simple.GroupBy(c => c.Type).OrderBy(g => g.Key))
                sb.AppendLine($"{indent}      {grp.Key}: {string.Join(", ", grp.Select(c => c.Name))}");

            foreach (var child in nested)
                RenderLoop(sb, child, depth + 1);
        }

        sb.AppendLine();
    }

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
        $$"""
        You are a Dutch mortgage business rule engineer. Translate policy text into structured
        business rules for the Assessment Configuration API.

        ## Rule fields
        | Field               | Value / format                                                                                    |
        |---------------------|---------------------------------------------------------------------------------------------------|
        | code                | 0 (overwritten)                                                                                   |
        | description         | Dutch, ≤800 chars                                                                                 |
        | startDate           | ISO-8601, default "2025-01-01T00:00:00Z"                                                          |
        | endDate             | null unless explicit expiry                                                                       |
        | nhgApplicableType   | OnlyNotNhg · OnlyNhg · Both                                                                       |
        | categoryType        | Pick from the categories listed in the Available Options section below.                            |
        | rejectionType       | GV · O · GG · P · F2 · BB · V · VZ · F1                                                          |
        | employeeExplanation | Dutch, ≤1000 chars                                                                               |
        | customerExplanation | Dutch, ≤1000 chars, nullable                                                                     |
        | jsonExpression      | ExpressionNode tree; null if rule is purely procedural                                            |
        | arrangementTypes    | Pick from the arrangement types listed in the Available Options section below.                     |
        |                     | Default: include all common types when the rule applies broadly.                                  |
        | decisionGroups      | Pick from the decision groups listed in the Parameters section below.                             |
        |                     | Default: include ALL decision groups unless the policy limits scope.                              |
        | productLines        | Pick from the product lines listed in the Parameters section below.                               |
        |                     | Default: include ALL product lines unless the policy restricts to specific ones.                   |
        | datePolicyType      | ApplicationStartDate · BindingOfferDate (default: ApplicationStartDate)                           |

        ## ExpressionNode — contract specification
        Every jsonExpression is a recursive ExpressionNode object.
        The object MUST only contain the fields defined below — no extra fields (additionalProperties: false).
        The expression MUST evaluate to boolean: true = PASS, false = FAIL.

        ### Top-level shape
        Every node has exactly one required field: "type" (string, see allowed values below).
        All other fields are nullable and only populated when required by that node type.

        ### Allowed values for enum fields
        type         (ExpressionNodeType):
          Constant · Parameter · Characteristic
          And · Or
          Equals · NotEquals · GreaterThan · LessThan · GreaterThanOrEqual · LessThanOrEqual
          Add · Subtract · Multiply · Divide · Min · Max
          IsNull · IsNotNull · IsNullOrZero · IsNullReturn
          If · ForEach · ForAtLeastOne · IsOneOf · SubtractDate

        parameterType (ParameterType):   Boolean · Decimal · String · DateTime
        valueType     (ConstantValueType): Boolean · Decimal · String · DateTime · Enum
        subtractionType (SubtractionType): Days · Months · Years

        ### Node-type field requirements (set unused fields to null / omit them)

        Constant
          { "type": "Constant", "valueType": "<ConstantValueType>", "value": <literal>,
            "enumType": "<string|null>" }
          enumType is required only when valueType = "Enum".

        Parameter
          { "type": "Parameter", "name": "<parameterName>", "parameterType": "<ParameterType>" }

        Characteristic
          { "type": "Characteristic", "name": "<characteristicName>", "value": <literal> }

        Binary comparison / arithmetic  (And · Or · Equals · NotEquals · GreaterThan · LessThan ·
          GreaterThanOrEqual · LessThanOrEqual · Add · Subtract · Multiply · Divide · Min · Max)
          { "type": "<NodeType>", "left": <ExpressionNode>, "right": <ExpressionNode> }

        SubtractDate
          { "type": "SubtractDate", "left": <ExpressionNode>, "right": <ExpressionNode>,
            "subtractionType": "<Days|Months|Years>" }

        Unary null-checks  (IsNull · IsNotNull · IsNullOrZero)
          { "type": "<NodeType>", "expression": <ExpressionNode> }

        IsNullReturn
          { "type": "IsNullReturn", "expression": <ExpressionNode>, "returnValue": <number> }

        If
          { "type": "If", "condition": <ExpressionNode>,
            "trueExpression": <ExpressionNode>, "falseExpression": <ExpressionNode> }

        ForEach          (ALL children in the loop must be true)
          { "type": "ForEach", "collection": "<collectionName>", "expression": <ExpressionNode> }

        ForAtLeastOne    (at least one child must be true)
          { "type": "ForAtLeastOne", "collection": "<collectionName>", "expression": <ExpressionNode> }

        IsOneOf
          { "type": "IsOneOf", "expression": <ExpressionNode>, "values": [<literal>, ...] }

        ### Critical generation rules
        1. true = PASS, false = FAIL. Design expressions so they return true when the rule is satisfied.
        2. Wrap partial-application rules in If: if condition doesn't apply → trueExpression returns true (pass by default).
        3. Wrap nullable decimals in IsNullReturn with a safe default (usually 0).
        4. Child parameters inside a Loop MUST be accessed inside a ForEach/ForAtLeastOne over that loop.
           Nested loops need nested ForEach nodes.
        5. Percentages are plain numbers (100 % = 100, NOT 1.0).
        6. Use SubtractDate for date arithmetic; left = later date, right = earlier date.
        7. Field names are case-sensitive and must match the contract exactly.

        ## Available options (from configuration)
        ONLY use values from the lists below for parameters, arrangement types, categories,
        product lines, and decision groups. Do NOT invent names.
        If a concept cannot be mapped, set jsonExpression=null and note it in employeeExplanation.

        {{_parameterRef.Value}}
        """;

    private static string BuildUserPrompt(string policyText) =>
        $"""
        ## Policy document
        {policyText}

        ## Instructions
        Translate every distinct policy rule into a business rule:
        1. Choose categoryType, rejectionType, nhgApplicableType.
        2. Write Dutch description + employee/customer explanations.
        3. Build jsonExpression using ONLY parameters from the system prompt.
           - Respect nesting: parameters inside a Loop MUST be accessed via ForEach/ForAtLeastOne.
        4. Choose arrangementTypes from the provided list (include all common types when the rule applies broadly).
        5. Choose categoryType from the provided categories list.
        6. Choose productLines from the provided list (include all when the policy applies broadly). There should always be atleast one productline.
        7. Choose decisionGroups from the provided list (include all when the policy applies broadly). There should always be atleast one decisionGroup.

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
            max_tokens = 16000
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

                var choice = doc.RootElement.GetProperty("choices")[0];

                // Detect token-limit truncation before trying to parse
                var finishReason = choice.TryGetProperty("finish_reason", out var fr) ? fr.GetString() : null;
                if (finishReason == "length")
                    throw new InvalidOperationException(
                        "OpenAI response was truncated (finish_reason=length). " +
                        "The generated expression trees are too large for the token budget. " +
                        "Consider splitting the policy document into smaller chunks.");

                var content = choice
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
