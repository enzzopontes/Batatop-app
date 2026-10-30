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
  AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { PedidoDetalhesSkeleton } from '../../components/Skeleton';
import { usePedidos } from '../../hooks/usePedidos';
import { supabase } from '../../supabaseConfig';
import { checkPixStatus, createPixPayment } from '../../utils/mercadoPago';
import HelpModal from '../../components/HelpModal';
import LiveDeliveryMap from '../../components/orders/LiveDeliveryMap';
import OrderFeedbackModal from '../../components/orders/OrderFeedbackModal';
import { ThemedAlertHost, showThemedAlert } from '../../components/ThemedAlert';
import { useModalFade } from '../../hooks/useModalFade';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { notifyAdminNewOrder } from '../../utils/notifyNewOrder';
import { STORE_ADDRESS } from '../../constants/store';
import ThreeDotsLoader from '../../components/ThreeDotsLoader';

import AnimatedReanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  runOnJS,
  Easing,
  interpolate,
  Extrapolation,
  cancelAnimation,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Efeito de Confete Estilo InfinitePay (Canhão Central + Queda Sinuosa) ───
const CONFETTI_COLORS = [
  '#FFB800', // Dourado Batata Top
  '#16A34A', // Verde Aprovação
  '#E11D48', // Vermelho Vibrante
  '#F59E0B', // Âmbar Claro
  '#2563EB', // Azul Royal
  '#9333EA', // Roxo Celebração
  '#06B6D4', // Ciano Festivo
  '#FFFFFF', // Branco Brilhante
  '#84CC16', // Verde Limão
  '#F43F5E', // Rosa Vivo
];

const CONFETTI_COUNT = 72;

const randSign = () => (Math.random() > 0.5 ? 1 : -1);

// Resolve a velocidade vertical inicial (px/s) para que, sob gravidade + arrasto
// linear do ar, a peça suba exatamente `rise` px até o ápice.
// Altura do ápice: h(v0) = τ·v0 − vt·τ·ln(1 + v0/vt)  (convexa e crescente em v0)
// Newton-Raphson com número FIXO de iterações (sem loop aberto): partindo de um
// chute à direita da raiz, a convexidade garante convergência monotônica.
const LAUNCH_SOLVER_ITERATIONS = 8;
function solveLaunchVelocity(rise, tau, terminalVel) {
  let v = rise / tau + terminalVel * 3;
  for (let k = 0; k < LAUNCH_SOLVER_ITERATIONS; k++) {
    const f = tau * v - terminalVel * tau * Math.log(1 + v / terminalVel) - rise;
    const df = (tau * v) / (terminalVel + v);
    if (df <= 0) break;
    const next = v - f / df;
    if (!(next > 0) || Math.abs(next - v) < 0.01) {
      v = next > 0 ? next : v;
      break;
    }
    v = next;
  }
  return v;
}

