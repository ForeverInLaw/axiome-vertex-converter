# Axiome Vertex Converter Bot 🚀

Telegram-бот для конвертации медиафайлов с подпиской на Axiome блокчейне. Production-ready решение с enterprise-grade безопасностью.

## 🎯 Возможности

### Конвертация форматов
- 📹 **Видео:** MP4, AVI, MKV, MOV, WEBM, FLV
- 🎵 **Аудио:** MP3, WAV, FLAC, AAC, OGG, M4A
- 🖼 **Изображения:** JPG, PNG, WEBP, GIF, BMP, TIFF
- 📄 **Документы:** PDF, DOCX, TXT, MD

### Продвинутые функции
- 💾 **Сжатие с выбором качества** (высокое/среднее/низкое)
- 📦 **Пакетная обработка** - до 10 файлов одновременно через media groups
- ⚡ **Параллельная конвертация** - до 3 файлов одновременно
- 📊 **Progress tracking** - отслеживание прогресса в реальном времени
- 💿 **Disk monitoring** - проверка свободного места перед конвертацией

## 💰 Монетизация

| План | Лимиты | Макс. размер | Цена |
|------|--------|--------------|------|
| **FREE** | 3 конвертации/день | 20 МБ | Бесплатно |
| **PRO** | 100 конвертаций/день | 200 МБ | 50 AXM/30 дней |
| **ADMIN** 👑 | Безлимитно | 200 МБ | Для администраторов |

## 🚀 Быстрый старт (5 минут)

### Шаг 0: Установить pnpm (если нет)

```bash
npm install -g pnpm
```

### Шаг 1: Получить токен бота

