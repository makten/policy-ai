using PolicyEngine.Application.DTOs;

namespace PolicyEngine.Application.Interfaces;

/// <summary>
/// Parses PDF documents into structured policy import data using AI.
/// </summary>
public interface IPolicyFileParser
{
    /// <summary>
    /// Extract text from a PDF file and use AI to parse it into the standard
    /// PolicyImportFile structure.
    /// </summary>
    /// <param name="maxPages">Optional limit on the number of pages to extract (for demos / quick runs).</param>
    /// <param name="startCodeNumber">The highest existing code number for this entity — new codes will start from startCodeNumber + 1.</param>
    Task<PolicyImportFile> ParsePdfAsync(Stream pdfStream, string fileName, int? maxPages = null, int startCodeNumber = 0, CancellationToken ct = default);

    /// <summary>
    /// Same as <see cref="ParsePdfAsync"/> but reports chunk-by-chunk progress
    /// via <paramref name="progress"/> so callers can stream SSE events.
    /// </summary>
    Task<PolicyImportFile> ParsePdfAsync(
        Stream pdfStream,
        string fileName,
        int? maxPages,
        int startCodeNumber,
        IProgress<PdfExtractionProgressEvent> progress,
        CancellationToken ct = default);
}
