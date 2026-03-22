import { cn } from "@/lib/utils";

const sizes = {
  sm: "text-3xl",
  md: "text-5xl",
  lg: "text-7xl",
};

interface PlayerAvatarProps {
  emoji: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlayerAvatar({ emoji, size = "md", className }: PlayerAvatarProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0 leading-none",
        sizes[size],
        className
      )}
    >
      {emoji}
    </span>
  );
}

const medals = ["🥇", "🥈", "🥉"];

export function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return <span className="text-2xl leading-none">{medals[rank - 1]}</span>;
  }
  return (
    <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
      {rank}
    </span>
  );
}
