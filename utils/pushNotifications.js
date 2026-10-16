import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

import { supabase } from '../supabaseConfig';
import { isAdminUser, checkIsAdmin } from './isAdmin';
import { playNewOrderSound } from './notificationSound';

export const ADMIN_ORDERS_CHANNEL_ID = 'new-orders';

/** Push remoto no Android não funciona no Expo Go (SDK 53+). */
export const isAdminPushAvailable = !(isRunningInExpoGo() && Platform.OS === 'android');

let notificationsModule = null;
let handlerConfigured = false;

async function getNotifications() {
  if (!isAdminPushAvailable) return null;

  if (!notificationsModule) {
    notificationsModule = await import('expo-notifications');

    if (!handlerConfigured) {
      notificationsModule.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
      handlerConfigured = true;
    }
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

export async function safeRequestNotificationPermissions() {
  if (isRunningInExpoGo() && Platform.OS === 'android') {
    return { status: 'undetermined' };
  }
  try {
    const Notifications = await import('expo-notifications');
    return await Notifications.requestPermissionsAsync();
  } catch (e) {
    return { status: 'undetermined' };
  }
}

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;

  const Notifications = await getNotifications();
  if (!Notifications) return;

  await Notifications.setNotificationChannelAsync(ADMIN_ORDERS_CHANNEL_ID, {
    name: 'Novos Pedidos',
    description: 'Alertas quando um cliente faz um pedido',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 300, 200, 300],
    lightColor: '#FFB800',
    sound: 'new_order.mp3',
    enableVibrate: true,
    showBadge: true,
  });
}

export async function registerForAdminPushNotifications(userId) {
  if (!isAdminPushAvailable) {
    if (__DEV__) {
      console.info('[push] Push remoto indisponível no Expo Go (Android). Use development build.');
    }
    return null;
  }

  if (!userId) return null;

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    await setupAndroidChannel();

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[push] Permissão de notificação negada');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    let tokenResponse = null;
    try {
      tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();
    } catch (tokenErr) {
      console.warn('[push] Erro ao obter ExpoPushToken:', tokenErr?.message || tokenErr);
    }

    const expoPushToken = tokenResponse?.data;
    if (!expoPushToken) {
      console.warn('[push] ExpoPushToken vazio');
      return null;
    }

    const deviceName = Device.modelName || `${Platform.OS} device`;

    const { error } = await supabase
      .from('admin_push_tokens')
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
      console.warn('[push] Erro ao salvar token:', error.message);
    }

    return expoPushToken;
  } catch (e) {
    console.warn('[push] Falha ao registrar:', e?.message || e);
    return null;
  }
}


export async function unregisterAdminPushToken(userId, expoPushToken) {
  if (!userId || !expoPushToken) return;
  await supabase
    .from('admin_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('expo_push_token', expoPushToken);
}

export async function syncAdminPushRegistration(user) {
  if (!user) return null;
  const isInstant = isAdminUser(user);
  let isDb = false;
  if (!isInstant) {
    isDb = await checkIsAdmin(user.id);
  }
  if (!isInstant && !isDb) return null;
  return registerForAdminPushNotifications(user.id);
}

export function setupAdminNotificationListeners(router) {
  if (!isAdminPushAvailable) return () => {};

  let cleanup = () => {};
  let cancelled = false;

  getNotifications().then((Notifications) => {
    if (cancelled || !Notifications) return;

    const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const screen = notification.request.content.data?.screen;
      if (screen === 'admin/pedidos') {
        playNewOrderSound(2);
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.screen === 'admin/pedidos' || data?.url === '/admin/pedidos') {
        router.push('/admin/pedidos');
      }
    });

    cleanup = () => {
      receivedSub.remove();
      responseSub.remove();
    };
  });

  return () => {
    cancelled = true;
    cleanup();
  };
}
