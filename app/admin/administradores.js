import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, TextInput, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';

const ERROR_MESSAGES_ADD = {
  forbidden: 'Você não tem permissão para adicionar administradores.',
  invalid_email: 'E-mail inválido. Verifique o formato digitado.',
  not_found: 'Usuário não encontrado. O usuário precisa criar uma conta antes.',
  already_admin: 'Este usuário já é um administrador.',
};

const ERROR_MESSAGES_REMOVE = {
  forbidden: 'Você não tem permissão para remover administradores.',
  invalid_email: 'E-mail inválido.',
  not_admin: 'Este usuário não é um administrador.',
  owner_protected: 'O proprietário principal não pode ser removido.',
  self: 'Você não pode remover o seu próprio acesso.',
};

export default function AdminAdministradores() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [currentEmail, setCurrentEmail] = useState('');
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingEmail, setRemovingEmail] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function verify() {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      if (user?.email) {
        setCurrentEmail(user.email.toLowerCase());
      }

      const isInstant = isAdminUser(user);
      let isDb = false;
      if (!isInstant && user) {
        isDb = await checkIsAdmin(user.id);
      }

      if (!isInstant && !isDb) {
        if (mounted) {
          Alert.alert('Acesso Negado', 'Você não tem permissão para acessar esta área.');
          router.replace('/');
        }
        return;
      }

      if (mounted) {
        setCheckingAdmin(false);
        loadAdmins();
      }
    }

    verify();

    return () => {
      mounted = false;
    };
  }, []);

  const loadAdmins = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('admin_list_admins');

      if (error) {
        console.error('Erro ao listar administradores:', error);
        setAdmins([]);
      } else if (Array.isArray(data)) {
        setAdmins(data);
      } else {
        setAdmins([]);
      }
    } catch (err) {
      console.error('Erro ao buscar administradores:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadAdmins();
  };

  const handleAddAdmin = async () => {
    const emailTrimmed = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTrimmed)) {
      Alert.alert('Atenção', 'Digite um e-mail válido.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('admin_add_admin', {
        p_email: emailTrimmed,
      });

      if (error) {
        const msg = ERROR_MESSAGES_ADD[error.message] || error.message || 'Erro ao adicionar administrador.';
        Alert.alert('Erro', msg);
      } else if (data && !data.ok) {
        const code = data.error || 'unknown';
        const msg = ERROR_MESSAGES_ADD[code] || 'Não foi possível adicionar o administrador.';
        Alert.alert('Atenção', msg);
      } else {
        Alert.alert('Sucesso', `Administrador ${emailTrimmed} adicionado com sucesso!`);
        setNewEmail('');
        await loadAdmins();
      }
    } catch (err) {
      console.error('Erro ao adicionar admin:', err);
      Alert.alert('Erro', 'Não foi possível completar a operação. Tente novamente mais tarde.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRemove = (adm) => {
    const targetEmail = adm.email;
    Alert.alert(
      'Remover Administrador',
      `Tem certeza que deseja remover o acesso administrativo de ${targetEmail}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => executeRemoveAdmin(targetEmail),
        },
      ]
    );
  };

  const executeRemoveAdmin = async (targetEmail) => {
    setRemovingEmail(targetEmail);
    try {
      const { data, error } = await supabase.rpc('admin_remove_admin', {
        p_email: targetEmail,
      });

      if (error) {
        const msg = ERROR_MESSAGES_REMOVE[error.message] || error.message || 'Erro ao remover administrador.';
        Alert.alert('Erro', msg);
      } else if (data && !data.ok) {
        const code = data.error || 'unknown';
        const msg = ERROR_MESSAGES_REMOVE[code] || 'Não foi possível remover o administrador.';
        Alert.alert('Atenção', msg);
      } else {
        Alert.alert('Sucesso', `Administrador ${targetEmail} removido.`);
        await loadAdmins();
      }
    } catch (err) {
      console.error('Erro ao remover admin:', err);
      Alert.alert('Erro', 'Não foi possível completar a remoção.');
    } finally {
      setRemovingEmail(null);
    }
  };

  if (checkingAdmin) {
    return (
      <View style={[s.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const isCurrentUserOwner = Boolean(
    currentEmail &&
      (admins.some((adm) => adm.is_owner === true && adm.email?.toLowerCase() === currentEmail?.toLowerCase()) ||
        (admins.length > 0 && admins[0]?.email?.toLowerCase() === currentEmail?.toLowerCase()))
  );

  return (
    <View style={s.container}>
      {/* Header — padrão app/admin/cupons.js:348-360 */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={s.headerTitleContainer}>
          <View style={s.headerIconBg}>
            <Ionicons name="shield-checkmark" size={20} color="#4F46E5" />
          </View>
          <View>
            <Text style={s.headerTitle}>Administradores</Text>
            <Text style={s.headerSubtitle}>{admins.length} administrador(es) cadastrado(s)</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} />}
      >
        {/* Card: Adicionar Administrador (Apenas Donos) */}
        {isCurrentUserOwner ? (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Adicionar Novo Administrador</Text>
            <Text style={s.sectionDesc}>Digite o e-mail da pessoa para conceder permissões administrativas.</Text>

            <View style={s.inputContainer}>
              <Ionicons name="mail-outline" size={18} color="#9CA3AF" style={s.inputIcon} />
              <TextInput
                style={s.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="novo.administrador@email.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
              />
            </View>

            <Pressable
              style={[s.addBtn, (submitting || !newEmail.trim()) && s.btnDisabled]}
              onPress={handleAddAdmin}
              disabled={submitting || !newEmail.trim()}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="person-add" size={16} color="#FFFFFF" />
                  <Text style={s.addBtnText}>Adicionar Administrador</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={[s.sectionCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="ribbon" size={20} color="#D97706" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', flex: 1 }}>
                Apenas os proprietários principais podem adicionar ou remover administradores.
              </Text>
            </View>
          </View>
        )}

        {/* Lista de Administradores */}
        <View style={s.listHeaderRow}>
          <Text style={s.listSectionTitle}>Administradores Atuais</Text>
          <Pressable style={s.refreshBtn} onPress={loadAdmins} disabled={loading}>
            <Ionicons name="refresh" size={16} color="#4F46E5" />
            <Text style={s.refreshBtnText}>Atualizar</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={s.emptyContainer}>
            <ActivityIndicator size="small" color="#4F46E5" />
            <Text style={s.emptySub}>Carregando administradores...</Text>
          </View>
        ) : admins.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons name="shield-outline" size={42} color="#D1D5DB" />
            <Text style={s.emptyTitle}>Nenhum administrador encontrado</Text>
            <Text style={s.emptySub}>A lista está vazia ou a função no banco ainda não foi configurada.</Text>
          </View>
        ) : (
          <View style={s.adminList}>
            {admins.map((adm) => {
              const isSelf = currentEmail && adm.email?.toLowerCase() === currentEmail;
              const isOwner = adm.is_owner === true;
              const isRemoving = removingEmail === adm.email;

              return (
                <View key={adm.user_id || adm.email} style={s.adminCard}>
                  <View style={s.adminInfoRow}>
                    <View style={[s.avatarBg, isOwner ? s.avatarOwner : s.avatarAdmin]}>
                      <Ionicons
                        name={isOwner ? 'ribbon' : 'person'}
                        size={18}
                        color={isOwner ? '#D97706' : '#4F46E5'}
                      />
                    </View>

                    <View style={s.adminTextCol}>
                      <View style={s.emailBadgeRow}>
                        <Text style={s.adminEmail} numberOfLines={1}>
                          {adm.email}
                        </Text>
                      </View>

                      <View style={s.badgesRow}>
                        {isOwner && (
                          <View style={s.ownerBadge}>
                            <Ionicons name="ribbon" size={10} color="#92400E" />
                            <Text style={s.ownerBadgeText}>Dono</Text>
                          </View>
                        )}
                        {isSelf && (
                          <View style={s.selfBadge}>
                            <Text style={s.selfBadgeText}>Você</Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Botão Remover (oculto para não-donos, para o próprio dono e para si mesmo) */}
                    {isCurrentUserOwner && !isOwner && !isSelf && (
                      <Pressable
                        style={[s.removeBtn, isRemoving && s.btnDisabled]}
                        onPress={() => handleConfirmRemove(adm)}
                        disabled={isRemoving}
                      >
                        {isRemoving ? (
                          <ActivityIndicator size="small" color="#DC2626" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={16} color="#DC2626" />
                            <Text style={s.removeBtnText}>Remover</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// Estilos baseados em app/admin/index.js:438-677 e app/admin/cupons.js:573-610
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Card Adicionar
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.02,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 14,
    color: '#1A1A1A',
  },
  addBtn: {
    height: 44,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  // Lista
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  listSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
    flex: 1,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  adminList: {
    gap: 10,
  },
  adminCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  adminInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarBg: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAdmin: {
    backgroundColor: '#EEF2FF',
  },
  avatarOwner: {
    backgroundColor: '#FEF3C7',
  },
  adminTextCol: {
    flex: 1,
  },
  emailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminEmail: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  selfBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
  },
  removeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    marginVertical: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
});
