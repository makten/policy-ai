using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PolicyEngine.Infrastructure.Data;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<AdminController> _logger;

    public AdminController(AppDbContext db, ILogger<AdminController> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Reset the entire application to an empty state.
    /// Deletes ALL data: evaluations, policies, policy versions, policy documents.
    /// This action is irreversible.
    /// </summary>
    [HttpPost("reset")]
    public async Task<ActionResult<ResetResultDto>> Reset(
        [FromBody] ResetRequest? request,
        CancellationToken ct)
    {
        // Require explicit confirmation
        if (request?.Confirm != true)
            return BadRequest(new { message = "You must set 'confirm: true' to reset the application." });

        _logger.LogWarning("APPLICATION RESET requested — deleting ALL data");

        // Count before deletion for the response
        var policyCount = await _db.Policies.CountAsync(ct);
        var documentCount = await _db.PolicyDocuments.CountAsync(ct);
        var evaluationCount = await _db.EvaluationResults.CountAsync(ct);
        var versionCount = await _db.PolicyVersions.CountAsync(ct);
        var checkCount = await _db.EvaluationChecks.CountAsync(ct);

        // Truncate all tables via raw SQL (cascades are defined, but TRUNCATE CASCADE is fastest)
        await _db.Database.ExecuteSqlRawAsync(
            """
            TRUNCATE TABLE
                "EvaluationChecks",
                "EvaluationResults",
                "PolicyVersions",
                "Policies",
                "PolicyDocuments"
            CASCADE
            """, ct);

        _logger.LogWarning(
            "APPLICATION RESET complete — deleted {Policies} policies, {Documents} documents, {Evaluations} evaluations",
            policyCount, documentCount, evaluationCount);

        return Ok(new ResetResultDto(
            policyCount,
            documentCount,
            evaluationCount,
            versionCount,
            checkCount));
    }

    public record ResetRequest
    {
        public bool Confirm { get; init; }
    }

    public record ResetResultDto(
        int PoliciesDeleted,
        int DocumentsDeleted,
        int EvaluationsDeleted,
        int VersionsDeleted,
        int ChecksDeleted);
}
