import type { Note } from "../types";

export type VoiceAssistantCommand =
  | { type: "open"; title: string }
  | { type: "create"; title: string }
  | { type: "fill" };

const OPEN_VERBS =
  "(?:открой(?:те)?|открыть|открои|откро(?:й|йте)|open)";
const CREATE_VERBS =
  "(?:создай(?:те)?|создать|создаи|сделай(?:те)?|добавь(?:те)?|добавить|созда(?:й|ть)|create)";
const FILL_VERBS = "(?:заполни(?:ть)?|заполн(?:и|ить)|надиктуй(?:те)?|диктуй(?:те)?|fill)";
const NOTE_WORD = "заметк(?:у|и|а|ой)";
const TITLE_SEP = "[,;:\\-–—]+";

function normalizeTranscript(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[«»„""]/g, '"')
    .replace(/ё/gi, "е")
    .replace(/\.+$/g, "")
    .trim();
}

function extractTitle(rest: string): string {
  let title = rest.trim();
  const quoted = title.match(/^["'](.+?)["']\s*$/);
  if (quoted?.[1]) return quoted[1].trim();

  title = title.replace(new RegExp(`^${TITLE_SEP}\\s*`), "").replace(new RegExp(`\\s*${TITLE_SEP}$`), "");
  title = title.replace(/^\s*(?:название|с\s+названием)\s+/i, "");
  return title.trim();
}

function parseSingleSegment(segment: string): VoiceAssistantCommand | null {
  const text = normalizeTranscript(segment);
  if (!text) return null;

  const lower = text.toLowerCase();

  if (new RegExp(`^${FILL_VERBS}\\s+${NOTE_WORD}\\s*\\.?$`, "i").test(lower)) {
    return { type: "fill" };
  }

  const openRe = new RegExp(
    `${OPEN_VERBS}\\s+${NOTE_WORD}\\s*(?:${TITLE_SEP}\\s*)?(.+)$`,
    "i"
  );
  const openMatch = text.match(openRe);
  if (openMatch?.[1]) {
    const title = extractTitle(openMatch[1]);
    if (title.length >= 1) return { type: "open", title };
  }

  const createRe = new RegExp(
    `${CREATE_VERBS}\\s+${NOTE_WORD}\\s*(?:${TITLE_SEP}\\s*)?(.+)$`,
    "i"
  );
  const createMatch = text.match(createRe);
  if (createMatch?.[1]) {
    const title = extractTitle(createMatch[1]);
    if (title.length >= 1) return { type: "create", title };
  }

  const newNoteRe = /^новая\s+заметк\w*\s*(?:[:,;\-–—]\s*)?(.+)$/i;
  const newNoteMatch = text.match(newNoteRe);
  if (newNoteMatch?.[1]) {
    const title = extractTitle(newNoteMatch[1]);
    if (title.length >= 1) return { type: "create", title };
  }

  return null;
}

function splitIntoSegments(text: string): string[] {
  const normalized = normalizeTranscript(text);
  const bySentence = normalized
    .split(/\.\s+|\?\s+|\!\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (bySentence.length > 1) return bySentence;

  const byRepeat = normalized.split(
    new RegExp(`(?=${OPEN_VERBS}\\s+${NOTE_WORD}|${CREATE_VERBS}\\s+${NOTE_WORD})`, "i")
  );
  const trimmed = byRepeat.map((s) => s.trim()).filter(Boolean);
  return trimmed.length > 1 ? trimmed : [normalized];
}

export function parseVoiceAssistantCommand(raw: string): VoiceAssistantCommand | null {
  const segments = splitIntoSegments(raw);

  for (const segment of segments) {
    const cmd = parseSingleSegment(segment);
    if (cmd) return cmd;
  }

  return parseSingleSegment(raw);
}

export function looksLikeVoiceCommand(raw: string): boolean {
  const lower = normalizeTranscript(raw).toLowerCase();
  if (!lower) return false;
  return (
    new RegExp(OPEN_VERBS, "i").test(lower) ||
    new RegExp(CREATE_VERBS, "i").test(lower) ||
    new RegExp(FILL_VERBS, "i").test(lower) ||
    /^новая\s+заметк/i.test(lower)
  );
}

export function looksLikeIncompleteCommand(raw: string): boolean {
  const text = normalizeTranscript(raw).toLowerCase();
  if (!text || parseVoiceAssistantCommand(text)) return false;
  return (
    /(?:созда|откр|заполн|сделай|добавь|новая\s+заметк)/i.test(text) &&
    !/\s+заметк\w*\s+.+$/i.test(text)
  );
}

function normalizeTitleKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findNoteByTitle(notes: Note[], title: string): Note | null {
  const needle = normalizeTitleKey(title);
  if (!needle) return null;

  const exact = notes.filter((n) => normalizeTitleKey(n.title) === needle);
  if (exact.length) {
    return exact.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0]!;
  }

  const contains = notes.filter((n) => {
    const hay = normalizeTitleKey(n.title);
    return hay.includes(needle) || needle.includes(hay);
  });
  if (contains.length) {
    return contains.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0]!;
  }

  return null;
}
