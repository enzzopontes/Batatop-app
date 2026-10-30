import React, { useState } from 'react';
import { StyleSheet, Pressable, PressableProps, StyleProp, ViewStyle, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { COLORS } from '../../constants/theme';

export interface RipplePressableProps extends Omit<PressableProps, 'style'> {
  children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  rippleColor?: string;
  overflowHidden?: boolean;
}

/**
 * RipplePressable — Componente base de toque com efeito de onda (Ripple Effect)
 * que expande estritamente do ponto exato onde o usuário tocou (X, Y) até cobrir
 * 100% da área do componente, utilizando a cor amarelo escuro do tema (COLORS.accent).
 */
export default function RipplePressable({
  children,
  style,
  rippleColor = 'rgba(181, 134, 10, 0.45)', // Amarelo escuro calibrado do tema (COLORS.accent)
  overflowHidden = true,
  onPressIn,
  ...props
}: RipplePressableProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const rippleRadius = useSharedValue(0);
  const progress = useSharedValue(0);

  const handlePressIn = (e: any) => {
    const touchX = e.nativeEvent?.locationX ?? size.w / 2;
    const touchY = e.nativeEvent?.locationY ?? size.h / 2;

    originX.value = touchX;
    originY.value = touchY;

    // Distância máxima do ponto de toque aos 4 cantos do componente
    const w = size.w > 0 ? size.w : 100;
    const h = size.h > 0 ? size.h : 44;
    const dx = Math.max(touchX, w - touchX);
    const dy = Math.max(touchY, h - touchY);
    rippleRadius.value = Math.sqrt(dx * dx + dy * dy);

    progress.value = 0;
    progress.value = withTiming(1, { duration: 380, easing: Easing.out(Easing.quad) });

    if (onPressIn) onPressIn(e);
  };

  const rippleStyle = useAnimatedStyle(() => {
    const r = rippleRadius.value;
    const d = r * 2;
    const opacity = progress.value <= 0 ? 0 : (1 - progress.value) * 0.95;

    return {
      position: 'absolute',
      width: d,
      height: d,
      borderRadius: r,
      left: originX.value - r,
      top: originY.value - r,
      opacity,
      transform: [{ scale: progress.value }],
    };
  });

  const handleLayout = (e: LayoutChangeEvent) => {
    setSize({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });
  };

  return (
    <Pressable
      {...props}
      onPressIn={handlePressIn}
      onLayout={handleLayout}
      style={(state) => [
        overflowHidden && styles.overflow,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      {(state) => (
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
