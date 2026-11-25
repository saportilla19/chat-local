-- Pega todo esto en Supabase > SQL Editor y pulsa Run

create table if not exists messages (
  id text primary key,
  name text not null,
  ts bigint not null,
  type text not null,
  text text,
  data text,
  sticker text,
  dur int
);
create index if not exists messages_ts_idx on messages (ts desc);

create table if not exists stickers (
  id text primary key,
  url text not null,
  created_at timestamptz default now()
);

-- Solo el servidor (clave secreta) puede leer/escribir las tablas
alter table messages enable row level security;
alter table stickers enable row level security;

-- Carpeta pública para imágenes, audios y stickers
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
