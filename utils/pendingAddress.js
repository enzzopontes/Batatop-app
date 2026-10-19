/**
 * pendingAddress.js
 *
 * Endereço calculado (mapa/GPS/busca) por quem ainda NÃO tem conta.
 * Fica guardado aqui até a pessoa entrar numa conta de verdade — nesse
 * momento é inserido no Supabase pra esse user e a chave é limpa
 * (ver `flushPendingAddress` em app/addresses.js).
 *
 * Por decisão de produto: enquanto deslogado, esse endereço NUNCA aparece
 * na lista visual de app/addresses.js (que só lista endereços de verdade,
 * vindos do Supabase) — ele só aparece no seletor de endereço do Header
 * global (`_layout.js`), no lugar de "Selecione seu endereço".
 *
 * Pub/sub (`subscribePendingAddressChange`/`emitPendingAddressChange`) é
 * necessário pelo mesmo motivo do soft-logout em `authSession.js`: salvar
 * ou limpar essa chave não passa por nenhum listener nativo (não é auth,
 * não é onAuthStateChange) — sem isso, o Header (montado uma vez só na
 * raiz, nunca desmonta) não saberia que precisa reconferir o texto exibido.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PENDING_ADDRESS_KEY = '@batatatop:pendingAddress';

let listeners = [];

export function subscribePendingAddressChange(callback) {
  listeners.push(callback);
  return () => { listeners = listeners.filter((cb) => cb !== callback); };
}

function emitPendingAddressChange() {
  listeners.forEach((cb) => cb());
}

export async function getPendingAddress() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ADDRESS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function setPendingAddress(data) {
  await AsyncStorage.setItem(PENDING_ADDRESS_KEY, JSON.stringify(data));
  emitPendingAddressChange();
}

export async function clearPendingAddress() {
  await AsyncStorage.removeItem(PENDING_ADDRESS_KEY);
  emitPendingAddressChange();
}

// Mesmo formato que o Header já usa pro endereço de conta real
// (`${street}, ${number}`) — mantém os dois visualmente consistentes.
export function formatPendingAddressLabel(pending) {
  if (!pending) return null;
  const { street, number } = pending;
  if (!street) return null;
  return number ? `${street}, ${number}` : street;
}
