import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabaseConfig';
import { isAdminUser, checkIsAdmin } from '../../utils/isAdmin';

export default function AdminLayout() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
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

  if (!authorized) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
