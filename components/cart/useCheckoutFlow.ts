import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
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
import { useProductRanking } from '../../app/hooks/useProductRanking';
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
import { showThemedAlert } from '../ThemedAlert';

export type CheckoutStep = 'itens' | 'entrega' | 'pagamento';

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

export function useCheckoutFlow() {
  const router = useRouter();
  const { items, total: totalCents, add: addToCart, remove: removeFromCart, updateQty, clear: clearCart, coupon, setCoupon } = useCart();
  const { cards: savedCards, loadCards: loadSavedCards, addCard, savingCard } = usePaymentCards();
  const { produtos: rankedProducts } = useProductRanking();

  // Navigation & Step state
  const [step, setStep] = useState<CheckoutStep>('itens');
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [_showReviseModal, _setShowReviseModal] = useState(false);
  const [showCardWizard, setShowCardWizard] = useState(false);
  const [minOrderSheetVisible, setMinOrderSheetVisible] = useState(false);
  const [showInstallmentsModal, setShowInstallmentsModal] = useState(false);
  const [installmentOptions, setInstallmentOptions] = useState<InstallmentOption[]>([]);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentOption | null>(null);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [installmentsError, setInstallmentsError] = useState<string | null>(null);

  // User & Session
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [dynamicDeliveryFee, setDynamicDeliveryFee] = useState<number>(DELIVERY_FEE);

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
  const deliveryFee = deliveryType === 'delivery' ? dynamicDeliveryFee : 0;

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
    (async () => {
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('setting_value')
          .eq('setting_key', 'store_status')
          .maybeSingle();
        const val = data?.setting_value;
        if (val) {
          if (val.isDeliveryFeeEnabled === false) {
            setDynamicDeliveryFee(0);
          } else if (val.deliveryFee !== undefined) {
            setDynamicDeliveryFee(Number(val.deliveryFee));
          }
        }
      } catch {
        // fallback to DELIVERY_FEE
      }
    })();
  }, []);

  // Load Session and Profile
  const refreshUser = useCallback(async () => {
    const session = await getEffectiveSession();
    if (session?.user) {
      setUser(session.user);
      setName((prev) => prev || session.user.user_metadata?.full_name || '');
      setPhone((prev) => prev || session.user.phone || session.user.user_metadata?.phone || '');
    } else {
      setUser(null);
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

  // Reload address on screen focus
  useFocusEffect(
    useCallback(() => {
      loadAddress();
    }, [loadAddress])
  );

  // Load preferred payment method and saved card on mount (Item 9: se tiver cartão salvo, já vem selecionado)
  useEffect(() => {
    (async () => {
      try {
        const cards = await loadSavedCards();
        const savedMethod = await getPreferredPaymentMethod();
        const preferredCardId = await getPreferredCardId();

        if (cards && cards.length > 0) {
          const match = preferredCardId
            ? cards.find((c) => c.id === preferredCardId)
            : cards.find((c) => c.is_default) || cards[0];

          if (match) {
            setSelectedSavedCard(match);
            setPaymentMethod(match.card_type as PaymentMethod);
            setUseManualCardForm(false);
            return;
          }
        }

        if (savedMethod) {
          setPaymentMethod(savedMethod as PaymentMethod);
        } else {
          setPaymentMethod('pix');
        }
      } catch (e) {
        console.error('Erro ao ler preferências de pagamento:', e);
      }
    })();
  }, [loadSavedCards]);

  // Select payment method helper
  const selectPaymentMethod = useCallback(
    async (method: PaymentMethod, card?: SavedCard) => {
      setPaymentMethod(method);
      if (method !== 'cartão de crédito') {
        setSelectedInstallment(null);
        setInstallmentOptions([]);
        setShowInstallmentsModal(false);
      }

      if (card) {
        setSelectedSavedCard(card);
        setUseManualCardForm(false);
        await setPreferredCardId(card.id);
      } else if (method === 'cartão de crédito' || method === 'cartão de débito') {
        const cards = savedCards.length > 0 ? savedCards : await loadSavedCards();
        const match = cards.find((c) => c.card_type === method);
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
    if (!phone.trim()) return 'Informe seu telefone (WhatsApp)';
    if (wantsCutlery === null) return 'Por favor, informe se precisa de talheres descartáveis';
    if (deliveryType === 'delivery') {
      if (!selectedAddress) return 'Selecione um endereço para entrega';
      if (!selectedAddress.street || !selectedAddress.number) return 'Endereço de entrega incompleto';
    }
    if (items.length === 0) return 'Sua sacola está vazia';

    if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
      if (selectedSavedCard && !useManualCardForm) {
        if (!savedCardCvv || savedCardCvv.length < 3) return 'Digite o CVV do cartão salvo para confirmar o pedido';
      } else {
        if (!cardName.trim()) return 'Informe o nome impresso no cartão';
        if (cardNumber.replace(/\D/g, '').length < 15) return 'Número de cartão inválido';
        if (cardExpiry.replace(/\D/g, '').length !== 4) return 'Validade do cartão inválida';
        if (cardCvv.length < 3) return 'CVV do cartão inválido';
        if (!isValidCpf(cardCpf)) return 'CPF do titular inválido';
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
      showThemedAlert('Atenção', validationError);
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

        const { data: rpcData, error: rpcError } = await supabase.rpc('create_order', {
          p_customer_name: name.trim(),
          p_customer_phone: phone.trim(),
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
      if (paymentMethod !== 'pix') {
        notifyAdminNewOrder(finalOrderId);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearCart();
      setShowReviseModal(false);
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
          router.back();
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
