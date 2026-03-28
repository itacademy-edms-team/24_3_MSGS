import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import AppSidebarNav from "../components/AppSidebarNav";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
const emptyEditor = { title: "", content: "" };
const AUTOSAVE_DEBOUNCE_MS = 1200;
export default function DashboardPage() {
    const { token } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [folders, setFolders] = useState([]);
    const [notes, setNotes] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [editor, setEditor] = useState(emptyEditor);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [folderForm, setFolderForm] = useState({
        name: "",
        parentId: ""
    });
    const [comments, setComments] = useState([]);
    const [expandedComments, setExpandedComments] = useState(new Set());
    const [selectedText, setSelectedText] = useState(null);
    const [commentInput, setCommentInput] = useState("");
    const [showComments, setShowComments] = useState(false);
    const contentTextareaRef = useRef(null);
    const loadedNoteIdRef = useRef(null);
    const savedSnapshotRef = useRef({ title: "", content: "" });
    const editorRef = useRef(emptyEditor);
    editorRef.current = editor;
    const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) ?? null, [notes, selectedNoteId]);
    const filteredNotes = useMemo(() => {
        return notes.filter((note) => {
            const matchesFolder = selectedFolderId ? note.folderId === selectedFolderId : true;
            const matchesSearch = note.title.toLowerCase().includes(search.toLowerCase());
            return matchesFolder && matchesSearch;
        });
    }, [notes, selectedFolderId, search]);
    const showStatus = (message, timeout = 4000) => {
        setStatus(message);
        if (timeout > 0) {
            setTimeout(() => setStatus(null), timeout);
        }
    };
    const handleError = useCallback((error) => {
        const message = error instanceof Error ? error.message : "Что-то пошло не так";
        showStatus(message, 6000);
    }, []);
    const loadFolders = useCallback(async () => {
        if (!token)
            return;
        const response = await api.getFolders(token);
        setFolders(response);
    }, [token]);
    const loadNotes = useCallback(async () => {
        if (!token)
            return;
        const response = await api.getNotes(token);
        setNotes(response);
        if (response.length && !selectedNoteId) {
            const firstNote = response[0];
            if (firstNote) {
                setSelectedNoteId(firstNote.id);
            }
        }
    }, [token, selectedNoteId]);
    const loadComments = useCallback(async (noteId) => {
        if (!token)
            return;
        try {
            const data = await api.getNoteComments(token, noteId);
            setComments(data);
        }
        catch {
            // Игнорируем ошибки загрузки комментариев
        }
    }, [token]);
    useEffect(() => {
        setLoading(true);
        Promise.all([loadFolders(), loadNotes()])
            .catch(handleError)
            .finally(() => setLoading(false));
    }, [loadFolders, loadNotes, handleError]);
    // Обработка параметра noteId из URL
    useEffect(() => {
        const noteIdParam = searchParams.get("noteId");
        if (noteIdParam && notes.length > 0) {
            const noteId = parseInt(noteIdParam, 10);
            if (!isNaN(noteId)) {
                const note = notes.find((n) => n.id === noteId);
                if (note) {
                    setSelectedNoteId(noteId);
                    // Убираем параметр из URL после открытия заметки
                    setSearchParams({});
                }
            }
        }
    }, [notes, searchParams, setSearchParams]);
    useEffect(() => {
        if (!selectedNoteId) {
            loadedNoteIdRef.current = null;
            setEditor(emptyEditor);
            savedSnapshotRef.current = { title: "", content: "" };
            setComments([]);
            return;
        }
        const note = notes.find((n) => n.id === selectedNoteId);
        if (!note)
            return;
        if (loadedNoteIdRef.current !== selectedNoteId) {
            loadedNoteIdRef.current = selectedNoteId;
            const payload = { title: note.title, content: note.content };
            setEditor(payload);
            savedSnapshotRef.current = { ...payload };
            void loadComments(selectedNoteId);
        }
    }, [selectedNoteId, notes, loadComments]);
    const handleSelectNote = (noteId) => {
        setSelectedNoteId(noteId);
    };
    const persistNote = useCallback(async (options) => {
        if (!token || !selectedNoteId)
            return;
        const ed = editorRef.current;
        const title = ed.title || "Без названия";
        const content = ed.content;
        if (title === savedSnapshotRef.current.title &&
            content === savedSnapshotRef.current.content) {
            return;
        }
        setSaving(true);
        try {
            await api.updateNote(token, selectedNoteId, {
                title,
                content,
                folderId: selectedFolderId
            });
            const updatedAt = new Date().toISOString();
            savedSnapshotRef.current = { title, content };
            setNotes((prev) => prev.map((note) => note.id === selectedNoteId
                ? { ...note, title, content, folderId: selectedFolderId ?? null, updatedAt }
                : note));
            if (!options?.silent) {
                showStatus("Заметка сохранена");
            }
        }
        catch (error) {
            handleError(error);
        }
        finally {
            setSaving(false);
        }
    }, [token, selectedNoteId, selectedFolderId, handleError]);
    useEffect(() => {
        if (!token || !selectedNoteId || loading)
            return;
        const timer = window.setTimeout(() => {
            void persistNote({ silent: true });
        }, AUTOSAVE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [
        editor.title,
        editor.content,
        selectedFolderId,
        selectedNoteId,
        token,
        loading,
        persistNote
    ]);
    const handleCreateNote = async () => {
        if (!token)
            return;
        setSaving(true);
        try {
            const newNote = await api.createNote(token, {
                title: "Новая заметка",
                content: "## Добро пожаловать\n\nНачните писать здесь ✍️",
                folderId: selectedFolderId
            });
            setNotes((prev) => [newNote, ...prev]);
            setSelectedNoteId(newNote.id);
            showStatus("Заметка создана");
        }
        catch (error) {
            handleError(error);
        }
        finally {
            setSaving(false);
        }
    };
    const handleSaveNote = () => {
        void persistNote();
    };
    const handleDeleteNote = async (id) => {
        if (!token)
            return;
        if (!confirm("Удалить заметку без возможности восстановления?")) {
            return;
        }
        try {
            await api.deleteNote(token, id);
            setNotes((prev) => prev.filter((note) => note.id !== id));
            if (selectedNoteId === id) {
                setSelectedNoteId(null);
                setEditor(emptyEditor);
                savedSnapshotRef.current = { title: "", content: "" };
            }
            showStatus("Заметка удалена");
        }
        catch (error) {
            handleError(error);
        }
    };
    const handleCreateFolder = async (event) => {
        event.preventDefault();
        if (!token || !folderForm.name.trim())
            return;
        try {
            const newFolder = await api.createFolder(token, {
                name: folderForm.name.trim(),
                parentId: folderForm.parentId ? Number(folderForm.parentId) : null
            });
            setFolders((prev) => [...prev, newFolder]);
            setFolderForm({ name: "", parentId: "" });
            showStatus("Папка создана");
        }
        catch (error) {
            handleError(error);
        }
    };
    const handleDeleteFolder = async (id) => {
        if (!token)
            return;
        if (!confirm("Удалить папку вместе со всеми вложенными заметками?")) {
            return;
        }
        try {
            await api.deleteFolder(token, id);
            setFolders((prev) => prev.filter((folder) => folder.id !== id));
            setNotes((prev) => prev.filter((note) => note.folderId !== id));
            if (selectedFolderId === id) {
                setSelectedFolderId(null);
            }
            showStatus("Папка удалена");
        }
        catch (error) {
            handleError(error);
        }
    };
    const folderName = (folderId) => {
        if (!folderId)
            return "Без папки";
        return folders.find((f) => f.id === folderId)?.name ?? "Без папки";
    };
    const appendTranscriptToContent = useCallback((text) => {
        setEditor((prev) => {
            const ta = contentTextareaRef.current;
            const start = ta?.selectionStart ?? prev.content.length;
            const end = ta?.selectionEnd ?? prev.content.length;
            const before = prev.content.slice(0, start);
            const after = prev.content.slice(end);
            const needsSpace = before.length > 0 &&
                !/\s$/.test(before) &&
                text.length > 0 &&
                !/^\s/.test(text);
            const piece = (needsSpace ? " " : "") + text;
            const next = before + piece + after;
            const caret = before.length + piece.length;
            requestAnimationFrame(() => {
                const el = contentTextareaRef.current;
                if (el) {
                    el.focus();
                    el.setSelectionRange(caret, caret);
                }
            });
            return { ...prev, content: next };
        });
    }, []);
    const { supported: voiceSupported, listening: voiceListening, toggle: toggleVoiceInput } = useVoiceDictation(appendTranscriptToContent, {
        lang: "ru-RU",
        onNotify: showStatus
    });
    const handleAddComment = async () => {
        if (!token || !selectedNote || !selectedText || !commentInput.trim())
            return;
        try {
            await api.sendMessage(token, {
                content: commentInput.trim(),
                noteId: selectedNote.id,
                selectionStart: selectedText.start,
                selectionEnd: selectedText.end
            });
            setCommentInput("");
            setSelectedText(null);
            showStatus("Комментарий добавлен");
            loadComments(selectedNote.id);
        }
        catch (error) {
            showStatus(error instanceof Error ? error.message : "Ошибка добавления комментария", 6000);
        }
    };
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435..." })] }));
    }
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsx(AppSidebarNav, {}), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u041F\u0430\u043F\u043A\u0438" }), _jsx("span", { className: "badge", children: folders.length })] }), _jsxs("form", { className: "folder-form", onSubmit: handleCreateFolder, children: [_jsx("input", { type: "text", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0430\u043F\u043A\u0438", value: folderForm.name, onChange: (e) => setFolderForm((prev) => ({ ...prev, name: e.target.value })), required: true }), _jsxs("select", { value: folderForm.parentId, onChange: (e) => setFolderForm((prev) => ({ ...prev, parentId: e.target.value })), children: [_jsx("option", { value: "", children: "\u041A\u043E\u0440\u043D\u0435\u0432\u0430\u044F \u043F\u0430\u043F\u043A\u0430" }), folders.map((folder) => (_jsx("option", { value: folder.id, children: folder.name }, folder.id)))] }), _jsx("button", { type: "submit", className: "btn secondary", children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] }), _jsxs("ul", { className: "folder-list", children: [_jsxs("li", { className: !selectedFolderId ? "active" : "", onClick: () => setSelectedFolderId(null), children: [_jsx("span", { children: "\u0412\u0441\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx("span", { className: "badge light", children: notes.length })] }), folders.map((folder) => (_jsxs("li", { className: selectedFolderId === folder.id ? "active" : "", onClick: () => setSelectedFolderId(folder.id), children: [_jsx("span", { children: folder.name }), _jsxs("div", { className: "folder-meta", children: [_jsx("span", { className: "badge light", children: notes.filter((note) => note.folderId === folder.id).length }), _jsx("button", { className: "icon-btn", type: "button", onClick: (e) => {
                                                            e.stopPropagation();
                                                            handleDeleteFolder(folder.id);
                                                        }, children: "\u00D7" })] })] }, folder.id)))] })] })] }), _jsxs("section", { className: "notes-panel", children: [_jsxs("header", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedFolderId ? folderName(selectedFolderId) : "Все заметки" }), _jsxs("p", { children: [filteredNotes.length, " \u0437\u0430\u043C\u0435\u0442\u043E\u043A"] })] }), _jsxs("div", { className: "panel-actions", children: [_jsx("input", { type: "search", placeholder: "\u041F\u043E\u0438\u0441\u043A...", value: search, onChange: (e) => setSearch(e.target.value) }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, disabled: saving, children: "+ \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430" })] })] }), _jsxs("ul", { className: "notes-list", children: [filteredNotes.map((note) => (_jsxs("li", { className: selectedNoteId === note.id ? "active" : "", onClick: () => handleSelectNote(note.id), children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: note.title || "Без названия" }), _jsxs("p", { className: "note-meta", children: [new Date(note.updatedAt).toLocaleString(), " \u2022 ", folderName(note.folderId ?? null)] })] }), _jsx("button", { className: "icon-btn", onClick: (e) => {
                                            e.stopPropagation();
                                            handleDeleteNote(note.id);
                                        }, children: "\u00D7" })] }, note.id))), !filteredNotes.length && _jsx("p", { className: "empty-state", children: "\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u0432 \u044D\u0442\u043E\u0439 \u043F\u0430\u043F\u043A\u0435" })] })] }), _jsx("section", { className: "editor-panel", children: selectedNote ? (_jsxs(_Fragment, { children: [_jsxs("header", { className: "panel-header spaced", children: [_jsx("input", { type: "text", value: editor.title, onChange: (e) => setEditor((prev) => ({ ...prev, title: e.target.value })), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsxs("span", { style: { fontSize: "0.75rem", color: "#667085" }, children: ["\u0410\u0432\u0442\u043E\u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 ~", AUTOSAVE_DEBOUNCE_MS / 1000, " \u0441 \u043F\u043E\u0441\u043B\u0435 \u043F\u0430\u0443\u0437\u044B"] }), _jsxs("button", { className: "btn secondary", onClick: () => setShowComments(!showComments), children: [showComments ? "Скрыть" : "Показать", " \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (", comments.length, ")"] }), _jsx("button", { className: "btn success", onClick: handleSaveNote, disabled: saving, children: saving ? "Сохраняем..." : "Сохранить" })] })] }), _jsxs("div", { className: "editor-columns", children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [_jsxs("div", { style: {
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.5rem",
                                                flexShrink: 0,
                                                marginBottom: "0.35rem"
                                            }, children: [_jsx("button", { type: "button", className: voiceListening ? "btn secondary" : "btn ghost", style: voiceListening
                                                        ? { boxShadow: "0 0 0 2px rgba(76, 61, 247, 0.35)" }
                                                        : undefined, disabled: !voiceSupported, onClick: toggleVoiceInput, title: !voiceSupported
                                                        ? "Голосовой ввод не поддерживается в этом браузере (нужен Chrome, Edge или Safari)"
                                                        : voiceListening
                                                            ? "Остановить запись"
                                                            : "Диктовать текст в позицию курсора", children: voiceListening ? "⏹ Остановить диктовку" : "🎤 Голосовой ввод" }), voiceListening && (_jsx("span", { style: { fontSize: "0.8rem", color: "#6b7280" }, children: "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435\u2026" }))] }), _jsx("textarea", { ref: contentTextareaRef, value: editor.content, onChange: (e) => setEditor((prev) => ({ ...prev, content: e.target.value })), onMouseUp: (e) => {
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                if (start !== end) {
                                                    setSelectedText({ start, end });
                                                }
                                                else {
                                                    setSelectedText(null);
                                                }
                                            }, onSelect: (e) => {
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                if (start !== end) {
                                                    setSelectedText({ start, end });
                                                }
                                                else {
                                                    setSelectedText(null);
                                                }
                                            }, placeholder: "\u041F\u0438\u0448\u0438\u0442\u0435 \u0432 Markdown...", style: { flex: 1 } }), selectedText && (_jsxs("div", { style: { padding: "0.75rem", background: "#eef2ff", borderTop: "1px solid #e5e7eb" }, children: [_jsxs("p", { style: { margin: "0 0 0.5rem 0", fontSize: "0.85rem", fontWeight: 600 }, children: ["\u0412\u044B\u0434\u0435\u043B\u0435\u043D \u0442\u0435\u043A\u0441\u0442: \"", editor.content.substring(selectedText.start, selectedText.end).substring(0, 50), "...\""] }), _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("input", { type: "text", value: commentInput, onChange: (e) => setCommentInput(e.target.value), placeholder: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439...", style: { flex: 1, padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }, onKeyPress: (e) => {
                                                                if (e.key === "Enter" && commentInput.trim()) {
                                                                    handleAddComment();
                                                                }
                                                            } }), _jsx("button", { className: "btn primary", onClick: handleAddComment, disabled: !commentInput.trim() || !token, children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C" }), _jsx("button", { className: "btn ghost", onClick: () => {
                                                                setSelectedText(null);
                                                                setCommentInput("");
                                                            }, children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }))] }), _jsxs("div", { className: "preview", style: { position: "relative" }, children: [_jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: editor.content }), showComments && comments.length > 0 && (_jsxs("div", { style: { marginTop: "2rem", paddingTop: "1.5rem", borderTop: "2px solid #e5e7eb" }, children: [_jsxs("h3", { style: { marginBottom: "1rem", fontSize: "1.1rem" }, children: ["\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (", comments.length, ")"] }), comments.map((comment) => {
                                                    const isExpanded = expandedComments.has(comment.id);
                                                    const hasSelection = comment.selectionStart != null && comment.selectionEnd != null;
                                                    const selectedText = hasSelection
                                                        ? editor.content.substring(comment.selectionStart, comment.selectionEnd)
                                                        : null;
                                                    return (_jsxs("div", { style: {
                                                            marginBottom: "1rem",
                                                            padding: "0.75rem",
                                                            background: "#f9fafb",
                                                            borderRadius: "8px",
                                                            border: "1px solid #e5e7eb"
                                                        }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }, children: [_jsxs("div", { children: [_jsx("p", { style: { margin: 0, fontSize: "0.85rem", fontWeight: 600 }, children: comment.username }), _jsx("p", { style: { margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#6b7280" }, children: new Date(comment.sentAt).toLocaleString() })] }), hasSelection && (_jsx("button", { className: "btn ghost", onClick: () => {
                                                                            const newExpanded = new Set(expandedComments);
                                                                            if (isExpanded) {
                                                                                newExpanded.delete(comment.id);
                                                                            }
                                                                            else {
                                                                                newExpanded.add(comment.id);
                                                                            }
                                                                            setExpandedComments(newExpanded);
                                                                        }, style: { fontSize: "0.75rem", padding: "0.25rem 0.5rem" }, children: isExpanded ? "Свернуть" : "Развернуть" }))] }), hasSelection && isExpanded && selectedText && (_jsxs("div", { style: { marginBottom: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "4px", border: "1px solid #e5e7eb" }, children: [_jsx("p", { style: { margin: 0, fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }, children: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A \u0442\u0435\u043A\u0441\u0442\u0443:" }), _jsxs("p", { style: { margin: 0, fontStyle: "italic", color: "#4c3df7" }, children: ["\"", selectedText, "\""] })] })), _jsx("p", { style: { margin: 0 }, children: comment.content })] }, comment.id));
                                                })] }))] })] })] })) : (_jsxs("div", { className: "empty-state large", children: [_jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E" }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443" })] })) }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) }))] }));
}
