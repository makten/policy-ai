using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;

namespace PolicyEngine.Infrastructure.Services;

/// <summary>
/// RAG-based policy retriever using pgvector for semantic similarity search.
/// 
/// Strategy (hybrid retrieval):
/// 1. Extract a summary from the mortgage application JSON
/// 2. Embed the summary using text-embedding-3-small
/// 3. Query pgvector for top-K most similar policies (cosine distance)
/// 4. Always include policies from mandatory categories (e.g., "Algemeen", "Compliance")
/// 5. Deduplicate and return the merged set
/// 
/// Fallback: If RAG is disabled, embedding service fails, or no policies have embeddings,
/// returns ALL active policies (original behavior).
/// </summary>
public class PgVectorPolicyRetriever : IPolicyRetriever
{
    private readonly IPolicyRepository _policyRepo;
    private readonly IEmbeddingService _embeddingService;
    private readonly IConfiguration _config;
    private readonly ILogger<PgVectorPolicyRetriever> _logger;

    public PgVectorPolicyRetriever(
        IPolicyRepository policyRepo,
        IEmbeddingService embeddingService,
        IConfiguration config,
        ILogger<PgVectorPolicyRetriever> logger)
    {
        _policyRepo = policyRepo;
        _embeddingService = embeddingService;
        _config = config;
        _logger = logger;
    }

    public async Task<PolicyRetrievalResult> RetrieveRelevantPoliciesAsync(
        string applicationJson,
        string? entity = null,
        CancellationToken ct = default)
    {
        var ragEnabled = bool.Parse(_config["RAG:Enabled"] ?? "true");
        var totalCount = await _policyRepo.GetActivePolicyCountAsync(entity, ct);

        // If RAG is disabled, return all policies
        if (!ragEnabled)
        {
            _logger.LogInformation("RAG disabled — returning all {Count} active policies", totalCount);
            return await FallbackToAllPolicies(entity, totalCount, ct);
        }

        try
        {
            var topK = int.Parse(_config["RAG:TopK"] ?? "20");
            var mandatoryCategories = (_config["RAG:AlwaysIncludeCategories"] ?? "Algemeen,Compliance")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // Step 1: Build a summary of the mortgage application
            var applicationSummary = BuildApplicationSummary(applicationJson);
            _logger.LogInformation("RAG query summary: {Summary}", Truncate(applicationSummary, 200));

            // Step 2: Embed the summary
            var embeddingResult = await _embeddingService.GetEmbeddingAsync(applicationSummary, ct);

            // Step 3: Vector similarity search
            var similarPolicies = await _policyRepo.FindSimilarPoliciesAsync(
                embeddingResult.Embedding, topK, entity, ct);

            _logger.LogInformation("pgvector returned {Count} similar policies", similarPolicies.Count);

            // Step 4: Also fetch mandatory-category policies that may not be in the similarity results
            var allPolicies = await _policyRepo.GetAllPoliciesAsync(entity: entity, ct: ct);
            var mandatoryPolicies = allPolicies
                .Where(p => mandatoryCategories.Contains(p.Category))
                .ToList();

            // Step 5: Merge and deduplicate
            var mergedIds = new HashSet<Guid>();
            var mergedPolicies = new List<Policy>();

            foreach (var p in similarPolicies)
            {
                if (mergedIds.Add(p.Id))
                    mergedPolicies.Add(p);
            }

            foreach (var p in mandatoryPolicies)
            {
                if (mergedIds.Add(p.Id))
                    mergedPolicies.Add(p);
            }

            // If no policies have embeddings (first run), fall back
            if (similarPolicies.Count == 0)
            {
                _logger.LogWarning("No policies with embeddings found — falling back to all policies");
                return await FallbackToAllPolicies(entity, totalCount, ct);
            }

            var policyDtos = mergedPolicies.Select(MapToDto).ToList();

            _logger.LogInformation(
                "RAG retrieval complete: {Retrieved}/{Total} policies selected ({Semantic} semantic + {Mandatory} mandatory)",
                policyDtos.Count, totalCount, similarPolicies.Count,
                mergedPolicies.Count - similarPolicies.Count);

            return new PolicyRetrievalResult(policyDtos, policyDtos.Count, totalCount, UsedRag: true, EmbeddingTokenUsage: embeddingResult.Usage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "RAG retrieval failed — falling back to all policies");
            return await FallbackToAllPolicies(entity, totalCount, ct);
        }
    }

