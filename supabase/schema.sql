create extension if not exists "pgcrypto";

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('invoice', 'receipt')),
  status text not null check (
    status in (
      'Uploaded',
      'Extracted',
      'NeedsReview',
      'Reviewed',
      'PendingApproval',
      'Approved',
      'Rejected',
      'Exported'
    )
  ),
  vendor_name text not null,
  invoice_number text not null,
  registration_number text not null default '',
  issue_date date not null,
  due_date date not null,
  subtotal numeric not null check (subtotal >= 0),
  tax_amount numeric not null check (tax_amount >= 0),
  total_amount numeric not null check (total_amount > 0),
  tax_rate numeric not null,
  confidence_score numeric not null check (confidence_score >= 0 and confidence_score <= 1),
  file_url text not null default '',
  file_name text not null default '',
  file_media_type text not null default 'application/octet-stream',
  memo text not null default '',
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  debit_account text not null,
  debit_amount numeric not null check (debit_amount > 0),
  debit_tax_category text not null,
  credit_account text not null,
  credit_amount numeric not null check (credit_amount > 0),
  credit_tax_category text not null,
  department text not null default '',
  description text not null,
  ai_reason text not null default '',
  confidence_score numeric not null check (confidence_score >= 0 and confidence_score <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_warnings (
  id text primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  warning_type text not null check (
    warning_type in (
      'high_amount',
      'duplicate',
      'missing_registration_number',
      'low_confidence_extraction',
      'amount_mismatch'
    )
  ),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  message text not null,
  status text not null check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  requested_by uuid,
  approver_id uuid,
  approver_name text not null default '',
  status text not null check (status in ('pending', 'approved', 'rejected')),
  comment text not null default '',
  requested_at timestamptz not null default now(),
  responded_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  actor_type text not null check (actor_type in ('user', 'ai', 'system')),
  actor_name text not null,
  action text not null,
  field_name text not null,
  old_value text not null default '',
  new_value text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.demo_usage_events (
  id uuid primary key default gen_random_uuid(),
  access_key_hash text not null,
  ip_hash text not null,
  route_group text not null check (route_group in ('ai_extract', 'ai_journal', 'export', 'mutation', 'upload')),
  created_at timestamptz not null default now()
);

create index if not exists documents_status_idx on public.documents(status);
create index if not exists documents_vendor_name_idx on public.documents(vendor_name);
create index if not exists documents_issue_date_idx on public.documents(issue_date);
create index if not exists policy_warnings_document_id_idx on public.policy_warnings(document_id);
create index if not exists audit_logs_document_id_created_at_idx on public.audit_logs(document_id, created_at desc);
create index if not exists demo_usage_events_access_key_route_created_at_idx
on public.demo_usage_events(access_key_hash, route_group, created_at desc);
create index if not exists demo_usage_events_ip_route_created_at_idx
on public.demo_usage_events(ip_hash, route_group, created_at desc);
create index if not exists demo_usage_events_route_created_at_idx
on public.demo_usage_events(route_group, created_at desc);

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

alter table public.documents enable row level security;
alter table public.journal_entries enable row level security;
alter table public.policy_warnings enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_logs enable row level security;
alter table public.demo_usage_events enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.documents to service_role;
grant select, insert, update, delete on table public.journal_entries to service_role;
grant select, insert, update, delete on table public.policy_warnings to service_role;
grant select, insert, update, delete on table public.approvals to service_role;
grant select, insert, update, delete on table public.audit_logs to service_role;
grant select, insert, update, delete on table public.demo_usage_events to service_role;
grant usage, select on all sequences in schema public to service_role;

comment on table public.documents is 'RLSを有効化しています。server-side Route Handlerはservice_roleを使い、anon/authenticated policyはこのschemaの対象外です。';
comment on table public.policy_warnings is 'rule-based review warningです。このsample schemaではRLSを有効化していますが、production auth policyはこのrepositoryでは扱いません。';
comment on table public.demo_usage_events is '公開URLのrate-limit記録です。確認用キーの生値とclient IPは保存せず、SHA-256 hashだけを記録します。';
