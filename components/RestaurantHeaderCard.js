import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange } from '../utils/authSession';
import { cartStore } from '../utils/cartStore';
import { showSuccessAlert, showErrorAlert } from './ThemedAlert';

export const LOYALTY_TARGET_ORDERS = 10;
export const LOYALTY_CUTOFF_DATE = '2026-11-07T13:40:00.000Z';

const STORAGE_KEY = 'batata_top_loyalty_data_v2';
const LOGO_FALLBACK_URI =
  'https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/logo/logo.png';

const loyaltyListeners = new Set();

function notifyLoyaltyListeners(state) {
  loyaltyListeners.forEach((listener) => {
    try {
      listener(state);
    } catch {}
  });
}

function createInitialLoyaltyState() {
  return {
    ordersCount: 0,
    targetOrders: LOYALTY_TARGET_ORDERS,
    remainingOrders: LOYALTY_TARGET_ORDERS,
    hasRewardAvailable: false,
    rewardsClaimedCount: 0,
    activeRewardCode: null,
    history: [],
  };
}

class LoyaltyManager {
  async getLocalState() {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const count = Math.min(
          LOYALTY_TARGET_ORDERS,
          Math.max(0, Number(parsed.ordersCount) || 0)
        );
        return {
          ordersCount: count,
          targetOrders: LOYALTY_TARGET_ORDERS,
          remainingOrders: Math.max(0, LOYALTY_TARGET_ORDERS - count),
          hasRewardAvailable: count >= LOYALTY_TARGET_ORDERS,
          rewardsClaimedCount: Number(parsed.rewardsClaimedCount) || 0,
          activeRewardCode:
            parsed.activeRewardCode ||
            (count >= LOYALTY_TARGET_ORDERS ? 'BATATA-GRATIS-10' : null),
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      }
    } catch (e) {
      console.warn('Erro ao ler fidelidade do AsyncStorage:', e);
    }

