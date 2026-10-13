-- ============================================================================
-- SCRIPT 015: Permissões Completas de Catálogo, Feedbacks, Cartões e Imagens
-- Batata Top Delivery - Hardening e Garantia de Operação para Clientes e Admins
-- ============================================================================

-- 0. Garantir role de admin confirmada para os dois donos
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com');

-- ----------------------------------------------------------------------------
-- 1. TABELA PRODUCTS (Produtos do cardápio)
-- ----------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view available products" ON public.products;
CREATE POLICY "Anyone can view available products"
ON public.products FOR SELECT TO public
USING (true);

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
-- 2. TABELA ADICIONAIS
-- ----------------------------------------------------------------------------
ALTER TABLE public.adicionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view adicionais" ON public.adicionais;
CREATE POLICY "Anyone can view adicionais"
ON public.adicionais FOR SELECT TO public
USING (true);

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
-- 3. TABELA PRODUCT_ADICIONAIS
-- ----------------------------------------------------------------------------
ALTER TABLE public.product_adicionais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product_adicionais" ON public.product_adicionais;
CREATE POLICY "Anyone can view product_adicionais"
ON public.product_adicionais FOR SELECT TO public
USING (true);

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
-- 4. TABELA COUPONS & STORE_SETTINGS
-- ----------------------------------------------------------------------------
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active coupons" ON public.coupons;
CREATE POLICY "Anyone can view active coupons"
ON public.coupons FOR SELECT TO public
USING (active = true);

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

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view store_settings" ON public.store_settings;
CREATE POLICY "Anyone can view store_settings"
ON public.store_settings FOR SELECT TO public
USING (true);

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

-- ----------------------------------------------------------------------------
-- 5. TABELA PAYMENT_CARDS (Cartões Salvos dos Clientes)
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payment cards" ON public.payment_cards;
CREATE POLICY "Users can view own payment cards"
ON public.payment_cards FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own payment cards" ON public.payment_cards;
CREATE POLICY "Users can delete own payment cards"
ON public.payment_cards FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. TABELA FEEDBACKS (Avaliações dos Clientes)
-- ----------------------------------------------------------------------------
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert feedbacks" ON public.feedbacks;
CREATE POLICY "Anyone can insert feedbacks"
ON public.feedbacks FOR INSERT TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all feedbacks" ON public.feedbacks;
CREATE POLICY "Admins can view all feedbacks"
ON public.feedbacks FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

DROP POLICY IF EXISTS "Admins can delete feedbacks" ON public.feedbacks;
CREATE POLICY "Admins can delete feedbacks"
ON public.feedbacks FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);

-- ----------------------------------------------------------------------------
-- 7. TABELA USER_PUSH_TOKENS (Tokens de Notificação dos Clientes)
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.user_push_tokens;
CREATE POLICY "Users can manage own push tokens"
ON public.user_push_tokens FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 8. TABELA UPLOADED_IMAGES (Fotos dos Produtos e Banners)
-- ----------------------------------------------------------------------------
ALTER TABLE public.uploaded_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view uploaded images" ON public.uploaded_images;
CREATE POLICY "Anyone can view uploaded images"
ON public.uploaded_images FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS "Admins can manage uploaded images" ON public.uploaded_images;
CREATE POLICY "Admins can manage uploaded images"
ON public.uploaded_images FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR auth.jwt() ->> 'email' IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com')
);
