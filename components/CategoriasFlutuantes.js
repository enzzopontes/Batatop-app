import { useState, useEffect, useCallback } from 'react';
import { ScrollView, Pressable, View, Text, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { handleCategoriaPress } from '../constants/categorias';
import CategoryIcon from './CategoryIcon';
import { DEFAULT_CATEGORIES } from '../hooks/useCategories';
import {
  HEADER_HYSTERESIS,
  HEADER_ANIM_DURATION,
  HEADER_REANIMATED_EASING,
  useHeaderHiddenSV,
} from '../app/_layout';

const ICON_SIZE = 48;
const PILL_HEIGHT = 32;
const ICON_OVERFLOW = Math.max(0, (ICON_SIZE - PILL_HEIGHT) / 2);

export default function CategoriasFlutuantes({
  scrollY,
  categoriasBottomY,
  headerHiddenSV: propHeaderHiddenSV,
  router,
  categories,
}) {
  const insets = useSafeAreaInsets();
  const contextHeaderHiddenSV = useHeaderHiddenSV();
  const headerHiddenSV = propHeaderHiddenSV || contextHeaderHiddenSV;

  // hiddenAnim segue a MESMA convenção do headerAnim lá no _layout.js:
  // 0 = visível, 1 = escondida.
  const hiddenAnim = useSharedValue(1);
  const visibleSV = useSharedValue(false);
  const bottomYSV = useSharedValue(categoriasBottomY ?? -1);
  const barHeightSV = useSharedValue(Math.round(insets.top + ICON_SIZE + SPACING[1] * 2 + 8));
  const [isInteractive, setIsInteractive] = useState(false);

  useEffect(() => {
    bottomYSV.value = categoriasBottomY ?? -1;
  }, [categoriasBottomY, bottomYSV]);

  const handleBarLayout = useCallback(
    (e) => {
      const h = Math.round(e.nativeEvent.layout.height);
      if (h > 0 && Math.abs(barHeightSV.value - h) >= 1) {
        barHeightSV.value = h;
      }
    },
    [barHeightSV]
  );

  useAnimatedReaction(
    () => ({
      y: scrollY ? scrollY.value : 0,
      headerHidden: headerHiddenSV ? headerHiddenSV.value : false,
      bottomY: bottomYSV.value,
    }),
    ({ y, headerHidden, bottomY }) => {
      if (bottomY < 0) return;

      const visibleNow = visibleSV.value;
      let shouldShow = visibleNow;

      if (!visibleNow) {
        // só aparece se o header já sumiu E já passamos da seção de categorias
        if (headerHidden && y > bottomY + HEADER_HYSTERESIS) {
          shouldShow = true;
        }
      } else {
        // esconde se o header voltou a aparecer OU se voltamos pra cima da seção
        if (!headerHidden || y < bottomY - HEADER_HYSTERESIS) {
          shouldShow = false;
        }
      }

      if (shouldShow !== visibleNow) {
        visibleSV.value = shouldShow;
        cancelAnimation(hiddenAnim);
        hiddenAnim.value = withTiming(shouldShow ? 0 : 1, {
          duration: HEADER_ANIM_DURATION,
          easing: HEADER_REANIMATED_EASING,
        });
        runOnJS(setIsInteractive)(shouldShow);
      }
    }
  );

  const animatedWrapStyle = useAnimatedStyle(() => {
    const slideDistance = barHeightSV.value + 16;
    const translateY = interpolate(
      hiddenAnim.value,
      [0, 1],
      [0, -slideDistance],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      hiddenAnim.value,
      [0, 1],
      [1, 0],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  if (categoriasBottomY == null) return null;

  const items =
    categories && categories.length > 0
      ? categories
      : DEFAULT_CATEGORIES.filter((c) => c.is_active && c.show_on_home_bar_app);
  const isCircleItem = (cat) => cat?.slug === 'todos' || Boolean(cat?.iconOnly);
  const sortedItems = [...items].sort(
    (a, b) => (isCircleItem(b) ? 1 : 0) - (isCircleItem(a) ? 1 : 0)
  );
  const circleIconSize = Math.round(ICON_SIZE * 0.68);
  const badgeIconSize = Math.round(ICON_SIZE * 0.82);

  return (
    <Reanimated.View
      pointerEvents={isInteractive ? 'box-none' : 'none'}
      style={[styles.wrap, animatedWrapStyle]}
      onLayout={handleBarLayout}
    >
      <SafeAreaView edges={['top']} style={{ backgroundColor: 'transparent' }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {sortedItems.map((cat) => {
            const itemKey = cat.id || cat.slug || cat.name || cat.label;
            const itemLabel = cat.name || cat.label;
            const badgeText =
              typeof cat.badge_text === 'string' && cat.badge_text.trim().length > 0
                ? cat.badge_text.trim()
                : null;

            return isCircleItem(cat) ? (
              <Pressable
                key={itemKey}
                style={[styles.circle, cat.disabled && styles.disabled]}
                disabled={cat.disabled}
                onPress={() => handleCategoriaPress(router, cat)}
              >
                <CategoryIcon category={cat} iconScale={cat.icon_scale} size={circleIconSize} />
              </Pressable>
            ) : (
              <View key={itemKey} style={styles.pillSlot}>
                <Pressable
                  style={[styles.pill, cat.disabled && styles.disabled]}
                  disabled={cat.disabled}
                  onPress={() => handleCategoriaPress(router, cat)}
                >
                  <Text style={styles.label} numberOfLines={1}>{itemLabel}</Text>
                  {badgeText ? (
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: cat.badge_color || COLORS.secondary },
                      ]}
                    >
                      <Text style={styles.badgeText} numberOfLines={1}>{badgeText}</Text>
                    </View>
                  ) : null}
                </Pressable>
                {/* ícone "flutuando" por cima da pill — tamanho 100% independente */}
                <View style={styles.iconBadge} pointerEvents="none">
                  <CategoryIcon category={cat} iconScale={cat.icon_scale} size={badgeIconSize} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 950,
    backgroundColor: COLORS.background,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[6],
    paddingVertical: SPACING[1] + ICON_OVERFLOW,
    gap: SPACING[3],
  },
  pillSlot: {
    position: 'relative',
    justifyContent: 'center',
  },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.full ?? 999,
    paddingLeft: ICON_SIZE, // espaço reservado = tamanho INTEIRO do ícone + respiro, senão sobra por cima do texto
    paddingRight: SPACING[4],
  },
  label: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 13,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: RADIUS.full ?? 999,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  iconBadge: {
    position: 'absolute',
    left: 0,
    top: -ICON_OVERFLOW,
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // sem fundo/sombra — só o desenho do ícone "flutuando", sem bolinha atrás
  },
  iconBadgeImg: {
    width: '82%',
    height: '82%',
  },
  circle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleImg: {
    width: '68%',
    height: '68%',
  },
  disabled: {
    opacity: 0.5,
  },
});
