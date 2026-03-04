using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConfigurationController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<ConfigurationController> _logger;

    public ConfigurationController(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<ConfigurationController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Import a single business rule to the Configuration API.
    /// Proxies POST /api/v1/configuration/add-business-rule.
    /// </summary>
    [HttpPost("import-business-rule")]
    public async Task<IActionResult> ImportBusinessRule(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync(ct);

        var path = _configuration["ConfigApi:Path"]
            ?? "/api/v1/configuration/add-business-rule";

        var client = _httpClientFactory.CreateClient("ConfigAPI");

        using var content = new StringContent(body, Encoding.UTF8, "application/json");

        _logger.LogInformation("Forwarding business rule import to {Path}", path);

        HttpResponseMessage response;
        try
        {
            response = await client.PostAsync(path, content, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to reach Configuration API");
            return StatusCode(502, new { error = "Configuration API unreachable", detail = ex.Message });
        }

        var responseBody = await response.Content.ReadAsStringAsync(ct);

        _logger.LogInformation("Configuration API responded {Status}", (int)response.StatusCode);

        return StatusCode((int)response.StatusCode, responseBody.Length > 0
            ? JsonSerializer.Deserialize<object>(responseBody)
            : null);
    }
}
