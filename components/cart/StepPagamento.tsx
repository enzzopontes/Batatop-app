import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { PaymentMethod, DeliveryType } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
import RipplePressable from './RipplePressable';
import PaymentCard from './PaymentCard';

const LOGO = require('../../assets/logo.png');
const CUPOM_ICON = require('../../assets/cuponpretobranco.png');

function formatPhone(value: string) {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

interface StepPagamentoProps {
  paymentMethod: PaymentMethod;
  selectedSavedCard: SavedCard | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  coupon: any;
  deliveryType: DeliveryType;
  onRemoveCoupon: () => void;
  onOpenPaymentSelector: () => void;
  onOpenInstallments?: () => void;
  installmentText?: string;
  wantsCutlery: boolean | null;
  onSelectCutlery: (val: boolean) => void;
  cashChange: string;
  onChangeCashChange: (text: string) => void;
  hasSavedPhone?: boolean;
  phone?: string;
  onChangePhone?: (text: string) => void;
}

export default function StepPagamento({
  paymentMethod,
  selectedSavedCard,
  subtotal,
  deliveryFee,
  discount,
  total,
  coupon,
  deliveryType,
  onRemoveCoupon,
  onOpenPaymentSelector,
  onOpenInstallments,
  installmentText,
  wantsCutlery,
  onSelectCutlery,
  cashChange,
  onChangeCashChange,
  hasSavedPhone,
  phone = '',
  onChangePhone,
}: StepPagamentoProps) {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header da Loja (Item 1: logo NORMAL sem círculo cinza ao redor) */}
      <View style={styles.storeRow}>
        <Image
          source={LOGO}
          style={styles.storeLogo}
          resizeMode="contain"
        />
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>Batata Top</Text>
          <RipplePressable
            onPress={() => router.push('/cardapio')}
            hitSlop={8}
            rippleColor="rgba(227, 160, 8, 0.2)"
            accessibilityLabel="Adicionar mais itens"
          >
            <Text style={styles.addMoreLink}>Adicionar mais itens</Text>
          </RipplePressable>
        </View>
      </View>

      {/* 2 e 3. Bloco "Pagamento pelo app" (título + card) — ver PaymentCard.tsx */}
      <View style={styles.paymentBlock}>
        <PaymentCard
          paymentMethod={paymentMethod}
          selectedSavedCard={selectedSavedCard}
          total={total}
          onOpenPaymentSelector={onOpenPaymentSelector}
          onOpenInstallments={onOpenInstallments}
          installmentText={installmentText}
        />
      </View>

      {/* 4. Bloco de Cupom (Item 3: ícone aumentado em preto e branco, texto sem 'loja') */}
      <View style={styles.couponCard}>
        <Image source={CUPOM_ICON} style={styles.couponIconImg} resizeMode="contain" />
        <View style={styles.couponInfo}>
          {coupon ? (
            <>
              <Text style={styles.couponTitle}>{coupon.code}</Text>
              <Text style={styles.couponSub}>
                {(coupon.discount_type === 'percent' || coupon.discount_type === 'percentage')
                  ? `${Number(coupon.discount_value)}% de desconto`
                  : `R$ ${Number(coupon.discount_value).toFixed(2).replace('.', ',')} de desconto`}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.couponTitle}>Nenhum cupom aplicado</Text>
              <Text style={styles.couponSub}>1 disponível</Text>
            </>
          )}
        </View>

        {coupon ? (
          <RipplePressable
            onPress={onRemoveCoupon}
            hitSlop={10}
            rippleColor="rgba(220, 38, 38, 0.15)"
            accessibilityLabel="Remover cupom"
          >
            <Text style={styles.couponRemoveActionText}>Remover</Text>
          </RipplePressable>
        ) : (
          <RipplePressable
            onPress={() => router.push('/cupons')}
            hitSlop={10}
            rippleColor="rgba(227, 160, 8, 0.2)"
            accessibilityLabel="Adicionar cupom"
          >
            <Text style={styles.couponActionText}>Adicionar</Text>
          </RipplePressable>
        )}
      </View>

      {/* 4.1 Bloco de Talheres */}
      <View style={styles.optionCard}>
        <View style={styles.optionIconCircle}>
          <Ionicons name="restaurant-outline" size={20} color={COLORS.text} />
        </View>
        <View style={styles.optionInfo}>
          <Text style={styles.optionTitle}>Precisa de talher?</Text>
          <Text style={[styles.optionSub, wantsCutlery === null && styles.optionSubRequired]}>
            {wantsCutlery === null
              ? 'Escolha obrigatória'
              : wantsCutlery
              ? 'Sim, enviar talheres'
              : 'Não preciso de talher'}
          </Text>
        </View>
        <View style={styles.cutleryBtnGroup}>
          <RipplePressable
            style={[styles.cutleryBtn, wantsCutlery === false && styles.cutleryBtnActive]}
            onPress={() => onSelectCutlery(false)}
            hitSlop={6}
          >
            <Text style={[styles.cutleryBtnText, wantsCutlery === false && styles.cutleryBtnTextActive]}>
              Não
            </Text>
          </RipplePressable>
          <RipplePressable
            style={[styles.cutleryBtn, wantsCutlery === true && styles.cutleryBtnActive]}
            onPress={() => onSelectCutlery(true)}
            hitSlop={6}
          >
            <Text style={[styles.cutleryBtnText, wantsCutlery === true && styles.cutleryBtnTextActive]}>
              Sim
            </Text>
          </RipplePressable>
        </View>
      </View>

      {/* 4.2 Bloco de Troco (apenas dinheiro) */}
      {paymentMethod === 'dinheiro' && (
        <View style={styles.changeCard}>
          <View style={styles.changeHeader}>
            <View style={styles.optionIconCircle}>
              <Ionicons name="cash-outline" size={20} color={COLORS.text} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>Precisa de troco para quanto?</Text>
              <Text style={styles.optionSub}>Deixe em branco se não precisar</Text>
            </View>
          </View>
          <View style={styles.changeInputWrapper}>
            <Text style={styles.changeCurrencyPrefix}>R$</Text>
            <TextInput
              style={styles.changeInput}
              placeholder="0,00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              value={cashChange}
              onChangeText={(text) => onChangeCashChange(text.replace(/[^0-9,.]/g, ''))}
              maxLength={10}
            />
          </View>
        </View>
      )}

      {/* 4.3 Bloco de WhatsApp (exigido apenas se o cliente não tiver WhatsApp salvo) */}
      {!hasSavedPhone && (
        <View style={styles.phoneCard}>
          <View style={styles.phoneHeader}>
            <View style={styles.optionIconCircle}>
              <Ionicons name="logo-whatsapp" size={20} color={COLORS.success} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={styles.optionTitle}>WhatsApp para contato *</Text>
              <Text style={styles.optionSub}>Necessário para atualizações do seu primeiro pedido</Text>
            </View>
          </View>
          <View style={styles.phoneInputWrapper}>
            <TextInput
              style={styles.phoneInput}
              placeholder="(00) 00000-0000"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(text) => onChangePhone && onChangePhone(formatPhone(text))}
              maxLength={15}
            />
          </View>
        </View>
      )}

      {/* 5. Resumo de valores */}
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Resumo de valores</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total dos itens</Text>
          <Text style={styles.summaryValue}>
            R$ {subtotal.toFixed(2).replace('.', ',')}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Entrega</Text>
          <Text style={styles.summaryValue}>
            {deliveryType === 'delivery'
              ? deliveryFee > 0
                ? `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`
                : 'Grátis'
              : 'Grátis'}
          </Text>
        </View>

        {discount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Desconto</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>
              - R$ {discount.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        )}

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            R$ {total.toFixed(2).replace('.', ',')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[10],
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[4],
    gap: 12,
  },
  storeLogo: {
    width: 48,
    height: 48,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  addMoreLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },
  paymentBlock: {
    marginBottom: SPACING[4],
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    marginBottom: SPACING[4],
  },
  couponIconImg: {
    width: 32,
    height: 32,
    marginRight: SPACING[3],
  },
  couponInfo: {
    flex: 1,
  },
  couponTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  couponSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  couponActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  couponRemoveActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.error,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  optionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  optionSubRequired: {
    color: COLORS.error,
    fontWeight: '700',
  },
  cutleryBtnGroup: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  cutleryBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: COLORS.white,
  },
  cutleryBtnActive: {
    backgroundColor: '#18181B',
    borderColor: '#18181B',
  },
  cutleryBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  cutleryBtnTextActive: {
    color: COLORS.white,
  },
  changeCard: {
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  changeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  changeInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: SPACING[3],
    minHeight: 50,
  },
  changeCurrencyPrefix: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  changeInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingVertical: 10,
  },
  phoneCard: {
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: COLORS.grayLight,
  },
  phoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  phoneInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    borderRadius: 10,
    paddingHorizontal: SPACING[3],
    minHeight: 50,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    paddingVertical: 10,
  },
  summarySection: {
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    paddingTop: SPACING[4],
    marginBottom: SPACING[6],
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[2],
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  totalRow: {
    marginTop: SPACING[2],
    paddingTop: SPACING[2],
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
});
