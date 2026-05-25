const WAKE_PATTERNS = [
  /голосовой\s+ввод/i,
  /голосовой\s+помощник/i,
  /голосовое\s+управление/i
];

function normalizeSpeechText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").replace(/ё/gi, "е").toLowerCase();
}

export function containsWakePhrase(raw: string): boolean {
  const text = normalizeSpeechText(raw);
  if (!text) return false;
  return WAKE_PATTERNS.some((pattern) => pattern.test(text));
}

export function stripWakePhrase(raw: string): string {
  let result = raw.trim();
  for (const pattern of WAKE_PATTERNS) {
    result = result.replace(pattern, " ");
  }
  return result.replace(/\s+/g, " ").trim();
}
