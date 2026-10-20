/**
 * components/orders/LiveDeliveryMap.js
 *
 * Mapa interativo estilo iFood para rastreio em tempo real da entrega.
 *
 * Recursos:
 * - Modo Tela Cheia (Fullscreen Modal) com header de navegação e sheet inferior informativo.
 * - Carro SVG ultra realista com feixe de luz dos faróis e animação suave nas curvas.
 * - Marcador de destino "Sua Casa" estilo iFood com casinha detalhada em vetor.
 * - Marcador de origem da loja Batata Top.
 * - Traçado de rota via OSRM público com duas polylines sobrepostas.
 * - Múltiplas paradas anonimizadas (toFixed(3)).
 * - Botão de recentralizar o trajeto no mapa.
 * - Supabase Realtime ouvindo delivery_tracking em tempo real.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  Animated,
  StatusBar,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { supabase } from '../../supabaseConfig';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../constants/theme';
import { STORE_ADDRESS } from '../../constants/store';
import { calculateDistanceMeters } from '../../utils/maraTrackingEngine';

import DeliveryVehicleMarker from './DeliveryVehicleMarker';
import DeliveryDestinationMarker from './DeliveryDestinationMarker';

function calculateBearing(startLat, startLng, destLat, destLng) {
  if (startLat == null || startLng == null || destLat == null || destLng == null) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLng = toRad(destLng - startLng);
  const lat1 = toRad(startLat);
  const lat2 = toRad(destLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function LiveGreenDot() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return <Animated.View style={[styles.liveGreenDot, { opacity: pulseAnim }]} />;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORE_COORDS = {
  latitude: STORE_ADDRESS.latitude ?? -21.8402,
  longitude: STORE_ADDRESS.longitude ?? -49.0058,
};

export default function LiveDeliveryMap({
  order,
  height,
  isFullScreen = false,
  isPreview = false,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const lastRouteFetchedDriverPosRef = useRef(null);

  const clientLat = order?.delivery_lat ?? order?.metadata?.delivery_lat ?? STORE_COORDS.latitude;
  const clientLng = order?.delivery_lng ?? order?.metadata?.delivery_lng ?? STORE_COORDS.longitude;

  const [driverPos, setDriverPos] = useState({
    latitude: STORE_COORDS.latitude,
    longitude: STORE_COORDS.longitude,
    heading: 0,
  });
  const [displayPos, setDisplayPos] = useState({
    latitude: STORE_COORDS.latitude,
    longitude: STORE_COORDS.longitude,
    heading: 0,
  });
  const displayPosRef = useRef({
    latitude: STORE_COORDS.latitude,
    longitude: STORE_COORDS.longitude,
    heading: 0,
  });
  const animFrameRef = useRef(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [otherStops, setOtherStops] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [tracksMarkerView, setTracksMarkerView] = useState(true);

  useEffect(() => {
    setTracksMarkerView(true);
    const timer = setTimeout(() => {
      setTracksMarkerView(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Interpolação suave estilo Uber/iFood (1850ms) ao atualizar driverPos
  useEffect(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const startLat = displayPosRef.current.latitude;
    const startLng = displayPosRef.current.longitude;
    const startHeading = displayPosRef.current.heading || 0;

    const targetLat = driverPos.latitude;
    const targetLng = driverPos.longitude;
    const targetHeading = driverPos.heading || 0;

    const dist = calculateDistanceMeters(startLat, startLng, targetLat, targetLng);

    // Salto inicial (> 2000m) ou micro-ajuste (< 0.5m): aplica imediatamente
    if (dist < 0.5 || dist > 2000) {
      const snapped = {
        latitude: targetLat,
        longitude: targetLng,
        heading: targetHeading,
      };
      displayPosRef.current = snapped;
      setDisplayPos(snapped);
      return;
    }

    const deltaHeading = ((targetHeading - startHeading + 540) % 360) - 180;
    const duration = 1850;
    const startTime = Date.now();
    let lastRenderTime = 0;

    const step = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      const nextPos = {
        latitude: startLat + (targetLat - startLat) * t,
        longitude: startLng + (targetLng - startLng) * t,
        heading: (startHeading + deltaHeading * t + 360) % 360,
      };

      displayPosRef.current = nextPos;

      // Atualiza estado a ~22fps (a cada ~45ms) ou no frame final para suavidade sem sobrecarregar a bridge
      if (t >= 1 || now - lastRenderTime >= 45) {
        lastRenderTime = now;
        setDisplayPos(nextPos);
      }

      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [driverPos.latitude, driverPos.longitude, driverPos.heading]);

  // 1. Traça rota pelas ruas via OSRM público com throttle de 15 metros
  const fetchRouteFromOSRM = useCallback(async (startLat, startLng, destLat, destLng, force = false) => {
    if (startLat == null || startLng == null || destLat == null || destLng == null) return;

    // Rate-limit: só recalcula rota se a Mara tiver se movido >= 15 metros
    if (!force && lastRouteFetchedDriverPosRef.current) {
      const movedDist = calculateDistanceMeters(
        lastRouteFetchedDriverPosRef.current.latitude,
        lastRouteFetchedDriverPosRef.current.longitude,
        startLat,
        startLng
      );
      if (movedDist < 15) {
        return;
      }
    }

    lastRouteFetchedDriverPosRef.current = { latitude: startLat, longitude: startLng };

    try {
      setLoadingRoute(true);
      const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('OSRM routing request failed');
      const data = await res.json();

      if (data.routes && data.routes[0]?.geometry?.coordinates) {
        const points = data.routes[0].geometry.coordinates.map(([lng, lat]) => ({
          latitude: lat,
          longitude: lng,
        }));
        setRouteCoords(points);
        if (points.length > 1) {
          const lookAheadIdx = Math.min(3, points.length - 1);
          const roadBearing = calculateBearing(
            points[0].latitude,
            points[0].longitude,
            points[lookAheadIdx].latitude,
            points[lookAheadIdx].longitude
          );
          setDriverPos((prev) => (prev.heading ? prev : { ...prev, heading: roadBearing }));
        }
      } else {
        // Fallback: linha reta
        setRouteCoords([
          { latitude: startLat, longitude: startLng },
          { latitude: destLat, longitude: destLng },
        ]);
      }
    } catch {
      // Fallback em caso de erro de rede no OSRM
      setRouteCoords([
        { latitude: startLat, longitude: startLng },
        { latitude: destLat, longitude: destLng },
      ]);
    } finally {
      setLoadingRoute(false);
    }
  }, []);

  // 2. Busca a coordenada inicial e assina o Realtime (lendo public_stops sanitizadas)
  useEffect(() => {
    let isMounted = true;
    let channel = null;

    async function initLiveTracking() {
      try {
        const { data } = await supabase
          .from('delivery_tracking')
          .select('driver_lat, driver_lng, heading, is_active, public_stops')
          .eq('id', 'live')
          .single();

        if (!isMounted) return;

        if (data?.driver_lat && data?.driver_lng) {
          const pos = {
            latitude: data.driver_lat,
            longitude: data.driver_lng,
            heading: data.heading || 0,
          };
          setDriverPos(pos);
          fetchRouteFromOSRM(pos.latitude, pos.longitude, clientLat, clientLng, true);
        } else {
          fetchRouteFromOSRM(STORE_COORDS.latitude, STORE_COORDS.longitude, clientLat, clientLng, true);
        }

        if (data?.public_stops && Array.isArray(data.public_stops)) {
          const clientLat3 = Number(Number(clientLat).toFixed(3));
          const clientLng3 = Number(Number(clientLng).toFixed(3));
          const filteredStops = data.public_stops.filter(
            (s) => Math.abs(s.latitude - clientLat3) > 0.001 || Math.abs(s.longitude - clientLng3) > 0.001
          );
          setOtherStops(filteredStops);
        }
      } catch {
        if (!isMounted) return;
        fetchRouteFromOSRM(STORE_COORDS.latitude, STORE_COORDS.longitude, clientLat, clientLng, true);
      }

      if (!isMounted) return;

      // Assina atualizações do Realtime para o id 'live'
      const channelName = `live-tracking-${Date.now()}`;
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'delivery_tracking',
            filter: 'id=eq.live',
          },
          (payload) => {
            if (!isMounted) return;
            const row = payload.new;
            if (row?.driver_lat && row?.driver_lng) {
              setDriverPos((prev) => {
                let nextHeading = row.heading && row.heading > 0 ? row.heading : prev.heading;
                if (!row.heading || row.heading <= 0) {
                  const movedMeters = calculateDistanceMeters(
                    prev.latitude,
                    prev.longitude,
                    row.driver_lat,
                    row.driver_lng
                  );
                  if (movedMeters > 2) {
                    nextHeading = calculateBearing(
                      prev.latitude,
                      prev.longitude,
                      row.driver_lat,
                      row.driver_lng
                    );
                  }
                }
                return {
                  latitude: row.driver_lat,
                  longitude: row.driver_lng,
                  heading: nextHeading || 0,
                };
              });
              fetchRouteFromOSRM(row.driver_lat, row.driver_lng, clientLat, clientLng, false);
            }

            if (row?.public_stops && Array.isArray(row.public_stops)) {
              const clientLat3 = Number(Number(clientLat).toFixed(3));
              const clientLng3 = Number(Number(clientLng).toFixed(3));
              const filteredStops = row.public_stops.filter(
                (s) => Math.abs(s.latitude - clientLat3) > 0.001 || Math.abs(s.longitude - clientLng3) > 0.001
              );
              setOtherStops(filteredStops);
            }
          }
        )
        .subscribe();
    }

    initLiveTracking();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientLat, clientLng, fetchRouteFromOSRM]);

  const statusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : insets.top;
  const headerPaddingTop = Math.max(statusBarHeight, insets.top, 28) + 14;

  // 3. Centraliza a visão do mapa nos pontos principais
  const fitAllCoords = useCallback(() => {
    if (!mapRef.current) return;

    const coordsToFit = [
      { latitude: driverPos.latitude, longitude: driverPos.longitude },
      { latitude: clientLat, longitude: clientLng },
      ...otherStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    ];

    const edgePadding = isPreview
      ? { top: 24, right: 36, bottom: 48, left: 36 }
      : {
          top: isFullScreen ? headerPaddingTop + 70 : 60,
          right: 60,
          bottom: isFullScreen ? 280 : 60,
          left: 60,
        };

    mapRef.current.fitToCoordinates(coordsToFit, {
      edgePadding,
      animated: !isPreview,
    });
  }, [driverPos.latitude, driverPos.longitude, clientLat, clientLng, otherStops, isFullScreen, isPreview, headerPaddingTop]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fitAllCoords();
    }, 450);

    return () => clearTimeout(timer);
  }, [fitAllCoords]);

  const initialRegion = {
    latitude: (driverPos.latitude + clientLat) / 2,
    longitude: (driverPos.longitude + clientLng) / 2,
    latitudeDelta: Math.abs(driverPos.latitude - clientLat) * 1.8 + 0.015,
    longitudeDelta: Math.abs(driverPos.longitude - clientLng) * 1.8 + 0.015,
  };

  const containerHeight = isFullScreen ? '100%' : (height ?? SCREEN_HEIGHT * 0.48);
  const etaMinutes = order?.metadata?.eta_minutes ?? 15;
  const clientAddress = [order?.address, order?.complement, order?.neighborhood]
    .filter(Boolean)
    .join(', ') || 'Endereço de entrega';

  return (
    <View
      style={[styles.container, { height: containerHeight }]}
      pointerEvents={isPreview ? 'none' : 'auto'}
    >
      {isFullScreen && (
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      )}

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        scrollEnabled={!isPreview}
        zoomEnabled={!isPreview}
        rotateEnabled={!isPreview}
        pitchEnabled={!isPreview}
      >
        {/* Linha Dupla Sobreposta: Borda Amarelo Claro + Amarelo Dourado Batata Top */}
        {routeCoords.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor={COLORS.warningBg}
              strokeWidth={8}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor={COLORS.primary}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Marcador Paradas Anteriores / Outros Clientes (Anonimizadas) */}
        {otherStops.map((stop, idx) => (
          <Marker
            key={stop.id || `stop-${idx}`}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.otherStopBadge}>
              <Text style={styles.otherStopText}>Parada {idx + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Marcador da Casa do Cliente estilo iFood */}
        <Marker
          coordinate={{ latitude: clientLat, longitude: clientLng }}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={tracksMarkerView}
        >
          <DeliveryDestinationMarker />
        </Marker>

        {/* Marcador do Carro 3D da Mara (Gol G2 Prata rotacionado nas curvas) */}
        <Marker
          coordinate={{ latitude: displayPos.latitude, longitude: displayPos.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat={true}
          rotation={displayPos.heading || 0}
          tracksViewChanges={tracksMarkerView}
        >
          <DeliveryVehicleMarker />
        </Marker>
      </MapView>

      {/* HEADER SUPERIOR ESTILO ADDRESSES (Abaixo da barra de status) */}
      {isFullScreen ? (
        <View style={[styles.addressStyleHeader, { paddingTop: headerPaddingTop }]} collapsable={false}>
          <Pressable
            style={styles.addressStyleBackBtn}
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (onClose) onClose();
            }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.primary} />
          </Pressable>

          <View style={styles.addressStyleHeaderCenter}>
            <Text style={styles.addressStyleHeaderTitle}>ACOMPANHAR ENTREGA</Text>
            {order?.order_number || order?.id ? (
              <Text style={styles.addressStyleHeaderSub}>
                Pedido #{order?.order_number || order?.id?.slice(0, 4)}
              </Text>
            ) : null}
          </View>

          {/* Badge ao vivo com bola verde do ladinho */}
          <View style={styles.liveBadgeAddressHeader}>
            <LiveGreenDot />
            <Text style={styles.liveBadgeAddressText}>ao vivo</Text>
          </View>
        </View>
      ) : !isPreview ? (
        /* Indicador Compacto de Rota Ao Vivo */
        <View style={styles.liveOverlayBadge}>
          <LiveGreenDot />
          <Text style={styles.liveOverlayText}>Rastreio ao vivo da Mara</Text>
        </View>
      ) : null}

      {/* BOTÃO FLUTUANTE DE RE-CENTRALIZAR O TRAJETO */}
      {isFullScreen && (
        <Pressable
          style={[
            styles.recenterBtn,
            { bottom: Math.max(insets.bottom, 16) + 250 },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            fitAllCoords();
          }}
        >
          <Ionicons name="locate" size={22} color={COLORS.primary} />
        </Pressable>
      )}

      {/* SHEET INFERIOR INFORMATIVO ESTILO IFOOD (Em modo tela cheia) */}
      {isFullScreen && (
        <View
          style={[
            styles.bottomSheet,
            { paddingBottom: Math.max(insets.bottom, SPACING[4]) + SPACING[3] },
          ]}
        >
          <View style={styles.sheetHandle} />

          {/* Header: Status secundário + Previsão ETA em destaque */}
          <Text style={styles.sheetStatusSubtitle}>
            Pedido a caminho • Saiu para entrega
          </Text>

          <View style={styles.sheetEtaHeaderRow}>
            <Text style={styles.sheetEtaMain}>Chega em ~{etaMinutes} min</Text>
            <View style={styles.sheetLivePill}>
              <LiveGreenDot />
              <Text style={styles.sheetLivePillText}>Tempo real</Text>
            </View>
          </View>

          {/* Barra de progresso contínua estilo iFood (4 etapas) */}
          <View style={styles.sheetProgressRow}>
            <View style={[styles.sheetProgressSegment, styles.sheetProgressSegmentDone]} />
            <View style={[styles.sheetProgressSegment, styles.sheetProgressSegmentDone]} />
            <View style={[styles.sheetProgressSegment, styles.sheetProgressSegmentActive]} />
            <View style={styles.sheetProgressSegment} />
          </View>

          <View style={styles.sheetDivider} />

          {/* Card Entregadora Mara (Gol G2 Prata) */}
          <View style={styles.driverCard}>
            <View style={styles.driverAvatar}>
              <Ionicons name="car-sport" size={22} color={COLORS.text} />
            </View>
            <View style={styles.driverInfo}>
              <Text style={styles.driverName}>Mara • Gol G2 Prata</Text>
              <Text style={styles.driverSubtitle}>
                {loadingRoute ? 'Atualizando rota em tempo real...' : 'Entregadora parceira Batata Top'}
              </Text>
            </View>
          </View>

          {/* Endereço de Entrega alinhado estilo iFood */}
          <View style={styles.addressRow}>
            <View style={styles.addressIconBox}>
              <Ionicons name="location-sharp" size={18} color={COLORS.secondary} />
            </View>
            <View style={styles.addressInfo}>
              <Text style={styles.addressLabel}>Entregar em</Text>
              <Text style={styles.addressText} numberOfLines={2}>
                {clientAddress}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: COLORS.backgroundElevated,
    overflow: 'hidden',
  },

  // Outras Paradas Anonimizadas
  otherStopBadge: {
    backgroundColor: COLORS.text,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[2],
    paddingVertical: 2,
    ...SHADOWS.sm,
  },
  otherStopText: {
    color: COLORS.white,
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weights.extrabold,
  },

  // Header Tela Cheia Estilo Addresses
  addressStyleHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[4],
    backgroundColor: COLORS.background,
    borderBottomLeftRadius: RADIUS.xl,
    borderBottomRightRadius: RADIUS.xl,
    zIndex: 10,
    ...SHADOWS.md,
  },
  addressStyleBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressStyleHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING[2],
  },
  addressStyleHeaderTitle: {
    color: COLORS.text,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    fontSize: 13,
    letterSpacing: 0.6,
  },
  addressStyleHeaderSub: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weights.semibold,
    marginTop: 1,
  },
  liveBadgeAddressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.backgroundElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  liveGreenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  liveBadgeAddressText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.success,
    letterSpacing: 0.2,
  },

  // Botão Centralizar
  recenterBtn: {
    position: 'absolute',
    right: SPACING[4],
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOWS.md,
    zIndex: 9,
  },

  // Sheet Inferior estilo iFood
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingTop: SPACING[3],
    paddingHorizontal: SPACING[5],
    ...SHADOWS.lg,
    zIndex: 10,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.grayBorder,
    alignSelf: 'center',
    marginBottom: SPACING[3],
  },
  sheetStatusSubtitle: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  sheetEtaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[3],
  },
  sheetEtaMain: {
    fontSize: TYPOGRAPHY.sizes.xl,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
  },
  sheetLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.warningBg,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
  },
  sheetLivePillText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.primaryText,
  },
  sheetProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING[4],
  },
  sheetProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.border,
  },
  sheetProgressSegmentDone: {
    backgroundColor: COLORS.primary,
  },
  sheetProgressSegmentActive: {
    backgroundColor: COLORS.primary,
    height: 5,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: SPACING[3],
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundLight,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING[3],
  },
  driverAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.grayBorder,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
  },
  driverSubtitle: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.medium,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  addressIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.warningBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.textMuted,
  },
  addressText: {
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.text,
    fontWeight: TYPOGRAPHY.weights.semibold,
    lineHeight: 18,
  },

  // Badge Flutuante no Topo (Modo embutido)
  liveOverlayBadge: {
    position: 'absolute',
    top: SPACING[3],
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING[3],
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sm,
  },
  liveOverlayText: {
    fontSize: TYPOGRAPHY.sizes.xs,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
  },
});
