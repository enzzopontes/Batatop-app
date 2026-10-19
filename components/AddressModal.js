/**
 * AddressModal.js
 *
 * Bottom sheet aberto pelo menu de 3 pontos do AddressCard. Só apresenta
 * as duas ações (Excluir/Editar) — a confirmação de exclusão (Alert.alert)
 * e a navegação de edição continuam responsabilidade da tela principal
 * (addresses.js), este componente só dispara os callbacks.
 */
import { useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import { getAddressLabelText } from '../utils/addressHelpers';
import SwipeableBottomSheetModal from './SwipeableBottomSheetModal';

export default function AddressModal({ visible, address, onClose, onEdit, onDelete }) {
  const addressRef = useRef(address);
  if (address) addressRef.current = address;
  const currentAddress = address || addressRef.current;

  if (!visible && !addressRef.current) return null;
  const labelText = currentAddress ? getAddressLabelText(currentAddress.label) : '';

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={am.sheet}
    >
      <Text style={am.title}>{labelText}</Text>

      <View style={am.actionsRow}>
        <Pressable style={am.actionBox} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={COLORS.text} />
          <Text style={am.actionText}>Excluir</Text>
        </Pressable>
        <Pressable style={am.actionBox} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={18} color={COLORS.text} />
          <Text style={am.actionText}>Editar</Text>
        </Pressable>
      </View>

      <Pressable style={am.cancelBtn} onPress={onClose}>
        <Text style={am.cancelText}>Cancelar</Text>
      </Pressable>
    </SwipeableBottomSheetModal>
  );
}

const am = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  contentWrap: { width: '100%' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingTop: SPACING[3],
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[6],
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING[4],
  },
  title: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    marginBottom: SPACING[5],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING[3],
    width: '100%',
    marginBottom: SPACING[4],
  },
  actionBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[4],
  },
  actionText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: TYPOGRAPHY.sizes.sm,
  },
  cancelBtn: {
    paddingTop: SPACING[1],
  },
  cancelText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: TYPOGRAPHY.sizes.base,
  },
});
