import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';

const CUPOM_ICON = require('../assets/cuponverde.png');

const DEFAULT_PAGE_BG = COLORS.background;

const NOTCH_SIZE = 14;
const NOTCH_RADIUS = NOTCH_SIZE / 2;
const SELECTOR_SIZE = 28;
const DASH_W = 5;
const DASH_GAP = 4;

function formatMoney(v) {
  return `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
}

function getTimeLeft(expiresAt) {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt) - new Date();
  if (diffMs <= 0) return 'Expirado';
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `Acaba em ${h}h ${m}min`;
}

export function SelectorCircle({ selected, disabled, size = SELECTOR_SIZE }) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  if (disabled) {
    return <View style={[s.selector, dim, s.selectorDisabled]} />;
  }
  if (selected) {
    const dotSize = Math.round(size * 0.4);
    const dotDim = { width: dotSize, height: dotSize, borderRadius: dotSize / 2 };
    return (
      <View style={[s.selector, dim, s.selectorSelected]}>
        <View style={[s.selectorDot, dotDim]} />
      </View>
    );
  }
  return <View style={[s.selector, dim, s.selectorIdle]} />;
}

// Divisória do ticket: une perfeitamente a parte superior e inferior sem linha reta atravessando
export function TicketDivider({ pageBackgroundColor = DEFAULT_PAGE_BG, borderColor = COLORS.border }) {
  const [dashAreaWidth, setDashAreaWidth] = useState(0);
  const count =
    dashAreaWidth > 0
      ? Math.max(2, Math.floor((dashAreaWidth + DASH_GAP) / (DASH_W + DASH_GAP)))
      : 0;
  const dashes = Array.from({ length: count });

  return (
    <View style={s.dividerSection}>
      {/* Mordida Esquerda */}
      <View style={s.notchWrapLeft}>
        <View
          style={[
            s.notchCircle,
            s.notchCircleLeft,
            { backgroundColor: pageBackgroundColor, borderColor },
          ]}
        />
      </View>

      {/* Mordida Direita */}
      <View style={s.notchWrapRight}>
        <View
          style={[
            s.notchCircle,
            s.notchCircleRight,
            { backgroundColor: pageBackgroundColor, borderColor },
          ]}
        />
      </View>

      <View style={s.dashArea} onLayout={(e) => setDashAreaWidth(e.nativeEvent.layout.width)}>
        <View style={s.dashRow}>
          {dashes.map((_, i) => (
            <View key={i} style={s.dash} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function CouponCard({
  coupon,
  currentTotal,
  missingAmount,
  isSelected,
  onSelect,
  pageBackgroundColor = DEFAULT_PAGE_BG,
}) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() => getTimeLeft(coupon?.expires_at));

  useEffect(() => {
    if (!coupon?.expires_at) return;
    const id = setInterval(() => setTimeLeft(getTimeLeft(coupon.expires_at)), 60_000);
    return () => clearInterval(id);
  }, [coupon?.expires_at]);

  const available =
    coupon?.max_uses != null
      ? Math.max(0, coupon.max_uses - (coupon.current_uses ?? 0))
      : 1;

  const unavailable = missingAmount > 0;

  const discountLabel =
    coupon?.title ||
    (coupon?.discount_type === 'percentage'
      ? `${Number(coupon.discount_value)}%`
      : formatMoney(coupon?.discount_value ?? 0));

  const progress =
    coupon?.min_order_value > 0
      ? Math.min(currentTotal / coupon.min_order_value, 1)
      : 1;

  const handleSelect = () => {
    if (unavailable) return;
    onSelect?.(coupon);
  };

  const borderColor = isSelected ? '#1F1B16' : COLORS.border;

  return (
    <View style={s.cardWrapper}>
      <Pressable onPress={handleSelect} disabled={unavailable} style={s.ticketPressable}>
        {/* Parte Superior do Ticket */}
        <View style={[s.ticketTop, { borderColor }]}>
          <View style={s.selectorSlot}>
            <SelectorCircle selected={isSelected} disabled={unavailable} size={SELECTOR_SIZE} />
          </View>

          <View style={s.header}>
            <Image source={CUPOM_ICON} style={s.icon} resizeMode="contain" />
            <Text style={s.value}>{discountLabel}</Text>
          </View>

          <Text style={s.desc}>
            {coupon?.description || `${discountLabel} para restaurantes selecionados.`}
          </Text>

          <View style={s.metaRow}>
            {coupon?.min_order_value ? (
              <Text style={s.restriction}>
                Válido para pedidos acima de {formatMoney(coupon.min_order_value)}.
              </Text>
            ) : (
              <View />
            )}
            {timeLeft && <Text style={s.timestamp}>{timeLeft}</Text>}
          </View>
        </View>

        {/* Divisória com as Mordidas */}
        <TicketDivider pageBackgroundColor={pageBackgroundColor} borderColor={borderColor} />

        {/* Parte Inferior do Ticket */}
        <View style={[s.ticketBottom, { borderColor }]}>
          <View style={s.footerRow}>
            <Pressable onPress={() => setRulesOpen((v) => !v)} hitSlop={8} style={s.rulesPress}>
              <Text style={s.rulesLink}>Regras {rulesOpen ? '˄' : '˅'}</Text>
            </Pressable>
            <Text style={s.available}>
              {available} disponível{available === 1 ? '' : 'is'}
            </Text>
          </View>

          {rulesOpen && (
            <View style={s.rulesBox}>
              {coupon?.rules_text ? (
                <Text style={s.rulesText}>• {coupon.rules_text}</Text>
              ) : null}
              {coupon?.min_order_value ? (
                <Text style={s.rulesText}>
                  • Válido para pedidos acima de {formatMoney(coupon.min_order_value)} (sem considerar a taxa de entrega).
                </Text>
              ) : null}
              {coupon?.expires_at ? (
                <Text style={s.rulesText}>
                  • Data de validade: até {new Date(coupon.expires_at).toLocaleString('pt-BR')}.
                </Text>
              ) : null}
              <Text style={s.rulesText}>
                • Limite de uso: {coupon?.max_uses_per_user ? `${coupon.max_uses_per_user}x por usuário.` : 'ilimitado por usuário.'}
              </Text>
              {coupon?.restricted_categories?.length ? (
                <Text style={s.rulesText}>
                  • Cupom válido apenas para: {coupon.restricted_categories.join(', ')}.
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Pressable>

      {/* Seção trancada colada abaixo */}
      {unavailable && (
        <View style={s.progressCard}>
          <View style={s.progressLabelRow}>
            <Ionicons name="lock-closed" size={14} color={COLORS.textMuted} />
            <Text style={s.progressText}>
              Faltam {formatMoney(missingAmount)} para usar o cupom
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  cardWrapper: {
    marginBottom: SPACING[3],
  },
  ticketPressable: {
    position: 'relative',
    zIndex: 2,
  },
  ticketTop: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopWidth: 1.5,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    position: 'relative',
  },
  ticketBottom: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderTopWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },

  selectorSlot: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 5,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: SELECTOR_SIZE + 8,
  },
  icon: {
    width: 44,
    height: 44,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F1B16',
  },

  desc: {
    fontSize: 13,
    color: '#3E3E3E',
    marginTop: 6,
  },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  restriction: {
    flex: 1,
    fontSize: 11,
    color: '#717171',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 11,
    color: '#717171',
  },

  selector: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  selectorIdle: {
    backgroundColor: COLORS.backgroundElevated,
  },
  selectorSelected: {
    backgroundColor: COLORS.primary,
  },
  selectorDot: {
    backgroundColor: COLORS.white,
  },
  selectorDisabled: {
    backgroundColor: COLORS.borderLight,
  },

  // Divisória do ticket
  dividerSection: {
    position: 'relative',
    height: NOTCH_SIZE,
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  notchWrapLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: NOTCH_RADIUS,
    height: NOTCH_SIZE,
    overflow: 'hidden',
    zIndex: 10,
  },
  notchCircleLeft: {
    position: 'absolute',
    left: -NOTCH_RADIUS,
    top: 0,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_RADIUS,
    borderWidth: 1.5,
  },
  notchWrapRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: NOTCH_RADIUS,
    height: NOTCH_SIZE,
    overflow: 'hidden',
    zIndex: 10,
  },
  notchCircleRight: {
    position: 'absolute',
    right: -NOTCH_RADIUS,
    top: 0,
    width: NOTCH_SIZE,
    height: NOTCH_SIZE,
    borderRadius: NOTCH_RADIUS,
    borderWidth: 1.5,
  },
  dashArea: {
    paddingHorizontal: 20,
  },
  dashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dash: {
    width: DASH_W,
    height: 1,
    backgroundColor: '#C5C5C5',
  },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  rulesLink: {
    fontSize: 12,
    color: '#717171',
    textDecorationLine: 'underline',
  },
  rulesPress: {
    flexShrink: 1,
  },
  available: {
    flexShrink: 0,
    fontSize: 12,
    color: '#717171',
  },
  rulesBox: {
    marginTop: 10,
    gap: 4,
  },
  rulesText: {
    fontSize: 11,
    color: '#555555',
    lineHeight: 16,
  },

  progressCard: {
    backgroundColor: '#F3F3F4',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginTop: -24,
    paddingTop: 24 + 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 1,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 11,
    color: '#717171',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E0E0E0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 999,
  },
});
