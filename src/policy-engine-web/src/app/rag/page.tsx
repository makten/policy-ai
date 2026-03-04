"use client";

import { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  FileUp,
  FileText,
  Brain,
  Search,
  ShieldCheck,
  Sparkles,
  Gauge,
  Workflow,
  Layers,
  GitBranch,
} from "lucide-react";

interface PolicyDto {
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

interface CategoryColor {
  bg: string;
  border: string;
  text: string;
  dot: string;
  svgDot: string;
}

const stages = [
  {
    title: "1. Import",
    detail: "JSON/PDF upload enters the API and is normalized into policy records.",
    icon: FileUp,
  },
  {
    title: "2. Extract",
    detail: "PDF text extraction + structured parsing creates canonical policy items.",
    icon: FileText,
  },
  {
    title: "3. Vectorize",
    detail: "Policy text is transformed into 1536-d embeddings via OpenAI.",
    icon: Brain,
  },
  {
    title: "4. Store",
    detail: "Embeddings are persisted in PostgreSQL pgvector with ANN index.",
    icon: Database,
  },
  {
    title: "5. Retrieve",
    detail: "Evaluation request embedding performs semantic top-K retrieval.",
    icon: Search,
  },
  {
    title: "6. Evaluate",
    detail: "Retrieved policies + guardrail categories are sent to GPT-4o.",
    icon: ShieldCheck,
  },
];

export default function RagPage() {
  const [activeTab, setActiveTab] = useState<"pipeline" | "explorer">("pipeline");
  const [policies, setPolicies] = useState<PolicyDto[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeTab === "explorer" && policies.length === 0 && !explorerLoading) {
      setExplorerLoading(true);
      setExplorerError(null);
      api
        .get<PolicyDto[]>("/policies")
        .then((res) => setPolicies(res.data))
        .catch(() => setExplorerError("Could not load policies. Ensure the API is running."))
        .finally(() => setExplorerLoading(false));
    }
  }, [activeTab]);

  return (
    <div className="relative isolate max-w-7xl space-y-6 overflow-hidden">
      <div className="pointer-events-none absolute -top-28 -left-24 h-80 w-80 animate-rag-float rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -top-10 right-10 h-72 w-72 animate-rag-float rounded-full bg-violet-500/10 blur-3xl [animation-delay:1.6s]" />

      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-secondary/30 p-6 shadow-xl shadow-primary/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_50%)]" />
        <div className="relative space-y-4">
          <PageHeader
            title="RAG Pipeline"
            description="Retrieval-Augmented Generation architecture for policy import, extraction, vectorization, embedding storage, retrieval, and AI evaluation"
          >
            <Badge variant="secondary" className="gap-1.5 border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="h-3.5 w-3.5 animate-rag-glow" />
              Premium RAG View
            </Badge>
          </PageHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-card/70 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Vector Model</p>
              <p className="mt-1 text-sm font-semibold text-foreground">text-embedding-3-small</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/70 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Store</p>
              <p className="mt-1 text-sm font-semibold text-foreground">PostgreSQL + pgvector</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/70 p-3 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Retrieval Mode</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Hybrid Top-K + Guardrails</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tab bar ── */}
      <div className="flex w-fit gap-1.5 rounded-xl border border-border/60 bg-card/50 p-1.5 shadow-sm backdrop-blur-sm">
        <TabButton
          active={activeTab === "pipeline"}
          onClick={() => setActiveTab("pipeline")}
          icon={<Workflow className="h-3.5 w-3.5" />}
          label="Pipeline Architecture"
        />
        <TabButton
          active={activeTab === "explorer"}
          onClick={() => setActiveTab("explorer")}
          icon={<Database className="h-3.5 w-3.5" />}
          label="Embedding Explorer"
        />
      </div>

      {/* ── Pipeline tab ── */}
      {activeTab === "pipeline" && (
        <>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage) => {
          const Icon = stage.icon;
          return (
            <Card
              key={stage.title}
              className="group border-border/70 bg-gradient-to-b from-card/95 to-secondary/20 shadow-md shadow-black/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10"
            >
              <CardHeader className="pb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <Icon className="h-4 w-4" />
                </div>
                <CardTitle className="text-sm">{stage.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed">{stage.detail}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden border-border/70 bg-gradient-to-b from-card/95 to-secondary/20 shadow-xl shadow-black/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            End-to-End Architecture
          </CardTitle>
          <CardDescription>
            Complete data movement from policy ingestion to AI decisioning.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
          <DiagramLegend
            items={[
              { label: "Data Flow", className: "bg-primary" },
              { label: "Control/Fallback", className: "bg-amber-500" },
              { label: "Storage/Index", className: "bg-violet-500" },
            ]}
          />
          <div className="rounded-xl border border-border/60 bg-card/30 p-2 shadow-inner shadow-primary/5">
            <PipelineSvg />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden border-border/70 bg-gradient-to-b from-card/95 to-secondary/15 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Lifecycle Swimlane
            </CardTitle>
            <CardDescription>
              Operational flow across upload, indexing, retrieval, and evaluation lanes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-card/30 p-2 shadow-inner shadow-primary/5">
              <SwimlaneSvg />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-gradient-to-b from-card/95 to-secondary/15 shadow-lg shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              Retrieval Engine Detail
            </CardTitle>
            <CardDescription>
              Hybrid retrieval internals: semantic top-K + mandatory category guardrails.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border/60 bg-card/30 p-2 shadow-inner shadow-primary/5">
              <RetrieverSvg />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <InsightCard
          icon={<Gauge className="h-4 w-4" />}
          title="Token Efficiency"
          text="Only the relevant subset of policies is sent to GPT-4o, reducing prompt size and improving latency."
        />
        <InsightCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Safety & Coverage"
          text="Mandatory categories and fallback-to-all behavior ensure evaluation reliability even if retrieval degrades."
        />
        <InsightCard
          icon={<Database className="h-4 w-4" />}
          title="Operational Control"
          text="Reindex endpoint and retrieval counters provide visibility into embedding health and retrieval quality."
        />
      </div>
        </>
      )}

      {/* ── Embedding Explorer tab ── */}
      {activeTab === "explorer" && (
        <EmbeddingExplorer
          policies={policies}
          loading={explorerLoading}
          error={explorerError}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all duration-200 ${
        active
          ? "border-primary/30 bg-primary/15 text-primary shadow-sm"
          : "border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

const CATEGORY_COLORS: CategoryColor[] = [
  { bg: "bg-primary/15", border: "border-primary/30", text: "text-primary", dot: "bg-primary", svgDot: "fill-primary/80" },
  { bg: "bg-violet-500/15", border: "border-violet-500/30", text: "text-violet-400", dot: "bg-violet-500", svgDot: "fill-violet-400/80" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-500", svgDot: "fill-emerald-400/80" },
  { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", dot: "bg-amber-500", svgDot: "fill-amber-400/80" },
  { bg: "bg-pink-500/15", border: "border-pink-500/30", text: "text-pink-400", dot: "bg-pink-500", svgDot: "fill-pink-400/80" },
  { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-400", dot: "bg-cyan-500", svgDot: "fill-cyan-400/80" },
  { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-400", dot: "bg-rose-500", svgDot: "fill-rose-400/80" },
  { bg: "bg-teal-500/15", border: "border-teal-500/30", text: "text-teal-400", dot: "bg-teal-500", svgDot: "fill-teal-400/80" },
];

function EmbeddingExplorer({
  policies,
  loading,
  error,
}: {
  policies: PolicyDto[];
  loading: boolean;
  error: string | null;
}) {
  const [filter, setFilter] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(policies.map((p) => p.category))].sort(),
    [policies],
  );
  const entities = useMemo(
    () => [...new Set(policies.map((p) => p.entity).filter(Boolean))].sort(),
    [policies],
  );

  const colorFor = (cat: string): CategoryColor =>
    CATEGORY_COLORS[categories.indexOf(cat) % CATEGORY_COLORS.length];

  const filteredPolicies = useMemo(
    () =>
      policies.filter((p) => {
        const q = filter.toLowerCase();
        const matchText =
          !q ||
          p.code.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.section.toLowerCase().includes(q);
        const matchCat = !selectedCategory || p.category === selectedCategory;
        return matchText && matchCat;
      }),
    [policies, filter, selectedCategory],
  );

  if (loading) return <ExplorerSkeleton />;
  if (error)
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-10 text-center font-mono text-sm text-destructive">
        {error}
      </div>
    );

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            { label: "Total Vectors", value: String(policies.length), sub: "embeddings indexed" },
            { label: "Dimensions", value: "1,536", sub: "per vector" },
            { label: "Model", value: "ada-3-sm", sub: "text-embedding-3-small" },
            { label: "Categories", value: String(categories.length), sub: "semantic clusters" },
            { label: "Entities", value: String(entities.length), sub: "policy sources" },
            { label: "Index", value: "IVFFlat", sub: "cosine similarity" },
          ] as const
        ).map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border/60 bg-gradient-to-b from-card/90 to-secondary/30 px-4 py-3 shadow-sm"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 font-mono text-xl font-bold tabular-nums text-foreground">
              {stat.value}
            </p>
            <p className="text-[10px] text-muted-foreground/70">{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* Vector Space Map */}
      <Card className="overflow-hidden border-border/70 bg-gradient-to-b from-card/95 to-secondary/20 shadow-xl shadow-black/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Brain className="h-4 w-4 text-primary" />
            Vector Space Map
            <Badge variant="secondary" className="ml-auto border-border/60 font-mono text-[10px]">
              Conceptual 2D Projection
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Semantic topology of the embedded policy corpus. Each dot is one 1536-d policy vector;
            proximity signals conceptual similarity in the embedding space.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VectorSpaceSvg categories={categories} policies={policies} />
        </CardContent>
      </Card>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search code, title, description..."
            className="w-full rounded-lg border border-border/70 bg-card/80 py-2 pl-9 pr-4 font-mono text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full border px-3 py-1 font-mono text-xs transition-all ${
              !selectedCategory
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/20"
            }`}
          >
            All ({policies.length})
          </button>
          {categories.map((cat) => {
            const c = colorFor(cat);
            const active = selectedCategory === cat;
            const count = policies.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(active ? null : cat)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs transition-all ${
                  active
                    ? `${c.border} ${c.bg} ${c.text}`
                    : "border-border/60 bg-card/60 text-muted-foreground hover:border-primary/20"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                {cat}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
          {filteredPolicies.length} / {policies.length} vectors
        </span>
      </div>

      {/* Policy vector records */}
      <div className="space-y-2">
        {filteredPolicies.length === 0 && (
          <div className="rounded-xl border border-dashed border-border/60 py-12 text-center font-mono text-sm text-muted-foreground">
            No vectors match the current filter.
          </div>
        )}
        {filteredPolicies.map((policy) => {
          const c = colorFor(policy.category);
          const hovered = hoveredId === policy.id;
          return (
            <div
              key={policy.id}
              onMouseEnter={() => setHoveredId(policy.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`rounded-xl border bg-gradient-to-r from-card/90 to-secondary/20 p-4 transition-all duration-200 ${
                hovered
                  ? "border-primary/30 -translate-y-px shadow-md shadow-primary/8"
                  : "border-border/60 shadow-sm"
              }`}
            >
              <div className="flex flex-wrap items-start gap-4">
                {/* Code + status badges */}
                <div className="flex min-w-[140px] flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded border border-border/60 bg-secondary/60 px-2 py-0.5 font-mono text-xs text-foreground">
                      {policy.code}
                    </span>
                    <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                      <span className="h-1.5 w-1.5 animate-rag-glow rounded-full bg-emerald-500" />
                      Indexed
                    </span>
                  </div>
                  <span
                    className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] ${c.border} ${c.bg} ${c.text}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                    {policy.category}
                  </span>
                </div>

                {/* Title + description */}
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {policy.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {policy.description}
                  </p>
                </div>

                {/* Metadata columns */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono text-muted-foreground">
                  <div>
                    <p className="uppercase tracking-wider text-muted-foreground/60">Entity</p>
                    <p className="text-foreground/80">{policy.entity || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-muted-foreground/60">Section</p>
                    <p className="text-foreground/80">{policy.section || "\u2014"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-muted-foreground/60">Page</p>
                    <p className="text-foreground/80">{policy.sourcePage}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider text-muted-foreground/60">Vector</p>
                    <p className="text-primary/80">1536-d \u211d</p>
                  </div>
                </div>
              </div>

              {/* Hover expand: raw vector metadata */}
              <div
                className={`overflow-hidden transition-all duration-200 ${
                  hovered ? "mt-3 max-h-10 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <div className="flex items-center gap-4 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  <span className="shrink-0 text-muted-foreground/60">VEC_ID</span>
                  <span className="flex-1 truncate text-primary/70">{policy.id}</span>
                  <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                    <span>dim=1536</span>
                    <span>·</span>
                    <span>dist=cosine</span>
                    <span>·</span>
                    <span>idx=IVFFlat</span>
                    <span>·</span>
                    <span className="text-emerald-400">status=indexed</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VectorSpaceSvg({
  categories,
  policies,
}: {
  categories: string[];
  policies: PolicyDto[];
}) {
  const N = Math.max(categories.length, 1);
  const catPositions = categories.map((cat, i) => {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
    return {
      cat,
      cx: 400 + 195 * Math.cos(angle),
      cy: 215 + 120 * Math.sin(angle),
    };
  });

  const SVG_DOT_CLASSES = [
    "fill-primary/80",
    "fill-violet-400/80",
    "fill-emerald-400/80",
    "fill-amber-400/80",
    "fill-pink-400/80",
    "fill-cyan-400/80",
    "fill-rose-400/80",
    "fill-teal-400/80",
  ];

  return (
    <svg
      viewBox="0 0 800 430"
      className="h-auto w-full rounded-xl"
      role="img"
      aria-label="Conceptual 2D projection of policy embedding vectors"
    >
      <rect x="0" y="0" width="800" height="430" rx="12" className="fill-secondary/30" />
      {/* Grid */}
      {[80, 160, 240, 320, 400, 480, 560, 640, 720].map((x) => (
        <line key={`gx-${x}`} x1={x} y1="16" x2={x} y2="414" className="stroke-border/25" strokeWidth="0.5" />
      ))}
      {[55, 110, 165, 220, 275, 330, 385].map((y) => (
        <line key={`gy-${y}`} x1="16" y1={y} x2="784" y2={y} className="stroke-border/25" strokeWidth="0.5" />
      ))}
      {/* Axis labels */}
      <text x="400" y="426" textAnchor="middle" className="fill-muted-foreground text-[11px]">
        Semantic Similarity \u2192
      </text>
      <text
        x="13"
        y="215"
        textAnchor="middle"
        className="fill-muted-foreground text-[11px]"
        transform="rotate(-90 13 215)"
      >
        Conceptual Distance \u2192
      </text>
      {/* Cluster halos */}
      {catPositions.map(({ cat, cx, cy }, i) => {
        const cls = SVG_DOT_CLASSES[i % SVG_DOT_CLASSES.length];
        return (
          <g key={`halo-${cat}`}>
            <circle cx={cx} cy={cy} r="50" className={`${cls} opacity-10`} />
            <circle cx={cx} cy={cy} r="30" className={`${cls} opacity-15`} />
          </g>
        );
      })}
      {/* Policy dots */}
      {policies.map((policy) => {
        const catIdx = categories.indexOf(policy.category);
        const pos = catPositions[catIdx];
        if (!pos) return null;
        const h1 = hashStr(policy.id);
        const h2 = hashStr(policy.id + "seed2");
        const dx = ((h1 % 72) - 36) * 0.95;
        const dy = ((h2 % 52) - 26) * 0.95;
        const px = Math.max(22, Math.min(778, pos.cx + dx));
        const py = Math.max(22, Math.min(408, pos.cy + dy));
        return (
          <circle
            key={policy.id}
            cx={px}
            cy={py}
            r="3.5"
            className={`${SVG_DOT_CLASSES[catIdx % SVG_DOT_CLASSES.length]} opacity-85`}
          />
        );
      })}
      {/* Category center markers + labels */}
      {catPositions.map(({ cat, cx, cy }, i) => {
        const cls = SVG_DOT_CLASSES[i % SVG_DOT_CLASSES.length];
        const labelY = cy > 300 ? cy + 24 : cy - 16;
        const labelW = Math.max(cat.length * 6.8, 60);
        return (
          <g key={`lbl-${cat}`}>
            <circle cx={cx} cy={cy} r="7" className={`${cls} animate-rag-glow`} />
            <circle cx={cx} cy={cy} r="3.5" className="fill-white/40" />
            <rect
              x={cx - labelW / 2}
              y={labelY - 13}
              width={labelW}
              height="17"
              rx="4"
              className="fill-card/90 stroke-border/50"
              strokeWidth="0.5"
            />
            <text
              x={cx}
              y={labelY}
              textAnchor="middle"
              className="fill-foreground text-[10px] font-medium"
            >
              {cat}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x="20" y="18" width="170" height="26" rx="6" className="fill-card/80 stroke-border/50" strokeWidth="0.5" />
      <circle cx="34" cy="31" r="4" className="fill-primary/80" />
      <text x="44" y="35" className="fill-muted-foreground text-[10px]">
        policy vector · dim=1536
      </text>
    </svg>
  );
}

function ExplorerSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-secondary/50" />
        ))}
      </div>
      <div className="h-60 rounded-xl bg-secondary/50" />
      <div className="h-10 w-96 rounded-lg bg-secondary/50" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-xl bg-secondary/50" />
      ))}
    </div>
  );
}

function InsightCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card className="group border-border/70 bg-gradient-to-b from-card/90 to-secondary/20 shadow-md shadow-black/5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
      <CardHeader className="pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary transition-transform group-hover:scale-105">
          {icon}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
      </CardContent>
    </Card>
  );
}

