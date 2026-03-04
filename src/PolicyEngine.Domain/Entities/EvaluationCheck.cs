using PolicyEngine.Domain.Enums;

namespace PolicyEngine.Domain.Entities;

/// <summary>
/// A single pass/fail/warning check within an evaluation result.
/// </summary>
public class EvaluationCheck
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EvaluationResultId { get; set; }

    public string PolicyCode { get; set; } = string.Empty;      // e.g., "ASN-POL-001"
    public string PolicyTitle { get; set; } = string.Empty;
    public CheckStatus Status { get; set; }
    public string Reason { get; set; } = string.Empty;          // Human-readable explanation
    public string? SubmittedValue { get; set; }                  // What the application declared
    public string? RequiredValue { get; set; }                   // What the policy requires

    // Navigation
    public EvaluationResult EvaluationResult { get; set; } = null!;
}