1. Откройте [@BotFather](https://t.me/botfather) в Telegram
2. Отправьте: `/newbot`
3. Укажите название и username
4. **Скопируйте токен** (формат: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Шаг 2: Настроить .env

Скопируйте `.env.example` и заполните обязательные поля:

```bash
cp .env.example .env
```

Отредактируйте `.env`:
```env
# Вставьте токен от BotFather
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Админы (через запятую, опционально)
ADMIN_USER_IDS=123456789,987654321

# Укажите свой адрес кошелька Axiome
AXIOME_WALLET_ADDRESS=axm1your_actual_wallet_address

# Смените пароль БД на надежный
DB_PASSWORD=YourStrongPassword123!
```

### Шаг 3: Установить зависимости (опционально для разработки)

```bash
# В корне проекта
pnpm install

# Или только для бота
cd bot
pnpm install
```

### Шаг 4: Запустить

```bash
docker compose up -d
```

### Шаг 5: Проверить работу

```bash
# Проверить статус
docker compose ps

# Проверить логи
docker compose logs -f bot
```

### Шаг 6: Тестировать

1. Найдите бота в Telegram
2. Отправьте `/start`
3. Отправьте любой файл
4. Выберите формат и качество
5. Получите результат! 🎉

## 📁 Структура проекта

```
axiome-vertex-converter/
├── bot/
│   ├── main.js                    # Entry point
│   ├── payment-verifier.js        # Blockchain payment validator
│   ├── commands/                  # Bot commands (/start, /subscribe, /status, /help)
│   ├── handlers/
│   │   ├── fileHandler.js         # File upload & validation
│   │   ├── conversionHandler.js   # Format selection & conversion
│   │   └── batchHandler.js        # Batch processing (media groups)
│   ├── converters/
│   │   ├── videoConverter.js      # FFmpeg video conversion
│   │   ├── audioConverter.js      # FFmpeg audio conversion
│   │   ├── imageConverter.js      # Sharp image conversion
│   │   └── documentConverter.js   # LibreOffice document conversion
│   ├── services/
│   │   ├── database.js            # PostgreSQL connection pool
│   │   ├── limiter.js             # Rate limiting
│   │   ├── cleanup.js             # Auto file deletion
│   │   └── diskMonitor.js         # Disk space monitoring
│   ├── keyboards/                 # Inline keyboards (menu, format, quality)
│   └── i18n/                      # Internationalization (RU/EN)
├── db/
│   ├── init.sql                   # Database schema with triggers
│   └── data/                      # PostgreSQL volume
├── docs/
│   ├── PRD.md                     # Product Requirements Document
│   └── CODE_REVIEW.md             # Code review and security audit
├── compose.yml                    # Docker Compose configuration
├── .env                           # Environment variables (create from .env.example)
└── README.md                      # This file
```

## Команды бота

- `/start` - Начало работы
- `/subscribe` - Оформить подписку
- `/status` - Проверить статус подписки
- `/help` - Справка

## 🔒 Безопасность

**Enterprise-grade security:**
- ✅ **File validation** - Magic numbers через file-type
- ✅ **Path traversal protection** - Кросс-платформенная валидация путей
- ✅ **SQL injection protection** - Параметризованные запросы
- ✅ **Rate limiting** - 10 запросов/мин/пользователь
- ✅ **FFmpeg sanitization** - Безопасная валидация команд
- ✅ **Docker security** - Non-root user, no-new-privileges
- ✅ **Network isolation** - Internal-only networking
- ✅ **Auto-cleanup** - Файлы удаляются через 30 минут
- ✅ **Disk monitoring** - Проверка свободного места
- ✅ **Token security** - Никаких токенов в логах

## 🛠 Управление ботом

### Основные команды

```bash
# Остановить бота
docker compose stop

# Запустить снова
docker compose start

# Перезапустить
docker compose restart

# Просмотр логов
docker compose logs -f bot

# Обновить после изменений кода
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Локальная разработка (без Docker)

```bash
# Установить зависимости
cd bot
pnpm install

# Запустить бота локально
pnpm start

# Или в dev режиме
cd ..
pnpm run dev
```

### Мониторинг

```bash
# Проверить статус контейнеров
docker compose ps

# Подключиться к PostgreSQL
docker exec -it converter_db psql -U botuser -d converter_bot

# Статистика использования
SELECT COUNT(*) FROM users;                  # Количество пользователей
SELECT COUNT(*) FROM conversions;           # Всего конвертаций
SELECT SUM(amount_axm) FROM transactions;   # Получено AXM

# Проверить место на диске
docker exec converter_bot df -h /usr/src/app/bot/temp

# Проверить FFmpeg
docker exec converter_bot ffmpeg -version
```

### Бэкап базы данных

**Создать бэкап:**
```bash
docker exec converter_db pg_dump -U botuser converter_bot > backup_$(date +%Y%m%d).sql
```

**Восстановить из бэкапа:**
```bash
cat backup_20251108.sql | docker exec -i converter_db psql -U botuser -d converter_bot
```

**Автоматический бэкап (cron):**
```bash
# Добавьте в crontab (каждый день в 2:00)
0 2 * * * cd /path/to/axiome-vertex-converter && docker exec converter_db pg_dump -U botuser converter_bot > backups/db_$(date +\%Y\%m\%d).sql
```

## 👑 Admin Access

### Настройка администраторов

Администраторы получают **безлимитный доступ** без подписки:

**1. Получите Telegram User ID:**
- Отправьте `/start` боту → найдите ID в логах
- Или используйте [@userinfobot](https://t.me/userinfobot)

**2. Добавьте в .env:**
```env
# Один админ
ADMIN_USER_IDS=123456789

# Несколько админов (через запятую)
ADMIN_USER_IDS=123456789,987654321,555666777
```

**3. Перезапустите:**
```bash
docker compose restart bot
docker compose logs bot | grep admin
```

**Привилегии админа:**
- ✅ Unlimited conversions
- ✅ No rate limiting
- ✅ 200 МБ max file size
- ✅ `/status` показывает "👑 ADMIN"

## 🎯 Производительность

- **Одиночная конвертация:** 10-60 сек (зависит от размера)
- **Batch из 3 файлов:** 3x быстрее (параллельная обработка)
- **Batch из 10 файлов:** 2x быстрее (3+3+3+1 параллельно)
- **Memory:** ~100-500MB на конвертацию (FFmpeg)
- **Disk:** 2x размер файла временно
- **Cleanup:** Автоматически через 30 минут

## 🤝 Contributing

Issues и pull requests приветствуются! Перед созданием PR:
1. Проверьте существующие issues
2. Запустите все тесты
3. Следуйте code style проекта

## 📝 License

MIT License - см. LICENSE file

## 💬 Support

- **Issues:** Создайте issue в репозитории

---

**Built with ❤️ using Node.js, Grammy, PostgreSQL, FFmpeg, Sharp**
