using PolicyEngine.Domain.Enums;

namespace PolicyEngine.Domain.Entities;

/// <summary>
/// Stores the outcome of evaluating a mortgage application against a policy set.
/// </summary>
public class EvaluationResult : BaseEntity
{
    public Guid? PolicyDocumentId { get; set; }

    public Verdict Verdict { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string ApplicationDataJson { get; set; } = string.Empty;  // JSONB — raw uploaded payload
    public string RawAiResponseJson { get; set; } = string.Empty;    // JSONB — full LLM response
    public string Summary { get; set; } = string.Empty;              // Human-readable summary
    public DateTime EvaluatedAt { get; set; } = DateTime.UtcNow;
    public int DurationMs { get; set; }
    public string ModelUsed { get; set; } = string.Empty;            // e.g., "gpt-4o", "claude-3.5-sonnet"
    public int? RetrievedPolicyCount { get; set; }                     // RAG: how many policies were retrieved
    public int? TotalPolicyCount { get; set; }                         // RAG: total active policies available

    // Navigation
    public PolicyDocument? PolicyDocument { get; set; }
    public ICollection<EvaluationCheck> Checks { get; set; } = new List<EvaluationCheck>();
}
