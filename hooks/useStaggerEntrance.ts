import { useRef, useEffect, useCallback } from 'react';
import { Animated } from 'react-native';

export interface StaggerEntranceOptions {
  staggerDelay?: number;
  friction?: number;
  tension?: number;
  translateYOffset?: number;
}

/**
 * Hook reutilizável para entrada em cascata (stagger) de itens
 * Replicando exatamente os parâmetros do Perfil (ProfileAccordionItem.js):
 * - stagger: 45ms
 * - spring: friction 8, tension 70
 * - fade: opacity 0 -> 1
 * - slide: translateY -6 -> 0
 */
export function useStaggerEntrance(
  count: number,
  active: boolean,
  options?: StaggerEntranceOptions
) {
  const staggerDelay = options?.staggerDelay ?? 45;
  const friction = options?.friction ?? 8;
  const tension = options?.tension ?? 70;
  const translateYOffset = options?.translateYOffset ?? -6;

  const anims = useRef<Animated.Value[]>([]);

  // Garante array com a quantidade exata de itens
  if (anims.current.length !== count) {
    anims.current = Array.from({ length: count }, () => new Animated.Value(0));
  }

  const reset = useCallback(() => {
    anims.current.forEach((val) => val.setValue(0));
  }, []);

  const trigger = useCallback(() => {
    reset();
    Animated.stagger(
      staggerDelay,
      anims.current.map((val) =>
        Animated.spring(val, {
          toValue: 1,
          useNativeDriver: true,
          friction,
          tension,
        })
      )
    ).start();
  }, [staggerDelay, friction, tension, reset]);

  useEffect(() => {
    if (active) {
      trigger();
    } else {
      reset();
    }
  }, [active, trigger, reset]);

  const getItemStyle = useCallback(
    (index: number) => {
      const anim = anims.current[index];
      if (!anim) return {};

      return {
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [translateYOffset, 0],
            }),
          },
        ],
      };
    },
    [translateYOffset]
  );

  return {
    getItemStyle,
    reset,
    trigger,
    anims: anims.current,
  };
}

export default useStaggerEntrance;
