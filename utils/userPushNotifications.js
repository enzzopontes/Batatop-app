import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

import { supabase } from '../supabaseConfig';

/**
 * userPushNotifications.js
 *
 * Espelho de utils/pushNotifications.js, mas pra USUÁRIO COMUM (pedidos e
 * promoções), gravando em user_push_tokens. Não mexe em nada do fluxo de
 * admin (admin_push_tokens / notifyNewOrder.js) — são tabelas e funções
 * totalmente separadas de propósito.
 *
 * IMPORTANTE: isso só registra o token e a preferência. O disparo real do
 * push quando um pedido muda de status (edge function tipo a
 * notify-admin-order, só que pro cliente) ainda NÃO existe — é passo
 * seguinte, fora do escopo desta tela.
 */

// Mesma limitação do Expo: push remoto no Android não funciona no Expo Go
// a partir do SDK 53. Reaproveita a mesma checagem do pushNotifications.js.
export const isUserPushAvailable = !(isRunningInExpoGo() && Platform.OS === 'android');

let notificationsModule = null;

async function getNotifications() {
  if (!isUserPushAvailable) return null;
  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');
  }
  return notificationsModule;
}

export async function safeGetNotificationPermissions() {
  if (isRunningInExpoGo() && Platform.OS === 'android') {
    return { status: 'undetermined' };
  }
  try {
    const Notifications = await import('expo-notifications');
    return await Notifications.getPermissionsAsync();
  } catch (e) {
    return { status: 'undetermined' };
  }
}

export async function registerForUserPushNotifications(userId) {
  if (!isUserPushAvailable) {
    if (__DEV__) {
      console.info('[user-push] Indisponível no Expo Go (Android). Use development build.');
    }
    return null;
  }
  if (!userId || !Device.isDevice) return null;

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[user-push] Permissão de notificação negada');
      return { permissionDenied: true };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();

    const expoPushToken = tokenResponse.data;
    if (!expoPushToken) return null;

    const deviceName = Device.modelName || `${Platform.OS} device`;

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: userId,
          expo_push_token: expoPushToken,
          device_name: deviceName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,expo_push_token' },
      );

    if (error) {
      console.warn('[user-push] Erro ao salvar token:', error.message);
      return null;
    }

    return { expoPushToken };
  } catch (e) {
    console.warn('[user-push] Falha ao registrar:', e?.message || e);
    return null;
  }
}

export async function unregisterUserPushTokens(userId) {
  if (!userId) return;
  await supabase.from('user_push_tokens').delete().eq('user_id', userId);
}
