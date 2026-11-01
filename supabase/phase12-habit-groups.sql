-- Erek — Faz 12: Ortak alışkanlık (alışkanlık grupları)
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir (idempotent). İSTEMCİDEN ÖNCE çalıştırılmalı.
--
-- Paylaşılan bir alışkanlığa arkadaş "Katıl" der: sunucu onun hesabına
-- alışkanlığın bir KOPYASINI açar (normal senkronla cihazına iner; kendi
-- kayıtları, serisi, hatırlatması olur). Kopya ile asıl alışkanlık bir grupta
-- bağlanır; grup kimliği kurucunun alışkanlığının id'sidir.
--   * Senkron motoru değişmez: herkes yalnız KENDİ satırına yazar.
--   * Kurallar (ad, tür, sıklık, günlük hedef, birim, bitiş) kurucuda:
--     kurucu değiştirince kopyalara yayılır, üye değiştirmeye kalkarsa
--     sunucu kurucununkine geri çeker (hata fırlatmadan; updated_at artar ki
--     cihaz son-yazan-kazanır ile düzeltmeyi alsın).
--   * Üyelik ancak paylaşım (habit_shares) ve arkadaşlık sürdükçe geçerlidir;
--     paylaşım silinince üyelik de silinir. Kopya sahibinde normal alışkanlık
--     olarak kalır.
--   * En fazla 5 kişi (kurucu + 4). Bir üyenin kopyası grup kuramaz.
--   * Üyeler birbirinin adını ve günlük kayıtlarını görür (katılan buna onay verir).

create table if not exists public.habit_group_members (
  group_id uuid not null, -- kurucunun alışkanlığının id'si
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  member_habit_id uuid not null unique,
  joined_at timestamptz not null default now(),
  primary key (group_id, member_id),
  check (owner_id <> member_id)
);
create index if not exists idx_habit_group_members_member on public.habit_group_members(member_id);
create index if not exists idx_habit_group_members_owner on public.habit_group_members(owner_id);

alter table public.habit_group_members enable row level security;
-- Policy yok: tek okuma/yazma yolu aşağıdaki fonksiyonlar.

