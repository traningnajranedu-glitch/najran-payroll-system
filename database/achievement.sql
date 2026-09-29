create table public.school_achievement_settings (
 id boolean primary key default true check (id),
 target_percent numeric not null default 85 check (target_percent between 1 and 100),
 mastery_threshold numeric not null default 70 check (mastery_threshold between 1 and 100)
);
insert into public.school_achievement_settings(id) values(true);
alter table public.school_achievement_settings enable row level security;
create policy achievement_settings_read on public.school_achievement_settings for select to authenticated using (public.is_admin() or exists(select 1 from public.school_users where auth_user_id=(select auth.uid()) and is_active));
create policy achievement_settings_update on public.school_achievement_settings for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,update on public.school_achievement_settings to authenticated;
create table public.school_achievement_assessments (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),
 academic_year text not null check (academic_year ~ '^[0-9]{4}$'),
 semester text not null check(semester in ('الأول','الثاني','الثالث')),
 stage text not null check(stage in ('ابتدائي','متوسط','ثانوي')),
 grade text not null check(length(trim(grade)) between 1 and 40),
 subject text not null check(length(trim(subject)) between 1 and 100),
 evaluation_type text not null check(evaluation_type in ('قبلي','دوري','ختامي')),
 evaluation_date date not null,
 registered_count integer not null check(registered_count>0),
 assessed_count integer not null check(assessed_count>0 and assessed_count<=registered_count),
 passed_count integer not null check(passed_count between 0 and assessed_count),
 mastered_count integer not null check(mastered_count between 0 and assessed_count),
 total_scores numeric not null check(total_scores>=0),
 max_score numeric not null check(max_score>0),
 mastery_threshold numeric not null check(mastery_threshold between 1 and 100),
 notes text check(length(notes)<=4000),
 attachment_path text,
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now(),
 success_percent numeric generated always as (100.0*passed_count/assessed_count) stored,
 mastery_percent numeric generated always as (100.0*mastered_count/assessed_count) stored,
 average_percent numeric generated always as (100.0*total_scores/(assessed_count*max_score)) stored,
 check(total_scores<=assessed_count*max_score),
 check(attachment_path is null or attachment_path like school_id::text || '/%'),
 unique(school_id,academic_year,semester,stage,grade,subject,evaluation_type)
);
create index achievement_assessments_period on public.school_achievement_assessments(academic_year,semester,evaluation_type,school_id);
alter table public.school_achievement_assessments enable row level security;
create policy achievement_assessments_read on public.school_achievement_assessments for select to authenticated using(public.is_admin() or exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active and su.school_id=school_achievement_assessments.school_id));
create policy achievement_assessments_insert on public.school_achievement_assessments for insert to authenticated with check(submitted_by=(select auth.uid()) and exists(select 1 from public.school_users su join public.schools s on s.id=su.school_id where su.auth_user_id=(select auth.uid()) and su.is_active and s.is_active and su.school_id=school_achievement_assessments.school_id));
create policy achievement_assessments_update on public.school_achievement_assessments for update to authenticated using(exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active and su.school_id=school_achievement_assessments.school_id)) with check(submitted_by=(select auth.uid()) and exists(select 1 from public.school_users su join public.schools s on s.id=su.school_id where su.auth_user_id=(select auth.uid()) and su.is_active and s.is_active and su.school_id=school_achievement_assessments.school_id));
grant select,insert,update on public.school_achievement_assessments to authenticated;
create view public.school_achievement_summary with (security_invoker=true) as
 select school_id,academic_year,semester,evaluation_type,sum(assessed_count)::bigint assessed_count,sum(mastered_count)::bigint mastered_count,
 100.0*sum(mastered_count)/sum(assessed_count) achievement_percent,
 100.0*sum(passed_count)/sum(assessed_count) success_percent,
 100.0*sum(total_scores/max_score)/sum(assessed_count) average_percent
 from public.school_achievement_assessments where mastery_threshold=(select mastery_threshold from public.school_achievement_settings where id=true) group by school_id,academic_year,semester,evaluation_type;
grant select on public.school_achievement_summary to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('achievement-reports','achievement-reports',false,5242880,array['application/pdf']);
create policy achievement_files_read on storage.objects for select to authenticated using(bucket_id='achievement-reports' and (public.is_admin() or exists(select 1 from public.school_users su where su.auth_user_id=(select auth.uid()) and su.is_active and su.school_id::text=(storage.foldername(name))[1])));
create policy achievement_files_insert on storage.objects for insert to authenticated with check(bucket_id='achievement-reports' and exists(select 1 from public.school_users su join public.schools s on s.id=su.school_id where su.auth_user_id=(select auth.uid()) and su.is_active and s.is_active and su.school_id::text=(storage.foldername(name))[1]));
create function public.validate_school_achievement() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.evaluation_date>(now() at time zone 'Asia/Riyadh')::date then raise exception 'تاريخ التقييم لا يكون في المستقبل'; end if;
 select mastery_threshold into new.mastery_threshold from public.school_achievement_settings where id=true;
 new.submitted_by:=auth.uid();
 new.submitted_at:=now();
 return new;
end;
$$;
create trigger validate_school_achievement before insert or update on public.school_achievement_assessments for each row execute function public.validate_school_achievement();
