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
            max_tokens = 8000
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

        You must evaluate EVERY policy provided and determine whether the application data
        satisfies each policy's requirements.

        Rules:
        - Be precise: cite specific values from the application data.
        - Be thorough: check every policy, even if information is missing (mark as WARNING if data is insufficient).
        - Be Dutch-domain aware: understand BKR, NHG, LTV, marktwaarde, AOW, etc.
        - Return ONLY valid JSON matching the required schema. No markdown, no explanations outside the JSON.

        Rules for data/policies:
        - Ignore rent
        - Ignore holiday home/vacation home
        - Ignore new build/prefab/renovation
        - Ignore valuation
        - Ignore NHG
        - Ignore leasehold/building lease/auction
        - Ignore applicant appeal
        - Ignore tax continuation
        - Ignore anything with the word 'error'
        - Ignore family/parents
        - Ignore cross-border worker
        - Ignore interest deduction
        - Ignore collateral for sale/sold
        - Ignore joint liability
        - Ignore joint and several discharge
        - Ignore demonstration/burden of proof
        - Ignore refinancing/increase/transfer
        - Ignore interest compensation
        - Ignore box 2
        - Ignore residual debt
        - Ignore existing financing
        - Ignore word “market value ratio”
        - Ignore word “customisation”
        - Ignore building deposit

        Verdict logic:
        - APPROVED: All checks pass (warnings are acceptable).
        - REJECTED: One or more critical checks fail.
        - MANUAL_REVIEW: No hard failures, but significant warnings requiring human review.
        """;

    private static string BuildUserPrompt(string policiesJson, string applicationJson) =>
        $"""
        ## Active Policies
        {policiesJson}

        ## Mortgage Application Data (key fields extracted)
        {applicationJson}

        ## Instructions
        Evaluate the mortgage application against ALL active policies listed above.
        The application data above contains only the decision-relevant fields extracted from the full application.
        Certain personal data has been anonymized for privacy: dates of birth appear as "ageInYears", nationality/birth countries as zone classifications (NL/EU_EEA/NON_EU), and employment start dates as "yearsEmployed".
        If a field needed for a policy check is not present, mark the check as WARNING with a note that the data was not provided.
        For each policy, determine: PASS, FAIL, WARNING, or IGNORE.
        Provide the overall verdict and a human-readable summary in Dutch.
        For each check, specify what value was found in the application and what the policy requires.
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
            ignoredChecks = new
            {
                type = "array",
                items = GetCheckResultSchema()
            }
        },
        required = new[] { "verdict", "summary", "passedChecks", "failedChecks", "warnings", "ignoredChecks" },
        additionalProperties = false
    };

    private static object GetCheckResultSchema() => new
    {
        type = "object",
        properties = new
        {
            policyCode = new { type = "string" },
            policyTitle = new { type = "string" },
            status = new { type = "string", @enum = new[] { "PASS", "FAIL", "WARNING", "IGNORE" } },
            reason = new { type = "string" },
            submittedValue = new { type = new[] { "string", "null" } },
            requiredValue = new { type = new[] { "string", "null" } }
        },
        required = new[] { "policyCode", "policyTitle", "status", "reason", "submittedValue", "requiredValue" },
        additionalProperties = false
    };
}
