-- Run in Supabase SQL Editor before enabling the contact-window feature.
create table if not exists public.whatsapp_contact_windows (
  phone text primary key check (phone ~ '^9665[0-9]{8}$'),
  last_inbound_at timestamptz not null,
  last_message_id text,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_contact_windows enable row level security;
revoke all on public.whatsapp_contact_windows from anon, authenticated;
grant select on public.whatsapp_contact_windows to authenticated;
drop policy if exists whatsapp_admin_read on public.whatsapp_contact_windows;
create policy whatsapp_admin_read on public.whatsapp_contact_windows
  for select to authenticated
  using (exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active = true
  ));
-- Only the server-side service-role key may insert/update rows.
