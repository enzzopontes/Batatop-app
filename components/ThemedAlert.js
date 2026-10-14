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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';

// Intercepta chamadas legadas ao Alert.alert nativo para padronizar com a barrinha no topo
if (RNAlert && typeof RNAlert.alert === 'function' && !RNAlert.__batataPatched) {
  RNAlert.alert = (title, message, buttons, options) => {
    showThemedAlert(title, message, buttons);
  };
  RNAlert.__batataPatched = true;
}

const listeners = new Set();

export function showThemedAlert(title, message, buttons = [{ text: 'OK' }], type = 'error') {
  listeners.forEach((listener) => listener({ title, message, buttons, type }));
}

showThemedAlert.error = (message, title = '') => {
  showThemedAlert(title, message, [{ text: 'OK' }], 'error');
};

showThemedAlert.success = (message, title = '') => {
  showThemedAlert(title, message, [{ text: 'OK' }], 'success');
};

export function ThemedAlertHost() {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState(null);
  const [modalConfig, setModalConfig] = useState(null);

  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef(null);

  // Animação de saída: desce um pouquinho (pulinho pra baixo) e sobe com tudo pra cima
  const hideBanner = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.sequence([
      // 1. Pulinho de antecipação: desce um pouco pra baixo
      Animated.timing(translateY, {
        toValue: 14,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // 2. Dispara pra cima saindo da tela e desaparece
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -140,
          duration: 220,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      setBanner(null);
    });
  }, [translateY, opacity]);

  const showBanner = useCallback((text, type = 'error') => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    setBanner({ text, type });
    translateY.setValue(-120);
    opacity.setValue(0);

    Animated.parallel([
      // Animação de entrada: desce com tudo de cima, dá um pulinho pra baixo e assenta na posição
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: 14,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          bounciness: 6,
          speed: 12,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimerRef.current = setTimeout(() => {
      hideBanner();
    }, 3500);
  }, [translateY, opacity, hideBanner]);

  useEffect(() => {
    const handleAlert = ({ title, message, buttons, type }) => {
      // Se for apenas notificação/erro (0 ou 1 botão sem callback específico de confirmação)
      const isSimpleAlert =
        !buttons ||
        buttons.length === 0 ||
        (buttons.length === 1 && (!buttons[0].onPress || buttons[0].style === 'cancel' || buttons[0].text === 'OK'));

      if (isSimpleAlert) {
        // Formatar texto limpo para o banner no topo
        let text = message || title || 'Algo deu errado. Tente novamente.';
        if (title && message && !['Erro', 'Atenção', 'Alerta', 'Aviso', 'Ops!'].includes(title)) {
          if (!message.toLowerCase().includes(title.toLowerCase())) {
            text = `${title}: ${message}`;
          }
        }
        showBanner(text, type);
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
  }, [showBanner]);

  const handleModalPress = (btn) => {
    setModalConfig(null);
    btn.onPress?.();
  };

  return (
    <>
      {/* ── Banner Flutuante Superior (Estilo Login: sem travar a tela, auto-dismiss) ── */}
      {banner && (
        <View
          pointerEvents="box-none"
          style={[styles.bannerWrapper, { top: Math.max(insets.top, 12) + 8 }]}
        >
          <Animated.View
            style={[
              styles.banner,
              banner.type === 'error' ? styles.bannerError : styles.bannerSuccess,
              { opacity, transform: [{ translateY }] },
            ]}
          >
            <Pressable
              style={styles.bannerInner}
              onPress={hideBanner}
            >
              <Ionicons
                name={banner.type === 'error' ? 'alert-circle' : 'checkmark-circle'}
                size={20}
                color={COLORS.white}
              />
              <Text style={styles.bannerText} numberOfLines={3}>
                {banner.text}
              </Text>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </Animated.View>
        </View>
      )}

      {/* ── Modal de Confirmação (Apenas para ações que exigem escolha do usuário) ── */}
      {modalConfig && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setModalConfig(null)}>
          <View style={a.overlay}>
            <View style={a.card}>
              <Text style={a.title}>{modalConfig.title}</Text>
              {!!modalConfig.message && <Text style={a.message}>{modalConfig.message}</Text>}

              <View style={[a.actions, modalConfig.buttons?.length > 2 && a.actionsColumn]}>
                {modalConfig.buttons?.map((btn, i) => (
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
          </View>
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
    borderRadius: 12,
    ...SHADOWS.md,
  },
  bannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
    lineHeight: 19,
  },
});

const a = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
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
