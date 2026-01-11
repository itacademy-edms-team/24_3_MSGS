import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import type { Folder, Note, Message } from "../types";

type FolderFormState = {
  name: string;
  parentId: string;
};

const emptyEditor = { title: "", content: "" };

export default function DashboardPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [editor, setEditor] = useState(emptyEditor);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [folderForm, setFolderForm] = useState<FolderFormState>({
    name: "",
    parentId: ""
  });
  const [comments, setComments] = useState<Message[]>([]);
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [selectedText, setSelectedText] = useState<{ start: number; end: number } | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [showComments, setShowComments] = useState(false);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const matchesFolder = selectedFolderId ? note.folderId === selectedFolderId : true;
      const matchesSearch = note.title.toLowerCase().includes(search.toLowerCase());
      return matchesFolder && matchesSearch;
    });
  }, [notes, selectedFolderId, search]);

  const showStatus = (message: string, timeout = 4000) => {
    setStatus(message);
    if (timeout > 0) {
      setTimeout(() => setStatus(null), timeout);
    }
  };

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "Что-то пошло не так";
    showStatus(message, 6000);
  }, []);

  const loadFolders = useCallback(async () => {
    if (!token) return;
    const response = await api.getFolders(token);
    setFolders(response);
  }, [token]);

  const loadNotes = useCallback(async () => {
    if (!token) return;
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
          setEditor({ title: note.title, content: note.content });
          // Убираем параметр из URL после открытия заметки
          setSearchParams({});
        }
      }
    }
  }, [notes, searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedNote) {
      setEditor({ title: selectedNote.title, content: selectedNote.content });
      loadComments(selectedNote.id);
    } else {
      setEditor(emptyEditor);
      setComments([]);
    }
  }, [selectedNote]);

  const loadComments = useCallback(async (noteId: number) => {
    if (!token) return;
    try {
      const data = await api.getNoteComments(token, noteId);
      setComments(data);
    } catch (error) {
      // Игнорируем ошибки загрузки комментариев
    }
  }, [token]);

  const handleSelectNote = (noteId: number) => {
    setSelectedNoteId(noteId);
  };

  const handleCreateNote = async () => {
    if (!token) return;
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
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!token || !selectedNote) return;
    setSaving(true);
    try {
      await api.updateNote(token, selectedNote.id, {
        title: editor.title || "Без названия",
        content: editor.content,
        folderId: selectedFolderId
      });
      setNotes((prev) =>
        prev.map((note) =>
          note.id === selectedNote.id
            ? { ...note, title: editor.title || "Без названия", content: editor.content, folderId: selectedFolderId ?? null, updatedAt: new Date().toISOString() }
            : note
        )
      );
      showStatus("Заметка сохранена");
    } catch (error) {
      handleError(error);
    } finally {
      setSaving(false);
    }
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
        parentId: folderForm.parentId ? Number(folderForm.parentId) : null
      });
      setFolders((prev) => [...prev, newFolder]);
      setFolderForm({ name: "", parentId: "" });
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
      setNotes((prev) => prev.filter((note) => note.folderId !== id));
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }
      showStatus("Папка удалена");
    } catch (error) {
      handleError(error);
    }
  };

  const folderName = (folderId: number | null) => {
    if (!folderId) return "Без папки";
    return folders.find((f) => f.id === folderId)?.name ?? "Без папки";
  };

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
        <div className="user-card">
          <div className="user-card-header">
            <div>
              <p className="user-name">{user?.username}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <div className="user-card-actions">
            <button 
              className="btn ghost" 
              onClick={() => navigate("/friends")}
              style={{ width: "100%" }}
            >
              Друзья
            </button>
            <button 
              className="btn ghost" 
              onClick={() => navigate("/chat")}
              style={{ width: "100%" }}
            >
              Чаты
            </button>
            <button 
              className="btn ghost" 
              onClick={logout} 
              style={{ width: "100%" }}
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h3>Папки</h3>
            <span className="badge">{folders.length}</span>
          </div>

          <form className="folder-form" onSubmit={handleCreateFolder}>
            <input
              type="text"
              placeholder="Название папки"
              value={folderForm.name}
              onChange={(e) => setFolderForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <select
              value={folderForm.parentId}
              onChange={(e) => setFolderForm((prev) => ({ ...prev, parentId: e.target.value }))}
            >
              <option value="">Корневая папка</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn secondary">
              Создать
            </button>
          </form>

          <ul className="folder-list">
            <li className={!selectedFolderId ? "active" : ""} onClick={() => setSelectedFolderId(null)}>
              <span>Все заметки</span>
              <span className="badge light">{notes.length}</span>
            </li>
            {folders.map((folder) => (
              <li
                key={folder.id}
                className={selectedFolderId === folder.id ? "active" : ""}
                onClick={() => setSelectedFolderId(folder.id)}
              >
                <span>{folder.name}</span>
                <div className="folder-meta">
                  <span className="badge light">
                    {notes.filter((note) => note.folderId === folder.id).length}
                  </span>
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
            <h2>{selectedFolderId ? folderName(selectedFolderId) : "Все заметки"}</h2>
            <p>{filteredNotes.length} заметок</p>
          </div>
          <div className="panel-actions">
            <input
              type="search"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn primary" onClick={handleCreateNote} disabled={saving}>
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
                </p>
              </div>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteNote(note.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
          {!filteredNotes.length && <p className="empty-state">Нет заметок в этой папке</p>}
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
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="btn secondary"
                  onClick={() => setShowComments(!showComments)}
                >
                  {showComments ? "Скрыть" : "Показать"} комментарии ({comments.length})
                </button>
                <button className="btn success" onClick={handleSaveNote} disabled={saving}>
                  {saving ? "Сохраняем..." : "Сохранить"}
                </button>
              </div>
            </header>

            <div className="editor-columns">
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <textarea
                  value={editor.content}
                  onChange={(e) => setEditor((prev) => ({ ...prev, content: e.target.value }))}
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
                  placeholder="Пишите в Markdown..."
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
              <div className="preview" style={{ position: "relative" }}>
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
    </div>
  );
}

