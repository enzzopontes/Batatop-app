/**
 * components/orders/OrderFeedbackModal.js
 *
 * Bottom Sheet de Avaliação estilo iFood com Funil para a Google Play Store.
 *
 * Regras do CLAUDE.md:
 * - Seção 10: Usa useReanimatedKeyboardAnimation de react-native-keyboard-controller.
 *             NUNCA usa KeyboardAvoidingView nem autoFocus.
 * - Seção 12: Usa ThemedAlertHost + showThemedAlert. NUNCA usa Alert.alert.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import { ThemedAlertHost, showThemedAlert } from '../ThemedAlert';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.batatatop.app';

const RATING_LABELS = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Razoável',
  4: 'Muito bom!',
  5: 'Excelente! Amei a Batata Top!',
};

const POSITIVE_TAGS = [
  '🔥 Quentinha',
  '🥔 Muito bem recheada',
  '🚗 Entrega rápida da Batata Top',
  '📦 Bem embalada',
  '😋 Sabor incrível',
  '❤️ Atendimento nota 10',
];

const NEGATIVE_TAGS = [
  '❄️ Chegou fria',
  '⏳ Demorou para entregar',
  '📦 Embalagem danificada',
  '🧂 Pouco recheio / tempero',
  '❓ Item do pedido errado',
];

export default function OrderFeedbackModal({
  visible,
  order,
  initialRating = 5,
  onClose,
  onSubmitted,
}) {
  const [rating, setRating] = useState(initialRating);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPlayStoreStep, setShowPlayStoreStep] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);

  // Hook nativo de teclado do CLAUDE.md Seção 10
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  useEffect(() => {
    if (visible) {
      setRating(initialRating || 5);
      setSelectedTags([]);
      setComment('');
      setSubmitting(false);
      setShowPlayStoreStep(false);
      setIsAtTop(true);
    }
  }, [visible, initialRating]);

  if (!order) return null;

  const toggleTag = (tag) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleRatingPress = (val) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRating(val);
    setSelectedTags([]); // Reseta tags ao trocar entre positivo e negativo
  };

  const availableTags = rating >= 4 ? POSITIVE_TAGS : NEGATIVE_TAGS;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;

      const payload = {
        order_id: String(order.id),
        user_id: currentUser?.id || order.user_id || null,
        customer_name: order.customer_name || currentUser?.user_metadata?.full_name || 'Cliente',
        customer_phone: order.customer_phone || currentUser?.phone || null,
        rating,
        comment: comment.trim() || null,
        tags: selectedTags,
      };

      const { error } = await supabase.from('feedbacks').insert(payload);
      if (error) throw error;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (onSubmitted) {
        onSubmitted({ orderId: order.id, rating, tags: selectedTags });
      }

      // Funil Review Gating para Play Store
      if (rating >= 4) {
        setShowPlayStoreStep(true);
      } else {
        onClose();
        showThemedAlert(
          'Obrigado pelo feedback!',
          'Sua avaliação foi enviada com sucesso para a Batata Top e nos ajudará a melhorar cada vez mais.'
        );
      }
    } catch (err) {
      showThemedAlert('Erro', 'Não foi possível enviar sua avaliação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPlayStore = async () => {
    try {
      const supported = await Linking.canOpenURL(PLAY_STORE_URL);
      if (supported) {
        await Linking.openURL(PLAY_STORE_URL);
      }
    } catch {}
    onClose();
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0, 0, 0, 0.5)"
      contentStyle={styles.bottomSheet}
      scrollable={!showPlayStoreStep}
      isAtTop={isAtTop}
      minBottomPadding={20}
      extraBottomPadding={12}
    >
      <ThemedAlertHost />

      <Animated.View style={sheetAnimatedStyle}>
        {showPlayStoreStep ? (
          /* Tela 2: Agradecimento Especial + Funil Play Store */
          <View style={styles.playStoreContainer}>
            <View style={styles.celebrationCircle}>
              <Ionicons name="sparkles" size={36} color="#FFB800" />
            </View>

            <Text style={styles.playStoreTitle}>Que alegria! Muito obrigado! ❤️</Text>
            <Text style={styles.playStoreSubtitle}>
              Sua avaliação nota {rating} faz todo o trabalho valer a pena! Você poderia dedicar 30
              segundinhos para nos avaliar também na Play Store? Ajuda muito o nosso negócio local!
            </Text>

            <Pressable style={styles.playStoreBtn} onPress={handleOpenPlayStore}>
              <Ionicons name="logo-google-playstore" size={20} color="#1F1B16" />
              <Text style={styles.playStoreBtnText}>Avaliar também na Play Store</Text>
            </Pressable>

            <Pressable style={styles.closeSimpleBtn} onPress={onClose}>
              <Text style={styles.closeSimpleText}>Concluir</Text>
            </Pressable>
          </View>
        ) : (
          /* Tela 1: Avaliação por Estrelas + Tags + Comentário */
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            onScroll={(e) => setIsAtTop(e.nativeEvent.contentOffset.y <= 0)}
            scrollEventThrottle={16}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Avalie seu pedido</Text>
              <Text style={styles.subtitle}>
                Pedido #{order.order_number || order.orderNumber || order.id?.slice(-4)}
              </Text>
            </View>

            {/* 5 Estrelas Grandes Interativas (40px) */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= rating;
                return (
                  <Pressable
                    key={star}
                    onPress={() => handleRatingPress(star)}
                    hitSlop={8}
                    style={styles.starTouch}
                  >
                    <Ionicons
                      name={filled ? 'star' : 'star-outline'}
                      size={40}
                      color={filled ? '#FFB800' : '#D1D5DB'}
                    />
                  </Pressable>
                );
              })}
            </View>

            {/* Label Dinâmico da Nota */}
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>

            {/* Pílulas de Tags Clicáveis */}
            <Text style={styles.tagsSectionTitle}>
              {rating >= 4 ? 'O que você mais gostou?' : 'O que podemos melhorar?'}
            </Text>

            <View style={styles.tagsWrapper}>
              {availableTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    style={[styles.tagPill, isSelected && styles.tagPillSelected]}
                  >
                    <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Campo de Comentário Opcional */}
            <View style={styles.commentBox}>
              <TextInput
                style={styles.commentInput}
                placeholder="Deixe um recado carinhoso para a Mara ou sugestões (opcional)..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                value={comment}
                onChangeText={setComment}
                maxLength={300}
              />
            </View>

            {/* Botão Enviar Avaliação */}
            <Pressable
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#1F1B16" />
              ) : (
                <Text style={styles.submitBtnText}>Enviar avaliação</Text>
              )}
            </Pressable>
          </ScrollView>
        )}
      </Animated.View>
    </SwipeableBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    maxHeight: '90%',
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1F1B16',
  },
  subtitle: {
    fontSize: 13,
    color: '#717171',
    marginTop: 2,
  },
  // Estrelas
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 10,
  },
  starTouch: {
    padding: 2,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFB800',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Tags
  tagsSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3E3E3E',
    marginBottom: 10,
    textAlign: 'center',
  },
  tagsWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  tagPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F7F7F7',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  tagPillSelected: {
    backgroundColor: '#FFF9E6',
    borderColor: '#FFB800',
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  tagTextSelected: {
    color: '#B45309',
    fontWeight: '700',
  },
  // Comentário
  commentBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 18,
  },
  commentInput: {
    fontSize: 14,
    color: '#1F1B16',
    minHeight: 65,
    textAlignVertical: 'top',
  },
  // Botão Submissão
  submitBtn: {
    backgroundColor: '#FFB800',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F1B16',
  },
  // Play Store Step
  playStoreContainer: {
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  celebrationCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF9E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  playStoreTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#1F1B16',
    textAlign: 'center',
    marginBottom: 8,
  },
  playStoreSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  playStoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFB800',
    width: '100%',
    height: 52,
    borderRadius: 16,
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 12,
  },
  playStoreBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F1B16',
  },
  closeSimpleBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeSimpleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
});
