import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '../../constants/theme';
import { PaymentMethod, DeliveryType } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
import RipplePressable from './RipplePressable';
import PaymentCard from './PaymentCard';

const LOGO = require('../../assets/logo.png');
const CUPOM_ICON = require('../../assets/cuponpretobranco.png');

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
                {coupon.discount_type === 'percent'
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
