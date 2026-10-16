import { useState, useCallback } from 'react';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession } from './authSession';
import {
  tokenizeCard,
  guessPaymentMethodId,
} from './mercadoPago';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://batatatopiacanga.com.br';

export type SavedCard = {
  id: string;
  user_id: string;
  mp_customer_id: string;
  mp_card_id: string;
  last_four: string;
  payment_method_id: string;
  card_type: "cartão de crédito" | "cartão de débito";
  cardholder_name: string;
  is_default: boolean;
  created_at?: string;
};

/**
 * Hook que centraliza toda a lógica de cartões salvos do usuário:
 * listar (via SELECT), salvar (tokeniza no cliente e chama POST /api/mercadopago/cards),
 * atualizar padrão (PATCH /api/mercadopago/cards) e remover (DELETE /api/mercadopago/cards).
 * Sem INSERT/UPDATE/DELETE direto no banco pelo cliente.
 */
export function usePaymentCards() {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);
  const [savingCard, setSavingCard] = useState(false);

  const loadCards = useCallback(async (): Promise<SavedCard[]> => {
    setLoadingCards(true);
    try {
      const session = await getEffectiveSession();
      const user = session?.user;
      if (!user) {
        setCards([]);
        return [];
      }

      const { data, error } = await supabase
        .from('payment_cards')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar cartões salvos:', error);
        setCards([]);
        return [];
      }

      setCards((data as SavedCard[]) || []);
      return (data as SavedCard[]) || [];
    } finally {
      setLoadingCards(false);
    }
  }, []);

  /**
   * Cadastra um novo cartão:
   * 1. Tokeniza os dados digitados via Public Key no cliente
   * 2. Envia para o backend seguro (POST /api/mercadopago/cards) com Bearer token
   * 3. O servidor gerencia o customer, associa o cartão no MP e insere no banco com compensação
   */
  const addCard = useCallback(async ({
    cardNumber,
    expirationMonth,
    expirationYear,
    securityCode,
    cardholderName,
    docNumber,
    cardType,
    setAsDefault,
  }: {
    cardNumber: string;
    expirationMonth: string;
    expirationYear: string;
    securityCode: string;
    cardholderName: string;
    docNumber: string;
    cardType: "cartão de crédito" | "cartão de débito";
    setAsDefault?: boolean;
  }) => {
    setSavingCard(true);
    try {
      const session = await getEffectiveSession();
      const user = session?.user;
      if (!user || !session?.access_token) {
        return { success: false, error: 'Você precisa estar logado para salvar um cartão.' };
      }

      // 1. Tokeniza o cartão com a Public Key
      const tokenResult = await tokenizeCard({
        cardNumber,
        expirationMonth,
        expirationYear,
        securityCode,
        cardholderName,
        docNumber,
      });
      if (!tokenResult.success) {
        return { success: false, error: tokenResult.error };
      }

      const paymentMethodId = guessPaymentMethodId(cardNumber);

      // 2. Chama a rota segura do servidor com Bearer
      const response = await fetch(`${API_BASE_URL}/api/mercadopago/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          token: tokenResult.token,
          payment_method_id: paymentMethodId,
          cardholder_name: cardholderName,
          is_default: !!setAsDefault,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Erro ao salvar cartão no servidor.',
        };
      }

      await loadCards();
      return { success: true, card: data.card as SavedCard };
    } catch (err: any) {
      console.error('Erro ao adicionar cartão:', err);
      return { success: false, error: err?.message || 'Erro inesperado ao salvar o cartão.' };
    } finally {
      setSavingCard(false);
    }
  }, [loadCards]);

  const removeCard = useCallback(async (card: SavedCard) => {
    try {
      const session = await getEffectiveSession();
      if (!session?.access_token) {
        return { success: false, error: 'Usuário não autenticado.' };
      }

      const response = await fetch(`${API_BASE_URL}/api/mercadopago/cards?cardId=${encodeURIComponent(card.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Não foi possível remover o cartão.' };
      }

      await loadCards();
      return { success: true };
    } catch (err: any) {
      console.error('Erro ao remover cartão:', err);
      return { success: false, error: err?.message || 'Não foi possível remover o cartão.' };
    }
  }, [loadCards]);

  const setDefaultCard = useCallback(async (card: SavedCard) => {
    try {
      const session = await getEffectiveSession();
      if (!session?.access_token) {
        return { success: false };
      }

      const response = await fetch(`${API_BASE_URL}/api/mercadopago/cards`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ cardId: card.id }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return { success: false };
      }

      await loadCards();
      return { success: true };
    } catch (err: any) {
      console.error('Erro ao definir cartão padrão:', err);
      return { success: false };
    }
  }, [loadCards]);

  return {
    cards,
    loadingCards,
    savingCard,
    loadCards,
    addCard,
    removeCard,
    setDefaultCard,
  };
}

/**
 * Formata um cartão salvo para exibição segura, ex: "Visa •••• 1049"
 */
export function formatCardDisplay(card: SavedCard): string {
  const brandNames: Record<string, string> = {
    visa: 'Visa',
    master: 'Mastercard',
    amex: 'Amex',
    elo: 'Elo',
    hipercard: 'Hipercard',
  };
  const brand = brandNames[card.payment_method_id] || 'Cartão';
  return `${brand} •••• ${card.last_four}`;
}
