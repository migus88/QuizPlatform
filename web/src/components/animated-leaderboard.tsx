import type { LeaderboardEntry } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar, RankBadge } from "@/components/player-avatar";

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  nickname?: string;
  myRank?: number | null;
  myScore?: number;
}

export function AnimatedLeaderboard({ entries, nickname, myRank, myScore }: LeaderboardProps) {
  const top10 = entries.slice(0, 10);

  return (
    <div className="w-full max-w-2xl mx-auto text-center animate-in fade-in duration-500">
      <h2 className="text-3xl font-bold mb-2 animate-in slide-in-from-bottom duration-500">Leaderboard</h2>
      {nickname && myRank != null && (
        <p className="text-muted-foreground mb-6 animate-in fade-in duration-700">
          Your rank: <span className="font-bold">#{myRank}</span> - <span className={myScore != null && myScore < 0 ? "text-red-500" : ""}>{myScore} pts</span>
        </p>
      )}
      <div className="space-y-2">
        {top10.map((entry, index) => {
          const isMe = entry.nickname === nickname;
          return (
            <Card
              key={entry.nickname}
              className={`${isMe ? "ring-2 ring-primary" : ""} animate-in slide-in-from-bottom fade-in duration-500`}
              style={{ animationDelay: `${index * 100}ms`, animationFillMode: "both" }}
            >
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RankBadge rank={entry.rank} />
                    <PlayerAvatar emoji={entry.emoji} size="sm" />
                    <span className={`font-medium text-lg ${isMe ? "text-primary" : ""}`}>
                      {entry.nickname}
                    </span>
                  </div>
                  <span className={`font-mono font-bold text-lg ${entry.score < 0 ? "text-red-500" : ""}`}>{entry.score}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
