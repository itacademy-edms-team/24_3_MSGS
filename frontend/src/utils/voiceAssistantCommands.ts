import type { Note } from "../types";

export type VoiceAssistantCommand =
  | { type: "open"; title: string }
  | { type: "create"; title: string }
  | { type: "fill" }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "lineBreak"; kind: "paragraph" | "line" }
  | { type: "bulletList"; items?: string[] }
  | { type: "orderedList"; items?: string[] };

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

function extractPhrase(rest: string): string {
  return extractTitle(rest);
}

const HIGHLIGHT_VERBS = "(?:выдели(?:ть)?|выдели)";
const OPTIONAL_TEXT = "(?:текст\\s+)?";
const PHRASE_TAIL = `(?:${TITLE_SEP}\\s*)?(.+)$`;

const BOLD_STYLE =
  "жирн(?:ым|ным|ный|ного|ной|ное|ной|ий|ого|ая|ое|ые|ый)?(?:\\s+шрифтом)?";
const ITALIC_STYLE =
  "курсив(?:ом|ом|ный|ного|ной|ное|ной|ая|ое|ые)?(?:\\s+шрифтом)?";

function tryParseFormattedText(
  text: string,
  style: string,
  type: "bold" | "italic"
): VoiceAssistantCommand | null {
  const patterns = [
    new RegExp(`^${HIGHLIGHT_VERBS}\\s+${OPTIONAL_TEXT}${style}\\s*${OPTIONAL_TEXT}${PHRASE_TAIL}`, "i"),
    new RegExp(`^${HIGHLIGHT_VERBS}\\s+${style}\\s+${OPTIONAL_TEXT}${PHRASE_TAIL}`, "i"),
    new RegExp(`^${style}\\s+${OPTIONAL_TEXT}${PHRASE_TAIL}`, "i")
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) {
      const phrase = extractPhrase(match[1]);
      if (phrase) return { type, text: phrase };
    }
  }

  return null;
}

const LIST_VERBS = "(?:добавь(?:те)?|создай(?:те)?|сделай(?:те)?|вставь(?:те)?|сформируй(?:те)?)?\\s*";
const ORDERED_LIST = "нумерованн(?:ый|ого|ому|ая|ое|ые)?\\s+список";
const BULLET_LIST = "(?:маркированн(?:ый|ого|ому|ая|ое|ые)?\\s+)?список";

/** Разбивает фразу на пункты списка; убирает лишнее «список» от распознавания речи */
export function splitListItems(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((part) =>
      part
        .trim()
        .replace(
          /^(?:список|маркированн(?:ый|ого)?\s+список|нумерованн(?:ый|ого)?\s+список)\s+/i,
          ""
        )
        .trim()
    )
    .filter((part) => part.length > 0 && !/^список$/i.test(part));
}

function tryParseListCommand(
  text: string,
  listPattern: string,
  type: "bulletList" | "orderedList"
): VoiceAssistantCommand | null {
  const patterns = [
    new RegExp(`^${LIST_VERBS}${listPattern}\\s*\\.?$`, "i"),
    new RegExp(`^${LIST_VERBS}${listPattern}\\s*${PHRASE_TAIL}`, "i"),
    new RegExp(`^${LIST_VERBS}${listPattern}\\s+(.+)$`, "i"),
    new RegExp(`^${listPattern}\\s*\\.?$`, "i"),
    new RegExp(`^${listPattern}\\s*${PHRASE_TAIL}`, "i"),
    new RegExp(`^${listPattern}\\s+(.+)$`, "i")
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (!match) continue;
    if (match[1]) {
      const phrase = extractPhrase(match[1]);
      const items = splitListItems(phrase);
      if (items.length) return { type, items };
    }
    return { type };
  }

  return null;
}

function parseSingleSegment(segment: string): VoiceAssistantCommand | null {
  const text = normalizeTranscript(segment);
  if (!text) return null;

  const lower = text.toLowerCase();

  if (/^(?:абзац|новый\s+абзац)\s*\.?$/i.test(lower)) {
    return { type: "lineBreak", kind: "paragraph" };
  }

  if (/^(?:перенос\s+строки|новая\s+строка|перенос)\s*\.?$/i.test(lower)) {
    return { type: "lineBreak", kind: "line" };
  }

  const boldCmd = tryParseFormattedText(text, BOLD_STYLE, "bold");
  if (boldCmd) return boldCmd;

  const italicCmd = tryParseFormattedText(text, ITALIC_STYLE, "italic");
  if (italicCmd) return italicCmd;

  const orderedListCmd = tryParseListCommand(text, ORDERED_LIST, "orderedList");
  if (orderedListCmd) return orderedListCmd;

  const bulletListCmd = tryParseListCommand(text, BULLET_LIST, "bulletList");
  if (bulletListCmd) return bulletListCmd;

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
    .split(/\.\s+|\?\s+|!\s+/)
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
    /^новая\s+заметк/i.test(lower) ||
    /выдели(?:ть)?\s+.*жирн/i.test(lower) ||
    /выдели(?:ть)?\s+.*курсив/i.test(lower) ||
    /выдели(?:ть)?\s+текст\s+жирн/i.test(lower) ||
    /выдели(?:ть)?\s+текст\s+курсив/i.test(lower) ||
    /^жирн/i.test(lower) ||
    /^курсив/i.test(lower) ||
    /^(?:абзац|перенос|новая\s+строка|новый\s+абзац)/i.test(lower) ||
    /нумерованн(?:ый|ого)?\s+список/i.test(lower) ||
    /(?:маркированн(?:ый|ого)?\s+)?список/i.test(lower)
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
