import { supabase } from './supabase';

export const DEFAULT_HOME_COUPONS_CONFIG = {
  mode: 'auto', // 'auto' | 'manual'
  max_items: 5,
  auto_criteria: 'highest_discount', // 'highest_discount' | 'recent'
};

export async function fetchHomeCouponsConfig() {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('setting_value')
      .eq('setting_key', 'home_coupons_config')
      .maybeSingle();

    if (error || !data?.setting_value) {
      return DEFAULT_HOME_COUPONS_CONFIG;
    }
    return { ...DEFAULT_HOME_COUPONS_CONFIG, ...data.setting_value };
  } catch {
    return DEFAULT_HOME_COUPONS_CONFIG;
  }
}

export async function saveHomeCouponsConfig(newConfig) {
  const merged = { ...DEFAULT_HOME_COUPONS_CONFIG, ...newConfig };
  const { data, error } = await supabase
    .from('store_settings')
    .upsert(
      {
        setting_key: 'home_coupons_config',
        setting_value: merged,
      },
      { onConflict: 'setting_key' }
    )
    .select();

  if (error) throw error;
  return merged;
}

export function formatCouponsForHome(rawCoupons) {
  if (!Array.isArray(rawCoupons)) return [];

  return rawCoupons.map((c) => {
    const isPercent = c.discount_type === 'percentage';
    const valNum = Number(c.discount_value);
    const valFormatted = isNaN(valNum)
      ? '0'
      : valNum % 1 === 0
      ? String(valNum)
      : valNum.toFixed(2).replace('.', ',');

    let validade = 'Sem expiração';
    if (c.expires_at) {
      const d = new Date(c.expires_at);
      if (!isNaN(d.getTime())) {
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const ano = d.getFullYear();
        validade = `${dia}/${mes}/${ano}`;
      }
    }

    let descricaoDesconto = 'em qualquer batata';
    if (c.description) {
      descricaoDesconto = c.description;
    } else if (Array.isArray(c.restricted_categories) && c.restricted_categories.length) {
      descricaoDesconto = `em ${c.restricted_categories.join(', ')}`;
    } else if (Number(c.min_order_value) > 0) {
      descricaoDesconto = `pedidos acima de R$ ${Number(c.min_order_value).toFixed(0)}`;
    }

    return {
      id: c.id,
      codigo: c.code || 'CUPOM',
      valor: valFormatted,
      unidade: isPercent ? '%' : 'R$',
      descricaoDesconto,
      validade,
      usoLabel: c.max_uses ? 'USO LIMITADO' : 'USO ILIMITADO',
      mensagem: c.title || 'Vem de batata!',
      raw: c,
    };
  });
}

export async function fetchHomeCoupons() {
  const config = await fetchHomeCouponsConfig();
  const now = new Date().toISOString();

  let query = supabase
    .from('coupons')
    .select('*')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (config.mode === 'manual') {
    query = query
      .eq('show_on_home', true)
      .order('home_priority', { ascending: false })
      .order('created_at', { ascending: false });
  } else {
    // Modo automático
    if (config.auto_criteria === 'recent') {
      query = query.order('created_at', { ascending: false });
    } else {
      // highest_discount padrão
      query = query.order('discount_value', { ascending: false });
    }
  }

  const limit = config.mode === 'manual'
    ? 20
    : Math.max(1, parseInt(config.max_items, 10) || 5);
  let { data, error } = await query.limit(limit);

  if (error) {
    console.warn('Erro ao buscar cupons da home:', error);
    return [];
  }

  // Fallback se modo manual não tiver nenhum cupom selecionado
  if (config.mode === 'manual' && (!data || data.length === 0)) {
    const { data: fallbackData } = await supabase
      .from('coupons')
      .select('*')
      .eq('active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('discount_value', { ascending: false })
      .limit(limit);

    data = fallbackData || [];
  }

  return formatCouponsForHome(data || []);
}
