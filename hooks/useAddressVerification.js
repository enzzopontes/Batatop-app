/**
 * app/hooks/useAddressVerification.js
 *
 * Verifica, no momento do clique em "Adicionar", se o endereço selecionado
 * pela pessoa bate com a localização atual do GPS (raio de 30m — ver
 * utils/addressVerification.js). Não roda em background nem no mount da
 * tela — só quando `verifyAddress()` é chamado, pra pegar o GPS mais
 * recente possível.
 *
 * Resultado possível de `verifyAddress()`:
 *   { status: 'no_session' }               → sem login, deixa o gate de auth existente cuidar
 *   { status: 'no_address' }               → pessoa logada sem nenhum endereço salvo
 *   { status: 'needs_confirmation', address } → tem endereço, mas GPS diverge >30m
 *   { status: 'ok', address }              → tudo certo, pode adicionar direto
 *
 * Assunção (confirmar se mudar): "endereço selecionado" = o id salvo em
 * SELECTED_ADDRESS_ID_KEY (AsyncStorage). Se não existir ainda (primeira
 * vez), cai pro endereço `is_default` do Supabase e já grava essa escolha
 * como selecionada.
 */

import { useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession } from '../utils/authSession';
import {
  getSelectedAddressId,
  setSelectedAddressId,
  getLastVerifiedPoint,
  setLastVerifiedPoint,
  distanceInMeters,
  VERIFICATION_RADIUS_METERS,
} from '../utils/addressVerification';

// Cache curto do GPS — evita pedir localização de novo a cada clique em
// "Adicionar" quando a pessoa tá adicionando vários itens em sequência.
// 15s é suficiente pra cobrir uma sequência de cliques rápidos sem deixar
// o dado velho demais (a pessoa não anda 30m em 15s dentro do delivery).
const GPS_CACHE_MS = 15000;
let gpsCache = null; // { coords, timestamp } — módulo, sobrevive entre chamadas do hook

// Se o GPS não resolver em 5s (sinal ruim, indoors, emulador sem location
// mockada), desiste e libera a compra sem perguntar — nunca vale a pena
// travar a tela de "Adicionar" esperando um fix de GPS.
const GPS_TIMEOUT_MS = 5000;

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null); }
    }, ms);
    promise.then((value) => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(value); }
    }).catch(() => {
      if (!settled) { settled = true; clearTimeout(timer); resolve(null); }
    });
  });
}

export default function useAddressVerification() {
  // Guarda o GPS + endereço do último `verifyAddress()` pra `confirmContinue()`
  // não precisar pedir localização de novo.
  const lastCheckRef = useRef({ gpsCoords: null, addressId: null });

  // Dedupe: se já tem uma verificação em andamento (ex: pessoa clicou
  // "Adicionar" 3x rápido), as chamadas seguintes reaproveitam a mesma
  // promise em vez de disparar 3 pedidos de GPS concorrentes.
  const inFlightRef = useRef(null);

  const fetchAddressById = async (id) => {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return data;
  };

  const fetchDefaultAddress = async (userId) => {
    const { data, error } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  };

  const getCurrentGps = async () => {
    // Cache curto — se pediu GPS há menos de 15s, reaproveita em vez de
    // chamar o módulo nativo de novo (é isso que travava ao adicionar
    // vários produtos em sequência rápida).
    if (gpsCache && Date.now() - gpsCache.timestamp < GPS_CACHE_MS) {
      return gpsCache.coords;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;

      // Tenta a última posição já conhecida pelo SO primeiro — é
      // essencialmente instantânea (não espera um fix de GPS novo).
      // Cobre a grande maioria dos casos sem nenhuma demora perceptível.
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: GPS_CACHE_MS });
      if (lastKnown?.coords) {
        const coords = { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
        gpsCache = { coords, timestamp: Date.now() };
        return coords;
      }

      // Sem posição em cache no SO — pede um fix novo, mas com timeout: se
      // passar de GPS_TIMEOUT_MS (sinal ruim, indoors, emulador), desiste e
      // libera a compra em vez de travar a tela esperando o GPS resolver.
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        GPS_TIMEOUT_MS
      );
      if (!pos) return null;

      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      gpsCache = { coords, timestamp: Date.now() };
      return coords;
    } catch {
      return null;
    }
  };

  const runVerification = useCallback(async () => {
    const session = await getEffectiveSession();
    if (!session) return { status: 'no_session' };

    // 1. Resolve endereço selecionado (AsyncStorage → fallback is_default)
    let addressId = await getSelectedAddressId();
    let address = addressId ? await fetchAddressById(addressId) : null;

    if (!address) {
      const fallback = await fetchDefaultAddress(session.user.id);
      if (!fallback) return { status: 'no_address' };
      address = fallback;
      addressId = fallback.id;
      await setSelectedAddressId(addressId);
    }

    if (address.latitude == null || address.longitude == null) {
      // Endereço sem coordenadas salvas (ex: cadastro antigo/manual sem
      // pino) — não dá pra comparar com GPS, então libera direto.
      return { status: 'ok', address };
    }

    // 2. GPS atual — se não conseguir (permissão negada, sem sinal), não
    // bloqueia a compra: libera direto sem perguntar.
    const gpsCoords = await getCurrentGps();
    if (!gpsCoords) return { status: 'ok', address };

    lastCheckRef.current = { gpsCoords, addressId };

    // 3. Já foi verificado nesse raio, pro mesmo endereço? Não pergunta de novo.
    const lastPoint = await getLastVerifiedPoint();
    if (lastPoint && lastPoint.addressId === addressId) {
      const distFromLastPoint = distanceInMeters(
        gpsCoords.latitude,
        gpsCoords.longitude,
        lastPoint.latitude,
        lastPoint.longitude
      );
      if (distFromLastPoint <= VERIFICATION_RADIUS_METERS) {
        return { status: 'ok', address };
      }
    }

    // 4. Compara GPS com o endereço em si
    const distFromAddress = distanceInMeters(
      gpsCoords.latitude,
      gpsCoords.longitude,
      address.latitude,
      address.longitude
    );

    if (distFromAddress <= VERIFICATION_RADIUS_METERS) {
      await setLastVerifiedPoint({ ...gpsCoords, addressId });
      return { status: 'ok', address };
    }

    return { status: 'needs_confirmation', address };
  }, []);

  const verifyAddress = useCallback(async () => {
    // Se já tem uma verificação rodando (cliques em sequência), devolve a
    // mesma promise em vez de empilhar chamadas novas.
    if (inFlightRef.current) return inFlightRef.current;
    const promise = runVerification();
    inFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      inFlightRef.current = null;
    }
  }, [runVerification]);

  // Chamado quando a pessoa toca em "Continuar assim" no modal de
  // verificação — grava o ponto atual como verificado, pra não perguntar
  // de novo enquanto ela estiver dentro do raio de 30m.
  const confirmContinue = useCallback(async () => {
    const { gpsCoords, addressId } = lastCheckRef.current;
    if (!gpsCoords || !addressId) return;
    await setLastVerifiedPoint({ ...gpsCoords, addressId });
  }, []);

  return { verifyAddress, confirmContinue };
}
