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
      const session = await getEffectiveSession();
      if (!mounted || !session?.user) return;
      const isInstant = isAdminUser(session.user);
      let isDb = false;
      if (!isInstant) {
        isDb = await checkIsAdmin(session.user.id);
      }
      if (!isInstant && !isDb) return;

      const token = await syncAdminPushRegistration(session.user);
      if (mounted) pushTokenRef.current = token;
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
