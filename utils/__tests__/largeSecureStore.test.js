import crypto from 'crypto';

// In-memory mocks with 'mock' prefix for Jest scoping
const mockAsyncStorageStore = new Map();
let mockAsyncStorageFailSet = false;

const mockAsyncStorage = {
  getItem: jest.fn(async (key) => (mockAsyncStorageStore.has(key) ? mockAsyncStorageStore.get(key) : null)),
  setItem: jest.fn(async (key, val) => {
    if (mockAsyncStorageFailSet) {
      throw new Error('Disk full / write failure');
    }
    mockAsyncStorageStore.set(key, String(val));
  }),
  removeItem: jest.fn(async (key) => {
    mockAsyncStorageStore.delete(key);
  }),
  getAllKeys: jest.fn(async () => Array.from(mockAsyncStorageStore.keys())),
  multiRemove: jest.fn(async (keys) => {
    keys.forEach((k) => mockAsyncStorageStore.delete(k));
  }),
  clear: jest.fn(async () => mockAsyncStorageStore.clear()),
};

const mockSecureStoreMap = new Map();
let mockSecureStoreThrowError = false;
const mockSecureStore = {
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  getItemAsync: jest.fn(async (key) => {
    if (mockSecureStoreThrowError) {
      throw new Error('Keystore hardware busy / locked');
    }
    return mockSecureStoreMap.has(key) ? mockSecureStoreMap.get(key) : null;
  }),
  setItemAsync: jest.fn(async (key, val) => {
    if (mockSecureStoreThrowError) {
      throw new Error('Keystore hardware busy / locked');
    }
    mockSecureStoreMap.set(key, String(val));
  }),
  deleteItemAsync: jest.fn(async (key) => {
    mockSecureStoreMap.delete(key);
  }),
};

const mockExpoCrypto = {
  getRandomBytes: jest.fn((size) => new Uint8Array(crypto.randomBytes(size))),
};

let mockCurrentSession = null;
let mockSignOutError = null;

const STORAGE_KEY = 'sb-eucwoxjmjfqylyrqunwk-auth-token';

const mockSupabase = {
  auth: {
    storageKey: STORAGE_KEY,
    getSession: jest.fn(async () => {
      const stored = await LargeSecureStore.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const session = JSON.parse(stored);
          return { data: { session }, error: null };
        } catch {
          return { data: { session: null }, error: null };
        }
      }
      return { data: { session: mockCurrentSession }, error: null };
    }),
    refreshSession: jest.fn(async () => ({ data: { session: mockCurrentSession }, error: null })),
    signOut: jest.fn(async ({ scope } = {}) => {
      mockCurrentSession = null;
      await LargeSecureStore.removeItem(STORAGE_KEY);
      if (mockSignOutError) {
        return { error: mockSignOutError };
      }
      return { error: null };
    }),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: { full_name: 'Nome Do Profile' }, error: null })),
      })),
    })),
  })),
};

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
jest.mock('expo-secure-store', () => mockSecureStore);
jest.mock('expo-crypto', () => mockExpoCrypto);
jest.mock('../../supabaseConfig', () => ({ supabase: mockSupabase }));

const {
  LargeSecureStore,
  getOrCreateEncryptionKey,
  resetKeyCacheForTesting,
  stringToUtf8Bytes,
  utf8BytesToString,
} = require('../largeSecureStore');

const {
  ensureLegacyMigration,
  _resetMigrationStateForTests,
} = require('../legacyMigration');

const {
  performLogout,
  getEffectiveSession,
  ensureAuthReady,
  SAVED_USER_KEY,
} = require('../authSession');

const EXACT_LITERAL_SOFT_LOGOUT_KEY = '@batatatop:softLoggedOut';

