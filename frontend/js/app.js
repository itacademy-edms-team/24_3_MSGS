"use strict";
// API Configuration
const API_BASE_URL = 'https://localhost:7000/api';
class NotesApp {
    constructor() {
        this.currentNote = null;
        this.notes = [];
        this.folders = [];
        this.isPreviewVisible = true;
        this.initializeApp();
    }
    async initializeApp() {
        this.setupEventListeners();
        await this.loadData();
        this.setupMarkdownRenderer();
    }
    setupEventListeners() {
        // New note button
        document.getElementById('new-note-btn')?.addEventListener('click', () => {
            this.createNewNote();
        });
        // Save button
        document.getElementById('save-btn')?.addEventListener('click', () => {
            this.saveCurrentNote();
        });
        // Share button
        document.getElementById('share-btn')?.addEventListener('click', () => {
            this.shareNote();
        });
        // Export button
        document.getElementById('export-btn')?.addEventListener('click', () => {
            this.exportNote();
        });
        // Toggle preview
        document.getElementById('toggle-preview')?.addEventListener('click', () => {
            this.togglePreview();
        });
        // Markdown editor
        const editor = document.getElementById('markdown-editor');
        editor?.addEventListener('input', () => {
            this.updatePreview();
            this.autoSave();
        });
        // Note title
        const titleInput = document.getElementById('note-title');
        titleInput?.addEventListener('input', () => {
            this.autoSave();
        });
        // Search
        const searchInput = document.getElementById('search-input');
        searchInput?.addEventListener('input', (e) => {
            this.searchNotes(e.target.value);
        });
        // Tool buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.applyMarkdownAction(action);
            });
        });
        // Chat functionality
        document.getElementById('close-chat')?.addEventListener('click', () => {
            this.closeChat();
        });
        document.getElementById('send-message')?.addEventListener('click', () => {
            this.sendMessage();
        });
        const chatInput = document.getElementById('chat-input');
        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }
    setupMarkdownRenderer() {
        // Configure marked.js
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function (code, lang) {
                    if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });
        }
    }
    async loadData() {
        try {
            this.showLoading();
            // Load notes
            const notesResponse = await fetch(`${API_BASE_URL}/notes`);
            if (notesResponse.ok) {
                this.notes = await notesResponse.json();
                this.renderNotesList();
            }
            // Load folders (placeholder for now)
            this.folders = [];
            this.renderFoldersList();
        }
        catch (error) {
            console.error('Error loading data:', error);
            this.showToast('Ошибка загрузки данных', 'error');
        }
        finally {
            this.hideLoading();
        }
    }
    renderNotesList() {
        const notesList = document.getElementById('notes-list');
        if (!notesList)
            return;
        notesList.innerHTML = '';
        this.notes.forEach(note => {
            const li = document.createElement('li');
            li.textContent = note.title || 'Без названия';
            li.dataset.noteId = note.id.toString();
            li.addEventListener('click', () => this.loadNote(note.id));
            notesList.appendChild(li);
        });
    }
    renderFoldersList() {
        const foldersList = document.getElementById('folders-list');
        if (!foldersList)
            return;
        foldersList.innerHTML = '';
        this.folders.forEach(folder => {
            const li = document.createElement('li');
            li.textContent = folder.name;
            li.dataset.folderId = folder.id.toString();
            foldersList.appendChild(li);
        });
    }
    async loadNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note)
            return;
        this.currentNote = note;
        this.updateUI();
    }
    updateUI() {
        if (!this.currentNote)
            return;
        // Update title
        const titleInput = document.getElementById('note-title');
        titleInput.value = this.currentNote.title;
        // Update content
        const editor = document.getElementById('markdown-editor');
        editor.value = this.currentNote.content;
        // Update preview
        this.updatePreview();
        // Update active note in list
        document.querySelectorAll('#notes-list li').forEach(li => {
            li.classList.remove('active');
            if (li.dataset.noteId === this.currentNote.id.toString()) {
                li.classList.add('active');
            }
        });
    }
    updatePreview() {
        const editor = document.getElementById('markdown-editor');
        const preview = document.getElementById('markdown-preview');
        if (!editor || !preview)
            return;
        const content = editor.value;
        if (typeof marked !== 'undefined') {
            preview.innerHTML = marked.parse(content);
        }
        else {
            preview.innerHTML = content.replace(/\n/g, '<br>');
        }
    }
    async createNewNote() {
        const newNote = {
            title: 'Новая заметка',
            content: '',
            userId: 1 // Placeholder user ID
        };
        try {
            const response = await fetch(`${API_BASE_URL}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newNote)
            });
            if (response.ok) {
                const createdNote = await response.json();
                this.notes.push(createdNote);
                this.currentNote = createdNote;
                this.renderNotesList();
                this.updateUI();
                this.showToast('Заметка создана', 'success');
            }
        }
        catch (error) {
            console.error('Error creating note:', error);
            this.showToast('Ошибка создания заметки', 'error');
        }
    }
    async saveCurrentNote() {
        if (!this.currentNote)
            return;
        const titleInput = document.getElementById('note-title');
        const editor = document.getElementById('markdown-editor');
        this.currentNote.title = titleInput.value;
        this.currentNote.content = editor.value;
        this.currentNote.updatedAt = new Date().toISOString();
        try {
            const response = await fetch(`${API_BASE_URL}/notes/${this.currentNote.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.currentNote)
            });
            if (response.ok) {
                this.showToast('Заметка сохранена', 'success');
                this.renderNotesList();
            }
        }
        catch (error) {
            console.error('Error saving note:', error);
            this.showToast('Ошибка сохранения', 'error');
        }
    }
    autoSave() {
        // Debounced auto-save
        clearTimeout(this.autoSaveTimeout);
        this.autoSaveTimeout = setTimeout(() => {
            if (this.currentNote) {
                this.saveCurrentNote();
            }
        }, 2000);
    }
    togglePreview() {
        const previewPanel = document.querySelector('.preview-panel');
        const toggleBtn = document.getElementById('toggle-preview');
        this.isPreviewVisible = !this.isPreviewVisible;
        if (this.isPreviewVisible) {
            previewPanel.style.display = 'flex';
            toggleBtn.textContent = '👁️ Скрыть';
        }
        else {
            previewPanel.style.display = 'none';
            toggleBtn.textContent = '👁️ Показать';
        }
    }
    applyMarkdownAction(action) {
        const editor = document.getElementById('markdown-editor');
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const selectedText = editor.value.substring(start, end);
        let replacement = '';
        switch (action) {
            case 'bold':
                replacement = `**${selectedText}**`;
                break;
            case 'italic':
                replacement = `*${selectedText}*`;
                break;
            case 'link':
                replacement = `[${selectedText}](url)`;
                break;
            case 'code':
                replacement = `\`${selectedText}\``;
                break;
        }
        editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(end);
        editor.focus();
        editor.setSelectionRange(start + replacement.length, start + replacement.length);
        this.updatePreview();
    }
    searchNotes(query) {
        const notesList = document.getElementById('notes-list');
        if (!notesList)
            return;
        const items = notesList.querySelectorAll('li');
        items.forEach(item => {
            const text = item.textContent?.toLowerCase() || '';
            const isVisible = text.includes(query.toLowerCase());
            item.style.display = isVisible ? 'block' : 'none';
        });
    }
    shareNote() {
        if (!this.currentNote)
            return;
        const shareUrl = `${window.location.origin}/share/${this.currentNote.id}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
            this.showToast('Ссылка скопирована в буфер обмена', 'success');
        });
    }
    exportNote() {
        if (!this.currentNote)
            return;
        const content = `# ${this.currentNote.title}\n\n${this.currentNote.content}`;
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentNote.title}.md`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Заметка экспортирована', 'success');
    }
    openChat() {
        const chatPanel = document.getElementById('chat-panel');
        chatPanel?.classList.add('open');
    }
    closeChat() {
        const chatPanel = document.getElementById('chat-panel');
        chatPanel?.classList.remove('open');
    }
    async sendMessage() {
        const chatInput = document.getElementById('chat-input');
        const message = chatInput.value.trim();
        if (!message || !this.currentNote)
            return;
        // Add message to UI immediately
        this.addMessageToChat(message, true);
        chatInput.value = '';
        // Here you would send the message to the server
        // For now, just simulate a response
        setTimeout(() => {
            this.addMessageToChat('Сообщение получено!', false);
        }, 1000);
    }
    addMessageToChat(content, isOwn) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages)
            return;
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isOwn ? 'own' : 'other'}`;
        messageDiv.innerHTML = `
            <div class="message-content">${content}</div>
            <div class="message-time">${new Date().toLocaleTimeString()}</div>
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    showLoading() {
        const loading = document.getElementById('loading');
        loading?.classList.remove('hidden');
    }
    hideLoading() {
        const loading = document.getElementById('loading');
        loading?.classList.add('hidden');
    }
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container)
            return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}
// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NotesApp();
});
//# sourceMappingURL=app.js.map