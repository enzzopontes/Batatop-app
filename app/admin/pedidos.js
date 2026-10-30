import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, RefreshControl, Modal, Linking, Share, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';
import { startMaraTracking, stopMaraTracking, subscribeTrackingStatus } from '../../utils/maraTrackingEngine';
import { playNewOrderSound } from '../../utils/notificationSound';
import { syncAdminPushRegistration } from '../../utils/pushNotifications';
import { showThemedAlert, ThemedAlertHost } from '../../components/ThemedAlert';
import SwipeableBottomSheetModal from '../../components/SwipeableBottomSheetModal';
import { AdminListSkeleton } from '../../components/Skeleton';

// ─── Design Tokens Batata Top / iFood Gestor ────────────────────────
const COLORS = {
  primary: '#E3A008',       // Âmbar Dourado iFood Gestor
  primaryDark: '#B87F00',
  primaryLight: '#FFF9E6',
  terracotta: '#C1440E',    // Terracota
  terracottaLight: '#FFF1EC',
  bg: '#F6F7F9',
  cardBg: '#FFFFFF',
  textMain: '#191919',
  textMuted: '#686B70',
  textSub: '#8F9298',
  border: '#E8EAED',
  borderLight: '#F0F2F5',
  green: '#059669',
  greenBg: '#ECFDF5',
  red: '#DC2626',
  redBg: '#FEF2F2',
  blue: '#2563EB',
  blueBg: '#EFF6FF',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
};

// ─── Configurações de Status ────────────────────────────────────────
const STATUS_CONFIG = {
  pending:          { label: 'Pendente',   color: '#C1440E', bg: '#FFF1EC', icon: 'time-outline', badgeText: '#C1440E' },
  preparing:        { label: 'Preparo',    color: '#D97706', bg: '#FFFBEB', icon: 'flame-outline', badgeText: '#B45309' },
  preparo:          { label: 'Preparo',    color: '#D97706', bg: '#FFFBEB', icon: 'flame-outline', badgeText: '#B45309' },
  ready:            { label: 'Pronto',     color: '#7C3AED', bg: '#F5F3FF', icon: 'checkmark-circle-outline', badgeText: '#6D28D9' },
  out_for_delivery: { label: 'Em Rota',    color: '#2563EB', bg: '#EFF6FF', icon: 'bicycle-outline', badgeText: '#1D4ED8' },
  delivered:        { label: 'Entregue',   color: '#059669', bg: '#ECFDF5', icon: 'checkmark-done-outline', badgeText: '#047857' },
  entregue:         { label: 'Entregue',   color: '#059669', bg: '#ECFDF5', icon: 'checkmark-done-outline', badgeText: '#047857' },
  cancelled:        { label: 'Cancelado',  color: '#DC2626', bg: '#FEF2F2', icon: 'close-circle-outline', badgeText: '#B91C1C' },
};

const FILTERS = [
  { key: 'all',              label: 'Todos',     color: COLORS.primary },
  { key: 'pending',          label: 'Pendentes', color: COLORS.terracotta },
  { key: 'preparing',        label: 'Preparo',   color: '#D97706' },
  { key: 'ready',            label: 'Prontos',   color: '#7C3AED' },
  { key: 'out_for_delivery', label: 'Em Rota',   color: '#2563EB' },
  { key: 'delivered',        label: 'Entregues', color: '#059669' },
  { key: 'cancelled',        label: 'Cancelados',color: '#DC2626' },
];

