import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { MIN_ORDER_VALUE } from '../../constants/store';
import PrimaryButton from '../PrimaryButton';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';

interface MinOrderSheetProps {
  visible: boolean;
  onClose: () => void;
}

export default function MinOrderSheet({ visible, onClose }: MinOrderSheetProps) {
  const router = useRouter();
  const minFormatted = `R$ ${MIN_ORDER_VALUE.toFixed(2).replace('.', ',')}`;

  const handleAddMore = () => {
    onClose();
    router.push('/cardapio');
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0, 0, 0, 0.5)"
      contentStyle={styles.sheet}
    >
      <Text style={styles.title}>Valor mínimo do pedido</Text>
      <Text style={styles.description}>
        O pedido mínimo é {minFormatted} sem contar com a taxa de entrega
      </Text>

      <PrimaryButton
        fullWidth
        title="Adicionar mais itens"
        onPress={handleAddMore}
        accessibilityLabel="Adicionar mais itens"
        style={{ marginBottom: 12 }}
      />

      <Pressable
        style={styles.cancelBtn}
        onPress={onClose}
        hitSlop={8}
        accessibilityLabel="Ok, entendi"
      >
        <Text style={styles.cancelBtnText}>Ok, entendi</Text>
      </Pressable>
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
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 15,
  },
});
