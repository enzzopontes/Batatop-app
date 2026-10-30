import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import { checkIsAdmin } from '../../utils/isAdmin';
import CampaignModal from '../../components/admin/CampaignModal';

const THEME = {
  primary: '#E3A008',
  terracotta: '#C1440E',
  bgWarm: '#F7F4EF',
  cardBg: '#FFFFFF',
  textDark: '#1F1B16',
  textMuted: '#78716C',
  border: '#E7E5E4',
  success: '#16A34A',
  error: '#DC2626',
};

export default function AdminCampanhas() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [activeTab, setActiveTab] = useState('scheduled'); // 'scheduled' | 'history'
  const [modalVisible, setModalVisible] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Verificação de Admin
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/');
          return;
        }
        const isAdmin = await checkIsAdmin(user.id);
        if (!isAdmin) {
          router.replace('/');
          return;
        }
        setCheckingAdmin(false);
      } catch {
        router.replace('/');
      }
    })();
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Busca campanhas com cupom relacionado
      const { data: camps, error: campErr } = await supabase
        .from('campaigns')
        .select('*, coupons (code, type, value, active)')
        .order('scheduled_for', { ascending: false });

      if (campErr) {
        console.warn('Erro ao carregar campanhas:', campErr.message);
      } else {
        setCampaigns(camps || []);
      }

      // 2. Busca contagem de tokens push ativos
      const { count, error: tokenErr } = await supabase
        .from('user_push_tokens')
        .select('*', { count: 'exact', head: true });

      if (!tokenErr) {
        setTokenCount(count || 0);
      }
    } catch (err) {
      console.error('Erro geral ao carregar dados:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!checkingAdmin) {
      loadData();
    }
  }, [checkingAdmin, loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleTriggerNow = (campaignId) => {
    Alert.alert(
      'Disparar Notificações',
      `Deseja enviar esta notificação agora para todos os ${tokenCount} clientes com token ativo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, Disparar Agora',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoadingId(campaignId);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

              // Atualiza status no banco
              await supabase
                .from('campaigns')
                .update({ status: 'processing', updated_at: new Date().toISOString() })
                .eq('id', campaignId);

              // Invoca Edge Function
              const { error: fnErr } = await supabase.functions.invoke('dispatch-campaign-push', {
                body: { campaignId },
              });

              if (fnErr) {
                throw new Error(fnErr.message);
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Sucesso', 'Disparo de notificações iniciado em background!');
              loadData();
            } catch (err) {
              console.error('Erro ao disparar campanha:', err);
              Alert.alert('Erro', err.message || 'Falha ao acionar disparo.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleCancelCampaign = async (campaignId) => {
    Alert.alert(
      'Cancelar Campanha',
      'Tem certeza que deseja cancelar o agendamento desta campanha?',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoadingId(campaignId);
              await supabase
                .from('campaigns')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', campaignId);

              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              loadData();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível cancelar.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteCampaign = async (campaignId) => {
    Alert.alert(
      'Excluir Registro',
      'Deseja excluir definitivamente o registro desta campanha?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoadingId(campaignId);
              await supabase
                .from('campaigns')
                .delete()
                .eq('id', campaignId);

              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              loadData();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível excluir.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  if (checkingAdmin) {
    return (
      <View style={s.centerBox}>
        <ActivityIndicator size="large" color={THEME.terracotta} />
      </View>
    );
  }

  const scheduledCampaigns = campaigns.filter((c) =>
    ['scheduled', 'processing', 'draft'].includes(c.status)
  );

  const historyCampaigns = campaigns.filter((c) =>
    ['completed', 'failed', 'cancelled'].includes(c.status)
  );

  const currentList = activeTab === 'scheduled' ? scheduledCampaigns : historyCampaigns;

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'scheduled':
        return (
          <View style={[s.badge, { backgroundColor: '#FEF3C7' }]}>
            <Text style={[s.badgeText, { color: '#B45309' }]}>Agendada</Text>
          </View>
        );
      case 'processing':
        return (
          <View style={[s.badge, { backgroundColor: '#DBEAFE' }]}>
            <Text style={[s.badgeText, { color: '#1D4ED8' }]}>Disparando...</Text>
          </View>
        );
      case 'completed':
        return (
          <View style={[s.badge, { backgroundColor: '#DCFCE7' }]}>
            <Text style={[s.badgeText, { color: '#15803D' }]}>Concluída</Text>
          </View>
        );
      case 'failed':
        return (
          <View style={[s.badge, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[s.badgeText, { color: '#B91C1C' }]}>Falhou</Text>
          </View>
        );
      case 'cancelled':
        return (
          <View style={[s.badge, { backgroundColor: '#F3F4F6' }]}>
            <Text style={[s.badgeText, { color: '#4B5563' }]}>Cancelada</Text>
          </View>
        );
      default:
        return (
          <View style={s.badge}>
            <Text style={s.badgeText}>{status}</Text>
          </View>
        );
    }
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={THEME.textDark} />
        </Pressable>
        <Text style={s.topBarTitle}>Campanhas Push</Text>
        <Pressable
          onPress={() => setModalVisible(true)}
          style={s.createBtn}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={s.createBtnText}>Nova</Text>
        </Pressable>
      </View>

      {/* Cards de Métricas / Resumo */}
      <View style={s.metricsRow}>
        <View style={s.metricCard}>
          <Ionicons name="phone-portrait" size={20} color={THEME.primary} />
          <Text style={s.metricValue}>{tokenCount}</Text>
          <Text style={s.metricLabel}>Aparelhos Ativos</Text>
        </View>

        <View style={s.metricCard}>
          <Ionicons name="paper-plane" size={20} color={THEME.terracotta} />
          <Text style={s.metricValue}>
            {campaigns.filter((c) => c.status === 'completed').length}
          </Text>
          <Text style={s.metricLabel}>Disparos Feitos</Text>
        </View>

        <View style={s.metricCard}>
          <Ionicons name="time" size={20} color="#2563EB" />
          <Text style={s.metricValue}>{scheduledCampaigns.length}</Text>
          <Text style={s.metricLabel}>Agendadas</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabsContainer}>
        <Pressable
          style={[s.tabButton, activeTab === 'scheduled' && s.tabButtonActive]}
          onPress={() => setActiveTab('scheduled')}
        >
          <Text
            style={[s.tabButtonText, activeTab === 'scheduled' && s.tabButtonTextActive]}
          >
            Agendadas ({scheduledCampaigns.length})
          </Text>
        </Pressable>

        <Pressable
          style={[s.tabButton, activeTab === 'history' && s.tabButtonActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            style={[s.tabButtonText, activeTab === 'history' && s.tabButtonTextActive]}
          >
            Histórico ({historyCampaigns.length})
          </Text>
        </Pressable>
      </View>

      {/* Lista de Campanhas */}
      <ScrollView
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading && !refreshing ? (
          <ActivityIndicator size="small" color={THEME.terracotta} style={{ marginTop: 20 }} />
        ) : currentList.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="notifications-off-outline" size={48} color={THEME.textMuted} />
            <Text style={s.emptyTitle}>Nenhuma campanha aqui</Text>
            <Text style={s.emptySub}>
              {activeTab === 'scheduled'
                ? 'Agende notificações para feriados ou datas especiais.'
                : 'O histórico de campanhas já enviadas aparecerá aqui.'}
            </Text>
          </View>
        ) : (
          currentList.map((item) => {
            const isProcessing = actionLoadingId === item.id;
            const hasCoupon = !!item.coupons?.code;
            const scheduleDateStr = new Date(item.scheduled_for).toLocaleString('pt-BR', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <View key={item.id} style={s.campaignCard}>
                <View style={s.cardTop}>
                  {renderStatusBadge(item.status)}
                  <Text style={s.cardDate}>{scheduleDateStr}</Text>
                </View>

                <Text style={s.cardTitle}>{item.title}</Text>
                <Text style={s.cardBody}>{item.body}</Text>

                {/* Cupom Atrelado */}
                {hasCoupon ? (
                  <View style={s.couponRow}>
                    <Ionicons name="pricetag" size={14} color="#C1440E" />
                    <Text style={s.couponCodeText}>
                      Cupom: <Text style={s.couponCodeBold}>{item.coupons.code}</Text>
                    </Text>
                  </View>
                ) : null}

                {/* Métricas se foi concluída */}
                {item.status === 'completed' ? (
                  <View style={s.metricsBadgeRow}>
                    <Text style={s.metricsBadgeItem}>
                      👥 Destinatários: {item.total_recipients || 0}
                    </Text>
                    <Text style={[s.metricsBadgeItem, { color: THEME.success }]}>
                      ✓ Sucessos: {item.success_count || 0}
                    </Text>
                    {item.failure_count > 0 ? (
                      <Text style={[s.metricsBadgeItem, { color: THEME.error }]}>
                        ✕ Falhas: {item.failure_count}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Ações */}
                <View style={s.actionsRow}>
                  {item.status === 'scheduled' ? (
                    <>
                      <Pressable
                        style={s.actionTriggerBtn}
                        onPress={() => handleTriggerNow(item.id)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <>
                            <Ionicons name="paper-plane" size={14} color="#FFF" />
                            <Text style={s.actionTriggerText}>Disparar Agora</Text>
                          </>
                        )}
                      </Pressable>

                      <Pressable
                        style={s.actionCancelBtn}
                        onPress={() => handleCancelCampaign(item.id)}
                        disabled={isProcessing}
                      >
                        <Text style={s.actionCancelText}>Cancelar</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={s.actionDeleteBtn}
                      onPress={() => handleDeleteCampaign(item.id)}
                      disabled={isProcessing}
                    >
                      <Ionicons name="trash-outline" size={14} color={THEME.error} />
                      <Text style={s.actionDeleteText}>Excluir</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Modal de Criação */}
      <CampaignModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSuccess={() => loadData()}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bgWarm,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: THEME.bgWarm,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: THEME.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  backBtn: {
    padding: 6,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.textDark,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.terracotta,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: THEME.cardBg,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.textDark,
    marginTop: 4,
  },
  metricLabel: {
    fontSize: 11,
    color: THEME.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#E7E5E4',
    borderRadius: 8,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: THEME.cardBg,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textMuted,
  },
  tabButtonTextActive: {
    color: THEME.textDark,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.textDark,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: THEME.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  campaignCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDate: {
    fontSize: 12,
    color: THEME.textMuted,
    fontWeight: '500',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.textDark,
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 13,
    color: '#44403C',
    lineHeight: 18,
    marginBottom: 8,
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  couponCodeText: {
    fontSize: 11,
    color: '#92400E',
    marginLeft: 6,
  },
  couponCodeBold: {
    fontWeight: '800',
    color: '#C1440E',
  },
  metricsBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    marginBottom: 8,
  },
  metricsBadgeItem: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
  },
  actionTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionTriggerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  actionCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  actionCancelText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionDeleteText: {
    color: THEME.error,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
