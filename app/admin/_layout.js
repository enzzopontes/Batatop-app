import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { getEffectiveSession } from '../../utils/authSession';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';
import { COLORS } from '../../constants/theme';

export default function AdminLayout() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const session = await getEffectiveSession();
      const user = session?.user;
      if (!user) {
        if (mounted) router.replace('/');
        return;
      }
      const isInstant = isAdminUser(user);
      let isDb = false;
      if (!isInstant) {
        isDb = await checkIsAdmin(user.id);
      }
      if (!isInstant && !isDb) {
        if (mounted) router.replace('/');
        return;
      }
      if (mounted) setAuthorized(true);
    }
    checkAuth();
    return () => {
      mounted = false;
    };
  }, [router]);

  if (!authorized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.backgroundElevated },
      }}
    />
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
