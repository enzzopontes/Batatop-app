import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';
import RipplePressable from './cart/RipplePressable';

export interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
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
 * Garante fidelidade ao token COLORS.primary, altura uniforme mais fina (44px)
 * e largura generosa, com elementos internos brancos.
 */
export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  badge = null,
  leftIcon,
  rightText,
  spaceBetween = false,
  style,
  textStyle,
  fullWidth = false,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const isActionDisabled = disabled || loading;

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
      rippleColor="rgba(0, 0, 0, 0.18)"
      accessibilityLabel={accessibilityLabel || title}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} size="small" />
      ) : spaceBetween ? (
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
    </RipplePressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.primary,
    height: 44, // Mais fino (menos altura), elegante e não gordinho
    paddingHorizontal: 24, // Mais largo pros lados
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
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