function generateConfettiPieces(width, height) {
  // Canhão: ponto único no centro exato da tela (todas as peças nascem aqui)
  const originX = width * 0.5;
  const originY = height * 0.5;
  // Meia-largura máxima do feixe durante a subida (coluna estreita, sem leque)
  const beamHalfWidth = width * 0.018;

  return Array.from({ length: CONFETTI_COUNT }).map((_, i) => {
    // Leque estratificado de -1 (borda esquerda) a +1 (borda direita), sem buracos
    const u = ((i + Math.random()) / CONFETTI_COUNT) * 2 - 1;
    const lateral = Math.sign(u) * Math.pow(Math.abs(u), 0.85);

    // Formatos: tiras de papel (maioria), quadrados e círculos
    const shapeRoll = Math.random();
    const shape = shapeRoll < 0.5 ? 'rect' : shapeRoll < 0.8 ? 'square' : 'circle';

    // "Peso" da peça: tiras freiam mais no ar e caem mais devagar que círculos
    const dragTau =
      (shape === 'circle' ? 0.34 : shape === 'square' ? 0.31 : 0.28) + Math.random() * 0.05;
    const terminalVel =
      height * ((shape === 'circle' ? 0.58 : shape === 'square' ? 0.5 : 0.44) + Math.random() * 0.1);

    // Vetor de subida: centro sobe até o topo (~4-6% da altura); peças destinadas às
    // bordas param um pouco antes, desenhando o "chapéu" do cogumelo na abertura
    const rise = height * (0.44 - 0.12 * lateral * lateral + (Math.random() - 0.5) * 0.05);
    const launchVy = solveLaunchVelocity(rise, dragTau, terminalVel);
    const apexTime = dragTau * Math.log(1 + launchVy / terminalVel);

    // Espalhamento atrasado: só começa nos últimos 20% do tempo de subida
    const spreadStart = apexTime * 0.8;
    const spreadTau = 0.2 + Math.random() * 0.08;
    const targetX = lateral * width * 0.52;
    const beamX = lateral * beamHalfWidth;

    // Oscilação de descida (folha/cobra): tiras balançam mais largo e mais lento
    const flutterAmp =
      shape === 'rect'
        ? 22 + Math.random() * 18
        : shape === 'square'
          ? 16 + Math.random() * 14
          : 8 + Math.random() * 8;
    const flutterFreq = shape === 'rect' ? 1.1 + Math.random() * 0.5 : 1.4 + Math.random() * 0.6;
    const flutterPhase = Math.random() * Math.PI * 2;
    const tiltMax = shape === 'rect' ? 38 : shape === 'square' ? 28 : 0;

    // Rotação: giro forte no disparo, freado pelo ar, + tombamento contínuo na queda
    const burstSpinZ = randSign() * (200 + Math.random() * 220);
    const driftSpinZ = randSign() * (20 + Math.random() * 40);
    const burstFlipX = randSign() * (180 + Math.random() * 180);
    const flipRateX = randSign() * (1.2 + Math.random() * 1.4);
    const flipRateY = randSign() * (0.4 + Math.random() * 0.6);

    // Tempos mantidos idênticos ao original
    const duration = 2150 + Math.floor(Math.random() * 450);
    const delay = Math.floor(Math.random() * 90);

    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const size =
      shape === 'rect'
        ? 6 + Math.floor(Math.random() * 3)
        : shape === 'square'
          ? 8 + Math.floor(Math.random() * 4)
          : 7 + Math.floor(Math.random() * 3);

    return {
      id: i,
      startX: originX,
      startY: originY,
      beamX,
      targetX,
      spreadStart,
      spreadTau,
      launchVy,
      dragTau,
      terminalVel,
      apexTime,
      flutterAmp,
      flutterFreq,
      flutterPhase,
      tiltMax,
      burstSpinZ,
      driftSpinZ,
      burstFlipX,
      flipRateX,
      flipRateY,
      duration,
      color,
      shape,
      size,
      delay,
    };
  });
}

const ConfettiPiece = memo(function ConfettiPiece({ piece, active }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withDelay(
        piece.delay,
        withTiming(1, { duration: piece.duration, easing: Easing.linear })
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    // Limpeza: interrompe a animação nativa se a peça desmontar no meio do voo
    return () => {
      cancelAnimation(progress);
    };
  }, [active, piece.delay, piece.duration, progress]);

  // Worklet puro (thread de UI): só aritmética O(1) por frame, sem loops nem alocação extra
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    // Tempo físico real em segundos (progress linear × duração da peça)
    const t = (p * piece.duration) / 1000;
    const tau = piece.dragTau;
    const vt = piece.terminalVel;
    const dragDecay = 1 - Math.exp(-t / tau);

    // 1. Feixe vertical unificado: balística com arrasto linear a partir do ponto único
    //    y(t) = (v0 + vt)·τ·(1 − e^(−t/τ)) − vt·t   (positivo = para cima)
    const lift = (piece.launchVy + vt) * tau * dragDecay - vt * t;
    const beamX = piece.beamX * dragDecay;

    // 2. Explosão atrasada no topo: o eixo X fica retido até spreadStart e então abre
    //    em leque com arrasto próprio (impulso lateral forte que satura em targetX)
    const spreadT = t - piece.spreadStart;
    const spreadX = spreadT > 0 ? piece.targetX * (1 - Math.exp(-spreadT / piece.spreadTau)) : 0;

    // 3. Queda sinuosa (cobra/folha): oscilação só nasce após o ápice, na velocidade terminal
    const fallT = t - piece.apexTime;
    let flutterX = 0;
    let flutterY = 0;
    let tiltDeg = 0;
    if (fallT > 0) {
      const flutterEnv = 1 - Math.exp(-fallT / 0.35);
      const flutterAngle = fallT * piece.flutterFreq * Math.PI * 2 + piece.flutterPhase;
      const swing = piece.flutterAmp * flutterEnv;
      flutterX = Math.sin(flutterAngle) * swing;
      // Sustentação nas pontas do balanço (sobe levemente) e mergulho no meio da curva
      flutterY = Math.cos(flutterAngle * 2) * swing * 0.2;
      // Inclinação acompanha a velocidade lateral do balanço (derivada do seno)
      tiltDeg = Math.cos(flutterAngle) * piece.tiltMax * flutterEnv;
    }

    const currentX = piece.startX + beamX + spreadX + flutterX;
    const currentY = piece.startY - lift + flutterY;

    // 4. Fade final completo antes do desmonte do overlay (3020ms)
    const opacity = interpolate(
      p,
      [0, 0.03, 0.78, 0.95, 1],
      [0, 1, 1, 0, 0],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      p,
      [0, 0.06, 0.14, 1],
      [0.3, 1.15, 1.0, 0.9],
      Extrapolation.CLAMP
    );
    const rotateZ = `${piece.burstSpinZ * dragDecay + piece.driftSpinZ * t + tiltDeg}deg`;
    const rotateX = `${piece.burstFlipX * dragDecay + piece.flipRateX * 360 * t}deg`;
    const rotateY = `${piece.flipRateY * 360 * t}deg`;

    return {
      transform: [
        { perspective: 800 },
        { translateX: currentX },
        { translateY: currentY },
        { rotateZ },
        { rotateX },
        { rotateY },
        { scale },
      ],
      opacity,
    };
  });

  if (!active) return null;

  const isRect = piece.shape === 'rect';
  const isCircle = piece.shape === 'circle';

  return (
    <AnimatedReanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: piece.size,
          height: isRect ? piece.size * 2.2 : piece.size,
          backgroundColor: piece.color,
          borderRadius: isCircle ? piece.size / 2 : isRect ? 1.5 : 2,
          zIndex: 99998,
        },
        animatedStyle,
      ]}
    />
  );
});

