import { useRef, useCallback } from 'react';
import { Animated } from 'react-native';

export interface PressScaleOptions {
  pressInScale?: number;
  speedIn?: number;
  speedOut?: number;
}

/**
 * Hook reutilizável para feedback tátil ao toque (press/scale)
 * Replicando exatamente os parâmetros do Perfil (ProfileAccordionItem.js):
 * - scale down: toValue 0.985, speed 30
 * - scale up: toValue 1, speed 20
 */
export function usePressScale(options?: PressScaleOptions) {
  const pressInScale = options?.pressInScale ?? 0.985;
  const speedIn = options?.speedIn ?? 30;
  const speedOut = options?.speedOut ?? 20;

  const pressScale = useRef(new Animated.Value(1)).current;

  const onPressIn = useCallback(() => {
    Animated.spring(pressScale, {
      toValue: pressInScale,
      useNativeDriver: true,
      speed: speedIn,
    }).start();
  }, [pressInScale, speedIn, pressScale]);

  const onPressOut = useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: speedOut,
    }).start();
  }, [speedOut, pressScale]);

  return {
    pressScale,
    onPressIn,
    onPressOut,
    scaleStyle: { transform: [{ scale: pressScale }] },
  };
}

export default usePressScale;
