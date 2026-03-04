using PolicyEngine.Domain.Entities;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Repository abstraction for EvaluationResult operations.
/// </summary>
public interface IEvaluationRepository
{
    Task<List<EvaluationResult>> GetAllAsync(int page = 1, int pageSize = 20, CancellationToken ct = default);
    Task<int> GetCountAsync(CancellationToken ct = default);
    Task<EvaluationResult?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<EvaluationResult> AddAsync(EvaluationResult result, CancellationToken ct = default);
    Task SaveChangesAsync(CancellationToken ct = default);
}
