import { cn } from "@/lib/utils";

const sizes = {
  sm: "w-8 h-8 text-lg",
  md: "w-12 h-12 text-2xl",
  lg: "w-16 h-16 text-3xl",
};

interface PlayerAvatarProps {
  emoji: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function PlayerAvatar({ emoji, color, size = "md", className }: PlayerAvatarProps) {
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        sizes[size],
        className
      )}
      style={{ backgroundColor: color }}
    >
      {emoji}
    </div>
  );
}
