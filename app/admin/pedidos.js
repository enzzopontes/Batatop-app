import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, RefreshControl, Modal, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';
import { startMaraTracking, stopMaraTracking, subscribeTrackingStatus } from '../../utils/maraTrackingEngine';
import { playNewOrderSound } from '../../utils/notificationSound';
import { syncAdminPushRegistration } from '../../utils/pushNotifications';
import { showThemedAlert } from '../../components/ThemedAlert';

// ─── Configurações ─────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:          { label: 'Pendente',   color: '#EA580C', bg: '#FFEDD5', icon: 'time-outline' },
  preparing:        { label: 'Preparando', color: '#2563EB', bg: '#DBEAFE', icon: 'restaurant-outline' },
  preparo:          { label: 'Preparando', color: '#2563EB', bg: '#DBEAFE', icon: 'restaurant-outline' },
  ready:            { label: 'Pronto',     color: '#7C3AED', bg: '#F3E8FF', icon: 'checkmark-circle-outline' },
  out_for_delivery: { label: 'Em Rota',    color: '#D97706', bg: '#FEF3C7', icon: 'bicycle-outline' },
  delivered:        { label: 'Entregue',   color: '#059669', bg: '#D1FAE5', icon: 'checkmark-done-outline' },
  entregue:         { label: 'Entregue',   color: '#059669', bg: '#D1FAE5', icon: 'checkmark-done-outline' },
  cancelled:        { label: 'Cancelado',  color: '#DC2626', bg: '#FEE2E2', icon: 'close-circle-outline' },
};

const FILTERS = [
  { key: 'all',              label: 'Todos',     color: '#FFB800' },
  { key: 'pending',          label: 'Pendentes', color: '#EA580C' },
  { key: 'preparing',        label: 'Preparo',   color: '#2563EB' },
  { key: 'ready',            label: 'Pronto',    color: '#7C3AED' },
  { key: 'out_for_delivery', label: 'Em Rota',   color: '#D97706' },
  { key: 'delivered',        label: 'Entregues', color: '#059669' },
  { key: 'cancelled',        label: 'Cancelados',color: '#DC2626' },
];

// Mapeia os dados do Supabase
const mapOrderData = (o) => {
  let items = [];

  if (o.order_items && o.order_items.length > 0) {
    items = o.order_items.map((item) => ({
      id: item.product_id,
      name: item.product_name,
      quantity: item.quantity,
      price: Number(item.product_price),
      adicionais: item.adicionais || [],
      pastaType: item.pasta_type || null,
      notes: item.notes || null,
    }));
  } else if (o.metadata?.items && o.metadata.items.length > 0) {
    items = o.metadata.items.map((item) => ({
      id: item.product_id || item.id,
      name: item.product_name || item.name,
      quantity: item.quantity,
      price: Number(item.product_price || item.price),
      adicionais: item.adicionais || [],
      pastaType: item.pastaType || null,
      notes: item.observacoes || null,
    }));
  }

  return {
    id: o.id,
    orderNumber: o.order_number || 0,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    items,
    total: Number(o.total_amount),
    status: o.status,
    paymentMethod: o.payment_method,
    deliveryType: o.delivery_type || 'delivery',
    address: o.customer_address,
    neighborhood: o.customer_neighborhood || '',
    complement: o.customer_complement || '',
    createdAt: new Date(o.created_at),
    notes: o.notes || '',
    discountAmount: Number(o.discount_amount || 0),
    couponCode: o.coupon_code || null,
    user_id: o.user_id || null,
    metadata: o.metadata || null,
    wantsCutlery: o.wants_cutlery || false,
  };
};

