import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as SignalR from "@microsoft/signalr";
import * as Y from "yjs";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
import AppSidebarNav from "../components/AppSidebarNav";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import { downloadMarkdownFile, parseMarkdownImport } from "../utils/noteMarkdown";
const emptyEditor = { title: "", content: "" };
const AUTOSAVE_DEBOUNCE_MS = 1200;
export default function DashboardPage() {
    const { token, user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [folders, setFolders] = useState([]);
    const [notes, setNotes] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [showSharedOnly, setShowSharedOnly] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [editor, setEditor] = useState(emptyEditor);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);
    const [folderForm, setFolderForm] = useState({
        name: "",
        password: ""
    });
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [passwordModalTitle, setPasswordModalTitle] = useState("");
    const [passwordModalSubtitle, setPasswordModalSubtitle] = useState("");
    const [passwordModalValue, setPasswordModalValue] = useState("");
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [comments, setComments] = useState([]);
    const [expandedComments, setExpandedComments] = useState(new Set());
    const [selectedText, setSelectedText] = useState(null);
    const [commentInput, setCommentInput] = useState("");
    const [showComments, setShowComments] = useState(false);
    const [collabConnected, setCollabConnected] = useState(false);
    const [activeEditors, setActiveEditors] = useState([]);
    const contentTextareaRef = useRef(null);
    const importInputRef = useRef(null);
    const [importing, setImporting] = useState(false);
    const loadedNoteIdRef = useRef(null);
    const savedSnapshotRef = useRef({ title: "", content: "" });
    const editorRef = useRef(emptyEditor);
    const collabConnectionRef = useRef(null);
    const joinedNoteIdRef = useRef(null);
    const selectedNoteIdRef = useRef(null);
    const yDocRef = useRef(null);
    const yTextRef = useRef(null);
    const applyingRemoteYjsRef = useRef(false);
    const typingPresenceRef = useRef(false);
    const presenceDebounceRef = useRef(null);
    const unlockedProtectedNoteIdsRef = useRef(new Set());
    const unlockedProtectedFolderIdsRef = useRef(new Set());
    const [unlockedFoldersVersion, setUnlockedFoldersVersion] = useState(0);
    const passwordModalResolverRef = useRef(null);
    editorRef.current = editor;
    selectedNoteIdRef.current = selectedNoteId;
    const selectedNote = useMemo(() => notes.find((note) => note.id === selectedNoteId) ?? null, [notes, selectedNoteId]);
    const canEditSelectedNote = selectedNote?.canEdit ?? true;
    const filteredNotes = useMemo(() => {
        const selectedFolder = selectedFolderId
            ? folders.find((f) => f.id === selectedFolderId) ?? null
            : null;
        const selectedFolderLocked = Boolean(selectedFolder &&
            selectedFolder.isPasswordProtected &&
            !unlockedProtectedFolderIdsRef.current.has(selectedFolder.id));
        const effectiveFolderId = selectedFolderLocked ? null : selectedFolderId;
        const result = notes.filter((note) => {
            const matchesShared = showSharedOnly ? Boolean(note.isShared) : true;
            const matchesFolder = effectiveFolderId ? note.folderId === effectiveFolderId : true;
            const matchesSearch = note.title.toLowerCase().includes(search.toLowerCase());
            return matchesShared && matchesFolder && matchesSearch;
        });
        if (!effectiveFolderId) {
            return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        }
        return result;
    }, [notes, folders, selectedFolderId, showSharedOnly, search, unlockedFoldersVersion]);
    const sharedNotesCount = useMemo(() => filteredNotes.filter((note) => note.isShared).length, [filteredNotes]);
    const showStatus = (message, timeout = 4000) => {
        setStatus(message);
        if (timeout > 0) {
            setTimeout(() => setStatus(null), timeout);
        }
    };
    const toBase64 = (bytes) => {
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i] ?? 0);
        }
        return btoa(binary);
    };
    const fromBase64 = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    };
    const emitPresence = useCallback((isEditing) => {
        typingPresenceRef.current = isEditing;
        const connection = collabConnectionRef.current;
        const noteId = selectedNoteIdRef.current;
        if (connection && noteId && connection.state === SignalR.HubConnectionState.Connected) {
            void connection.invoke("SetPresence", noteId, isEditing).catch(() => { });
        }
    }, []);
    const emitPresenceDebounced = useCallback((isEditing) => {
        if (presenceDebounceRef.current != null) {
            window.clearTimeout(presenceDebounceRef.current);
            presenceDebounceRef.current = null;
        }
        emitPresence(isEditing);
        if (isEditing) {
            presenceDebounceRef.current = window.setTimeout(() => {
                emitPresence(false);
            }, 1200);
        }
    }, [emitPresence]);
    const handleError = useCallback((error) => {
        const message = error instanceof Error ? error.message : "Что-то пошло не так";
        showStatus(message, 6000);
    }, []);
    const openPasswordModal = useCallback((title, subtitle) => {
        setPasswordModalTitle(title);
        setPasswordModalSubtitle(subtitle);
        setPasswordModalValue("");
        setPasswordModalVisible(false);
        setPasswordModalOpen(true);
        return new Promise((resolve) => {
            passwordModalResolverRef.current = resolve;
        });
    }, []);
    const closePasswordModal = useCallback((value) => {
        const resolver = passwordModalResolverRef.current;
        passwordModalResolverRef.current = null;
        setPasswordModalOpen(false);
        setPasswordModalValue("");
        setPasswordModalVisible(false);
        if (resolver) {
            resolver(value);
        }
    }, []);
    const ensureNoteUnlocked = useCallback(async (note) => {
        if (!token)
            return false;
        if (note.isShared)
            return true;
        if (!note.isPasswordProtected)
            return true;
        if (unlockedProtectedNoteIdsRef.current.has(note.id))
            return true;
        const password = await openPasswordModal(`Заметка "${note.title || "Без названия"}"`, "Эта заметка защищена паролем. Введите пароль для открытия.");
        if (password === null) {
            return false;
        }
        if (!password.trim()) {
            showStatus("Пароль не введен", 4000);
            return false;
        }
        try {
            await api.verifyNotePassword(token, note.id, password.trim());
            unlockedProtectedNoteIdsRef.current.add(note.id);
            showStatus("Заметка разблокирована на время сессии", 2200);
            return true;
        }
        catch (error) {
            handleError(error);
            return false;
        }
    }, [token, handleError, openPasswordModal]);
    const ensureFolderUnlocked = useCallback(async (folder) => {
        if (!token)
            return false;
        if (!folder.isPasswordProtected)
            return true;
        if (unlockedProtectedFolderIdsRef.current.has(folder.id))
            return true;
        const password = await openPasswordModal(`Папка "${folder.name}"`, "Эта папка защищена паролем. Введите пароль для открытия.");
        if (password === null) {
            return false;
        }
        if (!password.trim()) {
            showStatus("Пароль не введен", 4000);
            return false;
        }
        try {
            await api.verifyFolderPassword(token, folder.id, password.trim());
            unlockedProtectedFolderIdsRef.current.add(folder.id);
            setUnlockedFoldersVersion((v) => v + 1);
            showStatus("Папка разблокирована на время сессии", 2200);
            return true;
        }
        catch (error) {
            handleError(error);
            return false;
        }
    }, [token, handleError, openPasswordModal]);
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
        if (response.length) {
            const firstNote = response[0];
            if (firstNote) {
                setSelectedNoteId((prev) => prev ?? firstNote.id);
            }
        }
    }, [token]);
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
        if (!noteIdParam || !token) {
            return;
        }
        const noteId = parseInt(noteIdParam, 10);
        if (isNaN(noteId)) {
            return;
        }
        const existing = notes.find((n) => n.id === noteId);
        if (existing) {
            void ensureNoteUnlocked(existing).then((ok) => {
                if (!ok)
                    return;
                setSelectedNoteId(noteId);
                setSearchParams({});
            });
            return;
        }
        // Fallback: заметка может быть расшаренной и ещё не попасть в локальный список.
        void api
            .getNote(token, noteId)
            .then((note) => {
            void ensureNoteUnlocked(note).then((ok) => {
                if (!ok)
                    return;
                setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [note, ...prev]));
                setSelectedNoteId(note.id);
                setSearchParams({});
            });
        })
            .catch(() => {
            showStatus("Не удалось открыть заметку по ссылке", 5000);
        });
    }, [notes, searchParams, setSearchParams, token, ensureNoteUnlocked]);
    useEffect(() => {
        if (!selectedNoteId) {
            if (presenceDebounceRef.current != null) {
                window.clearTimeout(presenceDebounceRef.current);
                presenceDebounceRef.current = null;
            }
            if (collabConnectionRef.current && joinedNoteIdRef.current != null) {
                void collabConnectionRef.current.invoke("LeaveNote", joinedNoteIdRef.current).catch(() => { });
            }
            joinedNoteIdRef.current = null;
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
    useEffect(() => {
        if (!selectedNoteId) {
            yDocRef.current?.destroy();
            yDocRef.current = null;
            yTextRef.current = null;
            setActiveEditors([]);
            typingPresenceRef.current = false;
            return;
        }
        const note = notes.find((n) => n.id === selectedNoteId);
        if (!note) {
            return;
        }
        const doc = new Y.Doc();
        const yText = doc.getText("content");
        yText.insert(0, note.content ?? "");
        yDocRef.current = doc;
        yTextRef.current = yText;
        const onYTextChange = () => {
            const nextContent = yText.toString();
            setEditor((prev) => (prev.content === nextContent ? prev : { ...prev, content: nextContent }));
        };
        yText.observe(onYTextChange);
        const onYDocUpdate = (update, origin) => {
            if (origin === "remote") {
                return;
            }
            const connection = collabConnectionRef.current;
            const noteId = selectedNoteIdRef.current;
            if (!connection || connection.state !== SignalR.HubConnectionState.Connected || !noteId) {
                return;
            }
            const payload = toBase64(update);
            void connection.invoke("SubmitYjsUpdate", noteId, payload).catch(() => { });
        };
        doc.on("update", onYDocUpdate);
        return () => {
            yText.unobserve(onYTextChange);
            doc.off("update", onYDocUpdate);
            doc.destroy();
            if (yDocRef.current === doc) {
                yDocRef.current = null;
                yTextRef.current = null;
            }
        };
    }, [selectedNoteId, notes]);
    useEffect(() => {
        if (!token) {
            collabConnectionRef.current = null;
            joinedNoteIdRef.current = null;
            return;
        }
        const connection = new SignalR.HubConnectionBuilder()
            .withUrl(`${HUB_BASE_URL}/hubs/notes-collab`, { accessTokenFactory: () => token })
            .withAutomaticReconnect()
            .build();
        connection.on("NotePatched", (payload) => {
            const updatedAt = payload.updatedAt || new Date().toISOString();
            setNotes((prev) => prev.map((note) => note.id === payload.noteId
                ? {
                    ...note,
                    title: payload.title,
                    content: payload.content,
                    folderId: payload.folderId,
                    updatedAt
                }
                : note));
            if (payload.noteId === selectedNoteIdRef.current && payload.updatedByUserId !== user?.id) {
                const nextEditor = { title: payload.title, content: payload.content };
                loadedNoteIdRef.current = payload.noteId;
                savedSnapshotRef.current = nextEditor;
                setEditor(nextEditor);
                showStatus("Заметка обновлена другим участником", 2500);
            }
        });
        connection.on("YjsUpdate", (payload) => {
            if (payload.userId === user?.id) {
                return;
            }
            if (payload.noteId !== selectedNoteIdRef.current || !yDocRef.current) {
                return;
            }
            try {
                applyingRemoteYjsRef.current = true;
                Y.applyUpdate(yDocRef.current, fromBase64(payload.updateBase64), "remote");
            }
            catch {
                // Игнорируем поврежденный update.
            }
            finally {
                applyingRemoteYjsRef.current = false;
            }
        });
        connection.on("PresenceChanged", (payload) => {
            if (payload.noteId === selectedNoteIdRef.current) {
                setActiveEditors(payload.editors ?? []);
            }
        });
        connection.onclose(() => setCollabConnected(false));
        connection.onreconnecting(() => setCollabConnected(false));
        connection.onreconnected(() => {
            setCollabConnected(true);
            const noteId = selectedNoteIdRef.current;
            if (!noteId) {
                return;
            }
            void connection
                .invoke("JoinNote", noteId)
                .then(() => connection.invoke("SetPresence", noteId, typingPresenceRef.current))
                .catch(() => { });
        });
        connection
            .start()
            .then(() => setCollabConnected(true))
            .catch((error) => {
            handleError(error);
        });
        collabConnectionRef.current = connection;
        return () => {
            if (joinedNoteIdRef.current != null) {
                void connection.invoke("LeaveNote", joinedNoteIdRef.current).catch(() => { });
            }
            joinedNoteIdRef.current = null;
            connection.off("NotePatched");
            connection.off("YjsUpdate");
            connection.off("PresenceChanged");
            setCollabConnected(false);
            void connection.stop().catch(() => { });
            collabConnectionRef.current = null;
        };
    }, [token, user?.id, handleError]);
    useEffect(() => {
        const connection = collabConnectionRef.current;
        if (!connection || !collabConnected || !selectedNoteId) {
            return;
        }
        const join = async () => {
            const previous = joinedNoteIdRef.current;
            if (previous != null && previous !== selectedNoteId) {
                await connection.invoke("LeaveNote", previous);
            }
            await connection.invoke("JoinNote", selectedNoteId);
            await connection.invoke("SetPresence", selectedNoteId, typingPresenceRef.current);
            joinedNoteIdRef.current = selectedNoteId;
            setActiveEditors([]);
        };
        void join().catch(() => { });
    }, [selectedNoteId, collabConnected]);
    const handleSelectNote = async (noteId) => {
        const note = notes.find((n) => n.id === noteId);
        if (!note)
            return;
        const ok = await ensureNoteUnlocked(note);
        if (!ok)
            return;
        setSelectedNoteId(noteId);
    };
    const persistNote = useCallback(async (options) => {
        if (!token || !selectedNoteId)
            return;
        if (selectedNote && selectedNote.canEdit === false) {
            if (!options?.silent) {
                showStatus("У вас только право чтения для этой заметки", 3500);
            }
            return;
        }
        const ed = editorRef.current;
        const title = ed.title || "Без названия";
        const content = ed.content;
        if (title === savedSnapshotRef.current.title &&
            content === savedSnapshotRef.current.content) {
            return;
        }
        setSaving(true);
        try {
            const currentNoteFolderId = notes.find((note) => note.id === selectedNoteId)?.folderId ?? null;
            await api.collabUpdateNote(token, selectedNoteId, {
                title,
                content,
                folderId: currentNoteFolderId
            });
            const updatedAt = new Date().toISOString();
            savedSnapshotRef.current = { title, content };
            setNotes((prev) => prev.map((note) => note.id === selectedNoteId
                ? { ...note, title, content, folderId: currentNoteFolderId, updatedAt }
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
    }, [token, selectedNoteId, notes, selectedNote, handleError]);
    useEffect(() => {
        if (!token || !selectedNoteId || loading || !canEditSelectedNote)
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
                password: folderForm.password.trim() || null
            });
            setFolders((prev) => [...prev, newFolder]);
            setFolderForm({ name: "", password: "" });
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
            unlockedProtectedFolderIdsRef.current.delete(id);
            setUnlockedFoldersVersion((v) => v + 1);
            setNotes((prev) => prev.filter((note) => note.folderId !== id));
            if (selectedFolderId === id) {
                setSelectedFolderId(null);
                setShowSharedOnly(false);
            }
            showStatus("Папка удалена");
        }
        catch (error) {
            handleError(error);
        }
    };
    const handleSetFolderPassword = async (folderId, isProtected) => {
        if (!token)
            return;
        const promptMessage = isProtected
            ? "Введите новый пароль для папки (или оставьте пусто, чтобы снять пароль):"
            : "Введите пароль для папки (минимум 4 символа):";
        const value = window.prompt(promptMessage, "");
        if (value === null)
            return;
        const password = value.trim();
        if (password && password.length < 4) {
            showStatus("Пароль папки должен быть не короче 4 символов", 5000);
            return;
        }
        try {
            await api.setFolderPassword(token, folderId, password || null);
            if (password) {
                unlockedProtectedFolderIdsRef.current.add(folderId);
            }
            else {
                unlockedProtectedFolderIdsRef.current.delete(folderId);
            }
            setUnlockedFoldersVersion((v) => v + 1);
            setFolders((prev) => prev.map((f) => f.id === folderId
                ? { ...f, isPasswordProtected: Boolean(password) }
                : f));
            showStatus(password ? "Пароль папки обновлен" : "Пароль папки снят");
        }
        catch (error) {
            handleError(error);
        }
    };
    const handleSelectFolder = async (folder) => {
        const ok = await ensureFolderUnlocked(folder);
        if (!ok)
            return;
        setSelectedFolderId(folder.id);
        setShowSharedOnly(false);
        setSearch("");
        // Защитный рефреш после успешной разблокировки: убирает "пустой" залипший список.
        if (token) {
            try {
                const refreshed = await api.getNotes(token);
                setNotes(refreshed);
            }
            catch {
                // Игнорируем: пользователь уже в нужной папке, локальное состояние может быть актуальным.
            }
        }
    };
    const handleSetNotePassword = async () => {
        if (!token || !selectedNoteId || !selectedNote || selectedNote.isShared)
            return;
        const promptMessage = selectedNote.isPasswordProtected
            ? "Введите новый пароль заметки (или оставьте пусто, чтобы снять пароль):"
            : "Введите пароль для заметки (минимум 4 символа):";
        const value = window.prompt(promptMessage, "");
        if (value === null)
            return;
        const password = value.trim();
        if (password && password.length < 4) {
            showStatus("Пароль заметки должен быть не короче 4 символов", 5000);
            return;
        }
        try {
            await api.setNotePassword(token, selectedNoteId, password || null);
            if (password) {
                unlockedProtectedNoteIdsRef.current.add(selectedNoteId);
            }
            else {
                unlockedProtectedNoteIdsRef.current.delete(selectedNoteId);
            }
            setNotes((prev) => prev.map((n) => n.id === selectedNoteId
                ? { ...n, isPasswordProtected: Boolean(password) }
                : n));
            showStatus(password ? "Пароль заметки обновлен" : "Пароль заметки снят");
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
    const handleExportCurrentMd = () => {
        if (!selectedNote)
            return;
        const title = editor.title || "Без названия";
        downloadMarkdownFile(title, editor.content);
    };
    const handleExportFilteredMd = () => {
        if (!filteredNotes.length) {
            showStatus("Нет заметок для экспорта", 3000);
            return;
        }
        filteredNotes.forEach((note, i) => {
            const isOpen = note.id === selectedNoteId;
            const title = isOpen ? editor.title || note.title : note.title;
            const content = isOpen ? editor.content : note.content;
            window.setTimeout(() => {
                downloadMarkdownFile(title || "Без названия", content, { uniqueId: note.id });
            }, i * 250);
        });
        showStatus(`Скачивается ${filteredNotes.length} файл(ов)…`, 4000);
    };
    const handleImportMd = async (e) => {
        const input = e.target;
        const picked = input.files ? Array.from(input.files) : [];
        input.value = "";
        if (!picked.length || !token)
            return;
        setImporting(true);
        try {
            let ok = 0;
            for (const file of picked) {
                const lower = file.name.toLowerCase();
                if (lower &&
                    !lower.endsWith(".md") &&
                    !lower.endsWith(".markdown")) {
                    continue;
                }
                try {
                    const raw = await file.text();
                    const { title, content } = parseMarkdownImport(raw, file.name);
                    const newNote = await api.createNote(token, {
                        title: title || "Без названия",
                        content,
                        folderId: selectedFolderId
                    });
                    setNotes((prev) => [newNote, ...prev]);
                    ok++;
                }
                catch (err) {
                    handleError(err);
                }
            }
            if (ok > 0) {
                showStatus(`Импортировано заметок: ${ok}`);
            }
            else {
                showStatus("Не выбраны файлы .md", 4000);
            }
        }
        finally {
            setImporting(false);
        }
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
    return (_jsxs("div", { className: "dashboard", children: [_jsxs("aside", { className: "sidebar", children: [_jsx(AppSidebarNav, {}), _jsxs("div", { className: "sidebar-section", children: [_jsxs("div", { className: "section-header", children: [_jsx("h3", { children: "\u041F\u0430\u043F\u043A\u0438" }), _jsx("span", { className: "badge", children: folders.length })] }), _jsxs("form", { className: "folder-form", onSubmit: handleCreateFolder, autoComplete: "off", children: [_jsx("input", { type: "text", name: "folder_name", autoComplete: "off", placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043F\u0430\u043F\u043A\u0438", value: folderForm.name, onChange: (e) => setFolderForm((prev) => ({ ...prev, name: e.target.value })), required: true }), _jsx("input", { type: "password", name: "folder_password", autoComplete: "new-password", placeholder: "\u041F\u0430\u0440\u043E\u043B\u044C \u043F\u0430\u043F\u043A\u0438 (\u043E\u043F\u0446\u0438\u043E\u043D\u0430\u043B\u044C\u043D\u043E)", value: folderForm.password, onChange: (e) => setFolderForm((prev) => ({ ...prev, password: e.target.value })) }), _jsx("button", { type: "submit", className: "btn secondary", children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] }), _jsxs("ul", { className: "folder-list", children: [_jsxs("li", { className: !selectedFolderId && !showSharedOnly ? "active" : "", onClick: () => {
                                            setSelectedFolderId(null);
                                            setShowSharedOnly(false);
                                        }, children: [_jsx("span", { children: "\u0412\u0441\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438" }), _jsx("span", { className: "badge light", children: notes.length })] }), _jsxs("li", { className: showSharedOnly ? "active" : "", onClick: () => {
                                            setSelectedFolderId(null);
                                            setShowSharedOnly(true);
                                        }, children: [_jsx("span", { children: "\u041F\u043E\u0434\u0435\u043B\u0438\u043B\u0438\u0441\u044C \u0441\u043E \u043C\u043D\u043E\u0439" }), _jsx("span", { className: "badge light", children: notes.filter((note) => note.isShared).length })] }), folders.map((folder) => (_jsxs("li", { className: selectedFolderId === folder.id ? "active" : "", onClick: () => {
                                            void handleSelectFolder(folder);
                                        }, children: [_jsx("span", { children: folder.name }), _jsxs("div", { className: "folder-meta", children: [_jsx("span", { className: "badge light", children: notes.filter((note) => note.folderId === folder.id).length }), _jsx("button", { className: "icon-btn", type: "button", title: folder.isPasswordProtected ? "Сменить/снять пароль папки" : "Установить пароль папки", onClick: (e) => {
                                                            e.stopPropagation();
                                                            handleSetFolderPassword(folder.id, Boolean(folder.isPasswordProtected));
                                                        }, children: folder.isPasswordProtected ? "🔒" : "🔓" }), _jsx("button", { className: "icon-btn", type: "button", onClick: (e) => {
                                                            e.stopPropagation();
                                                            handleDeleteFolder(folder.id);
                                                        }, children: "\u00D7" })] })] }, folder.id)))] })] })] }), _jsxs("section", { className: "notes-panel", children: [_jsxs("header", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: showSharedOnly
                                            ? "Поделились со мной"
                                            : selectedFolderId
                                                ? folderName(selectedFolderId)
                                                : "Все заметки" }), _jsxs("p", { children: [filteredNotes.length, " \u0437\u0430\u043C\u0435\u0442\u043E\u043A", sharedNotesCount > 0 ? ` • доступных мне: ${sharedNotesCount}` : ""] })] }), _jsxs("div", { className: "panel-actions", children: [_jsx("input", { ref: importInputRef, type: "file", accept: ".md,.markdown,text/markdown,text/plain", multiple: true, style: { display: "none" }, onChange: handleImportMd }), _jsx("input", { type: "search", name: "notes_search", autoComplete: "off", placeholder: "\u041F\u043E\u0438\u0441\u043A...", value: search, onChange: (e) => setSearch(e.target.value) }), _jsx("button", { type: "button", className: "btn ghost", disabled: importing || saving || !token, onClick: () => importInputRef.current?.click(), title: "\u0418\u043C\u043F\u043E\u0440\u0442 \u043E\u0434\u043D\u043E\u0433\u043E \u0438\u043B\u0438 \u043D\u0435\u0441\u043A\u043E\u043B\u044C\u043A\u0438\u0445 .md \u0432 \u0442\u0435\u043A\u0443\u0449\u0443\u044E \u043F\u0430\u043F\u043A\u0443", children: importing ? "Импорт…" : "Импорт .md" }), _jsx("button", { type: "button", className: "btn ghost", disabled: !filteredNotes.length, onClick: handleExportFilteredMd, title: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u043A\u0430\u0436\u0434\u0443\u044E \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u0437 \u0441\u043F\u0438\u0441\u043A\u0430 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u044B\u043C .md", children: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0441\u043F\u0438\u0441\u043A\u0430" }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, disabled: saving || showSharedOnly, children: "+ \u041D\u043E\u0432\u0430\u044F \u0437\u0430\u043C\u0435\u0442\u043A\u0430" })] })] }), _jsxs("ul", { className: "notes-list", children: [filteredNotes.map((note) => (_jsxs("li", { className: selectedNoteId === note.id ? "active" : "", onClick: () => handleSelectNote(note.id), children: [_jsxs("div", { children: [_jsx("p", { className: "note-title", children: note.title || "Без названия" }), _jsxs("p", { className: "note-meta", children: [new Date(note.updatedAt).toLocaleString(), " \u2022 ", folderName(note.folderId ?? null), note.isPasswordProtected ? " • 🔒 пароль" : "", note.isShared
                                                        ? ` • доступ от ${note.sharedByUsername || "пользователя"} • ${note.canEdit ? "edit" : "read"}`
                                                        : ""] })] }), !note.isShared && (_jsx("button", { className: "icon-btn", onClick: (e) => {
                                            e.stopPropagation();
                                            handleDeleteNote(note.id);
                                        }, children: "\u00D7" }))] }, note.id))), !filteredNotes.length && (_jsx("p", { className: "empty-state", children: showSharedOnly ? "Пока нет заметок, которыми поделились" : "Нет заметок в этой папке" }))] })] }), _jsx("section", { className: "editor-panel", children: selectedNote ? (_jsxs(_Fragment, { children: [_jsxs("header", { className: "panel-header spaced", children: [_jsx("input", { type: "text", value: editor.title, onChange: (e) => setEditor((prev) => ({ ...prev, title: e.target.value })), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0438", disabled: !canEditSelectedNote }), _jsxs("div", { style: { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }, children: [_jsx("span", { style: { fontSize: "0.75rem", color: "#667085" }, children: canEditSelectedNote
                                                ? `Автосохранение ~${AUTOSAVE_DEBOUNCE_MS / 1000} с после паузы`
                                                : "Режим только чтение" }), _jsx("span", { style: {
                                                fontSize: "0.75rem",
                                                fontWeight: 600,
                                                padding: "0.2rem 0.45rem",
                                                borderRadius: "6px",
                                                background: canEditSelectedNote ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                                                color: canEditSelectedNote ? "#059669" : "#6b7280"
                                            }, children: canEditSelectedNote ? "edit" : "read" }), _jsx("span", { style: {
                                                fontSize: "0.75rem",
                                                fontWeight: 600,
                                                padding: "0.2rem 0.45rem",
                                                borderRadius: "6px",
                                                background: collabConnected ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                                                color: collabConnected ? "#059669" : "#6b7280"
                                            }, title: collabConnected ? "Синхронизация через SignalR + Yjs активна" : "Нет соединения для совместного редактирования", children: collabConnected ? "● Коллаб онлайн" : "○ Коллаб оффлайн" }), _jsxs("span", { style: { fontSize: "0.75rem", color: "#667085" }, children: ["\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u0443\u044E\u0442: ", activeEditors.length ? activeEditors.join(", ") : "никто"] }), _jsx("button", { type: "button", className: "btn ghost", onClick: handleExportCurrentMd, title: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C \u044D\u0442\u0443 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u043A\u0430\u043A \u0444\u0430\u0439\u043B Markdown", children: "\u0421\u043A\u0430\u0447\u0430\u0442\u044C .md" }), !selectedNote.isShared && (_jsx("button", { type: "button", className: "btn ghost", onClick: handleSetNotePassword, title: selectedNote.isPasswordProtected ? "Сменить/снять пароль заметки" : "Установить пароль заметки", children: selectedNote.isPasswordProtected ? "🔒 Пароль" : "🔓 Пароль" })), _jsxs("button", { className: "btn secondary", onClick: () => setShowComments(!showComments), children: [showComments ? "Скрыть" : "Показать", " \u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0438 (", comments.length, ")"] }), _jsx("button", { className: "btn success", onClick: handleSaveNote, disabled: saving || !canEditSelectedNote, children: saving ? "Сохраняем..." : "Сохранить" })] })] }), _jsxs("div", { className: "editor-columns", children: [_jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%" }, children: [_jsxs("div", { style: {
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.5rem",
                                                flexShrink: 0,
                                                marginBottom: "0.35rem"
                                            }, children: [_jsx("button", { type: "button", className: voiceListening ? "btn secondary" : "btn ghost", style: voiceListening
                                                        ? { boxShadow: "0 0 0 2px rgba(76, 61, 247, 0.35)" }
                                                        : undefined, disabled: !voiceSupported || !canEditSelectedNote, onClick: toggleVoiceInput, title: !voiceSupported
                                                        ? "Голосовой ввод не поддерживается в этом браузере (нужен Chrome, Edge или Safari)"
                                                        : voiceListening
                                                            ? "Остановить запись"
                                                            : "Диктовать текст в позицию курсора", children: voiceListening ? "⏹ Остановить диктовку" : "🎤 Голосовой ввод" }), voiceListening && (_jsx("span", { style: { fontSize: "0.8rem", color: "#6b7280" }, children: "\u0413\u043E\u0432\u043E\u0440\u0438\u0442\u0435\u2026" }))] }), _jsx("textarea", { ref: contentTextareaRef, value: editor.content, disabled: !canEditSelectedNote, onChange: (e) => {
                                                if (!canEditSelectedNote) {
                                                    return;
                                                }
                                                const nextContent = e.target.value;
                                                const yText = yTextRef.current;
                                                if (!yText) {
                                                    setEditor((prev) => ({ ...prev, content: nextContent }));
                                                    return;
                                                }
                                                const current = yText.toString();
                                                if (current === nextContent) {
                                                    return;
                                                }
                                                yText.doc?.transact(() => {
                                                    yText.delete(0, yText.length);
                                                    yText.insert(0, nextContent);
                                                }, "local");
                                                emitPresenceDebounced(true);
                                            }, onFocus: () => {
                                                if (!canEditSelectedNote)
                                                    return;
                                                emitPresence(true);
                                            }, onBlur: () => {
                                                emitPresence(false);
                                            }, onMouseUp: (e) => {
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
                                                })] }))] })] })] })) : (_jsxs("div", { className: "empty-state large", children: [_jsx("p", { children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0437\u0430\u043C\u0435\u0442\u043A\u0443 \u0438\u043B\u0438 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043D\u043E\u0432\u0443\u044E" }), _jsx("button", { className: "btn primary", onClick: handleCreateNote, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0443" })] })) }), status && (_jsx("div", { className: "toast", children: _jsx("span", { children: status }) })), passwordModalOpen && (_jsx("div", { style: {
                    position: "fixed",
                    inset: 0,
                    background: "rgba(16, 24, 40, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                    padding: "1rem"
                }, onClick: () => closePasswordModal(null), children: _jsxs("div", { style: {
                        width: "100%",
                        maxWidth: "440px",
                        background: "#fff",
                        borderRadius: "12px",
                        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.24)",
                        padding: "1rem"
                    }, onClick: (e) => e.stopPropagation(), children: [_jsx("h3", { style: { margin: "0 0 0.5rem 0" }, children: passwordModalTitle }), _jsx("p", { style: { margin: "0 0 0.75rem 0", color: "#667085", fontSize: "0.9rem" }, children: passwordModalSubtitle }), _jsxs("div", { style: { display: "flex", gap: "0.5rem" }, children: [_jsx("input", { autoFocus: true, type: passwordModalVisible ? "text" : "password", name: "unlock_password", autoComplete: "new-password", value: passwordModalValue, onChange: (e) => setPasswordModalValue(e.target.value), placeholder: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043F\u0430\u0440\u043E\u043B\u044C", style: { flex: 1 }, onKeyDown: (e) => {
                                        if (e.key === "Enter") {
                                            closePasswordModal(passwordModalValue.trim() || null);
                                        }
                                        if (e.key === "Escape") {
                                            closePasswordModal(null);
                                        }
                                    } }), _jsx("button", { type: "button", className: "btn ghost", onClick: () => setPasswordModalVisible((prev) => !prev), title: passwordModalVisible ? "Скрыть пароль" : "Показать пароль", children: passwordModalVisible ? "🙈" : "👁" })] }), _jsxs("div", { style: { marginTop: "0.85rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }, children: [_jsx("button", { type: "button", className: "btn ghost", onClick: () => closePasswordModal(null), children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { type: "button", className: "btn primary", onClick: () => closePasswordModal(passwordModalValue.trim() || null), children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C" })] })] }) }))] }));
}
