import {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Animated,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import { usePedidos } from './hooks/usePedidos';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange } from '../utils/authSession';
import { useTabBarHeight } from './_layout';
import HelpModal from '../components/HelpModal';
import OrderFeedbackModal from '../components/orders/OrderFeedbackModal';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import { cartStore } from '../utils/cartStore';
import batataDormindo from '../assets/batatadormindo.png';

// ─── Header Minimalista Padrão (Estilo iFood) ─────────────────────────────────
function MinimalHeader({ title = 'Pedidos' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.minimalHeader, { paddingTop: insets.top }]}>
      <View style={styles.minimalHeaderContent}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={12}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </Pressable>
        <Text style={styles.minimalHeaderTitle}>{title}</Text>
        <View style={styles.backBtnPlaceholder} />
      </View>
    </View>
  );
}

// ─── Bolinha Pulsante Amarela ────────────────────────────────────────────────
function PulsingDot() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return <Animated.View style={[styles.pulsingDot, { opacity: pulseAnim }]} />;
}

// ─── Barra de Progresso Segmentada Estilo iFood ──────────────────────────────
function SegmentedProgressBar({ status }) {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // 1: Confirmado | 2: Preparo | 3: A caminho | 4: Entregue
  let currentStep = 1;
  let statusText = 'Pedido confirmado';

  if (status === 'awaiting_payment') {
    currentStep = 1;
    statusText = 'Aguardando pagamento Pix';
  } else if (status === 'pending') {
    currentStep = 1;
    statusText = 'Pedido recebido pela loja';
  } else if (status === 'preparing') {
    currentStep = 2;
    statusText = 'Em preparo na cozinha';
  } else if (status === 'ready') {
    currentStep = 3;
    statusText = 'Pronto para sair';
  } else if (status === 'out_for_delivery') {
    currentStep = 3;
    statusText = 'A Batata Top saiu para entrega!';
  } else if (status === 'delivered') {
    currentStep = 4;
    statusText = 'Pedido entregue';
  }

  return (
    <View style={spb.wrapper}>
      <View style={spb.barRow}>
        {[1, 2, 3, 4].map((stepIdx) => {
          const isCompleted = stepIdx < currentStep;
          const isCurrent = stepIdx === currentStep;

          return (
            <View key={stepIdx} style={spb.segmentTrack}>
              {isCompleted ? (
                <View style={[spb.segmentFill, { backgroundColor: '#FFB800' }]} />
              ) : isCurrent ? (
                <Animated.View
                  style={[spb.segmentFill, { backgroundColor: '#FFB800', opacity: pulseAnim }]}
                />
              ) : (
                <View style={[spb.segmentFill, { backgroundColor: '#E8E8E8' }]} />
              )}
            </View>
          );
        })}
      </View>
      <Text style={spb.statusText}>{statusText}</Text>
    </View>
  );
}

const spb = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    marginBottom: 4,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E8E8E8',
    overflow: 'hidden',
  },
  segmentFill: {
    ...StyleSheet.absoluteFillObject,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3E3E3E',
    marginTop: 8,
  },
});

// ─── Formatador de Data para Agrupamento ──────────────────────────────────────
function formatOrderDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const day = d.toLocaleDateString('pt-BR', { day: 'numeric' });
  const month = d.toLocaleDateString('pt-BR', { month: 'long' });
  const year = d.toLocaleDateString('pt-BR', { year: 'numeric' });
  return `${capitalizedWeekday}, ${day} de ${month} de ${year}`;
}

