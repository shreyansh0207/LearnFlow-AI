-- Table privileges for the scoped roles. Row Level Security (enabled on every
-- table in earlier migrations) decides which ROWS each role can see or change;
-- these grants only decide which statements are allowed at all.

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;

-- Future tables and sequences get the same privileges automatically.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
alter default privileges in schema public grant usage, select on sequences to authenticated;
