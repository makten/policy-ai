"use client";

import { useState, useMemo, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Users,
  Home,
  Banknote,
  Calculator,
  TrendingUp,
  ShieldCheck,
  ChevronDown,
  Calendar,
  Briefcase,
  Euro,
  MapPin,
  Thermometer,
  Percent,
  Building2,
  Landmark,
  AlertCircle,
  User,
  Wallet,
  Hash,
  BadgeCheck,
  CircleDot,
  Gem,
} from "lucide-react";

// ────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────

interface ApplicationPreviewProps {
  json: string;
}

// ────────────────────────────────────────────────────────────
//  Formatting helpers
// ────────────────────────────────────────────────────────────

function fmt(value: number | undefined | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtDetailed(value: number | undefined | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtDate(value: string | undefined | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fmtPct(value: number | undefined | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function fmtPctDirect(value: number | undefined | null): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

function fmtBool(value: boolean | undefined | null): string {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

const COUNTRIES: Record<string, string> = {
  "528": "🇳🇱 Netherlands",
  "056": "🇧🇪 Belgium",
  "276": "🇩🇪 Germany",
  "826": "🇬🇧 United Kingdom",
  "840": "🇺🇸 United States",
  "250": "🇫🇷 France",
};
const fmtCountry = (c: string | undefined | null) =>
  !c ? "—" : COUNTRIES[c] ?? `Country ${c}`;

const EMPLOYMENT: Record<string, string> = {
  FixedEmployment: "Fixed Employment",
  TemporaryEmployment: "Temporary Employment",
  SelfEmployed: "Self-Employed",
  Freelance: "Freelance",
  FlexWork: "Flex Work",
  Retired: "Retired",
};
const fmtEmployment = (t: string | undefined | null) =>
  !t ? "—" : EMPLOYMENT[t] ?? t;

const MARITAL: Record<string, string> = {
  Single: "Single",
  Married: "Married",
  RegisteredPartner: "Registered Partner",
  LivingTogether: "Living Together",
  Divorced: "Divorced",
  Widowed: "Widowed",
};
const fmtMarital = (s: string | undefined | null) =>
  !s ? "—" : MARITAL[s] ?? s;

const PROP_TYPE: Record<string, string> = {
  TerracedHouse: "Terraced House",
  SemiDetachedHouse: "Semi-Detached House",
  DetachedHouse: "Detached House",
  DetachedTownhouse: "Detached Townhouse",
  Apartment: "Apartment",
  ResidentialShopPremises: "Residential / Shop",
  Houseboat: "Houseboat",
  Villa: "Villa",
};
const fmtPropType = (t: string | undefined | null) =>
  !t ? "—" : PROP_TYPE[t] ?? t;

const PROP_STATUS: Record<string, string> = {
  ToBePurchased: "To Be Purchased",
  InPossession: "In Possession",
  UnderConstruction: "Under Construction",
};
const fmtPropStatus = (s: string | undefined | null) =>
  !s ? "—" : PROP_STATUS[s] ?? s;

const fmtReType = (t: string | undefined | null) =>
  !t ? "—" : t.replace(/([A-Z])/g, " $1").trim();

const REPAYMENT: Record<string, string> = {
  Linear: "Linear",
  Annuity: "Annuity",
  InterestOnly: "Interest Only",
  Life: "Life Insurance",
  Savings: "Savings",
};
const fmtRepay = (m: string | undefined | null) =>
  !m ? "—" : REPAYMENT[m] ?? m;

function calcAge(dob: string | undefined | null): string {
  if (!dob) return "—";
  try {
    const b = new Date(dob),
      t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (
      t.getMonth() < b.getMonth() ||
      (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())
    )
      a--;
    return `${a}`;
  } catch {
    return "—";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function g(obj: any, ...path: string[]): any {
  let c = obj;
  for (const k of path) {
    if (c == null) return undefined;
    c = c[k];
  }
  return c;
}

// ────────────────────────────────────────────────────────────
//  Premium UI primitives
// ────────────────────────────────────────────────────────────

/* ── Collapsible Section ── */

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?:
    | "default"
    | "success"
    | "destructive"
    | "warning"
    | "secondary"
    | "outline";
  defaultOpen?: boolean;
  accentColor?: string;
  children: React.ReactNode;
  delay?: number;
}

function Section({
  title,
  icon,
  badge,
  badgeVariant = "secondary",
  defaultOpen = true,
  accentColor,
  children,
  delay = 0,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`group/section rounded-2xl border border-border/60 bg-card
        shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] overflow-hidden
        transition-all duration-300 hover:shadow-md hover:border-border
        ${accentColor ? accentColor : ""} animate-fade-in-up`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 transition-colors
          hover:bg-gradient-to-r hover:from-secondary/50 hover:to-transparent"
      >
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl
            bg-gradient-to-br from-primary/15 to-primary/5 text-primary
            shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-transform duration-200
            group-hover/section:scale-105"
          >
            {icon}
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {title}
          </span>
          {badge && (
            <Badge
              variant={badgeVariant}
              className="text-[10px] font-mono ml-1"
            >
              {badge}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-300
            ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-out
        ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-border/40 px-6 pb-6 pt-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Field row with label + value ── */

function Field({
  label,
  value,
  icon,
  mono = false,
  full = false,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={`group/field flex items-start gap-3 py-2.5 px-1 rounded-lg
      transition-colors hover:bg-secondary/30 ${full ? "col-span-2" : ""}`}
    >
      {icon && (
        <div className="mt-0.5 text-muted-foreground/70 shrink-0">{icon}</div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5 leading-tight">
          {label}
        </p>
        <p
          className={`text-sm font-medium text-foreground leading-snug
          ${mono ? "font-mono tabular-nums" : ""}
          ${value === "—" || value === undefined || value === null ? "text-muted-foreground/40" : ""}`}
        >
          {value ?? "—"}
        </p>
      </div>
    </div>
  );
}

function FieldGrid({
  children,
  cols = 2,
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={`grid grid-cols-1 ${cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"} gap-x-6`}
    >
      {children}
    </div>
  );
}

/* ── Divider with label ── */

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mt-6 mb-4 first:mt-0">
      <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50 select-none">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-l from-border to-transparent" />
    </div>
  );
}

/* ── Stat Card (hero strip) ── */

type StatColor = "blue" | "violet" | "emerald" | "amber" | "red" | "slate";

const statColors: Record<
  StatColor,
  { bg: string; text: string; ring: string; glow: string }
> = {
  blue: {
    bg: "from-blue-500/12 to-blue-600/5",
    text: "text-blue-600",
    ring: "ring-blue-500/20",
    glow: "shadow-blue-500/10",
  },
  violet: {
    bg: "from-violet-500/12 to-violet-600/5",
    text: "text-violet-600",
    ring: "ring-violet-500/20",
    glow: "shadow-violet-500/10",
  },
  emerald: {
    bg: "from-emerald-500/12 to-emerald-600/5",
    text: "text-emerald-600",
    ring: "ring-emerald-500/20",
    glow: "shadow-emerald-500/10",
  },
  amber: {
    bg: "from-amber-500/12 to-amber-600/5",
    text: "text-amber-600",
    ring: "ring-amber-500/20",
    glow: "shadow-amber-500/10",
  },
  red: {
    bg: "from-red-500/12 to-red-600/5",
    text: "text-red-600",
    ring: "ring-red-500/20",
    glow: "shadow-red-500/10",
  },
  slate: {
    bg: "from-slate-500/12 to-slate-600/5",
    text: "text-slate-600",
    ring: "ring-slate-500/20",
    glow: "shadow-slate-500/10",
  },
};

function StatCard({
  label,
  value,
  sub,
  icon,
  color = "blue",
  delay = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color?: StatColor;
  delay?: number;
}) {
  const c = statColors[color];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.bg}
        ring-1 ${c.ring} p-4 text-center shadow-sm ${c.glow}
        animate-count-up hover:shadow-md transition-shadow duration-300`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* subtle dot-grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />
      <div
        className={`flex items-center justify-center gap-1.5 mb-1.5 ${c.text}`}
      >
        {icon}
      </div>
      <p className={`text-xl font-black tabular-nums tracking-tight ${c.text}`}>
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 mt-1">
        {label}
      </p>
      {sub && (
        <p className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">
          {sub}
        </p>
      )}
    </div>
  );
}

/* ── LTV Gauge ── */

function LtvGauge({ ltv }: { ltv: number | undefined | null }) {
  if (ltv == null) return null;
  const pct = Math.min(ltv * 100, 120);
  const isOver = pct > 100;
  const fillColor = isOver
    ? "bg-red-500"
    : pct > 90
      ? "bg-amber-500"
      : "bg-emerald-500";
  const labelColor = isOver
    ? "text-red-600"
    : pct > 90
      ? "text-amber-600"
      : "text-emerald-600";

  return (
    <div className="mt-2">
      <div className="flex items-end justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
          Loan-to-Value Ratio
        </span>
        <span className={`text-lg font-black tabular-nums ${labelColor}`}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${fillColor} transition-all duration-1000 ease-out`}
          style={{
            width: `${Math.min(pct / 1.2, 100)}%`,
            animation: "progress-fill 1.2s ease-out",
          }}
        />
        {/* 100% threshold marker */}
        <div
          className="absolute top-0 bottom-0 left-[83.33%] w-px bg-foreground/20"
          title="100% LTV"
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-muted-foreground/40 font-mono">
          0%
        </span>
        <span className="text-[9px] text-muted-foreground/40 font-mono">
          100%
        </span>
        <span className="text-[9px] text-muted-foreground/40 font-mono">
          120%
        </span>
      </div>
    </div>
  );
}

/* ── Cost Bar (visual cost breakdown) ── */

function CostBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  if (!value || value === 0) return null;
  const pct = Math.min((value / maxValue) * 100, 100);
  return (
    <div className="group/cost flex items-center gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-40 shrink-0 text-right">
        {label}
      </span>
      <div className="flex-1 h-5 rounded bg-secondary/60 overflow-hidden relative">
        <div
          className="absolute inset-y-0 left-0 rounded bg-primary/20 transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, animation: "progress-fill 0.8s ease-out" }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[11px] font-mono font-medium text-foreground/80">
          {fmtDetailed(value)}
        </span>
      </div>
    </div>
  );
}

/* ── Status pill for boolean checks ── */

function StatusPill({
  value,
  trueLabel = "Yes",
  falseLabel = "No",
}: {
  value: boolean | undefined | null;
  trueLabel?: string;
  falseLabel?: string;
}) {
  if (value == null)
    return <span className="text-sm text-muted-foreground/40">—</span>;
  return value ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/10 rounded-full px-2.5 py-0.5">
      <BadgeCheck className="h-3 w-3" /> {trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500 bg-red-500/10 rounded-full px-2.5 py-0.5">
      <CircleDot className="h-3 w-3" /> {falseLabel}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
//  Main Component
// ────────────────────────────────────────────────────────────

export function ApplicationPreview({ json }: ApplicationPreviewProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = useMemo(() => {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [json]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center animate-fade-in-up">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
        <p className="text-sm font-semibold text-destructive">
          Unable to parse the application JSON
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          Please ensure the file contains valid JSON
        </p>
      </div>
    );
  }

  const applicants =
    g(data, "applicantCollection", "applicants") ?? [];
  const realEstates =
    g(data, "realEstateCollection", "realEstates") ?? [];
  const agreements =
    g(data, "agreementCollection", "agreements") ?? [];
  const financingCosts = data.financingCosts ?? {};
  const calculations = data.calculationsInformation ?? {};
  const bkr = data.bkrInformation ?? {};
  const morality = data.moralityInformation ?? {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loans: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ag of agreements as any[]) {
    loans.push(...(g(ag, "loanCollection", "loan") ?? []));
  }

  const primaryRe =
    realEstates.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.isHomeOfApplication || r.mainResidence,
    ) ?? realEstates[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const otherRes = realEstates.filter((r: any) => r !== primaryRe);

  const riskRating = data.riskRating;
  const riskColor =
    riskRating === "Groen"
      ? "success"
      : riskRating === "Oranje"
        ? "warning"
        : riskRating === "Rood"
          ? "destructive"
          : "secondary";

  const totalCosts = Object.entries(financingCosts)
    .filter(([key]) => key !== "totalPurchaseCosts")
    .reduce(
      (sum, [, val]) => sum + (typeof val === "number" ? val : 0),
      0,
    );

  const maxCost = Math.max(
    ...Object.entries(financingCosts)
      .filter(([key]) => key !== "totalPurchaseCosts")
      .map(([, val]) => (typeof val === "number" ? val : 0)),
    1,
  );

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* ═══════════════════════════════════════════════════════
           HERO HEADER
         ═══════════════════════════════════════════════════════ */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border/40
        bg-gradient-to-br from-card via-card to-primary/[0.03]
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_25px_-5px_rgba(0,0,0,0.04)]
        animate-fade-in-up"
      >
        {/* Top accent gradient line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl
                bg-gradient-to-br from-primary/20 to-primary/5 text-primary
                shadow-[0_2px_8px_-2px_rgba(37,99,235,0.3)] animate-glow-pulse"
              >
                <Gem className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  {data.productLineReference ?? "Mortgage Application"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.assessmentType ?? "Assessment"} ·{" "}
                  {fmtDate(data.originalApplicationDate)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {data.hasNHG != null && (
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full
                  ${
                    data.hasNHG
                      ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20"
                      : "bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/20"
                  }`}
                >
                  <ShieldCheck className="h-3 w-3" />
                  NHG {data.hasNHG ? "Active" : "None"}
                </span>
              )}
              {riskRating && (
                <Badge
                  variant={
                    riskColor as
                      | "success"
                      | "warning"
                      | "destructive"
                      | "secondary"
                  }
                  className="text-[11px] font-bold px-3 py-1"
                >
                  {riskRating}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Hero stat cards */}
        <div className="px-6 pb-6 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Purchase Price"
              value={fmt(data.actualPurchasePrice)}
              icon={<Euro className="h-4 w-4" />}
              color="blue"
              delay={50}
            />
            <StatCard
              label="Total Loan"
              value={fmt(
                loans.reduce(
                  (s: number, l: { loanAmount?: number }) =>
                    s + (l.loanAmount ?? 0),
                  0,
                ),
              )}
              sub={loans.length > 1 ? `across ${loans.length} loans` : undefined}
              icon={<Banknote className="h-4 w-4" />}
              color="violet"
              delay={100}
            />
            <StatCard
              label="Market Value"
              value={fmt(primaryRe?.marketValue)}
              icon={<Home className="h-4 w-4" />}
              color="emerald"
              delay={150}
            />
            <StatCard
              label="LTV"
              value={fmtPct(calculations.loanToValuePercentage)}
              icon={<Percent className="h-4 w-4" />}
              color={
                calculations.loanToValuePercentage > 1
                  ? "red"
                  : calculations.loanToValuePercentage > 0.9
                    ? "amber"
                    : "emerald"
              }
              delay={200}
            />
          </div>

          <LtvGauge ltv={calculations.loanToValuePercentage} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
           1. GENERAL INFORMATION
         ═══════════════════════════════════════════════════════ */}
      <Section
        title="General Information"
        icon={<FileText className="h-4 w-4" />}
        badge={data.assessmentType}
        delay={100}
      >
        <FieldGrid>
          <Field
            label="Product Line"
            value={data.productLineReference}
            icon={<Landmark className="h-3.5 w-3.5" />}
          />
          <Field label="Assessment Type" value={data.assessmentType} />
          <Field label="Arrangement" value={data.arrangementType} />
          <Field
            label="Spending Target"
            value={data.spendingTargetType
              ?.replace(/([A-Z])/g, " $1")
              .trim()}
          />
          <Field
            label="Risk Rating"
            value={
              riskRating ? (
                <Badge
                  variant={
                    riskColor as
                      | "success"
                      | "warning"
                      | "destructive"
                      | "secondary"
                  }
                >
                  {riskRating}
                </Badge>
              ) : (
                "—"
              )
            }
          />
          <Field label="NHG" value={<StatusPill value={data.hasNHG} />} />
          <Field
            label="Preliminary Note"
            value={fmtBool(data.hasPreliminaryNote)}
          />
          <Field
            label="Purchase Price"
            value={fmt(data.actualPurchasePrice)}
            icon={<Euro className="h-3.5 w-3.5" />}
            mono
          />
          <Field
            label="Application Date"
            value={fmtDate(data.originalApplicationDate)}
            icon={<Calendar className="h-3.5 w-3.5" />}
          />
          <Field label="Reference Date" value={fmtDate(data.referenceDate)} />
          <Field
            label="Expected Closing"
            value={fmtDate(
              g(data, "deedPassingInformation", "expectedClosingDate"),
            )}
          />
          <Field label="Channel" value={data.channel} />
        </FieldGrid>
      </Section>

      {/* ═══════════════════════════════════════════════════════
           2. APPLICANTS
         ═══════════════════════════════════════════════════════ */}
      {applicants.length > 0 && (
        <Section
          title={applicants.length === 1 ? "Applicant" : "Applicants"}
          icon={<Users className="h-4 w-4" />}
          badge={`${applicants.length}`}
          delay={150}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {applicants.map((ap: any, idx: number) => (
            <Fragment key={idx}>
              {idx > 0 && (
                <div className="my-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              )}

              {/* Applicant header card */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl
                  ${idx === 0 ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-600"}
                  text-sm font-bold`}
                >
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Applicant {idx + 1}
                    {ap.applicantType && (
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        — {ap.applicantType}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {ap.gender ?? ""}
                    {ap.gender && ap.dateOfBirth ? " · " : ""}
                    {calcAge(ap.dateOfBirth) !== "—"
                      ? `${calcAge(ap.dateOfBirth)} years old`
                      : ""}
                  </p>
                </div>
                {ap.totalYearlyIncome != null && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-muted-foreground/60 font-medium">
                      Annual Income
                    </p>
                    <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                      {fmt(ap.totalYearlyIncome)}
                    </p>
                  </div>
                )}
              </div>

              {/* Personal */}
              <Divider label="Personal Information" />
              <FieldGrid>
                <Field label="Gender" value={ap.gender} />
                <Field
                  label="Date of Birth"
                  value={fmtDate(ap.dateOfBirth)}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                />
                <Field
                  label="Age"
                  value={
                    calcAge(ap.dateOfBirth) !== "—"
                      ? `${calcAge(ap.dateOfBirth)} years`
                      : "—"
                  }
                />
                <Field
                  label="Nationality"
                  value={fmtCountry(ap.countryOfNationality)}
                  icon={<MapPin className="h-3.5 w-3.5" />}
                />
                <Field
                  label="Country of Birth"
                  value={fmtCountry(ap.countryOfBirth)}
                />
                <Field
                  label="Marital Status"
                  value={fmtMarital(ap.maritalStatus)}
                />
                <Field
                  label="Previously Divorced"
                  value={fmtBool(ap.hasBeenDivorced)}
                />
                <Field
                  label="Foreign Taxpayer"
                  value={fmtBool(ap.foreignTaxpayer)}
                />
                <Field
                  label="First Mortgage Ever"
                  value={<StatusPill value={ap.isFirstMortgageEver} />}
                />
                <Field
                  label="Employment After Retirement"
                  value={fmtBool(
                    ap.isCustomerWithEmploymentAfterRetirement,
                  )}
                />
              </FieldGrid>

              {/* Income */}
              <Divider label="Income" />
              <FieldGrid>
                <Field
                  label="Total Yearly Income"
                  value={fmt(ap.totalYearlyIncome)}
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  mono
                />
                <Field
                  label="Relevant Income (excl. other)"
                  value={fmt(ap.relevantIncomeExcludingOtherIncome)}
                  mono
                />
                <Field
                  label="Foreign BKR Required"
                  value={
                    <StatusPill
                      value={ap.isForeignBKRCheckRequired}
                      trueLabel="Required"
                      falseLabel="Not Required"
                    />
                  }
                />
              </FieldGrid>

              {/* Individual incomes */}
              {g(ap, "incomeCollection", "incomes")?.map(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (income: any, iIdx: number) => (
                  <div
                    key={iIdx}
                    className="mt-4 rounded-xl border border-border/40
                      bg-gradient-to-br from-secondary/30 to-transparent p-4
                      hover:border-border/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                        <Briefcase className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-xs font-bold text-foreground">
                        {income.incomeType ?? "Income"}{" "}
                        <span className="font-normal text-muted-foreground">
                          — {fmtEmployment(income.employmentType)}
                        </span>
                      </span>
                      {income.annualIncome != null && (
                        <span className="ml-auto text-sm font-bold font-mono tabular-nums text-foreground">
                          {fmt(income.annualIncome)}
                          <span className="text-[10px] font-normal text-muted-foreground/60">
                            /yr
                          </span>
                        </span>
                      )}
                    </div>

                    <FieldGrid cols={3}>
                      <Field
                        label="Annual Income"
                        value={fmt(income.annualIncome)}
                        mono
                      />
                      <Field
                        label="Start Date"
                        value={fmtDate(income.startDate)}
                      />
                      <Field
                        label="Country"
                        value={fmtCountry(income.country)}
                      />
                      <Field
                        label="Major Shareholder"
                        value={fmtBool(income.majorShareholder)}
                      />
                      <Field
                        label="Probationary"
                        value={fmtBool(income.probationaryPeriod)}
                      />
                      <Field
                        label="Flex Work"
                        value={fmtBool(income.isFlexWork)}
                      />
                      <Field
                        label="Wage Garnishment"
                        value={fmtBool(income.hasWageGarnishment)}
                      />
                      <Field
                        label="Cash Payment"
                        value={fmtBool(income.cashPayment)}
                      />
                    </FieldGrid>

                    {/* Wage additions */}
                    {income.wageAdditions && (
                      <div className="mt-3 pt-3 border-t border-border/30">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 mb-2">
                          Wage Additions
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-0.5">
                          {Object.entries(income.wageAdditions)
                            .filter(([, v]) => v != null && v !== 0)
                            .map(([key, val]) => (
                              <div
                                key={key}
                                className="flex justify-between py-1 text-xs"
                              >
                                <span className="text-muted-foreground capitalize">
                                  {key
                                    .replace(/([A-Z])/g, " $1")
                                    .trim()}
                                </span>
                                <span className="font-mono font-semibold tabular-nums">
                                  {fmt(val as number)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              )}
            </Fragment>
          ))}
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════
           3. REAL ESTATE
         ═══════════════════════════════════════════════════════ */}
      {realEstates.length > 0 && (
        <Section
          title="Real Estate"
          icon={<Home className="h-4 w-4" />}
          badge={
            realEstates.length > 1
              ? `${realEstates.length} properties`
              : undefined
          }
          delay={200}
        >
          {primaryRe && (
            <PropertyCard re={primaryRe} label="Primary Property" isPrimary />
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {otherRes.map((re: any, idx: number) => (
            <div key={idx} className="mt-5">
              <PropertyCard
                re={re}
                label={`Additional Property ${idx + 1}`}
              />
            </div>
          ))}
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════
           4. LOAN DETAILS
         ═══════════════════════════════════════════════════════ */}
      {loans.length > 0 && (
        <Section
          title="Loan Details"
          icon={<Banknote className="h-4 w-4" />}
          badge={`${loans.length} loan(s)`}
          delay={250}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {loans.map((loan: any, idx: number) => (
            <Fragment key={idx}>
              {idx > 0 && (
                <div className="my-6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              )}

              {/* Loan header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 text-sm font-bold">
                  <Hash className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {loan.productName ??
                      loan.productType ??
                      `Loan ${idx + 1}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtRepay(loan.repaymentMethod)} ·{" "}
                    {loan.loanTermInMonths
                      ? `${(loan.loanTermInMonths / 12).toFixed(0)} years`
                      : ""}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground/60 font-medium">
                    Amount
                  </p>
                  <p className="text-base font-black font-mono tabular-nums text-foreground">
                    {fmt(loan.loanAmount)}
                  </p>
                </div>
              </div>

              {/* Loan key metrics row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-xl bg-secondary/40 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    Interest Rate
                  </p>
                  <p className="text-lg font-black font-mono tabular-nums text-foreground mt-1">
                    {fmtPctDirect(
                      g(
                        loan,
                        "interestOffer",
                        "interestComposition",
                        "finalRate",
                      ),
                    )}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    Duration
                  </p>
                  <p className="text-lg font-black font-mono tabular-nums text-foreground mt-1">
                    {loan.loanTermInMonths
                      ? `${(loan.loanTermInMonths / 12).toFixed(0)}yr`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-secondary/40 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                    Fix Period
                  </p>
                  <p className="text-lg font-black font-mono tabular-nums text-foreground mt-1">
                    {loan.interestPeriodInMonths
                      ? `${(loan.interestPeriodInMonths / 12).toFixed(0)}yr`
                      : "—"}
                  </p>
                </div>
              </div>

              <FieldGrid>
                <Field
                  label="Product"
                  value={loan.productName}
                  icon={<Landmark className="h-3.5 w-3.5" />}
                />
                <Field label="Product Type" value={loan.productType} />
                <Field
                  label="Loan Amount"
                  value={fmt(loan.loanAmount)}
                  icon={<Euro className="h-3.5 w-3.5" />}
                  mono
                />
                <Field
                  label="Remaining Amount"
                  value={fmt(loan.remainingLoanAmount)}
                  mono
                />
                <Field
                  label="Repayment Method"
                  value={fmtRepay(loan.repaymentMethod)}
                />
                <Field
                  label="Interest Behaviour"
                  value={loan.interestProductBehaviour}
                />
                <Field
                  label="NHG"
                  value={<StatusPill value={loan.hasNHG} />}
                />
                <Field label="Fiscal Regime" value={loan.fiscalRegime} />
                <Field label="Mutation Type" value={loan.mutationType} />
                <Field
                  label="Start Date"
                  value={fmtDate(loan.startDate)}
                  icon={<Calendar className="h-3.5 w-3.5" />}
                />
                <Field label="End Date" value={fmtDate(loan.endDate)} />
                <Field
                  label="Non-Deductible"
                  value={fmt(loan.nonTaxDeductableLoanAmount)}
                  mono
                />
              </FieldGrid>
            </Fragment>
          ))}
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════
           5. FINANCING COSTS
         ═══════════════════════════════════════════════════════ */}
      {Object.keys(financingCosts).length > 0 && (
        <Section
          title="Financing Costs"
          icon={<Calculator className="h-4 w-4" />}
          badge={fmt(totalCosts)}
          defaultOpen={false}
          delay={300}
        >
          <div className="max-w-xl">
            {/* Visual cost bars */}
            <div className="space-y-0.5">
              <CostBar
                label="Advisory"
                value={financingCosts.advisoryCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Conveyancing"
                value={financingCosts.conveyancingCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Mortgage Deed"
                value={financingCosts.mortgageDeedCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Broker"
                value={financingCosts.brokerCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Valuation"
                value={financingCosts.valuationCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Property Transfer Tax"
                value={financingCosts.propertyTransferTax ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Engineering Report"
                value={financingCosts.engineeringReportCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Notary"
                value={financingCosts.notaryCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Closing"
                value={financingCosts.closingCosts ?? 0}
                maxValue={maxCost}
              />
              <CostBar
                label="Additional"
                value={financingCosts.additionalCosts ?? 0}
                maxValue={maxCost}
              />
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t-2 border-border">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground">
                  Total Financing Costs
                </span>
                <span className="text-lg font-black font-mono tabular-nums text-foreground">
                  {fmtDetailed(totalCosts)}
                </span>
              </div>
              {financingCosts.totalPurchaseCosts != null && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    Total Purchase Costs
                  </span>
                  <span className="text-sm font-mono font-medium text-muted-foreground">
                    {fmt(financingCosts.totalPurchaseCosts)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════
           6. CALCULATIONS & LIMITS
         ═══════════════════════════════════════════════════════ */}
      {Object.keys(calculations).length > 0 && (
        <Section
          title="Calculations & Limits"
          icon={<TrendingUp className="h-4 w-4" />}
          delay={350}
        >
          {/* Quick check strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <MiniCheck
              label="LTI 10yr"
              pass={calculations.ltiSufficient10Years}
            />
            <MiniCheck
              label="LTI Full"
              pass={calculations.ltiSufficientFullDuration}
            />
            <MiniCheck
              label="Interest-Only"
              pass={calculations.sumInterestOnlyAmountExceeded === false}
            />
            <MiniCheck
              label="Residual Debt"
              pass={calculations.hasResidualDebtFinancing === false}
            />
          </div>

          <FieldGrid>
            <Field
              label="LTV (Market Value)"
              value={fmtPct(calculations.ltvBasedOnMarketValue)}
              icon={<Percent className="h-3.5 w-3.5" />}
              mono
            />
            <Field
              label="Max Funding (Market)"
              value={fmt(
                calculations.maximumFundingBasedOnMarketValue,
              )}
              mono
            />
            <Field
              label="Allowed Expense"
              value={fmtDetailed(
                calculations.spaceAllowedExpenseComply,
              )}
              mono
            />
            <Field
              label="Total Financing Costs"
              value={fmt(calculations.totalFinancingCostsAmount)}
              mono
            />
            <Field
              label="Principal (New)"
              value={fmt(calculations.principalNew)}
              mono
            />
            <Field
              label="Max Bridging Amount"
              value={fmt(calculations.maximumBridgingAmount)}
              mono
            />
            <Field
              label="Energy Saving Budget"
              value={fmt(calculations.maximumEnergySavingBudget)}
              mono
            />
            <Field
              label="Total Interest-Only (New)"
              value={fmt(calculations.totalInterestOnlyNew)}
              mono
            />
            <Field
              label="Lowest Income 10yr"
              value={fmt(calculations.lowestIncomeWithin10Years)}
              mono
            />
            <Field
              label="Total Other Income"
              value={fmt(calculations.totalAmountOtherIncome)}
              mono
            />
          </FieldGrid>
        </Section>
      )}

      {/* ═══════════════════════════════════════════════════════
           7. BKR & MORALITY
         ═══════════════════════════════════════════════════════ */}
      {(Object.keys(bkr).length > 0 ||
        Object.keys(morality).length > 0) && (
        <Section
          title="BKR & Morality Checks"
          icon={<ShieldCheck className="h-4 w-4" />}
          delay={400}
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <CheckTile
              label="BKR Functional Message"
              status={
                bkr.bkrFunctionalMessage === false
                  ? "pass"
                  : bkr.bkrFunctionalMessage === true
                    ? "fail"
                    : "none"
              }
            />
            <CheckTile
              label="VIS Hit"
              status={
                morality.VISHit === false
                  ? "pass"
                  : morality.VISHit === true
                    ? "fail"
                    : "none"
              }
            />
            <CheckTile
              label="IVR Hit"
              status={
                morality.IVRHit === false
                  ? "pass"
                  : morality.IVRHit === true
                    ? "fail"
                    : "none"
              }
            />
          </div>

          <FieldGrid>
            {bkr.bkrCheckDate && (
              <Field
                label="BKR Check Date"
                value={fmtDate(bkr.bkrCheckDate)}
                icon={<Calendar className="h-3.5 w-3.5" />}
              />
            )}
            <Field
              label="BKR WW Non-Sequential"
              value={bkr.bkrNrWWNonSequentialCheck ?? "—"}
            />
            <Field
              label="BKR NN Non-Sequential"
              value={bkr.bkrNrNNNonSequentialCheck ?? "—"}
            />
          </FieldGrid>
        </Section>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  Mini pass/fail check for calculations strip
// ────────────────────────────────────────────────────────────

function MiniCheck({
  label,
  pass,
}: {
  label: string;
  pass: boolean | undefined | null;
}) {
  const isPassed = pass === true;
  const isUnknown = pass == null;
  return (
    <div
      className={`rounded-xl p-3 text-center transition-colors
      ${
        isUnknown
          ? "bg-secondary/40 ring-1 ring-border/40"
          : isPassed
            ? "bg-emerald-500/8 ring-1 ring-emerald-500/20"
            : "bg-red-500/8 ring-1 ring-red-500/20"
      }`}
    >
      <div
        className={`text-lg font-bold ${isUnknown ? "text-muted-foreground/40" : isPassed ? "text-emerald-600" : "text-red-500"}`}
      >
        {isUnknown ? "—" : isPassed ? "✓" : "✗"}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mt-0.5">
        {label}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  BKR / Morality Check Tile
// ────────────────────────────────────────────────────────────

function CheckTile({
  label,
  status,
}: {
  label: string;
  status: "pass" | "fail" | "none";
}) {
  const styles = {
    pass: "bg-emerald-500/8 ring-1 ring-emerald-500/20 text-emerald-600",
    fail: "bg-red-500/8 ring-1 ring-red-500/20 text-red-500",
    none: "bg-secondary/40 ring-1 ring-border/40 text-muted-foreground/40",
  };
  const icons = { pass: "✓ Clear", fail: "✗ Hit", none: "—" };

  return (
    <div className={`rounded-xl p-3.5 ${styles[status]} transition-colors`}>
      <p className="text-sm font-bold">{icons[status]}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mt-0.5">
        {label}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  Property Card (Real Estate)
// ────────────────────────────────────────────────────────────

function PropertyCard({
  re,
  label,
  isPrimary = false,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  re: any;
  label: string;
  isPrimary?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all
      ${
        isPrimary
          ? "border-primary/20 bg-gradient-to-br from-primary/[0.02] to-transparent shadow-sm"
          : "border-border/50 bg-gradient-to-br from-secondary/20 to-transparent"
      }`}
    >
      {/* Property header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/30">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl
          ${isPrimary ? "bg-primary/10 text-primary" : "bg-slate-500/10 text-slate-500"}`}
        >
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {label}
            </span>
            {isPrimary && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Primary
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmtReType(re.realEstateType)}
            {re.specificHouseType
              ? ` · ${fmtPropType(re.specificHouseType)}`
              : ""}
          </p>
        </div>

        {/* Key values */}
        <div className="flex items-center gap-2">
          {re.marketValue != null && (
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">
                Value
              </p>
              <p className="text-sm font-black font-mono tabular-nums text-foreground">
                {fmt(re.marketValue)}
              </p>
            </div>
          )}
          {re.propertyStatus && (
            <Badge variant="outline" className="text-[10px] shrink-0">
              {fmtPropStatus(re.propertyStatus)}
            </Badge>
          )}
        </div>
      </div>

      {/* Property detail grid */}
      <div className="px-5 py-4">
        <FieldGrid cols={3}>
          <Field
            label="Building Type"
            value={g(re, "buildingType", "type")}
          />
          <Field
            label="Purchase Price"
            value={fmt(g(re, "buildingType", "purchasePrice"))}
            icon={<Euro className="h-3.5 w-3.5" />}
            mono
          />
          <Field
            label="Valuation"
            value={fmt(g(re, "valuation", "value"))}
            mono
          />
          <Field
            label="Valuation Source"
            value={g(re, "valuation", "source")}
          />
          <Field
            label="Maintenance"
            value={g(re, "valuation", "maintenanceCondition")}
          />
          <Field
            label="Year Built"
            value={re.yearOfConstruction}
            icon={<Calendar className="h-3.5 w-3.5" />}
          />
          <Field
            label="Energy Label"
            value={
              g(re, "energyLabel", "energyLabelType") ? (
                <span className="inline-flex items-center gap-1.5">
                  <Thermometer className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-bold">
                    {g(re, "energyLabel", "energyLabelType")}
                  </span>
                </span>
              ) : (
                "—"
              )
            }
          />
          <Field
            label="Country"
            value={fmtCountry(re.country)}
            icon={<MapPin className="h-3.5 w-3.5" />}
          />
          <Field
            label="Main Residence"
            value={<StatusPill value={re.mainResidence} />}
          />
          <Field
            label="Owner Occupied"
            value={fmtBool(re.ownerOccupied)}
          />
          <Field
            label="To Be Financed"
            value={<StatusPill value={re.isToBeFinanced} />}
          />
          <Field
            label="Commercial %"
            value={
              re.commercialPercentage != null
                ? `${re.commercialPercentage}%`
                : "—"
            }
          />
          <Field
            label="Cooperative House"
            value={fmtBool(re.isCooperativeHouse)}
          />
          <Field
            label="Holiday Home"
            value={fmtBool(re.isHolidayHome)}
          />
          <Field
            label="Contaminated Soil"
            value={fmtBool(g(re, "valuation", "hasContaminatedSoil"))}
          />
        </FieldGrid>
      </div>
    </div>
  );
}
