/**
 * addresses.js
 * Tela de endereços — página inteira, sem Modal.
 */

import {
  View, Text, ScrollView, StyleSheet, Pressable,
  TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
  FlatList, TouchableOpacity, BackHandler, Modal,
  StatusBar, Image, AppState,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavContext } from './_layout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange } from '../utils/authSession';
import { getPendingAddress, setPendingAddress, clearPendingAddress } from '../utils/pendingAddress';
import { getPendingCartIntent, clearPendingCartIntent } from '../utils/pendingCartIntent';
import { setSelectedAddressId } from '../utils/addressVerification';
import { useCart } from '../utils/cartStore';
import MapView from 'react-native-maps';
import MapSelector from 'components/MapSelector';
import AuthBottomSheet from 'components/AuthBottomSheet';
import AddressCard from '../components/AddressCard';
import AddressModal from '../components/AddressModal';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import useGeolocationWithMaps from './hooks/useGeolocationWithMaps';
import usePlacesAutocomplete from './hooks/usePlacesAutocomplete';

// Amarelo do pin de confirmação no preview do mapa (Estado D). Ainda não
// existe token pra isso em constants/theme.js — se surgir mais um uso,
// vale mover pra lá (ex: COLORS.pinAccent).
const PIN_YELLOW = '#FFC107';

const CIDADE_PERMITIDA = 'Iacanga';
const UF_PERMITIDA     = 'SP';

// MapBackdrop — ilustração decorativa atrás do pino central (Estado A).
// Imagem estática em assets/macdrop.png.
function MapBackdrop() {
  return (
    <View style={mb.wrap} pointerEvents="none">
      <Image source={require('../assets/macdrop.png')} style={mb.image} resizeMode="contain" />
    </View>
  );
}

