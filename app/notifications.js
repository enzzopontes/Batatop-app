import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

/**
 * Notifications ("Notificações")
 *
 * Lista real, vinda da tabela `notifications` (ver SQL). Mistura
 * notificações "broadcast" (user_id null, pra todo mundo) com as
 * específicas do usuário logado. Não tem nada a ver com o sistema de push
 * de admin (admin_push_tokens / notifyNewOrder.js) — são dois mundos
 * separados de propósito.
 *
 * Visto/não visto:
 * - Específica (user_id preenchido): notifications.read_at.
 * - Broadcast (user_id null): notification_reads (leitura POR USUÁRIO —
 *   read_at na linha broadcast é compartilhado entre todos, não dá pra
 *   usar). A RLS da tabela notification_reads só deixa cada usuário ver/
 *   gravar a própria leitura.
 * - Pra exibição vale: notifications.read_at OU notification_reads.read_at.
 */

// "21d", "3h", "agora" — igual ao padrão do print de referência.
function formatRelativeTime(isoDate) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m`;
  return `${Math.floor(months / 12)}a`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [userId, setUserId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadNotifications();
    }, [])
  );

  async function loadNotifications() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setUserId(null);
        return;
      }
      setUserId(user.id);

      // Traz broadcast (user_id null) + as específicas desse usuário,
      // as duas coisas cobertas pela mesma policy de select. A left join
      // em notification_reads traz o "visto" desse usuário (a RLS da
      // tabela filtra pra auth.uid() = user_id) — array vazio se a
      // notificação ainda não foi lida.
      const { data, error } = await supabase
        .from('notifications')
        .select('*, notification_reads!left(read_at)')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (e) {
      console.error('Erro ao carregar notificações:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handlePress(item) {
    if (!item.read_at && !item.notification_reads?.[0]?.read_at) {
      const now = new Date().toISOString();

      // Persiste o "visto" POR USUÁRIO — funciona pra broadcast e pra
      // específica, e não depende de policy de update na linha
      // compartilhada (broadcast).
      if (userId) {
        supabase
          .from('notification_reads')
          .upsert(
            { user_id: userId, notification_id: item.id, read_at: now },
            { onConflict: 'user_id,notification_id' },
          )
          .then(() => {});
      }

      // Específica: mantém read_at na própria linha — compatibilidade com
      // o badge do perfil e com leituras feitas por versões antigas.
      if (item.user_id) {
        supabase
          .from('notifications')
          .update({ read_at: now })
          .eq('id', item.id)
          .then(() => {});
      }

      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read_at: now } : n))
      );
    }

    if (item.link_url) {
      Linking.openURL(item.link_url).catch(() => {});
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>NOTIFICAÇÕES</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={s.centerFill}>
          <Ionicons name="notifications-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyText}>Você ainda não tem notificações</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isRead = !!(item.read_at || item.notification_reads?.[0]?.read_at);
            return (
              <Pressable
                style={[s.item, !isRead && s.itemUnread]}
                onPress={() => handlePress(item)}
              >
                {!isRead && <View style={s.unreadDot} />}

                <View style={s.iconBox}>
                  {item.icon_url ? (
                    <Image source={{ uri: item.icon_url }} style={s.iconImage} />
                  ) : (
                    <View style={s.iconFallback}>
                      <Ionicons name="megaphone-outline" size={22} color={COLORS.primary} />
                    </View>
                  )}
                </View>

                <View style={s.itemTextCol}>
                  <Text style={[s.itemTitle, isRead && s.itemTitleRead]}>{item.title}</Text>
                  <Text style={[s.itemBody, isRead && s.itemBodyRead]}>{item.body}</Text>
                </View>

                <Text style={[s.itemTime, isRead && s.itemTimeRead]}>
                  {formatRelativeTime(item.created_at)}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: COLORS.text,
    textTransform: 'uppercase',
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
  },
  emptyText: {
    marginTop: SPACING[3],
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.backgroundElevated,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[4],
    gap: SPACING[3],
  },
  itemUnread: {
    backgroundColor: COLORS.white,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  iconFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTextCol: {
    flex: 1,
  },
  itemTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
    color: COLORS.text,
  },
  itemTitleRead: {
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  itemBody: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 19,
  },
  itemBodyRead: {
    color: COLORS.textMuted,
  },
  itemTime: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  itemTimeRead: {
    color: COLORS.border,
  },
});