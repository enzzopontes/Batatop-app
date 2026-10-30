import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, Dimensions, Pressable, Text, Image as RNImage } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { fetchHighlightCouponBanners } from '../utils/homeCoupons';
import { cartStore } from '../utils/cartStore';
import { showSuccessAlert } from './ThemedAlert';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Largura otimizada para o padrão iFood (destaque com espiada sutil do próximo banner)
const ITEM_WIDTH = Math.round(SCREEN_WIDTH * 0.84);
const ITEM_SPACING = SPACING[3];
const SIDE_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const SNAP_INTERVAL = ITEM_WIDTH + ITEM_SPACING;
const AUTOPLAY_INTERVAL = 10000;
// Altura inicial baseada no padrão 16:9
const INITIAL_BANNER_HEIGHT = Math.round(ITEM_WIDTH / (16 / 9));

export default function BannerCarousel() {
  const router = useRouter();
  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [couponBanners, setCouponBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dynamicHeight, setDynamicHeight] = useState(INITIAL_BANNER_HEIGHT);

  useEffect(() => {
    let mounted = true;
    fetchHighlightCouponBanners()
      .then((items) => {
        if (mounted && Array.isArray(items)) {
          const formatted = items
            .filter((c) => Boolean(c.banner_image_url))
            .map((c) => ({
              id: c.id,
              uri: c.banner_image_url,
              badge_label: c.badge_label || c.coupon?.badge_label || null,
              coupon: c.coupon || null,
            }));
          setCouponBanners(formatted);

          // Auto-adapta a altura do container à proporção real da imagem enviada
          const firstImage = formatted[0]?.uri;
          if (firstImage) {
            RNImage.getSize(
              firstImage,
              (w, h) => {
                if (mounted && w > 0 && h > 0) {
                  const ratio = w / h;
                  // Harmonização: limita entre 1.3 (mais vertical) e 2.6 (mais panorâmico)
                  const clampedRatio = Math.max(1.3, Math.min(2.6, ratio));
                  const autoHeight = Math.round(ITEM_WIDTH / clampedRatio);
                  setDynamicHeight(autoHeight);
                }
              },
              () => {}
            );
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const clearAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    if (couponBanners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      const nextIndex = (indexRef.current + 1) % couponBanners.length;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * SNAP_INTERVAL,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [clearAutoplay, couponBanners.length]);

  useEffect(() => {
    startAutoplay();
    return () => clearAutoplay();
  }, [startAutoplay, clearAutoplay]);

  const goToIndex = (newIndex) => {
    indexRef.current = newIndex;
    setActiveIndex(newIndex);
    startAutoplay();
  };

  const handleScrollBeginDrag = () => {
    clearAutoplay();
  };

  const handleMomentumScrollEnd = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SNAP_INTERVAL);
    goToIndex(newIndex);
  };

  const handleBannerPress = async (item) => {
    const coupon = item.coupon;
    if (coupon && (coupon.code || coupon.id)) {
      try {
        cartStore.setCoupon(coupon);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccessAlert('Seu cupom foi aplicado!', 'Sucesso');
      } catch (err) {
        console.warn('Erro ao aplicar cupom do banner:', err);
      }
    }
  };

  if (loading || couponBanners.length === 0) {
    return null;
  }

  return (
    <View style={s.wrapper}>
      <View style={{ height: dynamicHeight, overflow: 'hidden' }}>
        <FlatList
          ref={flatListRef}
          data={couponBanners}
          keyExtractor={(item) => String(item.id)}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SNAP_INTERVAL}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: SIDE_PADDING }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item }) => (
            <Pressable
              style={[s.slide, { height: dynamicHeight }]}
              onPress={() => handleBannerPress(item)}
              activeOpacity={item.coupon ? 0.88 : 1}
            >
              <View style={[s.frame, { height: dynamicHeight }]}>
                <ExpoImage
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFillObject}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                {item.badge_label ? (
                  <View style={s.badgeWrap}>
                    <Text style={s.badgeText}>{item.badge_label}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      </View>

      {couponBanners.length > 1 && (
        <View style={s.dotsRow}>
          {couponBanners.map((_, i) => (
            <View key={`dot-${i}`} style={[s.dot, i === activeIndex && s.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    gap: SPACING[3],
  },
  slide: {
    width: ITEM_WIDTH,
    marginRight: ITEM_SPACING,
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
});
