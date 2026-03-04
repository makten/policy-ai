using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Translates policy documents (parsed by PdfPolicyParser) into structured
/// business rules compatible with the Assessment Configuration API.
/// </summary>
public interface IBusinessRuleParser
{
    /// <summary>
    /// Generate business rules from a collection of policies belonging to a policy document.
    /// </summary>
    Task<GenerateBusinessRulesResponse> GenerateBusinessRulesAsync(
        List<PolicyDto> policies,
        CancellationToken ct = default);

    /// <summary>
    /// Generate business rules from raw policy text (e.g. pasted text).
    /// </summary>
    Task<GenerateBusinessRulesResponse> GenerateBusinessRulesFromTextAsync(
        string policyText,
        CancellationToken ct = default);
}