-- Bir grubun hâlâ geçerli üyeleri (kurucu hariç): iki alışkanlık da duruyor,
-- paylaşım ve arkadaşlık sürüyor. Yalnız diğer fonksiyonların iç yardımcısı.
create or replace function public.habit_group_active(p_group uuid)
returns table (member_id uuid, member_habit_id uuid, joined_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.member_id, m.member_habit_id, m.joined_at
  from public.habit_group_members m
  join public.habits o
    on o.id = m.group_id and o.user_id = m.owner_id and o.deleted_at is null
  join public.habits mh
    on mh.id = m.member_habit_id and mh.user_id = m.member_id and mh.deleted_at is null
  join public.habit_shares s
    on s.habit_id = m.group_id and s.owner_id = m.owner_id and s.shared_with_id = m.member_id
  where m.group_id = p_group
    and public.are_connected(m.owner_id, m.member_id)
$$;
revoke all on function public.habit_group_active(uuid) from public, anon, authenticated;

-- Arayanın kurucu ya da geçerli üye olduğu gruplar ve grubun başlangıcı
-- (ilk katılım). İç yardımcı.
create or replace function public.my_habit_groups()
returns table (group_id uuid, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  candidates as (
    select distinct m.group_id
    from public.habit_group_members m, me
    where m.owner_id = me.uid or m.member_id = me.uid
  ),
  active as (
    select c.group_id, a.member_id, a.joined_at
    from candidates c, lateral public.habit_group_active(c.group_id) a
  )
  select a.group_id, min(a.joined_at)
  from active a, me
  group by a.group_id, me.uid
  having bool_or(a.member_id = me.uid)
      or exists (select 1 from public.habits o where o.id = a.group_id and o.user_id = me.uid)
$$;
revoke all on function public.my_habit_groups() from public, anon, authenticated;

-- Katıl: arayana paylaşılan alışkanlığın kopyasını açar. p_today = cihazın
-- bugünü ("YYYY-MM-DD"); kopya o gün başlar. Zaten üyeyse var olan kopyayı döner.
create or replace function public.join_habit_group(p_habit_id uuid, p_today text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_existing uuid;
  v_new uuid := gen_random_uuid();
  v_today text := case when public.try_date(p_today) is not null then p_today
                       else to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') end;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  select h.user_id into v_owner
  from public.habits h
  join public.habit_shares s
    on s.habit_id = h.id and s.owner_id = h.user_id and s.shared_with_id = v_uid
  where h.id = p_habit_id and h.deleted_at is null
    and public.are_connected(h.user_id, v_uid);
  if v_owner is null then
    return jsonb_build_object('error', 'ERK_NOT_SHARED');
  end if;
  -- Zincir olmasın: bir üyenin kopyası kendi başına grup kuramaz.
  if exists (select 1 from public.habit_group_members m where m.member_habit_id = p_habit_id) then
    return jsonb_build_object('error', 'ERK_GROUP_NESTED');
  end if;
  -- Aynı anda katılanlar sınırı birlikte aşmasın.
  perform 1 from public.habits h where h.id = p_habit_id for update;

  select a.member_habit_id into v_existing
  from public.habit_group_active(p_habit_id) a
  where a.member_id = v_uid;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'habit_id', v_existing);
  end if;
  if (select count(*) from public.habit_group_active(p_habit_id)) >= 4 then
    return jsonb_build_object('error', 'ERK_GROUP_FULL');
  end if;

  insert into public.habits (
    id, user_id, title, kind, icon, color, schedule, target_amount, unit,
    start_date, end_date, goal_factor, updated_at
  )
  select v_new, v_uid, h.title, h.kind, h.icon, h.color, h.schedule, h.target_amount, h.unit,
         greatest(v_today, h.start_date), h.end_date, 1, now()
  from public.habits h
  where h.id = p_habit_id;

  insert into public.habit_group_members (group_id, owner_id, member_id, member_habit_id)
  values (p_habit_id, v_owner, v_uid, v_new)
  on conflict (group_id, member_id) do update
    set member_habit_id = excluded.member_habit_id, joined_at = now();

  return jsonb_build_object('ok', true, 'habit_id', v_new);
end;
$$;
revoke all on function public.join_habit_group(uuid, text) from public, anon;
grant execute on function public.join_habit_group(uuid, text) to authenticated;

-- Üye kendi kopyasının id'siyle gruptan ayrılır; kurucu kendi alışkanlığının
-- id'siyle grubu dağıtır. Kopyalar sahiplerinde normal alışkanlık olarak kalır.
create or replace function public.leave_habit_group(p_habit_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  delete from public.habit_group_members m
  where (m.member_habit_id = p_habit_id and m.member_id = v_uid)
     or (m.group_id = p_habit_id and m.owner_id = v_uid);
end;
$$;
revoke all on function public.leave_habit_group(uuid) from public, anon;
grant execute on function public.leave_habit_group(uuid) to authenticated;

-- Arayanın grupları ve üyeleri (kendisi dahil, is_me ile işaretli).
-- [{group_id, members: [{id, habit_id, is_owner, is_me, joined_at, name, avatar, skip_dates}]}]
create or replace function public.get_my_habit_groups()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using message = 'ERK_AUTH';
  end if;
  with groups as (select * from public.my_habit_groups()),
  people as (
    select g.group_id, a.member_id as uid, a.member_habit_id as habit_id, a.joined_at, false as is_owner
    from groups g, lateral public.habit_group_active(g.group_id) a
    union all
    select g.group_id, o.user_id, o.id, g.since, true
    from groups g
    join public.habits o on o.id = g.group_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'group_id', g.group_id,
    'members', (
      select jsonb_agg(jsonb_build_object(
        'id', p.uid,
        'habit_id', p.habit_id,
        'is_owner', p.is_owner,
        'is_me', p.uid = v_uid,
        'joined_at', p.joined_at,
        'name', pr.display_name,
        'avatar', pr.avatar_url,
        'skip_dates', h.skip_dates
      ) order by p.is_owner desc, p.joined_at)
      from people p
      join public.habits h on h.id = p.habit_id
      left join public.profiles pr on pr.id = p.uid
      where p.group_id = g.group_id
    )
  ) order by g.group_id), '[]'::jsonb)
  into v_result
  from groups g;
  return v_result;
end;
$$;
revoke all on function public.get_my_habit_groups() from public, anon;
grant execute on function public.get_my_habit_groups() to authenticated;

-- Grup arkadaşlarının günlük kayıtları (arayanın kendi kayıtları hariç; onlar
-- cihazında zaten var), grubun başlangıcından beri. get_shared_habit_logs gibi
-- (server_updated_at, id) imleciyle sayfa sayfa (en çok 2000).
create or replace function public.get_habit_group_logs(
  p_after_ts timestamptz default '-infinity',
  p_after_id uuid default '00000000-0000-0000-0000-000000000000'
)
returns table (
  id uuid, habit_id uuid, log_date text, completed integer, amount double precision,
  updated_at timestamptz, server_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  groups as (select * from public.my_habit_groups()),
  tracked as (
    select a.member_habit_id as hid, g.since
    from groups g, lateral public.habit_group_active(g.group_id) a
    union
    select g.group_id, g.since from groups g
  )
  select l.id, l.habit_id, l.log_date, l.completed, l.amount, l.updated_at, l.server_updated_at
  from tracked t
  join public.habits h on h.id = t.hid
  join public.habit_logs l on l.habit_id = t.hid
  cross join me
  where h.user_id <> me.uid
    and l.log_date >= to_char((t.since at time zone 'UTC')::date - 1, 'YYYY-MM-DD')
    and (l.server_updated_at, l.id) > (coalesce(p_after_ts, '-infinity'::timestamptz),
                                       coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid))
  order by l.server_updated_at, l.id
  limit 2000
$$;
revoke all on function public.get_habit_group_logs(timestamptz, uuid) from public, anon;
grant execute on function public.get_habit_group_logs(timestamptz, uuid) to authenticated;

-- Paylaşım biterse (kaldırma, arkadaşlıktan çıkma, arşiv) üyelik de biter.
create or replace function public.habit_shares_end_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.habit_group_members m
  where m.group_id = old.habit_id and m.member_id = old.shared_with_id;
  return old;
end;
$$;
revoke all on function public.habit_shares_end_membership() from public, anon, authenticated;
drop trigger if exists habit_shares_end_membership on public.habit_shares;
create trigger habit_shares_end_membership
  after delete on public.habit_shares
  for each row execute function public.habit_shares_end_membership();

-- Üyenin kopyasına yazılan kural alanları kurucununkine çekilir. Push yolunda
-- olduğu için ASLA hata fırlatmaz (fırlatsa üyenin senkronu o satırda kilitlenir).
create or replace function public.habit_group_enforce_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
begin
  select oh.title, oh.kind, oh.schedule, oh.target_amount, oh.unit, oh.end_date
  into o
  from public.habit_group_members m
  join public.habits oh
    on oh.id = m.group_id and oh.user_id = m.owner_id and oh.deleted_at is null
  where m.member_habit_id = new.id and m.member_id = new.user_id;
  if not found then
    return new;
  end if;
  if (new.title, new.kind, new.schedule, new.target_amount, new.unit, new.end_date)
     is distinct from (o.title, o.kind, o.schedule, o.target_amount, o.unit, o.end_date) then
    new.title := o.title;
    new.kind := o.kind;
    new.schedule := o.schedule;
    new.target_amount := o.target_amount;
    new.unit := o.unit;
    new.end_date := o.end_date;
    new.updated_at := greatest(now(), new.updated_at + interval '1 millisecond');
  end if;
  return new;
end;
$$;
revoke all on function public.habit_group_enforce_rules() from public, anon, authenticated;
drop trigger if exists habit_group_enforce_rules on public.habits;
create trigger habit_group_enforce_rules
  before insert or update on public.habits
  for each row execute function public.habit_group_enforce_rules();

-- Kurucu kuralları değiştirince kopyalara yayılır (yukarıdaki tetik de aynı
-- değerleri bulacağı için düzeltme döngüsü olmaz).
create or replace function public.habit_group_propagate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.habits h
  set title = new.title,
      kind = new.kind,
      schedule = new.schedule,
      target_amount = new.target_amount,
      unit = new.unit,
      end_date = new.end_date,
      updated_at = greatest(now(), h.updated_at + interval '1 millisecond')
  from public.habit_group_members m
  where m.group_id = new.id
    and m.owner_id = new.user_id
    and h.id = m.member_habit_id
    and h.user_id = m.member_id
    and h.deleted_at is null
    and (h.title, h.kind, h.schedule, h.target_amount, h.unit, h.end_date)
        is distinct from (new.title, new.kind, new.schedule, new.target_amount, new.unit, new.end_date);
  return null;
end;
$$;
revoke all on function public.habit_group_propagate() from public, anon, authenticated;
drop trigger if exists habit_group_propagate on public.habits;
create trigger habit_group_propagate
  after update of title, kind, schedule, target_amount, unit, end_date on public.habits
  for each row
  when ((old.title, old.kind, old.schedule, old.target_amount, old.unit, old.end_date)
        is distinct from (new.title, new.kind, new.schedule, new.target_amount, new.unit, new.end_date))
  execute function public.habit_group_propagate();
