import AsyncStorage from '@react-native-async-storage/async-storage';

export const LEGACY_SOFT_LOGOUT_KEY = '@batatatop:softLoggedOut';
export const SAVED_USER_KEY = '@batatatop:savedUser';

function getStorageKey() {
  const envObj = (typeof process !== 'undefined' ? process['env'] : null) || {};
  const url = envObj['EXPO_PUBLIC_SUPABASE_URL'] || '';
  const hostMatch = String(url).match(/^https?:\/\/([^/:]+)/);
  const hostname = hostMatch ? hostMatch[1] : String(url).split('/')[0] || '';
  const prefix = hostname.split('.')[0] || 'eucwoxjmjfqylyrqunwk';
  return `sb-${prefix}-auth-token`;
}

let migrationPromise = null;

export function ensureLegacyMigration() {
  if (!migrationPromise) {
    migrationPromise = runLegacyMigrationWithTimeout();
  }
  return migrationPromise;
}

export function _resetMigrationStateForTests() {
  migrationPromise = null;
}

async function runLegacyMigrationWithTimeout() {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      console.warn('[legacyMigration] Timeout de 2s atingido. Flag mantida para fail-closed.');
      resolve();
    }, 2000);
  });

  try {
    await Promise.race([_runMigrationLogic(), timeoutPromise]);
  } catch (err) {
    console.error('[legacyMigration] Erro inesperado na migração:', err);
  } finally {
    clearTimeout(timer);
  }
}

async function _runMigrationLogic() {
  const storageKey = getStorageKey();
  const softLogoutVal = await AsyncStorage.getItem(LEGACY_SOFT_LOGOUT_KEY);

  // Sanitiza savedUser caso tenha resíduo de telefone de versões antigas
  const savedUserRaw = await AsyncStorage.getItem(SAVED_USER_KEY);
  let existingSavedUser = null;
  if (savedUserRaw) {
    try {
      existingSavedUser = JSON.parse(savedUserRaw);
      if (existingSavedUser && typeof existingSavedUser === 'object' && 'phone' in existingSavedUser) {
        delete existingSavedUser.phone;
        await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(existingSavedUser));
      }
    } catch {
      // Ignora erro de parse em savedUser corrompido
    }
  }

  // 1. Sem flag ou 'false': NÃO apaga a sessão legada (LargeSecureStore migra sob demanda)
  if (!softLogoutVal || softLogoutVal === 'false') {
    if (softLogoutVal === 'false') {
      await AsyncStorage.removeItem(LEGACY_SOFT_LOGOUT_KEY);
    }
    return;
  }

  // 2. Flag 'true': usuário estava em soft-logout na versão legada
  if (softLogoutVal === 'true') {
    const rawSession = await AsyncStorage.getItem(storageKey);
    if (rawSession) {
      try {
        const sessionObj = JSON.parse(rawSession);
        const user = sessionObj?.user;
        if (user) {
          const email = user.email || '';
          let name = user.user_metadata?.full_name || user.user_metadata?.name;
          if (!name) {
            name = email ? email.split('@')[0] : 'Cliente';
          }

          let provider = existingSavedUser?.provider;
          if (!provider) {
            provider = user.app_metadata?.provider || (email ? 'email' : 'phone');
          }

          const newSavedUser = { name, email, provider };
          await AsyncStorage.setItem(SAVED_USER_KEY, JSON.stringify(newSavedUser));
        }
      } catch {
        // Se a sessão no storage não for JSON válido, segue para expurgo
      }
    }

    // Expurga AsyncStorage[storageKey] E enc_[storageKey]
    await AsyncStorage.multiRemove([storageKey, `enc_${storageKey}`]);

    // Lê de volta para confirmar que sumiu
    const [checkRaw, checkEnc] = await Promise.all([
      AsyncStorage.getItem(storageKey),
      AsyncStorage.getItem(`enc_${storageKey}`),
    ]);

    // Só remove a flag se confirmar que sumiu de ambos
    if (!checkRaw && !checkEnc) {
      await AsyncStorage.removeItem(LEGACY_SOFT_LOGOUT_KEY);
    } else {
      console.error('[legacyMigration] Falha ao confirmar expurgo da sessão legada. Flag mantida.');
    }
  }
}
