import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../supabaseConfig';
import { useCart } from '../../utils/cartStore';
import { getEffectiveSession, subscribeAuthUiChange } from '../../utils/authSession';
import { requestAuthSheet } from '../../utils/authSheetRequest';
import { getSelectedAddressId } from '../../utils/addressVerification';
import {
  getPreferredPaymentMethod,
  setPreferredPaymentMethod,
  getPreferredCardId,
  setPreferredCardId,
} from '../../utils/paymentPrefs';
import { usePaymentCards, SavedCard } from '../../utils/usePaymentCards';
import { useProductRanking } from '../../hooks/useProductRanking';
import {
  createPixPayment,
  chargeWithSavedCard,
  tokenizeCard,
  guessPaymentMethodId,
  createCardPayment,
  getInstallments,
} from '../../utils/mercadoPago';
import { InstallmentOption } from './InstallmentsModal';
import { notifyAdminNewOrder } from '../../utils/notifyNewOrder';
import { MIN_ORDER_VALUE, DELIVERY_FEE, STORE_ADDRESS } from '../../constants/store';
import { showThemedAlert, showErrorAlert } from '../ThemedAlert';

export type CheckoutStep = 'itens' | 'entrega' | 'pagamento';

const SAVED_USER_KEY = '@batatatop:savedUser';

import { mapCartItemsToOrderItems } from '../../utils/orderMapper';

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Você precisa estar logado para fazer um pedido.',
  invalid_customer_name: 'Por favor, informe seu nome.',
  invalid_customer_phone: 'Telefone inválido para contato.',
  invalid_delivery_type: 'Tipo de entrega inválido.',
  invalid_payment_method: 'Forma de pagamento inválida.',
  online_requires_pix_or_card: 'Pagamento online requer PIX ou Cartão.',
  store_is_closed: 'A loja está fechada no momento.',
  delivery_disabled: 'O serviço de entrega está temporariamente indisponível.',
  too_many_awaiting_orders: 'Você já possui 3 pedidos aguardando pagamento. Conclua ou aguarde o cancelamento.',
  rate_limit_exceeded: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos antes de tentar novamente.',
  invalid_items: 'Os itens do pedido são inválidos.',
  invalid_product_id: 'Produto selecionado inválido.',
  invalid_item_quantity: 'Quantidade de item inválida (deve ser entre 1 e 99).',
  product_not_found: 'Um dos produtos não foi encontrado em nosso cardápio.',
  product_unavailable: 'Um dos produtos escolhidos está indisponível no momento.',
  addon_not_found: 'Adicional não encontrado.',
  addon_unavailable: 'Um dos adicionais escolhidos está indisponível.',
  invalid_addon_quantity: 'Quantidade de adicional inválida.',
  invalid_addon_id: 'Identificador de adicional inválido.',
  too_many_addons: 'Limite de adicionais excedido.',
  coupon_not_found: 'Cupom de desconto não encontrado.',
  coupon_inactive: 'Este cupom não está ativo.',
  coupon_expired: 'Este cupom já expirou.',
  coupon_max_uses_reached: 'Este cupom atingiu o limite máximo de utilizações.',
  coupon_min_order_value_not_met: 'O valor mínimo do pedido para este cupom não foi atingido.',
  coupon_user_limit_reached: 'Você já atingiu o limite de usos para este cupom.',
  coupon_not_applicable: 'Este cupom não é aplicável a este pedido.',
  online_total_must_be_positive: 'O valor total para pagamento online deve ser maior que zero.',
};
export type DeliveryType = 'delivery' | 'retirada';
export type PaymentMethod =
  | 'pix'
  | 'cartão de crédito'
  | 'cartão de débito'
  | 'dinheiro'
  | 'cartão de crédito (entrega)'
  | 'cartão de débito (entrega)';

export interface Address {
  id: string;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  cep: string;
  is_default: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

function isValidCpf(cpf: string): boolean {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== Number(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  return rest === Number(digits[10]);
}

export function isValidPhone(phone: string): boolean {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return false;
  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (digits.length === 11 && digits[2] !== '9') return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  return true;
}

export function formatPhone(value: string): string {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function useCheckoutFlow() {
  const router = useRouter();
  const { items, total: totalCents, add: addToCart, remove: removeFromCart, updateQty, clear: clearCart, coupon, setCoupon } = useCart();
  const { cards: savedCards, loadCards: loadSavedCards, addCard, savingCard } = usePaymentCards();
  const { produtos: rankedProducts } = useProductRanking();

  // Navigation & Step state
  const [step, setStep] = useState<CheckoutStep>('itens');
  const [_showPaymentSelector, _setShowPaymentSelector] = useState(false);
  const showPaymentSelector = _showPaymentSelector;
  const setShowPaymentSelector = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    _setShowPaymentSelector((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (next) {
        loadSavedCards();
      }
      return next;
    });
  }, [loadSavedCards]);
  const [_showReviseModal, _setShowReviseModal] = useState(false);
  const [showCardWizard, setShowCardWizard] = useState(false);
  const [minOrderSheetVisible, setMinOrderSheetVisible] = useState(false);
  const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentOption | null>(null);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [installmentsError, setInstallmentsError] = useState<string | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);

