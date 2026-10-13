-- ============================================================================
-- SCRIPT 015: Permitir que administradores gerenciem Produtos, Adicionais, Cupons e Configurações
-- Batata Top Delivery - Políticas RLS de Escrita para Catálogo
-- ============================================================================

-- 0. Garantir que os proprietários principais tenham a role 'admin' confirmada em profiles
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com');

-- ----------------------------------------------------------------------------
-- 1. TABELA PRODUCTS (Produtos do cardápio)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
CREATE POLICY "Admins can insert products"
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can update products" ON public.products;
CREATE POLICY "Admins can update products"
ON public.products FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can delete products" ON public.products;
CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- ----------------------------------------------------------------------------
-- 2. TABELA ADICIONAIS (Opcionais e recheios)
-- ----------------------------------------------------------------------------
ALTER TABLE public.adicionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can insert adicionais" ON public.adicionais;
CREATE POLICY "Admins can insert adicionais"
ON public.adicionais FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can update adicionais" ON public.adicionais;
CREATE POLICY "Admins can update adicionais"
ON public.adicionais FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can delete adicionais" ON public.adicionais;
CREATE POLICY "Admins can delete adicionais"
ON public.adicionais FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- ----------------------------------------------------------------------------
-- 3. TABELA PRODUCT_ADICIONAIS (Vínculo Produto <-> Adicionais)
-- ----------------------------------------------------------------------------
ALTER TABLE public.product_adicionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage product_adicionais" ON public.product_adicionais;
CREATE POLICY "Admins can manage product_adicionais"
ON public.product_adicionais FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- ----------------------------------------------------------------------------
-- 4. TABELA COUPONS (Cupons de desconto)
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
CREATE POLICY "Admins can manage coupons"
ON public.coupons FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- ----------------------------------------------------------------------------
-- 5. TABELA STORE_SETTINGS (Status da loja, tempo de espera, taxas)
-- ----------------------------------------------------------------------------
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage store_settings" ON public.store_settings;
CREATE POLICY "Admins can manage store_settings"
ON public.store_settings FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);
