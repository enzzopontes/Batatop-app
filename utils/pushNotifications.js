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
          shouldShowAlert: false,
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }
  }

  return notificationsModule;
}

export async function safeGetNotificationPermissions() {
  if (!isAdminPushAvailable) {
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
  if (!isAdminPushAvailable) {
    return { status: 'undetermined' };
  }
  try {
    const Notifications = await import('expo-notifications');
    return await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowAnnouncements: true,
      },
    });
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

  if (!userId) {
    console.warn('[push] registerForAdminPushNotifications chamado sem userId');
    return null;
  }

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    await setupAndroidChannel();

    const perm = await Notifications.getPermissionsAsync();
    let finalStatus = perm.status;

    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
      });
      finalStatus = requested.status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[push] Permissão nativa POST_NOTIFICATIONS negada ou cancelada pelo usuário');
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
      console.warn('[push] ExpoPushToken vazio retornado pela Expo API');
      return null;
    }

    const deviceName = Device.modelName || Device.deviceName || `${Platform.OS} device`;

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
      console.error('[push] Erro ao persistir token em admin_push_tokens:', error.message);
    } else if (__DEV__) {
      console.log('[push] Token admin registrado com sucesso no Supabase:', expoPushToken);
    }

    return expoPushToken;
  } catch (e) {
    console.error('[push] Falha na rotina de registro do push admin:', e?.message || e);
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
