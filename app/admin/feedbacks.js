import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import * as Haptics from 'expo-haptics';

export default function AdminFeedbacks() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const getRatingColor = (rating) => {
    if (rating >= 4) return { text: '#059669', bg: '#D1FAE5' };
    if (rating === 3) return { text: '#D97706', bg: '#FEF3C7' };
    return { text: '#DC2626', bg: '#FEE2E2' };
  };

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Feedbacks</Text>
          <Text style={s.headerSub}>Avaliações e comentários dos clientes</Text>
        </View>
        <Pressable onPress={loadFeedbacks} style={s.refreshBtn}>
          {refreshing ? <ActivityIndicator size="small" color="#FFB800" /> : <Ionicons name="refresh-outline" size={22} color="#FFB800" />}
        </Pressable>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#FFB800" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={loadFeedbacks} colors={['#FFB800']} />
          }
        >
          {/* Stats Section */}
          <View style={s.statsContainer}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>Total</Text>
              <Text style={s.statValue}>{stats.total}</Text>
            </View>

            <View style={s.statCard}>
              <Text style={s.statLabel}>Média</Text>
              <View style={s.averageRow}>
                <Text style={[s.statValue, { color: '#FFB800' }]}>{stats.average.toFixed(1)}</Text>
                <Ionicons name="star" size={22} color="#FFB800" style={s.starIcon} />
              </View>
            </View>

            <View style={[s.statCard, { flex: 1.3 }]}>
              <View style={s.distContainer}>
                {[5, 4, 3, 2, 1].map((rating) => {
                  const pct = stats.total > 0 ? (stats.distribution[rating] / stats.total) * 100 : 0;
                  return (
                    <View key={rating} style={s.distRow}>
                      <Text style={s.distStarLabel}>{rating}★</Text>
                      <View style={s.progressBarBg}>
                        <View style={[s.progressBarFill, { width: `${pct}%` }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Feedbacks list */}
          {feedbacks.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#E5E7EB" />
              <Text style={s.emptyText}>Nenhuma avaliação recebida</Text>
            </View>
          ) : (
            feedbacks.map((fb) => {
              const colors = getRatingColor(fb.rating);
              return (
                <View key={fb.id} style={s.fbCard}>
                  <View style={[s.ratingBadge, { backgroundColor: colors.bg }]}>
                    <Text style={[s.ratingValue, { color: colors.text }]}>{fb.rating}</Text>
                    <Ionicons name="star" size={12} color={colors.text} />
                  </View>

                  <View style={s.fbContent}>
                    <View style={s.fbHeaderRow}>
                      <Text style={s.customerName} numberOfLines={1}>{fb.customer_name || 'Anônimo'}</Text>
                      <Text style={s.fbDate}>
                        {new Date(fb.created_at).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>

                    {fb.comment ? (
                      <Text style={s.commentText}>"{fb.comment}"</Text>
                    ) : (
                      <Text style={s.noComment}>Sem comentário</Text>
                    )}

                    <View style={s.fbMetaRow}>
                      <View style={s.metaItem}>
                        <Ionicons name="cube-outline" size={12} color="#9CA3AF" />
                        <Text style={s.metaText}>Pedido #{String(fb.order_id || '').slice(0, 6).toUpperCase()}</Text>
                      </View>

                      {fb.customer_phone && (
                        <View style={[s.metaItem, { marginLeft: 12 }]}>
                          <Ionicons name="call-outline" size={12} color="#9CA3AF" />
                          <Text style={s.metaText}>{fb.customer_phone}</Text>
                        </View>
                      )}
                    </View>
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
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  refreshBtn: { padding: 8 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  listContent: { padding: 16, paddingBottom: 40, gap: 12 },

  statsContainer: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 18, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 24, fontWeight: '900', color: '#1A1A1A', marginTop: 4 },
  averageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  starIcon: { marginLeft: 4, marginTop: 2 },

  distContainer: { gap: 2, justifyContent: 'center' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distStarLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', width: 16, textAlign: 'right' },
  progressBarBg: { flex: 1, height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#FFB800', borderRadius: 2 },

  fbCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 14, flexDirection: 'row', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
  ratingBadge: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 1 },
  ratingValue: { fontSize: 14, fontWeight: '900' },

  fbContent: { flex: 1 },
  fbHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  customerName: { fontSize: 14, fontWeight: '800', color: '#1A1A1A', flex: 1, marginRight: 8 },
  fbDate: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  commentText: { fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 18, backgroundColor: '#F9FAFB', padding: 10, borderRadius: 12, marginBottom: 8 },
  noComment: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginBottom: 8 },
  fbMetaRow: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },

  empty: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyText: { color: '#D1D5DB', fontWeight: '600', fontSize: 14 },
});
