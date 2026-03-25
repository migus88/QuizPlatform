"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useQuizHub, HubEvents } from "@/lib/signalr";
import type {
  SessionResponse,
  ParticipantResponse,
  LeaderboardEntry,
  AnswerOptionResponse,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayerAvatar, RankBadge } from "@/components/player-avatar";
import { FormattedText } from "@/components/formatted-text";
import { AnimatedLeaderboard } from "@/components/animated-leaderboard";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Users, Play, Trophy, ArrowRight, ChevronRight, Check, Square } from "lucide-react";

type HostState = "lobby" | "countdown" | "questionIntro" | "question" | "revealing" | "reveal" | "leaderboard" | "finished";

interface QuestionData {
  id: string;
  text: string;
  options: AnswerOptionResponse[];
  timeLimitSeconds: number;
  questionNumber: number;
  totalQuestions: number;
}

interface RevealData {
  correctOptionIds: string[];
  options: { id: string; text: string; isCorrect: boolean; count: number; points?: number | null }[];
}

const optionColors = [
  "bg-red-500 text-white",
  "bg-blue-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-purple-500 text-white",
  "bg-pink-500 text-white",
];

const optionColorsBg = [
  "bg-red-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
];

export default function HostPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { startConnection } = useQuizHub();
  const connectionRef = useRef<Awaited<ReturnType<typeof startConnection>> | null>(null);

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [hostState, setHostState] = useState<HostState>("lobby");
  const [participants, setParticipants] = useState<ParticipantResponse[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [timer, setTimer] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [answerCount, setAnswerCount] = useState(0);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [revealMessage, setRevealMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleOptions, setVisibleOptions] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const data = await api.sessions.getById(params.id);
        setSession(data);
        if (data.status === "Finished") {
          setHostState("finished");
          const lb = await api.sessions.leaderboard(params.id);
          setLeaderboard(lb);
        }
      } catch {
        toast.error("Failed to load session");
        router.push("/quizzes");
      } finally {
        setLoading(false);
      }
    };

    loadSession();

    const setupHub = async () => {
      try {
        const connection = await startConnection();
        if (cancelled) return;
        connectionRef.current = connection;

        // Receive full participant list on (re)join
        connection.on("ParticipantList", (list: ParticipantResponse[]) => {
          setParticipants(list);
        });

        connection.on(HubEvents.PARTICIPANT_JOINED, (participant: ParticipantResponse) => {
          setParticipants((prev) => {
            if (prev.find((p) => p.id === participant.id)) return prev;
            return [...prev, participant];
          });
        });

        connection.on(HubEvents.PARTICIPANT_DISCONNECTED, (participantId: string) => {
          setParticipants((prev) =>
            prev.map((p) => (p.id === participantId ? { ...p, isConnected: false } : p))
          );
        });

        connection.on(
          HubEvents.QUESTION_STARTED,
          (data: {
            id: string;
            text: string;
            options: AnswerOptionResponse[];
            timeLimitSeconds: number;
            questionNumber: number;
            totalQuestions: number;
          }) => {
            setCurrentQuestion(data);
            setTimer(data.timeLimitSeconds);
            setMaxTime(data.timeLimitSeconds);
            setAnswerCount(0);
            setRevealData(null);
            setRevealMessage("");
            setVisibleOptions(0);
            setTimerActive(false);
            setHostState("questionIntro");

            const optionCount = data.options.length;
            setTimeout(() => {
              for (let i = 0; i < optionCount; i++) {
                setTimeout(() => {
                  setVisibleOptions((prev) => prev + 1);
                }, i * 500);
              }
            }, 3000);
          }
        );

        connection.on(HubEvents.TIMER_STARTED, () => {
          setTimerActive(true);
          setHostState("question");
        });

        connection.on(HubEvents.TIMER_TICK, (seconds: number) => {
          setTimer(seconds);
        });

        connection.on(HubEvents.ANSWER_SUBMITTED, (data: { totalAnswered: number; totalParticipants: number }) => {
          setAnswerCount(data.totalAnswered);
        });

        connection.on(HubEvents.QUESTION_ENDED, () => {
          // Wait for auto-reveal
        });

        connection.on(
          HubEvents.ANSWER_REVEALED,
          (data: RevealData) => {
            setRevealData(data);
            const totalAnswers = data.options.reduce((sum, o) => sum + o.count, 0);
            setRevealMessage(totalAnswers > 0 ? "All answers are in!" : "Time's up!");
            setHostState("revealing");
            setTimeout(() => {
              setHostState("reveal");
            }, 3000);
          }
        );

        connection.on(HubEvents.LEADERBOARD_UPDATED, (entries: LeaderboardEntry[]) => {
          setLeaderboard(entries);
          setHostState("leaderboard");
        });

        connection.on(HubEvents.SESSION_ENDED, () => {
          setHostState("finished");
        });

        connection.on("GameCountdown", (seconds: number) => {
          if (seconds > 0) {
            setCountdown(seconds);
            setHostState("countdown");
          }
        });

        connection.on(HubEvents.PARTICIPANT_UPDATED, (participant: ParticipantResponse) => {
          setParticipants((prev) =>
            prev.map((p) => (p.id === participant.id ? participant : p))
          );
        });

        await connection.invoke("JoinAsHost", params.id);
      } catch {
        if (!cancelled) {
          toast.error("Failed to connect to session hub");
        }
      }
    };

    const t = setTimeout(setupHub, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [params.id, router, startConnection]);

  const handleStartSession = async () => {
    if (!session) return;
    try {
      await api.sessions.start(session.id);
      if (connectionRef.current) {
        await connectionRef.current.invoke("StartCountdown", session.id, 10);
        // Wait for countdown to finish, then start first question
        setTimeout(async () => {
          if (connectionRef.current) {
            await connectionRef.current.invoke("StartQuestion", session.id);
          }
        }, 11000);
      }
    } catch {
      toast.error("Failed to start session");
    }
  };

  const handleShowLeaderboard = async () => {
    if (!session || !connectionRef.current) return;
    try {
      await connectionRef.current.invoke("ShowLeaderboard", session.id);
    } catch {
      toast.error("Failed to show leaderboard");
    }
  };

  const handleNextQuestion = async () => {
    if (!session || !connectionRef.current) return;
    try {
      await api.sessions.nextQuestion(session.id);
      await connectionRef.current.invoke("StartQuestion", session.id);
    } catch {
      toast.error("No more questions");
    }
  };

  const handleEndSession = async () => {
    if (!session) return;
    try {
      await api.sessions.finish(session.id);
      const lb = await api.sessions.leaderboard(session.id);
      setLeaderboard(lb);
      setHostState("finished");
    } catch {
      toast.error("Failed to end session");
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading session...</div>;
  }

  if (!session) return null;

  const endSessionDialog = (
    <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>End Session</DialogTitle>
          <DialogDescription>Are you sure you want to end this session? This will finish the quiz for all participants.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowEndDialog(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => { setShowEndDialog(false); handleEndSession(); }}>End Session</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // LOBBY
  if (hostState === "lobby") {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-2">{session.quizTitle}</h1>
        <p className="text-muted-foreground mb-8">Waiting for participants to join...</p>

        <Card className="mb-8">
          <CardContent className="py-8">
            <p className="text-2xl font-medium mb-3">
              <span className="text-muted-foreground">{typeof window !== "undefined" ? window.location.protocol + "//" : "https://"}</span>
              {typeof window !== "undefined" ? window.location.host : ""}
            </p>
            <p className="text-sm text-muted-foreground mb-2">Join Code</p>
            <p className="text-6xl font-mono font-bold tracking-widest">
              {session.joinCode}
            </p>
          </CardContent>
        </Card>

        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Users className="h-5 w-5" />
            <span className="font-medium">{participants.length} participant(s)</span>
          </div>
          {participants.length > 0 && (
            <div className="flex flex-wrap justify-center gap-6">
              {participants.map((p) => (
                <div key={p.id} className={`flex flex-col items-center gap-1 ${!p.isConnected ? "opacity-50" : ""}`}>
                  <PlayerAvatar emoji={p.emoji} size="md" />
                  <span className="text-sm font-medium">{p.nickname}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={handleStartSession}
            disabled={participants.length === 0}
          >
            <Play className="h-5 w-5 mr-2" />
            Start Session
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEndDialog(true)}>
            <Square className="h-3 w-3 mr-1" />
            End
          </Button>
        </div>
        {endSessionDialog}
      </div>
    );
  }

  // COUNTDOWN
  if (hostState === "countdown") {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center animate-in fade-in zoom-in duration-300">
          <p className="text-2xl font-medium text-muted-foreground mb-4">Get ready!</p>
          <p className="text-9xl font-bold font-mono">{countdown}</p>
        </div>
        {endSessionDialog}
      </div>
    );
  }

  // QUESTION INTRO - show question text, then reveal answers one by one
  if (hostState === "questionIntro" && currentQuestion) {
    const sortedOptions = currentQuestion.options;
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <Badge variant="outline">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </Badge>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEndDialog(true)}>
            <Square className="h-3 w-3 mr-1" />
            End
          </Button>
        </div>

        <Card className="my-6">
          <CardContent className="py-12">
            <h2 className="text-3xl font-bold text-center animate-in fade-in duration-700">
              <FormattedText text={currentQuestion.text} />
            </h2>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {sortedOptions.map((option, index) => (
            <div
              key={option.id}
              className={`${optionColors[index % 6]} rounded-lg p-6 text-center text-lg font-medium transition-all duration-500 ${
                index < visibleOptions
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.5rem)]" : ""}`}
            >
              <FormattedText text={option.text} />
            </div>
          ))}
        </div>
        {endSessionDialog}
      </div>
    );
  }

  // QUESTION DISPLAY - answering phase with timer
  if (hostState === "question" && currentQuestion) {
    const sortedOptions = currentQuestion.options;
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="outline">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </Badge>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEndDialog(true)}>
              <Square className="h-3 w-3 mr-1" />
              End
            </Button>
            <span className="text-sm text-muted-foreground">
              {answerCount} / {participants.length} answered
            </span>
            <span className="text-3xl font-bold font-mono">{timer}</span>
          </div>
        </div>

        {/* Smooth timer bar */}
        <div className="w-full bg-muted rounded-full h-2 mb-6 overflow-hidden">
          <div
            className="h-2 rounded-full bg-primary"
            style={{
              width: "100%",
              transform: `scaleX(${maxTime > 0 ? timer / maxTime : 0})`,
              transformOrigin: "left",
              transition: "transform 1s linear",
            }}
          />
        </div>

        <Card className="mb-6">
          <CardContent className="py-8">
            <h2 className="text-2xl font-bold text-center"><FormattedText text={currentQuestion.text} /></h2>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {sortedOptions.map((option, index) => (
            <div
              key={option.id}
              className={`${optionColors[index % 6]} rounded-lg p-6 text-center text-lg font-medium${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.5rem)]" : ""}`}
            >
              <FormattedText text={option.text} />
            </div>
          ))}
        </div>
        {endSessionDialog}
      </div>
    );
  }

  // REVEALING - transition screen
  if (hostState === "revealing") {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
        <div className="text-center animate-in fade-in zoom-in duration-700">
          <p className="text-7xl mb-6">
            {revealMessage.includes("Time") ? "⏰" : "✅"}
          </p>
          <h2 className="text-5xl font-bold animate-in slide-in-from-bottom duration-500">
            {revealMessage}
          </h2>
        </div>
      </div>
    );
  }

  // ANSWER REVEAL
  if (hostState === "reveal" && currentQuestion && revealData) {
    const sortedOptions = currentQuestion.options;
    const maxVotes = Math.max(1, ...revealData.options.map((o) => o.count));

    return (
      <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom duration-500">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="outline">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </Badge>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowEndDialog(true)}>
              <Square className="h-3 w-3 mr-1" />
              End
            </Button>
            <Button onClick={handleShowLeaderboard}>
              <Trophy className="h-5 w-5 mr-2" />
              Show Leaderboard
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="py-6">
            <h2 className="text-xl font-bold text-center"><FormattedText text={currentQuestion.text} /></h2>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          {sortedOptions.map((option, index) => {
            const revealOption = revealData.options.find((o) => o.id === option.id);
            const isCorrect = revealOption?.isCorrect ?? false;
            const votes = revealOption?.count ?? 0;
            const points = revealOption?.points;
            return (
              <div
                key={option.id}
                className={`rounded-lg p-4 border-2 transition-all duration-500 ${
                  isCorrect
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                    : "border-muted bg-muted/50 opacity-60"
                }${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.5rem)]" : ""}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {isCorrect && <Check className="w-5 h-5 text-emerald-500" />}
                    <span className={`font-medium ${isCorrect ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                      <FormattedText text={option.text} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {points != null && (
                      <span className={`text-xs font-mono ${points < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {points > 0 ? "+" : ""}{points}pts
                      </span>
                    )}
                    <span className="text-sm font-mono">{votes}</span>
                  </div>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-1000 ${optionColorsBg[index % 6]}`}
                    style={{ width: `${(votes / maxVotes) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {endSessionDialog}
      </div>
    );
  }

  // LEADERBOARD
  if (hostState === "leaderboard") {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end gap-3 mb-4">
          {currentQuestion &&
            currentQuestion.questionNumber < currentQuestion.totalQuestions && (
              <Button onClick={handleNextQuestion}>
                Next Question
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            )}
          <Button variant="outline" onClick={() => setShowEndDialog(true)}>
            End Session
          </Button>
        </div>

        <AnimatedLeaderboard entries={leaderboard} />
        {endSessionDialog}
      </div>
    );
  }

  // FINISHED
  if (hostState === "finished") {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-2">Session Complete!</h2>
        <p className="text-muted-foreground mb-8">{session.quizTitle}</p>

        <div className="space-y-3 mb-8">
          {leaderboard.map((entry) => (
            <Card key={entry.nickname}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RankBadge rank={entry.rank} />
                    <PlayerAvatar emoji={entry.emoji} size="sm" />
                    <span className="font-medium">{entry.nickname}</span>
                  </div>
                  <span className="font-mono font-bold">{entry.score}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center gap-4">
          <Link href={`/sessions/${params.id}/analytics`}>
            <Button size="lg" variant="outline">
              View Analytics
            </Button>
          </Link>
          <Link href="/quizzes">
            <Button size="lg">
              <ArrowRight className="h-5 w-5 mr-2" />
              Back to Quizzes
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
