-- Faz 10: end_archived_shares() yalnız arşive düşmüş hedef/alışkanlıkların paylaşımını siler.
-- Çalıştırma: schema.sql'den sonra (PGlite/Supabase taklidi).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa','a@x'),('00000000-0000-0000-0000-0000000000bb','b@x');
insert into public.connections (user_a, user_b) values ('00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000bb');
create or replace function public.t_iso(days numeric) returns text language sql as $$ select to_char((now() - make_interval(secs => days * 86400)) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;
create or replace function public.t_ymd(days int) returns text language sql as $$ select to_char((now() at time zone 'UTC')::date - days, 'YYYY-MM-DD') $$;
-- Hedefler (son hane = senaryo):
-- 1 adımlı, 4 gün önce tamam -> KES     2 adımlı, 2 gün önce tamam -> KALSIN
-- 3 sayısal 4 gün önce ama şimdi hedefin altında -> KALSIN
-- 4 sayısal 4 gün önce, arkadaş katkısıyla hedefte -> KES
-- 5 geri alınmış (unarchived > completed) -> KALSIN   6 bozuk tarih -> KALSIN
-- 7 tamamlanmamış -> KALSIN   8 tamamlanmış, 71 saat önce -> KALSIN
insert into public.goals (id, user_id, title, goal_type, target_value, value_baseline, completed_at, unarchived_at, updated_at) values
 ('00000000-0000-0000-0000-00000000a001','00000000-0000-0000-0000-0000000000aa','g1','milestone',null,0, t_iso(4), null, now()),
 ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-0000000000aa','g2','milestone',null,0, t_iso(2), null, now()),
 ('00000000-0000-0000-0000-00000000a003','00000000-0000-0000-0000-0000000000aa','g3','numeric',100,50, t_iso(4), null, now()),
 ('00000000-0000-0000-0000-00000000a004','00000000-0000-0000-0000-0000000000aa','g4','numeric',100,60, t_iso(4), null, now()),
 ('00000000-0000-0000-0000-00000000a005','00000000-0000-0000-0000-0000000000aa','g5','milestone',null,0, t_iso(10), t_iso(5), now()),
 ('00000000-0000-0000-0000-00000000a006','00000000-0000-0000-0000-0000000000aa','g6','milestone',null,0, 'dün akşam', null, now()),
 ('00000000-0000-0000-0000-00000000a007','00000000-0000-0000-0000-0000000000aa','g7','milestone',null,0, null, null, now()),
 ('00000000-0000-0000-0000-00000000a008','00000000-0000-0000-0000-0000000000aa','g8','milestone',null,0, t_iso(71.0/24), null, now());
insert into public.goal_entries (id, goal_id, amount, added_by, updated_at) values
 ('00000000-0000-0000-0000-00000000e004','00000000-0000-0000-0000-00000000a004', 40, '00000000-0000-0000-0000-0000000000bb', now());
-- Alışkanlıklar: 1 bitiş 4 gün önce -> KES   2 bitiş 2 gün önce -> KALSIN
-- 3 bitiş 4 gün önce ama bitişten sonra geri alınmış -> KALSIN   4 bitişsiz -> KALSIN
insert into public.habits (id, user_id, title, end_date, unarchived_at, updated_at) values
 ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000aa','h1', t_ymd(4), null, now()),
 ('00000000-0000-0000-0000-00000000b002','00000000-0000-0000-0000-0000000000aa','h2', t_ymd(2), null, now()),
 ('00000000-0000-0000-0000-00000000b003','00000000-0000-0000-0000-0000000000aa','h3', t_ymd(4), t_iso(1), now()),
 ('00000000-0000-0000-0000-00000000b004','00000000-0000-0000-0000-0000000000aa','h4', null, null, now());
insert into public.goal_shares (goal_id, owner_id, shared_with_id)
 select id, user_id, '00000000-0000-0000-0000-0000000000bb' from public.goals;
insert into public.habit_shares (habit_id, owner_id, shared_with_id)
 select id, user_id, '00000000-0000-0000-0000-0000000000bb' from public.habits;

select public.end_archived_shares();
do $$
declare g text; h text;
begin
  select string_agg(right(goal_id::text, 1), '' order by goal_id) into g from public.goal_shares;
  select string_agg(right(habit_id::text, 1), '' order by habit_id) into h from public.habit_shares;
  assert g = '235678', format('goal shares left: %s', g);
  assert h = '234', format('habit shares left: %s', h);
  -- Paylaşımın kendisi dışında hiçbir şey silinmedi
  assert (select count(*) from public.goals) = 8 and (select count(*) from public.habits) = 4, 'rows intact';
  assert not has_function_privilege('authenticated', 'public.end_archived_shares()', 'execute'), 'not callable by users';
end $$;
-- B'nin listesinde artık yalnız kalanlar var
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000bb"}', false);
do $$ begin
  assert (select count(*) from public.get_shared_goals()) = 6, format('B sees %s goals', (select count(*) from public.get_shared_goals()));
  assert (select count(*) from public.get_shared_habits()) = 3, 'B sees 3 habits';
end $$;
reset role;
drop function public.t_iso(numeric); drop function public.t_ymd(int);
