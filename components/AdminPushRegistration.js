import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';

import { supabase } from '../supabaseConfig';
import { getEffectiveSession, subscribeAuthUiChange } from '../utils/authSession';
import { isAdminUser, checkIsAdmin } from '../utils/isAdmin';
import {
  setupAdminNotificationListeners,
  syncAdminPushRegistration,
} from '../utils/pushNotifications';

/**
 * Registra push token do admin e escuta toque na notificação do sistema.
 */
export default function AdminPushRegistration() {
  const router = useRouter();
  const pushTokenRef = useRef(null);

  useEffect(() => setupAdminNotificationListeners(router), [router]);

  useEffect(() => {
    let mounted = true;

    async function tryRegister() {
      try {
        const session = await getEffectiveSession();
        if (!mounted || !session?.user) return;
        const isInstant = isAdminUser(session.user);
        let isDb = false;
        if (!isInstant) {
          isDb = await checkIsAdmin(session.user.id);
        }
        if (isInstant || isDb) {
          const token = await syncAdminPushRegistration(session.user);
          if (mounted && token) {
            pushTokenRef.current = token;
          }
        }
        // Registra SEMPRE em user_push_tokens para receber push de status de pedido como cliente
        const { registerForUserPushNotifications } = await import('../utils/userPushNotifications');
        await registerForUserPushNotifications(session.user.id);
      } catch (err) {
        console.warn('[AdminPushRegistration] Falha no tryRegister:', err?.message || err);
      }
    }

    tryRegister();

    const unsubscribeUi = subscribeAuthUiChange(() => {
      tryRegister();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      tryRegister();
    });

    return () => {
      mounted = false;
      unsubscribeUi();
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
