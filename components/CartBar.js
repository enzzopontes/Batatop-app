import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useRef, useEffect, useState } from 'react';
import { useCart } from '../utils/cartStore';
import { supabase } from '../supabaseConfig';
import { DELIVERY_FEE } from '../constants/store';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import RipplePressable from './cart/RipplePressable';

const LOGO = require('../assets/brand/logo.png');

/* ============================================================
   CART BAR — SACOLA FLUTUANTE
   Fundo branco full-width, colado (sem gap) em cima da BottomTabBar,
   sem radius no container (mesmo raio "zero" da tab bar) pra formar
   uma unidade só. Dentro: logo + total à esquerda, botão pill
   amarelo "Ver sacola" à direita.
   tabBarHeight vem via prop (não useTabBarHeight()) pra evitar
   import circular com app/_layout.js — mesmo padrão do EntrarBanner.
   ============================================================ */
export default function CartBar({ tabBarHeight, isAuthVisible = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const { count: totalItems, total, hideFloating } = useCart();
  const subtotal = total / 100;

  const translateY = useRef(new Animated.Value(120)).current;
  const wasVisible = useRef(false);
  const [isDeliveryFeeEnabled, setIsDeliveryFeeEnabled] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(0);

  useEffect(() => {
    let mounted = true;
    let channel;

    const applySettingValue = (val) => {
      if (!mounted || !val) return;
      if (val.isDeliveryFeeEnabled === true) {
        setIsDeliveryFeeEnabled(true);
        setDeliveryFee(Number(val.deliveryFee ?? DELIVERY_FEE) || 0);
      } else {
        setIsDeliveryFeeEnabled(false);
        setDeliveryFee(0);
      }
    };

    (async () => {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('setting_value')
          .eq('setting_key', 'store_status')
          .maybeSingle();
        applySettingValue(data?.setting_value);
      } catch {}
    })();

    try {
      channel = supabase
        .channel('store_settings_cart_bar_delivery_fee')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'store_settings',
            filter: 'setting_key=eq.store_status',
          },
          (payload) => {
            applySettingValue(payload.new?.setting_value);
          }
        )
        .subscribe();
    } catch {}

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const isCartPage = pathname.includes('cart');
  const isWelcomePage = pathname.includes('welcome');
  const isLocationPage = pathname.includes('location');
  const isAdminPage = pathname.includes('/admin');
  const isCuponsPage = pathname.includes('/cupons');
  const isPaymentsPage = pathname.includes('payments');
  const isAddressesPage = pathname.includes('addresses');
  const isExcluirContaPage = pathname.includes('excluir-conta');
  const isAuthPage = isAuthVisible || pathname.includes('auth') || pathname.includes('login') || pathname.includes('codigo') || pathname.includes('register');

  const shouldShow = totalItems > 0 && !isCartPage && !isWelcomePage && !isLocationPage && !isAdminPage && !isCuponsPage && !isPaymentsPage && !isAddressesPage && !isExcluirContaPage && !isAuthPage && !hideFloating;

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

  if (isAddressesPage || isAuthPage) return null;

  const isFreeDelivery = !isDeliveryFeeEnabled || deliveryFee <= 0;

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
          <View style={s.leftText}>
            <Text style={s.totalLabel}>
              {isFreeDelivery ? (
                <>
                  Total com <Text style={s.totalLabelBold}>entrega grátis</Text>
                </>
              ) : (
                <>
                  Total <Text style={s.totalLabelBold}>+ entrega</Text>
                </>
              )}
            </Text>
            <Text style={s.priceRow}>
              <Text style={s.priceValue}>R$ {subtotal.toFixed(2).replace('.', ',')}</Text>
              <Text style={s.itemCount}>  / {totalItems} {totalItems === 1 ? 'item' : 'itens'}</Text>
            </Text>
          </View>
        </View>

        <RipplePressable style={s.cta} onPress={() => router.push('/cart')}>

          <Text style={s.ctaText}>Ver sacola</Text>
        </RipplePressable>
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
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    paddingRight: SPACING[2],
  },
  leftText: {
    flex: 1,
    minWidth: 0,
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
    width: '50%',
    alignItems: 'center',
    justifyContent: 'center',
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
