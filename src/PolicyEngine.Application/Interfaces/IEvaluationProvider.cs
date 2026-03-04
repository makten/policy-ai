using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Abstraction over the AI evaluation provider (OpenAI, Anthropic, etc.).
/// </summary>
public interface IEvaluationProvider
{
    /// <summary>
    /// Sends the application data and policies to the LLM and returns a structured evaluation
    /// along with token usage metadata.
    /// </summary>
    Task<AiProviderResult> EvaluateAsync(
        string applicationJson,
        List<PolicyDto> policies,
        CancellationToken cancellationToken = default);
}
