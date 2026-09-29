import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { CheckoutStep } from './useCheckoutFlow';

interface CartHeaderProps {
  step: CheckoutStep;
  onBack: () => void;
  onClear: () => void;
  showClear?: boolean;
}

export default function CartHeader({ step, onBack, onClear, showClear = true }: CartHeaderProps) {
  const isItens = step === 'itens';

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.circleBtn}
        hitSlop={8}
        accessibilityLabel={isItens ? 'Fechar sacola' : 'Voltar etapa'}
      >
        <Ionicons
          name={isItens ? 'chevron-down' : 'chevron-back'}
          size={20}
          color={COLORS.text}
        />
      </Pressable>

      <Text style={styles.headerTitle}>SACOLA</Text>

      {showClear ? (
        <Pressable
          onPress={onClear}
          style={styles.clearBtn}
          hitSlop={8}
          accessibilityLabel="Limpar sacola"
        >
          <Text style={styles.clearText}>Limpar</Text>
        </Pressable>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    backgroundColor: COLORS.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: COLORS.text,
    textAlign: 'center',
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  clearText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.brandRed,
  },
  placeholder: {
    width: 36,
  },
});
