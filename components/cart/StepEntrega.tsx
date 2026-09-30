import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, RADIUS } from '../../constants/theme';
import { DELIVERY_FEE, DELIVERY_ETA_TEXT, STORE_ADDRESS } from '../../constants/store';
import { Address, DeliveryType } from './useCheckoutFlow';

interface StepEntregaProps {
  deliveryType: DeliveryType;
  setDeliveryType: (type: DeliveryType) => void;
  selectedAddress: Address | null;
  loadingAddress: boolean;
}

export default function StepEntrega({
  deliveryType,
  setDeliveryType,
  selectedAddress,
  loadingAddress,
}: StepEntregaProps) {
  const router = useRouter();

  const handleToggleRetirada = () => {
    Haptics.selectionAsync();
    setDeliveryType('retirada');
  };

  const handleToggleDelivery = () => {
    Haptics.selectionAsync();
    setDeliveryType('delivery');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {deliveryType === 'delivery' ? (
        <>
          {/* 1. Entregar no endereço */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Entregar no endereço</Text>

            <View style={styles.addressRow}>
              <View style={styles.addressIconWrap}>
                <Ionicons name="location-sharp" size={20} color={COLORS.text} />
              </View>

              <View style={styles.addressTextWrap}>
                {selectedAddress ? (
                  <>
                    <Text style={styles.addressMain} numberOfLines={1}>
                      {selectedAddress.street}, {selectedAddress.number}
                    </Text>
                    <Text style={styles.addressSub} numberOfLines={2}>
                      {selectedAddress.complement
                        ? `${selectedAddress.complement} - `
                        : ''}
                      {selectedAddress.neighborhood}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.addressEmptyTitle}>
                      {loadingAddress ? 'Carregando endereço...' : 'Nenhum endereço selecionado'}
                    </Text>
                    <Text style={styles.addressSub}>
                      Cadastre seu endereço para entrega em Iacanga-SP
                    </Text>
                  </>
                )}
              </View>

              <Pressable
                onPress={() => router.push('/addresses')}
                hitSlop={8}
                accessibilityLabel="Trocar endereço de entrega"
              >
                <Text style={styles.changeActionText}>
                  {selectedAddress ? 'Trocar' : 'Adicionar'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* 2. Opções de entrega */}
          <View style={styles.section}>
            <View style={styles.optionsHeader}>
              <Text style={styles.sectionTitle}>Opções de entrega</Text>
              <Ionicons
                name="help-circle-outline"
                size={16}
                color={COLORS.textMuted}
                style={styles.helpIcon}
              />
            </View>

            {/* Card Padrão selecionado (borda 2px escura) */}
            <View style={styles.optionCardSelected}>
              <View style={styles.optionLeft}>
                <Text style={styles.optionTitle}>Padrão</Text>
                <Text style={styles.optionEta}>Hoje, {DELIVERY_ETA_TEXT}</Text>
              </View>

              <View style={styles.optionRight}>
                <Text style={styles.optionFee}>
                  R$ {DELIVERY_FEE.toFixed(2).replace('.', ',')}
                </Text>
                <View style={styles.radioOuterActive}>
                  <View style={styles.radioInnerActive} />
                </View>
              </View>
            </View>

            {/* Faixa para retirada na loja */}
            <Pressable
              style={styles.retiradaBanner}
              onPress={handleToggleRetirada}
              accessibilityLabel="Mudar para retirada na loja com taxa grátis"
            >
              <Text style={styles.retiradaBannerText}>
                <Text style={styles.boldText}>Taxa grátis</Text> retirando o seu pedido na loja ›
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          {/* Modo Retirada na Loja */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Retirar na loja</Text>

            <View style={styles.addressRow}>
              <View style={styles.addressIconWrap}>
                <Ionicons name="storefront" size={20} color={COLORS.text} />
              </View>

              <View style={styles.addressTextWrap}>
                <Text style={styles.addressMain}>{STORE_ADDRESS.full}</Text>
                <Text style={styles.addressSub}>{STORE_ADDRESS.displayLine2}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.optionsHeader}>
              <Text style={styles.sectionTitle}>Opções de entrega</Text>
            </View>

            {/* Card Retirada selecionado */}
            <View style={styles.optionCardSelected}>
              <View style={styles.optionLeft}>
                <Text style={styles.optionTitle}>Retirada na loja</Text>
                <Text style={styles.optionEta}>Pronto em {DELIVERY_ETA_TEXT}</Text>
              </View>

              <View style={styles.optionRight}>
                <Text style={styles.optionFeeFree}>Grátis</Text>
                <View style={styles.radioOuterActive}>
                  <View style={styles.radioInnerActive} />
                </View>
              </View>
            </View>

            {/* Faixa para voltar para entrega em domicílio */}
            <Pressable
              style={styles.retiradaBanner}
              onPress={handleToggleDelivery}
              accessibilityLabel="Mudar para entrega no endereço"
            >
              <Text style={styles.retiradaBannerText}>
                Prefere receber em casa? <Text style={styles.boldText}>Mudar para entrega</Text> ›
              </Text>
            </Pressable>
          </View>
        </>
      )}
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
    paddingTop: SPACING[4],
    paddingBottom: SPACING[10],
  },
  section: {
    marginBottom: SPACING[6],
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[3],
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[2],
  },
  addressIconWrap: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  addressTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  addressMain: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  addressEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.error,
  },
  addressSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  changeActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  optionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helpIcon: {
    marginLeft: 6,
    marginBottom: SPACING[3],
  },
  optionCardSelected: {
    borderWidth: 2,
    borderColor: COLORS.darkBorder,
    borderRadius: RADIUS.md,
    padding: SPACING[4],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
  },
  optionLeft: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionEta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 3,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionFee: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  optionFeeFree: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.success,
  },
  radioOuterActive: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInnerActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  retiradaBanner: {
    backgroundColor: COLORS.grayLight,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[3],
  },
  retiradaBannerText: {
    fontSize: 13,
    color: COLORS.text,
  },
  boldText: {
    fontWeight: '700',
  },
});
