# KinoRadar

Статический MVP для GitHub Pages с личным избранным в Supabase. Пользователь не создаёт аккаунт: Supabase выдаёт анонимную сессию и хранит избранное для этого браузера.

## Настройка Supabase

1. Создайте проект в [Supabase](https://supabase.com/).
2. В **Authentication → Providers** включите **Anonymous sign-ins**.
3. В **SQL Editor** выполните содержимое [`supabase/schema.sql`](supabase/schema.sql).
4. Скопируйте `config.example.js` в `config.js` и укажите URL проекта и publishable/anon key из **Settings → API**.
5. Закоммитьте `config.js`: для GitHub Pages URL и publishable key допустимо публиковать. Доступ к данным ограничивается RLS-политиками.

## Публикация

В GitHub: **Settings → Pages → Deploy from a branch**, выберите ветку `main` и папку `/ (root)`.

> Анонимная сессия сохраняется в браузере. Если очистить данные сайта или открыть сайт на другом устройстве, это будет другое избранное. Для синхронизации между устройствами в будущем понадобится обычный вход (например, magic link).
