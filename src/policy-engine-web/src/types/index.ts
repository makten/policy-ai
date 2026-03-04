// Shared TypeScript types matching backend DTOs

export type Verdict = "APPROVED" | "REJECTED" | "MANUAL_REVIEW";
export type CheckStatus = "PASS" | "FAIL" | "WARNING";

export interface PolicyDocumentDto {
  id: string;
  fileName: string;
  entity: string;
  version: string;
  isActive: boolean;
  createdAt: string;
  policyCount: number;
}

export interface PolicyDto {
  id: string;
  policyDocumentId: string;
  code: string;
  title: string;
  category: string;
  sourcePage: number;
  section: string;
  description: string;
  isActive: boolean;
  entity: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDetailDto extends PolicyDto {
  versions: PolicyVersionDto[];
}

export interface PolicyVersionDto {
  id: string;
  versionNumber: number;
  description: string;
  changedBy: string;
  changeReason: string;
  createdAt: string;
}

export interface TokenUsageDto {
  callType: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AnonymizedFieldDto {
  fieldPath: string;
  category: "PII" | "LOCATION" | "TEMPORAL";
  originalHint: string;
  anonymizedValue: string;
  reason: string;
}

export interface EvaluationResultDto {
  id: string;
  verdict: Verdict;
  originalFileName: string;
  summary: string;
  evaluatedAt: string;
  durationMs: number;
  modelUsed: string;
  retrievedPolicyCount: number | null;
  totalPolicyCount: number | null;
  retrievedPolicies: RetrievedPolicyVectorDto[];
  entity: string | null;
  passedChecks: EvaluationCheckDto[];
  failedChecks: EvaluationCheckDto[];
  warnings: EvaluationCheckDto[];
  tokenUsage: TokenUsageDto[];
  anonymizationReport: AnonymizedFieldDto[];
}

export interface RetrievedPolicyVectorDto {
  policyId: string;
  vectorId: string;
  policyCode: string;
  policyTitle: string;
  category: string;
  section: string;
  sourcePage: number;
  entity: string;
}

export interface EvaluationSummaryDto {
  id: string;
  verdict: Verdict;
  originalFileName: string;
  summary: string;
  evaluatedAt: string;
  durationMs: number;
  retrievedPolicyCount: number | null;
  totalPolicyCount: number | null;
  entity: string | null;
  passedCount: number;
  failedCount: number;
  warningCount: number;
}

export interface EvaluationCheckDto {
  id: string;
  policyCode: string;
  policyTitle: string;
  status: CheckStatus;
  reason: string;
  reasoning: string | null;
  submittedValue: string | null;
  requiredValue: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ImportResultDto {
  documentsImported: number;
  policiesImported: number;
  warnings: string[];
}

export type PolicyUploadItemStatus = "CREATED" | "DUPLICATE" | "CONFLICT" | "ERROR";

export interface PolicyUploadItemResult {
  code: string;
  title: string;
  category: string;
  status: PolicyUploadItemStatus;
  reason: string | null;
  existingPolicyId: string | null;
  existingPolicyCode: string | null;
  existingPolicyTitle: string | null;
}

export interface PolicyUploadResultDto {
  documentsProcessed: number;
  policiesCreated: number;
  policiesSkipped: number;
  conflicts: number;
  sourceType: string;
  results: PolicyUploadItemResult[];
  warnings: string[];
}

export interface ResetResultDto {
  policiesDeleted: number;
  documentsDeleted: number;
  evaluationsDeleted: number;
  versionsDeleted: number;
  checksDeleted: number;
}

// ─── PDF Extraction SSE Progress ────────────────────────────────────

export type PdfExtractionEventType =
  | "started"
  | "metadata"
  | "chunk_start"
  | "chunk_complete"
  | "chunk_skipped"
  | "deduplication"
  | "complete"
  | "error"
  | "import_start"
  | "import_progress"
  | "import_complete"
  | "cancelled";

export interface PdfExtractionProgressEvent {
  type: PdfExtractionEventType;
  chunkIndex: number;
  totalChunks: number;
  startPage: number;
  endPage: number;
  policiesInChunk: number;
  totalPoliciesExtracted: number;
  totalPages: number;
  entity?: string;
  version?: string;
  message?: string;
}

// ─── Upload Job ─────────────────────────────────────────────────────────

export type UploadJobStatus = "pending" | "parsing" | "importing" | "completed" | "failed" | "cancelled";

export interface UploadJobDto {
  jobId: string;
  fileName: string;
  sourceType: string;
  mode: string;
  status: UploadJobStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  result: PolicyUploadResultDto | null;
  progressEvents: PdfExtractionProgressEvent[];
}
