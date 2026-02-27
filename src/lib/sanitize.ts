const CONTROL_CHARACTERS_REGEX = /[\u0000-\u001F\u007F]/g;

export function sanitizeMessageContent(rawContent: string): string {
  return rawContent
    .replace(CONTROL_CHARACTERS_REGEX, "")
    .replace(/[<>]/g, "")
    .trim();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
