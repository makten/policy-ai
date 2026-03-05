namespace PolicyEngine.Application.DTOs;

// ──── Policy DTOs ────

public record PolicyDocumentDto(
    Guid Id,
    string FileName,
    string Entity,
    string Version,
    bool IsActive,
    DateTime CreatedAt,
    int PolicyCount
);

public record PolicyDto(
    Guid Id,
    Guid PolicyDocumentId,
    string Code,
    string Title,
    string Category,
    int SourcePage,
    string Section,
    string Description,
    bool IsActive,
    string Entity,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record PolicyDetailDto(
    Guid Id,
    Guid PolicyDocumentId,
    string Code,
    string Title,
    string Category,
    int SourcePage,
    string Section,
    string Description,
    bool IsActive,
    string Entity,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<PolicyVersionDto> Versions
);

public record PolicyVersionDto(
    Guid Id,
    int VersionNumber,
    string Description,
    string ChangedBy,
    string ChangeReason,
    DateTime CreatedAt
);

public record CreatePolicyRequest(
    Guid PolicyDocumentId,
    string Code,
    string Title,
    string Category,
    int SourcePage,
    string Section,
    string Description
);

public record UpdatePolicyRequest(
    string Title,
    string Category,
    string Section,
    string Description,
    string ChangeReason
);

// ──── Token Usage DTOs ────

/// <summary>
/// Tracks token consumption for a single OpenAI API call.
/// </summary>
public record TokenUsageDto(
    string CallType,           // "Embedding", "Evaluation", "PdfParsing"
    string Model,
    int PromptTokens,
    int CompletionTokens,
    int TotalTokens
);

/// <summary>
/// Wraps an AI evaluation result with token usage metadata and anonymization report.
/// </summary>
public record AiProviderResult(
    AiEvaluationResponse Response,
    TokenUsageDto TokenUsage,
    List<AnonymizedFieldDto> AnonymizationReport
);

// ──── Anonymization DTOs ────

/// <summary>
/// Tracks a single field anonymization for user transparency (GDPR Art. 13/14).
/// </summary>
public record AnonymizedFieldDto(
    string FieldPath,
    string Category,
    string OriginalHint,
    string AnonymizedValue,
    string Reason
);

/// <summary>
/// Wraps an embedding result with token usage metadata.
/// </summary>
public record EmbeddingResultDto(
    Pgvector.Vector Embedding,
    TokenUsageDto Usage
);

/// <summary>
/// Wraps a batch embedding result with aggregated token usage.
/// </summary>
public record EmbeddingBatchResultDto(
    List<Pgvector.Vector> Embeddings,
    TokenUsageDto AggregatedUsage
);

// ──── Evaluation DTOs ────

public record EvaluationResultDto(
    Guid Id,
    string Verdict,
    string OriginalFileName,
    string Summary,
    DateTime EvaluatedAt,
    int DurationMs,
    string ModelUsed,
    string? Entity,
    int? RetrievedPolicyCount,
    int? TotalPolicyCount,
    List<RetrievedPolicyVectorDto> RetrievedPolicies,
    List<EvaluationCheckDto> PassedChecks,
    List<EvaluationCheckDto> FailedChecks,
    List<EvaluationCheckDto> Warnings,
    List<EvaluationCheckDto> NotEvaluated,
    List<TokenUsageDto> TokenUsage,
    List<AnonymizedFieldDto> AnonymizationReport
);

public record RetrievedPolicyVectorDto(
    Guid PolicyId,
    string VectorId,
    string PolicyCode,
    string PolicyTitle,
    string Category,
    string Section,
    int SourcePage,
    string Entity
);

public record EvaluationSummaryDto(
    Guid Id,
    string Verdict,
    string OriginalFileName,
    string Summary,
    DateTime EvaluatedAt,
    int DurationMs,
    string? Entity,
    int? RetrievedPolicyCount,
    int? TotalPolicyCount,
    int PassedCount,
    int FailedCount,
    int WarningCount,
    int NotEvaluatedCount,
    int IgnoredCount
);

public record EvaluationCheckDto(
    Guid Id,
    string PolicyCode,
    string PolicyTitle,
    string Status,
    string Reason,
    string? Reasoning,
    string? SubmittedValue,
    string? RequiredValue
);

// ──── Import DTOs ────

public record ImportResultDto(
    int DocumentsImported,
    int PoliciesImported,
    List<string> Warnings
);

/// <summary>
/// Enhanced import result with per-policy conflict details.
/// </summary>
public record PolicyUploadResultDto(
    int DocumentsProcessed,
    int PoliciesCreated,
    int PoliciesSkipped,
    int Conflicts,
    string SourceType,      // "JSON" or "PDF"
    List<PolicyUploadItemResult> Results,
    List<string> Warnings
);

/// <summary>
/// Per-policy result from an upload/import operation.
/// </summary>
public record PolicyUploadItemResult(
    string Code,
    string Title,
    string Category,
    string Status,             // "CREATED", "DUPLICATE", "CONFLICT", "ERROR"
    string? Reason,            // Human-readable explanation
    string? ExistingPolicyId,  // If duplicate/conflict — the id of the existing policy
    string? ExistingPolicyCode,
    string? ExistingPolicyTitle
);

// ──── AI Evaluation Structured Output ────

public record AiEvaluationResponse
{
    public string Verdict { get; init; } = string.Empty;
    public string Summary { get; init; } = string.Empty;
    public List<AiCheckResult> PassedChecks { get; init; } = new();
    public List<AiCheckResult> FailedChecks { get; init; } = new();
    public List<AiCheckResult> Warnings { get; init; } = new();
    public List<AiCheckResult> NotEvaluated { get; init; } = new();
}

public record AiCheckResult
{
    public string PolicyCode { get; init; } = string.Empty;
    public string PolicyTitle { get; init; } = string.Empty;
    public string Reasoning { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string Reason { get; init; } = string.Empty;
    public string? SubmittedValue { get; init; }
    public string? RequiredValue { get; init; }
}

// ──── Policy Import File Shape ────

public record PolicyImportDocument
{
    public PolicyImportMeta Meta { get; set; } = new();
    public List<PolicyImportItem> Policies { get; init; } = new();
}

public record PolicyImportMeta
{
    public string FileName { get; init; } = string.Empty;
    public string Entity { get; set; } = string.Empty;
    public string Version { get; init; } = string.Empty;
}

public record PolicyImportItem
{
    public string Code { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public int SourcePage { get; init; }
    public string Section { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
}

public record PolicyImportFile
{
    public List<PolicyImportDocument> Documents { get; init; } = new();
}

// ──── Upload Job ────

public record UploadJobDto(
    string JobId,
    string FileName,
    string SourceType,
    string Mode,
    string Status,
    DateTime CreatedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt,
    string? Error,
    PolicyUploadResultDto? Result,
    List<PdfExtractionProgressEvent> ProgressEvents
);

// ──── PDF Extraction Progress (SSE) ────

/// <summary>
/// Sent over SSE while a PDF is being extracted so the front-end can show
/// real-time chunk-by-chunk progress.
/// </summary>
public record PdfExtractionProgressEvent
{
    /// <summary>
    /// Event type:
    ///   "started"          – extraction begins (totalPages, totalChunks known)
    ///   "metadata"         – entity/version identified
    ///   "chunk_start"      – about to process a chunk
    ///   "chunk_complete"   – chunk finished, policies extracted
    ///   "chunk_skipped"    – chunk loaded from cache (resume)
    ///   "deduplication"    – dedup pass done
    ///   "complete"         – extraction finished
    ///   "error"            – something went wrong
    /// </summary>
    public string Type { get; init; } = string.Empty;

    // Chunk info
    public int ChunkIndex { get; init; }
    public int TotalChunks { get; init; }
    public int StartPage { get; init; }
    public int EndPage { get; init; }

    // Cumulative counters
    public int PoliciesInChunk { get; init; }
    public int TotalPoliciesExtracted { get; init; }

    // Page info
    public int TotalPages { get; init; }

    // Metadata (filled on "metadata" event)
    public string? Entity { get; init; }
    public string? Version { get; init; }

    // Human-readable message
    public string? Message { get; init; }
}
