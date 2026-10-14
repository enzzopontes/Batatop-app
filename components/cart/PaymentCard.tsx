import React from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { PaymentMethod } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';

/* ------------------------------------------------------------------ */
/* Constantes de layout — ajuste aqui                                  */
/* ------------------------------------------------------------------ */

// Título da seção
const TITLE_SIZE = 17;
const TITLE_COLOR = '#1A1A1A';
const TITLE_GAP = 12;

// Casca cinza externa
const SHELL_BG = '#F3F3F3';
const SHELL_BORDER = '#E8E8E8';
const SHELL_RADIUS = 22;
const SHELL_INSET = 4; // laterais e base

// Cabeçalho da casca (logo)
const HEADER_HEIGHT = 46;
const HEADER_PADDING_X = 16; // medido a partir da borda da casca
const LOGO_HEIGHT = 30; // altura VISÍVEL da arte (sem margens transparentes)

// Cartão branco interno
const CARD_BG = '#FFFFFF';
const CARD_RADIUS = 18;
const CARD_BORDER = '#EBEBEB';
const DIVIDER_COLOR = '#EEEEEE';
const ROW_PADDING_X = 16;
const MAIN_ROW_HEIGHT = 56;
const INSTALLMENT_ROW_HEIGHT = 44;

// Tipografia / cores das linhas
const MAIN_TEXT_SIZE = 16;
const MAIN_TEXT_COLOR = '#1A1A1A';
const INSTALLMENT_TEXT_SIZE = 13;
const INSTALLMENT_TEXT_COLOR = '#6B6B6B';
const MAIN_CHEVRON_SIZE = 18;
const INSTALLMENT_CHEVRON_SIZE = 14;
const ICON_TEXT_GAP = 12;

// Badge da bandeira
const BRAND_W = 32;
const BRAND_H = 20;
const BRAND_RADIUS = 3;
const BRAND_BORDER = '#DADADA';

const PRESSED_OPACITY = 0.7;

/* ------------------------------------------------------------------ */
/* Logo estendida: o PNG (1310x651) tem margem transparente grande no  */
/* topo. Recortamos só a área transparente para a arte ficar grande e  */
/* centralizada de verdade, sem cortar nada do desenho.                */
/* ------------------------------------------------------------------ */
const LOGO_ESTENDIDA = require('../../assets/batatatopestendida.png');
const LOGO_SRC = { w: 1310, h: 651 };
const LOGO_BBOX = { x: 40, y: 165, w: 1270, h: 486 }; // área com pixels visíveis
const LOGO_SCALE = LOGO_HEIGHT / LOGO_BBOX.h;
const LOGO_BOX = { width: LOGO_BBOX.w * LOGO_SCALE, height: LOGO_HEIGHT };
const LOGO_IMG = {
  width: LOGO_SRC.w * LOGO_SCALE,
  height: LOGO_SRC.h * LOGO_SCALE,
  left: -LOGO_BBOX.x * LOGO_SCALE,
  top: -LOGO_BBOX.y * LOGO_SCALE,
};

/* ------------------------------------------------------------------ */

type Brand = 'visa' | 'master' | 'amex' | 'elo' | 'hipercard' | null;

function detectBrand(paymentMethodId?: string): Brand {
  const id = (paymentMethodId || '').toLowerCase();
  if (id.includes('visa')) return 'visa';
  if (id.includes('master')) return 'master';
  if (id.includes('amex')) return 'amex';
  if (id.includes('elo')) return 'elo';
  if (id.includes('hiper')) return 'hipercard';
  return null;
}

