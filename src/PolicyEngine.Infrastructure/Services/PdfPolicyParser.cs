using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using UglyToad.PdfPig;

namespace PolicyEngine.Infrastructure.Services;

/// <summary>
/// Extracts text from PDF documents using PdfPig and parses it into structured
/// policy data using OpenAI GPT-4o via a chunked, page-range approach.
///
/// Strategy:
///  1. Extract text from every page with PdfPig (optionally limited by maxPages).
///  2. Send a lightweight "metadata" call to identify the entity name and version.
///  3. Split the page text into overlapping chunks (configurable via appsettings).
///  4. For each chunk, ask GPT-4o to extract every distinct policy rule.
///  5. Save each chunk result to a JSON file immediately (crash recovery).
///  6. On resume, load previously saved chunk results and skip those chunks.
///  7. Merge all chunk results, de-duplicate, and return.
/// </summary>
public class PdfPolicyParser : IPolicyFileParser
{
    private readonly IConfiguration _config;
    private readonly ILogger<PdfPolicyParser> _logger;
    private readonly HttpClient _httpClient;

    // Configurable via appsettings PdfExtraction section
    private int PagesPerChunk => _config.GetValue("PdfExtraction:PagesPerChunk", 8);
    private int OverlapPages  => _config.GetValue("PdfExtraction:OverlapPages", 2);
    private string OutputDir  => _config["PdfExtraction:OutputDir"] ?? "pdf-output";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly JsonSerializerOptions PrettyJsonOpts = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public PdfPolicyParser(
        IConfiguration config,
        ILogger<PdfPolicyParser> logger,
        IHttpClientFactory httpClientFactory)
    {
        _config = config;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient("OpenAI");
    }

    // ─── Public entry point ──────────────────────────────────────────────

    public Task<PolicyImportFile> ParsePdfAsync(
        Stream pdfStream, string fileName, int? maxPages = null, CancellationToken ct = default)
        => ParsePdfAsync(pdfStream, fileName, maxPages, progress: null!, ct);

