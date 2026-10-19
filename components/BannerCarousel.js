import { useRef, useEffect, useState, useCallback } from 'react';
import { View, FlatList, Image, StyleSheet, Dimensions } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Banner mais estreito que a tela (deixa a borda do anterior/próximo
// espiando dos dois lados).
const ITEM_WIDTH = SCREEN_WIDTH * 0.72;
const ITEM_SPACING = SPACING[3];
const SIDE_PADDING = (SCREEN_WIDTH - ITEM_WIDTH) / 2;
const SNAP_INTERVAL = ITEM_WIDTH + ITEM_SPACING;
const FRAME_PADDING = SPACING[2];
const INNER_WIDTH = ITEM_WIDTH - FRAME_PADDING * 2;
const AUTOPLAY_INTERVAL = 10000;
// Teto de segurança: se algum dos 6 PNGs vier com proporção muito vertical
// (fora do padrão banner), evita um card gigante — sem isso o cálculo por
// proporção real fica sem limite nenhum.
const MAX_BANNER_HEIGHT = 260;

const BANNER_IMAGES = [
  require('../assets/banners/banner1.png'),
  require('../assets/banners/banner2.png'),
  require('../assets/banners/banner3.png'),
  require('../assets/banners/banner4.png'),
  require('../assets/banners/banner5.png'),
  require('../assets/banners/banner6.png'),
];

// Os banners são assets locais (bundled), então dá pra ler a resolução
// real de cada um sem carregar nada — Image.resolveAssetSource() devolve
// {width, height} na hora, de forma síncrona. É isso que permite calcular
// a altura exata de cada banner (zero sobra em cima/embaixo, zero corte),
// já que os 6 têm proporções diferentes entre si e uma altura fixa única
// nunca ia caber perfeito em todos ao mesmo tempo.
const BANNERS = BANNER_IMAGES.map((source) => {
  const { width, height } = Image.resolveAssetSource(source);
  return {
    source,
    height: Math.min(INNER_WIDTH / (width / height), MAX_BANNER_HEIGHT),
  };
});

// Altura do card é FIXA — igual à do banner mais alto entre os 6. Os
// menores (ex: banner5/6) só ficam centralizados dentro dela, sem esticar
// e sem cortar. Isso garante que o carrossel nunca "pula"/redimensiona ao
// trocar de banner — só a imagem interna muda de tamanho, o card não.
const FRAME_HEIGHT =
  Math.max(...BANNERS.map((b) => b.height)) + FRAME_PADDING * 2;

export default function BannerCarousel() {
  const flatListRef = useRef(null);
  const intervalRef = useRef(null);
  const indexRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const clearAutoplay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    clearAutoplay();
    intervalRef.current = setInterval(() => {
      const nextIndex = (indexRef.current + 1) % BANNERS.length;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * SNAP_INTERVAL,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [clearAutoplay]);

  // Monta o timer ao montar o componente e garante que ele é limpo no
  // unmount — sem isso o interval vaza entre navegações (mesma classe de
  // bug já vista no header do cardápio com Animated.Value não resetado).
  useEffect(() => {
    startAutoplay();
    return () => clearAutoplay();
  }, [startAutoplay, clearAutoplay]);

  const goToIndex = (newIndex) => {
    indexRef.current = newIndex;
    setActiveIndex(newIndex);
    // Reseta o timer do autoplay a cada troca de banner, seja ela manual
    // (swipe) ou automática.
    startAutoplay();
  };

  const handleScrollBeginDrag = () => {
    // Usuário assumiu o controle — o autoplay não pode competir com o
    // gesto nem "puxar" o banner de volta no meio do swipe.
    clearAutoplay();
  };

  const handleMomentumScrollEnd = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / SNAP_INTERVAL);
    goToIndex(newIndex);
  };

  return (
    <View style={s.wrapper}>
      <View style={{ height: FRAME_HEIGHT, overflow: 'hidden' }}>
        <FlatList
          ref={flatListRef}
          data={BANNERS}
          keyExtractor={(_, i) => `banner-${i}`}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={SNAP_INTERVAL}
          snapToAlignment="start"
          contentContainerStyle={{ paddingHorizontal: SIDE_PADDING }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          renderItem={({ item }) => (
            <View style={s.slide}>
              <View style={s.frame}>
                {/* Fundo: a mesma imagem, borrada e esticada pra preencher
                    o card inteiro — some com a sobra vertical dos banners
                    mais baixos (5 e 6) sem esticar/cortar o banner real. */}
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
              </View>
            </View>
          )}
        />
      </View>

      <View style={s.dotsRow}>
        {BANNERS.map((_, i) => (
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
