interface Note {
    id: number;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    userId: number;
    folderId?: number;
}
interface Folder {
    id: number;
    name: string;
    createdAt: string;
    userId: number;
    parentId?: number;
}
interface Message {
    id: number;
    content: string;
    sentAt: string;
    userId: number;
    noteId: number;
}
declare const API_BASE_URL = "https://localhost:7000/api";
declare class NotesApp {
    private currentNote;
    private notes;
    private folders;
    private isPreviewVisible;
    constructor();
    private initializeApp;
    private setupEventListeners;
    private setupMarkdownRenderer;
    private loadData;
    private renderNotesList;
    private renderFoldersList;
    private loadNote;
    private updateUI;
    private updatePreview;
    private createNewNote;
    private saveCurrentNote;
    private autoSave;
    private togglePreview;
    private applyMarkdownAction;
    private searchNotes;
    private shareNote;
    private exportNote;
    private openChat;
    private closeChat;
    private sendMessage;
    private addMessageToChat;
    private showLoading;
    private hideLoading;
    private showToast;
}
//# sourceMappingURL=app.d.ts.map