import { supabase } from '../supabaseConfig';

export function isAdminUser(user) {
  return user?.app_metadata?.role === 'admin';
}

export async function checkIsAdmin(userId) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (!error && data?.role === 'admin') {
      return true;
    }
  } catch (e) {
    console.error('Erro ao verificar role de admin no banco:', e);
  }
  return false;
}
