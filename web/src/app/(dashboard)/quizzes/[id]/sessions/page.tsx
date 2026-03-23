"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { SessionResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, BarChart3, Users } from "lucide-react";

export default function SessionHistoryPage() {
  const params = useParams<{ id: string }>();
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.sessions.getByQuiz(params.id).then((data) => {
      setSessions(data);
    }).catch(() => {
      toast.error("Failed to load sessions");
    }).finally(() => {
      setLoading(false);
    });
  }, [params.id]);

  const quizTitle = sessions[0]?.quizTitle ?? "Quiz";

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/quizzes" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Back to Quizzes
      </Link>
      <h1 className="text-2xl font-bold mb-6">Sessions — {quizTitle}</h1>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">No sessions yet.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
