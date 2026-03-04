using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using PolicyEngine.Application.DTOs;
using PolicyEngine.Application.Interfaces;
using PolicyEngine.Domain.Entities;
using PolicyEngine.Infrastructure.Services;

namespace PolicyEngine.API.Services;

/// <summary>
/// Thread-safe state for a single background upload job.
/// </summary>
public class UploadJob
{
    private readonly object _lock = new();
    private readonly List<PdfExtractionProgressEvent> _events = new();
    private readonly CancellationTokenSource _cts = new();
    private string _status = "pending";
    private PolicyUploadResultDto? _result;
    private string? _error;
    private DateTime? _startedAt;
    private DateTime? _completedAt;

    public UploadJob(string jobId, string fileName, string sourceType, string mode, int? maxPages, string? entityOverride = null)
    {
        JobId = jobId;
        FileName = fileName;
        SourceType = sourceType;
        Mode = mode;
        MaxPages = maxPages;
        EntityOverride = entityOverride;
        CreatedAt = DateTime.UtcNow;
    }

    // Immutable properties
    public string JobId { get; }
    public string FileName { get; }
    public string SourceType { get; }
    public string Mode { get; }
    public int? MaxPages { get; }
    public string? EntityOverride { get; }
    public DateTime CreatedAt { get; }

    /// <summary>Cancellation token associated with this job.</summary>
    public CancellationToken CancellationToken => _cts.Token;

    /// <summary>Request cancellation of this job.</summary>
    public void Cancel()
    {
        _cts.Cancel();
        Status = "cancelled";
        CompletedAt = DateTime.UtcNow;
        AddEvent(new PdfExtractionProgressEvent
        {
            Type = "cancelled",
            Message = "Upload cancelled by user."
        });
    }

    // Thread-safe mutable state
    public string Status
    {
        get { lock (_lock) return _status; }
        set { lock (_lock) _status = value; }
    }

    public PolicyUploadResultDto? Result
    {
        get { lock (_lock) return _result; }
        set { lock (_lock) _result = value; }
    }

    public string? Error
    {
        get { lock (_lock) return _error; }
        set { lock (_lock) _error = value; }
    }

    public DateTime? StartedAt
    {
        get { lock (_lock) return _startedAt; }
        set { lock (_lock) _startedAt = value; }
    }

    public DateTime? CompletedAt
    {
        get { lock (_lock) return _completedAt; }
        set { lock (_lock) _completedAt = value; }
    }

    public int EventCount
    {
        get { lock (_lock) return _events.Count; }
    }

    public bool IsTerminal => Status is "completed" or "failed" or "cancelled";

    public void AddEvent(PdfExtractionProgressEvent evt)
    {
        lock (_lock) _events.Add(evt);
    }

    public List<PdfExtractionProgressEvent> GetAllEvents()
    {
        lock (_lock) return new List<PdfExtractionProgressEvent>(_events);
    }

    public PdfExtractionProgressEvent[] GetEventsSince(int index)
    {
        lock (_lock)
        {
            if (index >= _events.Count) return [];
            return _events.Skip(index).ToArray();
        }
    }

    public UploadJobDto ToDto() => new(
        JobId, FileName, SourceType, Mode, Status,
        CreatedAt, StartedAt, CompletedAt,
        Error, Result, GetAllEvents()
    );
}

/// <summary>
/// IProgress adapter that writes extraction events into an UploadJob's event list.
/// </summary>
internal sealed class JobProgressReporter(UploadJob job) : IProgress<PdfExtractionProgressEvent>
{
    public void Report(PdfExtractionProgressEvent value) => job.AddEvent(value);
}

/// <summary>
/// Singleton service that manages server-side background upload jobs.
/// Jobs continue processing even when clients disconnect, and clients can reconnect
/// to receive progress updates at any time.
/// </summary>
public class UploadJobService
{
    private readonly ConcurrentDictionary<string, UploadJob> _jobs = new();
    private readonly ConcurrentDictionary<string, byte[]> _fileData = new();
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<UploadJobService> _logger;

