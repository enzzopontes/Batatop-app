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
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { PaymentMethod } from './useCheckoutFlow';
import { SavedCard } from '../../utils/usePaymentCards';
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
  const insets = useSafeAreaInsets();
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
        <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]}>
          {/* Handle superior curvo */}
          <View style={styles.sheetHandle} />

          {/* Header com botão voltar circular e logo batatatopestendida.png */}
          <View style={styles.headerRow}>
            <RipplePressable onPress={onClose} style={styles.backCircleBtn} hitSlop={10} rippleColor="rgba(0,0,0,0.1)">
              <Ionicons name="chevron-back" size={20} color="#18181B" />
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
                {/* Seção Dinheiro */}
                <Text style={styles.sectionHeaderTitle}>Dinheiro</Text>
                <RipplePressable
                  style={[styles.cardItem, currentMethod === 'dinheiro' && styles.cardItemSelected]}
                  onPress={() => handleSelect('dinheiro')}
                  rippleColor="rgba(0, 0, 0, 0.08)"
                >
                  <View style={styles.cardItemLeft}>
                    <View style={styles.brandIconBox}>
                      <Ionicons name="cash-outline" size={22} color="#16A34A" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>Dinheiro</Text>
                      <Text style={styles.cardSubtitle}>Pagamento no momento da entrega</Text>
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
                </RipplePressable>

                {/* Seção Crédito */}
                <Text style={styles.sectionHeaderTitle}>Crédito</Text>
                <RipplePressable
                  style={[
                    styles.cardItem,
                    currentMethod === 'cartão de crédito (entrega)' && styles.cardItemSelected,
                  ]}
                  onPress={() => handleSelect('cartão de crédito (entrega)')}
                  rippleColor="rgba(0, 0, 0, 0.08)"
                >
                  <View style={styles.cardItemLeft}>
                    <View style={styles.brandIconBox}>
                      <Ionicons name="card-outline" size={22} color="#18181B" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>Cartão de Crédito</Text>
                      <Text style={styles.cardSubtitle}>Pague na maquininha ao receber</Text>
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
                </RipplePressable>

                {/* Seção Débito */}
                <Text style={styles.sectionHeaderTitle}>Débito</Text>
                <RipplePressable
                  style={[
                    styles.cardItem,
                    currentMethod === 'cartão de débito (entrega)' && styles.cardItemSelected,
                  ]}
                  onPress={() => handleSelect('cartão de débito (entrega)')}
                  rippleColor="rgba(0, 0, 0, 0.08)"
                >
                  <View style={styles.cardItemLeft}>
                    <View style={styles.brandIconBox}>
                      <Ionicons name="card-outline" size={22} color="#18181B" />
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle}>Cartão de Débito</Text>
                      <Text style={styles.cardSubtitle}>Pague na maquininha ao receber</Text>
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
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerLogo: {
    width: 190,
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
    gap: SPACING[3],
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
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
    borderWidth: 2,
    borderColor: '#D4D4D8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING[2],
  },
  radioOuterSelected: {
    borderColor: '#18181B',
  },
  radioInnerSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#18181B',
  },
  addCardLink: {
    alignSelf: 'center',
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  addCardLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#18181B',
    marginTop: SPACING[2],
    marginBottom: SPACING[1],
  },
});
