import { Stack, useRouter, usePathname } from 'expo-router';
import {
  View, Text, StatusBar, StyleSheet, Pressable,
  ScrollView, Animated, Image, Easing,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from 'react';

import { useCart } from '../utils/cartStore';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange, initAuthStateListener } from '../utils/authSession';
import { getPendingAddress, subscribePendingAddressChange, formatPendingAddressLabel } from '../utils/pendingAddress';
import { getPendingCartIntent, clearPendingCartIntent } from '../utils/pendingCartIntent';
import { subscribeAuthSheetRequest } from '../utils/authSheetRequest';
import { configureNotificationAudio } from '../utils/notificationSound';
import AdminPushRegistration from '../components/AdminPushRegistration';
import EntrarBanner from '../components/EntrarBanner';
import AuthBottomSheet from '../components/AuthBottomSheet';
import AnimatedSplash from '../components/AnimatedSplash';
import CartBar from '../components/CartBar';
import { ThemedAlertHost } from '../components/ThemedAlert';

/* ============================================================
   CONTEXTO DE DIREÇÃO DE NAVEGAÇÃO
   Controla a animação do Stack e lembra a última rota antes de /addresses
   ============================================================ */
const NavContext = createContext({
  animation: 'slide_from_right',
  setAnimation: () => {},
  lastRoute: '/',
  setLastRoute: () => {},
});

export const useNavContext = () => useContext(NavContext);

/* ============================================================
   SCROLL CONTEXT PARA HEADER
   Compartilha o Animated.Value do scrollY E um resetHeader() com todas as telas.
   Cada tela usa: const { onScroll, resetHeader } = useScrollHandler()
   e passa pro ScrollView: onScroll={onScroll} scrollEventThrottle={16}
   Chame resetHeader() no useFocusEffect de cada tela para garantir que o
   header global reapareça ao navegar de volta.
   ============================================================ */
const ScrollYContext = createContext({
  scrollY: new Animated.Value(0),
  resetHeader: () => {},
});

export const useScrollHandler = () => {
  const { scrollY, resetHeader } = useContext(ScrollYContext);
  const onScroll = (event) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    scrollY.setValue(y);
  };
  return { onScroll, resetHeader, scrollY };
};

/* ============================================================
   HEADER HEIGHT CONTEXT
   Compartilha a altura real do header (medida via onLayout) com as telas.
   Cada tela usa: const headerHeight = useHeaderHeight()
   e passa pro ScrollView: contentContainerStyle={{ paddingTop: headerHeight }}
   ============================================================ */
const HeaderHeightContext = createContext(175); // fallback seguro

export const useHeaderHeight = () => useContext(HeaderHeightContext);

/* ============================================================
   TAB BAR HEIGHT CONTEXT
   Mesma ideia do HeaderHeightContext, mas pra altura real (medida via
   onLayout) da BottomTabBar. CartBar usa isso pra se posicionar sempre
   relativo à altura real da tab bar — em vez de duplicar "85 + insets.bottom"
   (o que quebrou depois que a tab bar passou a somar o inset de baixo: ver
   seção do CLAUDE.md sobre timing de insets/resize no Android depois de
   background/foreground). EntrarBanner recebe o valor via prop (não via
   hook) pra evitar import circular com este arquivo.
   ============================================================ */
const TabBarHeightContext = createContext(70); // fallback seguro

export const useTabBarHeight = () => useContext(TabBarHeightContext);

/* ============================================================
   HEADER ANIM CONTEXT
   Compartilha DOIS Animated.Value sincronizados:
   - headerAnim: dirigido pelo native driver, usado no próprio header
     (translateY/opacity — propriedades suportadas pelo native driver).
   - headerSpacerAnim: dirigido pela JS thread (sem native driver), usado
     pelas telas para animar a ALTURA do espaço reservado no topo — 'height'
     não é suportado pelo native driver, por isso precisa de um Value à parte.
   Os dois são sempre animados juntos (Animated.parallel) com a mesma
   duração/curva, então ficam sincronizados visualmente.
   ============================================================ */
