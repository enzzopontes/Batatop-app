/**
 * utils/addressVerification.js
 *
 * Helpers puros pra verificação de endereço (GPS vs endereço selecionado).
 * Nada de lógica de UI aqui — só distância + chaves de AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Endereço que a pessoa deixou selecionado pra receber pedidos (persiste
// entre sessões — enquanto não existir um seletor de endereço na tela de
// checkout, essa é a fonte da verdade). Fallback: `is_default` no Supabase
// (ver `useAddressVerification.js`).
export const SELECTED_ADDRESS_ID_KEY = '@batatatop:selectedAddressId';

// Último ponto GPS + endereço que já passou pela verificação — evita
// perguntar de novo toda vez que a pessoa adiciona um produto estando
// parada no mesmo lugar.
const LAST_VERIFIED_POINT_KEY = '@batatatop:lastVerifiedPoint';

// Raio de tolerância — dentro disso, não pergunta de novo.
export const VERIFICATION_RADIUS_METERS = 30;

export async function getSelectedAddressId() {
  try {
    return await AsyncStorage.getItem(SELECTED_ADDRESS_ID_KEY);
  } catch {
    return null;
  }
}

export async function setSelectedAddressId(id) {
  try {
    await AsyncStorage.setItem(SELECTED_ADDRESS_ID_KEY, String(id));
  } catch {
    // silencioso — pior caso, próxima verificação cai no fallback is_default
  }
}

export async function getLastVerifiedPoint() {
  try {
    const raw = await AsyncStorage.getItem(LAST_VERIFIED_POINT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// point: { latitude, longitude, addressId }
export async function setLastVerifiedPoint(point) {
  try {
    await AsyncStorage.setItem(LAST_VERIFIED_POINT_KEY, JSON.stringify(point));
  } catch {
    // silencioso
  }
}

export async function clearLastVerifiedPoint() {
  try {
    await AsyncStorage.removeItem(LAST_VERIFIED_POINT_KEY);
  } catch {
    // silencioso
  }
}

// Distância em metros entre duas coordenadas (fórmula de Haversine).
export function distanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // raio da Terra em metros
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
