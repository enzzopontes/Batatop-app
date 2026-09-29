import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  ActivityIndicator,
  Modal,
  StatusBar,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { usePaymentCards, formatCardDisplay } from '../../utils/usePaymentCards';
import { ThemedAlertHost, showThemedAlert } from '../../components/ThemedAlert';
import CardWizard from '../../components/CardWizard';

/**
 * Página "Pagamentos" — gerencia cartões salvos (listar/adicionar/remover)
 * e link para cupons.
 */
export default function PaymentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cards, loadingCards, savingCard, loadCards, addCard, removeCard } = usePaymentCards();

  const [sheetVisible, setSheetVisible] = useState(false);
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardCardType, setWizardCardType] = useState('cartão de crédito');

  useFocusEffect(
    useCallback(() => {
      loadCards();
      StatusBar.setBarStyle('dark-content', true);
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent', true);
    }, [loadCards])
  );

  function handleOpenAddSheet() {
    setSheetVisible(true);
  }

  function handleSelectType(type) {
    setSheetVisible(false);
    setWizardCardType(type);
    setWizardVisible(true);
  }

  function handleRemoveCard(card) {
    showThemedAlert('Remover cartão', `Deseja remover o cartão final ${card.last_four}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => removeCard(card) },
    ]);
  }

  return (
    <>
      <ThemedAlertHost />

      {wizardVisible ? (
        <CardWizard
          cardType={wizardCardType}
          existingCardsCount={cards.length}
          addCard={addCard}
          savingCard={savingCard}
          onClose={() => setWizardVisible(false)}
          onSaved={() => setWizardVisible(false)}
        />
      ) : (
        <View style={s.container}>
          <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

          {/* Degrade suave do topo até "Formas de pagamento" igual à foto */}
          <LinearGradient
            colors={['#E8D7DF', '#F5E7ED', '#FFFFFF']}
            locations={[0, 0.45, 1]}
            style={[s.gradientHeader, { height: 160 + insets.top }]}
            pointerEvents="none"
          />

          {/* Header com botão voltar circular e logo */}
          <View style={[s.header, { paddingTop: insets.top + SPACING[2] }]}>
            <Pressable onPress={() => router.back()} style={s.backCircleBtn} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color="#18181B" />
            </Pressable>
            <Image
              source={require('../../assets/batatatopestendida.png')}
              style={s.headerLogo}
              resizeMode="contain"
            />
            <View style={s.headerSideBtn} />
          </View>

          <ScrollView style={s.scrollView} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={s.sectionTitle}>Formas de pagamento</Text>
            <Text style={s.sectionSubtitle}>Adicione e gerencie</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.cardsRow}
            >
              {cards.map((card) => (
                <View key={card.id} style={s.cardTile}>
                  <View style={s.cardTileHeader}>
                    <Ionicons
                      name="card"
                      size={22}
                      color={card.card_type === 'cartão de crédito' ? '#2563EB' : '#16A34A'}
                    />
                    <Pressable
                      style={s.cardTrash}
                      onPress={() => handleRemoveCard(card)}
                      hitSlop={10}
                    >
                      <Ionicons name="close-circle" size={17} color="#A1A1AA" />
                    </Pressable>
                  </View>

                  <View style={s.cardTileInfo}>
                    <Text style={s.cardTileType}>
                      {card.card_type === 'cartão de crédito' ? 'Crédito' : 'Débito'}
                    </Text>
                    <Text style={s.cardTileDigits} numberOfLines={1}>
                      {card.last_four || '••••'}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Botão Adicionar novo cartão quadrado certinho */}
              <Pressable style={s.addTile} onPress={handleOpenAddSheet}>
                <Ionicons name="add" size={28} color="#71717A" />
                <Text style={s.addTileLabel}>Adicionar novo</Text>
              </Pressable>
            </ScrollView>

            {loadingCards ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : cards.length === 0 ? (
              <View style={s.emptyState}>
                <Image
                  source={require('../../assets/batatatoppagamento.png')}
                  style={s.emptyImage}
                  resizeMode="contain"
                />
                <Text style={s.emptyTitle}>Nenhum cartão por aqui</Text>
                <Text style={s.emptySubtitle}>
                  Adicione um cartão pra agilizar seus próximos pedidos.
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Rodapé fixo com linha divisória e Meus cupons */}
          <View style={[s.fixedBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable style={s.listItem} onPress={() => router.push('/cupons')}>
              <View style={s.listItemIconBox}>
                <Ionicons name="pricetag-outline" size={18} color={COLORS.textSecondary} />
              </View>
              <Text style={s.listItemLabel}>Meus cupons</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Bottom Sheet Modal minimalista estilo iFood (preto/cinza, sem excesso de amarelo) */}
          <Modal
            visible={sheetVisible}
            transparent
            animationType="slide"
            statusBarTranslucent
            onRequestClose={() => setSheetVisible(false)}
          >
            <View style={s.modalOverlay}>
              <Pressable
                style={s.modalBackdrop}
                onPress={() => setSheetVisible(false)}
              />
              <View style={[s.sheetContent, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
                <View style={s.sheetHandle} />

                <Text style={s.sheetTitle}>Escolha uma opção de pagamento</Text>

                <Pressable
                  style={({ pressed }) => [s.sheetOption, pressed && s.sheetOptionPressed]}
                  onPress={() => handleSelectType('cartão de crédito')}
                >
                  <View style={s.sheetOptionLeft}>
                    <Ionicons name="card-outline" size={22} color="#18181B" />
                    <Text style={s.sheetOptionText}>Crédito</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#71717A" />
                </Pressable>

                <View style={s.sheetDivider} />

                <Pressable
                  style={({ pressed }) => [s.sheetOption, pressed && s.sheetOptionPressed]}
                  onPress={() => handleSelectType('cartão de débito')}
                >
                  <View style={s.sheetOptionLeft}>
                    <Ionicons name="card-outline" size={22} color="#18181B" />
                    <Text style={s.sheetOptionText}>Débito</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#71717A" />
                </Pressable>
              </View>
            </View>
          </Modal>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  gradientHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
    zIndex: 10,
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  headerSideBtn: {
    width: 38,
    height: 38,
  },
  headerLogo: {
    width: 225,
    height: 54,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[8],
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: '#18181B',
    marginTop: SPACING[4],
  },
  sectionSubtitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING[1],
    marginBottom: SPACING[4],
  },
  cardsRow: {
    gap: SPACING[3],
    paddingRight: SPACING[5],
    paddingVertical: 4,
  },
  cardTile: {
    width: 108,
    height: 108,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#F4F4F5',
    padding: 12,
    justifyContent: 'space-between',
  },
  cardTileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTrash: {
    padding: 2,
  },
  cardTileInfo: {
    gap: 2,
  },
  cardTileType: {
    fontSize: 11,
    color: '#71717A',
    fontWeight: '400',
  },
  cardTileDigits: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  addTile: {
    width: 108,
    height: 108,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D4D4D8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  addTileLabel: {
    fontSize: 12,
    color: '#71717A',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING[8],
  },
  emptyImage: {
    width: 200,
    height: 200,
    marginBottom: SPACING[4],
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING[1],
    paddingHorizontal: SPACING[6],
  },
  fixedBottomBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2],
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    paddingVertical: SPACING[3],
  },
  listItemIconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItemLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.text,
  },
  // Modal / Bottom Sheet minimalista
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
    paddingHorizontal: SPACING[5],
    paddingTop: 12,
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
    marginBottom: SPACING[4],
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
    textAlign: 'center',
    marginBottom: SPACING[3],
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[4],
  },
  sheetOptionPressed: {
    opacity: 0.7,
  },
  sheetOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#18181B',
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E4E4E7',
  },
});