// Modal busca logradouro
function BuscaLogradouroModal({ visible, onClose, onSelect }) {
  const [rua, setRua]         = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const buscar = async () => {
    const ruaClean = rua.trim();
    if (ruaClean.length < 3) { setError('Digite pelo menos 3 letras.'); return; }
    setLoading(true); setError(''); setResults([]);
    try {
      const url = `https://viacep.com.br/ws/${UF_PERMITIDA}/${encodeURIComponent(CIDADE_PERMITIDA)}/${encodeURIComponent(ruaClean)}/json/`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        setError(`Nenhuma rua encontrada em ${CIDADE_PERMITIDA}/${UF_PERMITIDA}.`); return;
      }
      setResults(data);
    } catch { setError('Erro ao buscar. Verifique sua conexão.'); }
    finally  { setLoading(false); }
  };

  const handleSelect = (item) => {
    onSelect({ cep: item.cep.replace('-', ''), street: item.logradouro, neighborhood: item.bairro, city: item.localidade, state: item.uf });
    onClose(); setRua(''); setResults([]); setError('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.headerTitle}>Buscar pelo nome da rua</Text>
            <Pressable onPress={onClose} style={m.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <Text style={m.hint}>Buscamos apenas endereços em {CIDADE_PERMITIDA}/{UF_PERMITIDA}.</Text>
          <View style={m.searchRow}>
            <TextInput style={m.searchInput} value={rua} onChangeText={setRua}
              placeholder="Ex: Rua das Flores" placeholderTextColor={COLORS.textMuted}
              autoFocus onSubmitEditing={buscar} returnKeyType="search" />
            <Pressable style={m.searchBtn} onPress={buscar}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            </Pressable>
          </View>
          {!!error && <View style={m.errorRow}><Ionicons name="alert-circle-outline" size={14} color="#EF4444" /><Text style={m.errorText}>{error}</Text></View>}
          <FlatList data={results} keyExtractor={(i) => i.cep} style={m.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={m.resultItem} onPress={() => handleSelect(item)}>
                <Ionicons name="location-outline" size={16} color={COLORS.primary} />
                <View style={m.resultText}>
                  <Text style={m.resultRua}>{item.logradouro}</Text>
                  <Text style={m.resultSub}>{item.bairro} · CEP {item.cep}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={m.separator} />}
          />
        </View>
      </View>
    </Modal>
  );
}

// SearchAddressScreen — Estado B: busca por texto (Nominatim/OpenStreetMap).
// Selecionar uma sugestão OU clicar "Buscar pelo mapa" abre o MapSelector
// (Estado C) já centrado no ponto escolhido, pra o usuário confirmar/ajustar
// o pino antes de cair no AddressForm.
function SearchAddressScreen({ onBack, onPickOnMap, onSuggestionSelected }) {
  const insets = useSafeAreaInsets();
  const { query, suggestions, loading, notFound, search, selectPlace, clearSearch } =
    usePlacesAutocomplete();

  const handleSelect = (item) => {
    const parsed = selectPlace(item);
    onSuggestionSelected(parsed);
  };

  return (
    <View style={sr.wrap}>
      {/* Sem header separado — a própria barra fica fixa no topo, e o botão
          de voltar substitui o ícone de busca (igual referência visual). */}
      <View style={[sr.searchRow, { marginTop: insets.top + SPACING[3] }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={COLORS.primary} />
        </Pressable>
        <TextInput
          style={sr.searchInput}
          value={query}
          onChangeText={search}
          placeholder="Buscar endereço e número"
          placeholderTextColor={COLORS.textMuted}
          autoFocus
          returnKeyType="search"
        />
        {!!query && (
          <Pressable onPress={clearSearch} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
          </Pressable>
        )}
      </View>
      <Text style={sr.poweredBy}>powered by OpenStreetMap</Text>

      {loading && (
        <View style={sr.loaderRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}

      {!loading && suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => String(item.place_id)}
          style={sr.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={sr.resultItem} onPress={() => handleSelect(item)}>
              <Ionicons name="location-outline" size={16} color={COLORS.primary} />
              <View style={sr.resultText}>
                <Text style={sr.resultTitle} numberOfLines={1}>
                  {item.address?.road || item.display_name.split(',')[0]}
                </Text>
                <Text style={sr.resultSub} numberOfLines={1}>{item.display_name}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={sr.separator} />}
        />
      )}

      {!loading && notFound && (
        <View style={sr.notFoundWrap}>
          <Text style={sr.notFoundTitle}>Não encontramos esse endereço</Text>
          <Text style={sr.notFoundSub}>Verifique o que você digitou e tente de novo. Ou busque pelo mapa.</Text>
          <Pressable onPress={onPickOnMap}>
            <Text style={sr.mapLink}>Buscar pelo mapa</Text>
          </Pressable>
        </View>
      )}

      {!loading && !notFound && suggestions.length === 0 && (
        <View style={sr.notFoundWrap}>
          <Pressable onPress={onPickOnMap}>
            <Text style={sr.mapLink}>Buscar pelo mapa</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// FavPill — botão "Casa"/"Trabalho" com ripple: uma onda da cor primária
// nasce exatamente no ponto tocado e se espalha, sumindo enquanto o fundo
// assume o tint claro de selecionado (favPillOn/favPillTextOn do StyleSheet
// recebido em `styles`, que já são o tint claro + texto na cor primária).
function FavPill({ icon, text, active, onPress, styles }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const progress = useSharedValue(0);

  const handlePressIn = (e) => {
    originX.value = e.nativeEvent.locationX;
    originY.value = e.nativeEvent.locationY;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 450 });
  };

  const rippleStyle = useAnimatedStyle(() => {
    const d = Math.max(size.w, size.h) * 2.4;
    return {
      width: d,
      height: d,
      borderRadius: d / 2,
      left: originX.value - d / 2,
      top: originY.value - d / 2,
      opacity: 1 - progress.value,
      transform: [{ scale: progress.value }],
    };
  });

  return (
    <Pressable
      style={[styles.favPill, active && styles.favPillOn]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Animated.View style={[rp.ripple, rippleStyle]} pointerEvents="none" />
      <Ionicons name={icon} size={15} color={active ? COLORS.primary : COLORS.text} />
      <Text style={[styles.favPillText, active && styles.favPillTextOn]}>{text}</Text>
    </Pressable>
  );
}

const rp = StyleSheet.create({
  ripple: { position: 'absolute', backgroundColor: COLORS.primary },
});

// Field — componente estável (fora do AddressForm para não perder foco do TextInput a cada tecla)
function Field({ label, field, value, onChangeText, placeholder, keyboardType, half, editable = true }) {
  return (
    <View style={[ff.fieldWrap, half && ff.fieldHalf]}>
      <Text style={ff.label}>{label}</Text>
      <TextInput
        style={[ff.input, !editable && ff.inputRO]}
        value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={COLORS.textMuted}
        keyboardType={keyboardType || 'default'} editable={editable} autoCapitalize="words"
      />
    </View>
  );
}

// AddressForm
// `initialValues` (opcional) vem do MapSelector (Estado C) — quando presente,
// o formulário já abre com rua/bairro preenchidos e o toggle "Não sei meu
// CEP" ligado automaticamente, já que o reverse geocoding não retorna CEP.
// O usuário ainda revisa/edita os campos e a validação de cidade (ViaCEP)
// roda igual ao fluxo manual, como uma segunda checagem.
function AddressForm({ onSave, onCancel, saving, initialValues }) {
  const [form, setForm] = useState(() => ({
    cep: initialValues?.cep || '',
    street: initialValues?.street || '',
    number: initialValues?.number || '',
    complement: initialValues?.complement || '',
    neighborhood: initialValues?.neighborhood || '',
    reference_point: initialValues?.reference_point || '',
  }));
  // 'casa' | 'trabalho' | null — mesma convenção do AddressDetailsForm (Estado D)
  const [label, setLabel]                   = useState(initialValues?.label ?? null);
  const [cepLoading, setCepLoading]         = useState(false);
  const [cepError, setCepError]             = useState('');
  const [cityError, setCityError]           = useState('');
  // Sem CEP por padrão só quando vem do mapa (Estado C) sem CEP algum;
  // editando um endereço que já tem CEP, mantém o campo normal preenchido.
  const [semCep, setSemCep]                 = useState(() => !!initialValues && !initialValues?.cep);
  const [verifying, setVerifying]           = useState(false);

  const toggleLabel = (val) => setLabel((prev) => (prev === val ? null : val));

  const set = (field) => (val) => setForm((p) => ({ ...p, [field]: val }));

  const handleToggleSemCep = () => {
    setSemCep((prev) => {
      if (!prev) { setForm((p) => ({ ...p, cep: '' })); setCepError(''); }
      setCityError('');
      return !prev;
    });
  };

  const validarCidade = (city, state) => {
    const ok = city.trim().toLowerCase() === CIDADE_PERMITIDA.toLowerCase() && state.trim().toUpperCase() === UF_PERMITIDA;
    if (!ok) { setCityError(`Só aceitamos endereços em ${CIDADE_PERMITIDA}/${UF_PERMITIDA}. 🚫`); return false; }
    setCityError(''); return true;
  };

  const buscarCep = async (cepRaw) => {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true); setCepError(''); setCityError('');
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError('CEP não encontrado.'); return; }
      if (!validarCidade(data.localidade, data.uf)) return;
      setForm((p) => ({ ...p, street: data.logradouro || p.street, neighborhood: data.bairro || p.neighborhood }));
    } catch { setCepError('Erro ao buscar CEP.'); }
    finally  { setCepLoading(false); }
  };

  const handleCepChange = (val) => {
    const nums = val.replace(/\D/g, '').slice(0, 8);
    const fmt  = nums.length > 5 ? `${nums.slice(0, 5)}-${nums.slice(5)}` : nums;
    set('cep')(fmt);
    if (nums.length === 8) buscarCep(nums);
  };

  const handleSave = async () => {
    const required = semCep ? ['street', 'number', 'neighborhood'] : ['cep', 'street', 'number', 'neighborhood'];
    for (const f of required) { if (!form[f].trim()) { showThemedAlert('Campo obrigatório', `Preencha: ${f}`); return; } }

    setVerifying(true);
    setCityError('');
    try {
      if (semCep) {
        // Sem CEP: confirma que a rua digitada existe em Iacanga/SP via ViaCEP
        const url = `https://viacep.com.br/ws/${UF_PERMITIDA}/${encodeURIComponent(CIDADE_PERMITIDA)}/${encodeURIComponent(form.street.trim())}/json/`;
        const res  = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          setCityError(`Não encontramos essa rua em ${CIDADE_PERMITIDA}/${UF_PERMITIDA}. Verifique o nome digitado. 🚫`);
          return;
        }
      } else {
        // Com CEP: revalida o CEP final pra garantir que ainda corresponde a Iacanga/SP
        const cepDigits = form.cep.replace(/\D/g, '');
        const res  = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
        const data = await res.json();
        if (data.erro) { setCepError('CEP não encontrado.'); return; }
        if (!validarCidade(data.localidade, data.uf)) return;
      }
    } catch {
      setCityError('Não foi possível verificar o endereço. Verifique sua conexão e tente novamente.');
      return;
    } finally {
      setVerifying(false);
    }

    onSave({ ...form, cep: form.cep.replace(/\D/g, ''), label, reference_point: form.reference_point.trim() });
  };

  return (
    <View style={ff.container}>
      {/* Aviso cidade */}
      <View style={ff.cityBanner}>
        <Ionicons name="location" size={14} color={COLORS.primary} />
        <Text style={ff.cityBannerText}>
          Entregamos apenas em <Text style={{ fontWeight: '800' }}>{CIDADE_PERMITIDA}/{UF_PERMITIDA}</Text>
        </Text>
      </View>

      {/* CEP — toggle só desabilita o campo, sem nada extra */}
      <View style={ff.fieldWrap}>
        <Text style={ff.label}>CEP{semCep ? ' (opcional)' : ''}</Text>
        <View style={ff.cepRow}>
          <TextInput
            style={[ff.input, { flex: 1 }, semCep && ff.inputRO]}
            value={semCep ? '' : form.cep}
            onChangeText={semCep ? undefined : handleCepChange}
            placeholder="00000-000" placeholderTextColor={COLORS.textMuted}
            keyboardType="numeric" maxLength={9} editable={!semCep}
          />
          {cepLoading && !semCep && <ActivityIndicator size="small" color={COLORS.primary} style={ff.cepLoader} />}
        </View>
        {!!cepError && !semCep && <Text style={ff.fieldError}>{cepError}</Text>}

        {/* Toggle "Não sei meu CEP" — apenas desabilita o campo, nenhum elemento novo aparece */}
        <Pressable style={ff.toggleRow} onPress={handleToggleSemCep}>
          <View style={[ff.toggleBox, semCep && ff.toggleBoxOn]}>
            {semCep && <Ionicons name="checkmark" size={11} color="#fff" />}
          </View>
          <Text style={[ff.toggleText, semCep && ff.toggleTextOn]}>Não sei meu CEP</Text>
        </Pressable>
      </View>

      {/* Rua + Número */}
      <View style={ff.row}>
        <Field label="Rua / Avenida" field="street" value={form.street} onChangeText={set('street')} placeholder="Ex: Rua das Flores" />
        <Field label="Nº" field="number" value={form.number} onChangeText={set('number')} placeholder="123" half keyboardType="numeric" />
      </View>

      <Field label="Complemento" field="complement" value={form.complement} onChangeText={set('complement')} placeholder="Apto, Casa... (opcional)" />
      <Field label="Bairro" field="neighborhood" value={form.neighborhood} onChangeText={set('neighborhood')} placeholder="Ex: Centro" />
      <Field label="Ponto de referência" field="reference_point" value={form.reference_point} onChangeText={set('reference_point')} placeholder="Ex: Portão de madeira (opcional)" />

      <View style={ff.favRow}>
        <FavPill icon="home" text="Casa" active={label === 'casa'} onPress={() => toggleLabel('casa')} styles={ff} />
        <FavPill icon="briefcase" text="Trabalho" active={label === 'trabalho'} onPress={() => toggleLabel('trabalho')} styles={ff} />
      </View>

      {!!cityError && (
        <View style={ff.cityError}>
          <Ionicons name="alert-circle" size={14} color="#EF4444" />
          <Text style={ff.cityErrorText}>{cityError}</Text>
        </View>
      )}

      <View style={ff.actions}>
        <Pressable style={[ff.cancelBtn, (saving || verifying) && { opacity: 0.5 }]} onPress={onCancel} disabled={saving || verifying}>
          <Text style={ff.cancelText}>Cancelar</Text>
        </Pressable>
        <Pressable style={[ff.saveBtn, (saving || verifying) && { opacity: 0.7 }]} onPress={handleSave} disabled={saving || verifying}>
          {(saving || verifying)
            ? <ActivityIndicator size="small" color="#fff" />
            : <View style={ff.saveBtnInner}><Ionicons name="checkmark" size={15} color="#fff" /><Text style={ff.saveText}>Salvar</Text></View>
          }
        </Pressable>
      </View>
    </View>
  );
}

// AddressDetailsForm — Estado D: tela cheia exibida depois de "Confirmar
// endereço de entrega" no mapa (Estado C). Layout espelha a referência
// visual do usuário: preview do mapa + "Ajustar marcador" no topo, dado da
// rua só-leitura (o reverse geocoding já trouxe), e os campos que faltam
// (bairro/número/complemento/referência) + favoritar Casa/Trabalho.
// Ao salvar, chama onSave com os mesmos campos que handleSave já espera
// (mais `label` e `reference_point`) — reaproveita o fluxo de
// AsyncStorage-pendente-até-logar que já existia pro form manual.
function AddressDetailsForm({ initialValues, onAdjustMarker, onSave, onBack, saving, simplified = false }) {
  const insets = useSafeAreaInsets();
  // Botão "Ver batatas" acompanha o teclado sem travar/piscar — mesmo
  // padrão do CLAUDE.md (seção 10): hook nativo em vez de
  // KeyboardAvoidingView/Keyboard.addListener, que aqui nem existia (o
  // botão ficava parado no lugar e o teclado cobria ele).
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }], // negativo quando o teclado abre
  }));
  const [bairro, setBairro]             = useState(initialValues?.neighborhood || '');
  const [bairroError, setBairroError]   = useState('');
  const [numero, setNumero]             = useState(initialValues?.number || '');
  const [semNumero, setSemNumero]       = useState(false);
  const [complemento, setComplemento]   = useState(initialValues?.complement || '');
  const [semComplemento, setSemComplemento] = useState(false);
  const [referencia, setReferencia]     = useState(initialValues?.reference_point || '');
  const [label, setLabel]               = useState(initialValues?.label ?? null); // 'casa' | 'trabalho' | null

  const previewRegion = {
    latitude: initialValues.latitude,
    longitude: initialValues.longitude,
    latitudeDelta: 0.003,
    longitudeDelta: 0.003,
  };

  // Quando o reverse geocoding do mapa já trouxe o bairro, não faz sentido
  // pedir de novo — o campo só aparece se vier vazio de lá.
  const bairroKnown = !!initialValues?.neighborhood;
  const showBairroField = !simplified && !bairroKnown;
  const showNumeroField = !simplified;
  const showFavoritar = !simplified;

  const toggleLabel = (val) => setLabel((prev) => (prev === val ? null : val));

  // Mesmas regras do handleSubmit — botão só fica amarelo quando os
  // obrigatórios estão preenchidos. No modo simplified (edição sem mexer
  // no pino), bairro/número já são os que já estavam salvos — só complemento
  // entra na validação.
  const isFormValid = simplified
    ? (semComplemento || !!complemento.trim())
    : (showBairroField ? bairro.trim().length >= 2 : true) &&
      (semNumero || !!numero.trim()) &&
      (semComplemento || !!complemento.trim());

  const handleSubmit = () => {
    if (!simplified) {
      if (showBairroField && bairro.trim().length < 2) {
        setBairroError('O bairro precisa ter mais de dois caracteres');
        return;
      }
      if (!semNumero && !numero.trim()) {
        showThemedAlert('Campo obrigatório', 'Preencha o número ou marque "Endereço sem número".');
        return;
      }
    }
    if (!semComplemento && !complemento.trim()) {
      showThemedAlert('Campo obrigatório', 'Preencha o complemento ou marque "Endereço sem complemento".');
      return;
    }

    onSave({
      street: initialValues.street || initialValues.formatted || '',
      neighborhood: simplified ? (initialValues.neighborhood || '') : (showBairroField ? bairro.trim() : (initialValues.neighborhood || '')),
      number: simplified ? (initialValues.number || '') : (semNumero ? 'S/N' : numero.trim()),
      complement: semComplemento ? '' : complemento.trim(),
      cep: '',
      reference_point: referencia.trim(),
      label,
      latitude: initialValues.latitude,
      longitude: initialValues.longitude,
    });
  };

  return (
    <View style={df.wrap}>
      <View style={[df.header, { paddingTop: insets.top + SPACING[2] }]}>
        <Pressable style={df.backBtn} onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={df.headerTitle}>ENDEREÇO DE ENTREGA</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={df.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={df.mapPreviewWrap}>
          <MapView
            style={StyleSheet.absoluteFillObject}
            region={previewRegion}
            scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false}
            pointerEvents="none"
          />
          <View style={df.pinPreview} pointerEvents="none">
            <Ionicons name="location" size={34} color={PIN_YELLOW} />
          </View>
          <Pressable style={df.adjustPill} onPress={onAdjustMarker}>
            <Text style={df.adjustPillText}>Ajustar marcador</Text>
          </Pressable>
        </View>

        <View style={df.addressRow}>
          <View style={{ flex: 1 }}>
            <Text style={df.addressStreet} numberOfLines={1}>{initialValues.street || initialValues.formatted}</Text>
            <Text style={df.addressSub} numberOfLines={1}>
              {initialValues.neighborhood ? `${initialValues.neighborhood} - ` : ''}{initialValues.city}/{initialValues.state}
            </Text>
          </View>
          <Pressable onPress={onAdjustMarker} hitSlop={8}>
            <Ionicons name="pencil-outline" size={17} color={COLORS.textMuted} />
          </Pressable>
        </View>

        {showBairroField && (
          <View style={df.fieldWrap}>
            <TextInput
              style={[df.input, !!bairroError && df.inputError]}
              value={bairro}
              onChangeText={(v) => { setBairro(v); setBairroError(''); }}
              placeholder="Bairro *" placeholderTextColor={COLORS.textMuted}
              maxLength={60}
            />
            <View style={df.fieldFooter}>
              <Text style={df.fieldErrorText}>{bairroError}</Text>
              <Text style={df.counter}>{bairro.length}/60</Text>
            </View>
          </View>
        )}

        {showNumeroField && (
          <>
            <View style={df.fieldWrap}>
              <TextInput
                style={[df.input, semNumero && df.inputRO]}
                value={numero} onChangeText={setNumero}
                placeholder="Número *" placeholderTextColor={COLORS.textMuted}
                keyboardType="numeric" editable={!semNumero} maxLength={60}
              />
              <View style={df.fieldFooter}><Text style={df.fieldErrorText} /><Text style={df.counter}>{numero.length}/60</Text></View>
            </View>
            <Pressable style={df.checkRow} onPress={() => setSemNumero((p) => !p)}>
              <View style={[df.checkbox, semNumero && df.checkboxOn]}>
                {semNumero && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={df.checkLabel}>Endereço sem número</Text>
            </Pressable>
          </>
        )}

        <View style={df.fieldWrap}>
          <TextInput
            style={[df.input, semComplemento && df.inputRO]}
            value={complemento} onChangeText={setComplemento}
            placeholder="Complemento *" placeholderTextColor={COLORS.textMuted}
            editable={!semComplemento} maxLength={60}
          />
          <View style={df.fieldFooter}><Text style={df.fieldErrorText} /><Text style={df.counter}>{complemento.length}/60</Text></View>
        </View>
        <Pressable style={df.checkRow} onPress={() => setSemComplemento((p) => !p)}>
          <View style={[df.checkbox, semComplemento && df.checkboxOn]}>
            {semComplemento && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <Text style={df.checkLabel}>Endereço sem complemento</Text>
        </Pressable>

        <View style={df.fieldWrap}>
          <TextInput
            style={df.input}
            value={referencia} onChangeText={setReferencia}
            placeholder="Ponto de referência (opcional)" placeholderTextColor={COLORS.textMuted}
            maxLength={280}
          />
          <View style={df.fieldFooter}><Text style={df.fieldErrorText} /><Text style={df.counter}>{referencia.length}/280</Text></View>
        </View>

        {showFavoritar && (
          <>
            <View style={df.divider} />

            <Text style={df.favTitle}>Favoritar endereço</Text>
            <View style={df.favRow}>
              <FavPill icon="home" text="Casa" active={label === 'casa'} onPress={() => toggleLabel('casa')} styles={df} />
              <FavPill icon="briefcase" text="Trabalho" active={label === 'trabalho'} onPress={() => toggleLabel('trabalho')} styles={df} />
            </View>
          </>
        )}
      </ScrollView>

      <Animated.View style={[df.footerAvoider, footerAnimatedStyle]}>
        <Pressable
          style={({ pressed }) => [
            df.submitBtn,
            !isFormValid && df.submitBtnDisabled,
            { marginBottom: insets.bottom || SPACING[3] },
            saving && { opacity: 0.7 },
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={isFormValid ? '#fff' : COLORS.textMuted} />
            : <Text style={[df.submitText, !isFormValid && df.submitTextDisabled]}>{simplified ? 'Salvar endereço' : 'Ver batatas'}</Text>
          }
        </Pressable>
      </Animated.View>
    </View>
  );
}

// LoggedInAddressesList — layout exclusivo do usuário logado: header fixo
// ("ENDEREÇO DE ENTREGA" + seta voltar), barra de busca de verdade (abre
// SearchAddressScreen) e "Usar localização atual" na seção branca, e a
// lista de endereços na seção cinza (#F8F8F8). Sem MapBackdrop nem o título
// "Onde você quer receber seu pedido?" — isso continua só no fluxo
// deslogado (ver ramo `else` mais abaixo, intocado).
function LoggedInAddressesList({
  insets, onBack, onOpenSearch, requestingGeo, onUseCurrentLocation,
  locationPreview, hasPermission, loading, addresses, onCardPress, onMenuPress,
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[la.header, { paddingTop: insets.top + SPACING[2] }]}>
        <Pressable style={la.backBtn} onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={la.headerTitle}>ENDEREÇO DE ENTREGA</Text>
        <View style={{ width: 40 }} />
      </View>

      <Pressable style={la.searchBar} onPress={onOpenSearch}>
        <Ionicons name="search" size={20} color={COLORS.primary} />
        <Text style={la.searchBarText}>Buscar endereço e número</Text>
      </Pressable>

      <Pressable
        style={[la.locationRow, requestingGeo && { opacity: 0.6 }]}
        onPress={onUseCurrentLocation}
        disabled={requestingGeo}
      >
        <Ionicons name="locate-outline" size={28} color={COLORS.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={la.locationRowTitle}>Usar localização atual</Text>
          {requestingGeo ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
          ) : locationPreview ? (
            <Text style={la.locationRowSub} numberOfLines={1}>{locationPreview}</Text>
          ) : hasPermission === false ? (
            <Text style={la.locationRowActivate}>Ativar permissão</Text>
          ) : null}
        </View>
      </Pressable>

      <ScrollView
        style={la.grayArea}
        contentContainerStyle={la.grayAreaContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.loader}><ActivityIndicator color={COLORS.primary} size="large" /></View>
        ) : addresses.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="location-outline" size={40} color={COLORS.border} />
            <Text style={s.emptyText}>Nenhum endereço ainda</Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <AddressCard
              key={addr.id}
              address={addr}
              onPress={() => onCardPress(addr.id)}
              onMenuPress={() => onMenuPress(addr)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

// Tela Principal
export default function Addresses() {
  const [user, setUser]         = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);

  // Máquina de estados da tela: 'list' (padrão) | 'search' (Estado B) |
  // 'pick' (Estado C - MapSelector) | 'form' (AddressForm manual) |
  // 'details' (AddressDetailsForm, Estado D - pós-mapa).
  const [screen, setScreen]                 = useState('list');
  const [pickOrigin, setPickOrigin]         = useState('list');
  const [pickInitialCoords, setPickInitialCoords] = useState(null);
  const [formInitialValues, setFormInitialValues] = useState(null);
  const [requestingGeo, setRequestingGeo]   = useState(false);
  const [locationPreview, setLocationPreview] = useState('');
  const [hasPermission, setHasPermission]   = useState(null);
  const [showEnterSheet, setShowEnterSheet] = useState(false);
  // Endereço existente sendo editado (AddressForm/AddressDetailsForm em
  // modo edição) — null = criando novo.
  const [editingAddress, setEditingAddress] = useState(null);
  // true quando a edição veio do mapa sem o usuário mover o pino — nesse
  // caso a AddressDetailsForm mostra só Complemento + Referência.
  const [quickEditMode, setQuickEditMode]   = useState(false);
  // Endereço com o menu de 3 pontos (AddressModal) aberto.
  const [menuAddress, setMenuAddress]       = useState(null);

  const router = useRouter();
  const { add: addToCart } = useCart();
  const { autoMap } = useLocalSearchParams();
  // Garante que o auto-disparo do mapa (ver useEffect abaixo, perto de
  // handleUseCurrentLocation) só roda uma vez por montagem da tela, mesmo
  // que o componente re-renderize várias vezes com o mesmo param na URL.
  const autoMapTriggered = useRef(false);
  const insets = useSafeAreaInsets();
  const { lastRoute, setAnimation } = useNavContext();
  const { permissionGranted, checkPermission, requestPermission, getLocation, error: geoError } =
    useGeolocationWithMaps();

  const handleBack = () => {
    if (screen === 'details') {
      setScreen('list'); setFormInitialValues(null); setEditingAddress(null); setQuickEditMode(false);
      return true;
    }
    if (screen === 'form') { setScreen('list'); setFormInitialValues(null); setEditingAddress(null); return true; }
    if (screen === 'pick') {
      // Cancelou a edição direto do mapa (sem passar pela tela de detalhes) — desfaz.
      if (editingAddress && pickOrigin === 'list') setEditingAddress(null);
      setScreen(pickOrigin);
      return true;
    }
    if (screen === 'search') { setScreen('list'); return true; }
    setAnimation('slide_from_left');
    router.replace(lastRoute || '/');
    return true;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [lastRoute, screen, pickOrigin, editingAddress]);

  // "Rod. Dep. Leônidas Pachêco Ferreira - Iacanga - SP"
  // Usa o shape que vem do hook (Nominatim), não mais o do
  // Location.reverseGeocodeAsync nativo.
  const formatPreviewAddress = (addr) => {
    if (!addr) return '';
    const parts = [addr.street, addr.city, addr.state].filter(Boolean);
    return parts.join(' - ');
  };

  // Checa a permissão (sem disparar dialog) e, se já concedida, busca a
  // localização + endereço sozinho — sem precisar de nenhum toque.
  const fetchLocationPreview = useCallback(async () => {
    try {
      const granted = await checkPermission();
      setHasPermission(granted);
      if (!granted) return;
      const result = await getLocation();
      if (result?.address) setLocationPreview(formatPreviewAddress(result.address));
    } catch { /* preview é só cosmético, falha aqui não afeta o fluxo real */ }
  }, [checkPermission, getLocation]);

  // Roda assim que a página monta. Também roda de novo quando o app volta
  // pro foreground — cobre o caso de a pessoa ter ativado a permissão nas
  // configurações do celular e voltado pro app em seguida.
  useEffect(() => {
    fetchLocationPreview();
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') fetchLocationPreview();
    });
    return () => sub.remove();
  }, [fetchLocationPreview]);

  // Estado A: em vez de duplicar uma tela de mapa fixo, pegamos a coordenada
  // do GPS e ja abrimos direto o MapSelector (Estado C) centrado nela - o
  // usuario ainda pode ajustar o pino antes de confirmar.
  const handleUseCurrentLocation = async () => {
    setRequestingGeo(true);
    try {
      let granted = permissionGranted;
      if (!granted) granted = await checkPermission();
      if (!granted) granted = await requestPermission();

      setHasPermission(granted);

      if (!granted) {
        showThemedAlert(
          'Permissao necessaria',
          'Pra usar sua localizacao atual, ative a permissao de localizacao nas configuracoes do app.'
        );
        return;
      }

      const result = await getLocation();
      if (!result?.coords) {
        showThemedAlert('Erro', geoError || 'Nao foi possivel obter sua localizacao.');
        return;
      }
      if (result.address) setLocationPreview(formatPreviewAddress(result.address));

      setPickInitialCoords(result.coords);
      setPickOrigin('list');
      setScreen('pick');
    } finally {
      setRequestingGeo(false);
    }
  };

  // Veio do produto/[id].js sem ter nenhum endereço salvo (NoAddressModal
  // → "Cadastrar endereço") — pula a tela de lista/busca e já abre o
  // MapSelector centrado no GPS, igual o botão "usar localização atual"
  // faria manualmente. Se a permissão for negada, handleUseCurrentLocation
  // já mostra o alerta e fica na lista normalmente — não quebra nada.
  useEffect(() => {
    if (autoMap && !autoMapTriggered.current) {
      autoMapTriggered.current = true;
      handleUseCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMap]);

  const handleOpenSearch = () => setScreen('search');

  const handlePickOnMapFromSearch = () => {
    setPickInitialCoords(null);
    setPickOrigin('search');
    setScreen('pick');
  };

  const handleSuggestionSelected = (parsed) => {
    setPickInitialCoords({ latitude: parsed.latitude, longitude: parsed.longitude });
    setPickOrigin('search');
    setScreen('pick');
  };

  // ~40m de tolerância — GPS/reverse geocode nunca cravam o mesmo ponto
  // duas vezes exatamente igual, então um raio pequeno é o que conta como
  // "não mexeu no pino".
  const LOCATION_TOLERANCE = 0.0004;
  const locationChanged = (from, to) => {
    if (!from || from.latitude == null || from.longitude == null) return true;
    return Math.abs(from.latitude - to.latitude) > LOCATION_TOLERANCE
      || Math.abs(from.longitude - to.longitude) > LOCATION_TOLERANCE;
  };

  const handleMapConfirm = (result) => {
    if (editingAddress) {
      const moved = locationChanged(
        { latitude: editingAddress.latitude, longitude: editingAddress.longitude },
        result
      );
      setQuickEditMode(!moved);
      // Não mexeu no pino: mantém bairro/número/complemento/referência/label
      // que já estavam salvos (só complemento e referência ficam editáveis).
      // Mexeu: tela idêntica à de endereço novo, do zero.
      setFormInitialValues(moved ? result : {
        ...result,
        neighborhood: editingAddress.neighborhood,
        number: editingAddress.number,
        complement: editingAddress.complement,
        reference_point: editingAddress.reference_point,
        label: editingAddress.label,
      });
      setScreen('details');
      return;
    }
    setQuickEditMode(false);
    setFormInitialValues(result);
    setScreen('details');
  };

  // "Ajustar marcador" na tela de detalhes — reabre o mapa já centrado no
  // pino atual; ao confirmar de novo, volta pra 'details' (handleMapConfirm).
  const handleAdjustMarker = () => {
    if (formInitialValues) {
      setPickInitialCoords({ latitude: formInitialValues.latitude, longitude: formInitialValues.longitude });
    }
    setPickOrigin('details');
    setScreen('pick');
  };

  useEffect(() => {
    // Respeita o soft-logout (ver utils/authSession.js) — sessão real do
    // Supabase pode continuar ativa mesmo com "Sim, lembrar" acionado.
    async function refreshEffectiveUser() {
      const session = await getEffectiveSession();
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      // Endereço calculado sem login (ver handleSave) — assim que aparece
      // um user de verdade, joga pra conta e limpa o pendente.
      if (nextUser) await flushPendingAddress(nextUser);
    }
    refreshEffectiveUser();
    const unsubscribeUi = subscribeAuthUiChange(refreshEffectiveUser);
    // NÃO setar user direto de `session` aqui — a sessão real do Supabase
    // se renova sozinha em background (autoRefreshToken: true) e dispara
    // esse evento (ex: TOKEN_REFRESHED) mesmo com o soft-logout ligado.
    // Setar direto pisaria no soft-logout. Reconfere via getEffectiveSession.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshEffectiveUser();
    });
    return () => {
      subscription.unsubscribe();
      unsubscribeUi();
    };
  }, []);

  const fetchAddresses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('addresses').select('*').eq('user_id', user.id)
        .order('is_default', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;
      setAddresses(data || []);
    } catch { showThemedAlert('Erro', 'Não foi possível carregar seus endereços.'); }
    finally  { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchAddresses(); }, [fetchAddresses]);

  // Roda quando um user real aparece (login de verdade, não soft-logout
  // desligando). Se tinha endereço calculado sem login (ver handleSave),
  // insere no Supabase pra essa conta e limpa a chave.
  const flushPendingAddress = async (currentUser) => {
    try {
      const pending = await getPendingAddress();
      if (!pending) return;
      const { count } = await supabase.from('addresses')
        .select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id);
      const { error } = await supabase.from('addresses').insert({
        ...pending, user_id: currentUser.id, is_default: !count,
      });
      if (error) return; // deixa o pendente salvo, tenta de novo no próximo login
      await clearPendingAddress();
      await fetchAddresses();
    } catch { /* deixa o pendente salvo, tenta de novo no próximo login */ }
  };

  const handleSave = async (form) => {
    setSaving(true);
    // Tela de detalhes (Estado D, pós-mapa) navega pra home ao salvar
    // ("Ver Batatas"); o formulário manual (+ Adicionar manualmente)
    // continua voltando pra lista, como sempre.
    const cameFromDetails = screen === 'details';
    try {
      const addressData = {
        street: form.street.trim(), number: form.number.trim(),
        complement: form.complement.trim(), neighborhood: form.neighborhood.trim(),
        city: CIDADE_PERMITIDA, state: UF_PERMITIDA,
        cep: (form.cep || '').replace(/\D/g, ''),
        // Campos novos (tela de detalhes) — só entram no objeto quando vêm
        // preenchidos, pra não quebrar o fluxo antigo do form manual.
        ...(form.label !== undefined ? { label: form.label } : {}),
        ...(form.reference_point ? { reference_point: form.reference_point.trim() } : {}),
        // lat/lng só vêm da AddressDetailsForm (pós-mapa) — form manual não tem.
        ...(form.latitude != null ? { latitude: form.latitude, longitude: form.longitude } : {}),
      };

      // Editando um endereço existente (veio do menu de 3 pontos) — UPDATE
      // direto, sem mexer em is_default nem nos outros fluxos (insert/pendente).
      if (editingAddress) {
        addressData.label = form.label ?? null;
        addressData.reference_point = form.reference_point.trim();
        let query = supabase.from('addresses').update(addressData).eq('id', editingAddress.id);
        if (user?.id) query = query.eq('user_id', user.id);
        const { error } = await query;
        if (error) throw error;
        setEditingAddress(null);
        setFormInitialValues(null);
        setQuickEditMode(false);
        await fetchAddresses();
        setScreen('list');
        return;
      }

      // Sem login: não dá pra gravar user_id nenhum — guarda local e sai.
      // Vira endereço de verdade assim que a pessoa logar (flushPendingAddress).
      if (!user) {
        await setPendingAddress(addressData);
        setFormInitialValues(null);
        if (cameFromDetails) {
          router.push('/');
        } else {
          setScreen('list');
          showThemedAlert(
            'Endereço calculado',
            'Assim que você entrar na sua conta, esse endereço é salvo automaticamente.'
          );
        }
        return;
      }

      const { data: inserted, error } = await supabase.from('addresses').insert({
        ...addressData, user_id: user.id, is_default: addresses.length === 0,
      }).select().single();
      if (error) throw error;
      setFormInitialValues(null);
      await fetchAddresses();

      // Endereço recém-criado vira o selecionado — próxima verificação de
      // GPS já usa ele (ver utils/addressVerification.js).
      if (inserted?.id) await setSelectedAddressId(inserted.id);

      // Se a pessoa veio parar aqui via NoAddressModal (tentou adicionar
      // um produto sem ter endereço), o carrinho tava esperando salvo —
      // consome agora e já leva o item junto pra home.
      const pendingCart = await getPendingCartIntent();
      if (pendingCart?.length) {
        pendingCart.forEach(addToCart);
        await clearPendingCartIntent();
      }

      if (cameFromDetails) { router.push('/'); } else { setScreen('list'); }
    } catch { showThemedAlert('Erro', 'Não foi possível salvar o endereço.'); }
    finally  { setSaving(false); }
  };

  const handleSetDefault = async (id) => {
    if (!user) return;
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('addresses').update({ is_default: true  }).eq('id', id).eq('user_id', user.id);
    await fetchAddresses();
  };

  const handleDelete = (id) => {
    if (!user) return;
    showThemedAlert('Remover endereço', 'Tem certeza?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        await supabase.from('addresses').delete().eq('id', id).eq('user_id', user.id);
        await fetchAddresses();
      }},
    ]);
  };

  // Editar (menu de 3 pontos) agora passa pelo mapa primeiro (Estado C) —
  // igual ao fluxo de endereço novo. handleMapConfirm decide, comparando
  // com a coordenada salva, se abre a tela de detalhes completa (mexeu no
  // pino) ou simplificada (só complemento/referência).
  const handleEditPress = (address) => {
    setMenuAddress(null);
    setEditingAddress(address);
    setFormInitialValues(null);
    setPickInitialCoords(
      address.latitude != null && address.longitude != null
        ? { latitude: address.latitude, longitude: address.longitude }
        : null
    );
    setPickOrigin('list');
    setScreen('pick');
  };

  const handleMenuDelete = () => {
    const id = menuAddress.id;
    setMenuAddress(null);
    handleDelete(id);
  };

  // Sem login: mesma tela de sempre (localização, busca, adicionar
  // manualmente), só que `addresses` nunca é preenchido (fetchAddresses
  // já retorna cedo sem user) — então a lista fica sempre vazia. Endereço
  // salvo aqui vira pendente (ver handleSave) até logar de verdade.

  // Estado C (mapa) e Estado B (busca) ocupam a tela inteira, fora do
  // ScrollView/Header padrão — ambos tem seu próprio header com botão voltar.
  if (screen === 'pick') {
    return (
      <MapSelector
        initialCoords={pickInitialCoords}
        onBack={() => setScreen(pickOrigin)}
        onConfirm={handleMapConfirm}
      />
    );
  }

  if (screen === 'search') {
    return (
      <SearchAddressScreen
        onBack={() => setScreen('list')}
        onPickOnMap={handlePickOnMapFromSearch}
        onSuggestionSelected={handleSuggestionSelected}
      />
    );
  }

  if (screen === 'details' && formInitialValues) {
    return (
      <>
        <AddressDetailsForm
          initialValues={formInitialValues}
          simplified={quickEditMode}
          onAdjustMarker={handleAdjustMarker}
          onSave={handleSave}
          onBack={handleBack}
          saving={saving}
        />
        <ThemedAlertHost />
      </>
    );
  }

  return (
    <View style={s.page}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <ThemedAlertHost />

      {screen === 'form' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + SPACING[2] }]} keyboardShouldPersistTaps="handled">

            {/* Cabeçalho da tela (não fixo, dentro do scroll) */}
            <View style={s.inlineHeader}>
              <Pressable style={s.backBtn} onPress={handleBack}>
                <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
              </Pressable>
              <Text style={s.headerTitle}>{editingAddress ? 'Editar endereço' : 'Novo endereço'}</Text>
              <View style={{ width: 40 }} />
            </View>

            {loading ? (
              <View style={s.loader}><ActivityIndicator color={COLORS.primary} size="large" /></View>
            ) : (
              <AddressForm
                onSave={handleSave}
                onCancel={() => { setScreen('list'); setFormInitialValues(null); setEditingAddress(null); }}
                saving={saving}
                initialValues={editingAddress || formInitialValues}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      ) : user ? (
        <LoggedInAddressesList
          insets={insets}
          onBack={handleBack}
          onOpenSearch={handleOpenSearch}
          requestingGeo={requestingGeo}
          onUseCurrentLocation={handleUseCurrentLocation}
          locationPreview={locationPreview}
          hasPermission={hasPermission}
          loading={loading}
          addresses={addresses}
          onCardPress={handleSetDefault}
          onMenuPress={setMenuAddress}
        />
      ) : (
        // Estado A deslogado — MapBackdrop + título + fake search + link
        // "Entrar". Nada aqui muda quando a versão logada é redesenhada.
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.entryScrollContent, { paddingTop: insets.top + SPACING[2] }]}>

          <Pressable style={s.floatingBack} onPress={handleBack} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={COLORS.primary} />
          </Pressable>

          <MapBackdrop />

          <Text style={s.entryTitle}>Onde você quer{'\n'}receber seu pedido?</Text>

          <Pressable style={s.searchFakeInput} onPress={handleOpenSearch}>
            <Ionicons name="search" size={18} color={COLORS.primary} />
            <Text style={s.searchFakeInputText}>Buscar endereço e número</Text>
          </Pressable>

          <Pressable
            style={[s.locationRow, requestingGeo && { opacity: 0.6 }]}
            onPress={handleUseCurrentLocation}
            disabled={requestingGeo}
          >
            <Ionicons name="locate-outline" size={24} color={COLORS.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={s.locationRowTitle}>Usar localização atual</Text>
              {requestingGeo ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
              ) : locationPreview ? (
                <Text style={s.locationRowSub} numberOfLines={1}>{locationPreview}</Text>
              ) : hasPermission === false ? (
                <Text style={s.locationRowActivate}>Ativar permissão</Text>
              ) : null}
            </View>
          </Pressable>
          <View style={s.locationDivider} />

          <View style={{ flex: 1 }} />
          <Pressable style={s.loginFooter} onPress={() => setShowEnterSheet(true)}>
            <Text style={s.loginFooterText}>Já tem um endereço salvo?</Text>
            <Text style={s.loginFooterLink}>Entrar</Text>
          </Pressable>
        </ScrollView>
      )}

      <AuthBottomSheet
        visible={showEnterSheet}
        onClose={() => setShowEnterSheet(false)}
      />

      <AddressModal
        visible={!!menuAddress}
        address={menuAddress}
        onClose={() => setMenuAddress(null)}
        onEdit={() => handleEditPress(menuAddress)}
        onDelete={handleMenuDelete}
      />
    </View>
  );
}


