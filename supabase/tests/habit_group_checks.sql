-- Faz 12: ortak alışkanlık (katıl/ayrıl, kural yayılımı, kayıt okuma, sınırlar).
-- Çalıştırma: schema.sql + phase12-habit-groups.sql'den sonra (PGlite/Supabase taklidi).
-- Kullanıcılar: a = kurucu; b, c, d, e, f = a'nın arkadaşları; x = kimsenin arkadaşı değil.
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000aa','a@x'),('00000000-0000-0000-0000-0000000000bb','b@x'),
 ('00000000-0000-0000-0000-0000000000cc','c@x'),('00000000-0000-0000-0000-0000000000dd','d@x'),
 ('00000000-0000-0000-0000-0000000000ee','e@x'),('00000000-0000-0000-0000-0000000000ff','f@x'),
 ('00000000-0000-0000-0000-0000000000a9','x@x');
insert into public.connections (user_a, user_b)
 select '00000000-0000-0000-0000-0000000000aa', id from auth.users
 where id::text > '00000000-0000-0000-0000-0000000000aa';
insert into public.connections (user_a, user_b) values
 ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-0000000000cc');

create or replace function public.t_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false)
$$;

-- a'nın alışkanlığı: her gün koşu, 1 Ekim'den beri; b ve c ile paylaşılmış.
insert into public.habits (id, user_id, title, kind, icon, schedule, start_date, updated_at) values
 ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000aa','Koş','binary','run',null,'2026-10-01', now());
insert into public.habit_shares (habit_id, owner_id, shared_with_id) values
 ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000bb'),
 ('00000000-0000-0000-0000-00000000b001','00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000cc');