const HeaderAnimContext = createContext({
  headerAnim: new Animated.Value(0),
  // Legado: não é mais usado pra animar nada (ficava travado em pixels, JS thread).
  // Mantido só pra não quebrar import de tela antiga que ainda referencie isso.
  headerSpacerAnim: new Animated.Value(0),
});

export const useHeaderAnim = () => useContext(HeaderAnimContext).headerAnim;
export const useHeaderSpacerAnim = () => useContext(HeaderAnimContext).headerSpacerAnim;

/* ============================================================
   CONSTANTES DE ANIMAÇÃO DO HEADER
   Únicas, no escopo do módulo — o Header e a barra flutuante de categorias
   (lá no index.js) usam EXATAMENTE essas mesmas constantes. Isso garante que
   os dois se mexem juntos, no mesmo ritmo, nunca mais rápido/devagar um que
   o outro.
   ============================================================ */
export const HEADER_SHOW_THRESHOLD = 90;
export const HEADER_HYSTERESIS = 24;
export const HEADER_ANIM_DURATION = 650;
export const HEADER_EASING = Easing.out(Easing.cubic); // desacelera no final, fica mais orgânico

const HeaderHiddenContext = createContext({
  headerHidden: false,
  setHeaderHidden: () => {},
});

export const useHeaderHidden = () => useContext(HeaderHiddenContext).headerHidden;

/* ============================================================
   DRAWER MENU LATERAL
   ============================================================ */
function MenuDrawer({ visible, onClose, user, router }) {
  const [mounted, setMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(-320)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -320,
          duration: 200,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 130,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible]);

  if (!mounted) return null;

  const items = [
    { icon: 'home-outline',        label: 'Início',       route: '/' },
    { icon: 'restaurant-outline',  label: 'Cardápio',     route: '/cardapio' },
    { icon: 'receipt-outline',     label: 'Meus Pedidos', route: '/pedidos' },
    { icon: 'person-outline',      label: 'Perfil',       route: '/profile' },
    { icon: 'help-circle-outline', label: 'Ajuda',        route: '/ajuda' },
  ];

  return (
    <View style={sd.overlay}>
      <Animated.View style={[sd.backdrop, { opacity }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[sd.drawer, { transform: [{ translateX }] }]}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={sd.drawerHeader}>
            <View style={sd.drawerLogo}>
              <Image
                source={{ uri: 'https://eucwoxjmjfqylyrqunwk.supabase.co/storage/v1/object/public/logo/logo.png' }}
                style={sd.drawerLogoImg}
                resizeMode="contain"
              />
            </View>
            <View style={sd.drawerUserInfo}>
              {user ? (
                <>
                  <Text style={sd.drawerUserName}>{user.email}</Text>
                  <Text style={sd.drawerUserSub}>Bem-vindo de volta!</Text>
                </>
              ) : (
                <>
                  <Text style={sd.drawerUserName}>Olá, visitante!</Text>
                  <Pressable onPress={() => { onClose(); router.push('/auth/login'); }}>
                    <Text style={sd.drawerLoginLink}>Entrar na conta →</Text>
                  </Pressable>
                </>
              )}
            </View>
            <Pressable onPress={onClose} style={sd.drawerCloseBtn}>
              <Ionicons name="close" size={22} color="#1A1A1A" />
            </Pressable>
          </View>

          <View style={sd.drawerDivider} />

          <ScrollView style={sd.drawerItems} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                style={sd.drawerItem}
                onPress={() => { onClose(); router.push(item.route); }}
              >
                <View style={sd.drawerItemIcon}>
                  <Ionicons name={item.icon} size={20} color="#FFB800" />
                </View>
                <Text style={sd.drawerItemLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
              </Pressable>
            ))}
          </ScrollView>

          <View style={sd.drawerDivider} />

          <View style={sd.drawerFooter}>
            <Text style={sd.drawerFooterText}>Batatop Delivery · Iacanga, SP</Text>
          </View>
        </SafeAreaView>
      </Animated.View>
    </View>
  );
}

