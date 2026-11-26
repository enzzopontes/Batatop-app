import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform, ToastAndroid } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { showSuccessAlert } from './ThemedAlert';
import { useCart } from '../utils/cartStore';

const CUPOM_ICON = require('../assets/ui/cuponverde.png');

export const HOME_COUPON_CARD_WIDTH = 276;
export const HOME_COUPON_GAP = 12;

function formatMoney(v) {
  const n = Number(v);
  return `R$ ${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')}`;
}

function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default function HomeCouponCard({ coupon, onCardPress, width = HOME_COUPON_CARD_WIDTH }) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);
  const { total } = useCart();

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  const raw = coupon?.raw || coupon;
  const code = coupon?.codigo || raw?.code || 'CUPOM';
  const valNum = parseNumericValue(raw?.discount_value ?? coupon?.valor);
  const isPercent = raw?.discount_type === 'percentage' || coupon?.unidade === '%';

  const discountLabel = raw?.title || (
    isPercent
      ? `${valNum}% OFF`
      : `R$ ${valNum.toFixed(2).replace('.', ',')} OFF`
  );

  let desc = raw?.description || coupon?.descricaoDesconto || '';
  if (!desc || desc.toLowerCase() === 'em qualquer batata') {
    desc = isPercent ? `${valNum}% de desconto em qualquer batata` : `R$ ${valNum.toFixed(2).replace('.', ',')} de desconto no pedido`;
  }

  // Lógica de pedido mínimo e barra de progresso (igual à página de cupons)
  const currentTotal = Math.max(0, (total || 0) / 100);
  const minOrderVal = parseNumericValue(raw?.min_order_value);
  const missingAmount = minOrderVal > 0 ? Math.max(0, minOrderVal - currentTotal) : 0;
  const unavailable = minOrderVal > 0 && missingAmount > 0;
  const progress = minOrderVal > 0 ? Math.max(0, Math.min(currentTotal / minOrderVal, 1)) : 1;

  let expiryLabel = null;
  if (raw?.expires_at) {
    const d = new Date(raw.expires_at);
    if (!isNaN(d.getTime())) {
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      expiryLabel = `Até ${dia}/${mes}`;
    }
  }

  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(code);
      Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Success)?.catch?.(() => {});
      setCopied(true);

      if (Platform.OS === 'android') {
        ToastAndroid.show('Cupom copiado!', ToastAndroid.SHORT);
      }
      showSuccessAlert(`Cupom "${code}" copiado!`);

      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.cardWrapper, { width }]}>
      <View style={styles.cardContainer}>
        <Pressable
          style={styles.cardPressable}
          onPress={onCardPress || handleCopyCode}
        >
          {/* Parte Superior do Ticket (Minimalista, limpo e sem amarelo berrante) */}
          <View style={styles.ticketTop}>
            <View style={styles.topRow}>
              <View style={styles.iconWrap}>
                <Image source={CUPOM_ICON} style={styles.icon} resizeMode="contain" />
              </View>

              <View style={styles.headerInfo}>
                <Text style={styles.discountValue} numberOfLines={1}>{discountLabel}</Text>
                {minOrderVal > 0 ? (
                  <Text style={styles.minOrderSubText} numberOfLines={1}>
                    Pedido mínimo de {formatMoney(minOrderVal)}
                  </Text>
                ) : (
                  <Text style={styles.minOrderSubText} numberOfLines={1}>
                    Válido para todo o cardápio
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.descText} numberOfLines={2}>{desc}</Text>

            {expiryLabel ? (
              <View style={styles.metaRow}>
                <View style={styles.expiryWrap}>
                  <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                  <Text style={styles.expiryText}>{expiryLabel}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Divisória tracejada limpa dentro do mesmo container */}
          <View style={styles.dashedDivider} />

          {/* Parte Inferior do Ticket (Cupom ocupa toda a largura, sem botão pegar) */}
          <View style={styles.ticketBottom}>
            <Pressable
              style={[styles.fullCodeBox, copied && styles.fullCodeBoxCopied]}
              onPress={handleCopyCode}
              hitSlop={6}
            >
              <View style={styles.codeLeft}>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={14}
                  color={copied ? COLORS.success : COLORS.primaryText}
                />
                <Text style={[styles.codeText, copied && styles.codeTextCopied]} numberOfLines={1}>
                  {copied ? 'CUPOM COPIADO!' : code}
                </Text>
              </View>
              <Text style={[styles.codeActionHint, copied && styles.codeActionHintCopied]}>
                {copied ? 'Pronto' : 'Copiar'}
              </Text>
            </Pressable>
          </View>
        </Pressable>

        {/* Seção de Pedido Mínimo integrada ao mesmo container (sem sobreposição negativa) */}
        {unavailable && (
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <Ionicons name="lock-closed" size={12} color="#71717A" />
              <Text style={styles.progressText}>
                Faltam {formatMoney(missingAmount)} para usar
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginVertical: 2,
  },
  cardContainer: {
    width: '100%',
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  cardPressable: {
    width: '100%',
  },
  ticketTop: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  dashedDivider: {
    marginHorizontal: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 44,
    height: 44,
  },
  headerInfo: {
    flex: 1,
  },
  discountValue: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1F1B16',
    letterSpacing: -0.2,
  },
  minOrderSubText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 1,
  },
  descText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
    marginTop: 8,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  expiryWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  expiryText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  ticketBottom: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  fullCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  fullCodeBoxCopied: {
    backgroundColor: '#F0FDF4',
    borderStyle: 'solid',
    borderColor: '#86EFAC',
  },
  codeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  codeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1F1B16',
    letterSpacing: 0.5,
  },
  codeTextCopied: {
    color: '#16A34A',
  },
  codeActionHint: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primaryText,
    marginLeft: 6,
  },
  codeActionHintCopied: {
    color: '#16A34A',
  },

  /* Barra de progresso integrada ao mesmo container do card (sem margem negativa) */
  progressSection: {
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  progressText: {
    fontSize: 10.5,
    color: '#6B7280',
    fontWeight: '500',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: 999,
  },
});
