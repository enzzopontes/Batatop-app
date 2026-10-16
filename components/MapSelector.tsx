/**
 * MapSelector.tsx
 *
 * Modal/tela de mapa interativo (Estado C). O PIN fica fixo no centro da
 * tela — quem se move é o mapa por baixo (mesmo comportamento do Uber/iFood).
 * Reverse geocoding acontece em tempo real (com debounce) via
 * useGeolocationWithMaps a cada vez que o usuário solta o dedo do mapa.
 *
 * Usa react-native-maps (MapView nativo — Apple Maps no iOS, Google Maps no
 * Android). Não precisa de API key pro uso básico em Expo Go / dev build,
 * mas builds standalone Android em produção normalmente precisam de uma
 * Google Maps API key configurada no app.json (ver nota no final do arquivo).
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, Modal, Animated } from 'react-native';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import MapView, { Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../constants/theme';
import useGeolocationWithMaps from 'app/hooks/useGeolocationWithMaps';
import { useModalFade } from '../hooks/useModalFade';

const CIDADE_PERMITIDA = 'Iacanga';
const UF_PERMITIDA = 'SP';

// Cor do pino "parado" (endereço reconhecido). Amarela, explícita — não usa
// COLORS.secondary porque essa cor não corresponde ao amarelo da marca.
const PIN_COLOR_SETTLED = '#FFB800';
const PIN_COLOR_MOVING = '#9CA3AF';

// Centro aproximado de Iacanga/SP — usado quando não há coords iniciais
// (ex: usuário clicou direto em "Buscar pelo mapa" sem selecionar nada antes).
const DEFAULT_REGION: Region = {
  latitude: -21.8402,
  longitude: -49.0058,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export type MapSelectorResult = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  formatted: string;
};

type MapSelectorProps = {
  /** Coordenadas iniciais (vindas do GPS ou de uma sugestão de busca). Se omitido, centra em Iacanga/SP. */
  initialCoords?: { latitude: number; longitude: number } | null;
  onConfirm: (result: MapSelectorResult) => void;
  onBack: () => void;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback: (error: Error, reset: () => void) => React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

class MapErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('[MapSelector] Native MapView failed to initialize:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback(this.state.error || new Error('Map failed to render'), this.reset);
    }
    return this.props.children;
  }
}

