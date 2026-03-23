import React from "react";

/**
 * Renders text with basic inline markdown:
 * **bold**, *italic*, __underline__, `code`
 */
export function FormattedText({ text, className }: { text: string; className?: string }) {
  return <span className={className}>{parseInlineMarkdown(text)}</span>;
}

function parseInlineMarkdown(text: string): React.ReactNode[] {
  // Order matters: bold (**) before italic (*), underline (__) before bold
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*)/g;
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("__") && part.endsWith("__")) {
      return <u key={i}>{part.slice(2, -2)}</u>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
