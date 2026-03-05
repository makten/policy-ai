using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DecisionController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DecisionController> _logger;

    public DecisionController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<DecisionController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    [HttpGet("get-decision")]
    public async Task<IActionResult> GetDecision([FromQuery] string assessmentCorrelationReference, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(assessmentCorrelationReference))
            return BadRequest(new { error = "assessmentCorrelationReference is required." });

        var path = _configuration["DecisionApi:Path"]
            ?? "/api/v4/decision/get-decision";

        var query = $"{path}?assessmentCorrelationReference={Uri.EscapeDataString(assessmentCorrelationReference)}";

        var client = _httpClientFactory.CreateClient("DecisionAPI");

        _logger.LogInformation("Forwarding get-decision request for assessmentCorrelationReference={AssessmentCorrelationReference}", assessmentCorrelationReference);

        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(query, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reach Decision API");
            return StatusCode(502, new { error = "Decision API unreachable", detail = ex.Message });
        }

        var responseBody = await response.Content.ReadAsStringAsync(ct);

        _logger.LogInformation("Decision API responded {StatusCode}", (int)response.StatusCode);

        if (string.IsNullOrWhiteSpace(responseBody))
        {
            return Ok(new
            {
                pending = true,
                message = "Decision not available yet.",
                assessmentCorrelationReference,
                upstreamStatus = (int)response.StatusCode
            });
        }

        if (responseBody.Trim().Equals("null", StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new
            {
                pending = true,
                message = "Decision not available yet.",
                assessmentCorrelationReference,
                upstreamStatus = (int)response.StatusCode
            });
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<object>(responseBody);
            return parsed is null
                ? Ok(new
                {
                    pending = true,
                    message = "Decision not available yet.",
                    assessmentCorrelationReference,
                    upstreamStatus = (int)response.StatusCode
                })
                : StatusCode((int)response.StatusCode, parsed);
        }
        catch (JsonException)
        {
            return StatusCode((int)response.StatusCode, new { raw = responseBody });
        }
    }

    [HttpGet("get-decision-rule-details")]
    public async Task<IActionResult> GetDecisionRuleDetails(
        [FromQuery] string assessmentCorrelationReference,
        [FromQuery] string ruleReference,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(assessmentCorrelationReference))
            return BadRequest(new { error = "assessmentCorrelationReference is required." });
        if (string.IsNullOrWhiteSpace(ruleReference))
            return BadRequest(new { error = "ruleReference is required." });

        var basePath = _configuration["DecisionApi:RuleDetailsPath"]
            ?? "/api/v4/decision/get-decision-rule-details";

        var query = $"{basePath}?assessmentCorrelationReference={Uri.EscapeDataString(assessmentCorrelationReference)}&ruleReference={Uri.EscapeDataString(ruleReference)}";

        var client = _httpClientFactory.CreateClient("DecisionAPI");

        _logger.LogInformation(
            "Forwarding get-decision-rule-details for ref={Ref} rule={Rule}",
            assessmentCorrelationReference, ruleReference);

        HttpResponseMessage response;
        try
        {
            response = await client.GetAsync(query, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reach Decision API (rule details)");
            return StatusCode(502, new { error = "Decision API unreachable", detail = ex.Message });
        }

        var responseBody = await response.Content.ReadAsStringAsync(ct);

        if (string.IsNullOrWhiteSpace(responseBody) ||
            responseBody.Trim().Equals("null", StringComparison.OrdinalIgnoreCase))
        {
            return NotFound(new { error = "Rule details not found." });
        }

        try
        {
            var parsed = JsonSerializer.Deserialize<object>(responseBody);
            return parsed is null
                ? NotFound(new { error = "Rule details not found." })
                : StatusCode((int)response.StatusCode, parsed);
        }
        catch (JsonException)
        {
            return StatusCode((int)response.StatusCode, new { raw = responseBody });
        }
    }
}
