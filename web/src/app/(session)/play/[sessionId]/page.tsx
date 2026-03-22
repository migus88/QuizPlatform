"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuizHub, HubEvents } from "@/lib/signalr";
import type { AnswerOptionResponse, LeaderboardEntry, ParticipantResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/player-avatar";
import { toast } from "sonner";
import { Check, X, Trophy } from "lucide-react";

type PlayState = "waiting" | "question" | "result" | "leaderboard" | "finished";

interface QuestionData {
  id: string;
  text: string;
  options: AnswerOptionResponse[];
  timeLimitSeconds: number;
  questionNumber: number;
  totalQuestions: number;
}

interface AnswerResult {
  isCorrect: boolean;
  awardedPoints: number;
  newScore: number;
}

export default function PlayPage() {
  const params = useParams<{ sessionId: string }>();
  const { startConnection } = useQuizHub();
  const connectionRef = useRef<Awaited<ReturnType<typeof startConnection>> | null>(null);

  const [playState, setPlayState] = useState<PlayState>("waiting");
  const [nickname, setNickname] = useState("");
  const [myEmoji, setMyEmoji] = useState("");
  const [myColor, setMyColor] = useState("");
  const [allEmojis, setAllEmojis] = useState<string[]>([]);
  const [takenEmojis, setTakenEmojis] = useState<string[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [timer, setTimer] = useState(0);
  const [maxTime, setMaxTime] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [connected, setConnected] = useState(false);

  const setupHub = useCallback(async () => {
    try {
      let storedSession: { sessionId: string; nickname: string; joinCode: string; emoji?: string; color?: string } | null = null;
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("quizSession");
        if (stored) {
          storedSession = JSON.parse(stored);
        }
      }

      if (storedSession) {
        setNickname(storedSession.nickname);
        if (storedSession.emoji) setMyEmoji(storedSession.emoji);
        if (storedSession.color) setMyColor(storedSession.color);
      }

      let connection = connectionRef.current;
      if (!connection) {
        connection = await startConnection();
        connectionRef.current = connection;
      }

      connection.on(HubEvents.PARTICIPANT_JOINED, () => {
        setParticipantCount((prev) => prev + 1);
      });

      connection.on(HubEvents.PARTICIPANT_DISCONNECTED, () => {
        setParticipantCount((prev) => Math.max(0, prev - 1));
      });

      connection.on(HubEvents.JOINED_SESSION, (
        _sessionResp: unknown,
        participant: ParticipantResponse
      ) => {
        setMyEmoji(participant.emoji);
        setMyColor(participant.color);
        // Update sessionStorage
        if (typeof window !== "undefined") {
          const stored = sessionStorage.getItem("quizSession");
          if (stored) {
            const data = JSON.parse(stored);
            data.emoji = participant.emoji;
            data.color = participant.color;
            sessionStorage.setItem("quizSession", JSON.stringify(data));
          }
        }
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
          setAnswered(false);
          setAnswerResult(null);
          setPlayState("question");
        }
      );

      connection.on(HubEvents.TIMER_TICK, (seconds: number) => {
        setTimer(seconds);
      });

      connection.on(
        HubEvents.ANSWER_RESULT,
        (data: { isCorrect: boolean; awardedPoints: number; newScore: number }) => {
          // Store result but don't show until reveal
          setAnswerResult(data);
          setMyScore(data.newScore);
        }
      );

      connection.on(HubEvents.QUESTION_ENDED, () => {
        // Timer ran out - don't transition, wait for AnswerRevealed
      });

      connection.on(
        HubEvents.ANSWER_REVEALED,
        () => {
          // Show result now - if we didn't answer, show time's up
          setAnswerResult((prev) => prev ?? { isCorrect: false, awardedPoints: 0, newScore: myScore });
          setPlayState("result");
        }
      );

      connection.on(HubEvents.LEADERBOARD_UPDATED, (entries: LeaderboardEntry[]) => {
        setLeaderboard(entries);
        if (storedSession) {
          const me = entries.find((e) => e.nickname === storedSession.nickname);
          if (me) {
            setMyRank(me.rank);
            setMyScore(me.score);
          }
        }
        setPlayState("leaderboard");
      });

      connection.on(HubEvents.SESSION_ENDED, () => {
        setPlayState("finished");
      });

      connection.on(HubEvents.ALREADY_ANSWERED, () => {
        setAnswered(true);
      });

      connection.on(HubEvents.AVAILABLE_EMOJIS, (data: { all: string[]; taken: string[] }) => {
        setAllEmojis(data.all);
        setTakenEmojis(data.taken);
      });

      connection.on(HubEvents.PARTICIPANT_UPDATED, (participant: ParticipantResponse) => {
        if (participant.nickname === storedSession?.nickname) {
          setMyEmoji(participant.emoji);
        }
      });

      // Join the session
      if (storedSession && storedSession.sessionId === params.sessionId) {
        try {
          await connection.invoke("JoinSession", storedSession.joinCode, storedSession.nickname);
          await connection.invoke("GetAvailableEmojis", storedSession.sessionId);
        } catch {
          // Already joined or cannot join
        }
      }

      setConnected(true);
    } catch {
      toast.error("Failed to connect");
    }
  }, [params.sessionId, startConnection, myScore]);

  useEffect(() => {
    setupHub();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAnswer = async (optionId: string) => {
    if (answered || !connectionRef.current || !currentQuestion) return;
    setAnswered(true);
    try {
      await connectionRef.current.invoke("SubmitAnswer", params.sessionId, currentQuestion.id, optionId);
    } catch {
      toast.error("Failed to submit answer");
      setAnswered(false);
    }
  };

  const handleChangeEmoji = async (emoji: string) => {
    if (!connectionRef.current) return;
    try {
      await connectionRef.current.invoke("ChangeEmoji", params.sessionId, emoji);
      await connectionRef.current.invoke("GetAvailableEmojis", params.sessionId);
    } catch {
      toast.error("Failed to change emoji");
    }
  };

  const optionColors = [
    "bg-red-500 hover:bg-red-600 active:bg-red-700",
    "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
    "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
    "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
  ];

  // WAITING
  if (playState === "waiting") {
    return (
      <div className="w-full max-w-md text-center">
        <Card>
          <CardContent className="py-8">
            <div className="mb-4 flex justify-center">
              {myEmoji && myColor ? (
                <PlayerAvatar emoji={myEmoji} color={myColor} size="lg" />
              ) : (
                <div className="animate-pulse">
                  <div className="w-16 h-16 rounded-full bg-primary/20 mx-auto flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-primary/40" />
                  </div>
                </div>
              )}
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {nickname || "Player"}
            </h2>
            <p className="text-muted-foreground text-lg mb-4">
              Waiting for host to start...
            </p>

            {allEmojis.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground mb-3">
                  Tap to change your emoji
                </p>
                <div className="grid grid-cols-10 gap-1">
                  {allEmojis.map((emoji) => {
                    const isTaken = takenEmojis.includes(emoji) && emoji !== myEmoji;
                    const isSelected = emoji === myEmoji;
                    return (
                      <button
                        key={emoji}
                        onClick={() => !isTaken && handleChangeEmoji(emoji)}
                        disabled={isTaken}
                        className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? "ring-2 ring-primary bg-primary/20 scale-110"
                            : isTaken
                              ? "opacity-20 cursor-not-allowed"
                              : "hover:bg-muted hover:scale-110"
                        }`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {participantCount > 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                {participantCount} player(s) connected
              </p>
            )}
            {!connected && (
              <p className="text-sm text-amber-500 mt-2">Connecting...</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // QUESTION
  if (playState === "question" && currentQuestion) {
    const sortedOptions = [...currentQuestion.options].sort(
      (a, b) => a.order - b.order
    );
    const timerPercent = maxTime > 0 ? (timer / maxTime) * 100 : 0;

    if (answered) {
      return (
        <div className="w-full max-w-md text-center">
          <Card>
            <CardContent className="py-12">
              <div className="mb-4">
                <Check className="w-16 h-16 mx-auto text-emerald-500" />
              </div>
              <h2 className="text-2xl font-bold">Answer submitted!</h2>
              <p className="text-muted-foreground mt-2">Waiting for everyone...</p>
              <p className="text-4xl font-bold font-mono mt-4">{timer}</p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="w-full max-w-lg">
        {/* Timer */}
        <p className="text-center text-3xl font-bold font-mono mb-2">{timer}</p>
        <div className="w-full bg-muted rounded-full h-2 mb-4">
          <div
            className="h-2 rounded-full bg-primary transition-all duration-1000"
            style={{ width: `${timerPercent}%` }}
          />
        </div>

        <p className="text-center text-muted-foreground mb-4">
          {currentQuestion.text}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {sortedOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleAnswer(option.id)}
              className={`${optionColors[index % 4]} text-white rounded-xl p-4 min-h-[80px] text-lg font-medium transition-transform active:scale-95 disabled:opacity-50`}
              disabled={answered}
            >
              {option.text}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // RESULT
  if (playState === "result") {
    return (
      <div className="w-full max-w-md text-center">
        <Card>
          <CardContent className="py-12">
            {answerResult?.isCorrect ? (
              <>
                <Check className="w-20 h-20 mx-auto text-emerald-500 mb-4" />
                <h2 className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  Correct!
                </h2>
              </>
            ) : (
              <>
                <X className="w-20 h-20 mx-auto text-red-500 mb-4" />
                <h2 className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {answered ? "Wrong!" : "Time's up!"}
                </h2>
              </>
            )}
            <div className="mt-6 space-y-2">
              <p className="text-2xl font-bold">
                +{answerResult?.awardedPoints || 0} points
              </p>
              <p className="text-muted-foreground">
                Total: {answerResult?.newScore || myScore}
              </p>
            </div>
            <p className="text-sm text-muted-foreground mt-6">
              Waiting for leaderboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LEADERBOARD
  if (playState === "leaderboard") {
    const top5 = leaderboard.slice(0, 5);
    return (
      <div className="w-full max-w-md text-center">
        <h2 className="text-2xl font-bold mb-2">Leaderboard</h2>
        {myRank !== null && (
          <p className="text-muted-foreground mb-6">
            Your rank: <span className="font-bold">#{myRank}</span> - {myScore} pts
          </p>
        )}
        <div className="space-y-2 mb-4">
          {top5.map((entry) => {
            const isMe = entry.nickname === nickname;
            return (
              <Card key={entry.nickname} className={isMe ? "ring-2 ring-primary" : ""}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar emoji={entry.emoji} color={entry.color} size="sm" />
                      <span className="w-6 text-sm font-bold">#{entry.rank}</span>
                      <span className={`font-medium ${isMe ? "text-primary" : ""}`}>
                        {entry.nickname}
                      </span>
                    </div>
                    <span className="font-mono font-bold">{entry.score}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // FINISHED
  if (playState === "finished") {
    return (
      <div className="w-full max-w-md text-center">
        <Card>
          <CardContent className="py-12">
            <Trophy className="w-16 h-16 mx-auto text-amber-500 mb-4" />
            <h2 className="text-3xl font-bold mb-2">Quiz Complete!</h2>
            {myRank !== null && (
              <div className="mt-4 space-y-1">
                <p className="text-xl">
                  You finished <span className="font-bold">#{myRank}</span>
                </p>
                <p className="text-2xl font-bold">{myScore} points</p>
              </div>
            )}
            <Link href="/join" className="inline-block mt-8">
              <Button size="lg">Join Another Quiz</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
