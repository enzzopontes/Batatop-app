import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SPACING } from '../../constants/theme';

/**
 * ProfileSecurity ("Segurança")
 *
 * - Dispositivos conectados → /profile/dispositivos-conectados (mostra só o
 *   aparelho atual — não existe tabela de sessão histórica no projeto).
 */
export default function ProfileSecurity() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>SEGURANÇA</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.content}>
        <Pressable style={s.row} onPress={() => router.push('/profile/dispositivos-conectados')}>
          <Text style={s.rowTitle}>Dispositivos conectados</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
        </Pressable>
        <View style={s.divider} />
      </View>
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
  content: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[4],
  },
  rowTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
});