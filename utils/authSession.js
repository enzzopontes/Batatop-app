import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseConfig';

// Precisa ser IGUAL em profile.js e AuthBottomSheet.tsx.
// Por que existe: nenhum scope de supabase.auth.signOut() (nem 'local')
// deixa a sessão atual viva no servidor — TODOS revogam o refresh token
// da sessão atual, só muda se as OUTRAS sessões também são derrubadas.
// Então "Sim, lembrar minha conta" nunca chama signOut de verdade; ele só
// liga essa flag, e a UI passa a fingir deslogado enquanto a sessão real
// do Supabase continua ativa (e se renovando sozinha via autoRefreshToken).
export const SOFT_LOGOUT_KEY = '@batatatop:softLoggedOut';

// Pub/sub simples em memória. Necessário porque ligar/desligar o
// SOFT_LOGOUT_KEY não passa pelo supabase.auth.onAuthStateChange (a sessão
// real não muda nesse fluxo) — sem isso, telas que já estão montadas hà
// tempo (o _layout.js raiz, por exemplo, nunca desmonta) não saberiam que
// precisam reconferir o estado de login depois de um "Sim, lembrar" ou
// "Continuar como".
const listeners = new Set();

export function subscribeAuthUiChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitAuthUiChange() {
  listeners.forEach((fn) => fn());
}

// Sessão "efetiva" pra decisões de UI (mostrar como logado ou não).
// Retorna null se o soft-logout estiver ligado, mesmo com sessão real ativa.
export async function getEffectiveSession() {
  const soft = await AsyncStorage.getItem(SOFT_LOGOUT_KEY);
  if (soft === 'true') return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Auto-refresh: se o token já expirou ou vence em menos de 60s, renova silenciosamente
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60000) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      if (!error && refreshed?.session) {
        return refreshed.session;
      }
    } catch (e) {
      console.warn('Falha ao auto-renovar sessão:', e);
    }
  }

  return session;
}

// Listener central: desliga o soft-logout sozinho sempre que um login DE
// VERDADE acontece (SIGNED_IN), não importa por onde (email, telefone,
// google, etc). Sem isso, a flag ligada por "Sim, lembrar" fica presa em
// 'true' pra sempre, mesmo depois do usuário logar de novo — e telas como
// profile.js, que checam a flag antes de tudo, continuam mostrando
// deslogado mesmo com sessão real ativa.
// Chamar UMA VEZ no _layout.js raiz (fora de qualquer condição).
let listenerInitialized = false;

export function initAuthStateListener() {
  if (listenerInitialized) return;
  listenerInitialized = true;

  // O primeiro evento após assinar é sempre a reidratação da sessão do
  // AsyncStorage no cold start, não um login real — precisa ser ignorado.
  let isInitialEvent = true;

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (isInitialEvent) {
      isInitialEvent = false;
      return;
    }

      if (event === 'SIGNED_IN' && session) {
      const soft = await AsyncStorage.getItem(SOFT_LOGOUT_KEY);
      if (soft === 'true') {
        await AsyncStorage.setItem(SOFT_LOGOUT_KEY, 'false');
        emitAuthUiChange();
      }
    }
  });
}