// Estilos Modal busca
const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING[5], maxHeight: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING[2] },
  headerTitle: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  hint: { color: COLORS.textMuted, fontSize: 12, marginBottom: SPACING[4], lineHeight: 16 },
  searchRow: { flexDirection: 'row', gap: SPACING[2], marginBottom: SPACING[3] },
  searchInput: { flex: 1, backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING[4], paddingVertical: SPACING[3], color: COLORS.text, fontSize: TYPOGRAPHY.sizes.sm },
  searchBtn: { backgroundColor: COLORS.primary, borderRadius: RADIUS.md, width: 46, alignItems: 'center', justifyContent: 'center' },
  errorRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: SPACING[2] },
  errorText: { color: '#EF4444', fontSize: 12 },
  list: { marginTop: SPACING[2] },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], paddingVertical: SPACING[4] },
  resultText: { flex: 1 },
  resultRua: { color: COLORS.text, fontWeight: '600', fontSize: TYPOGRAPHY.sizes.sm },
  resultSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  separator: { height: 1, backgroundColor: COLORS.border },
});

// Estilos AddressForm
const ff = StyleSheet.create({
  container: { backgroundColor: COLORS.backgroundCard, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, padding: SPACING[5], gap: SPACING[4], marginBottom: SPACING[4] },
  cityBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primary + '12', borderRadius: RADIUS.md, padding: SPACING[3], borderWidth: 1, borderColor: COLORS.primary + '30' },
  cityBannerText: { color: COLORS.primary, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', gap: SPACING[3] },
  fieldWrap: { flex: 1, gap: SPACING[1] },
  fieldHalf: { flex: 0, width: 72 },
  label: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  input: { backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING[4], paddingVertical: SPACING[3], color: COLORS.text, fontSize: TYPOGRAPHY.sizes.sm },
  inputRO: { opacity: 0.4 },
  cepRow: { flexDirection: 'row', alignItems: 'center' },
  cepLoader: { position: 'absolute', right: SPACING[3] },
  fieldError: { color: '#EF4444', fontSize: 11, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACING[2] },
  toggleBox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.backgroundElevated, alignItems: 'center', justifyContent: 'center' },
  toggleBoxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  toggleText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600' },
  toggleTextOn: { color: COLORS.primary },
  cityError: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#EF444412', borderRadius: RADIUS.md, padding: SPACING[3], borderWidth: 1, borderColor: '#EF444430' },
  cityErrorText: { flex: 1, color: '#EF4444', fontSize: 12, lineHeight: 17 },
  favRow: { flexDirection: 'row', gap: SPACING[3] },
  favPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, overflow: 'hidden',
  },
  favPillOn: { backgroundColor: `${COLORS.primary}22` },
  favPillText: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.sm },
  favPillTextOn: { color: COLORS.primary },
  actions: { flexDirection: 'row', gap: SPACING[3] },
  cancelBtn: { flex: 1, height: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.backgroundElevated },
  cancelText: { color: COLORS.textSecondary, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.sm },
  saveBtn: { flex: 2, height: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  saveBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING[2] },
  saveText: { color: '#fff', fontWeight: '800', fontSize: TYPOGRAPHY.sizes.sm },
});

