import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';

interface PaymentSelectorProps {
  onBack?: () => void;
}

export default function PaymentSelector(_props: PaymentSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Seletor de Pagamento (Fase 2)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING[4],
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
});
