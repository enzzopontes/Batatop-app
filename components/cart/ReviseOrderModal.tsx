import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { DeliveryType, PaymentMethod, Address } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
import { STORE_ADDRESS } from '../../constants/store';
import RipplePressable from './RipplePressable';
import PrimaryButton from '../PrimaryButton';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';

const CUPOM_ICON = require('../../assets/cuponpretobranco.png');

interface ReviseOrderModalProps {
  visible: boolean;
  total: number;
  deliveryType: DeliveryType;
  selectedAddress: Address | null;
  coupon: any;
  paymentMethod: PaymentMethod;
  selectedSavedCard: SavedCard | null;
  savedCardCvv: string;
  setSavedCardCvv: (cvv: string) => void;
  cardCpf?: string;
  setCardCpf?: (cpf: string) => void;
  wantsCutlery: boolean | null;
  setWantsCutlery: (wants: boolean) => void;
  submitting: boolean;
  onClose: () => void;
  onSubmitOrder: () => void;
  onEditAddress: () => void;
  onEditCoupon: () => void;
  onEditPayment: () => void;
  onToggleDeliveryType: () => void;
}

function formatCpf(val: string): string {
  const d = (val || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function isValidCpf(cpf: string): boolean {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(digits[10]);
}

export default function ReviseOrderModal({
  visible,
  total,
  deliveryType,
  selectedAddress,
  coupon,
  paymentMethod,
  selectedSavedCard,
  savedCardCvv,
  setSavedCardCvv,
  cardCpf,
  setCardCpf,
  wantsCutlery,
  setWantsCutlery,
  submitting,
  onClose,
  onSubmitOrder,
  onEditAddress,
  onEditCoupon,
  onEditPayment,
  onToggleDeliveryType,
}: ReviseOrderModalProps) {
  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;

  const isDelivery = deliveryType === 'delivery';

  // Formatação do método de pagamento
  const getPaymentDisplay = () => {
    if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
      if (selectedSavedCard) {
        const brand = (selectedSavedCard.payment_method_id || 'Cartão').toUpperCase();
        return `${brand} •••• ${selectedSavedCard.last_four}`;
      }
      return paymentMethod === 'cartão de crédito' ? 'Cartão de Crédito' : 'Cartão de Débito';
    }
    if (paymentMethod === 'pix') return 'Pix';
    if (paymentMethod === 'dinheiro') return 'Dinheiro';
    if (paymentMethod === 'cartão de crédito (entrega)') return 'Cartão de Crédito (na entrega)';
    if (paymentMethod === 'cartão de débito (entrega)') return 'Cartão de Débito (na entrega)';
    return 'Selecione uma forma';
  };

  const isSavedCardActive =
    (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') &&
    !!selectedSavedCard;

  const getPaymentHeader = () => {
    if (
      paymentMethod === 'dinheiro' ||
      paymentMethod === 'cartão de crédito (entrega)' ||
      paymentMethod === 'cartão de débito (entrega)'
    ) {
      return 'Pagamento na entrega';
    }
    return 'Pagamento pelo app';
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0, 0, 0, 0.5)"
      contentStyle={styles.sheetContent}
      minBottomPadding={32}
      extraBottomPadding={16}
    >
      <Text style={styles.sheetTitle}>Revise o seu pedido</Text>

          <View style={styles.itemsList}>
            {/* 1. Linha Entrega hoje */}
            <RipplePressable style={styles.rowItem} onPress={onToggleDeliveryType} hitSlop={6} rippleColor="rgba(0,0,0,0.06)">
              <View style={styles.iconCircle}>
                <Ionicons
                  name={isDelivery ? 'bicycle-outline' : 'storefront-outline'}
                  size={22}
                  color="#18181B"
                />
              </View>
              <View style={styles.rowTexts}>
                <Text style={styles.rowTitle}>
                  {isDelivery ? 'Entrega hoje' : 'Retirada no local'}
                </Text>
                <Text style={styles.rowSub}>
                  {isDelivery ? 'Hoje, 40 - 55 min' : 'Hoje, 15 - 25 min'}
                </Text>
              </View>
            </RipplePressable>

            {/* 2. Linha Endereço */}
            <RipplePressable style={styles.rowItem} onPress={onEditAddress} hitSlop={6} rippleColor="rgba(0,0,0,0.06)">
              <View style={styles.iconCircle}>
                <Ionicons name="location-sharp" size={22} color="#18181B" />
              </View>
              <View style={styles.rowTexts}>
                {!isDelivery ? (
                  <>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {STORE_ADDRESS.full}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      Retirada: Portão de ferro preto
                    </Text>
                  </>
                ) : selectedAddress ? (
                  <>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {selectedAddress.street}, {selectedAddress.number}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {[selectedAddress.complement, selectedAddress.neighborhood]
                        .filter(Boolean)
                        .join(' • ') || 'Iacanga-SP'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.rowTitle, { color: COLORS.error }]}>
                      Selecione um endereço
                    </Text>
                    <Text style={styles.rowSub}>Toque para configurar endereço</Text>
                  </>
                )}
              </View>
            </RipplePressable>

            {/* 3. Linha Cupom */}
            <RipplePressable style={styles.rowItem} onPress={onEditCoupon} hitSlop={6} rippleColor="rgba(0,0,0,0.06)">
              <View style={styles.iconCircle}>
                <Image source={CUPOM_ICON} style={styles.cupomIcon} resizeMode="contain" />
              </View>
              <View style={styles.rowTexts}>
                {coupon ? (
                  <>
                    <Text style={styles.rowTitle}>{coupon.code}</Text>
                    <Text style={styles.rowSub}>
                      {(coupon.discount_type === 'percent' || coupon.discount_type === 'percentage')
                        ? `${Number(coupon.discount_value)}% de desconto aplicado`
                        : `R$ ${Number(coupon.discount_value).toFixed(2).replace('.', ',')} de desconto`}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.rowTitle}>Nenhum cupom aplicado</Text>
                    <Text style={styles.rowSub}>Disponíveis para usar</Text>
                  </>
                )}
              </View>
            </RipplePressable>

            {/* 4. Linha Pagamento */}
            <RipplePressable style={styles.rowItem} onPress={onEditPayment} hitSlop={6} rippleColor="rgba(0,0,0,0.06)">
              <View style={styles.iconCircle}>
                <Ionicons
                  name={
                    paymentMethod === 'pix'
                      ? 'qr-code-outline'
                      : paymentMethod === 'dinheiro'
                      ? 'cash-outline'
                      : 'card-outline'
                  }
                  size={22}
                  color="#18181B"
                />
              </View>
              <View style={styles.rowTexts}>
                <Text style={styles.rowTitle}>{getPaymentHeader()}</Text>
                <Text style={styles.rowSub}>{getPaymentDisplay()}</Text>
              </View>
              <Text style={styles.rowPriceText}>{formattedTotal}</Text>
            </RipplePressable>

            {/* Campos de segurança do cartão salvo (CVV obrigatório no MP e CPF se pendente) */}
            {isSavedCardActive && (
              <View style={styles.cardSecurityContainer}>
                {!isValidCpf(cardCpf || '') && setCardCpf && (
                  <View style={styles.cpfRow}>
                    <Text style={styles.cvvLabel}>CPF do titular:</Text>
                    <TextInput
                      style={styles.cpfInput}
                      value={formatCpf(cardCpf || '')}
                      onChangeText={(t) => setCardCpf(t.replace(/\D/g, '').slice(0, 11))}
                      placeholder="000.000.000-00"
                      placeholderTextColor="#A1A1AA"
                      keyboardType="numeric"
                      maxLength={14}
                    />
                  </View>
                )}

                <View style={styles.cvvContainer}>
                  <Text style={styles.cvvLabel}>CVV do cartão salvo:</Text>
                  <TextInput
                    style={styles.cvvInput}
                    value={savedCardCvv}
                    onChangeText={(t) => setSavedCardCvv(t.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    placeholderTextColor="#A1A1AA"
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={4}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Texto de consentimento do checkout */}
          <Text style={styles.consentText}>
            Ao confirmar o pedido, você declara estar ciente dos Termos de Uso e das regras de preparo e entrega em Iacanga-SP.
          </Text>

          {/* Botão principal "Fazer pedido" com PrimaryButton */}
          <PrimaryButton
            fullWidth
            title="Fazer pedido"
            onPress={onSubmitOrder}
            disabled={submitting}
            loading={submitting}
            accessibilityLabel="Fazer pedido"
            style={{ marginBottom: SPACING[3] }}
          />

          {/* Botão secundário "Alterar pedido" com borda amarela fina */}
          <RipplePressable
            style={styles.alterarLink}
            onPress={onClose}
            hitSlop={8}
            rippleColor="rgba(227, 160, 8, 0.15)"
          >
            <Text style={styles.alterarLinkText}>Alterar pedido</Text>
          </RipplePressable>
    </SwipeableBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING[5],
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D4D8',
    alignSelf: 'center',
    marginBottom: SPACING[3],
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
    marginBottom: SPACING[4],
  },
  itemsList: {
    gap: SPACING[3],
    marginBottom: SPACING[5],
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: RADIUS.md,
  },
  iconCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  cupomIcon: {
    width: 28,
    height: 28,
  },
  rowTexts: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
  },
  rowSub: {
    fontSize: 12,
    color: '#71717A',
    marginTop: 2,
  },
  rowPriceText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
    marginLeft: SPACING[2],
  },
  cutleryButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cutleryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    backgroundColor: '#FFFFFF',
  },
  cutleryBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  cutleryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
  },
  cutleryBtnTextActive: {
    color: COLORS.text,
    fontWeight: '700',
  },
  cardSecurityContainer: {
    gap: 8,
    alignItems: 'flex-end',
    paddingRight: 4,
    marginTop: 4,
  },
  cpfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cpfInput: {
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: RADIUS.sm,
    width: 140,
    height: 32,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
    paddingHorizontal: 6,
    paddingVertical: 0,
    backgroundColor: '#FFFFFF',
  },
  cvvContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cvvLabel: {
    fontSize: 12,
    color: '#71717A',
    fontWeight: '500',
  },
  cvvInput: {
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: RADIUS.sm,
    width: 58,
    height: 32,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
    padding: 0,
  },
  orderButton: {
    backgroundColor: COLORS.primary,
    height: 50,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
    overflow: 'hidden',
  },
  orderButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  alterarLink: {
    width: '100%',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  alterarLinkText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  consentText: {
    fontSize: 11,
    color: '#71717A',
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: SPACING[3],
    paddingHorizontal: SPACING[2],
  },
});
