
-- Locations Table
create table if not exists locations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  color text default '#64748b',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Messages Table
create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references auth.users(id) not null,
  receiver_id uuid references auth.users(id) not null,
  content text not null,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add location_id to appointments if not exists
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'appointments' and column_name = 'location_id') then
        alter table appointments add column location_id uuid references locations(id);
    end if;
end $$;

-- Enable RLS
alter table locations enable row level security;
alter table messages enable row level security;

-- Policies for Locations
create policy "Authenticated can read locations" on locations for select to authenticated using (true);
create policy "Authenticated can maintain locations" on locations for all to authenticated using (true);

-- Policies for Messages
create policy "Users can see their own messages" on messages for select
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send messages" on messages for insert
with check (auth.uid() = sender_id);

create policy "Users can update their received messages" on messages for update
using (auth.uid() = receiver_id);
