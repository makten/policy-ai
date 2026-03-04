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
}

/// <summary>
/// Response containing the generated business rules.
/// </summary>
public record GenerateBusinessRulesResponse
{
    public List<GeneratedBusinessRuleDto> BusinessRules { get; init; } = new();
    public int TotalGenerated { get; init; }
    public TokenUsageDto? TokenUsage { get; init; }
    public List<string> Warnings { get; init; } = new();
}
