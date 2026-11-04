import { supabase } from '../supabaseConfig';

/**
 * Verificação de privilégio administrativo no APP.
 * PoLP: Nunca expor e-mails em claro nem conceder privilégio por correspondência estática no bundle.
 * Apenas roles autenticadas pelo Supabase (app_metadata assinado por token JWT ou query a profiles.role)
 * são aceitas como autoridade.
 */
export function isAdminUser(user) {
  if (!user) return false;
  return user?.app_metadata?.role === 'admin';
}

export async function checkIsAdmin(userId) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      return data.role === 'admin';
    }
  } catch (e) {
    console.error('[isAdmin] Erro ao verificar role de admin no banco:', e);
  }
  return false;
}
