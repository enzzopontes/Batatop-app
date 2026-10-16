import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
  Image,
  Modal,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { usePedidos } from '../hooks/usePedidos';
import { supabase } from '../../supabaseConfig';
import { checkPixStatus, createPixPayment } from '../../utils/mercadoPago';
import HelpModal from '../../components/HelpModal';
import LiveDeliveryMap from '../../components/orders/LiveDeliveryMap';
import OrderFeedbackModal from '../../components/orders/OrderFeedbackModal';
import { ThemedAlertHost, showThemedAlert } from '../../components/ThemedAlert';
import { useModalFade } from '../hooks/useModalFade';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { notifyAdminNewOrder } from '../../utils/notifyNewOrder';
import { STORE_ADDRESS } from '../../constants/store';

import AnimatedReanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Efeito de Confete Leve Estilo Infinitipay ──────────────────────────────
const CONFETTI_COLORS = ['#FFB800', '#16A34A', '#FFFFFF', '#F59E0B', '#22C55E'];
const CONFETTI_PIECES = Array.from({ length: 24 }).map((_, i) => ({
  id: i,
  startX: ((SCREEN_WIDTH - 32) / 24) * i + 16,
  targetY: -(260 + Math.random() * 240),
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  size: 7 + Math.floor(Math.random() * 5),
  delay: Math.floor(Math.random() * 320),
}));

function ConfettiPiece({ piece, active }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        piece.delay,
        withTiming(1, { duration: 1900, easing: Easing.out(Easing.cubic) })
      );
    } else {
      progress.value = 0;
    }
  }, [active, piece.delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(progress.value, [0, 1], [0, piece.targetY], Extrapolation.CLAMP);
    const opacity = interpolate(progress.value, [0, 0.7, 1], [1, 1, 0], Extrapolation.CLAMP);
    const scale = interpolate(progress.value, [0, 0.15, 1], [0, 1.25, 0.7], Extrapolation.CLAMP);

    return {
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  if (!active) return null;

  return (
    <AnimatedReanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: 120,
          left: piece.startX,
          width: piece.size,
          height: piece.size * 1.5,
          backgroundColor: piece.color,
          borderRadius: 2,
          zIndex: 9999,
        },
        animatedStyle,
      ]}
    />
  );
}

function ConfettiExplosion({ active }) {
  if (!active) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {CONFETTI_PIECES.map((p) => (
        <ConfettiPiece key={p.id} piece={p} active={active} />
      ))}
    </View>
  );
}

// ─── Componente de Bolinha Pulsante (Efeito Radar iFood) ─────────────────────

