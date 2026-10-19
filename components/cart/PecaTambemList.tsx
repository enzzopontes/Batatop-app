import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import RipplePressable from './RipplePressable';

const CARD_WIDTH = 114;
const CARD_MARGIN = 10;
const ITEM_TOTAL_WIDTH = CARD_WIDTH + CARD_MARGIN;

const SUPABASE_STORAGE =
  'https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/Products/';

function resolveItemImage(url?: string | null): string {
  if (!url) return 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=200';
  if (url.startsWith('http')) return url;
  return SUPABASE_STORAGE + url.replace(/^\/products\//, '');
}

interface QuickCardProps {
  item: any;
  onAdd: (product: any) => void;
}

// Card memoizado para garantir 60fps sem re-render desnecessário
const QuickProductCard = memo(function QuickProductCard({ item, onAdd }: QuickCardProps) {
  const handlePress = useCallback(() => {
    onAdd(item);
  }, [item, onAdd]);

  const priceText = item.precoFormatado || `R$ ${Number(item.preco || 0).toFixed(2).replace('.', ',')}`;

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        <View style={styles.imageWrapper}>
          <ExpoImage
            source={{ uri: resolveItemImage(item.imagem) }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={100}
          />
        </View>
        <RipplePressable
          style={styles.quickAddBtn}
          onPress={handlePress}
          hitSlop={10}
          rippleColor="rgba(0, 0, 0, 0.15)"
          accessibilityLabel={`Adicionar ${item.nome}`}
        >
          <Ionicons name="add" size={18} color={COLORS.primary} />
        </RipplePressable>
      </View>
      <Text style={styles.price} numberOfLines={1}>
        {priceText}
      </Text>
      <Text style={styles.name} numberOfLines={2}>
        {item.nome}
      </Text>
    </View>
  );
});

interface PecaTambemListProps {
  items: any[];
  rankedProducts: any[];
  onAddQuickItem: (product: any) => void;
}

function isBatata(p: any): boolean {
  const cat = (p.categoria || '').toLowerCase();
  const name = (p.nome || '').toLowerCase();
  return cat.includes('batata') || name.includes('batata');
}

function isBebida(p: any): boolean {
  const cat = (p.categoria || '').toLowerCase();
  const name = (p.nome || '').toLowerCase();
  return (
    cat.includes('bebida') ||
    cat.includes('refrigerante') ||
    cat.includes('suco') ||
    name.includes('coca') ||
    name.includes('guaraná') ||
    name.includes('suco') ||
    name.includes('água') ||
    name.includes('fanta') ||
    name.includes('sprite')
  );
}

function isExtraOuSobremesa(p: any): boolean {
  const cat = (p.categoria || '').toLowerCase();
  const name = (p.nome || '').toLowerCase();
  return (
    cat.includes('sobremesa') ||
    cat.includes('doce') ||
    cat.includes('extra') ||
    cat.includes('molho') ||
    cat.includes('adicional') ||
    name.includes('pudim') ||
    name.includes('brownie') ||
    name.includes('molho')
  );
}

export default function PecaTambemList({
  items,
  rankedProducts,
  onAddQuickItem,
}: PecaTambemListProps) {
  // Itens atualmente no carrinho não aparecem
  const cartIds = useMemo(() => new Set(items.map((i) => String(i.id))), [items]);

  // Produtos disponíveis não presentes no carrinho ordenados pelo ranking real
  const availableRanked = useMemo(() => {
    if (!rankedProducts || rankedProducts.length === 0) return [];
    return rankedProducts.filter((p) => !cartIds.has(String(p.id)) && p.disponivel !== false);
  }, [rankedProducts, cartIds]);

  // Identifica categorias do carrinho
  const { hasBatata, hasBebida } = useMemo(() => {
    let b = false;
    let d = false;
    for (const item of items) {
      if (isBatata(item)) b = true;
      if (isBebida(item)) d = true;
    }
    return { hasBatata: b, hasBebida: d };
  }, [items]);

  // Lógica de recomendação complementar:
  // - Só batata: sugerir BEBIDAS + bloco menor de "batatas mais pedidas"
  // - Só bebida: sugerir BATATAS
  // - Ambos: sugerir extras / sobremesas (ou top restantes)
  const { primaryTitle, primaryList, secondaryTitle, secondaryList } = useMemo(() => {
    if (availableRanked.length === 0) {
      return { primaryTitle: '', primaryList: [], secondaryTitle: '', secondaryList: [] };
    }

    if (hasBatata && !hasBebida) {
      const bebidas = availableRanked.filter(isBebida);
      const batatas = availableRanked.filter(isBatata);
      return {
        primaryTitle: 'Peça também uma bebida gelada',
        primaryList: bebidas.length > 0 ? bebidas : availableRanked.slice(0, 8),
        secondaryTitle: batatas.length > 0 ? 'Batatas mais pedidas' : '',
        secondaryList: batatas.slice(0, 6),
      };
    }

    if (hasBebida && !hasBatata) {
      const batatas = availableRanked.filter(isBatata);
      return {
        primaryTitle: 'Peça também uma batata recheada',
        primaryList: batatas.length > 0 ? batatas : availableRanked.slice(0, 8),
        secondaryTitle: '',
        secondaryList: [],
      };
    }

    if (hasBatata && hasBebida) {
      const extras = availableRanked.filter(isExtraOuSobremesa);
      const others = availableRanked.filter((p) => !isBatata(p) && !isBebida(p));
      const combined = extras.length > 0 ? extras : (others.length > 0 ? others : availableRanked);
      return {
        primaryTitle: 'Peça também para complementar',
        primaryList: combined.slice(0, 8),
        secondaryTitle: '',
        secondaryList: [],
      };
    }

    return {
      primaryTitle: 'Peça também',
      primaryList: availableRanked.slice(0, 8),
      secondaryTitle: '',
      secondaryList: [],
    };
  }, [availableRanked, hasBatata, hasBebida]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => <QuickProductCard item={item} onAdd={onAddQuickItem} />,
    [onAddQuickItem]
  );

  const keyExtractor = useCallback((item: any) => String(item.id), []);

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ITEM_TOTAL_WIDTH,
      offset: ITEM_TOTAL_WIDTH * index,
      index,
    }),
    []
  );

  if (primaryList.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{primaryTitle}</Text>
      <FlatList
        data={primaryList}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews
        getItemLayout={getItemLayout}
        snapToInterval={ITEM_TOTAL_WIDTH}
        decelerationRate="fast"
      />

      {secondaryList.length > 0 && (
        <View style={styles.secondarySection}>
          <Text style={styles.secondaryTitle}>{secondaryTitle}</Text>
          <FlatList
            data={secondaryList}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={3}
            removeClippedSubviews
            getItemLayout={getItemLayout}
            snapToInterval={ITEM_TOTAL_WIDTH}
            decelerationRate="fast"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING[3],
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[2],
  },
  listContent: {
    paddingRight: SPACING[4],
    paddingVertical: 4,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: CARD_MARGIN,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
  },
  imageContainer: {
    width: '100%',
    height: 72,
    marginBottom: 6,
    position: 'relative',
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  quickAddBtn: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  price: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 2,
  },
  name: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 14,
    height: 28,
  },
  secondarySection: {
    marginTop: SPACING[3],
  },
  secondaryTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING[2],
  },
});
