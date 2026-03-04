namespace PolicyEngine.Domain.Entities;

/// <summary>
/// Represents a source document (e.g., "asn_hypotheek_acceptatiebeleid_januari_2024.pdf")
/// that contains multiple business policies.
/// </summary>
public class PolicyDocument : BaseEntity
{
    public string FileName { get; set; } = string.Empty;
    public string Entity { get; set; } = string.Empty;      // e.g., "ASN Bank", "MUNT Hypotheken"
    public string Version { get; set; } = string.Empty;      // e.g., "1 januari 2024"
    public bool IsActive { get; set; } = true;

    // Navigation
    public ICollection<Policy> Policies { get; set; } = new List<Policy>();
    public ICollection<EvaluationResult> EvaluationResults { get; set; } = new List<EvaluationResult>();
}
