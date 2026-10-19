-- ============================================================================
-- SCRIPT 015: Permissões de Catálogo e Tabelas Secundárias (100% Seguro)
-- Batata Top Delivery - Políticas RLS com Verificação de Existência de Tabelas
-- ============================================================================

-- 0. Garantir role de admin confirmada para os dois donos
UPDATE public.profiles
SET role = 'admin'
WHERE lower(email) IN ('enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com');

-- ----------------------------------------------------------------------------
-- 1. TABELA PRODUCTS (Produtos do cardápio - existe com certeza)
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
-- 2. TABELA ADICIONAIS (existe com certeza)
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
-- 3. TABELA PRODUCT_ADICIONAIS (existe com certeza)
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
-- 4. TABELA COUPONS & STORE_SETTINGS (existem com certeza)
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
-- 5. VERIFICAÇÃO CONDICIONAL SEGURA (Apenas aplica SE a tabela existir no banco):
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Payment Cards
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_cards') THEN
    EXECUTE 'ALTER TABLE public.payment_cards ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own payment cards" ON public.payment_cards';
    EXECUTE 'CREATE POLICY "Users can view own payment cards" ON public.payment_cards FOR SELECT TO authenticated USING (auth.uid() = user_id)';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own payment cards" ON public.payment_cards';
    EXECUTE 'CREATE POLICY "Users can delete own payment cards" ON public.payment_cards FOR DELETE TO authenticated USING (auth.uid() = user_id)';
  END IF;

  -- Feedbacks
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feedbacks') THEN
    EXECUTE 'ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can insert feedbacks" ON public.feedbacks';
    EXECUTE 'CREATE POLICY "Anyone can insert feedbacks" ON public.feedbacks FOR INSERT TO public WITH CHECK (true)';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can view all feedbacks" ON public.feedbacks';
    EXECUTE 'CREATE POLICY "Admins can view all feedbacks" ON public.feedbacks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'') OR auth.jwt() ->> ''email'' IN (''enzzobaraldo2008@gmail.com'', ''maraysis9010@gmail.com''))';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete feedbacks" ON public.feedbacks';
    EXECUTE 'CREATE POLICY "Admins can delete feedbacks" ON public.feedbacks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'') OR auth.jwt() ->> ''email'' IN (''enzzobaraldo2008@gmail.com'', ''maraysis9010@gmail.com''))';
  END IF;

  -- Uploaded Images
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'uploaded_images') THEN
    EXECUTE 'ALTER TABLE public.uploaded_images ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view uploaded images" ON public.uploaded_images';
    EXECUTE 'CREATE POLICY "Anyone can view uploaded images" ON public.uploaded_images FOR SELECT TO public USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage uploaded images" ON public.uploaded_images';
    EXECUTE 'CREATE POLICY "Admins can manage uploaded images" ON public.uploaded_images FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'') OR auth.jwt() ->> ''email'' IN (''enzzobaraldo2008@gmail.com'', ''maraysis9010@gmail.com'')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = ''admin'') OR auth.jwt() ->> ''email'' IN (''enzzobaraldo2008@gmail.com'', ''maraysis9010@gmail.com''))';
  END IF;

  -- User Push Tokens (Se a tabela não existir, NÃO faz nada e NÃO dá erro!)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_push_tokens') THEN
    EXECUTE 'ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage own push tokens" ON public.user_push_tokens';
    EXECUTE 'CREATE POLICY "Users can manage own push tokens" ON public.user_push_tokens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;
