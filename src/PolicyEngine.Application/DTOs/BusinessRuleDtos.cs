using System.Text.Json.Serialization;

namespace PolicyEngine.Application.DTOs;

// ──── Business Rule DTOs ────

/// <summary>
/// Represents a generated business rule matching the Assessment Configuration API schema.
/// </summary>
public record GeneratedBusinessRuleDto
{
    public int Code { get; init; }
    public string Description { get; init; } = string.Empty;
    public string StartDate { get; init; } = string.Empty;
    public string? EndDate { get; init; }
    public string NhgApplicableType { get; init; } = "Both";
    public string CategoryType { get; init; } = string.Empty;
    public string RejectionType { get; init; } = "O";
    public string EmployeeExplanation { get; init; } = string.Empty;
    public string? CustomerExplanation { get; init; }
    public object? JsonExpression { get; init; }
    public List<string> ArrangementTypes { get; init; } = new();
    public List<string> DecisionGroups { get; init; } = new();
    public List<string> ProductLines { get; init; } = new();
    public string DatePolicyType { get; init; } = "ApplicationStartDate";
}

/// <summary>
/// Request to generate business rules from a policy document.
/// </summary>
public record GenerateBusinessRulesRequest
{
    public Guid? PolicyDocumentId { get; init; }
    public string? PolicyText { get; init; }
    /// <summary>How many policies to process in this batch (default 3).</summary>
    public int BatchSize { get; init; } = 3;
    /// <summary>How many policies to skip (for pagination over the document).</summary>
    public int Skip { get; init; } = 0;
}

/// <summary>
/// Response containing the generated business rules.
/// </summary>
public record GenerateBusinessRulesResponse
{
    public List<GeneratedBusinessRuleDto> BusinessRules { get; init; } = new();
    public int TotalGenerated { get; init; }
    /// <summary>Total number of policies available in the document (0 when using raw text).</summary>
    public int TotalPolicies { get; init; }
    /// <summary>True when there are more policies beyond this batch.</summary>
    public bool HasMore { get; init; }
    public TokenUsageDto? TokenUsage { get; init; }
    public List<string> Warnings { get; init; } = new();
}