// Estilos AddressDetailsForm (Estado D — pós-mapa)
const df = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING[5], paddingBottom: SPACING[3],
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.text, fontWeight: '800', fontSize: 13, letterSpacing: 0.6 },
  // +72 pra não esconder o último campo atrás do footerAvoider (absolute).
  scrollContent: { paddingBottom: SPACING[8] + 72 },

  mapPreviewWrap: { height: 200, overflow: 'hidden', backgroundColor: COLORS.backgroundElevated },
  pinPreview: { position: 'absolute', top: '50%', left: '50%', marginLeft: -17, marginTop: -34, alignItems: 'center' },
  adjustPill: {
    position: 'absolute', bottom: SPACING[3], alignSelf: 'center',
    backgroundColor: '#fff', borderRadius: RADIUS.full, paddingHorizontal: SPACING[4], paddingVertical: SPACING[2],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  adjustPillText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },

  addressRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[3],
    paddingHorizontal: SPACING[5], paddingVertical: SPACING[4],
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  addressStreet: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base },
  addressSub: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.sizes.sm, marginTop: 2 },

  fieldWrap: { paddingHorizontal: SPACING[5], marginTop: SPACING[4] },
  input: {
    backgroundColor: COLORS.background, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING[4], paddingVertical: SPACING[3], color: COLORS.text, fontSize: TYPOGRAPHY.sizes.sm,
  },
  inputRO: { opacity: 0.4 },
  inputError: { borderColor: '#EF4444' },
  fieldFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  fieldErrorText: { color: '#EF4444', fontSize: 11, fontWeight: '600' },
  counter: { color: COLORS.textMuted, fontSize: 11 },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2], paddingHorizontal: SPACING[5], marginTop: -SPACING[1] },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkLabel: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.sizes.sm },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginTop: SPACING[5], marginHorizontal: SPACING[5] },
  favTitle: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base, marginTop: SPACING[4], marginHorizontal: SPACING[5] },
  favRow: { flexDirection: 'row', gap: SPACING[3], marginTop: SPACING[3], marginHorizontal: SPACING[5] },
  favPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    borderRadius: RADIUS.full, backgroundColor: COLORS.backgroundElevated, overflow: 'hidden',
  },
  favPillOn: { backgroundColor: `${COLORS.primary}22` },
  favPillText: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.sm },
  favPillTextOn: { color: COLORS.primary },

  // footerAvoider mantém bottom: 0 fixo — o translateY do Animated.View
  // que empurra pra cima quando o teclado abre (ver CLAUDE.md, seção 10).
  footerAvoider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  submitBtn: {
    height: 56,
    marginHorizontal: SPACING[5],
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
  submitBtnDisabled: {
    backgroundColor: COLORS.backgroundElevated,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitText: { color: '#fff', fontWeight: '800', fontSize: TYPOGRAPHY.sizes.base, letterSpacing: 0.3 },
  submitTextDisabled: { color: COLORS.textMuted },
});

