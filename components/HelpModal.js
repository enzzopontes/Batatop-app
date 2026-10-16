import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  UIManager,
  LayoutAnimation,
  Animated,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import SwipeableBottomSheetModal from './SwipeableBottomSheetModal';
import usePressScale from '../hooks/usePressScale';
import useChevronRotation from '../hooks/useChevronRotation';
import useStaggerEntrance from '../hooks/useStaggerEntrance';

// Habilita animação de layout suave no accordion (Android)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Perguntas frequentes — conteúdo aprovado
const FAQ_ITEMS = [
  {
    id: 'onde-esta',
    question: 'Onde está meu pedido?',
    answer:
      'Abra Pedidos no app e toque no pedido em andamento. Lá você vê o status atual (aguardando pagamento, em preparo, pronto ou entregue) e os detalhes do que pediu.',
  },
  {
    id: 'acompanhar-status',
    question: 'Como acompanho o status do pedido?',
    answer:
      'O status é atualizado automaticamente na tela Pedidos. Você também recebe atualizações conforme o pedido avança — de "em preparo" até "pronto" ou "entregue".',
  },
  {
    id: 'tempo-entrega',
    question: 'Quanto tempo demora a entrega?',
    answer:
      'O tempo varia conforme a demanda e a distância. Em geral, pedidos em Iacanga-SP levam cerca de 30 a 60 minutos após a confirmação. Em horários de pico, pode demorar um pouco mais.',
  },
  {
    id: 'entrega-cidade',
    question: 'Vocês entregam na minha cidade?',
    answer:
      'Sim, mas somente em Iacanga-SP. Ao cadastrar o endereço, o app valida se você está na área de entrega. Se estiver fora, será necessário escolher retirada no local.',
  },
  {
    id: 'formas-pagamento',
    question: 'Quais formas de pagamento aceitas?',
    answer:
      'Aceitamos Dinheiro, PIX, Cartão de Crédito e Cartão de Débito. No checkout, escolha a forma preferida. Pagamentos com cartão e PIX são processados com segurança via Mercado Pago.',
  },
  {
    id: 'pagamento-pix',
    question: 'Como funciona o pagamento por PIX?',
    answer:
      'Ao finalizar o pedido com PIX, você recebe o QR Code ou código para pagar. O pedido só entra em preparo após a confirmação do pagamento. Se não pagar em alguns minutos, o pedido pode ser cancelado automaticamente.',
  },
  {
    id: 'cancelar-pedido',
    question: 'Posso cancelar meu pedido?',
    answer:
      'Se o pedido ainda estiver aguardando pagamento ou pendente, entre em contato conosco o mais rápido possível pelo app ou WhatsApp. Após o início do preparo, o cancelamento depende da análise da loja.',
  },
  {
    id: 'retirada-local',
    question: 'Posso pedir para retirar no local?',
    answer:
      'Sim. No checkout, selecione Retirada em vez de entrega. Quando o pedido estiver Pronto, você pode buscar na loja no endereço informado no app.',
  },
  {
    id: 'pedido-errado',
    question: 'O que fazer se meu pedido vier errado ou incompleto?',
    answer:
      'Entre em contato conosco em até 30 minutos após receber o pedido, informando o número do pedido e o que aconteceu. Vamos analisar e, se for o caso, refazer o item ou aplicar o reembolso/crédito.',
  },
  {
    id: 'cupom-desconto',
    question: 'Como uso um cupom de desconto?',
    answer:
      'Na tela de Checkout, digite o código do cupom no campo indicado antes de finalizar. O desconto é aplicado automaticamente se o cupom for válido e estiver dentro da validade.',
  },
];

/**
 * Item individual de FAQ com as mesmas animações do Perfil:
 * - pressScale: afundamento suave ao pressionar (scale: 0.985)
 * - chevron: rotação suave de 0° a 180° com spring
 * - layout: expansão suave de 260ms easeInEaseOut
 */
