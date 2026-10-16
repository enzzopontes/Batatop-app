/**
 * components/orders/LiveDeliveryMap.js
 *
 * Mapa interativo estilo iFood para rastreio em tempo real da entrega.
 *
 * Recursos:
 * - Marcador do Carrinho Amarelo da Mara (#FFB800 com contorno #3E3E3E).
 * - Traçado de rota pelas ruas via OSRM público com duas polylines sobrepostas.
 * - Múltiplas paradas anonimizadas (toFixed(3)) sem expor dados de terceiros.
 * - Marcador customizado "Sua Casa" para o endereço do cliente.
 * - Supabase Realtime ouvindo delivery_tracking em tempo real.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../supabaseConfig';
import { COLORS } from '../../constants/theme';
import { STORE_ADDRESS } from '../../constants/store';

import { calculateDistanceMeters } from '../../utils/maraTrackingEngine';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const STORE_COORDS = {
  latitude: STORE_ADDRESS.latitude ?? -21.8402,
  longitude: STORE_ADDRESS.longitude ?? -49.0058,
};

export default function LiveDeliveryMap({ order, height = SCREEN_HEIGHT * 0.48 }) {
  const mapRef = useRef(null);
  const lastRouteFetchedDriverPosRef = useRef(null);

  const clientLat = order?.delivery_lat ?? order?.metadata?.delivery_lat ?? STORE_COORDS.latitude;
  const clientLng = order?.delivery_lng ?? order?.metadata?.delivery_lng ?? STORE_COORDS.longitude;

  const [driverPos, setDriverPos] = useState({
    latitude: STORE_COORDS.latitude,
    longitude: STORE_COORDS.longitude,
    heading: 0,
  });
  const [routeCoords, setRouteCoords] = useState([]);
  const [otherStops, setOtherStops] = useState([]);
  const [loadingRoute, setLoadingRoute] = useState(false);

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
        return; // Economiza request ao OSRM
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
    let channel = null;

    async function initLiveTracking() {
      try {
        const { data } = await supabase
          .from('delivery_tracking')
          .select('driver_lat, driver_lng, heading, is_active, public_stops')
          .eq('id', 'live')
          .single();

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
          // Filtra parada que coincida com a casa deste cliente para não duplicar
          const clientLat3 = Number(Number(clientLat).toFixed(3));
          const clientLng3 = Number(Number(clientLng).toFixed(3));
          const filteredStops = data.public_stops.filter(
            (s) => Math.abs(s.latitude - clientLat3) > 0.001 || Math.abs(s.longitude - clientLng3) > 0.001
          );
          setOtherStops(filteredStops);
        }
      } catch {
        fetchRouteFromOSRM(STORE_COORDS.latitude, STORE_COORDS.longitude, clientLat, clientLng, true);
      }

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
            const row = payload.new;
            if (row?.driver_lat && row?.driver_lng) {
              const newPos = {
                latitude: row.driver_lat,
                longitude: row.driver_lng,
                heading: row.heading || 0,
              };
              setDriverPos(newPos);
              fetchRouteFromOSRM(newPos.latitude, newPos.longitude, clientLat, clientLng, false);
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
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientLat, clientLng, fetchRouteFromOSRM]);

  // 4. Ajusta o enquadramento do mapa para incluir motorista e cliente
  useEffect(() => {
    if (!mapRef.current) return;

    const coordsToFit = [
      { latitude: driverPos.latitude, longitude: driverPos.longitude },
      { latitude: clientLat, longitude: clientLng },
      ...otherStops.map((s) => ({ latitude: s.latitude, longitude: s.longitude })),
    ];

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordsToFit, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [driverPos.latitude, driverPos.longitude, clientLat, clientLng, otherStops]);

  const initialRegion = {
    latitude: (driverPos.latitude + clientLat) / 2,
    longitude: (driverPos.longitude + clientLng) / 2,
    latitudeDelta: Math.abs(driverPos.latitude - clientLat) * 1.8 + 0.01,
    longitudeDelta: Math.abs(driverPos.longitude - clientLng) * 1.8 + 0.01,
  };

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsCompass={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {/* Linha Dupla Sobreposta: Base Escura + Amarelo Batata Top */}
        {routeCoords.length > 1 && (
          <>
            <Polyline
              coordinates={routeCoords}
              strokeColor="#3E3E3E"
              strokeWidth={7}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={routeCoords}
              strokeColor={COLORS.primary || '#FFB800'}
              strokeWidth={5}
              lineCap="round"
              lineJoin="round"
            />
          </>
        )}

        {/* Marcador Paradas Anteriores / Outros Clientes (Anonimizadas) */}
        {otherStops.map((stop, idx) => (
          <Marker
            key={stop.id}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.otherStopBadge}>
              <Text style={styles.otherStopText}>Parada {idx + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Marcador do Cliente ("Sua Casa") */}
        <Marker
          coordinate={{ latitude: clientLat, longitude: clientLng }}
          anchor={{ x: 0.5, y: 1 }}
        >
          <View style={styles.clientMarkerWrap}>
            <View style={styles.clientBadge}>
              <Ionicons name="home" size={14} color="#FFF" />
              <Text style={styles.clientBadgeText}>Sua Casa</Text>
            </View>
            <View style={styles.clientPinPointer} />
          </View>
        </Marker>

        {/* Marcador do Carrinho Amarelo da Mara */}
        <Marker
          coordinate={{ latitude: driverPos.latitude, longitude: driverPos.longitude }}
          anchor={{ x: 0.5, y: 0.5 }}
          flat
          rotation={driverPos.heading}
        >
          <View style={styles.carMarkerWrap}>
            <View style={styles.carCircle}>
              <Ionicons name="car" size={20} color="#3E3E3E" />
            </View>
            <View style={styles.carLabelBadge}>
              <Text style={styles.carLabelText}>Mara</Text>
            </View>
          </View>
        </Marker>
      </MapView>

      {/* Indicador de Rota Ao Vivo */}
      <View style={styles.liveOverlayBadge}>
        <View style={styles.livePulseDot} />
        <Text style={styles.liveOverlayText}>Rastreio ao vivo da Mara</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#EAEAEA',
    overflow: 'hidden',
  },
  // Marcador Carrinho da Mara
  carMarkerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFB800',
    borderWidth: 3,
    borderColor: '#3E3E3E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  carLabelBadge: {
    backgroundColor: '#3E3E3E',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: -4,
    borderWidth: 1,
    borderColor: '#FFB800',
  },
  carLabelText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFB800',
    textTransform: 'uppercase',
  },
  // Marcador Sua Casa
  clientMarkerWrap: {
    alignItems: 'center',
  },
  clientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E61E2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  clientBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  clientPinPointer: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 0,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#E61E2A',
  },
  // Outras Paradas Anonimizadas
  otherStopBadge: {
    backgroundColor: '#3E3E3E',
    borderWidth: 1.5,
    borderColor: '#FFB800',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  otherStopText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
  },
  // Badge Flutuante no Topo
  liveOverlayBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveOverlayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
});
