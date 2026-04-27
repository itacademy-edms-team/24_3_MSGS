import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as SignalR from "@microsoft/signalr";
import * as Y from "yjs";
import { useAuth } from "../auth/AuthContext";
import { api, HUB_BASE_URL } from "../services/api";
import type { Folder, Note, Message } from "../types";
import AppSidebarNav from "../components/AppSidebarNav";
import { useVoiceDictation } from "../hooks/useVoiceDictation";
import { downloadMarkdownFile, parseMarkdownImport } from "../utils/noteMarkdown";
import { applyNoteCommentHighlights } from "../utils/noteCommentHighlights";

type FolderFormState = {
  name: string;
  password: string;
};

const emptyEditor = { title: "", content: "" };
const NEW_NOTE_PLACEHOLDER = "## Добро пожаловать\n\nНачните писать здесь ✍️";

const AUTOSAVE_DEBOUNCE_MS = 1200;

type NotePatchedEvent = {
  noteId: number;
  title: string;
  content: string;
  folderId: number | null;
  updatedAt: string;
  updatedByUserId: number;
};

type YjsUpdateEvent = {
  noteId: number;
  updateBase64: string;
  userId: number;
};

type PresenceChangedEvent = {
  noteId: number;
  editors: string[];
};

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [showSharedOnly, setShowSharedOnly] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [editor, setEditor] = useState(emptyEditor);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [folderForm, setFolderForm] = useState<FolderFormState>({
    name: "",
    password: ""
  });
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordModalTitle, setPasswordModalTitle] = useState("");
  const [passwordModalSubtitle, setPasswordModalSubtitle] = useState("");
  const [passwordModalValue, setPasswordModalValue] = useState("");
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [comments, setComments] = useState<Message[]>([]);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [expandedInlineCommentIds, setExpandedInlineCommentIds] = useState<Set<number>>(
    () => new Set()
  );
  const [selectedText, setSelectedText] = useState<{ start: number; end: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [showComments, setShowComments] = useState(false);
  const [collabConnected, setCollabConnected] = useState(false);
  const [activeEditors, setActiveEditors] = useState<string[]>([]);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const notePreviewRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const loadedNoteIdRef = useRef<number | null>(null);
  const savedSnapshotRef = useRef<{ title: string; content: string }>({ title: "", content: "" });
  const editorRef = useRef(emptyEditor);
  const collabConnectionRef = useRef<SignalR.HubConnection | null>(null);
  const joinedNoteIdRef = useRef<number | null>(null);
  const selectedNoteIdRef = useRef<number | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const applyingRemoteYjsRef = useRef(false);
  const typingPresenceRef = useRef(false);
  const presenceDebounceRef = useRef<number | null>(null);
  const unlockedProtectedNoteIdsRef = useRef<Set<number>>(new Set());
  const unlockedProtectedFolderIdsRef = useRef<Set<number>>(new Set());
  const [unlockedFoldersVersion, setUnlockedFoldersVersion] = useState(0);
  const wordUndoStackRef = useRef<string[]>([]);
  const wordRedoStackRef = useRef<string[]>([]);
  const applyingWordUndoRef = useRef(false);
  const passwordModalResolverRef = useRef<((value: string | null) => void) | null>(null);
  editorRef.current = editor;
  selectedNoteIdRef.current = selectedNoteId;

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );
  const canEditSelectedNote = selectedNote?.canEdit ?? true;

  const filteredNotes = useMemo(() => {
    const selectedFolder = selectedFolderId
      ? folders.find((f) => f.id === selectedFolderId) ?? null
      : null;
    const selectedFolderLocked = Boolean(
      selectedFolder &&
      selectedFolder.isPasswordProtected &&
      !unlockedProtectedFolderIdsRef.current.has(selectedFolder.id)
    );
    const effectiveFolderId = selectedFolderLocked ? null : selectedFolderId;

    const result = notes.filter((note) => {
      const matchesShared = showSharedOnly ? Boolean(note.isShared) : true;
      const matchesFolder = effectiveFolderId ? note.folderId === effectiveFolderId : true;
      const matchesSearch = note.title.toLowerCase().includes(search.toLowerCase());
      return matchesShared && matchesFolder && matchesSearch;
    });

    if (!effectiveFolderId) {
      return result.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }

    return result;
  }, [notes, folders, selectedFolderId, showSharedOnly, search, unlockedFoldersVersion]);
  const sharedNotesCount = useMemo(
    () => filteredNotes.filter((note) => note.isShared).length,
    [filteredNotes]
  );

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const toBase64 = (bytes: Uint8Array) => {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  };

  const fromBase64 = (base64: string) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const emitPresence = useCallback((isEditing: boolean) => {
    typingPresenceRef.current = isEditing;
    const connection = collabConnectionRef.current;
    const noteId = selectedNoteIdRef.current;
    if (connection && noteId && connection.state === SignalR.HubConnectionState.Connected) {
      void connection.invoke("SetPresence", noteId, isEditing).catch(() => {});
    }
  }, []);

  const emitPresenceDebounced = useCallback((isEditing: boolean) => {
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

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "Что-то пошло не так";
    showStatus(message, 6000);
  }, []);

  const openPasswordModal = useCallback((title: string, subtitle: string) => {
    setPasswordModalTitle(title);
    setPasswordModalSubtitle(subtitle);
    setPasswordModalValue("");
    setPasswordModalVisible(false);
    setPasswordModalOpen(true);
    return new Promise<string | null>((resolve) => {
      passwordModalResolverRef.current = resolve;
    });
  }, []);

  const closePasswordModal = useCallback((value: string | null) => {
    const resolver = passwordModalResolverRef.current;
    passwordModalResolverRef.current = null;
    setPasswordModalOpen(false);
    setPasswordModalValue("");
    setPasswordModalVisible(false);
    if (resolver) {
      resolver(value);
    }
  }, []);

  const ensureNoteUnlocked = useCallback(
    async (note: Note): Promise<boolean> => {
      if (!token) return false;
      if (note.isShared) return true;
      if (!note.isPasswordProtected) return true;
      if (unlockedProtectedNoteIdsRef.current.has(note.id)) return true;

      const password = await openPasswordModal(
        `Заметка "${note.title || "Без названия"}"`,
        "Эта заметка защищена паролем. Введите пароль для открытия."
      );
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
      } catch (error) {
        handleError(error);
        return false;
      }
    },
    [token, handleError, openPasswordModal]
  );

  const applyEditorContent = useCallback((nextContent: string) => {
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
  }, []);

  const maybePushWordUndoCheckpoint = useCallback((prevContent: string, nextContent: string) => {
    if (applyingWordUndoRef.current || prevContent === nextContent) {
      return;
    }

    const prevLast = prevContent.length > 0 ? prevContent.charAt(prevContent.length - 1) : "";
    const nextLast = nextContent.length > 0 ? nextContent.charAt(nextContent.length - 1) : "";

    // Чекпоинт начала "нового слова": undo откатывает сразу слово/фрагмент до прошлого пробела.
    const startsWord =
      nextContent.length === prevContent.length + 1 &&
      /\S/.test(nextLast) &&
      (prevContent.length === 0 || /\s/.test(prevLast));

    if (!startsWord) {
      return;
    }

    const stack = wordUndoStackRef.current;
    wordRedoStackRef.current = [];
    if (stack.length === 0 || stack[stack.length - 1] !== prevContent) {
      stack.push(prevContent);
      if (stack.length > 200) {
        stack.shift();
      }
    }
  }, []);

  const handleWordUndo = useCallback(() => {
    if (!canEditSelectedNote) return;
    const stack = wordUndoStackRef.current;
    if (stack.length === 0) return;
    const target = stack.pop();
    if (target == null) return;
    wordRedoStackRef.current.push(editorRef.current.content);

    applyingWordUndoRef.current = true;
    applyEditorContent(target);
    emitPresenceDebounced(true);
    requestAnimationFrame(() => {
      const el = contentTextareaRef.current;
      if (el) {
        const caret = target.length;
        el.focus();
        el.setSelectionRange(caret, caret);
      }
      applyingWordUndoRef.current = false;
    });
  }, [applyEditorContent, canEditSelectedNote, emitPresenceDebounced]);

  const handleWordRedo = useCallback(() => {
    if (!canEditSelectedNote) return;
    const stack = wordRedoStackRef.current;
    if (stack.length === 0) return;
    const target = stack.pop();
    if (target == null) return;
    wordUndoStackRef.current.push(editorRef.current.content);

    applyingWordUndoRef.current = true;
    applyEditorContent(target);
    emitPresenceDebounced(true);
    requestAnimationFrame(() => {
      const el = contentTextareaRef.current;
      if (el) {
        const caret = target.length;
        el.focus();
        el.setSelectionRange(caret, caret);
      }
      applyingWordUndoRef.current = false;
    });
  }, [applyEditorContent, canEditSelectedNote, emitPresenceDebounced]);

  const ensureFolderUnlocked = useCallback(
    async (folder: Folder): Promise<boolean> => {
      if (!token) return false;
      if (!folder.isPasswordProtected) return true;
      if (unlockedProtectedFolderIdsRef.current.has(folder.id)) return true;

      const password = await openPasswordModal(
        `Папка "${folder.name}"`,
        "Эта папка защищена паролем. Введите пароль для открытия."
      );
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
      } catch (error) {
        handleError(error);
        return false;
      }
    },
    [token, handleError, openPasswordModal]
  );

  const loadFolders = useCallback(async () => {
    if (!token) return;
    const response = await api.getFolders(token);
    setFolders(response);
  }, [token]);

  const loadNotes = useCallback(async () => {
    if (!token) return;
    const response = await api.getNotes(token);
    setNotes(response);
    if (response.length) {
      const firstNote = response[0];
      if (firstNote) {
        setSelectedNoteId((prev) => prev ?? firstNote.id);
      }
    }
  }, [token]);

  const loadComments = useCallback(async (noteId: number) => {
    if (!token) return;
    try {
      const data = await api.getNoteComments(token, noteId);
      setComments(data);
    } catch {
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
        if (!ok) return;
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
          if (!ok) return;
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
        void collabConnectionRef.current.invoke("LeaveNote", joinedNoteIdRef.current).catch(() => {});
      }
      joinedNoteIdRef.current = null;
      loadedNoteIdRef.current = null;
      setEditor(emptyEditor);
      savedSnapshotRef.current = { title: "", content: "" };
      wordUndoStackRef.current = [];
      wordRedoStackRef.current = [];
      setComments([]);
      setExpandedInlineCommentIds(new Set());
      return;
    }
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    if (loadedNoteIdRef.current !== selectedNoteId) {
      loadedNoteIdRef.current = selectedNoteId;
      const payload = { title: note.title, content: note.content };
      setEditor(payload);
      savedSnapshotRef.current = { ...payload };
      wordUndoStackRef.current = [payload.content];
      wordRedoStackRef.current = [];
      setExpandedInlineCommentIds(new Set());
      void loadComments(selectedNoteId);
    }
  }, [selectedNoteId, notes, loadComments]);

  useLayoutEffect(() => {
    const el = notePreviewRef.current;
    if (!el) return;
    applyNoteCommentHighlights(el, editor.content, comments, expandedInlineCommentIds);
  }, [editor.content, comments, expandedInlineCommentIds]);

  useEffect(() => {
    const root = notePreviewRef.current;
    if (!root || !selectedNoteId) return;

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const pin = t.closest?.(".note-comment-pin");
      if (!pin || !root.contains(pin)) return;
      e.preventDefault();
      e.stopPropagation();
      const wrap = pin.closest("[data-comment-id]");
      const raw = wrap?.getAttribute("data-comment-id");
      const id = raw ? parseInt(raw, 10) : NaN;
      if (Number.isNaN(id)) return;
      setExpandedInlineCommentIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [selectedNoteId]);

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

    const onYDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "remote") {
        return;
      }

      const connection = collabConnectionRef.current;
      const noteId = selectedNoteIdRef.current;
      if (!connection || connection.state !== SignalR.HubConnectionState.Connected || !noteId) {
        return;
      }

      const payload = toBase64(update);
      void connection.invoke("SubmitYjsUpdate", noteId, payload).catch(() => {});
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

    connection.on("NotePatched", (payload: NotePatchedEvent) => {
      const updatedAt = payload.updatedAt || new Date().toISOString();
      setNotes((prev) =>
        prev.map((note) =>
          note.id === payload.noteId
            ? {
                ...note,
                title: payload.title,
                content: payload.content,
                folderId: payload.folderId,
                updatedAt
              }
            : note
        )
      );

      if (payload.noteId === selectedNoteIdRef.current && payload.updatedByUserId !== user?.id) {
        const nextEditor = { title: payload.title, content: payload.content };
        loadedNoteIdRef.current = payload.noteId;
        savedSnapshotRef.current = nextEditor;
        setEditor(nextEditor);
        wordUndoStackRef.current = [nextEditor.content];
        wordRedoStackRef.current = [];
        showStatus("Заметка обновлена другим участником", 2500);
      }
    });
    connection.on("YjsUpdate", (payload: YjsUpdateEvent) => {
      if (payload.userId === user?.id) {
        return;
      }
      if (payload.noteId !== selectedNoteIdRef.current || !yDocRef.current) {
        return;
      }
      try {
        applyingRemoteYjsRef.current = true;
        Y.applyUpdate(yDocRef.current, fromBase64(payload.updateBase64), "remote");
      } catch {
        // Игнорируем поврежденный update.
      } finally {
        applyingRemoteYjsRef.current = false;
      }
    });
    connection.on("PresenceChanged", (payload: PresenceChangedEvent) => {
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
        .catch(() => {});
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
        void connection.invoke("LeaveNote", joinedNoteIdRef.current).catch(() => {});
      }
      joinedNoteIdRef.current = null;
      connection.off("NotePatched");
      connection.off("YjsUpdate");
      connection.off("PresenceChanged");
      setCollabConnected(false);
      void connection.stop().catch(() => {});
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

    void join().catch(() => {});
  }, [selectedNoteId, collabConnected]);

  const handleSelectNote = async (noteId: number) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const ok = await ensureNoteUnlocked(note);
    if (!ok) return;
    setSelectedNoteId(noteId);
  };

  const persistNote = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token || !selectedNoteId) return;
      if (selectedNote && selectedNote.canEdit === false) {
        if (!options?.silent) {
          showStatus("У вас только право чтения для этой заметки", 3500);
        }
        return;
      }
      const ed = editorRef.current;
      const title = ed.title || "Без названия";
      const content = ed.content;
      if (
        title === savedSnapshotRef.current.title &&
        content === savedSnapshotRef.current.content
      ) {
        return;
      }

      setSaving(true);
      try {
        const currentNoteFolderId =
          notes.find((note) => note.id === selectedNoteId)?.folderId ?? null;
        await api.collabUpdateNote(token, selectedNoteId, {
          title,
          content,
          folderId: currentNoteFolderId
        });
        const updatedAt = new Date().toISOString();
        savedSnapshotRef.current = { title, content };
        setNotes((prev) =>
          prev.map((note) =>
            note.id === selectedNoteId
              ? { ...note, title, content, folderId: currentNoteFolderId, updatedAt }
              : note
          )
        );
        if (!options?.silent) {
          showStatus("Заметка сохранена");
        }
      } catch (error) {
        handleError(error);
      } finally {
        setSaving(false);
      }
    },
    [token, selectedNoteId, notes, selectedNote, handleError]
  );

  useEffect(() => {
    if (!token || !selectedNoteId || loading || !canEditSelectedNote) return;

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
    if (!token) return;
    setSaving(true);
    try {
      const newNote = await api.createNote(token, {
        title: "Новая заметка",
        content: "",
        folderId: selectedFolderId
      });
      setNotes((prev) => [newNote, ...prev]);
      setSelectedNoteId(newNote.id);
      showStatus("Заметка создана");
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = () => {
    void persistNote();
  };

  const handleDeleteNote = async (id: number) => {
    if (!token) return;
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
    } catch (error) {
      handleError(error);
    }
  };

  const handleCreateFolder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !folderForm.name.trim()) return;
    try {
      const newFolder = await api.createFolder(token, {
        name: folderForm.name.trim(),
        password: folderForm.password.trim() || null
      });
      setFolders((prev) => [...prev, newFolder]);
      setFolderForm({ name: "", password: "" });
      showStatus("Папка создана");
    } catch (error) {
      handleError(error);
    }
  };

  const handleDeleteFolder = async (id: number) => {
    if (!token) return;
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
    } catch (error) {
      handleError(error);
    }
  };

  const handleSetFolderPassword = async (folderId: number, isProtected: boolean) => {
    if (!token) return;
    const promptMessage = isProtected
      ? "Введите новый пароль для папки (или оставьте пусто, чтобы снять пароль):"
      : "Введите пароль для папки (минимум 4 символа):";
    const value = window.prompt(promptMessage, "");
    if (value === null) return;
    const password = value.trim();
    if (password && password.length < 4) {
      showStatus("Пароль папки должен быть не короче 4 символов", 5000);
      return;
    }

    try {
      await api.setFolderPassword(token, folderId, password || null);
      if (password) {
        unlockedProtectedFolderIdsRef.current.add(folderId);
      } else {
        unlockedProtectedFolderIdsRef.current.delete(folderId);
      }
      setUnlockedFoldersVersion((v) => v + 1);
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, isPasswordProtected: Boolean(password) }
            : f
        )
      );
      showStatus(password ? "Пароль папки обновлен" : "Пароль папки снят");
    } catch (error) {
      handleError(error);
    }
  };

  const handleSelectFolder = async (folder: Folder) => {
    const ok = await ensureFolderUnlocked(folder);
    if (!ok) return;
    setSelectedFolderId(folder.id);
    setShowSharedOnly(false);
    setSearch("");
    // Защитный рефреш после успешной разблокировки: убирает "пустой" залипший список.
    if (token) {
      try {
        const refreshed = await api.getNotes(token);
        setNotes(refreshed);
      } catch {
        // Игнорируем: пользователь уже в нужной папке, локальное состояние может быть актуальным.
      }
    }
  };

  const handleSetNotePassword = async () => {
    if (!token || !selectedNoteId || !selectedNote || selectedNote.isShared) return;
    const promptMessage = selectedNote.isPasswordProtected
      ? "Введите новый пароль заметки (или оставьте пусто, чтобы снять пароль):"
      : "Введите пароль для заметки (минимум 4 символа):";
    const value = window.prompt(promptMessage, "");
    if (value === null) return;
    const password = value.trim();
    if (password && password.length < 4) {
      showStatus("Пароль заметки должен быть не короче 4 символов", 5000);
      return;
    }

    try {
      await api.setNotePassword(token, selectedNoteId, password || null);
      if (password) {
        unlockedProtectedNoteIdsRef.current.add(selectedNoteId);
      } else {
        unlockedProtectedNoteIdsRef.current.delete(selectedNoteId);
      }
      setNotes((prev) =>
        prev.map((n) =>
          n.id === selectedNoteId
            ? { ...n, isPasswordProtected: Boolean(password) }
            : n
        )
      );
      showStatus(password ? "Пароль заметки обновлен" : "Пароль заметки снят");
    } catch (error) {
      handleError(error);
    }
  };

  const folderName = (folderId: number | null) => {
    if (!folderId) return "Без папки";
    return folders.find((f) => f.id === folderId)?.name ?? "Без папки";
  };

  const handleExportCurrentMd = () => {
    if (!selectedNote) return;
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

  const handleImportMd = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files ? Array.from(input.files) : [];
    input.value = "";
    if (!picked.length || !token) return;
    setImporting(true);
    try {
      let ok = 0;
      for (const file of picked) {
        const lower = file.name.toLowerCase();
        if (
          lower &&
          !lower.endsWith(".md") &&
          !lower.endsWith(".markdown")
        ) {
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
        } catch (err) {
          handleError(err);
        }
      }
      if (ok > 0) {
        showStatus(`Импортировано заметок: ${ok}`);
      } else {
        showStatus("Не выбраны файлы .md", 4000);
      }
    } finally {
      setImporting(false);
    }
  };

  const appendTranscriptToContent = useCallback((text: string) => {
    setEditor((prev) => {
      const ta = contentTextareaRef.current;
      const start = ta?.selectionStart ?? prev.content.length;
      const end = ta?.selectionEnd ?? prev.content.length;
      const before = prev.content.slice(0, start);
      const after = prev.content.slice(end);
      const needsSpace =
        before.length > 0 &&
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

  const { supported: voiceSupported, listening: voiceListening, toggle: toggleVoiceInput } =
    useVoiceDictation(appendTranscriptToContent, {
      lang: "ru-RU",
      onNotify: showStatus
    });

  const handleAddComment = async () => {
    if (!token || !selectedNote || !selectedText || !commentInput.trim()) return;
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
    } catch (error) {
      showStatus(
        error instanceof Error ? error.message : "Ошибка добавления комментария",
        6000
      );
    }
  };

  if (loading) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p>Загружаем данные...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <AppSidebarNav />

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Папки</h3>
            <span className="badge">{folders.length}</span>
          </div>

          <form className="folder-form" onSubmit={handleCreateFolder} autoComplete="off">
            <input
              type="text"
              name="folder_name"
              autoComplete="off"
              placeholder="Название папки"
              value={folderForm.name}
              onChange={(e) => setFolderForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              type="password"
              name="folder_password"
              autoComplete="new-password"
              placeholder="Пароль папки (опционально)"
              value={folderForm.password}
              onChange={(e) => setFolderForm((prev) => ({ ...prev, password: e.target.value }))}
            />
            <button type="submit" className="btn secondary">
              Создать
            </button>
          </form>

          <ul className="folder-list">
            <li
              className={!selectedFolderId && !showSharedOnly ? "active" : ""}
              onClick={() => {
                setSelectedFolderId(null);
                setShowSharedOnly(false);
              }}
            >
              <span>Все заметки</span>
              <span className="badge light">{notes.length}</span>
            </li>
            <li
              className={showSharedOnly ? "active" : ""}
              onClick={() => {
                setSelectedFolderId(null);
                setShowSharedOnly(true);
              }}
            >
              <span>Поделились со мной</span>
              <span className="badge light">{notes.filter((note) => note.isShared).length}</span>
            </li>
            {folders.map((folder) => (
              <li
                key={folder.id}
                className={selectedFolderId === folder.id ? "active" : ""}
                onClick={() => {
                  void handleSelectFolder(folder);
                }}
              >
                <span>{folder.name}</span>
                <div className="folder-meta">
                  <span className="badge light">
                    {notes.filter((note) => note.folderId === folder.id).length}
                  </span>
                  <button
                    className="icon-btn"
                    type="button"
                    title={folder.isPasswordProtected ? "Сменить/снять пароль папки" : "Установить пароль папки"}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetFolderPassword(folder.id, Boolean(folder.isPasswordProtected));
                    }}
                  >
                    {folder.isPasswordProtected ? "🔒" : "🔓"}
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="notes-panel">
        <header className="panel-header">
          <div>
            <h2>
              {showSharedOnly
                ? "Поделились со мной"
                : selectedFolderId
                  ? folderName(selectedFolderId)
                  : "Все заметки"}
            </h2>
            <p>
              {filteredNotes.length} заметок
              {sharedNotesCount > 0 ? ` • доступных мне: ${sharedNotesCount}` : ""}
            </p>
          </div>
          <div className="panel-actions">
            <input
              ref={importInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              multiple
              style={{ display: "none" }}
              onChange={handleImportMd}
            />
            <input
              type="search"
              name="notes_search"
              autoComplete="off"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              className="btn ghost"
              disabled={importing || saving || !token}
              onClick={() => importInputRef.current?.click()}
              title="Импорт одного или нескольких .md в текущую папку"
            >
              {importing ? "Импорт…" : "Импорт .md"}
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={!filteredNotes.length}
              onClick={handleExportFilteredMd}
              title="Скачать каждую заметку из списка отдельным .md"
            >
              Экспорт списка
            </button>
            <button className="btn primary" onClick={handleCreateNote} disabled={saving || showSharedOnly}>
              + Новая заметка
            </button>
          </div>
        </header>

        <ul className="notes-list">
          {filteredNotes.map((note) => (
            <li
              key={note.id}
              className={selectedNoteId === note.id ? "active" : ""}
              onClick={() => handleSelectNote(note.id)}
            >
              <div>
                <p className="note-title">{note.title || "Без названия"}</p>
                <p className="note-meta">
                  {new Date(note.updatedAt).toLocaleString()} • {folderName(note.folderId ?? null)}
                  {note.isPasswordProtected ? " • 🔒 пароль" : ""}
                  {note.isShared
                    ? ` • доступ от ${note.sharedByUsername || "пользователя"} • ${note.canEdit ? "edit" : "read"}`
                    : ""}
                </p>
              </div>
              {!note.isShared && (
                <button
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                >
                  ×
                </button>
              )}
            </li>
          ))}
          {!filteredNotes.length && (
            <p className="empty-state">
              {showSharedOnly ? "Пока нет заметок, которыми поделились" : "Нет заметок в этой папке"}
            </p>
          )}
        </ul>
      </section>

      <section className="editor-panel">
        {selectedNote ? (
          <>
            <header className="panel-header spaced">
              <input
                type="text"
                value={editor.title}
                onChange={(e) => setEditor((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Название заметки"
                disabled={!canEditSelectedNote}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.75rem", color: "#667085" }}>
                  {canEditSelectedNote
                    ? `Автосохранение ~${AUTOSAVE_DEBOUNCE_MS / 1000} с после паузы`
                    : "Режим только чтение"}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.45rem",
                    borderRadius: "6px",
                    background: canEditSelectedNote ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                    color: canEditSelectedNote ? "#059669" : "#6b7280"
                  }}
                >
                  {canEditSelectedNote ? "edit" : "read"}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    padding: "0.2rem 0.45rem",
                    borderRadius: "6px",
                    background: collabConnected ? "rgba(5, 150, 105, 0.15)" : "rgba(107, 114, 128, 0.15)",
                    color: collabConnected ? "#059669" : "#6b7280"
                  }}
                  title={collabConnected ? "Синхронизация через SignalR + Yjs активна" : "Нет соединения для совместного редактирования"}
                >
                  {collabConnected ? "● Коллаб онлайн" : "○ Коллаб оффлайн"}
                </span>
                <span style={{ fontSize: "0.75rem", color: "#667085" }}>
                  Редактируют: {activeEditors.length ? activeEditors.join(", ") : "никто"}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleExportCurrentMd}
                  title="Скачать эту заметку как файл Markdown"
                >
                  Скачать .md
                </button>
                {!selectedNote.isShared && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={handleSetNotePassword}
                    title={selectedNote.isPasswordProtected ? "Сменить/снять пароль заметки" : "Установить пароль заметки"}
                  >
                    {selectedNote.isPasswordProtected ? "🔒 Пароль" : "🔓 Пароль"}
                  </button>
                )}
                <button
                  className="btn secondary"
                  onClick={() => setShowComments(!showComments)}
                >
                  {showComments ? "Скрыть" : "Показать"} комментарии ({comments.length})
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleWordUndo}
                  disabled={!canEditSelectedNote || wordUndoStackRef.current.length === 0}
                  title="Откатить последнее слово/фрагмент"
                >
                  ↶
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={handleWordRedo}
                  disabled={!canEditSelectedNote || wordRedoStackRef.current.length === 0}
                  title="Повторить отмененное изменение"
                >
                  ↷
                </button>
                <button className="btn success" onClick={handleSaveNote} disabled={saving || !canEditSelectedNote}>
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </header>

            <div className="editor-columns">
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexShrink: 0,
                    marginBottom: "0.35rem"
                  }}
                >
                  <button
                    type="button"
                    className={voiceListening ? "btn secondary" : "btn ghost"}
                    style={
                      voiceListening
                        ? { boxShadow: "0 0 0 2px rgba(76, 61, 247, 0.35)" }
                        : undefined
                    }
                    disabled={!voiceSupported || !canEditSelectedNote}
                    onClick={toggleVoiceInput}
                    title={
                      !voiceSupported
                        ? "Голосовой ввод не поддерживается в этом браузере (нужен Chrome, Edge или Safari)"
                        : voiceListening
                          ? "Остановить запись"
                          : "Диктовать текст в позицию курсора"
                    }
                  >
                    {voiceListening ? "⏹ Остановить диктовку" : "🎤 Голосовой ввод"}
                  </button>
                  {voiceListening && (
                    <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>Говорите…</span>
                  )}
                </div>
                <textarea
                  ref={contentTextareaRef}
                  value={editor.content}
                  disabled={!canEditSelectedNote}
                  onChange={(e) => {
                    if (!canEditSelectedNote) {
                      return;
                    }
                    const nextContent = e.target.value;
                    maybePushWordUndoCheckpoint(editorRef.current.content, nextContent);
                    applyEditorContent(nextContent);
                    emitPresenceDebounced(true);
                  }}
                  onFocus={() => {
                    if (!canEditSelectedNote) return;
                    emitPresence(true);
                  }}
                  onBlur={() => {
                    emitPresence(false);
                  }}
                  onMouseUp={(e) => {
                    const textarea = e.target as HTMLTextAreaElement;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    if (start !== end) {
                      setSelectedText({ start, end });
                    } else {
                      setSelectedText(null);
                    }
                  }}
                  onSelect={(e) => {
                    const textarea = e.target as HTMLTextAreaElement;
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    if (start !== end) {
                      setSelectedText({ start, end });
                    } else {
                      setSelectedText(null);
                    }
                  }}
                  placeholder={NEW_NOTE_PLACEHOLDER}
                  style={{ flex: 1 }}
                />
                {selectedText && (
                  <div style={{ padding: "0.75rem", background: "#eef2ff", borderTop: "1px solid #e5e7eb" }}>
                    <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem", fontWeight: 600 }}>
                      Выделен текст: "{editor.content.substring(selectedText.start, selectedText.end).substring(0, 50)}..."
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        type="text"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        placeholder="Добавить комментарий..."
                        style={{ flex: 1, padding: "0.5rem", borderRadius: "6px", border: "1px solid #e5e7eb" }}
                        onKeyPress={(e) => {
                          if (e.key === "Enter" && commentInput.trim()) {
                            handleAddComment();
                          }
                        }}
                      />
                      <button
                        className="btn primary"
                        onClick={handleAddComment}
                        disabled={!commentInput.trim() || !token}
                      >
                        Отправить
                      </button>
                      <button
                        className="btn ghost"
                        onClick={() => {
                          setSelectedText(null);
                          setCommentInput("");
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div ref={notePreviewRef} className="preview" style={{ position: "relative" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editor.content}</ReactMarkdown>
                {showComments && comments.length > 0 && (
                  <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "2px solid #e5e7eb" }}>
                    <h3 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Комментарии ({comments.length})</h3>
                    {comments.map((comment) => {
                      const isExpanded = expandedComments.has(comment.id);
                      const hasSelection = comment.selectionStart != null && comment.selectionEnd != null;
                      const selectedText = hasSelection
                        ? editor.content.substring(comment.selectionStart!, comment.selectionEnd!)
                        : null;

                      return (
                        <div
                          key={comment.id}
                          style={{
                            marginBottom: "1rem",
                            padding: "0.75rem",
                            background: "#f9fafb",
                            borderRadius: "8px",
                            border: "1px solid #e5e7eb"
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.5rem" }}>
                            <div>
                              <p style={{ margin: 0, fontSize: "0.85rem", fontWeight: 600 }}>{comment.username}</p>
                              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#6b7280" }}>
                                {new Date(comment.sentAt).toLocaleString()}
                              </p>
                            </div>
                            {hasSelection && (
                              <button
                                className="btn ghost"
                                onClick={() => {
                                  const newExpanded = new Set(expandedComments);
                                  if (isExpanded) {
                                    newExpanded.delete(comment.id);
                                  } else {
                                    newExpanded.add(comment.id);
                                  }
                                  setExpandedComments(newExpanded);
                                }}
                                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                              >
                                {isExpanded ? "Свернуть" : "Развернуть"}
                              </button>
                            )}
                          </div>
                          {hasSelection && isExpanded && selectedText && (
                            <div style={{ marginBottom: "0.5rem", padding: "0.5rem", background: "#fff", borderRadius: "4px", border: "1px solid #e5e7eb" }}>
                              <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem" }}>
                                Комментарий к тексту:
                              </p>
                              <p style={{ margin: 0, fontStyle: "italic", color: "#4c3df7" }}>"{selectedText}"</p>
                            </div>
                          )}
                          <p style={{ margin: 0 }}>{comment.content}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state large">
            <p>Выберите заметку или создайте новую</p>
            <button className="btn primary" onClick={handleCreateNote}>
              Создать заметку
            </button>
          </div>
        )}
      </section>

      {status && (
        <div className="toast">
          <span>{status}</span>
        </div>
      )}
      {passwordModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16, 24, 40, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem"
          }}
          onClick={() => closePasswordModal(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              background: "#fff",
              borderRadius: "12px",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.24)",
              padding: "1rem"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 0.5rem 0" }}>{passwordModalTitle}</h3>
            <p style={{ margin: "0 0 0.75rem 0", color: "#667085", fontSize: "0.9rem" }}>
              {passwordModalSubtitle}
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                autoFocus
                type={passwordModalVisible ? "text" : "password"}
                name="unlock_password"
                autoComplete="new-password"
                value={passwordModalValue}
                onChange={(e) => setPasswordModalValue(e.target.value)}
                placeholder="Введите пароль"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    closePasswordModal(passwordModalValue.trim() || null);
                  }
                  if (e.key === "Escape") {
                    closePasswordModal(null);
                  }
                }}
              />
              <button
                type="button"
                className="btn ghost"
                onClick={() => setPasswordModalVisible((prev) => !prev)}
                title={passwordModalVisible ? "Скрыть пароль" : "Показать пароль"}
              >
                {passwordModalVisible ? "🙈" : "👁"}
              </button>
            </div>
            <div style={{ marginTop: "0.85rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="btn ghost" onClick={() => closePasswordModal(null)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => closePasswordModal(passwordModalValue.trim() || null)}
              >
                Открыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

