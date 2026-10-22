-- Erek — Faz 9: Supabase Advisor uyarıları (performans + güvenlik)
-- Supabase panelinde: SQL Editor > New query > bu dosyayı yapıştır > Run.
-- Yeniden çalıştırılabilir (idempotent); veri ve yetkilere dokunmaz.
--
-- 1) auth_rls_initplan (Performance Advisor, 8 tablo): policy'lerde çıplak
--    `auth.uid()` her satır için yeniden çağrılır. `(select auth.uid())`
--    yazılınca Postgres onu sorgu başına BİR kez hesaplar (initPlan). Anlam
--    aynı; yalnız büyük tablolarda tarama hızlanır.
--    Policy'ler elle yeniden yazılmıyor: user_plan gibi panelden kurulmuş,
--    repoda tanımı olmayan tablolar da var. Bunun yerine public şemadaki her
--    policy'nin mevcut ifadesi okunur, çıplak çağrılar sarılır ve ALTER POLICY
--    ile yerine konur (rol, komut ve permissive/restrictive aynen kalır).
--
-- 2) function_search_path_mutable (Security Advisor): set_server_updated_at
--    search_path sabitlemiyordu. Gövdesi yalnız now() (pg_catalog) kullanıyor,
--    bu yüzden boş search_path güvenli.

do $$
declare
  p      record;
  fn     text;
  new_q  text;
  new_wc text;
begin
  for p in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    new_q  := p.qual;
    new_wc := p.with_check;
    foreach fn in array array['uid', 'role', 'jwt'] loop
      -- Zaten sarılı olanlar Postgres'in yazdığı biçimde döner:
      -- "( SELECT auth.uid() AS uid)". Önce onları koru, sonra çıplakları sar.
      new_q  := replace(new_q,  format('( SELECT auth.%s() AS %s)', fn, fn), format('§%s§', fn));
      new_wc := replace(new_wc, format('( SELECT auth.%s() AS %s)', fn, fn), format('§%s§', fn));
      new_q  := replace(new_q,  format('auth.%s()', fn), format('§%s§', fn));
      new_wc := replace(new_wc, format('auth.%s()', fn), format('§%s§', fn));
      new_q  := replace(new_q,  format('§%s§', fn), format('(select auth.%s())', fn));
      new_wc := replace(new_wc, format('§%s§', fn), format('(select auth.%s())', fn));
    end loop;

    if new_q is distinct from p.qual then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, new_q);
    end if;
    if new_wc is distinct from p.with_check then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, new_wc);
    end if;
  end loop;
end $$;

alter function public.set_server_updated_at() set search_path = '';
