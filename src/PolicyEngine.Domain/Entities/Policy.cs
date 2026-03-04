using Pgvector;

namespace PolicyEngine.Domain.Entities;

/// <summary>
/// A single business policy rule (e.g., "ASN-POL-001 — Binding met Nederland").
/// </summary>
public class Policy : BaseEntity
{
    public Guid PolicyDocumentId { get; set; }

    public string Code { get; set; } = string.Empty;           // e.g., "ASN-POL-001"
    public string Title { get; set; } = string.Empty;          // e.g., "Binding met Nederland"
    public string Category { get; set; } = string.Empty;       // e.g., "Eligibility", "Risk", "Income"
    public int SourcePage { get; set; }
    public string Section { get; set; } = string.Empty;        // e.g., "2.1"
    public string Description { get; set; } = string.Empty;    // Full policy text
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Vector embedding (1536 dimensions) for RAG semantic search.
    /// Generated from Title + Category + Section + Description via text-embedding-3-small.
    /// </summary>
    public Vector? Embedding { get; set; }

    // Navigation
    public PolicyDocument PolicyDocument { get; set; } = null!;
    public ICollection<PolicyVersion> Versions { get; set; } = new List<PolicyVersion>();
}
