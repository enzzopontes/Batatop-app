import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SPACING } from '../../constants/theme';

/**
 * ProfileData ("Dados da conta")
 *
 * Tela-lista com as duas únicas seções da conta: Informações pessoais
 * (nome + CPF) e Informações de acesso (e-mail, telefone de acesso via
 * OTP, telefone de contato manual). NÃO tem "Anúncios e Publicidades" —
 * removido de propósito, não existe feature nenhuma disso no projeto.
 *
 * Cada item abre sua própria rota (informacoes-pessoais.js /
 * informacoes-acesso.js) — são elas as únicas responsáveis por ler/gravar
 * dado de verdade no Supabase. Esta tela aqui é só navegação.
 */
export default function ProfileData() {
  const router = useRouter();

  const items = [
    {
      title: 'Informações pessoais',
      subtitle: 'Preencha seu nome completo e CPF',
      onPress: () => router.push('/profile/informacoes-pessoais'),
    },
    {
      title: 'Informações de acesso',
      subtitle: 'Cadastre os dados e acesso de forma segura',
      onPress: () => router.push('/profile/informacoes-acesso'),
    },
  ];

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>DADOS DA CONTA</Text>
        <View style={s.backBtn} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {items.map((item, index) => (
          <View key={item.title}>
            <Pressable style={s.row} onPress={item.onPress}>
              <View style={s.rowTextCol}>
                <Text style={s.rowTitle}>{item.title}</Text>
                <Text style={s.rowSubtitle}>{item.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </Pressable>
            {index < items.length - 1 && <View style={s.divider} />}
          </View>
        ))}
      </ScrollView>
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
    paddingVertical: SPACING[4],
  },
  rowTextCol: {
    flex: 1,
  },
  rowTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSubtitle: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
});
