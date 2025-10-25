# 📁 Структура проекта Notes App

## 🏗️ Архитектура проекта

```
24_3_MSGS/
├── README.md                    # Основной README с бэклогом
├── PROJECT_STRUCTURE.md         # Этот файл
├── backend/                     # Backend (C# + ASP.NET Core)
│   └── NotesApp.API/
│       ├── Controllers/         # API контроллеры
│       │   └── NotesController.cs
│       ├── Data/               # Контекст базы данных
│       │   └── NotesDbContext.cs
│       ├── Models/             # Модели данных
│       │   ├── User.cs
│       │   ├── Note.cs
│       │   ├── Folder.cs
│       │   ├── NoteShare.cs
│       │   └── Message.cs
│       ├── Program.cs          # Точка входа приложения
│       ├── appsettings.json    # Конфигурация
│       └── NotesApp.API.csproj # Файл проекта
└── frontend/                    # Frontend (HTML/CSS + TypeScript)
    ├── index.html              # Главная страница
    ├── css/
    │   └── style.css           # Стили приложения
    ├── js/
    │   └── app.ts              # TypeScript код
    ├── package.json            # Зависимости фронтенда
    └── tsconfig.json           # Конфигурация TypeScript
```

## 🗄️ Модели базы данных

### User (Пользователь)
- `Id` - уникальный идентификатор
- `Username` - имя пользователя (уникальное)
- `Email` - email (уникальный)
- `PasswordHash` - хеш пароля
- `CreatedAt` - дата создания
- `LastLoginAt` - последний вход

### Note (Заметка)
- `Id` - уникальный идентификатор
- `Title` - заголовок заметки
- `Content` - содержимое в Markdown
- `CreatedAt` - дата создания
- `UpdatedAt` - дата обновления
- `UserId` - владелец заметки
- `FolderId` - папка (опционально)

### Folder (Папка)
- `Id` - уникальный идентификатор
- `Name` - название папки
- `CreatedAt` - дата создания
- `UserId` - владелец папки
- `ParentId` - родительская папка (для вложенности)

### NoteShare (Шаринг заметок)
- `Id` - уникальный идентификатор
- `NoteId` - заметка
- `UserId` - пользователь
- `Permission` - права доступа ("read" или "write")
- `SharedAt` - дата шаринга

### Message (Сообщения чата)
- `Id` - уникальный идентификатор
- `Content` - содержимое сообщения
- `SentAt` - время отправки
- `UserId` - отправитель
- `NoteId` - заметка

## 🚀 Технологический стек

### Backend
- **C# + ASP.NET Core 8.0** - веб-API
- **Entity Framework Core** - ORM
- **PostgreSQL** - база данных
- **JWT Bearer** - аутентификация
- **SignalR** - реальное время для чата

### Frontend
- **HTML5 + CSS3** - структура и стили
- **TypeScript** - типизированный JavaScript
- **Marked.js** - рендеринг Markdown
- **Highlight.js** - подсветка синтаксиса

## 📋 Следующие шаги

1. **Настройка базы данных**
   - Установить PostgreSQL
   - Создать базу данных
   - Выполнить миграции

2. **Запуск backend**
   - Настроить строку подключения
   - Запустить API сервер

3. **Запуск frontend**
   - Установить зависимости
   - Скомпилировать TypeScript
   - Запустить веб-сервер

4. **Дополнительные функции**
   - Аутентификация пользователей
   - Система папок
   - Чат в реальном времени
   - Экспорт/импорт заметок
