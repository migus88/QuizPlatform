"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { QuizListResponse, SessionResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Play, Square } from "lucide-react";

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizListResponse[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, SessionResponse>>({});
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [stopSessionId, setStopSessionId] = useState<string | null>(null);
  const router = useRouter();

  const loadQuizzes = async () => {
    try {
      const [quizData, sessionData] = await Promise.all([
        api.quizzes.list(),
        api.sessions.getMyActive(),
      ]);
      setQuizzes(quizData);
      const sessionMap: Record<string, SessionResponse> = {};
      for (const session of sessionData) {
        sessionMap[session.quizId] = session;
      }
      setActiveSessions(sessionMap);
    } catch {
      toast.error("Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.quizzes.delete(deleteId);
      toast.success("Quiz deleted");
      setDeleteId(null);
      loadQuizzes();
    } catch {
      toast.error("Failed to delete quiz");
    }
  };

  const handleHostSession = async (quizId: string) => {
    try {
      const session = await api.sessions.create({ quizId });
      router.push(`/sessions/${session.id}/host`);
    } catch {
      toast.error("Failed to create session");
    }
  };

  const handleStopSession = async () => {
    if (!stopSessionId) return;
    try {
      await api.sessions.finish(stopSessionId);
      toast.success("Session stopped");
      setStopSessionId(null);
      loadQuizzes();
    } catch {
      toast.error("Failed to stop session");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Quizzes</h1>
        <Link href="/quizzes/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Quiz
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : quizzes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No quizzes yet. Create your first quiz!</p>
          <Link href="/quizzes/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Quiz
            </Button>
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quizzes.map((quiz) => {
              const activeSession = activeSessions[quiz.id];
              return (
                <TableRow key={quiz.id}>
                  <TableCell className="font-medium">{quiz.title}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={quiz.isPublished ? "default" : "secondary"}>
                        {quiz.isPublished ? "Published" : "Draft"}
                      </Badge>
                      {activeSession && (
                        <Badge variant="destructive" className="animate-pulse">
                          Live
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{quiz.questionCount}</TableCell>
                  <TableCell>{new Date(quiz.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {activeSession ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/sessions/${activeSession.id}/host`)}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStopSessionId(activeSession.id)}
                          >
                            <Square className="h-4 w-4 mr-1" />
                            Stop
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleHostSession(quiz.id)}
                          disabled={!quiz.isPublished || quiz.questionCount === 0}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Host
                        </Button>
                      )}
                      <Link href={`/quizzes/${quiz.id}`}>
                        <Button variant="ghost" size="icon">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(quiz.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quiz</DialogTitle>
            <DialogDescription>Are you sure you want to delete this quiz? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stop Session Confirmation Dialog */}
      <Dialog open={stopSessionId !== null} onOpenChange={(open) => { if (!open) setStopSessionId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Session</DialogTitle>
            <DialogDescription>Are you sure you want to stop this session? All participants will be disconnected.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStopSessionId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleStopSession}>Stop Session</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
