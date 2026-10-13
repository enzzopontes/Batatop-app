import {
  View,
  Text,
  Image,
  ScrollView,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { usePedidos } from './hooks/usePedidos';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange } from '../utils/authSession';
import { useScrollHandler, useHeaderHeight } from './_layout';
import HelpModal from '../components/HelpModal';
import batataDormindo from '../assets/batatadormindo.png';

// ─── Constantes de status ────────────────────────────────────────────────────

const STATUS_LABELS = {
  awaiting_payment: 'A Pagar',
  pending: 'Aguardando',
  preparing: 'Preparando',
  ready: 'Pronto',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const STATUS_COLORS = {
  awaiting_payment: '#7C3AED',
  pending: '#D97706',
  preparing: '#EA580C',
  ready: '#2563EB',
  delivered: '#16A34A',
  cancelled: '#DC2626',
};

const STATUS_BG = {
  awaiting_payment: '#F5F3FF',
  pending: '#FEF3C7',
  preparing: '#FFF7ED',
  ready: '#EFF6FF',
  delivered: '#F0FDF4',
  cancelled: '#FEF2F2',
};

/** Retorna 1–4 (passo atual na barra de progresso). 0 = cancelado. */
const getStatusStep = (status) => {
  const map = { awaiting_payment: 0, pending: 1, preparing: 2, ready: 3, delivered: 4, cancelled: -1 };
  return map[status] ?? 1;
};

// ─── Barra de progresso ───────────────────────────────────────────────────────

function ProgressBar({ status }) {
  const step = getStatusStep(status);
  if (status === 'cancelled') return null;

  // Status especial: aguardando pagamento PIX
  if (status === 'awaiting_payment') {
    return (
      <View style={[pb.wrapper, { backgroundColor: '#F5F3FF', borderRadius: 12, padding: 12, marginTop: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="qr-code-outline" size={18} color="#7C3AED" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 13, color: '#5B21B6' }}>Aguardando pagamento PIX</Text>
            <Text style={{ fontSize: 11, color: '#7C3AED', marginTop: 2 }}>Pague o QR Code para confirmar seu pedido</Text>
          </View>
        </View>
      </View>
    );
  }

  const steps = ['Confirmado', 'Preparo', 'Pronto', 'Entregue'];
  const progressPercent = ((step - 1) / 3) * 100;

  return (
    <View style={pb.wrapper}>
      {/* Trilha */}
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Dots */}
      <View style={pb.dotsRow}>
        {steps.map((label, i) => {
          const active = i + 1 <= step;
          return (
            <View key={label} style={pb.dotCol}>
              <View style={[pb.dot, active && pb.dotActive]} />
              <Text style={[pb.dotLabel, active && pb.dotLabelActive]}>{label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Card de pedido ───────────────────────────────────────────────────────────

function OrderCard({ order, onDetails, onCancel, cancellingId }) {
  const statusColor = STATUS_COLORS[order.status] ?? COLORS.textMuted;
  const statusBg = STATUS_BG[order.status] ?? COLORS.borderLight;
  const label = STATUS_LABELS[order.status] ?? order.status;
  const isCancelling = cancellingId === order.id;
  const canCancel = ['pending', 'preparing', 'awaiting_payment'].includes(order.status);
  const [helpVisible, setHelpVisible] = useState(false);

  const dateStr = order.createdAt
    ? order.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
  const timeStr = order.createdAt
    ? order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleWhatsApp = () => {
    const num = order.orderNumber || order.id.slice(-4).toUpperCase();
    const msg = encodeURIComponent(
      `Olá, preciso de ajuda com o meu pedido #${num}.\nCliente: ${order.customerName}\nTotal: R$ ${order.total.toFixed(2).replace('.', ',')}`
    );
    Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
  };

  return (
    <View style={card.container}>
      {/* Cabeçalho */}
      <View style={card.header}>
        <View style={card.headerLeft}>
          <View style={card.iconBox}>
            <Ionicons name="bag-handle-outline" size={20} color={COLORS.primary} />
          </View>
          <View>
            <Text style={card.orderNum}>
              Pedido #{order.orderNumber || order.id.slice(-4).toUpperCase()}
            </Text>
            <Text style={card.orderDate}>
              {dateStr} às {timeStr}
            </Text>
          </View>
        </View>
        <View style={[card.badge, { backgroundColor: statusBg }]}>
          <Text style={[card.badgeText, { color: statusColor }]}>{label}</Text>
        </View>
      </View>

      {/* Barra de progresso */}
      <ProgressBar status={order.status} />

      {/* Itens */}
      <View style={card.itemsSection}>
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => (
            <View key={idx} style={card.itemRow}>
              <Text style={card.itemName} numberOfLines={1}>
                {item.quantity}x {item.name}
              </Text>
              <Text style={card.itemPrice}>
                R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
              </Text>
            </View>
          ))
        ) : (
          <Text style={card.noItems}>Itens não disponíveis</Text>
        )}
      </View>

      {/* Cupom (se houver) */}
      {!!order.couponCode && (
        <View style={card.couponRow}>
          <Ionicons name="ticket-outline" size={13} color="#16A34A" />
          <Text style={card.couponLabel}>Cupom: {order.couponCode}</Text>
          {order.discountAmount > 0 && (
            <Text style={card.couponDiscount}>
              - R$ {order.discountAmount.toFixed(2).replace('.', ',')}
            </Text>
          )}
        </View>
      )}

      {/* Rodapé */}
      <View style={card.footer}>
        <View>
          <Text style={card.totalLabel}>Total</Text>
          <Text style={card.totalValue}>
            R$ {order.total.toFixed(2).replace('.', ',')}
          </Text>
        </View>
        <View style={card.footerActions}>
          {canCancel && (
            <Pressable
              style={[card.btnCancel, isCancelling && { opacity: 0.6 }]}
              onPress={() => onCancel(order)}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <ActivityIndicator size={12} color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
                  <Text style={card.btnCancelText}>Cancelar</Text>
                </>
              )}
            </Pressable>
          )}
          <Pressable style={card.btnHelp} onPress={() => setHelpVisible(true)}>
            <Ionicons name="help-circle-outline" size={14} color="#16A34A" />
            <Text style={card.btnHelpText}>Ajuda</Text>
          </Pressable>
          <Pressable style={card.btnDetails} onPress={() => onDetails(order.id)}>
            <Text style={card.btnDetailsText}>Detalhes</Text>
            <Ionicons name="chevron-forward" size={14} color="#2563EB" />
          </Pressable>
        </View>
      </View>

      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        onContactSupport={handleWhatsApp}
      />
    </View>
  );
}

// ─── Filtros de status ────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: 'all',              label: 'Todos'      },
  { key: 'awaiting_payment', label: 'A Pagar'    },
  { key: 'pending',          label: 'Aguardando' },
  { key: 'preparing',        label: 'Preparando' },
  { key: 'ready',            label: 'Pronto'     },
  { key: 'delivered',        label: 'Entregue'   },
  { key: 'cancelled',        label: 'Cancelado'  },
];

function FilterTabs({ active, onChange }) {
  return (
    <FlatList
      horizontal
      data={FILTER_TABS}
      keyExtractor={(t) => t.key}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={filter.list}
      renderItem={({ item }) => {
        const isActive = active === item.key;
        return (
          <Pressable
            style={[filter.tab, isActive && filter.tabActive]}
            onPress={() => onChange(item.key)}
          >
            <Text style={[filter.tabText, isActive && filter.tabTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function Pedidos() {
  const router = useRouter();
  const { buscarPedidosPorUsuario } = usePedidos();
  const { onScroll, resetHeader } = useScrollHandler();
  const headerHeight = useHeaderHeight();
  const flatListRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      resetHeader();
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 50);
    }, [resetHeader])
  );

  const [orders, setOrders] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [userId, setUserId] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // initialLoading: spinner só na primeira carga de pedidos (não no polling/realtime)
  const [initialLoading, setInitialLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);

  // Ref estável ao userId — lido dentro dos callbacks do canal sem recriar o canal
  const userIdRef = useRef(null);

  // Pega o usuário logado via Supabase Auth — respeitando o soft-logout
  // (ver utils/authSession.js): se o usuário clicou "Sim, lembrar" no perfil,
  // a sessão real continua ativa, mas aqui deve contar como deslogado até
  // ele confirmar em "Continuar como".
  useEffect(() => {
    async function refreshEffectiveUserId() {
      const session = await getEffectiveSession();
      setUserId(session?.user?.id ?? null);
      setAuthLoading(false);
    }

    refreshEffectiveUserId();
    const unsubscribeUi = subscribeAuthUiChange(refreshEffectiveUserId);

    // NÃO setar userId direto de `session` aqui — a sessão real do Supabase
    // se renova sozinha em background (autoRefreshToken: true) e dispara
    // esse evento (ex: TOKEN_REFRESHED) mesmo com o soft-logout ligado.
    // Setar direto pisaria no soft-logout. Reconfere via getEffectiveSession.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshEffectiveUserId();
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeUi();
    };
  }, []);

  // Polling/realtime usam silent=true — não somem a FlatList durante refresh
  const fetchOrders = useCallback(async (uid, { silent = false } = {}) => {
    if (!uid) return;
    if (!silent) setInitialLoading(true);
    const resultado = await buscarPedidosPorUsuario(uid);
    if (resultado.success) {
      setOrders(resultado.data);
    } else if (!silent) {
      Alert.alert('Erro', 'Não foi possível carregar seus pedidos.');
    }
    if (!silent) setInitialLoading(false);
  }, [buscarPedidosPorUsuario]);

  // Mantém a ref sempre atualizada sem disparar re-renders
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const handleCancelOrder = (order) => {
    setOrderToCancel(order);
  };

  const CANCEL_ERROR_MESSAGES = {
    order_status_not_cancellable: 'Esse pedido já está a caminho e não pode mais ser cancelado.',
    forbidden_not_owner: 'Pedido não encontrado.',
    order_not_found: 'Pedido não encontrado.',
    unauthorized: 'Faça login novamente.',
  };

  const confirmCancelOrder = async () => {
    const order = orderToCancel;
    if (!order) return;
    const num = order.orderNumber || order.id.slice(-4).toUpperCase();
    setOrderToCancel(null);
    setCancellingId(order.id);
    try {
      const { error } = await supabase.rpc('cancel_order_user', {
        p_order_id: order.id,
      });

      if (error) {
        const msg = CANCEL_ERROR_MESSAGES[error.message] || error.message || 'Não foi possível cancelar o pedido.';
        Alert.alert('Atenção', msg);
        return;
      }

      // Abre WhatsApp igual ao site
      const msg = encodeURIComponent(
        `Olá, gostaria de cancelar meu pedido #${num}.\n\n*Detalhes do Pedido:*\nCliente: ${order.customerName}\nTotal: R$ ${order.total.toFixed(2).replace('.', ',')}`
      );
      Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);

      // Reload silencioso após cancelar — não some a lista
      await fetchOrders(userIdRef.current, { silent: true });
    } catch (err) {
      const msg = CANCEL_ERROR_MESSAGES[err?.message] || err?.message || 'Não foi possível cancelar o pedido. Entre em contato pelo WhatsApp.';
      Alert.alert('Erro', msg);
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!userId) return;

    // Nome único por montagem — evita o erro "cannot add postgres_changes after subscribe()"
    // que ocorre no StrictMode (React monta 2x em dev antes do cleanup do primeiro rodar)
    const channelName = `orders-status-${userId}-${Date.now()}`;

    // fetch inicial com spinner
    fetchOrders(userId);

    // Canal subscrito após o fetch inicial já ter sido disparado
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
        () => { fetchOrders(userIdRef.current, { silent: true }); }
      )
      .subscribe();

    // Polling silencioso a cada 30s
    const intervalo = setInterval(() => {
      fetchOrders(userIdRef.current, { silent: true });
    }, 30000);

    return () => {
      clearInterval(intervalo);
      supabase.removeChannel(channel);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtra localmente por status
  const pedidosFiltrados = orders.filter((o) =>
    filtroStatus === 'all' ? true : o.status === filtroStatus
  );

  // ── Loading / não logado ────────────────────────────────────────────────────
  // Bug 2: usa initialLoading — spinner só aparece no carregamento inicial,
  // não durante polling/realtime (que é silencioso)
  if (authLoading || initialLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Carregando seus pedidos...</Text>
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={es.wrap}>
        <Image source={batataDormindo} style={es.image} resizeMode="contain" />
        <Text style={es.title}>Seus pedidos vão aparecer aqui</Text>
        <Text style={es.sub}>
          Aqui você pode consultar pedidos em andamento, seu histórico e adicionar um pedido antigo à sacola
        </Text>
      </View>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (!initialLoading && orders.length === 0) {
    return (
      <View style={es.wrap}>
        <Image source={batataDormindo} style={es.image} resizeMode="contain" />
        <Text style={es.title}>Poxa, você não tem nenhum pedido</Text>
        <Text style={es.sub}>
          Seus pedidos vão aparecer aqui quando você fizer. Que tal aproveitar as ofertas pra pedir agora?
        </Text>
        <Pressable onPress={() => router.push('/')} hitSlop={8}>
          <Text style={es.ctaText}>Fazer pedido</Text>
        </Pressable>
      </View>
    );
  }

  // ── Lista ───────────────────────────────────────────────────────────────────
  // Header + filtros reutilizáveis como ListHeaderComponent
  const ListHeader = (
    <>
      <View style={s.header}>
        <Text style={s.title}>Meus Pedidos</Text>
        {/* Refresh manual usa silent=true — não pisca a lista */}
        <Pressable onPress={() => fetchOrders(userIdRef.current, { silent: true })} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color={COLORS.textSecondary} />
        </Pressable>
      </View>
      <FilterTabs active={filtroStatus} onChange={setFiltroStatus} />
    </>
  );

  // ── Lista ───────────────────────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* FlatList é o scroll principal — header e filtros entram no ListHeaderComponent
          pra que tudo suba junto ao arrastar, e o onScroll anima o header global */}
      <FlatList
        ref={flatListRef}
        data={pedidosFiltrados}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onDetails={(id) => router.push(`/pedidos/${id}`)}
            onCancel={handleCancelOrder}
            cancellingId={cancellingId}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <View style={s.centeredInline}>
            <Text style={s.emptyTitle}>Nenhum pedido com esse status</Text>
          </View>
        }
        contentContainerStyle={[s.listContent, { paddingTop: headerHeight }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />

      {/* Modal de confirmação de cancelamento — substitui o Alert.alert
          nativo por algo no estilo do app. */}
      <Modal
        visible={!!orderToCancel}
        transparent
        animationType="fade"
        onRequestClose={() => setOrderToCancel(null)}
      >
        <View style={s.cancelBackdrop}>
          <View style={s.cancelCard}>
            <View style={s.cancelIconWrap}>
              <Ionicons name="alert-circle" size={40} color="#DC2626" />
            </View>
            <Text style={s.cancelTitle}>Cancelar pedido</Text>
            <Text style={s.cancelSubtitle}>
              Tem certeza que deseja cancelar o pedido{' '}
              <Text style={s.cancelSubtitleBold}>
                #{orderToCancel?.orderNumber || orderToCancel?.id?.slice(-4).toUpperCase()}
              </Text>
              ? Essa ação não pode ser desfeita.
            </Text>

            <View style={s.cancelActions}>
              <Pressable
                style={s.cancelBtnGhost}
                onPress={() => setOrderToCancel(null)}
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
        </View>
      </Modal>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  cancelBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[6] ?? 24,
    gap: SPACING[3] ?? 12,
    backgroundColor: COLORS.backgroundElevated ?? '#F5F5F5',
  },
  // Versão do centered sem flex:1 — usada dentro do FlatList (ListEmptyComponent)
  centeredInline: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[6] ?? 24,
    paddingTop: SPACING[8] ?? 32,
    gap: SPACING[3] ?? 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5] ?? 20,
    paddingTop: SPACING[5] ?? 20,
    paddingBottom: SPACING[3] ?? 12,
    backgroundColor: COLORS.backgroundElevated ?? '#F5F5F5',
  },
  title: {
    fontSize: TYPOGRAPHY.sizes['2xl'] ?? 24,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  refreshBtn: {
    padding: SPACING[2] ?? 8,
  },
  listContent: {
    paddingHorizontal: SPACING[4] ?? 16,
    paddingBottom: SPACING[8] ?? 32,
    gap: SPACING[4] ?? 16,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: SPACING[3] ?? 12,
    color: COLORS.textSecondary ?? '#666',
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
  },
});

// Card
const card = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white ?? '#FFF',
    borderRadius: RADIUS.xl ?? 16,
    borderWidth: 1,
    borderColor: COLORS.border ?? '#E5E5E5',
    overflow: 'hidden',
    ...SHADOWS?.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING[4] ?? 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight ?? '#F0F0F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3] ?? 12,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg ?? 12,
    backgroundColor: '#FEF9C3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orderNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted ?? '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderDate: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  badge: {
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full ?? 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemsSection: {
    paddingHorizontal: SPACING[4] ?? 16,
    paddingVertical: SPACING[3] ?? 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight ?? '#F0F0F0',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemName: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    color: COLORS.textSecondary ?? '#555',
    marginRight: SPACING[2] ?? 8,
  },
  itemPrice: {
    fontSize: TYPOGRAPHY.sizes.sm ?? 14,
    fontWeight: '700',
    color: COLORS.text ?? '#111',
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
    marginHorizontal: SPACING[4] ?? 16,
    marginBottom: SPACING[2] ?? 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: 6,
    borderRadius: RADIUS.lg ?? 12,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4] ?? 16,
    paddingVertical: SPACING[3] ?? 12,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted ?? '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: TYPOGRAPHY.sizes.lg ?? 18,
    fontWeight: '800',
    color: COLORS.text ?? '#111',
  },
  footerActions: {
    flexDirection: 'row',
    gap: SPACING[2] ?? 8,
    alignItems: 'center',
  },
  btnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: SPACING[2] ?? 8,
    borderRadius: RADIUS.md ?? 8,
    backgroundColor: '#FEF2F2',
  },
  btnCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  btnHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: SPACING[2] ?? 8,
    borderRadius: RADIUS.md ?? 8,
    backgroundColor: '#F0FDF4',
  },
  btnHelpText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  btnDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: SPACING[3] ?? 12,
    paddingVertical: SPACING[2] ?? 8,
    borderRadius: RADIUS.md ?? 8,
    backgroundColor: '#EFF6FF',
  },
  btnDetailsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});

