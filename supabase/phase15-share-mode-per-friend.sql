-- Erek — Faz 15: Paylaşım modu kişi başına ("Sadece görsünler" / "Birlikte yapalım")
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir. Faz 13'ten SONRA, istemciden ÖNCE çalıştırılır.
--
-- Faz 13'teki set_habit_share_mode alışkanlığın TÜM paylaşımlarını birden
-- değiştiriyordu; artık p_friend ile tek kişiyi (boş = hepsini) değiştirir.

drop function if exists public.set_habit_share_mode(uuid, boolean);

create or replace function public.set_habit_share_mode(p_habit_id uuid, p_together boolean, p_friend uuid default null)
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
  update public.habit_shares s
  set together = coalesce(p_together, true)
  where s.habit_id = p_habit_id and s.owner_id = v_uid
    and (p_friend is null or s.shared_with_id = p_friend);
end;
$$;
revoke all on function public.set_habit_share_mode(uuid, boolean, uuid) from public, anon;
grant execute on function public.set_habit_share_mode(uuid, boolean, uuid) to authenticated;