function DiagramLegend({
  items,
}: {
  items: Array<{ label: string; className: string }>;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1">
          <span className={`h-2.5 w-2.5 animate-rag-glow rounded-full ${item.className}`} />
          {item.label}
        </div>
      ))}
    </div>
  );
}

function PipelineSvg() {
  return (
    <svg viewBox="0 0 1200 420" className="w-full h-auto" role="img" aria-label="RAG end-to-end pipeline diagram">
      <defs>
        <linearGradient id="pipeGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.12" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.03" />
        </linearGradient>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
        </marker>
        <marker id="arrow-control" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
        </marker>
        <marker id="arrow-storage" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-violet-500" />
        </marker>
      </defs>

      <rect x="20" y="30" width="1160" height="360" rx="20" className="fill-secondary/40 stroke-border" />

      <Node x={60} y={80} w={160} h={72} title="Upload" subtitle="JSON / PDF" icon={<FileUp className="h-4 w-4" />} />
      <Node x={250} y={80} w={170} h={72} title="Extract" subtitle="Parse + Normalize" icon={<FileText className="h-4 w-4" />} />
      <Node x={450} y={80} w={170} h={72} title="Embed" subtitle="text-embedding-3-small" icon={<Brain className="h-4 w-4" />} />
      <Node x={650} y={80} w={190} h={72} title="Vector Store" subtitle="PostgreSQL + pgvector" icon={<Database className="h-4 w-4" />} highlight="storage" />
      <Node x={870} y={80} w={150} h={72} title="Retrieve" subtitle="Top-K + guardrails" icon={<Search className="h-4 w-4" />} />
      <Node x={1040} y={80} w={120} h={72} title="Evaluate" subtitle="GPT-4o" icon={<ShieldCheck className="h-4 w-4" />} />

      <Arrow x1={220} y1={116} x2={250} y2={116} animated />
      <Arrow x1={420} y1={116} x2={450} y2={116} animated />
      <Arrow x1={620} y1={116} x2={650} y2={116} animated variant="storage" />
      <Arrow x1={840} y1={116} x2={870} y2={116} animated variant="storage" />
      <Arrow x1={1020} y1={116} x2={1040} y2={116} animated />

      <rect x="60" y="210" width="350" height="140" rx="14" className="fill-card stroke-border" />
      <text x="80" y="238" className="fill-foreground text-[15px] font-semibold">Policy Ingestion Layer</text>
      <text x="80" y="263" className="fill-muted-foreground text-[13px]">• Upload endpoints import JSON/PDF files</text>
      <text x="80" y="286" className="fill-muted-foreground text-[13px]">• PDF parser extracts policy clauses</text>
      <text x="80" y="309" className="fill-muted-foreground text-[13px]">• New rules get automatic embeddings</text>
      <text x="80" y="332" className="fill-muted-foreground text-[13px]">• Reindex endpoint refreshes vectors</text>

      <rect x="430" y="210" width="350" height="140" rx="14" className="fill-card stroke-border" />
      <text x="450" y="238" className="fill-foreground text-[15px] font-semibold">Retrieval Layer</text>
      <text x="450" y="263" className="fill-muted-foreground text-[13px]">• Application summary → query embedding</text>
      <text x="450" y="286" className="fill-muted-foreground text-[13px]">• Cosine similarity over indexed vectors</text>
      <text x="450" y="309" className="fill-muted-foreground text-[13px]">• Mandatory categories always included</text>
      <text x="450" y="332" className="fill-muted-foreground text-[13px]">• Full-set fallback if retrieval is unavailable</text>

      <rect x="800" y="210" width="360" height="140" rx="14" className="fill-card stroke-border" />
      <text x="820" y="238" className="fill-foreground text-[15px] font-semibold">Evaluation Layer</text>
      <text x="820" y="263" className="fill-muted-foreground text-[13px]">• Retrieved subset + application sent to GPT-4o</text>
      <text x="820" y="286" className="fill-muted-foreground text-[13px]">• Structured verdict + checks persisted</text>
      <text x="820" y="309" className="fill-muted-foreground text-[13px]">• Metrics: RetrievedPolicyCount / TotalPolicyCount</text>
      <text x="820" y="332" className="fill-muted-foreground text-[13px]">• Frontend visualizes retrieval efficiency</text>

      <path d="M 1020 152 C 1020 190, 960 190, 960 210" className="stroke-amber-500 fill-none rag-flow-soft" />
      <text x="1028" y="186" className="fill-amber-500 text-[11px]">Retrieval metadata</text>
    </svg>
  );
}

