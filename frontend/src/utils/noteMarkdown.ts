/** Безопасное имя файла без расширения */
export function sanitizeFileBaseName(title: string): string {
  const base = title.trim().replace(/[/\\?%*:|"<>]/g, "-").replace(/\s+/g, " ").slice(0, 120);
  return base || "note";
}

/** Скачать один .md-файл в браузере */
export function downloadMarkdownFile(fileBaseName: string, content: string, options?: { uniqueId?: number }) {
  const safe = sanitizeFileBaseName(fileBaseName);
  const name =
    options?.uniqueId != null ? `${safe}-${options.uniqueId}.md` : `${safe}.md`;
  const body = buildMarkdownExport(fileBaseName.trim() || "Без названия", content);
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Экспорт с YAML-шапкой для обратного импорта */
export function buildMarkdownExport(title: string, content: string): string {
  const t = title.trim() || "Без названия";
  return `---\ntitle: ${JSON.stringify(t)}\n---\n\n${content}`;
}

/** Разбор импортированного .md: front matter, затем заголовок #, иначе имя файла */
export function parseMarkdownImport(raw: string, fileName: string): { title: string; content: string } {
  let text = raw.replace(/^\uFEFF/, "");
  const fromName = fileName.replace(/\.md$/i, "").trim() || "Импорт";

  if (text.startsWith("---")) {
    const end = text.indexOf("\n---", 3);
    if (end !== -1) {
      const block = text.slice(3, end);
      const titleLine = block.match(/^\s*title:\s*(.+)$/m);
      if (titleLine) {
        let t = titleLine[1]?.trim() ?? "";
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
          try {
            t = JSON.parse(t) as string;
          } catch {
            t = t.slice(1, -1);
          }
        }
        const body = text.slice(end + 4).replace(/^\r?\n/, "");
        if (t) {
          return { title: t, content: body.trimEnd() };
        }
      }
    }
  }

  const lines = text.split(/\r?\n/);
  const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
  if (firstNonEmpty === -1) {
    return { title: fromName, content: "" };
  }
  const first = lines[firstNonEmpty]?.trim() ?? "";
  const h1 = first.match(/^#\s+(.+)$/);
  if (h1?.[1]) {
    const title = h1[1].trim();
    const rest = lines.slice(firstNonEmpty + 1).join("\n").trimStart();
    return { title, content: rest };
  }

  return { title: fromName, content: text.trimEnd() };
}
