import { View, Text, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { useScrollHandler, useHeaderHeight } from '../_layout';
import { SOFT_LOGOUT_KEY, emitAuthUiChange, getEffectiveSession } from '../../utils/authSession';
import LogoutRememberModal from '../../components/LogoutRememberModal';
import { requestAuthSheet } from '../../utils/authSheetRequest';
import ProfileAccordionItem from '../../components/ProfileAccordionItem';
import ProfileSuccessToast from '../../components/ProfileSuccessToast';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';

// Precisa ser IGUAL à SAVED_USER_KEY de components/AuthBottomSheet.tsx
const SAVED_USER_KEY = '@batatatop:savedUser';

export default function Profile() {
  const router = useRouter();
  const { onScroll, resetHeader } = useScrollHandler();
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
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
        // Badge de notificações não lidas (broadcast + específicas do
        // usuário) — falha aqui não pode travar o resto do perfil.
        try {
          // Não lidas = notifications.read_at ainda nulo E sem linha em
          // notification_reads pra esse usuário (broadcast lido por outro
          // usuário não conta pra este). Left join + RLS da tabela
          // notification_reads filtra só as leituras deste usuário.
          const { count } = await supabase
            .from('notifications')
            .select('id, notification_reads!left(id)', { count: 'exact', head: true })
            .or(`user_id.eq.${u.id},user_id.is.null`)
            .is('read_at', null)
            .filter('notification_reads.notification_id', 'is', null);
          setUnreadNotifications(count || 0);
        } catch (notifError) {
          console.error('Erro ao carregar contagem de notificações:', notifError);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do perfil:', error);
    } finally {
      setLoading(false);
    }
  }

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
                source={require('../../assets/bolsaprofile.png')}
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
      <ProfileSuccessToast
        visible={historyToastVisible}
        message="Histórico limpo com sucesso"
        onHide={() => setHistoryToastVisible(false)}
      />

      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: headerHeight + 10,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
      >
        {/* Header: avatar + nome — igual ao print de referência (sem card,
            sem e-mail/CPF aqui; isso mora em "Dados da conta" agora) */}
        <View style={s.profileHeaderRow}>
          <View style={s.avatarWrapper}>
            <Image
              source={{ uri: user?.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/png?seed=${user?.email || 'Guest'}` }}
              style={s.avatarImage}
            />
          </View>
          <Text style={s.userName} numberOfLines={1}>
            {user?.user_metadata?.full_name || 'Usuário Batatop'}
          </Text>
        </View>

        {/* Card de pagamento — branco, igual à referência: logo Batata Top
            e a linha "Pagamentos" dentro do mesmo card branco, com a
            "curva" de espiada (mesma técnica do card bloqueado do
            CouponCard) revelando a caixa cinza "Gerencie suas formas de
            pagamento" por baixo. */}
        <Pressable style={s.paymentCardWrapper} onPress={() => router.push('/profile/payments')}>
          <View style={s.paymentTopCard}>
            <Image
              source={require('../../assets/batatatopestendida.png')}
              style={s.paymentLogo}
              resizeMode="contain"
            />

            <View style={s.paymentTopRow}>
              <View style={s.iconBg}>
                <Ionicons name="card-outline" size={18} color="#4A4A4A" />
              </View>
              <Text style={s.paymentTitle}>Pagamentos</Text>
              <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
            </View>
          </View>

          <View style={s.paymentHintBox}>
            <Text style={s.paymentHintText}>Gerencie suas formas de pagamento</Text>
          </View>
        </Pressable>

        {/* Linhas simples (sem accordion) — Notificações continua igual ao
            print; "Conversas" e "Clube Batata Top" foram removidos a
            pedido (não existe rota/feature pra eles no projeto ainda). */}
        <Pressable style={s.simpleRow} onPress={() => router.push('/notifications')}>
          <View style={s.simpleIconBox}>
            <Ionicons name="notifications-outline" size={19} color="#7A7A7A" />
          </View>
          <Text style={s.simpleRowTitle}>Notificações</Text>
          {unreadNotifications > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={15} color="#B0B0B0" />
        </Pressable>
        <View style={s.simpleDivider} />

        {/* Painel Administrativo — não está no print (é feature própria do
            app, não do iFood), mas mantido pra não perder funcionalidade
            existente. Só aparece pra admin. */}
        {isAdmin && (
          <>
            <Pressable style={s.simpleRow} onPress={() => router.push('/admin')}>
              <View style={[s.simpleIconBox, s.adminIconBox]}>
                <Ionicons name="shield-half-outline" size={19} color="#D97706" />
              </View>
              <Text style={s.simpleRowTitle}>Painel Administrativo</Text>
              <Ionicons name="chevron-forward" size={15} color="#B0B0B0" />
            </Pressable>
            <View style={s.simpleDivider} />
          </>
        )}

        {/* Recompensas e Benefícios */}
        <ProfileAccordionItem
          icon="gift-outline"
          title="Recompensas e Benefícios"
          subtitle="Cupons de desconto"
          items={[
            { label: 'Cupons', onPress: () => router.push('/cupons') },
          ]}
        />

        {/* Conta */}
        <ProfileAccordionItem
          icon="person-outline"
          title="Conta"
          subtitle="Endereços e dados da conta"
          items={[
            { label: 'Endereços', onPress: () => router.push('/addresses') },
            { label: 'Dados da conta', onPress: () => router.push('/profile/data') },
          ]}
        />

        {/* Configurações */}
        <ProfileAccordionItem
          icon="settings-outline"
          title="Configurações"
          subtitle="Segurança, notificações e mais"
          items={[
            { label: 'Segurança', onPress: () => router.push('/profile/security') },
            { label: 'Gerenciar notificações', onPress: () => router.push('/profile/gerenciar-notificacoes') },
            { label: 'Limpar histórico de busca', onPress: handleClearHistory },
            { label: 'Sair da conta', onPress: handleLogout, danger: true },
          ]}
        />

        {/* Ajuda e Termos */}
        <ProfileAccordionItem
          icon="help-circle-outline"
          title="Ajuda e Termos"
          subtitle="Central de ajuda, termos de uso e políticas"
          items={[
            { label: 'Ajuda', onPress: () => router.push('/ajuda') },
            { label: 'Termos de uso', onPress: () => router.push({ pathname: '/ajuda/artigo/termos-de-uso', params: { headerTitle: 'TERMOS DE USO' } }) },
            { label: 'Políticas de privacidade', onPress: () => router.push({ pathname: '/ajuda/artigo/declaracao-de-privacidade', params: { headerTitle: 'DECLARAÇÃO DE PRIVACIDADE' } }) },
          ]}
        />

        <Text style={s.versionText}>Batata Top v2.2.0</Text>
      </ScrollView>

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
    paddingVertical: 14,
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

  // Header (avatar + nome) — igual ao topo do print de referência
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#FADCE0',
    marginRight: 14,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  userName: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // Card de pagamento — branco, igual à referência (logo Batata Top +
  // "Pagamentos" dentro do mesmo card). Mesma técnica de "curva" de espiada
  // do card bloqueado do CouponCard: paymentTopCard fica por cima com
  // todos os cantos arredondados (16), e paymentHintBox fica atrás com
  // marginTop negativo — o topo quadrado dele "espia" por baixo da curva.
  paymentCardWrapper: {
    marginBottom: 20,
  },
  paymentTopCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 14,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  paymentLogo: {
    width: 100,
    height: 50,
    marginTop: -10,
    marginBottom: 0,
  },
  paymentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  paymentTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  paymentHintBox: {
    backgroundColor: '#EDEDED',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginTop: -16,
    paddingTop: 16 + 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 1,
  },
  paymentHintText: {
    fontSize: 12,
    color: '#888888',
  },

  // Linhas simples (Notificações / Admin)
  simpleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  simpleIconBox: {
    width: 22,
    alignItems: 'center',
    marginRight: 10,
  },
  adminIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  simpleRowTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '400',
    color: '#1A1A1A',
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '700',
  },
  simpleDivider: {
    height: 1,
    backgroundColor: '#F2F2F2',
  },

  versionText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#CCCCCC',
    marginTop: 18,
    fontWeight: '600',
  },
});