function SwimlaneSvg() {
  return (
    <svg viewBox="0 0 900 520" className="w-full h-auto" role="img" aria-label="RAG lifecycle swimlane diagram">
      <rect x="20" y="20" width="860" height="480" rx="18" className="fill-secondary/40 stroke-border" />

      <Lane y={70} title="Upload Lane" />
      <Lane y={170} title="Extraction Lane" />
      <Lane y={270} title="Embedding Lane" />
      <Lane y={370} title="Evaluation Lane" />

      <Milestone x={170} y={95} label="JSON/PDF received" />
      <Milestone x={350} y={195} label="Rules extracted" />
      <Milestone x={540} y={295} label="Vectors stored" />
      <Milestone x={730} y={395} label="Verdict delivered" />

      <Connector x1={170} y1={120} x2={350} y2={170} animated />
      <Connector x1={350} y1={220} x2={540} y2={270} animated />
      <Connector x1={540} y1={320} x2={730} y2={370} animated />

      <text x="60" y="460" className="fill-muted-foreground text-[12px]">
        Continuous loop: upload/import updates vector index, which directly improves future retrieval precision.
      </text>
    </svg>
  );
}

function RetrieverSvg() {
  return (
    <svg viewBox="0 0 900 520" className="w-full h-auto" role="img" aria-label="Hybrid retrieval internals diagram">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
        </marker>
        <marker id="arrow-control" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
        </marker>
        <marker id="arrow-storage" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-violet-500" />
        </marker>
      </defs>
      <rect x="20" y="20" width="860" height="480" rx="18" className="fill-secondary/40 stroke-border" />

      <rect x="60" y="70" width="250" height="120" rx="14" className="fill-card stroke-border" />
      <text x="84" y="100" className="fill-foreground text-[15px] font-semibold">Application Context</text>
      <text x="84" y="124" className="fill-muted-foreground text-[13px]">Request JSON summarized into</text>
      <text x="84" y="145" className="fill-muted-foreground text-[13px]">retrieval-ready semantic text.</text>

      <rect x="340" y="70" width="240" height="120" rx="14" className="fill-card stroke-border" />
      <text x="364" y="100" className="fill-foreground text-[15px] font-semibold">Embedding Query</text>
      <text x="364" y="124" className="fill-muted-foreground text-[13px]">text-embedding-3-small</text>
      <text x="364" y="145" className="fill-muted-foreground text-[13px]">produces 1536-d vector.</text>

      <rect x="610" y="70" width="230" height="120" rx="14" className="fill-card stroke-violet-500/60" />
      <text x="634" y="100" className="fill-violet-400 text-[15px] font-semibold">Semantic Search</text>
      <text x="634" y="124" className="fill-muted-foreground text-[13px]">Cosine similarity Top-K</text>
      <text x="634" y="145" className="fill-muted-foreground text-[13px]">over pgvector index.</text>

      <Arrow x1={310} y1={130} x2={340} y2={130} animated />
      <Arrow x1={580} y1={130} x2={610} y2={130} animated />

      <rect x="80" y="250" width="350" height="190" rx="14" className="fill-card stroke-amber-500/50" />
      <text x="104" y="280" className="fill-amber-400 text-[15px] font-semibold">Guardrail Inclusion</text>
      <text x="104" y="306" className="fill-muted-foreground text-[13px]">• Always include mandatory categories</text>
      <text x="104" y="328" className="fill-muted-foreground text-[13px]">• Merge + deduplicate with Top-K set</text>
      <text x="104" y="350" className="fill-muted-foreground text-[13px]">• Preserve compliance-critical rules</text>
      <text x="104" y="372" className="fill-muted-foreground text-[13px]">• Record retrieval metrics for audit</text>

      <rect x="470" y="250" width="350" height="190" rx="14" className="fill-card stroke-amber-500/50" />
      <text x="494" y="280" className="fill-amber-400 text-[15px] font-semibold">Fallback Strategy</text>
      <text x="494" y="306" className="fill-muted-foreground text-[13px]">• If RAG disabled then all active policies</text>
      <text x="494" y="328" className="fill-muted-foreground text-[13px]">• If embedding/search fails then all active</text>
      <text x="494" y="350" className="fill-muted-foreground text-[13px]">• Evaluation remains fully available</text>
      <text x="494" y="372" className="fill-muted-foreground text-[13px]">• Reliability prioritized over optimization</text>

      <Arrow x1={700} y1={190} x2={700} y2={250} animated variant="storage" />
      <Arrow x1={260} y1={190} x2={260} y2={250} animated variant="control" />

      <rect x="320" y="455" width="260" height="40" rx="10" className="fill-primary/10 stroke-primary/30" />
      <text x="348" y="480" className="fill-primary text-[13px] font-semibold">Final Policy Set → GPT-4o Evaluation</text>
      <Arrow x1={450} y1={440} x2={450} y2={455} animated />
    </svg>
  );
}