// ─── Formatador de Comanda Térmica ─────────────────────────────────
const generateThermalReceipt = (order) => {
  const isDelivery = order.deliveryType === 'delivery';
  const divider = '------------------------------------------';
  const doubleDivider = '==========================================';
  const timeStr = order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = order.createdAt.toLocaleDateString('pt-BR');

  let text = `           BATATA TOP GOURMET             \n`;
  text += `        COMPROVANTE DE PEDIDO             \n`;
  text += `${doubleDivider}\n`;
  text += `PEDIDO: #${order.orderNumber}\n`;
  text += `DATA: ${dateStr} - ${timeStr}\n`;
  text += `TIPO: ${isDelivery ? '>>> ENTREGA EM DOMICILIO <<<' : '>>> RETIRADA NO BALCAO <<<'}\n`;
  text += `${divider}\n`;
  text += `CLIENTE: ${order.customerName}\n`;
  text += `TELEFONE: ${order.customerPhone}\n`;
  if (isDelivery) {
    text += `ENDERECO: ${order.address || ''}\n`;
    if (order.neighborhood) text += `BAIRRO: ${order.neighborhood}\n`;
    if (order.complement) text += `COMPLEMENTO: ${order.complement}\n`;
  }
  text += `${divider}\n`;
  text += `ITENS DO PEDIDO:\n`;
  order.items.forEach((item) => {
    text += `${item.quantity}x ${item.name.toUpperCase()}\n`;
    if (item.pastaType) {
      text += `   Massa: ${item.pastaType}\n`;
    }
    if (Array.isArray(item.adicionais) && item.adicionais.length > 0) {
      item.adicionais.forEach(a => {
        text += `   + ${a.quantity}x ${a.name}\n`;
      });
    }
    if (item.notes) {
      text += `   OBS: ${item.notes}\n`;
    }
    const itemTotal = (item.price * item.quantity).toFixed(2).replace('.', ',');
    text += `   Subtotal Item: R$ ${itemTotal}\n`;
  });
  text += `${divider}\n`;
  if (order.notes) {
    text += `OBSERVACOES GERAIS:\n${order.notes}\n`;
    text += `${divider}\n`;
  }
  text += `TALHERES DESCARTAVEIS: ${order.wantsCutlery ? 'SIM (ENVIAR)' : 'NAO'}\n`;
  text += `PAGAMENTO: ${(order.paymentMethod || '').toUpperCase()}\n`;
  text += `SUBTOTAL: R$ ${(order.total + order.discountAmount).toFixed(2).replace('.', ',')}\n`;
  if (order.discountAmount > 0) {
    text += `DESCONTO (${order.couponCode || 'CUPOM'}): -R$ ${order.discountAmount.toFixed(2).replace('.', ',')}\n`;
  }
  text += `${doubleDivider}\n`;
  text += `TOTAL FINAL: R$ ${order.total.toFixed(2).replace('.', ',')}\n`;
  text += `${doubleDivider}\n`;
  text += `        Impresso via Batata Top Gestor    \n`;
  return text;
};

