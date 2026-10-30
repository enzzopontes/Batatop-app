import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseConfig';
import { LargeSecureStore } from './largeSecureStore';
import {
  ensureLegacyMigration,
  LEGACY_SOFT_LOGOUT_KEY,
  SAVED_USER_KEY,
} from './legacyMigration';

export { SAVED_USER_KEY };

const listeners = new Set();
let listenerInitialized = false;

export function subscribeAuthUiChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitAuthUiChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[authSession] Erro em listener de auth:', e);
    }
  });
}

/**
 * Gate de Inicialização:
 * Delega diretamente para a migração em memória isolada e síncrona/sem-rede.
 */
export function ensureAuthReady() {
  return ensureLegacyMigration();
}

/**
 * Obtém a sessão ativa.
 * C2: Retorna null imediatamente se a flag legada de soft-logout for 'true' (belt-and-braces).
 * Aguarda a migração terminar antes de ler a sessão.
 * Se estiver prestes a expirar (<60s), faz auto-refresh silencioso.
 */
export async function getEffectiveSession() {
  await ensureAuthReady();

  try {
    const soft = await AsyncStorage.getItem(LEGACY_SOFT_LOGOUT_KEY);
    if (soft === 'true') {
      return null;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60000) {
      try {
        const { data: refreshed, error } = await supabase.auth.refreshSession();
        if (!error && refreshed?.session) {
          return refreshed.session;
        }
      } catch (e) {
        console.warn('[authSession] Falha ao renovar sessão:', e);
      }
    }

    return session;
  } catch (err) {
    console.error('[authSession] Erro ao obter sessão:', err);
    return null;
  }
}

/**
 * Encerramento de sessão seguro e unificado.
 *
 * Parâmetros:
 * - rememberUser = true ("Lembrar minha conta"):
 *   Grava savedUser mínimo ({ name, email, provider }, sem phone) e executa signOut({ scope: 'local' }).
 * - rememberUser = false ("Esquecer conta" / Excluir conta):
 *   Remove savedUser e executa signOut({ scope: 'global' }).
 *
 * Critério de sucesso:
 * - sucesso = getSession() nulo ao final (após contingência LargeSecureStore),
 *   independente de falha de transporte no signOut do Supabase.
 * - detecção offline: error?.name === 'AuthRetryableFetchError' || error?.status === 0 (sem regex).
 * - "Esquecer conta" offline: retorna { success: true, offline: true, globalRevoked: false }.
 */
export async function performLogout(rememberUser = false) {
  const storageKey = supabase.auth?.storageKey || 'sb-eucwoxjmjfqylyrqunwk-auth-token';
  let signOutError = null;

  try {
    if (rememberUser) {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (user) {
        const email = user.email || '';
        let name = user.user_metadata?.full_name || user.user_metadata?.name;
        if (!name) {
          name = email ? email.split('@')[0] : 'Cliente';
        }

        let provider = null;
        const existingSavedRaw = await AsyncStorage.getItem(SAVED_USER_KEY);
        if (existingSavedRaw) {
          try {
            const parsed = JSON.parse(existingSavedRaw);
            if (parsed.provider) provider = parsed.provider;
          } catch {}
        }
        if (!provider) {
          provider = user.app_metadata?.provider || (email ? 'email' : 'phone');
        }

        const minimalUserData = { name, email, provider };
        await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(minimalUserData));
      }

      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) signOutError = error;
      } catch (e) {
        signOutError = e;
      }
    } else {
      await AsyncStorage.removeItem(SAVED_USER_KEY);
      try {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) signOutError = error;
      } catch (e) {
        signOutError = e;
      }
    }

    // Confirmação pós-signOut com getSession() e contingência
    let { data: verifyData } = await supabase.auth.getSession();
    if (verifyData?.session) {
      await LargeSecureStore.removeItem(storageKey);
      const { data: recheckData } = await supabase.auth.getSession();
      verifyData = recheckData;
    }

    const sessionCleared = !verifyData?.session;
    const isOffline = !!(
      signOutError?.name === 'AuthRetryableFetchError' ||
      signOutError?.status === 0
    );

    if (sessionCleared) {
      if (isOffline) {
        return {
          success: true,
          offline: true,
          globalRevoked: false,
          error: signOutError?.message,
        };
      }
      return {
        success: true,
        offline: false,
        globalRevoked: !rememberUser,
      };
    }

    return {
      success: false,
      offline: isOffline,
      globalRevoked: false,
      error: signOutError?.message || 'Falha ao encerrar sessão localmente',
    };
  } catch (err) {
    console.error('[authSession] Erro crítico durante logout:', err);
    await LargeSecureStore.removeItem(storageKey).catch(() => {});
    const isOffline = !!(err?.name === 'AuthRetryableFetchError' || err?.status === 0);
    const { data: finalCheck } = await supabase.auth.getSession();
    if (!finalCheck?.session) {
      return {
        success: true,
        offline: isOffline,
        globalRevoked: false,
        error: err?.message,
      };
    }
    return {
      success: false,
      offline: isOffline,
      globalRevoked: false,
      error: err?.message,
    };
  } finally {
    emitAuthUiChange();
  }
}

export async function initAuthStateListener() {
  if (listenerInitialized) return;
  listenerInitialized = true;

  await ensureAuthReady();

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      emitAuthUiChange();
    }
  });
}
