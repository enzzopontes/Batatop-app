import { supabase } from '../supabaseConfig';

export const ADMIN_EMAILS = ['enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com'];
 
 export function isAdminUser(user) {
   if (!user) return false;
   if (user?.app_metadata?.role === 'admin') return true;
   const email = (user?.email || '').toLowerCase().trim();
   return ADMIN_EMAILS.includes(email);
 }
 
 export async function checkIsAdmin(userId) {
   if (!userId) return false;
   try {
     const { data, error } = await supabase
       .from('profiles')
       .select('role, email')
       .eq('id', userId)
       .maybeSingle();
 
     if (!error && data) {
       if (data.role === 'admin') return true;
       if (data.email && ADMIN_EMAILS.includes(data.email.toLowerCase().trim())) return true;
     }
   } catch (e) {
     console.error('[isAdmin] Erro ao verificar role de admin no banco:', e);
   }
   return false;
 }
