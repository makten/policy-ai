using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// RAG policy retriever — uses vector embeddings to find the most relevant policies
/// for a given mortgage application, reducing token consumption in LLM evaluations.
/// </summary>
public interface IPolicyRetriever
{
    /// <summary>
    /// Retrieve the most relevant policies for the given mortgage application JSON.
    /// Uses semantic similarity via pgvector + mandatory category inclusion.
    /// </summary>
    /// <param name="applicationJson">The raw mortgage application JSON.</param>
    /// <param name="entity">Optional entity filter (e.g., "MUNT Hypotheken").</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>A subset of relevant policies (typically 10–20 instead of all 44+).</returns>
    Task<PolicyRetrievalResult> RetrieveRelevantPoliciesAsync(
        string applicationJson,
        string? entity = null,
        CancellationToken ct = default);
}

/// <summary>
/// Result of RAG policy retrieval, containing the selected policies and metadata.
/// </summary>
public record PolicyRetrievalResult(
    List<PolicyDto> Policies,
    int RetrievedCount,
    int TotalActiveCount,
    bool UsedRag,  // false if RAG was disabled or fell back to full set
    TokenUsageDto? EmbeddingTokenUsage = null  // token usage from embedding call (null if no RAG)
);
