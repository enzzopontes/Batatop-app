import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';
import { syncAdminPushRegistration } from '../../utils/pushNotifications';
import { COLORS, TYPOGRAPHY, RADIUS, SHADOWS } from '../../constants/theme';
import { AdminDashboardSkeleton } from '../../components/Skeleton';
import { ThemedAlertHost } from '../../components/ThemedAlert';
import SwipeableBottomSheetModal from '../../components/SwipeableBottomSheetModal';

const DAYS_OF_WEEK = [
  { key: 0, id: 'dom', label: 'Domingo', short: 'Dom' },
  { key: 1, id: 'seg', label: 'Segunda-feira', short: 'Seg' },
  { key: 2, id: 'ter', label: 'Terça-feira', short: 'Ter' },
  { key: 3, id: 'qua', label: 'Quarta-feira', short: 'Qua' },
  { key: 4, id: 'qui', label: 'Quinta-feira', short: 'Qui' },
  { key: 5, id: 'sex', label: 'Sexta-feira', short: 'Sex' },
  { key: 6, id: 'sab', label: 'Sábado', short: 'Sáb' },
];

function checkShouldBeOpen(openTime = '10:00', closeTime = '22:00', weeklySchedule = null) {
  const now = new Date();
  const spTimeStr = now.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [curH, curM] = spTimeStr.split(':').map(Number);
  const curTotal = (isNaN(curH) ? 0 : curH) * 60 + (isNaN(curM) ? 0 : curM);

  const dayOfWeek = now.getDay();
  let dayOpen = openTime || '10:00';
  let dayClose = closeTime || '22:00';

  if (Array.isArray(weeklySchedule) && weeklySchedule.length > 0) {
    const dayConfig = weeklySchedule.find(d => d.key === dayOfWeek || d.id === DAYS_OF_WEEK[dayOfWeek]?.id);
    if (dayConfig) {
      if (dayConfig.closed) return false;
      if (dayConfig.open) dayOpen = dayConfig.open;
      if (dayConfig.close) dayClose = dayConfig.close;
    }
  }

  const [openH, openM] = dayOpen.split(':').map(Number);
  const [closeH, closeM] = dayClose.split(':').map(Number);
  const openTotal = (isNaN(openH) ? 10 : openH) * 60 + (isNaN(openM) ? 0 : openM);
  const closeTotal = (isNaN(closeH) ? 22 : closeH) * 60 + (isNaN(closeM) ? 0 : closeM);

  if (openTotal <= closeTotal) {
    return curTotal >= openTotal && curTotal < closeTotal;
  } else {
    return curTotal >= openTotal || curTotal < closeTotal;
  }
}

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [storeStatus, setStoreStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState('');
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    preparing: 0,
    revenue: 0,
  });

  // Modais de Gestão
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [feeModalOpen, setFeeModalOpen] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [isSavingFee, setIsSavingFee] = useState(false);

  // Estados dos inputs de horário
  const [openTimeInput, setOpenTimeInput] = useState('10:00');
  const [closeTimeInput, setCloseTimeInput] = useState('22:00');
  const [autoScheduleInput, setAutoScheduleInput] = useState(true);
  const [weeklyScheduleInput, setWeeklyScheduleInput] = useState(
    DAYS_OF_WEEK.map(d => ({ ...d, open: '10:00', close: '22:00', closed: false }))
  );

  // Estado do input de taxa
  const [deliveryFeeInput, setDeliveryFeeInput] = useState('3.00');

  // Relógio com fuso horário SP
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

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
        const val = settingsData.setting_value || {};
        if (val.openTime) setOpenTimeInput(val.openTime);
        if (val.closeTime) setCloseTimeInput(val.closeTime);
        if (val.autoSchedule !== undefined) setAutoScheduleInput(Boolean(val.autoSchedule));
        if (val.deliveryFee !== undefined) setDeliveryFeeInput(String(val.deliveryFee));
        if (Array.isArray(val.weeklySchedule) && val.weeklySchedule.length === 7) {
          setWeeklyScheduleInput(val.weeklySchedule);
        } else {
          setWeeklyScheduleInput(
            DAYS_OF_WEEK.map(d => ({
              ...d,
              open: val.openTime || '10:00',
              close: val.closeTime || '22:00',
              closed: false,
            }))
          );
        }
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
    const currentVal = storeStatus.setting_value || {};
    const newOpen = !currentVal.isOpen;
    const newVal = {
      ...currentVal,
      isOpen: newOpen,
      manualOverride: true,
      lastManualChange: new Date().toISOString(),
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

  const handleResetToAuto = async () => {
    if (!storeStatus) return;
    const currentVal = storeStatus.setting_value || {};
    const openTime = currentVal.openTime || '10:00';
    const closeTime = currentVal.closeTime || '22:00';
    const weekly = currentVal.weeklySchedule;

    const scheduledOpen = checkShouldBeOpen(openTime, closeTime, weekly);
    const newVal = {
      ...currentVal,
      isOpen: scheduledOpen,
      manualOverride: false,
      lastCycleState: scheduledOpen,
      lastManualChange: null,
    };

    setLoading(true);
    const { error } = await supabase
      .from('store_settings')
      .update({ setting_value: newVal })
      .eq('id', storeStatus.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível restaurar o modo automático.');
    } else {
      setStoreStatus({ ...storeStatus, setting_value: newVal });
      Alert.alert('Modo Automático Restaurado', 'A loja voltou a seguir o horário programado.');
    }
    setLoading(false);
  };

  const handleSaveSchedule = async () => {
    if (!storeStatus) return;
    setIsSavingSchedule(true);
    try {
      const currentVal = storeStatus.setting_value || {};
      const scheduledOpen = checkShouldBeOpen(openTimeInput, closeTimeInput, weeklyScheduleInput);

      const newVal = {
        ...currentVal,
        openTime: openTimeInput,
        closeTime: closeTimeInput,
        autoSchedule: autoScheduleInput,
        weeklySchedule: weeklyScheduleInput,
        isOpen: currentVal.manualOverride ? currentVal.isOpen : scheduledOpen,
        lastCycleState: scheduledOpen,
      };

      const { error } = await supabase
        .from('store_settings')
        .update({ setting_value: newVal })
        .eq('id', storeStatus.id);

      if (error) throw error;

      setStoreStatus({ ...storeStatus, setting_value: newVal });
      setScheduleModalOpen(false);
      Alert.alert('Sucesso', 'Horários de funcionamento atualizados com sucesso!');
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar os horários.');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleToggleDayClosed = (index) => {
    const nextWeekly = [...weeklyScheduleInput];
    nextWeekly[index] = {
      ...nextWeekly[index],
      closed: !nextWeekly[index].closed,
    };
    setWeeklyScheduleInput(nextWeekly);
  };

  const handleUpdateDayTime = (index, field, value) => {
    const nextWeekly = [...weeklyScheduleInput];
    nextWeekly[index] = {
      ...nextWeekly[index],
      [field]: value,
    };
    setWeeklyScheduleInput(nextWeekly);
  };

  const handleToggleDelivery = async () => {
    if (!storeStatus) return;
    const currentVal = storeStatus.setting_value || {};
    const newVal = {
      ...currentVal,
      isDeliveryEnabled: !currentVal.isDeliveryEnabled,
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
    const currentVal = storeStatus.setting_value || {};
    const newVal = {
      ...currentVal,
      isDeliveryFeeEnabled: !currentVal.isDeliveryFeeEnabled,
    };

    setLoading(true);
    const { error } = await supabase
      .from('store_settings')
      .update({ setting_value: newVal })
      .eq('id', storeStatus.id);

    if (error) {
      Alert.alert('Erro', 'Não foi possível alterar o status da taxa de entrega.');
    } else {
      setStoreStatus({ ...storeStatus, setting_value: newVal });
    }
    setLoading(false);
  };

  const handleSaveFee = async () => {
    if (!storeStatus) return;
    const parsedFee = parseFloat(deliveryFeeInput.replace(',', '.'));
    if (isNaN(parsedFee) || parsedFee < 0) {
      Alert.alert('Valor Inválido', 'Digite uma taxa válida (ex: 3.50).');
      return;
    }

    setIsSavingFee(true);
    try {
      const currentVal = storeStatus.setting_value || {};
      const newVal = {
        ...currentVal,
        deliveryFee: parsedFee,
      };

      const { error } = await supabase
        .from('store_settings')
        .update({ setting_value: newVal })
        .eq('id', storeStatus.id);

      if (error) throw error;

      setStoreStatus({ ...storeStatus, setting_value: newVal });
      setFeeModalOpen(false);
      Alert.alert('Sucesso', `Taxa de entrega alterada para R$ ${parsedFee.toFixed(2).replace('.', ',')}`);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar a taxa de entrega.');
    } finally {
      setIsSavingFee(false);
    }
  };

  if (loading && !storeStatus) {
    return <AdminDashboardSkeleton />;
  }

  const val = storeStatus?.setting_value || {};
  const isOpen = Boolean(val.isOpen);
  const isDeliveryEnabled = Boolean(val.isDeliveryEnabled ?? true);
  const isDeliveryFeeEnabled = Boolean(val.isDeliveryFeeEnabled ?? true);
  const isManualOverride = Boolean(val.manualOverride);
  const openTime = val.openTime || '10:00';
  const closeTime = val.closeTime || '22:00';
  const feeAmount = Number(val.deliveryFee ?? 3).toFixed(2).replace('.', ',');

  return (
    <View style={s.container}>
      {/* Top Header iFood Partner Style */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.headerTopRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </Pressable>

          <View style={s.partnerBadge}>
            <Ionicons name="storefront" size={13} color={COLORS.primary} />
            <Text style={s.partnerBadgeText}>PORTAL DO PARCEIRO</Text>
          </View>
        </View>

        <View style={s.headerTitleRow}>
          <View>
            <Text style={s.headerTitle}>Painel Administrativo</Text>
            <Text style={s.headerSubtitle}>Controle de loja, pedidos e catálogo</Text>
          </View>
          <View style={[s.liveIndicator, isOpen ? s.liveOpen : s.liveClosed]}>
            <View style={[s.pulseDot, isOpen ? s.pulseDotOpen : s.pulseDotClosed]} />
            <Text style={[s.liveText, isOpen ? s.liveTextOpen : s.liveTextClosed]}>
              {isOpen ? 'LOJA ONLINE' : 'FECHADA'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Card de Gestão de Horários & Status */}
        <View style={s.sectionCard}>
          <View style={s.cardHeaderRow}>
            <View style={s.cardHeaderLeft}>
              <View style={s.iconWrapper}>
                <Ionicons name="time" size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Horário & Funcionamento</Text>
                <Text style={s.cardSub}>Iacanga-SP • Horário atual: {currentTime || '--:--'}</Text>
              </View>
            </View>

            <Pressable
              style={s.scheduleConfigBtn}
              onPress={() => setScheduleModalOpen(true)}
              hitSlop={6}
            >
              <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
              <Text style={s.scheduleConfigBtnText}>Configurar</Text>
            </Pressable>
          </View>

          {/* Badges de Modo & Status */}
          <View style={s.badgePillsRow}>
            <View style={[s.statusPill, isOpen ? s.pillOpen : s.pillClosed]}>
              <Ionicons
                name={isOpen ? 'checkmark-circle' : 'close-circle'}
                size={13}
                color={isOpen ? '#15803D' : '#B91C1C'}
              />
              <Text style={[s.pillText, isOpen ? s.pillTextOpen : s.pillTextClosed]}>
                {isOpen ? 'Aberta para pedidos' : 'Loja fechada'}
              </Text>
            </View>

            <View style={[s.statusPill, isManualOverride ? s.pillManual : s.pillAuto]}>
              <Ionicons
                name={isManualOverride ? 'alert-circle' : 'sync'}
                size={13}
                color={isManualOverride ? COLORS.secondary : '#1D4ED8'}
              />
              <Text style={[s.pillText, isManualOverride ? s.pillTextManual : s.pillTextAuto]}>
                {isManualOverride
                  ? 'Sobreposição manual'
                  : `Automático (${openTime} - ${closeTime})`}
              </Text>
            </View>

            {isOpen && (
              <View style={[s.statusPill, s.pillWait]}>
                <Ionicons name="hourglass-outline" size={13} color="#B45309" />
                <Text style={s.pillTextWait}>
                  Espera: {val.waitTimeMin || 15}-{val.waitTimeMax || 22} min
                </Text>
              </View>
            )}
          </View>

          {/* Botão de reset rápido se estiver em override manual */}
          {isManualOverride && (
            <Pressable style={s.resetAutoBanner} onPress={handleResetToAuto}>
              <Ionicons name="refresh" size={14} color="#1D4ED8" />
              <Text style={s.resetAutoBannerText}>
                Restaurar ciclo automático ({openTime} às {closeTime})
              </Text>
            </Pressable>
          )}

          {/* Linha de Ações Principais de Status */}
          <View style={s.actionRow}>
            <Pressable
              style={[s.actionBtn, isOpen ? s.btnDanger : s.btnSuccess]}
              onPress={handleToggleStore}
            >
              <Ionicons
                name={isOpen ? 'power' : 'flash'}
                size={16}
                color={isOpen ? COLORS.secondary : '#15803D'}
              />
              <Text style={[s.actionBtnText, isOpen ? { color: COLORS.secondary } : { color: '#15803D' }]}>
                {isOpen ? 'Forçar Fechar' : 'Forçar Abrir'}
              </Text>
            </Pressable>

            <Pressable
              style={[s.actionBtn, isDeliveryEnabled ? s.btnDeliveryOn : s.btnDeliveryOff]}
              onPress={handleToggleDelivery}
            >
              <Ionicons
                name="bicycle"
                size={16}
                color={isDeliveryEnabled ? COLORS.white : COLORS.textSecondary}
              />
              <Text style={[s.actionBtnText, { color: isDeliveryEnabled ? COLORS.white : COLORS.textSecondary }]}>
                {isDeliveryEnabled ? 'Entregas ON' : 'Entregas OFF'}
              </Text>
            </Pressable>

            <Pressable
              style={[s.actionBtn, s.btnFeeConfig]}
              onPress={() => setFeeModalOpen(true)}
              onLongPress={handleToggleDeliveryFee}
            >
              <Ionicons
                name="cash-outline"
                size={16}
                color={isDeliveryFeeEnabled ? COLORS.primary : COLORS.textMuted}
              />
              <Text style={[s.actionBtnText, { color: isDeliveryFeeEnabled ? COLORS.primary : COLORS.textMuted }]}>
                {isDeliveryFeeEnabled ? `Taxa R$ ${feeAmount}` : 'Taxa OFF'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Resumo de Hoje (Stats 2x2) */}
        <View style={s.statsGrid}>
          <View style={s.statsCard}>
            <View style={[s.statsIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="receipt" size={18} color="#D97706" />
            </View>
            <Text style={s.statsLabel}>Pedidos Hoje</Text>
            <Text style={s.statsNumber}>{stats.total}</Text>
            <Text style={s.statsDetail}>{stats.pending} novos • {stats.preparing} em prep.</Text>
          </View>

          <View style={s.statsCard}>
            <View style={[s.statsIcon, { backgroundColor: '#FFEDD5' }]}>
              <Ionicons name="hourglass" size={18} color={COLORS.secondary} />
            </View>
            <Text style={s.statsLabel}>Pendentes</Text>
            <Text style={[s.statsNumber, { color: COLORS.secondary }]}>{stats.pending}</Text>
            <Text style={s.statsDetail}>Aguardando confirmação</Text>
          </View>

          <View style={s.statsCard}>
            <View style={[s.statsIcon, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="restaurant" size={18} color="#2563EB" />
            </View>
            <Text style={s.statsLabel}>Na Cozinha</Text>
            <Text style={[s.statsNumber, { color: '#2563EB' }]}>{stats.preparing}</Text>
            <Text style={s.statsDetail}>Sendo preparados</Text>
          </View>

          <View style={s.statsCard}>
            <View style={[s.statsIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="trending-up" size={18} color="#15803D" />
            </View>
            <Text style={s.statsLabel}>Faturamento</Text>
            <Text style={[s.statsNumber, { color: '#15803D', fontSize: 16 }]}>
              R$ {stats.revenue.toFixed(2).replace('.', ',')}
            </Text>
            <Text style={s.statsDetail}>Pedidos finalizados</Text>
          </View>
        </View>

        {/* Menu de Operações iFood Partner */}
        <View style={s.menuList}>
          <Text style={s.menuSectionTitle}>OPERAÇÕES & GESTÃO</Text>

          {/* Pedidos */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/pedidos')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="receipt" size={20} color={COLORS.primary} />
            </View>
            <View style={s.menuItemTextCol}>
              <View style={s.menuItemTitleRow}>
                <Text style={s.menuItemTitle}>Gerenciar Pedidos</Text>
                {stats.pending > 0 && (
                  <View style={s.badgeCounter}>
                    <Text style={s.badgeCounterText}>{stats.pending}</Text>
                  </View>
                )}
              </View>
              <Text style={s.menuItemDesc}>Visualize pedidos, mude status e despache entregas</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Produtos */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/produtos')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="fast-food" size={20} color={COLORS.secondary} />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Cardápio & Produtos</Text>
              <Text style={s.menuItemDesc}>Cadastre pratos, altere valores e disponibilidades</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Cupons */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/cupons')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="pricetag" size={20} color="#9333EA" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Cupons de Desconto</Text>
              <Text style={s.menuItemDesc}>Crie códigos promocionais, limites e descontos</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Campanhas Push */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/campanhas')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="megaphone" size={20} color="#D97706" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Campanhas & Push</Text>
              <Text style={s.menuItemDesc}>Notificações em massa com cupom e preview iFood</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Imagens */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/imagens')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="images" size={20} color="#2563EB" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Gerenciar Fotos</Text>
              <Text style={s.menuItemDesc}>Upload instantâneo de banners e fotos de pratos</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Gestão Financeira */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/caixa')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="cash" size={20} color="#15803D" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Caixa & Financeiro</Text>
              <Text style={s.menuItemDesc}>Histórico de faturamento diário, métodos e métricas</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Promoções */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/promocoes')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#FFEDD5' }]}>
              <Ionicons name="megaphone" size={20} color={COLORS.secondary} />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Promoções em Destaque</Text>
              <Text style={s.menuItemDesc}>Defina o prato da semana e banner promocional</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Feedbacks */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/feedbacks')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#FEF9C3' }]}>
              <Ionicons name="star" size={20} color="#CA8A04" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Avaliações dos Clientes</Text>
              <Text style={s.menuItemDesc}>Notas médias, elogios e comentários recebidos</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>

          {/* Administradores */}
          <Pressable style={s.menuItemCard} onPress={() => router.push('/admin/administradores')}>
            <View style={[s.menuItemIcon, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemTitle}>Permissões & Equipe</Text>
              <Text style={s.menuItemDesc}>Adicione e controle e-mails com acesso admin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Modal: Horários de Funcionamento (Business Hours) */}
      <SwipeableBottomSheetModal
        visible={scheduleModalOpen}
        onRequestClose={() => setScheduleModalOpen(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={[s.sheet, { height: '85%', maxHeight: '85%' }]}
        scrollable
      >
        <View style={s.modalContainer}>
          <View style={s.modalHeader}>
            <View style={s.modalHeaderIconBg}>
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Horários de Funcionamento</Text>
              <Text style={s.modalSubtitle}>Abertura e fechamento automatizados</Text>
            </View>
            <Pressable
              onPress={() => setScheduleModalOpen(false)}
              style={s.modalCloseBtn}
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

            <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Horários Gerais */}
              <View style={s.modalFormGroup}>
                <Text style={s.modalSectionLabel}>HORÁRIO DIÁRIO PADRÃO</Text>
                <View style={s.timeInputRow}>
                  <View style={s.timeInputCol}>
                    <Text style={s.inputLabel}>Abertura:</Text>
                    <TextInput
                      style={s.timeInput}
                      value={openTimeInput}
                      onChangeText={setOpenTimeInput}
                      placeholder="10:00"
                      maxLength={5}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={s.timeInputCol}>
                    <Text style={s.inputLabel}>Fechamento:</Text>
                    <TextInput
                      style={s.timeInput}
                      value={closeTimeInput}
                      onChangeText={setCloseTimeInput}
                      placeholder="22:00"
                      maxLength={5}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>
              </View>

              {/* Chave de Automação */}
              <View style={s.autoSwitchCard}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.autoSwitchTitle}>Ativar Ciclo Automático</Text>
                  <Text style={s.autoSwitchDesc}>
                    Abre e fecha a loja no banco automaticamente conforme os horários programados.
                  </Text>
                </View>
                <Switch
                  value={autoScheduleInput}
                  onValueChange={setAutoScheduleInput}
                  trackColor={{ false: '#D1D5DB', true: COLORS.primary }}
                  thumbColor={COLORS.white}
                />
              </View>

              {/* Escala por Dia da Semana */}
              <View style={s.modalFormGroup}>
                <Text style={s.modalSectionLabel}>DIAS DA SEMANA (ESPECÍFICOS)</Text>
                {weeklyScheduleInput.map((day, idx) => (
                  <View key={day.id || idx} style={s.dayScheduleRow}>
                    <View style={s.dayInfoCol}>
                      <Text style={[s.dayLabel, day.closed && s.dayLabelClosed]}>
                        {day.label}
                      </Text>
                      <Pressable
                        onPress={() => handleToggleDayClosed(idx)}
                        style={[s.dayStatusToggle, day.closed ? s.dayToggleClosed : s.dayToggleOpen]}
                      >
                        <Text style={[s.dayStatusText, day.closed ? s.dayTextClosed : s.dayTextOpen]}>
                          {day.closed ? 'Fechado' : 'Aberto'}
                        </Text>
                      </Pressable>
                    </View>

                    {!day.closed ? (
                      <View style={s.dayTimesInputs}>
                        <TextInput
                          style={s.miniTimeInput}
                          value={day.open || '10:00'}
                          onChangeText={(v) => handleUpdateDayTime(idx, 'open', v)}
                          placeholder="10:00"
                          maxLength={5}
                        />
                        <Text style={s.timeSeparator}>até</Text>
                        <TextInput
                          style={s.miniTimeInput}
                          value={day.close || '22:00'}
                          onChangeText={(v) => handleUpdateDayTime(idx, 'close', v)}
                          placeholder="22:00"
                          maxLength={5}
                        />
                      </View>
                    ) : (
                      <Text style={s.dayOffNotice}>Não haverá expediente</Text>
                    )}
                  </View>
                ))}
              </View>

              <View style={s.infoNoticeBox}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.secondary} />
                <Text style={s.infoNoticeText}>
                  Sobreposição manual: caso você alterne a loja pelo botão de forçar, a loja respeitará até o próximo horário programado ser atingido.
                </Text>
              </View>
            </ScrollView>

            <View style={s.modalFooter}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setScheduleModalOpen(false)}
                disabled={isSavingSchedule}
              >
                <Text style={s.modalCancelBtnText}>Cancelar</Text>
              </Pressable>

              <Pressable
                style={s.modalSaveBtn}
                onPress={handleSaveSchedule}
                disabled={isSavingSchedule}
              >
                {isSavingSchedule ? (
                  <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
                ) : (
                  <>
                    <Ionicons name="save-outline" size={16} color={COLORS.white} />
                    <Text style={s.modalSaveBtnText}>Salvar Horários</Text>
                  </>
                )}
              </Pressable>
            </View>
            <ThemedAlertHost />
          </View>
        </SwipeableBottomSheetModal>

      {/* Modal: Configurar Taxa de Entrega */}
      <SwipeableBottomSheetModal
        visible={feeModalOpen}
        onRequestClose={() => setFeeModalOpen(false)}
        backdropColor="rgba(0,0,0,0.5)"
        contentStyle={s.sheet}
      >
        <View style={[s.modalContainer, { maxHeight: 320 }]}>
          <View style={s.modalHeader}>
            <View style={[s.modalHeaderIconBg, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="cash" size={20} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>Taxa de Entrega</Text>
              <Text style={s.modalSubtitle}>Ajuste o valor padrão da taxa de delivery</Text>
            </View>
            <Pressable onPress={() => setFeeModalOpen(false)} style={s.modalCloseBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.text} />
            </Pressable>
          </View>

            <View style={{ padding: 18 }}>
              <Text style={s.inputLabel}>Valor da Taxa (R$):</Text>
              <TextInput
                style={[s.timeInput, { marginTop: 6, fontSize: 18, textAlign: 'center' }]}
                value={deliveryFeeInput}
                onChangeText={setDeliveryFeeInput}
                keyboardType="decimal-pad"
                placeholder="3.00"
              />

              <View style={{ marginTop: 16 }}>
                <Pressable
                  style={[
                    s.feeToggleBadgeBtn,
                    isDeliveryFeeEnabled ? s.feeBadgeActive : s.feeBadgeInactive,
                  ]}
                  onPress={handleToggleDeliveryFee}
                >
                  <Ionicons
                    name={isDeliveryFeeEnabled ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={isDeliveryFeeEnabled ? '#15803D' : '#B91C1C'}
                  />
                  <Text
                    style={[
                      s.feeToggleText,
                      isDeliveryFeeEnabled ? { color: '#15803D' } : { color: '#B91C1C' },
                    ]}
                  >
                    {isDeliveryFeeEnabled ? 'Cobrança de taxa ativa' : 'Taxa isenta / desativada'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={s.modalFooter}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => setFeeModalOpen(false)}
                disabled={isSavingFee}
              >
                <Text style={s.modalCancelBtnText}>Voltar</Text>
              </Pressable>

              <Pressable
                style={s.modalSaveBtn}
                onPress={handleSaveFee}
                disabled={isSavingFee}
              >
                {isSavingFee ? (
                  <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
                ) : (
                  <Text style={s.modalSaveBtnText}>Confirmar Taxa</Text>
                )}
              </Pressable>
            </View>
            <ThemedAlertHost />
          </View>
        </SwipeableBottomSheetModal>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.backgroundElevated,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundElevated,
  },
  header: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F5F2ED',
  },
  partnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
  },
  partnerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A16207',
    letterSpacing: 0.5,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveOpen: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  liveClosed: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  pulseDotOpen: {
    backgroundColor: '#16A34A',
  },
  pulseDotClosed: {
    backgroundColor: '#DC2626',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '800',
  },
  liveTextOpen: {
    color: '#15803D',
  },
  liveTextClosed: {
    color: '#B91C1C',
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },

  // Card de Gestão de Horários
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  cardSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  scheduleConfigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
  },
  scheduleConfigBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A16207',
  },

  badgePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pillOpen: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  pillClosed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  pillAuto: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  pillManual: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFEDD5',
  },
  pillWait: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillTextOpen: {
    color: '#15803D',
  },
  pillTextClosed: {
    color: '#B91C1C',
  },
  pillTextAuto: {
    color: '#1D4ED8',
  },
  pillTextManual: {
    color: COLORS.secondary,
  },
  pillTextWait: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },

  resetAutoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  resetAutoBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  btnSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  btnDeliveryOn: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  btnDeliveryOff: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  btnFeeConfig: {
    backgroundColor: '#FEF8EC',
    borderColor: '#FCE8C3',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Stats Grid 2x2
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statsCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsIcon: {
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
    color: COLORS.textSecondary,
  },
  statsNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    marginVertical: 2,
  },
  statsDetail: {
    fontSize: 10,
    color: COLORS.textMuted,
  },

  // Menu List iFood Partner
  menuList: {
    gap: 10,
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingLeft: 4,
  },
  menuItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  menuItemIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemTextCol: {
    flex: 1,
  },
  menuItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
  },
  badgeCounter: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeCounterText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
  },
  menuItemDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Modais
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  modalHeaderIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEF8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalSubtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalScroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  modalFormGroup: {
    marginBottom: 16,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  timeInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeInputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  timeInput: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundElevated,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  autoSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF8EC',
    borderWidth: 1,
    borderColor: '#FCE8C3',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
  },
  autoSwitchTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#A16207',
  },
  autoSwitchDesc: {
    fontSize: 11,
    color: '#8A6100',
    marginTop: 2,
    lineHeight: 15,
  },

  dayScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F2ED',
  },
  dayInfoCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '45%',
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  dayLabelClosed: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  dayStatusToggle: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayToggleOpen: {
    backgroundColor: '#DCFCE7',
  },
  dayToggleClosed: {
    backgroundColor: '#FEE2E2',
  },
  dayStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dayTextOpen: {
    color: '#15803D',
  },
  dayTextClosed: {
    color: '#B91C1C',
  },
  dayTimesInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniTimeInput: {
    width: 62,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.backgroundElevated,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  timeSeparator: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  dayOffNotice: {
    fontSize: 11,
    fontStyle: 'italic',
    color: COLORS.textMuted,
  },

  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginVertical: 12,
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },

  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  modalSaveBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.white,
  },

  feeToggleBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  feeBadgeActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  feeBadgeInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  feeToggleText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
