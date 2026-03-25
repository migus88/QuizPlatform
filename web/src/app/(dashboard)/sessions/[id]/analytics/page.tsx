"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { SessionAnalyticsResponse, QuestionAnalytics } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FormattedText } from "@/components/formatted-text";
import { ArrowLeft, Trash2, Check, X, Download } from "lucide-react";

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function AnalyticsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<SessionAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      const data = await api.sessions.analytics(params.id);
      setAnalytics(data);
    } catch {
      toast.error("Failed to load analytics");
      router.push("/quizzes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = async () => {
    try {
      await api.sessions.clearAnalytics(params.id);
      toast.success("Analytics cleared");
      setShowClearDialog(false);
      loadAnalytics();
    } catch {
      toast.error("Failed to clear analytics");
    }
  };

  const handleExportCsv = () => {
    if (!analytics) return;
    const rows: string[] = [];
    rows.push(["Question", "Player", "Emoji", "Answer", "Correct", "Points"].map(escapeCsv).join(","));

    for (const q of analytics.questions) {
      const options = [...q.options].sort((a, b) => a.order - b.order);
      for (const answer of q.participantAnswers) {
        const selectedOption = options.find((o) => o.id === answer.selectedAnswerOptionId);
        rows.push([
          q.text,
          answer.nickname,
          answer.emoji,
          selectedOption?.text ?? "",
          answer.isCorrect ? "Yes" : "No",
          String(answer.awardedPoints),
        ].map(escapeCsv).join(","));
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${analytics.quizTitle.replace(/[^a-zA-Z0-9]/g, "_")}_analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading analytics...</div>;
  }

  if (!analytics) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/quizzes" className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Back to Quizzes
          </Link>
          <h1 className="text-2xl font-bold">{analytics.quizTitle}</h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge variant={analytics.status === "Finished" ? "secondary" : "default"}>
              {analytics.status}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {analytics.totalParticipants} participants
            </span>
            {analytics.startedAt && (
              <span className="text-sm text-muted-foreground">
                {new Date(analytics.startedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowClearDialog(true)}>
            <Trash2 className="w-4 h-4 mr-1" />
            Clear Data
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {analytics.questions.map((q) => (
          <QuestionCard
            key={q.questionId}
            question={q}
            expanded={expandedQuestion === q.questionId}
            onToggle={() => setExpandedQuestion(expandedQuestion === q.questionId ? null : q.questionId)}
          />
        ))}
      </div>

      {analytics.questions.length === 0 && (
        <p className="text-center text-muted-foreground py-12">No analytics data recorded yet.</p>
      )}

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Analytics</DialogTitle>
            <DialogDescription>
              This will delete all answer data and reset scores. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClear}>Clear All Data</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionCard({
  question,
  expanded,
  onToggle,
}: {
  question: QuestionAnalytics;
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalAnswers = question.participantAnswers.length;
  const correctAnswers = question.participantAnswers.filter((a) => a.isCorrect).length;
  const sortedOptions = [...question.options].sort((a, b) => a.order - b.order);

  return (
    <Card>
      <CardContent className="py-4">
        <button onClick={onToggle} className="w-full text-left">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-muted-foreground">Q{question.order}</span>
              <span className="font-medium"><FormattedText text={question.text} /></span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm text-muted-foreground">
                {correctAnswers}/{totalAnswers} correct
              </span>
              <span className="text-sm">{expanded ? "▲" : "▼"}</span>
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-4 space-y-4">
            {/* Answer distribution */}
            <div className="space-y-2">
              {sortedOptions.map((opt) => {
                const count = question.participantAnswers.filter(
                  (a) => a.selectedAnswerOptionId === opt.id
                ).length;
                const pct = totalAnswers > 0 ? (count / totalAnswers) * 100 : 0;
                return (
                  <div key={opt.id} className="flex items-center gap-3">
                    <div className="w-5">
                      {opt.isCorrect && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className={opt.isCorrect ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}>
                          <FormattedText text={opt.text} />
                        </span>
                        <span className="font-mono">{count} ({Math.round(pct)}%)</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${opt.isCorrect ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Participant answers table */}
            {question.participantAnswers.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Player</th>
                      <th className="text-left p-2 font-medium">Answer</th>
                      <th className="text-center p-2 font-medium">Result</th>
                      <th className="text-right p-2 font-medium">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {question.participantAnswers.map((answer) => {
                      const selectedOption = sortedOptions.find((o) => o.id === answer.selectedAnswerOptionId);
                      return (
                        <tr key={answer.participantId} className="border-t">
                          <td className="p-2">
                            <span className="mr-1">{answer.emoji}</span>
                            {answer.nickname}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {selectedOption?.text ?? "—"}
                          </td>
                          <td className="p-2 text-center">
                            {answer.isCorrect ? (
                              <Check className="w-4 h-4 text-emerald-500 inline" />
                            ) : (
                              <X className="w-4 h-4 text-red-500 inline" />
                            )}
                          </td>
                          <td className={`p-2 text-right font-mono ${answer.awardedPoints < 0 ? "text-red-500" : ""}`}>
                            {answer.awardedPoints < 0 ? "" : "+"}{answer.awardedPoints}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
