"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startUploadJob, fetchJobStatus, fetchActiveJob, streamJobProgress, cancelUploadJob } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileJson,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Copy,
  Zap,
  Shield,
  Activity,
  Eye,
  ArrowRight,
  RotateCcw,
  StopCircle,
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  Settings2,
  Loader2,
  Clock,
  Database,
  Building2,
} from "lucide-react";
import type {
  PolicyUploadResultDto,
  PolicyUploadItemResult,
  PolicyUploadItemStatus,
  PdfExtractionProgressEvent,
} from "@/types";

/* ─── Status Configs ──────────────────────────────────────────────────── */

const statusConfig: Record<
  PolicyUploadItemStatus,
  {
    icon: typeof CheckCircle;
    label: string;
    color: string;
    badgeVariant: "success" | "warning" | "destructive" | "secondary";
    borderClass: string;
    bgClass: string;
  }
> = {
  CREATED: {
    icon: CheckCircle,
    label: "Created",
    color: "text-emerald-600",
    badgeVariant: "success",
    borderClass: "border-emerald-200",
    bgClass: "bg-emerald-50",
  },
  DUPLICATE: {
    icon: Copy,
    label: "Duplicate",
    color: "text-amber-600",
    badgeVariant: "warning",
    borderClass: "border-amber-200",
    bgClass: "bg-amber-50",
  },
  CONFLICT: {
    icon: XCircle,
    label: "Conflict",
    color: "text-red-600",
    badgeVariant: "destructive",
    borderClass: "border-red-200",
    bgClass: "bg-red-50",
  },
  ERROR: {
    icon: AlertTriangle,
    label: "Error",
    color: "text-slate-500",
    badgeVariant: "secondary",
    borderClass: "border-slate-200",
    bgClass: "bg-slate-50",
  },
};

/* ─── Processing animation (JSON fallback) ────────────────────────────── */

function ProcessingAnimation({ sourceType, message }: { sourceType: string; message?: string }) {
  return (
    <div className="flex flex-col items-center gap-6 py-12">
      {/* Pulsing icon */}
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/30">
          {sourceType === "PDF" ? (
            <FileText className="h-10 w-10 text-primary animate-pulse" />
          ) : (
            <FileJson className="h-10 w-10 text-primary animate-pulse" />
          )}
        </div>
      </div>

      {/* Scanning bar */}
      <div className="w-64 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {message || "Processing policies..."}
        </p>
        <p className="text-xs text-muted-foreground">
          {message ? "Background processing in progress" : "Parsing rules and checking for conflicts"}
        </p>
      </div>
    </div>
  );
}

/* ─── Chunk status type ───────────────────────────────────────────────── */

type ChunkState = "pending" | "processing" | "done" | "skipped";

interface ChunkInfo {
  index: number;
  state: ChunkState;
  startPage: number;
  endPage: number;
  policiesFound: number;
}

/* ─── PDF Extraction Progress Display ─────────────────────────────────── */

