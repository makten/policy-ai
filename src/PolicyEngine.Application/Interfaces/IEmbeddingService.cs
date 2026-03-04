using Pgvector;
using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Abstraction over an embedding provider that converts text into dense vector representations.
/// Used for RAG-based semantic search over policies.
/// </summary>
public interface IEmbeddingService
{
    /// <summary>
    /// Generate a vector embedding for the given text using the configured embedding model.
    /// Returns the embedding and token usage metadata.
    /// </summary>
    /// <param name="text">The text to embed (e.g., policy description, application summary).</param>
    /// <param name="ct">Cancellation token.</param>
    /// <returns>An EmbeddingResultDto containing the Vector and token usage.</returns>
    Task<EmbeddingResultDto> GetEmbeddingAsync(string text, CancellationToken ct = default);

    /// <summary>
    /// Generate embeddings for multiple texts in a single batch call.
    /// More efficient than calling GetEmbeddingAsync in a loop.
    /// Returns aggregated token usage across all batches.
    /// </summary>
    Task<EmbeddingBatchResultDto> GetEmbeddingsBatchAsync(List<string> texts, CancellationToken ct = default);
}
