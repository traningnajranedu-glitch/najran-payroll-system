create table public.school_discipline_settings (
 id boolean primary key default true check(id),
 target_percent numeric not null default 95 check(target_percent>0 and target_percent<=100)
);
insert into public.school_discipline_settings(id) values(true);
alter table public.school_discipline_settings enable row level security;
create policy discipline_settings_read on public.school_discipline_settings for select to authenticated using(public.is_admin() or exists(select 1 from public.school_users where auth_user_id=(select auth.uid()) and is_active));
create policy discipline_settings_update on public.school_discipline_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,update on public.school_discipline_settings to authenticated;
create table public.school_discipline_daily (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 academic_year text not null check(academic_year ~ '^[0-9]{4}$'),
 semester text not null check(semester in ('الأول','الثاني','الثالث')),
 attendance_date date not null,
 expected_count integer not null check(expected_count>0),
 on_time_count integer not null check(on_time_count>=0),
 late_count integer not null check(late_count>=0),
 excused_absent_count integer not null check(excused_absent_count>=0),
 unexcused_absent_count integer not null check(unexcused_absent_count>=0),
 notes text check(length(notes)<=4000),
 submitted_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 regularity_percent numeric generated always as (100.0*on_time_count/expected_count) stored,
 late_percent numeric generated always as (100.0*late_count/expected_count) stored,
 absence_percent numeric generated always as (100.0*(excused_absent_count+unexcused_absent_count)/expected_count) stored,
 check(on_time_count::bigint+late_count::bigint+excused_absent_count::bigint+unexcused_absent_count::bigint=expected_count),
 unique(school_id,attendance_date)
);
create index discipline_daily_period on public.school_discipline_daily(academic_year,semester,attendance_date,school_id);
alter table public.school_discipline_daily enable row level security;
create policy discipline_daily_read on public.school_discipline_daily for select to authenticated using(public.is_admin() or exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active and su.school_id=school_discipline_daily.school_id));
create policy discipline_daily_insert on public.school_discipline_daily for insert to authenticated with check(submitted_by=(select auth.uid()) and exists(select 1 from public.school_users su join public.schools s on s.id=su.school_id where su.auth_user_id=(select auth.uid()) and su.is_active and s.is_active and su.school_id=school_discipline_daily.school_id));
create policy discipline_daily_update on public.school_discipline_daily for update to authenticated using(exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active and su.school_id=school_discipline_daily.school_id)) with check(submitted_by=(select auth.uid()) and exists(select 1 from public.school_users su join public.schools s on s.id=su.school_id where su.auth_user_id=(select auth.uid()) and su.is_active and s.is_active and su.school_id=school_discipline_daily.school_id));
grant select,insert,update on public.school_discipline_daily to authenticated;
create function public.validate_school_discipline() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.attendance_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ الحضور لا يكون في المستقبل'; end if;
 new.submitted_by:=auth.uid();new.updated_at:=now();return new;
end;
$$;
create trigger validate_school_discipline before insert or update on public.school_discipline_daily for each row execute function public.validate_school_discipline();
