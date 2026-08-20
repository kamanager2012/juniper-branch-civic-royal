import { cn } from "@/lib/utils";

export function HighlightedText({
  text,
  active,
  className,
}: {
  text: string;
  active: number;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <p className={cn("text-pretty leading-[1.7] tracking-wide", className)}>
      {chars.map((ch, i) => (
        <span key={`${i}-${ch}`} className={cn("transition-colors duration-150", i <= active && i >= 0 && "char-on")}>
          {ch}
        </span>
      ))}
    </p>
  );
}
