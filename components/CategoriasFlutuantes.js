import { useRef, useEffect } from 'react';
import { Animated, ScrollView, Pressable, View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../constants/theme';
import { handleCategoriaPress } from '../constants/categorias';
import CategoryIcon from './CategoryIcon';
import { DEFAULT_CATEGORIES } from '../hooks/useCategories';
import {
  HEADER_HYSTERESIS,
  HEADER_ANIM_DURATION,
  HEADER_EASING,
} from '../app/_layout'; // ajuste esse caminho se o seu _layout.js não estiver em app/

// ─── Barra flutuante de categorias ─────────────────────────────────────────
// Aparece quando a grid de categorias da home sai da tela (mesma animação
// do header: translateY + opacity, native driver).
//
// ── Sistema de tamanho (o que você pediu) ──────────────────────────────────
// Antes o ícone morava DENTRO da pill, então aumentar o ícone forçava a pill
// (e a barra inteira) a crescer verticalmente junto.
//
// Agora são 2 números independentes:
//   ICON_SIZE   → tamanho do círculo do ícone. Pode aumentar à vontade.
//   PILL_HEIGHT → altura da "cápsula" com o texto. Sempre fica compacta.
//
// O círculo do ícone é desenhado por CIMA da pill (position: absolute),
// meio flutuando/"badge" no canto esquerdo — se ICON_SIZE > PILL_HEIGHT ele
// simplesmente passa a ultrapassar um pouquinho a pill pra cima e pra baixo,
// em vez de esticar ela. É o mesmo truque visual que apps de delivery usam
// pra deixar o ícone em destaque sem enfiar tudo dentro da cápsula de texto.
const ICON_SIZE = 48;
const PILL_HEIGHT = 32;
const ICON_OVERFLOW = Math.max(0, (ICON_SIZE - PILL_HEIGHT) / 2);

const BAR_SLIDE_DISTANCE = 70; // ~altura da própria barra — sobe/desce igual o header

export default function CategoriasFlutuantes({
  scrollY,
  categoriasBottomY,
  headerHidden,
  router,
  categories,
}) {
  // hiddenAnim segue a MESMA convenção do headerAnim lá no _layout.js:
  // 0 = visível, 1 = escondida.
  const hiddenAnim = useRef(new Animated.Value(1)).current;
  const visibleRef = useRef(false);

  // headerHidden é um boolean ESTÁVEL (só muda quando o header já terminou de
  // sumir/aparecer) — é o que evita essa barra decidir mostrar/esconder no
  // meio da transição do header e desfazer a própria animação no caminho.
  const headerHiddenRef = useRef(headerHidden);
  useEffect(() => {
    headerHiddenRef.current = headerHidden;
  }, [headerHidden]);

  const animateTo = (shouldShow) => {
    Animated.timing(hiddenAnim, {
      toValue: shouldShow ? 0 : 1,
      duration: HEADER_ANIM_DURATION,
      easing: HEADER_EASING,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (categoriasBottomY == null) return;
    const id = scrollY.addListener(({ value }) => {
      const visibleNow = visibleRef.current;
      let shouldShow = visibleNow;

      if (!visibleNow) {
        // só aparece se o header já sumiu E já passamos da seção de categorias
        if (headerHiddenRef.current && value > categoriasBottomY + HEADER_HYSTERESIS) {
          shouldShow = true;
        }
      } else {
        // esconde se o header voltou a aparecer OU se voltamos pra cima da seção
        if (!headerHiddenRef.current || value < categoriasBottomY - HEADER_HYSTERESIS) {
          shouldShow = false;
        }
      }

      if (shouldShow !== visibleNow) {
        visibleRef.current = shouldShow;
        animateTo(shouldShow);
      }
    });
    return () => scrollY.removeListener(id);
  }, [categoriasBottomY]);

  // Se o header voltar a aparecer enquanto a barra tava visível, some com ela
  // na hora — sempre pro extremo (0 ou 1), nunca fica parada num valor parcial.
  useEffect(() => {
    if (!headerHidden && visibleRef.current) {
      visibleRef.current = false;
      animateTo(false);
    }
  }, [headerHidden]);

  if (categoriasBottomY == null) return null;

  const translateY = hiddenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -BAR_SLIDE_DISTANCE],
  });

  const opacity = hiddenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const items = categories && categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const isCircleItem = (cat) => cat?.slug === 'todos' || Boolean(cat?.iconOnly);
  const sortedItems = [...items].sort(
    (a, b) => (isCircleItem(b) ? 1 : 0) - (isCircleItem(a) ? 1 : 0)
  );
  const circleIconSize = Math.round(ICON_SIZE * 0.68);
  const badgeIconSize = Math.round(ICON_SIZE * 0.82);

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { opacity, transform: [{ translateY }] }]}>
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
                <CategoryIcon category={cat} size={circleIconSize} />
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
                  <CategoryIcon category={cat} size={badgeIconSize} />
                </View>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
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
