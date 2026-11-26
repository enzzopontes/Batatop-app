import { useRef, useState, useEffect, useCallback } from 'react';
import { View, FlatList, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import HomeCouponCard from './HomeCouponCard';

const ITEM_SPACING = 12;
const AUTOPLAY_INTERVAL = 5000;

function CouponSeparator() {
  return <View style={{ width: ITEM_SPACING }} />;
}

export default function HomeCouponCarousel({ coupons, onCardPress }) {
  const { width: windowWidth } = useWindowDimensions();
  const total = Array.isArray(coupons) ? coupons.length : 0;

  // 1 card centralizado em foco por vez, espelhando o BannerCarousel
  const cardWidth =
    total === 1
      ? Math.max(240, windowWidth - SPACING[6] * 2)
      : Math.round(windowWidth * 0.86);
  const sidePadding = Math.round((windowWidth - cardWidth) / 2);
  const snapInterval = cardWidth + ITEM_SPACING;

  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (total === 0) {
      indexRef.current = 0;
      setActiveIndex(0);
      return;
    }
    if (indexRef.current >= total) {
      const clamped = total - 1;
      indexRef.current = clamped;
      setActiveIndex(clamped);
      flatListRef.current?.scrollToOffset({
        offset: clamped * snapInterval,
        animated: false,
      });
    }
  }, [total, snapInterval]);

  const stopAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const scrollToIndex = useCallback(
    (targetIdx) => {
      if (total <= 0) return;
      const bounded = ((targetIdx % total) + total) % total;
      indexRef.current = bounded;
      setActiveIndex(bounded);
      flatListRef.current?.scrollToOffset({
        offset: bounded * snapInterval,
        animated: true,
      });
    },
    [total, snapInterval]
  );

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (total <= 1) return;
    intervalRef.current = setInterval(() => {
      const nextIdx = (indexRef.current + 1) % total;
      indexRef.current = nextIdx;
      setActiveIndex(nextIdx);
      flatListRef.current?.scrollToOffset({
        offset: nextIdx * snapInterval,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [stopAutoplay, total, snapInterval]);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  const syncIndexFromOffset = useCallback(
    (offsetX) => {
      if (total <= 0) return;
      const rawIdx = Math.round(offsetX / snapInterval);
      const clamped = Math.max(0, Math.min(total - 1, rawIdx));
      indexRef.current = clamped;
      setActiveIndex(clamped);
      startAutoplay();
    },
    [total, snapInterval, startAutoplay]
  );

  const handleScrollBeginDrag = useCallback(() => {
    stopAutoplay();
  }, [stopAutoplay]);

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

  if (total === 0) return null;

  return (
    <View style={s.wrapper}>
      <FlatList
        ref={flatListRef}
        data={coupons}
        keyExtractor={(item, idx) => String(item.id || item.codigo || idx)}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={snapInterval}
        snapToAlignment="start"
        ItemSeparatorComponent={CouponSeparator}
        contentContainerStyle={{
          paddingHorizontal: sidePadding,
          paddingVertical: 4,
          alignItems: 'stretch',
        }}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEndDrag}
        renderItem={({ item }) => (
          <HomeCouponCard
            coupon={item}
            width={cardWidth}
            onCardPress={onCardPress}
          />
        )}
      />

      {total > 1 ? (
        <View style={s.dotsRow}>
          {coupons.map((c, idx) => (
            <Pressable
              key={`coupon-dot-${c.id || c.codigo || idx}`}
              onPress={() => {
                stopAutoplay();
                scrollToIndex(idx);
                startAutoplay();
              }}
              hitSlop={6}
              style={[s.dot, idx === activeIndex && s.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    gap: SPACING[3],
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    height: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
});