function Node({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  highlight,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  highlight?: "storage" | "control";
}) {
  const borderClass =
    highlight === "storage"
      ? "fill-card stroke-violet-500/60"
      : highlight === "control"
        ? "fill-card stroke-amber-500/60"
        : "fill-card stroke-border";
  const titleClass =
    highlight === "storage"
      ? "fill-violet-400 text-[14px] font-semibold"
      : highlight === "control"
        ? "fill-amber-400 text-[14px] font-semibold"
        : "fill-foreground text-[14px] font-semibold";
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="12" className={borderClass} />
      <text x={x + 16} y={y + 28} className={titleClass}>
        {title}
      </text>
      <text x={x + 16} y={y + 49} className="fill-muted-foreground text-[12px]">
        {subtitle}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  animated = false,
  variant = "data",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  animated?: boolean;
  variant?: "data" | "control" | "storage";
}) {
  const strokeClass =
    variant === "control" ? "stroke-amber-500" : variant === "storage" ? "stroke-violet-500" : "stroke-primary";
  const markerId =
    variant === "control" ? "url(#arrow-control)" : variant === "storage" ? "url(#arrow-storage)" : "url(#arrow)";
  return <line x1={x1} y1={y1} x2={x2} y2={y2} className={`${strokeClass} ${animated ? "rag-flow" : ""}`} markerEnd={markerId} />;
}

