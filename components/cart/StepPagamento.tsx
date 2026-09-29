import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { PaymentMethod, DeliveryType } from './useCheckoutFlow';
import { SavedCard, formatCardDisplay } from '../../utils/usePaymentCards';

interface StepPagamentoProps {
  paymentMethod: PaymentMethod;
  selectedSavedCard: SavedCard | null;
  savedCardCvv: string;
  setSavedCardCvv: (val: string) => void;
  useManualCardForm: boolean;
  setUseManualCardForm: (val: boolean) => void;
  cardName: string;
  setCardName: (val: string) => void;
  cardNumber: string;
  setCardNumber: (val: string) => void;
  cardExpiry: string;
  setCardExpiry: (val: string) => void;
  cardCvv: string;
  setCardCvv: (val: string) => void;
  cardCpf: string;
  setCardCpf: (val: string) => void;
  wantsCutlery: boolean | null;
  setWantsCutlery: (val: boolean) => void;
  cashChange: string;
  setCashChange: (val: string) => void;
  orderNotes: string;
  setOrderNotes: (val: string) => void;
  name: string;
  setName: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  coupon: any;
  deliveryType: DeliveryType;
  onRemoveCoupon: () => void;
  onOpenPaymentSelector: () => void;
}

function formatCardNumberInput(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 16);
  return d.match(/.{1,4}/g)?.join(' ') || d;
}

