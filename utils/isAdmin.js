import { supabase } from '../supabaseConfig';

export function isAdminUser(user) {
  if (!user) return false;
  return (
    user.email === 'enzzobaraldo2008@gmail.com' ||
    user.email === 'maraysis9010@gmail.com' ||
    user.app_metadata?.role === 'admin'
  );
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