// Estilos tela principal
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  inlineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING[4] },
  headerTitle: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.lg, letterSpacing: -0.3 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // Sem Header/TabBar globais nessa rota (ver _layout.js) — padding fixo
  // pra respeitar a status bar/notch, igual o SearchAddressScreen já fazia.
  scrollContent: { paddingHorizontal: SPACING[5], paddingBottom: SPACING[8] },
  loader: { paddingVertical: SPACING[10], alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: SPACING[6], gap: SPACING[3] },
  emptyText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm, fontWeight: '600' },

  // Estado A — tela "Onde você quer receber seu pedido?"
  entryScrollContent: { flexGrow: 1, paddingHorizontal: SPACING[5], paddingBottom: SPACING[6] },
  floatingBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING[3] },
  entryTitle: { color: COLORS.text, fontWeight: '800', fontSize: 22, lineHeight: 28, textAlign: 'center', letterSpacing: -0.3, marginBottom: SPACING[5] },
  searchFakeInput: { flexDirection: 'row', alignItems: 'center', gap: SPACING[2], backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md, paddingHorizontal: SPACING[4], paddingVertical: SPACING[4], marginBottom: SPACING[4] },
  searchFakeInputText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], paddingHorizontal: SPACING[4], paddingVertical: SPACING[3] },
  locationRowTitle: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base },
  locationRowSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  locationRowActivate: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 12, marginTop: 2 },
  locationDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginHorizontal: SPACING[4], marginTop: SPACING[2] },
  loginFooter: { alignItems: 'center', gap: 2, paddingBottom: SPACING[4], marginBottom: SPACING[8] },
  loginFooterText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
  loginFooterLink: { color: COLORS.primary, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.sm },
});

