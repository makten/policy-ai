using Microsoft.EntityFrameworkCore;
using Pgvector;
using Pgvector.EntityFrameworkCore;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;
using PolicyEngine.Infrastructure.Data;

namespace PolicyEngine.Infrastructure.Repositories;

public class PolicyRepository : IPolicyRepository
{
    private readonly AppDbContext _db;

    public PolicyRepository(AppDbContext db)
    {
        _db = db;
    }

    // ── PolicyDocument ──

    public async Task<List<PolicyDocument>> GetAllDocumentsAsync(CancellationToken ct = default)
    {
        return await _db.PolicyDocuments
            .Include(d => d.Policies)
            .OrderBy(d => d.Entity)
            .ToListAsync(ct);
    }

    public async Task<PolicyDocument?> GetDocumentByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db.PolicyDocuments
            .Include(d => d.Policies)
            .FirstOrDefaultAsync(d => d.Id == id, ct);
    }

    public async Task<PolicyDocument> AddDocumentAsync(PolicyDocument document, CancellationToken ct = default)
    {
        _db.PolicyDocuments.Add(document);
        await _db.SaveChangesAsync(ct);
        return document;
    }

    // ── Policy ──

    public async Task<List<Policy>> GetAllPoliciesAsync(
        string? category = null,
        string? entity = null,
        string? search = null,
        CancellationToken ct = default)
    {
        var query = _db.Policies
            .Include(p => p.PolicyDocument)
            .Where(p => p.IsActive);

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(p => p.Category == category);

        if (!string.IsNullOrWhiteSpace(entity))
            query = query.Where(p => p.PolicyDocument.Entity == entity);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(p =>
                p.Title.Contains(search) ||
                p.Code.Contains(search) ||
                p.Description.Contains(search));

        return await query
            .OrderBy(p => p.Code)
            .ToListAsync(ct);
    }

    public async Task<Policy?> GetPolicyByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db.Policies
            .Include(p => p.PolicyDocument)
            .Include(p => p.Versions.OrderByDescending(v => v.VersionNumber))
            .FirstOrDefaultAsync(p => p.Id == id, ct);
    }

    public async Task<Policy?> GetPolicyByCodeAsync(string code, CancellationToken ct = default)
    {
        return await _db.Policies
            .Include(p => p.PolicyDocument)
            .FirstOrDefaultAsync(p => p.Code == code, ct);
    }

    public async Task<List<Policy>> SearchPoliciesByTitleOrDescriptionAsync(string searchText, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(searchText) || searchText.Length < 10)
            return new List<Policy>();

        // Normalize: take first 80 chars of the search text for matching
        var normalizedSearch = searchText.Length > 80 ? searchText[..80] : searchText;

        return await _db.Policies
            .Include(p => p.PolicyDocument)
            .Where(p => p.IsActive &&
                (p.Title.ToLower().Contains(normalizedSearch.ToLower()) ||
                 p.Description.ToLower().Contains(normalizedSearch.ToLower())))
            .Take(5)
            .ToListAsync(ct);
    }

    public async Task<Policy> AddPolicyAsync(Policy policy, CancellationToken ct = default)
    {
        _db.Policies.Add(policy);
        await _db.SaveChangesAsync(ct);
        return policy;
    }

    public async Task<Policy> UpdatePolicyAsync(Policy policy, CancellationToken ct = default)
    {
        _db.Policies.Update(policy);
        await _db.SaveChangesAsync(ct);
        return policy;
    }

    public async Task SoftDeletePolicyAsync(Guid id, CancellationToken ct = default)
    {
        var policy = await _db.Policies.FindAsync(new object[] { id }, ct);
        if (policy != null)
        {
            policy.IsActive = false;
            await _db.SaveChangesAsync(ct);
        }
    }

    // ── Code numbering ──

    public async Task<int> GetMaxPolicyCodeNumberAsync(string prefix, CancellationToken ct = default)
    {
        // Find all active policies whose code starts with the prefix followed by a dash
        var pattern = $"{prefix}-";
        var codes = await _db.Policies
            .Where(p => p.IsActive && p.Code.StartsWith(pattern))
            .Select(p => p.Code)
            .ToListAsync(ct);

        if (codes.Count == 0) return 0;

        // Extract the numeric suffix after the last dash
        int max = 0;
        foreach (var code in codes)
        {
            var lastDash = code.LastIndexOf('-');
            if (lastDash >= 0 && int.TryParse(code[(lastDash + 1)..], out var num) && num > max)
                max = num;
        }
        return max;
    }

    // ── PolicyVersion ──

    public async Task<PolicyVersion> AddPolicyVersionAsync(PolicyVersion version, CancellationToken ct = default)
    {
        _db.PolicyVersions.Add(version);
        await _db.SaveChangesAsync(ct);
        return version;
    }

    // ── Vector Embeddings (RAG) ──

    public async Task UpdatePolicyEmbeddingAsync(Guid policyId, Vector embedding, CancellationToken ct = default)
    {
        var policy = await _db.Policies.FindAsync(new object[] { policyId }, ct);
        if (policy != null)
        {
            policy.Embedding = embedding;
            await _db.SaveChangesAsync(ct);
        }
    }

    public async Task<List<Policy>> GetPoliciesWithoutEmbeddingAsync(CancellationToken ct = default)
    {
        return await _db.Policies
            .Include(p => p.PolicyDocument)
            .Where(p => p.IsActive && p.Embedding == null)
            .OrderBy(p => p.Code)
            .ToListAsync(ct);
    }

    public async Task<List<Policy>> FindSimilarPoliciesAsync(
        Vector queryEmbedding, int topK, string? entity = null, CancellationToken ct = default)
    {
        var query = _db.Policies
            .Include(p => p.PolicyDocument)
            .Where(p => p.IsActive && p.Embedding != null);

        if (!string.IsNullOrWhiteSpace(entity))
            query = query.Where(p => p.PolicyDocument.Entity == entity);

        return await query
            .OrderBy(p => p.Embedding!.CosineDistance(queryEmbedding))
            .Take(topK)
            .ToListAsync(ct);
    }

    public async Task<int> GetActivePolicyCountAsync(string? entity = null, CancellationToken ct = default)
    {
        var query = _db.Policies.Where(p => p.IsActive);

        if (!string.IsNullOrWhiteSpace(entity))
            query = query.Where(p => p.PolicyDocument.Entity == entity);

        return await query.CountAsync(ct);
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
