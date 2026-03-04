using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;
using PolicyEngine.Domain.Enums;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EvaluationsController : ControllerBase
{
    private readonly IEvaluationRepository _evaluationRepo;
    private readonly IPolicyRepository _policyRepo;
    private readonly IEvaluationProvider _aiProvider;
    private readonly IPolicyRetriever _policyRetriever;
    private readonly ILogger<EvaluationsController> _logger;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public EvaluationsController(
        IEvaluationRepository evaluationRepo,
        IPolicyRepository policyRepo,
        IEvaluationProvider aiProvider,
        IPolicyRetriever policyRetriever,
        ILogger<EvaluationsController> logger)
    {
        _evaluationRepo = evaluationRepo;
        _policyRepo = policyRepo;
        _aiProvider = aiProvider;
        _policyRetriever = policyRetriever;
        _logger = logger;
    }

    /// <summary>
    /// Upload a JSON mortgage application and evaluate it against active policies.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
    public async Task<ActionResult<EvaluationResultDto>> Evaluate(
        [FromForm] IFormFile file,
        [FromForm] Guid? policyDocumentId,
        CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file uploaded." });

        // Validate file type
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension != ".json")
            return BadRequest(new { message = "Only JSON files are supported in this version." });

        // Read file content in-memory (security: no disk persistence)
        string applicationJson;
        using (var reader = new StreamReader(file.OpenReadStream()))
        {
            applicationJson = await reader.ReadToEndAsync(ct);
        }

        // Validate JSON
        try
        {
            JsonDocument.Parse(applicationJson);
        }
        catch (JsonException)
        {
            return BadRequest(new { message = "Invalid JSON file." });
        }

        // Load policies via RAG retrieval (semantic search + mandatory categories)
        // Falls back to all policies if RAG is disabled or embeddings not yet generated
        Application.Interfaces.PolicyRetrievalResult retrievalResult;

        if (policyDocumentId.HasValue)
        {
            // When a specific document is selected, load only those policies (no RAG)
            var docPolicies = await _policyRepo.GetAllPoliciesAsync(entity: null, ct: ct);
            docPolicies = docPolicies.Where(p => p.PolicyDocumentId == policyDocumentId.Value).ToList();

            if (!docPolicies.Any())
                return BadRequest(new { message = "No active policies found for the selected document." });

            var docPolicyDtos = docPolicies.Select(p => new PolicyDto(
                p.Id, p.PolicyDocumentId, p.Code, p.Title, p.Category,
                p.SourcePage, p.Section, p.Description, p.IsActive,
                p.PolicyDocument?.Entity ?? "", p.CreatedAt, p.UpdatedAt
            )).ToList();

            retrievalResult = new Application.Interfaces.PolicyRetrievalResult(
                docPolicyDtos, docPolicyDtos.Count, docPolicyDtos.Count, UsedRag: false);
        }
        else
        {
            // Use RAG retriever for intelligent policy selection
            retrievalResult = await _policyRetriever.RetrieveRelevantPoliciesAsync(applicationJson, entity: null, ct);
        }

        if (!retrievalResult.Policies.Any())
            return BadRequest(new { message = "No active policies found. Please import policies first." });

        _logger.LogInformation(
            "Policy retrieval: {Retrieved}/{Total} policies selected (RAG: {UsingRag})",
            retrievalResult.RetrievedCount, retrievalResult.TotalActiveCount, retrievalResult.UsedRag);

        var policyDtos = retrievalResult.Policies;
        var retrievedPolicyVectors = policyDtos.Select(p => new RetrievedPolicyVectorDto(
            p.Id,
            p.Id.ToString(),
            p.Code,
            p.Title,
            p.Category,
            p.Section,
            p.SourcePage,
            p.Entity
        )).ToList();

        // Call AI evaluation
        var sw = Stopwatch.StartNew();
        AiProviderResult aiProviderResult;

        try
        {
            aiProviderResult = await _aiProvider.EvaluateAsync(applicationJson, policyDtos, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI evaluation failed");
            return StatusCode(502, new { message = "AI evaluation service unavailable. Please try again later." });
        }

        sw.Stop();

        var aiResponse = aiProviderResult.Response;

        // Aggregate token usage from all OpenAI calls in this evaluation flow
        var tokenUsageList = new List<TokenUsageDto>();
        if (retrievalResult.EmbeddingTokenUsage != null)
            tokenUsageList.Add(retrievalResult.EmbeddingTokenUsage);
        tokenUsageList.Add(aiProviderResult.TokenUsage);

        var anonymizationReport = aiProviderResult.AnonymizationReport;

        // Parse verdict
        var verdict = aiResponse.Verdict?.ToUpperInvariant() switch
        {
            "APPROVED" => Verdict.Approved,
            "REJECTED" => Verdict.Rejected,
            "MANUAL_REVIEW" => Verdict.ManualReview,
            _ => Verdict.ManualReview
        };

        // Persist evaluation result
        var evaluationResult = new EvaluationResult
        {
            PolicyDocumentId = policyDocumentId,
            Verdict = verdict,
            OriginalFileName = file.FileName,
            ApplicationDataJson = applicationJson,
            RawAiResponseJson = JsonSerializer.Serialize(new PersistedEvaluationPayload(aiResponse, retrievedPolicyVectors, tokenUsageList, anonymizationReport), JsonOpts),
            Summary = aiResponse.Summary ?? "",
            EvaluatedAt = DateTime.UtcNow,
            DurationMs = (int)sw.ElapsedMilliseconds,
            ModelUsed = "gpt-4o",
            RetrievedPolicyCount = retrievalResult.RetrievedCount,
            TotalPolicyCount = retrievalResult.TotalActiveCount
        };

        // Map checks
        var allChecks = new List<(AiCheckResult check, CheckStatus status)>();
        foreach (var c in aiResponse.PassedChecks ?? []) allChecks.Add((c, CheckStatus.Pass));
        foreach (var c in aiResponse.FailedChecks ?? []) allChecks.Add((c, CheckStatus.Fail));
        foreach (var c in aiResponse.Warnings ?? []) allChecks.Add((c, CheckStatus.Warning));

        foreach (var (check, status) in allChecks)
        {
            evaluationResult.Checks.Add(new EvaluationCheck
            {
                PolicyCode = check.PolicyCode ?? "",
                PolicyTitle = check.PolicyTitle ?? "",
                Status = status,
                Reason = check.Reason ?? "",
                SubmittedValue = check.SubmittedValue,
                RequiredValue = check.RequiredValue
            });
        }

        await _evaluationRepo.AddAsync(evaluationResult, ct);

        return Ok(MapToDto(evaluationResult, retrievedPolicyVectors, tokenUsageList, anonymizationReport));
    }

    /// <summary>
    /// List all past evaluations (paginated).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<object>> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var results = await _evaluationRepo.GetAllAsync(page, pageSize, ct);
        var total = await _evaluationRepo.GetCountAsync(ct);

        var dtos = results.Select(MapToSummaryDto).ToList();

        return Ok(new
        {
            data = dtos,
            total,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(total / (double)pageSize)
        });
    }

    /// <summary>
    /// Get a single evaluation with full check details.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<EvaluationResultDto>> GetById(Guid id, CancellationToken ct)
    {
        var result = await _evaluationRepo.GetByIdAsync(id, ct);
        if (result == null) return NotFound();
        return Ok(MapToDto(result));
    }

    // ── Mapping helpers ──

    private static string VerdictToString(Verdict v) => v switch
    {
        Verdict.Approved => "APPROVED",
        Verdict.Rejected => "REJECTED",
        Verdict.ManualReview => "MANUAL_REVIEW",
        _ => "MANUAL_REVIEW"
    };

    private static EvaluationResultDto MapToDto(EvaluationResult e, List<RetrievedPolicyVectorDto>? retrievedPolicies = null, List<TokenUsageDto>? tokenUsage = null, List<AnonymizedFieldDto>? anonymizationReport = null)
    {
        List<RetrievedPolicyVectorDto> policies;
        List<TokenUsageDto> tokens;
        List<AnonymizedFieldDto> anonReport;

        if (retrievedPolicies != null)
        {
            policies = retrievedPolicies;
            tokens = tokenUsage ?? new List<TokenUsageDto>();
            anonReport = anonymizationReport ?? new List<AnonymizedFieldDto>();
        }
        else
        {
            var extracted = ExtractPersistedPayload(e.RawAiResponseJson);
            policies = extracted.RetrievedPolicies;
            tokens = extracted.TokenUsage;
            anonReport = extracted.AnonymizationReport;
        }

        return new EvaluationResultDto(
            e.Id,
            VerdictToString(e.Verdict),
            e.OriginalFileName,
            e.Summary,
            e.EvaluatedAt,
            e.DurationMs,
            e.ModelUsed,
            e.PolicyDocument?.Entity,
            e.RetrievedPolicyCount,
            e.TotalPolicyCount,
            policies,
            e.Checks.Where(c => c.Status == CheckStatus.Pass).Select(MapCheckDto).ToList(),
            e.Checks.Where(c => c.Status == CheckStatus.Fail).Select(MapCheckDto).ToList(),
            e.Checks.Where(c => c.Status == CheckStatus.Warning).Select(MapCheckDto).ToList(),
            tokens,
            anonReport
        );
    }

    private static EvaluationSummaryDto MapToSummaryDto(EvaluationResult e) => new(
        e.Id,
        VerdictToString(e.Verdict),
        e.OriginalFileName,
        e.Summary,
        e.EvaluatedAt,
        e.DurationMs,
        e.PolicyDocument?.Entity,
        e.RetrievedPolicyCount,
        e.TotalPolicyCount,
        e.Checks.Count(c => c.Status == CheckStatus.Pass),
        e.Checks.Count(c => c.Status == CheckStatus.Fail),
        e.Checks.Count(c => c.Status == CheckStatus.Warning)
    );

    private static EvaluationCheckDto MapCheckDto(EvaluationCheck c) => new(
        c.Id,
        c.PolicyCode,
        c.PolicyTitle,
        c.Status.ToString().ToUpperInvariant(),
        c.Reason,
        c.SubmittedValue,
        c.RequiredValue
    );

    private static (List<RetrievedPolicyVectorDto> RetrievedPolicies, List<TokenUsageDto> TokenUsage, List<AnonymizedFieldDto> AnonymizationReport) ExtractPersistedPayload(string rawAiResponseJson)
    {
        if (string.IsNullOrWhiteSpace(rawAiResponseJson))
            return ([], [], []);

        try
        {
            var payload = JsonSerializer.Deserialize<PersistedEvaluationPayload>(rawAiResponseJson, JsonOpts);
            return (
                payload?.RetrievedPolicies ?? [],
                payload?.TokenUsage ?? [],
                payload?.AnonymizationReport ?? []
            );
        }
        catch
        {
        }

        return ([], [], []);
    }

    private sealed record PersistedEvaluationPayload(
        AiEvaluationResponse AiResponse,
        List<RetrievedPolicyVectorDto> RetrievedPolicies,
        List<TokenUsageDto> TokenUsage,
        List<AnonymizedFieldDto>? AnonymizationReport
    );
}
