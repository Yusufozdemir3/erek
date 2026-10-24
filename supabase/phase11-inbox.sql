-- Erek — Faz 11: Bildirimler kutusu (uygulama içi geçmiş)
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir (idempotent).
--
-- Tebrik, "arkadaşın bitirdi" ve dürtme şimdiye kadar yalnız anlık bildirimdi:
-- bildirim çekmecesinden silinince bir daha görülemiyordu. Kayıtlar zaten
-- tutuluyor (celebrations, nudges); bu fonksiyon alıcıya kendi son 30 gününü
-- okutur. Tablolarda hâlâ policy yok, tek okuma yolu bu.
--   * Yalnız arayanın kendisine gelenler (recipient_id = auth.uid()).
--   * Sessize aldığı ya da artık arkadaş olmadığı kişininkiler çıkmaz.
--   * Başlık o anki öğeden okunur; silinmiş öğenin satırı başlıksız gelir.

create index if not exists idx_celebrations_recipient
  on public.celebrations(recipient_id, created_at);

create or replace function public.get_inbox()
returns table (
  id uuid, type text, item_kind text, item_id uuid,
  sender_id uuid, sender_name text, item_title text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  rows as (
    select c.id, c.type, c.item_kind, c.item_id, c.sender_id, c.created_at
    from public.celebrations c, me
    where c.recipient_id = me.uid and c.created_at > now() - interval '30 days'
    union all
    select n.id, 'nudge', n.item_kind, n.item_id, n.sender_id, n.created_at
    from public.nudges n, me
    where n.recipient_id = me.uid and n.created_at > now() - interval '30 days'
  )
  select r.id, r.type, r.item_kind, r.item_id, r.sender_id, p.display_name,
         case r.item_kind
           when 'goal' then (select g.title from public.goals g where g.id = r.item_id and g.deleted_at is null)
           when 'habit' then (select h.title from public.habits h where h.id = r.item_id and h.deleted_at is null)
           else (select t.title from public.tasks t where t.id = r.item_id and t.deleted_at is null)
         end,
         r.created_at
  from rows r
  cross join me
  left join public.profiles p on p.id = r.sender_id
  where not exists (
      select 1 from public.nudge_mutes m where m.muter_id = me.uid and m.muted_id = r.sender_id
    )
    and public.are_connected(me.uid, r.sender_id)
  order by r.created_at desc
  limit 200
$$;
revoke all on function public.get_inbox() from public, anon;
grant execute on function public.get_inbox() to authenticated;
