using Microsoft.AspNetCore.Mvc;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BusinessRulesController : ControllerBase
{
    private readonly IBusinessRuleParser _businessRuleParser;
    private readonly IPolicyRepository _repo;
    private readonly ILogger<BusinessRulesController> _logger;

    public BusinessRulesController(
        IBusinessRuleParser businessRuleParser,
        IPolicyRepository repo,
        ILogger<BusinessRulesController> logger)
    {
        _businessRuleParser = businessRuleParser;
        _repo = repo;
        _logger = logger;
    }

    /// <summary>
    /// Generate business rules from a policy document or raw text.
    /// </summary>
    [HttpPost("generate")]
    public async Task<ActionResult<GenerateBusinessRulesResponse>> Generate(
        [FromBody] GenerateBusinessRulesRequest request,
        CancellationToken ct)
    {
        // Option 1: Generate from an existing policy document
        if (request.PolicyDocumentId.HasValue)
        {
            var docId = request.PolicyDocumentId.Value;
            _logger.LogInformation("Generating business rules for policy document {DocumentId}", docId);

            var document = await _repo.GetDocumentByIdAsync(docId, ct);
            if (document == null)
                return NotFound($"Policy document {docId} not found.");

            // Fetch all active policies for this document
            var allPolicies = await _repo.GetAllPoliciesAsync(entity: document.Entity, ct: ct);
            var docPolicies = allPolicies
                .Where(p => p.PolicyDocumentId == docId)
                .ToList();

            if (docPolicies.Count == 0)
                return BadRequest("No active policies found for this document.");

            var dtos = docPolicies.Select(MapToDto).ToList();
            var result = await _businessRuleParser.GenerateBusinessRulesAsync(dtos, ct);
            return Ok(result);
        }

        // Option 2: Generate from raw policy text
        if (!string.IsNullOrWhiteSpace(request.PolicyText))
        {
            _logger.LogInformation("Generating business rules from {Chars} chars of raw text", request.PolicyText.Length);
            var result = await _businessRuleParser.GenerateBusinessRulesFromTextAsync(request.PolicyText, ct);
            return Ok(result);
        }

        return BadRequest("Provide either a policyDocumentId or policyText.");
    }

    private static PolicyDto MapToDto(Policy p) => new(
        p.Id,
        p.PolicyDocumentId,
        p.Code,
        p.Title,
        p.Category,
        p.SourcePage,
        p.Section,
        p.Description,
        p.IsActive,
        p.PolicyDocument?.Entity ?? "",
        p.CreatedAt,
        p.UpdatedAt
    );
}
