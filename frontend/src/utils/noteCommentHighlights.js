function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/** Ищет в plain text предпросмотра участок, соответствующий подстроке markdown */
export function findPlainRangeInRendered(fullText, markdown, selStart, selEnd) {
    const targetText = markdown.substring(selStart, selEnd);
    if (!targetText.trim())
        return null;
    let pos = fullText.indexOf(targetText);
    if (pos !== -1) {
        return { plainStart: pos, plainEnd: pos + targetText.length };
    }
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const normFull = norm(fullText);
    const normTarget = norm(targetText);
    const posNorm = normFull.indexOf(normTarget);
    if (posNorm === -1)
        return null;
    let normIdx = 0;
    let startInFull = -1;
    for (let i = 0; i < fullText.length; i++) {
        const c = fullText.charAt(i);
        if (normIdx === posNorm) {
            startInFull = i;
            break;
        }
        if (/\s/.test(c)) {
            if (normIdx > 0 && normFull.charAt(normIdx - 1) !== " ")
                normIdx++;
        }
        else {
            normIdx++;
        }
    }
    if (startInFull === -1)
        return null;
    let acc = "";
    let endInFull = startInFull;
    for (let i = startInFull; i <= fullText.length; i++) {
        acc = norm(fullText.slice(startInFull, i));
        if (acc === normTarget) {
            endInFull = i;
            break;
        }
        if (acc.length > normTarget.length + 2)
            break;
    }
    if (endInFull <= startInFull) {
        endInFull = Math.min(startInFull + targetText.length, fullText.length);
    }
    return { plainStart: startInFull, plainEnd: endInFull };
}
function createRangeFromPlainOffsets(root, plainStart, plainEnd) {
    if (plainEnd <= plainStart)
        return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let charCount = 0;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    let node;
    while ((node = walker.nextNode())) {
        const len = node.textContent?.length || 0;
        if (startNode == null && charCount + len > plainStart) {
            startNode = node;
            startOff = plainStart - charCount;
        }
        if (charCount + len >= plainEnd) {
            endNode = node;
            endOff = plainEnd - charCount;
            break;
        }
        charCount += len;
    }
    if (!startNode || !endNode)
        return null;
    try {
        const range = document.createRange();
        range.setStart(startNode, Math.min(startOff, startNode.textContent?.length ?? 0));
        range.setEnd(endNode, Math.min(endOff, endNode.textContent?.length ?? 0));
        if (range.collapsed)
            return null;
        return range;
    }
    catch {
        return null;
    }
}
function wrapCommentRange(range, comment, expanded) {
    try {
        const span = document.createElement("span");
        span.className =
            "note-comment-highlight" + (expanded ? " note-comment-highlight--expanded" : "");
        span.setAttribute("data-comment-id", String(comment.id));
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "note-comment-pin";
        btn.textContent = expanded ? "▲" : "▼";
        btn.setAttribute("aria-expanded", expanded ? "true" : "false");
        btn.setAttribute("aria-label", expanded ? "Свернуть комментарий" : "Показать комментарий");
        const inner = document.createElement("span");
        inner.className = "note-comment-highlight-inner";
        const row = document.createElement("span");
        row.className = "note-comment-highlight-row";
        const contents = range.extractContents();
        inner.appendChild(contents);
        row.appendChild(btn);
        row.appendChild(inner);
        span.appendChild(row);
        const pop = document.createElement("div");
        pop.className = "note-comment-inline-popover";
        pop.innerHTML = `<div class="note-comment-inline-popover-author">${escapeHtml(comment.username)}</div><div class="note-comment-inline-popover-text">${escapeHtml(comment.content)}</div>`;
        if (!expanded)
            pop.setAttribute("hidden", "");
        span.appendChild(pop);
        range.insertNode(span);
        return true;
    }
    catch {
        return false;
    }
}
/** Убирает ранее добавленные обёртки перед повторным применением */
export function unwrapNoteCommentHighlights(container) {
    let found = true;
    while (found) {
        found = false;
        container.querySelectorAll(".note-comment-highlight").forEach((span) => {
            const inner = span.querySelector(".note-comment-highlight-inner");
            const parent = span.parentNode;
            if (!inner || !parent)
                return;
            while (inner.firstChild) {
                parent.insertBefore(inner.firstChild, span);
            }
            parent.removeChild(span);
            found = true;
        });
    }
    container.normalize();
}
/**
 * Оборачивает в предпросмотре заметки фрагменты с комментариями (по selection в markdown).
 * Комментарии с большим selectionStart обрабатываются первыми, чтобы не ломать смещения.
 */
export function applyNoteCommentHighlights(container, markdown, comments, expandedIds) {
    unwrapNoteCommentHighlights(container);
    const withSel = comments.filter((c) => c.selectionStart != null && c.selectionEnd != null && c.selectionEnd > c.selectionStart);
    if (!withSel.length)
        return;
    const sorted = [...withSel].sort((a, b) => b.selectionStart - a.selectionStart);
    for (const comment of sorted) {
        const fullText = container.textContent || "";
        const plain = findPlainRangeInRendered(fullText, markdown, comment.selectionStart, comment.selectionEnd);
        if (!plain)
            continue;
        const range = createRangeFromPlainOffsets(container, plain.plainStart, plain.plainEnd);
        if (!range || !container.contains(range.commonAncestorContainer))
            continue;
        wrapCommentRange(range, comment, expandedIds.has(comment.id));
    }
}