describe('LargeSecureStore & Auth Migration Suite', () => {
  beforeEach(async () => {
    mockAsyncStorageStore.clear();
    mockAsyncStorageFailSet = false;
    mockSecureStoreMap.clear();
    mockSecureStoreThrowError = false;
    mockCurrentSession = null;
    mockSignOutError = null;
    resetKeyCacheForTesting();
    _resetMigrationStateForTests();
    jest.clearAllMocks();
  });

  describe('1. Criptografia, Decifra e Codificação UTF-8', () => {
    test('Conversão UTF-8 com acentos, emojis e estruturas JSON', () => {
      const samples = [
        'Simples texto',
        'Batata Top! 🥔 🍟 ❤️',
        'áéíóú çãõ ñ - Teste UTF8',
        JSON.stringify({ user: 'José', roles: ['admin', 'customer'], nested: { active: true } }),
      ];
      for (const sample of samples) {
        const bytes = stringToUtf8Bytes(sample);
        const decoded = utf8BytesToString(bytes);
        expect(decoded).toBe(sample);
      }
    });

    test('UTF-8 decoder não trava em loop infinito nem lança com bytes truncados/inválidos', () => {
      const malformedCases = [
        new Uint8Array([0xff, 0xff]),
        new Uint8Array([0xc0]),
        new Uint8Array([0xe0, 0x80]),
        new Uint8Array([0xf0, 0x80, 0x80]),
        new Uint8Array([0x80, 0x80, 0x80]),
      ];
      for (const badBytes of malformedCases) {
        expect(() => {
          const res = utf8BytesToString(badBytes);
          expect(typeof res).toBe('string');
        }).not.toThrow();
      }
    });

    test('6. Decoder sem TextDecoder com emoji e caracteres 4-byte ("José 😀" e "𝄞")', () => {
      const originalTextDecoder = global.TextDecoder;
      try {
        delete global.TextDecoder;
        const test1 = 'José 😀';
        const bytes1 = stringToUtf8Bytes(test1);
        expect(utf8BytesToString(bytes1)).toBe(test1);

        const test2 = '𝄞'; // U+1D11E (G-Clef musical symbol, 4 bytes UTF-8)
        const bytes2 = stringToUtf8Bytes(test2);
        expect(utf8BytesToString(bytes2)).toBe(test2);

        // Bytes de continuação corrompidos devem devolver \uFFFD
        const corrupted4Byte = new Uint8Array([0xf0, 0x9f, 0x00, 0x80]);
        expect(utf8BytesToString(corrupted4Byte)).toBe('\uFFFD');
      } finally {
        global.TextDecoder = originalTextDecoder;
      }
    });

    test('Geração de chave, cifra e decifra de dados novos', async () => {
      const key = 'test-token';
      const secretValue = JSON.stringify({ token: 'abc123xyz', expires: 999999 });

      const saved = await LargeSecureStore.setItem(key, secretValue);
      expect(saved).toBe(true);

      expect(mockAsyncStorageStore.has(key)).toBe(false);
      expect(mockAsyncStorageStore.has(`enc_${key}`)).toBe(true);

      const decrypted = await LargeSecureStore.getItem(key);
      expect(decrypted).toBe(secretValue);
    });

    test('Suporte a PKCE code_verifier (string pura sem JSON)', async () => {
      const key = 'code-verifier';
      const rawString = 'abcdef1234567890-very-long-random-pkce-verifier-string';

      await LargeSecureStore.setItem(key, rawString);
      const read = await LargeSecureStore.getItem(key);
      expect(read).toBe(rawString);
    });

    test('Adulteração de 1 byte no ciphertext: retorna null e descarta sem crash', async () => {
      const key = 'byte-tamper-key';
      const value = JSON.stringify({ sensitive: 'critical-auth-data' });
      await LargeSecureStore.setItem(key, value);

      const originalPayload = mockAsyncStorageStore.get(`enc_${key}`);
      const lastChar = originalPayload[originalPayload.length - 1];
      const corruptedLastChar = lastChar === 'a' ? 'b' : 'a';
      const corruptedPayload = originalPayload.slice(0, -1) + corruptedLastChar;

      mockAsyncStorageStore.set(`enc_${key}`, corruptedPayload);

      const result = await LargeSecureStore.getItem(key);
      expect(result).toBeNull();
      expect(mockAsyncStorageStore.has(`enc_${key}`)).toBe(false);
    });

    test('Chave perdida no SecureStore com falha de hardware: getItem falha fechado (retorna null)', async () => {
      const key = 'hardware-fail-key';
      await LargeSecureStore.setItem(key, 'secret');

      resetKeyCacheForTesting();
      mockSecureStoreThrowError = true;

      const result = await LargeSecureStore.getItem(key);
      expect(result).toBeNull();
    });

    test('Nonce único: 10 chamadas a setItem geram nonces de 12 bytes distintos', async () => {
      const key = 'multi-write';
      const nonces = new Set();
      for (let i = 0; i < 10; i++) {
        await LargeSecureStore.setItem(key, `value_${i}`);
        const payload = mockAsyncStorageStore.get(`enc_${key}`);
        const ivHex = payload.slice(0, 24);
        expect(ivHex).toHaveLength(24);
        nonces.add(ivHex);
      }
      expect(nonces.size).toBe(10);
    });

    test('Amarração de AAD à chave de storage: payload de keyA em enc_keyB falha autenticação GCM', async () => {
      const keyA = 'keyA';
      const keyB = 'keyB';
      await LargeSecureStore.setItem(keyA, 'secretA');

      const payloadA = mockAsyncStorageStore.get(`enc_${keyA}`);
      mockAsyncStorageStore.set(`enc_${keyB}`, payloadA);

      const resultB = await LargeSecureStore.getItem(keyB);
      expect(resultB).toBeNull();
      expect(mockAsyncStorageStore.has(`enc_${keyB}`)).toBe(false);
    });

    test('Falha de gravação (AsyncStorage.setItem falha): remove payload e retorna false', async () => {
      mockAsyncStorageFailSet = true;
      const key = 'fail-write-key';
      const result = await LargeSecureStore.setItem(key, 'data');
      expect(result).toBe(false);
      expect(mockAsyncStorageStore.has(`enc_${key}`)).toBe(false);
    });

    test('Ordem de migração legada: com falha de gravação, o texto puro continua intacto', async () => {
      const key = 'legacy-fail-key';
      const rawPayload = JSON.stringify({ old: 'session' });
      mockAsyncStorageStore.set(key, rawPayload);

      mockAsyncStorageFailSet = true;

      const read = await LargeSecureStore.getItem(key);
      expect(read).toBe(rawPayload);
      expect(mockAsyncStorageStore.get(key)).toBe(rawPayload);
    });

    test('Migração Segura com sucesso: só remove texto puro após confirmação em disco', async () => {
      const key = 'legacy-ok-key';
      const rawPayload = JSON.stringify({ ok: 'session' });
      mockAsyncStorageStore.set(key, rawPayload);

      const read = await LargeSecureStore.getItem(key);
      expect(read).toBe(rawPayload);
      expect(mockAsyncStorageStore.has(key)).toBe(false);
      expect(mockAsyncStorageStore.has(`enc_${key}`)).toBe(true);
    });

    test('Chave perdida no SecureStore com enc_ órfãos: limpa órfãos e gera nova chave limpa', async () => {
      mockAsyncStorageStore.set('enc_old_token', 'deadbeefdeadbeefdeadbeefdeadbeef');
      mockAsyncStorageStore.set('other_key', 'plain-data');

      const key = await getOrCreateEncryptionKey();
      expect(key).not.toBeNull();
      expect(mockAsyncStorageStore.has('enc_old_token')).toBe(false);
      expect(mockAsyncStorageStore.has('other_key')).toBe(true);
    });

    test('Erro de hardware transitório no SecureStore: NÃO apaga dados bons e não trava cache', async () => {
      mockAsyncStorageStore.set('enc_good_token', 'somedata');
      mockSecureStoreThrowError = true;

      const key = await getOrCreateEncryptionKey();
      expect(key).toBeNull();
      expect(mockAsyncStorageStore.has('enc_good_token')).toBe(true);

      mockSecureStoreThrowError = false;
      const keyRecovered = await getOrCreateEncryptionKey();
      expect(keyRecovered).not.toBeNull();
    });

    test('Serialização de concorrência: 10 escritas paralelas executam em FIFO sem corromper', async () => {
      const key = 'fifo-concurrency';
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(LargeSecureStore.setItem(key, `write_${i}`));
      }
      const results = await Promise.all(promises);
      expect(results.every((r) => r === true)).toBe(true);

      const finalVal = await LargeSecureStore.getItem(key);
      expect(finalVal).toBe('write_9');
    });

    test('removeItem remove tanto a versão cifrada quanto a legada', async () => {
      const key = 'to-remove';
      mockAsyncStorageStore.set(`enc_${key}`, 'ciphertext');
      mockAsyncStorageStore.set(key, 'plaintext');

      await LargeSecureStore.removeItem(key);
      expect(mockAsyncStorageStore.has(`enc_${key}`)).toBe(false);
      expect(mockAsyncStorageStore.has(key)).toBe(false);
    });
  });

  describe('2. Testes de Migração Obrigatórios', () => {
    test('1. Usuário logado normal (sem flag) com sessão em texto puro: depois de ensureAuthReady a sessão EXISTE e passa a ser cifrada em enc_ e o texto puro some', async () => {
      const plainSession = JSON.stringify({
        access_token: 'valid_access_token',
        user: { id: 'usr_normal', email: 'normal@test.com' },
      });
      mockAsyncStorageStore.set(STORAGE_KEY, plainSession);

      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);

      await ensureAuthReady();

      expect(mockAsyncStorageStore.has(STORAGE_KEY)).toBe(true);

      const session = await LargeSecureStore.getItem(STORAGE_KEY);
      expect(session).toBe(plainSession);

      expect(mockAsyncStorageStore.has(STORAGE_KEY)).toBe(false);
      expect(mockAsyncStorageStore.has(`enc_${STORAGE_KEY}`)).toBe(true);
    });

    test('2. Flag "true" + provider google: savedUser.provider === "google", sessão sumiu, flag removida; e getSession() retorna null', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'true');
      const googleSession = JSON.stringify({
        access_token: 'google_token_123',
        user: {
          id: 'usr_google',
          email: 'user@gmail.com',
          app_metadata: { provider: 'google' },
          user_metadata: { full_name: 'Usuário Google' },
        },
      });
      mockAsyncStorageStore.set(STORAGE_KEY, googleSession);

      await ensureAuthReady();

      const savedUserRaw = mockAsyncStorageStore.get(SAVED_USER_KEY);
      expect(savedUserRaw).toBeDefined();
      const savedUser = JSON.parse(savedUserRaw);
      expect(savedUser.name).toBe('Usuário Google');
      expect(savedUser.email).toBe('user@gmail.com');
      expect(savedUser.provider).toBe('google');
      expect(savedUser.phone).toBeUndefined();

      expect(mockAsyncStorageStore.has(STORAGE_KEY)).toBe(false);
      expect(mockAsyncStorageStore.has(`enc_${STORAGE_KEY}`)).toBe(false);

      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);

      const { data } = await mockSupabase.auth.getSession();
      expect(data.session).toBeNull();
    });

    test('3. Flag "true" + falha ao apagar: getEffectiveSession retorna null', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'true');
      const existingSession = JSON.stringify({
        access_token: 'token_survivor',
        user: { id: 'usr_survivor', email: 'survivor@test.com' },
      });
      mockAsyncStorageStore.set(STORAGE_KEY, existingSession);

      mockAsyncStorage.multiRemove.mockImplementationOnce(async () => {});

      await ensureAuthReady();

      expect(mockAsyncStorageStore.get(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe('true');

      const eff = await getEffectiveSession();
      expect(eff).toBeNull();
    });

    test('4. Boot offline com flag: nenhuma chamada de rede acontece na migração', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'true');
      const session = JSON.stringify({
        access_token: 'offline_token',
        user: { id: 'usr_offline', email: 'offline@test.com' },
      });
      mockAsyncStorageStore.set(STORAGE_KEY, session);

      const fromSpy = jest.spyOn(mockSupabase, 'from');
      const signOutSpy = jest.spyOn(mockSupabase.auth, 'signOut');

      await ensureAuthReady();

      expect(fromSpy).not.toHaveBeenCalled();
      expect(signOutSpy).not.toHaveBeenCalled();
      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);
    });

    test('5. getSession direto (sem getEffectiveSession) aguarda a migração', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'true');
      mockAsyncStorageStore.set(STORAGE_KEY, JSON.stringify({
        access_token: 'direct_call_token',
        user: { email: 'direct@test.com' },
      }));

      const { data } = await mockSupabase.auth.getSession();
      expect(data.session).toBeNull();
      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);
    });

    test('Flag literal ausente: preserva sessão intacta', async () => {
      const session = JSON.stringify({ user: { email: 'preserve@test.com' } });
      mockAsyncStorageStore.set(STORAGE_KEY, session);

      await ensureLegacyMigration();
      expect(mockAsyncStorageStore.get(STORAGE_KEY)).toBe(session);
    });

    test('Flag literal === "false": apaga a flag sem chamar signOut', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'false');
      const signOutSpy = jest.spyOn(mockSupabase.auth, 'signOut');

      await ensureLegacyMigration();
      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);
      expect(signOutSpy).not.toHaveBeenCalled();
    });

    test('SAVED_USER_KEY legado com telefone: telefone é removido e provider preservado', async () => {
      const legacySaved = {
        name: 'Cliente Antigo',
        email: 'antigo@test.com',
        phone: '14999999999',
        provider: 'phone',
      };
      mockAsyncStorageStore.set(SAVED_USER_KEY, JSON.stringify(legacySaved));

      await ensureLegacyMigration();

      const savedRaw = mockAsyncStorageStore.get(SAVED_USER_KEY);
      const sanitized = JSON.parse(savedRaw);
      expect(sanitized.name).toBe('Cliente Antigo');
      expect(sanitized.email).toBe('antigo@test.com');
      expect(sanitized.provider).toBe('phone');
      expect(sanitized.phone).toBeUndefined();
    });

    test('Idempotência: executar ensureLegacyMigration duas vezes produz o mesmo resultado', async () => {
      mockAsyncStorageStore.set(EXACT_LITERAL_SOFT_LOGOUT_KEY, 'true');
      mockAsyncStorageStore.set(STORAGE_KEY, JSON.stringify({ user: { email: 'idemp@test.com' } }));

      await ensureLegacyMigration();
      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);

      _resetMigrationStateForTests();
      await ensureLegacyMigration();
      expect(mockAsyncStorageStore.has(EXACT_LITERAL_SOFT_LOGOUT_KEY)).toBe(false);
    });
  });

  describe('3. Testes de Logout (performLogout)', () => {
    test('7. performLogout offline (fetch rejeita): sessão nula, offline true', async () => {
      mockCurrentSession = {
        access_token: 'sess_to_logout',
        user: { id: 'usr_logout', email: 'logout@test.com' },
      };
      await LargeSecureStore.setItem(STORAGE_KEY, JSON.stringify(mockCurrentSession));

      const networkError = new Error('TypeError: Failed to fetch');
      networkError.name = 'AuthRetryableFetchError';
      mockSignOutError = networkError;

      const res = await performLogout(false);
      expect(res.success).toBe(true);
      expect(res.offline).toBe(true);
      expect(res.globalRevoked).toBe(false);

      const { data } = await mockSupabase.auth.getSession();
      expect(data.session).toBeNull();
    });

    test('performLogout com rememberUser salva savedUser sem phone e chama scope local', async () => {
      mockCurrentSession = {
        access_token: 'local_sess',
        user: {
          id: 'usr_local',
          email: 'local@test.com',
          user_metadata: { full_name: 'Usuário Local' },
        },
      };
      await LargeSecureStore.setItem(STORAGE_KEY, JSON.stringify(mockCurrentSession));

      const res = await performLogout(true);
      expect(res.success).toBe(true);

      const savedRaw = mockAsyncStorageStore.get(SAVED_USER_KEY);
      expect(savedRaw).toBeDefined();
      const saved = JSON.parse(savedRaw);
      expect(saved.name).toBe('Usuário Local');
      expect(saved.email).toBe('local@test.com');
      expect(saved.phone).toBeUndefined();

      const { data } = await mockSupabase.auth.getSession();
      expect(data.session).toBeNull();
    });
  });
});
