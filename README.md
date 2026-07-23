# KinoRadar

Статический MVP для GitHub Pages с личным избранным в Supabase. Пользователь не создаёт аккаунт: Supabase выдаёт анонимную сессию и хранит избранное для этого браузера.

## Настройка Supabase

1. Создайте проект в [Supabase](https://supabase.com/).
2. В **Authentication → Providers** включите **Anonymous sign-ins**.
3. В **SQL Editor** выполните содержимое [`supabase/schema.sql`](supabase/schema.sql).
4. Скопируйте `config.example.js` в `config.js` и укажите URL проекта и publishable/anon key из **Settings → API**.
5. Закоммитьте `config.js`: для GitHub Pages URL и publishable key допустимо публиковать. Доступ к данным ограничивается RLS-политиками.

## Внешние данные о кино

Поиск, цифровой релиз и платформы берутся из TMDB. Рейтинг Кинопоиска берётся через Kinopoisk Unofficial API, а IMDb и Metascore — через OMDb. Ключи этих сервисов не должны храниться в GitHub Pages: сохраните `TMDB_API_KEY`, `KINOPOISK_API_KEY` и `OMDB_API_KEY` в **Supabase Edge Function Secrets** и разверните исходник [`supabase/functions/kinoradar-search/index.ts`](supabase/functions/kinoradar-search/index.ts) как функцию `kinoradar-search`.

Для TMDB и JustWatch добавьте в «О проекте» требуемую атрибуцию. Metascore показывается только когда его возвращает OMDb; отсутствие значения означает «Нет данных».

## Публикация

В GitHub: **Settings → Pages → Deploy from a branch**, выберите ветку `main` и папку `/ (root)`.

> Анонимная сессия сохраняется в браузере. Если очистить данные сайта или открыть сайт на другом устройстве, это будет другое избранное. Для синхронизации между устройствами в будущем понадобится обычный вход (например, magic link).