function FaqAccordionItem({ item, expanded, onToggle, containerStyle }) {
  const { onPressIn, onPressOut, scaleStyle } = usePressScale();
  const { rotateStyle } = useChevronRotation(expanded);

  return (
    <Animated.View style={containerStyle}>
      <Pressable
        onPress={onToggle}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={[s.faqItem, scaleStyle]}>
          <View style={s.faqQuestionRow}>
            <Text style={[s.faqQuestion, expanded && s.faqQuestionActive]}>
              {item.question}
            </Text>
            <Animated.View style={rotateStyle}>
              <Ionicons
                name="chevron-down"
                size={18}
                color={expanded ? COLORS.primary : COLORS.textMuted}
              />
            </Animated.View>
          </View>
          {expanded && <Text style={s.faqAnswer}>{item.answer}</Text>}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Botão com animação de feedback ao toque (pressScale) idêntica ao Perfil
 */
function ScaleButton({ style, onPress, children }) {
  const { onPressIn, onPressOut, scaleStyle } = usePressScale();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{ width: '100%' }}
    >
      <Animated.View style={[style, scaleStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/**
 * Modal (bottom sheet compacto) de Central de Ajuda.
 *
 * Mesmas animações do Perfil:
 * - Stagger entrance (45ms, spring friction 8 / tension 70, opacity 0->1, translateY -6->0)
 * - Press feedback (pressScale toValue 0.985 / 1)
 * - Chevron rotation (spring friction 7 / tension 60, 0deg -> 180deg)
 * - Accordion layout transition (260ms easeInEaseOut)
 * - Reset automático ao fechar e re-disparo a cada abertura
 */
export default function HelpModal({ visible, onClose, onContactSupport }) {
  const [expandedId, setExpandedId] = useState(null);
  const [isAtTop, setIsAtTop] = useState(true);

  // 10 (FAQ Items) + 1 (Support Card)
  const TOTAL_ANIMATED_ITEMS = FAQ_ITEMS.length + 1;
  const { getItemStyle } = useStaggerEntrance(TOTAL_ANIMATED_ITEMS, visible);

  function toggleItem(id) {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(260, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleClose() {
    setExpandedId(null);
    onClose?.();
  }

  function handleSupportPress() {
    handleClose();
    if (onContactSupport) {
      onContactSupport();
    } else {
      const msg = encodeURIComponent('Olá! Preciso de ajuda com o app Batata Top.');
      Linking.openURL(`https://wa.me/5514997361015?text=${msg}`).catch(() => {});
    }
  }

  return (
    <SwipeableBottomSheetModal
      visible={visible}
      onRequestClose={handleClose}
      backdropColor="rgba(0, 0, 0, 0.6)"
      contentStyle={s.modalContent}
      scrollable
      isAtTop={isAtTop}
      minBottomPadding={32}
      extraBottomPadding={20}
    >
      {/* 1. Header limpo sem botão X (fechamento por swipe-down ou toque fora) */}
      <View style={s.fixedHeader}>
        <View style={s.headerLeft}>
          <View style={s.iconBadge}>
            <Ionicons name="help-circle" size={20} color={COLORS.primary} />
          </View>
          <View>
            <Text style={s.modalTitle}>Central de Ajuda</Text>
            <Text style={s.modalSub}>Dúvidas frequentes e suporte</Text>
          </View>
        </View>
      </View>

      {/* 2. Área rolável de perguntas e suporte */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={s.scrollView}
        contentContainerStyle={s.scrollContent}
        scrollEventThrottle={16}
        onScroll={(e) => setIsAtTop(e.nativeEvent.contentOffset.y <= 0)}
      >
        {/* Itens de FAQ com animação suave e design minimalista sem caixas */}
        {FAQ_ITEMS.map((item, index) => (
          <FaqAccordionItem
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={() => toggleItem(item.id)}
            containerStyle={getItemStyle(index)}
          />
        ))}

        {/* 3. Card de Suporte no WhatsApp */}
        <Animated.View style={[s.supportCard, getItemStyle(FAQ_ITEMS.length)]}>
          <View style={s.supportCardContent}>
            <Text style={s.supportCardTitle}>Ainda com dúvidas?</Text>
            <Text style={s.supportCardSub}>
              Nossa equipe está pronta para te atender no WhatsApp.
            </Text>
          </View>
          <ScaleButton style={s.supportBtn} onPress={handleSupportPress}>
            <Ionicons name="logo-whatsapp" size={19} color={COLORS.white} />
            <Text style={s.supportBtnText}>Falar no WhatsApp</Text>
          </ScaleButton>
        </Animated.View>
      </ScrollView>
    </SwipeableBottomSheetModal>
  );
}

const s = StyleSheet.create({
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingTop: SPACING[2],
    maxHeight: '85%',
  },
  fixedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[2],
    paddingBottom: SPACING[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
    width: '100%',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    backgroundColor: `${COLORS.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
  },
  modalSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  topCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[10],
  },
  faqItem: {
    width: '100%',
    paddingVertical: SPACING[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EBE6DF',
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING[1],
  },
  faqQuestion: {
    flex: 1,
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.medium,
    color: COLORS.text,
    paddingRight: SPACING[3],
    lineHeight: 20,
  },
  faqQuestionActive: {
    color: COLORS.accent,
    fontWeight: TYPOGRAPHY.weights.bold,
  },
  faqAnswer: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginTop: SPACING[2],
    paddingBottom: SPACING[2],
  },
  supportCard: {
    width: '100%',
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    marginTop: SPACING[6],
    marginBottom: SPACING[4],
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
  },
  supportCardContent: {
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  supportCardTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: '#166534',
  },
  supportCardSub: {
    fontSize: 12,
    color: '#15803D',
    textAlign: 'center',
    marginTop: 2,
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    width: '100%',
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: '#25D366',
    ...SHADOWS.sm,
  },
  supportBtnText: {
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: TYPOGRAPHY.sizes.sm,
  },
});
