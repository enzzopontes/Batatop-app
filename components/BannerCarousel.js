import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, Pressable, Text, Image as RNImage, useWindowDimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { fetchHighlightCouponBanners } from '../utils/homeCoupons';
import { resolveBannerImageUrl } from '../utils/resolveProductImage';
import { cartStore } from '../utils/cartStore';
import { validateCouponCode } from '../hooks/useCoupons';
import { showSuccessAlert, showErrorAlert } from './ThemedAlert';

const ITEM_SPACING = SPACING[3];
const AUTOPLAY_INTERVAL = 10000;

function BannerSeparator() {
  return <View style={{ width: ITEM_SPACING }} />;
}

export default function BannerCarousel() {
  const { width: windowWidth } = useWindowDimensions();
  const itemWidth = Math.round(windowWidth * 0.84);
  const sidePadding = Math.round((windowWidth - itemWidth) / 2);
  const snapInterval = itemWidth + ITEM_SPACING;
  const initialBannerHeight = Math.round(itemWidth / (16 / 9));

  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [couponBanners, setCouponBanners] = useState([]);
  const [failedBannerIds, setFailedBannerIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [dynamicHeight, setDynamicHeight] = useState(initialBannerHeight);

  const visibleBanners = useMemo(
    () => couponBanners.filter((b) => !failedBannerIds[b.id]),
    [couponBanners, failedBannerIds]
  );

  useEffect(() => {
    let mounted = true;
    fetchHighlightCouponBanners()
      .then((items) => {
        if (mounted && Array.isArray(items)) {
          const formatted = items
            .map((c) => ({
              id: c.id,
              uri: resolveBannerImageUrl(c.banner_image_url),
              badge_label: c.badge_label || c.coupon?.badge_label || null,
              coupon: c.coupon || null,
            }))
            .filter((c) => Boolean(c.uri));
          setCouponBanners(formatted);
          setFailedBannerIds({});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (visibleBanners.length === 0) {
      indexRef.current = 0;
      setActiveIndex(0);
      return;
    }
    if (indexRef.current >= visibleBanners.length) {
      const clamped = visibleBanners.length - 1;
      indexRef.current = clamped;
      setActiveIndex(clamped);
      flatListRef.current?.scrollToOffset({
        offset: clamped * snapInterval,
        animated: false,
      });
    }
  }, [visibleBanners.length, snapInterval]);

  const clearAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    if (visibleBanners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      const nextIndex = (indexRef.current + 1) % visibleBanners.length;
      indexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * snapInterval,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [clearAutoplay, visibleBanners.length, snapInterval]);

  useEffect(() => {
    startAutoplay();
    return () => clearAutoplay();
  }, [startAutoplay, clearAutoplay]);

  const syncIndexFromOffset = useCallback(
    (offsetX) => {
      if (visibleBanners.length === 0) return;
      const rawIndex = Math.round(offsetX / snapInterval);
      const clamped = Math.max(0, Math.min(visibleBanners.length - 1, rawIndex));
      indexRef.current = clamped;
      setActiveIndex(clamped);
      startAutoplay();
    },
    [visibleBanners.length, snapInterval, startAutoplay]
  );

  const handleScrollBeginDrag = useCallback(() => {
    clearAutoplay();
  }, [clearAutoplay]);

  const handleMomentumScrollEnd = useCallback(
    (e) => {
      syncIndexFromOffset(e.nativeEvent.contentOffset.x);
    },
    [syncIndexFromOffset]
  );

  const handleScrollEndDrag = useCallback(
    (e) => {
      const velocityX = e.nativeEvent?.velocity?.x ?? 0;
      if (Math.abs(velocityX) < 0.05) {
        syncIndexFromOffset(e.nativeEvent.contentOffset.x);
      }
    },
    [syncIndexFromOffset]
  );

  const handleBannerImageError = useCallback((bannerId) => {
    setFailedBannerIds((prev) => (prev[bannerId] ? prev : { ...prev, [bannerId]: true }));
  }, []);

  // Auto-adapta a altura do container à proporção real da imagem do banner ativo
  useEffect(() => {
    let mounted = true;
    const currentImg = visibleBanners[activeIndex]?.uri || visibleBanners[0]?.uri;
    if (currentImg) {
      RNImage.getSize(
        currentImg,
        (w, h) => {
          if (mounted && w > 0 && h > 0) {
            const ratio = w / h;
            // Harmonização: limita entre 1.3 (mais vertical) e 2.6 (mais panorâmico)
            const clampedRatio = Math.max(1.3, Math.min(2.6, ratio));
            const autoHeight = Math.round(itemWidth / clampedRatio);
            setDynamicHeight(autoHeight);
          }
        },
        () => {}
      );
    }
    return () => {
      mounted = false;
    };
  }, [activeIndex, visibleBanners, itemWidth]);

  const handleBannerPress = async (item) => {
    const coupon = item.coupon;
    if (coupon && coupon.code) {
      try {
        const cartTotal = cartStore.getCartTotal() / 100;
        const cartItems = cartStore.getCart();
        const result = await validateCouponCode(coupon.code, cartTotal, cartItems);
        if (!result.valid) {
          Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Error)?.catch?.(() => {});
          showErrorAlert(result.reason || 'Cupom indisponível.', 'Cupom Inválido');
          return;
        }
        const validatedCoupon = result.coupon || coupon;
        cartStore.setCoupon(validatedCoupon);
        if (validatedCoupon.code) {
          try {
            await Clipboard.setStringAsync(validatedCoupon.code);
          } catch {}
        }
        Haptics.notificationAsync?.(Haptics.NotificationFeedbackType.Success)?.catch?.(() => {});
        showSuccessAlert(
          `Cupom ${validatedCoupon.code || ''} aplicado! Ao entrar na sacola o desconto já estará ativo.`,
          'Cupom Ativado'
        );
      } catch (err) {
        console.warn('Erro ao aplicar cupom do banner:', err);
        showErrorAlert('Não foi possível aplicar o cupom. Tente novamente.', 'Erro no Cupom');
      }
    }
  };

  if (loading || visibleBanners.length === 0) {
    return null;
  }

  return (
    <View style={s.wrapper}>
      <View style={{ height: dynamicHeight, overflow: 'hidden' }}>
        <FlatList
          ref={flatListRef}
          data={visibleBanners}
          keyExtractor={(item) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          disableIntervalMomentum
          snapToInterval={snapInterval}
          snapToAlignment="start"
          ItemSeparatorComponent={BannerSeparator}
          contentContainerStyle={{ paddingHorizontal: sidePadding }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollEndDrag={handleScrollEndDrag}
          renderItem={({ item }) => (
            <Pressable
              style={[s.slide, { width: itemWidth, height: dynamicHeight }]}
              onPress={() => handleBannerPress(item)}
            >
              <View style={[s.frame, { height: dynamicHeight }]}>
                <ExpoImage
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  onError={() => handleBannerImageError(item.id)}
                />
                {item.badge_label ? (
                  <View style={s.badgeWrap}>
                    <Text style={s.badgeText} numberOfLines={1} ellipsizeMode="tail">
                      {item.badge_label}
                    </Text>
                  </View>
                ) : null}
                {item.coupon?.code ? (
                  <View style={s.couponTag}>
                    <Ionicons name="pricetag" size={11} color={COLORS.primary} style={s.couponTagIcon} />
                    <Text style={s.couponTagText} numberOfLines={1} ellipsizeMode="tail">
                      Cupom: <Text style={s.couponTagBold}>{item.coupon.code}</Text> (Toque para aplicar)
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </View>

      {visibleBanners.length > 1 && (
        <View style={s.dotsRow}>
          {visibleBanners.map((banner, i) => (
            <View key={`dot-${banner.id}`} style={[s.dot, i === activeIndex && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    paddingTop: SPACING[6],
    gap: SPACING[3],
  },
  slide: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: '100%',
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  badgeWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
    maxWidth: '90%',
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[1],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    width: 16,
    backgroundColor: COLORS.primary,
  },
  couponTag: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    maxWidth: '90%',
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  couponTagIcon: {
    marginRight: 4,
  },
  couponTagText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '600',
  },
  couponTagBold: {
    color: COLORS.primary,
    fontWeight: '900',
  },
});
