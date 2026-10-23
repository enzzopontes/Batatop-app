import React, { useRef, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Easing,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useModalFade } from '../hooks/useModalFade';
import { useBottomInset } from '../hooks/useBottomInset';

export interface SwipeableBottomSheetModalProps {
  visible: boolean;
  onRequestClose?: () => void;
  onClose?: () => void;
  children: React.ReactNode;
  backdropColor?: string;
  showHandle?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  minBottomPadding?: number;
  extraBottomPadding?: number;
  scrollable?: boolean;
  isAtTop?: boolean;
}

const OFFSCREEN_Y = 700;

/**
 * Componente base de Bottom Sheet com:
 * 1. Backdrop com fade suave (180ms in / 130ms out) cobrindo status bar e navigation bar.
 * 2. Arraste para baixo (swipe-to-dismiss) com fade proporcional no backdrop e spring de retorno.
 * 3. Animação de saída unificada: desce para fora da tela e só desmonta após concluir, sem solavancos.
 * 4. Handle discreto centralizado no topo.
 * 5. Adaptação universal à barra de navegação (Android 3 botões, gestos e iOS home indicator).
 * 6. statusBarTranslucent e navigationBarTranslucent para escurecimento de tela inteira.
 */
export default function SwipeableBottomSheetModal({
  visible,
  onRequestClose,
  onClose,
  children,
  backdropColor = 'rgba(0,0,0,0.5)',
  showHandle = true,
  contentStyle,
  contentContainerStyle,
  minBottomPadding = 16,
  extraBottomPadding = 0,
  scrollable = false,
  isAtTop = true,
}: SwipeableBottomSheetModalProps) {
  const [mounted, setMounted] = React.useState(visible);
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible ? 0 : OFFSCREEN_Y)).current;

  const isClosingRef = useRef(false);
  const isAtTopRef = useRef(isAtTop);
  isAtTopRef.current = isAtTop;

  const handleClose = onRequestClose || onClose || (() => {});
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  const closeModal = React.useCallback((invokeCallback = true) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    translateY.stopAnimation();
    fadeAnim.stopAnimation();

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: OFFSCREEN_Y,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 140,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      setMounted(false);
      if (invokeCallback) {
        handleCloseRef.current();
      }
    });
  }, [fadeAnim, translateY]);

  useEffect(() => {
    if (visible) {
      isClosingRef.current = false;
      setMounted(true);
      translateY.stopAnimation();
      fadeAnim.stopAnimation();
      translateY.setValue(OFFSCREEN_Y);
      fadeAnim.setValue(0);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted && !isClosingRef.current) {
      // Parent set visible = false: run exit animation without re-invoking callback
      closeModal(false);
    }
  }, [visible, mounted, closeModal, fadeAnim, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (gestureState.dy <= 6 || isClosingRef.current) return false;
        if (scrollable) {
          return isAtTopRef.current && gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.5;
        }
        return gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (isClosingRef.current) return;
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          translateY.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isClosingRef.current) return;
        if (gestureState.dy > 80 || gestureState.vy > 0.35) {
          closeModal(true);
        } else {
          translateY.stopAnimation();
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (isClosingRef.current) return;
        translateY.stopAnimation();
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // PanResponder exclusivo do handle (sempre ativo para arrastar a partir do topo)
  const handlePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        translateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (isClosingRef.current) return;
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        } else {
          translateY.setValue(0);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isClosingRef.current) return;
        if (gestureState.dy > 80 || gestureState.vy > 0.35) {
          closeModal(true);
        } else {
          translateY.stopAnimation();
          Animated.spring(translateY, {
            toValue: 0,
            friction: 8,
            tension: 65,
            useNativeDriver: true,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (isClosingRef.current) return;
        translateY.stopAnimation();
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  if (!mounted && !visible) return null;

  // Opacidade do backdrop diminui suavemente conforme o modal é puxado pra baixo
  const backdropOpacity = Animated.multiply(
    fadeAnim,
    translateY.interpolate({
      inputRange: [0, 250],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    })
  );

  const handleDismiss = () => {
    closeModal(true);
  };

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleDismiss}
    >
      <SafeAreaProvider>
        <View style={styles.overlay}>
          {/* Fundo escuro fixo em tela cheia com fade */}
          <Animated.View
            style={[
              styles.backdrop,
              { backgroundColor: backdropColor, opacity: backdropOpacity },
            ]}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
          </Animated.View>

          {/* Conteúdo animado que desce no arraste */}
          <SheetInner
            contentStyle={contentStyle}
            contentContainerStyle={contentContainerStyle}
            minBottomPadding={minBottomPadding}
            extraBottomPadding={extraBottomPadding}
            panHandlers={!scrollable ? panResponder.panHandlers : undefined}
            handlePanHandlers={handlePanResponder.panHandlers}
            showHandle={showHandle}
            translateY={translateY}
          >
            {children}
          </SheetInner>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

interface SheetInnerProps {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  minBottomPadding: number;
  extraBottomPadding: number;
  panHandlers?: any;
  handlePanHandlers?: any;
  showHandle?: boolean;
  translateY: Animated.Value;
}

function SheetInner({
  children,
  contentStyle,
  contentContainerStyle,
  minBottomPadding,
  extraBottomPadding,
  panHandlers,
  handlePanHandlers,
  showHandle,
  translateY,
}: SheetInnerProps) {
  const bottomInset = useBottomInset(minBottomPadding) + extraBottomPadding;
  const flattened = StyleSheet.flatten([contentStyle, contentContainerStyle]) || {};
  const explicitBottom =
    (flattened.paddingBottom as number) ??
    (flattened.paddingVertical as number) ??
    (flattened.padding as number) ??
    0;
  const effectiveBottomPadding = Math.max(bottomInset, explicitBottom);

  return (
    <Animated.View
      style={[
        styles.sheetContainer,
        contentStyle,
        contentContainerStyle,
        {
          paddingBottom: effectiveBottomPadding,
          transform: [{ translateY }],
        },
      ]}
      {...(panHandlers || {})}
    >
      {showHandle && (
        <View style={styles.handleWrapper} {...(handlePanHandlers || {})}>
          <View style={styles.handle} />
        </View>
      )}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  handleWrapper: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D4D4D8',
  },
});