// ─── Card de Pedido em Andamento (Design Rico iFood) ─────────────────────────
function ActiveOrderCard({ order, onDetails }) {
  const num = order.orderNumber || order.id.slice(-4).toUpperCase();
  const etaMinutes = order.metadata?.eta_minutes;

  const formattedEta = useMemo(() => {
    if (!etaMinutes) return '30-45 min';
    const baseTime = order.createdAt ? new Date(order.createdAt).getTime() : Date.now();
    const etaDate = new Date(baseTime + etaMinutes * 60 * 1000);
    return etaDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [etaMinutes, order.createdAt]);

  const deliveryTypeLabel = order.deliveryType === 'retirada' ? 'Retirada' : 'Delivery';
  const paymentLabel = order.paymentMethod === 'pix' ? 'Pix' : order.paymentMethod?.toLowerCase()?.includes('cart') ? 'Cartão' : 'Dinheiro';
  const freteText = order.deliveryType === 'retirada' ? 'Grátis' : (order.metadata?.delivery_fee ? `R$ ${Number(order.metadata.delivery_fee).toFixed(2).replace('.', ',')}` : 'Grátis');

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.cardContainer}
      onPress={() => onDetails(order.id)}
    >
      {/* Cabeçalho do Card */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Image source={require('../assets/logo.png')} style={styles.storeLogo} resizeMode="contain" />
          <View style={styles.storeTextCol}>
            <Text style={styles.storeTitle}>Batata Top</Text>
            <Text style={styles.orderNumberText}>Pedido #{num} • {deliveryTypeLabel}</Text>
          </View>
        </View>

        <View style={styles.cardHeaderRight}>
          <Text style={styles.orderTotalHeader}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
          <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
        </View>
      </View>

      {/* Faixa de Status Estilo iFood */}
      {order.status === 'awaiting_payment' || (order.status === 'pending' && (order.paymentMethod === 'pix' || order.payment_method === 'pix') && (order.metadata?.pix || order.metadata?.qr_code || order.metadata?.pix_qr_code)) ? (
        <View style={[styles.statusBanner, { backgroundColor: '#FEE2E2' }]}>
          <Ionicons name="time-outline" size={16} color="#E61E2A" />
          <Text style={[styles.statusBannerText, { color: '#E61E2A' }]}>
            Aguardando pagamento Pix • Toque para pagar
          </Text>
        </View>
      ) : order.status === 'out_for_delivery' ? (
        <View style={[styles.statusBanner, { backgroundColor: '#DBEAFE' }]}>
          <Ionicons name="car-outline" size={16} color="#1E40AF" />
          <Text style={[styles.statusBannerText, { color: '#1E40AF' }]}>
            Saiu para entrega • Toque para ver no mapa
          </Text>
        </View>
      ) : (
        <View style={[styles.statusBanner, { backgroundColor: '#FEF3C7' }]}>
          <PulsingDot />
          <Text style={[styles.statusBannerText, { color: '#B45309' }]}>
            Preparando seu pedido • Previsão {formattedEta}
          </Text>
        </View>
      )}

      {/* Barra de Progresso Segmentada iFood */}
      <SegmentedProgressBar status={order.status} />

      {/* Lista de Itens Rica dentro do Card */}
      <View style={styles.cardItemsSection}>
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => {
            const adicText = (item.adicionais || [])
              .map((a) => (typeof a === 'string' ? a : a?.name || a?.nome))
              .filter(Boolean)
              .join(', ');

            return (
              <View key={idx} style={styles.itemRowWrapper}>
                <View style={styles.itemMainRow}>
                  <View style={styles.itemQtyBadge}>
                    <Text style={styles.itemQtyBadgeText}>{item.quantity}</Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>
                    R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                  </Text>
                </View>
                {adicText ? (
                  <Text style={styles.itemAdicionais}>+ {adicText}</Text>
                ) : null}
                {item.notes ? (
                  <Text style={styles.itemNotes}>Obs: {item.notes}</Text>
                ) : null}
              </View>
            );
          })
        ) : null}
      </View>

      {/* Linha Sutil de Resumo */}
      <View style={styles.cardSummaryLine}>
        <Text style={styles.cardSummaryText}>
          Pagamento: {paymentLabel} • Entrega: {freteText}
        </Text>
      </View>

      {/* Toque para Acompanhar */}
      <View style={styles.trackOrderRow}>
        <Text style={styles.trackOrderText}>
          {order.status === 'awaiting_payment' || (order.status === 'pending' && (order.paymentMethod === 'pix' || order.payment_method === 'pix') && (order.metadata?.pix || order.metadata?.qr_code || order.metadata?.pix_qr_code))
            ? 'Ver código e pagar Pix'
            : 'Acompanhar detalhes do pedido'}
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#B45309" />
      </View>
    </TouchableOpacity>
  );
}

