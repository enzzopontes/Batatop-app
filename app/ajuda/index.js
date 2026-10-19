import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../constants/theme';
import { HELP_CATEGORIES, getArticleById } from '../../data/helpData';
import { getEffectiveSession } from '../../utils/authSession';
import { requestAuthSheet } from '../../utils/authSheetRequest';

const LAST_ACCESS_KEY = '@batatatop_help_last_access';

export default function HelpIndex() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [lastAccessArticle, setLastAccessArticle] = useState(null);

  useFocusEffect(
    useCallback(() => {
      checkAuthAndLastAccess();
    }, [])
  );

  async function checkAuthAndLastAccess() {
    try {
      const session = await getEffectiveSession();
      setUser(session?.user || null);
    } catch (e) {
      console.error('Erro ao verificar sessão:', e);
    }

    try {
      const raw = await AsyncStorage.getItem(LAST_ACCESS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const article = getArticleById(data.articleId);
        setLastAccessArticle(article || null);
      } else {
        setLastAccessArticle(null);
      }
    } catch (e) {
      console.error('Erro ao ler último acesso:', e);
      setLastAccessArticle(null);
    }
  }

  function handleSupportPress() {
    const msg = encodeURIComponent(
      'Oi! 👋 Preciso de ajuda com o aplicativo Batata Top, pode me auxiliar?'
    );
    Linking.openURL(`https://wa.me/5514997361015?text=${msg}`);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header minimalista com seta menor (size 18) e ícone de suporte */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerBackBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={18} color={COLORS.primary} />
        </Pressable>

        <Text style={s.headerTitle}>AJUDA</Text>

        <Pressable onPress={handleSupportPress} style={s.headerSupportBtn} hitSlop={12}>
          <Ionicons name="headset-outline" size={20} color={COLORS.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Banner Superior com imagem bem maior (140px) e sem container pesado */}
        <View style={s.bannerRow}>
          <View style={s.bannerTextCol}>
            <Text style={s.bannerTitle}>Falta pouco pra matar sua fome!</Text>
            <Text style={s.bannerSub}>
              Tire suas dúvidas ou entre em contato com nossa equipe.
            </Text>
          </View>

          <View style={s.bannerImgWrapper}>
            <Image
              source={require('../../assets/imageajuda.png')}
              style={s.bannerImg}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* Botão Entrar ou Cadastrar se deslogado */}
        {!user && (
          <Pressable style={s.loginBtn} onPress={() => requestAuthSheet()}>
            <Text style={s.loginBtnText}>Entrar ou cadastrar-se</Text>
          </Pressable>
        )}

        {/* CONDICIONAL DO 1º ACESSO: ÚLTIMOS ACESSOS (Minimalista, sem card com fundo) */}
        {lastAccessArticle && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Últimos acessos</Text>
            <Pressable
              style={s.minimalRow}
              onPress={() => router.push(`/ajuda/artigo/${lastAccessArticle.id}`)}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.primary} style={s.iconInline} />
              <View style={s.rowTextCol}>
                <Text style={s.rowTitle}>{lastAccessArticle.title}</Text>
                <Text style={s.rowSub} numberOfLines={1}>
                  {lastAccessArticle.shortDesc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color="#C2C2C2" />
            </Pressable>
            <View style={s.divider} />
          </View>
        )}

        {/* Seção Categorias (Minimalista, sem fundo nem borda nos ícones) */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Categorias</Text>

          {HELP_CATEGORIES.map((cat, index) => (
            <View key={cat.id}>
              <Pressable
                style={s.minimalRow}
                onPress={() => router.push(`/ajuda/categoria/${cat.id}`)}
              >
                <Ionicons name={cat.icon} size={20} color={COLORS.textSecondary} style={s.iconInline} />
                <View style={s.rowTextCol}>
                  <Text style={s.rowTitle}>{cat.title}</Text>
                  {cat.subtitle ? <Text style={s.rowSub}>{cat.subtitle}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={14} color="#C2C2C2" />
              </Pressable>
              {index < HELP_CATEGORIES.length - 1 && <View style={s.divider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF', // Fundo limpo como a página inicial
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  headerSupportBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[10],
  },

  // Banner Superior Minimalista e com Imagem Maior
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[5],
    paddingVertical: SPACING[2],
  },
  bannerTextCol: {
    flex: 1,
    paddingRight: SPACING[3],
  },
  bannerTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.bold,
    color: COLORS.text,
    marginBottom: SPACING[1],
    lineHeight: 22,
  },
  bannerSub: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  bannerImgWrapper: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: RADIUS.lg,
  },
  bannerImg: {
    width: '100%',
    height: '100%',
  },

  loginBtn: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[3],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[6],
    backgroundColor: '#FFFFFF',
  },
  loginBtnText: {
    color: COLORS.primary,
    fontWeight: TYPOGRAPHY.weights.bold,
    fontSize: TYPOGRAPHY.sizes.sm,
  },

  section: {
    marginBottom: SPACING[6],
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.sizes.base,
    fontWeight: TYPOGRAPHY.weights.extrabold,
    color: COLORS.text,
    marginBottom: SPACING[3],
  },

  // Linha minimalista (sem card/borda/background em volta)
  minimalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[3],
    backgroundColor: '#FFFFFF',
  },
  iconInline: {
    marginRight: SPACING[3],
    width: 22,
    textAlign: 'center',
  },
  rowTextCol: {
    flex: 1,
    paddingRight: SPACING[2],
  },
  rowTitle: {
    fontSize: TYPOGRAPHY.sizes.sm,
    fontWeight: TYPOGRAPHY.weights.semibold,
    color: COLORS.text,
  },
  rowSub: {
    fontSize: TYPOGRAPHY.sizes.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F2',
  },
});