    const initial = createInitialLoyaltyState();
    await this.saveLocalState(initial);
    return initial;
  }

  async saveLocalState(state) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      notifyLoyaltyListeners(state);
    } catch (e) {
      console.warn('Erro ao salvar fidelidade no AsyncStorage:', e);
    }
  }

  async getLoyaltyState(_userId = null) {
    return this.getLocalState();
  }

  async incrementFromOrder({ orderId, orderCreatedAt, orderStatus }) {
    const createdAtMs = new Date(orderCreatedAt).getTime();
    const cutoffMs = new Date(LOYALTY_CUTOFF_DATE).getTime();
    if (createdAtMs < cutoffMs) {
      return this.getLocalState();
    }

    const normalizedStatus = String(orderStatus || '').toLowerCase();
    const isCompleted = ['delivered', 'concluido', 'concluído'].includes(
      normalizedStatus
    );
    if (!isCompleted) {
      return this.getLocalState();
    }

    const current = await this.getLocalState();
    const alreadyCountedKey = `counted_order_${orderId}`;
    try {
      const already = await AsyncStorage.getItem(alreadyCountedKey);
      if (already) return current;
    } catch {}

    const nextCount = Math.min(LOYALTY_TARGET_ORDERS, current.ordersCount + 1);
    const hasReward = nextCount >= LOYALTY_TARGET_ORDERS;
    const generatedCode = hasReward
      ? `BATATA-TOP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      : null;

    const updated = {
      ...current,
      ordersCount: nextCount,
      remainingOrders: Math.max(0, LOYALTY_TARGET_ORDERS - nextCount),
      hasRewardAvailable: hasReward,
      activeRewardCode: generatedCode || current.activeRewardCode,
    };

    try {
      await AsyncStorage.setItem(alreadyCountedKey, '1');
    } catch {}

    await this.saveLocalState(updated);
    return updated;
  }

  async redeemReward(userId = null) {
    const current = await this.getLocalState();
    const couponCode = current.activeRewardCode || 'BATATA-GRATIS-10';

    const newState = {
      ordersCount: 0,
      targetOrders: LOYALTY_TARGET_ORDERS,
      remainingOrders: LOYALTY_TARGET_ORDERS,
      hasRewardAvailable: false,
      rewardsClaimedCount: current.rewardsClaimedCount + 1,
      activeRewardCode: null,
      history: [
        {
          id: Math.random().toString(36).substring(2, 9),
          code: couponCode,
          claimed: true,
          claimedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        ...current.history,
      ],
    };

    await this.saveLocalState(newState);
    return { couponCode, newState };
  }

  async setTestCount(count) {
    const safeCount = Math.max(0, Math.min(LOYALTY_TARGET_ORDERS, count));
    const current = await this.getLocalState();
    const updated = {
      ...current,
      ordersCount: safeCount,
      remainingOrders: Math.max(0, LOYALTY_TARGET_ORDERS - safeCount),
      hasRewardAvailable: safeCount >= LOYALTY_TARGET_ORDERS,
      activeRewardCode:
        safeCount >= LOYALTY_TARGET_ORDERS
          ? current.activeRewardCode || 'BATATA-GRATIS-10'
          : null,
    };
    await this.saveLocalState(updated);
    return updated;
  }
}

export const loyaltyManager = new LoyaltyManager();

export function useLoyalty() {
  const [userId, setUserId] = useState(null);
  const [state, setState] = useState(createInitialLoyaltyState);
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function syncUserAndLoyalty() {
      try {
        const session = await getEffectiveSession();
        const uid = session?.user?.id || null;
        if (mounted) setUserId(uid);
        const s = await loyaltyManager.getLoyaltyState(uid);
        if (mounted) setState(s);
      } catch {
        const s = await loyaltyManager.getLocalState();
        if (mounted) setState(s);
      }
    }

    syncUserAndLoyalty();

    const unsubAuth = subscribeAuthUiChange(() => {
      syncUserAndLoyalty();
    });

    const handleLoyaltyUpdate = (nextState) => {
      if (mounted && nextState) {
        setState(nextState);
      }
    };
    loyaltyListeners.add(handleLoyaltyUpdate);

    return () => {
      mounted = false;
      unsubAuth();
      loyaltyListeners.delete(handleLoyaltyUpdate);
    };
  }, []);

  const redeemReward = useCallback(async () => {
    setIsRedeeming(true);
    try {
      const { couponCode, newState } = await loyaltyManager.redeemReward(userId);
      setState(newState);

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      cartStore.setCoupon({
        id: `loyalty-${couponCode}`,
        code: couponCode,
        codigo: couponCode,
        title: 'Batata Grátis Fidelidade',
        titulo: 'Batata Grátis Fidelidade',
        description: '100% de desconto na sua batata pelo Programa de Fidelidade!',
        descricao: '100% de desconto na sua batata pelo Programa de Fidelidade!',
        discount: 100,
        discount_value: 100,
        type: 'percentage',
        discount_type: 'percentage',
        minOrderValue: 0,
        badgeLabel: '100% OFF',
      });

      showSuccessAlert(
        `Cupom ${couponCode} aplicado na sua sacola. Escolha sua batata favorita!`,
        'Batata Grátis Resgatada!'
      );
    } catch (e) {
      showErrorAlert(e?.message || 'Tente novamente', 'Erro no resgate');
    } finally {
      setIsRedeeming(false);
    }
  }, [userId]);

  const countDeliveredOrder = useCallback(
    async (orderId, createdAt = new Date()) => {
      const updated = await loyaltyManager.incrementFromOrder({
        orderId,
        orderCreatedAt: createdAt,
        orderStatus: 'delivered',
        userId,
      });
      setState(updated);
      if (updated.hasRewardAvailable) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }
      return updated;
    },
    [userId]
  );

  return {
    ...state,
    isRedeeming,
    redeemReward,
    countDeliveredOrder,
    setTestCount: async (n) => {
      const s = await loyaltyManager.setTestCount(n);
      setState(s);
    },
  };
}

export default function RestaurantHeaderCard({
  isOpen: propIsOpen,
  waitTimeMin = 15,
  waitTimeMax = 22,
  isDeliveryFeeEnabled: propIsDeliveryFeeEnabled = false,
  deliveryFee: propDeliveryFee = 0,
  totalOrders = 0,
  onOpenReviews,
}) {
  const router = useRouter();
  const {
    ordersCount,
    targetOrders,
    remainingOrders,
    hasRewardAvailable,
    isRedeeming,
    redeemReward,
  } = useLoyalty();

  const [logoError, setLogoError] = useState(false);
  const [storeOpen, setStoreOpen] = useState(propIsOpen ?? true);
  const [waitTime, setWaitTime] = useState({ min: waitTimeMin, max: waitTimeMax });
  const [isDeliveryFeeEnabled, setIsDeliveryFeeEnabled] = useState(
    propIsDeliveryFeeEnabled
  );
  const [deliveryFee, setDeliveryFee] = useState(propDeliveryFee);

  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);

  const [realOrdersCount, setRealOrdersCount] = useState(totalOrders);
  const [realRating, setRealRating] = useState(4.9);
  const [realReviewsCount, setRealReviewsCount] = useState(0);
  const [reviewsList, setReviewsList] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressPercent = Math.min(
    100,
    Math.max(0, (ordersCount / targetOrders) * 100)
  );

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPercent,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progressPercent, progressAnim]);

  useEffect(() => {
    if (propIsOpen !== undefined) {
      setStoreOpen(propIsOpen);
    }
  }, [propIsOpen]);

  useEffect(() => {
    setIsDeliveryFeeEnabled(propIsDeliveryFeeEnabled);
    setDeliveryFee(propDeliveryFee);
  }, [propIsDeliveryFeeEnabled, propDeliveryFee]);

  // Sincroniza status da loja (store_settings) em tempo real
  useEffect(() => {
    let channel;
    let mounted = true;

    async function fetchStoreSettings() {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('setting_key, setting_value')
          .in('setting_key', ['store_status', 'delivery_settings']);

        if (!mounted || !Array.isArray(data)) return;

        data.forEach((row) => {
          if (row.setting_key === 'store_status' && row.setting_value) {
            const sv = row.setting_value;
            if (sv.isOpen !== undefined && propIsOpen === undefined) {
              setStoreOpen(!!sv.isOpen);
            }
            if (sv.isDeliveryFeeEnabled !== undefined) {
              setIsDeliveryFeeEnabled(!!sv.isDeliveryFeeEnabled);
            }
            if (sv.deliveryFee !== undefined) {
              setDeliveryFee(Number(sv.deliveryFee) || 0);
            }
            if (sv.waitTimeMin || sv.waitTimeMax) {
              setWaitTime({
                min: Number(sv.waitTimeMin) || waitTimeMin,
                max: Number(sv.waitTimeMax) || waitTimeMax,
              });
            }
          }
          if (row.setting_key === 'delivery_settings' && row.setting_value) {
            if (row.setting_value.isDeliveryFeeEnabled !== undefined) {
              setIsDeliveryFeeEnabled(!!row.setting_value.isDeliveryFeeEnabled);
            }
            if (typeof row.setting_value.deliveryFee === 'number') {
              setDeliveryFee(row.setting_value.deliveryFee);
            }
          }
        });
      } catch {}
    }

    fetchStoreSettings();

    try {
      channel = supabase
        .channel('store_status_restaurant_card')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'store_settings',
            filter: 'setting_key=eq.store_status',
          },
          (payload) => {
            if (mounted && payload.new?.setting_value) {
              const sv = payload.new.setting_value;
              if (propIsOpen === undefined && sv.isOpen !== undefined) {
                setStoreOpen(!!sv.isOpen);
              }
              if (sv.isDeliveryFeeEnabled !== undefined) {
                setIsDeliveryFeeEnabled(!!sv.isDeliveryFeeEnabled);
              }
              if (sv.deliveryFee !== undefined) {
                setDeliveryFee(Number(sv.deliveryFee) || 0);
              }
              if (sv.waitTimeMin || sv.waitTimeMax) {
                setWaitTime({
                  min: Number(sv.waitTimeMin) || waitTimeMin,
                  max: Number(sv.waitTimeMax) || waitTimeMax,
                });
              }
            }
          }
        )
        .subscribe();
    } catch {}

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [propIsOpen]);

  const fetchRealStats = useCallback(async () => {
    let fetchedOrders = totalOrders;
    let fetchedRating = 4.9;
    let fetchedReviewsCount = 0;
    let fetchedReviews = [];

    // 1. Total real de pedidos feitos no restaurante
    try {
      const { count, error: countErr } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true });
      if (!countErr && typeof count === 'number') {
        fetchedOrders = Math.max(totalOrders, count);
      }
    } catch {}

    // 2. Média matemática exata de estrelas e lista de avaliações
    try {
      const { data: rawFeedbacks, error: fbError } = await supabase
        .from('feedbacks')
        .select('id, customer_name, rating, comment, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!fbError && Array.isArray(rawFeedbacks) && rawFeedbacks.length > 0) {
        fetchedReviews = rawFeedbacks;
        let sumRatings = 0;
        let validRatingsCount = 0;

        rawFeedbacks.forEach((fb) => {
          const r = Number(fb.rating);
          if (!isNaN(r) && r >= 1 && r <= 5) {
            sumRatings += r;
            validRatingsCount++;
          }
        });

        if (validRatingsCount > 0) {
          fetchedReviewsCount = validRatingsCount;
          fetchedRating = Math.round((sumRatings / validRatingsCount) * 10) / 10;
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar métricas reais do restaurante:', err);
    }

    return {
      totalOrders: fetchedOrders,
      averageRating: fetchedRating,
      totalReviews: fetchedReviewsCount,
      reviews: fetchedReviews,
    };
  }, [totalOrders]);

  useEffect(() => {
    let mounted = true;
    fetchRealStats().then((res) => {
      if (!mounted) return;
      setRealOrdersCount(res.totalOrders);
      setRealRating(res.averageRating);
      setRealReviewsCount(res.totalReviews);
      setReviewsList(res.reviews);
    });
    return () => {
      mounted = false;
    };
  }, [fetchRealStats]);

  const handleOpenReviewsModal = async () => {
    if (onOpenReviews) {
      onOpenReviews();
      return;
    }
    setShowReviewsModal(true);
    if (reviewsList.length === 0) {
      setIsLoadingReviews(true);
      try {
        const res = await fetchRealStats();
        setRealOrdersCount(res.totalOrders);
        setRealRating(res.averageRating);
        setRealReviewsCount(res.totalReviews);
        setReviewsList(res.reviews);
      } catch {}
      setIsLoadingReviews(false);
    }
  };

  const formatReviewDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const animatedWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <>
      {/* CARD FLUTUANTE BRANCO ESTILO IFOOD */}
      <View style={s.card}>
        {/* PARTE SUPERIOR: IDENTIDADE E METADADOS */}
        <View style={s.topRow}>
          {/* Logo Circular Oficial */}
          <View style={s.logoWrapper}>
            <ExpoImage
              source={
                logoError
                  ? { uri: LOGO_FALLBACK_URI }
                  : require('../assets/logo.png')
              }
              style={s.logoImg}
              contentFit="cover"
              cachePolicy="memory-disk"
              onError={() => setLogoError(true)}
            />
          </View>

          {/* Informações Principais */}
          <View style={s.infoCol}>
            {/* Linha 1: Nome + Avaliação + Categorias à esquerda | Super Restaurante + Aberto agora abaixo à direita */}
            <View style={s.headerTopBlock}>
              <View style={s.titleAndCatCol}>
                <View style={s.nameAndRatingRow}>
                  <Text style={s.restaurantName} numberOfLines={1}>
                    Batata Top
                  </Text>

                  <View style={s.ratingInline}>
                    <Ionicons name="star" size={14} color="#FCBB00" />
                    <Text style={s.ratingValue}>{realRating.toFixed(1)}</Text>
                    <Text style={s.ordersCountText}>
                      ({realOrdersCount}{' '}
                      {realOrdersCount === 1 ? 'pedido feito' : 'pedidos feitos'})
                    </Text>
                  </View>
                </View>

                {/* Linha 2: Categorias */}
                <Text style={s.categoriesText} numberOfLines={1}>
                  Batatas Recheadas • Macarrão • Bebidas
                </Text>
              </View>

              {/* Coluna Direita: Selo Super Restaurante */}
              <View style={s.badgesRightCol}>
                <View style={s.superBadge}>
                  <Ionicons name="sparkles" size={11} color="#E3A008" />
                  <Text style={s.superBadgeText}>Super Restaurante</Text>
                </View>
              </View>
            </View>

            {/* Linha 3: Chips Informativos Horizontais */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsScrollContent}
              style={s.chipsScroll}
            >
              {/* Tempo de Preparo */}
              <View style={s.chip}>
                <Ionicons name="time-outline" size={13} color="#E3A008" />
                <Text style={s.chipTextStrong}>
                  {waitTime.min}-{waitTime.max} min
                </Text>
              </View>

              {/* Taxa de Entrega */}
              <View style={s.chip}>
                <MaterialCommunityIcons name="bike" size={14} color="#27AE60" />
                {isDeliveryFeeEnabled && deliveryFee > 0 ? (
                  <Text style={s.chipTextStrong}>
                    Entrega R$ {Number(deliveryFee).toFixed(2).replace('.', ',')}
                  </Text>
                ) : (
                  <Text style={s.chipTextFree}>Entrega Grátis</Text>
                )}
              </View>

              {/* Tag Preparo Artesanal */}
              <View style={s.chip}>
                <MaterialCommunityIcons
                  name="pot-steam-outline"
                  size={14}
                  color="#E3A008"
                />
                <Text style={s.chipTextStrong}>Preparo Artesanal</Text>
              </View>

              {/* Localização */}
              <View style={s.chip}>
                <Ionicons name="location-outline" size={13} color="#C1440E" />
                <Text style={s.chipTextMuted}>Iacanga - SP</Text>
              </View>
            </ScrollView>
          </View>
        </View>

        {/* BOTÕES DE AÇÃO RÁPIDA */}
        <View style={s.actionsRow}>
          <Pressable
            onPress={() => router.push('/cardapio')}
            style={({ pressed }) => [
              s.primaryActionBtn,
              pressed && s.btnPressed,
            ]}
          >
            <Text style={s.primaryActionBtnText}>Fazer pedido</Text>
            <Ionicons name="chevron-forward" size={15} color={COLORS.white} />
          </Pressable>

          <Pressable
            onPress={handleOpenReviewsModal}
            style={({ pressed }) => [
              s.secondaryActionBtn,
              pressed && s.secondaryBtnPressed,
            ]}
          >
            <Ionicons name="star" size={14} color="#FCBB00" />
            <Text style={s.secondaryActionBtnText}>Ver avaliações</Text>
          </Pressable>
        </View>

        {/* BARRA DE FIDELIDADE INTEGRADA NO RODAPÉ DO CARD */}
        <View style={s.loyaltySection}>
          {hasRewardAvailable ? (
            /* ESTADO 10/10 RECOMPENSA */
            <LinearGradient
              colors={['#FEF8EC', '#FFF3D6', '#FEF8EC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.rewardBanner}
            >
              <View style={s.rewardBannerTextRow}>
                <Ionicons name="sparkles" size={18} color="#E3A008" />
                <Text style={s.rewardBannerText}>
                  Parabéns! Você completou{' '}
                  <Text style={s.rewardHighlightDark}>10 pedidos</Text> e ganhou{' '}
                  <Text style={s.rewardHighlightTerracotta}>
                    1 Batata Grátis!
                  </Text>
                </Text>
              </View>

              <Pressable
                onPress={() => setShowRewardModal(true)}
                disabled={isRedeeming}
                style={({ pressed }) => [
                  s.redeemCtaWrapper,
                  pressed && s.btnPressed,
                ]}
              >
                <LinearGradient
                  colors={['#C1440E', '#E3A008']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.redeemCtaGradient}
                >
                  <Ionicons name="gift-outline" size={15} color={COLORS.white} />
                  <Text style={s.redeemCtaText}>Resgatar Batata Grátis</Text>
                </LinearGradient>
              </Pressable>
            </LinearGradient>
          ) : (
            /* ESTADO NORMAL: PROGRESSO DE PEDIDOS */
            <View style={s.loyaltyNormalWrap}>
              <Text style={s.loyaltyMotivationText}>
                Faltam{' '}
                <Text style={s.loyaltyBoldDark}>
                  {remainingOrders}{' '}
                  {remainingOrders === 1 ? 'pedido' : 'pedidos'}
                </Text>{' '}
                para você ganhar{' '}
                <Text style={s.loyaltyBoldTerracotta}>1 Batata Grátis!</Text>
              </Text>

              <View style={s.progressRow}>
                <View style={s.progressTrack}>
                  <Animated.View
                    style={[s.progressFillWrap, { width: animatedWidth }]}
                  >
                    <LinearGradient
                      colors={['#C1440E', '#E3A008', '#27AE60']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={s.progressGradient}
                    />
                  </Animated.View>
                </View>

                <Text style={s.progressCounterText}>
                  {ordersCount}/{targetOrders}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* MODAL DE RESGATE DA BATATA GRÁTIS */}
      <Modal
        visible={showRewardModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowRewardModal(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowRewardModal(false)}
          />
          <View style={s.rewardModalCard}>
            <Pressable
              onPress={() => setShowRewardModal(false)}
              style={s.modalCloseBtn}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color="#71717A" />
            </Pressable>

            <View style={s.rewardAvatarCircle}>
              <Ionicons name="gift" size={30} color="#E3A008" />
            </View>

            <View style={s.rewardPillBadge}>
              <Ionicons name="gift-outline" size={14} color="#E3A008" />
              <Text style={s.rewardPillBadgeText}>
                Fidelidade Batata Top 10/10
              </Text>
            </View>

            <Text style={s.rewardModalTitle}>
              Você Ganhou 1 Batata Grátis!
            </Text>

            <Text style={s.rewardModalDesc}>
              Obrigado pela preferência! Disponibilizaremos um cupom de{' '}
              <Text style={s.rewardModalDescStrong}>100% de desconto</Text> para
              usar no seu próximo pedido e seu ciclo de fidelidade reiniciará.
            </Text>

            <Pressable
              onPress={async () => {
                await redeemReward();
                setShowRewardModal(false);
              }}
              disabled={isRedeeming}
              style={({ pressed }) => [
                s.confirmRedeemBtn,
                pressed && s.btnPressed,
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={18}
                color={COLORS.white}
              />
              <Text style={s.confirmRedeemBtnText}>
                {isRedeeming ? 'Aplicando...' : 'Confirmar e Resgatar Agora'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL DE AVALIAÇÕES DOS CLIENTES (COM DADOS REAIS DO SUPABASE) */}
      <Modal
        visible={showReviewsModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowReviewsModal(false)}
      >
        <View style={s.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowReviewsModal(false)}
          />
          <View style={s.reviewsModalCard}>
            <Pressable
              onPress={() => setShowReviewsModal(false)}
              style={s.modalCloseBtn}
              hitSlop={10}
            >
              <Ionicons name="close" size={20} color="#71717A" />
            </Pressable>

            {/* Cabeçalho do Modal */}
            <View style={s.reviewsModalHeader}>
              <View style={s.reviewsStarCircle}>
                <Ionicons name="star" size={24} color="#FCBB00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.reviewsModalTitle}>Avaliações dos Clientes</Text>
                <Text style={s.reviewsModalSubtitle}>
                  Batata Top • Sincronizado em tempo real
                </Text>
              </View>
            </View>

            {/* Estatísticas Consolidadas */}
            <View style={s.statsSummaryBox}>
              <View style={s.statCol}>
                <Text style={s.statBigValue}>{realRating.toFixed(1)}</Text>
                <View style={s.starsMiniRow}>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Ionicons
                      key={i}
                      name="star"
                      size={13}
                      color={
                        i < Math.round(realRating) ? '#FCBB00' : '#D4D4D8'
                      }
                    />
                  ))}
                </View>
                <Text style={s.statLabel}>Média geral</Text>
              </View>

              <View style={s.statDivider} />

              <View style={s.statCol}>
                <Text style={s.statBigValue}>{realReviewsCount}</Text>
                <Text style={[s.statLabel, { marginTop: 4 }]}>
                  {realReviewsCount === 1 ? 'Avaliação' : 'Avaliações'}
                </Text>
              </View>

              <View style={s.statDivider} />

              <View style={s.statCol}>
                <Text style={[s.statBigValue, { color: '#27AE60' }]}>
                  {realRating >= 4.5
                    ? '99%'
                    : realRating >= 4.0
                    ? '95%'
                    : '90%'}
                </Text>
                <Text style={[s.statLabel, { marginTop: 4 }]}>Recomendam</Text>
              </View>
            </View>

            {/* Lista Real de Feedbacks dos Clientes */}
            <ScrollView
              style={s.reviewsListScroll}
              contentContainerStyle={s.reviewsListContent}
              showsVerticalScrollIndicator={false}
            >
              {isLoadingReviews ? (
                <View style={s.reviewsLoadingBox}>
                  <ActivityIndicator size="small" color="#E3A008" />
                  <Text style={s.reviewsLoadingText}>
                    Carregando avaliações...
                  </Text>
                </View>
              ) : reviewsList.length > 0 ? (
                reviewsList.map((review) => (
                  <View key={review.id} style={s.reviewItemCard}>
                    <View style={s.reviewItemHeader}>
                      <Text style={s.reviewCustomerName} numberOfLines={1}>
                        {review.customer_name || 'Cliente'}
                      </Text>
                      <View style={s.starsMiniRow}>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Ionicons
                            key={i}
                            name="star"
                            size={12}
                            color={
                              i < (review.rating || 5) ? '#FCBB00' : '#D4D4D8'
                            }
                          />
                        ))}
                      </View>
                    </View>

                    {review.comment ? (
                      <Text style={s.reviewCommentText}>
                        “{review.comment}”
                      </Text>
                    ) : (
                      <Text style={s.reviewCommentFallback}>
                        Avaliou com {review.rating || 5} estrelas
                      </Text>
                    )}

                    <Text style={s.reviewDateText}>
                      {formatReviewDate(review.created_at)}
                    </Text>
                  </View>
                ))
              ) : (
                <View style={s.reviewsEmptyBox}>
                  <Ionicons
                    name="chatbox-ellipses-outline"
                    size={32}
                    color="#D4D4D8"
                  />
                  <Text style={s.reviewsEmptyTitle}>
                    Ainda não há avaliações registradas
                  </Text>
                  <Text style={s.reviewsEmptySub}>
                    Faça seu pedido e seja o primeiro a avaliar!
                  </Text>
                </View>
              )}
            </ScrollView>

            <Pressable
              onPress={() => setShowReviewsModal(false)}
              style={({ pressed }) => [
                s.closeModalFooterBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={s.closeModalFooterBtnText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl, // 16px
    padding: SPACING[3], // 12px
    borderWidth: 1,
    borderColor: COLORS.border, // #ECE7E0
    ...SHADOWS.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
  },
  logoWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...SHADOWS.sm,
  },
  logoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTopBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 6,
  },
  titleAndCatCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  badgesRightCol: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  nameAndRatingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  restaurantName: {
    fontSize: TYPOGRAPHY.sizes.lg, // 18
    fontWeight: '900',
    color: COLORS.text, // #1F1B16
    letterSpacing: -0.4,
  },
  ratingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingValue: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
    color: COLORS.text,
  },
  ordersCountText: {
    fontSize: 11,
    fontWeight: '400',
    color: COLORS.grayText, // #71717A
  },
  superBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.warningBg, // #FEF8EC
    borderColor: COLORS.warningBorder, // #FCE8C3
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
  },
  superBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warningText, // #8A6100
  },
  categoriesText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '500',
    color: COLORS.grayText, // #71717A
  },
  chipsScroll: {
    width: '100%',
  },
  chipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.backgroundElevated, // #F7F4EF
    borderColor: COLORS.border, // #ECE7E0
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  chipTextStrong: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  chipTextFree: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success, // #27AE60
  },
  chipTextMuted: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.grayText, // #71717A
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusChipOpen: {
    backgroundColor: '#E8F8EE',
    borderColor: '#BDE8CE',
  },
  statusChipClosed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusChipTextOpen: {
    color: '#1E824C',
  },
  statusChipTextClosed: {
    color: '#B91C1C',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginTop: SPACING[3],
    paddingTop: SPACING[2],
    borderTopWidth: 1,
    borderTopColor: '#F0EDE6',
  },
  primaryActionBtn: {
    flex: 1,
    height: 38,
    backgroundColor: COLORS.primary, // #E3A008
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING[3],
    ...SHADOWS.sm,
  },
  primaryActionBtnText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flex: 1,
    height: 38,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING[3],
  },
  secondaryActionBtnText: {
    color: '#525252',
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '600',
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  secondaryBtnPressed: {
    backgroundColor: '#FAFAFA',
  },

  /* BARRA DE FIDELIDADE */
  loyaltySection: {
    marginTop: SPACING[3],
    paddingTop: SPACING[3],
    borderTopWidth: 1,
    borderTopColor: '#F0EDE6',
  },
  loyaltyNormalWrap: {
    gap: 8,
  },
  loyaltyMotivationText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#404040',
    lineHeight: 16,
  },
  loyaltyBoldDark: {
    fontWeight: '700',
    color: COLORS.text, // #1F1B16
  },
  loyaltyBoldTerracotta: {
    fontWeight: '700',
    color: COLORS.secondary, // #C1440E
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#EAE7E1',
    borderRadius: RADIUS.full,
    padding: 1.5,
    overflow: 'hidden',
  },
  progressFillWrap: {
    height: '100%',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressGradient: {
    flex: 1,
    borderRadius: RADIUS.full,
  },
  progressCounterText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#D97706',
    fontVariant: ['tabular-nums'],
  },

  /* ESTADO 10/10 RECOMPENSA */
  rewardBanner: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#FCE8C3',
    padding: SPACING[3],
    gap: SPACING[2],
  },
  rewardBannerTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rewardBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
    lineHeight: 17,
  },
  rewardHighlightDark: {
    fontWeight: '900',
    color: COLORS.text,
  },
  rewardHighlightTerracotta: {
    fontWeight: '900',
    color: COLORS.secondary,
  },
  redeemCtaWrapper: {
    width: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  redeemCtaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  redeemCtaText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
  },

  /* MODAIS */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING[4],
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  rewardModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING[6],
    borderWidth: 1,
    borderColor: '#FCE8C3',
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  rewardAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF8EC',
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  rewardPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEF8EC',
    borderColor: '#FCE8C3',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginBottom: SPACING[2],
  },
  rewardPillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8A6100',
  },
  rewardModalTitle: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: '900',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  rewardModalDesc: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: '#717171',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: SPACING[5],
  },
  rewardModalDescStrong: {
    fontWeight: '700',
    color: COLORS.secondary,
  },
  confirmRedeemBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOWS.sm,
  },
  confirmRedeemBtnText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '800',
  },

  /* MODAL DE AVALIAÇÕES */
  reviewsModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: SPACING[5],
    borderWidth: 1,
    borderColor: '#E5E5E5',
    ...SHADOWS.lg,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    marginBottom: SPACING[4],
    paddingRight: 28,
  },
  reviewsStarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewsModalTitle: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '900',
    color: COLORS.text,
  },
  reviewsModalSubtitle: {
    fontSize: 11,
    color: '#737373',
    marginTop: 1,
  },
  statsSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FAF8F5',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: SPACING[4],
  },
  statCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statBigValue: {
    fontSize: TYPOGRAPHY.sizes['2xl'],
    fontWeight: '900',
    color: COLORS.text,
  },
  starsMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginVertical: 3,
  },
  statLabel: {
    fontSize: 11,
    color: '#737373',
  },
  statDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E5E5E5',
  },
  reviewsListScroll: {
    maxHeight: 320,
  },
  reviewsListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  reviewsLoadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewsLoadingText: {
    fontSize: 12,
    color: '#A3A3A3',
  },
  reviewItemCard: {
    padding: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  reviewItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  reviewCustomerName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  reviewCommentText: {
    fontSize: 12,
    color: '#525252',
    lineHeight: 17,
  },
  reviewCommentFallback: {
    fontSize: 12,
    color: '#A3A3A3',
    fontStyle: 'italic',
  },
  reviewDateText: {
    fontSize: 10,
    color: '#A3A3A3',
    marginTop: 6,
  },
  reviewsEmptyBox: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#E5E5E5',
  },
  reviewsEmptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#404040',
    marginTop: 8,
  },
  reviewsEmptySub: {
    fontSize: 11,
    color: '#A3A3A3',
    marginTop: 2,
    textAlign: 'center',
  },
  closeModalFooterBtn: {
    marginTop: SPACING[4],
    width: '100%',
    paddingVertical: 11,
    backgroundColor: '#F5F5F5',
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalFooterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#262626',
  },
});
