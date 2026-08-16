import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../../constants/theme';
import { getArticleById } from '../../../data/helpData';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const LAST_ACCESS_KEY = '@batatatop_help_last_access';

/**
 * Componente animado de cada item do Accordion dos Termos de Uso.
 * Anima a rotação da seta (chevron) com spring e o aparecimento suave do conteúdo.
 */
function TermsAccordionItem({ item, isExpanded, onToggle }) {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }, [isExpanded]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  return (
    <View style={s.accordionItem}>
      <Pressable style={s.accordionHeader} onPress={onToggle}>
        <Text style={s.accordionNum}>{item.num}.</Text>
        <Text style={[s.accordionTitle, isExpanded && s.accordionTitleActive]}>
          {item.title}
        </Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons
            name="chevron-down"
            size={18}
            color={isExpanded ? COLORS.primary : COLORS.textMuted}
          />
        </Animated.View>
      </Pressable>

      {isExpanded && (
        <View style={s.accordionBody}>
          <Text style={s.accordionBodyText}>{item.body}</Text>
        </View>
      )}
    </View>
  );
}

export default function HelpArticleScreen() {
  const router = useRouter();
  const { id, headerTitle } = useLocalSearchParams();

  const article = getArticleById(id);
  const [feedbackGiven, setFeedbackGiven] = useState(null); // 'yes' | 'no' | null
  const [expandedAccordionId, setExpandedAccordionId] = useState(null);

  // Título do Header: se veio 'headerTitle' via param (ex: vindo direto do Perfil), usa ele. Senão usa 'AJUDA'.
  const displayHeaderTitle = headerTitle || 'AJUDA';

  useEffect(() => {
    if (article) {
      saveLastAccess(article.id);
    }
  }, [article]);

  async function saveLastAccess(articleId) {
    try {
      const data = {
        articleId,
        accessedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(LAST_ACCESS_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Erro ao salvar último acesso:', e);
    }
  }

  function handleFeedback(isPositive) {
    setFeedbackGiven(isPositive ? 'yes' : 'no');
  }

  function toggleAccordion(itemNum) {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(250, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpandedAccordionId((prev) => (prev === itemNum ? null : itemNum));
  }

  async function handleActionPress() {
    if (!article?.actionButton) return;

    if (article.actionButton.type === 'whatsapp') {
      const msg = encodeURIComponent(
        `Oi! Estava lendo o artigo "${article.title}" na Central de Ajuda do app e preciso de suporte.`
      );
      Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
      return;
    }

    if (article.id === 'perdi-meu-celular-ou-computador') {
      Alert.alert(
        'Bloquear Conta Temporariamente',
        'Tem certeza que deseja bloquear e desconectar sua conta de todos os dispositivos por segurança?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Bloquear e Sair',
            style: 'destructive',
            onPress: async () => {
              try {
                const { supabase } = require('../../../supabaseConfig');
                const { SOFT_LOGOUT_KEY, emitAuthUiChange } = require('../../../utils/authSession');

                await supabase.auth.signOut();
                await AsyncStorage.multiRemove(['@batatatop:savedUser', SOFT_LOGOUT_KEY]);
                emitAuthUiChange();

                Alert.alert(
                  'Conta Bloqueada',
                  'Sua conta foi desconectada de todos os dispositivos por segurança.',
                  [{ text: 'OK', onPress: () => router.replace('/') }]
                );
              } catch (e) {
                console.error('Erro ao bloquear conta:', e);
                Alert.alert('Erro', 'Não foi possível completar o bloqueio.');
              }
            },
          },
        ]
      );
      return;
    }

    if (article.id === 'desbloqueio-de-conta') {
      Alert.alert(
        'Desbloqueio de Conta',
        'Para sua segurança, o desbloqueio pode ser feito falando direto com nosso suporte.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Falar no WhatsApp',
            onPress: () => {
              const msg = encodeURIComponent('Oi! Solicito o desbloqueio da minha conta no Batata Top.');
              Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      article.actionButton.text,
      'Solicitação registrada com sucesso!',
      [{ text: 'OK' }]
    );
  }

  if (!article) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
          </Pressable>
          <Text style={s.headerTitle}>{displayHeaderTitle}</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Artigo não encontrado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header com título dinâmico (AJUDA ou TERMOS DE USO ou DECLARAÇÃO DE PRIVACIDADE) */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
        </Pressable>

        <Text style={s.headerTitle}>{displayHeaderTitle}</Text>

        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* CASO ESPECIAL 1: TERMOS DE USO COMPLETO E ESTRUTURADO */}
        {article.isRichTerms ? (
          <View style={s.termsContainer}>
            {/* Texto de Introdução */}
            <Text style={s.termsIntro}>{article.introText}</Text>

            {/* Cards de Destaque com Cores e Emojis (#SuaResponsabilidade e #SeuDireito) */}
            {article.highlights?.map((hl, idx) => (
              <View key={idx} style={s.highlightBox}>
                <View style={s.highlightHeader}>
                  <View style={s.highlightIconCircle}>
                    <Ionicons name={hl.icon} size={20} color={COLORS.primary} />
                  </View>
                  <Text style={s.highlightTag}>{hl.tag}</Text>
                </View>

                {hl.content.split('\n').map((line, lIdx) => (
                  <Text key={lIdx} style={s.highlightText}>
                    {line.trim()}
                  </Text>
                ))}
              </View>
            ))}

            {/* Lista Numerada em Accordion Animado (1 a 9) */}
            <View style={s.accordionSection}>
              {article.termsAccordion?.map((item) => (
                <TermsAccordionItem
                  key={item.num}
                  item={item}
                  isExpanded={expandedAccordionId === item.num}
                  onToggle={() => toggleAccordion(item.num)}
                />
              ))}
            </View>

            {/* Footer de Direitos Reservados */}
            <View style={s.termsFooter}>
              <Ionicons name="fast-food" size={24} color={COLORS.primary} />
              <Text style={s.termsFooterText}>
                © Batata Top — Todos os direitos reservados
              </Text>
            </View>
          </View>
        ) : article.isRichPrivacy ? (
          /* CASO ESPECIAL 2: DECLARAÇÃO DE PRIVACIDADE ESTRUTURADA */
          <View style={s.privacyContainer}>
            <View style={s.privacyBannerHeader}>
              <View style={s.privacyBadge}>
                <Text style={s.privacyBadgeText}>DECLARAÇÃO DE PRIVACIDADE</Text>
              </View>
              <Text style={s.privacyUpdate}>Atualizado em: {article.updateDate}</Text>
              <Text style={s.privacyTime}>Tempo de leitura: {article.readingTime}</Text>
            </View>

            <View style={s.bodyBox}>
              {article.content.split('\n\n').map((paragraph, index) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;

                if (trimmed.startsWith('### ')) {
                  return (
                    <Text key={index} style={s.h3}>
                      {trimmed.replace('### ', '')}
                    </Text>
                  );
                }

                if (trimmed.includes('\n- ') || trimmed.startsWith('- ')) {
                  const lines = trimmed.split('\n');
                  return (
                    <View key={index} style={s.bulletGroup}>
                      {lines.map((line, lIdx) => {
                        const cleanLine = line.replace(/^- /, '').replace(/^\* /, '');
                        if (!cleanLine.trim()) return null;
                        return (
                          <View key={lIdx} style={s.bulletRow}>
                            <Text style={s.bulletDot}>•</Text>
                            <Text style={s.bulletText}>{cleanLine}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                }

                return (
                  <Text key={index} style={s.paragraph}>
                    {trimmed}
                  </Text>
                );
              })}
            </View>
          </View>
        ) : (
          /* CASO PADRÃO: ARTIGOS CONVENCIONAIS DA AJUDA */
          <View>
            <Text style={s.articleTitle}>{article.title}</Text>

            <View style={s.bodyBox}>
              {article.content.split('\n\n').map((paragraph, index) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;

                if (trimmed.startsWith('### ')) {
                  return (
                    <Text key={index} style={s.h3}>
                      {trimmed.replace('### ', '')}
                    </Text>
                  );
                }
                if (trimmed.startsWith('#### ')) {
                  return (
                    <Text key={index} style={s.h4}>
                      {trimmed.replace('#### ', '')}
                    </Text>
                  );
                }

                if (trimmed.includes('\n- ') || trimmed.startsWith('- ')) {
                  const lines = trimmed.split('\n');
                  return (
                    <View key={index} style={s.bulletGroup}>
                      {lines.map((line, lIdx) => {
                        const cleanLine = line.replace(/^- /, '').replace(/^\* /, '');
                        if (!cleanLine.trim()) return null;
                        return (
                          <View key={lIdx} style={s.bulletRow}>
                            <Text style={s.bulletDot}>•</Text>
                            <Text style={s.bulletText}>{cleanLine}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                }

                return (
                  <Text key={index} style={s.paragraph}>
                    {trimmed}
                  </Text>
                );
              })}
            </View>
          </View>
        )}

        {/* Botão de Ação Especial (se houver) */}
        {article.actionButton && (
          <Pressable style={s.actionBtn} onPress={handleActionPress}>
            <Text style={s.actionBtnText}>{article.actionButton.text}</Text>
          </Pressable>
        )}

        {/* Pergunta de Feedback: Essa informação foi útil? */}
        <View style={s.feedbackSection}>
          <Text style={s.feedbackQuestion}>Essa informação foi útil?</Text>

          {feedbackGiven ? (
            <View style={s.feedbackThanks}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={s.feedbackThanksText}>Obrigado pelo seu feedback!</Text>
            </View>
          ) : (
            <View style={s.feedbackButtonsRow}>
              <Pressable
                style={s.feedbackCircleBtn}
                onPress={() => handleFeedback(false)}
              >
                <Ionicons name="thumbs-down-outline" size={20} color={COLORS.textSecondary} />
              </Pressable>

              <Pressable
                style={s.feedbackCircleBtn}
                onPress={() => handleFeedback(true)}
              >
                <Ionicons name="thumbs-up-outline" size={20} color={COLORS.textSecondary} />
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[10],
  },
  articleTitle: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    marginBottom: SPACING[4],
    lineHeight: 28,
  },
  bodyBox: {
    marginBottom: SPACING[6],
  },
  paragraph: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING[4],
  },
  h3: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    marginTop: SPACING[3],
    marginBottom: SPACING[2],
  },
  h4: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    marginTop: SPACING[2],
    marginBottom: SPACING[1],
  },
  bulletGroup: {
    marginBottom: SPACING[4],
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING[2],
    paddingLeft: SPACING[2],
  },
  bulletDot: {
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.primary,
    marginRight: SPACING[2],
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  /* ESTILOS ESPECÍFICOS PARA TERMOS DE USO */
  termsContainer: {
    marginBottom: SPACING[4],
  },
  termsIntro: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: SPACING[5],
  },
  highlightBox: {
    backgroundColor: '#FFFDF5',
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    borderWidth: 1,
    borderColor: '#FEF3C7',
    marginBottom: SPACING[4],
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: SPACING[2],
  },
  highlightIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTag: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.primary,
  },
  highlightText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: SPACING[1],
  },

  accordionSection: {
    marginTop: SPACING[4],
    marginBottom: SPACING[6],
  },
  accordionItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[4],
  },
  accordionNum: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.primary,
    marginRight: SPACING[2],
  },
  accordionTitle: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.text,
    paddingRight: SPACING[2],
  },
  accordionTitleActive: {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  accordionBody: {
    paddingBottom: SPACING[4],
    paddingLeft: SPACING[5],
  },
  accordionBodyText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  termsFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[6],
    gap: SPACING[2],
  },
  termsFooterText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    fontWeight: TYPOGRAPHY.weights.medium,
  },

  /* ESTILOS ESPECÍFICOS PARA DECLARAÇÃO DE PRIVACIDADE */
  privacyContainer: {
    marginBottom: SPACING[4],
  },
  privacyBannerHeader: {
    backgroundColor: COLORS.backgroundElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
    marginBottom: SPACING[5],
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  privacyBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.sm,
    alignSelf: 'flex-start',
    marginBottom: SPACING[2],
  },
  privacyBadgeText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.primary,
  },
  privacyUpdate: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textSecondary,
  },
  privacyTime: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  actionBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING[3.5],
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[8],
  },
  actionBtnText: {
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: TYPOGRAPHY.sizes.sm,
  },
  feedbackSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING[6],
    borderTopWidth: 1,
    borderTopColor: '#F2F2F2',
    marginTop: SPACING[4],
  },
  feedbackQuestion: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING[4],
  },
  feedbackButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[4],
  },
  feedbackCircleBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  feedbackThanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  feedbackThanksText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.success,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
  },
});
