import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { getEffectiveSession } from '../utils/authSession';

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

    setCoupons(activeCoupons ?? []);
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
    async (code) => {
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
      if (coupon.max_uses != null && coupon.current_uses >= coupon.max_uses) {
        return { valid: false, reason: 'Cupom esgotado' };
      }
      if (coupon.min_order_value && currentOrderTotal < coupon.min_order_value) {
        const falta = (coupon.min_order_value - currentOrderTotal).toFixed(2);
        return { valid: false, reason: `Faltam R$${falta.replace('.', ',')} pra usar` };
      }

      const session = await getEffectiveSession();
      const userId = session?.user?.id ?? null;
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

      return { valid: true, coupon };
    },
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
