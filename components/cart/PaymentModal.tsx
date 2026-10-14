import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { PaymentMethod } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
import { useFooterInsets } from '../../hooks/useFooterInsets';
import RipplePressable from './RipplePressable';

const LOGO_ESTENDIDA = require('../../assets/batatatopestendida.png');

interface PaymentModalProps {
  visible: boolean;
  currentMethod: PaymentMethod;
  selectedCard: SavedCard | null;
  savedCards: SavedCard[];
  onClose: () => void;
  onSelectPayment: (method: PaymentMethod, card?: SavedCard) => void;
  onAddNewCard: () => void;
}

export default function PaymentModal({
  visible,
  currentMethod,
  selectedCard,
  savedCards,
  onClose,
  onSelectPayment,
  onAddNewCard,
}: PaymentModalProps) {
  const { paddingBottom } = useFooterInsets({ extraPadding: 16 });
  const [tab, setTab] = useState<'app' | 'entrega'>(
    currentMethod === 'dinheiro' ||
      currentMethod === 'cartão de crédito (entrega)' ||
      currentMethod === 'cartão de débito (entrega)'
      ? 'entrega'
      : 'app'
  );

  const handleSelect = (method: PaymentMethod, card?: SavedCard) => {
    Haptics.selectionAsync();
    onSelectPayment(method, card);
    onClose();
  };

  const isCardSelected = (card: SavedCard) => {
    return (
      (currentMethod === 'cartão de crédito' || currentMethod === 'cartão de débito') &&
      selectedCard?.id === card.id
    );
  };

  const creditCards = savedCards.filter((c) => c.card_type === 'cartão de crédito');
  const debitCards = savedCards.filter((c) => c.card_type === 'cartão de débito');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.sheetContent, { paddingBottom }]}>
          {/* Handle superior curvo */}
          <View style={styles.sheetHandle} />

          {/* Header com botão voltar na esquerda e logo no centro (idêntico ao print) */}
          <View style={styles.headerRow}>
            <RipplePressable onPress={onClose} style={styles.backBtn} hitSlop={12} rippleColor="rgba(0,0,0,0.1)">
              <Ionicons name="chevron-back" size={24} color="#18181B" />
            </RipplePressable>
            <Image
              source={LOGO_ESTENDIDA}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <View style={styles.headerSpacer} />
          </View>

          {/* Abas: Pagar pelo app | Pagar na entrega */}
          <View style={styles.tabsRow}>
            <RipplePressable
              style={[styles.tab, tab === 'app' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('app');
              }}
              rippleColor="rgba(0,0,0,0.06)"
            >
              <Text style={[styles.tabText, tab === 'app' && styles.tabTextActive]}>
                Pagar pelo app
              </Text>
              {tab === 'app' && <View style={styles.activeTabIndicator} />}
            </RipplePressable>

            <RipplePressable
              style={[styles.tab, tab === 'entrega' && styles.tabActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setTab('entrega');
              }}
              rippleColor="rgba(0,0,0,0.06)"
            >
              <Text style={[styles.tabText, tab === 'entrega' && styles.tabTextActive]}>
                Pagar na entrega
              </Text>
              {tab === 'entrega' && <View style={styles.activeTabIndicator} />}
            </RipplePressable>
          </View>

          <ScrollView
            style={styles.bodyList}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'app' ? (
              <>
                {/* Cartões de crédito salvos */}
                {creditCards.map((card) => {
                  const selected = isCardSelected(card);
                  return (
                    <RipplePressable
                      key={card.id}
                      style={[styles.cardItem, selected && styles.cardItemSelected]}
                      onPress={() => handleSelect('cartão de crédito', card)}
                      rippleColor="rgba(0, 0, 0, 0.08)"
                    >
                      <View style={styles.cardItemLeft}>
                        <View style={styles.brandIconBox}>
                          <Ionicons name="card" size={20} color="#2563EB" />
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>
                            Crédito • {card.cardholder_name || 'Cartão'}
                          </Text>
                          <View style={styles.cardSubRow}>
                            <Text style={styles.cardLastFour}>•••• {card.last_four}</Text>
                            <View style={styles.tagParcele}>
                              <Text style={styles.tagParceleText}>Parcele seu pedido</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                        {selected && <View style={styles.radioInnerSelected} />}
                      </View>
                    </RipplePressable>
                  );
                })}

                {/* Cartões de débito salvos */}
                {debitCards.map((card) => {
                  const selected = isCardSelected(card);
                  return (
                    <RipplePressable
                      key={card.id}
                      style={[styles.cardItem, selected && styles.cardItemSelected]}
                      onPress={() => handleSelect('cartão de débito', card)}
                      rippleColor="rgba(0, 0, 0, 0.08)"
                    >
                      <View style={styles.cardItemLeft}>
                        <View style={styles.brandIconBox}>
                          <Ionicons name="card" size={20} color="#16A34A" />
                        </View>
                        <View style={styles.cardInfo}>
                          <Text style={styles.cardTitle}>
                            Débito • {card.cardholder_name || 'Cartão'}
                          </Text>
                          <Text style={styles.cardLastFour}>•••• {card.last_four}</Text>
                        </View>
                      </View>

                      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                        {selected && <View style={styles.radioInnerSelected} />}
                      </View>
                    </RipplePressable>
                  );
                })}

                {/* Pix */}
                <RipplePressable
                  style={[styles.cardItem, currentMethod === 'pix' && styles.cardItemSelected]}
                  onPress={() => handleSelect('pix')}
                  rippleColor="rgba(0, 0, 0, 0.08)"
                >
                  <View style={styles.cardItemLeft}>
                    <View style={styles.brandIconBox}>
                      <Ionicons name="qr-code" size={20} color="#00B494" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>Pix</Text>
                      <Text style={styles.cardSubtitle}>Aprovação automática</Text>
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
                </RipplePressable>

                {/* Link Adicionar novo cartão */}
                <RipplePressable
                  style={styles.addCardLink}
                  onPress={() => {
                    onClose();
                    onAddNewCard();
                  }}
                  hitSlop={8}
                  rippleColor="rgba(227, 160, 8, 0.15)"
                >
                  <Text style={styles.addCardLinkText}>Adicionar novo cartão</Text>
                </RipplePressable>
              </>
            ) : (
              <>
                {/* Seção Dinheiro (Item 4: idêntico ao print do iFood) */}
                <Text style={styles.sectionHeaderTitle}>Dinheiro</Text>
                <RipplePressable
                  style={styles.deliveryCardItem}
                  onPress={() => handleSelect('dinheiro')}
                  rippleColor="rgba(0, 0, 0, 0.06)"
                  accessibilityLabel="Pagar em dinheiro na entrega"
                >
                  <View style={styles.deliveryCardLeft}>
                    <View style={styles.cashIconWrap}>
                      <Ionicons name="cash" size={24} color="#16A34A" />
                    </View>
                    <Text style={styles.deliveryCardName}>Dinheiro</Text>
                  </View>

                  <View
                    style={[
                      styles.radioOuter,
                      currentMethod === 'dinheiro' && styles.radioOuterSelected,
                    ]}
                  >
                    {currentMethod === 'dinheiro' && <View style={styles.radioInnerSelected} />}
                  </View>
                </RipplePressable>

                {/* Seção Crédito */}
                <Text style={styles.sectionHeaderTitle}>Crédito</Text>
                <RipplePressable
                  style={styles.deliveryCardItem}
                  onPress={() => handleSelect('cartão de crédito (entrega)')}
                  rippleColor="rgba(0, 0, 0, 0.06)"
                  accessibilityLabel="Pagar com cartão de crédito na entrega"
                >
                  <View style={styles.deliveryCardLeft}>
                    <View style={styles.cardIconWrap}>
                      <Ionicons name="card" size={22} color="#18181B" />
                    </View>
                    <Text style={styles.deliveryCardName}>Cartão de Crédito</Text>
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
                </RipplePressable>

                {/* Seção Débito */}
                <Text style={styles.sectionHeaderTitle}>Débito</Text>
                <RipplePressable
                  style={styles.deliveryCardItem}
                  onPress={() => handleSelect('cartão de débito (entrega)')}
                  rippleColor="rgba(0, 0, 0, 0.06)"
                  accessibilityLabel="Pagar com cartão de débito na entrega"
                >
                  <View style={styles.deliveryCardLeft}>
                    <View style={styles.cardIconWrap}>
                      <Ionicons name="card" size={22} color="#18181B" />
                    </View>
                    <Text style={styles.deliveryCardName}>Cartão de Débito</Text>
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
                </RipplePressable>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING[4],
    paddingTop: 12,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D4D8',
    alignSelf: 'center',
    marginBottom: SPACING[3],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[3],
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 160,
    height: 38,
  },
  headerSpacer: {
    width: 36,
  },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    marginBottom: SPACING[3],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#71717A',
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#18181B',
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: COLORS.primary,
  },
  bodyList: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingVertical: SPACING[2],
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    marginTop: SPACING[3],
    marginBottom: SPACING[2],
  },
  // Card de entrega idêntico ao print do iFood
  deliveryCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: SPACING[1],
  },
  deliveryCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cashIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
  },
  // Cards do app
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 14,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    overflow: 'hidden',
  },
  cardItemSelected: {
    borderColor: '#18181B',
  },
  cardItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING[3],
  },
  brandIconBox: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  cardLastFour: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tagParcele: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  tagParceleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E5E7EB', // Círculo cinza claro preenchido (idêntico ao print do iFood)
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  radioInnerSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  addCardLink: {
    alignSelf: 'center',
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    marginTop: SPACING[2],
    overflow: 'hidden',
  },
  addCardLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
