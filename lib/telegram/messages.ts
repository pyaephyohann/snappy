export const START_MESSAGE = [
  "📸 Welcome to Snappy!",
  "",
  "Share and discover moments with your friends.",
  "",
  "Commands:",
  "/find — Find a Snap",
  "/upload — Upload a Snap",
  "/help — Show available commands",
].join("\n");

export const HELP_MESSAGE = [
  "Snappy Telegram commands:",
  "",
  "/start — Introduction and shortcuts",
  "/find — Find a Snap by its Snap code",
  "/upload — Upload a Snap (coming soon)",
  "/help — Show this message",
  "",
  "Use the buttons below, or open Snappy on the web.",
].join("\n");

export const FIND_PROMPT_MESSAGE = [
  "🔎 Find a Snap",
  "",
  "Send me the Snap code and I'll find it for you.",
].join("\n");

export const FIND_NOT_FOUND_MESSAGE = [
  "🔎 Snap not found",
  "",
  "I couldn't find a Snap with that code.",
  "Please check the code and try again.",
].join("\n");

export const FIND_INVALID_CODE_MESSAGE = [
  "That doesn't look like a valid Snap code.",
  "",
  "Send the Snap code exactly as shown in Snappy (for example, a code starting with \"c\").",
].join("\n");

export const FIND_LOOKUP_ERROR_MESSAGE =
  "Something went wrong while looking up that Snap. Please try again in a moment.";

export function formatFindFoundMessage(options: {
  creatorName: string;
  createdLabel: string;
  caption: string | null;
  viewUrl: string | null;
}): string {
  const lines = [
    "📸 Snap found!",
    "",
    `👤 Creator: ${options.creatorName}`,
    `📅 ${options.createdLabel}`,
  ];
  if (options.caption?.trim()) {
    lines.push("", options.caption.trim());
  }
  if (!options.viewUrl) {
    lines.push(
      "",
      "Open Snappy on the web to view this Snap (public URL is not configured).",
    );
  }
  return lines.join("\n");
}

export const UPLOAD_MESSAGE = [
  "📤 Upload Snap",
  "",
  "Snap uploads through Telegram will be available here soon.",
].join("\n");

export const UNKNOWN_COMMAND_MESSAGE =
  "Unknown command. Send /help to see what I can do.";
