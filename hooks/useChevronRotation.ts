import { useRef, useEffect } from 'react';
import { Animated } from 'react-native';

export interface ChevronRotationOptions {
  friction?: number;
  tension?: number;
}

/**
 * Hook reutilizável para rotação de chevron/ícone em accordion
 * Replicando exatamente os parâmetros do Perfil (ProfileAccordionItem.js):
 * - spring: friction 7, tension 60
 * - rotação: 0deg a 180deg
 */
export function useChevronRotation(expanded: boolean, options?: ChevronRotationOptions) {
  const friction = options?.friction ?? 7;
  const tension = options?.tension ?? 60;
  const rotateAnim = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(rotateAnim, {
      toValue: expanded ? 1 : 0,
      useNativeDriver: true,
      friction,
      tension,
    }).start();
  }, [expanded, friction, tension, rotateAnim]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return {
    rotateAnim,
    rotate,
    rotateStyle: { transform: [{ rotate }] },
  };
}

export default useChevronRotation;
