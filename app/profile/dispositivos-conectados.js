import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING } from '../../constants/theme';

/**
 * DispositivosConectados
 *
 * Mostra só o APARELHO ATUAL — o projeto não tem (e essa tela não cria)
 * uma tabela de sessões históricas por dispositivo. Pra ter a lista
 * completa como no print (vários aparelhos, localização, etc.) seria
 * necessário gravar uma linha numa tabela nova toda vez que alguém loga
 * (device model, IP/geolocalização, timestamp) — decidi não criar isso
 * sem confirmar com você antes, é escopo bem maior que o resto desta
 * etapa. Se quiser esse histórico completo depois, me chama.
 *
 * "Login feito por" vem de user.app_metadata.provider (o Supabase já
 * preenche isso sozinho — 'email' ou 'phone', dependendo de como a pessoa
 * entrou da última vez).
 */

function formatRelativeTime(isoDate) {
  if (!isoDate) return 'agora';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const PROVIDER_LABELS = {
  email: 'E-mail',
  phone: 'Telefone',
};

export default function DispositivosConectados() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lastSignIn, setLastSignIn] = useState(null);
  const [provider, setProvider] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setLastSignIn(user.last_sign_in_at || null);
      setProvider(user.app_metadata?.provider || null);
    } catch (e) {
      console.error('Erro ao carregar dispositivo atual:', e);
    } finally {
      setLoading(false);
    }
  }

  const deviceName = Device.modelName || `${Platform.OS === 'ios' ? 'iPhone' : 'Android'} desconhecido`;
  const loginLabel = PROVIDER_LABELS[provider] || 'E-mail';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>SEGURANÇA</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <View style={s.content}>
          <Text style={s.title}>Sua conta foi conectada nestes dispositivos</Text>

          <View style={s.deviceRow}>
            <Ionicons name="phone-portrait-outline" size={22} color={COLORS.text} style={s.deviceIcon} />
            <View style={s.deviceTextCol}>
              <View style={s.deviceNameRow}>
                <Text style={s.deviceName}>{deviceName}</Text>
                <Text style={s.currentTag}>Dispositivo atual</Text>
              </View>
              <Text style={s.deviceMeta}>Localização desconhecida</Text>
              <Text style={s.deviceMeta}>Login feito por {loginLabel}</Text>
              <Text style={s.deviceMeta}>
                Última ação na conta há {formatRelativeTime(lastSignIn)}
              </Text>
            </View>
          </View>
          <View style={s.divider} />
        </View>
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
  },
  content: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[3],
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  deviceRow: {
    flexDirection: 'row',
    paddingVertical: SPACING[3],
    gap: SPACING[3],
  },
  deviceIcon: {
    marginTop: 2,
  },
  deviceTextCol: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  deviceName: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
  },
  currentTag: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  deviceMeta: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING[3],
  },
});