    /// <summary>
    /// Extract key characteristics from the mortgage application JSON to create
    /// a searchable summary text for embedding.
    /// </summary>
    private static string BuildApplicationSummary(string applicationJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(applicationJson);
            var root = doc.RootElement;
            var parts = new List<string>();

            // Try common Dutch mortgage application fields
            TryExtract(root, "hypotheekvorm", parts);
            TryExtract(root, "loanType", parts);
            TryExtract(root, "hypotheekbedrag", parts);
            TryExtract(root, "loanAmount", parts);
            TryExtract(root, "marktwaarde", parts);
            TryExtract(root, "marketValue", parts);
            TryExtract(root, "koopsom", parts);
            TryExtract(root, "rentevastelperiode", parts);
            TryExtract(root, "fixedRatePeriod", parts);
            TryExtract(root, "doel", parts);
            TryExtract(root, "purpose", parts);
            TryExtract(root, "doelHypotheek", parts);
            TryExtract(root, "nhg", parts);
            TryExtract(root, "NHG", parts);
            TryExtract(root, "bkr", parts);
            TryExtract(root, "BKR", parts);
            TryExtract(root, "inkomen", parts);
            TryExtract(root, "income", parts);
            TryExtract(root, "dienstverband", parts);
            TryExtract(root, "employmentType", parts);
            TryExtract(root, "overbrugging", parts);
            TryExtract(root, "verbouwing", parts);
            TryExtract(root, "verduurzaming", parts);
            TryExtract(root, "energielabel", parts);
            TryExtract(root, "leeftijd", parts);
            TryExtract(root, "age", parts);
            TryExtract(root, "nationaliteit", parts);
            TryExtract(root, "nationality", parts);
            TryExtract(root, "woningType", parts);
            TryExtract(root, "propertyType", parts);

            // Also try nested applicant fields
            if (root.TryGetProperty("applicants", out var applicants) && applicants.ValueKind == JsonValueKind.Array)
            {
                foreach (var applicant in applicants.EnumerateArray())
                {
                    TryExtract(applicant, "inkomen", parts);
                    TryExtract(applicant, "income", parts);
                    TryExtract(applicant, "dienstverband", parts);
                    TryExtract(applicant, "employmentType", parts);
                    TryExtract(applicant, "leeftijd", parts);
                    TryExtract(applicant, "age", parts);
                }
            }

            if (parts.Count > 0)
                return string.Join(". ", parts);

            // Fallback: just truncate the raw JSON as the search query
            return applicationJson.Length > 2000
                ? applicationJson[..2000]
                : applicationJson;
        }
        catch
        {
            // If JSON parsing fails, use raw text
            return applicationJson.Length > 2000
                ? applicationJson[..2000]
                : applicationJson;
        }
    }

    private static void TryExtract(JsonElement element, string propertyName, List<string> parts)
    {
        if (element.TryGetProperty(propertyName, out var value))
        {
            var text = value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => value.GetRawText()
            };
            if (!string.IsNullOrWhiteSpace(text))
                parts.Add($"{propertyName}: {text}");
        }
    }

    private async Task<PolicyRetrievalResult> FallbackToAllPolicies(
        string? entity, int totalCount, CancellationToken ct)
    {
        var allPolicies = await _policyRepo.GetAllPoliciesAsync(entity: entity, ct: ct);
        var dtos = allPolicies.Select(MapToDto).ToList();
        return new PolicyRetrievalResult(dtos, dtos.Count, totalCount, UsedRag: false);
    }

    private static PolicyDto MapToDto(Policy p) => new(
        p.Id,
        p.PolicyDocumentId,
        p.Code,
        p.Title,
        p.Category,
        p.SourcePage,
        p.Section,
        p.Description,
        p.IsActive,
        p.PolicyDocument?.Entity ?? "",
        p.CreatedAt,
        p.UpdatedAt
    );

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..maxLength] + "...";
}
