import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { CheckoutStep, DeliveryType } from './useCheckoutFlow';
import { useFooterInsets } from '../../hooks/useFooterInsets';
import PrimaryButton from '../PrimaryButton';

interface CartFooterProps {
  step?: CheckoutStep;
  total: number;
  deliveryType: DeliveryType;
  deliveryFee?: number;
  itemCount: number;
  submitting: boolean;
  onContinue: () => void;
}

export default function CartFooter({
  step = 'itens',
  total,
  deliveryType,
  deliveryFee = 0,
  itemCount,
  submitting,
  onContinue,
}: CartFooterProps) {
  const { paddingBottom } = useFooterInsets({ extraPadding: 16 });
  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;
  const isFree = deliveryType === 'retirada' || deliveryFee === 0;
  const deliveryStatus = isFree ? 'retirada grátis' : 'com entrega';

  // Na etapa de pagamento: botão full-width "Revisar pedido • R$ XX,XX" idêntico à Imagem 2
  if (step === 'pagamento') {
    return (
      <View style={[styles.container, { paddingBottom }]}>
        <PrimaryButton
          fullWidth
          title={`Revisar pedido • ${formattedTotal}`}
          onPress={onContinue}
          disabled={submitting || itemCount === 0}
          loading={submitting}
          accessibilityLabel={`Revisar pedido, total ${formattedTotal}`}
        />
      </View>
    );
  }

  // Etapa 1 ("itens") ou Etapa 2 ("entrega")
  return (
    <View style={[styles.container, { paddingBottom }]}>
      <View style={styles.row}>
        {step === 'itens' ? (
          // Imagem 1: Total com a entrega no topo, R$ XX,XX / 1 item embaixo
          <View style={styles.priceContainer}>
            <Text style={styles.priceLabel}>
              {deliveryType === 'retirada' ? 'Total dos itens' : 'Total com a entrega'}
            </Text>
            <Text style={styles.priceLine} numberOfLines={1}>
              <Text style={styles.priceText}>{formattedTotal}</Text>
              <Text style={styles.priceSubText}>
                {' '}/ {itemCount} {itemCount === 1 ? 'item' : 'itens'}
              </Text>
            </Text>
          </View>
        ) : (
          // Imagem 5: R$ XX,XX • com entrega
          <View style={styles.priceContainer}>
            <Text style={styles.priceLine} numberOfLines={1} ellipsizeMode="tail">
              <Text style={styles.priceText}>{formattedTotal}</Text>
              <Text style={styles.priceDot}> • </Text>
              <Text style={styles.deliveryText}>{deliveryStatus}</Text>
            </Text>
          </View>
        )}

        {/* Botão Continuar padronizado com PrimaryButton */}
        <PrimaryButton
          title="Continuar"
          badge={step === 'entrega' ? '3' : null}
          onPress={onContinue}
          disabled={submitting || itemCount === 0}
          loading={submitting}
          accessibilityLabel={`Continuar com ${itemCount} itens`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  priceContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  priceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
    fontWeight: '500',
  },
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  priceSubText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  priceDot: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  deliveryText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
