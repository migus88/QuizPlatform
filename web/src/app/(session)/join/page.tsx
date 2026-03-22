"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { useQuizHub } from "@/lib/signalr";
import type { SessionResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startConnection } = useQuizHub();

  const [step, setStep] = useState<"code" | "nickname">("code");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setCode(codeParam.toUpperCase());
    }
  }, [searchParams]);

  const handleJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const sessionData = await api.sessions.getByCode(code.trim().toUpperCase());
      setSession(sessionData);
      setStep("nickname");
    } catch {
      toast.error("Invalid join code or session not found");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !nickname.trim()) return;
    setLoading(true);
    try {
      const connection = await startConnection();

      const result = await connection.invoke("JoinSession", session.joinCode, nickname.trim());

      // Store session info for reconnection
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "quizSession",
          JSON.stringify({
            sessionId: session.id,
            participantId: result?.participantId || "",
            nickname: nickname.trim(),
            joinCode: session.joinCode,
          })
        );
      }

      router.push(`/play/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Join Quiz</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "code" ? (
            <form onSubmit={handleJoinCode} className="space-y-6">
              <div className="space-y-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ENTER CODE"
                  className="text-center text-3xl font-mono font-bold h-16 tracking-[0.3em] uppercase"
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-14 text-lg"
                disabled={loading || code.length < 4}
              >
                {loading ? "Finding quiz..." : "Join"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleJoinSession} className="space-y-6">
              <div className="text-center mb-4">
                <p className="text-muted-foreground">Joining</p>
                <p className="text-xl font-bold">{session?.quizTitle}</p>
              </div>
              <div className="space-y-2">
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                  placeholder="Your nickname"
                  className="text-center text-2xl h-14"
                  maxLength={20}
                  required
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                className="w-full h-14 text-lg"
                disabled={loading || !nickname.trim()}
              >
                {loading ? "Joining..." : "Enter"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => { setStep("code"); setSession(null); }}
              >
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-md text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
