import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { getEffectiveSession } from '../utils/authSession';

export async function validateCouponCode(code, currentOrderTotal = 0, cartItems = []) {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed) return { valid: false, reason: 'Digite um código' };

  const { data: coupon, error: fetchErr } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', trimmed)
    .maybeSingle();

  if (fetchErr || !coupon) {
    return { valid: false, reason: 'Cupom não encontrado' };
  }
  if (!coupon.active) {
    return { valid: false, reason: 'Cupom inativo' };
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return { valid: false, reason: 'Cupom expirado' };
  }
  if (coupon.max_uses != null && (coupon.current_uses ?? 0) >= coupon.max_uses) {
    return { valid: false, reason: 'Cupom esgotado' };
  }
  if (coupon.min_order_value && currentOrderTotal < coupon.min_order_value) {
    const falta = (coupon.min_order_value - currentOrderTotal).toFixed(2);
    return { valid: false, reason: `Faltam R$${falta.replace('.', ',')} pra usar` };
  }

  const session = await getEffectiveSession();
  const userId = session?.user?.id ?? null;

  // 1. Regra de Primeiro Pedido (Boas-vindas para novos clientes cadastrados)
  if (coupon.template_origin === 'first_order' || coupon.code?.startsWith('BEMVINDO')) {
    if (!userId) {
      return { valid: false, reason: 'Faça login para usar cupom de 1º pedido' };
    }
    const { count: priorOrders } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('status', 'cancelled');
    if ((priorOrders ?? 0) > 0) {
      return { valid: false, reason: 'Válido apenas no seu primeiro pedido' };
    }
  }

  // 2. Regra Exclusiva para Clientes Cadastrados / Aniversário
  if (coupon.template_origin === 'registered_only' || coupon.template_origin === 'aniversario') {
    if (!userId) {
      return { valid: false, reason: 'Exclusivo para clientes cadastrados. Faça login!' };
    }
  }

  // 3. Limite por usuário
  if (userId && coupon.max_uses_per_user != null) {
    const { count } = await supabase
      .from('user_coupon_uses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('coupon_id', coupon.id);

    if ((count ?? 0) >= coupon.max_uses_per_user) {
      return { valid: false, reason: 'Você já usou esse cupom' };
    }
  }

  // 4. Bloqueio durante promoções ativas da loja
  const { data: statusRow } = await supabase
    .from('store_settings')
    .select('setting_value')
    .eq('setting_key', 'store_status')
    .maybeSingle();

  const settingValue = statusRow?.setting_value;
  if (settingValue?.itemPromo?.isActive || settingValue?.superPromo?.isActive || settingValue?.isPromoActive) {
    return { valid: false, reason: 'Cupons não podem ser combinados com promoções ativas.' };
  }

  // 5. Restrição por categorias elegíveis no carrinho
  if (
    Array.isArray(coupon.restricted_categories) &&
    coupon.restricted_categories.length > 0 &&
    Array.isArray(cartItems) &&
    cartItems.length > 0
  ) {
    const allowedCategories = coupon.restricted_categories
      .map((cat) => String(cat).trim().toLowerCase())
      .filter(Boolean);
    const itemsWithCategory = cartItems.filter((item) => Boolean(item?.category || item?.categoria));

    if (allowedCategories.length > 0 && itemsWithCategory.length > 0) {
      const hasEligibleItem = itemsWithCategory.some((item) => {
        const itemCategory = String(item.category || item.categoria || '').trim().toLowerCase();
        return allowedCategories.includes(itemCategory);
      });
      if (!hasEligibleItem) {
        return { valid: false, reason: 'Cupom válido apenas para categorias específicas.' };
      }
    }
  }

  return { valid: true, coupon };
}

export function useCoupons(currentOrderTotal = 0) {
  const [coupons, setCoupons] = useState([]);
  const [freeCoupons, setFreeCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const session = await getEffectiveSession();
    const userId = session?.user?.id ?? null;

    const { data: activeCoupons, error: couponsErr } = await supabase
      .from('coupons')
      .select('*')
      .eq('active', true)
      .order('discount_value', { ascending: false });

    if (couponsErr) {
      setError(couponsErr.message);
      setLoading(false);
      return;
    }

    let free = [];
    if (userId) {
      const { data: freeData, error: freeErr } = await supabase
        .from('free_coupons')
        .select('*, coupons(*)')
        .eq('user_id', userId)
        .eq('is_used', false);

      if (!freeErr) free = freeData ?? [];
    }

    const now = new Date();
    const availableCoupons = (activeCoupons ?? []).filter((c) => {
      if (c.expires_at && new Date(c.expires_at) < now) return false;
      if (c.max_uses != null && (c.current_uses ?? 0) >= c.max_uses) return false;
      return true;
    });

    setCoupons(availableCoupons);
    setFreeCoupons(free);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getCouponMissingAmount = useCallback(
    (coupon) => {
      const min = Number(coupon.min_order_value ?? 0);
      const missing = min - currentOrderTotal;
      return missing > 0 ? missing : 0;
    },
    [currentOrderTotal]
  );

  const validateCoupon = useCallback(
    async (code, cartItems = []) => validateCouponCode(code, currentOrderTotal, cartItems),
    [currentOrderTotal]
  );

  return {
    coupons,
    freeCoupons,
    loading,
    error,
    reload: load,
    validateCoupon,
    getCouponMissingAmount,
  };
}