do $$
declare r jsonb; r2 jsonb; v_copy uuid; v_n int; v_title text; v_start text; v_ts timestamptz; v_icon text;
begin
  -- Paylaşılmamış biri katılamaz.
  perform public.t_as('00000000-0000-0000-0000-0000000000a9');
  r := public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29');
  if r->>'error' is distinct from 'ERK_NOT_SHARED' then raise exception 'x katıldı: %', r; end if;

  -- b katılır: kendi hesabında kopya, bugünden başlar.
  perform public.t_as('00000000-0000-0000-0000-0000000000bb');
  r := public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29');
  if (r->>'ok') is distinct from 'true' then raise exception 'b katılamadı: %', r; end if;
  v_copy := (r->>'habit_id')::uuid;
  select title, start_date into v_title, v_start from public.habits
   where id = v_copy and user_id = '00000000-0000-0000-0000-0000000000bb';
  if v_title is distinct from 'Koş' or v_start is distinct from '2026-10-29' then
    raise exception 'kopya yanlış: % %', v_title, v_start;
  end if;
  -- Tekrar katılmak yeni kopya açmaz.
  r2 := public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-30');
  if r2->>'habit_id' is distinct from r->>'habit_id' then raise exception 'ikinci kopya: %', r2; end if;
  if (select count(*) from public.habits where user_id = '00000000-0000-0000-0000-0000000000bb') <> 1 then
    raise exception 'b''de birden çok kopya';
  end if;

  -- Gruplar: a ve b aynı grubu görür, ikisi de üye listesinde.
  r := public.get_my_habit_groups();
  if jsonb_array_length(r) <> 1 or jsonb_array_length(r->0->'members') <> 2 then raise exception 'b grupları: %', r; end if;
  if (r->0->'members'->0->>'is_owner') <> 'true' or (r->0->'members'->1->>'is_me') <> 'true' then
    raise exception 'üye sırası/işaretleri: %', r;
  end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  r := public.get_my_habit_groups();
  if jsonb_array_length(r) <> 1 or (r->0->>'group_id') <> '00000000-0000-0000-0000-00000000b001' then
    raise exception 'a grupları: %', r;
  end if;
  -- c henüz katılmadı: grubu görmez.
  perform public.t_as('00000000-0000-0000-0000-0000000000cc');
  if jsonb_array_length(public.get_my_habit_groups()) <> 0 then raise exception 'c katılmadan grubu gördü'; end if;
  if exists (select 1 from public.get_habit_group_logs()) then raise exception 'c katılmadan kayıt gördü'; end if;

  -- Kayıtlar: herkes yalnız ÖTEKİLERİNKİNİ alır; grup başlamadan önceki eski kayıt gelmez.
  insert into public.habit_logs (id, habit_id, log_date, completed, amount, updated_at) values
   ('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000b001','2020-01-01',1,0,now()),
   ('00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000b001', to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD'),1,0,now()),
   ('00000000-0000-0000-0000-00000000c003', v_copy, to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD'),1,0,now());
  perform public.t_as('00000000-0000-0000-0000-0000000000bb');
  select count(*) into v_n from public.get_habit_group_logs() l where l.habit_id = '00000000-0000-0000-0000-00000000b001';
  if v_n <> 1 then raise exception 'b a''nın kayıtlarından % aldı (1 beklenirdi)', v_n; end if;
  if exists (select 1 from public.get_habit_group_logs() l where l.habit_id = v_copy) then raise exception 'b kendi kaydını aldı'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  select count(*) into v_n from public.get_habit_group_logs() l where l.habit_id = v_copy;
  if v_n <> 1 then raise exception 'a b''nin kaydını almadı'; end if;
  -- İmleç: son satırdan sonrası boş.
  select max(server_updated_at) into v_ts from public.get_habit_group_logs();
  if exists (select 1 from public.get_habit_group_logs(v_ts, 'ffffffff-ffff-ffff-ffff-ffffffffffff')) then
    raise exception 'imleç sonrası satır geldi';
  end if;

  -- Kurucu kuralı değiştirir -> kopyaya yayılır, kopyanın updated_at'i artar.
  select updated_at into v_ts from public.habits where id = v_copy;
  update public.habits set title = 'Sabah koşusu', schedule = '{"days":[1,3,5]}', updated_at = now()
   where id = '00000000-0000-0000-0000-00000000b001';
  select title into v_title from public.habits where id = v_copy;
  if v_title is distinct from 'Sabah koşusu' then raise exception 'yayılmadı: %', v_title; end if;
  if (select schedule from public.habits where id = v_copy) is distinct from '{"days":[1,3,5]}' then raise exception 'sıklık yayılmadı'; end if;
  if (select updated_at from public.habits where id = v_copy) <= v_ts then raise exception 'kopyanın updated_at''i artmadı'; end if;

  -- Üye kuralı değiştirmeye kalkar -> geri çekilir; kişisel alan (ikon) kalır.
  update public.habits set title = 'Hile', target_amount = 5, icon = 'star', updated_at = now() where id = v_copy;
  select title, icon into v_title, v_icon from public.habits where id = v_copy;
  if v_title is distinct from 'Sabah koşusu' or (select target_amount from public.habits where id = v_copy) is not null then
    raise exception 'kural düzeltilmedi: %', v_title;
  end if;
  if v_icon is distinct from 'star' then raise exception 'kişisel ikon ezildi: %', v_icon; end if;

  -- Zincir yok: b kopyasını c ile paylaşır, c kopyaya katılamaz.
  insert into public.habit_shares (habit_id, owner_id, shared_with_id)
   values (v_copy, '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000cc');
  perform public.t_as('00000000-0000-0000-0000-0000000000cc');
  r := public.join_habit_group(v_copy, '2026-10-29');
  if r->>'error' is distinct from 'ERK_GROUP_NESTED' then raise exception 'zincir: %', r; end if;

  -- Sınır: kurucu + 4. c, d, e katılır (b ile 4 üye); f giremez.
  insert into public.habit_shares (habit_id, owner_id, shared_with_id)
   select '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000aa', u.id
   from auth.users u where u.email in ('d@x','e@x','f@x');
  perform public.t_as('00000000-0000-0000-0000-0000000000cc');
  if public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29')->>'ok' is null then raise exception 'c katılamadı'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000dd');
  if public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29')->>'ok' is null then raise exception 'd katılamadı'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000ee');
  if public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29')->>'ok' is null then raise exception 'e katılamadı'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000ff');
  r := public.join_habit_group('00000000-0000-0000-0000-00000000b001', '2026-10-29');
  if r->>'error' is distinct from 'ERK_GROUP_FULL' then raise exception 'sınır aşıldı: %', r; end if;

  -- Kurucu b ile paylaşımı kaldırır -> b gruptan düşer, kopyası kalır.
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  perform public.unshare_habit('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000bb');
  perform public.t_as('00000000-0000-0000-0000-0000000000bb');
  if jsonb_array_length(public.get_my_habit_groups()) <> 0 then raise exception 'b paylaşım bitince grupta kaldı'; end if;
  if not exists (select 1 from public.habits where id = v_copy and deleted_at is null) then raise exception 'b''nin kopyası gitti'; end if;
  -- Gruptan çıkınca kural kilidi de kalkar.
  update public.habits set title = 'Benim koşum', updated_at = now() where id = v_copy;
  if (select title from public.habits where id = v_copy) <> 'Benim koşum' then raise exception 'çıkınca kilit kalkmadı'; end if;

  -- c kendi kopyasıyla ayrılır.
  perform public.t_as('00000000-0000-0000-0000-0000000000cc');
  perform public.leave_habit_group((select member_habit_id from public.habit_group_members
                                    where member_id = '00000000-0000-0000-0000-0000000000cc'));
  if jsonb_array_length(public.get_my_habit_groups()) <> 0 then raise exception 'c ayrılamadı'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  if jsonb_array_length(public.get_my_habit_groups()->0->'members') <> 3 then raise exception 'a''nın grubunda 3 kişi kalmalı'; end if;

  -- Başkası bir üyeyi gruptan atamaz (d, e'nin kopyasıyla ayrılmaya çalışır).
  perform public.t_as('00000000-0000-0000-0000-0000000000dd');
  perform public.leave_habit_group((select member_habit_id from public.habit_group_members
                                    where member_id = '00000000-0000-0000-0000-0000000000ee'));
  perform public.leave_habit_group('00000000-0000-0000-0000-00000000b001');
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  if jsonb_array_length(public.get_my_habit_groups()->0->'members') <> 3 then raise exception 'üye olmayan grubu bozdu'; end if;

  -- Kurucu alışkanlığı silerse grup görünmez.
  update public.habits set deleted_at = now(), updated_at = now() where id = '00000000-0000-0000-0000-00000000b001';
  if jsonb_array_length(public.get_my_habit_groups()) <> 0 then raise exception 'silinen alışkanlığın grubu göründü'; end if;
  perform public.t_as('00000000-0000-0000-0000-0000000000dd');
  if jsonb_array_length(public.get_my_habit_groups()) <> 0 then raise exception 'd silinen grubu gördü'; end if;
  update public.habits set deleted_at = null, updated_at = now() where id = '00000000-0000-0000-0000-00000000b001';

  -- Kurucu grubu dağıtır.
  perform public.t_as('00000000-0000-0000-0000-0000000000aa');
  perform public.leave_habit_group('00000000-0000-0000-0000-00000000b001');
  if exists (select 1 from public.habit_group_members) then raise exception 'grup dağılmadı'; end if;

  raise notice 'habit_group_checks: HEPSİ OK';
end $$;
