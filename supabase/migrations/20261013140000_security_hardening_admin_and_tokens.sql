-- ============================================================
-- 013_security_hardening_admin_and_tokens.sql
-- Batata Top Delivery - Hardening de Segurança (Admin e Tokens)
-- IDs Corrigidos: B1-02, B1-03, B1-05, B1-06
-- ============================================================

-- 1. [B1-02] Proteger a coluna 'role' na tabela profiles contra alteração por usuários comuns
CREATE OR REPLACE FUNCTION public.protect_profiles_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Se a role estiver sendo alterada e a sessão não for service_role / superuser
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('request.jwt.claim.role', true) != 'service_role' AND CURRENT_USER NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Não é permitido alterar a role do perfil.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trigger_protect_profiles_role ON public.profiles;
CREATE TRIGGER trigger_protect_profiles_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_role();


-- 2. [B1-03, B1-06] Trigger handle_new_user segura (sem '%admin%' no e-mail e sem metadados frouxos)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  assigned_role TEXT := 'user';
BEGIN
  -- Apenas e-mails oficiais mestres recebem role de admin automaticamente
  IF NEW.email IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com') THEN
    assigned_role := 'admin';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE 
  SET email = EXCLUDED.email,
      role = CASE 
        WHEN EXCLUDED.email IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com') THEN 'admin'
        ELSE profiles.role 
      END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 3. [B1-05] Restringir inserção e gerenciamento em admin_push_tokens para admins reais
DROP POLICY IF EXISTS "Admin gerencia proprio token" ON public.admin_push_tokens;

CREATE POLICY "Admin gerencia proprio token"
  ON public.admin_push_tokens
  FOR ALL
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );


-- 4. [B1-06] search_path fixo e restrição na RPC increment_coupon_usage
DROP FUNCTION IF EXISTS public.increment_coupon_usage(uuid);
DROP FUNCTION IF EXISTS public.increment_coupon_usage;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.coupons
  SET current_uses = current_uses + 1
  WHERE id = coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Revoga execução pública direta via PostgREST da função de incremento avulso
REVOKE EXECUTE ON FUNCTION public.increment_coupon_usage(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(UUID) TO service_role;


-- 5. RPCs para gerenciamento seguro de administradores pelo painel (/admin/administradores)
DROP FUNCTION IF EXISTS public.admin_list_admins();
DROP FUNCTION IF EXISTS public.admin_list_admins;
DROP FUNCTION IF EXISTS public.admin_add_admin(text);
DROP FUNCTION IF EXISTS public.admin_add_admin;
DROP FUNCTION IF EXISTS public.admin_remove_admin(text);
DROP FUNCTION IF EXISTS public.admin_remove_admin;

CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  is_owner BOOLEAN
) AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    p.id AS user_id,
    p.email,
    (p.email IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')) AS is_owner
  FROM public.profiles p
  WHERE p.role = 'admin'
  ORDER BY is_owner DESC, p.email ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.admin_add_admin(p_email TEXT)
RETURNS JSONB AS $$
DECLARE
  v_caller_email TEXT;
  v_target_id UUID;
  v_current_role TEXT;
  v_clean_email TEXT := LOWER(TRIM(p_email));
BEGIN
  -- Apenas os proprietários principais têm permissão para adicionar administradores
  SELECT LOWER(email) INTO v_caller_email FROM public.profiles WHERE id = auth.uid();
  IF v_caller_email IS NULL THEN
    v_caller_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
  END IF;

  IF v_caller_email NOT IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT id, role INTO v_target_id, v_current_role
  FROM public.profiles
  WHERE LOWER(email) = v_clean_email;

  IF v_target_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_current_role = 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_admin');
  END IF;

  UPDATE public.profiles
  SET role = 'admin'
  WHERE id = v_target_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.admin_remove_admin(p_email TEXT)
RETURNS JSONB AS $$
DECLARE
  v_caller_email TEXT;
  v_target_id UUID;
  v_current_role TEXT;
  v_clean_email TEXT := LOWER(TRIM(p_email));
BEGIN
  -- Apenas os proprietários principais têm permissão para remover administradores
  SELECT LOWER(email) INTO v_caller_email FROM public.profiles WHERE id = auth.uid();
  IF v_caller_email IS NULL THEN
    v_caller_email := LOWER(COALESCE(auth.jwt() ->> 'email', ''));
  END IF;

  IF v_caller_email NOT IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_clean_email IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_protected');
  END IF;

  SELECT id, role INTO v_target_id, v_current_role
  FROM public.profiles
  WHERE LOWER(email) = v_clean_email;

  IF v_target_id IS NULL OR v_current_role != 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF v_target_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self');
  END IF;

  UPDATE public.profiles
  SET role = 'user'
  WHERE id = v_target_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_admin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_admin(TEXT) TO authenticated;


-- ============================================================
-- SCRIPT DE ROLLBACK (caso necessário desfazer):
-- ============================================================
/*
DROP TRIGGER IF EXISTS trigger_protect_profiles_role ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profiles_role();

DROP POLICY IF EXISTS "Admin gerencia proprio token" ON public.admin_push_tokens;
CREATE POLICY "Admin gerencia proprio token"
  ON public.admin_push_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(UUID) TO authenticated, anon;
*/
