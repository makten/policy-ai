"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchEvaluations, fetchPolicies, fetchPolicyDocuments, resetApplication } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/status-dot";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { FileText, ShieldCheck, CheckCircle, Layers, Trash2, AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const policiesQuery = useQuery({
    queryKey: ["policies"],
    queryFn: () => fetchPolicies(),
  });
  const documentsQuery = useQuery({
    queryKey: ["policyDocuments"],
    queryFn: fetchPolicyDocuments,
  });
  const evaluationsQuery = useQuery({
    queryKey: ["evaluations", 1],
    queryFn: () => fetchEvaluations(1, 5),
  });

  const resetMutation = useMutation({
    mutationFn: resetApplication,
    onSuccess: () => {
      queryClient.invalidateQueries();
      setShowResetConfirm(false);
    },
  });

  const isLoading =
    policiesQuery.isLoading || documentsQuery.isLoading || evaluationsQuery.isLoading;

  if (isLoading) return <LoadingSpinner label="Loading dashboard..." />;

  const policies = policiesQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const evaluations = evaluationsQuery.data;

  const stats = [
    {
      label: "Policy Documents",
      value: documents.length,
      icon: FileText,
      color: "text-primary",
    },
    {
      label: "Active Policies",
      value: policies.filter((p) => p.isActive).length,
      icon: ShieldCheck,
      color: "text-success",
    },
    {
      label: "Total Evaluations",
      value: evaluations?.total ?? 0,
      icon: CheckCircle,
      color: "text-warning",
    },
    {
      label: "Categories",
      value: [...new Set(policies.map((p) => p.category))].length,
      icon: Layers,
      color: "text-primary",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of your policy validation engine"
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Evaluations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Evaluations</CardTitle>
        </CardHeader>
        <CardContent>
          {evaluations && evaluations.data.length > 0 ? (
            <div className="divide-y divide-border">
              {evaluations.data.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/evaluations/${ev.id}`}
                  className="flex items-center justify-between py-3 hover:bg-secondary/50 px-2 -mx-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={ev.verdict} />
                    <div>
                      <p className="text-sm font-medium">{ev.originalFileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ev.evaluatedAt).toLocaleString()} &middot;{" "}
                        {ev.durationMs}ms
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="success">{ev.passedCount} passed</Badge>
                    {ev.failedCount > 0 && (
                      <Badge variant="destructive">{ev.failedCount} failed</Badge>
                    )}
                    {ev.warningCount > 0 && (
                      <Badge variant="warning">{ev.warningCount} warnings</Badge>
                    )}
                    {ev.notEvaluatedCount > 0 && (
                      <Badge variant="secondary">{ev.notEvaluatedCount} not evaluated</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              No evaluations yet. Upload a mortgage application to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Policy Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Policy Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{doc.entity || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.fileName} &middot; v{doc.version}
                    </p>
                  </div>
                  <Badge>{doc.policyCount} policies</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              No policy documents imported yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reset Application */}
      <Card className="border-red-200 bg-red-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-red-700">Danger Zone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!showResetConfirm ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-800">Reset Application</p>
                <p className="text-xs text-red-600/70 mt-0.5">
                  Delete all policies, documents, evaluations, and start fresh.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => setShowResetConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Reset
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-300 bg-red-100/50 p-4">
                <p className="text-sm font-semibold text-red-800">
                  Are you sure? This action is irreversible.
                </p>
                <p className="text-xs text-red-700 mt-1">
                  This will permanently delete <strong>all policies</strong>,{" "}
                  <strong>all documents</strong>, <strong>all evaluations</strong>,
                  and <strong>all version history</strong>.
                </p>
              </div>

              {resetMutation.isSuccess && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3">
                  <p className="text-sm font-medium text-emerald-800">
                    Application reset complete!
                  </p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Deleted {resetMutation.data.policiesDeleted} policies,{" "}
                    {resetMutation.data.documentsDeleted} documents,{" "}
                    {resetMutation.data.evaluationsDeleted} evaluations.
                  </p>
                </div>
              )}

              {resetMutation.isError && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="text-sm text-red-700">
                    Reset failed: {(resetMutation.error as Error).message}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2"
                  disabled={resetMutation.isPending}
                  onClick={() => resetMutation.mutate()}
                >
                  {resetMutation.isPending ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-3.5 w-3.5" />
                      Yes, delete everything
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowResetConfirm(false);
                    resetMutation.reset();
                  }}
                  disabled={resetMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
