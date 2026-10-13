import { supabase } from '../supabaseConfig';
import { getEffectiveSession } from './authSession';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

/**
 * Dispara push notification para todos os admins registrados.
 * Tenta Edge Function do Supabase; se falhar, usa API Vercel.
 */
export async function notifyAdminNewOrder(orderId) {
  if (!orderId) return;

  try {
    const { data, error } = await supabase.functions.invoke('notify-admin-order', {
      body: { orderId },
    });

    if (!error && data?.success !== false) return;
    if (error) console.warn('[notify] edge function:', error.message);
  } catch (e) {
    console.warn('[notify] edge function error:', e?.message || e);
  }

  if (!API_BASE_URL) return;

  try {
    const session = await getEffectiveSession();
    const token = session?.access_token;
    const response = await fetch(`${API_BASE_URL}/api/notify-new-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ orderId }),
    });

    if (!response.ok) {
      console.warn('[notify] vercel api status:', response.status);
    }
  } catch (e) {
    console.warn('[notify] vercel api error:', e?.message || e);
  }
}
