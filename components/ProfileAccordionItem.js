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
import usePressScale from '../hooks/usePressScale';
import useChevronRotation from '../hooks/useChevronRotation';
import useStaggerEntrance from '../hooks/useStaggerEntrance';

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
 * perfil (deslogado e logado) estilo iFood — usado em profile.js.
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
 * - items: [{ label: string, onPress?: () => void, disabled?: bool, danger?: bool }]
 *   - disabled: opção ainda sem tela/rota no projeto — fica visível (fiel à
 *     referência) mas sem toque e com texto apagado. Nunca inventa rota.
 *   - danger: destaca em vermelho (ex: "Sair da conta").
 */
export default function ProfileAccordionItem({ icon, title, subtitle, items = [] }) {
  const [expanded, setExpanded] = useState(false);
  const { onPressIn, onPressOut, scaleStyle } = usePressScale();
  const { rotateStyle } = useChevronRotation(expanded);
  const { getItemStyle, trigger: triggerItems } = useStaggerEntrance(items.length, expanded);

  const toggleExpand = () => {
    const opening = !expanded;

    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );

    if (opening) {
      triggerItems();
    }

    setExpanded(opening);
  };

  return (
    <View>
      <Pressable
        onPress={toggleExpand}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={[styles.header, scaleStyle]}>
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

          <Animated.View style={rotateStyle}>
            <Ionicons name="chevron-down" size={16} color={COLORS.textMuted} />
          </Animated.View>
        </Animated.View>
      </Pressable>

      {expanded && (
        <View style={styles.content}>
          {items.map((item, index) => {
            return (
              <Animated.View
                key={item.label + index}
                style={getItemStyle(index)}
              >
                <Pressable
                  style={styles.itemRow}
                  onPress={item.disabled ? undefined : item.onPress}
                  disabled={item.disabled}
                >
                  <Text
                    style={[
                      styles.itemLabel,
                      item.disabled && styles.itemLabelDisabled,
                      item.danger && styles.itemLabelDanger,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {!item.disabled && (
                    <Ionicons
                      name="chevron-forward"
                      size={14}
                      color={item.danger ? '#EF4444' : COLORS.textMuted}
                    />
                  )}
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
  itemLabelDisabled: {
    color: COLORS.textMuted,
    opacity: 0.55,
  },
  itemLabelDanger: {
    color: '#EF4444',
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EEEEEE',
  },
});
