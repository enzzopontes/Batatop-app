import { View, Text, ScrollView, StyleSheet, Pressable, Image, Alert, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useScrollHandler, useHeaderHeight } from './_layout';
import { getPreferredPaymentMethod, setPreferredPaymentMethod, getPreferredCardId, setPreferredCardId } from '../utils/paymentPrefs';
import { formatCardDisplay } from '../utils/usePaymentCards';
import { SOFT_LOGOUT_KEY, emitAuthUiChange, getEffectiveSession } from '../utils/authSession';
import PaymentMethodModal from '../components/PaymentMethodModal';
import LogoutRememberModal from '../components/LogoutRememberModal';
import { requestAuthSheet } from '../utils/authSheetRequest';
import ProfileAccordionItem from '../components/ProfileAccordionItem';
import ProfileSuccessToast from '../components/ProfileSuccessToast';
import { isAdminUser, checkIsAdmin } from '../utils/isAdmin';

// Precisa ser IGUAL à SAVED_USER_KEY de components/AuthBottomSheet.tsx
const SAVED_USER_KEY = '@batatatop:savedUser';

// Mesma máscara usada no cadastro (app/auth/login.js) — só pra exibição.
const formatCpfDisplay = (digits) => {
  if (!digits) return '';
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

export default function Profile() {
  const router = useRouter();
  const { onScroll, resetHeader } = useScrollHandler();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [defaultAddress, setDefaultAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [selectedCardInfo, setSelectedCardInfo] = useState(null);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  // Tela de perfil deslogado (soft logout) — toast de "histórico limpo",
  // só usado no bloco `if (!user)` abaixo. O AuthBottomSheet é o global
  // de _layout.js (via requestAuthSheet()).
  const [historyToastVisible, setHistoryToastVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      resetHeader();
      checkUser();
    }, [resetHeader])
  );

  async function checkUser() {
    try {
      setIsAdmin(false);
      // getEffectiveSession() já cobre a checagem do soft-logout — retorna
      // null se a flag estiver ligada, mesmo com a sessão real ativa.
      const session = await getEffectiveSession();
      const u = session?.user || null;
      setUser(u);

      if (u) {
        // Checagem de Administrador
        const instantAdmin = isAdminUser(u);
        setIsAdmin(instantAdmin);
        if (!instantAdmin) {
          checkIsAdmin(u.id).then(res => {
            setIsAdmin(res);
          });
        }
        // Buscar endereço padrão
        const { data: addr } = await supabase
          .from('addresses')
          .select('id, street, number, neighborhood, city, is_default')
          .eq('user_id', u.id)
          .eq('is_default', true)
          .maybeSingle();

        if (addr) {
          setDefaultAddress(addr);
        } else {
          // Se não houver padrão, buscar o mais recente
          const { data: latest } = await supabase
            .from('addresses')
            .select('id, street, number, neighborhood, city, is_default')
            .eq('user_id', u.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          setDefaultAddress(latest || null);
        }

        // Carregar forma de pagamento salva
        const savedMethod = await getPreferredPaymentMethod();
        if (savedMethod) {
          setPaymentMethod(savedMethod);
        }
        const savedCardId = await getPreferredCardId();
        if (savedCardId) {
          setSelectedCardId(savedCardId);
          const { data: cardData } = await supabase
            .from('payment_cards')
            .select('*')
            .eq('id', savedCardId)
            .maybeSingle();
          setSelectedCardInfo(cardData || null);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do perfil:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteAddress = async (id) => {
    Alert.alert('Excluir Endereço', 'Tem certeza que deseja remover este endereço?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('addresses').delete().eq('id', id);
          if (!error) {
            setDefaultAddress(null);
            checkUser();
          }
        }
      }
    ]);
  };

  const handleSelectSimpleMethod = async (method) => {
    try {
      await setPreferredPaymentMethod(method);
      await setPreferredCardId(null);
      setPaymentMethod(method);
      setSelectedCardId(null);
      setSelectedCardInfo(null);
      setPaymentModalVisible(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectCard = async (card) => {
    try {
      await setPreferredPaymentMethod(card.card_type);
      await setPreferredCardId(card.id);
      setPaymentMethod(card.card_type);
      setSelectedCardId(card.id);
      setSelectedCardInfo(card);
      setPaymentModalVisible(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const handleRememberAccount = async () => {
    setLogoutModalVisible(false);
    console.log('🚪 ===== handleRememberAccount INICIADO =====', new Date().toISOString());
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;

      if (u?.id) {
        // Query profiles pra dados completos (telefone + full_name)
        const { data: profile } = await supabase
          .from('profiles')
          .select('telefone, full_name')
          .eq('id', u.id)
          .maybeSingle();

        // Monta userData só pra exibição ("Continuar como [nome]") — não
        // guarda mais refreshToken: a sessão real nunca é destruída, então
        // não tem token nenhum pra restaurar depois.
        const userData = {
          name: profile?.full_name || u?.user_metadata?.full_name || 'Usuário',
          email: u?.email || '',
          phone: profile?.telefone || '',
        };

        await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(userData));
        console.log('💾 Dados de exibição salvos:', userData);
      } else {
        console.log('❌ Sem user.id — nada foi salvo');
      }
    } catch (e) {
      console.error('Erro ao guardar sessão pra lembrar conta:', e);
    }

    // ⚠️ NÃO chama supabase.auth.signOut() aqui — qualquer scope revoga a
    // sessão atual no servidor, o que mataria o próprio acesso que
    // "Continuar como" precisa reaproveitar depois. Em vez disso, só liga
    // a flag de logout visual; a sessão real do Supabase continua ativa e
    // sendo renovada sozinha em background (autoRefreshToken: true).
    await AsyncStorage.setItem(SOFT_LOGOUT_KEY, 'true');
    console.log('👻 Soft-logout ativado — sessão real do Supabase continua viva');
    emitAuthUiChange();
    router.replace('/');
  };

  const handleForgetAccount = async () => {
    setLogoutModalVisible(false);
    // Sem scope = 'global' (padrão): revoga a sessão de verdade no servidor.
    // Aqui é o logout de verdade, então isso é o comportamento certo.
    await supabase.auth.signOut();
    try {
      await AsyncStorage.multiRemove([SAVED_USER_KEY, SOFT_LOGOUT_KEY]);
    } catch (e) {
      console.error('Erro ao limpar usuário local:', e);
    }
    emitAuthUiChange();
    router.replace('/');
  };

  const getPaymentLabel = (method) => {
    if ((method === 'cartão de crédito' || method === 'cartão de débito') && selectedCardInfo) {
      return formatCardDisplay(selectedCardInfo);
    }
    const map = {
      pix: 'PIX',
      dinheiro: 'Dinheiro',
      'cartão de crédito': 'Cartão de Crédito',
      'cartão de débito': 'Cartão de Débito'
    };
    return map[method] || method;
  };

  // Página que só faz sentido logado: se não tiver `user`, abre o
  // AuthBottomSheet em vez de navegar. Usado por Notificações e Endereços
  // no bloco `if (!user)` abaixo.
  const requireAuth = (action) => {
    if (user) {
      action();
    } else {
      requestAuthSheet();
    }
  };

  const handleClearHistory = () => {
    // Limpar histórico local não precisa de login.
    // TODO: limpar o histórico de busca de verdade aqui (AsyncStorage/estado)
    setHistoryToastVisible(true);
  };

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#FFB800" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={sg.container}>
        <ProfileSuccessToast
          visible={historyToastVisible}
          message="Histórico limpo com sucesso"
          onHide={() => setHistoryToastVisible(false)}
        />

        <ScrollView
          contentContainerStyle={[sg.scrollContent, { paddingTop: insets.top + 10 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={sg.headerRow}>
            <Text style={sg.headerText}>Falta pouco para matar sua fome!</Text>
            <View style={sg.illustrationWrapper}>
              <Image
                source={require('../assets/bolsaprofile.png')}
                style={sg.illustration}
                resizeMode="contain"
              />
            </View>
          </View>

          <Pressable style={sg.loginButton} onPress={() => requestAuthSheet()}>
            <Text style={sg.loginButtonText}>Entrar ou cadastrar-se</Text>
          </Pressable>

          {/* Notificações — sem accordion, abre a page direto (gated) */}
          <Pressable
            style={sg.simpleRow}
            onPress={() => requireAuth(() => router.push('/notifications'))}
          >
            <View style={sg.iconBox}>
              <Ionicons name="notifications-outline" size={19} color="#7A7A7A" />
            </View>
            <Text style={sg.simpleRowTitle}>Notificações</Text>
            <Ionicons name="chevron-forward" size={15} color="#B0B0B0" />
          </Pressable>
          <View style={sg.divider} />

          {/* Conta -> só Endereços */}
          <ProfileAccordionItem
            icon="person-outline"
            title="Conta"
            subtitle="Endereços"
            items={[
              {
                label: 'Endereços',
                onPress: () => router.push('/addresses'),
              },
            ]}
          />

          {/* Configurações -> só Limpar histórico de busca */}
          <ProfileAccordionItem
            icon="settings-outline"
            title="Configurações"
            subtitle="Limpar histórico de busca"
            items={[
              { label: 'Limpar histórico de busca', onPress: handleClearHistory },
            ]}
          />

          {/* Ajuda e Termos */}
          <ProfileAccordionItem
            icon="help-circle-outline"
            title="Ajuda e Termos"
            subtitle="Central de ajuda, termos de uso e políticas"
            items={[
              { label: 'Ajuda', onPress: () => router.push('/ajuda') },
              { label: 'Termos de Uso', onPress: () => router.push({ pathname: '/ajuda/artigo/termos-de-uso', params: { headerTitle: 'TERMOS DE USO' } }) },
              { label: 'Política de Privacidade', onPress: () => router.push({ pathname: '/ajuda/artigo/declaracao-de-privacidade', params: { headerTitle: 'DECLARAÇÃO DE PRIVACIDADE' } }) },
            ]}
          />

          <Text style={sg.versionText}>Batata Top v2.2.0</Text>
        </ScrollView>

      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: headerHeight, paddingBottom: 60 }}
      >
        {/* Banner amarelo superior decorativo */}
        <View style={s.yellowBanner} />

        {/* Card do Perfil do Usuário */}
        <View style={s.userCard}>
          <View style={s.avatarWrapper}>
            <Image
              source={{ uri: user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/png?seed=${user?.email || 'Guest'}` }}
              style={s.avatarImage}
            />
          </View>
          <Text style={s.userName}>{user?.user_metadata?.full_name || 'Usuário Batatop'}</Text>
          <View style={s.emailRow}>
            <Ionicons name="mail-outline" size={14} color="#999" />
            <Text style={s.userEmail}>{user?.email}</Text>
          </View>
          {!!user?.user_metadata?.cpf && (
            <View style={s.cpfRow}>
              <Ionicons name="card-outline" size={14} color="#999" />
              <Text style={s.userCpf}>{formatCpfDisplay(user.user_metadata.cpf)}</Text>
            </View>
          )}
        </View>

        {/* Seção Dados e Segurança */}
        <View style={s.sectionCard}>
          {/* Meus Dados */}
          <Pressable style={s.menuItem} onPress={() => router.push('/profile-data')}>
            <View style={[s.menuIconBg, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="settings-outline" size={20} color="#A855F7" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemLabel}>Meus Dados</Text>
              <Text style={s.menuItemSub}>Nome, telefone e mais</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
          </Pressable>

          <View style={s.menuDivider} />

          {/* Segurança */}
          <Pressable style={s.menuItem} onPress={() => router.push('/profile-security')}>
            <View style={[s.menuIconBg, { backgroundColor: '#E2E8F0' }]}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748B" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemLabel}>Segurança</Text>
              <Text style={s.menuItemSub}>Senha e privacidade</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
          </Pressable>
        </View>

        {/* Seção Endereços */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeaderRow}>
            <View style={s.sectionHeaderLeft}>
              <View style={[s.menuIconBg, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="location-outline" size={20} color="#D97706" />
              </View>
              <View style={s.menuItemTextCol}>
                <Text style={s.menuItemLabel}>Meus Endereços</Text>
                <Text style={s.menuItemSub}>Onde entregamos suas batatas</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push('/addresses')} style={s.addBtn}>
              <Text style={s.addBtnText}>+ Adicionar</Text>
            </Pressable>
          </View>

          {defaultAddress ? (
            <View style={s.addressCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.addressStreet}>
                  {defaultAddress.street}, {defaultAddress.number}
                </Text>
                <Text style={s.addressSub}>
                  {defaultAddress.neighborhood} - {defaultAddress.city}
                </Text>
                <Text style={s.patternLabel}>PADRÃO</Text>
              </View>
              <Pressable onPress={() => handleDeleteAddress(defaultAddress.id)} style={s.trashBtn}>
                <Ionicons name="trash-outline" size={18} color="#CCCCCC" />
              </Pressable>
            </View>
          ) : (
            <Text style={s.noAddressText}>Nenhum endereço cadastrado</Text>
          )}
        </View>

        {/* Seção Pedidos, Ajuda e Pagamento */}
        <View style={s.sectionCard}>
          {/* Formas de Pagamento */}
          <Pressable style={s.menuItem} onPress={() => setPaymentModalVisible(true)}>
            <View style={[s.menuIconBg, { backgroundColor: '#FFE4E6' }]}>
              <Ionicons name="card-outline" size={20} color="#F43F5E" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemLabel}>Forma de Pagamento Preferida</Text>
              <Text style={s.menuItemSub}>Principal: {getPaymentLabel(paymentMethod)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
          </Pressable>

          <View style={s.menuDivider} />

          {/* Meus Pedidos */}
          <Pressable style={s.menuItem} onPress={() => router.push('/pedidos')}>
            <View style={[s.menuIconBg, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="cube-outline" size={20} color="#3B82F6" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemLabel}>Meus Pedidos</Text>
              <Text style={s.menuItemSub}>Histórico de compras</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
          </Pressable>

          <View style={s.menuDivider} />

          {/* Ajuda */}
          <Pressable style={s.menuItem} onPress={() => router.push('/ajuda')}>
            <View style={[s.menuIconBg, { backgroundColor: '#FFF3D6' }]}>
              <Ionicons name="help-circle-outline" size={20} color="#E3A008" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={s.menuItemLabel}>Ajuda</Text>
              <Text style={s.menuItemSub}>Dúvidas e suporte</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
          </Pressable>
        </View>

        {/* Painel Administrativo (Exclusivo para admins) */}
        {isAdmin && (
          <View style={s.sectionCard}>
            <Pressable style={s.menuItem} onPress={() => router.push('/admin')}>
              <View style={[s.menuIconBg, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="shield-half-outline" size={20} color="#D97706" />
              </View>
              <View style={s.menuItemTextCol}>
                <Text style={s.menuItemLabel}>Painel Administrativo</Text>
                <Text style={s.menuItemSub}>Gerencie seus pedidos e operações</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
            </Pressable>
          </View>
        )}

        {/* Botão Sair */}
        <View style={s.sectionCard}>
          <Pressable style={s.menuItem} onPress={handleLogout}>
            <View style={[s.menuIconBg, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            </View>
            <View style={s.menuItemTextCol}>
              <Text style={[s.menuItemLabel, { color: '#EF4444' }]}>Sair da conta</Text>
            </View>
          </Pressable>
        </View>

        <Text style={s.versionText}>Batata Top v2.2.0</Text>
      </ScrollView>

      {/* Modal para seleção de Forma de Pagamento */}
      <PaymentMethodModal
        visible={paymentModalVisible}
        onClose={() => setPaymentModalVisible(false)}
        paymentMethod={paymentMethod}
        selectedCardId={selectedCardId}
        onSelectSimpleMethod={handleSelectSimpleMethod}
        onSelectCard={handleSelectCard}
      />

      {/* Modal de "lembrar conta" ao sair */}
      <LogoutRememberModal
        visible={logoutModalVisible}
        onRemember={handleRememberAccount}
        onForget={handleForgetAccount}
        onRequestClose={() => setLogoutModalVisible(false)}
      />
    </View>
  );
}

// Estilos da tela de perfil deslogado (soft logout) — clone do perfil do
// iFood. Cores fixas em hex de propósito (é a paleta do print de
// referência, não a marca da Batata Top) — troca por COLORS.* se quiser
// alinhar com o resto do tema.
const sg = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    color: '#1A1A1A',
    paddingRight: 10,
  },
  illustrationWrapper: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: 142,
    height: 142,
  },
  loginButton: {
    borderWidth: 1,
    borderColor: '#FFB800',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 22,
  },
  loginButtonText: {
    color: '#FFB800',
    fontWeight: '500',
    fontSize: 13.5,
  },
  iconBox: {
    width: 22,
    alignItems: 'center',
    marginRight: 10,
  },
  simpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  simpleRowTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '400',
    color: '#1A1A1A',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F2',
  },
  versionText: {
    fontSize: 11,
    color: '#C2C2C2',
    marginTop: 18,
  },
});

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
  scroll: {
    flex: 1,
  },
  yellowBanner: {
    height: 100,
    backgroundColor: '#FFB800',
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginTop: 40,
    marginHorizontal: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    marginBottom: 16,
  },
  avatarWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#F3E8FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    marginBottom: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userEmail: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
  },
  cpfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  userCpf: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  menuIconBg: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemTextCol: {
    flex: 1,
  },
  menuItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  menuItemSub: {
    fontSize: 11,
    color: '#888888',
    marginTop: 2,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 13,
  },

  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFDF0',
    borderWidth: 1.5,
    borderColor: '#FFB800',
    borderRadius: 16,
    padding: 14,
    marginTop: 4,
  },
  addressStreet: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  addressSub: {
    fontSize: 12,
    color: '#666666',
    marginTop: 2,
  },
  patternLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    marginTop: 8,
  },
  trashBtn: {
    padding: 6,
  },
  noAddressText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999999',
    paddingVertical: 12,
  },

  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#CCCCCC',
    marginTop: 8,
    fontWeight: '600',
  },
});
