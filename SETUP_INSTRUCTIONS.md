# Инструкция по настройке Notes App

## Вариант A: Docker (рекомендуется)

### 1. Подготовка

```bash
cp .env.example .env
```

При необходимости отредактируйте `.env`:

| Переменная | Назначение |
|------------|------------|
| `POSTGRES_PASSWORD` | Пароль БД |
| `VITE_API_BASE_URL` | URL API для сборки фронтенда (по умолчанию `http://localhost:5000/api`) |
| `Smtp__FromEmail` | Gmail для отправки кодов |
| `Smtp__AppPassword` | Пароль приложения Google |

SMTP можно задать и в `backend/NotesApp.API/.env` (см. `.env.example` в той папке).

### 2. Запуск

```bash
docker compose up --build
```

### 3. Проверка

| Что | URL |
|-----|-----|
| Приложение | http://localhost:8080 |
| API | http://localhost:5000 |
| Swagger | http://localhost:5000/swagger |

Миграции БД применяются автоматически при старте API.

---

## Вариант B: Локально без Docker

### 1. PostgreSQL

Создайте БД `msgs` и пользователя. В `backend/NotesApp.API/appsettings.Development.json` укажите строку подключения.

```bash
cd backend/NotesApp.API
dotnet ef database update
```

### 2. Backend

```bash
cd backend/NotesApp.API
dotnet run --urls "https://localhost:7000;http://localhost:5000"
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

По умолчанию: http://localhost:5173, API — `https://localhost:7000/api`.

---

## Секреты (не коммитить в git)

| Файл | Содержимое |
|------|------------|
| `.env` (корень) | Docker Compose |
| `backend/NotesApp.API/.env` | SMTP |
| `backend/NotesApp.API/appsettings.Local.json` | Локальные переопределения |
| `frontend/.env` | `VITE_API_BASE_URL` |

Шаблоны: `.env.example`, `appsettings.Local.json.example`, `frontend/.env.example`.

---

## Тесты

### Backend

```bash
dotnet test backend/NotesApp.API.Tests/NotesApp.API.Tests.csproj
```

Покрытие: регистрация/логин, заметки, папки, email, сброс паролей, JWT, `.env`.

### Frontend

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Vitest + Testing Library: голосовые команды, навигация.

---

## CI (GitHub Actions)

Workflow `.github/workflows/ci.yml` на каждый push/PR в `main`/`master`:

- `dotnet build` + `dotnet test`
- `npm run lint` + `npm run test` + `npm run build`
- сборка Docker-образов (без push)

---

## CD: релиз и деплой

### Публикация образов в GHCR

```bash
git tag v1.0.0
git push origin v1.0.0
```

Workflow `.github/workflows/cd.yml`:

1. Собирает и пушит образы в `ghcr.io/<owner>/notes-app-api` и `notes-app-frontend`
2. Создаёт GitHub Release
3. При наличии secrets — деплоит по SSH

### Secrets для автодеплоя (опционально)

Включение: repository variable `ENABLE_SSH_DEPLOY` = `true` (задаёт владелец репозитория).

| Secret | Описание |
|--------|----------|
| `DEPLOY_HOST` | IP или домен сервера |
| `DEPLOY_USER` | SSH-пользователь |
| `DEPLOY_SSH_KEY` | Приватный ключ |
| `DEPLOY_PATH` | Путь к проекту на сервере (например `/opt/notes-app`) |

### Ручной деплой на сервер

```bash
docker login ghcr.io -u <github-user> -p <github-token-with-read:packages>

export APP_VERSION=v1.0.0
export GHCR_OWNER=<github-user>
export POSTGRES_PASSWORD=<strong-password>
export JWT_SECRET_KEY=<long-random-secret>

docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

Переменная `VITE_API_BASE_URL` для production-образа фронтенда задаётся при сборке в CD (GitHub variable `VITE_API_BASE_URL` или дефолт).

---

## Устранение неполадок

1. **Ошибка подключения к БД** — проверьте `POSTGRES_PASSWORD` / connection string.
2. **CORS** — фронтенд должен обращаться к тому же хосту/порту, что указан в `VITE_API_BASE_URL`.
3. **SMTP / email** — нужен пароль приложения Google, не обычный пароль.
4. **Порт 5432 занят** — остановите локальный PostgreSQL или измените порт в `docker-compose.yml`.
5. **ConversationReadStates** — при ошибке 500 в чатах перезапустите API; миграции применятся при старте.
