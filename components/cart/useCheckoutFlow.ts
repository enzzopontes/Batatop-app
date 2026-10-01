import { useState, useEffect, useCallback, useRef } from 'react';
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
} from '../../utils/mercadoPago';
import { notifyAdminNewOrder } from '../../utils/notifyNewOrder';
import { MIN_ORDER_VALUE, DELIVERY_FEE, STORE_ADDRESS } from '../../constants/store';
import { showThemedAlert } from '../ThemedAlert';

export type CheckoutStep = 'itens' | 'entrega' | 'pagamento';
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
}

export function useCheckoutFlow() {
  const router = useRouter();
  const { items, total: totalCents, add: addToCart, remove: removeFromCart, updateQty, clear: clearCart, coupon, setCoupon } = useCart();
  const { cards: savedCards, loadCards: loadSavedCards, addCard, savingCard } = usePaymentCards();
  const { produtos: rankedProducts } = useProductRanking();

  // Navigation & Step state
  const [step, setStep] = useState<CheckoutStep>('itens');
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showCardWizard, setShowCardWizard] = useState(false);
  const [minOrderSheetVisible, setMinOrderSheetVisible] = useState(false);

  // User & Session
  const [user, setUser] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // Delivery
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('delivery');
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [loadingAddress, setLoadingAddress] = useState(false);

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

  // Extra options (talher obrigatório)
  const [wantsCutlery, setWantsCutlery] = useState<boolean | null>(null);
  const [cashChange, setCashChange] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Process / Submission
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Calculations
  const subtotal = totalCents / 100;
  const deliveryFee = deliveryType === 'delivery' ? DELIVERY_FEE : 0;

  // Coupon discount calculation
  let discount = 0;
  let couponInvalidReason: string | null = null;
  if (coupon) {
    if (coupon.min_order_value && subtotal < Number(coupon.min_order_value)) {
      couponInvalidReason = `Pedido mínimo de R$ ${Number(coupon.min_order_value).toFixed(2).replace('.', ',')}`;
      discount = 0;
    } else {
      discount =
        coupon.discount_type === 'percent'
          ? subtotal * (Number(coupon.discount_value) / 100)
          : Number(coupon.discount_value);
    }
  }
  const total = Math.max(0, subtotal + deliveryFee - discount);

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
      await setPreferredPaymentMethod(method);

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
        if (cardCpf.replace(/\D/g, '').length !== 11) return 'CPF do titular inválido';
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
      // 1. Sequencial order_number
      let orderNumber = 1;
      try {
        const { data: maxOrderData } = await supabase
          .from('orders')
          .select('order_number')
          .order('order_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (maxOrderData && maxOrderData.order_number) {
          orderNumber = Number(maxOrderData.order_number) + 1;
        }
      } catch {
        orderNumber = Math.floor(1000 + Math.random() * 9000);
      }

      const customerAddress =
        deliveryType === 'delivery' && selectedAddress
          ? `${selectedAddress.street}, ${selectedAddress.number}`
          : STORE_ADDRESS.full;

      const customerNeighborhood =
        deliveryType === 'delivery' && selectedAddress
          ? selectedAddress.neighborhood
          : STORE_ADDRESS.neighborhood;

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

      const email = session.user.email || 'cliente@batatatop.com.br';
      const totalFinal = Math.round(total * 100) / 100;
      const subtotalFinal = Math.round(subtotal * 100) / 100;
      const discountFinal = Math.round(discount * 100) / 100;

      // 2. Processa pagamento
      let pixDetails: any = null;
      if (paymentMethod === 'pix') {
        const pixResult = await createPixPayment(totalFinal, email, name.trim(), orderNumber);
        if (pixResult.success) {
          pixDetails = {
            qr_code: pixResult.qrCode,
            qr_code_base64: pixResult.qrCodeBase64,
            payment_id: pixResult.paymentId,
            order_id: pixResult.orderId,
            simulation: pixResult.simulation,
          };
        } else {
          setSubmitting(false);
          const isConfigErr = pixResult.error?.startsWith('config:');
          const err = isConfigErr
            ? 'O serviço de pagamento está temporariamente indisponível. Por favor, tente outra forma de pagamento.'
            : (pixResult.error || 'Erro ao gerar chave PIX');
          setErrorMessage(err);
          showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no PIX', err);
          return;
        }
      }

      let cardDetails: any = null;
      if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
        if (selectedSavedCard && !useManualCardForm) {
          const cardResult = await chargeWithSavedCard({
            amount: totalFinal,
            cardId: selectedSavedCard.mp_card_id,
            securityCode: savedCardCvv,
            paymentMethodId: selectedSavedCard.payment_method_id,
            email,
            name: selectedSavedCard.cardholder_name || name.trim(),
            docNumber: cardCpf || '00000000000',
            orderNumber,
          });

          if (cardResult.status === 'rejected') {
            setSubmitting(false);
            const err = getCardRejectionMessage(cardResult.statusDetail);
            setErrorMessage(err);
            showThemedAlert('Pagamento recusado', err);
            return;
          }

          if (!cardResult.success && !cardResult.status) {
            setSubmitting(false);
            const isConfigErr = cardResult.error?.startsWith('config:');
            const err = isConfigErr
              ? 'O serviço de pagamento está temporariamente indisponível. Escolha outra forma de pagamento.'
              : (cardResult.error || 'Erro ao processar pagamento do cartão salvo');
            setErrorMessage(err);
            showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no cartão', err);
            return;
          }

          cardDetails = {
            payment_id: cardResult.paymentId,
            status: cardResult.status,
            status_detail: cardResult.statusDetail,
            simulation: cardResult.simulation,
            brand: selectedSavedCard.payment_method_id,
            last4: selectedSavedCard.last_four,
            saved_card: true,
          };
        } else {
          const [expMonth, expYear] = cardExpiry.split('/');
          const fullYear = `20${expYear}`;

          const tokenResult = await tokenizeCard({
            cardNumber,
            expirationMonth: expMonth,
            expirationYear: fullYear,
            securityCode: cardCvv,
            cardholderName: cardName.trim(),
            docNumber: cardCpf,
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
          const cardResult = await createCardPayment({
            amount: totalFinal,
            token: tokenResult.token,
            paymentMethodId: pmId,
            email,
            name: cardName.trim(),
            docNumber: cardCpf,
            orderNumber,
          });

          if (cardResult.status === 'rejected') {
            setSubmitting(false);
            const err = getCardRejectionMessage(cardResult.statusDetail);
            setErrorMessage(err);
            showThemedAlert('Pagamento recusado', err);
            return;
          }

          if (!cardResult.success && !cardResult.status) {
            setSubmitting(false);
            const isConfigErr = cardResult.error?.startsWith('config:');
            const err = isConfigErr
              ? 'O serviço de pagamento está temporariamente indisponível. Escolha outra forma de pagamento.'
              : (cardResult.error || 'Erro ao processar pagamento do cartão');
            setErrorMessage(err);
            showThemedAlert(isConfigErr ? 'Serviço indisponível' : 'Erro no cartão', err);
            return;
          }

          cardDetails = {
            payment_id: cardResult.paymentId,
            status: cardResult.status,
            status_detail: cardResult.statusDetail,
            simulation: cardResult.simulation,
            brand: pmId,
            last4: cardNumber.replace(/\D/g, '').slice(-4),
            saved_card: false,
          };
        }
      }

      // Determina status inicial do pedido
      let orderInitialStatus = 'pending';
      let paymentInitialStatus = 'pending';

      if (paymentMethod === 'pix') {
        orderInitialStatus = 'pending';
        paymentInitialStatus = 'pending';
      } else if (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito') {
        if (cardDetails?.status === 'approved') {
          orderInitialStatus = 'preparing';
          paymentInitialStatus = 'approved';
        } else {
          orderInitialStatus = 'awaiting_payment';
          paymentInitialStatus = 'in_process';
        }
      } else {
        orderInitialStatus = 'pending';
        paymentInitialStatus = 'pending';
      }

      const notesParts: string[] = [];
      if (orderNotes.trim()) notesParts.push(orderNotes.trim());
      if (paymentMethod === 'dinheiro' && cashChange.trim()) {
        notesParts.push(`Troco para R$ ${cashChange.trim()}`);
      }
      const finalNotes = notesParts.join(' | ');

      // 3. Insert em orders
      const orderPayload = {
        user_id: session.user.id,
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: customerAddress,
        customer_neighborhood: customerNeighborhood,
        subtotal: subtotalFinal,
        delivery_fee: deliveryFee,
        discount_amount: discountFinal,
        coupon_code: coupon?.code || null,
        total: totalFinal,
        payment_method: paymentMethod,
        payment_status: paymentInitialStatus,
        status: orderInitialStatus,
        notes: finalNotes || null,
        delivery_type: deliveryType,
        order_number: orderNumber,
        wants_cutlery: wantsCutlery ?? false,
        metadata: {
          cep: deliveryType === 'delivery' && selectedAddress ? selectedAddress.cep : null,
          source: 'mobile_app',
          delivery_fee: deliveryFee,
          pix: pixDetails,
          card: cardDetails,
        },
      };

      const { data: created, error: orderError } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (orderError || !created) {
        setSubmitting(false);
        const err = orderError?.message || 'Erro ao criar pedido';
        setErrorMessage(err);
        showThemedAlert('Erro no pedido', err);
        return;
      }

      // 4. Insert em order_items
      const itemRows = items.map((i: any) => ({
        order_id: created.id,
        product_id: i.id,
        product_name: i.nome,
        product_price: i.precoNum / 100,
        quantity: i.quantity,
        notes: i.observacoes || null,
        adicionais: (i.adicionais || []).map((a: any) => a.name),
      }));
      await supabase.from('order_items').insert(itemRows);

      // 5. Incrementa cupom
      if (coupon?.id) {
        await supabase
          .from('coupons')
          .update({ current_uses: (coupon.current_uses ?? 0) + 1 })
          .eq('id', coupon.id);
      }

      // 6. Push notification admin
      notifyAdminNewOrder(created.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearCart();
      setShowReviseModal(false);
      setSubmitting(false);

      if (
        orderInitialStatus === 'awaiting_payment' &&
        (paymentMethod === 'cartão de crédito' || paymentMethod === 'cartão de débito')
      ) {
        showThemedAlert(
          'Pagamento em análise',
          'Seu pagamento está sendo analisado pelo Mercado Pago. Você pode acompanhar o status pelo pedido.'
        );
      }

      // 7. Navega para tela de acompanhamento
      router.replace(`/pedidos/${created.id}`);
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

  // Step advancement / "Continuar" no rodapé abre o modal "Revise o seu pedido"
  const handleContinue = async () => {
    if (items.length === 0) return;
    if (MIN_ORDER_VALUE > 0 && subtotal < MIN_ORDER_VALUE) {
      setMinOrderSheetVisible(true);
      return;
    }
    const session = await getEffectiveSession();
    if (!session) {
      requestAuthSheet();
      return;
    }
    if (wantsCutlery === null) {
      showThemedAlert(
        'Precisa de talheres?',
        'Por favor, informe se você precisa de talheres descartáveis para a sua refeição.',
        [
          { text: 'Não preciso', style: 'cancel', onPress: () => { setWantsCutlery(false); setShowReviseModal(true); } },
          { text: 'Sim, preciso', onPress: () => { setWantsCutlery(true); setShowReviseModal(true); } },
        ]
      );
      return;
    }
    setShowReviseModal(true);
  };

  // Back handling
  const handleBack = () => {
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
