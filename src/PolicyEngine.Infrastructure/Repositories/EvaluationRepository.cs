using Microsoft.EntityFrameworkCore;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;
using PolicyEngine.Infrastructure.Data;

namespace PolicyEngine.Infrastructure.Repositories;

public class EvaluationRepository : IEvaluationRepository
{
    private readonly AppDbContext _db;

    public EvaluationRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<EvaluationResult>> GetAllAsync(int page = 1, int pageSize = 20, CancellationToken ct = default)
    {
        return await _db.EvaluationResults
            .Include(e => e.Checks)
            .Include(e => e.PolicyDocument)
            .OrderByDescending(e => e.EvaluatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
    }

    public async Task<int> GetCountAsync(CancellationToken ct = default)
    {
        return await _db.EvaluationResults.CountAsync(ct);
    }

    public async Task<EvaluationResult?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db.EvaluationResults
            .Include(e => e.Checks)
            .Include(e => e.PolicyDocument)
            .FirstOrDefaultAsync(e => e.Id == id, ct);
    }

    public async Task<EvaluationResult> AddAsync(EvaluationResult result, CancellationToken ct = default)
    {
        _db.EvaluationResults.Add(result);
        await _db.SaveChangesAsync(ct);
        return result;
    }

    public async Task SaveChangesAsync(CancellationToken ct = default)
    {
        await _db.SaveChangesAsync(ct);
    }
}
