import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, RefreshControl, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import { AdminListSkeleton } from '../../components/Skeleton';

export default function AdminFeedbacks() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    average: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });

  const loadFeedbacks = useCallback(async () => {
    try {
      setRefreshing(true);
      const { data, error } = await supabase
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const fbs = data || [];
      setFeedbacks(fbs);
      calculateStats(fbs);
    } catch (e) {
      console.error('Erro ao carregar feedbacks:', e);
      Alert.alert('Erro', 'Não foi possível carregar os feedbacks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const calculateStats = (data) => {
    const total = data.length;
    const sum = data.reduce((acc, fb) => acc + (fb.rating || 0), 0);
    const average = total > 0 ? sum / total : 0;

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    data.forEach((fb) => {
      const r = Math.round(fb.rating);
      if (distribution[r] !== undefined) {
        distribution[r]++;
      }
    });

    setStats({ total, average, distribution });
  };

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  const csatPercentage = useMemo(() => {
    if (stats.total === 0) return 100;
    const satisfied = (stats.distribution[4] || 0) + (stats.distribution[5] || 0);
    return Math.round((satisfied / stats.total) * 100);
  }, [stats]);

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter((fb) => {
      if (filter === '5') return Math.round(fb.rating) === 5;
      if (filter === '4') return Math.round(fb.rating) === 4;
      if (filter === 'critical') return Math.round(fb.rating) <= 3;
      if (filter === 'with_comment') return Boolean(fb.comment && fb.comment.trim().length > 0);
      return true;
    });
  }, [feedbacks, filter]);

  const getRelativeTime = (dateString) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 60) return 'Agora';
      if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)} min`;
      if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)} h`;
      if (diffInSeconds < 172800) return 'Ontem';
      if (diffInSeconds < 604800) return `Há ${Math.floor(diffInSeconds / 86400)} dias`;
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    } catch {
      return dateString;
    }
  };

  const handleWhatsAppReply = (fb) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const cleanPhone = (fb.customer_phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      Alert.alert('Sem telefone', 'Este cliente não cadastrou telefone de contato.');
      return;
    }
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const orderCode = String(fb.order_id || '').slice(0, 6).toUpperCase();
    const name = fb.customer_name?.trim() || 'Cliente';

    const message =
      fb.rating >= 4
        ? `Olá, ${name}! Tudo bem? Agradecemos imensamente pela sua avaliação de ${fb.rating} estrelas no pedido #${orderCode} da Batata Top! Ficamos muito felizes que curtiu. Conte sempre com a gente! 🥔✨`
        : `Olá, ${name}! Vimos sua avaliação sobre o pedido #${orderCode} na Batata Top. Sua experiência é muito importante para nós! Gostaríamos de entender o ocorrido para melhorar nosso serviço.`;

    const url = `whatsapp://send?phone=${fullPhone}&text=${encodeURIComponent(message)}`;
    const webUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`;

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(webUrl);
      }
    });
  };

  const handleCopyReplyTemplate = async (fb) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const orderCode = String(fb.order_id || '').slice(0, 6).toUpperCase();
    const name = fb.customer_name?.trim() || 'Cliente';
    const message =
      fb.rating >= 4
        ? `Olá, ${name}! Muito obrigado pela avaliação de ${fb.rating} estrelas no pedido #${orderCode}! Batata Top agradece pela preferência! 🍟💛`
        : `Olá, ${name}! Sentimos muito que sua experiência no pedido #${orderCode} não tenha sido perfeita. Estamos à disposição para resolver!`;

    await Clipboard.setStringAsync(message);
    setCopiedId(fb.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>Avaliações & Reputação</Text>
            <View style={s.ifoodBadge}>
              <Ionicons name="sparkles" size={10} color="#B45309" />
              <Text style={s.ifoodBadgeText}>iFood Standard</Text>
            </View>
          </View>
          <Text style={s.headerSub}>Monitore a satisfação dos clientes</Text>
        </View>
        <Pressable onPress={loadFeedbacks} style={s.refreshBtn} hitSlop={8}>
          {refreshing ? <ThreeDotsLoader color="#FCBB00" dotSize={5} /> : <Ionicons name="refresh-outline" size={22} color="#1A1A1A" />}
        </Pressable>
      </View>

      {loading ? (
        <AdminListSkeleton count={4} />
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadFeedbacks} colors={['#FCBB00']} tintColor="#FCBB00" />
          }
        >
          {/* Main Reputation & Score Summary */}
          <View style={s.reputationCard}>
            <View style={s.scoreTopRow}>
              <View>
                <Text style={s.scoreTitle}>NOTA DA LOJA</Text>
                <View style={s.bigScoreRow}>
                  <Text style={s.bigScoreNum}>
                    {stats.average > 0 ? stats.average.toFixed(1) : '—'}
                  </Text>
                  <View style={s.starsCol}>
                    <View style={s.starsRow}>
                      {[1, 2, 3, 4, 5].map((st) => (
                        <Ionicons
                          key={st}
                          name="star"
                          size={14}
                          color={st <= Math.round(stats.average) ? '#FCBB00' : '#E5E7EB'}
                        />
                      ))}
                    </View>
                    <Text style={s.scoreSub}>de 5.0 estrelas</Text>
                  </View>
                </View>
              </View>

              <View style={s.reputationBadgeWrap}>
                <Text style={s.reputationBadgeLabel}>
                  {stats.average >= 4.5 ? 'Super Restaurante' : stats.average >= 4.0 ? 'Muito Bom' : 'Regular'}
                </Text>
              </View>
            </View>

            {/* CSAT Bar */}
            <View style={s.csatBox}>
              <View style={s.csatHeader}>
                <View style={s.csatTitleRow}>
                  <Ionicons name="thumbs-up" size={12} color="#059669" />
                  <Text style={s.csatTitle}>Índice CSAT: {csatPercentage}% satisfeitos</Text>
                </View>
                <Text style={csatPercentage >= 90 ? s.csatTargetOk : s.csatTargetAlert}>
                  {csatPercentage >= 90 ? 'Meta atingida' : 'Abaixo da meta'}
                </Text>
              </View>
              <View style={s.csatBarBg}>
                <View style={[s.csatBarFill, { width: `${csatPercentage}%` }]} />
              </View>
            </View>

            {/* Distribution */}
            <View style={s.distContainer}>
              {[5, 4, 3, 2, 1].map((rating) => {
                const count = stats.distribution[rating] || 0;
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <View key={rating} style={s.distRow}>
                    <View style={s.distStarNum}>
                      <Text style={s.distStarLabel}>{rating}</Text>
                      <Ionicons name="star" size={10} color="#FCBB00" />
                    </View>
                    <View style={s.progressBarBg}>
                      <View style={[s.progressBarFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={s.distCountLabel}>{count}</Text>
                  </View>
                );
              })}
            </View>

            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total de avaliações apuradas:</Text>
              <Text style={s.totalVal}>{stats.total}</Text>
            </View>
          </View>

          {/* Sentiment Filter Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filtersContainer}>
            <Pressable
              onPress={() => { Haptics.selectionAsync(); setFilter('all'); }}
              style={[s.filterChip, filter === 'all' && s.filterChipActive]}
            >
              <Text style={[s.filterChipText, filter === 'all' && s.filterChipTextActive]}>
                Todos ({stats.total})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); setFilter('5'); }}
              style={[s.filterChip, filter === '5' && s.filterChipActiveAmber]}
            >
              <Ionicons name="star" size={12} color={filter === '5' ? '#1A1A1A' : '#FCBB00'} />
              <Text style={[s.filterChipText, filter === '5' && s.filterChipTextActiveDark]}>
                5★ ({stats.distribution[5] || 0})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); setFilter('4'); }}
              style={[s.filterChip, filter === '4' && s.filterChipActiveAmber]}
            >
              <Ionicons name="star" size={12} color={filter === '4' ? '#1A1A1A' : '#FCBB00'} />
              <Text style={[s.filterChipText, filter === '4' && s.filterChipTextActiveDark]}>
                4★ ({stats.distribution[4] || 0})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); setFilter('critical'); }}
              style={[s.filterChip, filter === 'critical' && s.filterChipActiveRose]}
            >
              <Text style={[s.filterChipText, filter === 'critical' && s.filterChipTextActive]}>
                Críticas 1-3★ ({((stats.distribution[1] || 0) + (stats.distribution[2] || 0) + (stats.distribution[3] || 0))})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { Haptics.selectionAsync(); setFilter('with_comment'); }}
              style={[s.filterChip, filter === 'with_comment' && s.filterChipActive]}
            >
              <Ionicons name="chatbubble-outline" size={12} color={filter === 'with_comment' ? '#FFF' : '#6B7280'} />
              <Text style={[s.filterChipText, filter === 'with_comment' && s.filterChipTextActive]}>
                Com comentários ({feedbacks.filter((f) => f.comment && f.comment.trim().length > 0).length})
              </Text>
            </Pressable>
          </ScrollView>

          {/* Feedbacks list */}
          {filteredFeedbacks.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={44} color="#D1D5DB" />
              <Text style={s.emptyText}>Nenhuma avaliação encontrada</Text>
            </View>
          ) : (
            filteredFeedbacks.map((fb) => {
              const orderCode = String(fb.order_id || '').slice(0, 6).toUpperCase();
              const initial = (fb.customer_name || 'C').charAt(0).toUpperCase();

              return (
                <View key={fb.id} style={s.fbCard}>
                  {/* Top Customer Info */}
                  <View style={s.fbHeaderRow}>
                    <View style={s.avatarCircle}>
                      <Text style={s.avatarLetter}>{initial}</Text>
                    </View>

                    <View style={s.headerCustomerInfo}>
                      <View style={s.nameTimeRow}>
                        <Text style={s.customerName} numberOfLines={1}>
                          {fb.customer_name || 'Cliente'}
                        </Text>
                        <Text style={s.fbDate}>{getRelativeTime(fb.created_at)}</Text>
                      </View>

                      {/* Stars */}
                      <View style={s.starsRowWithScore}>
                        <View style={s.starsRow}>
                          {[1, 2, 3, 4, 5].map((st) => (
                            <Ionicons
                              key={st}
                              name="star"
                              size={13}
                              color={st <= fb.rating ? '#FCBB00' : '#E5E7EB'}
                            />
                          ))}
                        </View>
                        <Text style={s.ratingNum}>{fb.rating}.0</Text>
                      </View>
                    </View>
                  </View>

                  {/* Comment */}
                  {fb.comment ? (
                    <View style={s.commentBox}>
                      <Text style={s.commentText}>"{fb.comment}"</Text>
                    </View>
                  ) : (
                    <Text style={s.noComment}>Sem comentário por escrito</Text>
                  )}

                  {/* Metadata: Order & Phone */}
                  <View style={s.fbMetaRow}>
                    <View style={s.metaPill}>
                      <Ionicons name="cube-outline" size={11} color="#6B7280" />
                      <Text style={s.metaText}>Pedido #{orderCode}</Text>
                    </View>

                    {fb.customer_phone ? (
                      <View style={s.metaPill}>
                        <Ionicons name="call-outline" size={11} color="#6B7280" />
                        <Text style={s.metaText}>{fb.customer_phone}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Quick Reply Actions */}
                  <View style={s.actionRow}>
                    {fb.customer_phone ? (
                      <Pressable
                        onPress={() => handleWhatsAppReply(fb)}
                        style={s.whatsappBtn}
                      >
                        <Ionicons name="logo-whatsapp" size={14} color="#FFF" />
                        <Text style={s.whatsappBtnText}>WhatsApp</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() => handleCopyReplyTemplate(fb)}
                      style={s.copyBtn}
                    >
                      <Ionicons
                        name={copiedId === fb.id ? 'checkmark' : 'copy-outline'}
                        size={13}
                        color={copiedId === fb.id ? '#059669' : '#4B5563'}
                      />
                      <Text style={[s.copyBtnText, copiedId === fb.id && { color: '#059669' }]}>
                        {copiedId === fb.id ? 'Copiado!' : 'Copiar Resposta'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  backBtn: {
    padding: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  ifoodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ifoodBadgeText: { fontSize: 9, fontWeight: '800', color: '#B45309' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 8, backgroundColor: '#F3F4F6', borderRadius: 12 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 14, paddingBottom: 40, gap: 12 },

  reputationCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    gap: 12,
  },
  scoreTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  scoreTitle: { fontSize: 10, fontWeight: '900', color: '#9CA3AF', letterSpacing: 0.5 },
  bigScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  bigScoreNum: { fontSize: 40, fontWeight: '900', color: '#1A1A1A', letterSpacing: -1 },
  starsCol: { gap: 2 },
  starsRow: { flexDirection: 'row', gap: 2 },
  scoreSub: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },

  reputationBadgeWrap: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  reputationBadgeLabel: { fontSize: 11, fontWeight: '800', color: '#059669' },

  csatBox: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 14,
    gap: 6,
  },
  csatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  csatTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  csatTitle: { fontSize: 11, fontWeight: '800', color: '#1F2937' },
  csatTargetOk: { fontSize: 10, fontWeight: '800', color: '#059669' },
  csatTargetAlert: { fontSize: 10, fontWeight: '800', color: '#D97706' },
  csatBarBg: { height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' },
  csatBarFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 3 },

  distContainer: { gap: 4, paddingTop: 4 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distStarNum: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 22 },
  distStarLabel: { fontSize: 11, fontWeight: '800', color: '#374151' },
  progressBarBg: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FCBB00', borderRadius: 3 },
  distCountLabel: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', width: 20, textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  totalLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  totalVal: { fontSize: 13, fontWeight: '900', color: '#1A1A1A' },

  filtersContainer: { gap: 6, paddingVertical: 4 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#1A1A1A', borderColor: '#1A1A1A' },
  filterChipActiveAmber: { backgroundColor: '#FCBB00', borderColor: '#FCBB00' },
  filterChipActiveRose: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  filterChipText: { fontSize: 11, fontWeight: '800', color: '#4B5563' },
  filterChipTextActive: { color: '#FFF' },
  filterChipTextActiveDark: { color: '#1A1A1A' },

  fbCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    gap: 10,
  },
  fbHeaderRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 14, fontWeight: '900', color: '#92400E' },
  headerCustomerInfo: { flex: 1 },
  nameTimeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerName: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', flex: 1, marginRight: 6 },
  fbDate: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  starsRowWithScore: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  ratingNum: { fontSize: 11, fontWeight: '900', color: '#1A1A1A' },

  commentBox: {
    backgroundColor: '#FAF9F6',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 14,
    padding: 10,
  },
  commentText: { fontSize: 12, color: '#374151', fontStyle: 'italic', lineHeight: 18 },
  noComment: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },

  fbMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaText: { fontSize: 10, fontWeight: '700', color: '#4B5563' },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F9FAFB',
    paddingTop: 8,
    alignItems: 'center',
  },
  whatsappBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  whatsappBtnText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  copyBtnText: { color: '#4B5563', fontSize: 11, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { color: '#9CA3AF', fontWeight: '700', fontSize: 13 },
});