    public UploadJobService(IServiceScopeFactory scopeFactory, ILogger<UploadJobService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    /// <summary>
    /// Create and start a new background upload job.
    /// </summary>
    public UploadJob StartJob(byte[] fileBytes, string fileName, string mode, int? maxPages, string? entityOverride = null)
    {
        CleanupOldJobs();

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var jobId = Guid.NewGuid().ToString("N")[..12];
        var job = new UploadJob(jobId, fileName,
            ext == ".pdf" ? "PDF" : "JSON", mode, maxPages, entityOverride);

        _jobs[jobId] = job;
        _fileData[jobId] = fileBytes;

        _ = Task.Run(() => ProcessJobAsync(jobId));

        _logger.LogInformation("Started upload job {JobId} for {FileName} ({SourceType}, {Mode})",
            jobId, fileName, job.SourceType, mode);

        return job;
    }

    /// <summary>
    /// Cancel a running upload job.
    /// </summary>
    public bool CancelJob(string jobId)
    {
        if (!_jobs.TryGetValue(jobId, out var job)) return false;
        if (job.IsTerminal) return false;
        job.Cancel();
        _fileData.TryRemove(jobId, out _);
        _logger.LogInformation("Upload job {JobId} cancelled by user", jobId);
        return true;
    }

    public UploadJob? GetJob(string jobId) =>
        _jobs.TryGetValue(jobId, out var j) ? j : null;

    public UploadJob? GetActiveJob() =>
        _jobs.Values
            .Where(j => !j.IsTerminal)
            .OrderByDescending(j => j.CreatedAt)
            .FirstOrDefault();

    private void CleanupOldJobs()
    {
        var cutoff = DateTime.UtcNow.AddHours(-2);
        foreach (var kvp in _jobs)
        {
            if (kvp.Value.IsTerminal && kvp.Value.CompletedAt < cutoff)
                _jobs.TryRemove(kvp.Key, out _);
        }
    }

    // ── Background job processing ──────────────────────────────────

    private async Task ProcessJobAsync(string jobId)
    {
        var job = _jobs[jobId];
        if (!_fileData.TryRemove(jobId, out var fileBytes))
        {
            job.Error = "File data not found.";
            job.Status = "failed";
            return;
        }

        try
        {
            var ct = job.CancellationToken;
            await using var scope = _scopeFactory.CreateAsyncScope();
            var repo = scope.ServiceProvider.GetRequiredService<IPolicyRepository>();
            var pdfParser = scope.ServiceProvider.GetRequiredService<IPolicyFileParser>();
            var embeddingService = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();

            job.Status = "parsing";
            job.StartedAt = DateTime.UtcNow;

            PolicyImportFile importFile;

            if (job.SourceType == "PDF")
            {
                using var ms = new MemoryStream(fileBytes);
                var progress = new JobProgressReporter(job);

                // Determine the entity prefix so we can query the max existing code number.
                // For PDFs, we do a preliminary parse to get entity from metadata,
                // but the parser will handle it internally — we pass the start number.
                // We'll re-assign codes after parsing if entity override is set.
                importFile = await pdfParser.ParsePdfAsync(
                    ms, job.FileName, job.MaxPages, 0, progress, ct);
            }
            else
            {
                // JSON parsing
                job.AddEvent(new PdfExtractionProgressEvent
                {
                    Type = "started",
                    Message = $"Parsing JSON file ({job.FileName})..."
                });

                using var ms = new MemoryStream(fileBytes);
                using var reader = new StreamReader(ms);
                var raw = await reader.ReadToEndAsync(ct);
                var normalized = NormalizePolicyJson(raw);
                importFile = JsonSerializer.Deserialize<PolicyImportFile>(normalized,
                    new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true
                    }) ?? throw new JsonException("Deserialized to null");

                var totalPolicies = importFile.Documents.Sum(d => d.Policies.Count);
                job.AddEvent(new PdfExtractionProgressEvent
                {
                    Type = "metadata",
                    Entity = importFile.Documents.FirstOrDefault()?.Meta.Entity,
                    Version = importFile.Documents.FirstOrDefault()?.Meta.Version,
                    TotalPoliciesExtracted = totalPolicies,
                    Message = $"Found {importFile.Documents.Count} document(s) with {totalPolicies} policies"
                });
            }

            ct.ThrowIfCancellationRequested();

            if (importFile.Documents == null || importFile.Documents.Count == 0)
            {
                job.Error = "No policy documents found in the uploaded file.";
                job.Status = "failed";
                job.CompletedAt = DateTime.UtcNow;
                return;
            }

            // Compute content hash for deduplication
            var contentHash = ComputeContentHash(fileBytes);

            // Check if a document with the same content already exists
            var existingDoc = await repo.GetDocumentByHashAsync(contentHash, ct);
            if (existingDoc != null)
            {
                job.Error = $"This file has already been imported as '{existingDoc.FileName}' (entity: {existingDoc.Entity}). "
                          + $"Document contains {existingDoc.Policies.Count} policies.";
                job.Status = "failed";
                job.CompletedAt = DateTime.UtcNow;
                job.AddEvent(new PdfExtractionProgressEvent
                {
                    Type = "duplicate_document",
                    Message = job.Error
                });
                return;
            }

            // Apply entity override: if user supplied an entity name, always use it
            if (!string.IsNullOrWhiteSpace(job.EntityOverride))
            {
                foreach (var doc in importFile.Documents)
                {
                    doc.Meta.Entity = job.EntityOverride;
                }
            }

            // Re-assign incremental codes based on the entity prefix and existing DB codes.
            // This ensures codes like MUNT-001, MUNT-002 continue from the highest in the DB.
            foreach (var doc in importFile.Documents)
            {
                var entity = doc.Meta.Entity ?? "";
                var prefix = PdfPolicyParser.BuildCodePrefix(entity);
                var maxExisting = await repo.GetMaxPolicyCodeNumberAsync(prefix, ct);

                for (int i = 0; i < doc.Policies.Count; i++)
                {
                    doc.Policies[i] = doc.Policies[i] with { Code = $"{prefix}-{maxExisting + i + 1:D3}" };
                }
            }

            // Import or analyze phase
            job.Status = "importing";
            job.AddEvent(new PdfExtractionProgressEvent
            {
                Type = "import_start",
                Message = job.Mode == "upload"
                    ? "Importing policies with conflict detection..."
                    : "Analyzing conflicts (preview mode)..."
            });

            PolicyUploadResultDto result;
            if (job.Mode == "upload")
                result = await ImportWithConflictDetection(
                    importFile, job.SourceType, contentHash, repo, embeddingService, job);
            else
                result = await AnalyzeConflicts(importFile, job.SourceType, repo);

            // Add final event BEFORE marking completed (so SSE loop catches it)
            job.AddEvent(new PdfExtractionProgressEvent
            {
                Type = "import_complete",
                TotalPoliciesExtracted = result.PoliciesCreated,
                Message = job.Mode == "upload"
                    ? $"Import complete — {result.PoliciesCreated} created, {result.PoliciesSkipped} skipped, {result.Conflicts} conflicts"
                    : $"Analysis complete — {result.PoliciesCreated} would be created, {result.PoliciesSkipped} duplicates, {result.Conflicts} conflicts"
            });

            job.Result = result;
            job.Status = "completed";
            job.CompletedAt = DateTime.UtcNow;

            _logger.LogInformation(
                "Upload job {JobId} completed: {Created} created, {Skipped} skipped, {Conflicts} conflicts",
                jobId, result.PoliciesCreated, result.PoliciesSkipped, result.Conflicts);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Upload job {JobId} was cancelled", jobId);
            // Status already set to "cancelled" by Cancel()
            if (job.Status != "cancelled")
            {
                job.Status = "cancelled";
                job.CompletedAt = DateTime.UtcNow;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Upload job {JobId} failed", jobId);
            job.Error = ex.Message;
            job.Status = "failed";
            job.CompletedAt = DateTime.UtcNow;
        }
    }

    // ── Import logic (mirrors PoliciesController) ──────────────────

    private async Task<PolicyUploadResultDto> ImportWithConflictDetection(
        PolicyImportFile importFile, string sourceType, string contentHash,
        IPolicyRepository repo, IEmbeddingService embeddingService,
        UploadJob job)
    {
        var warnings = new List<string>();
        var results = new List<PolicyUploadItemResult>();
        int docsProcessed = 0, created = 0, skipped = 0, conflicts = 0;
        int totalPolicies = importFile.Documents.Sum(d => d.Policies.Count);
        int processed = 0;

        foreach (var doc in importFile.Documents)
        {
            var policyDoc = new PolicyDocument
            {
                FileName = doc.Meta.FileName,
                Entity = doc.Meta.Entity,
                Version = doc.Meta.Version,
                ContentHash = contentHash,
                IsActive = true
            };
            await repo.AddDocumentAsync(policyDoc, CancellationToken.None);
            docsProcessed++;

            foreach (var item in doc.Policies)
            {
                job.CancellationToken.ThrowIfCancellationRequested();
                processed++;

                // Check for existing policy by code
                var existingByCode = await repo.GetPolicyByCodeAsync(item.Code, CancellationToken.None);
                if (existingByCode != null)
                {
                    var descriptionMatch = string.Equals(
                        existingByCode.Description?.Trim(), item.Description?.Trim(),
                        StringComparison.OrdinalIgnoreCase);

                    if (descriptionMatch)
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "DUPLICATE",
                            $"Policy with code '{item.Code}' already exists with identical description.",
                            existingByCode.Id.ToString(), existingByCode.Code, existingByCode.Title));
                        skipped++;
                    }
                    else
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CONFLICT",
                            $"Policy code '{item.Code}' exists but with a DIFFERENT description. Existing: \"{Truncate(existingByCode.Description, 120)}\"",
                            existingByCode.Id.ToString(), existingByCode.Code, existingByCode.Title));
                        conflicts++;
                    }
                    continue;
                }

                // Check for similar titles
                var similarByTitle = await repo.SearchPoliciesByTitleOrDescriptionAsync(
                    item.Title, CancellationToken.None);
                if (similarByTitle.Count > 0)
                {
                    var best = similarByTitle[0];
                    warnings.Add(
                        $"Policy '{item.Code}' has a similar title to existing policy '{best.Code}' (\"{Truncate(best.Title, 60)}\"). Created anyway.");
                }

                // Create the policy
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
                    await repo.AddPolicyAsync(policy, CancellationToken.None);

                    await repo.AddPolicyVersionAsync(new PolicyVersion
                    {
                        PolicyId = policy.Id,
                        VersionNumber = 1,
                        Description = policy.Description,
                        ChangedBy = "System",
                        ChangeReason = $"Imported from {sourceType}"
                    }, CancellationToken.None);

                    // Generate RAG embedding (non-fatal)
                    try
                    {
                        var text = BuildEmbeddingText(policy);
                        var embeddingResult = await embeddingService.GetEmbeddingAsync(
                            text, CancellationToken.None);
                        await repo.UpdatePolicyEmbeddingAsync(
                            policy.Id, embeddingResult.Embedding, CancellationToken.None);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to embed policy {Code}", policy.Code);
                    }

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

                // Report import progress periodically
                if (processed % 5 == 0 || processed == totalPolicies)
                {
                    job.AddEvent(new PdfExtractionProgressEvent
                    {
                        Type = "import_progress",
                        TotalPoliciesExtracted = created,
                        Message = $"Importing policy {processed}/{totalPolicies}... ({created} created, {skipped} skipped)"
                    });
                }
            }
        }

        return new PolicyUploadResultDto(
            docsProcessed, created, skipped, conflicts, sourceType, results, warnings);
    }

    private async Task<PolicyUploadResultDto> AnalyzeConflicts(
        PolicyImportFile importFile, string sourceType, IPolicyRepository repo)
    {
        var warnings = new List<string>();
        var results = new List<PolicyUploadItemResult>();
        int docsProcessed = 0, wouldCreate = 0, wouldSkip = 0, conflicts = 0;

        foreach (var doc in importFile.Documents)
        {
            // Pre-assign incremental entity-based codes for accurate analysis
            var entity = doc.Meta.Entity ?? "";
            var prefix = PdfPolicyParser.BuildCodePrefix(entity);
            var maxExisting = await repo.GetMaxPolicyCodeNumberAsync(prefix, CancellationToken.None);

            for (int i = 0; i < doc.Policies.Count; i++)
            {
                doc.Policies[i] = doc.Policies[i] with { Code = $"{prefix}-{maxExisting + i + 1:D3}" };
            }

            docsProcessed++;

            foreach (var item in doc.Policies)
            {
                var existingByCode = await repo.GetPolicyByCodeAsync(item.Code, CancellationToken.None);
                if (existingByCode != null)
                {
                    var descriptionMatch = string.Equals(
                        existingByCode.Description?.Trim(), item.Description?.Trim(),
                        StringComparison.OrdinalIgnoreCase);

                    if (descriptionMatch)
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "DUPLICATE",
                            $"Policy with code '{item.Code}' already exists with identical description.",
                            existingByCode.Id.ToString(), existingByCode.Code, existingByCode.Title));
                        wouldSkip++;
                    }
                    else
                    {
                        results.Add(new PolicyUploadItemResult(
                            item.Code, item.Title, item.Category,
                            "CONFLICT",
                            $"Policy code '{item.Code}' exists but with a DIFFERENT description. Existing: \"{Truncate(existingByCode.Description, 120)}\"",
                            existingByCode.Id.ToString(), existingByCode.Code, existingByCode.Title));
                        conflicts++;
                    }
                }
                else
                {
                    var similarByTitle = await repo.SearchPoliciesByTitleOrDescriptionAsync(
                        item.Title, CancellationToken.None);
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

        return new PolicyUploadResultDto(
            docsProcessed, wouldCreate, wouldSkip, conflicts, sourceType, results, warnings);
    }

    // ── Helpers ────────────────────────────────────────────────────

    private static string BuildEmbeddingText(Policy p) =>
        $"{p.Title}. Category: {p.Category}. Section: {p.Section}. {p.Description}";

    private static string Truncate(string? text, int maxLength) =>
        string.IsNullOrEmpty(text) ? "" : text.Length <= maxLength ? text : text[..maxLength] + "…";

    private static string ComputeContentHash(byte[] data)
    {
        var hash = SHA256.HashData(data);
        return Convert.ToHexStringLower(hash);
    }

    private static string NormalizePolicyJson(string json)
    {
        json = json.Replace("\"policy_code\":", "\"code\":");
        json = json.Replace("\"source_page\":", "\"sourcePage\":");
        json = json.Replace("\"file_name\":", "\"fileName\":");

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
}
