# Notes App — Markdown-заметки с коллаборацией

React + Vite + TypeScript (frontend), ASP.NET Core 8 + PostgreSQL (backend).

## Быстрый старт (Docker)

```bash
cp .env.example .env
docker compose up --build
```

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:8080 |
| API | http://localhost:5000 |
| Swagger | http://localhost:5000/swagger |

SMTP (подтверждение email): добавьте в `.env` или `backend/NotesApp.API/.env` переменные `Smtp__FromEmail` и `Smtp__AppPassword`.

## Локальная разработка

### Backend

```bash
cd backend/NotesApp.API
dotnet run --urls "https://localhost:7000;http://localhost:5000"
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL=https://localhost:7000/api
npm run dev
```

Подробнее: [SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)

## Тесты

```bash
# Backend (19 интеграционных + unit)
dotnet test backend/NotesApp.API.Tests/NotesApp.API.Tests.csproj

# Frontend (Vitest + Testing Library)
cd frontend && npm run test
```

## CI/CD

| Workflow | Триггер | Действия |
|----------|---------|----------|
| `ci.yml` | push/PR в `main`/`master` | build + test backend, lint + test + build frontend, сборка Docker |
| `cd.yml` | тег `v*` (например `v1.0.0`) | публикация образов в GHCR, GitHub Release, опциональный SSH-деплой |

### Релиз и деплой

```bash
git tag v1.0.0
git push origin v1.0.0
```

На сервере (после `docker login ghcr.io`):

```bash
export APP_VERSION=v1.0.0
export GHCR_OWNER=<ваш-github-логин>
export POSTGRES_PASSWORD=...
export JWT_SECRET_KEY=...
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Опциональный автодеплой: GitHub Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.

---

## Бэклог функций

Ниже — план развития приложения.

## 🔥 Эпики
- Редактор заметок с Markdown  
- Управление папками и структурой  
- Совместное использование и внутренний чат  
- Хранение данных и бэкенд (C# + PostgreSQL)  
- Пользовательский интерфейс и улучшения UX (HTML/CSS + TypeScript)  

---

## Задачи

### Редактор заметок с Markdown
- Создать модель **Note** (`ID`, `Title`, `Content`, `CreatedAt`, `UpdatedAt`, `FolderId`, `SharedWith`)  
- Реализовать создание, редактирование и удаление заметок  
- Разделить экран на две панели:  
  - нижняя — ввод Markdown-текста  
  - верхняя — предпросмотр в реальном времени  
- Подключить библиотеку для рендеринга Markdown (например, **marked.js**)  
- Добавить автосохранение изменений  
- Реализовать поиск и фильтрацию заметок  
- Добавить возможность переименования заметок  
- Реализовать просмотр списка заметок (сортировка по дате/названию)  
- Добавить экспорт и импорт заметок в формате `.md` и `.html`  

---

### Управление папками и структурой
- Создать модель **Folder** (`ID`, `Name`, `CreatedAt`, `ParentId`)  
- Реализовать CRUD-операции для папок (создание, переименование, удаление)  
- Добавить возможность объединять заметки в папки  
- Реализовать перемещение заметок между папками (drag & drop или через меню)  
- Отобразить дерево папок в боковой панели  
- (Опционально) Добавить поддержку вложенных папок  

---

### Совместное использование и внутренний чат
- Реализовать систему шаринга заметок между пользователями  
- Добавить возможность выбора прав доступа (просмотр / редактирование)  
- Отображать список пользователей, с которыми поделена заметка  
- Реализовать встроенный чат, привязанный к каждой заметке  
- Добавить хранение истории сообщений  
- Настроить обновление чата в реальном времени 
- Реализовать уведомления о новых сообщениях и новых шарингах  

---

### Хранение данных и бэкенд
- Настроить базу данных **PostgreSQL**  
- Создать таблицы:  
  - `users` — пользователи  
  - `notes` — заметки  
  - `folders` — папки  
  - `shares` — связи заметок и пользователей  
  - `messages` — сообщения чата  
- Реализовать REST API (на **C# ASP.NET Core**) для CRUD-операций:  
  - `/notes`  
  - `/folders`  
  - `/share`  
  - `/chat`  
  - `/auth`  
- Настроить **JWT-аутентификацию** и авторизацию  
- Реализовать WebSocket (или SignalR) для чата  

---

### Пользовательский интерфейс и улучшения UX
- Настроить TypeScript для типизации фронтенда  
- Добавить современный адаптивный интерфейс (HTML/CSS + Flex/Grid)  
- Реализовать тёмную/светлую тему  
- Добавить индикатор автосохранения  
- Добавить подсветку синтаксиса для Markdown-кода  
- Реализовать drag & drop изображений в заметку (вставка в Markdown)  
- Добавить возможность изменения шрифта, размера и стиля редактора  
- Реализовать оффлайн-режим с кэшированием (Service Worker)  
- Добавить уведомления о действиях (например, "заметка сохранена", "приглашение отправлено")  

---

## Реализовано дополнительно

- Профиль: подтверждение email, сброс паролей заметок/папок, голосовой помощник  
- CI: GitHub Actions (build, test, lint, Docker)  
- CD: публикация в GHCR по тегу `v*`  
- Backend-тесты: xUnit + WebApplicationFactory (19 тестов)  
- Frontend-тесты: Vitest + React Testing Library  
