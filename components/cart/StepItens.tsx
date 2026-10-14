import React from 'react';
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
import PecaTambemList from './PecaTambemList';
import RipplePressable from './RipplePressable';

const LOGO = require('../../assets/logo.png');
const CUPOM_ICON = require('../../assets/cuponpretobranco.png');

interface StepItensProps {
  items: any[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  coupon: any;
  deliveryType: 'delivery' | 'retirada';
  rankedProducts: any[];
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
  rankedProducts,
  onUpdateQty,
  onRemoveItem,
  onRemoveCoupon,
  onAddQuickItem,
  onEditItem,
}: StepItensProps) {
  const router = useRouter();

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
        <RipplePressable
          style={styles.emptyButton}
          onPress={() => router.push('/cardapio')}
          rippleColor="rgba(0, 0, 0, 0.2)"
          accessibilityLabel="Ver cardápio"
        >
          <Text style={styles.emptyButtonText}>Ver Cardápio</Text>
        </RipplePressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header da Loja (Item 1: logo NORMAL sem círculo cinza ao redor) */}
      <View style={styles.storeRow}>
        <Image
          source={LOGO}
          style={styles.storeLogo}
          resizeMode="contain"
        />
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>Batata Top</Text>
          <RipplePressable
            onPress={() => router.push('/cardapio')}
            hitSlop={8}
            rippleColor="rgba(227, 160, 8, 0.2)"
            accessibilityLabel="Adicionar mais itens"
          >
            <Text style={styles.addMoreLink}>Adicionar mais itens</Text>
          </RipplePressable>
        </View>
      </View>

      {/* 2. Itens adicionados */}
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
                {/* Lápis de edição com área de toque mínima 44x44 */}
                <RipplePressable
                  style={styles.editBadge}
                  onPress={() => onEditItem(item)}
                  hitSlop={10}
                  rippleColor="rgba(227, 160, 8, 0.25)"
                  accessibilityLabel="Editar item"
                >
                  <Ionicons name="pencil" size={16} color={COLORS.primary} />
                </RipplePressable>
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

              {/* Stepper quantidade */}
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

      {/* Botão largo "Adicionar mais itens" */}
      <RipplePressable
        style={styles.wideAddBtn}
        onPress={() => router.push('/cardapio')}
        rippleColor="rgba(0, 0, 0, 0.08)"
        accessibilityLabel="Adicionar mais itens"
      >
        <Text style={styles.wideAddBtnText}>Adicionar mais itens</Text>
      </RipplePressable>

      {/* 3. Peça também */}
      <PecaTambemList
        items={items}
        rankedProducts={rankedProducts}
        onAddQuickItem={onAddQuickItem}
      />

      {/* 4. Bloco de Cupom (Item 3: ícone aumentado em preto e branco, texto sem 'loja') */}
      <View style={styles.couponCard}>
        <Image source={CUPOM_ICON} style={styles.couponIconImg} resizeMode="contain" />
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
              <Text style={styles.couponSub}>1 disponível</Text>
            </>
          )}
        </View>

        {coupon ? (
          <RipplePressable
            onPress={onRemoveCoupon}
            hitSlop={10}
            rippleColor="rgba(220, 38, 38, 0.15)"
            accessibilityLabel="Remover cupom"
          >
            <Text style={styles.couponRemoveActionText}>Remover</Text>
          </RipplePressable>
        ) : (
          <RipplePressable
            onPress={() => router.push('/cupons')}
            hitSlop={10}
            rippleColor="rgba(227, 160, 8, 0.2)"
            accessibilityLabel="Adicionar cupom"
          >
            <Text style={styles.couponActionText}>Adicionar</Text>
          </RipplePressable>
        )}
      </View>

      {/* 5. Resumo de valores */}
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
              ? deliveryFee > 0
                ? `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`
                : 'Grátis'
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
  },
  emptyIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[4],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[2],
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING[6],
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[6],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  emptyButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[4],
    gap: 12,
  },
  storeLogo: {
    width: 48,
    height: 48,
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  addMoreLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
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
    gap: SPACING[3],
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[2],
  },
  itemImageWrapper: {
    position: 'relative',
    marginRight: SPACING[3],
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
  },
  editBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  itemDetails: {
    flex: 1,
    paddingRight: SPACING[2],
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 18,
  },
  itemExtras: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 12,
    color: COLORS.textMuted,
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
    backgroundColor: '#F4F4F5',
    borderRadius: RADIUS.md,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 8,
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
    minWidth: 16,
    textAlign: 'center',
  },
  wideAddBtn: {
    backgroundColor: '#F4F4F5',
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[3],
    marginBottom: SPACING[5],
    overflow: 'hidden',
  },
  wideAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: SPACING[3],
    marginTop: SPACING[2],
    marginBottom: SPACING[4],
  },
  couponIconImg: {
    width: 32,
    height: 32,
    marginRight: SPACING[3],
  },
  couponInfo: {
    flex: 1,
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
    fontWeight: '700',
    color: COLORS.primary,
  },
  couponRemoveActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.error,
  },
  summarySection: {
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    paddingTop: SPACING[4],
    marginBottom: SPACING[6],
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[2],
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  totalRow: {
    marginTop: SPACING[2],
    paddingTop: SPACING[2],
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
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
});
