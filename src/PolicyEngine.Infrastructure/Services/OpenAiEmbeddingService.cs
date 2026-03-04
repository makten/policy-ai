using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Pgvector;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;

namespace PolicyEngine.Infrastructure.Services;

/// <summary>
/// Embedding service that uses OpenAI's text-embedding-3-small model to generate
/// dense vector representations for RAG-based semantic search.
/// Cost: ~$0.02/1M tokens — effectively free for policy embedding workloads.
/// </summary>
public class OpenAiEmbeddingService : IEmbeddingService
{
    private readonly IConfiguration _config;
    private readonly ILogger<OpenAiEmbeddingService> _logger;
    private readonly HttpClient _httpClient;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public OpenAiEmbeddingService(
        IConfiguration config,
        ILogger<OpenAiEmbeddingService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("OpenAI");
    }

    public async Task<EmbeddingResultDto> GetEmbeddingAsync(string text, CancellationToken ct = default)
    {
        var (vectors, usage) = await GetEmbeddingsRawAsync(new List<string> { text }, ct);
        return new EmbeddingResultDto(vectors[0], usage);
    }

    public async Task<EmbeddingBatchResultDto> GetEmbeddingsBatchAsync(List<string> texts, CancellationToken ct = default)
    {
        if (texts.Count == 0) return new EmbeddingBatchResultDto(new List<Vector>(), new TokenUsageDto("Embedding", "", 0, 0, 0));

        // OpenAI supports batching up to 2048 inputs per request
        const int batchSize = 100;
        var allVectors = new List<Vector>();
        int totalPrompt = 0, totalCompletion = 0, totalTokens = 0;
        string model = "";

        for (int i = 0; i < texts.Count; i += batchSize)
        {
            var batch = texts.Skip(i).Take(batchSize).ToList();
            var (vectors, usage) = await GetEmbeddingsRawAsync(batch, ct);
            allVectors.AddRange(vectors);
            totalPrompt += usage.PromptTokens;
            totalCompletion += usage.CompletionTokens;
            totalTokens += usage.TotalTokens;
            model = usage.Model;
        }

        return new EmbeddingBatchResultDto(allVectors, new TokenUsageDto("Embedding", model, totalPrompt, totalCompletion, totalTokens));
    }

    private async Task<(List<Vector> Vectors, TokenUsageDto Usage)> GetEmbeddingsRawAsync(List<string> texts, CancellationToken ct)
    {
        var apiKey = _config["OpenAI:ApiKey"]
            ?? throw new InvalidOperationException("OpenAI API key not configured");

        var model = _config["RAG:EmbeddingModel"] ?? "text-embedding-3-small";
        var dimensions = int.Parse(_config["RAG:EmbeddingDimensions"] ?? "1536");

        // Use the OpenAI embeddings endpoint (not chat completions)
        var baseEndpoint = _config["OpenAI:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";
        var embeddingEndpoint = baseEndpoint.Replace("/chat/completions", "/embeddings");

        var requestBody = new
        {
            model,
            input = texts,
            dimensions,
            encoding_format = "float"
        };

        var jsonContent = JsonSerializer.Serialize(requestBody, JsonOpts);
        var request = new HttpRequestMessage(HttpMethod.Post, embeddingEndpoint);
        request.Headers.Add("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json");

        _logger.LogInformation("Requesting embeddings for {Count} text(s) using model {Model}",
            texts.Count, model);

        var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(responseJson);

        var dataArray = doc.RootElement.GetProperty("data");
        var vectors = new List<Vector>();

        foreach (var item in dataArray.EnumerateArray())
        {
            var embeddingArray = item.GetProperty("embedding");
            var floats = new float[dimensions];
            int idx = 0;
            foreach (var val in embeddingArray.EnumerateArray())
            {
                floats[idx++] = val.GetSingle();
            }
            vectors.Add(new Vector(floats));
        }

        _logger.LogInformation("Generated {Count} embeddings ({Dimensions}d)", vectors.Count, dimensions);

        // Extract token usage
        int promptTokens = 0, completionTokens = 0, totalTokensCount = 0;
        if (doc.RootElement.TryGetProperty("usage", out var usage))
        {
            promptTokens = usage.GetProperty("prompt_tokens").GetInt32();
            totalTokensCount = usage.GetProperty("total_tokens").GetInt32();
            // Embedding API doesn't have completion_tokens, but handle gracefully
            if (usage.TryGetProperty("completion_tokens", out var comp))
                completionTokens = comp.GetInt32();
            _logger.LogInformation("Embedding token usage: {Tokens} tokens", totalTokensCount);
        }

        var tokenUsage = new TokenUsageDto("Embedding", model, promptTokens, completionTokens, totalTokensCount);
        return (vectors, tokenUsage);
    }
}
