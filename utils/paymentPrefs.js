import * as SecureStore from 'expo-secure-store';

const METHOD_KEY = 'preferred_payment_method';
const CARD_ID_KEY = 'preferred_payment_card_id';

/**
 * Lê a forma de pagamento preferida salva pelo usuário.
 * Retorna null se não houver nenhuma salva ainda.
 */
export async function getPreferredPaymentMethod() {
  try {
    const value = await SecureStore.getItemAsync(METHOD_KEY);
    return value || null;
  } catch (error) {
    console.error('Erro ao ler forma de pagamento preferida:', error);
    return null;
  }
}

/**
 * Salva a forma de pagamento preferida do usuário.
 * Usado na tela de perfil quando o usuário escolhe uma opção.
 */
export async function setPreferredPaymentMethod(method) {
  try {
    await SecureStore.setItemAsync(METHOD_KEY, method);
    return true;
  } catch (error) {
    console.error('Erro ao salvar forma de pagamento preferida:', error);
    return false;
  }
}

/**
 * Lê o ID do cartão salvo preferido (quando o método é cartão de
 * crédito/débito e o usuário tem mais de um cartão cadastrado).
 */
export async function getPreferredCardId() {
  try {
    const value = await SecureStore.getItemAsync(CARD_ID_KEY);
    return value || null;
  } catch (error) {
    console.error('Erro ao ler cartão preferido:', error);
    return null;
  }
}

/**
 * Salva o ID do cartão (linha da tabela payment_cards) preferido pelo usuário.
 */
export async function setPreferredCardId(cardId) {
  try {
    if (!cardId) {
      await SecureStore.deleteItemAsync(CARD_ID_KEY);
      return true;
    }
    await SecureStore.setItemAsync(CARD_ID_KEY, String(cardId));
    return true;
  } catch (error) {
    console.error('Erro ao salvar cartão preferido:', error);
    return false;
  }
}
