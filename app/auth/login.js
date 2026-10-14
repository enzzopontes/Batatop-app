import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { supabase } from '../../supabaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS } from '../../constants/theme';
import { ThemedAlertHost, showThemedAlert } from '../../components/ThemedAlert';
import { signInWithGoogle } from '../../utils/googleAuth';

const RESEND_SECONDS = 59;
const SAVED_USER_KEY = '@batatatop:savedUser';

// Aplica a máscara 000.000.000-00 enquanto o usuário digita.
const formatCpf = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

// Validação do dígito verificador (mod-11) — confirma que o número é
// matematicamente possível, NÃO que a pessoa é titular dele (isso exigiria
// consulta paga à Receita Federal, ex: Serpro DataValid, com consentimento LGPD).
const isValidCpf = (digits) => {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calcCheckDigit = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (base.length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const digit1 = calcCheckDigit(digits.slice(0, 9));
  const digit2 = calcCheckDigit(digits.slice(0, 9) + digit1);

  return digit1 === parseInt(digits[9], 10) && digit2 === parseInt(digits[10], 10);
};

// Salva o essencial pra tela "continuar como [nome]" reconhecer o
// usuário na próxima vez que o app abrir (mesmo depois de sair/reinstalar
// e logar de novo).
const persistSavedUser = async ({ name, email, userId }) => {
  try {
    // Query profiles pra pegar telefone
    let phone = '';
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telefone')
        .eq('id', userId)
        .maybeSingle();
      phone = profile?.telefone || '';
    }

    const userData = {
      name,
      email,
      phone,
    };

    await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(userData));
  } catch (e) {
    // Falha em salvar não deve travar o login — só significa que o
    // "continuar como" não vai aparecer da próxima vez.
    console.log('Falha ao salvar savedUser:', e);
  }
};

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // 'email' → tela 1 | 'code' → tela 2 | 'name' → tela 3 (só usuário novo)
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const emailRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [banner, setBanner] = useState(null); // { type: 'error' | 'success', text }

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [focusedBox, setFocusedBox] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [helpVisible, setHelpVisible] = useState(false);
  const codeRefs = useRef([]);

  const [firstName, setFirstName] = useState('');
  const [firstNameFocused, setFirstNameFocused] = useState(false);
  const [lastName, setLastName] = useState('');
  const [lastNameFocused, setLastNameFocused] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const firstNameRef = useRef(null);
  const lastNameRef = useRef(null);

  // CPF é opcional — nunca bloqueia o fluxo, só valida o dígito
  // verificador (mod-11) pra avisar de erro de digitação, sem checar
  // titularidade (isso exigiria API paga tipo Serpro + consentimento LGPD).
  const [cpf, setCpf] = useState('');
  const [cpfFocused, setCpfFocused] = useState(false);
  const cpfRef = useRef(null);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isNameValid = firstName.trim().length >= 2 && lastName.trim().length >= 2;
  const cpfDigits = cpf.replace(/\D/g, '');
  const isCpfValid = cpfDigits.length === 0 || isValidCpf(cpfDigits);

  // Posição do footer acompanhando o teclado — via react-native-keyboard-
  // controller. Diferente do Keyboard API do RN, esse hook lê o inset do
  // teclado direto do nível nativo (WindowInsets no Android, keyboard
  // frame no iOS) a cada frame, então não depende do resize automático da
  // janela e não fica desincronizado depois de um ciclo de
  // background/foreground. `height` vem negativo (0 → -altura do teclado)
  // conforme o teclado abre.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
    // Com teclado fechado, soma insets.bottom (home indicator). Com teclado
    // aberto, encolhe pra 26 puro — senão sobra um respiro entre o botão e
    // o teclado equivalente ao insets.bottom, mesmo com o footer já
    // acompanhando o teclado via translateY.
    paddingBottom: interpolate(
      keyboardHeight.value,
      [-1, 0],
      [26, 26 + insets.bottom],
      Extrapolation.CLAMP
    ),
  }));

  // Foco automático do campo de e-mail/nome — com um pequeno atraso pra
  // deixar a transição de entrada da tela terminar antes do teclado subir.
  // Sem esse atraso, o teclado abre no meio da animação de navegação e o
  // layout (cabeçalho + footer) fica temporariamente errado até assentar.
  useEffect(() => {
    if (step === 'email') {
      const t = setTimeout(() => emailRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
    if (step === 'name') {
      const t = setTimeout(() => firstNameRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, [step]);

  // Contador regressivo pra reenvio do código
  useEffect(() => {
    if (step !== 'code' || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, secondsLeft]);

  const formatTime = (s) => `0:${String(s).padStart(2, '0')}`;

  // Banner de sucesso ("Código reenviado") some sozinho depois de 3s.
  // O de erro fica até o usuário digitar de novo (já tratado em handleDigitChange).
  useEffect(() => {
    if (banner?.type !== 'success') return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  const sendCode = async () => {
    setLoading(true);
    setBanner(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setBanner({ type: 'error', text: 'Não foi possível enviar o código. Tente novamente.' });
      return false;
    }
    return true;
  };

  const handleEmailContinue = async () => {
    if (!isEmailValid || loading) return;
    const ok = await sendCode();
    if (ok) {
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(RESEND_SECONDS);
      setStep('code');
      setBanner({ type: 'success', text: 'Código enviado' });
      setTimeout(() => codeRefs.current[0]?.focus(), 150);
    }
  };

  const handleResend = async () => {
    setHelpVisible(false);
    const ok = await sendCode();
    if (ok) {
      setCode(['', '', '', '', '', '']);
      setSecondsLeft(RESEND_SECONDS);
      setBanner({ type: 'success', text: 'Código reenviado' });
      setTimeout(() => codeRefs.current[0]?.focus(), 150);
    }
  };

  const goToHome = () => router.replace('/');

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    setGoogleLoading(false);
    if (result.success) {
      goToHome();
    } else if (!result.cancelled) {
      showThemedAlert('Erro no login', result.error || 'Não foi possível conectar com o Google.');
    }
  };

  const verifyCode = async (token) => {
    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setLoading(false);
    if (error) {
      // Código errado, expirado ou muitas tentativas — todos tratados como falha de verificação
      setBanner({ type: 'error', text: 'Algo deu errado. Tente novamente.' });
      setCode(['', '', '', '', '', '']);
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
      return;
    }

    const fullName = data?.user?.user_metadata?.full_name;

    if (fullName) {
      // Usuário já tinha nome salvo (não é o primeiro login) — grava o
      // "continuar como" e segue direto pro sucesso. refresh_token vem
      // direto da resposta do verifyOtp, sem precisar de outra chamada.
      await persistSavedUser({ name: fullName, email, userId: data?.user?.id });
      goToHome();
      return;
    }

    // Usuário novo (primeiro login) — precisa pedir o nome antes de continuar.
    setBanner(null);
    setStep('name');
  };

  const handleNameContinue = async () => {
    if (!isNameValid || nameSaving) return;
    setNameSaving(true);
    const trimmedName = `${firstName.trim()} ${lastName.trim()}`.trim();

    const { error } = await supabase.auth.updateUser({
      // cpf só entra se o usuário preencheu — campo opcional, nunca bloqueia.
      data: { full_name: trimmedName, ...(cpfDigits && { cpf: cpfDigits }) },
    });
    setNameSaving(false);

    if (error) {
      setBanner({ type: 'error', text: 'Não foi possível salvar seu nome. Tente novamente.' });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    await persistSavedUser({ name: trimmedName, email, userId: sessionData?.session?.user?.id });
    goToHome();
  };

  const handleDigitChange = (value, index) => {
    const digits = value.replace(/[^0-9]/g, '');

    // Colou o código inteiro (ex: veio do e-mail) — distribui nas 6 caixas
    // e já confirma automaticamente se completou os 6 dígitos.
    if (digits.length > 1) {
      const next = digits.slice(0, 6).split('');
      while (next.length < 6) next.push('');
      setCode(next);
      if (banner) setBanner(null);

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
    if (banner) setBanner(null);

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5) {
      const token = next.join('');
      if (token.length === 6) verifyCode(token);
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleBack = async () => {
    if (step === 'name') {
      // BUG CORRIGIDO: o verifyOtp já cria a sessão real no Supabase assim
      // que o código é confirmado — nome/CPF são só um passo posterior.
      // Sem o signOut abaixo, sair daqui deixava a sessão ativa e a pessoa
      // aparecia logada na Home sem nunca ter preenchido o nome (obrigatório).
      await supabase.auth.signOut();
      router.replace('/');
    } else if (step === 'code') {
      setStep('email');
      setBanner(null);
    } else {
      router.replace('/');
    }
  };

  // O botão "Continuar" é fixo embaixo (acompanha o teclado) e serve tanto
  // pro step de e-mail quanto pro de nome — só troca a validação/ação.
  const isFooterValid = step === 'email' ? isEmailValid : isNameValid;
  const footerLoading = step === 'email' ? loading : nameSaving;

  // Link só aparece quando o timer realmente expirou.
  // Se der erro antes disso, o texto do timer continua contando normalmente
  // (o banner de erro fica em cima, e o link só se junta a ele quando 0:00 chegar).
  const showResendLink = secondsLeft <= 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={handleBack}
        hitSlop={8}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View
          style={[
            styles.scrollContent,
            { paddingBottom: 140, paddingTop: insets.top + 68 },
          ]}
        >
          {banner && (
            <View style={[styles.banner, banner.type === 'error' ? styles.bannerError : styles.bannerSuccess]}>
              <Ionicons
                name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                size={20}
                color={COLORS.white}
              />
              <Text style={styles.bannerText}>{banner.text}</Text>
            </View>
          )}

          {step === 'email' && (
            <>
              <Text style={styles.title}>Qual o seu e-mail?</Text>

              <View
                style={[styles.inputWrapper, emailFocused && styles.inputWrapperFocused]}
              >
                <Text style={styles.inputLabel}>E-mail</Text>
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="E-mail"
                  placeholderTextColor="#999"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
                {email.length > 0 && (
                  <TouchableOpacity onPress={() => setEmail('')} style={styles.clearBtn}>
                    <Ionicons name="close-circle" size={18} color="#999" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.oauthDivider}>
                <View style={styles.oauthLine} />
                <Text style={styles.oauthDividerText}>ou</Text>
                <View style={styles.oauthLine} />
              </View>

              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleLogin}
                activeOpacity={0.8}
                disabled={googleLoading || loading}
              >
                {googleLoading ? (
                  <ActivityIndicator color={COLORS.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color={COLORS.text} style={styles.googleIcon} />
                    <Text style={styles.googleButtonText}>Continuar com Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {step === 'code' && (
            <>
              <Text style={styles.title}>
                Digite o código de 6 dígitos{'\n'}que enviamos para{'\n'}
                <Text style={styles.titleBold}>{email}</Text>
              </Text>

              <View style={styles.codeRow}>
                {code.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(ref) => (codeRefs.current[index] = ref)}
                    style={[
                      styles.codeBox,
                      focusedBox === index && styles.codeBoxFocused,
                    ]}
                    value={digit}
                    onChangeText={(v) => handleDigitChange(v, index)}
                    onKeyPress={(e) => handleKeyPress(e, index)}
                    onFocus={() => setFocusedBox(index)}
                    onBlur={() => setFocusedBox(null)}
                    keyboardType="number-pad"
                    maxLength={6}
                    selectTextOnFocus
                  />
                ))}
              </View>

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

          {step === 'name' && (
            <>
              <Text style={[styles.title, styles.titleCompact]}>Complete as informações da sua conta</Text>
              <Text style={styles.subtitle}>
                Cadastre seus dados para identificação na loja e maior segurança da conta
              </Text>

              <Text style={styles.sectionLabel}>Qual o seu nome e sobrenome?</Text>

              <View
                style={[styles.plainInput, firstNameFocused && styles.plainInputFocused]}
              >
                <TextInput
                  ref={firstNameRef}
                  style={styles.input}
                  placeholder="Nome"
                  placeholderTextColor="#999"
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={() => setFirstNameFocused(true)}
                  onBlur={() => setFirstNameFocused(false)}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                />
              </View>

              <View
                style={[styles.plainInput, lastNameFocused && styles.plainInputFocused]}
              >
                <TextInput
                  ref={lastNameRef}
                  style={styles.input}
                  placeholder="Sobrenome"
                  placeholderTextColor="#999"
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={() => setLastNameFocused(true)}
                  onBlur={() => setLastNameFocused(false)}
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => cpfRef.current?.focus()}
                />
              </View>

              <Text style={[styles.sectionLabel, styles.cpfSectionLabel]}>Qual seu CPF?</Text>

              <View
                style={[
                  styles.plainInput,
                  cpfFocused && styles.plainInputFocused,
                  !isCpfValid && styles.plainInputError,
                ]}
              >
                <TextInput
                  ref={cpfRef}
                  style={styles.input}
                  placeholder="CPF (opcional)"
                  placeholderTextColor="#999"
                  value={cpf}
                  onChangeText={(v) => setCpf(formatCpf(v))}
                  onFocus={() => setCpfFocused(true)}
                  onBlur={() => setCpfFocused(false)}
                  keyboardType="number-pad"
                  maxLength={14}
                  returnKeyType="done"
                  onSubmitEditing={handleNameContinue}
                />
              </View>
              {!isCpfValid && (
                <Text style={styles.cpfErrorText}>CPF inválido — confira os números</Text>
              )}
            </>
          )}
        </View>

        {(step === 'email' || step === 'name') && (
          <View style={styles.footerAvoider}>
            <Animated.View style={[styles.footer, footerAnimatedStyle]}>
              {step === 'email' ? (
                <Text style={styles.helperText}>
                  Enviaremos comunicações sobre sua conta neste e-mail. Pra cancelar a inscrição acesse 'Configurações'.
                </Text>
              ) : (
                <>
                  <Text style={styles.termsText}>
                    Ao continuar, você concorda com os{' '}
                    <Text style={styles.termsLink}>Termos de Uso</Text> e está ciente da{' '}
                    <Text style={styles.termsLink}>Declaração de Privacidade</Text>
                  </Text>
                </>
              )}
              <TouchableOpacity
                style={[
                  styles.continueButton,
                  isFooterValid ? styles.continueButtonActive : styles.continueButtonDisabled,
                ]}
                onPress={step === 'email' ? handleEmailContinue : handleNameContinue}
                disabled={!isFooterValid || footerLoading}
              >
                {footerLoading ? (
                  <ActivityIndicator color={isFooterValid ? COLORS.text : '#AAAAAA'} />
                ) : (
                  <Text
                    style={[
                      styles.continueButtonText,
                      isFooterValid ? styles.continueButtonTextActive : styles.continueButtonTextDisabled,
                    ]}
                  >
                    {step === 'email' ? 'Continuar' : 'Criar conta'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </View>

      <Modal
        visible={helpVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setHelpVisible(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Não recebeu o código?</Text>
            <Text style={styles.modalSubtitle}>
              Verifique se digitou o e-mail corretamente. Talvez o código esteja na sua caixa de spam.
            </Text>
            <Text style={styles.modalEmail}>{email}</Text>

            <TouchableOpacity style={styles.modalResendBtn} onPress={handleResend}>
              <Text style={styles.modalResendBtnText}>Reenviar código</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalChangeEmailBtn}
              onPress={() => {
                setHelpVisible(false);
                setStep('email');
                setBanner(null);
              }}
            >
              <Text style={styles.modalChangeEmailText}>Alterar e-mail</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ThemedAlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
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

  // ── Banners de status ──────────────────────────────────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    ...SHADOWS.sm,
  },
  bannerError: {
    backgroundColor: COLORS.error,
  },
  bannerSuccess: {
    backgroundColor: COLORS.success,
  },
  bannerText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },

  // ── Título ─────────────────────────────────────────────────────────
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 30,
    marginBottom: 36,
  },
  titleBold: {
    fontWeight: '800',
  },
  titleCompact: {
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 28,
  },

  // ── Input de e-mail / nome (label flutuante estilo outline) ────────
  inputWrapper: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.text,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  inputWrapperFocused: {
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  cpfErrorText: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 6,
    marginBottom: 4,
  },
  oauthDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  oauthLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  oauthDividerText: {
    marginHorizontal: 12,
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },

  // ── Section label + inputs sem label flutuante (Nome/Sobrenome/CPF) ─
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  cpfSectionLabel: {
    marginTop: 8,
  },
  plainInput: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  plainInputFocused: {
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  plainInputError: {
    borderColor: COLORS.error,
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
  clearBtn: {
    marginLeft: 8,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  termsText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 16,
  },
  termsLink: {
    color: COLORS.text,
    fontWeight: '700',
  },

  // ── Footer fixo do botão continuar (acompanha o teclado) ───────────
  footerAvoider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footer: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
    paddingTop: 12,
  },

  // ── Botão continuar ────────────────────────────────────────────────
  continueButton: {
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonActive: {
    backgroundColor: COLORS.primary,
  },
  continueButtonDisabled: {
    backgroundColor: COLORS.backgroundElevated,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  continueButtonTextActive: {
    color: COLORS.text,
  },
  continueButtonTextDisabled: {
    color: COLORS.textMuted,
  },

  // ── Caixas de código (6 dígitos) ───────────────────────────────────
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  codeBox: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
  },
  codeBoxFocused: {
    borderWidth: 2,
    borderColor: COLORS.text,
  },
  resendText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  resendLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.secondary,
  },

  // ── Bottom sheet "Não recebeu o código?" ───────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
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
  modalEmail: {
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
  modalChangeEmailBtn: {
    paddingVertical: 4,
  },
  modalChangeEmailText: {
    color: COLORS.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
});
