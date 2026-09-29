import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { showThemedAlert, ThemedAlertHost } from '../../components/ThemedAlert';

// Máscara 000.000.000-00 enquanto digita.
function formatCPF(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Validação de verdade — dígitos verificadores do CPF, não só tamanho.
function isValidCPF(raw) {
  const cpf = raw.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // 000.000.000-00, 111.111.111-11, etc.

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let check1 = 11 - (sum % 11);
  if (check1 >= 10) check1 = 0;
  if (check1 !== parseInt(cpf[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let check2 = 11 - (sum % 11);
  if (check2 >= 10) check2 = 0;
  if (check2 !== parseInt(cpf[10], 10)) return false;

  return true;
}

export default function InformacoesPessoais() {
  const router = useRouter();
  const cpfRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [cpfTouched, setCpfTouched] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // profiles é a fonte principal (mesma tabela que o site usa).
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name, cpf')
        .eq('id', user.id)
        .maybeSingle();

      // Nome REAL vem do cadastro (user_metadata.full_name — é onde
      // login.js/codigo.js gravam no momento da criação da conta).
      // profiles.full_name pode estar com dado errado (ex: e-mail gravado
      // por trigger antigo), então user_metadata tem prioridade. profiles
      // só cobre usuários sem nome no metadata.
      setName(user.user_metadata?.full_name || profileRow?.full_name || '');
      // Se profiles.cpf ainda não tiver sido preenchido (usuário cadastrado
      // antes dessa tela existir), cai pro CPF que já foi coletado no
      // cadastro (user_metadata.cpf).
      const rawCpf = profileRow?.cpf || user.user_metadata?.cpf || '';
      setCpf(formatCPF(rawCpf));
    } catch (e) {
      console.error('Erro ao carregar informações pessoais:', e);
    } finally {
      setLoading(false);
    }
  }

  const cpfDigits = cpf.replace(/\D/g, '');
  const cpfError = cpfTouched && cpfDigits.length > 0 && !isValidCPF(cpf);
  const isNameValid = name.trim().length > 0;
  const canSave = isNameValid && (cpfDigits.length === 0 || isValidCPF(cpf)) && !saving;

  async function handleUpdate() {
    if (!isNameValid) {
      showThemedAlert('Atenção', 'Por favor, informe seu nome completo.');
      return;
    }
    if (cpfDigits.length > 0 && !isValidCPF(cpf)) {
      setCpfTouched(true);
      showThemedAlert('CPF inválido', 'Insira um número de CPF válido ou deixe o campo em branco.');
      return;
    }

    setSaving(true);
    try {
      const trimmedName = name.trim();

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: userId, full_name: trimmedName, cpf: cpfDigits || null }, { onConflict: 'id' });

      if (profileError) throw profileError;

      // Mantém user_metadata.cpf sincronizado — o cadastro ainda lê daqui.
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: trimmedName, cpf: cpfDigits || null },
      });
      if (authError) throw authError;

      showThemedAlert('Sucesso', 'Suas informações foram atualizadas!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error('Erro ao salvar informações pessoais:', e);
      showThemedAlert('Erro', 'Não foi possível salvar suas informações. Tente novamente.');
    } finally {
      setSaving(false);
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
        <Text style={s.headerTitle}>INFORMAÇÕES PESSOAIS</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.content}>
        <View style={s.inputWrapper}>
          <Text style={s.inputLabel}>Nome completo</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="Seu nome completo"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => cpfRef.current?.focus()}
          />
          {!!name && (
            <Pressable onPress={() => setName('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>

        <View
          style={[
            s.inputWrapper,
            s.inputWrapperMarginTop,
            cpfError && s.inputWrapperError,
          ]}
        >
          <Text style={[s.inputLabel, cpfError && s.inputLabelError]}>CPF</Text>
          <TextInput
            ref={cpfRef}
            style={s.input}
            value={cpf}
            onChangeText={(v) => setCpf(formatCPF(v))}
            onBlur={() => setCpfTouched(true)}
            placeholder="000.000.000-00"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            maxLength={14}
          />
        </View>
        {cpfError && (
          <View style={s.errorRow}>
            <Ionicons name="alert-circle" size={16} color={COLORS.primary} />
            <Text style={s.errorText}>Insira um número de CPF válido.</Text>
          </View>
        )}
      </View>

      <View style={s.footer}>
        <Pressable
          style={[s.btnFilled, !canSave && s.btnDisabled]}
          disabled={!canSave}
          onPress={handleUpdate}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.text} />
          ) : (
            <Text style={[s.btnFilledText, !canSave && s.btnTextDisabled]}>Atualizar</Text>
          )}
        </Pressable>
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
    paddingTop: SPACING[3],
  },
  inputWrapper: {
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
  inputWrapperMarginTop: {
    marginTop: SPACING[5],
  },
  inputWrapperError: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
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
  inputLabelError: {
    color: COLORS.primary,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    padding: 0,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING[2],
  },
  errorText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[6],
    paddingTop: SPACING[3],
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
});
