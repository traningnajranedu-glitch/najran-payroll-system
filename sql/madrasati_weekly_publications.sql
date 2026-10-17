-- Apply to the Supabase project connected to the Najran continuing-education portal.
-- Published indicators are immutable to school accounts; only active admins can publish.
create table if not exists public.madrasati_weekly_publications (
 id uuid primary key default gen_random_uuid(),
 week_start date not null unique,
 week_end date not null,
 status text not null default 'draft' check (status in ('draft','published')),
 published_at timestamptz,
 published_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 constraint madrasati_week_bounds check (week_end=week_start+4)
);
create table if not exists public.madrasati_weekly_school_metrics (
 id uuid primary key default gen_random_uuid(),
 publication_id uuid not null references public.madrasati_weekly_publications(id) on delete cascade,
 school_id uuid not null references public.schools(id),
 indicator_key integer not null check (indicator_key between 1 and 5),
 source_file text not null,
 source_school_name text not null,
 metrics jsonb not null default '{}'::jsonb,
 row_count integer not null default 0,
 unique(publication_id,school_id,indicator_key)
);
create index if not exists madrasati_weekly_metrics_school_idx on public.madrasati_weekly_school_metrics(school_id,publication_id);
alter table public.madrasati_weekly_publications enable row level security;
alter table public.madrasati_weekly_school_metrics enable row level security;
grant select,insert,update,delete on public.madrasati_weekly_publications to authenticated;
grant select,insert,update,delete on public.madrasati_weekly_school_metrics to authenticated;
create policy "madrasati_publications_admin_manage" on public.madrasati_weekly_publications
 for all to authenticated
 using (exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true))
 with check (exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true));
create policy "madrasati_publications_school_read" on public.madrasati_weekly_publications
 for select to authenticated
 using (status='published' and exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active=true));
create policy "madrasati_metrics_admin_manage" on public.madrasati_weekly_school_metrics
 for all to authenticated
 using (exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true))
 with check (exists(select 1 from public.admin_users a where a.user_id=(select auth.uid()) and a.is_active=true));
create policy "madrasati_metrics_school_read" on public.madrasati_weekly_school_metrics
 for select to authenticated
 using (exists (
 select 1 from public.madrasati_weekly_publications p
 join public.school_users su on su.school_id=madrasati_weekly_school_metrics.school_id
 where p.id=madrasati_weekly_school_metrics.publication_id
 and p.status='published' and su.auth_user_id=(select auth.uid()) and su.is_active=true
 ));
