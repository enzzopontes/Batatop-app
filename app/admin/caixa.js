import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';

// Mapeia os dados do Supabase pro app (idêntico ao pedidos.js)
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

export default function AdminCaixa() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);

  const [stats, setStats] = useState({
    totalOrders: 0, pendingOrders: 0, completedOrders: 0, totalSales: 0,
  });
  const [salesHistory, setSalesHistory] = useState([]);
  const [expandedDate, setExpandedDate] = useState(null);
  const [dateOrders, setDateOrders] = useState({});
  const [loadingDate, setLoadingDate] = useState(null);

  // Modal de detalhes
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailsVisible, setDetailsVisible] = useState(false);

  // ─── Carregar dados ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Stats hoje
      const { data: todayOrders } = await supabase
        .from('orders')
        .select('status, total_amount')
        .neq('status', 'awaiting_payment')
        .gte('created_at', today.toISOString());

      const orders = todayOrders || [];
      const totalSales = orders
        .filter(o => o.status === 'delivered' || o.status === 'entregue')
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

      setStats({
        totalOrders: orders.length,
        pendingOrders: orders.filter(o => o.status === 'pending').length,
        completedOrders: orders.filter(o => o.status === 'delivered' || o.status === 'entregue').length,
        totalSales,
      });

      // Histórico por data (agrupado)
      const { data: history } = await supabase
        .from('orders')
        .select('created_at, total_amount, status')
        .neq('status', 'awaiting_payment')
        .in('status', ['delivered', 'entregue'])
        .order('created_at', { ascending: false });

      const grouped = {};
      (history || []).forEach(order => {
        const date = new Date(order.created_at).toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = { date, count: 0, total: 0 };
        grouped[date].count++;
        grouped[date].total += Number(order.total_amount || 0);
      });

      const historyArray = Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date));
      setSalesHistory(historyArray);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível carregar os dados financeiros.');
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);

    const channel = supabase
      .channel(`admin-caixa-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT' && payload.new?.status === 'awaiting_payment') return;
          loadData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // ─── Toggle de data ──────────────────────────────────────────────
  const handleToggleDate = async (date) => {
    if (expandedDate === date) { setExpandedDate(null); return; }
    setExpandedDate(date);
    if (!dateOrders[date]) {
      setLoadingDate(date);
      try {
        const start = new Date(date + 'T00:00:00');
        const end = new Date(date + 'T23:59:59');
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items (*)') // Join nos itens
          .neq('status', 'awaiting_payment')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .in('status', ['delivered', 'entregue'])
          .order('created_at', { ascending: false });
        if (error) throw error;
        
        const mapped = (data || []).map(mapOrderData);
        setDateOrders(prev => ({ ...prev, [date]: mapped }));
      } catch (err) {
        console.error(err);
        Alert.alert('Erro', 'Não foi possível carregar os pedidos.');
      } finally {
        setLoadingDate(null);
      }
    }
  };

  // ─── Deletar pedido ──────────────────────────────────────────────
  const handleDelete = (order) => {
    Alert.alert('Deletar Pedido', `Excluir o pedido #${order.orderNumber}? Esta ação remove dos registros financeiros.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Deletar', style: 'destructive', onPress: async () => {
        try {
          await supabase.from('order_items').delete().eq('order_id', order.id);
          await supabase.from('orders').delete().eq('id', order.id);
          setDetailsVisible(false);
          // Remover da lista local
          setDateOrders(prev => {
            const date = order.createdAt.toISOString().split('T')[0];
            return { ...prev, [date]: (prev[date] || []).filter(o => o.id !== order.id) };
          });
          await loadData();
        } catch { Alert.alert('Erro', 'Não foi possível deletar o pedido.'); }
      }},
    ]);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const todayStr = new Date().toISOString().split('T')[0];

  const STAT_CARDS = [
    { label: 'Pedidos Hoje', value: stats.totalOrders, icon: 'receipt-outline', color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Pendentes', value: stats.pendingOrders, icon: 'time-outline', color: '#EA580C', bg: '#FFEDD5' },
    { label: 'Entregues', value: stats.completedOrders, icon: 'checkmark-done-outline', color: '#059669', bg: '#D1FAE5' },
    {
      label: 'Faturamento',
      value: showRevenue ? `R$ ${stats.totalSales.toFixed(2).replace('.', ',')}` : '••••',
      icon: 'cash-outline', color: '#059669', bg: '#D1FAE5', isRevenue: true,
    },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Gestão Financeira</Text>
          <Text style={s.headerSub}>Faturamento e histórico de vendas</Text>
        </View>
        <Pressable onPress={() => { setRefreshing(true); loadData(); }} style={s.refreshBtn}>
          {refreshing ? <ActivityIndicator size="small" color="#FFB800" /> : <Ionicons name="refresh-outline" size={22} color="#FFB800" />}
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#FFB800" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent}>
          {/* Stats Cards */}
          <View style={s.statsGrid}>
            {STAT_CARDS.map((stat, i) => (
              <View key={i} style={s.statCard}>
                <View style={s.statCardTop}>
                  <View style={[s.statIconBg, { backgroundColor: stat.bg }]}>
                    <Ionicons name={stat.icon} size={18} color={stat.color} />
                  </View>
                  {stat.isRevenue && (
                    <Pressable onPress={() => setShowRevenue(v => !v)}>
                      <Ionicons name={showRevenue ? 'eye-off-outline' : 'eye-outline'} size={16} color="#9CA3AF" />
                    </Pressable>
                  )}
                </View>
                <Text style={s.statLabel}>{stat.label}</Text>
                <Text style={[s.statValue, typeof stat.value === 'string' && { fontSize: 16 }]}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Histórico */}
          <View style={s.historyHeader}>
            <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
            <Text style={s.historyTitle}>Histórico de Vendas</Text>
          </View>

          {salesHistory.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="clipboard-outline" size={48} color="#E5E7EB" />
              <Text style={s.emptyText}>Nenhuma venda registrada</Text>
            </View>
          ) : (
            salesHistory.map(day => (
              <View key={day.date} style={[s.dayCard, expandedDate === day.date && s.dayCardExpanded]}>
                {/* Linha do dia */}
                <Pressable style={s.dayRow} onPress={() => handleToggleDate(day.date)}>
                  <View style={[s.dayIconBg, expandedDate === day.date && { backgroundColor: '#FFB800' }]}>
                    <Ionicons name="calendar-outline" size={20} color={expandedDate === day.date ? '#FFF' : '#D97706'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.dayDateRow}>
                      <Text style={s.dayDate} numberOfLines={1}>{formatDate(day.date)}</Text>
                      {day.date === todayStr && (
                        <View style={s.todayBadge}><Text style={s.todayBadgeText}>Hoje</Text></View>
                      )}
                    </View>
                    <Text style={s.dayCount}>{day.count} {day.count === 1 ? 'pedido entregue' : 'pedidos entregues'}</Text>
                  </View>
                  <View style={s.dayRight}>
                    <Text style={s.dayTotal}>{showRevenue ? `R$ ${day.total.toFixed(2).replace('.', ',')}` : '••••'}</Text>
                    <Ionicons name={expandedDate === day.date ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                  </View>
                </Pressable>

                {/* Pedidos do dia */}
                {expandedDate === day.date && (
                  <View style={s.dayOrders}>
                    {loadingDate === day.date ? (
                      <ActivityIndicator color="#FFB800" style={{ margin: 16 }} />
                    ) : (
                      (dateOrders[day.date] || []).map(order => (
                        <Pressable key={order.id} style={s.orderRow} onPress={() => { setSelectedOrder(order); setDetailsVisible(true); }}>
                          <View style={s.orderNumBadge}>
                            <Text style={s.orderNumText}>#{order.orderNumber}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={s.orderName}>{order.customerName}</Text>
                            <Text style={s.orderMeta}>
                              {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {(order.paymentMethod || '').toUpperCase()}
                            </Text>
                          </View>
                          <Text style={s.orderTotal}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
                          <Pressable
                            onPress={() => handleDelete(order)}
                            style={s.deleteBtn}
                            hitSlop={8}
                          >
                            <Ionicons name="trash-outline" size={15} color="#DC2626" />
                          </Pressable>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* Modal Detalhes */}
      <Modal visible={detailsVisible} animationType="none" statusBarTranslucent navigationBarTranslucent presentationStyle="formSheet" onRequestClose={() => setDetailsVisible(false)}>
        <SafeAreaProvider>
          {selectedOrder && (
            <View style={s.modalContainer}>
              {/* Cabeçalho amarelo */}
              <View style={s.modalHeader}>
                <View>
                  <Text style={s.modalTitle}>Pedido #{selectedOrder.orderNumber}</Text>
                  <Text style={s.modalSub}>Entregue · {selectedOrder.deliveryType === 'delivery' ? 'ENTREGA' : 'RETIRADA'}</Text>
                </View>
                <Pressable onPress={() => setDetailsVisible(false)} style={s.modalCloseBtn}>
                  <Ionicons name="close" size={20} color="#FFF" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={s.modalBody}>
                <InfoRow icon="call-outline" label="WhatsApp" value={selectedOrder.customerPhone} />
                <InfoRow 
                  icon="location-outline" 
                  label="Endereço" 
                  value={
                    selectedOrder.deliveryType === 'delivery' 
                      ? `${selectedOrder.address || ''}${selectedOrder.neighborhood ? ', ' + selectedOrder.neighborhood : ''}${selectedOrder.complement ? ' - ' + selectedOrder.complement : ''}`
                      : 'Retirada na loja pelo cliente'
                  } 
                />
                <InfoRow icon="card-outline" label="Pagamento" value={(selectedOrder.paymentMethod || '').toUpperCase()} />

                <Text style={[s.sectionTitle, { marginTop: 16 }]}>Itens</Text>
                {selectedOrder.items.map((item, i) => (
                  <View key={i} style={s.itemLine}>
                    <Text style={s.itemQty}>{item.quantity}x</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemName}>{item.name}</Text>
                      {item.pastaType && <Text style={s.itemDetail}>Massa: {item.pastaType}</Text>}
                      {Array.isArray(item.adicionais) && item.adicionais.length > 0 && (
                        <Text style={s.itemDetail}>Adicionais: {item.adicionais.map(a => `${a.quantity}x ${a.name}`).join(', ')}</Text>
                      )}
                    </View>
                    <Text style={s.itemPrice}>R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}</Text>
                  </View>
                ))}

                {selectedOrder.notes && (
                  <View style={s.notesBox}>
                    <Text style={s.notesTitle}>Observações:</Text>
                    <Text style={s.notesText}>{selectedOrder.notes}</Text>
                  </View>
                )}

                <View style={s.totalLine}>
                  <Text style={s.totalLabel}>Total Pago</Text>
                  <Text style={s.totalValue}>R$ {selectedOrder.total.toFixed(2).replace('.', ',')}</Text>
                </View>

                <Pressable style={s.deleteBtnFull} onPress={() => handleDelete(selectedOrder)}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={s.deleteBtnText}>Deletar Pedido</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
        </SafeAreaProvider>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <View style={s.infoRow}>
      <Ionicons name={icon} size={16} color="#9CA3AF" style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 16, paddingBottom: 40, gap: 12 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '48%', backgroundColor: '#FFF', borderRadius: 20, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  statCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  statIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  statValue: { fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginTop: 2 },

  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  historyTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { color: '#D1D5DB', fontWeight: '600', fontSize: 14 },

  dayCard: { backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  dayCardExpanded: { borderWidth: 2, borderColor: '#FFB800' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dayIconBg: { width: 44, height: 44, backgroundColor: '#FEF3C7', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dayDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayDate: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', flex: 1 },
  todayBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  todayBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  dayCount: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 2 },
  dayRight: { alignItems: 'flex-end', gap: 4 },
  dayTotal: { fontSize: 15, fontWeight: '900', color: '#1A1A1A' },

  dayOrders: { borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingHorizontal: 14, paddingBottom: 8 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  orderNumBadge: { width: 40, height: 40, backgroundColor: '#F9FAFB', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F0F0F0' },
  orderNumText: { fontSize: 11, fontWeight: '800', color: '#6B7280' },
  orderName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  orderMeta: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },
  orderTotal: { fontSize: 14, fontWeight: '900', color: '#1A1A1A' },
  deleteBtn: { padding: 4 },

  modalContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  modalHeader: { backgroundColor: '#FFB800', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  modalSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginTop: 2 },
  modalCloseBtn: { padding: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },
  modalBody: { padding: 20, paddingBottom: 40 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase' },
  infoValue: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  itemLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  itemQty: { fontSize: 12, fontWeight: '900', color: '#D97706', width: 28 },
  itemName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  itemDetail: { fontSize: 10, color: '#6B7280', marginTop: 2, fontWeight: '600' },
  itemPrice: { fontSize: 13, fontWeight: '800', color: '#1A1A1A' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  totalLabel: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  totalValue: { fontSize: 22, fontWeight: '900', color: '#FFB800' },
  notesBox: { marginVertical: 12, padding: 12, backgroundColor: '#FFF9E6', borderRadius: 12, borderWidth: 1, borderColor: '#FEF3C7' },
  notesTitle: { fontSize: 10, fontWeight: '800', color: '#D97706', textTransform: 'uppercase', marginBottom: 4 },
  notesText: { fontSize: 12, color: '#92400E', fontWeight: '600', lineHeight: 18 },
  deleteBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: '#FEE2E2', backgroundColor: '#FFF' },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: '#DC2626' },
});
