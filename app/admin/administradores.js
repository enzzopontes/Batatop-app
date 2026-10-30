import ThreeDotsLoader from '../../components/ThreeDotsLoader';
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  ActivityIndicator, Alert, TextInput, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../supabaseConfig';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';
import { AdminListSkeleton } from '../../components/Skeleton';

const OWNER_EMAILS = ['enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com'];

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

function getInitials(email) {
  if (!email) return 'AD';
  const prefix = email.split('@')[0].replace(/[._-]/g, ' ');
  const parts = prefix.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function AdminAdministradores() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [currentEmail, setCurrentEmail] = useState('');
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
      'Revogar Acesso',
      `Tem certeza que deseja remover o acesso administrativo de ${targetEmail}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
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

  const isCurrentUserOwner = Boolean(
    currentEmail &&
      (OWNER_EMAILS.includes(currentEmail) ||
        admins.some((adm) => adm.is_owner === true && adm.email?.toLowerCase() === currentEmail) ||
        (admins.length > 0 && admins[0]?.email?.toLowerCase() === currentEmail))
  );

  const filteredAdmins = useMemo(() => {
    if (!searchTerm.trim()) return admins;
    const term = searchTerm.toLowerCase().trim();
    return admins.filter(
      (adm) =>
        adm.email?.toLowerCase().includes(term) ||
        adm.user_id?.toLowerCase().includes(term)
    );
  }, [admins, searchTerm]);

  const ownersCount = useMemo(() => admins.filter((a) => a.is_owner || OWNER_EMAILS.includes(a.email?.toLowerCase())).length, [admins]);
  const teamCount = admins.length - ownersCount;

  if (checkingAdmin) {
    return <AdminListSkeleton count={3} />;
  }

  return (
    <View style={s.container}>
      {/* Header — padrão iFood Partner com paleta Batata Top */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
        </Pressable>
        <View style={s.headerTitleContainer}>
          <View style={s.headerIconBg}>
            <Ionicons name="shield-checkmark" size={20} color="#C1440E" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.headerTitle}>Gestão de Acessos</Text>
              <View style={s.partnerBadge}>
                <Text style={s.partnerBadgeText}>Parceiro</Text>
              </View>
            </View>
            <Text style={s.headerSubtitle}>{admins.length} membro(s) cadastrado(s)</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#C1440E', '#E3A008']} />}
      >
        {/* Quick Stats Bar */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statLabel}>TOTAL</Text>
            <Text style={s.statValue}>{admins.length}</Text>
          </View>
          <View style={[s.statCard, s.statCardHighlight]}>
            <Text style={[s.statLabel, { color: '#92400E' }]}>DONOS</Text>
            <Text style={[s.statValue, { color: '#78350F' }]}>{ownersCount}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>ADMINS</Text>
            <Text style={s.statValue}>{teamCount < 0 ? 0 : teamCount}</Text>
          </View>
        </View>

        {/* Card: Adicionar Administrador (Apenas Donos) */}
        {isCurrentUserOwner ? (
          <View style={s.sectionCard}>
            <View style={s.sectionHeaderRow}>
              <View style={s.sectionIconCircle}>
                <Ionicons name="person-add" size={16} color="#C1440E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sectionTitle}>Convidar Administrador</Text>
                <Text style={s.sectionDesc}>Conceda privilégios de gestão para a equipe da loja.</Text>
              </View>
            </View>

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
                <ThreeDotsLoader color="#FFFFFF" dotSize={7} />
              ) : (
                <>
                  <Ionicons name="key-outline" size={16} color="#FFFFFF" />
                  <Text style={s.addBtnText}>Conceder Acesso</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={[s.sectionCard, s.ownerWarningCard]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="ribbon" size={20} color="#D97706" />
              <Text style={s.ownerWarningText}>
                Visualização protegida: apenas proprietários principais podem delegar ou revogar permissões.
              </Text>
            </View>
          </View>
        )}

        {/* Search & List Header */}
        <View style={s.listHeaderRow}>
          <Text style={s.listSectionTitle}>Membros com Acesso</Text>
          <Pressable style={s.refreshBtn} onPress={loadAdmins} disabled={loading}>
            <Ionicons name="refresh" size={14} color="#C1440E" />
            <Text style={s.refreshBtnText}>Atualizar</Text>
          </Pressable>
        </View>

        {/* Search Input */}
        <View style={s.searchContainer}>
          <Ionicons name="search" size={16} color="#9CA3AF" style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Filtrar por e-mail..."
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchTerm.length > 0 && (
            <Pressable onPress={() => setSearchTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* Admin List */}
        {loading ? (
          <View style={s.emptyContainer}>
            <ThreeDotsLoader color="#C1440E" dotSize={6} />
            <Text style={s.emptySub}>Sincronizando administradores...</Text>
          </View>
        ) : filteredAdmins.length === 0 ? (
          <View style={s.emptyContainer}>
            <Ionicons name="shield-outline" size={38} color="#D1D5DB" />
            <Text style={s.emptyTitle}>
              {searchTerm ? 'Nenhum resultado para a busca' : 'Nenhum administrador encontrado'}
            </Text>
            <Text style={s.emptySub}>
              {searchTerm
                ? 'Verifique se digitou o e-mail corretamente.'
                : 'A lista está vazia ou a tabela ainda não possui registros.'}
            </Text>
          </View>
        ) : (
          <View style={s.adminList}>
            {filteredAdmins.map((adm) => {
              const isSelf = currentEmail && adm.email?.toLowerCase() === currentEmail;
              const isOwner = adm.is_owner === true || OWNER_EMAILS.includes(adm.email?.toLowerCase());
              const isRemoving = removingEmail === adm.email;
              const initials = getInitials(adm.email);

              return (
                <View key={adm.user_id || adm.email} style={s.adminCard}>
                  <View style={s.adminInfoRow}>
                    {/* Avatar Initials Badge */}
                    <View style={[s.avatarBg, isOwner ? s.avatarOwner : s.avatarAdmin]}>
                      <Text style={[s.avatarInitials, isOwner ? s.avatarInitialsOwner : s.avatarInitialsAdmin]}>
                        {initials}
                      </Text>
                    </View>

                    <View style={s.adminTextCol}>
                      <View style={s.emailBadgeRow}>
                        <Text style={s.adminEmail} numberOfLines={1}>
                          {adm.email}
                        </Text>
                      </View>

                      {/* Status and Roles Badges */}
                      <View style={s.badgesRow}>
                        {isOwner ? (
                          <View style={s.ownerBadge}>
                            <Ionicons name="ribbon" size={10} color="#92400E" />
                            <Text style={s.ownerBadgeText}>Proprietário</Text>
                          </View>
                        ) : (
                          <View style={s.adminBadge}>
                            <Text style={s.adminBadgeText}>Administrador</Text>
                          </View>
                        )}

                        {isSelf && (
                          <View style={s.selfBadge}>
                            <Text style={s.selfBadgeText}>Você</Text>
                          </View>
                        )}

                        <View style={s.activeBadge}>
                          <View style={s.activeDot} />
                          <Text style={s.activeBadgeText}>Ativo</Text>
                        </View>
                      </View>

                      {/* Access Pills standard */}
                      <View style={s.permissionsRow}>
                        <View style={s.permChip}>
                          <Text style={s.permChipText}>
                            {isOwner ? 'Acesso Total' : 'Operação & Cardápio'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Botão Revogar Acesso */}
                    {isCurrentUserOwner && !isOwner && !isSelf && (
                      <Pressable
                        style={[s.removeBtn, isRemoving && s.btnDisabled]}
                        onPress={() => handleConfirmRemove(adm)}
                        disabled={isRemoving}
                        hitSlop={6}
                      >
                        {isRemoving ? (
                          <ThreeDotsLoader color="#DC2626" dotSize={6} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color="#DC2626" />
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
    padding: 6,
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
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  partnerBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  partnerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#666666',
    marginTop: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Stats Counters Row
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  statCardHighlight: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1A1A1A',
    marginTop: 2,
  },

  // Section Card
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  sectionDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  ownerWarningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    padding: 14,
  },
  ownerWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    flex: 1,
    lineHeight: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 42,
    fontSize: 13,
    color: '#1A1A1A',
  },
  addBtn: {
    height: 42,
    backgroundColor: '#C1440E',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#C1440E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // Search and List Headers
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
  },
  refreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C1440E',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1A1A1A',
  },

  // Admin Cards
  adminList: {
    gap: 8,
  },
  adminCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  adminInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOwner: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  avatarAdmin: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '900',
  },
  avatarInitialsOwner: {
    color: '#92400E',
  },
  avatarInitialsAdmin: {
    color: '#4B5563',
  },
  adminTextCol: {
    flex: 1,
  },
  emailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminEmail: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    flexWrap: 'wrap',
  },
  ownerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#92400E',
  },
  adminBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  selfBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#065F46',
  },
  permissionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  permChip: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  permChipText: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '500',
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    marginVertical: 10,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 6,
  },
  emptySub: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 3,
  },
});
