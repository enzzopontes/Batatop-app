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
 *    - Distância Haversine <= 40m por pelo menos 30s consecutivos (Trava Anti-Passagem).
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

const DEPARTURE_DISTANCE_THRESHOLD_METERS = 25;
const ARRIVAL_DISTANCE_THRESHOLD_METERS = 40;
const ARRIVAL_TIME_REQUIRED_MS = 25 * 1000; // 25 segundos (entre 20s e 30s dentro dos 40m)
const AUTO_DELIVERY_DELAY_MS = 2 * 60 * 1000; // 2 minutos

let locationSubscription = null;
let heartbeatInterval = null;
let isTickRunning = false;
let isEngineRunning = false;

// Estado em memória do rastreio
let consecutiveDepartureCount = 0;
// Começa desarmado (false). Só arma quando o GPS confirmar presença DENTRO da base (<= 40m).
let canDispatchFromBase = false;
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
  if (!isEngineRunning && heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
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

const ORDERS_CACHE_TTL_MS = 4000;
let cachedOrders = [];
let lastOrdersFetchTime = 0;

function invalidateOrdersCache() {
  lastOrdersFetchTime = 0;
}

function cloneCachedOrders(list) {
  return (list || []).map((o) => ({
    ...o,
    metadata: o.metadata ? { ...o.metadata } : {},
  }));
}

/**
 * Busca pedidos de delivery ativos no Supabase (com cache de 4s para manter o tick de GPS leve)
 */
async function fetchActiveDeliveryOrders() {
  const now = Date.now();
  if (now - lastOrdersFetchTime < ORDERS_CACHE_TTL_MS && cachedOrders.length > 0) {
    return cloneCachedOrders(cachedOrders);
  }
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, delivery_type, delivery_lat, delivery_lng, metadata, customer_name')
      .eq('delivery_type', 'delivery')
      .in('status', ['pending', 'preparing', 'ready', 'out_for_delivery']);

    if (error) throw error;
    cachedOrders = data || [];
    lastOrdersFetchTime = now;
    return cloneCachedOrders(cachedOrders);
  } catch (err) {
    console.warn('[MaraTrackingEngine] Erro ao buscar pedidos ativos:', err);
    return cloneCachedOrders(cachedOrders);
  }
}

/**
 * Checa regras de saída e chegada a cada posição do GPS
 */
