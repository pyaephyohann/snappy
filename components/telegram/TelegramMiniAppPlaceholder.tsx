"use client";

type TelegramMiniAppPlaceholderProps = {
  emoji: string;
  title: string;
  description: string;
  footnote?: string;
};

export default function TelegramMiniAppPlaceholder({
  emoji,
  title,
  description,
  footnote = "Coming next.",
}: TelegramMiniAppPlaceholderProps) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-4xl" aria-hidden>
        {emoji}
      </p>
      <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      <p className="mt-6 text-xs text-muted-foreground">{footnote}</p>
    </div>
  );
}
