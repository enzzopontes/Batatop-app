/**
 * ThemedAlert.js
 *
 * Sistema unificado de feedback e alertas do app.
 *
 * - Erros e avisos (1 botão ou sem botões): renderizam como barrinha flutuante no topo
 *   (estilo login), sem bloquear a tela, sumindo sozinha após 3.5s sem precisar clicar OK.
 * - Confirmações (2+ botões, ex: Cancelar + Excluir): continuam em modal de confirmação.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Alert as RNAlert,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import { useModalFade } from '../hooks/useModalFade';

function isSuccessTone(title, message) {
  const t = String(title || '').toLowerCase().trim();
  const m = String(message || '').toLowerCase().trim();

  // 1. Se tiver qualquer termo de erro, falha, atenção, recusa ou impedimento -> NUNCA é sucesso (VERMELHO)
  if (
    t.includes('erro') ||
    t.includes('falha') ||
    t.includes('atenção') ||
    t.includes('atencao') ||
    t.includes('aviso') ||
    t.includes('alerta') ||
    t.includes('ops') ||
    t.includes('problema') ||
    t.includes('recus') ||
    t.includes('indispon') ||
    t.includes('obrigatór') ||
    t.includes('obrigator') ||
    t.includes('inválid') ||
    t.includes('invalid') ||
    m.includes('não foi possível') ||
    m.includes('nao foi possivel') ||
    m.includes('erro ao') ||
    m.includes('falha ao') ||
    m.includes('inválid') ||
    m.includes('invalid') ||
    m.includes('expirad') ||
    m.includes('obrigatór') ||
    m.includes('obrigator') ||
    m.includes('ocorreu um erro') ||
    m.includes('tente novamente') ||
    m.includes('deve ser maior') ||
    m.includes('já existe') ||
    m.includes('ja existe') ||
    m.includes('não pode') ||
    m.includes('nao pode') ||
    m.includes('recusad')
  ) {
    return false;
  }

  // 2. Só é sucesso se o título for explicitamente positivo ou a mensagem for estritamente de sucesso
  return (
    t === 'sucesso' ||
    t === 'pronto' ||
    t === 'parabéns' ||
    t === 'parabens' ||
    t === 'salvo' ||
    t.startsWith('sucesso') ||
    t.includes('copiad') ||
    t.includes('enviad') ||
    t.includes('ativad') ||
    m.includes('com sucesso') ||
    m.includes('copiad') ||
    m.includes('obrigado')
  );
}

// Intercepta chamadas legadas ao Alert.alert nativo para padronizar com a barrinha no topo
if (RNAlert && typeof RNAlert.alert === 'function' && !RNAlert.__batataPatched) {
  RNAlert.alert = (title, message, buttons, options) => {
    const isSuccess = options?.type === 'success' || isSuccessTone(title, message);
    showThemedAlert(title, message, buttons, isSuccess ? 'success' : 'error');
  };
  RNAlert.__batataPatched = true;
}

const listeners = new Set();

export function showThemedAlert(title, message, buttons = [{ text: 'OK' }], type) {
  const resolvedType = type || (isSuccessTone(title, message) ? 'success' : 'error');
  const listenerArray = Array.from(listeners);
  if (listenerArray.length > 0) {
    const activeListener = listenerArray[listenerArray.length - 1];
    activeListener({ title, message, buttons, type: resolvedType });
  }
}

export function hideThemedAlert() {
  const listenerArray = Array.from(listeners);
  if (listenerArray.length > 0) {
    const activeListener = listenerArray[listenerArray.length - 1];
    activeListener({ hide: true });
  }
}

export function showSuccessAlert(message, title = 'Sucesso') {
  showThemedAlert(title, message, [{ text: 'OK' }], 'success');
}

export function showErrorAlert(message, title = 'Erro') {
  showThemedAlert(title, message, [{ text: 'OK' }], 'error');
}

showThemedAlert.error = showErrorAlert;
showThemedAlert.success = showSuccessAlert;

// Globais para permitir chamada direta showSuccessAlert(...) ou showErrorAlert(...) em qualquer tela
if (typeof global !== 'undefined') {
  global.showSuccessAlert = showSuccessAlert;
  global.showErrorAlert = showErrorAlert;
}

export function ThemedAlertHost() {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState(null);
  const [modalConfig, setModalConfig] = useState(null);

  const translateY = useRef(new Animated.Value(-120)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef(null);

  // Animação de saída: desce um pouquinho (pulinho pra baixo) e sobe rápido encolhendo
  const hideBanner = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.sequence([
      // 1. Pulinho de antecipação
      Animated.timing(translateY, {
        toValue: 8,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // 2. Dispara pra cima saindo da tela e desaparece
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -140,
          duration: 210,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.88,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 170,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setBanner(null);
    });
  }, [translateY, scale, opacity]);

  const showBanner = useCallback((bannerData, type = 'error') => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    const payload = typeof bannerData === 'string'
      ? { text: bannerData, type }
      : { ...bannerData, type: bannerData.type || type };

    setBanner(payload);
    translateY.setValue(-100);
    scale.setValue(0.92);
    opacity.setValue(0);

    try {
      if (payload.type === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (_) {}

    Animated.parallel([
      // Animação de entrada elástica estilo iFood
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: 12,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          bounciness: 7,
          speed: 12,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(scale, {
        toValue: 1,
        bounciness: 6,
        speed: 14,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimerRef.current = setTimeout(() => {
      hideBanner();
    }, 3800);
  }, [translateY, scale, opacity, hideBanner]);

  useEffect(() => {
    const handleAlert = (payload) => {
      if (payload?.hide) {
        hideBanner();
        return;
      }
      const { title, message, buttons, type } = payload || {};
      // Se for apenas notificação/erro (0 ou 1 botão sem callback específico de confirmação)
      const isSimpleAlert =
        !buttons ||
        buttons.length === 0 ||
        (buttons.length === 1 && (!buttons[0].onPress || buttons[0].style === 'cancel' || buttons[0].text === 'OK'));

      if (isSimpleAlert) {
        // Formatar texto limpo para o banner no topo
        let text = message || title || 'Algo deu errado. Tente novamente.';
        let displayTitle = null;
        if (title && message && !['Erro', 'Atenção', 'Alerta', 'Aviso', 'Ops!'].includes(title)) {
          displayTitle = title;
        }
        showBanner({ title: displayTitle, message: message || text, text, type }, type);
      } else {
        // Confirmação interativa com múltiplos botões (ex: Cancelar / Remover)
        setModalConfig({ title, message, buttons });
      }
    };

    listeners.add(handleAlert);
    return () => {
      listeners.delete(handleAlert);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showBanner, hideBanner]);

  const { mounted, fadeAnim } = useModalFade(!!modalConfig);
  const modalConfigRef = useRef(modalConfig);
  if (modalConfig) modalConfigRef.current = modalConfig;
  const activeConfig = modalConfig || modalConfigRef.current;

  const handleModalPress = (btn) => {
    setModalConfig(null);
    btn.onPress?.();
  };

  return (
    <>
      {/* ── Banner Flutuante Superior (Estilo iFood: sem travar a tela, auto-dismiss, animação elástica) ── */}
      {banner && (
        <View
          pointerEvents="box-none"
          style={[styles.bannerWrapper, { top: Math.max(insets.top, 12) + 8 }]}
        >
          <Animated.View
            style={[
              styles.banner,
              banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
              { opacity, transform: [{ translateY }, { scale }] },
            ]}
          >
            <Pressable
              style={styles.bannerInner}
              onPress={hideBanner}
            >
              <View style={styles.iconCircle}>
                <Ionicons
                  name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                  size={20}
                  color={COLORS.white}
                />
              </View>
              <View style={styles.bannerTextContainer}>
                {!!banner.title && (
                  <Text style={styles.bannerTitle} numberOfLines={1}>
                    {banner.title}
                  </Text>
                )}
                <Text style={styles.bannerText} numberOfLines={3}>
                  {banner.message || banner.text}
                </Text>
              </View>
              <View style={styles.closeBtn}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
              </View>
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* ── Modal de Confirmação (Apenas para ações que exigem escolha do usuário) ── */}
      {mounted && activeConfig && (
        <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setModalConfig(null)}>
          <SafeAreaProvider>
            <View style={a.overlay}>
              <Animated.View style={[a.backdrop, { opacity: fadeAnim }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalConfig(null)} />
              </Animated.View>
              <Animated.View style={[a.cardWrap, { opacity: fadeAnim }]}>
                <View style={a.card}>
                  <Text style={a.title}>{activeConfig.title}</Text>
                  {!!activeConfig.message && <Text style={a.message}>{activeConfig.message}</Text>}

                  <View style={[a.actions, activeConfig.buttons?.length > 2 && a.actionsColumn]}>
                    {activeConfig.buttons?.map((btn, i) => (
                      <Pressable
                        key={i}
                        style={({ pressed }) => [
                          a.btn,
                          btn.style === 'cancel' && a.btnCancel,
                          btn.style === 'destructive' && a.btnDestructive,
                          btn.style !== 'cancel' && btn.style !== 'destructive' && a.btnDefault,
                          pressed && a.btnPressed,
                        ]}
                        onPress={() => handleModalPress(btn)}
                      >
                        <Text
                          style={[
                            a.btnText,
                            btn.style === 'cancel' && a.btnTextCancel,
                            btn.style === 'destructive' && a.btnTextDestructive,
                            btn.style !== 'cancel' && btn.style !== 'destructive' && a.btnTextDefault,
                          ]}
                        >
                          {btn.text}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Animated.View>
            </View>
          </SafeAreaProvider>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bannerWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999999,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerError: {
    backgroundColor: '#EA1D2C', // Vermelho vibrante estilo iFood
  },
  bannerSuccess: {
    backgroundColor: '#27AE60',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bannerTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  bannerTitle: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  bannerText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    opacity: 0.95,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

const a = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cardWrap: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.backgroundCard ?? COLORS.background,
    borderRadius: RADIUS.lg,
    padding: SPACING[5],
  },
  title: {
    color: COLORS.text,
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
    marginBottom: SPACING[2],
  },
  message: {
    color: COLORS.textSecondary,
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 20,
    marginBottom: SPACING[5],
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING[3],
  },
  actionsColumn: {
    flexDirection: 'column-reverse',
  },
  btn: {
    paddingVertical: SPACING[3],
    paddingHorizontal: SPACING[4],
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  btnDefault: {
    backgroundColor: COLORS.primary,
  },
  btnCancel: {
    backgroundColor: COLORS.backgroundElevated,
  },
  btnDestructive: {
    backgroundColor: '#EF4444',
  },
  btnText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: '700',
  },
  btnTextDefault: {
    color: COLORS.text,
  },
  btnTextCancel: {
    color: COLORS.textSecondary,
  },
  btnTextDestructive: {
    color: '#FFFFFF',
  },
});
