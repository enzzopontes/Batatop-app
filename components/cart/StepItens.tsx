import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { MIN_ORDER_VALUE } from '../../constants/store';
import { useProdutos } from '../../app/hooks/useProdutos';

const LOGO = require('../../assets/logo.png');

interface StepItensProps {
  items: any[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  coupon: any;
  deliveryType: 'delivery' | 'retirada';
  onUpdateQty: (cartItemId: string, qty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onRemoveCoupon: () => void;
  onAddQuickItem: (product: any) => void;
  onEditItem: (item: any) => void;
}

const SUPABASE_STORAGE =
  'https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/Products/';

function resolveItemImage(url?: string | null) {
  if (!url) return 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=400';
  if (url.startsWith('http')) return url;
  return SUPABASE_STORAGE + url.replace(/^\/products\//, '');
}

export default function StepItens({
  items,
  subtotal,
  deliveryFee,
  discount,
  total,
  coupon,
  deliveryType,
  onUpdateQty,
  onRemoveItem,
  onRemoveCoupon,
  onAddQuickItem,
  onEditItem,
}: StepItensProps) {
  const router = useRouter();
  const { produtos } = useProdutos();

  // "Peça também": produtos não presentes na sacola
  const pecaTambem = useMemo(() => {
    if (!produtos || produtos.length === 0) return [];
    const itemIds = new Set(items.map((i) => String(i.id)));
    return produtos.filter((p: any) => !itemIds.has(String(p.id)) && p.disponivel !== false);
  }, [produtos, items]);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <Ionicons name="bag-handle-outline" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.emptyTitle}>Sua sacola está vazia</Text>
        <Text style={styles.emptySubtitle}>
          Que tal adicionar algumas deliciosas batatas recheadas para começar?
        </Text>
        <Pressable
          style={styles.emptyButton}
          onPress={() => router.push('/cardapio')}
          accessibilityLabel="Ver cardápio"
        >
          <Text style={styles.emptyButtonText}>Ver Cardápio</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Linha da Loja */}
      <View style={styles.storeRow}>
        <View style={styles.storeLogoCircle}>
          <Image source={LOGO} style={styles.storeLogoImg} resizeMode="contain" />
        </View>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>Batata Top</Text>
          <Pressable
            onPress={() => router.push('/cardapio')}
            hitSlop={8}
            accessibilityLabel="Adicionar mais itens ao cardápio"
          >
            <Text style={styles.addMoreLink}>Adicionar mais itens</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Aviso de pedido mínimo (só se MIN_ORDER_VALUE > 0) */}
      {MIN_ORDER_VALUE > 0 && (
        <View style={styles.minOrderWarning}>
          <Ionicons name="warning" size={16} color={COLORS.warningText} />
          <Text style={styles.minOrderText}>
            O pedido mínimo dessa loja é{' '}
            <Text style={styles.boldText}>
              R$ {MIN_ORDER_VALUE.toFixed(2).replace('.', ',')}
            </Text>{' '}
            sem contar com a taxa de entrega
          </Text>
        </View>
      )}

