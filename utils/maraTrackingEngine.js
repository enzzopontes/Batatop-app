/**
 * utils/maraTrackingEngine.js
 *
 * Motor de rastreio mãos-livres da Mara ("Sistema Zero Cliques").
 * Opera no painel administrativo (/admin/pedidos).
 *
 * Regras:
 * 1. Saída Automática da Base:
 *    - Se afastar > 40m da base (STORE_ADDRESS) por 2 leituras consecutivas,
 *      muda pedidos ativos ('preparing' ou 'ready') para 'out_for_delivery'.
 *    - Transmite driver_lat, driver_lng, heading a cada 5s para delivery_tracking.
 *
 * 2. Chegada no Cliente:
 *    - Distância Haversine <= 50m por pelo menos 30s consecutivos (Trava Anti-Passagem).
 *    - Seta metadata.arrived_at = ISO string no pedido.
 *    - 2 minutos após arrived_at (checados a cada tick), altera automaticamente para 'delivered'.
 *
 * 3. Kill-Switch de Privacidade:
 *    - Zera coordenadas e ativação em delivery_tracking quando 0 pedidos em rota ou desligado.
 */

import * as Location from 'expo-location';
import { supabase } from '../supabaseConfig';
import { STORE_ADDRESS } from '../constants/store';

// Cálculo de distância Haversine em metros
export function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

const STORE_BASE_LAT = STORE_ADDRESS.latitude ?? -21.8402;
const STORE_BASE_LNG = STORE_ADDRESS.longitude ?? -49.0058;

const DEPARTURE_DISTANCE_THRESHOLD_METERS = 40;
const ARRIVAL_DISTANCE_THRESHOLD_METERS = 50;
const ARRIVAL_TIME_REQUIRED_MS = 30 * 1000; // 30 segundos
const AUTO_DELIVERY_DELAY_MS = 2 * 60 * 1000; // 2 minutos

let locationSubscription = null;
let isEngineRunning = false;

// Estado em memória do rastreio
let consecutiveDepartureCount = 0;
let lastKnownLocation = null;
// arrivalTracking: { [orderId]: firstSeenTimestamp }
const arrivalTracking = new Map();
// deliveryTimers: { [orderId]: timerId }
const deliveryTimers = new Map();

// Ouvintes de status para UI do admin
const listeners = new Set();

function notifyListeners(state) {
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {}
  });
}

export function subscribeTrackingStatus(callback) {
  listeners.add(callback);
  callback(getTrackingEngineState());
  return () => listeners.delete(callback);
}

export function getTrackingEngineState() {
  return {
    isRunning: isEngineRunning,
    lastLocation: lastKnownLocation,
    consecutiveDepartureCount,
    arrivedOrdersCount: arrivalTracking.size,
  };
}

/**
 * Kill-switch de Privacidade de GPS:
 * Limpa coordenadas e desativa rastreamento no banco para nunca expor a posição da Mara.
 */
