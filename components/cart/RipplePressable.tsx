import React, { useState } from 'react';
import { StyleSheet, Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

interface RipplePressableProps extends Omit<PressableProps, 'style'> {
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  rippleColor?: string;
  overflowHidden?: boolean;
}

/**
 * RipplePressable — Botão com efeito de onda/ripple onde o toque do usuário
 * cria uma onda circular que se espalha a partir do ponto clicado (locationX/Y),
 * idêntico ao efeito utilizado no sistema de mapas/endereços (FavPill em addresses.js).
 */
export default function RipplePressable({
  children,
  style,
  rippleColor = 'rgba(0, 0, 0, 0.14)',
  overflowHidden = true,
  onPressIn,
  ...props
}: RipplePressableProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const progress = useSharedValue(0);

  const handlePressIn = (e: any) => {
    originX.value = e.nativeEvent?.locationX ?? (size.w / 2);
    originY.value = e.nativeEvent?.locationY ?? (size.h / 2);
    progress.value = 0;
    progress.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
    if (onPressIn) onPressIn(e);
  };

  const rippleStyle = useAnimatedStyle(() => {
    const d = Math.max(size.w, size.h, 40) * 2.4;
    return {
      width: d,
      height: d,
      borderRadius: d / 2,
      left: originX.value - d / 2,
      top: originY.value - d / 2,
      opacity: (1 - progress.value) * 0.9,
      transform: [{ scale: progress.value }],
    };
  });

  return (
    <Pressable
      {...props}
      onPressIn={handlePressIn}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      style={(state) => [
        overflowHidden && styles.overflow,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {state => (
        <>
          <Animated.View
            style={[styles.ripple, { backgroundColor: rippleColor }, rippleStyle]}
            pointerEvents="none"
          />
          {typeof children === 'function' ? children(state) : children}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overflow: {
    overflow: 'hidden',
  },
  ripple: {
    position: 'absolute',
  },
});
