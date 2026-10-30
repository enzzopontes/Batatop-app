import React, { useEffect } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';

export interface ThreeDotsLoaderProps {
  color?: string;
  dotSize?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

interface SingleDotProps {
  delay: number;
  color: string;
  size: number;
}

function SingleDot({ delay, color, size }: SingleDotProps) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    const bounceHeight = -Math.max(4, Math.round(size * 0.75));

    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(bounceHeight, {
            duration: 260,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          }),
          withTiming(0, {
            duration: 260,
            easing: Easing.bezier(0.5, 0, 0.75, 0),
          }),
          withTiming(0, { duration: 280 })
        ),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 260,
            easing: Easing.bezier(0.25, 1, 0.5, 1),
          }),
          withTiming(0.35, {
            duration: 260,
            easing: Easing.bezier(0.5, 0, 0.75, 0),
          }),
          withTiming(0.35, { duration: 280 })
        ),
        -1,
        false
      )
    );

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(opacity);
    };
  }, [delay, size, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        animatedStyle,
      ]}
    />
  );
}

export default function ThreeDotsLoader({
  color = COLORS.white || '#FFFFFF',
  dotSize = 7,
  gap = 6,
  style,
}: ThreeDotsLoaderProps) {
  return (
    <View
      style={[styles.container, { gap }, style]}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      accessibilityLabel="Carregando"
    >
      <SingleDot delay={0} color={color} size={dotSize} />
      <SingleDot delay={140} color={color} size={dotSize} />
      <SingleDot delay={280} color={color} size={dotSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
});