function PulsingRadarDot({ color = '#FFB800' }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.timing(pulseAnim, {
          toValue: 2.2,
          duration: 1300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 1300,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim, opacityAnim]);

  return (
    <View style={pb.radarWrapper}>
      <Animated.View
        style={[
          pb.radarWave,
          {
            backgroundColor: color,
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      <View style={[pb.radarCore, { backgroundColor: color }]} />
    </View>
  );
}

// ─── Constantes de status ─────────────────────────────────────────────────────

const STATUS_LABELS = {
  awaiting_payment: 'Aguardando pagamento',
  pending: 'Pedido confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto para entrega',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Pedido entregue',
  cancelled: 'Cancelado',
};

const STATUS_ICONS = {
  awaiting_payment: 'time-outline',
  pending: 'receipt-outline',
  preparing: 'flame-outline',
  ready: 'checkmark-circle-outline',
  out_for_delivery: 'car-outline',
  delivered: 'checkmark-done-circle-outline',
  cancelled: 'close-circle-outline',
};

const STATUS_COLORS = {
  awaiting_payment: '#E61E2A',
  pending: '#D97706',
  preparing: '#EA580C',
  ready: '#2563EB',
  out_for_delivery: '#1E40AF',
  delivered: '#16A34A',
  cancelled: '#DC2626',
};

const STATUS_BG = {
  awaiting_payment: '#FEE2E2',
  pending: '#FEF3C7',
  preparing: '#FFF7ED',
  ready: '#EFF6FF',
  out_for_delivery: '#DBEAFE',
  delivered: '#F0FDF4',
  cancelled: '#FEF2F2',
};

const PAYMENT_LABELS = {
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  pix: 'Pix',
};

// ─── Linha do Tempo 5 Etapas Estilo iFood ─────────────────────────────────────

const getTimelineStepIndex = (status, isPixAwaiting = false) => {
  if (isPixAwaiting) return 0;
  switch (status) {
    case 'awaiting_payment':
      return 0; // Pedido realizado
    case 'pending':
      return 1; // Pagamento confirmado
    case 'preparing':
      return 2; // Em preparo
    case 'ready':
      return 2.5; // Pronto / A caminho
    case 'out_for_delivery':
      return 3; // Saiu para entrega
    case 'delivered':
      return 4; // Entregue
    default:
      return 0;
  }
};

function ProgressBar({ status, isPixAwaiting = false }) {
  if (status === 'cancelled') return null;

  const currentStep = getTimelineStepIndex(status, isPixAwaiting);
  const steps = ['Realizado', 'Confirmado', 'Em preparo', 'A caminho', 'Entregue'];
  const progressPercent = Math.min(100, Math.max(0, (currentStep / (steps.length - 1)) * 100));

  return (
    <View style={pb.wrapper}>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${progressPercent}%` }]} />
      </View>
      <View style={pb.dotsRow}>
        {steps.map((label, i) => {
          const isPassed = i < Math.floor(currentStep);
          const isActive = i === Math.floor(currentStep) && status !== 'delivered';
          const isDelivered = status === 'delivered' && i === 4;

          return (
            <View key={label} style={pb.dotCol}>
              <View style={pb.dotPlaceholder}>
                {isActive ? (
                  <PulsingRadarDot color="#FFB800" />
                ) : isPassed || isDelivered ? (
                  <View style={[pb.dot, pb.dotPassed]}>
                    <Ionicons name="checkmark" size={9} color="#FFF" />
                  </View>
                ) : (
                  <View style={pb.dot} />
                )}
              </View>
              <Text
                style={[
                  pb.dotLabel,
                  (isPassed || isActive || isDelivered) && pb.dotLabelActive,
                  isActive && pb.dotLabelCurrent,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Helper de Extração Segura de Dados do Pix (Cascata Multichaves) ──────────

function extractPixData(pedido) {
  if (!pedido) {
    return {
      isPixMethod: false,
      pixData: {},
      qrCodeText: '',
      qrCodeBase64: '',
      ticketUrl: '',
      pixExpRaw: null,
      paymentId: null,
      isPixAwaiting: false,
    };
  }

  const isPixMethod =
    pedido.paymentMethod === 'pix' ||
    pedido.paymentMethod?.toLowerCase() === 'pix' ||
    pedido.paymentMethod?.toLowerCase()?.includes('pix');

  const metadata = pedido.metadata || {};
  const pixData = metadata.pix || metadata || {};

  const qrCodeText =
    pixData.pix_qr_code ||
    pixData.qr_code ||
    pixData.qrCode ||
    pixData.point_of_interaction?.transaction_data?.qr_code ||
    metadata.pix_qr_code ||
    metadata.qr_code ||
    metadata.pix_code ||
    metadata.pixCode ||
    '';

  const qrCodeBase64 =
    pixData.pix_qr_code_base64 ||
    pixData.qr_code_base64 ||
    pixData.qrCodeBase64 ||
    pixData.point_of_interaction?.transaction_data?.qr_code_base64 ||
    metadata.pix_qr_code_base64 ||
    metadata.qr_code_base64 ||
    '';

  const ticketUrl =
    pixData.ticket_url ||
    pixData.point_of_interaction?.transaction_data?.ticket_url ||
    metadata.ticket_url ||
    metadata.init_point ||
    metadata.payment_link ||
    metadata.pix?.ticket_url ||
    '';

  const pixExpRaw =
    pixData.expirationDate ||
    pixData.expiration_date ||
    pixData.date_of_expiration ||
    metadata.date_of_expiration ||
    metadata.pix?.expirationDate ||
    metadata.pix?.expiration_date ||
    metadata.pix?.date_of_expiration;

  const paymentId =
    pixData.payment_id ||
    pixData.id ||
    pixData.order_id ||
    metadata.pix?.payment_id ||
    metadata.pix?.id ||
    metadata.pix?.order_id ||
    metadata.payment_id;

  const isPixAwaiting =
    (pedido.status === 'awaiting_payment' || (pedido.status === 'pending' && isPixMethod)) &&
    (isPixMethod || !!qrCodeText);

  return {
    isPixMethod,
    pixData,
    qrCodeText,
    qrCodeBase64,
    ticketUrl,
    pixExpRaw,
    paymentId,
    isPixAwaiting,
  };
}

// ─── Tela de detalhe ──────────────────────────────────────────────────────────

export default function DetalhesPedido() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { buscarPedidoPorId } = usePedidos();
  const insets = useSafeAreaInsets();

  const [pedido, setPedido] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const { mounted: cancelModalMounted, fadeAnim: cancelModalFade } = useModalFade(showCancelModal);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const hasTriggeredExpiryFetchRef = useRef(false);
  const [confirmingDelivered, setConfirmingDelivered] = useState(false);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const pixFadeAnim = useRef(new Animated.Value(1)).current;
  const [showConfetti, setShowConfetti] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const bannerFadeAnim = useRef(new Animated.Value(0)).current;
  const hasTriggeredSuccessRef = useRef(false);
  const scrollViewRef = useRef(null);
  const [isTrackingActive, setIsTrackingActive] = useState(false);

  const {
    isPixMethod,
    qrCodeText,
    qrCodeBase64,
    ticketUrl,
    pixExpRaw,
    paymentId: mpPaymentId,
    isPixAwaiting,
  } = extractPixData(pedido);

  // Fallback seguro: se não houver base64, gera via API online de QR Code
  const qrImageUri = qrCodeBase64
    ? `data:image/png;base64,${qrCodeBase64}`
    : qrCodeText
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeText)}`
    : null;

  const pedidoRef = useRef(pedido);
  pedidoRef.current = pedido;
  const isPixAwaitingRef = useRef(isPixAwaiting);
  isPixAwaitingRef.current = isPixAwaiting;
  const hasRequestedPixForIdRef = useRef(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixGenError, setPixGenError] = useState(null);

  const requestPixQrCode = useCallback(async (orderIdToFetch) => {
    if (!orderIdToFetch) return;
    setGeneratingPix(true);
    setPixGenError(null);
    try {
      const res = await createPixPayment(orderIdToFetch);
      const qrCodeVal = res?.qrCode || res?.qr_code || '';
      const qrBase64Val = res?.qrCodeBase64 || res?.qr_code_base64 || '';
      if (res?.success && (qrCodeVal || qrBase64Val)) {
        const pixPatch = {
          payment_id: String(res.paymentId || res.id || ''),
          qr_code: qrCodeVal,
          qr_code_base64: qrBase64Val,
          ticket_url: res.ticketUrl || res.ticket_url || '',
          expiration_date: res.expirationDate || res.expiration_date || null,
        };
        setPedido((prev) =>
          prev
            ? {
                ...prev,
                metadata: {
                  ...(prev.metadata || {}),
                  pix: pixPatch,
                },
              }
            : prev
        );
        try {
          await supabase.rpc('merge_order_metadata', {
            order_id: orderIdToFetch,
            patch: { pix: pixPatch },
          });
        } catch {}
      } else {
        setPixGenError(res?.error || 'Não foi possível gerar o QR Code Pix.');
      }
    } catch (e) {
      setPixGenError(e?.message || 'Erro ao gerar QR Code Pix.');
    } finally {
      setGeneratingPix(false);
    }
  }, []);

  useEffect(() => {
    if (!pedido?.id || !isPixAwaiting || qrCodeText || qrCodeBase64) return;
    if (hasRequestedPixForIdRef.current === pedido.id) return;
    hasRequestedPixForIdRef.current = pedido.id;
    requestPixQrCode(pedido.id);
  }, [pedido?.id, isPixAwaiting, qrCodeText, qrCodeBase64, requestPixQrCode]);

  // Monitora se o rastreio em tempo real está ativo com coordenadas válidas
  useEffect(() => {
    if (pedido?.status !== 'out_for_delivery') {
      setIsTrackingActive(false);
      return;
    }

    let channel = null;

    async function checkLiveTracking() {
      try {
        const { data } = await supabase
          .from('delivery_tracking')
          .select('is_active, driver_lat, driver_lng')
          .eq('id', 'live')
          .single();

        const active = Boolean(data?.is_active && data?.driver_lat && data?.driver_lng);
        setIsTrackingActive(active);

        channel = supabase
          .channel(`delivery-active-${Date.now()}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'delivery_tracking',
              filter: 'id=eq.live',
            },
            (payload) => {
              const row = payload.new;
              setIsTrackingActive(Boolean(row?.is_active && row?.driver_lat && row?.driver_lng));
            }
          )
          .subscribe();
      } catch {
        const metaLat = pedido?.deliveryLat ?? pedido?.metadata?.driver_lat;
        const metaLng = pedido?.deliveryLng ?? pedido?.metadata?.driver_lng;
        setIsTrackingActive(Boolean(metaLat && metaLng));
      }
    }

    checkLiveTracking();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [pedido?.status, pedido?.deliveryLat, pedido?.deliveryLng, pedido?.metadata?.driver_lat, pedido?.metadata?.driver_lng]);

  const triggerPaymentSuccess = useCallback(() => {
    if (hasTriggeredSuccessRef.current) return;
    hasTriggeredSuccessRef.current = true;
    setShowConfetti(true);
    setShowSuccessBanner(true);
    Animated.timing(bannerFadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    notifyAdminNewOrder(pedido?.id || id).catch(() => {});

    Animated.timing(pixFadeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      setPedido((prev) => (prev ? { ...prev, status: 'preparing' } : prev));
    });

    setTimeout(() => {
      setShowConfetti(false);
    }, 2500);

    setTimeout(() => {
      Animated.timing(bannerFadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowSuccessBanner(false);
      });
    }, 4500);
  }, [bannerFadeAnim, pixFadeAnim, pedido?.id, id]);

  const handleConfirmDelivered = async () => {
    if (!pedido) return;
    setConfirmingDelivered(true);
    try {
      const { data, error } = await supabase.rpc('confirm_order_delivered_user', {
        p_order_id: pedido.id,
      });
      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showThemedAlert('Pedido entregue!', 'Obrigado por confirmar o recebimento do seu pedido!');
      await carregarPedido({ silent: true });
      setFeedbackModalVisible(true);
    } catch (err) {
      showThemedAlert('Erro', 'Não foi possível confirmar o recebimento. Tente novamente.');
    } finally {
      setConfirmingDelivered(false);
    }
  };

  const CANCEL_ERROR_MESSAGES = {
    order_status_not_cancellable: 'Esse pedido já está a caminho e não pode mais ser cancelado.',
    forbidden_not_owner: 'Pedido não encontrado.',
    order_not_found: 'Pedido não encontrado.',
    unauthorized: 'Faça login novamente.',
  };

  const carregarPedido = useCallback(async ({ silent = false } = {}) => {
    if (!id) return null;
    if (!silent) setInitialLoading(true);
    try {
      const resultado = await buscarPedidoPorId(id);
      if (resultado.success) {
        setPedido(resultado.data);
        return resultado.data;
      } else if (!silent) {
        setErro(true);
      }
    } catch {
      if (!silent) setErro(true);
    } finally {
      if (!silent) setInitialLoading(false);
    }
    return null;
  }, [id, buscarPedidoPorId]);

  const carregarPedidoRef = useRef(carregarPedido);
  carregarPedidoRef.current = carregarPedido;

  // a) Assinar Realtime UPDATE na linha do pedido de forma estável (sem loops)
  useEffect(() => {
    if (!id) return;

    carregarPedidoRef.current();

    const channelName = `order-detail-${id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.new?.status && payload.new.status !== 'awaiting_payment' && payload.new.status !== 'cancelled') {
            if (isPixAwaitingRef.current || payload.old?.status === 'awaiting_payment' || pedidoRef.current?.status === 'awaiting_payment') {
              triggerPaymentSuccess();
            }
          }
          carregarPedidoRef.current({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, triggerPaymentSuccess]);

  // ── Contagem regressiva do PIX (15 minutos = 900 segundos) ──────────────────
  const PIX_TOTAL_SECONDS = 15 * 60; // 900s

  useEffect(() => {
    if (!pedido?.id || !isPixAwaiting) {
      setRemainingSeconds(null);
      hasTriggeredExpiryFetchRef.current = false;
      return;
    }

    const expTime = pixExpRaw
      ? new Date(pixExpRaw).getTime()
      : pedido.createdAt
      ? new Date(pedido.createdAt).getTime() + PIX_TOTAL_SECONDS * 1000
      : Date.now() + PIX_TOTAL_SECONDS * 1000;

    const tick = async () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expTime - now) / 1000));
      setRemainingSeconds(diff);

      if (diff <= 0) {
        if (!hasTriggeredExpiryFetchRef.current) {
          hasTriggeredExpiryFetchRef.current = true;
          setPedido((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
          try {
            await supabase.rpc('cancel_order_user', { p_order_id: pedido.id });
          } catch {}
          showThemedAlert(
            'Pix Expirado',
            'O tempo limite de 15 minutos para pagamento via Pix expirou. Faça um novo pedido se desejar.'
          );
          carregarPedidoRef.current({ silent: true });
        }
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    pedido?.id,
    isPixAwaiting,
    pedido?.createdAt,
    pixExpRaw,
  ]);

  // b) Polling ativo a cada 3 segundos no Mercado Pago
  useEffect(() => {
    if (!isPixAwaiting || !mpPaymentId) return;

    let isPollingActive = true;
    const interval = setInterval(async () => {
      if (!isPollingActive) return;
      const result = await checkPixStatus(mpPaymentId);
      if (!result.success || !isPollingActive) return;

      const isPaid =
        result.statusDetail === 'accredited' ||
        result.paymentStatus === 'approved' ||
        result.status === 'approved' ||
        result.status === 'processed';

      if (isPaid) {
        isPollingActive = false;
        clearInterval(interval);
        triggerPaymentSuccess();

        // Relê até 5 vezes com intervalo de 2s até o Supabase refletir
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const updated = await carregarPedidoRef.current({ silent: true });
          if (updated && updated.status !== 'awaiting_payment') {
            break;
          }
        }
      } else if (
        result.status === 'cancelled' ||
        result.status === 'rejected' ||
        result.statusDetail === 'expired'
      ) {
        isPollingActive = false;
        clearInterval(interval);
        setPedido((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
        await carregarPedidoRef.current({ silent: true });
      }
    }, 3000);

    return () => {
      isPollingActive = false;
      clearInterval(interval);
    };
  }, [isPixAwaiting, mpPaymentId, triggerPaymentSuccess]);

  // c) Fallback: refetch a cada 30s enquanto o status não for final (delivered/cancelled)
  useEffect(() => {
    if (!pedido?.id) return;
    const isFinal = pedido.status === 'delivered' || pedido.status === 'cancelled';
    if (isFinal) return;

    const fallbackTimer = setInterval(() => {
      carregarPedidoRef.current({ silent: true });
    }, 30000);

    return () => clearInterval(fallbackTimer);
  }, [pedido?.id, pedido?.status]);

  const handleCancelOrder = () => {
    if (!pedido) return;
    setShowCancelModal(true);
  };

  const confirmCancelOrder = async () => {
    if (!pedido) return;
    const numLocal = pedido.orderNumber || pedido.id.slice(-4).toUpperCase();
    setShowCancelModal(false);
    setCancelling(true);
    try {
      const { error } = await supabase.rpc('cancel_order_user', {
        p_order_id: pedido.id,
      });

      if (error) {
        const msg = CANCEL_ERROR_MESSAGES[error.message] || error.message || 'Não foi possível cancelar o pedido.';
        showThemedAlert('Atenção', msg);
        return;
      }

      await carregarPedido({ silent: true });

      const msg = encodeURIComponent(
        `Olá, gostaria de cancelar meu pedido #${numLocal}.\n\n*Detalhes do Pedido:*\nCliente: ${pedido.customerName}\nTotal: R$ ${pedido.total.toFixed(2).replace('.', ',')}`
      );
      Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
    } catch (err) {
      const msg = CANCEL_ERROR_MESSAGES[err?.message] || err?.message || 'Não foi possível cancelar o pedido. Entre em contato pelo WhatsApp.';
      showThemedAlert('Erro', msg);
    } finally {
      setCancelling(false);
    }
  };

  const handleWhatsApp = () => {
    if (!pedido) return;
    const num = pedido.orderNumber || pedido.id.slice(-4).toUpperCase();
    const msg = encodeURIComponent(
      `Olá, preciso de ajuda com o meu pedido #${num}.\nCliente: ${pedido.customerName}\nTotal: R$ ${pedido.total.toFixed(2).replace('.', ',')}`
    );
    Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if ((initialLoading && !pedido) || (!pedido && !erro)) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Carregando pedido...</Text>
      </View>
    );
  }

  // ── Erro ─────────────────────────────────────────────────────────────────────
  if (erro || !pedido) {
    return (
      <View style={s.centered}>
        <Ionicons name="alert-circle-outline" size={56} color={COLORS.border} />
        <Text style={s.errorTitle}>Pedido não encontrado</Text>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  const num = pedido.orderNumber || pedido.id.slice(-4).toUpperCase();
  const statusColor = STATUS_COLORS[pedido.status] ?? COLORS.textMuted;
  const statusBg = STATUS_BG[pedido.status] ?? COLORS.borderLight;
  const statusLabel = STATUS_LABELS[pedido.status] ?? pedido.status;
  const statusIcon = STATUS_ICONS[pedido.status] ?? 'bag-outline';

  const timeStr = pedido.createdAt
    ? pedido.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  const paymentLabel =
    PAYMENT_LABELS[pedido.paymentMethod] ||
    pedido.paymentMethod?.toUpperCase() ||
    '—';

  const enderecoCompleto = [
    pedido.address,
    pedido.complement,
    pedido.neighborhood,
  ]
    .filter(Boolean)
    .join(', ');

  const isOutForDelivery = pedido.status === 'out_for_delivery';
  const shouldShowMap = isOutForDelivery && isTrackingActive;
  const hasArrived = !!pedido.metadata?.arrived_at;

  const isUrgentTimer = remainingSeconds !== null && remainingSeconds <= 300;
  const timerColor = isUrgentTimer ? '#E61E2A' : '#B45309';
  const timerBarColor = isUrgentTimer ? '#E61E2A' : '#FFB800';
  const timerTrackBg = isUrgentTimer ? '#FEE2E2' : '#FEF3C7';

  const itemsSubtotal = (pedido.items || []).reduce(
    (sum, i) => sum + Number(i.price || 0) * (Number(i.quantity || 1) || 1),
    0
  );
  const deliveryFee = pedido.deliveryType === 'retirada' ? 0 : Number(pedido.metadata?.delivery_fee || 0);
  const discountVal = Number(pedido.discountAmount || pedido.discount || 0);

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <ThemedAlertHost />

      {/* Header Minimalista Padrão no Topo */}
      <View style={[s.minimalHeader, { paddingTop: insets.top }]}>
        <View style={s.minimalHeaderContent}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/pedidos'))}
            hitSlop={12}
            style={s.backBtnHeader}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.text} />
          </Pressable>
          <View style={s.minimalHeaderCenter}>
            <Text style={s.minimalHeaderTitle}>Pedido #{num}</Text>
            {timeStr ? <Text style={s.minimalHeaderSub}>Realizado às {timeStr}</Text> : null}
          </View>
          <Pressable onPress={handleWhatsApp} hitSlop={12} style={s.helpBtnHeader}>
            <Text style={s.helpBtnHeaderText}>Ajuda</Text>
          </Pressable>
        </View>
      </View>

      {/* Banner Festivo de Aprovação Pix */}
      {showSuccessBanner && (
        <Animated.View style={[s.festiveBanner, { opacity: bannerFadeAnim }]}>
          <Ionicons name="sparkles" size={18} color="#FFF" />
          <Text style={s.festiveBannerText}>
            🎉 Pagamento aprovado com sucesso! Sua batata já está sendo preparada.
          </Text>
        </Animated.View>
      )}

      {/* Mapa da Batata Top (LiveDeliveryMap) EXCLUSIVO quando rastreio ativo e em rota */}
      {shouldShowMap && (
        <View style={s.mapWrapper}>
          <LiveDeliveryMap order={pedido} height={240} />
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          {
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom, 16) + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner de Chegada da Batata Top no Portão */}
        {hasArrived && (
          <View style={s.arrivedBanner}>
            <View style={s.arrivedIconCircle}>
              <Ionicons name="car" size={24} color="#FFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.arrivedTitle}>A Batata Top chegou no seu portão!</Text>
              <Text style={s.arrivedSub}>Vá receber sua batata quentinha e deliciosa.</Text>
            </View>
          </View>
        )}

        {/* CARD 1 — Status & Linha do Tempo */}
        <View style={s.card}>
          <View style={s.statusRow}>
            <View style={[s.statusIconBox, { backgroundColor: statusBg }]}>
              <Ionicons name={statusIcon} size={24} color={statusColor} />
            </View>
            <View style={s.statusInfo}>
              <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
              {timeStr ? <Text style={s.statusTime}>Realizado às {timeStr}</Text> : null}
              {pedido.metadata?.eta_minutes && pedido.status !== 'delivered' && pedido.status !== 'cancelled' ? (
                <Text style={s.etaText}>Previsão de entrega: ~{pedido.metadata.eta_minutes} min</Text>
              ) : null}
            </View>
          </View>

          <ProgressBar status={pedido.status} isPixAwaiting={isPixAwaiting} />

          {/* Botão Secundário: Já recebi meu pedido */}
          {(isOutForDelivery || hasArrived) && (
            <Pressable
              style={s.confirmReceivedBtn}
              onPress={handleConfirmDelivered}
              disabled={confirmingDelivered}
            >
              {confirmingDelivered ? (
                <ActivityIndicator size="small" color="#1F1B16" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#1F1B16" />
                  <Text style={s.confirmReceivedText}>Já recebi meu pedido</Text>
                </>
              )}
            </Pressable>
          )}

          {/* Botão de Avaliação quando Entregue */}
          {pedido.status === 'delivered' && (
            <Pressable
              style={s.feedbackCardBtn}
              onPress={() => setFeedbackModalVisible(true)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="star" size={20} color="#FFB800" />
                <Text style={s.feedbackCardBtnTitle}>Avaliar este pedido</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#FFB800" />
            </Pressable>
          )}
        </View>

        {/* CARD PIX — Cobrança PIX Fintech (Fica em segundo lugar, logo abaixo do Status) */}
        {isPixAwaiting && (
          <Animated.View style={[s.card, s.paymentBox, { opacity: pixFadeAnim }]}>
            {/* 1. Cabeçalho */}
            <View style={s.pixHeader}>
              <View style={s.pixHeaderIconBox}>
                <Ionicons name="qr-code" size={22} color="#16A34A" />
              </View>
              <View style={s.pixHeaderTextCol}>
                <Text style={s.pixHeaderTitle}>Pagamento via Pix</Text>
                <Text style={s.pixHeaderSub}>Aprovação imediata</Text>
              </View>
            </View>

            <View style={s.pixDivider} />

            {/* 2. Barra de Tempo Regressiva (Amarelo -> Vermelho nos últimos 5 min) */}
            <View style={s.timerHeaderRow}>
              <View style={s.timerLabelRow}>
                <Ionicons name="time-outline" size={15} color={timerColor} />
                <Text style={[s.timerUrgentLabel, { color: timerColor }]}>Tempo para pagar</Text>
              </View>
              <Text style={[s.timerUrgentCountdown, { color: timerColor }]}>
                {remainingSeconds !== null && remainingSeconds > 0
                  ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`
                  : '00:00'}
              </Text>
            </View>

            <View style={[s.countdownTrack, { backgroundColor: timerTrackBg }]}>
              <View
                style={[
                  s.countdownFill,
                  {
                    backgroundColor: timerBarColor,
                    width: `${remainingSeconds !== null ? Math.min(100, Math.max(0, (remainingSeconds / 900) * 100)) : 100}%`,
                  },
                ]}
              />
            </View>

            {/* 3. QR Code Centralizado (base64 ou gerador visual instantâneo) */}
            {qrImageUri ? (
              <View style={s.qrContainer}>
                <Image
                  source={{ uri: qrImageUri }}
                  style={s.qrImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <Pressable
                style={s.qrFallbackContainer}
                onPress={() => {
                  if (!generatingPix && pedido?.id) {
                    requestPixQrCode(pedido.id);
                  }
                }}
              >
                {generatingPix ? (
                  <>
                    <ActivityIndicator size="small" color="#FFB800" />
                    <Text style={s.qrFallbackTitle}>Gerando QR Code Pix...</Text>
                    <Text style={s.qrFallbackSub}>Aguarde alguns instantes</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh-circle" size={32} color="#D97706" />
                    <Text style={s.qrFallbackTitle}>
                      {pixGenError || 'Gerando QR Code Pix...'}
                    </Text>
                    <Text style={s.qrFallbackSub}>Toque aqui para gerar novamente</Text>
                  </>
                )}
              </Pressable>
            )}

            {/* 4. Caixa Copia e Cola */}
            {qrCodeText ? (
              <View style={s.pixCodeBox}>
                <Text style={s.pixCodeText} numberOfLines={2}>
                  {qrCodeText}
                </Text>
              </View>
            ) : null}

            {/* 5. Botões de Ação Animados (Copiar Pix e Copiar Link) */}
            <View style={s.pixActionsCol}>
              {qrCodeText ? (
                <Pressable
                  style={[s.copyBtn, copied && s.copyBtnActive]}
                  onPress={async () => {
                    await Clipboard.setStringAsync(qrCodeText);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  }}
                >
                  <Ionicons
                    name={copied ? 'checkmark-circle' : 'copy-outline'}
                    size={18}
                    color={copied ? '#FFFFFF' : '#1F1B16'}
                  />
                  <Text style={[s.copyBtnText, copied && s.copyBtnTextActive]}>
                    {copied ? 'Código copiado! Cole no app do seu banco' : 'Copiar código Pix'}
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                style={[s.copyLinkBtn, copiedLink && s.copyBtnActive]}
                onPress={async () => {
                  const payTarget = ticketUrl || qrCodeText;
                  if (payTarget) {
                    await Clipboard.setStringAsync(payTarget);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  } else if (pedido?.id) {
                    await requestPixQrCode(pedido.id);
                  }
                }}
              >
                <Ionicons
                  name={copiedLink ? 'checkmark-circle' : 'link-outline'}
                  size={18}
                  color={copiedLink ? '#FFFFFF' : '#1F1B16'}
                />
                <Text style={[s.copyLinkBtnText, copiedLink && s.copyBtnTextActive]}>
                  {copiedLink ? 'Link copiado com sucesso!' : 'Copiar link para pagar'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* CARD 2 — Endereço de Entrega ou Retirada */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons
              name={pedido.deliveryType === 'retirada' ? 'storefront-outline' : 'location-sharp'}
              size={20}
              color="#EA580C"
            />
            <Text style={s.sectionTitle}>
              {pedido.deliveryType === 'retirada' ? 'Retirada na Loja' : 'Endereço de Entrega'}
            </Text>
          </View>
          <View style={s.divider} />

          {pedido.deliveryType === 'retirada' ? (
            <View style={s.addressDetailsCol}>
              <Text style={s.addressMainText}>Batata Top — Balcão Principal</Text>
              <Text style={s.addressSubText}>{STORE_ADDRESS.full}</Text>
              <Text style={s.addressHintText}>Apresente o número do pedido #{num} ao chegar.</Text>
            </View>
          ) : (
            <View style={s.addressDetailsCol}>
              <Text style={s.addressMainText}>{pedido.address || 'Endereço não informado'}</Text>
              {pedido.complement ? <Text style={s.addressSubText}>Complemento: {pedido.complement}</Text> : null}
              {pedido.neighborhood ? <Text style={s.addressSubText}>Bairro: {pedido.neighborhood}</Text> : null}
              <Text style={s.addressCityText}>Iacanga - SP</Text>
            </View>
          )}
        </View>

        {/* CARD 3 — Itens do Pedido */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons name="receipt-outline" size={20} color="#EA580C" />
            <Text style={s.sectionTitle}>Itens do Pedido ({pedido.items?.length || 0})</Text>
          </View>
          <View style={s.divider} />

          {pedido.items && pedido.items.length > 0 ? (
            pedido.items.map((item, idx) => {
              const adicList = (item.adicionais || [])
                .map((a) => (typeof a === 'string' ? a : a?.name || a?.nome))
                .filter(Boolean);

              return (
                <View key={idx}>
                  <View style={s.itemRow}>
                    <View style={s.itemQtyBox}>
                      <Text style={s.itemQtyText}>{item.quantity}x</Text>
                    </View>
                    <View style={s.itemDetailsCol}>
                      <Text style={s.itemName}>{item.name}</Text>
                      {adicList.length > 0 ? (
                        <Text style={s.itemAdicionais}>+ {adicList.join(', ')}</Text>
                      ) : null}
                      {item.pastaType ? (
                        <Text style={s.itemAdicionais}>Massa: {item.pastaType}</Text>
                      ) : null}
                      {item.notes ? (
                        <Text style={s.itemNotes}>Obs: {item.notes}</Text>
                      ) : null}
                    </View>
                    <Text style={s.itemPrice}>
                      R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                  {idx < pedido.items.length - 1 && <View style={s.itemDivider} />}
                </View>
              );
            })
          ) : (
            <Text style={s.noItems}>Itens indisponíveis</Text>
          )}

          {pedido.notes ? (
            <View style={s.orderNotesRow}>
              <Text style={s.orderNotesLabel}>Observações do pedido:</Text>
              <Text style={s.orderNotesText}>{pedido.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* CARD 4 — Resumo de Valores & Pagamento */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons name="wallet-outline" size={20} color="#EA580C" />
            <Text style={s.sectionTitle}>Resumo de Valores</Text>
          </View>
          <View style={s.divider} />

          {/* Subtotal */}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Subtotal dos itens</Text>
            <Text style={s.summaryValue}>
              R$ {itemsSubtotal.toFixed(2).replace('.', ',')}
            </Text>
          </View>

          {/* Taxa de Entrega */}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Taxa de entrega</Text>
            <Text style={[s.summaryValue, deliveryFee === 0 && { color: '#16A34A', fontWeight: '800' }]}>
              {deliveryFee === 0 ? 'Grátis' : `R$ ${deliveryFee.toFixed(2).replace('.', ',')}`}
            </Text>
          </View>

          {/* Desconto / Cupom */}
          {discountVal > 0 ? (
            <View style={s.summaryRow}>
              <Text style={[s.summaryLabel, { color: '#16A34A' }]}>
                Cupom de desconto {pedido.couponCode ? `(${pedido.couponCode})` : ''}
              </Text>
              <Text style={[s.summaryValue, { color: '#16A34A', fontWeight: '800' }]}>
                - R$ {discountVal.toFixed(2).replace('.', ',')}
              </Text>
            </View>
          ) : null}

          <View style={s.totalDivider} />

          {/* Total */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>
              R$ {pedido.total.toFixed(2).replace('.', ',')}
            </Text>
          </View>

          {/* Forma de Pagamento */}
          <View style={s.paymentMethodRow}>
            <Ionicons
              name={
                isPixMethod
                  ? 'qr-code-outline'
                  : pedido.paymentMethod?.toLowerCase()?.includes('cart')
                  ? 'card-outline'
                  : 'cash-outline'
              }
              size={18}
              color="#3F3F46"
            />
            <Text style={s.paymentMethodText}>
              {isPixMethod
                ? (isPixAwaiting ? 'Pix • Aguardando pagamento' : 'Pago pelo app • Pix (Aprovado)')
                : pedido.paymentMethod?.toLowerCase()?.includes('cart')
                ? 'Pago pelo app • Cartão de Crédito/Débito'
                : `Pagamento na entrega • ${paymentLabel}`}
            </Text>
          </View>
        </View>

        {/* Rodapé Estilo iFood Duplo com Botão Cancelar */}
        <View style={s.footerContainer}>
          <View style={s.footerDoubleRow}>
            <Pressable
              style={s.footerSecondaryBtn}
              onPress={() => setHelpModalVisible(true)}
            >
              <Ionicons name="help-circle-outline" size={18} color="#4B5563" />
              <Text style={s.footerSecondaryBtnText}>Ajuda com o pedido</Text>
            </Pressable>

            <Pressable
              style={s.footerPrimaryBtn}
              onPress={handleWhatsApp}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
              <Text style={s.footerPrimaryBtnText}>Falar com a loja</Text>
            </Pressable>
          </View>

          {['awaiting_payment', 'pending'].includes(pedido.status) && (
            <Pressable
              style={s.footerCancelBtn}
              onPress={handleCancelOrder}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={s.footerCancelBtnText}>Cancelar pedido</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Modal de confirmação de cancelamento — substitui o Alert.alert
          nativo (feio, fora do tema) por algo no estilo do app. */}
      {cancelModalMounted && (
        <Modal
          visible={cancelModalMounted}
          transparent
          animationType="none"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => setShowCancelModal(false)}
        >
          <SafeAreaProvider>
            <View style={s.cancelOverlay}>
              <Animated.View style={[s.cancelBackdrop, { opacity: cancelModalFade }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCancelModal(false)} />
              </Animated.View>
              <Animated.View style={[s.cancelCardWrap, { opacity: cancelModalFade }]}>
                <View style={s.cancelCard}>
                  <View style={s.cancelIconWrap}>
                    <Ionicons name="alert-circle" size={40} color="#DC2626" />
                  </View>
                  <Text style={s.cancelTitle}>Cancelar pedido</Text>
                  <Text style={s.cancelSubtitle}>
                    Tem certeza que deseja cancelar o pedido{' '}
                    <Text style={s.cancelSubtitleBold}>
                      #{pedido?.orderNumber || pedido?.id?.slice(-4).toUpperCase()}
                    </Text>
                    ? Essa ação não pode ser desfeita.
                  </Text>

                  <View style={s.cancelActions}>
                    <Pressable
                      style={s.cancelBtnGhost}
                      onPress={() => setShowCancelModal(false)}
                    >
                      <Text style={s.cancelBtnGhostText}>Voltar</Text>
                    </Pressable>
                    <Pressable
                      style={s.cancelBtnDanger}
                      onPress={confirmCancelOrder}
                    >
                      <Ionicons name="close-circle-outline" size={16} color="#FFF" />
                      <Text style={s.cancelBtnDangerText}>Cancelar Pedido</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            </View>
          </SafeAreaProvider>
        </Modal>
      )}

      {/* Modal de Ajuda */}
      <HelpModal
        visible={helpModalVisible}
        onClose={() => setHelpModalVisible(false)}
        onContactSupport={handleWhatsApp}
      />

      {/* Modal de Avaliação iFood com Funil Play Store */}
      <OrderFeedbackModal
        visible={feedbackModalVisible}
        order={pedido}
        initialRating={5}
        onClose={() => setFeedbackModalVisible(false)}
        onSubmitted={() => {
          showThemedAlert('Avaliação enviada', 'Muito obrigado pela sua avaliação!');
        }}
      />

      {/* Botão Flutuante de Atalho para o Mapa */}
      {shouldShowMap && (
        <View
          style={[
            s.floatingMapBtnWrap,
            { bottom: Math.max(insets.bottom, 16) + 14 },
          ]}
          pointerEvents="box-none"
        >
          <Pressable
            style={s.floatingMapBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              scrollViewRef.current?.scrollTo({ y: 0, animated: true });
            }}
          >
            <Ionicons name="map-outline" size={17} color="#FFB800" />
            <Text style={s.floatingMapBtnText}>Ver entrega no mapa 🗺️</Text>
          </Pressable>
        </View>
      )}

      {/* Confetes leves de aprovação Pix */}
      <ConfettiExplosion active={showConfetti} />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  cancelOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cancelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cancelCardWrap: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  cancelCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.white ?? '#FFF',
    borderRadius: RADIUS.xl ?? 20,
    padding: 24,
    alignItems: 'center',
    ...(SHADOWS?.lg ?? SHADOWS?.md ?? {}),
  },
  cancelIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  cancelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
    marginBottom: 8,
  },
  cancelSubtitle: {
    fontSize: 13.5,
    color: COLORS.textSecondary ?? '#666',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
  },
  cancelSubtitleBold: {
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  cancelActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  cancelBtnGhost: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: RADIUS.lg ?? 12,
    backgroundColor: COLORS.borderLight ?? '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary ?? '#555',
  },
  cancelBtnDanger: {
    flex: 1.3,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 13,
    borderRadius: RADIUS.lg ?? 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnDangerText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundElevated ?? '#F5F5F5',
  },
  minimalHeader: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border ?? '#E5E5E5',
    zIndex: 10,
  },
  minimalHeaderContent: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4] ?? 16,
  },
  backBtnHeader: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  minimalHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  minimalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  minimalHeaderSub: {
    fontSize: 11,
    color: COLORS.textMuted ?? '#888',
    fontWeight: '600',
    marginTop: 1,
  },
  helpBtnHeader: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  helpBtnHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary ?? '#E3A008',
  },
  mapWrapper: {
    width: '100%',
    overflow: 'hidden',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING[3] ?? 12,
    padding: SPACING[6] ?? 24,
    backgroundColor: COLORS.backgroundElevated ?? '#F5F5F5',
  },
  loadingText: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    color: COLORS.textSecondary ?? '#666',
  },
  errorTitle: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  backBtn: {
    marginTop: SPACING[2] ?? 8,
    paddingHorizontal: SPACING[6] ?? 24,
    paddingVertical: SPACING[3] ?? 12,
    borderRadius: RADIUS.xl ?? 16,
    backgroundColor: COLORS.primary,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.base ?? 16,
  },

  // Cabeçalho inline (dentro do scroll, abaixo do header global)
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3] ?? 12,
    marginBottom: SPACING[4] ?? 16,
  },
  inlineHeaderText: {
    flex: 1,
  },
  backArrow: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.lg ?? 12,
    backgroundColor: COLORS.white ?? '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border ?? '#E5E5E5',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  headerSub: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 13,
    color: COLORS.textMuted ?? '#999',
    fontWeight: '600',
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    padding: SPACING[4] ?? 16,
    gap: SPACING[4] ?? 16,
    paddingBottom: SPACING[8] ?? 32,
  },

  // Cards
  card: {
    backgroundColor: COLORS.white ?? '#FFF',
    borderRadius: RADIUS.xl ?? 16,
    borderWidth: 1,
    borderColor: COLORS.border ?? '#E5E5E5',
    padding: SPACING[4] ?? 16,
    ...(SHADOWS?.sm ?? {}),
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3] ?? 12,
  },
  statusIconBox: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.lg ?? 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusInfo: { flex: 1 },
  statusLabel: {
    fontSize: TYPOGRAPHY.sizes.base ?? 16,
    fontWeight: '800',
  },
  statusTime: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 13,
    color: COLORS.textMuted ?? '#999',
    marginTop: 2,
  },
  etaText: {
    fontSize: TYPOGRAPHY.sizes.xs ?? 12,
    fontWeight: '700',
    color: COLORS.primary ?? '#E3A008',
    marginTop: 2,
  },

  // Section header dentro do card
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2] ?? 8,
    marginBottom: SPACING[3] ?? 12,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sizes.base ?? 16,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight ?? '#F0F0F0',
    marginVertical: SPACING[3] ?? 12,
  },
  itemDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight ?? '#F0F0F0',
    marginVertical: SPACING[2] ?? 8,
  },

  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    fontWeight: '600',
    color: COLORS.text ?? '#111',
    marginRight: SPACING[2] ?? 8,
  },
  itemPrice: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    fontWeight: '700',
    color: COLORS.text ?? '#111',
  },
  itemAdicionais: {
    fontSize: 12,
    color: COLORS.textMuted ?? '#999',
    marginTop: 2,
  },
  noItems: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    color: COLORS.textMuted ?? '#999',
    fontStyle: 'italic',
  },

  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: 6,
    borderRadius: RADIUS.lg ?? 12,
    marginBottom: SPACING[3] ?? 12,
  },
  couponLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    textTransform: 'uppercase',
  },
  couponDiscount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    fontWeight: '700',
    color: COLORS.textSecondary ?? '#666',
  },
  totalValue: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.primary,
  },

  // Endereço + Pagamento
  infoRow: {
    flexDirection: 'row',
    gap: SPACING[3] ?? 12,
  },
  infoCard: {
    flex: 1,
    padding: SPACING[3] ?? 12,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING[2] ?? 8,
  },
  infoTitle: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 13,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  infoText: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 13,
    color: COLORS.textSecondary ?? '#555',
    lineHeight: 18,
  },

  // Botão de ajuda
  helpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2] ?? 8,
    backgroundColor: COLORS.primary ?? '#FFB800',
    paddingVertical: SPACING[4] ?? 16,
    borderRadius: RADIUS.xl ?? 16,
    ...(SHADOWS?.md ?? {}),
  },
  helpBtnText: {
    color: '#FFF',
    fontSize: TYPOGRAPHY.sizes.base ?? 16,
    fontWeight: '800',
  },

  // Payment box (Estilo Fintech / iFood Pro)
  paymentBox: {
    borderWidth: 1.5,
    borderColor: '#FEF08A',
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: RADIUS.xl ?? 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  pixHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pixHeaderIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixHeaderTextCol: {
    flex: 1,
  },
  pixHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text ?? '#1F1B16',
  },
  pixHeaderSub: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 1,
  },
  pixDivider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginVertical: 14,
  },
  timerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerUrgentLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E61E2A',
  },
  timerUrgentCountdown: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E61E2A',
    fontVariant: ['tabular-nums'],
  },
  countdownTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  countdownFill: {
    height: '100%',
    backgroundColor: '#E61E2A',
    borderRadius: 3,
  },
  qrFallbackContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
    backgroundColor: '#FFFDF9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginVertical: 10,
  },
  qrFallbackIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  qrFallbackTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F1B16',
    marginBottom: 2,
  },
  qrFallbackSub: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  pixCodeBox: {
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D4D4D8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  pixCodeText: {
    fontSize: 12,
    color: '#52525B',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  addressDetailsCol: {
    gap: 4,
  },
  addressMainText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: COLORS.text ?? '#111',
  },
  addressSubText: {
    fontSize: 13,
    color: COLORS.textSecondary ?? '#555',
  },
  addressHintText: {
    fontSize: 12,
    color: COLORS.primary ?? '#B45309',
    fontWeight: '600',
    marginTop: 2,
  },
  addressCityText: {
    fontSize: 12,
    color: COLORS.textMuted ?? '#888',
  },
  itemQtyBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#F4F4F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  itemQtyText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3F3F46',
  },
  itemDetailsCol: {
    flex: 1,
    marginRight: 8,
  },
  itemNotes: {
    fontSize: 11.5,
    color: '#71717A',
    fontStyle: 'italic',
    marginTop: 2,
  },
  orderNotesRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  orderNotesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary ?? '#555',
    marginBottom: 2,
  },
  orderNotesText: {
    fontSize: 12.5,
    color: COLORS.text ?? '#222',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 13.5,
    color: COLORS.textSecondary ?? '#666',
  },
  summaryValue: {
    fontSize: 13.5,
    fontWeight: '600',
    color: COLORS.text ?? '#111',
  },
  totalDivider: {
    height: 1,
    backgroundColor: COLORS.border ?? '#E5E5E5',
    marginVertical: 10,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  paymentMethodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3F3F46',
  },
  timerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md ?? 8,
    marginBottom: 14,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  cancelledCard: {
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    padding: 16,
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cancelledTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  cancelledText: {
    fontSize: 12,
    color: '#991B1B',
    lineHeight: 16,
  },
  paymentSubText: {
    fontSize: 12,
    color: '#666666',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  simulationBadge: {
    backgroundColor: '#FFE0B2',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 16,
  },
  simulationText: {
    color: '#E65100',
    fontSize: 11,
    fontWeight: '800',
  },
  copyBtn: {
    backgroundColor: '#FFB800',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  copyBtnActive: {
    backgroundColor: '#16A34A',
    shadowColor: '#16A34A',
  },
  copyBtnText: {
    color: '#1F1B16',
    fontWeight: '800',
    fontSize: 14,
  },
  copyBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  pixActionsCol: {
    gap: 10,
  },
  copyLinkBtn: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  copyLinkBtnText: {
    color: '#92400E',
    fontWeight: '800',
    fontSize: 14,
  },
  awaitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  awaitingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C3AED',
  },
  cancelPixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.lg ?? 12,
    backgroundColor: '#FEF2F2',
  },
  cancelPixBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  // Rodapé Estilo iFood Duplo
  footerContainer: {
    gap: 10,
    marginTop: 6,
  },
  footerDoubleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  footerSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  footerSecondaryBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },
  footerPrimaryBtn: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#25D366',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  footerPrimaryBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  footerCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  payOnlineBtn: {
    backgroundColor: '#27AE60',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  payOnlineBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  // Estilos de rastreio com mapa e bottom sheet
  floatingBackBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomSheetWrap: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  bottomSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  arrivedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FFB800',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  arrivedIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFB800',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
  },
  arrivedSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  confirmReceivedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFB800',
    borderRadius: 12,
    height: 46,
    marginBottom: 12,
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmReceivedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F1B16',
  },
  paidBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  paidBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16A34A',
  },
  feedbackCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF9E6',
    borderWidth: 1,
    borderColor: '#FCE8C3',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  feedbackCardBtnTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
  },
  festiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 14,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  festiveBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    flex: 1,
  },
  floatingMapBtnWrap: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 99,
  },
  floatingMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1F1B16',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingMapBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});

// ─── Progress bar ─────────────────────────────────────────────────────────────

const pb = StyleSheet.create({
  wrapper: {
    paddingTop: SPACING[4] ?? 16,
    paddingBottom: SPACING[1] ?? 4,
  },
  track: {
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    marginBottom: SPACING[2] ?? 8,
    marginHorizontal: 14,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#FFB800',
    borderRadius: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dotCol: {
    alignItems: 'center',
    width: 60,
  },
  dotPlaceholder: {
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotPassed: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  dotLabelActive: {
    color: '#374151',
    fontWeight: '700',
  },
  dotLabelCurrent: {
    color: '#B45309',
    fontWeight: '800',
  },
  radarWrapper: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarWave: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  radarCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