// memo: re-renders da tela (realtime do pedido, setPedido pós-Pix) não re-renderizam as 72 peças
const ConfettiExplosion = memo(function ConfettiExplosion({ active }) {
  // Física pré-calculada uma única vez na montagem da tela, fora do momento do pagamento
  const pieces = useMemo(
    () => generateConfettiPieces(SCREEN_WIDTH, SCREEN_HEIGHT),
    []
  );
  // Interrompido localmente se o app for para segundo plano durante a explosão.
  // Não altera showConfetti do pai: os timers de 420ms/3020ms seguem intactos.
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    if (!active) {
      setInterrupted(false);
      return undefined;
    }
    const sub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') setInterrupted(true);
    });
    return () => sub.remove();
  }, [active]);

  if (!active || interrupted) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <ConfettiPiece key={p.id} piece={p} active={active} />
      ))}
    </View>
  );
});

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

function AnimatedStatusBadge({ iconName, color, bgColor, status }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop = null;
    // Animação sutil de respiro apenas no preparo
    if (status === 'preparing' || status === 'preparo') {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.07,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [status, pulseAnim]);

  return (
    <View style={[s.statusIconBox, { backgroundColor: bgColor }]}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Ionicons name={iconName} size={24} color={color} />
      </Animated.View>
    </View>
  );
}

// ─── Constantes de status ─────────────────────────────────────────────────────

const STATUS_LABELS = {
  awaiting_payment: 'Aguardando pagamento',
  pending: 'Pedido confirmado',
  preparing: 'Seu pedido está sendo preparado',
  preparo: 'Seu pedido está sendo preparado',
  ready: 'Pronto para entrega',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Pedido entregue',
  cancelled: 'Cancelado',
};

// ─── Banner de Alerta Superior Fluido (Slide-down / Slide-up) ────────────────
const ssb = StyleSheet.create({
  floatingBannerWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
  },
  floatingBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#15803D',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 12,
  },
  floatingBannerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBannerTextWrap: {
    flex: 1,
  },
  floatingBannerTitle: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  floatingBannerSub: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
});

const celebratedOrderIds = new Set();

