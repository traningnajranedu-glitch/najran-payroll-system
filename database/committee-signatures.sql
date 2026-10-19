-- Run once in the project's Supabase SQL editor before enabling the signing workflow.
create table if not exists public.payroll_committee_signatures (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null,
  member_slot integer not null check (member_slot between 0 and 2),
  member_name text not null,
  phone text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  signed_at timestamptz,
  signature_data text,
  created_at timestamptz not null default now(),
  unique(period_id,member_slot)
);
alter table public.payroll_committee_signatures enable row level security;
-- No public RLS policies: only server-side service-role access.
