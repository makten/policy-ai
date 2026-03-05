using System.Text.Json;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Application.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace PolicyEngine.Infrastructure.Services;

/// <summary>
/// AI Evaluation Service that calls OpenAI GPT-4o (or compatible) to evaluate
/// mortgage applications against business policies using structured JSON output.
/// </summary>
public class OpenAiEvaluationProvider : IEvaluationProvider
{
    private readonly IConfiguration _config;
    private readonly ILogger<OpenAiEvaluationProvider> _logger;
    private readonly HttpClient _httpClient;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public OpenAiEvaluationProvider(
        IConfiguration config,
        ILogger<OpenAiEvaluationProvider> logger,
        IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("OpenAI");
    }

    public async Task<AiProviderResult> EvaluateAsync(
        string applicationJson,
        List<PolicyDto> policies,
        CancellationToken cancellationToken = default)
    {
        var apiKey = _config["OpenAI:ApiKey"] ?? throw new InvalidOperationException("OpenAI API key not configured");
        var model = _config["OpenAI:Model"] ?? "gpt-4o";
        var endpoint = _config["OpenAI:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";

        var policiesJson = JsonSerializer.Serialize(policies.Select(p => new
        {
            p.Code,
            p.Title,
            p.Category,
            p.Description,
            p.Section,
            Entity = p.Entity
        }), JsonOpts);

        // Summarize the application JSON to reduce token usage (~75-80% reduction)
        var (summarizedJson, originalLength, summarizedLength) =
            ApplicationJsonSummarizer.SummarizeWithStats(applicationJson);
        _logger.LogInformation(
            "Application JSON summarized: {OriginalChars} → {SummarizedChars} chars ({ReductionPct:F0}% reduction)",
            originalLength, summarizedLength,
            originalLength > 0 ? (1.0 - (double)summarizedLength / originalLength) * 100 : 0);

        // Anonymize PII before sending to LLM (dateOfBirth→age, countries→zones, startDates→tenure)
        var anonymizationResult = ApplicationDataAnonymizer.Anonymize(summarizedJson);
        var anonymizedJson = anonymizationResult.AnonymizedJson;
        _logger.LogInformation(
            "Anonymized {FieldCount} PII fields before LLM evaluation ({AnonymizedLength} chars)",
            anonymizationResult.Report.Count, anonymizedJson.Length);

        var systemPrompt = BuildSystemPrompt();
        var userPrompt = BuildUserPrompt(policiesJson, anonymizedJson);

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
                    name = "evaluation_response",
                    strict = true,
                    schema = GetJsonSchema()
                }
            },
            temperature = 0.1,
            max_tokens = 16000
        };

        var jsonContent = JsonSerializer.Serialize(requestBody, JsonOpts);

        var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Add("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");

        // Retry logic: up to 3 attempts
        AiEvaluationResponse? result = null;
        TokenUsageDto? tokenUsage = null;
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                _logger.LogInformation("AI Evaluation attempt {Attempt} using model {Model}", attempt, model);

                var response = await _httpClient.SendAsync(request, cancellationToken);
                response.EnsureSuccessStatusCode();

                var responseJson = await response.Content.ReadAsStringAsync(cancellationToken);
                var openAiResponse = JsonDocument.Parse(responseJson);

                var content = openAiResponse.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                // Extract token usage from response
                if (openAiResponse.RootElement.TryGetProperty("usage", out var usage))
                {
                    var promptTokens = usage.GetProperty("prompt_tokens").GetInt32();
                    var completionTokens = usage.GetProperty("completion_tokens").GetInt32();
                    var totalTokens = usage.GetProperty("total_tokens").GetInt32();
                    tokenUsage = new TokenUsageDto("Evaluation", model, promptTokens, completionTokens, totalTokens);
                    _logger.LogInformation("Evaluation token usage: {Prompt} prompt + {Completion} completion = {Total} total",
                        promptTokens, completionTokens, totalTokens);
                }

                if (string.IsNullOrEmpty(content))
                    throw new InvalidOperationException("Empty response from AI provider");

                result = JsonSerializer.Deserialize<AiEvaluationResponse>(content, JsonOpts);

                if (result != null)
                {
                    _logger.LogInformation("AI Evaluation completed: {Verdict}", result.Verdict);
                    return new AiProviderResult(result, tokenUsage ?? new TokenUsageDto("Evaluation", model, 0, 0, 0), anonymizationResult.Report);
                }
            }
            catch (Exception ex) when (attempt < 3)
            {
                _logger.LogWarning(ex, "AI Evaluation attempt {Attempt} failed, retrying...", attempt);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2), cancellationToken);

                // Recreate the request for retry (HttpRequestMessage can only be sent once)
                request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Add("Authorization", $"Bearer {apiKey}");
                request.Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");
            }
        }

        throw new InvalidOperationException("AI evaluation failed after 3 attempts");
    }

    private static string BuildSystemPrompt() =>
        """
        You are a Dutch mortgage policy compliance engine. Your job is to evaluate mortgage
        applications against a set of business policies from Dutch financial institutions.

        You must produce EXACTLY ONE check result per policy code provided.
        The total count of passedChecks + failedChecks + warnings + notEvaluated MUST equal the number of policies.
        If a policy cannot be evaluated because the required data is missing or insufficient,
        place it in the "notEvaluated" array with status "NOT_EVALUATED" and explain which data was missing.

        ## Chain-of-Thought
        For EVERY check, you MUST first reason step-by-step in the "reasoning" field BEFORE
        assigning the status. State the relevant application value, state the policy requirement,
        then reason whether the requirement is met.

        ## Numeric Comparisons
        When a policy involves a numeric threshold (LTV, LTI, age, income, debt ratios, etc.):
        - State the exact numeric value found in the application.
        - State the exact threshold from the policy.
        - Perform the comparison explicitly (e.g., "85% ≤ 100% → PASS").
        - Do NOT round values unless the policy explicitly allows it.

        ## Domain Glossary
        Key definitions for your evaluation:
        - LTV (Loan-to-Value) = total mortgage / marktwaarde × 100
        - LTI (Loan-to-Income) = total mortgage / gross annual household income
        - NHG = Nationale Hypotheek Garantie, applicable when mortgage ≤ NHG limit
        - BKR = Bureau Krediet Registratie, credit registration codes (A/1/2 = negative)
        - AOW = state pension age (currently 67 in the Netherlands)
        - Marktwaarde = market value of the property as appraised
        - Toetsinkomen = qualifying income used for affordability calculations
        - Eigenwoningforfait = deemed rental value percentage of property for tax

        ## Anonymized Fields
        Certain fields have been anonymized for privacy:
        - "ageInYears" replaces dateOfBirth — use this for age-based policy checks.
        - Zone classifications (NL / EU_EEA / NON_EU) replace nationality/country — use for residency policies.
        - "yearsEmployed" replaces employment startDate — use for tenure checks.
        Never flag these transformations as "missing data".

        ## Verdict Rules
        - REJECTED: Any check with status FAIL where the policy category is "Acceptatie", "Inkomen", "Zekerheden", or "Financiering".
        - MANUAL_REVIEW: Any FAIL in other categories, OR 3 or more WARNINGs, OR any NOT_EVALUATED checks.
        - APPROVED: All checks PASS or WARNING (with fewer than 3 warnings) and zero NOT_EVALUATED.

        ## Output
        - Return ONLY valid JSON matching the required schema. No markdown, no explanations outside the JSON.
        - The "summary" field must be a human-readable paragraph in Dutch.
        """;

    private static string BuildUserPrompt(string policiesJson, string applicationJson) =>
        $$"""
        ## Active Policies
        {{policiesJson}}

        ## Mortgage Application Data (key fields extracted)
        {{applicationJson}}

        ## Instructions
        Evaluate the mortgage application against ALL active policies listed above.
        You MUST produce exactly one check per policy code — no more, no fewer.

        For each check:
        1. In "reasoning", think step-by-step: extract the relevant value, state the requirement, compare.
        2. Set "status" to PASS, FAIL, WARNING, or NOT_EVALUATED based on your reasoning.
           - Use NOT_EVALUATED when the application data does not contain the fields needed to assess the policy.
           - Use WARNING when data exists but is borderline or may need human review.
        3. Write a concise Dutch "reason" summarizing the outcome.
        4. Fill "submittedValue" with the application value and "requiredValue" with the policy threshold.
           For NOT_EVALUATED checks, set submittedValue to null and explain what data was missing in the reason.

        ## Example check
        {
          "policyCode": "MUNT-004",
          "policyTitle": "Maximum LTV-ratio",
          "reasoning": "De marktwaarde is €380.000. De totale hypotheek is €320.000. LTV = 320000 / 380000 × 100 = 84,2%. Het beleid vereist LTV ≤ 100%.",
          "status": "PASS",
          "reason": "LTV is 84,2%, ruim binnen de maximale 100%.",
          "submittedValue": "84,2%",
          "requiredValue": "≤ 100%"
        }

        Provide the overall verdict and a human-readable summary in Dutch.
        """;

    private static object GetJsonSchema() => new
    {
        type = "object",
        properties = new
        {
            verdict = new { type = "string", @enum = new[] { "APPROVED", "REJECTED", "MANUAL_REVIEW" } },
            summary = new { type = "string" },
            passedChecks = new
            {
                type = "array",
                items = GetCheckResultSchema()
            },
            failedChecks = new
            {
                type = "array",
                items = GetCheckResultSchema()
            },
            warnings = new
            {
                type = "array",
                items = GetCheckResultSchema()
            },
            notEvaluated = new
            {
                type = "array",
                items = GetCheckResultSchema()
            }
        },
        required = new[] { "verdict", "summary", "passedChecks", "failedChecks", "warnings", "notEvaluated" },
        additionalProperties = false
    };

    private static object GetCheckResultSchema() => new
    {
        type = "object",
        properties = new
        {
            policyCode = new { type = "string" },
            policyTitle = new { type = "string" },
            reasoning = new { type = "string" },
            status = new { type = "string", @enum = new[] { "PASS", "FAIL", "WARNING", "NOT_EVALUATED" } },
            reason = new { type = "string" },
            submittedValue = new { type = new[] { "string", "null" } },
            requiredValue = new { type = new[] { "string", "null" } }
        },
        required = new[] { "policyCode", "policyTitle", "reasoning", "status", "reason", "submittedValue", "requiredValue" },
        additionalProperties = false
    };
}
