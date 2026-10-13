import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';
import { syncAdminPushRegistration } from '../../utils/pushNotifications';

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [storeStatus, setStoreStatus] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    preparing: 0,
    revenue: 0,
  });

  useEffect(() => {
    let mounted = true;
    let channel = null;

    async function verifyAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      const isInstant = isAdminUser(user);
      let isDb = false;
      if (!isInstant && user) {
        isDb = await checkIsAdmin(user.id);
      }

      if (!isInstant && !isDb) {
        if (mounted) {
          Alert.alert('Acesso Negado', 'Você não tem permissão para acessar esta área.');
          router.replace('/');
        }
        return;
      }

      if (mounted) {
        syncAdminPushRegistration(user);
        loadDashboard();

        channel = supabase
          .channel(`admin-dashboard-${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            (payload) => {
              if (payload.eventType === 'INSERT' && payload.new?.status === 'awaiting_payment') return;
              loadDashboard();
            }
          )
          .subscribe();
      }
    }

    verifyAdmin();

    return () => {
      mounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);

      // 1. Carregar status da loja
      const { data: settingsData } = await supabase
        .from('store_settings')
        .select('*')
        .eq('setting_key', 'store_status')
        .maybeSingle();

      if (settingsData) {
        setStoreStatus(settingsData);
      }

      // 2. Carregar estatísticas de pedidos hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data: orders } = await supabase
        .from('orders')
        .select('status, total_amount')
        .neq('status', 'awaiting_payment')
        .gte('created_at', today.toISOString());

      if (orders) {
        const total = orders.length;
        const pending = orders.filter(o => o.status === 'pending').length;
        const preparing = orders.filter(o => o.status === 'preparing' || o.status === 'preparo').length;
        const revenue = orders
          .filter(o => o.status === 'delivered' || o.status === 'entregue')
          .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

        setStats({ total, pending, preparing, revenue });
      }
    } catch (e) {
      console.error('Erro ao carregar painel admin:', e);
    } finally {
      setLoading(false);
    }
  }

  const handleToggleStore = async () => {
    if (!storeStatus) return;
    const currentVal = storeStatus.setting_value;
    const newVal = {
      ...currentVal,
      isOpen: !currentVal.isOpen,
      manualOverride: true,
      lastManualChange: new Date().toISOString()
    };

    setLoading(true);
    const { error } = await supabase
      .from('store_settings')
      .update({ setting_value: newVal })
      .eq('id', storeStatus.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível alterar o status da loja.');
    } else {
      setStoreStatus({ ...storeStatus, setting_value: newVal });
    }
    setLoading(false);
  };

  const handleToggleDelivery = async () => {
    if (!storeStatus) return;
    const currentVal = storeStatus.setting_value;
    const newVal = {
      ...currentVal,
      isDeliveryEnabled: !currentVal.isDeliveryEnabled
    };

    setLoading(true);
    const { error } = await supabase
      .from('store_settings')
      .update({ setting_value: newVal })
      .eq('id', storeStatus.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível alterar as entregas.');
    } else {
      setStoreStatus({ ...storeStatus, setting_value: newVal });
    }
    setLoading(false);
  };

  const handleToggleDeliveryFee = async () => {
    if (!storeStatus) return;
    const currentVal = storeStatus.setting_value;
    const newVal = {
      ...currentVal,
      isDeliveryFeeEnabled: !currentVal.isDeliveryFeeEnabled
    };

    setLoading(true);
    const { error } = await supabase
      .from('store_settings')
      .update({ setting_value: newVal })
      .eq('id', storeStatus.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível alterar a taxa de entrega.');
    } else {
      setStoreStatus({ ...storeStatus, setting_value: newVal });
    }
    setLoading(false);
  };

  if (loading && !storeStatus) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  const val = storeStatus?.setting_value || {};
  const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={s.headerTitleContainer}>
          <View style={s.headerIconBg}>
            <Ionicons name="cube" size={22} color="#D97706" />
          </View>
          <View>
            <Text style={s.headerTitle}>Painel Administrativo</Text>
            <Text style={s.headerSubtitle}>Gerencie seus pedidos e operações</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status da Loja */}
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>Status da Loja</Text>
          <View style={s.statusRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={s.timeText}>Horário: {currentTime}</Text>

            <View style={[s.badge, val.isOpen ? s.badgeOpen : s.badgeClosed]}>
              <Text style={[s.badgeText, val.isOpen ? s.badgeTextOpen : s.badgeTextClosed]}>
                {val.isOpen ? 'Aberto' : 'Fechado'}
              </Text>
            </View>

            <View style={[s.badge, s.badgeWait]}>
              <Text style={s.badgeTextWait}>
                Tempo de espera: {val.waitTimeMin || 15}-{val.waitTimeMax || 22} min
              </Text>
            </View>
          </View>

          <View style={s.actionRow}>
            <Pressable
              style={[s.actionBtn, val.isOpen ? s.btnDanger : s.btnSuccess]}
              onPress={handleToggleStore}
            >
              <Ionicons
                name={val.isOpen ? "close-circle-outline" : "checkmark-circle-outline"}
                size={16}
                color={val.isOpen ? '#EF4444' : '#10B981'}
              />
              <Text style={[s.actionBtnText, val.isOpen ? { color: '#EF4444' } : { color: '#10B981' }]}>
                {val.isOpen ? 'Fechar Loja' : 'Abrir Loja'}
              </Text>
            </Pressable>

            <Pressable
              style={[s.actionBtn, s.btnPrimary, val.isDeliveryEnabled && s.btnActive]}
              onPress={handleToggleDelivery}
            >
              <Ionicons name="bicycle-outline" size={16} color={val.isDeliveryEnabled ? '#FFF' : '#FFB800'} />
              <Text style={[s.actionBtnText, val.isDeliveryEnabled ? { color: '#FFF' } : { color: '#FFB800' }]}>
                {val.isDeliveryEnabled ? 'Pausar Entregas' : 'Ativar Entregas'}
              </Text>
            </Pressable>
          </View>

          <View style={[s.actionRow, { marginTop: 10 }]}>
            <Pressable
              style={[s.actionBtn, s.btnFee, val.isDeliveryFeeEnabled && s.btnFeeActive]}
              onPress={handleToggleDeliveryFee}
            >
              <Ionicons name="cash-outline" size={16} color={val.isDeliveryFeeEnabled ? '#D97706' : '#6B7280'} />
              <Text style={[s.actionBtnText, { color: val.isDeliveryFeeEnabled ? '#D97706' : '#6B7280' }]}>
                {val.isDeliveryFeeEnabled
                  ? `Taxa Ativa (R$ ${Number(val.deliveryFee ?? 3).toFixed(2).replace('.', ',')})`
                  : 'Taxa Desativada'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Resumo de Hoje */}
        <View style={s.statsContainer}>
          {/* Pedidos Totais */}
          <View style={s.statsCard}>
            <View style={[s.statsIconBg, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="receipt-outline" size={18} color="#D97706" />
            </View>
            <Text style={s.statsLabel}>Pedidos Totais</Text>
            <Text style={s.statsValue}>{stats.total}</Text>
            <Text style={s.statsSub}>{stats.pending} pendentes, {stats.preparing} prep.</Text>
          </View>

          {/* Pendentes */}
          <View style={s.statsCard}>
            <View style={[s.statsIconBg, { backgroundColor: '#FFEDD5' }]}>
              <Ionicons name="time-outline" size={18} color="#EA580C" />
            </View>
            <Text style={s.statsLabel}>Pendentes</Text>
            <Text style={s.statsValue}>{stats.pending}</Text>
            <Text style={s.statsSub}>Aguardando confirmação</Text>
          </View>

          {/* Preparando */}
          <View style={s.statsCard}>
            <View style={[s.statsIconBg, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="restaurant-outline" size={18} color="#2563EB" />
            </View>
            <Text style={s.statsLabel}>Preparando</Text>
            <Text style={s.statsValue}>{stats.preparing}</Text>
            <Text style={s.statsSub}>Em produção agora</Text>
          </View>

          {/* Faturamento */}
          <View style={s.statsCard}>
            <View style={[s.statsIconBg, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="cash-outline" size={18} color="#059669" />
            </View>
            <Text style={s.statsLabel}>Faturamento</Text>
            <Text style={[s.statsValue, { color: '#10B981' }]}>
              R$ {stats.revenue.toFixed(2).replace('.', ',')}
            </Text>
            <Text style={s.statsSub}>Pedidos entregues</Text>
          </View>
        </View>

        {/* Operações Menu */}
        <View style={s.menuSection}>
          {/* Gerenciar Pedidos */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="receipt" size={20} color="#D97706" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gerenciar Pedidos</Text>
                <Text style={s.menuSub}>Visualize, atualize status e acompanhe entregas</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#FFB800' }]} onPress={() => router.push('/admin/pedidos')}>
              <Text style={s.menuBtnText}>Acessar Pedidos</Text>
            </Pressable>
          </View>

          {/* Gerenciar Produtos */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="cube" size={20} color="#EF4444" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gerenciar Produtos</Text>
                <Text style={s.menuSub}>Adicione, edite ou remova itens do cardápio</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#EF4444' }]} onPress={() => router.push('/admin/produtos')}>
              <Text style={s.menuBtnText}>Acessar Produtos</Text>
            </Pressable>
          </View>

          {/* Gerenciar Cupons */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#F3E8FF' }]}>
                <Ionicons name="pricetag" size={20} color="#A855F7" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gerenciar Cupons</Text>
                <Text style={s.menuSub}>Crie e controle cupons de desconto</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#A855F7' }]} onPress={() => router.push('/admin/cupons')}>
              <Text style={s.menuBtnText}>Acessar Cupons</Text>
            </Pressable>
          </View>

          {/* Gerenciar Imagens */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="image" size={20} color="#3B82F6" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gerenciar Imagens</Text>
                <Text style={s.menuSub}>Upload de fotos sem precisar de Git</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#3B82F6' }]} onPress={() => router.push('/admin/imagens')}>
              <Text style={s.menuBtnText}>Acessar Imagens</Text>
            </Pressable>
          </View>

          {/* Gestão Financeira */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="trending-up" size={20} color="#10B981" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gestão Financeira</Text>
                <Text style={s.menuSub}>Resumo de vendas, faturamento e histórico</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#10B981' }]} onPress={() => router.push('/admin/caixa')}>
              <Text style={s.menuBtnText}>Acessar Financeiro</Text>
            </Pressable>
          </View>

          {/* Feedbacks */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="star" size={20} color="#3B82F6" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Feedbacks</Text>
                <Text style={s.menuSub}>Visualize avaliações e comentários dos clientes</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#3B82F6' }]} onPress={() => router.push('/admin/feedbacks')}>
              <Text style={[s.menuBtnText, { color: '#3B82F6' }]}>Ver Feedbacks</Text>
            </Pressable>
          </View>

          {/* Gerenciar Promoção */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#FFEDD5' }]}>
                <Ionicons name="megaphone" size={20} color="#EA580C" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Gerenciar Promoção</Text>
                <Text style={s.menuSub}>Configure a promoção activa no site</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#EA580C' }]} onPress={() => router.push('/admin/promocoes')}>
              <Text style={s.menuBtnText}>Acessar Promoção</Text>
            </Pressable>
          </View>

          {/* Gerenciar Administradores */}
          <View style={s.menuCard}>
            <View style={s.menuCardHeader}>
              <View style={[s.opIconBg, { backgroundColor: '#EEF2FF' }]}>
                <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
              </View>
              <View style={s.menuTextCol}>
                <Text style={s.menuTitle}>Administradores</Text>
                <Text style={s.menuSub}>Cadastre e remova e-mails de administradores</Text>
              </View>
            </View>
            <Pressable style={[s.menuBtn, { backgroundColor: '#4F46E5' }]} onPress={() => router.push('/admin/administradores')}>
              <Text style={s.menuBtnText}>Acessar Administradores</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Status da Loja Card
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  timeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeOpen: {
    backgroundColor: '#D1FAE5',
  },
  badgeClosed: {
    backgroundColor: '#FEE2E2',
  },
  badgeWait: {
    backgroundColor: '#FEF3C7',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextOpen: {
    color: '#065F46',
  },
  badgeTextClosed: {
    color: '#991B1B',
  },
  badgeTextWait: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EFEFEF',
  },
  btnDanger: {
    borderColor: '#EF4444',
  },
  btnSuccess: {
    borderColor: '#10B981',
  },
  btnPrimary: {
    borderColor: '#FFB800',
  },
  btnActive: {
    backgroundColor: '#FFB800',
  },
  btnFee: {
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  btnFeeActive: {
    borderColor: '#FCD34D',
    backgroundColor: '#FEF3C7',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Stats Grid
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statsCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  statsIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
  },
  statsValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A1A1A',
    marginVertical: 4,
  },
  statsSub: {
    fontSize: 10,
    color: '#999999',
  },

  // Operations Menu
  menuSection: {
    gap: 12,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  menuCardHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  opIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  menuSub: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },
  menuBtn: {
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