// Progress bar
const pb = StyleSheet.create({
  wrapper: {
    paddingHorizontal: SPACING[4] ?? 16,
    paddingTop: SPACING[3] ?? 12,
    paddingBottom: SPACING[2] ?? 8,
  },
  track: {
    height: 4,
    backgroundColor: COLORS.borderLight ?? '#F0F0F0',
    borderRadius: 2,
    marginBottom: SPACING[2] ?? 8,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dotCol: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight ?? '#E0E0E0',
    borderWidth: 2,
    borderColor: COLORS.border ?? '#D0D0D0',
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  dotLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.textMuted ?? '#BBB',
    textTransform: 'uppercase',
  },
  dotLabelActive: {
    color: COLORS.primary,
  },
});

// Filtros
const filter = StyleSheet.create({
  list: {
    paddingHorizontal: SPACING[4] ?? 16,
    paddingVertical: SPACING[3] ?? 12,
    gap: SPACING[2] ?? 8,
  },
  tab: {
    paddingHorizontal: SPACING[4] ?? 16,
    paddingVertical: SPACING[2] ?? 8,
    borderRadius: RADIUS.full ?? 999,
    backgroundColor: COLORS.borderLight ?? '#F0F0F0',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary ?? '#666',
  },
  tabTextActive: {
    color: '#FFF',
  },
});

// ─── Estilos — Empty states (deslogado / logado sem pedidos) ─────────────────
// Layout compartilhado pelas Images 1 e 2 do design: ilustração + título +
// descrição, com o CTA "Fazer pedido" aparecendo só no estado deslogado.
const es = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.background ?? '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6] ?? 24,
  },
  image: {
    width: 200,
    height: 200,
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
    color: COLORS.primary,
    marginTop: SPACING[5] ?? 20,
  },
});