// ─── Card de Histórico Concluído (Design Rico iFood) ──────────────────────────
function CompletedOrderCard({
  order,
  onDetails,
  onOpenFeedback,
  feedbackRating,
  onReorder,
  onHelp,
}) {
  const isCancelled = order.status === 'cancelled';
  const num = order.orderNumber || order.id.slice(-4).toUpperCase();
  const deliveryTypeLabel = order.deliveryType === 'retirada' ? 'Retirada' : 'Delivery';
  const paymentLabel = order.paymentMethod === 'pix' ? 'Pix' : order.paymentMethod?.toLowerCase()?.includes('cart') ? 'Cartão' : 'Dinheiro';
  const freteText = order.deliveryType === 'retirada' ? 'Grátis' : (order.metadata?.delivery_fee ? `R$ ${Number(order.metadata.delivery_fee).toFixed(2).replace('.', ',')}` : 'Grátis');

  const formattedTime = useMemo(() => {
    if (!order.createdAt) return '';
    return order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, [order.createdAt]);

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={styles.cardContainer}
      onPress={() => onDetails(order.id)}
    >
      {/* Cabeçalho do Card */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Image source={require('../assets/logo.png')} style={styles.storeLogo} resizeMode="contain" />
          <View style={styles.storeTextCol}>
            <Text style={styles.storeTitle}>Batata Top</Text>
            <Text style={styles.orderNumberText}>Pedido #{num} • {deliveryTypeLabel}</Text>
          </View>
        </View>

        <View style={styles.cardHeaderRight}>
          <Text style={styles.orderTotalHeader}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
          <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
        </View>
      </View>

      {/* Faixa de Status */}
      <View style={[styles.statusBanner, { backgroundColor: isCancelled ? '#FEE2E2' : '#DCFCE7' }]}>
        <Ionicons
          name={isCancelled ? 'close-circle' : 'checkmark-circle'}
          size={16}
          color={isCancelled ? '#DC2626' : '#16A34A'}
        />
        <Text style={[styles.statusBannerText, { color: isCancelled ? '#DC2626' : '#16A34A' }]}>
          {isCancelled ? 'Pedido cancelado' : `Pedido concluído às ${formattedTime}`}
        </Text>
      </View>

      {/* Lista de Itens Rica dentro do Card */}
      <View style={styles.cardItemsSection}>
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => {
            const adicText = (item.adicionais || [])
              .map((a) => (typeof a === 'string' ? a : a?.name || a?.nome))
              .filter(Boolean)
              .join(', ');

            return (
              <View key={idx} style={styles.itemRowWrapper}>
                <View style={styles.itemMainRow}>
                  <View style={styles.itemQtyBadge}>
                    <Text style={styles.itemQtyBadgeText}>{item.quantity}</Text>
                  </View>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemPrice}>
                    R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                  </Text>
                </View>
                {adicText ? (
                  <Text style={styles.itemAdicionais}>+ {adicText}</Text>
                ) : null}
                {item.notes ? (
                  <Text style={styles.itemNotes}>Obs: {item.notes}</Text>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.noItemsText}>Itens indisponíveis</Text>
        )}
      </View>

      {/* Linha Sutil de Resumo */}
      <View style={styles.cardSummaryLine}>
        <Text style={styles.cardSummaryText}>
          Pagamento: {paymentLabel} • Entrega: {freteText}
        </Text>
      </View>

      {/* Faixa de Avaliação se Entregue */}
      {!isCancelled && (
        <View style={styles.feedbackBanner}>
          {feedbackRating ? (
            <View style={styles.feedbackGivenRow}>
              <Text style={styles.feedbackGivenLabel}>Avaliação enviada</Text>
              <View style={styles.feedbackRatingPill}>
                <Ionicons name="star" size={14} color="#FFB800" />
                <Text style={styles.feedbackRatingText}>{feedbackRating}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.feedbackPromptRow}>
              <Text style={styles.feedbackPromptText}>Avalie seu pedido</Text>
              <View style={styles.feedbackStarsRow}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Pressable
                    key={star}
                    hitSlop={6}
                    onPress={(e) => {
                      e.stopPropagation();
                      onOpenFeedback(order, star);
                    }}
                  >
                    <Ionicons name="star-outline" size={20} color="#FFB800" />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Rodapé Duplo */}
      <View style={styles.historyFooter}>
        <Pressable
          style={styles.helpBtn}
          onPress={(e) => {
            e.stopPropagation();
            onHelp(order);
          }}
        >
          <Text style={styles.helpBtnText}>Ajuda</Text>
        </Pressable>

        <Pressable
          style={styles.reorderBtn}
          onPress={(e) => {
            e.stopPropagation();
            onReorder(order);
          }}
        >
          <Text style={styles.reorderBtnText}>Pedir novamente</Text>
        </Pressable>
      </View>
    </TouchableOpacity>
  );
}

// ─── Tela Principal de Pedidos ────────────────────────────────────────────────
export default function PedidosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useTabBarHeight();
  const { buscarPedidosPorUsuario } = usePedidos();

  const [userId, setUserId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [feedbackMap, setFeedbackMap] = useState({});

  // Modais
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [selectedOrderForFeedback, setSelectedOrderForFeedback] = useState(null);
  const [feedbackInitialRating, setFeedbackInitialRating] = useState(5);

  const [helpOrder, setHelpOrder] = useState(null);

  const userIdRef = useRef(null);

  // 1. Respeitando a REGRA DE OURO (Seção 11 do CLAUDE.md)
  useEffect(() => {
    let isMounted = true;

    async function refreshEffectiveUserId() {
      try {
        const session = await getEffectiveSession();
        if (!isMounted) return;
        const currentUid = session?.user?.id ?? null;
        setUserId(currentUid);
        if (!currentUid) {
          setOrders([]);
          setInitialLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setUserId(null);
          setOrders([]);
          setInitialLoading(false);
        }
      } finally {
        if (isMounted) {
          setAuthLoading(false);
        }
      }
    }

    refreshEffectiveUserId();
    const unsubscribeUi = subscribeAuthUiChange(refreshEffectiveUserId);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refreshEffectiveUserId();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      unsubscribeUi();
    };
  }, []);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Carrega feedbacks do usuário
  const fetchFeedbacks = useCallback(async (uid) => {
    if (!uid) return;
    try {
      const { data } = await supabase
        .from('feedbacks')
        .select('order_id, rating')
        .eq('user_id', uid);

      if (data) {
        const map = {};
        data.forEach((fb) => {
          if (fb.order_id) map[fb.order_id] = fb.rating;
        });
        setFeedbackMap(map);
      }
    } catch {}
  }, []);

  // Busca pedidos (apenas liga initialLoading se orders estiver vazio)
  const fetchOrders = useCallback(
    async (uid, { silent = false } = {}) => {
      if (!uid) {
        setOrders([]);
        setInitialLoading(false);
        return;
      }
      if (!silent) {
        setInitialLoading((prev) => (orders.length === 0 ? true : false));
      }
      const res = await buscarPedidosPorUsuario(uid);
      if (res.success) {
        setOrders(res.data);
        await fetchFeedbacks(uid);
      } else if (!silent) {
        showThemedAlert('Erro', 'Não foi possível carregar seus pedidos.');
      }
      setInitialLoading(false);
    },
    [buscarPedidosPorUsuario, fetchFeedbacks, orders.length]
  );

  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  }, [fetchOrders]);

  // Assinatura Realtime e Polling - depende estritamente do userId primitivo
  useEffect(() => {
    if (!userId) return;

    fetchOrdersRef.current(userId);

    const channelName = `orders-list-${userId}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        () => {
          if (userIdRef.current) {
            fetchOrdersRef.current(userIdRef.current, { silent: true });
          }
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      if (userIdRef.current) {
        fetchOrdersRef.current(userIdRef.current, { silent: true });
      }
    }, 25000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Ações
  const handleDetails = (orderId) => {
    router.push(`/pedidos/${orderId}`);
  };

  const handleCopyPix = async (order) => {
    const pixCode =
      order.metadata?.pix?.qr_code ||
      order.metadata?.pix?.qrCode ||
      order.metadata?.pix_code;

    if (pixCode) {
      await Clipboard.setStringAsync(pixCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showThemedAlert('Pix Copiado!', 'O código Pix Copia e Cola foi copiado para a sua área de transferência.');
    } else {
      router.push(`/pedidos/${order.id}`);
    }
  };

  const handleOpenFeedback = (order, initialRating = 5) => {
    setSelectedOrderForFeedback(order);
    setFeedbackInitialRating(initialRating);
    setFeedbackModalVisible(true);
  };

  const handleFeedbackSubmitted = ({ orderId, rating }) => {
    setFeedbackMap((prev) => ({ ...prev, [orderId]: rating }));
  };

  const handleReorder = (order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        const itemPrice = Number(item.price || item.unit_price || item.preco || 0);
        const precoCentavos = Math.round(itemPrice * 100);
        const quantity = Number(item.quantity || 1) || 1;

        cartStore.addToCart({
          id: item.id || item.product_id,
          name: item.name || item.product_name,
          nome: item.name || item.product_name,
          price: itemPrice,
          preco: `R$ ${itemPrice.toFixed(2).replace('.', ',')}`,
          precoNum: precoCentavos,
          quantity,
          quantidade: quantity,
          adicionais: (item.adicionais || []).map((a) => {
            const adicPrice = Number(a?.price || a?.preco || 0);
            return {
              id: a?.id || a?.name || a?.nome,
              name: typeof a === 'string' ? a : a?.name || a?.nome,
              nome: typeof a === 'string' ? a : a?.name || a?.nome,
              price: adicPrice,
              preco: adicPrice,
            };
          }),
          observacoes: item.notes || item.observacoes || '',
        });
      });
      router.push('/cart');
    } else {
      router.push('/cardapio');
    }
  };

  const handleHelp = (order) => {
    setHelpOrder(order);
  };

  const handleWhatsApp = () => {
    if (!helpOrder) {
      router.push('/ajuda');
      return;
    }
    const num = helpOrder.orderNumber || helpOrder.id.slice(-4).toUpperCase();
    const msg = encodeURIComponent(
      `Olá, preciso de ajuda com o meu pedido #${num}.\nCliente: ${helpOrder.customerName}\nTotal: R$ ${helpOrder.total.toFixed(2).replace('.', ',')}`
    );
    Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authLoading || initialLoading) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <MinimalHeader />
        <View style={s.centered}>
          <ActivityIndicator size="large" color="#FFB800" />
          <Text style={s.loadingText}>Carregando seus pedidos...</Text>
        </View>
      </View>
    );
  }

  // ── ESTADO DESLOGADO — REGRA DE OURO DO CLAUDE.md (NÃO ALTERAR) ──────────────
  if (!userId) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <MinimalHeader />
        <View style={es.wrap}>
          <Image source={batataDormindo} style={es.image} resizeMode="contain" />
          <Text style={es.title}>Poxa, você não tem nenhum pedido</Text>
          <Text style={es.sub}>
            Seus pedidos vão aparecer aqui quando você fizer. Que tal aproveitar as ofertas pra pedir agora?
          </Text>
          <Pressable onPress={() => router.push('/cardapio')} hitSlop={8}>
            <Text style={es.ctaText}>Fazer pedido</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Empty State Logado Sem Pedidos ──────────────────────────────────────────
  if (!initialLoading && orders.length === 0) {
    return (
      <View style={styles.screen}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
        <MinimalHeader />
        <View style={es.wrap}>
          <Image source={batataDormindo} style={es.image} resizeMode="contain" />
          <Text style={es.title}>Poxa, você não tem nenhum pedido</Text>
          <Text style={es.sub}>
            Seus pedidos vão aparecer aqui quando você fizer. Que tal aproveitar as ofertas pra pedir agora?
          </Text>
          <Pressable onPress={() => router.push('/cardapio')} hitSlop={8}>
            <Text style={es.ctaText}>Fazer pedido</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Separa pedidos em andamento vs histórico
  const activeOrders = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  );
  const pastOrders = orders.filter(
    (o) => o.status === 'delivered' || o.status === 'cancelled'
  );

  // Agrupa pedidos do histórico por data
  const groupedHistory = pastOrders.reduce((acc, order) => {
    const dateKey = formatOrderDate(order.createdAt);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(order);
    return acc;
  }, {});

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <ThemedAlertHost />

      {/* Header Minimalista Padrão Fixo no Topo */}
      <MinimalHeader />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: 16,
            paddingBottom: tabBarHeight + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── ZONA "EM ANDAMENTO" (TOPO) ─────────────────────────────────── */}
        {activeOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>Em andamento</Text>
            {activeOrders.map((order) => (
              <ActiveOrderCard
                key={order.id}
                order={order}
                onDetails={handleDetails}
              />
            ))}
          </View>
        )}

        {/* ── ZONA "HISTÓRICO" (ABAIXO) ──────────────────────────────────── */}
        {pastOrders.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionHeaderTitle}>Histórico</Text>

            {Object.keys(groupedHistory).map((dateKey) => (
              <View key={dateKey} style={styles.dateGroup}>
                <Text style={styles.dateGroupTitle}>{dateKey}</Text>
                {groupedHistory[dateKey].map((order) => (
                  <CompletedOrderCard
                    key={order.id}
                    order={order}
                    onDetails={handleDetails}
                    onOpenFeedback={handleOpenFeedback}
                    feedbackRating={feedbackMap[order.id]}
                    onReorder={handleReorder}
                    onHelp={handleHelp}
                  />
                ))}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Modal de Avaliação iFood */}
      <OrderFeedbackModal
        visible={feedbackModalVisible}
        order={selectedOrderForFeedback}
        initialRating={feedbackInitialRating}
        onClose={() => setFeedbackModalVisible(false)}
        onSubmitted={handleFeedbackSubmitted}
      />

      {/* Modal de Ajuda */}
      <HelpModal
        visible={!!helpOrder}
        onClose={() => setHelpOrder(null)}
        onContactSupport={handleWhatsApp}
      />
    </View>
  );
}

