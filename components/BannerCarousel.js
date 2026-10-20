import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, Image, StyleSheet, Dimensions, Pressable, Text } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { fetchHighlightCouponBanners } from '../utils/homeCoupons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ITEM_WIDTH = SCREEN_WIDTH * 0.72;
const ITEM_SPACING = SPACING[3];
const SIDE_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const SNAP_INTERVAL = ITEM_WIDTH + ITEM_SPACING;
const FRAME_PADDING = SPACING[2];
const INNER_WIDTH = ITEM_WIDTH - FRAME_PADDING * 2;
const AUTOPLAY_INTERVAL = 10000;
const MAX_BANNER_HEIGHT = 260;

const STATIC_BANNER_IMAGES = [
  require('../assets/banners/banner1.png'),
  require('../assets/banners/banner2.png'),
  require('../assets/banners/banner3.png'),
  require('../assets/banners/banner4.png'),
  require('../assets/banners/banner5.png'),
  require('../assets/banners/banner6.png'),
];

const STATIC_BANNERS = STATIC_BANNER_IMAGES.map((source, idx) => {
  const { width, height } = Image.resolveAssetSource(source);
  return {
    id: `static-banner-${idx}`,
    type: 'static',
    source,
    height: Math.min(INNER_WIDTH / (width / height), MAX_BANNER_HEIGHT),
  };
});

const DEFAULT_BANNER_HEIGHT = Math.max(...STATIC_BANNERS.map((b) => b.height));
const FRAME_HEIGHT = DEFAULT_BANNER_HEIGHT + FRAME_PADDING * 2;

export default function BannerCarousel() {
  const router = useRouter();
  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [couponBanners, setCouponBanners] = useState([]);

  useEffect(() => {
    let mounted = true;
    fetchHighlightCouponBanners().then((items) => {
      if (mounted && Array.isArray(items) && items.length > 0) {
        const formatted = items.map((c) => ({
          id: `coupon-banner-${c.id}`,
          type: 'coupon',
          coupon: c,
          uri: c.banner_image_url,
          height: DEFAULT_BANNER_HEIGHT,
        }));
        setCouponBanners(formatted);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const allBanners = useMemo(() => {
    if (!couponBanners.length) return STATIC_BANNERS;
    // Intercala banners de cupons dinâmicos com os estáticos
    return [...couponBanners, ...STATIC_BANNERS];
  }, [couponBanners]);

  const clearAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    if (allBanners.length <= 1) return;
    intervalRef.current = setInterval(() => {
      const nextIndex = (indexRef.current + 1) % allBanners.length;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * SNAP_INTERVAL,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [clearAutoplay, allBanners.length]);

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
    if (item.type === 'coupon' && item.coupon?.code) {
      try {
        await Clipboard.setStringAsync(item.coupon.code);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        // clipboard fallback
      }
      router.push('/cupons');
    }
  };

  return (
    <View style={s.wrapper}>
      <View style={{ height: FRAME_HEIGHT, overflow: 'hidden' }}>
        <FlatList
          ref={flatListRef}
          data={allBanners}
          keyExtractor={(item) => item.id}
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
              style={s.slide}
              onPress={() => handleBannerPress(item)}
              activeOpacity={item.type === 'coupon' ? 0.9 : 1}
            >
              <View style={s.frame}>
                {item.type === 'coupon' ? (
                  <>
                    <ExpoImage
                      source={{ uri: item.uri }}
                      style={StyleSheet.absoluteFillObject}
                      contentFit="cover"
                      blurRadius={20}
                    />
                    <ExpoImage
                      source={{ uri: item.uri }}
                      style={{ width: INNER_WIDTH, height: item.height, borderRadius: RADIUS.lg }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                    {item.coupon?.badge_label ? (
                      <View style={s.badgeWrap}>
                        <Text style={s.badgeText}>{item.coupon.badge_label}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Image
                      source={item.source}
                      style={StyleSheet.absoluteFillObject}
                      resizeMode="cover"
                      blurRadius={25}
                    />
                    <Image
                      source={item.source}
                      style={{ width: INNER_WIDTH, height: item.height, borderRadius: RADIUS.lg }}
                      resizeMode="contain"
                    />
                  </>
                )}
              </View>
            </Pressable>
          )}
        />
      </View>

      <View style={s.dotsRow}>
        {allBanners.map((_, i) => (
          <View key={`dot-${i}`} style={[s.dot, i === activeIndex && s.dotActive]} />
        ))}
      </View>
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
  },
  frame: {
    width: '100%',
    height: FRAME_HEIGHT,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    padding: FRAME_PADDING,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
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
