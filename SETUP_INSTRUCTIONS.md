# 🚀 Инструкция по настройке проекта Notes App

## 📋 Что нужно сделать для запуска проекта:

### 1. 🔧 Настройка базы данных PostgreSQL

**В pgAdmin4:**
1. ✅ Создайте базу данных `msgs` (уже сделано)
2. 🔑 Узнайте пароль пользователя `postgres` в вашей системе

**В файлах конфигурации:**
3. Откройте файлы:
   - `backend/NotesApp.API/appsettings.json`
   - `backend/NotesApp.API/appsettings.Development.json`
4. Замените `your_password_here` на реальный пароль PostgreSQL

### 2. 🗄️ Применение миграций базы данных

```bash
# Перейдите в папку backend
cd backend/NotesApp.API

# Примените миграции к базе данных
dotnet ef database update
```

### 3. 🖥️ Запуск Backend API

```bash
# В папке backend/NotesApp.API
dotnet run
```

API будет доступен по адресу: `https://localhost:7000`

### 4. 🎨 Настройка и запуск Frontend (React + Vite)

```bash
# Перейдите в папку frontend
cd frontend

# Установите зависимости
npm install

# (Опционально) создайте .env с адресом API
echo VITE_API_BASE_URL=https://localhost:7000/api > .env

# Запуск в dev-режиме
npm run dev

# Сборка продакшн-версии
npm run build

# Просмотр собранной версии
npm run preview
```

Frontend по умолчанию доступен по адресу: `http://localhost:5173` (порт можно изменить в `.env` через `VITE_PORT`).

## 🎯 Ожидаемый результат:

После выполнения всех шагов у вас будет:
- ✅ Работающий API с базой данных PostgreSQL
- ✅ Веб-интерфейс с Markdown-редактором
- ✅ Возможность создавать, редактировать и сохранять заметки
- ✅ Предпросмотр Markdown в реальном времени

## 🔍 Проверка работы:

1. **API**: Откройте `https://localhost:7000/swagger` - должен показать Swagger UI
2. **Frontend**: Откройте `http://localhost:3000` - должен показать интерфейс приложения
3. **База данных**: В pgAdmin4 проверьте, что создались таблицы: `Users`, `Notes`, `Folders`, `NoteShares`, `Messages`

## 🆘 Если что-то не работает:

1. **Ошибка подключения к БД**: Проверьте пароль PostgreSQL
2. **CORS ошибки**: Убедитесь, что backend запущен на порту 7000
3. **TypeScript ошибки**: Выполните `npm run build` в папке frontend
4. **Порт занят**: Измените порты в конфигурации при необходимости
5. **Ошибка «ConversationReadStates не существует» (500 при открытии чатов):**  
   Миграция могла не примениться. Выполните вручную SQL-скрипт из `backend/NotesApp.API/Migrations/CreateConversationReadStates_manual.sql` в вашей БД (pgAdmin или `psql -U postgres -d msgs -f backend/NotesApp.API/Migrations/CreateConversationReadStates_manual.sql`), затем перезапустите API.
