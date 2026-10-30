import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
  LayoutChangeEvent,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { COLORS, RADIUS, TYPOGRAPHY } from '../constants/theme';
import ThreeDotsLoader from './ThreeDotsLoader';

export interface RippleButtonProps {
  title?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  loading?: boolean;
  rippleColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  rightText?: string;
  badge?: string | number | null;
  spaceBetween?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  loaderColor?: string;
}

/**
 * RippleButton - Botão canônico com efeito de onda (Ripple) de alta performance (60fps)
 * usando react-native-gesture-handler e react-native-reanimated.
 *
 * A onda expande radialmente partindo EXATAMENTE do ponto (X, Y) do toque interno
 * até cobrir 100% da área do botão, com recorte perfeito (overflow: hidden)
 * e transição suave para estado de carregamento (loading).
 */
export default function RippleButton({
  title,
  children,
  onPress,
  disabled = false,
  isLoading = false,
  loading,
  rippleColor = 'rgba(181, 134, 10, 0.45)', // Amarelo escuro calibrado (COLORS.accent)
  style,
  textStyle,
  leftIcon,
  rightIcon,
  rightText,
  badge = null,
  spaceBetween = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  loaderColor = COLORS.white,
}: RippleButtonProps) {
  const activeLoading = loading !== undefined ? loading : isLoading;
  const isActionDisabled = disabled || activeLoading;

  // Dimensões do botão mantidas na UI thread via shared values
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  // Coordenadas e dinâmica do ripple
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const rippleRadius = useSharedValue(0);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);

  // Transição de carregamento
  const loadingProgress = useSharedValue(activeLoading ? 1 : 0);

  useEffect(() => {
    loadingProgress.value = withTiming(activeLoading ? 1 : 0, {
      duration: 260,
      easing: Easing.inOut(Easing.quad),
    });
  }, [activeLoading, loadingProgress]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    width.value = w;
    height.value = h;
  };

  const handlePressAction = () => {
    if (!isActionDisabled && onPress) {
      onPress();
    }
  };

  const tapGesture = Gesture.Tap()
    .enabled(!isActionDisabled)
    .maxDuration(10000)
    .shouldCancelWhenOutside(true)
    .onBegin((e) => {
      'worklet';
      // Captura precisa das coordenadas internas relativas à superfície do botão
      originX.value = e.x;
      originY.value = e.y;

      // Raio máximo exato para cobrir os quatro cantos do retângulo
      const w = width.value > 0 ? width.value : 100;
      const h = height.value > 0 ? height.value : 44;
      const dx = Math.max(e.x, w - e.x);
      const dy = Math.max(e.y, h - e.y);
      rippleRadius.value = Math.sqrt(dx * dx + dy * dy);

      // Inicia a onda a partir de escala 0
      rippleScale.value = 0;
      rippleOpacity.value = 1;

      rippleScale.value = withTiming(1, {
        duration: 360,
        easing: Easing.out(Easing.quad),
      });

      rippleOpacity.value = withTiming(0, {
        duration: 440,
        easing: Easing.out(Easing.quad),
      });
    })
    .onEnd((_e, success) => {
      'worklet';
      if (success) {
        runOnJS(handlePressAction)();
      }
    });

  const animatedRippleStyle = useAnimatedStyle(() => {
    const r = rippleRadius.value;
    const d = r * 2;
    return {
      position: 'absolute',
      width: d,
      height: d,
      borderRadius: r,
      left: originX.value - r,
      top: originY.value - r,
      backgroundColor: rippleColor,
      opacity: rippleOpacity.value,
      transform: [{ scale: rippleScale.value }],
    };
  });

  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - loadingProgress.value,
      transform: [{ scale: 1 - loadingProgress.value * 0.05 }],
    };
  });

  const animatedLoaderStyle = useAnimatedStyle(() => {
    return {
      opacity: loadingProgress.value,
      transform: [{ scale: 0.75 + loadingProgress.value * 0.25 }],
    };
  });

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View
        onLayout={handleLayout}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled: isActionDisabled, busy: activeLoading }}
        accessibilityLabel={accessibilityLabel || title}
        style={[
          styles.buttonBase,
          fullWidth && styles.fullWidth,
          isActionDisabled && styles.disabled,
          style,
        ]}
      >
        {/* Camada do Ripple com expansão radial calibrada */}
        <Animated.View pointerEvents="none" style={animatedRippleStyle} />

        {/* Camada do Carregamento com transição fluida */}
        <Animated.View
          pointerEvents="none"
          style={[styles.loaderOverlay, animatedLoaderStyle]}
        >
          <ThreeDotsLoader color={loaderColor} dotSize={7} gap={6} />
        </Animated.View>

        {/* Conteúdo textual / customizado */}
        <Animated.View
          pointerEvents={activeLoading ? 'none' : 'box-none'}
          style={[
            styles.contentContainer,
            spaceBetween && styles.spaceBetweenContainer,
            animatedContentStyle,
          ]}
        >
          {children ? (
            children
          ) : spaceBetween ? (
            <View style={styles.spaceBetweenInner}>
              <View style={styles.leftGroup}>
                {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
                {title && <Text style={[styles.title, textStyle]}>{title}</Text>}
              </View>
              {badge != null && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
              {rightText && <Text style={[styles.rightText, textStyle]}>{rightText}</Text>}
              {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
            </View>
          ) : (
            <View style={styles.defaultInner}>
              {leftIcon && <View style={styles.iconContainer}>{leftIcon}</View>}
              {title && <Text style={[styles.title, textStyle]}>{title}</Text>}
              {badge != null && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
              {rightText && <Text style={[styles.rightText, textStyle]}>{rightText}</Text>}
              {rightIcon && <View style={styles.iconContainer}>{rightIcon}</View>}
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    backgroundColor: COLORS.primary,
    height: 44,
    borderRadius: RADIUS.full,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  contentContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  spaceBetweenContainer: {
    width: '100%',
  },
  spaceBetweenInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  defaultInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.md,
    fontWeight: '700',
    textAlign: 'center',
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderRadius: RADIUS.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '800',
  },
  rightText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.md,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
