-- Backfill profiles for auth users created before the profile trigger existed.
--
-- Any environment where users sign in before migrations are applied ends up
-- with auth.users rows that have no profiles row (the on_auth_user_created
-- trigger wasn't there yet). Role grants and email lookups join through
-- profiles, so those accounts silently can't be granted anything.
-- Idempotent; safe to run anywhere.

insert into profiles (id, org_id, full_name, email)
select u.id,
       (select id from organizations order by created_at limit 1),
       coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
       u.email
from auth.users u
where u.email is not null
  and not exists (select 1 from profiles p where p.id = u.id);
