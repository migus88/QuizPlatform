"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useQuizHub, HubEvents } from "@/lib/signalr";
import type {
  SessionResponse,
  ParticipantResponse,
  LeaderboardEntry,
  QuestionResponse,
  AnswerOptionResponse,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, Play, Trophy, ArrowRight, ChevronRight } from "lucide-react";

type HostState = "lobby" | "question" | "reveal" | "leaderboard" | "finished";

interface QuestionData {
  questionId: string;
  text: string;
  answerOptions: AnswerOptionResponse[];
  timeLimitSeconds: number;
  questionNumber: number;
  totalQuestions: number;
}

interface AnswerDistribution {
  [optionId: string]: number;
}

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
  const [answerCount, setAnswerCount] = useState(0);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<AnswerDistribution>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
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
  }, [params.id, router]);

  const setupHub = useCallback(async () => {
    try {
      const connection = await startConnection();
      connectionRef.current = connection;

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
          questionId: string;
          text: string;
          answerOptions: AnswerOptionResponse[];
          timeLimitSeconds: number;
          questionNumber: number;
          totalQuestions: number;
        }) => {
          setCurrentQuestion(data);
          setTimer(data.timeLimitSeconds);
          setAnswerCount(0);
          setCorrectOptionId(null);
          setDistribution({});
          setHostState("question");
        }
      );

      connection.on(HubEvents.TIMER_TICK, (seconds: number) => {
        setTimer(seconds);
      });

      connection.on(HubEvents.ANSWER_SUBMITTED, (data: { answerCount: number }) => {
        setAnswerCount(data.answerCount);
      });

      connection.on(HubEvents.QUESTION_ENDED, () => {
        // Timer ended, enable reveal
      });

      connection.on(
        HubEvents.ANSWER_REVEALED,
        (data: { correctOptionId: string; distribution: AnswerDistribution }) => {
          setCorrectOptionId(data.correctOptionId);
          setDistribution(data.distribution);
          setHostState("reveal");
        }
      );

      connection.on(HubEvents.LEADERBOARD_UPDATED, (entries: LeaderboardEntry[]) => {
        setLeaderboard(entries);
        setHostState("leaderboard");
      });

      connection.on(HubEvents.SESSION_ENDED, () => {
        setHostState("finished");
      });

      // Join as host
      await connection.invoke("JoinAsHost", params.id);
    } catch {
      toast.error("Failed to connect to session hub");
    }
  }, [params.id, startConnection]);

  useEffect(() => {
    loadSession();
    setupHub();
  }, [loadSession, setupHub]);

  const handleStartSession = async () => {
    if (!session) return;
    try {
      await api.sessions.start(session.id);
      if (connectionRef.current) {
        await connectionRef.current.invoke("StartQuestion", session.id);
      }
    } catch {
      toast.error("Failed to start session");
    }
  };

  const handleRevealAnswer = async () => {
    if (!session || !connectionRef.current) return;
    try {
      await connectionRef.current.invoke("RevealAnswer", session.id);
    } catch {
      toast.error("Failed to reveal answer");
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

  const optionColors = [
    "bg-red-500 text-white",
    "bg-blue-500 text-white",
    "bg-emerald-500 text-white",
    "bg-amber-500 text-white",
  ];

  const optionColorsBg = [
    "bg-red-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
  ];

  // LOBBY
  if (hostState === "lobby") {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-2">{session.quizTitle}</h1>
        <p className="text-muted-foreground mb-8">Waiting for participants to join...</p>

        <Card className="mb-8">
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground mb-2">Join Code</p>
            <p className="text-6xl font-mono font-bold tracking-widest">
              {session.joinCode}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Go to <span className="font-medium">the app</span> and enter this code
            </p>
          </CardContent>
        </Card>

        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Users className="h-5 w-5" />
            <span className="font-medium">{participants.length} participant(s)</span>
          </div>
          {participants.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {participants.map((p) => (
                <Badge key={p.id} variant={p.isConnected ? "default" : "secondary"}>
                  {p.nickname}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button
          size="lg"
          onClick={handleStartSession}
          disabled={participants.length === 0}
        >
          <Play className="h-5 w-5 mr-2" />
          Start Session
        </Button>
      </div>
    );
  }

  // QUESTION DISPLAY
  if (hostState === "question" && currentQuestion) {
    const sortedOptions = [...currentQuestion.answerOptions].sort(
      (a, b) => a.order - b.order
    );
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <Badge variant="outline">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </Badge>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {answerCount} / {participants.length} answered
            </span>
            <span className="text-3xl font-bold font-mono">{timer}</span>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="py-8">
            <h2 className="text-2xl font-bold text-center">{currentQuestion.text}</h2>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {sortedOptions.map((option, index) => (
            <div
              key={option.id}
              className={`${optionColors[index % 4]} rounded-lg p-6 text-center text-lg font-medium`}
            >
              {String.fromCharCode(65 + index)}. {option.text}
            </div>
          ))}
        </div>

        <div className="text-center">
          <Button size="lg" onClick={handleRevealAnswer}>
            Reveal Answer
          </Button>
        </div>
      </div>
    );
  }

  // ANSWER REVEAL
  if (hostState === "reveal" && currentQuestion) {
    const sortedOptions = [...currentQuestion.answerOptions].sort(
      (a, b) => a.order - b.order
    );
    const maxVotes = Math.max(1, ...Object.values(distribution));

    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
          <Badge variant="outline">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </Badge>
        </div>

        <Card className="mb-6">
          <CardContent className="py-6">
            <h2 className="text-xl font-bold text-center">{currentQuestion.text}</h2>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {sortedOptions.map((option, index) => {
            const isCorrect = option.id === correctOptionId;
            const votes = distribution[option.id] || 0;
            return (
              <div
                key={option.id}
                className={`rounded-lg p-4 border-2 ${
                  isCorrect
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                    : "border-muted bg-muted/50 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium ${isCorrect ? "text-emerald-700 dark:text-emerald-300" : ""}`}>
                    {String.fromCharCode(65 + index)}. {option.text}
                  </span>
                  <span className="text-sm font-mono">{votes}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${optionColorsBg[index % 4]}`}
                    style={{ width: `${(votes / maxVotes) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Button size="lg" onClick={handleShowLeaderboard}>
            <Trophy className="h-5 w-5 mr-2" />
            Show Leaderboard
          </Button>
        </div>
      </div>
    );
  }

  // LEADERBOARD
  if (hostState === "leaderboard") {
    const top5 = leaderboard.slice(0, 5);
    const podiumColors = [
      "bg-amber-400 text-amber-950",
      "bg-gray-300 text-gray-800",
      "bg-amber-700 text-amber-50",
    ];

    return (
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-8">Leaderboard</h2>

        <div className="space-y-3 mb-8">
          {top5.map((entry, index) => (
            <Card key={entry.nickname}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        index < 3 ? podiumColors[index] : "bg-muted"
                      }`}
                    >
                      {entry.rank}
                    </span>
                    <span className="font-medium text-lg">{entry.nickname}</span>
                  </div>
                  <span className="font-mono font-bold text-lg">{entry.score}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex justify-center gap-4">
          {currentQuestion &&
            currentQuestion.questionNumber < currentQuestion.totalQuestions && (
              <Button size="lg" onClick={handleNextQuestion}>
                Next Question
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            )}
          <Button size="lg" variant="outline" onClick={handleEndSession}>
            End Session
          </Button>
        </div>
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
          {leaderboard.map((entry, index) => {
            const podiumColors = [
              "bg-amber-400 text-amber-950",
              "bg-gray-300 text-gray-800",
              "bg-amber-700 text-amber-50",
            ];
            return (
              <Card key={entry.nickname}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index < 3 ? podiumColors[index] : "bg-muted"
                        }`}
                      >
                        {entry.rank}
                      </span>
                      <span className="font-medium">{entry.nickname}</span>
                    </div>
                    <span className="font-mono font-bold">{entry.score}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Link href="/quizzes">
          <Button size="lg">
            <ArrowRight className="h-5 w-5 mr-2" />
            Back to Quizzes
          </Button>
        </Link>
      </div>
    );
  }

  return null;
}