      {/* 3. Itens adicionados */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Itens adicionados</Text>
      </View>

      <View style={styles.itemsList}>
        {items.map((item) => {
          const itemId = item.cartItemId || item.id;
          const linePrice = item.precoNum ? (item.precoNum / 100) * item.quantity : 0;
          const extras: string[] = (item.adicionais || []).map((a: any) => a.name);

          return (
            <View key={itemId} style={styles.itemCard}>
              <View style={styles.itemImageWrapper}>
                <Image
                  source={{ uri: resolveItemImage(item.imagem) }}
                  style={styles.itemImage}
                  resizeMode="cover"
                />
                {/* Lápis de edição (stub da regra 20) */}
                <Pressable
                  style={styles.editBadge}
                  onPress={() => onEditItem(item)}
                  hitSlop={6}
                  accessibilityLabel="Editar item"
                >
                  <Ionicons name="pencil" size={10} color={COLORS.primaryText} />
                </Pressable>
              </View>

              <View style={styles.itemDetails}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.nome}
                </Text>
                {extras.length > 0 && (
                  <Text style={styles.itemExtras} numberOfLines={2}>
                    + {extras.join(', ')}
                  </Text>
                )}
                {!!item.observacoes && (
                  <Text style={styles.itemNotes} numberOfLines={2}>
                    Obs: {item.observacoes}
                  </Text>
                )}
                <Text style={styles.itemPrice}>
                  R$ {linePrice.toFixed(2).replace('.', ',')}
                </Text>
              </View>

              {/* Stepper em pílula cinza */}
              <View style={styles.stepperPill}>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => {
                    if (item.quantity === 1) {
                      onRemoveItem(itemId);
                    } else {
                      onUpdateQty(itemId, item.quantity - 1);
                    }
                  }}
                  hitSlop={6}
                  accessibilityLabel={item.quantity === 1 ? 'Remover item' : 'Diminuir quantidade'}
                >
                  <Ionicons
                    name={item.quantity === 1 ? 'trash-outline' : 'remove'}
                    size={14}
                    color={item.quantity === 1 ? COLORS.error : COLORS.text}
                  />
                </Pressable>

                <Text style={styles.stepperQty}>{item.quantity}</Text>

                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => onUpdateQty(itemId, item.quantity + 1)}
                  hitSlop={6}
                  accessibilityLabel="Aumentar quantidade"
                >
                  <Ionicons name="add" size={16} color={COLORS.primary} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {/* Botão largo cinza "Adicionar mais itens" */}
      <Pressable
        style={styles.wideAddBtn}
        onPress={() => router.push('/cardapio')}
        accessibilityLabel="Adicionar mais itens"
      >
        <Text style={styles.wideAddBtnText}>Adicionar mais itens</Text>
      </Pressable>

      {/* 4. "Peça também" */}
      {pecaTambem.length > 0 && (
        <View style={styles.pecaTambemSection}>
          <Text style={styles.sectionTitle}>Peça também</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pecaTambemScroll}
          >
            {pecaTambem.map((prod: any) => (
              <View key={prod.id} style={styles.pecaCard}>
                <View style={styles.pecaImageWrapper}>
                  <Image
                    source={{ uri: resolveItemImage(prod.imagem) }}
                    style={styles.pecaImage}
                    resizeMode="contain"
                  />
                  <Pressable
                    style={styles.quickAddBtn}
                    onPress={() => onAddQuickItem(prod)}
                    hitSlop={6}
                    accessibilityLabel={`Adicionar ${prod.nome}`}
                  >
                    <Ionicons name="add" size={18} color={COLORS.primary} />
                  </Pressable>
                </View>
                <Text style={styles.pecaPrice}>
                  {prod.precoFormatado || `R$ ${Number(prod.preco).toFixed(2).replace('.', ',')}`}
                </Text>
                <Text style={styles.pecaName} numberOfLines={2}>
                  {prod.nome}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 5. Linha de Cupom */}
      <View style={styles.couponCard}>
        <Ionicons name="ticket-outline" size={22} color={COLORS.text} />
        <View style={styles.couponInfo}>
          {coupon ? (
            <>
              <Text style={styles.couponTitle}>{coupon.code}</Text>
              <Text style={styles.couponSub}>
                {coupon.discount_type === 'percent'
                  ? `${Number(coupon.discount_value)}% de desconto`
                  : `R$ ${Number(coupon.discount_value).toFixed(2).replace('.', ',')} de desconto`}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.couponTitle}>Nenhum cupom aplicado</Text>
              <Text style={styles.couponSub}>Adicione para economizar no pedido</Text>
            </>
          )}
        </View>

        {coupon ? (
          <Pressable onPress={onRemoveCoupon} hitSlop={8} accessibilityLabel="Remover cupom">
            <Text style={styles.couponRemoveActionText}>Remover</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/cupons')}
            hitSlop={8}
            accessibilityLabel="Adicionar cupom"
          >
            <Text style={styles.couponActionText}>Adicionar</Text>
          </Pressable>
        )}
      </View>

      {/* 6. Resumo de valores */}
      <View style={styles.summarySection}>
        <Text style={styles.summaryTitle}>Resumo de valores</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total dos itens</Text>
          <Text style={styles.summaryValue}>
            R$ {subtotal.toFixed(2).replace('.', ',')}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Entrega</Text>
          <Text style={styles.summaryValue}>
            {deliveryType === 'delivery'
              ? `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`
              : 'Grátis'}
          </Text>
        </View>

        {discount > 0 && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Desconto</Text>
            <Text style={[styles.summaryValue, { color: COLORS.success }]}>
              - R$ {discount.toFixed(2).replace('.', ',')}
            </Text>
          </View>
        )}

        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>
            R$ {total.toFixed(2).replace('.', ',')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[10],
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[4],
  },
  storeLogoCircle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  storeLogoImg: {
    width: '100%',
    height: '100%',
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  addMoreLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryText,
    marginTop: 2,
  },
  minOrderWarning: {
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING[4],
  },
  minOrderText: {
    fontSize: 12,
    color: COLORS.warningText,
    flex: 1,
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: SPACING[3],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemsList: {
    gap: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  itemImageWrapper: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    position: 'relative',
    marginRight: 12,
  },
  itemImage: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.md,
  },
  editBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  itemDetails: {
    flex: 1,
    paddingRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemExtras: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 11,
    color: COLORS.secondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
  stepperPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayLight,
    borderRadius: RADIUS.full,
    paddingHorizontal: 4,
    height: 32,
  },
  stepperBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    paddingHorizontal: 8,
  },
  wideAddBtn: {
    backgroundColor: COLORS.grayLight,
    height: 44,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[4],
    marginBottom: SPACING[6],
  },
  wideAddBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pecaTambemSection: {
    marginBottom: SPACING[6],
  },
  pecaTambemScroll: {
    paddingTop: SPACING[3],
    paddingRight: SPACING[4],
    gap: 12,
  },
  pecaCard: {
    width: 125,
  },
  pecaImageWrapper: {
    width: 125,
    height: 90,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    position: 'relative',
    overflow: 'hidden',
  },
  pecaImage: {
    width: '100%',
    height: '100%',
  },
  quickAddBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  pecaPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 6,
  },
  pecaName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
    marginBottom: SPACING[5],
  },
  couponInfo: {
    flex: 1,
    marginLeft: 12,
  },
  couponTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  couponSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  couponActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  couponRemoveActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.error,
  },
  summarySection: {
    marginBottom: SPACING[6],
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: COLORS.white,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  emptyButtonText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 14,
  },
});
