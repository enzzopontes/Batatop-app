import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { PaymentMethod } from './useCheckoutFlow';
import { SavedCard, formatCardDisplay } from '../../utils/usePaymentCards';

interface PaymentSelectorProps {
  currentMethod: PaymentMethod;
  selectedCard: SavedCard | null;
  savedCards: SavedCard[];
  onSelectPayment: (method: PaymentMethod, card?: SavedCard) => void;
  onAddNewCard: () => void;
  onBack: () => void;
}

export default function PaymentSelector({
  currentMethod,
  selectedCard,
  savedCards,
  onSelectPayment,
  onAddNewCard,
  onBack,
}: PaymentSelectorProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'app' | 'entrega'>(
    currentMethod === 'dinheiro' ||
      currentMethod === 'cartão de crédito (entrega)' ||
      currentMethod === 'cartão de débito (entrega)'
      ? 'entrega'
      : 'app'
  );

  const isCardMethod = currentMethod === 'cartão de crédito' || currentMethod === 'cartão de débito';

  const handleSelect = (method: PaymentMethod, card?: SavedCard) => {
    Haptics.selectionAsync();
    onSelectPayment(method, card);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 1. Cabeçalho */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.circleBtn}
          hitSlop={8}
          accessibilityLabel="Voltar para sacola"
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </Pressable>

        <Text style={styles.headerTitle}>Pagamento</Text>

        <View style={styles.headerPlaceholder} />
      </View>

      {/* 2. Abas: Pagar pelo app | Pagar na entrega */}
      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tab, tab === 'app' && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setTab('app');
          }}
          accessibilityLabel="Aba pagar pelo app"
        >
          <Text style={[styles.tabText, tab === 'app' && styles.tabTextActive]}>
            Pagar pelo app
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, tab === 'entrega' && styles.tabActive]}
          onPress={() => {
            Haptics.selectionAsync();
            setTab('entrega');
          }}
          accessibilityLabel="Aba pagar na entrega"
        >
          <Text style={[styles.tabText, tab === 'entrega' && styles.tabTextActive]}>
            Pagar na entrega
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (insets.bottom > 0 ? insets.bottom : SPACING[4]) + SPACING[4] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'app' ? (
          <>
            {/* Cartões salvos */}
            {savedCards.map((card) => {
              const isSelected = isCardMethod && selectedCard?.id === card.id;
              return (
                <Pressable
                  key={card.id}
                  style={[styles.cardOption, isSelected && styles.cardOptionSelected]}
                  onPress={() => handleSelect(card.card_type, card)}
                  accessibilityLabel={formatCardDisplay(card)}
                >
                  <View style={styles.cardOptionLeft}>
                    <View style={styles.iconCircle}>
                      <Ionicons name="card" size={20} color={COLORS.text} />
                    </View>
                    <View style={styles.cardOptionTexts}>
                      <Text style={styles.cardOptionTitle}>
                        {formatCardDisplay(card)}
                      </Text>
                      <Text style={styles.cardOptionSub}>
                        {card.cardholder_name || 'Cartão salvo'}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                    {isSelected && <View style={styles.radioInnerSelected} />}
                  </View>
                </Pressable>
              );
            })}

            {/* Pix */}
            <Pressable
              style={[styles.cardOption, currentMethod === 'pix' && styles.cardOptionSelected]}
              onPress={() => handleSelect('pix')}
              accessibilityLabel="Pagar com Pix"
            >
              <View style={styles.cardOptionLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="qr-code" size={20} color={COLORS.text} />
                </View>
                <View style={styles.cardOptionTexts}>
                  <Text style={styles.cardOptionTitle}>Pix</Text>
                  <Text style={styles.cardOptionSub}>Aprovação automática</Text>
                </View>
              </View>

              <View
                style={[
                  styles.radioOuter,
                  currentMethod === 'pix' && styles.radioOuterSelected,
                ]}
              >
                {currentMethod === 'pix' && <View style={styles.radioInnerSelected} />}
              </View>
            </Pressable>

            {/* Link Adicionar novo cartão */}
            <Pressable
              style={styles.addNewCardBtn}
              onPress={onAddNewCard}
              accessibilityLabel="Adicionar novo cartão"
            >
              <Text style={styles.addNewCardText}>Adicionar novo cartão</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* Dinheiro */}
            <Pressable
              style={[
                styles.cardOption,
                currentMethod === 'dinheiro' && styles.cardOptionSelected,
              ]}
              onPress={() => handleSelect('dinheiro')}
              accessibilityLabel="Pagar com dinheiro na entrega"
            >
              <View style={styles.cardOptionLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="cash-outline" size={20} color={COLORS.text} />
                </View>
                <View style={styles.cardOptionTexts}>
                  <Text style={styles.cardOptionTitle}>Dinheiro</Text>
                  <Text style={styles.cardOptionSub}>Pague direto com o entregador</Text>
                </View>
              </View>

              <View
                style={[
                  styles.radioOuter,
                  currentMethod === 'dinheiro' && styles.radioOuterSelected,
                ]}
              >
                {currentMethod === 'dinheiro' && <View style={styles.radioInnerSelected} />}
              </View>
            </Pressable>

            {/* Cartão de crédito na entrega */}
            <Pressable
              style={[
                styles.cardOption,
                currentMethod === 'cartão de crédito (entrega)' && styles.cardOptionSelected,
              ]}
              onPress={() => handleSelect('cartão de crédito (entrega)')}
              accessibilityLabel="Cartão de crédito na maquininha"
            >
              <View style={styles.cardOptionLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="card-outline" size={20} color={COLORS.text} />
                </View>
                <View style={styles.cardOptionTexts}>
                  <Text style={styles.cardOptionTitle}>Cartão de crédito</Text>
                  <Text style={styles.cardOptionSub}>Na maquininha, na entrega</Text>
                </View>
              </View>

              <View
                style={[
                  styles.radioOuter,
                  currentMethod === 'cartão de crédito (entrega)' && styles.radioOuterSelected,
                ]}
              >
                {currentMethod === 'cartão de crédito (entrega)' && (
                  <View style={styles.radioInnerSelected} />
                )}
              </View>
            </Pressable>

            {/* Cartão de débito na entrega */}
            <Pressable
              style={[
                styles.cardOption,
                currentMethod === 'cartão de débito (entrega)' && styles.cardOptionSelected,
              ]}
              onPress={() => handleSelect('cartão de débito (entrega)')}
              accessibilityLabel="Cartão de débito na maquininha"
            >
              <View style={styles.cardOptionLeft}>
                <View style={styles.iconCircle}>
                  <Ionicons name="card-outline" size={20} color={COLORS.text} />
                </View>
                <View style={styles.cardOptionTexts}>
                  <Text style={styles.cardOptionTitle}>Cartão de débito</Text>
                  <Text style={styles.cardOptionSub}>Na maquininha, na entrega</Text>
                </View>
              </View>

              <View
                style={[
                  styles.radioOuter,
                  currentMethod === 'cartão de débito (entrega)' && styles.radioOuterSelected,
                ]}
              >
                {currentMethod === 'cartão de débito (entrega)' && (
                  <View style={styles.radioInnerSelected} />
                )}
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerPlaceholder: {
    width: 36,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingHorizontal: SPACING[4],
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.grayText,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  content: {
    padding: SPACING[4],
    gap: 12,
  },
  cardOption: {
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    borderRadius: RADIUS.md,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  cardOptionSelected: {
    borderWidth: 2,
    borderColor: COLORS.darkBorder,
  },
  cardOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardOptionTexts: {
    flex: 1,
  },
  cardOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardOptionSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.grayBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.primary,
  },
  radioInnerSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  addNewCardBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  addNewCardText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
