import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { showThemedAlert } from '../../components/ThemedAlert';

// (XX) XXXXX-XXXX enquanto digita
function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function TelefoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const inputRef = useRef(null);

  const [phone, setPhone] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [loadingChannel, setLoadingChannel] = useState(null); // 'sms' | 'whatsapp' | null
  const [banner, setBanner] = useState(null); // { type: 'error', text }

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length === 11; // DDD (2) + 9 dígitos

  // Footer acompanhando o teclado — mesmo padrão do login.js (ver
  // CLAUDE.md seção 10). Nunca usar KeyboardAvoidingView aqui.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  useEffect(() => {
    showThemedAlert('Em breve', 'Login por celular temporariamente indisponível. Use e-mail ou Google.');
    router.replace('/auth/login');
  }, [router]);

  // Foco manual com atraso — autoFocus abre o teclado no meio da
  // transição de entrada da tela (Expo Router) e desalinha o layout.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  async function handleReceberCodigo(channel) {
    setBanner({ type: 'error', text: 'Login por celular temporariamente indisponível.' });
    return;
    if (!isValid || loadingChannel) return;
    setLoadingChannel(channel);
    setBanner(null);

    const fullPhone = `+55${digits}`;

    const { error } = await supabase.auth.signInWithOtp({
      phone: fullPhone,
      // shouldCreateUser explícito — cadastro por celular sempre pode criar
      // conta nova (o e-mail obrigatório é cobrado depois, no codigo.js).
      options: { shouldCreateUser: true, channel }, // 'sms' | 'whatsapp' — precisa Twilio/Twilio Verify pro whatsapp
    });

    setLoadingChannel(null);

    if (error) {
      // Antes: navegava pro código mesmo com erro no envio. Corrigido —
      // só avança se o OTP realmente foi enviado.
      setBanner({ type: 'error', text: 'Não foi possível enviar o código. Tente novamente.' });
      return;
    }

    router.push({
      pathname: '/auth/codigo',
      params: { phone: fullPhone, channel, identifierType: 'phone' },
    });
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View
          style={[styles.content, { paddingBottom: 220, paddingTop: insets.top + 68 }]}
        >
          {banner && (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={20} color={COLORS.white} />
              <Text style={styles.bannerText}>{banner.text}</Text>
            </View>
          )}

          <Text style={styles.title}>Qual o número do seu celular?</Text>

          <View style={styles.inputRow}>
            <View style={styles.flagBox}>
              <Text style={styles.flagText}>🇧🇷 +55</Text>
            </View>
            <View style={[styles.inputWrapper, phoneFocused && styles.inputWrapperFocused]}>
              <Text style={styles.inputLabel}>Celular</Text>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="(00) 00000-0000"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                value={phone}
                onChangeText={(v) => setPhone(formatPhone(v))}
                onFocus={() => setPhoneFocused(true)}
                onBlur={() => setPhoneFocused(false)}
                maxLength={15}
              />
            </View>
          </View>
          <Text style={styles.helperText}>
            Número de acesso à conta. Por segurança, essa informação não poderá ser alterada.
          </Text>
        </View>

        <Animated.View style={[styles.footerAvoider, footerAnimatedStyle]}>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
            <Text style={styles.sectionLabel}>Como deseja receber o código?</Text>

            <TouchableOpacity
              style={[styles.btnFilled, !isValid && styles.btnDisabled]}
              disabled={!isValid || !!loadingChannel}
              onPress={() => handleReceberCodigo('whatsapp')}
            >
              {loadingChannel === 'whatsapp' ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={[styles.btnFilledText, !isValid && styles.btnTextDisabled]}>
                  Receber por WhatsApp
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnOutline, !isValid && styles.btnOutlineDisabled]}
              disabled={!isValid || !!loadingChannel}
              onPress={() => handleReceberCodigo('sms')}
            >
              {loadingChannel === 'sms' ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Text style={[styles.btnOutlineText, !isValid && styles.btnTextDisabled]}>
                  Receber por SMS
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: SPACING[6],
  },

  // ── Banner de erro ─────────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: SPACING[5],
    backgroundColor: COLORS.error,
    ...SHADOWS.sm,
  },
  bannerText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  title: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING[5],
  },

  inputRow: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  flagBox: {
    height: 55,
    paddingHorizontal: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.text,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.text,
    fontWeight: '600',
  },

  // ── Mesmo padrão do inputWrapper do login.js (label flutuante) ─────
  inputWrapper: {
    flex: 1,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  inputWrapperFocused: {
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  inputLabel: {
    position: 'absolute',
    top: -9,
    left: 12,
    backgroundColor: COLORS.white,
    paddingHorizontal: 4,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    padding: 0,
  },
  helperText: {
    marginTop: SPACING[2],
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
  },

  // ── Footer fixo acompanhando o teclado ──────────────────────────────
  footerAvoider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING[6],
    paddingTop: 12,
    paddingBottom: 26,
  },
  sectionLabel: {
    marginBottom: SPACING[3],
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
  },
  btnFilled: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  btnFilledText: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  btnOutline: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    color: COLORS.accent,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  btnDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  btnOutlineDisabled: {
    borderColor: COLORS.border,
  },
  btnTextDisabled: {
    color: COLORS.textMuted,
  },
});
