import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  useWindowDimensions,
  LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseConfig';
import { SOFT_LOGOUT_KEY, emitAuthUiChange } from '../utils/authSession';
import { signInWithGoogle, signInWithFacebook } from '../utils/googleAuth';
import { ThemedAlertHost, showThemedAlert } from './ThemedAlert';
import HelpModal from './HelpModal';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';

// Chave usada para reconhecer o usuário localmente.
// TODO: ajustar formato/local de escrita conforme a lógica real de auth
// (ex: gravar isso depois de um login bem-sucedido em login.js).
const SAVED_USER_KEY = '@batatatop:savedUser';

type SavedUser = { name: string; email?: string; phone?: string };

type AuthBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
};

// Transição entre estados (B -> A, A -> C, C -> A): devagar e suave de
// propósito, sem pressa. Ajuste esse número se quiser mais rápido.
const SWITCH_DURATION = 550;
const SWITCH_STAGGER = 120; // atraso do conteúdo novo em relação à saída do antigo

export default function AuthBottomSheet({ visible, onClose }: AuthBottomSheetProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
  // loginfoto.jpeg é 900x1600 (9:16) — altura de base calculada da largura
  // real da tela, usada só como fallback antes da primeira medição do painel.
  const IMAGE_HEIGHT_FALLBACK = SCREEN_WIDTH * (16 / 9);
  // Sobreposição de segurança: a foto sempre estende um pouco além de onde o
  // painel começa, pra nunca sobrar aquela faixa preta do fundo do sheet
  // entre a foto e o painel branco. Precisa ser maior que o raio arredondado
  // do topo do painel (RADIUS['2xl']), senão sobra uma frestinha bem na
  // pontinha da curva.
  const IMAGE_OVERLAP = 80;

  // Distância real até o fim da tela: insets.bottom já muda sozinho conforme
  // o aparelho está em navegação por gestos (barrinha fina, inset pequeno)
  // ou por botões (inset maior por causa da barra do sistema) — por isso
  // basta somar ao respiro padrão em vez de usar um valor fixo, senão o
  // conteúdo cola na barra de botões ou sobra espaço demais no modo gesto.
  const bottomPadding = SPACING[8] + insets.bottom;

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  const [savedUser, setSavedUser] = useState<SavedUser | null>(null);
  // 'A' = Já tenho conta / Criar conta (padrão)
  // 'B' = Continuar como {nome} (usuário salvo localmente)
  // 'C' = Como deseja continuar? (Celular / E-mail) — aberto a partir de A
  const [estado, setEstado] = useState<'A' | 'B' | 'C'>('A');
  const [helpVisible, setHelpVisible] = useState(false);

  // Altura real de cada bloco de conteúdo (medida via onLayout). Os blocos
  // ficam sempre montados, um visível e os outros com opacity 0 por baixo,
  // só pra já sabermos a altura de destino antes do usuário trocar de
  // estado — é isso que evita o "pulo" de tamanho na hora de trocar.
  const [heightA, setHeightA] = useState(0);
  const [heightB, setHeightB] = useState(0);
  const [heightC, setHeightC] = useState(0);
  // Fica true assim que o usuário troca de estado manualmente (botão
  // "Acessar outra conta" ou "Já tenho uma conta"); a partir daí quem
  // controla panelHeight é só a animação do handler correspondente, não
  // mais o efeito de sincronia abaixo.
  const hasSwitchedRef = useRef(false);

  const panelHeight = useSharedValue(0);
  const opacityA = useSharedValue(0);
  const translateYA = useSharedValue(0);
  const opacityB = useSharedValue(0);
  const translateYB = useSharedValue(0);
  const opacityC = useSharedValue(0);
  const translateYC = useSharedValue(0);

  const checkSavedUser = useCallback(async () => {
    // Reset defensivo e SÍNCRONO de TODOS os blocos (A, B e C) antes de
    // decidir o estado real. Antes só o C era zerado aqui — se o sheet
    // fosse fechado no meio de uma transição (ex: Estado C -> onClose() +
    // router.push, indo pro login.js), o componente não desmonta de
    // verdade (só retorna null), então opacityC/estado/hasSwitchedRef
    // ficavam "congelados" com os valores da última transição. Ao reabrir,
    // havia uma janela (entre o commit do render e o await resolver) onde
    // o Estado C antigo ainda estava com opacidade não-zerada bem na hora
    // em que o Estado B (usuário salvo) era revelado por cima — causando a
    // sobreposição visual. Zerando os três de uma vez aqui, não sobra
    // nenhum valor de uma sessão anterior pra vazar pro próximo open.
    hasSwitchedRef.current = false;
    opacityA.value = 0;
    translateYA.value = 0;
    opacityB.value = 0;
    translateYB.value = 0;
    opacityC.value = 0;
    translateYC.value = 0;
    try {
      const raw = await AsyncStorage.getItem(SAVED_USER_KEY);
      if (raw) {
        const user: SavedUser = JSON.parse(raw);
        setSavedUser(user);
        setEstado('B');
        // ✅ FIX: Aguardar React renderizar o novo estado ANTES de mexer
        // em Reanimated values. Isso evita sobreposição visual do Estado C.
        await new Promise(resolve => setTimeout(resolve, 0));
        opacityB.value = 1;
        translateYB.value = 0;
      } else {
        setSavedUser(null);
        setEstado('A');
        await new Promise(resolve => setTimeout(resolve, 0));
        opacityA.value = 1;
        translateYA.value = 0;
      }
    } catch (err: unknown) {
      setSavedUser(null);
      setEstado('A');
      await new Promise(resolve => setTimeout(resolve, 0));
      opacityA.value = 1;
      translateYA.value = 0;
    }
  }, []);

  // Mantém panelHeight sincronizada com o estado real assim que a altura
  // correspondente é conhecida — cobre o caso em que o checkSavedUser (que
  // é assíncrono) só descobre que é Estado B depois do primeiro layout.
  useEffect(() => {
    if (hasSwitchedRef.current) return;
    const target = estado === 'A' ? heightA : estado === 'B' ? heightB : heightC;
    if (target > 0) {
      panelHeight.value = target;
    }
  }, [estado, heightA, heightB, heightC]);

  useEffect(() => {
    if (visible) {
      checkSavedUser();
      translateY.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 400 });
    } else {
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 350, easing: Easing.in(Easing.cubic) });
      backdropOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [visible, checkSavedUser]);

  function handleAcessarOutraConta() {
    hasSwitchedRef.current = true;
    setEstado('A');
    // Transição devagar e suave: o bloco B esmaece e desce um pouco enquanto
    // sai, o bloco A entra logo depois (levinho atraso) subindo de baixo pra
    // cima, e o painel inteiro anima de altura pra altura já medida do
    // Estado A — sem pulo nenhum, tudo no mesmo ritmo lento.
    const targetHeight = heightA || panelHeight.value;

    panelHeight.value = withTiming(targetHeight, {
      duration: SWITCH_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });

    opacityB.value = withTiming(0, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });
    translateYB.value = withTiming(-10, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });

    translateYA.value = 18;
    opacityA.value = withDelay(
      SWITCH_STAGGER,
      withTiming(1, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
    translateYA.value = withDelay(
      SWITCH_STAGGER,
      withTiming(0, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
  }

  // A -> C: mesma dança de transição, só trocando qual bloco sai e qual entra.
  function handleJaTenhoConta() {
    hasSwitchedRef.current = true;
    setEstado('C');
    const targetHeight = heightC || panelHeight.value;

    panelHeight.value = withTiming(targetHeight, {
      duration: SWITCH_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });

    opacityA.value = withTiming(0, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });
    translateYA.value = withTiming(-10, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });

    translateYC.value = 18;
    opacityC.value = withDelay(
      SWITCH_STAGGER,
      withTiming(1, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
    translateYC.value = withDelay(
      SWITCH_STAGGER,
      withTiming(0, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
  }

  // C -> A: usada pelo botão de voltar quando o usuário está na tela
  // "Como deseja continuar?" (em vez de fechar o sheet inteiro).
  function handleVoltarDeComoContinuar() {
    hasSwitchedRef.current = true;
    setEstado('A');
    const targetHeight = heightA || panelHeight.value;

    panelHeight.value = withTiming(targetHeight, {
      duration: SWITCH_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });

    opacityC.value = withTiming(0, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });
    translateYC.value = withTiming(-10, { duration: SWITCH_DURATION * 0.55, easing: Easing.in(Easing.cubic) });

    translateYA.value = 18;
    opacityA.value = withDelay(
      SWITCH_STAGGER,
      withTiming(1, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
    translateYA.value = withDelay(
      SWITCH_STAGGER,
      withTiming(0, { duration: SWITCH_DURATION - SWITCH_STAGGER, easing: Easing.out(Easing.cubic) })
    );
  }

  async function handleContinuarComo() {
    // A sessão real do Supabase NUNCA foi destruída (ver profile.js —
    // "Sim, lembrar" não chama signOut, só liga o SOFT_LOGOUT_KEY). Então
    // não tem refresh nem setSession pra fazer aqui: só tirar a flag e
    // confirmar que a sessão real ainda existe.
    try {
      console.log('🚀 ===== handleContinuarComo INICIADO =====', new Date().toISOString());

      await AsyncStorage.setItem(SOFT_LOGOUT_KEY, 'false');
      console.log('👻 Soft-logout desligado');
      emitAuthUiChange();

      const { data: { session } } = await supabase.auth.getSession();
      console.log('1️⃣ Sessão real existe?', !!session);

      if (!session) {
        // Só acontece se a sessão tiver sido revogada de fato por fora
        // (ex: usuário clicou "Esquecer conta" em outro aparelho, ou fez
        // login em outro lugar que derrubou esta sessão). Nesse caso não
        // tem como continuar sem senha mesmo — cai pro fallback de login.
        console.log('❌ Sessão real não existe mais — precisa logar de novo');
        throw new Error('Sessão não encontrada');
      }

      console.log('✅ Sessão confirmada — navegando pra home...');
      onClose();
      router.replace('/');
    } catch (err: unknown) {
      // err chega como `unknown` (TS estrito) — não dá pra acessar
      // err.message/.code/.status direto sem antes checar o tipo, senão o
      // compilador acusa erro. supabase-js lança objetos parecidos com
      // Error mas às vezes com .code/.status extras, então fazemos um
      // narrowing manual em vez de simplesmente tipar como `any`.
      const errObj = err as { message?: unknown; code?: unknown; status?: unknown } | null;
      console.error('❌ ❌ ❌ ERRO em handleContinuarComo:', {
        message: errObj?.message,
        code: errObj?.code,
        status: errObj?.status,
        fullError: err,
      });

      console.log('📵 Fallback: Abrindo login de novo');
      onClose();
      if (savedUser?.phone) {
        console.log('📞 → Abrindo /auth/telefone');
        router.push('/auth/telefone');
      } else {
        console.log('📧 → Abrindo /auth/login');
        router.push({ pathname: '/auth/login', params: { email: savedUser?.email || '' } });
      }
    }
  }

  function handleCriarConta() {
    onClose();
    router.push('/auth/login');
  }

  // Estado C: escolha de Celular ou E-mail.
  function handleEscolherCelular() {
    onClose();
    router.push('/auth/telefone');
  }

  function handleEscolherEmail() {
    onClose();
    router.push('/auth/login');
  }

  async function handleGoogle() {
    const result = await signInWithGoogle();
    if (result.success) {
      onClose();
      router.replace('/');
    } else if (!result.cancelled) {
      showThemedAlert('Erro no login', result.error || 'Não foi possível conectar com o Google.');
    }
  }

  async function handleFacebook() {
    const result = await signInWithFacebook();
    if (result.success) {
      onClose();
      router.replace('/');
    } else if (!result.cancelled) {
      showThemedAlert('Erro no login', result.error || 'Não foi possível conectar com o Facebook.');
    }
  }

  function handleContactSupport() {
    // TODO: confirmar número real do WhatsApp de suporte
    Linking.openURL('https://wa.me/5500000000000');
  }

  function handleLayoutA(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    setHeightA((prev) => (prev !== h ? h : prev));
  }

  function handleLayoutB(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    setHeightB((prev) => (prev !== h ? h : prev));
  }

  function handleLayoutC(e: LayoutChangeEvent) {
    const h = e.nativeEvent.layout.height;
    setHeightC((prev) => (prev !== h ? h : prev));
  }

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const imageStyle = useAnimatedStyle(() => {
    if (panelHeight.value > 0) {
      // Math.max garante que a foto nunca fica curta demais lá em cima
      // (sempre cobre no mínimo até a status bar), mesmo se o painel de
      // baixo (Estado A/B/C) ficar muito alto e "comer" quase toda a tela.
      const computed = SCREEN_HEIGHT - panelHeight.value + IMAGE_OVERLAP;
      return { height: Math.max(computed, insets.top + IMAGE_OVERLAP) };
    }
    return { height: IMAGE_HEIGHT_FALLBACK };
  });

  const panelStyle = useAnimatedStyle(() => ({
    height: panelHeight.value > 0 ? panelHeight.value : undefined,
  }));

  const blockAStyle = useAnimatedStyle(() => ({
    opacity: opacityA.value,
    transform: [{ translateY: translateYA.value }],
  }));

  const blockBStyle = useAnimatedStyle(() => ({
    opacity: opacityB.value,
    transform: [{ translateY: translateYB.value }],
  }));

  const blockCStyle = useAnimatedStyle(() => ({
    opacity: opacityC.value,
    transform: [{ translateY: translateYC.value }],
  }));

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, backdropStyle]} pointerEvents="none" />

      <Animated.View style={[styles.sheet, sheetStyle]}>
        {/* Imagem grande no topo, altura exata calculada da largura real da tela (9:16) */}
        <Animated.Image
          source={require('../assets/loginfoto.jpeg')}
          style={[styles.image, { width: SCREEN_WIDTH }, imageStyle]}
          resizeMode="cover"
        />

        {/* No Estado C o botão volta pra A em vez de fechar o sheet inteiro. */}
        <Pressable
          style={[styles.backBtn, { top: insets.top + 8 }]}
          onPress={() => (estado === 'C' ? handleVoltarDeComoContinuar() : onClose())}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </Pressable>

        <Pressable
          style={[styles.helpBtn, { top: insets.top + 8 }]}
          onPress={() => setHelpVisible(true)}
          hitSlop={8}
        >
          <Ionicons name="help" size={20} color="#FFFFFF" />
        </Pressable>

        {/* Painel flutua por cima da imagem. A altura é animada (panelStyle);
            os três blocos abaixo ficam sempre montados, sobrepostos, e só
            trocam de opacidade/posição — assim dá pra medir a altura de um
            enquanto outro está visível, sem pulos na troca. */}
        <Animated.View style={[styles.content, panelStyle]}>
          <Animated.View
            style={[styles.stateBlock, blockBStyle, { paddingBottom: bottomPadding }]}
            onLayout={handleLayoutB}
            pointerEvents={estado === 'B' && savedUser ? 'auto' : 'none'}
          >
            {savedUser ? (
              <>
                <Text style={styles.welcomeTitle}>Que bom te ver novamente</Text>

                <View style={styles.foundLoginRow}>
                  <View style={styles.avatarCircle}>
                    <Image
                      source={require('../assets/batatanacaixa.png')}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.foundLoginTextCol}>
                    <Text style={styles.foundLoginLabel}>Encontramos seu último login</Text>
                    <Text style={styles.foundLoginValue} numberOfLines={1}>
                      {savedUser.email || savedUser.phone}
                    </Text>
                  </View>
                </View>

                <Pressable style={styles.btnFilled} onPress={handleContinuarComo}>
                  <Text style={styles.btnFilledText}>Continuar</Text>
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>ou</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable style={styles.btnTextOnly} onPress={handleAcessarOutraConta} hitSlop={8}>
                  <Text style={styles.linkAccessOtherText}>Acessar de outra forma</Text>
                </Pressable>
              </>
            ) : null}
          </Animated.View>

          <Animated.View
            style={[styles.stateBlock, blockAStyle, { paddingBottom: bottomPadding }]}
            onLayout={handleLayoutA}
            pointerEvents={estado === 'A' ? 'auto' : 'none'}
          >
            <Pressable style={styles.btnFilled} onPress={handleJaTenhoConta}>
              <Text style={styles.btnFilledText}>Já tenho uma conta</Text>
            </Pressable>
            <Pressable style={styles.btnOutline} onPress={handleCriarConta}>
              <Text style={styles.btnOutlineText}>Criar nova conta</Text>
            </Pressable>

            <Text style={styles.acessarComText}>Acessar com</Text>
            <View style={styles.socialRow}>
              <Pressable style={styles.socialBtn} onPress={handleGoogle}>
                <Ionicons name="logo-google" size={22} color="#1A1A1A" />
              </Pressable>
              <Pressable style={styles.socialBtn} onPress={handleFacebook}>
                <Ionicons name="logo-facebook" size={22} color="#1A1A1A" />
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View
            style={[styles.stateBlock, blockCStyle, { paddingBottom: bottomPadding }]}
            onLayout={handleLayoutC}
            pointerEvents={estado === 'C' ? 'auto' : 'none'}
          >
            <Text style={styles.comoContinuarTitle}>Como deseja continuar?</Text>
            <Pressable style={styles.btnFilled} onPress={handleEscolherCelular}>
              <Text style={styles.btnFilledText}>Celular</Text>
            </Pressable>
            <Pressable style={styles.btnTextOnly} onPress={handleEscolherEmail} hitSlop={8}>
              <Text style={styles.btnTextOnlyLabel}>E-mail</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        onContactSupport={handleContactSupport}
      />

      <ThemedAlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(20,20,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    overflow: 'hidden',
  },
  // Cada bloco (Estado A / B / C) ocupa a largura toda e se posiciona no
  // topo do painel; é o `content` (panelStyle) que controla a altura visível.
  stateBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: SPACING[6],
    paddingTop: SPACING[6],
    paddingBottom: SPACING[8],
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
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  acessarComText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '600',
    marginTop: SPACING[5],
    marginBottom: SPACING[3],
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING[4],
  },
  socialBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Estado B — "Que bom te ver novamente"
  welcomeTitle: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  foundLoginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING[5],
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  foundLoginTextCol: {
    flex: 1,
  },
  foundLoginLabel: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginBottom: 2,
  },
  foundLoginValue: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING[5],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginHorizontal: SPACING[3],
  },
  linkAccessOtherText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  // Estado C — "Como deseja continuar?"
  comoContinuarTitle: {
    fontSize: TYPOGRAPHY.sizes.lg,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING[5],
  },
  btnTextOnly: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[2],
  },
  btnTextOnlyLabel: {
    // COLORS.accent (amarelo escuro) em vez de COLORS.primary — texto puro
    // amarelo-claro sobre fundo branco tem contraste ruim.
    color: COLORS.accent,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.base,
  },
});