  // User & Session
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasSavedPhone, setHasSavedPhone] = useState(false);

  // Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState<number>(DELIVERY_FEE);
  const [isDeliveryFeeEnabled, setIsDeliveryFeeEnabled] = useState<boolean>(true);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [selectedSavedCard, setSelectedSavedCard] = useState<SavedCard | null>(null);
  const [savedCardCvv, setSavedCardCvv] = useState('');

  // Manual card fallback states (if user enters card without saving)
  const [useManualCardForm, setUseManualCardForm] = useState(false);
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState('');

  const showReviseModal = _showReviseModal;
  const setShowReviseModal = (val: boolean | ((prev: boolean) => boolean)) => {
    _setShowReviseModal((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      if (!next) {
        setSavedCardCvv('');
        setCardCvv('');
      }
      return next;
    });
  };

  // Extra options (talher obrigatório)
  const [wantsCutlery, setWantsCutlery] = useState<boolean | null>(null);
  const [cashChange, setCashChange] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Process / Submission
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const isOrderFinishingRef = useRef(false);
  const pendingOrderIdRef = useRef<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Zerando o ref quando carrinho, método de pagamento ou cupom mudarem
  useEffect(() => {
    pendingOrderIdRef.current = null;
    setSelectedInstallment(null);
    setInstallmentOptions([]);
  }, [items, paymentMethod, coupon]);

  // Calculations
  const subtotal = totalCents / 100;
  const deliveryFee = deliveryType === 'delivery' && isDeliveryFeeEnabled ? dynamicDeliveryFee : 0;

  // Coupon discount calculation
  let discount = 0;
  let couponInvalidReason: string | null = null;
  if (coupon) {
    if (coupon.min_order_value && subtotal < Number(coupon.min_order_value)) {
      couponInvalidReason = `Pedido mínimo de R$ ${Number(coupon.min_order_value).toFixed(2).replace('.', ',')}`;
      discount = 0;
    } else {
      discount =
        coupon.discount_type === 'percent' || coupon.discount_type === 'percentage'
          ? subtotal * (Number(coupon.discount_value) / 100)
          : Number(coupon.discount_value);
    }
  }
  const baseTotal = Math.max(0, subtotal + deliveryFee - discount);
  const total =
    selectedInstallment && selectedInstallment.installments > 1 && paymentMethod === 'cartão de crédito'
      ? selectedInstallment.totalAmount
      : baseTotal;

  const installmentLabel = useMemo(() => {
    if (!selectedInstallment || selectedInstallment.installments === 1) {
      return `1x de R$ ${baseTotal.toFixed(2).replace('.', ',')}`;
    }
    const hasInterest = Math.abs(selectedInstallment.totalAmount - baseTotal) > 0.05;
    return `${selectedInstallment.installments}x de R$ ${selectedInstallment.installmentAmount.toFixed(2).replace('.', ',')}${hasInterest ? ' com acréscimos' : ''}`;
  }, [selectedInstallment, baseTotal]);

  // Load dynamic delivery fee from store_settings
  useEffect(() => {
    const applySettingValue = (val: any) => {
      if (!val) return;
      if (val.isDeliveryFeeEnabled === false) {
        setIsDeliveryFeeEnabled(false);
        setDynamicDeliveryFee(0);
      } else {
        setIsDeliveryFeeEnabled(true);
        setDynamicDeliveryFee(Number(val.deliveryFee ?? DELIVERY_FEE));
      }
    };

    (async () => {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('setting_value')
          .eq('setting_key', 'store_status')
          .maybeSingle();
        applySettingValue(data?.setting_value);
      } catch {
        // fallback to DELIVERY_FEE
      }
    })();

    const channel = supabase
      .channel('store_settings_checkout_delivery_fee')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'store_settings', filter: 'setting_key=eq.store_status' },
        (payload) => {
          applySettingValue(payload.new?.setting_value);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load Session and Profile
  const refreshUser = useCallback(async () => {
    const session = await getEffectiveSession();
    if (session?.user) {
      setUser(session.user);
      setName((prev) => prev || session.user.user_metadata?.full_name || '');

      let userPhone = (session.user.phone || session.user.user_metadata?.phone || '').trim();

      // Carrega CPF e telefone salvos do perfil do usuário
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('cpf, phone')
          .eq('id', session.user.id)
          .maybeSingle();

        if (profile?.cpf && isValidCpf(profile.cpf)) {
          setCardCpf(profile.cpf);
        }
        if (profile?.phone && !userPhone) {
          userPhone = profile.phone.trim();
        }
      } catch (e) {
        console.warn('[useCheckoutFlow] Falha ao carregar perfil de profiles:', e);
      }

      // Fallback para AsyncStorage (se não tiver no profiles nem no auth)
      if (!userPhone) {
        try {
          const raw = await AsyncStorage.getItem(SAVED_USER_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.phone) {
              userPhone = String(parsed.phone).trim();
            }
          }
        } catch (e) {
          console.warn('[useCheckoutFlow] Falha ao carregar dados locais do usuário:', e);
        }
      }

      const formatted = formatPhone(userPhone);
      setPhone(formatted || userPhone);
      setHasSavedPhone(Boolean(userPhone && isValidPhone(userPhone)));
    } else {
      setUser(null);
      setHasSavedPhone(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const unsub = subscribeAuthUiChange(() => {
      refreshUser();
      loadAddress();
    });
    return () => {
      unsub();
    };
  }, [refreshUser]);

  // Load selected address
  const loadAddress = useCallback(async () => {
    try {
      const session = await getEffectiveSession();
      if (!session?.user) {
        setSelectedAddress(null);
        return;
      }
      setLoadingAddress(true);
      const selectedId = await getSelectedAddressId();
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false });

      if (error || !data || data.length === 0) {
        setSelectedAddress(null);
        return;
      }

      const addresses = data as Address[];
      if (selectedId) {
        const found = addresses.find((a) => a.id === selectedId);
        if (found) {
          setSelectedAddress(found);
          return;
        }
      }
      // Fallback: default or first address
      const def = addresses.find((a) => a.is_default) || addresses[0];
      setSelectedAddress(def || null);
    } catch (e) {
      console.error('Erro ao carregar endereço selecionado:', e);
    } finally {
      setLoadingAddress(false);
    }
  }, []);

  // Reload address and saved cards on screen focus
  useFocusEffect(
    useCallback(() => {
      loadAddress();
      loadSavedCards();
    }, [loadAddress, loadSavedCards])
  );

  // Load preferred payment method and saved card on mount (Padrão Pix ou último usado)
  useEffect(() => {
    (async () => {
      try {
        const cards = await loadSavedCards();
        const savedMethod = await getPreferredPaymentMethod();
        const preferredCardId = await getPreferredCardId();

        if (savedMethod) {
          const normSaved =
            savedMethod === 'credit_card' ? 'cartão de crédito' :
            savedMethod === 'debit_card' ? 'cartão de débito' :
            savedMethod;
          setPaymentMethod(normSaved as PaymentMethod);

          if (normSaved === 'cartão de crédito' || normSaved === 'cartão de débito') {
            if (cards && cards.length > 0) {
              const match = preferredCardId
                ? cards.find((c) => c.id === preferredCardId)
                : cards.find((c) => c.card_type === normSaved && c.is_default) || cards.find((c) => c.card_type === normSaved) || cards[0];
              if (match) {
                setSelectedSavedCard(match);
                setUseManualCardForm(false);
                return;
              }
            }
            setSelectedSavedCard(null);
            setUseManualCardForm(true);
          } else {
            setSelectedSavedCard(null);
            setUseManualCardForm(false);
          }
        } else {
          // Nenhum método salvo anteriormente -> Padrão absoluto é PIX
          setPaymentMethod('pix');
          setSelectedSavedCard(null);
          setUseManualCardForm(false);
        }
      } catch (e) {
        console.error('Erro ao ler preferências de pagamento:', e);
        setPaymentMethod('pix');
      }
    })();
  }, [loadSavedCards]);

  // Select payment method helper
  const selectPaymentMethod = useCallback(
    async (method: PaymentMethod, card?: SavedCard) => {
      const normalizedMethod: PaymentMethod =
        (method as string) === 'credit_card'
          ? 'cartão de crédito'
          : (method as string) === 'debit_card'
          ? 'cartão de débito'
          : method;
      setPaymentMethod(normalizedMethod);
      if (normalizedMethod !== 'cartão de crédito') {
        setSelectedInstallment(null);
        setInstallmentOptions([]);
        setShowInstallmentsModal(false);
      }

      if (card) {
        setSelectedSavedCard(card);
        setUseManualCardForm(false);
        await setPreferredCardId(card.id);
      } else if (normalizedMethod === 'cartão de crédito' || normalizedMethod === 'cartão de débito') {
        const cards = savedCards.length > 0 ? savedCards : await loadSavedCards();
        const match = cards.find((c) => c.card_type === normalizedMethod);
        if (match) {
          setSelectedSavedCard(match);
          setUseManualCardForm(false);
          await setPreferredCardId(match.id);
        } else {
          setSelectedSavedCard(null);
          setUseManualCardForm(true);
          await setPreferredCardId(null);
        }
      } else {
        setSelectedSavedCard(null);
        setUseManualCardForm(false);
        await setPreferredCardId(null);
      }
      await setPreferredPaymentMethod(normalizedMethod);
      setShowPaymentSelector(false);
    },
    [savedCards, loadSavedCards]
  );

  // Carrega opções reais de parcelamento no Mercado Pago
  const loadInstallments = useCallback(async () => {
    if (paymentMethod !== 'cartão de crédito' || baseTotal <= 0) {
      return;
    }

    setLoadingInstallments(true);
    setInstallmentsError(null);

    try {
      let savedCardId: string | null = null;
      let bin: string | null = null;

      if (selectedSavedCard && !useManualCardForm) {
        savedCardId = selectedSavedCard.id;
      } else if (cardNumber.replace(/\D/g, '').length >= 6) {
        bin = cardNumber.replace(/\D/g, '').slice(0, 6);
      }

      if (!savedCardId && !bin) {
        const fallback: InstallmentOption = {
          installments: 1,
          installmentAmount: baseTotal,
          totalAmount: baseTotal,
        };
        setInstallmentOptions([fallback]);
        return;
      }

      const res = await getInstallments({
        amount: baseTotal,
        savedCardId,
        bin,
      });

      if (res.success && Array.isArray(res.payerCosts) && res.payerCosts.length > 0) {
        setInstallmentOptions(res.payerCosts);
        setSelectedInstallment((prev) => {
          if (!prev || prev.installments === 1) return res.payerCosts[0];
          const match = res.payerCosts.find((c: InstallmentOption) => c.installments === prev.installments);
          return match || res.payerCosts[0];
        });
      } else {
        const fallback: InstallmentOption = {
          installments: 1,
          installmentAmount: baseTotal,
          totalAmount: baseTotal,
        };
        setInstallmentOptions([fallback]);
        if (res.error) {
          setInstallmentsError(res.error);
        }
      }
    } catch (err: any) {
      console.error('Erro ao buscar parcelamento:', err);
      setInstallmentsError(err?.message || 'Erro ao consultar parcelas');
    } finally {
      setLoadingInstallments(false);
    }
  }, [baseTotal, paymentMethod, selectedSavedCard, useManualCardForm, cardNumber]);

  const openInstallments = useCallback(() => {
    if (paymentMethod !== 'cartão de crédito') return;
    setShowInstallmentsModal(true);
    loadInstallments();
  }, [paymentMethod, loadInstallments]);

  const handleSelectInstallment = useCallback((option: InstallmentOption) => {
    setSelectedInstallment(option);
    setShowInstallmentsModal(false);
  }, []);

  const toggleDeliveryType = useCallback(() => {
    setDeliveryType((prev) => (prev === 'delivery' ? 'retirada' : 'delivery'));
  }, []);

  // Validation
  const validateOrder = (): string | null => {
    if (!name.trim()) return 'Informe seu nome para o pedido';
    if (!phone.trim()) return 'Informe seu número de WhatsApp para contato';
    if (!isValidPhone(phone)) return 'Informe um número de WhatsApp válido com DDD (ex: 14 99999-9999)';
    if (wantsCutlery === null) return 'Por favor, informe se precisa de talheres descartáveis';
    if (deliveryType === 'delivery') {
      if (!selectedAddress) return 'Selecione um endereço para entrega';
      if (!selectedAddress.street || !selectedAddress.number) return 'Endereço de entrega incompleto';
    }
    if (items.length === 0) return 'Sua sacola está vazia';

    if (orderNotes && orderNotes.trim().length > 300) {
      return 'A observação do pedido deve ter no máximo 300 caracteres';
    }

    if (paymentMethod === 'dinheiro' && cashChange.trim()) {
      const cleanChangeStr = cashChange.replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
      const numericChange = parseFloat(cleanChangeStr);
      if (isNaN(numericChange) || numericChange <= 0) {
        return 'Valor de troco inválido';
      }
      if (numericChange < total) {
        return `O valor do troco (R$ ${numericChange.toFixed(2).replace('.', ',')}) não pode ser menor que o total do pedido (R$ ${total.toFixed(2).replace('.', ',')})`;
      }
    }

    if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
      if (!isValidCpf(cardCpf)) return 'Informe um CPF válido para pagamento com cartão';
      if (selectedSavedCard && !useManualCardForm) {
        if (!savedCardCvv || savedCardCvv.length < 3) return 'Digite o CVV do cartão salvo para confirmar o pedido';
      } else {
        if (!cardName.trim()) return 'Informe o nome impresso no cartão';
        if (cardNumber.replace(/\D/g, '').length < 15) return 'Número de cartão inválido';
        if (cardExpiry.replace(/\D/g, '').length !== 4) return 'Validade do cartão inválida';
        if (cardCvv.length < 3) return 'CVV do cartão inválido';
      }
    }
    return null;
  };

  // Submit Order
  const submitOrder = async () => {
    if (submittingRef.current || submitting) return;
    submittingRef.current = true;

    // Check effective session
    const session = await getEffectiveSession();
    if (!session?.user) {
      submittingRef.current = false;
      requestAuthSheet();
      return;
    }

    const validationError = validateOrder();
    if (validationError) {
      submittingRef.current = false;
      setErrorMessage(validationError);
      showErrorAlert(validationError, 'Atenção');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      function getCardRejectionMessage(statusDetail?: string): string {
        switch (statusDetail) {
          case 'cc_rejected_insufficient_amount':
            return 'Saldo insuficiente';
          case 'cc_rejected_bad_filled_card_number':
          case 'cc_rejected_bad_filled_date':
          case 'cc_rejected_bad_filled_security_code':
          case 'cc_rejected_bad_filled_other':
            return 'Dados do cartão incorretos';
          case 'cc_rejected_call_for_authorize':
            return 'Autorize a transação junto ao seu banco';
          case 'cc_rejected_card_disabled':
            return 'Cartão desabilitado';
          case 'cc_rejected_duplicated_payment':
            return 'Pagamento duplicado recentemente';
          case 'cc_rejected_max_attempts':
            return 'Limite de tentativas excedido';
          default:
            return 'Pagamento recusado pela operadora do cartão';
        }
      }

      // Verificado em components/cart/StepPagamento.tsx:113-116
      const isOnline =
        paymentMethod === 'pix' ||
        paymentMethod === 'cartão de crédito' ||
        paymentMethod === 'cartão de débito';

      const customerAddress =
        deliveryType === 'delivery' && selectedAddress
          ? `${selectedAddress.street}, ${selectedAddress.number}`
          : STORE_ADDRESS.full;

      const customerNeighborhood =
        deliveryType === 'delivery' && selectedAddress
          ? selectedAddress.neighborhood
          : STORE_ADDRESS.neighborhood;

      const mappedPaymentMethod =
        paymentMethod === 'pix'
          ? 'pix'
          : paymentMethod === 'dinheiro'
          ? 'dinheiro'
          : 'cartao';

      const isCredit =
        paymentMethod === 'cartão de crédito' ||
        paymentMethod === 'cartão de crédito (entrega)';
      const isDebit =
        paymentMethod === 'cartão de débito' ||
        paymentMethod === 'cartão de débito (entrega)';

      const orderMetadata: any = {
        source: 'app',
        cep: deliveryType === 'delivery' && selectedAddress ? selectedAddress.cep : null,
        delivery_lat: deliveryType === 'delivery' && selectedAddress ? selectedAddress.latitude ?? null : null,
        delivery_lng: deliveryType === 'delivery' && selectedAddress ? selectedAddress.longitude ?? null : null,
      };
      if (isCredit) {
        orderMetadata.card_type = 'credit';
        if (selectedInstallment && selectedInstallment.installments > 1) {
          orderMetadata.installments = selectedInstallment.installments;
          orderMetadata.installment_amount = selectedInstallment.installmentAmount;
          orderMetadata.financed_total = selectedInstallment.totalAmount;
        }
      } else if (isDebit) {
        orderMetadata.card_type = 'debit';
      }

      const notesParts: string[] = [];
      if (orderNotes.trim()) notesParts.push(orderNotes.trim());
      if (paymentMethod === 'dinheiro' && cashChange.trim()) {
        notesParts.push(`Troco para R$ ${cashChange.trim()}`);
      }
      const finalNotes = notesParts.join(' | ');

      // 1. Reuso de orderId em retentativa (ref), ou criação via RPC create_order
      let currentOrderId = pendingOrderIdRef.current;

      if (!currentOrderId) {
        let mappedItems: any[];
        try {
          mappedItems = mapCartItemsToOrderItems(items);
        } catch (itemErr: any) {
          setSubmitting(false);
          const err = 'Itens inválidos: ' + (itemErr?.message || 'erro de mapeamento');
          setErrorMessage(err);
          showThemedAlert('Itens inválidos', err);
          return;
        }

        const cleanPhoneDigits = phone.replace(/\D/g, '').replace(/^55/, '');
        const formattedPhone = formatPhone(cleanPhoneDigits) || phone.trim();

        const { data: rpcData, error: rpcError } = await supabase.rpc('create_order', {
          p_customer_name: name.trim().slice(0, 100),
          p_customer_phone: formattedPhone,
          p_customer_address: customerAddress,
          p_customer_neighborhood: customerNeighborhood,
          p_customer_complement:
            deliveryType === 'delivery' && selectedAddress ? selectedAddress.complement || null : null,
          p_delivery_type: deliveryType === 'retirada' ? 'retirada' : 'delivery',
          p_payment_method: mappedPaymentMethod,
          p_payment_online: isOnline,
          p_coupon_code: coupon?.code || null,
          p_notes: finalNotes || null,
          p_wants_cutlery: wantsCutlery ?? false,
          p_metadata: orderMetadata,
          p_items: mappedItems,
        });

        if (rpcError || !rpcData?.order_id) {
          setSubmitting(false);
          const rawMsg = rpcError?.message || 'Erro ao criar pedido';
          const mappedMsg = ERROR_MESSAGES[rawMsg] || rawMsg;
          setErrorMessage(mappedMsg);
          showThemedAlert('Erro no pedido', mappedMsg);
          return;
        }

        currentOrderId = rpcData.order_id;
        pendingOrderIdRef.current = currentOrderId;
      }

      // 2. Processa pagamento nas rotas do servidor se for online
      let cardResult: any = null;

      if (paymentMethod === 'pix') {
        const pixResult: any = await createPixPayment(currentOrderId);
        if (!pixResult.success) {
          setSubmitting(false);
          if (pixResult.error === 'order_status_not_payable' || pixResult.error === 'order_not_found') {
            pendingOrderIdRef.current = null;
          }
          const isConfigErr = pixResult.error?.startsWith('config:');
          const err = isConfigErr
            ? 'O serviço de pagamento está temporariamente indisponível. Por favor, tente outra forma de pagamento.'
            : (pixResult.error || 'Erro ao gerar chave PIX');
          setErrorMessage(err);
          showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no PIX', err);
          return;
        }

        const qrCodeVal = pixResult.qrCode || pixResult.qr_code || '';
        const qrBase64Val = pixResult.qrCodeBase64 || pixResult.qr_code_base64 || '';
        if (qrCodeVal || qrBase64Val) {
          try {
            await supabase.rpc('merge_order_metadata', {
              order_id: currentOrderId,
              patch: {
                pix: {
                  payment_id: String(pixResult.paymentId || pixResult.id || ''),
                  qr_code: qrCodeVal,
                  qr_code_base64: qrBase64Val,
                  ticket_url: pixResult.ticketUrl || pixResult.ticket_url || '',
                  expiration_date: pixResult.expirationDate || pixResult.expiration_date || null,
                },
              },
            });
          } catch {}
        }
      } else if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
        try {
          const chosenInstallments = paymentMethod === 'cartão de crédito' ? (selectedInstallment?.installments || 1) : 1;

          if (selectedSavedCard && !useManualCardForm) {
            // Sincroniza CPF do titular com profiles para evitar solicitar no futuro
            if (cardCpf && isValidCpf(cardCpf) && session?.user?.id) {
              supabase
                .from('profiles')
                .update({ cpf: cardCpf.replace(/\D/g, '') })
                .eq('id', session.user.id)
                .then(() => {});
            }

            cardResult = await chargeWithSavedCard({
              orderId: currentOrderId,
              savedCardId: selectedSavedCard.id,
              cardId: selectedSavedCard.mp_card_id,
              securityCode: savedCardCvv,
              paymentMethodId: selectedSavedCard.payment_method_id,
              docNumber: cardCpf && isValidCpf(cardCpf) ? cardCpf.replace(/\D/g, '') : undefined,
              installments: chosenInstallments,
              installmentsBaseAmount: baseTotal,
            });
          } else {
            const [expMonth, expYear] = cardExpiry.split('/');
            const fullYear = `20${expYear}`;

            const tokenResult = await tokenizeCard({
              cardNumber,
              expirationMonth: expMonth,
              expirationYear: fullYear,
              securityCode: cardCvv,
              cardholderName: cardName.trim(),
              docNumber: cardCpf.replace(/\D/g, ''),
            });

            if (!tokenResult.success || !tokenResult.token) {
              setSubmitting(false);
              const isConfigErr = tokenResult.error?.startsWith('config:');
              const err = isConfigErr
                ? 'O serviço de pagamento está temporariamente indisponível. Escolha outra forma de pagamento.'
                : (tokenResult.error || 'Erro ao processar dados do cartão');
              setErrorMessage(err);
              showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no cartão', err);
              return;
            }

            const pmId = guessPaymentMethodId(cardNumber);
            cardResult = await createCardPayment({
              orderId: currentOrderId,
              token: tokenResult.token,
              paymentMethodId: pmId,
              docNumber: cardCpf.replace(/\D/g, ''),
              installments: chosenInstallments,
              installmentsBaseAmount: baseTotal,
            });
          }
        } finally {
          setSavedCardCvv('');
          setCardCvv('');
        }

        if (cardResult.status === 'rejected') {
          setSubmitting(false);
          const err = getCardRejectionMessage(cardResult.statusDetail);
          setErrorMessage(err);
          showThemedAlert('Pagamento recusado', err);
          return; // Mantém pendingOrderIdRef para retentativa com mesmo pedido
        }

        if (!cardResult.success && !cardResult.status) {
          setSubmitting(false);
          if (cardResult.error?.includes('Limite de tentativas') || cardResult.error === 'order_status_not_payable') {
            pendingOrderIdRef.current = null;
          }
          const isConfigErr = cardResult.error?.startsWith('config:');
          const err = isConfigErr
            ? 'O serviço de pagamento está temporariamente indisponível. Escolha outra forma de pagamento.'
            : (cardResult.error || 'Erro ao processar pagamento do cartão');
          setErrorMessage(err);
          showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no cartão', err);
          return;
        }

        if (cardResult.status === 'in_process') {
          showThemedAlert(
            'Pagamento em análise',
            'Seu pagamento está sendo analisado pelo Mercado Pago. Você pode acompanhar o status pelo pedido.'
          );
        }
      }

      // Sucesso na submissão
      const finalOrderId = currentOrderId;
      pendingOrderIdRef.current = null;

      // Persiste o telefone no banco de dados atrelado ao usuário (profiles), user_metadata e AsyncStorage
      if (session?.user?.id && phone.trim()) {
        const cleanPhone = phone.trim();
        const cleanDigits = cleanPhone.replace(/\D/g, '').replace(/^55/, '');
        const phoneToSave = cleanDigits || cleanPhone;

        supabase
          .from('profiles')
          .upsert({ id: session.user.id, phone: phoneToSave }, { onConflict: 'id' })
          .then(({ error }) => {
            if (error) console.warn('[useCheckoutFlow] Falha ao atualizar telefone em profiles:', error);
          });

        supabase.auth
          .updateUser({
            data: { phone: phoneToSave },
          })
          .catch(() => {});

        AsyncStorage.getItem(SAVED_USER_KEY)
          .then((raw) => {
            try {
              const parsed = raw ? JSON.parse(raw) : {};
              parsed.phone = phoneToSave;
              AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(parsed)).catch(() => {});
            } catch {}
          })
          .catch(() => {});

        setHasSavedPhone(true);
      }

      if (paymentMethod !== 'pix') {
        notifyAdminNewOrder(finalOrderId).catch((notifyErr) => {
          console.error('[useCheckoutFlow] Falha silenciosa no notifyAdminNewOrder:', notifyErr);
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOrderCompleted(true);
      setShowReviseModal(false);
      isOrderFinishingRef.current = true;
      clearCart();
      setSubmitting(false);
      router.replace(`/pedidos/${finalOrderId}`);
    } catch (e: any) {
      console.error('Erro ao finalizar pedido:', e);
      const msg = e?.message || 'Erro inesperado ao criar o pedido. Tente novamente.';
      setErrorMessage(msg);
      showThemedAlert('Erro', msg);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Step advancement / "Continuar" no rodapé avança os steps 1 -> 2 -> 3
  const handleContinue = async () => {
    if (items.length === 0) return;

    if (step === 'itens') {
      if (MIN_ORDER_VALUE > 0 && subtotal < MIN_ORDER_VALUE) {
        setMinOrderSheetVisible(true);
        return;
      }
      setStep('entrega');
      return;
    }

    if (step === 'entrega') {
      if (deliveryType === 'delivery' && !selectedAddress) {
        showThemedAlert(
          'Endereço necessário',
          'Por favor, selecione ou cadastre um endereço para entrega.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Cadastrar endereço', onPress: () => router.push('/addresses') },
          ]
        );
        return;
      }
      setStep('pagamento');
      return;
    }

    // step === 'pagamento' -> Botão "Revisar pedido" abre o ReviseOrderModal
    if (wantsCutlery === null) {
      showErrorAlert('Por favor, informe se precisa de talheres.', 'Atenção');
      return;
    }

    if (!hasSavedPhone) {
      if (!phone.trim()) {
        showErrorAlert('Por favor, informe seu número de WhatsApp para contato.', 'WhatsApp obrigatório');
        return;
      }
      if (!isValidPhone(phone)) {
        showErrorAlert('Informe um número de WhatsApp válido com DDD (ex: 14 99999-9999).', 'WhatsApp inválido');
        return;
      }
    }

    if (orderNotes && orderNotes.trim().length > 300) {
      showErrorAlert('A observação do pedido deve ter no máximo 300 caracteres.', 'Observação muito longa');
      return;
    }

    if (paymentMethod === 'dinheiro' && cashChange.trim()) {
      const cleanChangeStr = cashChange.replace(/\s/g, '').replace('R$', '').replace(/\./g, '').replace(',', '.');
      const numericChange = parseFloat(cleanChangeStr);
      if (isNaN(numericChange) || numericChange <= 0) {
        showErrorAlert('Por favor, informe um valor de troco válido.', 'Troco inválido');
        return;
      }
      if (numericChange < total) {
        showErrorAlert(`O valor do troco (R$ ${numericChange.toFixed(2).replace('.', ',')}) não pode ser menor que o total do pedido (R$ ${total.toFixed(2).replace('.', ',')}).`, 'Troco insuficiente');
        return;
      }
    }

    const session = await getEffectiveSession();
    if (!session) {
      requestAuthSheet();
      return;
    }
    setShowReviseModal(true);
  };

  // Back handling
  const handleBack = () => {
    if (showInstallmentsModal) {
      setShowInstallmentsModal(false);
      return;
    }
    if (showReviseModal) {
      setShowReviseModal(false);
      return;
    }
    if (showPaymentSelector) {
      setShowPaymentSelector(false);
      return;
    }
    if (showCardWizard) {
      setShowCardWizard(false);
      return;
    }
    if (step === 'pagamento') {
      setStep('entrega');
      return;
    }
    if (step === 'entrega') {
      setStep('itens');
      return;
    }
    router.back();
  };

  // Clear cart prompt
  const handleClearCart = () => {
    showThemedAlert('Limpar sacola?', 'Deseja remover todos os itens da sacola?', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Sim, limpar',
        style: 'destructive',
        onPress: () => {
          clearCart();
        },
      },
    ]);
  };

  // Peça também item addition
  const handleAddQuickItem = (product: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addToCart({
      id: product.id,
      nome: product.nome,
      preco: product.precoFormatado || `R$ ${Number(product.preco).toFixed(2).replace('.', ',')}`,
      precoNum: Math.round(Number(product.preco) * 100),
      imagem: product.imagem,
      quantidade: 1,
      adicionais: [],
      observacoes: '',
    });
  };

  // Navega para produto em modo de edição (Item 7)
  const onEditItem = (item: any) => {
    router.push({
      pathname: `/produto/${item.id}`,
      params: {
        editCartItemId: item.cartItemId || item.id,
        initialQty: String(item.quantity || 1),
        initialObs: item.observacoes || '',
        initialAdicionais: JSON.stringify(item.adicionais || []),
      },
    });
  };

  return {
    step,
    setStep,
    items,
    subtotal,
    deliveryFee,
    isDeliveryFeeEnabled,
    discount,
    total,
    coupon,
    couponInvalidReason,
    deliveryType,
    setDeliveryType,
    toggleDeliveryType,
    selectedAddress,
    loadingAddress,
    paymentMethod,
    savedCards,
    addCard,
    savingCard,
    loadSavedCards,
    selectedSavedCard,
    savedCardCvv,
    setSavedCardCvv,
    useManualCardForm,
    setUseManualCardForm,
    cardName,
    setCardName,
    cardNumber,
    setCardNumber,
    cardExpiry,
    setCardExpiry,
    cardCvv,
    setCardCvv,
    cardCpf,
    setCardCpf,
    wantsCutlery,
    setWantsCutlery,
    cashChange,
    setCashChange,
    orderNotes,
    setOrderNotes,
    name,
    setName,
    phone,
    setPhone,
    hasSavedPhone,
    setHasSavedPhone,
    submitting,
    errorMessage,
    showPaymentSelector,
    setShowPaymentSelector,
    showReviseModal,
    setShowReviseModal,
    showCardWizard,
    setShowCardWizard,
    minOrderSheetVisible,
    setMinOrderSheetVisible,
    baseTotal,
    showInstallmentsModal,
    setShowInstallmentsModal,
    installmentOptions,
    selectedInstallment,
    loadingInstallments,
    installmentsError,
    loadInstallments,
    openInstallments,
    handleSelectInstallment,
    installmentLabel,
    selectPaymentMethod,
    submitOrder,
    orderCompleted,
    isOrderFinishingRef,
    handleContinue,
    handleBack,
    handleClearCart,
    handleAddQuickItem,
    onEditItem,
    removeFromCart,
    updateQty,
    clearCart,
    setCoupon,
    rankedProducts,
  };
}