function Lane({ y, title }: { y: number; title: string }) {
  return (
    <g>
      <rect x="40" y={y - 30} width="820" height="70" rx="10" className="fill-card/70 stroke-border" />
      <text x="60" y={y} className="fill-foreground text-[13px] font-semibold">
        {title}
      </text>
    </g>
  );
}

function Milestone({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="10" className="fill-primary/20 stroke-primary animate-rag-glow" />
      <circle cx={x} cy={y} r="4" className="fill-primary animate-rag-glow" />
      <rect x={x - 70} y={y + 14} width="140" height="32" rx="8" className="fill-card stroke-border" />
      <text x={x} y={y + 34} textAnchor="middle" className="fill-muted-foreground text-[11px]">
        {label}
      </text>
    </g>
  );
}

function Connector({
  x1,
  y1,
  x2,
  y2,
  animated = false,
  variant = "data",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  animated?: boolean;
  variant?: "data" | "control" | "storage";
}) {
  const strokeClass =
    variant === "control" ? "stroke-amber-500" : variant === "storage" ? "stroke-violet-500" : "stroke-primary";
  const fillClass =
    variant === "control" ? "fill-amber-500" : variant === "storage" ? "fill-violet-500" : "fill-primary";
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className={`${strokeClass} ${animated ? "rag-flow-soft" : ""}`} strokeDasharray="5 4" />
      <polygon points={`${x2 - 8},${y2 - 4} ${x2},${y2} ${x2 - 8},${y2 + 4}`} className={fillClass} />
    </g>
  );
}
