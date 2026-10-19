/**
 * AddressCard.js
 *
 * Card de endereço salvo (lista da versão logada). `is_default` (coluna
 * real do banco) é tratado como "endereço ativo" na UI — nunca renomeado
 * no banco, só na leitura aqui. `icon` e o endereço completo são sempre
 * computados (ver utils/addressHelpers.js), nunca persistidos.
 *
 * Tocar em qualquer parte do card (exceto o menu de 3 pontos) ativa o
 * endereço. O menu de 3 pontos abre o AddressModal (editar/excluir).
 */
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import { getAddressIcon, getAddressLabelText, buildFullAddress } from '../utils/addressHelpers';

export default function AddressCard({ address, onPress, onMenuPress }) {
  const isActive = !!address.is_default;
  const iconName = getAddressIcon(address.label);
  const labelText = getAddressLabelText(address.label);
  const fullAddress = buildFullAddress(address);
  const hasSecondLine = !!(address.complement || address.reference_point);
  const secondLine = [address.complement, address.reference_point].filter(Boolean).join(' - ');

  return (
    <Pressable style={[c.card, isActive && c.cardActive]} onPress={onPress}>
      <View style={c.row}>
        {/* Ícone centralizado verticalmente em relação ao bloco de texto
            inteiro (nome + endereço + linha extra), não só à primeira linha. */}
        <Ionicons name={iconName} size={24} color={COLORS.textSecondary} />

        <View style={c.content}>
          <View style={c.nameRow}>
            <Text style={c.name} numberOfLines={1}>{labelText}</Text>
            {isActive && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
            <Pressable hitSlop={10} style={c.menuBtn} onPress={onMenuPress}>
              <Ionicons name="ellipsis-vertical" size={20} color={COLORS.primary} />
            </Pressable>
          </View>

          <Text style={c.fullAddress} numberOfLines={1}>{fullAddress}</Text>

          {hasSecondLine && (
            <Text style={c.secondLine} numberOfLines={1}>{secondLine}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const c = StyleSheet.create({
  card: {
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: SPACING[4],
    marginBottom: SPACING[3],
  },
  cardActive: {
    borderColor: COLORS.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  content: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  name: {
    flex: 1,
    color: COLORS.text,
    fontWeight: '600',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  menuBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullAddress: {
    color: COLORS.textSecondary,
    fontSize: 13,
    marginTop: SPACING[1],
  },
  secondLine: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
