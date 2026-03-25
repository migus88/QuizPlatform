"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { useQuizHub, HubEvents } from "@/lib/signalr";
import type { AnswerOptionResponse, LeaderboardEntry, ParticipantResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/player-avatar";
import { FormattedText } from "@/components/formatted-text";
import { AnimatedLeaderboard } from "@/components/animated-leaderboard";
import { toast } from "sonner";
import { Check, X, Trophy } from "lucide-react";

type PlayState = "waiting" | "countdown" | "questionIntro" | "question" | "revealing" | "result" | "leaderboard" | "finished";

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

interface RevealData {
  correctOptionIds: string[];
  options: { id: string; text: string; isCorrect: boolean; count: number }[];
}

const optionColorsBg = [
  "bg-red-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
];

const optionColorsInteractive = [
  "bg-red-500 hover:bg-red-600 active:bg-red-700",
  "bg-blue-500 hover:bg-blue-600 active:bg-blue-700",
  "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700",
  "bg-amber-500 hover:bg-amber-600 active:bg-amber-700",
  "bg-purple-500 hover:bg-purple-600 active:bg-purple-700",
  "bg-pink-500 hover:bg-pink-600 active:bg-pink-700",
];

export default function PlayPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
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
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [revealData, setRevealData] = useState<RevealData | null>(null);
  const [revealMessage, setRevealMessage] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [connected, setConnected] = useState(false);
  const [visibleOptions, setVisibleOptions] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const myScoreRef = useRef(0);

  useEffect(() => {
    myScoreRef.current = myScore;
  }, [myScore]);

  useEffect(() => {
    let cancelled = false;

    // Read stored session synchronously before async work
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

    // Check if session is finished - show leaderboard or redirect
    // Returns true if setupHub should proceed
    const checkSession = async (): Promise<boolean> => {
      if (!storedSession) {
        router.replace("/join");
        return false;
      }
      try {
        const session = await api.sessions.getByCode(storedSession.joinCode);
        if (session.status === "Finished") {
          try {
            const lb = await api.sessions.leaderboard(session.id);
            if (lb.length > 0) {
              setLeaderboard(lb);
              const me = lb.find((e) => e.nickname === storedSession!.nickname);
              if (me) {
                setMyRank(me.rank);
                setMyScore(me.score);
              }
              setPlayState("finished");
              sessionStorage.removeItem("quizSession");
              return false;
            }
          } catch {
            // Leaderboard not available
          }
          sessionStorage.removeItem("quizSession");
          router.replace("/join");
          return false;
        }
        return true;
      } catch {
        sessionStorage.removeItem("quizSession");
        router.replace("/join");
        return false;
      }
    };

    const setupHub = async () => {
      try {
        const connection = await startConnection();
        if (cancelled) return;
        connectionRef.current = connection;

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
          if (typeof window !== "undefined") {
            const s = sessionStorage.getItem("quizSession");
            if (s) {
              const data = JSON.parse(s);
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
            setSelectedOptionId(null);
            setAnswerResult(null);
            setRevealData(null);
            setRevealMessage("");
            setVisibleOptions(0);
            setTimerActive(false);
            setPlayState("questionIntro");

            // Show question text for 3s, then reveal answers one by one
            const optionCount = data.options.length;
            setTimeout(() => {
              // Start revealing answers one by one every 500ms
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
          setPlayState("question");
        });

        connection.on(HubEvents.TIMER_TICK, (seconds: number) => {
          setTimer(seconds);
        });

        connection.on(
          HubEvents.ANSWER_RESULT,
          (data: { isCorrect: boolean; awardedPoints: number; newScore: number }) => {
            setAnswerResult(data);
            setMyScore(data.newScore);
          }
        );

        connection.on(HubEvents.QUESTION_ENDED, () => {
          // Wait for AnswerRevealed
        });

        connection.on(
          HubEvents.ANSWER_REVEALED,
          (data: RevealData) => {
            setRevealData(data);
            // If we didn't answer, create a default result
            setAnswerResult((prev) => prev ?? { isCorrect: false, awardedPoints: 0, newScore: myScoreRef.current });
            // Show transition message first
            setRevealMessage(
              data.options.reduce((sum, o) => sum + o.count, 0) > 0
                ? "All answers are in!"
                : "Time's up!"
            );
            setPlayState("revealing");
            // After 3 seconds, show the result
            setTimeout(() => {
              setPlayState("result");
            }, 3000);
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
          sessionStorage.removeItem("quizSession");
        });

        connection.on("GameCountdown", (seconds: number) => {
          if (seconds > 0) {
            setCountdown(seconds);
            setPlayState("countdown");
          }
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
        if (!cancelled) {
          toast.error("Failed to connect");
        }
      }
    };

    // Defer to avoid React strict mode double-mount
    const timer = setTimeout(async () => {
      const shouldConnect = await checkSession();
      if (!cancelled && shouldConnect) {
        await setupHub();
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params.sessionId, startConnection, router]);

  const handleAnswer = async (optionId: string) => {
    if (answered || !connectionRef.current || !currentQuestion) return;
    setAnswered(true);
    setSelectedOptionId(optionId);
    try {
      await connectionRef.current.invoke("SubmitAnswer", params.sessionId, currentQuestion.id, optionId);
    } catch {
      toast.error("Failed to submit answer");
      setAnswered(false);
      setSelectedOptionId(null);
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

  // WAITING
  if (playState === "waiting") {
    return (
      <div className="w-full max-w-md text-center">
        <Card>
          <CardContent className="py-8">
            <div className="mb-4 flex justify-center">
              {myEmoji ? (
                <PlayerAvatar emoji={myEmoji} size="lg" />
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

  // COUNTDOWN
  if (playState === "countdown") {
    return (
      <div className="w-full max-w-md text-center">
        <div className="animate-in fade-in zoom-in duration-300">
          <p className="text-2xl font-medium text-muted-foreground mb-4">Get ready!</p>
          <p className="text-9xl font-bold font-mono">{countdown}</p>
        </div>
      </div>
    );
  }

  // QUESTION INTRO - show question text, then reveal answers one by one
  if (playState === "questionIntro" && currentQuestion) {
    const sortedOptions = currentQuestion.options;

    return (
      <div className="w-full max-w-lg">
        {/* Timer placeholder at top — keeps layout stable across phases */}
        <div className="h-[44px] mb-2 flex items-center justify-center">
          <span className="text-3xl font-bold font-mono invisible">&nbsp;</span>
        </div>
        <div className="w-full h-2 mb-4" />

        <p className="text-center text-xl font-semibold mb-4">
          <FormattedText text={currentQuestion.text} />
        </p>

        <div className="grid grid-cols-2 gap-3">
          {sortedOptions.map((option, index) => (
            <div
              key={option.id}
              className={`${optionColorsBg[index % 6]} text-white rounded-xl p-4 min-h-[80px] text-lg font-medium flex items-center transition-all duration-500 ${
                index < visibleOptions
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
              }${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.375rem)]" : ""}`}
            >
              <FormattedText text={option.text} />
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
        </p>
      </div>
    );
  }

  // QUESTION - answering phase
  if ((playState === "question") && currentQuestion) {
    const sortedOptions = currentQuestion.options;

    if (answered) {
      return (
        <div className="w-full max-w-lg">
          {/* Timer at top */}
          <div className="h-[44px] mb-2 flex items-center justify-center">
            <span className="text-3xl font-bold font-mono">{timer}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mb-4 overflow-hidden">
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

          <div className="text-center py-8">
            <div className="mb-4">
              <Check className="w-16 h-16 mx-auto text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold">Answer submitted!</h2>
            <p className="text-muted-foreground mt-2">Waiting for everyone...</p>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
          </p>
        </div>
      );
    }

    return (
      <div className="w-full max-w-lg">
        {/* Timer at top */}
        <div className="h-[44px] mb-2 flex items-center justify-center">
          <span className="text-3xl font-bold font-mono">{timer}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2 mb-4 overflow-hidden">
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

        <p className="text-center text-xl font-semibold mb-4">
          <FormattedText text={currentQuestion.text} />
        </p>

        <div className="grid grid-cols-2 gap-3">
          {sortedOptions.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleAnswer(option.id)}
              className={`${optionColorsInteractive[index % 6]} text-white rounded-xl p-4 min-h-[80px] text-lg font-medium text-left transition-transform active:scale-95 disabled:opacity-50${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.375rem)]" : ""}`}
              disabled={answered}
            >
              <FormattedText text={option.text} />
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
        </p>
      </div>
    );
  }

  // REVEALING - transition screen
  if (playState === "revealing") {
    return (
      <div className="w-full max-w-md text-center">
        <div className="animate-in fade-in zoom-in duration-700">
          <p className="text-5xl font-bold mb-4">
            {revealMessage.includes("Time") ? "⏰" : "✅"}
          </p>
          <h2 className="text-3xl font-bold animate-in slide-in-from-bottom duration-500">
            {revealMessage}
          </h2>
        </div>
      </div>
    );
  }

  // RESULT - combined answer reveal + personal result
  if (playState === "result" && currentQuestion && revealData) {
    const sortedOptions = currentQuestion.options;

    return (
      <div className="w-full max-w-lg animate-in fade-in slide-in-from-bottom duration-500">
        {/* Result banner */}
        <div className="text-center mb-6 animate-in zoom-in duration-300">
          {answerResult?.isCorrect ? (
            <div className="flex items-center justify-center gap-3">
              <Check className="w-10 h-10 text-emerald-500" />
              <h2 className={`text-2xl font-bold ${answerResult.awardedPoints < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                Correct! {answerResult.awardedPoints < 0 ? "" : "+"}{answerResult.awardedPoints}pts
              </h2>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              <X className="w-10 h-10 text-red-500" />
              <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
                {answered ? "Wrong!" : "Time's up!"}
                {answerResult && answerResult.awardedPoints < 0 && (
                  <span className="ml-2">{answerResult.awardedPoints}pts</span>
                )}
              </h2>
            </div>
          )}
        </div>

        {/* Question text */}
        <Card className="mb-4">
          <CardContent className="py-4">
            <p className="text-center font-medium"><FormattedText text={currentQuestion.text} /></p>
          </CardContent>
        </Card>

        {/* Answer options with reveal */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {sortedOptions.map((option, index) => {
            const revealOption = revealData.options.find((o) => o.id === option.id);
            const isCorrect = revealOption?.isCorrect ?? false;
            const isMyChoice = option.id === selectedOptionId;
            const count = revealOption?.count ?? 0;

            return (
              <div
                key={option.id}
                className={`rounded-xl p-4 min-h-[80px] text-white relative overflow-hidden transition-all duration-500 ${
                  isCorrect
                    ? "bg-emerald-500"
                    : isMyChoice
                      ? "bg-red-500"
                      : "bg-gray-400 dark:bg-gray-600"
                }${sortedOptions.length % 2 === 1 && index === sortedOptions.length - 1 ? " col-span-2 justify-self-center w-[calc(50%-0.375rem)]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium"><FormattedText text={option.text} /></span>
                  <span className="text-sm font-mono opacity-80">{count}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className={`text-center text-sm ${(answerResult?.newScore ?? myScore) < 0 ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
          Total: {answerResult?.newScore ?? myScore} points
        </p>
      </div>
    );
  }

  // LEADERBOARD
  if (playState === "leaderboard") {
    return (
      <AnimatedLeaderboard
        entries={leaderboard}
        nickname={nickname}
        myRank={myRank}
        myScore={myScore}
      />
    );
  }

  // FINISHED
  if (playState === "finished") {
    return (
      <div className="w-full max-w-md">
        {myRank !== null && (
          <div className="text-center mb-6">
            <Trophy className="w-12 h-12 mx-auto text-amber-500 mb-2" />
            <p className="text-xl">
              You finished <span className="font-bold">#{myRank}</span> with <span className="font-bold">{myScore}</span> points
            </p>
          </div>
        )}

        {leaderboard.length > 0 && (
          <div className="space-y-2 mb-6">
            {leaderboard.map((entry) => (
              <Card key={entry.nickname} className={entry.nickname === nickname ? "ring-2 ring-primary" : ""}>
                <CardContent className="py-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold w-6 text-center text-muted-foreground">#{entry.rank}</span>
                      <PlayerAvatar emoji={entry.emoji} size="sm" />
                      <span className="font-medium">{entry.nickname}</span>
                    </div>
                    <span className="font-mono font-bold">{entry.score}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="text-center">
          <Link href="/join">
            <Button size="lg">Join Another Quiz</Button>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
