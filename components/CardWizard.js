import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  SlideInRight,
  SlideInLeft,
  SlideOutRight,
  SlideOutLeft,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import { showThemedAlert } from './ThemedAlert';

const BRAND_LABELS = {
  visa: 'Visa',
  master: 'Mastercard',
  amex: 'Amex',
  elo: 'Elo',
  hipercard: 'Hipercard',
};

function detectCardBrand(raw) {
  const clean = raw.replace(/\D/g, '');
  if (!clean) return null;
  if (/^(4011|4312|4389|4514|4576|4573|5041|5067|5090|6277|6362|6363|650|651|655)/.test(clean)) return 'elo';
  if (/^4/.test(clean)) return 'visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(clean)) return 'master';
  if (/^(34|37)/.test(clean)) return 'amex';
  if (/^(606282|3841)/.test(clean)) return 'hipercard';
  return null;
}

export function isValidLuhn(raw) {
  const clean = (raw || '').replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  if (/^(\d)\1+$/.test(clean)) return false;
  let sum = 0;
  let alt = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (alt) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alt = !alt;
  }
  return sum % 10 === 0;
}

async function verifyCardWithApi(bin) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://data.handyapi.com/bin/${bin}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { valid: false, error: 'Cartão não encontrado na base de emissores bancários.' };
    }
    const data = await res.json();
    if (data.Status === 'NOT FOUND') {
      return { valid: false, error: 'Cartão inexistente ou não reconhecido pela rede bancária.' };
    }
    return { valid: true, issuer: data.Issuer, scheme: data.Scheme };
  } catch {
    // Se a chamada de rede falhar por timeout ou conexão, deixa prosseguir com validação local
    return { valid: true };
  }
}

function getCardNumberParts(cardNumber) {
  const clean = (cardNumber || '').replace(/\D/g, '').slice(0, 16);
  let typed = '';
  let placeholder = '';

  for (let i = 0; i < 16; i++) {
    const space = i > 0 && i % 4 === 0 ? ' ' : '';
    if (i < clean.length) {
      typed += space + clean[i];
    } else {
      const needSpace = (i === clean.length && space) || (i > clean.length && space);
      placeholder += (needSpace ? space : '') + '0';
    }
  }

  return { typed, placeholder };
}

function CardBrandLogo({ brand }) {
  if (brand === 'visa') {
    return <FontAwesome name="cc-visa" size={32} color="#1A1F71" />;
  }
  if (brand === 'master') {
    return (
      <View style={s.mastercardWrap}>
        <View style={[s.mastercardCircle, { backgroundColor: '#EB001B' }]} />
        <View style={[s.mastercardCircle, { backgroundColor: '#F79E1B', marginLeft: -10 }]} />
      </View>
    );
  }
  if (brand === 'amex') {
    return <FontAwesome name="cc-amex" size={32} color="#006FCF" />;
  }
  if (brand === 'elo') {
    return (
      <View style={s.eloBadge}>
        <Text style={s.eloBadgeText}>elo</Text>
      </View>
    );
  }
  if (brand === 'hipercard') {
    return (
      <View style={s.hiperBadge}>
        <Text style={s.hiperBadgeText}>Hipercard</Text>
      </View>
    );
  }
  return (
    <View style={s.brandBadge}>
      <Text style={s.brandBadgeText}>{BRAND_LABELS[brand] || brand}</Text>
    </View>
  );
}