function ExtractionProgress({
  events,
  chunks,
  entity,
  version,
  totalPages,
  totalPolicies,
}: {
  events: PdfExtractionProgressEvent[];
  chunks: ChunkInfo[];
  entity: string | null;
  version: string | null;
  totalPages: number;
  totalPolicies: number;
}) {
  const completedChunks = chunks.filter(
    (c) => c.state === "done" || c.state === "skipped"
  ).length;
  const totalChunks = chunks.length || 1;
  const progressPercent = Math.round((completedChunks / totalChunks) * 100);
  const lastEvent = events[events.length - 1];
  const isDeduplicating = lastEvent?.type === "deduplication";
  const isComplete = lastEvent?.type === "complete";

  return (
    <div className="space-y-5">
      {/* Header with entity/version */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            {!isComplete ? (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/30">
                  <FileText className="h-6 w-6 text-primary animate-pulse" />
                </div>
              </>
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 ring-2 ring-emerald-300">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isComplete
                ? "Extraction Complete"
                : isDeduplicating
                  ? "De-duplicating policies..."
                  : "Extracting policies from PDF..."}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalPages > 0 && <>{totalPages} pages</>}
              {entity && (
                <>
                  {" "}
                  &middot; <span className="font-medium">{entity}</span>
                </>
              )}
              {version && (
                <>
                  {" "}
                  &middot; v{version}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-primary">
              {totalPolicies}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Policies
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums text-indigo-600">
              {completedChunks}/{totalChunks}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Chunks
            </p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{isComplete ? "Done" : `Processing chunk ${Math.min(completedChunks + 1, totalChunks)} of ${totalChunks}...`}</span>
          <span className="tabular-nums font-medium">{progressPercent}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isComplete
                ? "bg-emerald-500"
                : "bg-gradient-to-r from-primary to-blue-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Chunk grid */}
      {chunks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Chunk Details
          </p>
          <div className="grid gap-2">
            {chunks.map((chunk) => (
              <div
                key={chunk.index}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all duration-300 ${
                  chunk.state === "done"
                    ? "border-emerald-200 bg-emerald-50"
                    : chunk.state === "skipped"
                      ? "border-blue-200 bg-blue-50"
                      : chunk.state === "processing"
                        ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {chunk.state === "done" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  ) : chunk.state === "skipped" ? (
                    <Clock className="h-3.5 w-3.5 text-blue-600" />
                  ) : chunk.state === "processing" ? (
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  <span className="font-medium text-foreground">
                    Chunk {chunk.index}
                  </span>
                  <span className="text-muted-foreground">
                    Pages {chunk.startPage}–{chunk.endPage}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {chunk.state === "skipped" && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                      cached
                    </Badge>
                  )}
                  {(chunk.state === "done" || chunk.state === "skipped") && (
                    <span className="tabular-nums font-medium text-foreground">
                      {chunk.policiesFound} policies
                    </span>
                  )}
                  {chunk.state === "processing" && (
                    <span className="text-primary font-medium">extracting...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest event message */}
      {lastEvent?.message && (
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground truncate">
            {lastEvent.message}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Stats Row ───────────────────────────────────────────────────────── */

function StatsRow({ result }: { result: PolicyUploadResultDto }) {
  const stats = [
    {
      label: "Documents",
      value: result.documentsProcessed,
      icon: FileText,
      color: "text-indigo-600",
      valueBg: "bg-indigo-50",
      border: "border-indigo-200",
    },
    {
      label: "Created",
      value: result.policiesCreated,
      icon: CheckCircle,
      color: "text-emerald-600",
      valueBg: "bg-emerald-50",
      border: "border-emerald-200",
    },
    {
      label: "Skipped",
      value: result.policiesSkipped,
      icon: Copy,
      color: "text-amber-600",
      valueBg: "bg-amber-50",
      border: "border-amber-200",
    },
    {
      label: "Conflicts",
      value: result.conflicts,
      icon: XCircle,
      color: "text-red-600",
      valueBg: "bg-red-50",
      border: "border-red-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <Card key={s.label} className={`border ${s.border}`}>
          <CardContent className="flex items-center gap-3 px-4 py-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.valueBg}`}>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
            <div>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>
                {s.value}
              </p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                {s.label}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ─── Single Policy Result Card ───────────────────────────────────────── */

function PolicyResultCard({
  item,
  index,
}: {
  item: PolicyUploadItemResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[item.status];
  const StatusIcon = cfg.icon;

  return (
    <div
      className={`group relative rounded-lg border ${cfg.borderClass} ${cfg.bgClass} transition-all duration-200 hover:shadow-sm`}
    >
      {/* Accent bar */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${cfg.color.replace("text-", "bg-")}`}
      />

      <div className="px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <StatusIcon
              className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">
                  {item.code}
                </span>
                <Badge variant={cfg.badgeVariant} className="text-[10px] px-2 py-0">
                  {cfg.label}
                </Badge>
                {item.category && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                    {item.category}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground leading-snug truncate">
                {item.title}
              </p>
            </div>
          </div>

          {/* Expand toggle for items with reason or existing policy info */}
          {(item.reason || item.existingPolicyCode) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-lg hover:bg-muted transition-colors shrink-0"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 ml-7 space-y-2 text-xs">
            {item.reason && (
              <div className="rounded-lg bg-muted px-3 py-2 text-foreground/80 leading-relaxed">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] block mb-1 font-semibold">
                  Reason
                </span>
                {item.reason}
              </div>
            )}
            {item.existingPolicyCode && (
              <div className="rounded-lg bg-muted px-3 py-2">
                <span className="text-muted-foreground uppercase tracking-wider text-[10px] block mb-1 font-semibold">
                  Existing Policy
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {item.existingPolicyCode}
                  </span>
                  <span className="text-foreground/80">
                    {item.existingPolicyTitle}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Filter Tabs ─────────────────────────────────────────────────────── */

type FilterTab = "ALL" | PolicyUploadItemStatus;

function FilterTabs({
  activeFilter,
  onFilterChange,
  counts,
}: {
  activeFilter: FilterTab;
  onFilterChange: (f: FilterTab) => void;
  counts: Record<FilterTab, number>;
}) {
  const tabs: { key: FilterTab; label: string; activeColor: string }[] = [
    { key: "ALL", label: "All", activeColor: "bg-primary text-primary-foreground" },
    { key: "CREATED", label: "Created", activeColor: "bg-emerald-600 text-white" },
    { key: "DUPLICATE", label: "Duplicates", activeColor: "bg-amber-500 text-white" },
    { key: "CONFLICT", label: "Conflicts", activeColor: "bg-red-600 text-white" },
    { key: "ERROR", label: "Errors", activeColor: "bg-slate-500 text-white" },
  ];

  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {tabs
        .filter((t) => t.key === "ALL" || counts[t.key] > 0)
        .map((t) => (
          <button
            key={t.key}
            onClick={() => onFilterChange(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeFilter === t.key
                ? `${t.activeColor} shadow-sm`
                : "text-muted-foreground hover:text-foreground hover:bg-background"
            }`}
          >
            {t.label}
            <span
              className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeFilter === t.key
                  ? "bg-white/20"
                  : "bg-background text-muted-foreground"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
    </div>
  );
}

/* ─── Compute state from saved progress events (for reconnection) ───── */

function computeStateFromEvents(events: PdfExtractionProgressEvent[]) {
  let entity: string | null = null;
  let version: string | null = null;
  let totalPages = 0;
  let totalPolicies = 0;
  let chunks: ChunkInfo[] = [];

  for (const evt of events) {
    switch (evt.type) {
      case "started":
        totalPages = evt.totalPages;
        chunks = Array.from({ length: evt.totalChunks }, (_, i) => ({
          index: i + 1, state: "pending" as ChunkState, startPage: 0, endPage: 0, policiesFound: 0,
        }));
        break;
      case "metadata":
        entity = evt.entity ?? null;
        version = evt.version ?? null;
        break;
      case "chunk_start":
        chunks = chunks.map(c =>
          c.index === evt.chunkIndex ? { ...c, state: "processing" as ChunkState, startPage: evt.startPage, endPage: evt.endPage } : c
        );
        break;
      case "chunk_complete":
        chunks = chunks.map(c =>
          c.index === evt.chunkIndex ? { ...c, state: "done" as ChunkState, startPage: evt.startPage, endPage: evt.endPage, policiesFound: evt.policiesInChunk } : c
        );
        totalPolicies = evt.totalPoliciesExtracted;
        break;
      case "chunk_skipped":
        chunks = chunks.map(c =>
          c.index === evt.chunkIndex ? { ...c, state: "skipped" as ChunkState, startPage: evt.startPage, endPage: evt.endPage, policiesFound: evt.policiesInChunk } : c
        );
        totalPolicies = evt.totalPoliciesExtracted;
        break;
      case "deduplication":
      case "complete":
      case "import_progress":
      case "import_complete":
        totalPolicies = evt.totalPoliciesExtracted;
        break;
    }
  }
  return { entity, version, totalPages, totalPolicies, chunks };
}

/* ─── Main Page ───────────────────────────────────────────────────────── */

export default function UploadPoliciesPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PolicyUploadResultDto | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("ALL");
  const [mode, setMode] = useState<"upload" | "preview">("upload");
  const [maxPages, setMaxPages] = useState<number | "">("" );
  const [entityName, setEntityName] = useState("");

  // ─── SSE streaming state ────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);
  const [progressEvents, setProgressEvents] = useState<PdfExtractionProgressEvent[]>([]);
  const [chunkInfos, setChunkInfos] = useState<ChunkInfo[]>([]);
  const [extractionEntity, setExtractionEntity] = useState<string | null>(null);
  const [extractionVersion, setExtractionVersion] = useState<string | null>(null);
  const [extractionTotalPages, setExtractionTotalPages] = useState(0);
  const [extractionTotalPolicies, setExtractionTotalPolicies] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ─── Background job state ──────────────────────────────────────────
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobSourceType, setJobSourceType] = useState<string | null>(null);
  const [jobFileName, setJobFileName] = useState<string | null>(null);
  const [jobMode, setJobMode] = useState<string | null>(null);

  const isProcessing = isStreaming;
  const error = streamError;

  const handleFileSelect = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setActiveFilter("ALL");
    setStreamError(null);
    setProgressEvents([]);
    setChunkInfos([]);
    setExtractionEntity(null);
    setExtractionVersion(null);
    setExtractionTotalPages(0);
    setExtractionTotalPolicies(0);
    setActiveJobId(null);
    setJobSourceType(null);
    setJobFileName(null);
    setJobMode(null);
  }, []);

  // ─── Background job stream connection ──────────────────────────────
  const connectToJobStream = useCallback((jobId: string) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    streamJobProgress(jobId, {
      onProgress: (evt) => {
        setProgressEvents((prev) => [...prev, evt]);

        if (evt.type === "started") {
          setExtractionTotalPages(evt.totalPages);
          setChunkInfos(Array.from(
            { length: evt.totalChunks },
            (_, i) => ({
              index: i + 1,
              state: "pending" as ChunkState,
              startPage: 0,
              endPage: 0,
              policiesFound: 0,
            })
          ));
        } else if (evt.type === "metadata") {
          setExtractionEntity(evt.entity ?? null);
          setExtractionVersion(evt.version ?? null);
        } else if (evt.type === "chunk_start") {
          setChunkInfos((prev) =>
            prev.map((c) =>
              c.index === evt.chunkIndex
                ? { ...c, state: "processing", startPage: evt.startPage, endPage: evt.endPage }
                : c
            )
          );
        } else if (evt.type === "chunk_complete") {
          setChunkInfos((prev) =>
            prev.map((c) =>
              c.index === evt.chunkIndex
                ? { ...c, state: "done", startPage: evt.startPage, endPage: evt.endPage, policiesFound: evt.policiesInChunk }
                : c
            )
          );
          setExtractionTotalPolicies(evt.totalPoliciesExtracted);
        } else if (evt.type === "chunk_skipped") {
          setChunkInfos((prev) =>
            prev.map((c) =>
              c.index === evt.chunkIndex
                ? { ...c, state: "skipped", startPage: evt.startPage, endPage: evt.endPage, policiesFound: evt.policiesInChunk }
                : c
            )
          );
          setExtractionTotalPolicies(evt.totalPoliciesExtracted);
        } else if (evt.type === "deduplication" || evt.type === "complete" || evt.type === "import_progress" || evt.type === "import_complete") {
          setExtractionTotalPolicies(evt.totalPoliciesExtracted);
        }
      },
      onResult: (uploadResult) => {
        setResult(uploadResult);
        setIsStreaming(false);
        localStorage.removeItem("uploadJobId");
        queryClient.invalidateQueries({ queryKey: ["policies"] });
      },
      onError: (msg) => {
        setStreamError(msg);
        setIsStreaming(false);
        localStorage.removeItem("uploadJobId");
      },
    }, controller.signal);
  }, [queryClient]);

  // ─── Start a new background upload job ─────────────────────────────
  const startUpload = useCallback(async (uploadFile: File, uploadMode: string) => {
    setIsStreaming(true);
    setStreamError(null);
    setProgressEvents([]);
    setChunkInfos([]);
    setExtractionEntity(null);
    setExtractionVersion(null);
    setExtractionTotalPages(0);
    setExtractionTotalPolicies(0);
    setResult(null);

    try {
      const job = await startUploadJob(uploadFile, uploadMode, maxPages || undefined, entityName || undefined);
      setActiveJobId(job.jobId);
      setJobSourceType(job.sourceType);
      setJobFileName(job.fileName);
      setJobMode(uploadMode);
      localStorage.setItem("uploadJobId", job.jobId);
      connectToJobStream(job.jobId);
    } catch (err) {
      setStreamError(err instanceof Error ? err.message : "Failed to start upload");
      setIsStreaming(false);
    }
  }, [maxPages, entityName, connectToJobStream]);

  const handleUpload = () => {
    if (!file) return;
    startUpload(file, mode);
  };

  // ─── Reconnect to active job on page mount ─────────────────────────
  useEffect(() => {
    const savedJobId = localStorage.getItem("uploadJobId");

    const reconnect = async (jobId: string) => {
      try {
        const job = await fetchJobStatus(jobId);
        setJobSourceType(job.sourceType);
        setJobFileName(job.fileName);
        setJobMode(job.mode);
        setMode(job.mode as "upload" | "preview");

        if (job.status === "completed") {
          setResult(job.result);
          const state = computeStateFromEvents(job.progressEvents);
          setExtractionEntity(state.entity);
          setExtractionVersion(state.version);
          setExtractionTotalPages(state.totalPages);
          setExtractionTotalPolicies(state.totalPolicies);
          setChunkInfos(state.chunks);
          setProgressEvents(job.progressEvents);
          localStorage.removeItem("uploadJobId");
        } else if (job.status === "failed") {
          setStreamError(job.error ?? "Job failed");
          localStorage.removeItem("uploadJobId");
        } else if (job.status === "cancelled") {
          setStreamError("Job was cancelled.");
          localStorage.removeItem("uploadJobId");
        } else {
          // Still running — reconnect to live stream
          setActiveJobId(jobId);
          setIsStreaming(true);
          const state = computeStateFromEvents(job.progressEvents);
          setExtractionEntity(state.entity);
          setExtractionVersion(state.version);
          setExtractionTotalPages(state.totalPages);
          setExtractionTotalPolicies(state.totalPolicies);
          setChunkInfos(state.chunks);
          setProgressEvents(job.progressEvents);
          connectToJobStream(jobId);
        }
      } catch {
        localStorage.removeItem("uploadJobId");
      }
    };

    if (savedJobId) {
      reconnect(savedJobId);
    } else {
      // No saved job — check server for any active job
      fetchActiveJob().then(job => {
        if (job) {
          localStorage.setItem("uploadJobId", job.jobId);
          reconnect(job.jobId);
        }
      }).catch(() => {});
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await cancelUploadJob(activeJobId);
    } catch {
      // ignore — job may already be done
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    localStorage.removeItem("uploadJobId");
    setIsStreaming(false);
    setStreamError("Job was cancelled.");
  };

  const handleReset = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    localStorage.removeItem("uploadJobId");

    setFile(null);
    setResult(null);
    setActiveFilter("ALL");
    setMaxPages("");
    setEntityName("");
    setMode("upload");
    setIsStreaming(false);
    setStreamError(null);
    setProgressEvents([]);
    setChunkInfos([]);
    setExtractionEntity(null);
    setExtractionVersion(null);
    setExtractionTotalPages(0);
    setExtractionTotalPolicies(0);
    setActiveJobId(null);
    setJobSourceType(null);
    setJobFileName(null);
    setJobMode(null);
  };

  const fileType = file
    ? file.name.toLowerCase().endsWith(".pdf")
      ? "PDF"
      : "JSON"
    : null;
  const sourceType = jobSourceType ?? fileType;

  // Filter results
  const filteredResults = result
    ? activeFilter === "ALL"
      ? result.results
      : result.results.filter((r) => r.status === activeFilter)
    : [];

  const counts = result
    ? {
        ALL: result.results.length,
        CREATED: result.results.filter((r) => r.status === "CREATED").length,
        DUPLICATE: result.results.filter((r) => r.status === "DUPLICATE").length,
        CONFLICT: result.results.filter((r) => r.status === "CONFLICT").length,
        ERROR: result.results.filter((r) => r.status === "ERROR").length,
      }
    : { ALL: 0, CREATED: 0, DUPLICATE: 0, CONFLICT: 0, ERROR: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Policies"
        description="Import policy rules from JSON or PDF files with conflict detection"
      />

      {/* Hero Upload Section */}
      {!result && !isProcessing && (
        <Card className="relative overflow-hidden">
          {/* Subtle background decorations */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-600/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

          <CardHeader className="relative">
            <div className="flex items-center gap-3 mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                <Upload className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Policy File Upload</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Supports JSON and PDF formats with AI-powered extraction
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="relative space-y-5">
            {/* File type badges */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <FileJson className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-medium text-emerald-700">
                  JSON
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200">
                <FileText className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-medium text-blue-700">
                  PDF
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  AI
                </Badge>
              </div>
            </div>

            {/* Dropzone */}
            <FileDropzone
              onFileSelect={handleFileSelect}
              accept=".json,.pdf"
              label="Drop your policy file here"
              description="JSON or PDF — we'll detect the format automatically"
              disabled={isProcessing}
            />

            {/* Selected file info */}
            {file && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/50 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  {fileType === "PDF" ? (
                    <FileText className="h-5 w-5 text-blue-600 shrink-0" />
                  ) : (
                    <FileJson className="h-5 w-5 text-emerald-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB &middot;{" "}
                      {fileType} format
                    </p>
                  </div>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                  <button
                    onClick={() => setMode("preview")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      mode === "preview"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                  <button
                    onClick={() => setMode("upload")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      mode === "upload"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    Import
                  </button>
                </div>
              </div>
            )}

            {/* PDF Extraction Settings */}
            {file && fileType === "PDF" && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
                    PDF Extraction Settings
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="maxPages" className="text-xs text-blue-700 whitespace-nowrap">
                    Max pages to extract:
                  </label>
                  <input
                    id="maxPages"
                    type="number"
                    min={1}
                    placeholder="All pages"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value ? parseInt(e.target.value, 10) : "")}
                    className="w-28 rounded-md border border-blue-300 bg-white px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-400"
                    disabled={isProcessing}
                  />
                  <span className="text-[11px] text-blue-600/70">
                    Leave empty for full document
                  </span>
                </div>
              </div>
            )}

            {/* Entity Name */}
            {file && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-violet-600" />
                  <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                    Entity / Institution
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <label htmlFor="entityName" className="text-xs text-violet-700 whitespace-nowrap">
                    Entity name:
                  </label>
                  <input
                    id="entityName"
                    type="text"
                    placeholder="e.g. ASN, MUNT Hypotheken"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    className="w-64 rounded-md border border-violet-300 bg-white px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-400"
                    disabled={isProcessing}
                  />
                  <span className="text-[11px] text-violet-600/70">
                    Overrides any entity detected from the file
                  </span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {file && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleUpload}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  {mode === "preview" ? (
                    <>
                      <Search className="h-4 w-4" />
                      Analyze Conflicts
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Import Policies
                    </>
                  )}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {mode === "preview"
                    ? "Dry run — no policies will be created"
                    : "Policies will be created immediately"}
                </p>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-700">
                      Upload Failed
                    </p>
                    <p className="text-xs text-red-600/80 mt-0.5">
                      {typeof error === "string" ? error : (error as Error).message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Processing Animation */}
      {isProcessing && !result && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-end mb-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                className="gap-1.5"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
            {sourceType === "PDF" ? (
              <ExtractionProgress
                events={progressEvents}
                chunks={chunkInfos}
                entity={extractionEntity}
                version={extractionVersion}
                totalPages={extractionTotalPages}
                totalPolicies={extractionTotalPolicies}
              />
            ) : (
              <ProcessingAnimation
                sourceType={sourceType ?? "JSON"}
                message={progressEvents.length > 0 ? progressEvents[progressEvents.length - 1].message : undefined}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Results Section ────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          {/* Result Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <Activity className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {mode === "preview" ? "Conflict Analysis" : "Import Results"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {result.results.length} policies analyzed from{" "}
                  {result.sourceType} source
                  {mode === "preview" && " (preview — nothing was imported)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {mode === "preview" && file && result.conflicts === 0 && result.policiesSkipped === 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setMode("upload");
                    startUpload(file, "upload");
                  }}
                  className="gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Proceed with Import
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Upload Another
              </Button>
            </div>
          </div>

          {/* Stats */}
          <StatsRow result={result} />

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                  Warnings
                </span>
              </div>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 leading-relaxed">
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Filter + Results list */}
          <div className="space-y-3">
            <FilterTabs
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
            />

            <div className="space-y-2">
              {filteredResults.map((item, i) => (
                <PolicyResultCard key={`${item.code}-${i}`} item={item} index={i} />
              ))}
            </div>

            {filteredResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Shield className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">
                  No policies match the selected filter
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
