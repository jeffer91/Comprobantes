-- Plataforma ITSQMET para comprobantes del pago de incorporación.
-- El navegador nunca accede directamente a estas tablas. Todas las operaciones
-- pasan por el Cloudflare Worker usando la clave service_role guardada como secreto.

create extension if not exists pgcrypto;

create table if not exists public.student_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (btrim(file_name) <> ''),
  total_rows integer not null default 0 check (total_rows >= 0),
  new_count integer not null default 0 check (new_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  deactivate_missing boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  identification text not null unique check (identification ~ '^[0-9]{10}$'),
  full_name text not null check (btrim(full_name) <> ''),
  career_code text,
  career_name text,
  schedule text,
  personal_email text,
  institutional_email text,
  phone text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  campus text,
  active boolean not null default true,
  source_import_id uuid references public.student_imports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'correction_requested', 'approved')),
  bank text not null check (btrim(bank) <> ''),
  payment_date date not null,
  reference_number text,
  reference_unavailable boolean not null default false,
  current_file_path text not null check (btrim(current_file_path) <> ''),
  current_version integer not null default 1 check (current_version > 0),
  correction_reason text,
  submitted_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (reference_unavailable and reference_number is null)
    or
    (not reference_unavailable and nullif(btrim(reference_number), '') is not null)
  ),
  check (
    (status = 'correction_requested' and nullif(btrim(correction_reason), '') is not null)
    or
    (status <> 'correction_requested' and correction_reason is null)
  ),
  check (
    (status = 'approved' and approved_at is not null)
    or
    (status <> 'approved' and approved_at is null)
  )
);

create table if not exists public.receipt_versions (
  id uuid primary key default gen_random_uuid(),
  payment_record_id uuid not null references public.payment_records(id) on delete cascade,
  version integer not null check (version > 0),
  file_path text not null unique check (btrim(file_path) <> ''),
  file_name text,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'application/pdf')),
  file_size bigint not null check (file_size > 0),
  created_at timestamptz not null default now(),
  unique (payment_record_id, version)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  action text not null check (btrim(action) <> ''),
  entity_type text not null check (btrim(entity_type) <> ''),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key check (btrim(key) <> ''),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values
  ('support_whatsapp', '"0984082332"'::jsonb),
  ('institution_name', '"ITSQMET"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

drop trigger if exists students_set_updated_at on public.students;
create trigger students_set_updated_at
before update on public.students
for each row execute function public.set_updated_at();

drop trigger if exists payment_records_set_updated_at on public.payment_records;
create trigger payment_records_set_updated_at
before update on public.payment_records
for each row execute function public.set_updated_at();

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

create index if not exists students_active_idx on public.students(active);
create index if not exists students_full_name_idx on public.students(full_name);
create index if not exists students_career_name_idx on public.students(career_name);
create index if not exists payment_records_status_idx on public.payment_records(status);
create index if not exists payment_records_submitted_at_idx on public.payment_records(submitted_at desc);
create index if not exists receipt_versions_record_idx on public.receipt_versions(payment_record_id, version desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

alter table public.student_imports enable row level security;
alter table public.students enable row level security;
alter table public.payment_records enable row level security;
alter table public.receipt_versions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

revoke all on public.student_imports from anon, authenticated;
revoke all on public.students from anon, authenticated;
revoke all on public.payment_records from anon, authenticated;
revoke all on public.receipt_versions from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;
revoke all on public.app_settings from anon, authenticated;

grant usage on schema public to service_role;
grant all on public.student_imports to service_role;
grant all on public.students to service_role;
grant all on public.payment_records to service_role;
grant all on public.receipt_versions to service_role;
grant all on public.audit_logs to service_role;
grant all on public.app_settings to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Bucket privado. El Worker genera enlaces firmados de cinco minutos para el personal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No se crean políticas públicas sobre storage.objects. El acceso se realiza
-- exclusivamente con service_role desde el Worker y mediante URLs firmadas.
