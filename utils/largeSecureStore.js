import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { ensureLegacyMigration } from './legacyMigration';

const ENCRYPTION_KEY_NAME = 'batatatop_secure_aes_gcm_key';
let keyPromise = null;

// Fila de operações por chave para garantir execução estritamente sequencial (FIFO)
// e evitar concorrência entre leitura/escrita (ex: refresh de token vs render de tela).
const keyLocks = new Map();

function withKeyLock(key, operation) {
  const previous = keyLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  keyLocks.set(key, current);
  current.finally(() => {
    if (keyLocks.get(key) === current) {
      keyLocks.delete(key);
    }
  });
  return current;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Conversão UTF-8 pura em JavaScript:
 * Não depende de TextEncoder/TextDecoder globais no runtime Hermes/JSC.
 * Protegido contra bytes truncados, loops infinitos e sequências inválidas.
 */
export function stringToUtf8Bytes(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = (cp - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

export function utf8BytesToString(bytes) {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      str += String.fromCharCode(b1);
    } else if ((b1 >> 5) === 0x06) {
      if (i >= bytes.length) {
        str += '\uFFFD';
        break;
      }
      const b2 = bytes[i++];
      if ((b2 & 0xc0) !== 0x80) {
        str += '\uFFFD';
        continue;
      }
      str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
    } else if ((b1 >> 4) === 0x0e) {
      if (i + 1 >= bytes.length) {
        str += '\uFFFD';
        break;
      }
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) {
        str += '\uFFFD';
        continue;
      }
      str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
    } else if ((b1 >> 3) === 0x1e) {
      if (i + 2 >= bytes.length) {
        str += '\uFFFD';
        break;
      }
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      if ((b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80 || (b4 & 0xc0) !== 0x80) {
        str += '\uFFFD';
        continue;
      }
      let cp = (((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f)) - 0x10000;
      if (cp >= 0 && cp <= 0xfffff) {
        str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else {
        str += '\uFFFD';
      }
    } else {
      str += '\uFFFD';
    }
  }
  return str;
}

/**
 * Obtém ou inicializa a chave AES-256 (32 bytes) no SecureStore.
 * - Leitura limpa sem chave + payloads órfãos (enc_*): limpa órfãos e gera nova chave.
 * - Erro de hardware/transitório no SecureStore: NÃO limpa nada, não gera chave e não persiste null em cache.
 */
export function getOrCreateEncryptionKey() {
  if (keyPromise) return keyPromise;

  keyPromise = (async () => {
    if (Platform.OS === 'web') return null;

    const options = {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    };

    let keyHex = null;
    try {
      keyHex = await SecureStore.getItemAsync(ENCRYPTION_KEY_NAME, options);
    } catch (hardwareErr) {
      console.warn('[LargeSecureStore] Falha temporária no hardware/SecureStore:', hardwareErr?.message || hardwareErr);
      keyPromise = null;
      return null;
    }

    if (!keyHex) {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const orphanKeys = allKeys.filter((k) => k.startsWith('enc_'));

        if (orphanKeys.length > 0) {
          console.warn(`[LargeSecureStore] Chave ausente no SecureStore. Removendo ${orphanKeys.length} payload(s) órfão(s) e inicializando nova chave.`);
          await AsyncStorage.multiRemove(orphanKeys);
        }

        const rawKey = Crypto.getRandomBytes(32);
        keyHex = bytesToHex(rawKey);
        await SecureStore.setItemAsync(ENCRYPTION_KEY_NAME, keyHex, options);
      } catch (err) {
        console.error('[LargeSecureStore] Falha ao gerar/salvar nova chave no SecureStore:', err);
        keyPromise = null;
        return null;
      }
    }

    return hexToBytes(keyHex);
  })();

  return keyPromise;
}

export function resetKeyCacheForTesting() {
  keyPromise = null;
}

/**
 * Adapter LargeSecureStore com AEAD (AES-256-GCM):
 * - Plataforma Web: AsyncStorage direto.
 * - Mobile: AES-GCM com nonce de 12 bytes gerado via Crypto.getRandomBytes.
 * - Suporta strings puras (ex: PKCE code-verifier do Supabase) e JSON.
 * - Serialização de acessos concorrentes via fila por chave.
 */
export const LargeSecureStore = {
  getItem(key) {
    return withKeyLock(key, async () => {
      await ensureLegacyMigration();

      if (Platform.OS === 'web') {
        return AsyncStorage.getItem(key);
      }

      try {
        const storedPayload = await AsyncStorage.getItem(`enc_${key}`);
        if (storedPayload) {
          const aesKey = await getOrCreateEncryptionKey();
          if (!aesKey) {
            return null;
          }

          // Payload mínimo: 24 hex (12 bytes nonce) + 32 hex (16 bytes auth tag GCM)
          if (storedPayload.length < 56) {
            console.warn(`[LargeSecureStore] Payload de '${key}' corrompido em disco. Removendo.`);
            await AsyncStorage.multiRemove([`enc_${key}`, key]).catch(() => {});
            return null;
          }

          const ivHex = storedPayload.slice(0, 24);
          const cipherHex = storedPayload.slice(24);

          const nonce = hexToBytes(ivHex);
          const ciphertext = hexToBytes(cipherHex);

          try {
            const aad = stringToUtf8Bytes(key);
            const cipher = gcm(aesKey, nonce, aad);
            const decryptedBytes = cipher.decrypt(ciphertext);
            return utf8BytesToString(decryptedBytes);
          } catch {
            console.warn(`[LargeSecureStore] Falha de autenticação GCM na chave '${key}'. Payload adulterado.`);
            await AsyncStorage.multiRemove([`enc_${key}`, key]).catch(() => {});
            return null;
          }
        }

        // Migração Segura de sessão legada em texto puro
        const legacyRaw = await AsyncStorage.getItem(key);
        if (legacyRaw) {
          try {
            JSON.parse(legacyRaw);
          } catch {
            await AsyncStorage.removeItem(key);
            return null;
          }

          const aesKey = await getOrCreateEncryptionKey();
          if (aesKey) {
            try {
              const nonce = Crypto.getRandomBytes(12);
              const textBytes = stringToUtf8Bytes(legacyRaw);
              const aad = stringToUtf8Bytes(key);
              const cipher = gcm(aesKey, nonce, aad);
              const ciphertext = cipher.encrypt(textBytes);

              const ivHex = bytesToHex(nonce);
              const cipherHex = bytesToHex(ciphertext);

              await AsyncStorage.setItem(`enc_${key}`, `${ivHex}${cipherHex}`);

              // Verificação em disco antes de remover texto puro
              const verifyPayload = await AsyncStorage.getItem(`enc_${key}`);
              if (verifyPayload) {
                const vNonce = hexToBytes(verifyPayload.slice(0, 24));
                const vCiphertext = hexToBytes(verifyPayload.slice(24));
                const vDecrypted = utf8BytesToString(gcm(aesKey, vNonce, aad).decrypt(vCiphertext));

                if (vDecrypted === legacyRaw) {
                  await AsyncStorage.removeItem(key);
                  console.log(`[LargeSecureStore] Sessão legada '${key}' migrada com sucesso.`);
                }
              }
            } catch (migrErr) {
              console.warn('[LargeSecureStore] Falha na migração da chave. Texto puro mantido:', migrErr);
            }
          }

          return legacyRaw;
        }

        return null;
      } catch (err) {
        console.warn(`[LargeSecureStore] Falha ao ler '${key}':`, err?.message || err);
        return null;
      }
    });
  },

  setItem(key, value) {
    return withKeyLock(key, async () => {
      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(key, value);
        return true;
      }

      try {
        const aesKey = await getOrCreateEncryptionKey();
        if (!aesKey) {
          await AsyncStorage.removeItem(`enc_${key}`).catch(() => {});
          return false;
        }

        const nonce = Crypto.getRandomBytes(12);
        const textBytes = stringToUtf8Bytes(value);
        const aad = stringToUtf8Bytes(key);

        const cipher = gcm(aesKey, nonce, aad);
        const ciphertext = cipher.encrypt(textBytes);

        const ivHex = bytesToHex(nonce);
        const cipherHex = bytesToHex(ciphertext);

        await AsyncStorage.setItem(`enc_${key}`, `${ivHex}${cipherHex}`);
        return true;
      } catch (err) {
        console.error(`[LargeSecureStore] Falha ao salvar '${key}'. Limpando payload:`, err);
        await AsyncStorage.removeItem(`enc_${key}`).catch(() => {});
        return false;
      }
    });
  },

  removeItem(key) {
    return withKeyLock(key, async () => {
      if (Platform.OS === 'web') {
        return AsyncStorage.removeItem(key);
      }
      await AsyncStorage.multiRemove([`enc_${key}`, key]).catch(() => {});
    });
  },
};