function BrandBadge({ brand }: { brand: Brand }) {
  if (brand === 'master') {
    return (
      <View style={styles.brandBadge}>
        <View style={[styles.mcCircle, { backgroundColor: '#EB001B' }]} />
        <View style={[styles.mcCircle, styles.mcCircleRight]} />
      </View>
    );
  }
  const label =
    brand === 'visa' ? 'VISA' : brand === 'amex' ? 'AMEX' : brand === 'elo' ? 'elo' : brand === 'hipercard' ? 'HIPER' : null;
  const color = brand === 'visa' ? '#1A1F71' : brand === 'amex' ? '#006FCF' : MAIN_TEXT_COLOR;

  return (
    <View style={styles.brandBadge}>
      {label ? (
        <Text
          style={[styles.brandText, { color }, brand === 'visa' && styles.brandTextVisa]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {label}
        </Text>
      ) : (
        <Ionicons name="card-outline" size={14} color={MAIN_TEXT_COLOR} />
      )}
    </View>
  );
}

interface PaymentCardProps {
  paymentMethod: PaymentMethod;
  selectedSavedCard: SavedCard | null;
  total: number;
  onOpenPaymentSelector: () => void;
  onOpenInstallments?: () => void;
  installmentText?: string;
}

export default function PaymentCard({
  paymentMethod,
  selectedSavedCard,
  total,
  onOpenPaymentSelector,
  onOpenInstallments,
  installmentText,
}: PaymentCardProps) {
  const isOnlineCard = paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito';

  // Parcelamento apenas para cartão de crédito online
  const isCreditCard =
    paymentMethod === 'cartão de crédito' ||
    (isOnlineCard && selectedSavedCard?.card_type === 'cartão de crédito');

  const sectionTitle =
    paymentMethod === 'dinheiro' ||
    paymentMethod === 'cartão de crédito (entrega)' ||
    paymentMethod === 'cartão de débito (entrega)'
      ? 'Pagamento na entrega'
      : 'Pagamento pelo app';

  const getLabel = () => {
    if (isOnlineCard) {
      if (selectedSavedCard) {
        const kind = selectedSavedCard.card_type === 'cartão de crédito' ? 'Crédito' : 'Débito';
        return `${kind} •••• ${selectedSavedCard.last_four}`;
      }
      return paymentMethod === 'cartão de crédito' ? 'Cartão de crédito' : 'Cartão de débito';
    }
    if (paymentMethod === 'pix') return 'Pix';
    if (paymentMethod === 'dinheiro') return 'Dinheiro';
    if (paymentMethod === 'cartão de crédito (entrega)') return 'Crédito na entrega';
    if (paymentMethod === 'cartão de débito (entrega)') return 'Débito na entrega';
    return 'Selecione uma forma';
  };

  const renderLeadingIcon = () => {
    if (paymentMethod === 'pix') {
      return (
        <View style={styles.iconSlot}>
          <Ionicons name="qr-code-outline" size={18} color={MAIN_TEXT_COLOR} />
        </View>
      );
    }
    if (paymentMethod === 'dinheiro') {
      return (
        <View style={styles.iconSlot}>
          <Ionicons name="cash-outline" size={20} color={MAIN_TEXT_COLOR} />
        </View>
      );
    }
    return <BrandBadge brand={isOnlineCard ? detectBrand(selectedSavedCard?.payment_method_id) : null} />;
  };

  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;
  const pressedStyle = ({ pressed }: { pressed: boolean }) => pressed && styles.pressed;

  return (
    <View>
      <Text style={styles.title} numberOfLines={1}>
        {sectionTitle}
      </Text>

      <View style={styles.shell}>
        {/* Cabeçalho com a logo estendida */}
        <Pressable
          onPress={onOpenPaymentSelector}
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Mudar forma de pagamento"
        >
          <View style={[styles.logoBox, LOGO_BOX]}>
            <Image source={LOGO_ESTENDIDA} style={[styles.logoImg, LOGO_IMG]} resizeMode="contain" />
          </View>
        </Pressable>

        {/* Cartão branco interno */}
        <View style={styles.card}>
          <Pressable
            onPress={onOpenPaymentSelector}
            style={({ pressed }) => [styles.row, styles.mainRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Forma de pagamento: ${getLabel()}. Toque para mudar`}
          >
            <View style={styles.rowLeft}>
              {renderLeadingIcon()}
              <Text style={styles.mainText} numberOfLines={1} ellipsizeMode="tail">
                {getLabel()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={MAIN_CHEVRON_SIZE} color={MAIN_TEXT_COLOR} />
          </Pressable>

          {isCreditCard && (
            <>
              <View style={styles.divider} />
              <Pressable
                onPress={onOpenInstallments}
                disabled={!onOpenInstallments}
                style={(state) => [styles.row, styles.installmentRow, pressedStyle(state)]}
                accessibilityRole="button"
                accessibilityLabel={`Parcelamento: ${installmentText || `1x de ${formattedTotal}`}`}
              >
                <Text style={styles.installmentText} numberOfLines={1} ellipsizeMode="tail">
                  {installmentText || `1x de ${formattedTotal}`}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={INSTALLMENT_CHEVRON_SIZE}
                  color={INSTALLMENT_TEXT_COLOR}
                />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: TITLE_SIZE,
    fontWeight: '600',
    color: TITLE_COLOR,
    marginBottom: TITLE_GAP,
  },
  shell: {
    backgroundColor: SHELL_BG,
    borderRadius: SHELL_RADIUS,
    borderWidth: 1,
    borderColor: SHELL_BORDER,
    paddingHorizontal: SHELL_INSET,
    paddingBottom: SHELL_INSET,
  },
  header: {
    height: HEADER_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: HEADER_PADDING_X - SHELL_INSET,
  },
  logoBox: {
    overflow: 'hidden',
  },
  logoImg: {
    position: 'absolute',
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: ROW_PADDING_X,
  },
  mainRow: {
    height: MAIN_ROW_HEIGHT,
  },
  installmentRow: {
    height: INSTALLMENT_ROW_HEIGHT,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ICON_TEXT_GAP,
    marginRight: 12,
  },
  iconSlot: {
    width: BRAND_W,
    height: BRAND_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandBadge: {
    width: BRAND_W,
    height: BRAND_H,
    borderRadius: BRAND_RADIUS,
    borderWidth: 1,
    borderColor: BRAND_BORDER,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  brandTextVisa: {
    fontStyle: 'italic',
    fontSize: 10,
  },
  mcCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  mcCircleRight: {
    backgroundColor: '#F79E1B',
    marginLeft: -5,
    opacity: 0.9,
  },
  mainText: {
    flexShrink: 1,
    fontSize: MAIN_TEXT_SIZE,
    fontWeight: '400',
    color: MAIN_TEXT_COLOR,
  },
  divider: {
    height: 1,
    backgroundColor: DIVIDER_COLOR,
  },
  installmentText: {
    flex: 1,
    marginRight: 12,
    fontSize: INSTALLMENT_TEXT_SIZE,
    fontWeight: '400',
    color: INSTALLMENT_TEXT_COLOR,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
});