// Estilos LoggedInAddressesList
const la = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING[5], paddingBottom: SPACING[3],
    backgroundColor: COLORS.background,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base, letterSpacing: 0.3 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[2],
    backgroundColor: '#F0F0F0', borderRadius: RADIUS.md,
    marginHorizontal: SPACING[5], paddingHorizontal: SPACING[4], paddingVertical: SPACING[3],
    marginBottom: SPACING[4],
  },
  searchBarText: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm },
  grayArea: { flex: 1, backgroundColor: COLORS.backgroundElevated },
  grayAreaContent: { paddingHorizontal: SPACING[5], paddingTop: SPACING[4], paddingBottom: SPACING[8] },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], paddingHorizontal: SPACING[5], paddingTop: SPACING[2], paddingBottom: SPACING[5] },
  locationRowTitle: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base },
  locationRowSub: { color: COLORS.textMuted, fontSize: 13, marginTop: 3 },
  locationRowActivate: { color: COLORS.textSecondary, fontWeight: '700', fontSize: 13 },
});

// Estilos MapBackdrop (ilustração decorativa do Estado A)
const mb = StyleSheet.create({
  wrap: { height: 260, marginTop: -SPACING[4], marginBottom: SPACING[4], alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
});

// Estilos SearchAddressScreen (Estado B)
const sr = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  // Sem header separado — a barra de busca em si fica fixa no topo,
  // com o padding de status bar/notch direto nela.
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING[3],
    marginHorizontal: SPACING[5],
    backgroundColor: COLORS.backgroundElevated, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING[4],
  },
  searchInput: { flex: 1, paddingVertical: SPACING[3], color: COLORS.text, fontSize: TYPOGRAPHY.sizes.sm },
  poweredBy: { color: COLORS.textMuted, fontSize: 10, textAlign: 'right', marginHorizontal: SPACING[5], marginTop: SPACING[1] },
  loaderRow: { alignItems: 'center', paddingVertical: SPACING[6] },
  list: { marginTop: SPACING[3], paddingHorizontal: SPACING[5] },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING[3], paddingVertical: SPACING[4] },
  resultText: { flex: 1 },
  resultTitle: { color: COLORS.text, fontWeight: '600', fontSize: TYPOGRAPHY.sizes.sm },
  resultSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  separator: { height: 1, backgroundColor: COLORS.border },
  notFoundWrap: { alignItems: 'center', paddingTop: SPACING[10], paddingHorizontal: SPACING[8], gap: SPACING[2] },
  notFoundTitle: { color: COLORS.text, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.base, textAlign: 'center' },
  notFoundSub: { color: COLORS.textMuted, fontSize: TYPOGRAPHY.sizes.sm, textAlign: 'center', lineHeight: 19 },
  mapLink: { color: COLORS.secondary, fontWeight: '700', fontSize: TYPOGRAPHY.sizes.sm, marginTop: SPACING[2] },
});