export default function AdminPedidos() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [trackingState, setTrackingState] = useState({ isRunning: false });
  const [togglingTracking, setTogglingTracking] = useState(false);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(true);

  const checkNotificationPermission = useCallback(async () => {
    try {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotificationPermission(status === 'granted');
    } catch {
      setHasNotificationPermission(true);
    }
  }, []);

  const requestNotificationPermission = async () => {
    try {
      const Notifications = await import('expo-notifications');
      const { status, canAskAgain } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setHasNotificationPermission(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await syncAdminPushRegistration(session.user);
        }
        playNewOrderSound(1);
        showThemedAlert('Notificações Ativadas', 'Você receberá avisos sonoros com todos os detalhes dos novos pedidos.');
      } else {
        setHasNotificationPermission(false);
        if (!canAskAgain) {
          showThemedAlert(
            'Permissão Necessária',
            'As notificações foram bloqueadas no dispositivo. Toque em Abrir Configurações para autorizar.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Abrir Configurações', onPress: () => Linking.openSettings() },
            ]
          );
        }
      }
    } catch (e) {
      console.warn('Erro ao solicitar permissão:', e);
    }
  };

  useEffect(() => {
    checkNotificationPermission();
  }, [checkNotificationPermission]);

  useEffect(() => {
    const unsub = subscribeTrackingStatus(setTrackingState);
    return unsub;
  }, []);

  const handleToggleTracking = async () => {
    setTogglingTracking(true);
    try {
      if (trackingState.isRunning) {
        stopMaraTracking();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        await startMaraTracking();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      showThemedAlert('Erro no GPS', e?.message || 'Não foi possível iniciar o rastreamento.');
    } finally {
      setTogglingTracking(false);
    }
  };

  const lastCountRef = useRef(0);
  const intervalRef = useRef(null);

  // ─── Carregar pedidos ───────────────────────────────────────────
  const loadOrders = useCallback(async (isInitial = false) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items (*)') // Join nos itens do pedido
        .neq('status', 'awaiting_payment')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(mapOrderData);
      lastCountRef.current = mapped.length;
      setOrders(mapped);
    } catch (e) {
      console.error('Erro ao carregar pedidos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders(true);
    intervalRef.current = setInterval(() => loadOrders(), 10000);

    const channelName = `admin-pedidos-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') {
            if (newRow?.status === 'awaiting_payment') return;
            playNewOrderSound(3);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadOrders();
          } else if (eventType === 'UPDATE') {
            if (newRow?.status === 'awaiting_payment') {
              setOrders((prev) => prev.filter((o) => o.id !== newRow.id));
              return;
            }
            if (oldRow?.status === 'awaiting_payment' && newRow?.status !== 'awaiting_payment' && newRow?.status !== 'cancelled') {
              playNewOrderSound(3);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            loadOrders();
          } else if (eventType === 'DELETE') {
            setOrders((prev) => prev.filter((o) => o.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  // ─── Atualizar status ───────────────────────────────────────────
  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await loadOrders();
      
      // Atualizar objeto selecionado no modal se necessário
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (e) {
      showThemedAlert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ─── Deletar pedido ─────────────────────────────────────────────
  const handleDelete = (order) => {
    showThemedAlert(
      'Deletar Pedido',
      `Tem certeza que deseja deletar o Pedido #${order.orderNumber}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deletar',
          style: 'destructive',
          onPress: async () => {
            try {
              // Deleta itens primeiro para evitar constraint error
              await supabase.from('order_items').delete().eq('order_id', order.id);
              const { error } = await supabase.from('orders').delete().eq('id', order.id);
              if (error) throw error;
              setModalVisible(false);
              await loadOrders();
            } catch {
              showThemedAlert('Erro', 'Não foi possível deletar o pedido.');
            }
          },
        },
      ]
    );
  };

  // ─── Filtrar pedidos ────────────────────────────────────────────
  const filtered = filter === 'all'
    ? orders
    : orders.filter(o => o.status === filter || (filter === 'preparing' && o.status === 'preparo'));

  const getCount = (key) => {
    if (key === 'all') return orders.length;
    if (key === 'preparing') return orders.filter(o => o.status === 'preparing' || o.status === 'preparo').length;
    return orders.filter(o => o.status === key).length;
  };

  const cfg = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.pending;

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={s.headerTitleContainer}>
          <View style={s.headerIconBg}>
            <Ionicons name="receipt" size={22} color="#D97706" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Gerenciar Pedidos</Text>
            <Text style={s.headerSubtitle}>Acompanhe e gerencie todos os pedidos ativos</Text>
          </View>
        </View>
        <Pressable onPress={() => { setRefreshing(true); loadOrders(); }} style={s.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#FFB800" />
        </Pressable>
      </View>

      {/* Banner de permissão de notificação se desativada */}
      {!hasNotificationPermission && (
        <View style={s.permBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="notifications-off-outline" size={22} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={s.permBannerTitle}>Notificações desativadas</Text>
              <Text style={s.permBannerSub}>Ative para receber alertas sonoros com todos os detalhes</Text>
            </View>
          </View>
          <Pressable style={s.permBannerBtn} onPress={requestNotificationPermission}>
            <Text style={s.permBannerBtnText}>Ativar</Text>
          </Pressable>
        </View>
      )}

      {/* Painel Batata Top Tracking Zero Cliques */}
      <View style={s.trackingCard}>
        <View style={s.trackingInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[s.trackingDot, trackingState.isRunning && s.trackingDotActive]} />
            <Text style={s.trackingTitle}>Rastreio Batata Top (Zero Cliques)</Text>
          </View>
          <Text style={s.trackingSub}>
            {trackingState.isRunning
              ? 'GPS ao vivo ativo • Auto-despacho e auto-baixa ligados'
              : 'Desativado • Ligue ao sair para entregas'}
          </Text>
        </View>
        <Pressable
          style={[s.trackingBtn, trackingState.isRunning && s.trackingBtnActive]}
          onPress={handleToggleTracking}
          disabled={togglingTracking}
        >
          {togglingTracking ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons
              name={trackingState.isRunning ? 'pause' : 'navigate'}
              size={16}
              color="#FFF"
            />
          )}
          <Text style={s.trackingBtnText}>
            {trackingState.isRunning ? 'Parar' : 'Ligar GPS'}
          </Text>
        </Pressable>
      </View>

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterBar} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[s.filterBtn, active && { backgroundColor: f.color, borderColor: f.color }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterCount, active && { color: '#FFF' }]}>{getCount(f.key)}</Text>
              <Text style={[s.filterLabel, active && { color: '#FFF' }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Lista */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#FFB800" />
          <Text style={s.loadingText}>Carregando pedidos...</Text>
        </View>
      ) : (
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} colors={['#FFB800']} />}
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={56} color="#E5E7EB" />
              <Text style={s.emptyText}>Nenhum pedido encontrado</Text>
            </View>
          ) : (
            filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                cfg={cfg}
                updatingId={updatingId}
                onStatusChange={handleStatusChange}
                onPress={() => { setSelectedOrder(order); setModalVisible(true); }}
                onDelete={() => handleDelete(order)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Modal detalhes */}
      <OrderModal
        visible={modalVisible}
        order={selectedOrder}
        cfg={cfg}
        updatingId={updatingId}
        onClose={() => setModalVisible(false)}
        onStatusChange={handleStatusChange}
        onDelete={() => selectedOrder && handleDelete(selectedOrder)}
      />
    </View>
  );
}

