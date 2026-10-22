-- Erek — Faz 10: arşive düşen hedef/alışkanlığın paylaşımı kendiliğinden biter
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir (idempotent).
--
-- Uygulama (src/db/archive.ts) hedefi tamamlandıktan 3 gün sonra, alışkanlığı
-- bitiş tarihinden 3 gün sonra arşive alır. Arşiv cihazda, yerel tarihle
-- hesaplanır; sunucu kullanıcının saat dilimini bilmez. Bu yüzden buradaki
-- kural hiçbir saat diliminde uygulamadan ÖNCE davranmayacak şekilde seçildi:
--   hedef:      completed_at + 72 saat geçti (yerel 3. günün başı hep bundan önce)
--   alışkanlık: bitiş günü + 3 gün, UTC 12:00 (UTC-12'de bile yerel 3. gün başladı)
-- En fazla ~1 gün geç kalabilir; erken asla. Arkadaş taraftaki liste zaten
-- get_shared_goals()/get_shared_habits()'ten geldiği için satır silinince düşer.
--
-- "Geri al" (unarchived_at) archive.ts ile aynı: geri alınan öğe yeniden
-- tamamlanana / yeniden bitene kadar dokunulmaz. Geri alınca paylaşım kendiliğinden
-- geri gelmez; sahibi isterse yeniden paylaşır.

-- Bozuk metin tarihleri hatayla bütün işi durdurmasın diye yalnız biçimi
-- tutanlar çevrilir, gerisi NULL (= hiç arşivlenmemiş sayılır).
create or replace function public.try_timestamptz(p text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then p::timestamptz end
$$;
revoke all on function public.try_timestamptz(text) from public, anon, authenticated;

create or replace function public.try_date(p text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when p ~ '^\d{4}-\d{2}-\d{2}$' then p::date end
$$;
revoke all on function public.try_date(text) from public, anon, authenticated;

create or replace function public.end_archived_shares()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.goal_shares s
  using public.goals g
  where g.id = s.goal_id
    and g.user_id = s.owner_id
    and public.try_timestamptz(g.completed_at) <= now() - interval '3 days'
    and (g.goal_type <> 'numeric'
         or (g.target_value > 0 and public.goal_current_value(g.id) >= g.target_value))
    and (g.unarchived_at is null
         or public.try_timestamptz(g.unarchived_at) < public.try_timestamptz(g.completed_at));

  delete from public.habit_shares s
  using public.habits h
  where h.id = s.habit_id
    and h.user_id = s.owner_id
    and (public.try_date(h.end_date) + 3)::timestamp + interval '12 hours'
        <= (now() at time zone 'UTC')
    and (h.unarchived_at is null
         or public.try_date(h.end_date)
            >= (public.try_timestamptz(h.unarchived_at) at time zone 'UTC')::date);
end;
$$;
revoke all on function public.end_archived_shares() from public, anon, authenticated;

-- Saatte bir çalıştır (pg_cron; Supabase'de ücretsiz planda da var). Aynı adla
-- yeniden zamanlamak eski işi günceller, çift iş oluşmaz. pg_cron olmayan bir
-- Postgres'te (yerel test) yalnız uyarı verir.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('end-archived-shares', '17 * * * *', 'select public.end_archived_shares()');
  else
    raise notice 'pg_cron yok: end_archived_shares() zamanlanmadı';
  end if;
end $$;
-- Şimdi bir kez: geçmişte arşive düşmüş paylaşımlar da hemen temizlensin.
select public.end_archived_shares();