function formatExpiryInput(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

function formatCpfInput(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function StepPagamento({
  paymentMethod,
  selectedSavedCard,
  savedCardCvv,
  setSavedCardCvv,
  useManualCardForm,
  setUseManualCardForm,
  cardName,
  setCardName,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  cardCvv,
  setCardCvv,
  cardCpf,
  setCardCpf,
  wantsCutlery,
  setWantsCutlery,
  cashChange,
  setCashChange,
  orderNotes,
  setOrderNotes,
  name,
  setName,
  phone,
  setPhone,
  subtotal,
  deliveryFee,
  discount,
  total,
  coupon,
  deliveryType,
  onRemoveCoupon,
  onOpenPaymentSelector,
}: StepPagamentoProps) {
  const router = useRouter();

  const isOnlinePayment =
    paymentMethod === 'pix' ||
    paymentMethod === 'cartão de crédito' ||
    paymentMethod === 'cartão de débito';

  const isCard = paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito';

  // Label amigável do método selecionado
  let paymentDisplayLabel = 'Pix';
  let paymentIcon: keyof typeof Ionicons.glyphMap = 'qr-code';

  if (isCard) {
    paymentIcon = 'card';
    paymentDisplayLabel = selectedSavedCard
      ? formatCardDisplay(selectedSavedCard)
      : paymentMethod === 'cartão de crédito'
      ? 'Cartão de crédito'
      : 'Cartão de débito';
  } else if (paymentMethod === 'dinheiro') {
    paymentIcon = 'cash-outline';
    paymentDisplayLabel = 'Dinheiro';
  } else if (
    paymentMethod === 'cartão de crédito (entrega)' ||
    paymentMethod === 'cartão de débito (entrega)'
  ) {
    paymentIcon = 'card-outline';
    paymentDisplayLabel =
      paymentMethod === 'cartão de crédito (entrega)'
        ? 'Cartão de crédito (entrega)'
        : 'Cartão de débito (entrega)';
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* 1. Loja no topo */}
      <View style={styles.storeRow}>
        <View style={styles.storeLogoCircle}>
          <Ionicons name="restaurant" size={20} color={COLORS.primary} />
        </View>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>Batata Top - Iacanga</Text>
          <Pressable
            onPress={() => router.push('/cardapio')}
            hitSlop={8}
            accessibilityLabel="Adicionar mais itens"
          >
            <Text style={styles.addMoreLink}>Adicionar mais itens</Text>
          </Pressable>
        </View>
      </View>

      {/* 2. Título da Seção */}
      <Text style={styles.sectionTitle}>
        {isOnlinePayment ? 'Pagamento pelo app' : 'Pagamento na entrega'}
      </Text>

      {/* 3. Card cinza do método de pagamento selecionado */}
      <Pressable
        style={styles.paymentSelectCard}
        onPress={onOpenPaymentSelector}
        accessibilityLabel="Mudar forma de pagamento"
      >
        <View style={styles.paymentCardRow}>
          <View style={styles.paymentCardLeft}>
            <View style={styles.paymentIconWrap}>
              <Ionicons name={paymentIcon} size={20} color={COLORS.text} />
            </View>
            <Text style={styles.paymentLabelText}>{paymentDisplayLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>

        {isCard && (
          <View style={styles.installmentsRow}>
            <Text style={styles.installmentsText}>
              1x de R$ {total.toFixed(2).replace('.', ',')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
          </View>
        )}
      </Pressable>

      {/* 4. Campos extras */}

      {/* CVV se for cartão salvo */}
      {isCard && selectedSavedCard && !useManualCardForm && (
        <View style={styles.extraFieldCard}>
          <Text style={styles.extraFieldTitle}>Código de segurança (CVV)</Text>
          <TextInput
            value={savedCardCvv}
            onChangeText={(t) => setSavedCardCvv(t.replace(/\D/g, '').slice(0, 4))}
            placeholder="CVV (3 ou 4 dígitos)"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
            style={styles.cardInput}
          />
          <Pressable
            onPress={() => setUseManualCardForm(true)}
            style={styles.inlineActionBtn}
            hitSlop={6}
          >
            <Text style={styles.inlineActionText}>Digitar outro cartão</Text>
          </Pressable>
        </View>
      )}

      {/* Formulário manual de cartão */}
      {isCard && useManualCardForm && (
        <View style={styles.extraFieldCard}>
          <View style={styles.cardFormHeader}>
            <Text style={styles.extraFieldTitle}>Dados do Cartão</Text>
            {selectedSavedCard && (
              <Pressable
                onPress={() => setUseManualCardForm(false)}
                hitSlop={6}
              >
                <Text style={styles.inlineActionText}>Usar cartão salvo</Text>
              </Pressable>
            )}
          </View>

          <TextInput
            value={cardName}
            onChangeText={setCardName}
            placeholder="Nome impresso no cartão"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
            style={styles.cardInput}
          />

          <TextInput
            value={cardNumber}
            onChangeText={(t) => setCardNumber(formatCardNumberInput(t))}
            placeholder="Número do cartão"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={19}
            style={styles.cardInput}
          />

          <View style={styles.twoInputsRow}>
            <TextInput
              value={cardExpiry}
              onChangeText={(t) => setCardExpiry(formatExpiryInput(t))}
              placeholder="MM/AA"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              maxLength={5}
              style={[styles.cardInput, styles.halfInput]}
            />
            <TextInput
              value={cardCvv}
              onChangeText={(t) => setCardCvv(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="CVV"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              maxLength={4}
              secureTextEntry
              style={[styles.cardInput, styles.halfInput]}
            />
          </View>

          <TextInput
            value={cardCpf}
            onChangeText={(t) => setCardCpf(formatCpfInput(t))}
            placeholder="CPF do titular"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={14}
            style={styles.cardInput}
          />
        </View>
      )}

      {/* Troco para dinheiro */}
      {paymentMethod === 'dinheiro' && (
        <View style={styles.extraFieldCard}>
          <Text style={styles.extraFieldTitle}>Precisa de troco?</Text>
          <TextInput
            value={cashChange}
            onChangeText={(t) => setCashChange(t.replace(/\D/g, ''))}
            placeholder="Troco para quanto? (Ex: 50, 100)"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            style={styles.cardInput}
          />
        </View>
      )}

      {/* Talheres (Obrigatório) */}
      <View style={styles.extraFieldCard}>
        <View style={styles.cutleryHeaderRow}>
          <Text style={styles.extraFieldTitle}>Precisa de talheres?</Text>
          <View style={styles.cutleryPillsRow}>
            <Pressable
              style={[
                styles.cutleryPill,
                wantsCutlery === true && styles.cutleryPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setWantsCutlery(true);
              }}
              accessibilityLabel="Sim, quero talheres"
            >
              <Text
                style={[
                  styles.cutleryPillText,
                  wantsCutlery === true && styles.cutleryPillTextActive,
                ]}
              >
                Sim
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.cutleryPill,
                wantsCutlery === false && styles.cutleryPillActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setWantsCutlery(false);
              }}
              accessibilityLabel="Não preciso de talheres"
            >
              <Text
                style={[
                  styles.cutleryPillText,
                  wantsCutlery === false && styles.cutleryPillTextActive,
                ]}
              >
                Não
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Dados do cliente (se faltarem) */}
      {(!name.trim() || !phone.trim()) && (
        <View style={styles.extraFieldCard}>
          <Text style={styles.extraFieldTitle}>Dados para contato</Text>
          {!name.trim() && (
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Nome completo"
              placeholderTextColor={COLORS.textMuted}
              style={styles.cardInput}
            />
          )}
          {!phone.trim() && (
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefone (WhatsApp)"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="phone-pad"
              style={styles.cardInput}
            />
          )}
        </View>
      )}

      {/* Observações */}
      <View style={styles.extraFieldCard}>
        <Text style={styles.extraFieldTitle}>Observações do pedido</Text>
        <TextInput
          value={orderNotes}
          onChangeText={setOrderNotes}
          placeholder="Ex: sem talher descartável, portão branco..."
          placeholderTextColor={COLORS.textMuted}
          multiline
          style={[styles.cardInput, styles.notesInput]}
        />
      </View>

      {/* 5. Linha de cupom */}
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
              <Text style={styles.couponSub}>Adicione para economizar</Text>
            </>
          )}
        </View>

        {coupon ? (
          <Pressable onPress={onRemoveCoupon} hitSlop={8} accessibilityLabel="Remover cupom">
            <Text style={styles.couponActionText}>Remover</Text>
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
    color: COLORS.brandRed,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[3],
  },
  paymentSelectCard: {
    backgroundColor: COLORS.grayLight,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    marginBottom: SPACING[4],
  },
  paymentCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentLabelText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  installmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING[3],
    marginTop: SPACING[3],
  },
  installmentsText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  extraFieldCard: {
    backgroundColor: COLORS.grayLight,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    marginBottom: SPACING[3],
  },
  extraFieldTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  cutleryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cutleryPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cutleryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },
  cutleryPillActive: {
    backgroundColor: COLORS.brandRed,
    borderColor: COLORS.brandRed,
  },
  cutleryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  cutleryPillTextActive: {
    color: COLORS.white,
  },
  cardInput: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
  },
  twoInputsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
  },
  inlineActionBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  inlineActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.brandRed,
  },
  cardFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  couponCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.borderLight,
    marginVertical: SPACING[4],
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
    color: COLORS.brandRed,
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
});
