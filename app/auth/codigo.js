import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { ThemedAlertHost, showThemedAlert, hideThemedAlert } from '../../components/ThemedAlert';
import SwipeableBottomSheetModal from '../../components/SwipeableBottomSheetModal';

const RESEND_SECONDS = 59;
const SAVED_USER_KEY = '@batatatop:savedUser';

// Mesma função de persistência do login.js — mantém "continuar como {nome}"
// funcionando também pra quem entra por celular.
const persistSavedUser = async ({ name, phone, email: emailParam }) => {
  try {
    // Usa o email passado (ex: linkedEmail) se houver; senão busca da sessão.
    let email = emailParam || '';
    if (!email) {
      const { data: { session } } = await supabase.auth.getSession();
      email = session?.user?.email || '';
    }

    const userData = {
      name,
      email,
      phone,
    };

    await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(userData));
  } catch (e) {
    console.log('Falha ao salvar savedUser:', e);
  }
};

// (14) 99867-1049 — só pra exibir bonito no cabeçalho
function formatPhoneDisplay(fullPhone) {
  const digits = (fullPhone || '').replace(/\D/g, '').replace(/^55/, '');
  if (digits.length !== 11) return fullPhone;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function CodigoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone, channel, identifierType } = useLocalSearchParams(); // channel: 'sms' | 'whatsapp'

  // 'code' → digitando os 6 dígitos | 'email' → conta nova por celular,
  // precisa vincular e-mail | 'name' → pede o nome (só quando falta)
  const [step, setStep] = useState('code');
  // Qual identificador o step 'code' está verificando no momento. Começa
  // como veio da navegação (sempre 'phone' no fluxo atual, vindo do
  // telefone.js) e muda pra 'email' internamente depois que o usuário
  // vincula um e-mail — sem navegar pra outra rota, reaproveitando esta
  // mesma tela pra verificar o código do e-mail também.
  const [verifying, setVerifying] = useState(identifierType === 'email' ? 'email' : 'phone');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [focusedBox, setFocusedBox] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [loading, setLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const codeRefs = useRef([]);

  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const nameRef = useRef(null);
  const isNameValid = name.trim().length >= 2;

  // Step 'email' — conta nova por celular precisa vincular um e-mail antes
  // de liberar o nome/home. linkedEmail guarda o valor já enviado pro
  // Supabase, usado depois pra verificar o código e pra reenviar.
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [linkedEmail, setLinkedEmail] = useState('');
  const emailRef = useRef(null);
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  const phoneDisplay = formatPhoneDisplay(phone);

  useEffect(() => {
    const t = setTimeout(() => codeRefs.current[0]?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (step === 'name') {
      const t = setTimeout(() => nameRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
    if (step === 'email') {
      const t = setTimeout(() => emailRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Contador regressivo pra reenvio
  useEffect(() => {
    if (step !== 'code' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, secondsLeft]);

  const formatTime = (s) => `0:${String(s).padStart(2, '0')}`;

  async function handleResend() {
    setHelpVisible(false);
    setLoading(true);
    hideThemedAlert();

    let error;
    if (verifying === 'phone') {
      // Reenvio de código de telefone: signInWithOtp de novo (padrão original)
      ({ error } = await supabase.auth.signInWithOtp({ phone, options: { channel: channel || 'sms' } }));
    } else {
      // Reenvio de código de e-mail: usar auth.resend({ type: 'email_change' })
      // — mais confiável que updateUser de novo. Se der erro, avisa ao usuário.
      ({ error } = await supabase.auth.resend({ type: 'email_change', email: linkedEmail }));
    }

    setLoading(false);

    if (error) {
      showThemedAlert.error('Não foi possível reenviar o código. Tente novamente.');
      return;
    }

    setCode(['', '', '', '', '', '']);
    setSecondsLeft(RESEND_SECONDS);
    showThemedAlert.success('Código reenviado');
    setTimeout(() => codeRefs.current[0]?.focus(), 150);
  }

  async function verifyCode(token) {
    setLoading(true);

    let data, error;
    if (verifying === 'phone') {
      // type é sempre 'sms' pro Supabase, mesmo quando o código foi mandado
      // por WhatsApp — o "type" aqui identifica o tipo de verificação (OTP
      // de telefone), não o canal de envio.
      ({ data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' }));
    } else {
      // Verificação do código enviado pro e-mail vinculado (updateUser({
      // email }) anterior) — type 'email_change' é o correto pra confirmar
      // e-mail numa sessão que já existe, e não cria conta nova.
      ({ data, error } = await supabase.auth.verifyOtp({ email: linkedEmail, token, type: 'email_change' }));
    }

    setLoading(false);

    if (error) {
      showThemedAlert.error('Código inválido ou expirado. Tente novamente.');
      setCode(['', '', '', '', '', '']);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
      return;
    }

    const fullName = data?.user?.user_metadata?.full_name;

    if (verifying === 'phone') {
      const hasEmail = !!data?.user?.email;

      if (fullName) {
        // Conta já completa (login, não cadastro) — tanto phone quanto email e nome
        // já estão preenchidos.
        await persistSavedUser({ name: fullName, phone });
        router.replace('/');
        return;
      }

      // Conta nova ou incompleta — precisa pedir nome e/ou email.
      if (!hasEmail) {
        // Conta nova por celular (só tem phone) — e-mail ainda não foi
        // vinculado. Precisa vincular um e-mail ANTES de pedir o nome.
        // Telefone sozinho não é suficiente pro cadastro.
        hideThemedAlert();
        setCode(['', '', '', '', '', '']);
        setStep('email');
        return;
      }

      // Chegou aqui = (!fullName && hasEmail):
      // Tem e-mail já vinculado, mas falta o nome.
      // Fluxo anterior foi interrompido entre email e name, ou foi um
      // fluxo antigo que deixou email sem nome. Pula direto pro name.
      hideThemedAlert();
      setStep('name');
      return;
    }

    // verifying === 'email' — acabou de confirmar o e-mail vinculado.
    if (fullName) {
      await persistSavedUser({ name: fullName, phone, email: linkedEmail });
      router.replace('/');
      return;
    }

    hideThemedAlert();
    setStep('name');
  }

  function handleDigitChange(value, index) {
    const digits = value.replace(/[^0-9]/g, '');

    if (digits.length > 1) {
      const next = digits.slice(0, 6).split('');
      while (next.length < 6) next.push('');
      setCode(next);
      hideThemedAlert();

      const lastFilledIndex = Math.min(digits.length, 6) - 1;
      codeRefs.current[lastFilledIndex]?.focus();

      const token = next.join('');
      if (token.length === 6) verifyCode(token);
      return;
    }

    const digit = digits.slice(-1);
    const next = [...code];
    next[index] = digit;
    setCode(next);
    hideThemedAlert();

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5) {
      const token = next.join('');
      if (token.length === 6) verifyCode(token);
    }
  }

  function handleKeyPress(e, index) {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  }

  async function handleNameContinue() {
    if (!isNameValid || nameSaving) return;
    setNameSaving(true);
    const trimmedName = name.trim();

    const { error } = await supabase.auth.updateUser({
      data: { full_name: trimmedName },
    });
    setNameSaving(false);

    if (error) {
      showThemedAlert.error('Não foi possível salvar seu nome. Tente novamente.');
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    await persistSavedUser({ name: trimmedName, phone, email: linkedEmail });
    router.replace('/');
  }

  async function handleEmailContinue() {
    if (!isEmailValid || emailSaving) return;
    setEmailSaving(true);
    hideThemedAlert();
    const trimmedEmail = email.trim();

    // Vincula o e-mail na sessão já ativa (aberta via telefone) — não cria
    // conta nova. O Supabase manda o código de confirmação usando o
    // template "Change Email Address" já configurado com {{ .Token }}.
    const { error } = await supabase.auth.updateUser({ email: trimmedEmail });
    setEmailSaving(false);

    if (error) {
      // Mesmo banner de erro usado no resto do fluxo (login.js/telefone.js)
      // — só troca o texto quando o e-mail já pertence a outra conta.
      const emailAlreadyInUse =
        error.code === 'email_exists' || /already.*(registered|in use|use)/i.test(error.message || '');
      showThemedAlert.error(
        emailAlreadyInUse
          ? 'Esse e-mail já está em uso por outra conta.'
          : 'Não foi possível vincular o e-mail. Tente novamente.'
      );
      return;
    }

    setLinkedEmail(trimmedEmail);
    setVerifying('email');
    setCode(['', '', '', '', '', '']);
    setSecondsLeft(RESEND_SECONDS);
    setStep('code');
    showThemedAlert.success('Código enviado');
    setTimeout(() => codeRefs.current[0]?.focus(), 150);
  }

  // Volta pro telefone.js pra trocar o número (verifying === 'phone') ou
  // volta pro step de e-mail pra corrigir o endereço (verifying === 'email')
  // — mesmo padrão do "Alterar e-mail" do login.js.
  function handleAlterarIdentificador() {
    setHelpVisible(false);
    if (verifying === 'phone') {
      router.replace('/auth/telefone');
    } else {
      setStep('email');
      hideThemedAlert();
    }
  }

  const showResendLink = secondsLeft <= 0;

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={async () => {
          if (step === 'name' || step === 'email') {
            await supabase.auth.signOut();
            router.replace('/');
          } else {
            router.back();
          }
        }}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
      </Pressable>

      <View style={[styles.content, { paddingTop: insets.top + 64 }]}>

        {step === 'code' && (
          <>
            <Text style={styles.title}>
              {verifying === 'phone' ? (
                <>
                  Digite o código de 6 dígitos{'\n'}que enviamos por{' '}
                  <Text style={styles.titleBold}>{channelLabel}</Text> para{'\n'}
                  <Text style={styles.titleBold}>{phoneDisplay}</Text>
                </>
              ) : (
                <>
                  Digite o código de 6 dígitos{'\n'}que enviamos para{'\n'}
                  <Text style={styles.titleBold}>{linkedEmail}</Text>
                </>
              )}
            </Text>

            <View style={styles.codeRow}>
              {code.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(ref) => (codeRefs.current[index] = ref)}
                  style={[styles.codeBox, focusedBox === index && styles.codeBoxFocused]}
                  value={digit}
                  onChangeText={(v) => handleDigitChange(v, index)}
                  onKeyPress={(e) => handleKeyPress(e, index)}
                  onFocus={() => setFocusedBox(index)}
                  onBlur={() => setFocusedBox(null)}
                  keyboardType="number-pad"
                  maxLength={6}
                  selectTextOnFocus
                  editable={!loading}
                />
              ))}
            </View>

            {loading && <ActivityIndicator color={COLORS.primary} style={{ marginBottom: SPACING[4] }} />}

            {showResendLink ? (
              <TouchableOpacity onPress={() => setHelpVisible(true)}>
                <Text style={styles.resendLink}>Não recebi meu código</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.resendText}>
                Para reenviar o código, espere {formatTime(secondsLeft)}
              </Text>
            )}
          </>
        )}

        {step === 'email' && (
          <>
            <Text style={styles.title}>Qual o seu e-mail?</Text>
            <Text style={styles.helperTextEmail}>
              Sua conta foi criada por celular. Pra continuar, vincule um e-mail — ele será usado pra acessar sua conta também.
            </Text>

            <View style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}>
              <Text style={styles.inputLabel}>E-mail</Text>
              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="seuemail@exemplo.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
              />
            </View>

            <Pressable
              style={[styles.btnFilled, (!isEmailValid || emailSaving) && styles.btnDisabled]}
              disabled={!isEmailValid || emailSaving}
              onPress={handleEmailContinue}
            >
              {emailSaving ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={[styles.btnFilledText, !isEmailValid && styles.btnTextDisabled]}>
                  Continuar
                </Text>
              )}
            </Pressable>
          </>
        )}

        {step === 'name' && (
          <>
            <Text style={styles.title}>Como podemos te chamar?</Text>

            <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
              <Text style={styles.inputLabel}>Nome</Text>
              <TextInput
                ref={nameRef}
                style={styles.input}
                placeholder="Seu nome"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            <Pressable
              style={[styles.btnFilled, (!isNameValid || nameSaving) && styles.btnDisabled]}
              disabled={!isNameValid || nameSaving}
              onPress={handleNameContinue}
            >
              {nameSaving ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <Text style={[styles.btnFilledText, !isNameValid && styles.btnTextDisabled]}>
                  Continuar
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>

      <SwipeableBottomSheetModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        contentContainerStyle={{ paddingHorizontal: SPACING[6], paddingTop: 8 }}
      >
        <Text style={styles.modalTitle}>Não recebeu o código?</Text>
        <Text style={styles.modalSubtitle}>
          {verifying === 'phone'
            ? 'Verifique se o número está correto. Pode levar alguns minutos pra chegar.'
            : 'Verifique se o e-mail está correto. Pode levar alguns minutos pra chegar.'}
        </Text>
        <Text style={styles.modalPhone}>{verifying === 'phone' ? phoneDisplay : linkedEmail}</Text>

        <TouchableOpacity style={styles.modalResendBtn} onPress={handleResend}>
          <Text style={styles.modalResendBtnText}>Reenviar código</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalChangePhoneBtn} onPress={handleAlterarIdentificador}>
          <Text style={styles.modalChangePhoneText}>
            {verifying === 'phone' ? 'Alterar número' : 'Alterar e-mail'}
          </Text>
        </TouchableOpacity>
      </SwipeableBottomSheetModal>
      <ThemedAlertHost />
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
  title: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 28,
    marginBottom: SPACING[6],
  },
  titleBold: {
    fontWeight: '800',
  },
  helperTextEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 19,
    marginBottom: SPACING[5],
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACING[6],
  },
  codeBox: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  codeBoxFocused: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  resendText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.accent,
  },
  // Input "Nome" (primeiro acesso) — mesmo padrão do login.js
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: SPACING[5],
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
  btnFilled: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFilledText: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  btnDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  btnTextDisabled: {
    color: COLORS.textMuted,
  },

  // ── Bottom sheet "Não recebeu o código?" ───────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalContentWrap: {
    width: '100%',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 6,
  },
  modalPhone: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 24,
  },
  modalResendBtn: {
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalResendBtnText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalChangePhoneBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalChangePhoneText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
