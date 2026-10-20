import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, Modal, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', '7d', '30d'

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
          setDateOrders(prev => {
            const date = order.createdAt.toISOString().split('T')[0];
            return { ...prev, [date]: (prev[date] || []).filter(o => o.id !== order.id) };
          });
          await loadData();
        } catch { Alert.alert('Erro', 'Não foi possível deletar o pedido.'); }
      }},
    ]);
  };

  // ─── Filtro de Histórico ─────────────────────────────────────────
  const filteredSalesHistory = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateFilter === 'today') {
      return salesHistory.filter(h => h.date === todayStr);
    }
    if (dateFilter === '7d') {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().split('T')[0];
      return salesHistory.filter(h => h.date >= d7Str);
    }
    if (dateFilter === '30d') {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      const d30Str = d30.toISOString().split('T')[0];
      return salesHistory.filter(h => h.date >= d30Str);
    }
    return salesHistory;
  }, [salesHistory, dateFilter]);

  // Métricas Consolidadas do Período
  const periodMetrics = useMemo(() => {
    const totalRevenue = filteredSalesHistory.reduce((acc, curr) => acc + curr.total, 0);
    const totalCount = filteredSalesHistory.reduce((acc, curr) => acc + curr.count, 0);
    const avgTicket = totalCount > 0 ? totalRevenue / totalCount : 0;
    return { totalRevenue, totalCount, avgTicket };
  }, [filteredSalesHistory]);

  // Detalhamento do dia expandido (Pix, Dinheiro, Cartão)
  const expandedBreakdown = useMemo(() => {
    if (!expandedDate || !dateOrders[expandedDate]) return null;
    const orders = dateOrders[expandedDate];
    let pix = 0, dinheiro = 0, cartao = 0, outros = 0;

    orders.forEach(o => {
      const method = (o.paymentMethod || '').toLowerCase();
      const val = Number(o.total || 0);
      if (method.includes('pix')) pix += val;
      else if (method.includes('dinheiro') || method.includes('cash')) dinheiro += val;
      else if (method.includes('cart') || method.includes('cred') || method.includes('deb')) cartao += val;
      else outros += val;
    });

    const total = pix + dinheiro + cartao + outros;
    return {
      pix,
      dinheiro,
      cartao: cartao + outros,
      total,
      pixPercent: total > 0 ? (pix / total) * 100 : 0,
      dinheiroPercent: total > 0 ? (dinheiro / total) * 100 : 0,
    };
  }, [expandedDate, dateOrders]);

  // Exportar / Compartilhar resumo
  const handleExportSummary = async () => {
    if (filteredSalesHistory.length === 0) {
      Alert.alert('Aviso', 'Nenhum dado para exportar.');
      return;
    }
    let text = `*BATATA TOP - FECHAMENTO DE CAIXA*\n`;
    text += `Período: ${dateFilter.toUpperCase()}\n`;
    text += `Total Faturado: R$ ${periodMetrics.totalRevenue.toFixed(2).replace('.', ',')}\n`;
    text += `Pedidos Entregues: ${periodMetrics.totalCount}\n`;
    text += `Ticket Médio: R$ ${periodMetrics.avgTicket.toFixed(2).replace('.', ',')}\n\n`;
    text += `*Histórico por dia:*\n`;
    filteredSalesHistory.slice(0, 10).forEach(h => {
      text += `• ${h.date}: ${h.count} pedidos - R$ ${h.total.toFixed(2).replace('.', ',')}\n`;
    });

    try {
      await Share.share({ message: text });
    } catch (e) {
      console.error(e);
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAvgTicket = stats.completedOrders > 0 ? stats.totalSales / stats.completedOrders : 0;

  const STAT_CARDS = [
    { label: 'Pedidos Hoje', value: stats.totalOrders, sub: `${stats.pendingOrders} pendentes`, icon: 'receipt-outline', color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Entregues', value: stats.completedOrders, sub: 'Concluídos', icon: 'checkmark-done-circle-outline', color: '#059669', bg: '#D1FAE5' },
    { 
      label: 'Ticket Médio', 
      value: showRevenue ? `R$ ${todayAvgTicket.toFixed(2).replace('.', ',')}` : '••••',
      sub: 'Média por pedido',
      icon: 'pricetag-outline', color: '#9333EA', bg: '#F3E8FF', isRevenue: true,
    },
    {
      label: 'Faturamento',
      value: showRevenue ? `R$ ${stats.totalSales.toFixed(2).replace('.', ',')}` : '••••',
      sub: 'Vendas hoje',
      icon: 'cash-outline', color: '#D97706', bg: '#FEF3C7', isRevenue: true,
    },
  ];

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header iFood Financial Standard */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.headerTitle}>Caixa & Financeiro</Text>
            <View style={s.badgeIFood}>
              <Text style={s.badgeIFoodText}>PAINEL</Text>
            </View>
          </View>
          <Text style={s.headerSub}>Faturamento e conciliação de caixa</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable onPress={handleExportSummary} style={s.actionBtn} hitSlop={8}>
            <Ionicons name="share-outline" size={20} color="#4B5563" />
          </Pressable>
          <Pressable onPress={() => { setRefreshing(true); loadData(); }} style={s.actionBtn} hitSlop={8}>
            {refreshing ? <ActivityIndicator size="small" color="#E3A008" /> : <Ionicons name="refresh-outline" size={20} color="#E3A008" />}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#E3A008" /></View>
      ) : (
        <ScrollView contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {/* Stats Cards Modernos */}
          <View style={s.statsGrid}>
            {STAT_CARDS.map((stat, i) => (
              <View key={i} style={s.statCard}>
                <View style={s.statCardTop}>
                  <View style={[s.statIconBg, { backgroundColor: stat.bg }]}>
                    <Ionicons name={stat.icon} size={18} color={stat.color} />
                  </View>
                  {stat.isRevenue && (
                    <Pressable onPress={() => setShowRevenue(v => !v)} hitSlop={8}>
                      <Ionicons name={showRevenue ? 'eye-off-outline' : 'eye-outline'} size={16} color="#9CA3AF" />
                    </Pressable>
                  )}
                </View>
                <Text style={s.statLabel}>{stat.label}</Text>
                <Text style={[s.statValue, typeof stat.value === 'string' && { fontSize: 16 }]} numberOfLines={1}>
                  {stat.value}
                </Text>
                <Text style={s.statSub}>{stat.sub}</Text>
              </View>
            ))}
          </View>

          {/* Filtro de Período e Resumo Consolidado */}
          <View style={s.filterCard}>
            <View style={s.filterHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="funnel-outline" size={15} color="#E3A008" />
                <Text style={s.filterTitle}>Filtrar Período</Text>
              </View>
              <View style={s.filterPillContainer}>
                {[
                  { key: 'today', label: 'Hoje' },
                  { key: '7d', label: '7D' },
                  { key: '30d', label: '30D' },
                  { key: 'all', label: 'Tudo' },
                ].map(p => (
                  <Pressable
                    key={p.key}
                    onPress={() => setDateFilter(p.key)}
                    style={[s.filterPill, dateFilter === p.key && s.filterPillActive]}
                  >
                    <Text style={[s.filterPillText, dateFilter === p.key && s.filterPillTextActive]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Banner com Fechamento do Período */}
            <View style={s.summaryBanner}>
              <View style={s.summaryCol}>
                <Text style={s.summaryColLabel}>Faturamento no Período</Text>
                <Text style={s.summaryColValue}>
                  {showRevenue ? `R$ ${periodMetrics.totalRevenue.toFixed(2).replace('.', ',')}` : '••••'}
                </Text>
              </View>
              <View style={s.summaryColDivider} />
              <View style={s.summaryCol}>
                <Text style={s.summaryColLabel}>Volume Entregue</Text>
                <Text style={s.summaryColValueSmall}>
                  {periodMetrics.totalCount} <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280' }}>pedidos</Text>
                </Text>
              </View>
            </View>
          </View>

          {/* Histórico e Fechamentos Diários */}
          <View style={s.historyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="calendar-outline" size={18} color="#E3A008" />
              <Text style={s.historyTitle}>Fechamentos de Caixa</Text>
            </View>
            <Text style={s.historyCountText}>{filteredSalesHistory.length} dias</Text>
          </View>

          {filteredSalesHistory.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={44} color="#D1D5DB" />
              <Text style={s.emptyText}>Nenhum fechamento registrado no período</Text>
            </View>
          ) : (
            filteredSalesHistory.map(day => {
              const isExpanded = expandedDate === day.date;
              const isToday = day.date === todayStr;
              const dayAvg = day.count > 0 ? day.total / day.count : 0;

              return (
                <View key={day.date} style={[s.dayCard, isExpanded && s.dayCardExpanded]}>
                  {/* Linha do dia */}
                  <Pressable style={s.dayRow} onPress={() => handleToggleDate(day.date)}>
                    <View style={[s.dayIconBg, isExpanded && { backgroundColor: '#E3A008' }]}>
                      <Ionicons name="calendar-outline" size={20} color={isExpanded ? '#FFF' : '#C1440E'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.dayDateRow}>
                        <Text style={s.dayDate} numberOfLines={1}>{formatDate(day.date)}</Text>
                        {isToday && (
                          <View style={s.todayBadge}><Text style={s.todayBadgeText}>Hoje</Text></View>
                        )}
                      </View>
                      <Text style={s.dayCount}>
                        {day.count} {day.count === 1 ? 'pedido' : 'pedidos'} · Méd: {showRevenue ? `R$ ${dayAvg.toFixed(2).replace('.', ',')}` : '••••'}
                      </Text>
                    </View>
                    <View style={s.dayRight}>
                      <Text style={s.dayTotal}>{showRevenue ? `R$ ${day.total.toFixed(2).replace('.', ',')}` : '••••'}</Text>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#9CA3AF" />
                    </View>
                  </Pressable>

                  {/* Resumo Financeiro & Pedidos do dia */}
                  {isExpanded && (
                    <View style={s.dayOrders}>
                      {/* Subcard de Divisão por Forma de Pagamento */}
                      {expandedBreakdown && (
                        <View style={s.splitCard}>
                          <View style={s.splitItem}>
                            <Ionicons name="qr-code-outline" size={14} color="#0D9488" />
                            <Text style={s.splitLabel}>PIX</Text>
                            <Text style={s.splitVal}>
                              {showRevenue ? `R$ ${expandedBreakdown.pix.toFixed(2).replace('.', ',')}` : '••••'}
                            </Text>
                            <Text style={s.splitSub}>{expandedBreakdown.pixPercent.toFixed(0)}%</Text>
                          </View>
                          <View style={s.splitDivider} />
                          <View style={s.splitItem}>
                            <Ionicons name="cash-outline" size={14} color="#059669" />
                            <Text style={s.splitLabel}>Dinheiro</Text>
                            <Text style={s.splitVal}>
                              {showRevenue ? `R$ ${expandedBreakdown.dinheiro.toFixed(2).replace('.', ',')}` : '••••'}
                            </Text>
                            <Text style={s.splitSub}>{expandedBreakdown.dinheiroPercent.toFixed(0)}%</Text>
                          </View>
                          <View style={s.splitDivider} />
                          <View style={s.splitItem}>
                            <Ionicons name="card-outline" size={14} color="#2563EB" />
                            <Text style={s.splitLabel}>Cartão</Text>
                            <Text style={s.splitVal}>
                              {showRevenue ? `R$ ${expandedBreakdown.cartao.toFixed(2).replace('.', ',')}` : '••••'}
                            </Text>
                            <Text style={s.splitSub}>Outros</Text>
                          </View>
                        </View>
                      )}

                      {loadingDate === day.date ? (
                        <ActivityIndicator color="#E3A008" style={{ margin: 16 }} />
                      ) : (
                        (dateOrders[day.date] || []).map(order => (
                          <Pressable key={order.id} style={s.orderRow} onPress={() => { setSelectedOrder(order); setDetailsVisible(true); }}>
                            <View style={s.orderNumBadge}>
                              <Text style={s.orderNumText}>#{order.orderNumber}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.orderName}>{order.customerName}</Text>
                              <Text style={s.orderMeta}>
                                {order.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {(order.paymentMethod || '').toUpperCase()} · {order.deliveryType === 'delivery' ? 'Entrega' : 'Retirada'}
                              </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                              <Text style={s.orderTotal}>R$ {order.total.toFixed(2).replace('.', ',')}</Text>
                              {order.discountAmount ? (
                                <Text style={s.orderDiscount}>-R$ {order.discountAmount.toFixed(2).replace('.', ',')}</Text>
                              ) : null}
                            </View>
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
              );
            })
          )}
        </ScrollView>
      )}

      {/* Modal Detalhes Estilo iFood */}
      <Modal visible={detailsVisible} animationType="slide" statusBarTranslucent navigationBarTranslucent presentationStyle="pageSheet" onRequestClose={() => setDetailsVisible(false)}>
                  {selectedOrder && (
            <View style={s.modalContainer}>
              {/* Header Âmbar */}
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
                <InfoRow icon="card-outline" label="Forma de Pagamento" value={(selectedOrder.paymentMethod || '').toUpperCase()} />

                <Text style={[s.sectionTitle, { marginTop: 18 }]}>Itens do Pedido</Text>
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

                <View style={s.totalBreakdown}>
                  <View style={s.subtotalRow}>
                    <Text style={s.subtotalLabel}>Subtotal</Text>
                    <Text style={s.subtotalVal}>
                      R$ {((selectedOrder.total || 0) + (selectedOrder.discountAmount || 0)).toFixed(2).replace('.', ',')}
                    </Text>
                  </View>
                  {selectedOrder.discountAmount ? (
                    <View style={s.subtotalRow}>
                      <Text style={[s.subtotalLabel, { color: '#059669' }]}>Desconto</Text>
                      <Text style={[s.subtotalVal, { color: '#059669' }]}>
                        - R$ {selectedOrder.discountAmount.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                  ) : null}
                  <View style={s.totalLine}>
                    <Text style={s.totalLabel}>Total Pago</Text>
                    <Text style={s.totalValue}>R$ {selectedOrder.total.toFixed(2).replace('.', ',')}</Text>
                  </View>
                </View>

                <Pressable style={s.deleteBtnFull} onPress={() => handleDelete(selectedOrder)}>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={s.deleteBtnText}>Excluir Pedido do Caixa</Text>
                </Pressable>
              </ScrollView>
            </View>
          )}
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FFF', 
    paddingHorizontal: 16, 
    paddingBottom: 14, 
    paddingTop: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9', 
    gap: 8 
  },
  backBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  badgeIFood: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeIFoodText: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  actionBtn: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 16, paddingBottom: 40, gap: 14 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { 
    width: '48%', 
    backgroundColor: '#FFF', 
    borderRadius: 20, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: '#F1F5F9',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.03, 
    shadowRadius: 5, 
    elevation: 1 
  },
  statCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  statIconBg: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '900', color: '#0F172A', marginTop: 2 },
  statSub: { fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 2 },

  filterCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  filterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  filterPillContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 3, borderRadius: 12, gap: 2 },
  filterPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  filterPillActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1 },
  filterPillText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  filterPillTextActive: { color: '#0F172A' },

  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  summaryCol: { flex: 1 },
  summaryColDivider: { width: 1, height: 28, backgroundColor: '#FCD34D', marginHorizontal: 12 },
  summaryColLabel: { fontSize: 10, fontWeight: '700', color: '#92400E', textTransform: 'uppercase' },
  summaryColValue: { fontSize: 17, fontWeight: '900', color: '#78350F', marginTop: 1 },
  summaryColValueSmall: { fontSize: 15, fontWeight: '900', color: '#0F172A', marginTop: 1 },

  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 2 },
  historyTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  historyCountText: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },

  dayCard: { 
    backgroundColor: '#FFF', 
    borderRadius: 20, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#F1F5F9',
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.03, 
    shadowRadius: 5, 
    elevation: 1 
  },
  dayCardExpanded: { borderColor: '#E3A008', borderWidth: 1.5 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  dayIconBg: { width: 42, height: 42, backgroundColor: '#FEF3C7', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayDate: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  todayBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  todayBadgeText: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  dayCount: { fontSize: 11, color: '#64748B', fontWeight: '500', marginTop: 2 },
  dayRight: { alignItems: 'flex-end', gap: 4 },
  dayTotal: { fontSize: 15, fontWeight: '900', color: '#0F172A' },

  dayOrders: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 14, paddingBottom: 8, backgroundColor: '#FAFAFA' },
  
  splitCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 10,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  splitItem: { flex: 1, alignItems: 'center', gap: 2 },
  splitDivider: { width: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  splitLabel: { fontSize: 9, fontWeight: '800', color: '#64748B', textTransform: 'uppercase' },
  splitVal: { fontSize: 12, fontWeight: '900', color: '#0F172A' },
  splitSub: { fontSize: 9, fontWeight: '700', color: '#94A3B8' },

  orderRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 10, 
    paddingVertical: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  orderNumBadge: { width: 36, height: 36, backgroundColor: '#F8FAFC', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  orderNumText: { fontSize: 10, fontWeight: '800', color: '#64748B' },
  orderName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  orderMeta: { fontSize: 10, color: '#64748B', fontWeight: '500', marginTop: 1 },
  orderTotal: { fontSize: 13, fontWeight: '900', color: '#0F172A' },
  orderDiscount: { fontSize: 9, fontWeight: '700', color: '#059669' },
  deleteBtn: { padding: 4 },

  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { backgroundColor: '#E3A008', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },
  modalSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700', marginTop: 2 },
  modalCloseBtn: { padding: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },
  modalBody: { padding: 18, paddingBottom: 40 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' },
  infoValue: { fontSize: 12, fontWeight: '700', color: '#0F172A', marginTop: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  itemLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  itemQty: { fontSize: 12, fontWeight: '900', color: '#C1440E', width: 24 },
  itemName: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  itemDetail: { fontSize: 10, color: '#64748B', marginTop: 1, fontWeight: '500' },
  itemPrice: { fontSize: 12, fontWeight: '800', color: '#0F172A' },
  totalBreakdown: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', gap: 4 },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtotalLabel: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  subtotalVal: { fontSize: 11, fontWeight: '700', color: '#0F172A' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  totalValue: { fontSize: 20, fontWeight: '900', color: '#C1440E' },
  notesBox: { marginVertical: 10, padding: 12, backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FEF3C7' },
  notesTitle: { fontSize: 10, fontWeight: '800', color: '#B45309', textTransform: 'uppercase', marginBottom: 2 },
  notesText: { fontSize: 11, color: '#78350F', fontWeight: '500', lineHeight: 16 },
  deleteBtnFull: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22, padding: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#FEE2E2', backgroundColor: '#FFF' },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
});
