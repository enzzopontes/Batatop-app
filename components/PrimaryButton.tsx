import React, { useEffect } from 'react';
import {
  Text,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { COLORS, RADIUS } from '../constants/theme';
import RipplePressable from './cart/RipplePressable';
import ThreeDotsLoader from './ThreeDotsLoader';

export interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  isLoading?: boolean;
  badge?: string | number | null;
  leftIcon?: React.ReactNode;
  rightText?: string;
  spaceBetween?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

/**
 * Componente canônico de Botão Primário do Batata Top.
 * Garante fidelidade ao token COLORS.primary, efeito Ripple amarelo escuro (COLORS.accent)
 * originado rigorosamente nas coordenadas do toque e transição suave para estado de carregamento.
 */
export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  isLoading,
  badge = null,
  leftIcon,
  rightText,
  spaceBetween = false,
  style,
  textStyle,
  fullWidth = false,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const isBusy = loading || !!isLoading;
  const isActionDisabled = disabled || isBusy;

  // Transição de loading suave na UI thread
  const loadingProgress = useSharedValue(isBusy ? 1 : 0);

  useEffect(() => {
    loadingProgress.value = withTiming(isBusy ? 1 : 0, {
      duration: 250,
      easing: Easing.inOut(Easing.quad),
    });
  }, [isBusy, loadingProgress]);

  const animatedContentStyle = useAnimatedStyle(() => {
    return {
      opacity: 1 - loadingProgress.value,
      transform: [{ scale: 1 - loadingProgress.value * 0.05 }],
    };
  });

  const animatedLoaderStyle = useAnimatedStyle(() => {
    return {
      opacity: loadingProgress.value,
      transform: [{ scale: 0.8 + loadingProgress.value * 0.2 }],
    };
  });

  return (
    <RipplePressable
      style={[
        styles.button,
        fullWidth && styles.fullWidth,
        isActionDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={isActionDisabled}
      rippleColor="rgba(181, 134, 10, 0.45)"
      accessibilityRole="button"
      accessibilityState={{ disabled: isActionDisabled, busy: isBusy }}
      accessibilityLabel={accessibilityLabel || title}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.loaderContainer, animatedLoaderStyle]}
      >
        <ThreeDotsLoader color={COLORS.white} dotSize={7} gap={6} />
      </Animated.View>

      <Animated.View
        style={[
          styles.contentWrapper,
          spaceBetween && styles.spaceBetweenWrapper,
          animatedContentStyle,
        ]}
        pointerEvents={isBusy ? 'none' : 'auto'}
      >
        {spaceBetween ? (
          <View style={styles.spaceBetweenContainer}>
            <View style={styles.leftGroup}>
              {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
              <Text style={[styles.title, textStyle]}>{title}</Text>
            </View>
            {badge != null && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
            {rightText && <Text style={[styles.rightText, textStyle]}>{rightText}</Text>}
          </View>
        ) : (
          <>
            {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
            <Text style={[styles.title, textStyle]}>{title}</Text>
            {badge != null && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
            {rightText && <Text style={[styles.rightText, textStyle]}>{rightText}</Text>}
          </>
        )}
      </Animated.View>
    </RipplePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.primary,
    height: 44,
    paddingHorizontal: 24,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  contentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
  spaceBetweenWrapper: {
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.6,
  },
  leftIconContainer: {
    marginRight: 4,
  },
  spaceBetweenContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
  },
  rightText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 6,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
});
