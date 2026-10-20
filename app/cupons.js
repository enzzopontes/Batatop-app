import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCoupons } from '../hooks/useCoupons';
import { useCart } from '../utils/cartStore';
import CouponCard, { SelectorCircle } from '../components/CouponCard';
import FreeCouponCard from '../components/FreeCouponCard';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';

export default function CuponsScreen() {
  const router = useRouter();
  const { total, coupon: selectedCoupon, setCoupon } = useCart();

  const {
    coupons,
    freeCoupons,
    loading,
    validateCoupon,
    getCouponMissingAmount,
  } = useCoupons(total / 100);

  const [code, setCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [rejectCoupon, setRejectCoupon] = useState(false);

  const handleApply = async () => {
    if (!code.trim() || applying) return;
    setApplying(true);
    const result = await validateCoupon(code);
    setApplying(false);

    if (!result.valid) {
      showThemedAlert('Cupom inválido', result.reason);
      return;
    }
    setCoupon(result.coupon);
    setRejectCoupon(false);
    router.back();
  };

  const handleSelect = (coupon) => {
    setRejectCoupon(false);
    const isSame = selectedCoupon?.id === coupon.id;
    setCoupon(isSame ? null : coupon);
  };

  const handleToggleReject = () => {
    const next = !rejectCoupon;
    setRejectCoupon(next);
    if (next) setCoupon(null);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle} pointerEvents="none">CUPONS</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.inputWrapper}>
          <View style={s.inputRow}>
            <View style={s.inputIconSlot}>
              <Image source={require('../assets/ticketsolo.png')} style={s.inputIcon} resizeMode="contain" />
            </View>
            <TextInput
              style={s.input}
              placeholder="Código de cupom"
              placeholderTextColor={COLORS.textMuted}
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
            />
            {code.length > 0 && (
              <Pressable onPress={() => setCode('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            )}
          </View>
          <Pressable onPress={handleApply} disabled={!code.trim() || applying} hitSlop={8}>
            <Text style={[s.applyText, code.trim() ? s.applyTextActive : s.applyTextDisabled]}>
              {applying ? '...' : 'Aplicar'}
            </Text>
          </Pressable>
        </View>

        <FreeCouponCard
          count={freeCoupons.length}
          onPress={() =>
            showThemedAlert(
              'Cupons grátis',
              `Você tem ${freeCoupons.length} cupom(ns) grátis disponível(is).`
            )
          }
        />

        <View style={s.rejectRow}>
          <Pressable style={s.rejectLeft} onPress={handleToggleReject}>
            <View style={s.rejectIconSlot}>
              <Image source={require('../assets/cuponpretobranco.png')} style={s.rejectIcon} resizeMode="contain" />
            </View>
            <Text style={s.rejectText}>Não quero cupom</Text>
          </Pressable>
          <Pressable onPress={handleToggleReject} hitSlop={8}>
            <SelectorCircle selected={rejectCoupon} size={27} />
          </Pressable>
        </View>

        {!loading && coupons.map((coupon) => (
          <CouponCard
            key={coupon.id}
            coupon={coupon}
            currentTotal={total / 100}
            missingAmount={getCouponMissingAmount(coupon)}
            isSelected={!rejectCoupon && selectedCoupon?.id === coupon.id}
            onSelect={handleSelect}
          />
        ))}
      </ScrollView>

      <ThemedAlertHost />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    position: 'relative',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    letterSpacing: 1,
  },
  content: { padding: SPACING[4], paddingBottom: SPACING[8] },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: SPACING[4],
  },
  inputRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
  },
  inputIconSlot: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputIcon: { width: 38, height: 38 },
  input: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.text,
  },
  applyText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  applyTextActive: {
    color: COLORS.primary,
  },
  applyTextDisabled: {
    color: COLORS.textMuted,
  },
  rejectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    marginBottom: SPACING[4],
    backgroundColor: COLORS.white,
  },
  rejectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  rejectIconSlot: {
    width: 46,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectIcon: { width: 44, height: 44 },
  rejectText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
  },
});
