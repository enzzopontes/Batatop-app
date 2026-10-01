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
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../constants/theme';
import { MIN_ORDER_VALUE } from '../../constants/store';
import { PaymentMethod } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
import PecaTambemList from './PecaTambemList';
import RipplePressable from './RipplePressable';

const LOGO = require('../../assets/logo.png');
const CUPOM_ICON = require('../../assets/cuponpretobranco.png');
const LOGO_ESTENDIDA = require('../../assets/batatatopestendida.png');

interface StepItensProps {
  items: any[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  coupon: any;
  deliveryType: 'delivery' | 'retirada';
  paymentMethod: PaymentMethod;
  selectedSavedCard: SavedCard | null;
  wantsCutlery: boolean | null;
  setWantsCutlery: (val: boolean) => void;
  rankedProducts: any[];
  onUpdateQty: (cartItemId: string, qty: number) => void;
  onRemoveItem: (cartItemId: string) => void;
  onRemoveCoupon: () => void;
  onAddQuickItem: (product: any) => void;
  onEditItem: (item: any) => void;
  onOpenPaymentSelector: () => void;
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
  paymentMethod,
  selectedSavedCard,
  wantsCutlery,
  setWantsCutlery,
  rankedProducts,
  onUpdateQty,
  onRemoveItem,
  onRemoveCoupon,
  onAddQuickItem,
  onEditItem,
  onOpenPaymentSelector,
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

  // Label do método de pagamento para o bloco da imagem 2
  const getPaymentMethodLabel = () => {
    if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
      if (selectedSavedCard) {
        const brand = (selectedSavedCard.payment_method_id || 'Cartão').toUpperCase();
        return `${brand} •••• ${selectedSavedCard.last_four}`;
      }
      return paymentMethod === 'cartão de crédito' ? 'Cartão de Crédito' : 'Cartão de Débito';
    }
    if (paymentMethod === 'pix') return 'Pix';
    if (paymentMethod === 'dinheiro') return 'Dinheiro';
    if (paymentMethod === 'cartão de crédito (entrega)') return 'Cartão de Crédito (na entrega)';
    if (paymentMethod === 'cartão de débito (entrega)') return 'Cartão de Débito (na entrega)';
    return 'Selecione uma forma';
  };

  const getPaymentHeader = () => {
    if (
      paymentMethod === 'dinheiro' ||
      paymentMethod === 'cartão de crédito (entrega)' ||
      paymentMethod === 'cartão de débito (entrega)'
    ) {
      return 'Pagamento na entrega';
    }
    return 'Pagamento pelo app';
  };

