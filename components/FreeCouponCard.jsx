import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';

// theme.js não tem um token roxo — usando um valor local até
// alguém adicionar algo tipo COLORS.couponFree no design system.
const FREE_COUPON_PURPLE = '#7B2FBE';

export default function FreeCouponCard({ count, onPress }) {
  if (!count) return null;

  return (
    <Pressable style={s.card} onPress={onPress}>
      <View style={s.textCol}>
        <Text style={s.title}>Você ganhou cupons grátis</Text>
        <View style={s.subtitleRow}>
          <Ionicons name="flash" size={12} color={FREE_COUPON_PURPLE} />
          <Text style={s.subtitle}>{count} disponíve{count === 1 ? 'l' : 'is'}</Text>
        </View>
      </View>
      <View style={s.arrowCircle}>
        <Ionicons name="chevron-forward" size={20} color={COLORS.white} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: COLORS.text,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[4],
    marginBottom: SPACING[4],
    backgroundColor: COLORS.white,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING[2],
  },
  subtitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: FREE_COUPON_PURPLE,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
