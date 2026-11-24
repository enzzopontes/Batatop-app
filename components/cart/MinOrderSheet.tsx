import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { MIN_ORDER_VALUE } from '../../constants/store';
import PrimaryButton from '../PrimaryButton';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';
import RipplePressable from './RipplePressable';

interface MinOrderSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoosePickup?: () => void;
}

export default function MinOrderSheet({
  visible,
  onClose,
  onChoosePickup,
}: MinOrderSheetProps) {
  const router = useRouter();
  const minFormatted = `R$ ${MIN_ORDER_VALUE.toFixed(2).replace('.', ',')}`;

  const handleAddMore = () => {
    onClose();
    router.push('/cardapio');
  };

  const handleChoosePickup = () => {
    onClose();
    onChoosePickup?.();
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0, 0, 0, 0.5)"
      contentStyle={styles.sheet}
      minBottomPadding={32}
      extraBottomPadding={16}
    >
      <Text style={styles.title}>Valor mínimo do pedido</Text>
      <Text style={styles.description}>
        O pedido mínimo para entrega é de {minFormatted} (sem incluir a taxa de entrega).
      </Text>

      <PrimaryButton
        fullWidth
        title="Adicionar mais itens"
        onPress={handleAddMore}
        accessibilityLabel="Adicionar mais itens"
        style={{ marginBottom: 12 }}
      />

      {onChoosePickup && (
        <RipplePressable
          style={styles.pickupBtn}
          onPress={handleChoosePickup}
          hitSlop={8}
          rippleColor="rgba(227, 160, 8, 0.18)"
          accessibilityLabel="Retirar na loja (sem valor mínimo)"
        >
          <Text style={styles.pickupBtnText}>Retirar na loja (sem valor mínimo)</Text>
        </RipplePressable>
      )}

      <RipplePressable
        style={styles.cancelBtn}
        onPress={onClose}
        hitSlop={8}
        rippleColor="rgba(227, 160, 8, 0.15)"
        accessibilityLabel="Ok, entendi"
      >
        <Text style={styles.cancelBtnText}>Ok, entendi</Text>
      </RipplePressable>
    </SwipeableBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
    alignItems: 'center',
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grayBorder,
    marginBottom: SPACING[4],
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: COLORS.grayText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  pickupBtn: {
    width: '100%',
    height: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pickupBtnText: {
    color: COLORS.secondary,
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    width: '100%',
    height: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },
});
