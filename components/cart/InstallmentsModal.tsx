import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import RipplePressable from './RipplePressable';
import PrimaryButton from '../PrimaryButton';

export interface InstallmentOption {
  installments: number;
  installmentAmount: number;
  totalAmount: number;
}

interface InstallmentsModalProps {
  visible: boolean;
  baseAmount: number;
  options: InstallmentOption[];
  selectedInstallments: number;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSelectInstallment: (option: InstallmentOption) => void;
  onRetry?: () => void;
}

function formatMoney(amount: number): string {
  return `R$ ${Number(amount || 0).toFixed(2).replace('.', ',')}`;
}

export default function InstallmentsModal({
  visible,
  baseAmount,
  options,
  selectedInstallments,
  loading = false,
  error = null,
  onClose,
  onSelectInstallment,
  onRetry,
}: InstallmentsModalProps) {
  const insets = useSafeAreaInsets();
  const [tempSelected, setTempSelected] = useState<number>(selectedInstallments || 1);

  useEffect(() => {
    if (visible) {
      setTempSelected(selectedInstallments || 1);
    }
  }, [visible, selectedInstallments]);

  const handleConfirm = () => {
    const chosen = options.find((opt) => opt.installments === tempSelected);
    if (chosen) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectInstallment(chosen);
    }
    onClose();
  };

  const handleCardPress = (instNumber: number) => {
    Haptics.selectionAsync();
    setTempSelected(instNumber);
  };

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
        <View style={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Barrinha cinza de arrastar no topo */}
          <View style={styles.sheetHandle} />

          {/* Título centralizado */}
          <Text style={styles.sheetTitle}>Parcelamento</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Buscando opções de parcelamento...</Text>
            </View>
          ) : error && options.length === 0 ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              {onRetry && (
                <RipplePressable onPress={onRetry} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Tentar novamente</Text>
                </RipplePressable>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.optionsList}
              contentContainerStyle={styles.optionsContent}
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const isSelected = tempSelected === option.installments;
                // Sem acréscimo se o total cobrado for igual ao valor à vista (com tolerância de arredondamento de centavos)
                const isWithoutInterest =
                  Math.abs(option.totalAmount - (baseAmount || option.totalAmount)) < 0.05;

                return (
                  <Pressable
                    key={option.installments}
                    onPress={() => handleCardPress(option.installments)}
                    style={[styles.card, isSelected && styles.cardSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.installments}x de ${formatMoney(option.installmentAmount)} ${
                      isWithoutInterest ? 'sem acréscimos' : 'com acréscimos'
                    }`}
                  >
                    <View style={styles.cardInfo}>
                      <View style={styles.mainRow}>
                        <Text style={styles.mainText}>
                          {option.installments}x de {formatMoney(option.installmentAmount)}{' '}
                        </Text>
                        {isWithoutInterest ? (
                          <Text style={styles.noInterestText}>sem acréscimos</Text>
                        ) : (
                          <Text style={styles.withInterestText}>com acréscimos</Text>
                        )}
                      </View>
                      <Text style={styles.totalText}>
                        Total {formatMoney(option.totalAmount)}
                        {option.installments === 1 ? ' à vista' : ''}
                      </Text>
                    </View>

                    {/* Radio à direita — exatamente como na foto do iFood */}
                    {isSelected ? (
                      <View style={styles.radioSelected} />
                    ) : (
                      <View style={styles.radioUnselected} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Botão "Continuar" largo, arredondado e preenchido */}
          <PrimaryButton
            title="Continuar"
            fullWidth
            onPress={handleConfirm}
            disabled={loading || options.length === 0}
            style={styles.continueBtn}
            textStyle={styles.continueBtnText}
          />

          {/* Link "Cancelar" centralizado abaixo */}
          <RipplePressable
            onPress={onClose}
            style={styles.cancelBtn}
            hitSlop={8}
            rippleColor="rgba(227, 160, 8, 0.15)"
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
          >
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </RipplePressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheetContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING[4],
    paddingTop: 10,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F1B16',
    textAlign: 'center',
    marginBottom: 18,
  },
  optionsList: {
    maxHeight: 400,
  },
  optionsContent: {
    paddingBottom: SPACING[2],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  cardSelected: {
    borderWidth: 1.5,
    borderColor: '#1F1B16',
  },
  cardInfo: {
    flex: 1,
    paddingRight: 12,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  mainText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#1F1B16',
    lineHeight: 20,
  },
  noInterestText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E824C',
    lineHeight: 20,
  },
  withInterestText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1F1B16',
    lineHeight: 20,
  },
  totalText: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 4,
  },
  // Radio selecionado: anel grosso com furo branco no centro (estilo donut do iFood)
  radioSelected: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 7,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  // Radio não selecionado: círculo preenchido em cinza claro sólido (estilo iFood)
  radioUnselected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EEF0F2',
  },
  continueBtn: {
    marginTop: SPACING[4],
    marginBottom: 4,
    height: 48,
    borderRadius: 8,
  },
  continueBtnText: {
    fontSize: 15.5,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#71717A',
  },
  errorContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
    textAlign: 'center',
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: RADIUS.sm,
    backgroundColor: '#F4F4F5',
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
  },
});
