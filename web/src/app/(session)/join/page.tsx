"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HubConnection } from "@microsoft/signalr";
import { api } from "@/lib/api-client";
import { useQuizHub, HubEvents } from "@/lib/signalr";
import type { SessionResponse, ParticipantResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/player-avatar";
import { toast } from "sonner";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startConnection } = useQuizHub();
  const connectionRef = useRef<HubConnection | null>(null);

  const [step, setStep] = useState<"code" | "nickname" | "avatar">("code");
  const [code, setCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [myEmoji, setMyEmoji] = useState("");
  const [myColor, setMyColor] = useState("");
  const [availableEmojis, setAvailableEmojis] = useState<string[]>([]);

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
      connectionRef.current = connection;

      // Listen for JoinedSession to get our assigned emoji/color
      connection.on(
        HubEvents.JOINED_SESSION,
        (_sessionResp: SessionResponse, participant: ParticipantResponse) => {
          setMyEmoji(participant.emoji);
          setMyColor(participant.color);
        }
      );

      // Listen for available emojis
      connection.on(HubEvents.AVAILABLE_EMOJIS, (emojis: string[]) => {
        setAvailableEmojis(emojis);
      });

      // Listen for updates when we change emoji
      connection.on(HubEvents.PARTICIPANT_UPDATED, (participant: ParticipantResponse) => {
        if (participant.nickname === nickname.trim()) {
          setMyEmoji(participant.emoji);
        }
      });

      await connection.invoke("JoinSession", session.joinCode, nickname.trim());

      // Request available emojis
      await connection.invoke("GetAvailableEmojis", session.id.toString());

      setStep("avatar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join session");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmoji = async (emoji: string) => {
    if (!session || !connectionRef.current) return;
    try {
      await connectionRef.current.invoke("ChangeEmoji", session.id.toString(), emoji);
      // Refresh available emojis
      await connectionRef.current.invoke("GetAvailableEmojis", session.id.toString());
    } catch {
      toast.error("Failed to change emoji");
    }
  };

  const handleContinue = () => {
    if (!session) return;
    // Store session info for reconnection
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "quizSession",
        JSON.stringify({
          sessionId: session.id,
          nickname: nickname.trim(),
          joinCode: session.joinCode,
          emoji: myEmoji,
          color: myColor,
        })
      );
    }
    router.push(`/play/${session.id}`);
  };

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Join Quiz</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "code" && (
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
          )}

          {step === "nickname" && (
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

          {step === "avatar" && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">Your avatar</p>
                <div className="flex justify-center mb-2">
                  <PlayerAvatar emoji={myEmoji} color={myColor} size="lg" />
                </div>
                <p className="text-lg font-bold">{nickname}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-3 text-center">
                  Tap to change your emoji
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  {availableEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleChangeEmoji(emoji)}
                      className={`w-10 h-10 text-xl rounded-lg flex items-center justify-center transition-all hover:scale-110 ${
                        emoji === myEmoji
                          ? "ring-2 ring-primary bg-primary/20"
                          : "hover:bg-muted"
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                className="w-full h-14 text-lg"
                onClick={handleContinue}
              >
                Continue
              </Button>
            </div>
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
