# Personal Workout Site — Setup

One-time setup (about 10 minutes). After this, just open `index.html` in a browser (or host it anywhere) and your workouts save to your Supabase DB.

## 1. Create a Supabase project

Go to https://supabase.com, sign in, and create a new project. Pick any region close to you. Wait a minute for it to provision.

Grab these from **Project Settings → API**:

- **Project URL** (looks like `https://xxxx.supabase.co`)
- **anon / public key** (a long string starting with `eyJ...`)

## 2. Run the schema

In the Supabase dashboard, open **SQL Editor → New query**, paste the SQL below, and hit Run.

```sql
-- ===== profiles =====
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  age int,
  height_ft int,
  height_in int,
  weight_lbs numeric,
  goal text,
  daily_minutes int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ===== workout plans =====
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  split_type text not null,           -- 'ppl' | 'upper_lower' | 'full_body' | 'custom'
  name text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- which workout type on which day of the week
create table if not exists public.plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0=Sun..6=Sat
  slot_type text not null,           -- 'push','pull','legs','upper','lower','full','cardio','rest','custom'
  custom_name text,
  cardio_type text,
  cardio_duration_min int,
  unique (plan_id, day_of_week)
);

-- exercises assigned to a slot type within a plan
create table if not exists public.plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans on delete cascade,
  slot_type text not null,
  exercise_name text not null,
  target_sets int default 3,
  target_reps text default '8-12',
  order_idx int default 0
);

-- ===== logged sessions =====
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  session_date date not null default current_date,
  slot_type text not null,
  notes text,
  cardio_type text,
  cardio_duration_min int,
  created_at timestamptz default now()
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  exercise_name text not null,
  set_number int not null,
  reps int,
  weight_lbs numeric,
  created_at timestamptz default now()
);

-- ===== Row Level Security =====
alter table public.profiles         enable row level security;
alter table public.plans            enable row level security;
alter table public.plan_days        enable row level security;
alter table public.plan_exercises   enable row level security;
alter table public.sessions         enable row level security;
alter table public.set_logs         enable row level security;

drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "plans self" on public.plans;
create policy "plans self" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "plan_days self" on public.plan_days;
create policy "plan_days self" on public.plan_days
  for all using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));

drop policy if exists "plan_exercises self" on public.plan_exercises;
create policy "plan_exercises self" on public.plan_exercises
  for all using (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.plans p where p.id = plan_id and p.user_id = auth.uid()));

drop policy if exists "sessions self" on public.sessions;
create policy "sessions self" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "set_logs self" on public.set_logs;
create policy "set_logs self" on public.set_logs
  for all using (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.sessions s where s.id = session_id and s.user_id = auth.uid()));
```

## 3. Enable Google login

### 3a. In Google Cloud Console
1. Go to https://console.cloud.google.com, create a project (or use an existing one).
2. **APIs & Services → OAuth consent screen**. External. Fill in app name, your email. Add your email as a test user. Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - **Authorized redirect URIs**: add the URL that Supabase shows you under Authentication → Providers → Google (it looks like `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`).
4. Copy the **Client ID** and **Client secret**.

### 3b. In Supabase
1. **Authentication → Providers → Google**. Toggle on.
2. Paste the Client ID and Client secret from step 3a. Save.
3. **Authentication → URL Configuration**. Set:
   - **Site URL** to wherever you'll host the app (e.g. `http://localhost:5500` if serving locally, or your Vercel/Netlify URL).
   - Add the same URL to **Redirect URLs**.

## 4. Point the app at your Supabase project

Open `index.html`, find the config block near the top, and paste in your values:

```js
const SUPABASE_URL  = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON = "eyJ...your-anon-key...";
```

## 5. Run the app

**Option A — locally**: serve from the folder. Double-clicking `index.html` will NOT work for Google OAuth (file:// won't redirect back). Use any static server:

```bash
cd "Personal workout site"
python3 -m http.server 5500
# open http://localhost:5500
```

Make sure `http://localhost:5500` is in Supabase's Site URL + Redirect URLs list.

**Option B — deploy**: drop the folder on Vercel, Netlify, Cloudflare Pages, or GitHub Pages. Add that URL to Supabase's Site URL + Redirect URLs list.

## Notes

- Units are imperial (lbs, ft/in) throughout.
- All data is scoped to your user via Row Level Security. Even if someone else gets the anon key, they can only see their own rows.
- The anon key is safe to ship in client code. The service-role key is NOT. Do not put that in `index.html`.
