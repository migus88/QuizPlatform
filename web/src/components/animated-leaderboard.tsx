"use client";

import { useEffect, useRef, useState } from "react";
import type { LeaderboardEntry } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar, RankBadge } from "@/components/player-avatar";

const ITEM_HEIGHT = 64;
const MAX_ENTRIES = 10;
const TRANSITION_DURATION = 600;

interface AnimatedLeaderboardProps {
  entries: LeaderboardEntry[];
  nickname?: string;
  myRank?: number | null;
  myScore?: number;
}

interface DisplayEntry extends LeaderboardEntry {
  status: "stable" | "entering" | "exiting";
  offsetY: number;
}

export function AnimatedLeaderboard({ entries, nickname, myRank, myScore }: AnimatedLeaderboardProps) {
  const prevEntriesRef = useRef<LeaderboardEntry[]>([]);
  const [displayEntries, setDisplayEntries] = useState<DisplayEntry[]>([]);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const top = entries.slice(0, MAX_ENTRIES);
    const prev = prevEntriesRef.current;

    if (isFirstRender.current || prev.length === 0) {
      // First render - just show entries with staggered entrance
      isFirstRender.current = false;
      const initial = top.map((entry, i) => ({
        ...entry,
        status: "entering" as const,
        offsetY: 20,
      }));
      setDisplayEntries(initial);

      // Animate in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setDisplayEntries(
            top.map((entry) => ({
              ...entry,
              status: "stable" as const,
              offsetY: 0,
            }))
          );
        });
      });
      prevEntriesRef.current = top;
      return;
    }

    // Build lookup of previous positions
    const prevPositions = new Map<string, number>();
    prev.forEach((e, i) => prevPositions.set(e.nickname, i));

    const currentNicknames = new Set(top.map((e) => e.nickname));

    // Find exiting entries (were in prev but not in current top)
    const exiting: DisplayEntry[] = prev
      .filter((e) => !currentNicknames.has(e.nickname))
      .slice(0, 2) // Only animate a couple of exits
      .map((e) => ({
        ...e,
        status: "exiting" as const,
        offsetY: 0,
      }));

    // Build display with current entries
    const current: DisplayEntry[] = top.map((entry) => {
      const prevIndex = prevPositions.get(entry.nickname);
      const currentIndex = entry.rank - 1;
      const isNew = prevIndex === undefined;

      return {
        ...entry,
        status: isNew ? ("entering" as const) : ("stable" as const),
        offsetY: isNew ? 40 : (prevIndex! - currentIndex) * ITEM_HEIGHT,
      };
    });

    // Show with initial offsets (entries at their old positions)
    setDisplayEntries([...current, ...exiting]);

    // Animate to final positions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDisplayEntries(
          current.map((e) => ({ ...e, offsetY: 0, status: "stable" }))
        );
      });
    });

    // Clean up exiting entries after animation
    if (exiting.length > 0) {
      setTimeout(() => {
        setDisplayEntries((prev) =>
          prev.filter((e) => e.status !== "exiting")
        );
      }, TRANSITION_DURATION);
    }

    prevEntriesRef.current = top;
  }, [entries]);

  return (
    <div className="w-full max-w-2xl mx-auto text-center">
      <h2 className="text-3xl font-bold mb-2">Leaderboard</h2>
      {nickname && myRank !== undefined && myRank !== null && (
        <p className="text-muted-foreground mb-6">
          Your rank: <span className="font-bold">#{myRank}</span> - {myScore} pts
        </p>
      )}
      <div
        className="relative"
        style={{ height: Math.min(displayEntries.filter((e) => e.status !== "exiting").length, MAX_ENTRIES) * ITEM_HEIGHT + 8 }}
      >
        {displayEntries.map((entry) => {
          const isMe = entry.nickname === nickname;
          const index = entry.status === "exiting"
            ? (prevEntriesRef.current.findIndex((e) => e.nickname === entry.nickname))
            : entry.rank - 1;

          return (
            <div
              key={entry.nickname}
              className="absolute left-0 right-0 px-0.5"
              style={{
                top: 0,
                transform: `translateY(${index * ITEM_HEIGHT + entry.offsetY}px)`,
                transition: `transform ${TRANSITION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${TRANSITION_DURATION}ms ease`,
                opacity: entry.status === "exiting" ? 0 : entry.status === "entering" && entry.offsetY > 0 ? 0 : 1,
              }}
            >
              <Card className={`mb-1 ${isMe ? "ring-2 ring-primary" : ""}`}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <RankBadge rank={entry.rank} />
                      <PlayerAvatar emoji={entry.emoji} size="sm" />
                      <span className={`font-medium text-lg ${isMe ? "text-primary" : ""}`}>
                        {entry.nickname}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-lg">{entry.score}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