async function processLocationTick(location) {
  if (isTickRunning || !location?.coords) return;
  isTickRunning = true;

  try {
    lastKnownLocation = location.coords;
    const { latitude, longitude } = location.coords;

    const orders = await fetchActiveDeliveryOrders();
    const now = Date.now();

    // 1. Verificar Saída da Base
    const distFromBase = calculateDistanceMeters(latitude, longitude, STORE_BASE_LAT, STORE_BASE_LNG);
    // Histerese da base: dentro de 40m confirma presença na loja e arma o gatilho
    if (distFromBase <= 40) {
      consecutiveDepartureCount = 0;
      canDispatchFromBase = true;
    } else if (distFromBase > DEPARTURE_DISTANCE_THRESHOLD_METERS) {
      consecutiveDepartureCount += 1;
    }

    // 2 leituras consecutivas > 25m longe da base e gatilho armado após estar na base
    if (consecutiveDepartureCount >= 2 && canDispatchFromBase) {
      const ordersToDispatch = orders.filter((o) => {
        // Pedido pronto para sair sempre despacha
        if (o.status === 'ready') return true;

        // Pedido em preparo: se a Mara estava na base e saiu, despacha qualquer pedido
        // que já estava em preparo antes da saída (mesmo que feito rápido em 2 ou 3 minutos).
        if (o.status === 'preparing') return true;

        return false;
      });

      if (ordersToDispatch.length > 0) {
        let dispatchedAny = false;
        for (const order of ordersToDispatch) {
          try {
            const dispatchedIso = new Date().toISOString();
            await supabase
              .from('orders')
              .update({
                status: 'out_for_delivery',
                updated_at: dispatchedIso,
                metadata: {
                  ...(order.metadata || {}),
                  dispatched_at: dispatchedIso,
                },
              })
              .eq('id', order.id);
            order.status = 'out_for_delivery';
            dispatchedAny = true;
            invalidateOrdersCache();
          } catch (err) {
            console.warn(`[MaraTrackingEngine] Erro ao despachar pedido #${order.id}:`, err);
          }
        }
        if (dispatchedAny) {
          canDispatchFromBase = false;
        }
      }
    }

    // 2. Checagem em cada tick dos 2 minutos após arrived_at (Imune a reload / perda de memória)
    let outForDeliveryOrders = orders.filter((o) => o.status === 'out_for_delivery');

    for (const order of outForDeliveryOrders) {
      if (order.metadata?.arrived_at) {
        const arrivedTime = new Date(order.metadata.arrived_at).getTime();
        if (now - arrivedTime >= AUTO_DELIVERY_DELAY_MS) {
          await markOrderDelivered(order.id);
          order.status = 'delivered';
          invalidateOrdersCache();
        }
      }
    }

    // Recalcula pedidos em rota após eventuais baixas automáticas
    outForDeliveryOrders = orders.filter((o) => o.status === 'out_for_delivery');
    const activeOrdersRemaining = orders.filter((o) =>
      ['pending', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)
    );

    // Se não houver nenhum pedido pendente, em preparo ou em rota, limpa tracking e desliga
    if (activeOrdersRemaining.length === 0) {
      await killSwitchTracking();
      stopMaraTracking();
      notifyListeners(getTrackingEngineState());
      return;
    }

    // Enquanto ainda estiver na loja sem pedidos despachados, mantém is_active = false no banco
    // para não vazar a posição residencial da Mara para o cliente
    if (outForDeliveryOrders.length === 0) {
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

    const activeOrderIds = outForDeliveryOrders.map((o) => o.id);

    // 3. Transmitir coordenadas ao vivo e paradas sanitizadas
    await syncLocationToSupabase(location.coords, activeOrderIds, publicStops);

    // 4. Checar Chegada no Cliente para pedidos 'out_for_delivery'
    for (const order of outForDeliveryOrders) {
      const clientLat = order.delivery_lat ?? order.metadata?.delivery_lat;
      const clientLng = order.delivery_lng ?? order.metadata?.delivery_lng;

      if (clientLat == null || clientLng == null) continue;

      const distToClient = calculateDistanceMeters(latitude, longitude, clientLat, clientLng);

      // Se estiver a <= 40 metros do cliente
      if (distToClient <= ARRIVAL_DISTANCE_THRESHOLD_METERS) {
        if (!arrivalTracking.has(order.id)) {
          // Primeira leitura perto do cliente
          arrivalTracking.set(order.id, now);
        } else {
          const firstSeen = arrivalTracking.get(order.id);
          const durationNearClient = now - firstSeen;

          // Se permaneceu por pelo menos 25 segundos (Trava Anti-Passagem)
          if (durationNearClient >= ARRIVAL_TIME_REQUIRED_MS) {
            const alreadyArrived = !!order.metadata?.arrived_at;

            if (!alreadyArrived) {
              const arrivedIso = new Date().toISOString();
              const autoDeliverIso = new Date(Date.now() + AUTO_DELIVERY_DELAY_MS).toISOString();
              await supabase
                .from('orders')
                .update({
                  metadata: {
                    ...(order.metadata || {}),
                    arrived_at: arrivedIso,
                    auto_deliver_at: autoDeliverIso,
                  },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', order.id);

              order.metadata = {
                ...(order.metadata || {}),
                arrived_at: arrivedIso,
                auto_deliver_at: autoDeliverIso,
              };
              invalidateOrdersCache();

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
      } else if (distToClient > 60) {
        // Se saiu de perto (> 60m histerese) antes de completar 25 segundos, cancela a trava
        if (arrivalTracking.has(order.id) && !order.metadata?.arrived_at) {
          arrivalTracking.delete(order.id);
        }
      }
    }

    notifyListeners(getTrackingEngineState());
  } finally {
    isTickRunning = false;
  }
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
      .eq('id', orderId)
      .eq('status', 'out_for_delivery');

    invalidateOrdersCache();
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
    // Não força true ao ligar o GPS. Apenas confirma se a primeira leitura ou leituras seguintes estiverem na base.
    canDispatchFromBase = false;
    invalidateOrdersCache();

    // Obter primeira posição imediata
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    if (!isEngineRunning) return false;
    await processLocationTick(initialLocation);
    if (!isEngineRunning) return false;

    // Assistir posição continuamente a cada 2 segundos (distanceInterval: 0 para continuar mesmo parado)
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 2000,
        distanceInterval: 0,
      },
      (loc) => {
        processLocationTick(loc);
      }
    );
    if (!isEngineRunning) {
      sub.remove();
      return false;
    }
    locationSubscription = sub;

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    heartbeatInterval = setInterval(() => {
      if (isEngineRunning && lastKnownLocation) {
        processLocationTick({ coords: lastKnownLocation });
      }
    }, 10000);

    notifyListeners(getTrackingEngineState());
    return true;
  } catch (err) {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
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
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  // deliveryTimers: cancela todos os timers pendentes em memória ao parar
  for (const timer of deliveryTimers.values()) {
    clearTimeout(timer);
  }
  deliveryTimers.clear();
  arrivalTracking.clear();

  isEngineRunning = false;
  notifyListeners(getTrackingEngineState());

  // Zera dados ao vivo no banco imediatamente
  killSwitchTracking();
}
