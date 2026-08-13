create extension if not exists pgcrypto;
create schema if not exists tan;

create table if not exists tan.conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'public' check (channel in ('public', 'internal')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table tan.conversations add column if not exists agent_key text not null default 'tan';
alter table tan.conversations add column if not exists owner_user_id text;

do $$ begin
  alter table tan.conversations add constraint conversations_agent_key_check
    check (agent_key in ('tan', 'manager'));
exception when duplicate_object then null;
end $$;

create table if not exists tan.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references tan.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 8000),
  created_at timestamptz not null default now()
);

create table if not exists tan.programs (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  title text not null,
  summary text not null,
  year_levels int[] not null,
  jurisdictions text[] not null,
  theme text not null,
  delivery text not null,
  duration text,
  booking_url text not null,
  publication_version text not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists tan.audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  actor_id text,
  actor_role text,
  agent_key text not null check (agent_key in ('tan', 'manager')),
  event_type text not null,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists tan.ingestion_versions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null check (agent_key in ('public', 'manager')),
  version text not null,
  manifest jsonb not null,
  status text not null check (status in ('staged', 'active', 'retired', 'failed')),
  created_at timestamptz not null default now(),
  unique (agent_key, version)
);

create table if not exists tan.feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references tan.conversations(id) on delete cascade,
  message_id uuid references tan.messages(id) on delete cascade,
  rating smallint not null check (rating in (-1, 1)),
  category text,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on tan.messages (conversation_id, created_at);
create index if not exists programs_public_search_idx
  on tan.programs using gin (year_levels, jurisdictions);
create index if not exists conversations_owner_updated_idx
  on tan.conversations (owner_user_id, updated_at desc) where owner_user_id is not null;
create index if not exists audit_events_actor_created_idx
  on tan.audit_events (actor_id, created_at desc);
