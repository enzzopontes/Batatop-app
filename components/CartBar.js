import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useRef, useEffect } from 'react';
import { useCart } from '../utils/cartStore';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';

const LOGO = require('../assets/logo.png');

/* ============================================================
   CART BAR — SACOLA FLUTUANTE
   Fundo branco full-width, colado (sem gap) em cima da BottomTabBar,
   sem radius no container (mesmo raio "zero" da tab bar) pra formar
   uma unidade só. Dentro: logo + total à esquerda, botão pill
   amarelo "Ver sacola" à direita.
   tabBarHeight vem via prop (não useTabBarHeight()) pra evitar
   import circular com app/_layout.js — mesmo padrão do EntrarBanner.
   ============================================================ */
export default function CartBar({ tabBarHeight }) {
  const router = useRouter();
  const pathname = usePathname();
  const { count: totalItems, total, hideFloating } = useCart();
  const subtotal = total / 100;

  const translateY = useRef(new Animated.Value(120)).current;
  const wasVisible = useRef(false);

  const isCartPage = pathname.includes('cart') || pathname.includes('checkout');
  const isWelcomePage = pathname.includes('welcome');
  const isLocationPage = pathname.includes('location');
  const isAdminPage = pathname.includes('/admin');
  const isCuponsPage = pathname.includes('/cupons');
  const isPaymentsPage = pathname.includes('payments');
  const shouldShow = totalItems > 0 && !isCartPage && !isWelcomePage && !isLocationPage && !isAdminPage && !isCuponsPage && !isPaymentsPage && !hideFloating;

  useEffect(() => {
    if (shouldShow && !wasVisible.current) {
      wasVisible.current = true;
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }).start();
    } else if (!shouldShow && wasVisible.current) {
      wasVisible.current = false;
      Animated.timing(translateY, {
        toValue: 120,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [shouldShow]);

  const opacity = translateY.interpolate({
    inputRange: [0, 80],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      style={[s.cartBar, { bottom: tabBarHeight, transform: [{ translateY }], opacity }]}
      pointerEvents={shouldShow ? 'auto' : 'none'}
    >
      <View style={s.cartBarInner}>
        <View style={s.left}>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
          <View>
            <Text style={s.totalLabel}>
              Total com <Text style={s.totalLabelBold}>entrega grátis</Text>
            </Text>
            <Text style={s.priceRow}>
              <Text style={s.priceValue}>R$ {subtotal.toFixed(2).replace('.', ',')}</Text>
              <Text style={s.itemCount}>  / {totalItems} {totalItems === 1 ? 'item' : 'itens'}</Text>
            </Text>
          </View>
        </View>

        <Pressable style={s.cta} onPress={() => router.push('/cart')}>
          <Text style={s.ctaText}>Ver sacola</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 900,
  },
  cartBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
    gap: SPACING[3],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  logo: { width: 48, height: 48 },
  totalLabel: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.regular,
  },
  totalLabelBold: {
    color: COLORS.text,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  priceRow: { marginTop: 2 },
  priceValue: {
    color: COLORS.text,
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  itemCount: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.regular,
  },
  cta: {
    flex: 1,
    maxWidth: '58%',
    marginLeft: 'auto',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
  },
  ctaText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
});
