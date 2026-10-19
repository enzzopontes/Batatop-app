/**
 * useGeolocationWithMaps.js
 *
 * Geolocalização (expo-location) + reverse geocoding (OpenStreetMap Nominatim,
 * gratuito, sem API key). Usado pelo MapSelector.tsx pra atualizar o endereço
 * em tempo real conforme o usuário arrasta o mapa, e pelo addresses.js pra
 * pegar a localização atual do GPS.
 *
 * IMPORTANTE — Nominatim tem rate limit de ~1 req/segundo por IP. O debounce
 * de REVERSE_GEO_DEBOUNCE_MS evita bater no limite enquanto o mapa é
 * arrastado continuamente.
 */

import { useState, useCallback, useRef } from 'react';
import * as Location from 'expo-location';

const CIDADE_PERMITIDA = 'Iacanga';
const UF_PERMITIDA = 'SP';
const REVERSE_GEO_DEBOUNCE_MS = 400;

// Nominatim exige um jeito de identificar a aplicação (política de uso:
// https://operations.osmfoundation.org/policies/nominatim/) — SEM isso o
// servidor rejeita a request com 403, sempre, não importa o lugar. Era
// exatamente esse o bug: o comentário avisava, mas o header de verdade
// nunca tinha sido adicionado — só tinha o Accept-Language.
// TROQUE o e-mail abaixo pelo seu (ou outro contato válido do app).
const NOMINATIM_CONTACT = 'contato@batatatop.com.br';
const NOMINATIM_HEADERS = {
  'Accept-Language': 'pt-BR',
  'User-Agent': `BatataTopApp/1.0 (${NOMINATIM_CONTACT})`,
};

async function fetchReverseGeocode(lat, lng) {
  // `email=` é o outro jeito (além do User-Agent) que a política do
  // Nominatim aceita pra identificar a aplicação — manda os dois por
  // garantia, já que User-Agent customizado às vezes não sobrevive em
  // todo ambiente/proxy do dispositivo.
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&email=${encodeURIComponent(NOMINATIM_CONTACT)}`;
  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) throw new Error(`Falha no reverse geocoding (HTTP ${res.status})`);
  const data = await res.json();
  const addr = data.address || {};

  const street = addr.road || addr.pedestrian || addr.residential || '';
  const neighborhood = addr.suburb || addr.neighbourhood || addr.village || '';
  const city = addr.city || addr.town || addr.municipality || '';
  const stateName = addr.state || '';
  // Fallback específico pro seu caso (só SP é válido mesmo): o slice(0,2)
  // antigo pegava os 2 primeiros caracteres de "São Paulo" → "SÃ", nunca
  // batia com UF_PERMITIDA. addr['ISO3166-2-lvl4'] (ex: "BR-SP") é o
  // caminho normal; isso aqui só cobre o caso raro de vir sem ele.
  const state = addr['ISO3166-2-lvl4']
    ? addr['ISO3166-2-lvl4'].split('-')[1]
    : (stateName.toLowerCase().includes('paulo') ? 'SP' : '');

  return {
    formatted: data.display_name || '',
    street,
    neighborhood,
    city,
    state,
    isValidCity:
      city.trim().toLowerCase() === CIDADE_PERMITIDA.toLowerCase() &&
      (state || '').toUpperCase() === UF_PERMITIDA,
    raw: data,
  };
}

export default function useGeolocationWithMaps() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [location, setLocation] = useState(null); // { latitude, longitude }
  const [address, setAddress] = useState(null); // resultado do reverse geocode
  const [loading, setLoading] = useState(false); // loading do GPS (getLocation)
  const [geoLoading, setGeoLoading] = useState(false); // loading do reverse geo
  const [error, setError] = useState(null);

  const debounceRef = useRef(null);

  // Checa a permissão sem disparar o dialog do SO.
  const checkPermission = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const granted = status === 'granted';
    setPermissionGranted(granted);
    return granted;
  }, []);

  // Dispara o dialog de permissão do SO (só deve rodar 1x por sessão idealmente).
  const requestPermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setPermissionGranted(granted);
      return granted;
    } catch {
      setPermissionGranted(false);
      return false;
    }
  }, []);

  // Reverse geo COM debounce — usar durante arraste contínuo do mapa
  // (não faz request a cada pixel, só depois de REVERSE_GEO_DEBOUNCE_MS parado).
  const reverseGeocodeDebounced = useCallback((lat, lng) => {
    return new Promise((resolve) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setGeoLoading(true);
        setError(null);
        try {
          const result = await fetchReverseGeocode(lat, lng);
          setAddress(result);
          resolve(result);
        } catch {
          setError('Não foi possível identificar o endereço nesse ponto.');
          resolve(null);
        } finally {
          setGeoLoading(false);
        }
      }, REVERSE_GEO_DEBOUNCE_MS);
    });
  }, []);

  // Pega a localização atual do GPS (sem debounce — é uma ação única, tipo
  // apertar "Atualizar" ou abrir a tela pela primeira vez).
  const getLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coords);

      // Devolve o address resolvido aqui mesmo pra quem chamou getLocation()
      // já receber o resultado pronto (sem closure velha em cima do state
      // `address`, que só atualiza no próximo render).
      let result = null;
      try {
        result = await fetchReverseGeocode(coords.latitude, coords.longitude);
        setAddress(result);
      } catch {
        setError('Localização obtida, mas não foi possível identificar o endereço.');
      }

      return { coords, address: result };
    } catch {
      setError('Não foi possível obter sua localização. Verifique se o GPS está ligado.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permissionGranted,
    location,
    address,
    loading,
    geoLoading,
    error,
    checkPermission,
    requestPermission,
    getLocation,
    reverseGeocodeDebounced,
  };
}
