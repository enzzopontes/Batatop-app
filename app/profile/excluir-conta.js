import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../supabaseConfig';
import { getEffectiveSession, performLogout } from '../../utils/authSession';
import { cartStore } from '../../utils/cartStore';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { showErrorAlert, showSuccessAlert } from '../../components/ThemedAlert';

const RAW_API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatop.vercel.app').trim().replace(/\/+$/, '');
const API_BASE_URL = /^https:\/\//i.test(RAW_API_BASE_URL) ? RAW_API_BASE_URL : 'https://batatatop.vercel.app';
const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractProtocol(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  if (Array.isArray(payload)) {
    return extractProtocol(payload[0]);
  }
  if (typeof payload === 'object') {
    return String(payload.protocol || payload.deletion_protocol || '').trim();
  }
  return '';
}

/**
 * ExcluirConta ("Excluir conta" — LGPD Art. 18)
 *
 * Solicita anonimização/remoção de dados pessoais e bloqueio permanente da conta.
 * Tenta primeiro a API do backend (com bloqueio em auth.users + limpeza completa)
 * e faz fallback direto para a RPC `request_account_deletion` em caso de falha de rede.
 */
export default function ExcluirConta() {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [usedFallbackRpc, setUsedFallbackRpc] = useState(false);
  const [copied, setCopied] = useState(false);

  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const keyboardPaddingStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.abs(keyboardHeight.value),
  }));

  const isConfirmed = confirmText.trim().toUpperCase() === 'EXCLUIR';
  const canSubmit = isConfirmed && !submitting;
  const completed = Boolean(protocol);

  async function requestDeletionViaRpc(trimmedReason, email) {
    const { data, error } = await supabase.rpc('request_account_deletion', {
      p_reason: trimmedReason || null,
      p_source: 'app',
      p_identifier: email || null,
    });

    if (error) {
      throw new Error(error.message || 'Não foi possível concluir a exclusão da conta.');
    }

    const rpcProtocol = extractProtocol(data);
    return rpcProtocol || `LGPD-EXC-${Date.now().toString(36).toUpperCase()}`;
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const session = await getEffectiveSession();
      if (!session?.access_token || !session?.user) {
        showErrorAlert('Sessão não encontrada. Faça login novamente para continuar.');
        return;
      }

      const trimmedReason = reason.trim();
      const userEmail = session.user.email || '';
      const userId = session.user.id;
      let resolvedProtocol = '';
      let shouldFallbackToRpc = false;

      try {
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/user/delete-data`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            identifier: userEmail,
            reason: trimmedReason,
            source: 'app',
          }),
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data?.success) {
          resolvedProtocol = extractProtocol(data);
        } else if (response.status >= 500 || response.status === 404) {
          shouldFallbackToRpc = true;
        } else {
          showErrorAlert(data?.error || 'Não foi possível processar a exclusão da conta.');
          return;
        }
      } catch {
        shouldFallbackToRpc = true;
      }

      if (shouldFallbackToRpc) {
        resolvedProtocol = await requestDeletionViaRpc(trimmedReason, userEmail);
        setUsedFallbackRpc(true);
      }

      const finalProtocol =
        resolvedProtocol || `LGPD-EXC-${Date.now().toString(36).toUpperCase()}`;

      try {
        cartStore.clearCart();
        await AsyncStorage.multiRemove([
          'batata_top_loyalty_data_v2',
          `batata_top_loyalty_data_v2_${userId}`,
          'batata_top_loyalty_data_v2_guest',
        ]);
      } catch {}

      setProtocol(finalProtocol);
      await performLogout(false);
    } catch (err) {
      showErrorAlert(
        err?.message || 'Ocorreu um erro ao processar sua solicitação. Tente novamente.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyProtocol() {
    if (!protocol) return;
    try {
      await Clipboard.setStringAsync(protocol);
      setCopied(true);
      showSuccessAlert('Protocolo copiado para a área de transferência.', 'Copiado');
    } catch {
      showErrorAlert('Não foi possível copiar o protocolo.');
    }
  }

  function handleHeaderBack() {
    if (completed) {
      router.replace('/');
    } else {
      router.back();
    }
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Pressable onPress={handleHeaderBack} hitSlop={10} style={s.backBtn} disabled={submitting}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={s.headerTitle}>EXCLUIR CONTA</Text>
        <View style={s.backBtn} />
      </View>

      {completed ? (
        <ScrollView
          contentContainerStyle={s.successContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.successIconWrap}>
            <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
          </View>

          <Text style={s.successTitle}>Solicitação concluída</Text>
          <Text style={s.successSubtitle}>
            {usedFallbackRpc
              ? 'Seus dados pessoais foram anonimizados e sua sessão foi encerrada. O bloqueio definitivo de credenciais será concluído pelo servidor.'
              : 'Seus dados pessoais foram anonimizados, sua conta foi bloqueada permanentemente e sua sessão foi encerrada em todos os dispositivos.'}
          </Text>

          <View style={s.protocolCard}>
            <Text style={s.protocolLabel}>PROTOCOLO LGPD</Text>
            <Text style={s.protocolValue} selectable>
              {protocol}
            </Text>
            <Pressable
              style={({ pressed }) => [s.copyBtn, pressed && s.btnPressed]}
              onPress={handleCopyProtocol}
            >
              <Ionicons
                name={copied ? 'checkmark-outline' : 'copy-outline'}
                size={16}
                color={COLORS.primaryText}
              />
              <Text style={s.copyBtnText}>
                {copied ? 'Protocolo copiado' : 'Copiar protocolo'}
              </Text>
            </Pressable>
          </View>

          <Text style={s.retentionFootnote}>
            Guarde este protocolo como comprovante. Registros fiscais de pedidos já realizados são
            mantidos apenas pelo prazo exigido em lei (CTN e Marco Civil da Internet).
          </Text>

          <Pressable
            style={({ pressed }) => [s.homeBtn, pressed && s.btnPressed]}
            onPress={() => router.replace('/')}
          >
            <Text style={s.homeBtnText}>Voltar ao início</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <Animated.View style={[s.flex, keyboardPaddingStyle]}>
          <ScrollView
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={s.infoCard}>
              <View style={s.infoHeader}>
                <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.secondary} />
                <Text style={s.infoTitle}>Antes de continuar</Text>
              </View>

              <Text style={s.infoIntro}>
                Ao confirmar a exclusão da sua conta (Art. 18 da LGPD), aplicaremos as ações abaixo:
              </Text>

              <View style={s.bulletList}>
                <View style={s.bulletRow}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText}>
                    Seus dados pessoais (nome, telefone, CPF, endereços salvos, cartões salvos e
                    tokens de notificação) serão anonimizados ou excluídos.
                  </Text>
                </View>

                <View style={s.bulletRow}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText}>
                    Sua conta será bloqueada permanentemente e você será desconectado de todos os
                    dispositivos.
                  </Text>
                </View>

                <View style={s.bulletRow}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText}>
                    Um número de protocolo será gerado imediatamente como comprovante da sua
                    solicitação.
                  </Text>
                </View>

                <View style={s.bulletRow}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText}>
                    Dados estritamente fiscais de pedidos serão retidos apenas pelo prazo exigido
                    por lei (Código Tributário Nacional e Marco Civil da Internet).
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Motivo (opcional)</Text>
              <TextInput
                style={[s.input, s.textarea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Se quiser, conte por que está excluindo sua conta..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                numberOfLines={3}
                maxLength={500}
                textAlignVertical="top"
                editable={!submitting}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Digite EXCLUIR para confirmar</Text>
              <TextInput
                style={s.input}
                value={confirmText}
                onChangeText={setConfirmText}
                placeholder="EXCLUIR"
                placeholderTextColor={COLORS.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!submitting}
              />
              <Text style={s.fieldHint}>
                Esta ação é definitiva e não poderá ser desfeita depois de concluída.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [
                s.submitBtn,
                !canSubmit && s.submitBtnDisabled,
                pressed && canSubmit && s.btnPressed,
              ]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={s.submitBtnText}>Excluir minha conta</Text>
              )}
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
    paddingBottom: SPACING[8],
  },
  infoCard: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    marginBottom: SPACING[5],
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: SPACING[2],
  },
  infoTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '700',
    color: COLORS.text,
  },
  infoIntro: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING[3],
  },
  bulletList: {
    gap: SPACING[2],
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[2],
  },
  bulletDot: {
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 20,
    color: COLORS.secondary,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  fieldGroup: {
    marginBottom: SPACING[4],
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING[2],
  },
  input: {
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
  },
  textarea: {
    minHeight: 88,
  },
  fieldHint: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    marginTop: SPACING[2],
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: COLORS.error || '#DC2626',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[4],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING[2],
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '700',
    color: COLORS.white,
  },
  btnPressed: {
    opacity: 0.8,
  },
  successContent: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[6],
    paddingBottom: SPACING[8],
    alignItems: 'center',
  },
  successIconWrap: {
    marginBottom: SPACING[3],
  },
  successTitle: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  successSubtitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: SPACING[5],
  },
  protocolCard: {
    width: '100%',
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    alignItems: 'center',
    marginBottom: SPACING[4],
  },
  protocolLabel: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: COLORS.warningText,
    marginBottom: SPACING[1],
  },
  protocolValue: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginBottom: SPACING[3],
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[4],
  },
  copyBtnText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '600',
    color: COLORS.primaryText,
  },
  retentionFootnote: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING[6],
  },
  homeBtn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '700',
    color: COLORS.white,
  },
});
