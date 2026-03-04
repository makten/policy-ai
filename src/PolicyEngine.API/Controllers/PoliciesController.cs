using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Channels;
using Microsoft.AspNetCore.Mvc;
using PolicyEngine.API.Services;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;
using PolicyEngine.Infrastructure.Services;

namespace PolicyEngine.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PoliciesController : ControllerBase
{
    private readonly IPolicyRepository _repo;
    private readonly IPolicyFileParser _pdfParser;
    private readonly IEmbeddingService _embeddingService;
    private readonly UploadJobService _jobService;
    private readonly ILogger<PoliciesController> _logger;

    public PoliciesController(
        IPolicyRepository repo,
        IPolicyFileParser pdfParser,
        IEmbeddingService embeddingService,
        UploadJobService jobService,
        ILogger<PoliciesController> logger)
    {
        _repo = repo;
        _pdfParser = pdfParser;
        _embeddingService = embeddingService;
        _jobService = jobService;
        _logger = logger;
    }

    /// <summary>
    /// Get all policies with optional filtering by category, entity, or search term.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<PolicyDto>>> GetAll(
        [FromQuery] string? category,
        [FromQuery] string? entity,
        [FromQuery] string? search,
        CancellationToken ct)
    {
        var policies = await _repo.GetAllPoliciesAsync(category, entity, search, ct);
        var dtos = policies.Select(MapToDto).ToList();
        return Ok(dtos);
    }

    /// <summary>
    /// Get a single policy with its version history.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<PolicyDetailDto>> GetById(Guid id, CancellationToken ct)
    {
        var policy = await _repo.GetPolicyByIdAsync(id, ct);
        if (policy == null) return NotFound();
        return Ok(MapToDetailDto(policy));
    }

    /// <summary>
    /// Create a new policy.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PolicyDto>> Create([FromBody] CreatePolicyRequest request, CancellationToken ct)
    {
        // Check for duplicate code
        var existing = await _repo.GetPolicyByCodeAsync(request.Code, ct);
        if (existing != null)
            return Conflict(new { message = $"Policy with code '{request.Code}' already exists." });

        var policy = new Policy
        {
            PolicyDocumentId = request.PolicyDocumentId,
            Code = request.Code,
            Title = request.Title,
            Category = request.Category,
            SourcePage = request.SourcePage,
            Section = request.Section,
            Description = request.Description,
            IsActive = true
        };

        await _repo.AddPolicyAsync(policy, ct);

        // Create initial version
        await _repo.AddPolicyVersionAsync(new PolicyVersion
        {
            PolicyId = policy.Id,
            VersionNumber = 1,
            Description = policy.Description,
            ChangedBy = "System",
            ChangeReason = "Initial creation"
        }, ct);

        // Generate embedding for RAG
        await EmbedPolicyAsync(policy, ct);

        // Reload with navigation properties
        var reloaded = await _repo.GetPolicyByIdAsync(policy.Id, ct);
        return CreatedAtAction(nameof(GetById), new { id = policy.Id }, MapToDto(reloaded!));
    }

    /// <summary>
    /// Update an existing policy.
    /// </summary>
    [HttpPut("{id:guid}")]
    public async Task<ActionResult<PolicyDto>> Update(Guid id, [FromBody] UpdatePolicyRequest request, CancellationToken ct)
    {
        var policy = await _repo.GetPolicyByIdAsync(id, ct);
        if (policy == null) return NotFound();

        // Determine next version number
        var nextVersion = (policy.Versions?.Count ?? 0) + 1;

        // Create version snapshot before updating
        await _repo.AddPolicyVersionAsync(new PolicyVersion
        {
            PolicyId = policy.Id,
            VersionNumber = nextVersion,
            Description = request.Description,
            ChangedBy = "User", // TODO: Replace with actual user from auth
            ChangeReason = request.ChangeReason ?? "Manual update"
        }, ct);

        policy.Title = request.Title;
        policy.Category = request.Category;
        policy.Section = request.Section;
        policy.Description = request.Description;

        await _repo.UpdatePolicyAsync(policy, ct);

        var reloaded = await _repo.GetPolicyByIdAsync(policy.Id, ct);
        return Ok(MapToDto(reloaded!));
    }

    /// <summary>
    /// Soft-delete a policy.
    /// </summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var policy = await _repo.GetPolicyByIdAsync(id, ct);
        if (policy == null) return NotFound();

        await _repo.SoftDeletePolicyAsync(id, ct);
        return NoContent();
    }

    /// <summary>
    /// Bulk import policies from a structured JSON file (matching GoodPolicy.json format).
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<ImportResultDto>> Import(IFormFile file, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest("No file uploaded.");

        PolicyImportFile importFile;
        try
        {
            using var stream = file.OpenReadStream();
            importFile = await DeserializePolicyJsonAsync(stream, ct);
        }
        catch (JsonException ex)
        {
            return BadRequest($"Invalid JSON: {ex.Message}");
        }

        var result = await ImportPoliciesFromModel(importFile, ct);
        return Ok(result);
    }

    /// <summary>
    /// Upload policies from a JSON or PDF file with rich conflict detection.
    /// Returns per-policy status: CREATED, DUPLICATE (same code), CONFLICT (same code but different content).
    /// Also detects policies with similar descriptions to existing ones.
    /// </summary>
    [HttpPost("upload")]
    public async Task<ActionResult<PolicyUploadResultDto>> Upload(IFormFile file, [FromQuery] int? maxPages, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        PolicyImportFile importFile;
        string sourceType;

        // Read file bytes for content hash computation
        byte[] fileBytes;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms, ct);
            fileBytes = ms.ToArray();
        }

        // Check for duplicate document by content hash
        var contentHash = ComputeContentHash(fileBytes);
        var existingDoc = await _repo.GetDocumentByHashAsync(contentHash, ct);
        if (existingDoc != null)
            return Conflict(new { message = $"A document with identical content already exists: '{existingDoc.FileName}' (uploaded previously)." });

        switch (ext)
        {
            case ".json":
                sourceType = "JSON";
                try
                {
                    using var jsonStream = new MemoryStream(fileBytes);
                    importFile = await DeserializePolicyJsonAsync(jsonStream, ct);
                }
                catch (JsonException ex)
                {
                    return BadRequest(new { message = $"Invalid JSON format: {ex.Message}" });
                }
                break;

            case ".pdf":
                sourceType = "PDF";
                try
                {
                    using var pdfStream = new MemoryStream(fileBytes);
                    importFile = await _pdfParser.ParsePdfAsync(pdfStream, file.FileName, maxPages, startCodeNumber: 0, ct);
                }
                catch (Exception ex)
                {
                    return BadRequest(new { message = $"Failed to parse PDF: {ex.Message}" });
                }
                break;

            default:
                return BadRequest(new { message = $"Unsupported file type '{ext}'. Only .json and .pdf are supported." });
        }

        if (importFile.Documents == null || importFile.Documents.Count == 0)
            return BadRequest(new { message = "No policy documents found in the uploaded file." });

        var result = await ImportWithConflictDetection(importFile, sourceType, contentHash, ct);
        return Ok(result);
    }

    /// <summary>
    /// Preview what would happen if a file were imported — returns conflict analysis without persisting.
    /// </summary>
    [HttpPost("upload/preview")]
    public async Task<ActionResult<PolicyUploadResultDto>> UploadPreview(IFormFile file, [FromQuery] int? maxPages, CancellationToken ct)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        PolicyImportFile importFile;
        string sourceType;

        switch (ext)
        {
            case ".json":
                sourceType = "JSON";
                try
                {
                    using var jsonStream = file.OpenReadStream();
                    importFile = await DeserializePolicyJsonAsync(jsonStream, ct);
                }
                catch (JsonException ex)
                {
                    return BadRequest(new { message = $"Invalid JSON format: {ex.Message}" });
                }
                break;

            case ".pdf":
                sourceType = "PDF";
                try
                {
                    using var pdfStream = file.OpenReadStream();
                    importFile = await _pdfParser.ParsePdfAsync(pdfStream, file.FileName, maxPages, startCodeNumber: 0, ct);
                }
                catch (Exception ex)
                {
                    return BadRequest(new { message = $"Failed to parse PDF: {ex.Message}" });
                }
                break;

            default:
                return BadRequest(new { message = $"Unsupported file type '{ext}'. Only .json and .pdf are supported." });
        }

        if (importFile.Documents == null || importFile.Documents.Count == 0)
            return BadRequest(new { message = "No policy documents found in the uploaded file." });

        // Analyze without persisting
        var result = await AnalyzeConflicts(importFile, sourceType, ct);
        return Ok(result);
    }

    /// <summary>
    /// Stream PDF extraction progress as Server-Sent Events (SSE).
    /// Each chunk completion is pushed to the client in real-time.
    /// The final event (type "result") includes the full PolicyUploadResultDto.
    /// </summary>
    [HttpPost("upload/stream")]
    public async Task UploadStream(IFormFile file, [FromQuery] int? maxPages, [FromQuery] string mode = "preview", CancellationToken ct = default)
    {
        // Set SSE headers
        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no"; // nginx/reverse proxy

        var jsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        // Helper to write SSE event
        async Task WriteEvent(string eventType, object data)
        {
            var json = JsonSerializer.Serialize(data, jsonOpts);
            await Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n", ct);
            await Response.Body.FlushAsync(ct);
        }

        if (file == null || file.Length == 0)
        {
            await WriteEvent("error", new { message = "No file uploaded." });
            return;
        }

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".pdf")
        {
            await WriteEvent("error", new { message = "Streaming progress is only available for PDF uploads. Use the regular upload endpoint for JSON files." });
            return;
        }

        try
        {
            // Use a Channel so the parser (producer) and SSE writer (consumer) run concurrently
            var channel = Channel.CreateUnbounded<PdfExtractionProgressEvent>();
            var channelProgress = new ChannelProgress<PdfExtractionProgressEvent>(channel.Writer);

            // Hold the file bytes so the stream survives after the IFormFile scope
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var fileBytes = ms.ToArray();
            ms.Position = 0;
            var savedFileName = file.FileName;

            // Compute content hash for dedup
            var contentHash = ComputeContentHash(fileBytes);
            var existingDoc = await _repo.GetDocumentByHashAsync(contentHash, ct);
            if (existingDoc != null)
            {
                await WriteEvent("error", new { message = $"A document with identical content already exists: '{existingDoc.FileName}'." });
                return;
            }

            // Start the parser in the background — it writes progress events to the channel
            var parserTask = Task.Run(async () =>
            {
                try
                {
                    var result = await _pdfParser.ParsePdfAsync(ms, savedFileName, maxPages, startCodeNumber: 0, channelProgress, ct);
                    return result;
                }
                finally
                {
                    channel.Writer.Complete();
                }
            }, ct);

            // Read progress events from the channel and write SSE events
            await foreach (var evt in channel.Reader.ReadAllAsync(ct))
            {
                await WriteEvent("progress", evt);
            }

            // Parser is done — get the result
            var importFile = await parserTask;

            if (importFile.Documents == null || importFile.Documents.Count == 0)
            {
                await WriteEvent("error", new { message = "No policy documents found in the uploaded PDF." });
                return;
            }

            // Perform conflict detection or import based on mode
            PolicyUploadResultDto uploadResult;
            if (mode == "upload")
            {
                uploadResult = await ImportWithConflictDetection(importFile, "PDF", contentHash, ct);
            }
            else
            {
                uploadResult = await AnalyzeConflicts(importFile, "PDF", ct);
            }

            // Send the final result
            await WriteEvent("result", uploadResult);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("SSE stream cancelled by client");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during streamed PDF extraction");
            try
            {
                await WriteEvent("error", new { message = $"Extraction failed: {ex.Message}" });
            }
            catch { /* client may have disconnected */ }
        }
    }

    // ── Background Upload Jobs ─────────────────────────────────────

    /// <summary>
    /// Start a background upload job. The file is processed server-side even if the client disconnects.
    /// Returns the job ID immediately. Use the stream or status endpoints to monitor progress.
    /// </summary>
    [HttpPost("upload/start")]
    public async Task<ActionResult<UploadJobDto>> UploadStart(
        IFormFile file, [FromQuery] string mode = "upload", [FromQuery] int? maxPages = null, [FromQuery] string? entity = null)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { message = "No file uploaded." });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not ".json" and not ".pdf")
            return BadRequest(new { message = $"Unsupported file type '{ext}'. Only .json and .pdf are supported." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);
        var job = _jobService.StartJob(ms.ToArray(), file.FileName, mode, maxPages, entity?.Trim());
        return Ok(job.ToDto());
    }

    /// <summary>
    /// Get the current status and all progress events for a specific upload job.
    /// </summary>
    [HttpGet("upload/jobs/{jobId}")]
    public ActionResult<UploadJobDto> GetJobStatus(string jobId)
    {
        var job = _jobService.GetJob(jobId);
        if (job == null) return NotFound(new { message = $"Job '{jobId}' not found." });
        return Ok(job.ToDto());
    }

    /// <summary>
    /// Get the most recent active (non-completed) upload job, if any.
    /// Returns 204 No Content if there are no active jobs.
    /// </summary>
    [HttpGet("upload/jobs/active")]
    public ActionResult<UploadJobDto> GetActiveJob()
    {
        var job = _jobService.GetActiveJob();
        if (job == null) return NoContent();
        return Ok(job.ToDto());
    }

    /// <summary>
    /// Cancel a running upload job.
    /// </summary>
    [HttpPost("upload/jobs/{jobId}/cancel")]
    public ActionResult CancelJob(string jobId)
    {
        var cancelled = _jobService.CancelJob(jobId);
        if (!cancelled)
            return NotFound(new { message = $"Job '{jobId}' not found or already completed." });
        return Ok(new { message = "Job cancelled." });
    }

    /// <summary>
    /// Stream progress events for a background upload job via SSE.
    /// On connect, all previously collected events are sent immediately, then live events follow.
    /// The stream ends when the job completes or fails.
    /// </summary>
    [HttpGet("upload/jobs/{jobId}/stream")]
    public async Task StreamJobProgress(string jobId, CancellationToken ct)
    {
        var job = _jobService.GetJob(jobId);
        if (job == null)
        {
            Response.StatusCode = 404;
            await Response.WriteAsJsonAsync(new { message = $"Job '{jobId}' not found." }, ct);
            return;
        }

        Response.ContentType = "text/event-stream";
        Response.Headers["Cache-Control"] = "no-cache";
        Response.Headers["Connection"] = "keep-alive";
        Response.Headers["X-Accel-Buffering"] = "no";

        var jsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        async Task WriteSSE(string eventType, object data)
        {
            var json = JsonSerializer.Serialize(data, jsonOpts);
            await Response.WriteAsync($"event: {eventType}\ndata: {json}\n\n", ct);
            await Response.Body.FlushAsync(ct);
        }

        try
        {
            // 1) Send current status snapshot
            await WriteSSE("status", new
            {
                jobId = job.JobId,
                fileName = job.FileName,
                sourceType = job.SourceType,
                mode = job.Mode,
                status = job.Status,
                createdAt = job.CreatedAt
            });

            // 2) Send all events collected so far (catch-up for reconnecting clients)
            var events = job.GetAllEvents();
            foreach (var evt in events)
                await WriteSSE("progress", evt);
            int sent = events.Count;

            // 3) Stream live events until job terminates
            while (!ct.IsCancellationRequested && !job.IsTerminal)
            {
                await Task.Delay(300, ct);
                var newEvents = job.GetEventsSince(sent);
                foreach (var evt in newEvents)
                {
                    await WriteSSE("progress", evt);
                    sent++;
                }
            }

            // 4) Send any events added between last check and terminal state
            var finalEvents = job.GetEventsSince(sent);
            foreach (var evt in finalEvents)
                await WriteSSE("progress", evt);

            // 5) Send final result or error or cancellation
            if (job.Status == "cancelled")
                await WriteSSE("cancelled", new { message = "Job was cancelled." });
            else if (job.Result != null)
                await WriteSSE("result", job.Result);
            if (job.Error != null)
                await WriteSSE("error", new { message = job.Error });
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Job {JobId} SSE stream disconnected by client", jobId);
        }
    }

    /// <summary>
    /// IProgress&lt;T&gt; implementation backed by a Channel writer for thread-safe async streaming.
    /// </summary>
    private sealed class ChannelProgress<T>(ChannelWriter<T> writer) : IProgress<T>
    {
        public void Report(T value) => writer.TryWrite(value);
    }

    private async Task<PolicyUploadResultDto> ImportWithConflictDetection(
        PolicyImportFile importFile, string sourceType, string? contentHash, CancellationToken ct)
    {
        var warnings = new List<string>();
        var results = new List<PolicyUploadItemResult>();
        int docsProcessed = 0, created = 0, skipped = 0, conflicts = 0;

        foreach (var doc in importFile.Documents)
        {
            // Assign incremental entity-based codes before importing
            var entity = doc.Meta.Entity ?? "";
            var prefix = PdfPolicyParser.BuildCodePrefix(entity);
            var maxExisting = await _repo.GetMaxPolicyCodeNumberAsync(prefix, ct);

            for (int i = 0; i < doc.Policies.Count; i++)
            {
                doc.Policies[i] = doc.Policies[i] with { Code = $"{prefix}-{maxExisting + i + 1:D3}" };
            }

            // Create document
            var policyDoc = new PolicyDocument
            {
                FileName = doc.Meta.FileName,
                Entity = doc.Meta.Entity,
                Version = doc.Meta.Version,
                ContentHash = contentHash,
                IsActive = true
            };
            await _repo.AddDocumentAsync(policyDoc, ct);
            docsProcessed++;

            foreach (var item in doc.Policies)
            {
                // Check 1: Exact code match
                var existingByCode = await _repo.GetPolicyByCodeAsync(item.Code, ct);
                if (existingByCode != null)
                {
                    // Determine if it's a true duplicate or a conflict (same code, different content)
                    var descriptionMatch = string.Equals(
                        existingByCode.Description?.Trim(),
                        item.Description?.Trim(),
                        StringComparison.OrdinalIgnoreCase);

                    if (descriptionMatch)
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "DUPLICATE",
                            $"Policy with code '{item.Code}' already exists with identical description.",
                            existingByCode.Id.ToString(),
                            existingByCode.Code,
                            existingByCode.Title));
                        skipped++;
                    }
                    else
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CONFLICT",
                            $"Policy code '{item.Code}' exists but with a DIFFERENT description. Existing: \"{Truncate(existingByCode.Description, 120)}\"",
                            existingByCode.Id.ToString(),
                            existingByCode.Code,
                            existingByCode.Title));
                        conflicts++;
                    }
                    continue;
                }

                // Check 2: Similar title match (detect potential duplicates with different codes)
                var similarByTitle = await _repo.SearchPoliciesByTitleOrDescriptionAsync(item.Title, ct);
                if (similarByTitle.Count > 0)
                {
                    var best = similarByTitle[0];
                    warnings.Add($"Policy '{item.Code}' has a similar title to existing policy '{best.Code}' (\"{Truncate(best.Title, 60)}\"). Created anyway.");
                }

                // No conflict — create the policy
                try
                {
                    var policy = new Policy
                    {
                        PolicyDocumentId = policyDoc.Id,
                        Code = item.Code, // Already assigned with entity-based incremental code
                        Title = item.Title ?? string.Empty,
                        Category = item.Category ?? string.Empty,
                        SourcePage = item.SourcePage,
                        Section = item.Section ?? string.Empty,
                        Description = item.Description ?? string.Empty,
                        IsActive = true
                    };
                    await _repo.AddPolicyAsync(policy, ct);

                    await _repo.AddPolicyVersionAsync(new PolicyVersion
                    {
                        PolicyId = policy.Id,
                        VersionNumber = 1,
                        Description = policy.Description,
                        ChangedBy = "System",
                        ChangeReason = $"Imported from {sourceType}"
                    }, ct);

                    // Generate RAG embedding (non-fatal if it fails)
                    await EmbedPolicyAsync(policy, ct);

                    results.Add(new PolicyUploadItemResult(
                        item.Code, item.Title, item.Category,
                        "CREATED", null, null, null, null));
                    created++;
                }
                catch (Exception ex)
                {
                    results.Add(new PolicyUploadItemResult(
                        item.Code, item.Title, item.Category,
                        "ERROR", ex.Message, null, null, null));
                    warnings.Add($"Error creating policy '{item.Code}': {ex.Message}");
                }
            }
        }

        return new PolicyUploadResultDto(docsProcessed, created, skipped, conflicts, sourceType, results, warnings);
    }

    private async Task<PolicyUploadResultDto> AnalyzeConflicts(
        PolicyImportFile importFile, string sourceType, CancellationToken ct)
    {
        var warnings = new List<string>();
        var results = new List<PolicyUploadItemResult>();
        int docsProcessed = 0, wouldCreate = 0, wouldSkip = 0, conflicts = 0;

        foreach (var doc in importFile.Documents)
        {
            // Pre-assign incremental entity-based codes for accurate analysis
            var entity = doc.Meta.Entity ?? "";
            var prefix = PdfPolicyParser.BuildCodePrefix(entity);
            var maxExisting = await _repo.GetMaxPolicyCodeNumberAsync(prefix, ct);

            for (int i = 0; i < doc.Policies.Count; i++)
            {
                doc.Policies[i] = doc.Policies[i] with { Code = $"{prefix}-{maxExisting + i + 1:D3}" };
            }

            docsProcessed++;

            foreach (var item in doc.Policies)
            {
                var existingByCode = await _repo.GetPolicyByCodeAsync(item.Code, ct);
                if (existingByCode != null)
                {
                    var descriptionMatch = string.Equals(
                        existingByCode.Description?.Trim(),
                        item.Description?.Trim(),
                        StringComparison.OrdinalIgnoreCase);

                    if (descriptionMatch)
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "DUPLICATE",
                            $"Policy with code '{item.Code}' already exists with identical description.",
                            existingByCode.Id.ToString(),
                            existingByCode.Code,
                            existingByCode.Title));
                        wouldSkip++;
                    }
                    else
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CONFLICT",
                            $"Policy code '{item.Code}' exists but with a DIFFERENT description. Existing: \"{Truncate(existingByCode.Description, 120)}\"",
                            existingByCode.Id.ToString(),
                            existingByCode.Code,
                            existingByCode.Title));
                        conflicts++;
                    }
                }
                else
                {
                    // Check similarity by title
                    var similarByTitle = await _repo.SearchPoliciesByTitleOrDescriptionAsync(item.Title, ct);
                    if (similarByTitle.Count > 0)
                    {
                        var best = similarByTitle[0];
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CREATED",
                            $"Note: similar to existing policy '{best.Code}' (\"{Truncate(best.Title, 60)}\").",
                            null, best.Code, best.Title));
                    }
                    else
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CREATED", null, null, null, null));
                    }
                    wouldCreate++;
                }
            }
        }

        return new PolicyUploadResultDto(docsProcessed, wouldCreate, wouldSkip, conflicts, sourceType, results, warnings);
    }

    private static string Truncate(string? text, int maxLength) =>
        string.IsNullOrEmpty(text)
            ? ""
            : text.Length <= maxLength
                ? text
                : text[..maxLength] + "…";

    private static string ComputeContentHash(byte[] data)
    {
        var hash = SHA256.HashData(data);
        return Convert.ToHexStringLower(hash);
    }

    /// <summary>
    /// Seed the database with policies from JSON files in a specified folder path.
    /// Reads all *.json files matching the GoodPolicy.json structure.
    /// </summary>
    [HttpPost("seed")]
    public async Task<ActionResult<ImportResultDto>> Seed([FromQuery] string? folderPath, CancellationToken ct)
    {
        var folder = folderPath ?? Path.Combine(Directory.GetCurrentDirectory(), "..", "..");
        if (!Directory.Exists(folder))
            return BadRequest($"Folder not found: {folder}");

        var jsonFiles = Directory.GetFiles(folder, "*.json")
            .Where(f => !f.Contains("appsettings", StringComparison.OrdinalIgnoreCase)
                     && !f.Contains("package", StringComparison.OrdinalIgnoreCase));

        int totalDocs = 0, totalPolicies = 0;
        var allWarnings = new List<string>();

        foreach (var filePath in jsonFiles)
        {
            try
            {
                var json = await System.IO.File.ReadAllTextAsync(filePath, ct);
                var normalized = NormalizePolicyJson(json);
                var importFile = JsonSerializer.Deserialize<PolicyImportFile>(normalized, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                    PropertyNameCaseInsensitive = true
                });
                if (importFile?.Documents == null || importFile.Documents.Count == 0)
                {
                    allWarnings.Add($"Skipped {Path.GetFileName(filePath)} — no documents array.");
                    continue;
                }
                var result = await ImportPoliciesFromModel(importFile, ct);
                totalDocs += result.DocumentsImported;
                totalPolicies += result.PoliciesImported;
                allWarnings.AddRange(result.Warnings);
            }
            catch (Exception ex)
            {
                allWarnings.Add($"Error in {Path.GetFileName(filePath)}: {ex.Message}");
            }
        }

        return Ok(new ImportResultDto(totalDocs, totalPolicies, allWarnings));
    }

    private async Task<ImportResultDto> ImportPoliciesFromModel(PolicyImportFile importFile, CancellationToken ct)
    {
        var warnings = new List<string>();
        int docsImported = 0, policiesImported = 0;

        foreach (var doc in importFile.Documents)
        {
            // Assign incremental entity-based codes
            var entity = doc.Meta.Entity ?? "";
            var prefix = PdfPolicyParser.BuildCodePrefix(entity);
            var maxExisting = await _repo.GetMaxPolicyCodeNumberAsync(prefix, ct);

            for (int i = 0; i < doc.Policies.Count; i++)
            {
                doc.Policies[i] = doc.Policies[i] with { Code = $"{prefix}-{maxExisting + i + 1:D3}" };
            }

            // Create or find PolicyDocument
            var policyDoc = new PolicyDocument
            {
                FileName = doc.Meta.FileName,
                Entity = doc.Meta.Entity,
                Version = doc.Meta.Version,
                IsActive = true
            };
            await _repo.AddDocumentAsync(policyDoc, ct);
            docsImported++;

            foreach (var item in doc.Policies)
            {
                var existing = await _repo.GetPolicyByCodeAsync(item.Code, ct);
                if (existing != null)
                {
                    warnings.Add($"Policy '{item.Code}' already exists — skipped.");
                    continue;
                }

                var policy = new Policy
                {
                    PolicyDocumentId = policyDoc.Id,
                    Code = item.Code,
                    Title = item.Title,
                    Category = item.Category,
                    SourcePage = item.SourcePage,
                    Section = item.Section,
                    Description = item.Description,
                    IsActive = true
                };
                await _repo.AddPolicyAsync(policy, ct);

                await _repo.AddPolicyVersionAsync(new PolicyVersion
                {
                    PolicyId = policy.Id,
                    VersionNumber = 1,
                    Description = policy.Description,
                    ChangedBy = "System",
                    ChangeReason = "Bulk import"
                }, ct);

                // Generate RAG embedding (non-fatal if it fails)
                await EmbedPolicyAsync(policy, ct);

                policiesImported++;
            }
        }

        return new ImportResultDto(docsImported, policiesImported, warnings);
    }

    /// <summary>
    /// Get all policy documents (entities/providers).
    /// </summary>
    [HttpGet("documents")]
    public async Task<ActionResult<List<PolicyDocumentDto>>> GetDocuments(CancellationToken ct)
    {
        var docs = await _repo.GetAllDocumentsAsync(ct);
        var dtos = docs.Select(d => new PolicyDocumentDto(
            d.Id, d.FileName, d.Entity, d.Version, d.IsActive, d.CreatedAt, d.Policies.Count
        )).ToList();
        return Ok(dtos);
    }

    /// <summary>
    /// Get distinct categories across all active policies.
    /// </summary>
    [HttpGet("categories")]
    public async Task<ActionResult<List<string>>> GetCategories(CancellationToken ct)
    {
        var policies = await _repo.GetAllPoliciesAsync(ct: ct);
        var categories = policies.Select(p => p.Category).Distinct().OrderBy(c => c).ToList();
        return Ok(categories);
    }

    /// <summary>
    /// Re-index all policy embeddings for RAG semantic search.
    /// Call this after changing the embedding model or to fix missing embeddings.
    /// </summary>
    [HttpPost("reindex-embeddings")]
    public async Task<ActionResult<object>> ReindexEmbeddings(
        [FromQuery] bool forceAll = false,
        CancellationToken ct = default)
    {
        List<Policy> policiesToEmbed;

        if (forceAll)
        {
            policiesToEmbed = await _repo.GetAllPoliciesAsync(ct: ct);
            _logger.LogInformation("Force re-indexing ALL {Count} active policies", policiesToEmbed.Count);
        }
        else
        {
            policiesToEmbed = await _repo.GetPoliciesWithoutEmbeddingAsync(ct);
            _logger.LogInformation("Indexing {Count} policies without embeddings", policiesToEmbed.Count);
        }

        if (policiesToEmbed.Count == 0)
            return Ok(new { message = "All policies already have embeddings.", indexed = 0 });

        // Batch embed for efficiency
        var texts = policiesToEmbed.Select(BuildEmbeddingText).ToList();

        try
        {
            var embeddingBatchResult = await _embeddingService.GetEmbeddingsBatchAsync(texts, ct);

            for (int i = 0; i < policiesToEmbed.Count; i++)
            {
                await _repo.UpdatePolicyEmbeddingAsync(policiesToEmbed[i].Id, embeddingBatchResult.Embeddings[i], ct);
            }

            _logger.LogInformation("Successfully embedded {Count} policies", policiesToEmbed.Count);

            return Ok(new
            {
                message = $"Successfully indexed {policiesToEmbed.Count} policies.",
                indexed = policiesToEmbed.Count,
                total = await _repo.GetActivePolicyCountAsync(ct: ct)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to generate embeddings");
            return StatusCode(502, new { message = $"Embedding generation failed: {ex.Message}" });
        }
    }

    // ── JSON Normalization ──

    /// <summary>
    /// Normalizes policy JSON to handle both snake_case and camelCase property names,
    /// as well as the flat { "policies": [...] } and nested { "documents": [...] } root formats.
    /// </summary>
    private static string NormalizePolicyJson(string json)
    {
        // Step 1: Normalize snake_case property names to expected camelCase
        json = json.Replace("\"policy_code\":", "\"code\":");
        json = json.Replace("\"source_page\":", "\"sourcePage\":");
        json = json.Replace("\"file_name\":", "\"fileName\":");

        // Step 2: Handle flat { "policies": [...] } → wrap into { "documents": [...] }
        var node = JsonNode.Parse(json);
        if (node is JsonObject obj && !obj.ContainsKey("documents") && obj.ContainsKey("policies"))
        {
            var policies = obj["policies"];
            obj.Remove("policies");

            var wrappedDoc = new JsonObject
            {
                ["meta"] = new JsonObject
                {
                    ["fileName"] = "uploaded.json",
                    ["entity"] = "",
                    ["version"] = "1.0"
                },
                ["policies"] = policies?.DeepClone()
            };

            var result = new JsonObject
            {
                ["documents"] = new JsonArray { wrappedDoc }
            };

            return result.ToJsonString();
        }

        return node?.ToJsonString() ?? json;
    }

    /// <summary>
    /// Reads a stream, normalizes the JSON, and deserializes into PolicyImportFile.
    /// </summary>
    private static async Task<PolicyImportFile> DeserializePolicyJsonAsync(Stream stream, CancellationToken ct)
    {
        using var reader = new StreamReader(stream);
        var raw = await reader.ReadToEndAsync(ct);
        var normalized = NormalizePolicyJson(raw);

        return JsonSerializer.Deserialize<PolicyImportFile>(normalized, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        }) ?? throw new JsonException("Deserialized to null");
    }

    // ── Embedding Helpers ──

    /// <summary>
    /// Build the text representation used for embedding a policy.
    /// Combines Title, Category, Section, and Description for maximum semantic richness.
    /// </summary>
    private static string BuildEmbeddingText(Policy p) =>
        $"{p.Title}. Category: {p.Category}. Section: {p.Section}. {p.Description}";

    /// <summary>
    /// Generate and store an embedding for a single policy (fire-and-forget safe).
    /// </summary>
    private async Task EmbedPolicyAsync(Policy policy, CancellationToken ct)
    {
        try
        {
            var text = BuildEmbeddingText(policy);
            var embeddingResult = await _embeddingService.GetEmbeddingAsync(text, ct);
            await _repo.UpdatePolicyEmbeddingAsync(policy.Id, embeddingResult.Embedding, ct);
            _logger.LogInformation("Embedded policy {Code}", policy.Code);
        }
        catch (Exception ex)
        {
            // Non-fatal: policy is created but embedding failed — can be re-indexed later
            _logger.LogWarning(ex, "Failed to embed policy {Code} — can be re-indexed later", policy.Code);
        }
    }

    // ── Mapping helpers ──

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

    private static PolicyDetailDto MapToDetailDto(Policy p) => new(
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
        p.UpdatedAt,
        p.Versions?.Select(v => new PolicyVersionDto(
            v.Id, v.VersionNumber, v.Description, v.ChangedBy, v.ChangeReason, v.CreatedAt
        )).ToList() ?? new()
    );
}
