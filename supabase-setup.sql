-- Frameboard Studio 2.0: one-time Supabase setup.
-- Paste into Supabase -> SQL Editor -> Run. Safe to run again (idempotent).
--
-- WARNING: by design there is no login. Anyone with the site link (and the
-- publishable key, which is in config.js) can read, edit and delete boards.

-- Tables ---------------------------------------------------------------------

create table if not exists public.projects (
  id          text primary key,
  record      jsonb not null,
  rev         bigint not null default 1,
  updated_at  timestamptz not null default now(),
  snapshot_at timestamptz
);

create table if not exists public.project_history (
  id         bigserial primary key,
  project_id text not null,
  record     jsonb not null,
  saved_at   timestamptz not null default now()
);
create index if not exists project_history_project_idx
  on public.project_history (project_id, saved_at desc);

create table if not exists public.trash (
  id         bigserial primary key,
  project_id text not null,
  record     jsonb not null,
  deleted_at timestamptz not null default now()
);
create index if not exists trash_deleted_idx on public.trash (deleted_at desc);

-- Triggers -------------------------------------------------------------------

-- Sets rev / updated_at, and snapshots the previous version into
-- project_history at most every 10 minutes (keeps 25 per project).
create or replace function public.frameboard_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.snapshot_at := null;
  else
    new.rev := old.rev + 1;
    new.snapshot_at := old.snapshot_at;
    if old.snapshot_at is null or old.snapshot_at < now() - interval '10 minutes' then
      insert into public.project_history (project_id, record, saved_at)
      values (old.id, old.record, old.updated_at);
      delete from public.project_history
      where project_id = old.id
        and id not in (
          select id from public.project_history
          where project_id = old.id
          order by saved_at desc, id desc
          limit 25
        );
      new.snapshot_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists frameboard_before_write on public.projects;
create trigger frameboard_before_write
  before insert or update on public.projects
  for each row execute function public.frameboard_before_write();

-- Copies deleted projects into trash ("Recently deleted"), keeps the last 100.
create or replace function public.frameboard_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trash (project_id, record) values (old.id, old.record);
  delete from public.trash
  where id not in (
    select id from public.trash order by deleted_at desc, id desc limit 100
  );
  return old;
end;
$$;

drop trigger if exists frameboard_after_delete on public.projects;
create trigger frameboard_after_delete
  after delete on public.projects
  for each row execute function public.frameboard_after_delete();

-- Access (open, no login) ----------------------------------------------------

alter table public.projects        enable row level security;
alter table public.project_history enable row level security;
alter table public.trash           enable row level security;

grant select, insert, update, delete on public.projects to anon, authenticated;
grant select, delete on public.trash to anon, authenticated;
revoke all on public.project_history from anon, authenticated;

drop policy if exists "frameboard open projects" on public.projects;
create policy "frameboard open projects" on public.projects
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "frameboard read trash" on public.trash;
create policy "frameboard read trash" on public.trash
  for select to anon, authenticated using (true);

drop policy if exists "frameboard delete trash" on public.trash;
create policy "frameboard delete trash" on public.trash
  for delete to anon, authenticated using (true);

-- project_history has no policies on purpose: server-side backup only.

-- Image storage --------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'frameboard-images', 'frameboard-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "frameboard images insert" on storage.objects;
create policy "frameboard images insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'frameboard-images');

drop policy if exists "frameboard images read" on storage.objects;
create policy "frameboard images read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'frameboard-images');