// ─── Card de Pedido ────────────────────────────────────────────────
function OrderCard({ order, cfg, updatingId, onStatusChange, onPress, onDelete }) {
  const c = cfg(order.status);
  
  // Detalhes de entrega
  const isDelivery = order.deliveryType === 'delivery';
  const fullAddress = isDelivery 
    ? `${order.address || ''}${order.neighborhood ? ', ' + order.neighborhood : ''}${order.complement ? ' - ' + order.complement : ''}`
    : 'Retirada na Loja';

  return (
    <Pressable style={[s.card, { borderLeftColor: c.color }]} onPress={onPress}>
      {/* Cabeçalho do card */}
      <View style={[s.cardHeader, { backgroundColor: c.bg }]}>
        <View style={s.cardHeaderLeft}>
          <View style={s.badgeRow}>
            <View style={[s.statusBadge, { backgroundColor: c.color }]}>
              <Ionicons name={c.icon} size={10} color="#FFF" />
              <Text style={s.statusBadgeText}>{c.label.toUpperCase()}</Text>
            </View>
            <View style={[s.typeBadge, { backgroundColor: isDelivery ? '#FFF' : '#EEF2F6', borderColor: isDelivery ? '#FFB800' : '#475569' }]}>
              <Ionicons name={isDelivery ? "bicycle-outline" : "storefront-outline"} size={10} color={isDelivery ? '#D97706' : '#475569'} />
              <Text style={[s.typeBadgeText, { color: isDelivery ? '#D97706' : '#475569' }]}>
                {isDelivery ? 'ENTREGA' : 'RETIRADA'}
              </Text>
            </View>
          </View>
          <Text style={s.orderNum}>Pedido #{order.orderNumber}</Text>
          <Text style={s.orderTime}>
            {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {order.customerName}
          </Text>
        </View>
        <View style={s.cardHeaderRight}>
          <Text style={s.cardTotal}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
          <Pressable onPress={onDelete} style={s.deleteBtn} hitSlop={8}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </Pressable>
        </View>
      </View>

      {/* Itens detalhados */}
      <View style={s.cardBody}>
        <View style={s.itemListContainer}>
          {order.items.map((i, idx) => (
            <View key={idx} style={s.itemShortRow}>
              <Text style={s.itemShortQty}>{i.quantity}x</Text>
              <Text style={s.itemShortName} numberOfLines={1}>{i.name}</Text>
              {i.pastaType && <Text style={s.itemShortPasta}>({i.pastaType})</Text>}
            </View>
          ))}
        </View>

        {/* Endereço */}
        <View style={s.addressRow}>
          <Ionicons name={isDelivery ? "location" : "storefront"} size={12} color="#9CA3AF" />
          <Text style={s.addressText} numberOfLines={1}>
            {fullAddress || 'Endereço não informado'}
          </Text>
        </View>

        {/* Informações adicionais rápidas */}
        <View style={s.metaRow}>
          <View style={s.metaPill}>
            <Ionicons name="wallet-outline" size={11} color="#6B7280" />
            <Text style={s.metaPillText}>{(order.paymentMethod || '').toUpperCase()}</Text>
          </View>
          {order.wantsCutlery && (
            <View style={[s.metaPill, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
              <Ionicons name="restaurant-outline" size={11} color="#EA580C" />
              <Text style={[s.metaPillText, { color: '#EA580C' }]}>Enviar Talheres</Text>
            </View>
          )}
          {order.couponCode && (
            <View style={[s.metaPill, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
              <Ionicons name="pricetag-outline" size={11} color="#7C3AED" />
              <Text style={[s.metaPillText, { color: '#7C3AED' }]}>{order.couponCode}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Botões de ação */}
      {order.status !== 'delivered' && order.status !== 'entregue' && order.status !== 'cancelled' && (
        <View style={s.cardActions}>
          {(order.status === 'pending') && (
            <ActionBtn label="Preparar" icon="restaurant-outline" color="#2563EB" loading={updatingId === order.id} onPress={() => onStatusChange(order.id, 'preparing')} />
          )}
          {(order.status === 'preparing' || order.status === 'preparo') && (
            <ActionBtn label="Pronto" icon="checkmark-circle-outline" color="#7C3AED" loading={updatingId === order.id} onPress={() => onStatusChange(order.id, 'ready')} />
          )}
          {order.status === 'ready' && (
            <ActionBtn label="Entregue" icon="checkmark-done-outline" color="#059669" loading={updatingId === order.id} onPress={() => onStatusChange(order.id, 'delivered')} />
          )}
          <ActionBtn label="Cancelar" icon="close-circle-outline" color="#DC2626" outline loading={updatingId === order.id} onPress={() => onStatusChange(order.id, 'cancelled')} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Botão de Ação ─────────────────────────────────────────────────
function ActionBtn({ label, icon, color, outline, loading, onPress }) {
  return (
    <Pressable
      style={[s.actionBtn, outline ? { borderColor: color, borderWidth: 1.5, backgroundColor: '#FFF' } : { backgroundColor: color }]}
      onPress={onPress}
      disabled={loading}
    >
      {loading
        ? <ActivityIndicator size="small" color={outline ? color : '#FFF'} />
        : <>
            <Ionicons name={icon} size={14} color={outline ? color : '#FFF'} />
            <Text style={[s.actionBtnText, outline && { color }]}>{label}</Text>
          </>
      }
    </Pressable>
  );
}

// ─── Modal de detalhes ─────────────────────────────────────────────
function OrderModal({ visible, order, cfg, updatingId, onClose, onStatusChange, onDelete }) {
  if (!order) return null;
  const c = cfg(order.status);
  const isDelivery = order.deliveryType === 'delivery';

  // Abrir WhatsApp do cliente
  const handleWhatsApp = () => {
    const cleanPhone = order.customerPhone.replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}`;
    Linking.openURL(url).catch(() => showThemedAlert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  return (
    <Modal visible={visible} animationType="none" statusBarTranslucent navigationBarTranslucent presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={s.modalContainer}>
        {/* Modal Header */}
        <View style={[s.modalHeader, { backgroundColor: c.color }]}>
          <View>
            <Text style={s.modalTitle}>Pedido #{order.orderNumber}</Text>
            <View style={s.modalStatusRow}>
              <Ionicons name={c.icon} size={14} color="#FFF" />
              <Text style={s.modalStatus}>{c.label.toUpperCase()} · {isDelivery ? 'ENTREGA' : 'RETIRADA'}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={s.modalCloseBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </Pressable>
        </View>

        <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
          
          {/* Ações Rápidas no Modal */}
          <View style={s.modalQuickActions}>
            <Pressable style={s.whatsappBtn} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={16} color="#FFF" />
              <Text style={s.whatsappBtnText}>WhatsApp do Cliente</Text>
            </Pressable>
          </View>

          {/* Cliente */}
          <SectionLabel icon="person-outline" label="Dados do Cliente" />
          <InfoRow icon="person-outline" label="Nome" value={order.customerName} />
          <InfoRow icon="call-outline" label="Telefone" value={order.customerPhone} />
          <InfoRow 
            icon="location-outline" 
            label="Endereço de Entrega" 
            value={
              isDelivery
                ? `${order.address || ''}${order.neighborhood ? '\nBairro: ' + order.neighborhood : ''}${order.complement ? '\nComp: ' + order.complement : ''}`
                : 'Retirada na loja pelo cliente'
            } 
          />
          <InfoRow icon="card-outline" label="Forma de Pagamento" value={(order.paymentMethod || '').toUpperCase()} />

          {/* Opções especiais */}
          <SectionLabel icon="options-outline" label="Preferências" />
          <InfoRow icon="restaurant-outline" label="Enviar Talheres?" value={order.wantsCutlery ? 'Sim' : 'Não'} />

          {/* Itens */}
          <SectionLabel icon="basket-outline" label="Itens do Pedido" />
          {order.items.map((item, i) => (
            <View key={i} style={s.itemRow}>
              <View style={s.itemQtyBadge}>
                <Text style={s.itemQty}>{item.quantity}x</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.pastaType && <Text style={s.itemDetail}>Tipo de Massa: {item.pastaType}</Text>}
                {Array.isArray(item.adicionais) && item.adicionais.length > 0 && (
                  <Text style={s.itemDetail}>Adicionais: {item.adicionais.map(a => `${a.quantity}x ${a.name}`).join(', ')}</Text>
                )}
                {item.notes && <Text style={s.itemNote}>Obs Item: "{item.notes}"</Text>}
              </View>
              <Text style={s.itemPrice}>R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</Text>
            </View>
          ))}

          {/* Observações do pedido */}
          {!!order.notes && (
            <>
              <SectionLabel icon="document-text-outline" label="Observações do Pedido" />
              <View style={s.notesBox}>
                <Text style={s.notesText}>{order.notes}</Text>
              </View>
            </>
          )}

          {/* Totais */}
          <SectionLabel icon="cash-outline" label="Valores" />
          <View style={s.totalsBox}>
            <View style={s.totalDetailLine}>
              <Text style={s.totalDetailLabel}>Subtotal</Text>
              <Text style={s.totalDetailVal}>R$ {(order.total + order.discountAmount).toFixed(2).replace('.', ',')}</Text>
            </View>
            {order.discountAmount > 0 && (
              <View style={s.totalDetailLine}>
                <Text style={[s.totalDetailLabel, { color: '#059669' }]}>Desconto {order.couponCode ? `(${order.couponCode})` : ''}</Text>
                <Text style={[s.totalDetailVal, { color: '#059669' }]}>- R$ {order.discountAmount.toFixed(2).replace('.', ',')}</Text>
              </View>
            )}
            <View style={s.modalTotalDivider} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total Pago</Text>
              <Text style={s.totalValue}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
            </View>
          </View>

          {/* Ações do modal */}
          {order.status !== 'delivered' && order.status !== 'entregue' && order.status !== 'cancelled' && (
            <View style={s.modalActions}>
              {order.status === 'pending' && (
                <Pressable style={[s.modalActionBtn, { backgroundColor: '#2563EB' }]} onPress={() => onStatusChange(order.id, 'preparing')} disabled={updatingId === order.id}>
                  {updatingId === order.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="restaurant-outline" size={18} color="#FFF" /><Text style={s.modalActionText}>Preparar Pedido</Text></>}
                </Pressable>
              )}
              {(order.status === 'preparing' || order.status === 'preparo') && (
                <Pressable style={[s.modalActionBtn, { backgroundColor: '#7C3AED' }]} onPress={() => onStatusChange(order.id, 'ready')} disabled={updatingId === order.id}>
                  {updatingId === order.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#FFF" /><Text style={s.modalActionText}>Marcar como Pronto</Text></>}
                </Pressable>
              )}
              {order.status === 'ready' && (
                <Pressable style={[s.modalActionBtn, { backgroundColor: '#D97706' }]} onPress={() => onStatusChange(order.id, 'out_for_delivery')} disabled={updatingId === order.id}>
                  {updatingId === order.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="bicycle-outline" size={18} color="#FFF" /><Text style={s.modalActionText}>Saiu para Entrega</Text></>}
                </Pressable>
              )}
              {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                <Pressable style={[s.modalActionBtn, { backgroundColor: '#059669' }]} onPress={() => onStatusChange(order.id, 'delivered')} disabled={updatingId === order.id}>
                  {updatingId === order.id ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="checkmark-done-outline" size={18} color="#FFF" /><Text style={s.modalActionText}>Marcar como Entregue</Text></>}
                </Pressable>
              )}
              <Pressable style={[s.modalActionBtn, { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#DC2626' }]} onPress={() => onStatusChange(order.id, 'cancelled')}>
                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                <Text style={[s.modalActionText, { color: '#DC2626' }]}>Cancelar Pedido</Text>
              </Pressable>
            </View>
          )}

          <Pressable style={s.deleteOrderBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={s.deleteOrderText}>Deletar Pedido Permanentemente</Text>
          </Pressable>
        </ScrollView>
      </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function SectionLabel({ icon, label }) {
  return (
    <View style={s.sectionLabel}>
      <Ionicons name={icon} size={13} color="#9CA3AF" />
      <Text style={s.sectionLabelText}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={16} color="#6B7280" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Estilos ───────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBg: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
  },

  filterBar: { maxHeight: 80, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#FFF', alignItems: 'center', minWidth: 68 },
  filterCount: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', lineHeight: 22 },
  filterLabel: { fontSize: 10, fontWeight: '700', color: '#6B7280' },

  list: { flex: 1 },
  listContent: { padding: 12, gap: 12, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#9CA3AF', fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { color: '#D1D5DB', fontSize: 15, fontWeight: '700' },

  card: { backgroundColor: '#FFF', borderRadius: 24, borderLeftWidth: 6, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, justifyContent: 'space-between' },
  cardHeaderLeft: { flex: 1 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 6 },
  
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  typeBadgeText: { fontSize: 9, fontWeight: '900' },
  
  orderNum: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  orderTime: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  cardTotal: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  deleteBtn: { padding: 4 },

  cardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  itemListContainer: { backgroundColor: '#F8F9FA', borderRadius: 14, padding: 10, gap: 4, borderWidth: 1, borderColor: '#F0F0F0' },
  itemShortRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemShortQty: { fontSize: 11, fontWeight: '900', color: '#D97706', width: 20 },
  itemShortName: { fontSize: 12, fontWeight: '700', color: '#1C1917', flex: 1 },
  itemShortPasta: { fontSize: 10, color: '#D97706', fontWeight: '600' },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressText: { fontSize: 12, color: '#4B5563', fontWeight: '600', flex: 1 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#F9FAFB' },
  metaPillText: { fontSize: 10, fontWeight: '700', color: '#4B5563' },

  cardActions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14, flexWrap: 'wrap' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, minWidth: 90 },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 20, paddingTop: 24 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  modalStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  modalStatus: { color: '#FFF', fontSize: 11, fontWeight: '800', opacity: 0.95 },
  modalCloseBtn: { padding: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },

  modalBody: { flex: 1 },
  modalQuickActions: { paddingHorizontal: 16, paddingTop: 16 },
  whatsappBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 10 },
  whatsappBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },

  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectionLabelText: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  infoIcon: { width: 36, height: 36, backgroundColor: '#F9FAFB', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },

  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemQtyBadge: { width: 36, height: 36, backgroundColor: '#FEF3C7', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemQty: { fontSize: 12, fontWeight: '900', color: '#D97706' },
  itemName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  itemDetail: { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  itemNote: { fontSize: 11, color: '#DC2626', fontStyle: 'italic', marginTop: 2, fontWeight: '500' },
  itemPrice: { fontSize: 14, fontWeight: '900', color: '#1A1A1A' },

  notesBox: { marginHorizontal: 16, padding: 14, backgroundColor: '#FFF9E6', borderRadius: 16, borderWidth: 1, borderColor: '#FEF3C7' },
  notesText: { fontSize: 13, color: '#92400E', fontWeight: '600', lineHeight: 20 },

  totalsBox: { marginHorizontal: 16, padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  totalDetailLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalDetailLabel: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  totalDetailVal: { fontSize: 12, fontWeight: '700', color: '#1A1A1A' },
  modalTotalDivider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '900', color: '#1A1A1A' },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#FFB800' },

  modalActions: { marginHorizontal: 16, marginTop: 20, gap: 10 },
  modalActionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 16, paddingHorizontal: 20 },
  modalActionText: { fontSize: 15, fontWeight: '800', color: '#FFF' },

  deleteOrderBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#FEE2E2', backgroundColor: '#FFF' },
  deleteOrderText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },

  // Tracking Painel Mara
  trackingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3E8FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  trackingInfo: { flex: 1, marginRight: 8 },
  trackingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#9CA3AF' },
  trackingDotActive: { backgroundColor: '#10B981' },
  trackingTitle: { fontSize: 13, fontWeight: '800', color: '#1F2937' },
  trackingSub: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  trackingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  trackingBtnActive: { backgroundColor: '#DC2626' },
  trackingBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // Banner de Permissão de Notificações
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  permBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
  },
  permBannerSub: {
    fontSize: 11,
    color: '#B91C1C',
    marginTop: 2,
  },
  permBannerBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  permBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