function formatCardNumber(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 16);
  return d.match(/.{1,4}/g)?.join(' ') || d;
}
function formatExpiry(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
// Aceita CPF (11) ou CNPJ (14) — ver aviso sobre docType fixo em 'CPF' no mercadoPago.js
function formatDocument(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Preview do cartão no topo do wizard. Faz flip 3D (rotateY) entre
 * frente e verso quando `flipped` muda — usado no passo 3 (CVV).
 */
function CardPreview({ typeLabel, cardNumber, name, expiry, cvv, brand, flipped }) {
  const flip = useSharedValue(0);

  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, { duration: 420 });
  }, [flipped]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` }],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1200 }, { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` }],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));

  const { typed, placeholder } = getCardNumberParts(cardNumber);

  return (
    <View style={s.cardPreviewWrap}>
      <Animated.View style={[s.cardFace, frontStyle]}>
        <View style={s.cardFaceTop}>
          {brand ? (
            <CardBrandLogo brand={brand} />
          ) : (
            <Image
              source={require('../assets/batatanacaixa.png')}
              style={s.cardGenericIcon}
              resizeMode="contain"
            />
          )}
          <Text style={s.cardTypeLabel}>{typeLabel === 'DÉBITO' ? 'Débito' : 'Crédito'}</Text>
        </View>
        <Text style={s.cardNumberText}>
          {typed ? <Text style={s.cardNumberTyped}>{typed}</Text> : null}
          {placeholder ? <Text style={s.cardNumberPlaceholder}>{placeholder}</Text> : null}
        </Text>
        <View style={s.cardFaceBottom}>
          <Text style={s.cardHolderText} numberOfLines={1}>
            {name || 'Nome igual a do cartão'}
          </Text>
          <Text style={s.cardExpiryText}>{expiry || 'MM/AA'}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[s.cardFace, s.cardFaceBack, backStyle]}>
        <View style={s.magStripe} />
        <View style={s.cvvStripRow}>
          <View style={s.cvvSignatureBox}>
            <Text style={s.cvvSignatureText}>{cvv}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Wizard de 5 passos pra cadastrar um cartão novo:
 * 1. número · 2. nome · 3. validade + cvv (com flip) · 4. cpf/cnpj · 5. apelido
 */
