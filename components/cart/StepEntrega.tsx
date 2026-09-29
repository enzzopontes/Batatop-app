import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';

interface StepEntregaProps {
  onBack?: () => void;
}

export default function StepEntrega(_props: StepEntregaProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Etapa Entrega (Fase 2)</Text>
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