function SlideDownPaymentSuccessBanner({ visible, insets, onDismiss }) {
  const translateY = useSharedValue(-260);
  const opacity = useSharedValue(0);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) {
      translateY.value = -260;
      opacity.value = 0;
      return;
    }

    translateY.value = -260;
    opacity.value = 0;

    // 1. Desce com mola fluida e fade-in suave
    translateY.value = withSpring(0, { damping: 15, stiffness: 110, mass: 0.9 });
    opacity.value = withTiming(1, { duration: 220 });

    // 2. Permanece exibido e recolhe suavemente ao concluir
    const hideTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 280 });
      translateY.value = withTiming(-260, { duration: 320 }, (finished) => {
        if (finished && onDismissRef.current) {
          runOnJS(onDismissRef.current)();
        }
      });
    }, 3800);

    return () => clearTimeout(hideTimer);
  }, [visible, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <AnimatedReanimated.View
      pointerEvents="box-none"
      style={[
        ssb.floatingBannerWrap,
        {
          top: Math.max(insets?.top || 0, 12) + 6,
        },
        animatedStyle,
      ]}
    >
      <View style={ssb.floatingBannerCard}>
        <View style={ssb.floatingBannerIconBox}>
          <Ionicons name="checkmark-circle" size={24} color="#FFF" />
        </View>
        <View style={ssb.floatingBannerTextWrap}>
          <Text style={ssb.floatingBannerTitle}>Pagamento confirmado!</Text>
          <Text style={ssb.floatingBannerSub}>
            Seu pedido já está sendo preparado.
          </Text>
        </View>
      </View>
    </AnimatedReanimated.View>
  );
}

const STATUS_ICONS = {
  awaiting_payment: 'time',
  pending: 'shield-checkmark',
  preparing: 'flame',
  ready: 'bag-check',
  out_for_delivery: 'bicycle',
  delivered: 'checkmark-done-circle',
  cancelled: 'close-circle',
};

const STATUS_COLORS = {
  awaiting_payment: '#D97706',
  pending: '#D97706',
  preparing: '#EA580C',
  ready: '#2563EB',
  out_for_delivery: '#1E40AF',
  delivered: '#16A34A',
  cancelled: '#DC2626',
};