export async function killSwitchTracking() {
  try {
    await supabase.from('delivery_tracking').upsert({
      id: 'live',
      driver_lat: null,
      driver_lng: null,
      heading: 0,
      speed: 0,
      is_active: false,
      active_order_ids: [],
      public_stops: [],
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[MaraTrackingEngine] Falha ao executar kill-switch de GPS:', err);
  }
}

/**
 * Envia as coordenadas ao vivo para o Supabase incluindo paradas sanitizadas
 */
async function syncLocationToSupabase(coords, activeOrderIds = [], publicStops = []) {
  try {
    const payload = {
      id: 'live',
      driver_lat: coords.latitude,
      driver_lng: coords.longitude,
      heading: coords.heading || 0,
      speed: coords.speed || 0,
      is_active: true,
      active_order_ids: activeOrderIds,
      public_stops: publicStops,
      updated_at: new Date().toISOString(),
    };

    await supabase.from('delivery_tracking').upsert(payload);
  } catch (err) {
    console.warn('[MaraTrackingEngine] Falha ao sincronizar coordenadas:', err);
  }
}

/**
 * Busca pedidos de delivery ativos no Supabase
 */
async function fetchActiveDeliveryOrders() {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, delivery_type, delivery_lat, delivery_lng, metadata, customer_name')
      .eq('delivery_type', 'delivery')
      .in('status', ['preparing', 'ready', 'out_for_delivery']);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[MaraTrackingEngine] Erro ao buscar pedidos ativos:', err);
    return [];
  }
}

/**
 * Checa regras de saída e chegada a cada posição do GPS
 */
async function processLocationTick(location) {
  lastKnownLocation = location.coords;
  const { latitude, longitude } = location.coords;

  const orders = await fetchActiveDeliveryOrders();
  const now = Date.now();

  // 1. Verificar Saída da Base
  const distFromBase = calculateDistanceMeters(latitude, longitude, STORE_BASE_LAT, STORE_BASE_LNG);
  if (distFromBase > DEPARTURE_DISTANCE_THRESHOLD_METERS) {
    consecutiveDepartureCount += 1;
  } else {
    consecutiveDepartureCount = 0;
  }

  // 2 leituras consecutivas > 40m longe da base -> Saiu para entrega
  if (consecutiveDepartureCount >= 2) {
    const ordersToDispatch = orders.filter(
      (o) => o.status === 'preparing' || o.status === 'ready'
    );

    for (const order of ordersToDispatch) {
      try {
        await supabase
          .from('orders')
          .update({
            status: 'out_for_delivery',
            updated_at: new Date().toISOString(),
            metadata: {
              ...(order.metadata || {}),
              dispatched_at: new Date().toISOString(),
            },
          })
          .eq('id', order.id);
        order.status = 'out_for_delivery';
      } catch (err) {
        console.warn(`[MaraTrackingEngine] Erro ao despachar pedido #${order.id}:`, err);
      }
    }
  }

  // 2. Checagem em cada tick dos 5 minutos após arrived_at (Imune a reload / perda de memória)
  let outForDeliveryOrders = orders.filter((o) => o.status === 'out_for_delivery');

  for (const order of outForDeliveryOrders) {
    if (order.metadata?.arrived_at) {
      const arrivedTime = new Date(order.metadata.arrived_at).getTime();
      if (now - arrivedTime >= AUTO_DELIVERY_DELAY_MS) {
        await markOrderDelivered(order.id);
        order.status = 'delivered';
      }
    }
  }

  // Recalcula pedidos em rota após eventuais baixas automáticas
  outForDeliveryOrders = orders.filter((o) => o.status === 'out_for_delivery');
  const activeOrdersRemaining = orders.filter((o) =>
    ['preparing', 'ready', 'out_for_delivery'].includes(o.status)
  );

  // Se não houver nenhum pedido em rota ou preparo, dispara o Kill-Switch de Privacidade
  if (activeOrdersRemaining.length === 0) {
    await killSwitchTracking();
    notifyListeners(getTrackingEngineState());
    return;
  }

  // Sanitiza as paradas públicas para a tabela delivery_tracking (toFixed(3), sem dados privados)
  const publicStops = outForDeliveryOrders
    .map((o, idx) => {
      const clientLat = o.delivery_lat ?? o.metadata?.delivery_lat;
      const clientLng = o.delivery_lng ?? o.metadata?.delivery_lng;
      if (clientLat == null || clientLng == null) return null;
      return {
        id: idx + 1,
        latitude: Number(Number(clientLat).toFixed(3)),
        longitude: Number(Number(clientLng).toFixed(3)),
      };
    })
    .filter(Boolean);

  const activeOrderIds = orders.map((o) => o.id);

  // 3. Transmitir coordenadas ao vivo e paradas sanitizadas
  await syncLocationToSupabase(location.coords, activeOrderIds, publicStops);

  // 4. Checar Chegada no Cliente para pedidos 'out_for_delivery'
  for (const order of outForDeliveryOrders) {
    const clientLat = order.delivery_lat ?? order.metadata?.delivery_lat;
    const clientLng = order.delivery_lng ?? order.metadata?.delivery_lng;

    if (clientLat == null || clientLng == null) continue;

    const distToClient = calculateDistanceMeters(latitude, longitude, clientLat, clientLng);

    // Se estiver a <= 50 metros do cliente
    if (distToClient <= ARRIVAL_DISTANCE_THRESHOLD_METERS) {
      if (!arrivalTracking.has(order.id)) {
        // Primeira leitura perto do cliente
        arrivalTracking.set(order.id, now);
      } else {
        const firstSeen = arrivalTracking.get(order.id);
        const durationNearClient = now - firstSeen;

        // Se permaneceu por pelo menos 30 segundos (Trava Anti-Passagem)
        if (durationNearClient >= ARRIVAL_TIME_REQUIRED_MS) {
          const alreadyArrived = !!order.metadata?.arrived_at;

          if (!alreadyArrived) {
            const arrivedIso = new Date().toISOString();
            await supabase
              .from('orders')
              .update({
                metadata: {
                  ...(order.metadata || {}),
                  arrived_at: arrivedIso,
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', order.id);

            order.metadata = { ...(order.metadata || {}), arrived_at: arrivedIso };

            // Timer de backup em memória
            if (!deliveryTimers.has(order.id)) {
              const timer = setTimeout(async () => {
                await markOrderDelivered(order.id);
              }, AUTO_DELIVERY_DELAY_MS);
              deliveryTimers.set(order.id, timer);
            }
          }
        }
      }
    } else {
      // Se saiu de perto antes de completar 30 segundos, cancela a trava
      if (arrivalTracking.has(order.id) && !order.metadata?.arrived_at) {
        arrivalTracking.delete(order.id);
      }
    }
  }

  notifyListeners(getTrackingEngineState());
}

async function markOrderDelivered(orderId) {
  try {
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('metadata')
      .eq('id', orderId)
      .maybeSingle();

    await supabase
      .from('orders')
      .update({
        status: 'delivered',
        updated_at: new Date().toISOString(),
        metadata: {
          ...(currentOrder?.metadata || {}),
          auto_delivered_by_mara: true,
          delivered_at: new Date().toISOString(),
        },
      })
      .eq('id', orderId);

    arrivalTracking.delete(orderId);
    if (deliveryTimers.has(orderId)) {
      clearTimeout(deliveryTimers.get(orderId));
      deliveryTimers.delete(orderId);
    }
  } catch (err) {
    console.warn(`[MaraTrackingEngine] Falha ao marcar pedido #${orderId} como entregue:`, err);
  }
}

/**
 * Inicia o rastreamento automático
 */
export async function startMaraTracking() {
  if (isEngineRunning) return true;

  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Permissão de localização negada');
    }

    isEngineRunning = true;
    consecutiveDepartureCount = 0;

    // Obter primeira posição imediata
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await processLocationTick(initialLocation);

    // Assistir posição continuamente a cada 5 segundos
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 5,
      },
      (loc) => {
        processLocationTick(loc);
      }
    );

    notifyListeners(getTrackingEngineState());
    return true;
  } catch (err) {
    isEngineRunning = false;
    notifyListeners(getTrackingEngineState());
    throw err;
  }
}

/**
 * Para o rastreamento e ativa o kill-switch de privacidade
 */
export function stopMaraTracking() {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  deliveryTimers.forEach((timer) => clearTimeout(timer));
  deliveryTimers.clear();
  arrivalTracking.clear();

  isEngineRunning = false;
  notifyListeners(getTrackingEngineState());

  // Zera dados ao vivo no banco imediatamente
  killSwitchTracking();
}
