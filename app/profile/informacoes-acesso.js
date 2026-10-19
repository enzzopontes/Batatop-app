import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING } from '../../constants/theme';
import { showThemedAlert, ThemedAlertHost } from '../../components/ThemedAlert';

/**
 * InformacoesAcesso ("Informações de acesso")
 *
 * Dois telefones DIFERENTES aqui, de propósito — não confundir:
 * - "Dados de acesso" → auth.users.phone. Vem do fluxo de login por
 *   celular (app/auth/telefone.js → app/auth/codigo.js), verificado por
 *   OTP de verdade. Só leitura aqui; pra trocar, tem que passar pelo OTP
 *   de novo (por isso "Adicionar telefone" manda pra lá).
 * - "Dados de contato" → profiles.phone. Número manual, sem verificação,
 *   só pra contato/promoções. Editável direto nesta tela.
 */

// (14) 99867-1049 — pra exibir o telefone de ACESSO (vem com DDI do Brasil
// no formato do Supabase Auth).
function formatPhoneDisplay(fullPhone) {
  const digits = (fullPhone || '').replace(/\D/g, '').replace(/^55/, '');
  if (digits.length !== 11) return fullPhone;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

// Mesma exibição, mas pro telefone de CONTATO (profiles.phone), que é
// guardado SEM DDI — não pode usar a mesma função de cima, senão um número
// com DDD 55 (RS) seria cortado por engano achando que é código de país.
function formatPhoneDisplayLocal(rawDigits) {
  const digits = (rawDigits || '').replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return rawDigits || '';
}

// (00) 00000-0000 enquanto digita — mesma máscara do telefone.js.
function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function InformacoesAcesso() {
  const router = useRouter();
  const contactInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState('');
  const [accessPhone, setAccessPhone] = useState(''); // auth.users.phone

  const [contactPhone, setContactPhone] = useState(''); // profiles.phone
  const [editingContact, setEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);
      setEmail(user.email || '');
      setAccessPhone(user.phone || '');

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle();

      setContactPhone(profileRow?.phone || '');

      // Se o usuário já verificou o telefone via OTP (auth.users.phone, do
      // fluxo telefone.js → codigo.js), pré-preenche o "Dados de contato"
      // com esse mesmo número — sem precisar digitar de novo. Só entra
      // quando profiles.phone (o contato manual, fonte de verdade) está
      // vazio. Remove o DDI +55 porque o contato é guardado sem DDI.
      if (!profileRow?.phone && user.phone) {
        const verifiedDigits = (user.phone || '').replace(/\D/g, '').replace(/^55/, '');
        setContactPhone(verifiedDigits || '');
      }
    } catch (e) {
      console.error('Erro ao carregar informações de acesso:', e);
    } finally {
      setLoading(false);
    }
  }

  function startEditContact() {
    setContactDraft(formatPhoneInput(contactPhone));
    setEditingContact(true);
    setTimeout(() => contactInputRef.current?.focus(), 50);
  }

  async function handleSaveContact() {
    const digits = contactDraft.replace(/\D/g, '');
    if (digits.length > 0 && digits.length !== 10 && digits.length !== 11) {
      showThemedAlert('Telefone inválido', 'Informe um número de telefone válido com DDD.');
      return;
    }

    setSavingContact(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, phone: digits || null }, { onConflict: 'id' });

      if (error) throw error;

      setContactPhone(digits);
      setEditingContact(false);
    } catch (e) {
      console.error('Erro ao salvar telefone de contato:', e);
      showThemedAlert('Erro', 'Não foi possível salvar o telefone. Tente novamente.');
    } finally {
      setSavingContact(false);
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
        <Text style={s.headerTitle}>INFORMAÇÕES DE ACESSO</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.content}>
        {/* Dados de acesso — usados pra login, verificados de verdade */}
        <Text style={s.sectionTitle}>Dados de acesso</Text>
        <Text style={s.sectionSubtitle}>
          Usados para acessar a conta e também para garantir mais segurança
        </Text>

        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>E-mail</Text>
          <Text style={s.fieldValueMuted}>{email}</Text>
        </View>

        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Telefone</Text>
          {accessPhone ? (
            <Text style={s.fieldValue}>{formatPhoneDisplay(accessPhone)}</Text>
          ) : (
            <Pressable style={s.linkRow} onPress={() => showThemedAlert('Em breve', 'Verificação por celular temporariamente indisponível.')}>
              <Text style={s.linkText}>Adicionar telefone</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </Pressable>
          )}
        </View>

        <View style={s.divider} />

        {/* Dados de contato — telefone manual, sem verificação por OTP */}
        <Text style={s.sectionTitle}>Dados de contato</Text>
        <Text style={s.sectionSubtitle}>
          Usados para acompanhar os pedidos e receber promoções exclusivas
        </Text>

        <View style={s.fieldBlock}>
          <Text style={s.fieldLabel}>Telefone</Text>

          {editingContact ? (
            <View style={s.editRow}>
              <TextInput
                ref={contactInputRef}
                style={s.editInput}
                value={contactDraft}
                onChangeText={(v) => setContactDraft(formatPhoneInput(v))}
                placeholder="(00) 00000-0000"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="phone-pad"
                maxLength={15}
              />
              <Pressable onPress={() => setEditingContact(false)} hitSlop={8} style={s.editIconBtn}>
                <Ionicons name="close" size={20} color={COLORS.textMuted} />
              </Pressable>
              <Pressable onPress={handleSaveContact} hitSlop={8} style={s.editIconBtn} disabled={savingContact}>
                {savingContact ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="checkmark" size={22} color={COLORS.primary} />
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable style={s.linkRow} onPress={startEditContact}>
              {contactPhone ? (
                <Text style={s.fieldValue}>{formatPhoneDisplayLocal(contactPhone)}</Text>
              ) : (
                <Text style={s.linkText}>Adicionar telefone</Text>
              )}
              <Ionicons
                name="chevron-forward"
                size={16}
                color={contactPhone ? COLORS.textMuted : COLORS.primary}
              />
            </Pressable>
          )}
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
  fieldBlock: {
    marginBottom: SPACING[4],
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  fieldValue: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
    fontWeight: '500',
  },
  fieldValueMuted: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.primary,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING[2],
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  editInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.primary,
    paddingVertical: 4,
  },
  editIconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
