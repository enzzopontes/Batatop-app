import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { AdminDashboardSkeleton } from '../../components/Skeleton';
import { ThemedAlertHost } from '../../components/ThemedAlert';
import { getEffectiveSession, subscribeAuthUiChange } from '../../utils/authSession';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';
import { COLORS } from '../../constants/theme';
import { supabase } from '../../supabaseConfig';

export default function AdminLayout() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const authCheckSeqRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const seq = ++authCheckSeqRef.current;
      const session = await getEffectiveSession();
      if (!mounted || seq !== authCheckSeqRef.current) return;
      const user = session?.user;
      if (!user) {
        setAuthorized(false);
        router.replace('/');
        return;
      }
      const isInstant = isAdminUser(user);
      let isDb = false;
      if (!isInstant) {
        isDb = await checkIsAdmin(user.id);
        if (!mounted || seq !== authCheckSeqRef.current) return;
      }
      if (!isInstant && !isDb) {
        setAuthorized(false);
        router.replace('/');
        return;
      }
      setAuthorized(true);
    }
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        authCheckSeqRef.current += 1;
        setAuthorized(false);
        router.replace('/');
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED') {
        checkAuth();
      }
    });
    const unsubAuthUi = subscribeAuthUiChange(() => {
      if (!mounted) return;
      checkAuth();
    });
    return () => {
      mounted = false;
      authCheckSeqRef.current += 1;
      subscription?.unsubscribe();
      unsubAuthUi?.();
    };
  }, [router]);

  if (!authorized) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.backgroundElevated }}>
        <AdminDashboardSkeleton />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.backgroundElevated }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: COLORS.backgroundElevated },
        }}
      />
      <ThemedAlertHost />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundElevated,
  },
});
