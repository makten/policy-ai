using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public partial class AssessmentController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AssessmentController> _logger;
    private readonly string _assessPath;

    public AssessmentController(
        IHttpClientFactory httpClientFactory,
        ILogger<AssessmentController> logger,
        IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _assessPath = configuration["AssessApi:Path"]
            ?? "/api/v3/assess/assess-mortgage-application";
    }

    /// <summary>
    /// Proxy: forwards the assessment request to the external Assess API and returns the response.
    /// </summary>
    [HttpPost("execute")]
    public async Task<IActionResult> Execute(CancellationToken ct)
    {
        // Read the raw request body so we can forward it as-is
        string requestBody;
        using (var reader = new StreamReader(Request.Body, Encoding.UTF8))
        {
            requestBody = await reader.ReadToEndAsync(ct);
        }

        if (string.IsNullOrWhiteSpace(requestBody))
            return BadRequest(new { error = "Request body is empty." });

        // Replace every {{$guid}} placeholder with a fresh unique GUID
        requestBody = GuidPlaceholderRegex().Replace(requestBody, _ => Guid.NewGuid().ToString());

        // Validate that it is parseable JSON before forwarding
        try
        {
            JsonDocument.Parse(requestBody);
        }
        catch (JsonException ex)
        {
            return BadRequest(new { error = $"Invalid JSON: {ex.Message}" });
        }

        _logger.LogInformation("Forwarding assessment request to Assess API ({Path})", _assessPath);

        var client = _httpClientFactory.CreateClient("AssessAPI");

        using var content = new StringContent(requestBody, Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(_assessPath, content, ct);
        }
        catch (TaskCanceledException ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogError(ex, "Assess API call timed out");
            return StatusCode(504, new { error = "Assessment API timed out." });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Assess API request failed");
            return StatusCode(502, new { error = $"Assessment API unreachable: {ex.Message}" });
        }

        var responseBody = await response.Content.ReadAsStringAsync(ct);

        _logger.LogInformation(
            "Assess API responded with {StatusCode} ({Length} bytes)",
            (int)response.StatusCode,
            responseBody.Length);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Assess API returned error {StatusCode}: {Body}",
                (int)response.StatusCode, responseBody);

            return StatusCode((int)response.StatusCode,
                string.IsNullOrWhiteSpace(responseBody)
                    ? (object)new { error = response.ReasonPhrase }
                    : JsonDocument.Parse(responseBody).RootElement);
        }

        // Return the assess API response JSON directly
        return Content(responseBody, "application/json");
    }

    // Matches {{$guid}}, {$guid}, $guid (all common REST-client placeholder variants)
    [GeneratedRegex(@"\{\{?\$guid\}?\}", RegexOptions.IgnoreCase)]
    private static partial Regex GuidPlaceholderRegex();
}
