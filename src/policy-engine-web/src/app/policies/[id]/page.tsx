"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchPolicy, updatePolicy, deletePolicy } from "@/lib/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ArrowLeft, Pencil, Trash2, Clock } from "lucide-react";
import { useState } from "react";

export default function PolicyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editDesc, setEditDesc] = useState("");
  const [changeReason, setChangeReason] = useState("");

  const { data: policy, isLoading } = useQuery({
    queryKey: ["policy", params.id],
    queryFn: () => fetchPolicy(params.id),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePolicy(params.id, {
        description: editDesc,
        changeReason,
        changedBy: "UI User",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["policy", params.id] });
      setEditing(false);
      setChangeReason("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePolicy(params.id),
    onSuccess: () => router.push("/policies"),
  });

  if (isLoading) return <LoadingSpinner label="Loading policy..." />;
  if (!policy) return <p className="text-sm text-muted-foreground">Policy not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => router.push("/policies")}>
        <ArrowLeft className="h-4 w-4" /> Back to Policies
      </Button>

      <PageHeader title={policy.title} description={`Code: ${policy.code}`}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditDesc(policy.description);
            setEditing(true);
          }}
        >
          <Pencil className="h-4 w-4" /> Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm("Delete this policy?")) deleteMutation.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </PageHeader>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2">
        <Badge>{policy.category}</Badge>
        <Badge variant="secondary">{policy.entity || "Unknown"}</Badge>
        {policy.section && <Badge variant="outline">{policy.section}</Badge>}
        {policy.sourcePage > 0 && (
          <Badge variant="outline">Page {policy.sourcePage}</Badge>
        )}
      </div>

      {/* Description */}
      <Card>
        <CardHeader>
          <CardTitle>Description</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-3">
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={5}
                className="w-full rounded-lg border border-border bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Reason for change..."
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {policy.description}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Version History */}
      <Card>
        <CardHeader>
          <CardTitle>Version History</CardTitle>
        </CardHeader>
        <CardContent>
          {policy.versions.length > 0 ? (
            <div className="space-y-3">
              {policy.versions
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((v) => (
                  <div
                    key={v.id}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">v{v.versionNumber}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString()}
                        </span>
                        {v.changedBy && (
                          <span className="text-xs text-muted-foreground">
                            by {v.changedBy}
                          </span>
                        )}
                      </div>
                      {v.changeReason && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {v.changeReason}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-foreground/70 line-clamp-2">
                        {v.description}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No version history.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
