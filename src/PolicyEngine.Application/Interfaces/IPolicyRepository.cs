using Pgvector;
using PolicyEngine.Domain.Entities;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Repository abstraction for Policy and PolicyDocument operations.
/// </summary>
public interface IPolicyRepository
{
    // PolicyDocument
    Task<List<PolicyDocument>> GetAllDocumentsAsync(CancellationToken ct = default);
    Task<PolicyDocument?> GetDocumentByIdAsync(Guid id, CancellationToken ct = default);
    Task<PolicyDocument?> GetDocumentByHashAsync(string contentHash, CancellationToken ct = default);
    Task<PolicyDocument> AddDocumentAsync(PolicyDocument document, CancellationToken ct = default);

    // Policy
    Task<List<Policy>> GetAllPoliciesAsync(string? category = null, string? entity = null, string? search = null, CancellationToken ct = default);
    Task<Policy?> GetPolicyByIdAsync(Guid id, CancellationToken ct = default);
    Task<Policy?> GetPolicyByCodeAsync(string code, CancellationToken ct = default);
    Task<List<Policy>> SearchPoliciesByTitleOrDescriptionAsync(string searchText, CancellationToken ct = default);
    Task<Policy> AddPolicyAsync(Policy policy, CancellationToken ct = default);
    Task<Policy> UpdatePolicyAsync(Policy policy, CancellationToken ct = default);
    Task SoftDeletePolicyAsync(Guid id, CancellationToken ct = default);

    // Vector Embeddings (RAG)
    Task UpdatePolicyEmbeddingAsync(Guid policyId, Vector embedding, CancellationToken ct = default);
    Task<List<Policy>> GetPoliciesWithoutEmbeddingAsync(CancellationToken ct = default);
    Task<List<Policy>> FindSimilarPoliciesAsync(Vector queryEmbedding, int topK, string? entity = null, CancellationToken ct = default);
    Task<int> GetActivePolicyCountAsync(string? entity = null, CancellationToken ct = default);

    // Code numbering
    /// <summary>
    /// Returns the highest numeric suffix among active policies whose Code starts with the given prefix.
    /// For example, if prefix is "MUNT" and the database contains MUNT-001, MUNT-042, returns 42.
    /// Returns 0 when no matching policies exist.
    /// </summary>
    Task<int> GetMaxPolicyCodeNumberAsync(string prefix, CancellationToken ct = default);

    // PolicyVersion
    Task<PolicyVersion> AddPolicyVersionAsync(PolicyVersion version, CancellationToken ct = default);

    Task SaveChangesAsync(CancellationToken ct = default);
}
