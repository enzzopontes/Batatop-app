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

import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useFooterInsets } from '../hooks/useFooterInsets';
import PrimaryButton from './PrimaryButton';

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
};

function labelInfo(label?: string | null) {
  if (label === 'trabalho') return { icon: 'briefcase' as const, text: 'Trabalho' };
  if (label === 'casa') return { icon: 'home' as const, text: 'Casa' };
  return { icon: 'location' as const, text: 'Endereço' };
}

export default function AddressVerificationModal({ visible, address, onTrocar, onContinuar }: Props) {
  const { paddingBottom } = useFooterInsets({ extraPadding: 20 });
  if (!address) return null;
  const { icon, text } = labelInfo(address.label);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onContinuar}>
      <View style={s.overlay}>
        <View style={[s.sheet, { paddingBottom }]}>
          <View style={s.handle} />

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
              {address.street}
              {address.number ? `, ${address.number}` : ''}
            </Text>
            <Text style={s.sub}>
              {[address.neighborhood, address.city].filter(Boolean).join(', ')}
            </Text>

            {!!address.reference_point && (
              <>
                <View style={s.divider} />
                <Text style={s.reference}>{address.reference_point}</Text>
              </>
            )}
          </View>

          <PrimaryButton
            fullWidth
            title="Trocar o endereço"
            onPress={onTrocar}
            style={{ marginBottom: SPACING[4] }}
          />

          <Pressable style={s.continuarBtn} onPress={onContinuar} hitSlop={8}>
            <Text style={s.continuarBtnText}>Continuar assim</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[8],
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING[5],
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
    marginBottom: SPACING[6],
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING[2] },
  labelText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  street: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base, marginBottom: 2 },
  sub: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.sizes.sm },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: SPACING[3] },
  reference: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
  continuarBtn: { paddingVertical: SPACING[2] },
  continuarBtnText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.sm },
});
