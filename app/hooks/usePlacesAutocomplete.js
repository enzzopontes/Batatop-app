/**
 * usePlacesAutocomplete.js
 *
 * Busca de endereço por texto (autocomplete) usando OpenStreetMap Nominatim
 * (gratuito, sem API key). Filtra resultados pra só mostrar endereços dentro
 * de Iacanga/SP — a mesma restrição que o BuscaLogradouroModal (ViaCEP) já
 * aplica no addresses.js.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

const CIDADE_PERMITIDA = 'Iacanga';
const UF_PERMITIDA = 'SP';
const SEARCH_DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

const NOMINATIM_CONTACT = 'contato@batatatop.com.br';
const NOMINATIM_HEADERS = {
  'Accept-Language': 'pt-BR',
  'User-Agent': `BatataTopApp/1.0 (${NOMINATIM_CONTACT})`,
};

export default function usePlacesAutocomplete() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const search = useCallback((text) => {
    setQuery(text);
    setSelectedPlace(null);
    setNotFound(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const q = encodeURIComponent(`${trimmed}, ${CIDADE_PERMITIDA}, ${UF_PERMITIDA}, Brasil`);
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${q}&addressdetails=1&limit=6&countrycodes=br&email=${encodeURIComponent(NOMINATIM_CONTACT)}`;
        const res = await fetch(url, {
          headers: NOMINATIM_HEADERS,
          signal: controller.signal,
        });
        const data = await res.json();

        // Filtro extra: garante que a cidade retornada é mesmo Iacanga/SP
        // (o Nominatim às vezes retorna resultados próximos de outras cidades).
        const filtered = (data || []).filter((item) => {
          const city = (
            item.address?.city || item.address?.town || item.address?.municipality || ''
          ).toLowerCase();
          return city === CIDADE_PERMITIDA.toLowerCase();
        });

        setSuggestions(filtered);
        setNotFound(filtered.length === 0);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setSuggestions([]);
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const selectPlace = useCallback((place) => {
    const addr = place.address || {};
    const parsed = {
      formatted: place.display_name,
      street: addr.road || addr.pedestrian || '',
      neighborhood: addr.suburb || addr.neighbourhood || '',
      city: addr.city || addr.town || addr.municipality || CIDADE_PERMITIDA,
      state: UF_PERMITIDA,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    };
    setSelectedPlace(parsed);
    return parsed;
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setSelectedPlace(null);
    setNotFound(false);
    setLoading(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Cleanup ao desmontar — evita setState em componente desmontado.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return {
    query,
    suggestions,
    loading,
    selectedPlace,
    notFound,
    search,
    selectPlace,
    clearSearch,
  };
}