const STATUS_BG = {
  awaiting_payment: '#FEF3C7',
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

  const isPaid =
    pedido.metadata?.mp_payment_status === 'approved' ||
    pedido.metadata?.pix?.status === 'approved' ||
    Boolean(pedido.metadata?.paid_at) ||
    ['preparing', 'preparo', 'ready', 'out_for_delivery', 'delivered'].includes(pedido.status);

  const isPixAwaiting =
    !isPaid &&
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
  const hasTriggeredSuccessRef = useRef(false);
  const isCelebrationPendingRef = useRef(false);
  const pendingPaidOrderRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const lastBecameActiveAtRef = useRef(Date.now());
  const celebrationTimeoutRef = useRef(null);
  const confettiTimeoutRef = useRef(null);
  const confettiEndTimeoutRef = useRef(null);
  const appStateSubRef = useRef(null);
  const scrollViewRef = useRef(null);
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [isMapModalVisible, setIsMapModalVisible] = useState(false);

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

  // Monitora se o rastreio em tempo real está ativo com coordenadas válidas e ping recente (<= 150s)
  useEffect(() => {
    if (pedido?.status !== 'out_for_delivery') {
      setIsTrackingActive(false);
      setIsMapModalVisible(false);
      return;
    }

    let isMounted = true;
    let lastUpdatedAt = null;

    const isFreshPing = (updatedAt) => {
      if (!updatedAt) return false;
      return Date.now() - new Date(updatedAt).getTime() <= 2.5 * 60 * 1000;
    };

    const evaluateRow = (row) => {
      const active = Boolean(
        pedido?.status === 'out_for_delivery' &&
          row?.is_active &&
          row?.driver_lat != null &&
          row?.driver_lng != null &&
          isFreshPing(row?.updated_at)
      );
      lastUpdatedAt = active ? (row?.updated_at || new Date().toISOString()) : (row?.updated_at || null);
      setIsTrackingActive(active);
      if (!active) {
        setIsMapModalVisible(false);
      }
    };

    const channel = supabase
      .channel(`delivery-active-${pedido.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_tracking',
          filter: 'id=eq.live',
        },
        (payload) => {
          if (!isMounted) return;
          evaluateRow(payload.new);
        }
      )
      .subscribe();

    async function checkLiveTracking() {
      try {
        const { data } = await supabase
          .from('delivery_tracking')
          .select('is_active, driver_lat, driver_lng, updated_at')
          .eq('id', 'live')
          .single();

        if (!isMounted) return;
        evaluateRow(data);
      } catch {
        if (!isMounted) return;
        setIsTrackingActive(false);
        setIsMapModalVisible(false);
      }
    }

    checkLiveTracking();

    const stalenessTimer = setInterval(() => {
      if (!isMounted) return;
      if (lastUpdatedAt && !isFreshPing(lastUpdatedAt)) {
        setIsTrackingActive(false);
        setIsMapModalVisible(false);
      }
    }, 30000);

    return () => {
      isMounted = false;
      clearInterval(stalenessTimer);
      supabase.removeChannel(channel);
    };
  }, [pedido?.id, pedido?.status]);

  const triggerPaymentSuccess = useCallback((latestOrder = null) => {
    if (latestOrder) {
      pendingPaidOrderRef.current = latestOrder;
    }
    const orderKey = String(pedidoRef.current?.id || id || '');
    if (hasTriggeredSuccessRef.current || (orderKey && celebratedOrderIds.has(orderKey))) return;
    hasTriggeredSuccessRef.current = true;
    if (orderKey) celebratedOrderIds.add(orderKey);
    isCelebrationPendingRef.current = true;

    const executePaymentConfirmation = () => {
      isCelebrationPendingRef.current = false;

      // 1. Primeiro exibe o banner deslizante e dispara vibração tátil de sucesso
      setShowSuccessBanner(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // 2. Após 420ms (banner já posicionado visivelmente), dispara a explosão de confetes
      if (confettiTimeoutRef.current) clearTimeout(confettiTimeoutRef.current);
      confettiTimeoutRef.current = setTimeout(() => {
        setShowConfetti(true);
      }, 420);

      // 3. Desliga os confetes após 420 + 2600ms (3020ms)
      if (confettiEndTimeoutRef.current) clearTimeout(confettiEndTimeoutRef.current);
      confettiEndTimeoutRef.current = setTimeout(() => {
        setShowConfetti(false);
      }, 3020);

      // 4. Notifica o painel administrativo de novo pedido aprovado
      notifyAdminNewOrder(pedidoRef.current?.id || id).catch(() => {});

      // 5. Esconde o bloco do Pix e transiciona o status do pedido para 'preparing'
      Animated.timing(pixFadeAnim, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(() => {
        setPedido((prev) => {
          const paidOrder = pendingPaidOrderRef.current;
          if (paidOrder && paidOrder.status !== 'awaiting_payment') {
            return {
              ...paidOrder,
              metadata: {
                ...(paidOrder.metadata || {}),
                mp_payment_status: 'approved',
                paid_at: paidOrder.metadata?.paid_at || new Date().toISOString(),
              },
            };
          }
          return prev
            ? {
                ...prev,
                status: 'preparing',
                metadata: {
                  ...(prev.metadata || {}),
                  mp_payment_status: 'approved',
                  paid_at: prev.metadata?.paid_at || new Date().toISOString(),
                },
              }
            : prev;
        });
        carregarPedidoRef.current({ silent: true });
      });
    };

    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }
    if (appStateSubRef.current) {
      appStateSubRef.current.remove();
      appStateSubRef.current = null;
    }

    if (AppState.currentState === 'active') {
      const msSinceActive = Date.now() - lastBecameActiveAtRef.current;
      // Se o cliente acabou de voltar do app do banco (< 700ms), aguarda o fim da transição do SO
      const waitMs = msSinceActive < 700 ? Math.max(400, 650 - msSinceActive) : 250;
      celebrationTimeoutRef.current = setTimeout(() => {
        executePaymentConfirmation();
      }, waitMs);
    } else {
      // Cliente ainda está no app do banco: aguarda voltar para 'active' + 500ms de transição
      appStateSubRef.current = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          if (appStateSubRef.current) {
            appStateSubRef.current.remove();
            appStateSubRef.current = null;
          }
          celebrationTimeoutRef.current = setTimeout(() => {
            executePaymentConfirmation();
          }, 500);
        }
      });
    }
  }, [pixFadeAnim, id]);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
      if (confettiTimeoutRef.current) {
        clearTimeout(confettiTimeoutRef.current);
      }
      if (confettiEndTimeoutRef.current) {
        clearTimeout(confettiEndTimeoutRef.current);
      }
      if (appStateSubRef.current) {
        appStateSubRef.current.remove();
      }
    };
  }, []);

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
      if (resultado.success && resultado.data) {
        const fetched = resultado.data;
        const fetchedIsPaid =
          fetched.status !== 'awaiting_payment' && fetched.status !== 'cancelled';

        if (isPixAwaitingRef.current && fetchedIsPaid) {
          pendingPaidOrderRef.current = fetched;
          if (!hasTriggeredSuccessRef.current) {
            triggerPaymentSuccess(fetched);
            return fetched;
          }
        }

        if (isCelebrationPendingRef.current) {
          pendingPaidOrderRef.current = fetched;
          return fetched;
        }

        setPedido(fetched);
        return fetched;
      } else if (!silent) {
        setErro(true);
      }
    } catch {
      if (!silent) setErro(true);
    } finally {
      if (!silent) setInitialLoading(false);
    }
    return null;
  }, [id, buscarPedidoPorId, triggerPaymentSuccess]);

  const carregarPedidoRef = useRef(carregarPedido);
  carregarPedidoRef.current = carregarPedido;

  // Monitora retorno do app (ex: voltando do app do banco) para checar o Pix imediatamente
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextAppState) => {
      appStateRef.current = nextAppState;
      if (nextAppState === 'active') {
        lastBecameActiveAtRef.current = Date.now();
        if (isPixAwaitingRef.current && !hasTriggeredSuccessRef.current) {
          if (mpPaymentId) {
            checkPixStatus(mpPaymentId)
              .then((res) => {
                if (!res?.success) return;
                const isPaid =
                  res.statusDetail === 'accredited' ||
                  res.paymentStatus === 'approved' ||
                  res.status === 'approved' ||
                  res.status === 'processed';
                if (isPaid) {
                  triggerPaymentSuccess();
                }
              })
              .catch(() => {});
          }
          carregarPedidoRef.current({ silent: true });
        }
      }
    });
    return () => sub.remove();
  }, [mpPaymentId, triggerPaymentSuccess]);

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

  // ── Contagem regressiva do PIX (30 minutos = 1800 segundos) ──────────────────
  const PIX_TOTAL_SECONDS = 30 * 60; // 1800s

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
            await supabase.rpc('cancel_order_user', {
              p_order_id: pedido.id,
              p_cancel_reason: 'pix_expirado_30min',
            });
          } catch {}
          showThemedAlert(
            'Pix Expirado',
            'O tempo limite de 30 minutos para pagamento via Pix expirou. Faça um novo pedido se desejar.'
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
      <View style={{ flex: 1, backgroundColor: COLORS.backgroundLight }}>
        <StatusBar barStyle="dark-content" />
        <PedidoDetalhesSkeleton />
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
  const timerColor = isUrgentTimer ? '#D97706' : '#B45309';
  const timerBarColor = isUrgentTimer ? '#E3A008' : '#FFB800';
  const timerTrackBg = isUrgentTimer ? '#FEF3C7' : '#FEF3C7';

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

      {/* Banner de Alerta Superior Fluido (Slide-down e Slide-up sem empurrar o layout) */}
      <SlideDownPaymentSuccessBanner
        visible={showSuccessBanner}
        insets={insets}
        onDismiss={() => setShowSuccessBanner(false)}
      />

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
            <AnimatedStatusBadge
              iconName={statusIcon}
              color={statusColor}
              bgColor={statusBg}
              status={pedido.status}
            />
            <View style={s.statusInfo}>
              <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
              {timeStr ? <Text style={s.statusTime}>Realizado às {timeStr}</Text> : null}
              {pedido.metadata?.eta_minutes && pedido.status !== 'delivered' && pedido.status !== 'cancelled' ? (
                <Text style={s.etaText}>Previsão de entrega: ~{pedido.metadata.eta_minutes} min</Text>
              ) : null}
            </View>
          </View>

          <ProgressBar status={pedido.status} isPixAwaiting={isPixAwaiting} />

          {/* Mini-Preview do Mapa de Entrega em Tempo Real (Exclusivo se GPS ativo) */}
          {shouldShowMap && (
            <Pressable
              style={s.mapPreviewCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setIsMapModalVisible(true);
              }}
            >
              <View style={s.mapPreviewViewport} pointerEvents="none">
                <LiveDeliveryMap order={pedido} height={140} isPreview={true} />
              </View>
              <View style={s.mapPreviewFooterBar}>
                <View style={s.mapPreviewFooterLeft}>
                  <View style={s.mapPreviewLiveDot} />
                  <Text style={s.mapPreviewFooterText}>Acompanhar no mapa</Text>
                </View>
                <View style={s.mapPreviewExpandBadge}>
                  <Ionicons name="expand-outline" size={16} color={COLORS.primary} />
                </View>
              </View>
            </Pressable>
          )}

          {/* Botão Secundário: Já recebi meu pedido */}
          {(isOutForDelivery || hasArrived) && (
            <Pressable
              style={s.confirmReceivedBtn}
              onPress={handleConfirmDelivered}
              disabled={confirmingDelivered}
            >
              {confirmingDelivered ? (
                <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                  <Text style={s.confirmReceivedText}>Já recebi meu pedido</Text>
                </>
              )}
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
                    width: `${remainingSeconds !== null ? Math.min(100, Math.max(0, (remainingSeconds / PIX_TOTAL_SECONDS) * 100)) : 100}%`,
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
                    <ThreeDotsLoader color="#FFB800" dotSize={7} />
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

            {/* 5. Botão de Ação (Copiar Pix) */}
            <View style={s.pixActionsCol}>
              <Pressable
                style={[s.copyBtn, copied && s.copyBtnActive]}
                onPress={async () => {
                  const pixTarget = qrCodeText || ticketUrl;
                  if (pixTarget) {
                    await Clipboard.setStringAsync(pixTarget);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2500);
                  } else if (pedido?.id) {
                    await requestPixQrCode(pedido.id);
                  }
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
            </View>
          </Animated.View>
        )}

        {/* CARD 2 — Endereço de Entrega ou Retirada */}
        <View style={s.card}>
          <View style={s.sectionHeader}>
            <Ionicons
              name={pedido.deliveryType === 'retirada' ? 'storefront-outline' : 'location-sharp'}
              size={20}
              color={COLORS.primary ?? '#E3A008'}
            />
            <Text style={s.sectionTitle}>
              {pedido.deliveryType === 'retirada' ? 'Retirada na Loja' : 'Endereço de Entrega'}
            </Text>
          </View>
          <View style={s.divider} />

          {pedido.deliveryType === 'retirada' ? (
            <View style={s.addressDetailsCol}>
              <Text style={s.addressMainText}>Batata Top — Portão de Ferro Preto</Text>
              <Text style={s.addressSubText}>{STORE_ADDRESS.full}</Text>
              <Text style={s.addressHintText}>Apresente o número do pedido #{num} ao chegar no portão de ferro preto.</Text>
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
            <Ionicons name="receipt-outline" size={20} color={COLORS.primary ?? '#E3A008'} />
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
            <Ionicons name="wallet-outline" size={20} color={COLORS.primary ?? '#E3A008'} />
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
          {/* Botão de Avaliação quando Entregue no Rodapé */}
          {pedido.status === 'delivered' && (
            <Pressable
              style={s.footerFeedbackBtn}
              onPress={() => setFeedbackModalVisible(true)}
            >
              <Ionicons name="star" size={19} color="#FFB800" />
              <Text style={s.footerFeedbackBtnText}>Avaliar este pedido</Text>
              <Ionicons name="chevron-forward" size={17} color="#B45309" />
            </Pressable>
          )}

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
                <ThreeDotsLoader color="#DC2626" dotSize={7} />
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

      {/* Modal de Mapa em Tela Cheia estilo iFood */}
      <Modal
        visible={isMapModalVisible && shouldShowMap}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setIsMapModalVisible(false)}
      >
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <LiveDeliveryMap
              order={pedido}
              isFullScreen
              onClose={() => setIsMapModalVisible(false)}
            />
          </View>
        </SafeAreaProvider>
      </Modal>

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
    color: '#D97706',
  },
  timerUrgentCountdown: {
    fontSize: 14,
    fontWeight: '900',
    color: '#D97706',
    fontVariant: ['tabular-nums'],
  },
  countdownTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  countdownFill: {
    height: '100%',
    backgroundColor: '#E3A008',
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
    height: 48,
    marginTop: 18,
    marginBottom: 4,
    shadowColor: '#FFB800',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  confirmReceivedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
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
  footerFeedbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  footerFeedbackBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  mapPreviewCard: {
    height: 140,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING[3],
    marginBottom: SPACING[3],
    backgroundColor: COLORS.backgroundElevated,
    position: 'relative',
    ...SHADOWS.sm,
  },
  mapPreviewViewport: {
    ...StyleSheet.absoluteFillObject,
  },
  mapPreviewFooterBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  mapPreviewFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  mapPreviewLiveDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.success,
  },
  mapPreviewFooterText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
  },
  mapPreviewExpandBadge: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
