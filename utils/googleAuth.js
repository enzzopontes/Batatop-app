import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseConfig';
import { SOFT_LOGOUT_KEY, emitAuthUiChange } from './authSession';

WebBrowser.maybeCompleteAuthSession();

const SAVED_USER_KEY = '@batatatop:savedUser';

/**
 * Extrai parâmetros retornados na URL após o redirecionamento OAuth.
 * Lida tanto com fragments (#access_token=...&refresh_token=...) quanto com query (?code=...).
 */
function extractParamsFromUrl(url) {
  const params = {};
  if (!url) return params;

  // 1. Fragment (#access_token=...&refresh_token=...)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hash = url.substring(hashIndex + 1);
    const searchParams = new URLSearchParams(hash);
    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }
  }

  // 2. Query string (?code=... ou ?error=...)
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const end = hashIndex !== -1 ? hashIndex : undefined;
    const query = url.substring(queryIndex + 1, end);
    const searchParams = new URLSearchParams(query);
    for (const [key, value] of searchParams.entries()) {
      if (!params[key]) {
        params[key] = value;
      }
    }
  }

  return params;
}

/**
 * Executa o fluxo de login social via Browser OAuth (Google ou Facebook).
 * Respeita o padrão de soft-logout (seção 11 do CLAUDE.md) e persiste savedUser.
 */
export async function signInWithSocial(provider = 'google') {
  try {
    // No Expo Go: exp://.../--/auth/callback
    // No Dev Build/Produção: batatatop://auth/callback
    const redirectUrl = Linking.createURL('auth/callback', { scheme: 'batatatop' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('❌ [GoogleAuth] Erro signInWithOAuth:', error);
      throw error;
    }
    if (!data?.url) throw new Error('Não foi possível obter a URL de autorização do Google.');

    console.log('🌐 [GoogleAuth] Abrindo navegador com URL Supabase:', data.url);
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
    console.log('📥 [GoogleAuth] Retorno do WebBrowser:', result);

    if (result.type !== 'success' || !result.url) {
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { success: false, cancelled: true };
      }
      return { success: false, error: 'Autenticação cancelada ou não concluída.' };
    }

    const params = extractParamsFromUrl(result.url);
    console.log('🔑 [GoogleAuth] Parâmetros extraídos da URL:', {
      hasCode: !!params.code,
      hasAccessToken: !!params.access_token,
      error: params.error || params.error_description,
    });

    if (params.error_description || params.error) {
      throw new Error(params.error_description || params.error || 'Erro na autenticação.');
    }

    let session = null;

    if (params.code) {
      const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(params.code);
      if (codeError) throw codeError;
      session = codeData.session;
    } else if (params.access_token && params.refresh_token) {
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      });
      if (sessionError) throw sessionError;
      session = sessionData.session;
    } else {
      // Fallback
      const { data: currentSession } = await supabase.auth.getSession();
      session = currentSession.session;
    }

    if (!session?.user) {
      throw new Error('Sessão não identificada após o login.');
    }

    // Desliga soft-logout e notifica a UI (seção 11 do CLAUDE.md)
    await AsyncStorage.setItem(SOFT_LOGOUT_KEY, 'false');
    emitAuthUiChange();

    // Persiste dados para "Continuar como [nome]"
    const user = session.user;
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Cliente';
    const email = user.email || '';

    let phone = user.phone || user.user_metadata?.phone || '';
    if (!phone && user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('telefone')
        .eq('id', user.id)
        .maybeSingle();
      phone = profile?.telefone || '';
    }

    await AsyncStorage.setItem(
      SAVED_USER_KEY,
      JSON.stringify({
        name,
        email,
        phone,
      })
    );

    return { success: true, user: session.user };
  } catch (err) {
    console.error(`Erro em signInWithSocial (${provider}):`, err);
    return {
      success: false,
      error: err.message || `Falha ao autenticar com ${provider}. Tente novamente.`,
    };
  }
}

export const signInWithGoogle = () => signInWithSocial('google');
export const signInWithFacebook = () => signInWithSocial('facebook');

