import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SPACING } from '../constants/theme';

/**
 * ProfileSuccessToast
 *
 * Réplica do toast verde do iFood ("Histórico limpo com sucesso"), usado
 * só na tela de perfil (profile.js) quando aperta "Limpar histórico de
 * busca". Verde de sucesso é fixo (semântico), não vem do tema de marca.
 */
export default function ProfileSuccessToast({ visible, message, onHide, duration = 2200 }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => onHide && onHide());
    }, duration);

    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.toast, { transform: [{ translateY }], opacity }]}>
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
      </View>
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    backgroundColor: '#0E9F5C',
    borderRadius: RADIUS.lg ?? 12,
    paddingVertical: SPACING[3] ?? 14,
    paddingHorizontal: SPACING[4] ?? 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  iconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
});