// ─── Mapeamento de dados do Supabase ────────────────────────────────
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
  const [receiptOrder, setReceiptOrder] = useState(null);
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const intervalRef = useRef(null);

  // ─── Carregar pedidos ───────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .neq('status', 'awaiting_payment')
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map(mapOrderData);
      setOrders(mapped);
    } catch (e) {
      console.error('Erro ao carregar pedidos:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;
      await loadOrders();
      
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch {
      showThemedAlert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setUpdatingId(null);
    }
  };

  // ─── Deletar pedido ─────────────────────────────────────────────
  const handleDelete = (order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
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

  // ─── Compartilhar / Imprimir Comanda ─────────────────────────────
  const handleShareReceipt = async (order) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const receipt = generateThermalReceipt(order);
      await Clipboard.setStringAsync(receipt);
      await Share.share({
        message: receipt,
        title: `Comanda Pedido #${order.orderNumber}`,
      });
    } catch (e) {
      console.warn('Erro ao compartilhar comanda:', e);
    }
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
      {/* Header iFood Gestor */}
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <View style={s.headerTopRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={s.backBtn}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textMain} />
          </Pressable>

          <View style={s.headerBrandContainer}>
            <View style={s.brandLogoBadge}>
              <Ionicons name="receipt" size={18} color="#FFF" />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.headerTitle}>Gestor de Pedidos</Text>
                <View style={s.onlineBadge}>
                  <View style={s.onlineDot} />
                  <Text style={s.onlineText}>AO VIVO</Text>
                </View>
              </View>
              <Text style={s.headerSubtitle}>Batata Top Delivery & Balcão</Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRefreshing(true);
              loadOrders();
            }}
            style={s.refreshBtn}
            hitSlop={8}
          >
            <Ionicons name="sync-outline" size={20} color={COLORS.primaryDark} />
          </Pressable>
        </View>
      </View>

      {/* Banner de Permissão de Notificação */}
      {!hasNotificationPermission && (
        <View style={s.permBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={s.permIconBg}>
              <Ionicons name="notifications-off" size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.permBannerTitle}>Notificações Sonoras Desativadas</Text>
              <Text style={s.permBannerSub}>Ative para ouvir o alarme instantâneo a cada novo pedido</Text>
            </View>
          </View>
          <Pressable style={s.permBannerBtn} onPress={requestNotificationPermission}>
            <Text style={s.permBannerBtnText}>Ativar</Text>
          </Pressable>
        </View>
      )}

      {/* Painel Batata Top Tracking Zero Cliques */}
      <View style={s.trackingCard}>
        <View style={s.trackingLeft}>
          <View style={[s.trackingDot, trackingState.isRunning && s.trackingDotActive]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.trackingTitle}>Rastreamento Mara (GPS)</Text>
              {trackingState.isRunning && (
                <View style={s.gpsLiveTag}>
                  <Text style={s.gpsLiveText}>ON</Text>
                </View>
              )}
            </View>
            <Text style={s.trackingSub}>
              {trackingState.isRunning
                ? 'Localização ativa • Atualização em tempo real'
                : 'Inativo • Acione antes de iniciar as entregas'}
            </Text>
          </View>
        </View>
        <Pressable
          style={[s.trackingBtn, trackingState.isRunning && s.trackingBtnActive]}
          onPress={handleToggleTracking}
          disabled={togglingTracking}
        >
          {togglingTracking ? (
            <ThreeDotsLoader color="#FFF" dotSize={7} />
          ) : (
            <Ionicons
              name={trackingState.isRunning ? 'stop' : 'navigate'}
              size={14}
              color="#FFF"
            />
          )}
          <Text style={s.trackingBtnText}>
            {trackingState.isRunning ? 'Parar GPS' : 'Ligar GPS'}
          </Text>
        </Pressable>
      </View>

      {/* Filtros iFood Gestor */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={s.filterContent}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = getCount(f.key);
          return (
            <Pressable
              key={f.key}
              style={[
                s.filterBtn,
                active && { backgroundColor: COLORS.textMain, borderColor: COLORS.textMain }
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFilter(f.key);
              }}
            >
              <View style={[
                s.filterCountBadge,
                active
                  ? { backgroundColor: COLORS.primary }
                  : { backgroundColor: count > 0 ? '#E5E7EB' : '#F3F4F6' }
              ]}>
                <Text style={[
                  s.filterCount,
                  active ? { color: '#FFF' } : { color: COLORS.textMain }
                ]}>
                  {count}
                </Text>
              </View>
              <Text style={[
                s.filterLabel,
                active ? { color: '#FFF' } : { color: COLORS.textMuted }
              ]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Lista de Pedidos */}
      {loading ? (
        <AdminListSkeleton count={4} />
      ) : (
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadOrders();
              }}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={44} color="#CBD5E1" />
              </View>
              <Text style={s.emptyTitle}>Nenhum pedido encontrado</Text>
              <Text style={s.emptySub}>Aguardando novos pedidos entrarem na fila de preparo.</Text>
            </View>
          ) : (
            filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                cfg={cfg}
                updatingId={updatingId}
                onStatusChange={handleStatusChange}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedOrder(order);
                  setModalVisible(true);
                }}
                onOpenReceipt={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReceiptOrder(order);
                }}
                onDelete={() => handleDelete(order)}
              />
            ))
          )}
        </ScrollView>
      )}

      {/* Modal de Detalhes do Pedido */}
      <OrderModal
        visible={modalVisible}
        order={selectedOrder}
        cfg={cfg}
        updatingId={updatingId}
        onClose={() => setModalVisible(false)}
        onStatusChange={handleStatusChange}
        onOpenReceipt={() => {
          setReceiptOrder(selectedOrder);
        }}
        onDelete={() => selectedOrder && handleDelete(selectedOrder)}
      />

      {/* Modal de Comanda / Impressão Térmica */}
      <ThermalReceiptModal
        visible={!!receiptOrder}
        order={receiptOrder}
        onClose={() => setReceiptOrder(null)}
        onShare={() => receiptOrder && handleShareReceipt(receiptOrder)}
      />
    </View>
  );
}

