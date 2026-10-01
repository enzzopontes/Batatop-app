import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { CheckoutStep, DeliveryType } from './useCheckoutFlow';
import RipplePressable from './RipplePressable';

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
  total,
  deliveryType,
  deliveryFee = 0,
  itemCount,
  submitting,
  onContinue,
}: CartFooterProps) {
  const insets = useSafeAreaInsets();
  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;
  const isFree = deliveryType === 'retirada' || deliveryFee === 0;
  const deliveryStatus = isFree ? 'Entrega grátis' : 'com entrega';

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, SPACING[3]) }]}>
      <View style={styles.row}>
        {/* Preço e status de entrega na MESMA linha, centralizados verticalmente, separados por '•' */}
        <View style={styles.priceContainer}>
          <Text style={styles.priceLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.priceText}>{formattedTotal}</Text>
            <Text style={styles.priceDot}> • </Text>
            <Text style={styles.deliveryText}>{deliveryStatus}</Text>
          </Text>
        </View>

        {/* Botão na cor principal do theme com animação ripple */}
        <RipplePressable
          style={[styles.continueButton, (submitting || itemCount === 0) && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={submitting || itemCount === 0}
          rippleColor="rgba(0, 0, 0, 0.22)"
          accessibilityLabel={`Continuar com ${itemCount} itens`}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.text} size="small" />
          ) : (
            <>
              <Text style={styles.continueButtonText}>Continuar</Text>
              {itemCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{itemCount}</Text>
                </View>
              )}
            </>
          )}
        </RipplePressable>
      </View>
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
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
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
  continueButton: {
    backgroundColor: COLORS.primary,
    height: 48,
    paddingLeft: 20,
    paddingRight: 16,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  continueButtonText: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
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
  buttonDisabled: {
    opacity: 0.6,
  },
});
