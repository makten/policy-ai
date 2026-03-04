namespace PolicyEngine.Domain.Entities;

/// <summary>
/// Audit trail for policy changes — maintains full version history.
/// </summary>
public class PolicyVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PolicyId { get; set; }

    public int VersionNumber { get; set; }
    public string Description { get; set; } = string.Empty;    // Snapshot of the policy description at this version
    public string ChangedBy { get; set; } = string.Empty;      // Username or "System"
    public string ChangeReason { get; set; } = string.Empty;   // e.g., "Initial import", "Manual edit", "AI merge"
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Policy Policy { get; set; } = null!;
}
