import api from "@/lib/api";
import type {
  PolicyDto,
  PolicyDetailDto,
  PolicyDocumentDto,
  EvaluationSummaryDto,
  EvaluationResultDto,
  PaginatedResult,
  ImportResultDto,
  PolicyUploadResultDto,
  PdfExtractionProgressEvent,
  UploadJobDto,
} from "@/types";

// ─── Policies ────────────────────────────────────────────────────────

export async function fetchPolicies(params?: {
  category?: string;
  entity?: string;
  search?: string;
}): Promise<PolicyDto[]> {
  const { data } = await api.get<PolicyDto[]>("/policies", { params });
  return data;
}

export async function fetchPolicy(id: string): Promise<PolicyDetailDto> {
  const { data } = await api.get<PolicyDetailDto>(`/policies/${id}`);
  return data;
}

export async function createPolicy(
  body: { code: string; title: string; category: string; description: string; section?: string; sourcePage?: number; policyDocumentId?: string }
): Promise<PolicyDto> {
  const { data } = await api.post<PolicyDto>("/policies", body);
  return data;
}

export async function updatePolicy(
  id: string,
  body: { title?: string; description?: string; category?: string; section?: string; sourcePage?: number; changedBy?: string; changeReason?: string }
): Promise<void> {
  await api.put(`/policies/${id}`, body);
}

export async function deletePolicy(id: string): Promise<void> {
  await api.delete(`/policies/${id}`);
}

export async function importPolicies(file: File): Promise<ImportResultDto> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ImportResultDto>("/policies/import", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadPolicies(file: File, maxPages?: number): Promise<PolicyUploadResultDto> {
  const formData = new FormData();
  formData.append("file", file);
  const params: Record<string, number> = {};
  if (maxPages && maxPages > 0) params.maxPages = maxPages;
  const { data } = await api.post<PolicyUploadResultDto>("/policies/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
    timeout: 600_000, // 10 min for PDF extraction
  });
  return data;
}

export async function previewUpload(file: File, maxPages?: number): Promise<PolicyUploadResultDto> {
  const formData = new FormData();
  formData.append("file", file);
  const params: Record<string, number> = {};
  if (maxPages && maxPages > 0) params.maxPages = maxPages;
  const { data } = await api.post<PolicyUploadResultDto>("/policies/upload/preview", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
    timeout: 600_000, // 10 min for PDF extraction
  });
  return data;
}

export async function fetchPolicyDocuments(): Promise<PolicyDocumentDto[]> {
  const { data } = await api.get<PolicyDocumentDto[]>("/policies/documents");
  return data;
}

export async function fetchCategories(): Promise<string[]> {
  const { data } = await api.get<string[]>("/policies/categories");
  return data;
}

// ─── Evaluations ─────────────────────────────────────────────────────

export async function submitEvaluation(
  file: File,
  policyDocumentId?: string
): Promise<EvaluationResultDto> {
  const formData = new FormData();
  formData.append("file", file);
  if (policyDocumentId) formData.append("policyDocumentId", policyDocumentId);
  const { data } = await api.post<EvaluationResultDto>("/evaluations", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function fetchEvaluations(
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<EvaluationSummaryDto>> {
  const { data } = await api.get<PaginatedResult<EvaluationSummaryDto>>(
    "/evaluations",
    { params: { page, pageSize } }
  );
  return data;
}

export async function fetchEvaluation(
  id: string
): Promise<EvaluationResultDto> {
  const { data } = await api.get<EvaluationResultDto>(`/evaluations/${id}`);
  return data;
}

// ─── Streaming PDF Upload (SSE) ──────────────────────────────────────

export interface StreamUploadCallbacks {
  onProgress: (event: PdfExtractionProgressEvent) => void;
  onResult: (result: PolicyUploadResultDto) => void;
  onError: (message: string) => void;
}

/**
 * Upload a PDF and stream extraction progress via SSE.
 * Returns an AbortController so the caller can cancel the request.
 */
export function streamPdfUpload(
  file: File,
  mode: "upload" | "preview",
  callbacks: StreamUploadCallbacks,
  maxPages?: number,
): AbortController {
  const controller = new AbortController();
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5236/api";

  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  params.set("mode", mode);
  if (maxPages && maxPages > 0) params.set("maxPages", String(maxPages));

  const url = `${baseUrl}/policies/upload/stream?${params.toString()}`;

  (async () => {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        callbacks.onError(`Upload failed: ${response.status} ${response.statusText}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the last incomplete line

        let currentEventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (currentEventType === "progress") {
                callbacks.onProgress(parsed as PdfExtractionProgressEvent);
              } else if (currentEventType === "result") {
                callbacks.onResult(parsed as PolicyUploadResultDto);
              } else if (currentEventType === "error") {
                callbacks.onError(parsed.message ?? "Unknown error");
              }
            } catch {
              // Skip malformed JSON
            }
            currentEventType = "";
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err.message : "Unknown error");
    }
  })();

  return controller;
}

// ─── Admin ───────────────────────────────────────────────────────────

export async function resetApplication(): Promise<import("@/types").ResetResultDto> {
  const { data } = await api.post<import("@/types").ResetResultDto>("/admin/reset", { confirm: true });
  return data;
}

// ─── Background Upload Jobs ────────────────────────────────────────────

export async function startUploadJob(
  file: File,
  mode: string,
  maxPages?: number,
  entity?: string
): Promise<UploadJobDto> {
  const formData = new FormData();
  formData.append("file", file);
  const params: Record<string, string | number> = { mode };
  if (maxPages && maxPages > 0) params.maxPages = maxPages;
  if (entity && entity.trim()) params.entity = entity.trim();
  const { data } = await api.post<UploadJobDto>("/policies/upload/start", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    params,
    timeout: 120_000,
  });
  return data;
}

export async function fetchJobStatus(jobId: string): Promise<UploadJobDto> {
  const { data } = await api.get<UploadJobDto>(`/policies/upload/jobs/${jobId}`);
  return data;
}

export async function fetchActiveJob(): Promise<UploadJobDto | null> {
  try {
    const resp = await api.get<UploadJobDto>("/policies/upload/jobs/active", {
      validateStatus: (s: number) => s === 200 || s === 204,
    });
    return resp.status === 204 ? null : resp.data;
  } catch {
    return null;
  }
}

export async function cancelUploadJob(jobId: string): Promise<void> {
  await api.post(`/policies/upload/jobs/${jobId}/cancel`);
}

export function streamJobProgress(
  jobId: string,
  callbacks: {
    onStatus?: (status: Record<string, unknown>) => void;
    onProgress: (event: PdfExtractionProgressEvent) => void;
    onResult: (result: PolicyUploadResultDto) => void;
    onError: (message: string) => void;
  },
  signal?: AbortSignal
): void {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5236/api";
  const url = `${baseUrl}/policies/upload/jobs/${jobId}/stream`;

  (async () => {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        callbacks.onError(`Failed to connect: ${response.status} ${response.statusText}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              switch (currentEventType) {
                case "status":
                  callbacks.onStatus?.(parsed);
                  break;
                case "progress":
                  callbacks.onProgress(parsed as PdfExtractionProgressEvent);
                  break;
                case "result":
                  callbacks.onResult(parsed as PolicyUploadResultDto);
                  break;
                case "error":
                  callbacks.onError(parsed.message ?? "Unknown error");
                  break;
                case "cancelled":
                  callbacks.onError("Job was cancelled.");
                  return;
              }
            } catch {
              /* skip malformed */
            }
            currentEventType = "";
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      callbacks.onError(err instanceof Error ? err.message : "Unknown error");
    }
  })();
}