const sd = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    width: 290,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
  },
  drawerLogo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  drawerLogoImg: { width: 48, height: 48 },
  drawerUserInfo: { flex: 1 },
  drawerUserName: { color: '#1A1A1A', fontWeight: '700', fontSize: 14 },
  drawerUserSub:  { color: '#888', fontSize: 12, marginTop: 2 },
  drawerLoginLink:{ color: '#FFB800', fontWeight: '700', fontSize: 13, marginTop: 2 },
  drawerCloseBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  drawerDivider:  { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 20 },
  drawerItems:    { flex: 1, paddingTop: 8 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  drawerItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFF8E7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemLabel: { flex: 1, color: '#1A1A1A', fontSize: 15, fontWeight: '600' },
  drawerFooter: { paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' },
  drawerFooterText: { color: '#BBBBBB', fontSize: 12 },
});

/* ============================================================
   HEADER GLOBAL COM HIDE/SHOW NO SCROLL
   ============================================================ */
function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Pega só o primeiro nome e capitaliza certinho (ex: "joão pedro" -> "João")
function getFirstName(fullName) {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function Header({ onHeightChange, onRegisterReset }) {
  const [selectedAddress, setSelectedAddress] = useState('Selecione seu endereço');
  const [drawerVisible, setDrawerVisible]     = useState(false);
  const [user, setUser]                       = useState(null);
  const [authResolved, setAuthResolved]       = useState(false);
  const [timeGreeting]                        = useState(getGreeting());
  const [storeOpen, setStoreOpen]             = useState(true);

  // Nome só aparece se tiver usuário logado com full_name no metadata.
  const firstName = user ? getFirstName(user.user_metadata?.full_name) : null;
  const greeting = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;

  const scaleAnim        = useRef(new Animated.Value(1)).current;
  const authRowOpacity   = useRef(new Animated.Value(1)).current;
  const authRowTranslateY = useRef(new Animated.Value(0)).current;
  const [authRowVisible, setAuthRowVisible] = useState(true);
  const addressNavLock = useRef(false);
  // Ref porque o listener de endereço pendente (useEffect com deps [])
  // precisa saber o `user` MAIS RECENTE, não o valor preso no momento em
  // que o effect rodou (senão nunca reconferiria depois do primeiro render).
  const userRef = useRef(null);

  /* ---- Animação de entrada + crossfade do endereço (estilo iFood) ---- */
  const greetingOpacity    = useRef(new Animated.Value(0)).current;
  const greetingTranslateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(greetingOpacity,    { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(greetingTranslateY, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, []);

  const animateAddressChange = (text) => {
    Animated.timing(greetingOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setSelectedAddress(text);
      Animated.timing(greetingOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  };

  const router   = useRouter();
  const pathname = usePathname();
  const { count: totalItems, add: addToCart } = useCart();
  const { setAnimation, setLastRoute } = useNavContext();
  const { scrollY } = useContext(ScrollYContext);

  // Threshold: em vez de um número mágico fixo, usa a ALTURA REAL do header
  // (medida via onLayout). Assim ele some exatamente quando o scroll já
  // passou da área dele, e só volta quando o scroll reentra nessa área —
  // antes o limite era um valor fixo (90px) bem menor que a altura real do
  // header, então ele ficava escondendo/aparecendo fora de hora.
  const [measuredHeight, setMeasuredHeight] = useState(175);
  const measuredHeightRef = useRef(measuredHeight);
  useEffect(() => {
    measuredHeightRef.current = measuredHeight;
  }, [measuredHeight]);

  const { headerAnim } = useContext(HeaderAnimContext);
  const { setHeaderHidden } = useContext(HeaderHiddenContext);
  const headerHiddenRef = useRef(false);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const hiddenNow = headerHiddenRef.current;
      let shouldHide = hiddenNow;
      const hideAt = measuredHeightRef.current;

      if (!hiddenNow && value > hideAt + HEADER_HYSTERESIS) {
        shouldHide = true;
      } else if (hiddenNow && value < hideAt - HEADER_HYSTERESIS) {
        shouldHide = false;
      }

      if (shouldHide !== hiddenNow) {
        headerHiddenRef.current = shouldHide;
        // O header desliza/some via native driver (translateY + opacity).
        // setHeaderHidden só avisa a barra de categorias que o header já
        // terminou de sumir/aparecer — não empurra mais nada na tela.
        Animated.timing(headerAnim, {
          toValue: shouldHide ? 1 : 0,
          duration: HEADER_ANIM_DURATION,
          easing: HEADER_EASING,
          useNativeDriver: true,
        }).start();
        setHeaderHidden(shouldHide);
      }
    });
    return () => scrollY.removeListener(id);
  }, []);

  const headerTranslateY = headerAnim.interpolate({
    inputRange: [0, 1],
    // Sai completamente da tela usando a altura REAL medida (+ folga), em
    // vez de um -160 fixo — se o header for mais alto que isso, sobrava uma
    // tirinha visível mesmo "escondido", parecendo que ele "ainda tá lá".
    outputRange: [0, -(measuredHeight + 40)],
  });

  const headerOpacity = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  /* ---- Status da loja (aberto/fechado) — tabela store_settings ---- */
  useEffect(() => {
    let channel;

    async function fetchStoreStatus() {
      const { data } = await supabase
        .from('store_settings')
        .select('setting_value')
        .eq('setting_key', 'store_status')
        .single();
      if (data?.setting_value?.isOpen !== undefined) {
        setStoreOpen(!!data.setting_value.isOpen);
      }
    }

    fetchStoreStatus();

    channel = supabase
      .channel('store_status_header')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'store_settings', filter: 'setting_key=eq.store_status' },
        (payload) => {
          if (payload.new?.setting_value?.isOpen !== undefined) {
            setStoreOpen(!!payload.new.setting_value.isOpen);
          }
        }
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  /* ---- Auth & endereço ---- */
  useEffect(() => {
    // Endereço calculado sem login (ver utils/pendingAddress.js) — enquanto
    // deslogado, o seletor do Header mostra ele em vez do texto padrão.
    // Não aparece em lugar nenhum de app/addresses.js (decisão de produto);
    // só some daqui quando um login de verdade acontece (flushPendingAddress
    // já limpa a chave, e o applyUser abaixo busca o endereço real).
    async function loadPendingAddressLabel() {
      const pending = await getPendingAddress();
      const label = formatPendingAddressLabel(pending);
      animateAddressChange(label || 'Selecione seu endereço');
    }

    // Aplica o usuário resolvido (real ou soft-logout) no estado E na
    // animação da linha de login/cadastro — usado tanto no refresh manual
    // quanto no onAuthStateChange, pra não ter dois lugares com lógica
    // diferente de "o que acontece quando o usuário vira null/não-null".
    function applyUser(u) {
      setUser(u);
      userRef.current = u;
      if (u) {
        fetchDefaultAddress(u.id);

        // Item pendente de um "Adicionar" que foi barrado por gate de
        // login no produto/[id].js (ver utils/pendingCartIntent.js). Este
        // é o único ponto que roda pra QUALQUER caminho de login (e-mail,
        // celular, cadastro, "continuar como") — os outros terminam em
        // telas diferentes (login.js, codigo.js, telefone.js) que não têm
        // e não precisam ter nenhuma ideia do fluxo de produto. Rodar só
        // aqui também evita adicionar de novo à toa: applyUser(u) pode
        // rodar mais de uma vez com usuário já logado (ex: refresh de
        // token), mas a intenção já foi limpa na primeira consumida.
        const pendingItems = getPendingCartIntent();
        if (pendingItems) {
          pendingItems.forEach(addToCart);
          clearPendingCartIntent();
        }

        Animated.parallel([
          Animated.timing(authRowOpacity,     { toValue: 0,   duration: 220, useNativeDriver: true }),
          Animated.timing(authRowTranslateY,  { toValue: -12, duration: 220, useNativeDriver: true }),
        ]).start(() => setAuthRowVisible(false));
      } else {
        loadPendingAddressLabel();
        authRowTranslateY.setValue(-12);
        setAuthRowVisible(true);
        Animated.parallel([
          Animated.timing(authRowOpacity,    { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(authRowTranslateY, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      }
    }

    // Reconfere o estado "logado pra UI" — combina a sessão real do Supabase
    // com a flag de soft-logout (ver utils/authSession.js). Usado tanto no
    // mount quanto sempre que "Sim, lembrar" / "Continuar como" mudam a flag,
    // já que essa mudança não passa por onAuthStateChange (a sessão real não
    // muda nesse fluxo).
    async function refreshEffectiveUser() {
      const session = await getEffectiveSession();
      applyUser(session?.user ?? null);
      setAuthResolved(true);
    }

    // Liga o listener central que desliga o soft-logout sozinho sempre que
    // um login real (SIGNED_IN) acontecer — ver utils/authSession.js.
    initAuthStateListener();

    refreshEffectiveUser();
    const unsubscribeUi = subscribeAuthUiChange(refreshEffectiveUser);
    // Endereço pendente mudou (salvou/limpou) — só importa reconferir aqui
    // se ainda tiver ninguém logado; se logar de verdade nesse meio tempo,
    // quem manda é fetchDefaultAddress (endereço real), não o pendente.
    const unsubscribePendingAddress = subscribePendingAddressChange(() => {
      if (!userRef.current) loadPendingAddressLabel();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // NÃO usar `session` direto aqui — a sessão real do Supabase se renova
      // sozinha em background (autoRefreshToken: true) e dispara esse evento
      // (ex: TOKEN_REFRESHED) mesmo com o soft-logout ligado. Aplicar direto
      // pisaria no soft-logout. Reconfere via getEffectiveSession.
      refreshEffectiveUser();
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeUi();
      unsubscribePendingAddress();
    };
  }, []);

  async function fetchDefaultAddress(userId) {
    try {
      const { data } = await supabase
        .from('addresses')
        .select('street, number')
        .eq('user_id', userId)
        .eq('is_default', true)
        .single();
      if (data) {
        animateAddressChange(`${data.street}, ${data.number}`);
        return;
      }
      // fallback: mais recente
      const { data: any } = await supabase
        .from('addresses')
        .select('street, number')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (any) animateAddressChange(`${any.street}, ${any.number}`);
    } catch { /* sem endereço ainda */ }
  }

  /* ---- Reset do header ao focar uma tela (chamado pelo useFocusEffect de cada tela) ----
     Como o headerTranslateY/headerOpacity agora são interpolações diretas do
     scrollY compartilhado, resetar é só zerar o valor do scroll. */
  useEffect(() => {
    if (typeof onRegisterReset === 'function') onRegisterReset(() => {
      scrollY.setValue(0);
      headerHiddenRef.current = false;
      headerAnim.setValue(0);
      setHeaderHidden(false); // reset instantâneo ao trocar de tela
    });
  }, []);

  /* ---- authRow em /addresses ---- */
  const isAuthPage    = pathname.includes('auth');
  const isProdutoPage = pathname.includes('produto');
  const isAddressPage = pathname.includes('addresses');
  const isCartPage = pathname === '/cart';
  const isWelcomePage = pathname.includes('welcome');
  const isLocationPage = pathname.includes('location');
  const isCardapioPage = pathname.includes('cardapio');
  const isPedidosPage = pathname.includes('pedidos');
  const isProfilePage = pathname === '/profile' || pathname.startsWith('/profile/');
  const isAjudaPage = pathname.includes('ajuda');
  const isAdminPage = pathname.startsWith('/admin');

  useEffect(() => {
    if (!authResolved) return;
    if (isAddressPage || user) {
      Animated.parallel([
        Animated.timing(authRowOpacity,    { toValue: 0,   duration: 200, useNativeDriver: true }),
        Animated.timing(authRowTranslateY, { toValue: -12, duration: 200, useNativeDriver: true }),
      ]).start(() => setAuthRowVisible(false));
    } else {
      authRowTranslateY.setValue(-12);
      setAuthRowVisible(true);
      Animated.parallel([
        Animated.timing(authRowOpacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(authRowTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [isAddressPage, user, authResolved]);

  if (isAuthPage || isProdutoPage || isCartPage || isAddressPage || isWelcomePage || isLocationPage || isCardapioPage || isPedidosPage || isProfilePage || isAjudaPage || isAdminPage) return null;

  return (
    <>
      <Animated.View
        style={[
          s.headerSafeAnimated,
          {
            transform: [{ translateY: headerTranslateY }],
            opacity: headerOpacity,
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000,
          },
        ]}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          setMeasuredHeight(h);
          onHeightChange && onHeightChange(h);
        }}
      >
        <SafeAreaView style={s.headerSafe} edges={['top']}>
          {/* ── Linha 1: hambúrguer + saudação/endereço + carrinho (estilo iFood) ── */}
          <View style={s.addressRow}>
            <Pressable
              style={s.greetingAddressWrap}
              onPress={() => {
                if (addressNavLock.current || isAddressPage) return;
                addressNavLock.current = true;
                setLastRoute(pathname);
                setAnimation('slide_from_right');
                router.replace('/addresses');
                setTimeout(() => { addressNavLock.current = false; }, 600);
              }}
              onPressIn={() => Animated.spring(scaleAnim, { toValue: 0.98, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true }).start()}
            >
              <Animated.View
                style={{
                  opacity: greetingOpacity,
                  transform: [{ translateY: greetingTranslateY }, { scale: scaleAnim }],
                }}
              >
                <Text style={s.greetingText}>{greeting}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={s.addressValueText} numberOfLines={1}>
                    {selectedAddress}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color="#1A1A1A" />
                </View>
              </Animated.View>
            </Pressable>

            <View style={s.storeStatusWrap}>
              <View style={[s.storeStatusDot, { backgroundColor: storeOpen ? '#22C55E' : '#E63535' }]} />
              <Text style={s.storeStatusText}>{storeOpen ? 'Aberto' : 'Fechado'}</Text>
            </View>

            <Pressable style={s.cartCircleBtn} onPress={() => router.push('/cart')}>
              <View style={s.cartCircleInner}>
                <Ionicons name="cart-outline" size={20} color="#1A1A1A" />
              </View>
              {totalItems > 0 && (
                <View style={s.cartBadge}>
                  <Text style={s.cartBadgeText}>{totalItems}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>

      <MenuDrawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} user={user} router={router} />
    </>
  );
}


const TAB_ORDER = ['index', 'cardapio', 'pedidos', 'profile'];

function getTabIndex(pathname) {
  if (pathname === '/' || pathname === '/index') return 0;
  return TAB_ORDER.findIndex((t) => t !== 'index' && pathname.includes(t));
}

function BottomTabBar({ onHeightChange }) {
  const router   = useRouter();
  const pathname = usePathname();
  const { setAnimation } = useNavContext();
  const insets = useSafeAreaInsets();

  // Mesma regra que o Header já usa (isAuthPage) — a tab bar não deve
  // aparecer em cima da tela de login/cadastro, endereços (tela cheia,
  // estilo iFood), sacola/cart, checkout nem da tela de welcome/onboarding.
  if (
    pathname.includes('cart') ||
    pathname.includes('checkout') ||
    pathname.includes('produto') ||
    pathname.includes('auth') ||
    pathname.includes('addresses') ||
    pathname.includes('welcome') ||
    pathname.includes('location') ||
    pathname.includes('cupons') ||
    pathname.includes('payments')
  ) return null;

  const tabs = [
    { name: 'index',    label: 'Início',   icon: 'home',       iconOutline: 'home-outline' },
    { name: 'cardapio', label: 'Cardápio', icon: 'restaurant', iconOutline: 'restaurant-outline' },
    { name: 'pedidos',  label: 'Pedidos',  icon: 'receipt',    iconOutline: 'receipt-outline' },
    { name: 'profile',  label: 'Perfil',   icon: 'person',     iconOutline: 'person-outline' },
  ];

  const isActive = (routeName) => {
    // Compara o primeiro segmento da rota, não uma busca de texto solto.
    // Antes: pathname.includes('pedidos') acendia a aba "Pedidos" também
    // dentro de /admin/pedidos, porque a string "pedidos" aparecia lá dentro.
    const firstSegment = pathname.split('/').filter(Boolean)[0] || '';
    if (routeName === 'index') return firstSegment === '';
    return firstSegment === routeName;
  };

  const currentIdx = getTabIndex(pathname);

  const handleTabPress = (tab) => {
    const targetIdx = TAB_ORDER.indexOf(tab.name);
    if (targetIdx === currentIdx) return;
    const direction = targetIdx > currentIdx ? 'slide_from_right' : 'slide_from_left';
    setAnimation(direction);
    router.push(tab.name === 'index' ? '/' : `/${tab.name}`);
  };

  return (
    <View
      style={[s.tabBar, { paddingBottom: 8 + insets.bottom }]}
      onLayout={(e) => onHeightChange && onHeightChange(e.nativeEvent.layout.height)}
    >
      {tabs.map((tab) => {
        const active = isActive(tab.name);
        return (
          <Pressable key={tab.name} style={s.tabItem} onPress={() => handleTabPress(tab)}>
            <Ionicons
              name={active ? tab.icon : tab.iconOutline}
              size={24}
              color={active ? '#FFB800' : '#A3A3A3'}
            />
            <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ============================================================
   ROOT LAYOUT
   ============================================================ */
const rootScrollY = new Animated.Value(0);
const rootHeaderAnim = new Animated.Value(0);
const rootHeaderSpacerAnim = new Animated.Value(0);
const rootHeaderAnimCtxValue = { headerAnim: rootHeaderAnim, headerSpacerAnim: rootHeaderSpacerAnim };

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const [headerHeight, setHeaderHeight] = useState(175);
  const [tabBarHeight, setTabBarHeight] = useState(70);
  const [animation, setAnimation]       = useState('slide_from_right');
  const [lastRoute, setLastRoute]       = useState('/');
  const [headerHidden, setHeaderHiddenState] = useState(false);
  const [authSheetVisible, setAuthSheetVisible] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const resetHeaderRef = useRef(() => {});

  // Permite que qualquer tela (ex: produto/[id].js, no gate de login do
  // "Adicionar") peça pra abrir este mesmo AuthBottomSheet global sem
  // precisar receber setAuthSheetVisible via prop — ver
  // utils/authSheetRequest.js.
  useEffect(() => {
    return subscribeAuthSheetRequest(() => setAuthSheetVisible(true));
  }, []);

  const scrollCtxValue = useRef({
    scrollY: rootScrollY,
    resetHeader: () => resetHeaderRef.current(),
  }).current;

  // Só um sinalizador booleano agora — nada de altura anima mais com ele.
  // A barra de categorias usa isso pra saber se o header já sumiu.
  const setHeaderHidden = useCallback((value) => {
    setHeaderHiddenState(value);
  }, []);

  const headerHiddenCtxValue = useMemo(
    () => ({ headerHidden, setHeaderHidden }),
    [headerHidden, setHeaderHidden]
  );

  useEffect(() => {
    configureNotificationAudio();
  }, []);

  return (
    <KeyboardProvider>
    <NavContext.Provider value={{ animation, setAnimation, lastRoute, setLastRoute }}>
    <ScrollYContext.Provider value={scrollCtxValue}>
    <HeaderHeightContext.Provider value={headerHeight}>
    <TabBarHeightContext.Provider value={tabBarHeight}>
    <HeaderHiddenContext.Provider value={headerHiddenCtxValue}>
    <HeaderAnimContext.Provider value={rootHeaderAnimCtxValue}>
    <SafeAreaProvider>
      <StatusBar
        backgroundColor={
          showSplash
            ? '#FF0000'
            : authSheetVisible || pathname.includes('payments')
            ? 'transparent'
            : '#FFFFFF'
        }
        translucent={!showSplash && (authSheetVisible || pathname.includes('payments'))}
        barStyle={showSplash || authSheetVisible ? 'light-content' : 'dark-content'}
      />
      {showSplash ? (
        // Enquanto a splash roda, NADA do resto do app é montado.
        // Isso evita que o carregamento do Header/Stack/Supabase etc.
        // concorra com a thread de JS e engasgue os primeiros frames do vídeo.
        <AnimatedSplash onFinish={() => setShowSplash(false)} />
      ) : (
        <>
          <AdminPushRegistration />
          <View style={{ flex: 1 }}>
            {!pathname.includes('cupons') && (
              <Header
                onHeightChange={setHeaderHeight}
                onRegisterReset={(fn) => { resetHeaderRef.current = fn; }}
              />
            )}
            <View style={{ flex: 1 }}>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: '#F8F9FA' },
                  animation,
                }}
              />
            </View>
            {!pathname.includes('addresses') && <CartBar tabBarHeight={tabBarHeight} />}
            <BottomTabBar onHeightChange={setTabBarHeight} />
            {!pathname.includes('welcome') && !pathname.includes('location') && !pathname.includes('cart') && !pathname.includes('checkout') && (
              <EntrarBanner onPress={() => setAuthSheetVisible(true)} tabBarHeight={tabBarHeight} />
            )}
            <AuthBottomSheet visible={authSheetVisible} onClose={() => setAuthSheetVisible(false)} />
          </View>
        </>
      )}
      <ThemedAlertHost />
    </SafeAreaProvider>
    </HeaderAnimContext.Provider>
    </HeaderHiddenContext.Provider>
    </TabBarHeightContext.Provider>
    </HeaderHeightContext.Provider>
    </ScrollYContext.Provider>
    </NavContext.Provider>
    </KeyboardProvider>
  );
}

/* ============================================================
   STYLES
   ============================================================ */
const s = StyleSheet.create({
  /* ── Header (estilo iFood: fundo branco) ── */
  headerSafeAnimated: { overflow: 'hidden' },
  headerSafe:         { backgroundColor: '#FFFFFF' },

  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  menuBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    gap: 5, flexShrink: 0,
  },
  menuBar: { width: 22, height: 2.5, backgroundColor: '#1A1A1A', borderRadius: 2 },

  greetingAddressWrap: { flex: 1 },
  greetingText: { color: '#767676', fontSize: 13, fontWeight: '500', lineHeight: 14, marginBottom: 3 },
  addressValueText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700', flexShrink: 1, lineHeight: 19 },

  /* ── Status da loja (aberto/fechado) ── */
  storeStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginRight: 6,
  },
  storeStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  storeStatusText: {
    color: '#767676',
    fontSize: 15,
    fontWeight: '400',
  },

  /* ── Carrinho: bolinha com cinza escuro em volta (no lugar do sino de notificação) ── */
  cartCircleBtn: {
    position: 'relative',
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cartCircleInner: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#F2F2F2',
    alignItems: 'center', justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#E63535', borderRadius: 10,
    minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FFFFFF',
  },
  cartBadgeText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 10 },

  loginBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
  },
  loginBtnText: { color: '#B8860B', fontWeight: '800', fontSize: 15 },
  registerHeaderBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)',
  },
  registerHeaderBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  /* ── Bottom Tab Bar ── */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingBottom: 8, paddingTop: 8,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 2, position: 'relative', paddingVertical: 4,
  },
  tabLabel:       { fontSize: 11, fontWeight: '600', color: '#A3A3A3', marginTop: 2 },
  tabLabelActive: { color: '#FFB800', fontWeight: '700' },
});
