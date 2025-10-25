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

### 4. 🎨 Настройка и запуск Frontend

```bash
# Перейдите в папку frontend
cd frontend

# Установите зависимости
npm install

# Скомпилируйте TypeScript
npm run build

# Запустите веб-сервер
npm run serve
```

Frontend будет доступен по адресу: `http://localhost:3000`

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