    public async Task<PolicyImportFile> ParsePdfAsync(
        Stream pdfStream, string fileName, int? maxPages,
        IProgress<PdfExtractionProgressEvent> progress, CancellationToken ct = default)
    {
        _logger.LogInformation("Extracting text from PDF: {FileName}", fileName);
        var pages = ExtractPagesFromPdf(pdfStream);

        if (pages.Count == 0)
            throw new InvalidOperationException("Could not extract text from the PDF. The file may be image-based or empty.");

        // Apply maxPages limit for demo / quick-run scenarios
        if (maxPages is > 0 && pages.Count > maxPages.Value)
        {
            _logger.LogInformation("Limiting extraction to {MaxPages} of {TotalPages} pages", maxPages.Value, pages.Count);
            pages = pages.Take(maxPages.Value).ToList();
        }

        var totalChars = pages.Sum(p => p.Text.Length);
        _logger.LogInformation("Processing {PageCount} pages, {TotalChars} characters from PDF", pages.Count, totalChars);

        // Prepare output directory for incremental saves
        var sessionDir = PrepareSessionDirectory(fileName);

        // Step 1 — Identify the entity / version with a small metadata call
        var meta = await ExtractMetadataAsync(pages, fileName, ct);
        SaveSessionInfo(sessionDir, fileName, pages.Count, meta);

        // Step 2 — Split pages into overlapping chunks and extract policies from each
        var pagesPerChunk = PagesPerChunk;
        var overlapPages = OverlapPages;
        var chunks = BuildChunks(pages, pagesPerChunk, overlapPages);
        _logger.LogInformation("Processing PDF in {ChunkCount} chunk(s) of {PagesPerChunk} pages each", chunks.Count, pagesPerChunk);

        // Report: extraction started
        progress?.Report(new PdfExtractionProgressEvent
        {
            Type = "started",
            TotalPages = pages.Count,
            TotalChunks = chunks.Count,
            Message = $"PDF has {pages.Count} pages, will process in {chunks.Count} chunk(s)"
        });

        // Report: metadata identified
        progress?.Report(new PdfExtractionProgressEvent
        {
            Type = "metadata",
            Entity = meta.Entity,
            Version = meta.Version,
            TotalPages = pages.Count,
            TotalChunks = chunks.Count,
            Message = $"Identified entity: {meta.Entity}, version: {meta.Version}"
        });

        var allPolicies = new List<PolicyImportItem>();
        int chunkIndex = 0;

        foreach (var chunk in chunks)
        {
            chunkIndex++;

            // Resume support: check for existing chunk result
            var existingPolicies = LoadChunkResult(sessionDir, chunkIndex);
            if (existingPolicies != null)
            {
                _logger.LogInformation(
                    "Chunk {Index}/{Total} (pages {Start}–{End}) already saved ({Count} policies) — skipping",
                    chunkIndex, chunks.Count, chunk.StartPage, chunk.EndPage, existingPolicies.Count);
                allPolicies.AddRange(existingPolicies);

                progress?.Report(new PdfExtractionProgressEvent
                {
                    Type = "chunk_skipped",
                    ChunkIndex = chunkIndex,
                    TotalChunks = chunks.Count,
                    StartPage = chunk.StartPage,
                    EndPage = chunk.EndPage,
                    PoliciesInChunk = existingPolicies.Count,
                    TotalPoliciesExtracted = allPolicies.Count,
                    TotalPages = pages.Count,
                    Message = $"Chunk {chunkIndex}/{chunks.Count} loaded from cache ({existingPolicies.Count} policies)"
                });
                continue;
            }

            _logger.LogInformation("Processing chunk {Index}/{Total} (pages {Start}–{End})",
                chunkIndex, chunks.Count, chunk.StartPage, chunk.EndPage);

            progress?.Report(new PdfExtractionProgressEvent
            {
                Type = "chunk_start",
                ChunkIndex = chunkIndex,
                TotalChunks = chunks.Count,
                StartPage = chunk.StartPage,
                EndPage = chunk.EndPage,
                TotalPoliciesExtracted = allPolicies.Count,
                TotalPages = pages.Count,
                Message = $"Processing chunk {chunkIndex}/{chunks.Count} (pages {chunk.StartPage}–{chunk.EndPage})..."
            });

            var chunkPolicies = await ExtractPoliciesFromChunkAsync(chunk, meta, ct);

            // Save immediately so progress is not lost if the next chunk fails
            SaveChunkResult(sessionDir, chunkIndex, chunk, chunkPolicies);

            allPolicies.AddRange(chunkPolicies);

            progress?.Report(new PdfExtractionProgressEvent
            {
                Type = "chunk_complete",
                ChunkIndex = chunkIndex,
                TotalChunks = chunks.Count,
                StartPage = chunk.StartPage,
                EndPage = chunk.EndPage,
                PoliciesInChunk = chunkPolicies.Count,
                TotalPoliciesExtracted = allPolicies.Count,
                TotalPages = pages.Count,
                Message = $"Chunk {chunkIndex}/{chunks.Count} done — {chunkPolicies.Count} policies extracted"
            });
        }

        // Step 3 — De-duplicate (overlapping pages may produce the same section twice)
        var deduplicated = DeduplicatePolicies(allPolicies);
        _logger.LogInformation("Extracted {Raw} policies, {Dedup} after de-duplication", allPolicies.Count, deduplicated.Count);

        progress?.Report(new PdfExtractionProgressEvent
        {
            Type = "deduplication",
            TotalChunks = chunks.Count,
            TotalPoliciesExtracted = deduplicated.Count,
            TotalPages = pages.Count,
            Message = $"De-duplication: {allPolicies.Count} → {deduplicated.Count} policies"
        });

        // Step 4 — Assign sequential codes
        var prefix = BuildCodePrefix(meta.Entity);
        for (int i = 0; i < deduplicated.Count; i++)
        {
            deduplicated[i] = deduplicated[i] with { Code = $"{prefix}-POL-{i + 1:D3}" };
        }

        var result = new PolicyImportFile
        {
            Documents = new List<PolicyImportDocument>
            {
                new()
                {
                    Meta = new PolicyImportMeta
                    {
                        FileName = fileName,
                        Entity = meta.Entity,
                        Version = meta.Version
                    },
                    Policies = deduplicated
                }
            }
        };

        // Save the final combined result
        SaveCombinedResult(sessionDir, result);

        progress?.Report(new PdfExtractionProgressEvent
        {
            Type = "complete",
            TotalChunks = chunks.Count,
            TotalPoliciesExtracted = deduplicated.Count,
            TotalPages = pages.Count,
            Entity = meta.Entity,
            Version = meta.Version,
            Message = $"Extraction complete — {deduplicated.Count} policies from {pages.Count} pages"
        });

        return result;
    }

    // ─── PDF text extraction ─────────────────────────────────────────────

    private record PageText(int PageNumber, string Text);

