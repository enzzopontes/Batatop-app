import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../constants/theme';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * ProfileAccordionItem
 *
 * Réplica do accordion de "Configurações / Conta / Ajuda e Termos" do
 * perfil deslogado do iFood — usado só na tela de perfil (profile.js).
 *
 * Bug do iFood que corrigimos aqui: lá o `subtitle` (texto exibido fechado)
 * lista coisas que não existem quando você abre. Aqui o `subtitle` tem que
 * ser SEMPRE igual ao que realmente existe em `items` — é assim que
 * profile.js está chamando esse componente.
 *
 * Animação: chevron com spring, header com leve "afundada" ao tocar, e os
 * itens entram com fade + slide em cascata (stagger) em vez de aparecer
 * tudo de uma vez.
 *
 * Props:
 * - icon: nome do ícone Ionicons (string)
 * - title: string
 * - subtitle: string
 * - items: [{ label: string, onPress: () => void }]
 */
export default function ProfileAccordionItem({ icon, title, subtitle, items = [] }) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  // Um Animated.Value por item, pra dar o efeito cascata (stagger) na
  // entrada. Recriado sempre que a lista de items muda de tamanho.
  const itemAnims = useRef(items.map(() => new Animated.Value(0))).current;
  if (itemAnims.length !== items.length) {
    itemAnims.length = 0;
    items.forEach(() => itemAnims.push(new Animated.Value(0)));
  }

  const toggleExpand = () => {
    const opening = !expanded;

    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    Animated.spring(rotateAnim, {
      toValue: opening ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();

    if (opening) {
      itemAnims.forEach((val) => val.setValue(0));
      Animated.stagger(
        45,
        itemAnims.map((val) =>
          Animated.spring(val, {
            toValue: 1,
            useNativeDriver: true,
            friction: 8,
            tension: 70,
          })
        )
      ).start();
    }

    setExpanded(opening);
  };

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.985, useNativeDriver: true, speed: 30 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  };

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View>
      <Pressable
        onPress={toggleExpand}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Animated.View style={[styles.header, { transform: [{ scale: pressScale }] }]}>
          <View style={styles.iconBox}>
            <Ionicons name={icon} size={19} color={COLORS.textMuted} />
          </View>

          <View style={styles.textBox}>
            <Text style={[styles.title, expanded && styles.titleExpanded]}>{title}</Text>
            {!expanded && subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </Animated.View>
        </Animated.View>
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {items.map((item, index) => {
            const anim = itemAnims[index];
            return (
              <Animated.View
                key={item.label + index}
                style={{
                  opacity: anim,
                  transform: [
                    {
                      translateY: anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-6, 0],
                      }),
                    },
                  ],
                }}
              >
                <Pressable style={styles.itemRow} onPress={item.onPress}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}

      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[3] ?? 13,
  },
  iconBox: {
    width: 22,
    alignItems: 'center',
    marginRight: SPACING[2] ?? 10,
  },
  textBox: {
    flex: 1,
  },
  title: {
    fontSize: 14.5,
    fontWeight: '400',
    color: COLORS.text,
  },
  titleExpanded: {
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  content: {
    paddingLeft: 32,
    paddingBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingRight: 4,
  },
  itemLabel: {
    fontSize: 13.5,
    fontWeight: '400',
    color: COLORS.text,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEEEEE',
  },
});
