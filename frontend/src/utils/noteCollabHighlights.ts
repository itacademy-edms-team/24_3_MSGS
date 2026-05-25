import { findPlainRangeInRendered, createRangeFromPlainOffsets } from "./noteCommentHighlights";

export type CollabRemoteFlash = {
  id: string;
  mdStart: number;
  mdEnd: number;
  author: string;
  userId: number;
};

const USER_HIGHLIGHT_COLORS = [
  { bg: "rgba(76, 61, 247, 0.32)", border: "rgba(76, 61, 247, 0.55)" },
  { bg: "rgba(5, 150, 105, 0.28)", border: "rgba(5, 150, 105, 0.5)" },
  { bg: "rgba(217, 119, 6, 0.28)", border: "rgba(217, 119, 6, 0.5)" },
  { bg: "rgba(225, 29, 72, 0.22)", border: "rgba(225, 29, 72, 0.45)" },
  { bg: "rgba(2, 132, 199, 0.26)", border: "rgba(2, 132, 199, 0.48)" }
];

export function colorForCollabUser(userId: number) {
  const idx = Math.abs(userId) % USER_HIGHLIGHT_COLORS.length;
  return USER_HIGHLIGHT_COLORS[idx]!;
}

/** Вставки в markdown при изменении текста другим участником */
export function computeMarkdownInsertions(
  oldMarkdown: string,
  newMarkdown: string
): Array<{ start: number; end: number }> {
  if (oldMarkdown === newMarkdown) return [];

  let prefix = 0;
  const minLen = Math.min(oldMarkdown.length, newMarkdown.length);
  while (prefix < minLen && oldMarkdown[prefix] === newMarkdown[prefix]) {
    prefix++;
  }

  let oldSuffix = oldMarkdown.length;
  let newSuffix = newMarkdown.length;
  while (
    oldSuffix > prefix &&
    newSuffix > prefix &&
    oldMarkdown[oldSuffix - 1] === newMarkdown[newSuffix - 1]
  ) {
    oldSuffix--;
    newSuffix--;
  }

  if (newSuffix > prefix) {
    return [{ start: prefix, end: newSuffix }];
  }

  return [];
}

export function unwrapCollabRemoteHighlights(container: HTMLElement): void {
  let found = true;
  while (found) {
    found = false;
    container.querySelectorAll(".collab-remote-highlight").forEach((span) => {
      const inner = span.querySelector(".collab-remote-highlight-inner");
      const parent = span.parentNode;
      if (!inner || !parent) return;
      while (inner.firstChild) {
        parent.insertBefore(inner.firstChild, span);
      }
      parent.removeChild(span);
      found = true;
    });
  }
  container.normalize();
}

function wrapCollabFlashRange(
  range: Range,
  flash: CollabRemoteFlash
): boolean {
  try {
    const colors = colorForCollabUser(flash.userId);
    const span = document.createElement("span");
    span.className = "collab-remote-highlight";
    span.setAttribute("data-collab-flash-id", flash.id);
    span.style.backgroundColor = colors.bg;
    span.style.boxShadow = `0 0 0 1px ${colors.border}`;

    const label = document.createElement("span");
    label.className = "collab-remote-label";
    label.textContent = flash.author;
    label.title = `${flash.author} добавил этот фрагмент`;

    const inner = document.createElement("span");
    inner.className = "collab-remote-highlight-inner";
    inner.appendChild(range.extractContents());

    span.appendChild(label);
    span.appendChild(inner);
    range.insertNode(span);
    return true;
  } catch {
    return false;
  }
}

export function applyCollabRemoteHighlights(
  container: HTMLElement,
  markdown: string,
  flashes: CollabRemoteFlash[]
): void {
  unwrapCollabRemoteHighlights(container);

  if (!flashes.length) return;

  const sorted = [...flashes].sort((a, b) => b.mdStart - a.mdStart);
  const fullText = container.textContent || "";

  for (const flash of sorted) {
    if (flash.mdEnd <= flash.mdStart) continue;
    const plain = findPlainRangeInRendered(fullText, markdown, flash.mdStart, flash.mdEnd);
    if (!plain) continue;
    const range = createRangeFromPlainOffsets(container, plain.plainStart, plain.plainEnd);
    if (!range || !container.contains(range.commonAncestorContainer)) continue;
    wrapCollabFlashRange(range, flash);
  }
}
