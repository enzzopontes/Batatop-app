import { useState, useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * Hook reutilizável para gerenciar o ciclo de vida e a animação de fade do backdrop/modal.
 *
 * Fade-in suave de 180ms (ease-out).
 * Fade-out suave de 130ms (ease-in).
 * Mantém o Modal montado durante o fade-out e só desmonta quando a animação conclui.
 */
export function useModalFade(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setMounted(false);
        }
      });
    }
  }, [visible, fadeAnim]);

  return { mounted, fadeAnim };
}