  const formattedTotal = `R$ ${total.toFixed(2).replace('.', ',')}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Header da Loja (proporcional à Imagem 2: logo e nome maiores) */}
      <View style={styles.storeRow}>
        <View style={styles.storeLogoCircle}>
          <Image source={LOGO} style={styles.storeLogoImg} resizeMode="contain" />
        </View>
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

      {/* 2. Bloco de Pagamento no Cart (idêntico à Imagem 2) */}
      <View style={styles.paymentSectionWrap}>
        <Text style={styles.paymentSectionTitle}>{getPaymentHeader()}</Text>
        <RipplePressable
          style={styles.paymentBox}
          onPress={onOpenPaymentSelector}
          rippleColor="rgba(0, 0, 0, 0.08)"
          accessibilityLabel="Selecionar forma de pagamento"
        >
          {/* Logo do header do card */}
          <View style={styles.paymentBoxHeader}>
            <Image
              source={LOGO_ESTENDIDA}
              style={styles.paymentBoxLogo}
              resizeMode="contain"
            />
          </View>

          {/* Linha 1: Método selecionado + chevron */}
          <View style={styles.paymentMethodRow}>
            <View style={styles.paymentMethodLeft}>
              <Ionicons
                name={
                  paymentMethod === 'pix'
                    ? 'qr-code-outline'
                    : paymentMethod === 'dinheiro'
                    ? 'cash-outline'
                    : 'card'
                }
                size={20}
                color={COLORS.text}
              />
              <Text style={styles.paymentMethodText} numberOfLines={1}>
                {getPaymentMethodLabel()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#71717A" />
          </View>

          <View style={styles.paymentDivider} />

          {/* Linha 2: Parcelas "1x de R$ XX,XX" + chevron */}
          <View style={styles.paymentInstallmentRow}>
            <Text style={styles.paymentInstallmentText}>
              1x de {formattedTotal}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#71717A" />
          </View>
        </RipplePressable>
      </View>

      {/* 3. Bloco de Cupom (idêntico à Imagem 2 com cuponpretobranco.png) */}
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
              <Text style={styles.couponSub}>2 pra usar nesta loja</Text>
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

      {/* 4. Aviso de pedido mínimo (se aplicável) */}
      {MIN_ORDER_VALUE > 0 && subtotal < MIN_ORDER_VALUE && (
        <View style={styles.minOrderWarning}>
          <Ionicons name="warning" size={16} color={COLORS.primary} />
          <Text style={styles.minOrderText}>
            O pedido mínimo dessa loja é{' '}
            <Text style={styles.boldText}>
              R$ {MIN_ORDER_VALUE.toFixed(2).replace('.', ',')}
            </Text>{' '}
            sem contar com a taxa de entrega
          </Text>
        </View>
      )}

      {/* 5. Itens adicionados */}
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
                {/* Lápis de edição com área de toque mínima 44x44 e ícone maior */}
                <RipplePressable
                  style={styles.editBadge}
                  onPress={() => onEditItem(item)}
                  hitSlop={10}
                  rippleColor="rgba(227, 160, 8, 0.25)"
                  accessibilityLabel="Editar item"
                >
                  <Ionicons name="pencil" size={18} color={COLORS.primary} />
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

              {/* Stepper */}
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
      <RipplePressable
        style={styles.wideAddBtn}
        onPress={() => router.push('/cardapio')}
        rippleColor="rgba(0, 0, 0, 0.08)"
        accessibilityLabel="Adicionar mais itens"
      >
        <Text style={styles.wideAddBtnText}>Adicionar mais itens</Text>
      </RipplePressable>

      {/* 6. Linha Talheres (OBRIGATÓRIO) */}
      <View style={styles.cutleryCard}>
        <View style={styles.cutleryIconCircle}>
          <Ionicons name="restaurant-outline" size={20} color="#18181B" />
        </View>
        <View style={styles.cutleryInfo}>
          <Text style={styles.cutleryTitle}>Precisa de talher?</Text>
          <Text style={[styles.cutlerySub, wantsCutlery === null && styles.cutlerySubRequired]}>
            {wantsCutlery === null
              ? 'Resposta obrigatória'
              : wantsCutlery
              ? 'Sim, enviar descartáveis'
              : 'Não preciso de talheres'}
          </Text>
        </View>
        <View style={styles.cutleryButtons}>
          <RipplePressable
            style={[styles.cutleryBtn, wantsCutlery === false && styles.cutleryBtnActive]}
            onPress={() => setWantsCutlery(false)}
            rippleColor="rgba(0, 0, 0, 0.12)"
          >
            <Text style={[styles.cutleryBtnText, wantsCutlery === false && styles.cutleryBtnTextActive]}>
              Não
            </Text>
          </RipplePressable>

          <RipplePressable
            style={[styles.cutleryBtn, wantsCutlery === true && styles.cutleryBtnActive]}
            onPress={() => setWantsCutlery(true)}
            rippleColor="rgba(0, 0, 0, 0.12)"
          >
            <Text style={[styles.cutleryBtnText, wantsCutlery === true && styles.cutleryBtnTextActive]}>
              Sim
            </Text>
          </RipplePressable>
        </View>
      </View>

      {/* 7. "Peça também" (Upsell Inteligente + Ranking Real a 60fps) */}
      <PecaTambemList
        items={items}
        rankedProducts={rankedProducts}
        onAddQuickItem={onAddQuickItem}
      />

      {/* 7. Resumo de valores */}
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
    marginBottom: SPACING[6],
    lineHeight: 20,
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[6],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  // Store header proporcional à Imagem 2
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[4],
  },
  storeLogoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.backgroundElevated,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  storeLogoImg: {
    width: 44,
    height: 44,
  },
  storeInfo: {
    marginLeft: SPACING[3],
    flex: 1,
  },
  storeName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  addMoreLink: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  // Bloco de Pagamento no Cart
  paymentSectionWrap: {
    marginBottom: SPACING[4],
  },
  paymentSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[2],
  },
  paymentBox: {
    backgroundColor: '#FAFAFA',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#ECE7E0',
    padding: SPACING[3],
  },
  paymentBoxHeader: {
    marginBottom: SPACING[2],
  },
  paymentBoxLogo: {
    width: 110,
    height: 22,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    flex: 1,
  },
  paymentMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  paymentDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E4E7',
    marginVertical: 4,
  },
  paymentInstallmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  paymentInstallmentText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  // Bloco de cupom
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[3],
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING[4],
  },
  couponIconImg: {
    width: 24,
    height: 24,
  },
  couponInfo: {
    marginLeft: SPACING[3],
    flex: 1,
  },
  couponTitle: {
    fontSize: 14,
    fontWeight: '600',
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
  minOrderWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    gap: SPACING[2],
    marginBottom: SPACING[4],
  },
  minOrderText: {
    flex: 1,
    fontSize: 12,
    color: '#8A6100',
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: SPACING[2],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemsList: {
    gap: SPACING[3],
    marginBottom: SPACING[3],
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3],
  },
  itemImageWrapper: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.backgroundElevated,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  // Lápis de edição com área de toque mínima 44x44
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: SPACING[3],
    marginRight: SPACING[2],
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  itemExtras: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 11,
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
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginHorizontal: 8,
  },
  wideAddBtn: {
    backgroundColor: '#F4F4F5',
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[4],
  },
  wideAddBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  // Linha de talheres no carrinho
  cutleryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[3],
    marginBottom: SPACING[4],
  },
  cutleryIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutleryInfo: {
    flex: 1,
    marginLeft: SPACING[3],
    marginRight: SPACING[2],
  },
  cutleryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  cutlerySub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cutlerySubRequired: {
    color: COLORS.error,
    fontWeight: '700',
  },
  cutleryButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  cutleryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: COLORS.white,
  },
  cutleryBtnActive: {
    borderColor: COLORS.text,
    backgroundColor: COLORS.text,
  },
  cutleryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  cutleryBtnTextActive: {
    color: COLORS.white,
  },
  summarySection: {
    marginTop: SPACING[2],
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING[3],
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
    marginBottom: SPACING[2],
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '500',
  },
  totalRow: {
    marginTop: SPACING[2],
    paddingTop: SPACING[2],
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
});
