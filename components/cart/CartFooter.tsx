import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { CheckoutStep, DeliveryType } from './useCheckoutFlow';

interface CartFooterProps {
  step: CheckoutStep;
  total: number;
  deliveryType: DeliveryType;
  itemCount: number;
  submitting: boolean;
  onContinue: () => void;
}

export default function CartFooter({
  step,
  total,
  deliveryType,
  itemCount,
  submitting,
  onContinue,
}: CartFooterProps) {
  const insets = useSafeAreaInsets();
  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;
  const deliveryLabel = deliveryType === 'delivery' ? 'com entrega' : 'retirada';

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING[3] }]}>
      {step === 'pagamento' ? (
        <Pressable
          style={[styles.reviewButton, submitting && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={submitting}
          accessibilityLabel={`Revisar pedido no valor de ${formattedTotal}`}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <Text style={styles.reviewButtonText}>
              Revisar pedido • {formattedTotal}
            </Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.row}>
          <View style={styles.priceContainer}>
            <Text style={styles.priceText}>{formattedTotal}</Text>
            <Text style={styles.priceDot}> • </Text>
            <Text style={styles.deliveryText}>{deliveryLabel}</Text>
          </View>

          <Pressable
            style={[styles.continueButton, (submitting || itemCount === 0) && styles.buttonDisabled]}
            onPress={onContinue}
            disabled={submitting || itemCount === 0}
            accessibilityLabel={`Continuar com ${itemCount} itens`}
          >
            <Text style={styles.continueButtonText}>Continuar</Text>
            {itemCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{itemCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  priceDot: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  deliveryText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    height: 48,
    paddingLeft: 18,
    paddingRight: 14,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  reviewButton: {
    backgroundColor: COLORS.primary,
    height: 48,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