// Alerta temático — substitui o Alert.alert nativo (feio, fora do design
// system) quando o pino fica fora de Iacanga/SP.
function OutOfAreaModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { mounted, fadeAnim } = useModalFade(visible);
  if (!mounted && !visible) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={oa.overlay}>
          <Animated.View style={[oa.backdrop, { opacity: fadeAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>
          <Animated.View style={[oa.card, { opacity: fadeAnim }]}>
            <View style={oa.iconWrap}>
              <Ionicons name="location-outline" size={28} color={COLORS.secondary} />
            </View>
            <Text style={oa.title}>Fora da área de entrega</Text>
            <Text style={oa.subtitle}>
              Só entregamos em <Text style={{ fontWeight: '800', color: COLORS.text }}>{CIDADE_PERMITIDA}/{UF_PERMITIDA}</Text>.
              Mova o mapa até essa região pra continuar.
            </Text>
            <Pressable style={oa.button} onPress={onClose}>
              <Text style={oa.buttonText}>Entendi</Text>
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

export default function MapSelector({ initialCoords, onBack, onConfirm }: MapSelectorProps) {
  const { geoLoading, error, reverseGeocodeDebounced, checkPermission } = useGeolocationWithMaps();
  const insets = useSafeAreaInsets();
  const [canShowLocation, setCanShowLocation] = useState(false);

  const initialRegion: Region = {
    ...DEFAULT_REGION,
    latitude:
      initialCoords?.latitude != null && !isNaN(initialCoords.latitude)
        ? initialCoords.latitude
        : DEFAULT_REGION.latitude,
    longitude:
      initialCoords?.longitude != null && !isNaN(initialCoords.longitude)
        ? initialCoords.longitude
        : DEFAULT_REGION.longitude,
  };

  const [region, setRegion] = useState<Region>(initialRegion);
  const [centerAddress, setCenterAddress] = useState<any>(null);
  const [showOutOfArea, setShowOutOfArea] = useState(false);
  const [isMoving, setIsMoving] = useState(true); // true = pino levantado/cinza (ainda resolvendo)
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    let isMounted = true;
    checkPermission().then((granted) => {
      if (isMounted) setCanShowLocation(!!granted);
    }).catch(() => {
      if (isMounted) setCanShowLocation(false);
    });
    return () => {
      isMounted = false;
    };
  }, [checkPermission]);

  // moveAnim: 0 = parado (desceu, amarelo) · 1 = movendo (levantado, cinza)
  const moveAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(moveAnim, {
      toValue: isMoving ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isMoving, moveAnim]);

  const pinTranslateY = moveAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const settledOpacity = moveAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  // Reverse geo assim que a tela abre, pro endereço já aparecer sem precisar mexer no mapa.
  useEffect(() => {
    reverseGeocodeDebounced(initialRegion.latitude, initialRegion.longitude).then((r) => {
      if (r) { setCenterAddress(r); setIsMoving(false); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dispara só quando o usuário PARA de arrastar (não a cada frame) — o
  // debounce interno do hook já protege contra excesso de requests também.
  const handleRegionChangeComplete = useCallback(
    (r: Region) => {
      setRegion(r);
      reverseGeocodeDebounced(r.latitude, r.longitude).then((res) => {
        if (res) { setCenterAddress(res); setIsMoving(false); }
      });
    },
    [reverseGeocodeDebounced]
  );

  // Assim que o dedo começa a arrastar o mapa, o pino já levanta e fica
  // cinza — só volta a descer/amarelo quando o endereço for reconhecido
  // (ver setIsMoving(false) acima, disparado pelo reverse geocode).
  const handleRegionChange = useCallback(() => {
    setIsMoving(true);
  }, []);

  const handleConfirm = () => {
    if (geoLoading) return;
    if (!centerAddress || !centerAddress.isValidCity) {
      setShowOutOfArea(true);
      return;
    }
    onConfirm({
      street: centerAddress.street,
      neighborhood: centerAddress.neighborhood,
      city: centerAddress.city || CIDADE_PERMITIDA,
      state: centerAddress.state || UF_PERMITIDA,
      latitude: region.latitude,
      longitude: region.longitude,
      formatted: centerAddress.formatted,
    });
  };

  return (
    <View style={st.wrap}>
      <View style={[st.header, { paddingTop: insets.top + SPACING[3] }]} collapsable={false}>
        <Pressable style={st.backBtn} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
        </Pressable>
        <Text style={st.headerTitle}>ENDEREÇO DE ENTREGA</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={st.mapWrap}>
        <MapErrorBoundary
          fallback={(_, reset) => (
            <View style={st.mapFallback}>
              <Ionicons name="map-outline" size={54} color={COLORS.textMuted} />
              <Text style={st.mapFallbackTitle}>Não foi possível carregar o mapa</Text>
              <Text style={st.mapFallbackSub}>
                O serviço de mapas nativo não pôde ser iniciado. Você pode buscar seu endereço digitando a rua ou CEP.
              </Text>
              <View style={st.mapFallbackActions}>
                <Pressable style={st.mapFallbackBtn} onPress={onBack}>
                  <Text style={st.mapFallbackBtnText}>Buscar por nome da rua</Text>
                </Pressable>
                <Pressable style={st.mapFallbackRetry} onPress={reset}>
                  <Text style={st.mapFallbackRetryText}>Tentar novamente</Text>
                </Pressable>
              </View>
            </View>
          )}
        >
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={initialRegion}
            onRegionChange={handleRegionChange}
            onRegionChangeComplete={handleRegionChangeComplete}
            showsUserLocation={Platform.OS === 'android' ? false : canShowLocation}
            showsMyLocationButton={false}
            showsCompass={false}
          />
        </MapErrorBoundary>

        {/* Sombra do pino — bolinha fixa no "chão", parada (não acompanha o
            translateY do pino nem anima). */}
        <View style={st.pinShadowWrap} pointerEvents="none">
          <View style={st.pinShadow} />
        </View>

        {/* Pin fixo no centro da tela — o mapa que se move por baixo dele.
            Levanta e fica cinza enquanto o endereço ainda não foi
            reconhecido; desce e fica amarelo assim que o reverse geocode
            resolve (cross-fade entre os dois ícones, sem depender de
            Animated tentar interpolar a prop `color` do ícone). */}
        <Animated.View
          style={[st.pinWrap, { transform: [{ translateY: pinTranslateY }] }]}
          pointerEvents="none"
        >
          <Animated.View style={{ opacity: settledOpacity }}>
            <Ionicons name="location" size={44} color={PIN_COLOR_SETTLED} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', opacity: moveAnim }]}>
            <Ionicons name="location" size={44} color={PIN_COLOR_MOVING} />
          </Animated.View>
        </Animated.View>

        {geoLoading && (
          <View style={st.loadingPill}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        )}

        {!!error && (
          <View style={st.errorPill}>
            <Text style={st.errorPillText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Botão único, flutuante — sem cartão/rodapé embaixo dele. */}
      <Pressable
        style={[
          st.confirmFloating,
          { bottom: Math.max(insets.bottom, 16) + 12 },
          geoLoading && st.confirmFloatingDisabled,
        ]}
        onPress={handleConfirm}
        disabled={geoLoading}
      >
        {geoLoading
          ? <ActivityIndicator color="#fff" />
          : <Text style={st.confirmFloatingText}>Confirmar endereço de entrega</Text>
        }
      </Pressable>

      <OutOfAreaModal visible={showOutOfArea} onClose={() => setShowOutOfArea(false)} />
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[4],
    backgroundColor: COLORS.background,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: COLORS.text, fontWeight: '800', fontSize: 13, letterSpacing: 0.6 },
  mapWrap: { flex: 1, position: 'relative' },

  // Pino fixo no centro + anel de precisão (bolha azul embaixo da ponta,
  // estilo Uber/iFood) — puramente decorativo, o ponto real é o centro do mapa.
  pinWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -44,
    alignItems: 'center',
  },
  pinShadowWrap: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinShadow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    opacity: 0.3,
    transform: [{ scaleY: 0.35 }],
  },

  loadingPill: {
    position: 'absolute', top: SPACING[4], alignSelf: 'center',
    backgroundColor: '#fff', borderRadius: 20, padding: SPACING[3],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  errorPill: {
    position: 'absolute', top: SPACING[4], left: SPACING[5], right: SPACING[5],
    backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: SPACING[3],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  errorPillText: { color: '#EF4444', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  mapFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
  },
  mapFallbackTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING[3],
    marginBottom: SPACING[2],
    textAlign: 'center',
  },
  mapFallbackSub: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING[6],
  },
  mapFallbackActions: {
    width: '100%',
    gap: SPACING[3],
  },
  mapFallbackBtn: {
    height: 48,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  mapFallbackBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.sm,
  },
  mapFallbackRetry: {
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  mapFallbackRetryText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
  },

  // Botão flutuante — sem cartão/footer atrás dele, só ele mesmo sobre o mapa.
  confirmFloating: {
    position: 'absolute',
    left: SPACING[5],
    right: SPACING[5],
    bottom: Platform.OS === 'ios' ? 40 : 24,
    height: 52,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmFloatingDisabled: { opacity: 0.7 },
  confirmFloatingText: { color: '#fff', fontWeight: '800', fontSize: TYPOGRAPHY.sizes.sm },
});

// Estilos OutOfAreaModal (alerta temático)
const oa = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING[6] },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '100%', backgroundColor: COLORS.background, borderRadius: RADIUS.xl, padding: SPACING[6], alignItems: 'center' },
  iconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.secondary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING[4] },
  title: { color: COLORS.text, fontWeight: '800', fontSize: TYPOGRAPHY.sizes.lg, marginBottom: SPACING[2], textAlign: 'center' },
  subtitle: { color: COLORS.textSecondary, fontSize: TYPOGRAPHY.sizes.sm, textAlign: 'center', lineHeight: 20, marginBottom: SPACING[5] },
  button: { width: '100%', height: 48, backgroundColor: COLORS.primary, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: TYPOGRAPHY.sizes.sm },
});

/**
 * app.json — plugin necessário:
 *
 * "plugins": [
 *   ["react-native-maps"]
 * ]
 *
 * Nota sobre API key: react-native-maps usa Apple Maps no iOS (sem key) e
 * Google Maps no Android. Em Expo Go / dev client geralmente funciona sem
 * key configurada. Pra build standalone (EAS Build) em produção no Android,
 * o Google exige uma API key do Google Maps SDK configurada assim:
 *
 * "android": {
 *   "config": { "googleMaps": { "apiKey": "SUA_CHAVE_AQUI" } }
 * }
 *
 * A camada de rua/reverse geo em si (Nominatim) continua 100% gratuita e
 * sem key — é só o tile do mapa nativo do Android que pode exigir isso.
 */
