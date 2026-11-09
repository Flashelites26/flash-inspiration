-- Flash Inspiration MVP database schema (Supabase PostgreSQL)
-- Run this whole script in Supabase Dashboard > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 240),
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 3 and 500),
  topic text not null default 'Other' check (topic in ('Life','Courage','Creativity','Change','Love','Gratitude','Music','Other')),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (quote_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists quotes_public_feed_idx on public.quotes(status, created_at desc);
create index if not exists quotes_author_idx on public.quotes(author_id, created_at desc);
create index if not exists comments_quote_idx on public.comments(quote_id, created_at);

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Authors can update their profile" on public.profiles;
create policy "Authors can update their profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Published quotes are publicly readable" on public.quotes;
create policy "Published quotes are publicly readable" on public.quotes for select using (status = 'published' or (select auth.uid()) = author_id);
drop policy if exists "Authors can submit quotes" on public.quotes;
create policy "Authors can submit quotes" on public.quotes for insert to authenticated with check ((select auth.uid()) = author_id and status = 'pending');
drop policy if exists "Authors can edit their pending quotes" on public.quotes;
create policy "Authors can edit their pending quotes" on public.quotes for update to authenticated using ((select auth.uid()) = author_id and status = 'pending') with check ((select auth.uid()) = author_id and status = 'pending');
drop policy if exists "Authors can delete their pending quotes" on public.quotes;
create policy "Authors can delete their pending quotes" on public.quotes for delete to authenticated using ((select auth.uid()) = author_id and status = 'pending');

drop policy if exists "Likes are publicly readable" on public.likes;
create policy "Likes are publicly readable" on public.likes for select using (exists (select 1 from public.quotes q where q.id = quote_id and q.status = 'published'));
drop policy if exists "Users can like as themselves" on public.likes;
create policy "Users can like as themselves" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.quotes q where q.id = quote_id and q.status = 'published'));
drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Comments on published quotes are publicly readable" on public.comments;
create policy "Comments on published quotes are publicly readable" on public.comments for select using (exists (select 1 from public.quotes q where q.id = quote_id and q.status = 'published'));
drop policy if exists "Authenticated users can comment on published quotes" on public.comments;
create policy "Authenticated users can comment on published quotes" on public.comments for insert to authenticated with check ((select auth.uid()) = author_id and exists (select 1 from public.quotes q where q.id = quote_id and q.status = 'published'));
drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments" on public.comments for delete to authenticated using ((select auth.uid()) = author_id);

grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.quotes, public.likes, public.comments to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant insert, update, delete on public.quotes to authenticated;
grant insert, delete on public.likes to authenticated;
grant insert, delete on public.comments to authenticated;

-- Moderation: review submissions in Table Editor. To publish an approved quote:
-- update public.quotes set status = 'published' where id = '<quote-uuid>';
-- Keep moderation/admin privileges in the Supabase dashboard; never expose service_role credentials in the website.