export default function CardWizard({ cardType, existingCardsCount, addCard, savingCard, onClose, onSaved }) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState('forward');
  const [cvvPhase, setCvvPhase] = useState('expiry'); // sub-fase do passo 3: 'expiry' | 'cvv'

  const [cardNumber, setCardNumber] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [nickname, setNickname] = useState(''); // ver aviso: ainda não é persistido

  const [stepError, setStepError] = useState(null);
  const [validatingCard, setValidatingCard] = useState(false);

  const brand = detectCardBrand(cardNumber);
  const typeLabel = cardType === 'cartão de débito' ? 'DÉBITO' : 'CRÉDITO';
  const isFlipped = step === 3 && cvvPhase === 'cvv';
  const isLastStep = step === 5;

  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
    paddingBottom: interpolate(
      keyboardHeight.value,
      [-1, 0],
      [14, 14 + insets.bottom],
      Extrapolation.CLAMP
    ),
  }));

  function goTo(nextStep, dir) {
    setStepError(null);
    setDirection(dir);
    setStep(nextStep);
  }

  function handleBack() {
    if (step === 3 && cvvPhase === 'cvv') {
      setStepError(null);
      setCvvPhase('expiry');
      return;
    }
    if (step === 1) {
      onClose();
      return;
    }
    goTo(step - 1, 'back');
  }

  async function handleNext() {
    setStepError(null);

    if (step === 1) {
      const clean = cardNumber.replace(/\D/g, '');
      if (clean.length < 13 || clean.length > 19) {
        return setStepError('Número do cartão inválido.');
      }
      if (/^(\d)\1+$/.test(clean)) {
        return setStepError('Número do cartão inválido.');
      }
      if (!isValidLuhn(clean)) {
        return setStepError('Número do cartão inválido. Verifique os dígitos digitados.');
      }
      const detectedBrand = detectCardBrand(clean);
      if (!detectedBrand) {
        return setStepError('Bandeira do cartão não reconhecida ou não suportada.');
      }

      setValidatingCard(true);
      try {
        const apiCheck = await verifyCardWithApi(clean.slice(0, 6));
        if (!apiCheck.valid) {
          setValidatingCard(false);
          return setStepError(apiCheck.error || 'Cartão inexistente ou não encontrado na rede bancária.');
        }
      } catch {
        // Se a chamada de rede falhar, prossegue se passou no Luhn e na bandeira
      } finally {
        setValidatingCard(false);
      }

      goTo(2, 'forward');
      return;
    }

    if (step === 2) {
      if (!cardholderName.trim()) return setStepError('Informe o nome impresso no cartão.');
      goTo(3, 'forward');
      return;
    }

    if (step === 3 && cvvPhase === 'expiry') {
      const [month, year] = expiry.split('/');
      const monthNum = Number(month);
      if (!month || !year || month.length !== 2 || year.length !== 2 || monthNum < 1 || monthNum > 12) {
        return setStepError('Validade inválida. Use o formato MM/AA.');
      }
      setCvvPhase('cvv');
      return;
    }

    if (step === 3 && cvvPhase === 'cvv') {
      if (cvv.replace(/\D/g, '').length < 3) return setStepError('CVV inválido.');
      goTo(4, 'forward');
      return;
    }

    if (step === 4) {
      const cleanDoc = docNumber.replace(/\D/g, '');
      if (cleanDoc.length !== 11 && cleanDoc.length !== 14) return setStepError('CPF/CNPJ inválido.');
      goTo(5, 'forward');
    }
  }

  async function handleSave() {
    const [month, year] = expiry.split('/');

    const result = await addCard({
      cardNumber: cardNumber.replace(/\D/g, ''),
      expirationMonth: month,
      expirationYear: `20${year}`,
      securityCode: cvv,
      cardholderName: cardholderName.trim(),
      docNumber,
      cardType,
      setAsDefault: existingCardsCount === 0,
    });

    if (!result.success) {
      showThemedAlert('Não foi possível salvar', result.error || 'Tente novamente em instantes.', [
        { text: 'OK', style: 'cancel' },
      ]);
      return;
    }

    onSaved();
  }

  function renderStepFields() {
    if (step === 1) {
      return (
        <>
          <Text style={s.fieldLabel}>Número do cartão</Text>
          <TextInput
            value={cardNumber}
            onChangeText={(t) => setCardNumber(formatCardNumber(t))}
            placeholder="0000 0000 0000 0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            style={s.input}
            autoFocus
          />
        </>
      );
    }
    if (step === 2) {
      return (
        <>
          <Text style={s.fieldLabel}>Nome igual a do cartão</Text>
          <TextInput
            value={cardholderName}
            onChangeText={setCardholderName}
            placeholder="Nome igual a do cartão"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="words"
            style={s.input}
            autoFocus
          />
        </>
      );
    }
    if (step === 3 && cvvPhase === 'expiry') {
      return (
        <>
          <Text style={s.fieldLabel}>Validade</Text>
          <TextInput
            value={expiry}
            onChangeText={(t) => setExpiry(formatExpiry(t))}
            placeholder="MM/AA"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            style={s.input}
            autoFocus
          />
        </>
      );
    }
    if (step === 3 && cvvPhase === 'cvv') {
      return (
        <>
          <View style={s.labelRow}>
            <Text style={s.fieldLabel}>CVV</Text>
            <Pressable
              hitSlop={8}
              onPress={() =>
                showThemedAlert(
                  'O que é o CVV?',
                  'É o código de 3 ou 4 dígitos que fica no verso do cartão, ao lado da tarja de assinatura.',
                  [{ text: 'Entendi', style: 'cancel' }]
                )
              }
            >
              <Ionicons name="help-circle-outline" size={16} color={COLORS.textMuted} />
            </Pressable>
          </View>
          <TextInput
            value={cvv}
            onChangeText={(t) => setCvv(t.replace(/\D/g, '').slice(0, 4))}
            placeholder="000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            secureTextEntry
            style={s.input}
            autoFocus
          />
        </>
      );
    }
    if (step === 4) {
      return (
        <>
          <Text style={s.fieldLabel}>CPF/CNPJ do titular</Text>
          <TextInput
            value={docNumber}
            onChangeText={(t) => setDocNumber(formatDocument(t))}
            placeholder="000.000.000-00"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric"
            style={s.input}
            autoFocus
          />
        </>
      );
    }
    return (
      <>
        <Text style={s.fieldLabel}>Apelido do cartão (opcional)</Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="Ex: Cartão do trabalho"
          placeholderTextColor={COLORS.textMuted}
          style={s.input}
          autoFocus
        />
      </>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={s.header}>
        <Pressable onPress={handleBack} style={s.backCircleBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </Pressable>
        <Text style={s.headerTitle}>{typeLabel}</Text>
        <View style={s.headerSidePlaceholder} />
      </View>

      <ScrollView
        style={s.bodyScroll}
        contentContainerStyle={[s.body, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <CardPreview
          typeLabel={typeLabel}
          cardNumber={cardNumber}
          name={step >= 2 ? cardholderName : ''}
          expiry={step >= 3 ? expiry : ''}
          cvv={cvv}
          brand={brand}
          flipped={isFlipped}
        />

        <Animated.View
          key={`${step}-${cvvPhase}`}
          entering={direction === 'forward' ? SlideInRight.duration(220) : SlideInLeft.duration(220)}
          exiting={direction === 'forward' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220)}
          style={s.fieldBlock}
        >
          {renderStepFields()}
        </Animated.View>

        {stepError ? <Text style={s.errorText}>{stepError}</Text> : null}
      </ScrollView>

      <Animated.View style={[s.footerAvoider, footerAnimatedStyle]}>
        <View style={s.footer}>
          {step > 1 ? (
            <Pressable style={s.btnOutline} onPress={handleBack}>
              <Text style={s.btnOutlineText}>Anterior</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[s.btnPrimary, (savingCard || validatingCard) && s.btnDisabled]}
            onPress={isLastStep ? handleSave : handleNext}
            disabled={savingCard || validatingCard}
          >
            {(savingCard && isLastStep) || validatingCard ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={s.btnPrimaryText}>{isLastStep ? 'Salvar Cartão' : 'Próximo'}</Text>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSidePlaceholder: { width: 36, height: 36 },
  headerTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    letterSpacing: 1,
  },
  bodyScroll: { flex: 1 },
  body: { paddingHorizontal: SPACING[5], paddingTop: SPACING[4] },
  cardPreviewWrap: { height: 190, marginBottom: SPACING[6] },
  cardFace: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 190,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING[4],
    justifyContent: 'space-between',
    backfaceVisibility: 'hidden',
  },
  cardFaceBack: {
    justifyContent: 'flex-start',
    padding: 0,
    overflow: 'hidden',
  },
  cardFaceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandBadge: {
    paddingHorizontal: SPACING[2],
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  brandBadgeText: { color: COLORS.white, fontSize: TYPOGRAPHY.sizes.xs, fontWeight: TYPOGRAPHY.weights.bold },
  mastercardWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
  },
  mastercardCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  eloBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  eloBadgeText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    letterSpacing: 0.5,
  },
  hiperBadge: {
    backgroundColor: '#B3141A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  hiperBadgeText: {
    color: COLORS.white,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontStyle: 'italic',
  },
  cardGenericIcon: { width: 28, height: 28 },
  cardTypeLabel: { fontSize: TYPOGRAPHY.sizes.xs, color: COLORS.textSecondary, fontWeight: TYPOGRAPHY.weights.medium },
  cardNumberText: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.text,
    letterSpacing: 1,
  },
  cardNumberTyped: {
    color: COLORS.text,
  },
  cardNumberPlaceholder: {
    color: COLORS.textMuted,
    opacity: 0.45,
  },
  cardFaceBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  cardHolderText: { fontSize: TYPOGRAPHY.sizes.sm, color: COLORS.textSecondary, flex: 1, marginRight: SPACING[2] },
  cardExpiryText: { fontSize: TYPOGRAPHY.sizes.sm, color: COLORS.textSecondary },
  magStripe: { height: 44, backgroundColor: COLORS.text, marginTop: SPACING[5] },
  cvvStripRow: { paddingHorizontal: SPACING[4], marginTop: SPACING[4] },
  cvvSignatureBox: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.sm,
    height: 34,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING[3],
  },
  cvvSignatureText: { fontSize: TYPOGRAPHY.sizes.sm, color: COLORS.text, fontWeight: TYPOGRAPHY.weights.semibold },
  fieldBlock: { marginTop: SPACING[2] },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[1], marginBottom: SPACING[1] },
  fieldLabel: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    marginBottom: SPACING[1],
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.text,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[3],
    fontSize: TYPOGRAPHY.sizes.base,
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.error,
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.semibold,
    marginTop: SPACING[3],
  },
  footerAvoider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: SPACING[3],
  },
  footer: {
    flexDirection: 'row',
    gap: SPACING[3],
    paddingHorizontal: SPACING[5],
  },
  btnOutline: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  btnOutlineText: {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: TYPOGRAPHY.sizes.base,
  },
  btnPrimary: {
    flex: 1,
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: COLORS.white, fontWeight: TYPOGRAPHY.weights.bold, fontSize: TYPOGRAPHY.sizes.base },
});
