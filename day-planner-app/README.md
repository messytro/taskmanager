# Day Planner — standalone app

A installable, offline-first day planner / task manager. Works fully offline on
one device with zero setup. Add a free Supabase project (~3 minutes) and it
syncs your tasks and categories across your iPhone, iPad, and laptop too.

## What's in here

- `index.html`, `style.css`, `app.js` — the app itself (plain HTML/CSS/JS, no build step)
- `config.js` — where you paste your Supabase project keys
- `manifest.json`, `sw.js`, `icons/` — makes it installable and work offline
- This app does **not** include recurring tasks, reminders, or drag-to-reschedule
  yet — it's a from-scratch rebuild of the artifact version focused on getting
  cross-device sync working first. Happy to add those back in afterward.

## 1. Put it online (required — even for local-only use)

iOS/iPadOS/most browsers only let a site be "installed" as an app and work
offline if it's served over **https**, not opened as a local file. Easiest
free options, no account needed for the first one:

**Netlify Drop (simplest):**
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page
3. You'll get a URL like `https://random-name-123.netlify.app` — that's your app

**Or GitHub Pages / Vercel** if you'd rather have a repo behind it — both are
free and take the same folder as-is.

## 2. Install it on your devices

**iPhone / iPad (Safari):**
1. Open your app URL in Safari
2. Tap the Share icon → **Add to Home Screen**
3. It now opens full-screen like a native app, and works with no internet
   once it's loaded once.

**Laptop (Chrome/Edge):**
1. Open the URL
2. Click the install icon in the address bar (or menu → "Install Day Planner…")

At this point the app works completely offline on every device — but each
device has its own separate data, since nothing syncs yet. That's where
Supabase comes in.

## 3. Set up sync (optional, ~3 minutes)

1. Go to https://supabase.com → create a free account → **New project**
2. Once it's ready, go to **Project Settings → API**. Copy the **Project URL**
   and the **anon public** key.
3. Open `config.js` in this folder and paste them in:
   ```js
   export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbG....";
   ```
4. In Supabase, go to the **SQL Editor**, paste this, and run it:

   ```sql
   create table categories (
     id uuid primary key,
     user_id uuid references auth.users(id) not null,
     label text not null,
     color text not null,
     updated_at timestamptz not null default now()
   );

   create table tasks (
     id uuid primary key,
     user_id uuid references auth.users(id) not null,
     title text not null,
     category_id uuid references categories(id) on delete set null,
     priority text,
     date date,
     start_minutes int,
     duration int,
     done boolean not null default false,
     checklist jsonb not null default '[]',
     updated_at timestamptz not null default now()
   );

   alter table categories enable row level security;
   alter table tasks enable row level security;

   create policy "categories_owner" on categories for all
     using (auth.uid() = user_id) with check (auth.uid() = user_id);

   create policy "tasks_owner" on tasks for all
     using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

5. By default Supabase requires email confirmation for new accounts. For a
   personal project you can turn that off: **Authentication → Providers →
   Email → toggle off "Confirm email"** — otherwise you'll need to click a
   confirmation link in your inbox after signing up.
6. Re-upload the folder (with your edited `config.js`) to Netlify/wherever
   you hosted it — drag-and-drop again works fine.
7. Open the app, tap **Sign in to sync** in the sidebar (or Tasks tab on
   phone — scroll isn't needed, it's a small box), create an account, and
   sign in on each device with the same account.

Once signed in on two devices, tasks you add on one will show up on the
other next time each app is open and online (it syncs automatically on
load, after edits, and when your connection comes back).

## How the offline sync works, honestly

- Everything is saved to the device instantly regardless of internet —
  that part is fully reliable.
- When you're signed in and online, changes get pushed to Supabase and
  pulled from other devices automatically.
- If you delete something while offline, it's queued and gets deleted on
  the server the next time you're back online. This is the one part that's
  simplified rather than bulletproof — if you delete a task on Device A
  while fully offline, then heavily use Device B before Device A ever
  reconnects, there's a small chance of edge-case weirdness. Fine for
  personal use; just know it's not a bank-grade sync engine.

## Importing a study plan

There's an **Import a plan** button (sidebar on tablet/laptop, bottom of the Tasks tab on phone) that reads a `.json` plan file and drops it straight into your task list, spread across real calendar dates starting from whatever date you pick as "Day 1".

This app ships with `plans/cs-skill-builder.json` — a ready-to-import 30-day
"fundamentals → LeetCode habit → project build" plan. Categories it needs
(Fundamentals, LeetCode, Project, German, Review, Rest) are created
automatically the first time you import if they don't already exist.

You can make your own plan files the same way — it's just JSON:

```json
{
  "name": "My Plan",
  "days": [
    {
      "offset": 0,
      "tasks": [
        { "title": "Day 1 task", "category": "Focus", "priority": "high", "checklist": ["step one", "step two"] }
      ]
    }
  ]
}
```

`offset` is days after your chosen start date (0 = Day 1). `category` is
just a name — new ones are created on the fly. `priority` is optional
(`"low"`/`"medium"`/`"high"`/omit). Importing never overwrites anything —
it only adds tasks, so it's safe to import the same file twice with
different start dates if you want to plan out multiple rounds.

## Making changes

It's just static files — edit `app.js`/`style.css`/`index.html` directly and
re-upload. No build step, no npm install required.
