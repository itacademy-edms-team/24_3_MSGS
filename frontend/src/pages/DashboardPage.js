import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
const emptyEditor = { title: "", content: "" };
export default function DashboardPage() {
    const { user, token, logout } = useAuth();
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
    const handleError = (error) => {
        const message = error instanceof Error ? error.message : "Что-то пошло не так";
        showStatus(message, 6000);
    };
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
                setEditor({
                    title: firstNote.title,
                    content: firstNote.content
                });
            }
        }
    }, [token, selectedNoteId]);
    useEffect(() => {
        setLoading(true);
        Promise.all([loadFolders(), loadNotes()])
            .catch(handleError)
            .finally(() => setLoading(false));
    }, [loadFolders, loadNotes]);
    useEffect(() => {
        if (selectedNote) {
            setEditor({ title: selectedNote.title, content: selectedNote.content });
        }
        else {
            setEditor(emptyEditor);
        }
    }, [selectedNote]);
    const handleSelectNote = (noteId) => {
        setSelectedNoteId(noteId);
    };
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
    const handleSaveNote = async () => {
        if (!token || !selectedNote)
            return;
        setSaving(true);
        try {
            await api.updateNote(token, selectedNote.id, {
                title: editor.title || "Без названия",
                content: editor.content,
                folderId: selectedFolderId
            });
            setNotes((prev) => prev.map((note) => note.id === selectedNote.id
                ? { ...note, title: editor.title || "Без названия", content: editor.content, folderId: selectedFolderId ?? null, updatedAt: new Date().toISOString() }
                : note));
            showStatus("Заметка сохранена");
        }
        catch (error) {
            handleError(error);
        }
        finally {
            setSaving(false);
        }
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
    if (loading) {
        return (_jsxs("div", { className: "fullscreen-center", children: [_jsx("div", { className: "spinner" }), _jsx("p", { children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0434\u0430\u043D\u043D\u044B\u0435..." })] }));
    }
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { className: "user-card", children: [_jsxs("div", { children: [_jsx("p", { className: "user-name", children: user?.username }), _jsx("p", { className: "user-email", children: user?.email })] }), _jsx("button", { className: "btn ghost", onClick: logout, children: "\u0412\u044B\u0439\u0442\u0438" })] }), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u041F\u0430\u043F\u043A\u0438" }), _jsx("span", { className: "badge", children: folders.length })] }), _jsxs("form", { className: "folder-form", onSubmit: handleCreateFolder, children: [_jsx("input", { type: "text", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0430\u043F\u043A\u0438", value: folderForm.name, onChange: (e) => setFolderForm((prev) => ({ ...prev, name: e.target.value })), required: true }), _jsxs("select", { value: folderForm.parentId, onChange: (e) => setFolderForm((prev) => ({ ...prev, parentId: e.target.value })), children: [_jsx("option", { value: "", children: "\u041A\u043E\u0440\u043D\u0435\u0432\u0430\u044F \u043F\u0430\u043F\u043A\u0430" }), folders.map((folder) => (_jsx("option", { value: folder.id, children: folder.name }, folder.id)))] }), _jsx("button", { type: "submit", className: "btn secondary", children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] }), _jsxs("ul", { className: "folder-list", children: [_jsxs("li", { className: !selectedFolderId ? "active" : "", onClick: () => setSelectedFolderId(null), children: [_jsx("span", { children: "\u0412\u0441\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx("span", { className: "badge light", children: notes.length })] }), folders.map((folder) => (_jsxs("li", { className: selectedFolderId === folder.id ? "active" : "", onClick: () => setSelectedFolderId(folder.id), children: [_jsx("span", { children: folder.name }), _jsxs("div", { className: "folder-meta", children: [_jsx("span", { className: "badge light", children: notes.filter((note) => note.folderId === folder.id).length }), _jsx("button", { className: "icon-btn", type: "button", onClick: (e) => {
                                                            e.stopPropagation();
                                                            handleDeleteFolder(folder.id);
                                                        }, children: "\u00D7" })] })] }, folder.id)))] })] })] }), _jsxs("section", { className: "notes-panel", children: [_jsxs("header", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: selectedFolderId ? folderName(selectedFolderId) : "Все заметки" }), _jsxs("p", { children: [filteredNotes.length, " \u0437\u0430\u043C\u0435\u0442\u043E\u043A"] })] }), _jsxs("div", { className: "panel-actions", children: [_jsx("input", { type: "search", placeholder: "\u041F\u043E\u0438\u0441\u043A...", value: search, onChange: (e) => setSearch(e.target.value) }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, disabled: saving, children: "+ \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430" })] })] }), _jsxs("ul", { className: "notes-list", children: [filteredNotes.map((note) => (_jsxs("li", { className: selectedNoteId === note.id ? "active" : "", onClick: () => handleSelectNote(note.id), children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: note.title || "Без названия" }), _jsxs("p", { className: "note-meta", children: [new Date(note.updatedAt).toLocaleString(), " \u2022 ", folderName(note.folderId ?? null)] })] }), _jsx("button", { className: "icon-btn", onClick: (e) => {
                                            e.stopPropagation();
                                            handleDeleteNote(note.id);
                                        }, children: "\u00D7" })] }, note.id))), !filteredNotes.length && _jsx("p", { className: "empty-state", children: "\u041D\u0435\u0442 \u0437\u0430\u043C\u0435\u0442\u043E\u043A \u0432 \u044D\u0442\u043E\u0439 \u043F\u0430\u043F\u043A\u0435" })] })] }), _jsx("section", { className: "editor-panel", children: selectedNote ? (_jsxs(_Fragment, { children: [_jsxs("header", { className: "panel-header spaced", children: [_jsx("input", { type: "text", value: editor.title, onChange: (e) => setEditor((prev) => ({ ...prev, title: e.target.value })), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx("button", { className: "btn success", onClick: handleSaveNote, disabled: saving, children: saving ? "Сохраняем..." : "Сохранить" })] }), _jsxs("div", { className: "editor-columns", children: [_jsx("textarea", { value: editor.content, onChange: (e) => setEditor((prev) => ({ ...prev, content: e.target.value })), placeholder: "\u041F\u0438\u0448\u0438\u0442\u0435 \u0432 Markdown..." }), _jsx("div", { className: "preview", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: editor.content }) })] })] })) : (_jsxs("div", { className: "empty-state large", children: [_jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E" }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443" })] })) }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) }))] }));
}
