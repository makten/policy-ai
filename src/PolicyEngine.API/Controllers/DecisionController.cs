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
}