// ─── Card de Pedido iFood Gestor ────────────────────────────────────
function OrderCard({ order, cfg, updatingId, onStatusChange, onPress, onOpenReceipt, onDelete }) {
  const c = cfg(order.status);
  const isDelivery = order.deliveryType === 'delivery';
  const fullAddress = isDelivery 
    ? `${order.address || ''}${order.neighborhood ? ', ' + order.neighborhood : ''}${order.complement ? ' - ' + order.complement : ''}`
    : 'Retirada no Balcão';

  return (
    <Pressable style={s.card} onPress={onPress}>
      {/* Topo do Card com Status & Ações */}
      <View style={s.cardHeader}>
        <View style={s.cardHeaderLeft}>
          <View style={s.badgeRow}>
            {/* Badge de Status */}
            <View style={[s.statusBadge, { backgroundColor: c.bg }]}>
              <Ionicons name={c.icon} size={11} color={c.badgeText} />
              <Text style={[s.statusBadgeText, { color: c.badgeText }]}>{c.label.toUpperCase()}</Text>
            </View>

            {/* Badge de Modalidade */}
            <View style={[
              s.typeBadge,
              isDelivery
                ? { backgroundColor: COLORS.terracottaLight, borderColor: COLORS.terracotta }
                : { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }
            ]}>
              <Ionicons
                name={isDelivery ? "bicycle-outline" : "storefront-outline"}
                size={11}
                color={isDelivery ? COLORS.terracotta : COLORS.textMuted}
              />
              <Text style={[
                s.typeBadgeText,
                { color: isDelivery ? COLORS.terracotta : COLORS.textMuted }
              ]}>
                {isDelivery ? 'ENTREGA' : 'RETIRADA'}
              </Text>
            </View>
          </View>

          <Text style={s.orderNum}>Pedido #{order.orderNumber}</Text>
          <Text style={s.orderTime}>
            {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • <Text style={s.customerNameText}>{order.customerName}</Text>
          </Text>
        </View>

        <View style={s.cardHeaderRight}>
          <Text style={s.cardTotal}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
          <View style={s.cardHeaderTools}>
            <Pressable
              onPress={onOpenReceipt}
              style={s.receiptQuickBtn}
              hitSlop={8}
            >
              <Ionicons name="print-outline" size={17} color={COLORS.primaryDark} />
            </Pressable>
            <Pressable
              onPress={onDelete}
              style={s.deleteBtn}
              hitSlop={8}
            >
              <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Itens do Pedido */}
      <View style={s.cardBody}>
        <View style={s.itemListContainer}>
          {order.items.map((i, idx) => (
            <View key={idx} style={s.itemShortRow}>
              <View style={s.qtyBadgeSmall}>
                <Text style={s.itemShortQty}>{i.quantity}x</Text>
              </View>
              <Text style={s.itemShortName} numberOfLines={1}>{i.name}</Text>
              {i.pastaType && <Text style={s.itemShortPasta}>({i.pastaType})</Text>}
            </View>
          ))}
        </View>

        {/* Endereço */}
        <View style={s.addressRow}>
          <Ionicons
            name={isDelivery ? "location-outline" : "storefront-outline"}
            size={13}
            color={COLORS.textSub}
          />
          <Text style={s.addressText} numberOfLines={1}>
            {fullAddress || 'Endereço não informado'}
          </Text>
        </View>

        {/* Badges Adicionais */}
        <View style={s.metaRow}>
          <View style={s.metaPill}>
            <Ionicons name="wallet-outline" size={11} color={COLORS.textMuted} />
            <Text style={s.metaPillText}>{(order.paymentMethod || '').toUpperCase()}</Text>
          </View>
          {order.wantsCutlery && (
            <View style={[s.metaPill, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <Ionicons name="restaurant-outline" size={11} color={COLORS.terracotta} />
              <Text style={[s.metaPillText, { color: COLORS.terracotta, fontWeight: '700' }]}>Enviar Talheres</Text>
            </View>
          )}
          {order.couponCode && (
            <View style={[s.metaPill, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
              <Ionicons name="pricetag-outline" size={11} color="#7C3AED" />
              <Text style={[s.metaPillText, { color: '#7C3AED' }]}>{order.couponCode}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Botões de Ação Direta no Card */}
      {order.status !== 'delivered' && order.status !== 'entregue' && order.status !== 'cancelled' && (
        <View style={s.cardActions}>
          {order.status === 'pending' && (
            <ActionBtn
              label="Iniciar Preparo"
              icon="flame-outline"
              color={COLORS.primary}
              loading={updatingId === order.id}
              onPress={() => onStatusChange(order.id, 'preparing')}
            />
          )}
          {(order.status === 'preparing' || order.status === 'preparo') && (
            <ActionBtn
              label="Marcar Pronto"
              icon="checkmark-circle-outline"
              color="#7C3AED"
              loading={updatingId === order.id}
              onPress={() => onStatusChange(order.id, 'ready')}
            />
          )}
          {order.status === 'ready' && (
            <ActionBtn
              label="Saiu p/ Entrega"
              icon="bicycle-outline"
              color="#2563EB"
              loading={updatingId === order.id}
              onPress={() => onStatusChange(order.id, 'out_for_delivery')}
            />
          )}
          {order.status === 'out_for_delivery' && (
            <ActionBtn
              label="Confirmar Entrega"
              icon="checkmark-done-outline"
              color="#059669"
              loading={updatingId === order.id}
              onPress={() => onStatusChange(order.id, 'delivered')}
            />
          )}
          <ActionBtn
            label="Cancelar"
            icon="close-circle-outline"
            color="#DC2626"
            outline
            loading={updatingId === order.id}
            onPress={() => onStatusChange(order.id, 'cancelled')}
          />
        </View>
      )}
    </Pressable>
  );
}

// ─── Botão de Ação Compacto ─────────────────────────────────────────
function ActionBtn({ label, icon, color, outline, loading, onPress }) {
  return (
    <Pressable
      style={[
        s.actionBtn,
        outline
          ? { borderColor: color, borderWidth: 1.5, backgroundColor: '#FFF' }
          : { backgroundColor: color }
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={loading}
    >
      {loading ? (
        <ThreeDotsLoader color={outline ? color : '#FFF'} dotSize={7} />
      ) : (
        <>
          <Ionicons name={icon} size={14} color={outline ? color : '#FFF'} />
          <Text style={[s.actionBtnText, outline && { color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ─── Modal de Detalhes do Pedido ────────────────────────────────────
function OrderModal({ visible, order, cfg, updatingId, onClose, onStatusChange, onOpenReceipt, onDelete }) {
  if (!order) return null;
  const c = cfg(order.status);
  const isDelivery = order.deliveryType === 'delivery';

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cleanPhone = (order.customerPhone || '').replace(/\D/g, '');
    const url = `https://wa.me/55${cleanPhone}`;
    Linking.openURL(url).catch(() => showThemedAlert('Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={[s.sheet, { height: '92%', maxHeight: '92%' }]}
      scrollable
    >
      <View style={s.modalContainer}>
        {/* Header do Modal */}
        <View style={[s.modalHeader, { backgroundColor: c.color }]}>
            <View>
              <Text style={s.modalTitle}>Pedido #{order.orderNumber}</Text>
              <View style={s.modalStatusRow}>
                <Ionicons name={c.icon} size={13} color="#FFF" />
                <Text style={s.modalStatus}>{c.label.toUpperCase()} · {isDelivery ? 'ENTREGA' : 'RETIRADA'}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onOpenReceipt();
                }}
                style={s.modalPrintTopBtn}
              >
                <Ionicons name="print-outline" size={18} color="#FFF" />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                style={s.modalCloseBtn}
              >
                <Ionicons name="close" size={20} color="#FFF" />
              </Pressable>
            </View>
          </View>

          <ScrollView style={s.modalBody} contentContainerStyle={{ paddingBottom: 50 }}>
            {/* Ações Rápidas no Modal */}
            <View style={s.modalQuickActions}>
              <Pressable style={s.whatsappBtn} onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={18} color="#FFF" />
                <Text style={s.whatsappBtnText}>Conversar no WhatsApp</Text>
              </Pressable>

              <Pressable
                style={s.receiptBtnLarge}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onOpenReceipt();
                }}
              >
                <Ionicons name="receipt-outline" size={18} color={COLORS.primaryDark} />
                <Text style={s.receiptBtnLargeText}>Ver Comanda / Imprimir</Text>
              </Pressable>
            </View>

            {/* Dados do Cliente */}
            <SectionLabel icon="person-outline" label="Dados do Cliente" />
            <InfoRow icon="person-outline" label="Nome" value={order.customerName} />
            <InfoRow icon="call-outline" label="Telefone" value={order.customerPhone} />
            <InfoRow
              icon="location-outline"
              label="Endereço de Entrega"
              value={
                isDelivery
                  ? `${order.address || ''}${order.neighborhood ? '\nBairro: ' + order.neighborhood : ''}${order.complement ? '\nComplemento: ' + order.complement : ''}`
                  : 'Retirada presencial no balcão'
              }
            />
            <InfoRow icon="card-outline" label="Forma de Pagamento" value={(order.paymentMethod || '').toUpperCase()} />

            {/* Preferências */}
            <SectionLabel icon="options-outline" label="Preferências de Entrega" />
            <InfoRow
              icon="restaurant-outline"
              label="Enviar Talheres Descartáveis?"
              value={order.wantsCutlery ? 'Sim, enviar talheres' : 'Não precisa de talheres'}
              highlight={order.wantsCutlery}
            />

            {/* Itens do Pedido */}
            <SectionLabel icon="basket-outline" label="Itens do Pedido" />
            <View style={s.itemsCardContainer}>
              {order.items.map((item, i) => (
                <View key={i} style={[s.itemRow, i < order.items.length - 1 && s.itemRowBorder]}>
                  <View style={s.itemQtyBadge}>
                    <Text style={s.itemQty}>{item.quantity}x</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName}>{item.name}</Text>
                    {item.pastaType && <Text style={s.itemDetail}>Tipo de Massa: {item.pastaType}</Text>}
                    {Array.isArray(item.adicionais) && item.adicionais.length > 0 && (
                      <Text style={s.itemDetail}>Adicionais: {item.adicionais.map(a => `${a.quantity}x ${a.name}`).join(', ')}</Text>
                    )}
                    {item.notes && <Text style={s.itemNote}>Obs: "{item.notes}"</Text>}
                  </View>
                  <Text style={s.itemPrice}>R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</Text>
                </View>
              ))}
            </View>

            {/* Observações do Pedido */}
            {!!order.notes && (
              <>
                <SectionLabel icon="document-text-outline" label="Observações Gerais do Cliente" />
                <View style={s.notesBox}>
                  <Text style={s.notesText}>{order.notes}</Text>
                </View>
              </>
            )}

            {/* Valores */}
            <SectionLabel icon="cash-outline" label="Resumo Financeiro" />
            <View style={s.totalsBox}>
              <View style={s.totalDetailLine}>
                <Text style={s.totalDetailLabel}>Subtotal</Text>
                <Text style={s.totalDetailVal}>R$ {(order.total + order.discountAmount).toFixed(2).replace('.', ',')}</Text>
              </View>
              {order.discountAmount > 0 && (
                <View style={s.totalDetailLine}>
                  <Text style={[s.totalDetailLabel, { color: COLORS.green }]}>Desconto {order.couponCode ? `(${order.couponCode})` : ''}</Text>
                  <Text style={[s.totalDetailVal, { color: COLORS.green }]}>- R$ {order.discountAmount.toFixed(2).replace('.', ',')}</Text>
                </View>
              )}
              <View style={s.modalTotalDivider} />
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total Pago</Text>
                <Text style={s.totalValue}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
              </View>
            </View>

            {/* Mudanças de Status */}
            {order.status !== 'delivered' && order.status !== 'entregue' && order.status !== 'cancelled' && (
              <View style={s.modalActions}>
                {order.status === 'pending' && (
                  <Pressable
                    style={[s.modalActionBtn, { backgroundColor: COLORS.primary }]}
                    onPress={() => onStatusChange(order.id, 'preparing')}
                    disabled={updatingId === order.id}
                  >
                    {updatingId === order.id ? (
                      <ThreeDotsLoader color="#FFF" dotSize={7} />
                    ) : (
                      <>
                        <Ionicons name="flame-outline" size={18} color="#FFF" />
                        <Text style={s.modalActionText}>Iniciar Preparo</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {(order.status === 'preparing' || order.status === 'preparo') && (
                  <Pressable
                    style={[s.modalActionBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={() => onStatusChange(order.id, 'ready')}
                    disabled={updatingId === order.id}
                  >
                    {updatingId === order.id ? (
                      <ThreeDotsLoader color="#FFF" dotSize={7} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                        <Text style={s.modalActionText}>Marcar como Pronto</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {order.status === 'ready' && (
                  <Pressable
                    style={[s.modalActionBtn, { backgroundColor: '#2563EB' }]}
                    onPress={() => onStatusChange(order.id, 'out_for_delivery')}
                    disabled={updatingId === order.id}
                  >
                    {updatingId === order.id ? (
                      <ThreeDotsLoader color="#FFF" dotSize={7} />
                    ) : (
                      <>
                        <Ionicons name="bicycle-outline" size={18} color="#FFF" />
                        <Text style={s.modalActionText}>Despachar / Saiu para Entrega</Text>
                      </>
                    )}
                  </Pressable>
                )}
                {(order.status === 'ready' || order.status === 'out_for_delivery') && (
                  <Pressable
                    style={[s.modalActionBtn, { backgroundColor: '#059669' }]}
                    onPress={() => onStatusChange(order.id, 'delivered')}
                    disabled={updatingId === order.id}
                  >
                    {updatingId === order.id ? (
                      <ThreeDotsLoader color="#FFF" dotSize={7} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
                        <Text style={s.modalActionText}>Confirmar Entrega Concluída</Text>
                      </>
                    )}
                  </Pressable>
                )}
                <Pressable
                  style={[s.modalActionBtn, { backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#DC2626' }]}
                  onPress={() => onStatusChange(order.id, 'cancelled')}
                  disabled={updatingId === order.id}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                  <Text style={[s.modalActionText, { color: '#DC2626' }]}>Cancelar Pedido</Text>
                </Pressable>
              </View>
            )}

            <Pressable style={s.deleteOrderBtn} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={s.deleteOrderText}>Excluir Pedido Permanentemente</Text>
            </Pressable>
          </ScrollView>
          <ThemedAlertHost />
        </View>
    </SwipeableBottomSheetModal>
  );
}

// ─── Modal de Comanda Térmica (Impressão / Compartilhar) ───────────
function ThermalReceiptModal({ visible, order, onClose, onShare }) {
  if (!order) return null;
  const receiptText = generateThermalReceipt(order);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.receiptBackdrop}>
        <View style={s.receiptDialog}>
          {/* Header da Comanda */}
          <View style={s.receiptHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={s.receiptIconCircle}>
                <Ionicons name="receipt" size={18} color={COLORS.primaryDark} />
              </View>
              <View>
                <Text style={s.receiptDialogTitle}>Comanda Térmica</Text>
                <Text style={s.receiptDialogSub}>Pedido #{order.orderNumber} • 58/80mm</Text>
              </View>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              style={s.receiptCloseIcon}
            >
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </Pressable>
          </View>

          {/* Visual do Papel Térmico */}
          <ScrollView style={s.receiptPaperScroll} contentContainerStyle={s.receiptPaperContent}>
            <View style={s.receiptPaper}>
              <Text style={s.receiptMonospaceText}>{receiptText}</Text>
            </View>
          </ScrollView>

          {/* Rodapé com botões de Ação */}
          <View style={s.receiptFooter}>
            <Pressable
              style={s.receiptCopyBtn}
              onPress={async () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await Clipboard.setStringAsync(receiptText);
                showThemedAlert('Comanda Copiada', 'Texto formatado copiado para a área de transferência.');
              }}
            >
              <Ionicons name="copy-outline" size={16} color={COLORS.textMain} />
              <Text style={s.receiptCopyBtnText}>Copiar</Text>
            </Pressable>

            <Pressable
              style={s.receiptShareBtn}
              onPress={onShare}
            >
              <Ionicons name="share-social-outline" size={16} color="#FFF" />
              <Text style={s.receiptShareBtnText}>Imprimir / Compartilhar</Text>
            </Pressable>
          </View>
          <ThemedAlertHost />
        </View>
      </View>
    </Modal>
  );
}

// ─── Componentes Auxiliares ─────────────────────────────────────────
function SectionLabel({ icon, label }) {
  return (
    <View style={s.sectionLabel}>
      <Ionicons name={icon} size={14} color={COLORS.primaryDark} />
      <Text style={s.sectionLabelText}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, highlight }) {
  return (
    <View style={s.infoRow}>
      <View style={[s.infoIcon, highlight && { backgroundColor: '#FFF7ED' }]}>
        <Ionicons name={icon} size={16} color={highlight ? COLORS.terracotta : COLORS.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={[s.infoValue, highlight && { color: COLORS.terracotta }]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ─── Estilos iFood Gestor ───────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginLeft: 10,
  },
  brandLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  onlineText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#059669',
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filtros
  filterBar: {
    maxHeight: 72,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFF',
  },
  filterCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCount: {
    fontSize: 12,
    fontWeight: '800',
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Lista
  list: { flex: 1 },
  listContent: { padding: 14, gap: 12, paddingBottom: 40 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { color: COLORS.textMain, fontSize: 16, fontWeight: '800' },
  emptySub: { color: COLORS.textSub, fontSize: 13, textAlign: 'center', maxWidth: 260 },

  // Cards de Pedido
  card: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    justifyContent: 'space-between',
    backgroundColor: '#FAFAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  cardHeaderLeft: { flex: 1 },
  cardHeaderRight: { alignItems: 'flex-end', gap: 6 },
  cardHeaderTools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  receiptQuickBtn: {
    padding: 6,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
  },
  deleteBtn: { padding: 6 },

  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 9, fontWeight: '800' },

  orderNum: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  orderTime: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  customerNameText: { color: COLORS.textMain, fontWeight: '700' },
  cardTotal: { fontSize: 16, fontWeight: '900', color: COLORS.textMain },

  // Card Body
  cardBody: { padding: 14, gap: 10 },
  itemListContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#ECEFF2',
  },
  itemShortRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyBadgeSmall: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  itemShortQty: { fontSize: 11, fontWeight: '800', color: COLORS.primaryDark },
  itemShortName: { fontSize: 13, fontWeight: '700', color: COLORS.textMain, flex: 1 },
  itemShortPasta: { fontSize: 11, color: COLORS.primaryDark, fontWeight: '600' },

  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', flex: 1 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FFF',
  },
  metaPillText: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted },

  cardActions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
    flexWrap: 'wrap',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  // Modal de Detalhes
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 24,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  modalStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  modalStatus: { color: '#FFF', fontSize: 11, fontWeight: '800', opacity: 0.95 },
  modalPrintTopBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
  },
  modalCloseBtn: {
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
  },

  modalBody: { flex: 1 },
  modalQuickActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  whatsappBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 12,
  },
  whatsappBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  receiptBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  receiptBtnLargeText: { color: COLORS.primaryDark, fontSize: 13, fontWeight: '800' },

  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 8,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6F8',
  },
  infoIcon: {
    width: 36,
    height: 36,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSub, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginTop: 2 },

  itemsCardContainer: {
    marginHorizontal: 16,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F5F6F8',
  },
  itemQtyBadge: {
    width: 34,
    height: 34,
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemQty: { fontSize: 12, fontWeight: '800', color: COLORS.primaryDark },
  itemName: { fontSize: 14, fontWeight: '800', color: COLORS.textMain },
  itemDetail: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },
  itemNote: { fontSize: 11, color: COLORS.red, fontStyle: 'italic', marginTop: 2, fontWeight: '500' },
  itemPrice: { fontSize: 14, fontWeight: '900', color: COLORS.textMain },

  notesBox: {
    marginHorizontal: 16,
    padding: 14,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  notesText: { fontSize: 13, color: '#92400E', fontWeight: '600', lineHeight: 20 },

  totalsBox: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  totalDetailLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalDetailLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  totalDetailVal: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  modalTotalDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '900', color: COLORS.textMain },
  totalValue: { fontSize: 22, fontWeight: '900', color: COLORS.primary },

  modalActions: { marginHorizontal: 16, marginTop: 20, gap: 10 },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  modalActionText: { fontSize: 14, fontWeight: '800', color: '#FFF' },

  deleteOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    backgroundColor: '#FFF',
  },
  deleteOrderText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  // Painel Mara Tracking
  trackingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  trackingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  trackingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#CBD5E1' },
  trackingDotActive: { backgroundColor: '#10B981' },
  trackingTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMain },
  gpsLiveTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  gpsLiveText: { fontSize: 9, fontWeight: '900', color: '#059669' },
  trackingSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  trackingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.textMain,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  trackingBtnActive: { backgroundColor: COLORS.red },
  trackingBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  // Permissão Banner
  permBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  permIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permBannerTitle: { fontSize: 12, fontWeight: '800', color: '#991B1B' },
  permBannerSub: { fontSize: 10, color: '#B91C1C', marginTop: 1 },
  permBannerBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  permBannerBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  // Modal Comanda Térmica
  receiptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  receiptDialog: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  receiptIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptDialogTitle: { fontSize: 15, fontWeight: '800', color: COLORS.textMain },
  receiptDialogSub: { fontSize: 11, color: COLORS.textSub, marginTop: 1 },
  receiptCloseIcon: { padding: 4 },

  receiptPaperScroll: { flexGrow: 0, backgroundColor: '#EFEFEF', padding: 12 },
  receiptPaperContent: { alignItems: 'center' },
  receiptPaper: {
    backgroundColor: '#FFFDF9',
    width: '100%',
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2DEC9',
    borderStyle: 'dashed',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  receiptMonospaceText: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 11.5,
    lineHeight: 16,
    color: '#222222',
  },

  receiptFooter: {
    flexDirection: 'row',
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    backgroundColor: '#FFF',
  },
  receiptCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  receiptCopyBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  receiptShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primaryDark,
  },
  receiptShareBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
});
