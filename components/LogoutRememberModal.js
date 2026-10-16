import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import SwipeableBottomSheetModal from './SwipeableBottomSheetModal';

// Modal exibido ao clicar em "Sair", perguntando se a conta deve continuar
// disponível pro "Continuar como Fulano" do AuthBottomSheet.tsx.
//
// - onRemember: NÃO derruba a sessão real do Supabase, só sai da tela de
//   perfil. É isso que permite o "Continuar como Enzzo" entrar automático,
//   sem pedir senha, da próxima vez.
// - onForget: logout de verdade (supabase.auth.signOut()) + limpa o cache
//   local, então da próxima vez o bottom sheet cai direto no Estado A.
export default function LogoutRememberModal({ visible, onRemember, onForget, onRequestClose }) {
  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onRequestClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={styles.sheet}
      minBottomPadding={36}
      extraBottomPadding={24}
    >
      <Text style={styles.title}>Quer que sua conta seja lembrada no próximo acesso?</Text>
      <Text style={styles.description}>
        Quando você entrar novamente por este aparelho, a conta (junto com informações
        sobre pedidos e pagamentos) será lembrada.
      </Text>

      <Pressable style={styles.btnPrimary} onPress={onRemember}>
        <Text style={styles.btnPrimaryText}>Sim, lembrar minha conta</Text>
      </Pressable>

      <Pressable style={styles.btnLink} onPress={onForget}>
        <Text style={styles.btnLinkText}>Não, esquecer minha conta</Text>
      </Pressable>
    </SwipeableBottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    paddingHorizontal: SPACING[6],
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING[5],
  },
  title: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[3],
    paddingHorizontal: SPACING[2],
  },
  description: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING[6],
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 54,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  btnPrimaryText: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  btnLink: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 54,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[4],
  },
  btnLinkText: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.base,
  },
});
