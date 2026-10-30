import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import SwipeableBottomSheetModal from '../SwipeableBottomSheetModal';
import { ThemedAlertHost } from '../ThemedAlert';
import { COLORS, RADIUS, SPACING, SHADOWS } from '../../constants/theme';
import { COUPON_TEMPLATES } from '../../constants/couponTemplates';

export default function CouponTemplateSelectorModal({
  visible,
  onClose,
  onSelectTemplate,
  onSelectScratch,
}) {
  const insets = useSafeAreaInsets();
  const handleSelect = (template) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectTemplate(template);
  };

  const handleScratch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectScratch();
  };

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={onClose}
      backdropColor="rgba(0,0,0,0.5)"
      contentStyle={[s.sheet, { height: '88%', maxHeight: '88%' }]}
      scrollable
    >
      <View style={s.contentWrapper}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Como quer criar o cupom?</Text>
            <Text style={s.subtitle}>Escolha uma ideia de sucesso ou configure do zero</Text>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Opção Criar do Zero */}
            <Pressable style={s.scratchCard} onPress={handleScratch}>
              <View style={s.scratchIconBox}>
                <Ionicons name="create-outline" size={22} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.scratchTitle}>Criar do Zero</Text>
                <Text style={s.scratchDesc}>Configurar valores, regras e códigos manualmente</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </Pressable>

            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>OU ESCOLHA UM TEMPLATE GUIA</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Templates Cards */}
            {COUPON_TEMPLATES.map((tmpl) => (
              <Pressable
                key={tmpl.id}
                style={s.templateCard}
                onPress={() => handleSelect(tmpl)}
              >
                <View style={s.templateHeader}>
                  <View style={[s.iconBox, { backgroundColor: `${tmpl.iconColor}15` }]}>
                    <Ionicons name={tmpl.icon} size={20} color={tmpl.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.tagRow}>
                      <Text style={s.templateTitle}>{tmpl.title}</Text>
                      {tmpl.badge ? (
                        <View style={[s.badgeWrap, { backgroundColor: `${tmpl.iconColor}20` }]}>
                          <Text style={[s.badgeText, { color: tmpl.iconColor }]}>{tmpl.badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.templateSubtitle}>{tmpl.subtitle}</Text>
                  </View>
                </View>

                {/* Preset Chips */}
                <View style={s.presetPills}>
                  <View style={s.pill}>
                    <Ionicons name="pricetag-outline" size={12} color={COLORS.textSecondary} />
                    <Text style={s.pillText}>
                      {tmpl.suggestedType === 'percentage'
                        ? `${tmpl.suggestedValue}% OFF`
                        : `R$ ${tmpl.suggestedValue} OFF`}
                    </Text>
                  </View>
                  <View style={s.pill}>
                    <Ionicons name="cart-outline" size={12} color={COLORS.textSecondary} />
                    <Text style={s.pillText}>Mínimo R$ {tmpl.suggestedMinOrder}</Text>
                  </View>
                  <View style={s.pill}>
                    <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
                    <Text style={s.pillText}>{tmpl.suggestedDaysValid} dias</Text>
                  </View>
                </View>

                {/* CTA / Quick Preview */}
                <View style={s.templateFooter}>
                  <Text style={s.codePreview}>Código sugerido: <Text style={s.codeBold}>{tmpl.suggestedCode}</Text></Text>
                  <View style={s.useBtn}>
                    <Text style={s.useBtnText}>Usar Ideia</Text>
                    <Ionicons name="arrow-forward" size={12} color={COLORS.primary} />
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <ThemedAlertHost />
        </View>
    </SwipeableBottomSheetModal>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    overflow: 'hidden',
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACING[2],
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.full,
  },
  content: {
    padding: SPACING[4],
    gap: SPACING[3],
  },
  scratchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    gap: SPACING[3],
  },
  scratchIconBox: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scratchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  scratchDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginVertical: SPACING[1],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
  },
  templateCard: {
    backgroundColor: COLORS.backgroundCard,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    gap: SPACING[3],
    ...SHADOWS.sm,
  },
  templateHeader: {
    flexDirection: 'row',
    gap: SPACING[3],
    alignItems: 'flex-start',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    flex: 1,
  },
  templateSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  badgeWrap: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  presetPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.backgroundElevated,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  templateFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING[2],
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  codePreview: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  codeBold: {
    fontWeight: '800',
    color: COLORS.text,
  },
  useBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  useBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
});
