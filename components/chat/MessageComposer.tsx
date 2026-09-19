"use client";

import { useId, useRef, useState } from "react";
import { MAX_MESSAGE_CODE_POINTS } from "@/lib/chat-validation";

export default function MessageComposer({
  disabled,
  sending,
  onSend,
}: {
  disabled: boolean;
  sending: boolean;
  onSend: (content: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const inputId = useId();
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const codePointCount = [...draft].length;
  const overLimit = codePointCount > MAX_MESSAGE_CODE_POINTS;

  async function submit() {
    const content = draft.trim();
    if (!content || overLimit || disabled || sending) return;
    const sent = await onSend(content);
    if (sent) {
      setDraft("");
      inputRef.current?.focus();
    }
  }

  return (
    <form
      className="shrink-0 border-t border-border bg-card p-3 sm:px-5"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-end gap-2">
        <label htmlFor={inputId} className="sr-only">Write a message</label>
        <textarea
          ref={inputRef}
          id={inputId}
          value={draft}
          rows={1}
          disabled={disabled || sending}
          maxLength={MAX_MESSAGE_CODE_POINTS * 2}
          placeholder="Write a message…"
          enterKeyHint="send"
          aria-describedby={`${helpId}${overLimit ? ` ${errorId}` : ""}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-base leading-5 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button type="submit" disabled={disabled || sending || !draft.trim() || overLimit} className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50" aria-label={sending ? "Sending message" : "Send message"}>
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <div id={helpId} className="mt-1 flex justify-end text-[11px] text-muted-foreground">
        <span className={overLimit ? "text-destructive" : undefined}>{codePointCount}/{MAX_MESSAGE_CODE_POINTS}</span>
      </div>
      {overLimit ? <p id={errorId} className="text-right text-xs text-destructive" role="alert">Message is too long.</p> : null}
    </form>
  );
}
