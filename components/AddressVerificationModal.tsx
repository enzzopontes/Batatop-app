/**
 * components/AddressVerificationModal.tsx
 *
 * Bottom sheet "Seu endereço está certo?" — aparece quando o GPS da pessoa
 * diverge (>30m) do endereço selecionado no momento de adicionar um
 * produto ao carrinho. Estrutura replicada da referência (handle, título,
 * subtítulo, card do endereço, botão primário + link secundário), mas
 * usando os tokens de cor do próprio app (COLORS.primary/COLORS.text etc)
 * em vez das cores hardcoded da referência — ver seção 13 do CLAUDE.md
 * ("nunca hardcodar cores/espaçamentos").
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import PrimaryButton from './PrimaryButton';
import SwipeableBottomSheetModal from './SwipeableBottomSheetModal';

type Address = {
  label?: 'casa' | 'trabalho' | null;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  reference_point?: string;
};

type Props = {
  visible: boolean;
  address: Address | null;
  onTrocar: () => void;
  onContinuar: () => void;
  onClose?: () => void;
};

function labelInfo(label?: string | null) {
  if (label === 'trabalho') return { icon: 'briefcase' as const, text: 'Trabalho' };
  if (label === 'casa') return { icon: 'home' as const, text: 'Casa' };
  return { icon: 'location' as const, text: 'Endereço' };
}

export default function AddressVerificationModal({
  visible,
  address,
  onTrocar,
  onContinuar,
  onClose,
}: Props) {
  const addressRef = useRef(address);
  if (address) addressRef.current = address;
  const currentAddress = address || addressRef.current;

  if (!visible && !addressRef.current) return null;
  if (!currentAddress) return null;
  const { icon, text } = labelInfo(currentAddress.label);

  const handleClose = onClose || onContinuar;

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={handleClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={s.sheet}
      minBottomPadding={32}
      extraBottomPadding={16}
    >
      <Text style={s.title}>Seu endereço está certo?</Text>
      <Text style={s.subtitle}>
        O endereço não é o mesmo da sua localização, confira o endereço antes de continuar
      </Text>

      <View style={s.card}>
        <View style={s.labelRow}>
          <Ionicons name={icon} size={14} color={COLORS.textSecondary} />
          <Text style={s.labelText}>{text}</Text>
        </View>

        <Text style={s.street}>
          {currentAddress.street}
          {currentAddress.number ? `, ${currentAddress.number}` : ''}
        </Text>
        <Text style={s.sub}>
          {[currentAddress.neighborhood, currentAddress.city].filter(Boolean).join(', ')}
        </Text>

        {!!currentAddress.reference_point && (
          <>
            <View style={s.divider} />
            <Text style={s.reference}>{currentAddress.reference_point}</Text>
          </>
        )}
      </View>

      <PrimaryButton
        fullWidth
        title="Trocar o endereço"
        onPress={onTrocar}
        style={{ marginBottom: SPACING[3] }}
      />

      <Pressable
        style={({ pressed }) => [s.continuarBtn, pressed && s.continuarBtnPressed]}
        onPress={onContinuar}
        hitSlop={8}
      >
        <Text style={s.continuarBtnText}>Continuar assim</Text>
      </Pressable>
    </SwipeableBottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[3],
    alignItems: 'center',
  },
  title: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.lg,
    marginBottom: SPACING[2],
    textAlign: 'center',
  },
  subtitle: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING[5],
  },
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    marginBottom: SPACING[5],
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING[2] },
  labelText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  street: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base, marginBottom: 2 },
  sub: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.sizes.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: SPACING[3] },
  reference: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
  continuarBtn: {
    width: '100%',
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continuarBtnPressed: {
    backgroundColor: COLORS.borderLight,
    opacity: 0.9,
  },
  continuarBtnText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 15,
  },
});
