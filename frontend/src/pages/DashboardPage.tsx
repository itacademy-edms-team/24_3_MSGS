import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";
import type { Folder, Note } from "../types";

type FolderFormState = {
  name: string;
  parentId: string;
};

const emptyEditor = { title: "", content: "" };

export default function DashboardPage() {
  const { user, token, logout } = useAuth();
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

  useEffect(() => {
    if (selectedNote) {
      setEditor({ title: selectedNote.title, content: selectedNote.content });
    } else {
      setEditor(emptyEditor);
    }
  }, [selectedNote]);

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
          <div>
            <p className="user-name">{user?.username}</p>
            <p className="user-email">{user?.email}</p>
          </div>
          <button className="btn ghost" onClick={logout}>
            Выйти
          </button>
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
              <button className="btn success" onClick={handleSaveNote} disabled={saving}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </header>

            <div className="editor-columns">
              <textarea
                value={editor.content}
                onChange={(e) => setEditor((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Пишите в Markdown..."
              />
              <div className="preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{editor.content}</ReactMarkdown>
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

