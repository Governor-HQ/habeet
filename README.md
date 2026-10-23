# habeet

A free, simple habit tracker with accounts. Sign in on any device and your habits follow you. No ads, no tracking, nothing sold.

Plain HTML, CSS and JavaScript. There is no build step and no dependencies.

## What it does

- Accounts: email and password, password reset, sync across devices, works offline and syncs later, delete your account from Settings
- Three habit types: Check (yes or no), Timed (tick it, or start a timer that keeps counting by the clock and completes at your goal) and Count (add as you go until you reach the goal)
- Goals can change later; past days keep the goal they had
- Ideas page with ready-made habits

- Daily yes/no habits, repeated on the weekdays you choose
- Habits grouped into Morning, Afternoon and Evening
- Tick, skip (press and hold, or from the habit page) and back-fill past days
- Current and best streak, 30 day rate, weekly and monthly progress, 12 week history
- Archive, edit and delete habits
- Light, dark and auto theme, week starts Monday or Sunday
- Export and import a JSON backup (still works, v1 backups import too)
- Installable on a phone, and works offline after the first visit

## Streak rules

- Only days a habit is scheduled count. Days it is not scheduled are ignored.
- A skipped day neither adds to the streak nor breaks it.
- Today never breaks a streak while it is still unticked.
- Missing a scheduled day breaks the streak.
- Percentages leave out skipped days and a still-open today.

## Run it on your computer

Any static file server works. With Node installed:

    npx serve .

Then open the address it prints. (Opening index.html by double click also works for trying it, but the offline install only works from a real web address.)

## Tests

    node tests/logic.test.js

runs the streak and data validation checks (no installs needed).

`tests/ui.test.js` drives the app in a real browser with Playwright, against a fake Supabase in `tests/mock-supabase.js`. It needs a static server on port 8777 and Playwright with a Chromium. See the top of the file for the environment variables.

## Deploy

It is a static site: upload the project folder as it is. No build command, and the output folder is the project root. (On Vercel, choose "Other" as the framework.)

Each time you change any file that the app loads, change the number in `CACHE` at the top of `sw.js` (for example `habeet-v1.0.1`). Otherwise phones that already installed it keep showing the old version.

## Files

    index.html            the page
    css/style.css         all styles, light and dark
    js/logic.js           dates, streaks, rates, data validation (pure, tested)
    js/icons.js           the icons
    js/cloud.js           sign in and cloud storage calls
    js/config.js          your Supabase URL and publishable key
    js/ideas.js           ready-made habits
    js/app.js             screens, storage, sync, backup, events
    supabase/migrations/  the database, as SQL files
    sw.js                 offline cache
    manifest.webmanifest  install details
    icons/ fonts/         images and fonts (Inter and Fraunces, SIL Open Font License)
    tests/                logic and browser tests

## Data

Saved under the key `habeet:v1` in localStorage. The backup file is the same data as JSON with `version: 1`. Importing validates every field and replaces everything on the device after a confirmation.

## Accounts (Supabase)

Sign in and sync use Supabase over plain `fetch`, with no library. One table, `user_data`, holds one row per user, locked to its owner by row level security. The database is changed only through the migration files in `supabase/migrations`, run from the terminal.

1. Create a Supabase project (free plan is fine).
2. Put the project URL and the publishable (anon) key in `js/config.js`. Never use the secret key.
3. From the project folder: `npx supabase init`, `npx supabase login`, `npx supabase link --project-ref YOUR-REF`, then `npx supabase db push`.
4. In Supabase, Authentication, URL Configuration: set Site URL to your deployed address and add it to Redirect URLs, so confirmation and reset links come back to the app.
5. Before real users arrive, set up custom email sending. The built-in sender allows only 2 emails an hour and only to your own team. `scripts/configure-auth.ps1` sets the site address, redirect list, Brevo SMTP, the 8 character password minimum and email confirmation through the Supabase Management API. It asks for secrets with hidden typing, so none are stored in the project.

Sync rule: each device remembers the version it last saw. If nobody else changed the cloud copy, its save overwrites exactly. If two devices changed it, the data is merged (habits by newest edit, days from both sides, the larger progress wins, deleted habits stay deleted).

Running timers are saved on the device only and are not synced.