    private static List<PageText> ExtractPagesFromPdf(Stream pdfStream)
    {
        var pages = new List<PageText>();
        using var document = PdfDocument.Open(pdfStream);

        for (int i = 1; i <= document.NumberOfPages; i++)
        {
            var page = document.GetPage(i);
            var text = page.Text;
            if (!string.IsNullOrWhiteSpace(text))
                pages.Add(new PageText(i, text));
        }

        return pages;
    }

    // ─── Chunking ────────────────────────────────────────────────────────

    private record PageChunk(int StartPage, int EndPage, string Text);

    private static List<PageChunk> BuildChunks(List<PageText> pages, int pagesPerChunk, int overlapPages)
    {
        var chunks = new List<PageChunk>();
        int i = 0;

        while (i < pages.Count)
        {
            int end = Math.Min(i + pagesPerChunk, pages.Count);
            var sb = new StringBuilder();

            for (int j = i; j < end; j++)
            {
                sb.AppendLine($"--- Page {pages[j].PageNumber} ---");
                sb.AppendLine(pages[j].Text);
                sb.AppendLine();
            }

            chunks.Add(new PageChunk(pages[i].PageNumber, pages[end - 1].PageNumber, sb.ToString()));

            // Advance with overlap so a section split across a page boundary is captured by both chunks
            i += pagesPerChunk - overlapPages;
        }

        return chunks;
    }

    // ─── Session / chunk persistence ─────────────────────────────────────

    private string PrepareSessionDirectory(string fileName)
    {
        var sanitized = SanitizeFileName(fileName);
        var dir = Path.Combine(OutputDir, sanitized);
        Directory.CreateDirectory(dir);
        return dir;
    }

    private void SaveSessionInfo(string sessionDir, string fileName, int pageCount, DocumentMeta meta)
    {
        var info = new
        {
            fileName,
            startedAt = DateTime.UtcNow.ToString("o"),
            totalPages = pageCount,
            pagesPerChunk = PagesPerChunk,
            overlapPages = OverlapPages,
            entity = meta.Entity,
            version = meta.Version
        };
        var path = Path.Combine(sessionDir, "session.json");
        File.WriteAllText(path, JsonSerializer.Serialize(info, PrettyJsonOpts));
        _logger.LogInformation("Session info saved to {Path}", path);
    }

    private void SaveChunkResult(string sessionDir, int chunkIndex, PageChunk chunk, List<PolicyImportItem> policies)
    {
        var data = new
        {
            chunkIndex,
            startPage = chunk.StartPage,
            endPage = chunk.EndPage,
            extractedAt = DateTime.UtcNow.ToString("o"),
            policyCount = policies.Count,
            policies
        };
        var path = Path.Combine(sessionDir, $"chunk_{chunkIndex:D3}_pages_{chunk.StartPage}-{chunk.EndPage}.json");
        File.WriteAllText(path, JsonSerializer.Serialize(data, PrettyJsonOpts));
        _logger.LogInformation("Chunk {Index} saved to {Path} ({Count} policies)", chunkIndex, path, policies.Count);
    }

    private List<PolicyImportItem>? LoadChunkResult(string sessionDir, int chunkIndex)
    {
        var pattern = $"chunk_{chunkIndex:D3}_*.json";
        var files = Directory.GetFiles(sessionDir, pattern);
        if (files.Length == 0) return null;

        try
        {
            var json = File.ReadAllText(files[0]);
            var doc = JsonDocument.Parse(json);
            var policiesElement = doc.RootElement.GetProperty("policies");
            return JsonSerializer.Deserialize<List<PolicyImportItem>>(policiesElement.GetRawText(), JsonOpts);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not load existing chunk {Index} result — will re-process", chunkIndex);
            return null;
        }
    }

