"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { SessionResponse } from "@/lib/types";
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
import { ArrowLeft, BarChart3, Users, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;

export default function SessionHistoryPage() {
  const params = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [quizTitle, setQuizTitle] = useState("Quiz");

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const loadSessions = (p: number) => {
    api.sessions.getByQuiz(params.id, p, PAGE_SIZE).then((data) => {
      setSessions(data.items);
      setTotalCount(data.totalCount);
      setPage(data.page);
      if (data.items.length > 0) {
        setQuizTitle(data.items[0].quizTitle);
      }
    }).catch(() => {
      toast.error("Failed to load sessions");
    }).finally(() => {
      setLoading(false);
    });
  };

  useEffect(() => {
    loadSessions(1);
  }, [params.id]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    try {
      await api.sessions.bulkDelete(Array.from(selected));
      toast.success(`Deleted ${selected.size} session(s)`);
      setSelected(new Set());
      setEditMode(false);
      setShowDeleteDialog(false);
      setLoading(true);
      loadSessions(page);
    } catch {
      toast.error("Failed to delete sessions");
    }
  };

  const exitEditMode = () => {
    setEditMode(false);
    setSelected(new Set());
  };

  return (
    <div>
      <Link href="/quizzes" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Quizzes
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sessions — {quizTitle}</h1>
        {sessions.length > 0 && (
          editMode ? (
            <div className="flex items-center gap-2">
              {selected.size > 0 && (
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete ({selected.size})
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={exitEditMode}>
                Done
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )
        )}
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : sessions.length === 0 && page === 1 ? (
        <p className="text-center text-muted-foreground py-12">No sessions yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {sessions.map((session) => (
              <Card key={session.id} className={editMode && selected.has(session.id) ? "ring-2 ring-primary" : ""}>
                <CardContent className="py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {editMode && (
                        <input
                          type="checkbox"
                          checked={selected.has(session.id)}
                          onChange={() => toggleSelect(session.id)}
                          className="h-4 w-4"
                        />
                      )}
                      <Badge
                        variant={
                          session.status === "Active" ? "destructive" :
                          session.status === "Lobby" ? "default" : "secondary"
                        }
                      >
                        {session.status}
                      </Badge>
                      <span className="font-mono text-sm">{session.joinCode}</span>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {session.participantCount}
                      </span>
                      {session.startedAt && (
                        <span className="text-sm text-muted-foreground">
                          {new Date(session.startedAt).toLocaleDateString()}{" "}
                          {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {!editMode && (
                      <div className="flex items-center gap-2">
                        {session.status === "Finished" && (
                          <Link href={`/sessions/${session.id}/analytics`}>
                            <Button variant="outline" size="sm">
                              <BarChart3 className="h-4 w-4 mr-1" />
                              Analytics
                            </Button>
                          </Link>
                        )}
                        {(session.status === "Lobby" || session.status === "Active") && (
                          <Badge variant="outline" className="text-xs">In progress</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {totalCount} session{totalCount !== 1 ? "s" : ""} total
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSessions(page - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadSessions(page + 1)}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sessions</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selected.size} session(s)? All associated data (participants, answers) will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