// ─── Estilos iFood Design System ─────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F1B16',
    marginBottom: 12,
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateGroupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#717171',
    marginBottom: 8,
    marginLeft: 4,
  },
  // Header Minimalista Padrão
  minimalHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    zIndex: 10,
  },
  minimalHeaderContent: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPlaceholder: {
    width: 44,
    height: 44,
  },
  minimalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F1B16',
    letterSpacing: 0.3,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B45309',
  },
  // Card Padrão iFood
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  storeLogo: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  storeTextCol: {
    flex: 1,
  },
  storeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F1B16',
  },
  orderNumberText: {
    fontSize: 12,
    color: '#71717A',
    marginTop: 1,
    fontWeight: '500',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  orderTotalHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F1B16',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 10,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  cardItemsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    gap: 8,
  },
  itemRowWrapper: {
    gap: 2,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemQtyBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQtyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#18181B',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
    flex: 1,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3F3F46',
  },
  itemAdicionais: {
    fontSize: 12,
    color: '#71717A',
    marginLeft: 30,
  },
  itemNotes: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#A1A1AA',
    marginLeft: 30,
  },
  cardSummaryLine: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  cardSummaryText: {
    fontSize: 12,
    color: '#71717A',
    fontWeight: '500',
  },
  pixActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFB800',
    borderRadius: 8,
    height: 38,
    marginTop: 10,
  },
  pixActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F1B16',
  },
  trackOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
  },
  trackOrderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  noItemsText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  // Faixa de Avaliação
  feedbackBanner: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  feedbackPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackPromptText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F1B16',
  },
  feedbackStarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedbackGivenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  feedbackGivenLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  feedbackRatingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF9E6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCE8C3',
  },
  feedbackRatingText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B45309',
  },
  // Rodapé Histórico
  historyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5F5F5',
  },
  helpBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  helpBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  reorderBtn: {
    backgroundColor: '#FFB800',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reorderBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F1B16',
  },
});

const s = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
});

// ─── Estilos Empty States (Preservado fielmente para Estado Deslogado) ────────
const es = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.background ?? '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6] ?? 24,
  },
  image: {
    width: 240,
    height: 240,
    marginBottom: SPACING[6] ?? 24,
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.text ?? '#1A1A1A',
    textAlign: 'center',
  },
  sub: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    color: COLORS.textSecondary ?? '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: SPACING[2] ?? 8,
  },
  ctaText: {
    fontSize: TYPOGRAPHY.sizes.base ?? 16,
    fontWeight: '700',
    color: '#FFB800',
    marginTop: SPACING[5] ?? 20,
  },
});