    private void SaveCombinedResult(string sessionDir, PolicyImportFile result)
    {
        var path = Path.Combine(sessionDir, "combined_result.json");
        File.WriteAllText(path, JsonSerializer.Serialize(result, PrettyJsonOpts));
        _logger.LogInformation("Combined result saved to {Path}", path);
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName);
        foreach (var c in Path.GetInvalidFileNameChars())
            name = name.Replace(c, '_');
        return name.ToLowerInvariant();
    }

    // ─── Metadata extraction (lightweight call) ──────────────────────────

    private record DocumentMeta(string Entity, string Version);

    private async Task<DocumentMeta> ExtractMetadataAsync(List<PageText> pages, string fileName, CancellationToken ct)
    {
        // Send only the first ~3 pages for metadata detection
        var sb = new StringBuilder();
        foreach (var p in pages.Take(3))
        {
            sb.AppendLine($"--- Page {p.PageNumber} ---");
            sb.AppendLine(p.Text);
        }

        var systemPrompt =
            """
            You are a document metadata extractor. Given the first pages of a Dutch mortgage policy document,
            identify the entity name (financial institution) and the document version / date.
            Return ONLY a JSON object: { "entity": "...", "version": "..." }
            """;

        var userPrompt = $"File name: {fileName}\n\n{sb}";

        var response = await CallOpenAiAsync(systemPrompt, userPrompt, maxTokens: 200, ct: ct);
        try
        {
            var doc = JsonDocument.Parse(response);
            var entity = doc.RootElement.GetProperty("entity").GetString() ?? "";
            var version = doc.RootElement.GetProperty("version").GetString() ?? "1.0";
            return new DocumentMeta(entity, version);
        }
        catch
        {
            _logger.LogWarning("Could not parse metadata response, using defaults");
            return new DocumentMeta("", "1.0");
        }
    }

    // ─── Per-chunk policy extraction ─────────────────────────────────────

    private async Task<List<PolicyImportItem>> ExtractPoliciesFromChunkAsync(
        PageChunk chunk, DocumentMeta meta, CancellationToken ct)
    {
        var systemPrompt = BuildExtractionSystemPrompt(meta.Entity);
        var userPrompt = BuildExtractionUserPrompt(chunk);

        // Use structured output format
        var policies = await CallOpenAiStructuredAsync(systemPrompt, userPrompt, ct);
        return policies;
    }

    private static string BuildExtractionSystemPrompt(string entity) =>
        $$"""
        You are a meticulous Dutch mortgage policy document analyser working for {{entity}}.

        ## Your task
        Extract **every distinct policy rule, requirement, condition, or guideline** from the
        provided document pages. The document is structured with numbered sections (e.g. 1, 1.1,
        1.1.1, 2.3, 2.3.4, etc.). **Every section, sub-section, and sub-sub-section that states
        a rule, requirement, condition, constraint, percentage, amount, or operational procedure
        MUST become its own policy item.**

        ## Extraction rules
        1. **Granularity**: If a section contains multiple distinct rules (e.g. bullet points with
           different conditions), create a SEPARATE policy for each distinct rule.
        2. **Completeness**: Do NOT summarize or paraphrase. The `description` field must contain
           the EXACT content of that section/rule as it appears in the source text (in Dutch).
        3. **Title**: Write a concise Dutch title (max 120 chars) that captures the essence of the rule.
        4. **Section reference**: Use the exact section number from the document (e.g. "2.3.1").
           If there is no visible number, create a logical reference from context (e.g. "3 - bullet 2").
        5. **Source page**: Use the page number shown in the "--- Page N ---" markers.
        6. **Category**: Assign exactly one of these categories:
           Eligibility, Lending Limits, Product, Finance, Income, Risk, Collateral, Compliance, Operations.
        7. **Code**: Leave the `code` field as an empty string — codes will be assigned later.
        8. **Language**: Keep all text in the original language (Dutch).

        ## What to extract
        - Eligibility criteria for applicants
        - Income requirements and calculations
        - Maximum loan-to-value (LTV) and loan-to-income (LTI) ratios
        - Interest rate conditions
        - Collateral / property requirements
        - Repayment method rules
        - Special conditions (NHG, construction depots, second homes, etc.)
        - Operational procedures (documentation, deadlines, exceptions)
        - Any numeric threshold, percentage, or financial limit mentioned as a rule

        ## What NOT to extract
        - Table of contents entries
        - Page headers/footers
        - General introductory prose that does not state a rule

        Return ONLY the JSON array of policy objects.
        """;

    private static string BuildExtractionUserPrompt(PageChunk chunk) =>
        $"""
        ## Document pages {chunk.StartPage}–{chunk.EndPage}

        {chunk.Text}

        ## Instructions
        Extract every policy rule from these pages. Remember: one policy per distinct rule,
        with the EXACT original text as the description. Do not skip sub-sections.
        """;

    // ─── De-duplication ──────────────────────────────────────────────────

    private static List<PolicyImportItem> DeduplicatePolicies(List<PolicyImportItem> items)
    {
        // Group by (section + first 100 chars of description) to catch overlapping-chunk duplicates
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<PolicyImportItem>();

        foreach (var item in items)
        {
            var key = $"{item.Section}|{Truncate(item.Description, 100)}";
            if (seen.Add(key))
                result.Add(item);
        }

        // Sort by source page, then section for a natural reading order
        result.Sort((a, b) =>
        {
            int cmp = a.SourcePage.CompareTo(b.SourcePage);
            return cmp != 0 ? cmp : string.Compare(a.Section, b.Section, StringComparison.OrdinalIgnoreCase);
        });

        return result;
    }

    // ─── Code prefix helper ──────────────────────────────────────────────

    private static string BuildCodePrefix(string entity)
    {
        if (string.IsNullOrWhiteSpace(entity)) return "POL";

        // Take the first recognizable word and upper-case it (e.g. "MUNT Hypotheken" → "MUNT")
        var word = entity.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "POL";
        return word.ToUpperInvariant();
    }

    // ─── OpenAI helpers ──────────────────────────────────────────────────

    private async Task<string> CallOpenAiAsync(string systemPrompt, string userPrompt,
        int maxTokens = 4096, CancellationToken ct = default)
    {
        var apiKey = _config["OpenAI:ApiKey"] ?? throw new InvalidOperationException("OpenAI API key not configured");
        var model = _config["OpenAI:Model"] ?? "gpt-4o";
        var endpoint = _config["OpenAI:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";

        var requestBody = new
        {
            model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            temperature = 0.05,
            max_tokens = maxTokens
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOpts);
        var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
        request.Headers.Add("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(json, Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(responseJson);

        return doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "";
    }

    private async Task<List<PolicyImportItem>> CallOpenAiStructuredAsync(
        string systemPrompt, string userPrompt, CancellationToken ct)
    {
        var apiKey = _config["OpenAI:ApiKey"] ?? throw new InvalidOperationException("OpenAI API key not configured");
        var model = _config["OpenAI:Model"] ?? "gpt-4o";
        var endpoint = _config["OpenAI:Endpoint"] ?? "https://api.openai.com/v1/chat/completions";

        var requestBody = new
        {
            model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            response_format = new
            {
                type = "json_schema",
                json_schema = new
                {
                    name = "policy_extraction",
                    strict = true,
                    schema = GetChunkSchema()
                }
            },
            temperature = 0.05,
            max_tokens = 16000
        };

        var json = JsonSerializer.Serialize(requestBody, JsonOpts);

        // Retry up to 3 times with exponential back-off
        for (int attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var request = new HttpRequestMessage(HttpMethod.Post, endpoint);
                request.Headers.Add("Authorization", $"Bearer {apiKey}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                _logger.LogInformation("Chunk extraction AI attempt {Attempt} using {Model}", attempt, model);

                var response = await _httpClient.SendAsync(request, ct);
                response.EnsureSuccessStatusCode();

                var responseJson = await response.Content.ReadAsStringAsync(ct);
                var doc = JsonDocument.Parse(responseJson);

                var content = doc.RootElement
                    .GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString();

                if (string.IsNullOrEmpty(content))
                    throw new InvalidOperationException("Empty response from AI");

                var wrapper = JsonSerializer.Deserialize<PoliciesWrapper>(content, JsonOpts);
                var policies = wrapper?.Policies ?? new List<PolicyImportItem>();

                _logger.LogInformation("Chunk yielded {Count} policies", policies.Count);
                return policies;
            }
            catch (Exception ex) when (attempt < 3)
            {
                _logger.LogWarning(ex, "Chunk extraction attempt {Attempt} failed, retrying in {Delay}s...", attempt, attempt * 3);
                await Task.Delay(TimeSpan.FromSeconds(attempt * 3), ct);
            }
        }

        _logger.LogError("Failed to extract policies from chunk after 3 attempts");
        return new List<PolicyImportItem>();
    }

    // ─── JSON schema for structured output ───────────────────────────────

    /// <summary>Wrapper used to deserialize the structured AI response.</summary>
    private record PoliciesWrapper
    {
        public List<PolicyImportItem> Policies { get; init; } = new();
    }

    private static object GetChunkSchema() => new
    {
        type = "object",
        properties = new
        {
            policies = new
            {
                type = "array",
                items = new
                {
                    type = "object",
                    properties = new
                    {
                        code = new { type = "string" },
                        title = new { type = "string" },
                        category = new { type = "string" },
                        sourcePage = new { type = "integer" },
                        section = new { type = "string" },
                        description = new { type = "string" }
                    },
                    required = new[] { "code", "title", "category", "sourcePage", "section", "description" },
                    additionalProperties = false
                }
            }
        },
        required = new[] { "policies" },
        additionalProperties = false
    };

    private static string Truncate(string? text, int maxLength) =>
        string.IsNullOrEmpty(text)
            ? ""
            : text.Length <= maxLength
                ? text
                : text[..maxLength];
}
