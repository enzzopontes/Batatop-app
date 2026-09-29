import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING } from '../../constants/theme';
import { showThemedAlert, ThemedAlertHost } from '../../components/ThemedAlert';
import { registerForUserPushNotifications } from '../../utils/userPushNotifications';

/**
 * GerenciarNotificacoes
 *
 * Dois blocos, igual ao print:
 * - Comunicações de pedidos: 1 toggle (push). Ligar de verdade pede
 *   permissão do sistema e registra o token em user_push_tokens.
 * - Comunicação de promoções: 4 toggles (push, e-mail, whatsapp, sms) —
 *   por enquanto só gravam a preferência em profiles; o disparo real
 *   dessas comunicações (campanha de e-mail, WhatsApp etc.) é outro
 *   projeto, fora do escopo daqui.
 *
 * Cada toggle salva na hora (sem botão de salvar), com rollback visual se
 * o Supabase falhar.
 */
export default function GerenciarNotificacoes() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);

  const [prefs, setPrefs] = useState({
    notify_orders_push: true,
    notify_promo_push: false,
    notify_promo_email: false,
    notify_promo_whatsapp: false,
    notify_promo_sms: false,
  });
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('notify_orders_push, notify_promo_push, notify_promo_email, notify_promo_whatsapp, notify_promo_sms')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setPrefs({
          notify_orders_push: data.notify_orders_push ?? true,
          notify_promo_push: data.notify_promo_push ?? false,
          notify_promo_email: data.notify_promo_email ?? false,
          notify_promo_whatsapp: data.notify_promo_whatsapp ?? false,
          notify_promo_sms: data.notify_promo_sms ?? false,
        });
      }
    } catch (e) {
      console.error('Erro ao carregar preferências de notificação:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(key, nextValue) {
    const previous = prefs[key];
    setPrefs((p) => ({ ...p, [key]: nextValue }));
    setSavingKey(key);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, [key]: nextValue }, { onConflict: 'id' });

      if (error) throw error;

      // Push de pedidos ligado de verdade — pede permissão e registra o
      // token. Se a permissão for negada, desliga o toggle de volta e
      // avisa (senão fica um toggle "ligado" que na prática não notifica
      // nada, o que é pior que estar desligado).
      if (key === 'notify_orders_push' && nextValue) {
        const result = await registerForUserPushNotifications(userId);
        if (result?.permissionDenied) {
          setPrefs((p) => ({ ...p, notify_orders_push: false }));
          await supabase.from('profiles').update({ notify_orders_push: false }).eq('id', userId);
          showThemedAlert(
            'Permissão necessária',
            'Ative as notificações do Batata Top nas configurações do seu celular pra receber avisos de pedido.',
          );
        }
      }
    } catch (e) {
      console.error('Erro ao salvar preferência de notificação:', e);
      setPrefs((p) => ({ ...p, [key]: previous }));
      showThemedAlert('Erro', 'Não foi possível salvar essa preferência. Tente novamente.');
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={s.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <ThemedAlertHost />

      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>GERENCIAR NOTIFICAÇÕES</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.content}>
        <Text style={s.sectionTitle}>Comunicações de pedidos</Text>
        <Text style={s.sectionSubtitle}>
          Notificações sobre os pedidos são importantes para acompanhar as etapas do seu pedido
        </Text>

        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Notificações</Text>
          <Switch
            value={prefs.notify_orders_push}
            onValueChange={(v) => handleToggle('notify_orders_push', v)}
            disabled={savingKey === 'notify_orders_push'}
            trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>

        <View style={s.divider} />

        <Text style={s.sectionTitle}>Comunicação de promoções</Text>
        <Text style={s.sectionSubtitle}>
          Mantenha ativado para receber novidades e promoções do Batata Top. Caso desative, em
          até 24 horas você deixará de recebê-las
        </Text>

        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>Notificações</Text>
          <Switch
            value={prefs.notify_promo_push}
            onValueChange={(v) => handleToggle('notify_promo_push', v)}
            disabled={savingKey === 'notify_promo_push'}
            trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>

        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>E-mail</Text>
          <Switch
            value={prefs.notify_promo_email}
            onValueChange={(v) => handleToggle('notify_promo_email', v)}
            disabled={savingKey === 'notify_promo_email'}
            trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>

        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>WhatsApp</Text>
          <Switch
            value={prefs.notify_promo_whatsapp}
            onValueChange={(v) => handleToggle('notify_promo_whatsapp', v)}
            disabled={savingKey === 'notify_promo_whatsapp'}
            trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>

        <View style={s.toggleRow}>
          <Text style={s.toggleLabel}>SMS</Text>
          <Switch
            value={prefs.notify_promo_sms}
            onValueChange={(v) => handleToggle('notify_promo_sms', v)}
            disabled={savingKey === 'notify_promo_sms'}
            trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  content: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2],
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: SPACING[4],
  },
  sectionSubtitle: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: SPACING[4],
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[3],
  },
  toggleLabel: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING[3],
  },
});
