import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  Pressable,
  ActivityIndicator,
  Image,
  FlatList,
  ToastAndroid,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter, useFocusEffect, Redirect } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeGetNotificationPermissions } from '../utils/pushNotifications';
import { ALREADY_SEEN_WELCOME_KEY } from './welcome';
import { ALREADY_SEEN_LOCATION_KEY } from './location';
import * as Location from 'expo-location';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../constants/theme';
import { useProductRanking } from './hooks/useProductRanking';
import BannerCarousel from '../components/BannerCarousel';
import CategoriasFlutuantes from '../components/CategoriasFlutuantes';
import { CATEGORIAS, handleCategoriaPress } from '../constants/categorias';
import {
  useScrollHandler,
  useHeaderHeight,
  useHeaderHidden,
  HEADER_HYSTERESIS,
  HEADER_ANIM_DURATION,
  HEADER_EASING,
} from './_layout';

// ─── Cupom (dimensões do card-ticket) ─────────────────────────────────────────
const CUPOM_CARD_WIDTH = 304;
const CUPOM_CARD_HEIGHT = 168;
const CUPOM_GAP = 14;
const CUPOM_LEFT_WIDTH = 162; // painel laranja um pouco maior que o creme
const CUPOM_RIGHT_WIDTH = CUPOM_CARD_WIDTH - CUPOM_LEFT_WIDTH;
const CUPOM_SEAM_WIDTH = 22; // largura só da faixa dos furinhos/tracejado (fica por cima, não ocupa espaço no layout)

// ─── Grid "Batatas mais pedidas" (2 colunas, largura fixa calculada) ──────────
const PROD_GRID_GAP = 14;
const PROD_CARD_WIDTH = (Dimensions.get('window').width - SPACING[6] * 2 - PROD_GRID_GAP) / 2;
const PROD_IMG_HEIGHT = PROD_CARD_WIDTH * 0.9;

// cores fixas do "ticket" — não vêm do theme pq o cupom tem identidade própria
// (laranja + creme), igual ao cartão de cupom do iFood
const CUPOM_LARANJA = '#FFA412';
const CUPOM_LARANJA_ESCURO = '#E08900';
const CUPOM_CREME = '#FFF3DC';
const CUPOM_MARROM = '#5C3D0A';
const CUPOM_MARROM_CLARO = '#8A6A3B';

// ─── Pressable com scale ───────────────────────────────────────────────────────
function PressableScale({ children, onPress, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () =>
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  const handlePressOut = () =>
    Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }).start();

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} style={style}>
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </Pressable>
  );
}

// ─── Cupom Card (ticket laranja/creme, com "furos" no meio e código copiável) ─
// Array só pra desenhar a linha pontilhada vertical do meio do ticket "na mão"
// (mais confiável entre plataformas do que confiar no borderStyle:'dashed'
// do RN, que no Android às vezes ignora o tracejado).
const CUPOM_DASHES = Array.from({ length: 9 });

function CupomCard({ codigo, valor, unidade, descricaoDesconto, validade, usoLabel, mensagem }) {
  const [copiado, setCopiado] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const corAnim = useRef(new Animated.Value(0)).current; // 0 = creme normal, 1 = verde copiado

  const copiarCodigo = () => {
    Clipboard.setStringAsync(codigo);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
    Animated.timing(corAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    setCopiado(true);
    if (Platform.OS === 'android') ToastAndroid.show('Cupom copiado!', ToastAndroid.SHORT);
    setTimeout(() => {
      Animated.timing(corAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
      setCopiado(false);
    }, 2000);
  };

  const boxBg = corAnim.interpolate({ inputRange: [0, 1], outputRange: ['#FFFFFF', '#22C55E'] });
  const boxBorda = corAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CUPOM_LARANJA, '#22C55E'],
  });
  const boxTexto = corAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [CUPOM_LARANJA_ESCURO, '#FFFFFF'],
  });

  const ehPercentual = unidade === '%';

  return (
    <View style={s.cupomCardShadow}>
      <View style={s.cupomCard}>
        {/* ── Metade esquerda: laranja, com o valor do desconto em destaque ── */}
        <View style={s.cupomLeftPanel}>
          {/* decoração de fundo — só uns ícones bem apagados espalhados, sem
              atrapalhar a leitura */}
          <Ionicons name="fast-food" size={46} color="#FFFFFF" style={s.cupomDecorA} />
          <Ionicons name="pricetag" size={30} color="#FFFFFF" style={s.cupomDecorB} />
          <Ionicons name="sparkles" size={22} color="#FFFFFF" style={s.cupomDecorC} />

          <View style={s.cupomBadge}>
            <Ionicons name="pricetag" size={11} color={CUPOM_LARANJA_ESCURO} />
            <Text style={s.cupomBadgeText}>CUPOM DE{'\n'}DESCONTO</Text>
          </View>

          <View style={s.cupomValorRow}>
            {!ehPercentual && <Text style={s.cupomValorPrefixo}>{unidade}</Text>}
            <Text style={s.cupomValorNum}>{valor}</Text>
            {ehPercentual && <Text style={s.cupomValorSimbolo}>%</Text>}
          </View>
          <Text style={s.cupomOff}>OFF</Text>

          <View style={s.cupomLeftDivider} />
          <Text style={s.cupomLeftDesc}>{descricaoDesconto}</Text>
        </View>

        {/* ── Metade direita: creme, com código, validade e uso ── */}
        <View style={s.cupomRightPanel}>
          <Ionicons name="star" size={20} color={CUPOM_LARANJA} style={s.cupomDecorD} />

          <View style={s.cupomCodigoLabelRow}>
            <Ionicons name="caret-back" size={9} color={CUPOM_MARROM_CLARO} />
            <Text style={s.cupomCodigoLabel}>USE O CÓDIGO</Text>
            <Ionicons name="caret-forward" size={9} color={CUPOM_MARROM_CLARO} />
          </View>

          <Pressable onPress={copiarCodigo} hitSlop={6}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Animated.View style={[s.cupomCodigoBox, { backgroundColor: boxBg, borderColor: boxBorda }]}>
                {copiado ? (
                  <Ionicons name="checkmark" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                ) : null}
                <Animated.Text style={[s.cupomCodigoTexto, { color: boxTexto }]} numberOfLines={1}>
                  {copiado ? 'COPIADO!' : codigo}
                </Animated.Text>
              </Animated.View>
            </Animated.View>
          </Pressable>

          <View style={s.cupomInfoLine} />
          <View style={s.cupomInfoRow}>
            <Text style={s.cupomInfoLabel}>VÁLIDO ATÉ</Text>
            <Text style={s.cupomInfoValor}>{validade}</Text>
          </View>

          <View style={s.cupomInfoLine} />
          <View style={s.cupomInfoRow}>
            <Text style={s.cupomInfoLabel}>{usoLabel}</Text>
            <Text style={s.cupomInfoValorForte}>Aproveite!</Text>
          </View>

          <View style={s.cupomMensagemPill}>
            <Ionicons name="heart" size={12} color={CUPOM_LARANJA} />
            <Text style={s.cupomMensagemText} numberOfLines={1}>{mensagem}</Text>
          </View>
        </View>

        {/* ── Costura: fica por CIMA (absolute), centrada exatamente na fronteira
             entre o laranja e o creme — assim o tracejado nunca fica deslocado
             em relação à cor, independente da largura dos painéis ── */}
        <View style={s.cupomSeam} pointerEvents="none">
          <View style={s.cupomNotchTop} />
          <View style={s.cupomDashedCol}>
            {CUPOM_DASHES.map((_, i) => (
              <View key={i} style={s.cupomDash} />
            ))}
          </View>
          <View style={s.cupomNotchBottom} />
        </View>
      </View>
    </View>
  );
}

// ─── Fallbacks de imagem por categoria (fixos — não recriar a cada render) ────
const PROD_IMG_FALLBACKS = {
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=600',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=600',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600',
};
const MINI_IMG_FALLBACKS = {
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=400',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=400',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400',
};

// ─── Card de Produto (Batatas mais pedidas) ───────────────────────────────────
const ProdutoCard = memo(function ProdutoCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  const imageSource = useFallback
    ? { uri: PROD_IMG_FALLBACKS[produto.categoria?.toLowerCase()] || PROD_IMG_FALLBACKS.batatas }
    : { uri: produto.imagem };

  return (
    <PressableScale onPress={() => router.push(`/produto/${produto.id}`)}>
      <View style={s.prodCard}>
        {/* Imagem */}
        <View style={s.prodImgWrapper}>
          <ExpoImage
            source={imageSource}
            style={s.prodImg}
            cachePolicy="memory-disk"
            onError={() => setUseFallback(true)}
          />
          <View style={s.prodOverlay} />
        </View>

        {/* Info */}
        <View style={s.prodInfo}>
          <View style={s.prodTitleGroup}>
            <Text style={s.prodNome} numberOfLines={2}>{produto.nome}</Text>
            <Text style={s.prodDesc} numberOfLines={2}>{produto.descricao}</Text>
          </View>
          <View style={s.prodTags}>
            <View style={s.prodTag}>
              <Ionicons name="time-outline" size={10} color={COLORS.textMuted} />
              <Text style={s.prodTagText}>{produto.tempo} min</Text>
            </View>
            <View style={s.prodTag}>
              <Ionicons name="star" size={10} color={COLORS.primary} />
              <Text style={s.prodTagText}>{produto.avaliacoes || '4.8'}</Text>
            </View>
          </View>
          <View style={s.prodFooter}>
            <Text style={s.prodPreco} numberOfLines={1}>{produto.precoFormatado}</Text>
            <View style={s.addBtn}>
              <Ionicons name="add" size={16} color={COLORS.background} />
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});

// ─── Card Horizontal (Destaques) ──────────────────────────────────────────────
const DestaqueMiniCard = memo(function DestaqueMiniCard({ produto }) {
  const router = useRouter();
  const [useFallback, setUseFallback] = useState(false);

  const imageSource = useFallback
    ? { uri: MINI_IMG_FALLBACKS[produto.categoria?.toLowerCase()] || MINI_IMG_FALLBACKS.batatas }
    : { uri: produto.imagem };

  return (
    <PressableScale onPress={() => router.push(`/produto/${produto.id}`)}>
      <View style={s.miniCard}>
        <View style={s.miniImgWrapper}>
          <ExpoImage
            source={imageSource}
            style={s.miniImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            onError={() => setUseFallback(true)}
          />
        </View>
        <View style={s.miniBody}>
          <Text style={s.miniNome} numberOfLines={2}>{produto.nome}</Text>

          <View style={s.miniTags}>
            <View style={s.miniTag}>
              <Ionicons name="star" size={9} color={COLORS.primary} />
              <Text style={s.miniTagText}>{produto.avaliacoes || '4.5'}</Text>
            </View>
            <View style={s.miniTag}>
              <Ionicons name="time-outline" size={9} color={COLORS.textMuted} />
              <Text style={s.miniTagText}>{produto.tempo} min</Text>
            </View>
          </View>

          <View style={s.miniFooter}>
            <Text style={s.miniPreco}>{produto.precoFormatado}</Text>
            <Pressable style={s.miniBtnAdd} onPress={() => router.push(`/produto/${produto.id}`)}>
              <Ionicons name="add" size={20} color={COLORS.background} />
            </Pressable>
          </View>
        </View>
      </View>
    </PressableScale>
  );
});


// ─── Tela Principal ────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { produtos, loading } = useProductRanking();
  const { onScroll, resetHeader, scrollY } = useScrollHandler();
  const headerHeight = useHeaderHeight();
  const headerHidden = useHeaderHidden();
  const scrollRef = useRef(null);
  const [categoriasBottomY, setCategoriasBottomY] = useState(null);

  // ── Onboarding: mostra /welcome e depois /location, cada um só na
  // primeira vez ──────────────────────────────────────────────────────────
  // Ver app/welcome.js (ALREADY_SEEN_WELCOME_KEY) e app/location.js
  // (ALREADY_SEEN_LOCATION_KEY). null = ainda checando essa etapa.
  // Ordem de prioridade em CADA etapa: permissão já concedida > flag do
  // AsyncStorage. Fica ANTES de qualquer outro hook/lógica da Home de
  // propósito, pra sair rápido via <Redirect> sem montar o resto da tela à
  // toa.
  const [needsWelcome, setNeedsWelcome] = useState(null);
  const [needsLocation, setNeedsLocation] = useState(null);

  // TESTE: deixa `true` pra forçar a tela de welcome aparecer sempre,
  // ignorando permissão de notificação e AsyncStorage. VOLTAR PRA `false`
  // antes de buildar pra produção.
  const FORCE_SHOW_WELCOME = false;

  useEffect(() => {
    if (FORCE_SHOW_WELCOME) {
      setNeedsWelcome(true);
      return;
    }

    (async () => {
      // 1) Etapa /welcome (notificações) — mesma regra de sempre.
      const { status: notifStatus } = await safeGetNotificationPermissions();
      let welcomeNeeded;
      if (notifStatus === 'granted') {
        welcomeNeeded = false;
      } else {
        const seenWelcome = await AsyncStorage.getItem(ALREADY_SEEN_WELCOME_KEY);
        welcomeNeeded = seenWelcome !== 'true';
      }
      setNeedsWelcome(welcomeNeeded);

      // Se ainda falta mostrar /welcome, /location fica pra depois — o
      // usuário volta pro index.js (Home) ao concluir o /welcome, e essa
      // checagem roda de novo nesse próximo mount.
      if (welcomeNeeded) return;

      // 2) Etapa /location — só chega aqui se /welcome já foi visto.
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      if (locStatus === 'granted') {
        setNeedsLocation(false);
        return;
      }
      const seenLocation = await AsyncStorage.getItem(ALREADY_SEEN_LOCATION_KEY);
      setNeedsLocation(seenLocation !== 'true');
    })();
  }, []);

  // Espaço reservado pro header no topo do conteúdo — agora é FIXO (sempre
  // igual à altura real do header), não anima mais nem encolhe/cresce. O
  // header virou puro overlay, exatamente igual a barra de categorias: ele
  // desliza por cima/some, mas nunca empurra o resto do conteúdo.
  const headerSpacerHeight = headerHeight;

  useFocusEffect(
    useCallback(() => {
      resetHeader();
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }, 50);
    }, [resetHeader])
  );

  const disponiveis = produtos.filter(p => p.disponivel);

  // "Batatas mais pedidas" é só batata — antes pegava os 6 primeiros do
  // ranking geral (`disponiveis.slice(0, 6)`), o que deixava entrar Macarrão
  // no meio porque o ranking é por vendas totais, sem separar categoria.
  const normalizarCategoria = (str) =>
    (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const maisPedidos = disponiveis
    .filter((p) => normalizarCategoria(p.categoria).includes('batata'))
    .slice(0, 6);

  const maisPedidosMacarrao = disponiveis
    .filter((p) => normalizarCategoria(p.categoria).includes('macarrao'))
    .slice(0, 6);

  // Destaques: antes pegava só os 6 primeiros de `disponiveis` (ordenado por
  // ranking), o que na prática dava só batata porque elas dominam o topo do
  // ranking geral. Agora intercala por categoria (1 de cada categoria por vez,
  // respeitando o ranking dentro de cada uma) até fechar 6 itens, garantindo
  // que categorias como Macarrão também apareçam nos destaques.
  const destaques = (() => {
    const porCategoria = {};
    disponiveis.forEach((p) => {
      const cat = p.categoria || 'Outros';
      if (normalizarCategoria(cat).includes('bebida')) return; // exclui bebidas dos destaques
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(p);
    });

    const categorias = Object.keys(porCategoria);
    const resultado = [];
    let i = 0;
    while (resultado.length < 6 && categorias.some((cat) => porCategoria[cat][i])) {
      categorias.forEach((cat) => {
        if (porCategoria[cat][i] && resultado.length < 6) {
          resultado.push(porCategoria[cat][i]);
        }
      });
      i++;
    }
    return resultado;
  })();

  const CUPONS = [
    {
      codigo: 'BATATA5',
      valor: '5',
      unidade: 'R$',
      descricaoDesconto: 'em qualquer batata',
      validade: '31/07/2026',
      usoLabel: 'USO LIMITADO',
      mensagem: 'Vem de batata!',
    },
    {
      codigo: 'PRIMEIRA20',
      valor: '20',
      unidade: '%',
      descricaoDesconto: 'na primeira compra',
      validade: '31/07/2026',
      usoLabel: 'USO ILIMITADO',
      mensagem: 'Só na 1ª compra!',
    },
  ];

  // Precisa vir DEPOIS de todos os hooks (regra do React) e ANTES do JSX
  // pesado da Home — assim não desenha nada da Home à toa se for redirecionar.
  // Ordem: /welcome primeiro, /location depois, só então a Home de verdade.
  if (needsWelcome === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }
  if (needsWelcome) {
    return <Redirect href="/welcome" />;
  }
  if (needsLocation === null) {
    return <View style={{ flex: 1, backgroundColor: COLORS.background }} />;
  }
  if (needsLocation) {
    return <Redirect href="/location" />;
  }

  return (
    <View style={s.container}>
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: SPACING[10] }}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Espaço reservado pro header — fixo, não empurra mais nada */}
        <View style={{ height: headerSpacerHeight }} />

        {/* ══════════════════ CATEGORIAS (estilo iFood, grid 3x2) ══════════════════ */}
        <View
          style={[s.section, { paddingTop: SPACING[4] }]}
          onLayout={(e) => setCategoriasBottomY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          <View style={s.catGrid}>
            {CATEGORIAS.map((cat) => (
              <Pressable
                key={cat.label}
                style={[s.catGridItem, cat.disabled && s.catGridItemDisabled]}
                disabled={cat.disabled}
                onPress={() => handleCategoriaPress(router, cat)}
              >
                <View style={s.catGridBox}>
                  <Image source={cat.icon} style={s.catGridIcon} resizeMode="contain" />
                </View>
                <Text style={s.catGridLabel} numberOfLines={1}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ══════════════════ BANNERS (carrossel) ══════════════════ */}
        <View style={s.section}>
          <BannerCarousel />
        </View>

        {/* ══════════════════ DESTAQUES (scroll horizontal) ══════════════════ */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>Destaques</Text>
            <Pressable onPress={() => router.push('/cardapio')} style={s.verTodos}>
              <Text style={s.verTodosText}>Ver todos</Text>
              <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: SPACING[4] }} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.miniCarousel}
            >
              {destaques.map((p) => (
                <DestaqueMiniCard key={p.id} produto={p} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* ══════════════════ CUPONS ══════════════════ */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={s.cupomSectionIcon}>
                <Ionicons name="pricetag" size={13} color="#FFD54F" />
              </View>
              <Text style={s.sectionTitle}>Cupons disponíveis</Text>
            </View>
            <View style={s.cupomQtd}>
              <Text style={s.cupomQtdText}>{CUPONS.length} disponíveis</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.cupomRow}
            decelerationRate="fast"
            snapToInterval={CUPOM_CARD_WIDTH + CUPOM_GAP}
            snapToAlignment="start"
          >
            {CUPONS.map((c) => (
              <CupomCard key={c.codigo} {...c} />
            ))}
          </ScrollView>
        </View>

        <View style={s.section}>
          <View style={s.cardapioHeaderWrap}>
            <View style={s.cardapioHeaderRow}>
              <View style={s.cardapioHeaderLeft}>
                <MaterialCommunityIcons name="carrot" size={30} color={COLORS.primary} />
                <Text style={s.cardapioTitle} numberOfLines={1}>Batatas mais pedidas</Text>
              </View>
              <Pressable onPress={() => router.push('/cardapio')} style={s.verTodos}>
                <Text style={s.verTodosText}>Ver todos</Text>
                <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
              </Pressable>
            </View>
            <Text style={s.cardapioDesc}>Crocantes por fora, recheadas por dentro e feitas na hora</Text>
          </View>

          {loading ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <View style={s.prodGrid}>
              {maisPedidos.map((p, i) => (
                <ProdutoCard key={p.id} produto={p} index={i} />
              ))}
            </View>
          )}
        </View>

        <View style={s.section}>
          <View style={s.cardapioHeaderWrap}>
            <View style={s.cardapioHeaderRow}>
              <View style={s.cardapioHeaderLeft}>
                <MaterialCommunityIcons name="pasta" size={30} color={COLORS.primary} />
                <Text style={s.cardapioTitle} numberOfLines={1}>Macarrão mais pedidos</Text>
              </View>
              <Pressable onPress={() => router.push('/cardapio')} style={s.verTodos}>
                <Text style={s.verTodosText}>Ver todos</Text>
                <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
              </Pressable>
            </View>
            <Text style={s.cardapioDesc}>Massas artesanais com molhos irresistíveis</Text>
          </View>

          {loading ? (
            <View style={s.loader}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <View style={s.prodGrid}>
              {maisPedidosMacarrao.map((p, i) => (
                <ProdutoCard key={p.id} produto={p} index={i} />
              ))}
            </View>
          )}
        </View>

      </ScrollView>

      <CategoriasFlutuantes
        scrollY={scrollY}
        categoriasBottomY={categoriasBottomY}
        headerHidden={headerHidden}
        router={router}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },



  // ── SECTION BASE ─────────────────────────────────────────────────────────
  section: {
    paddingTop: SPACING[6],
    gap: SPACING[4],
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[6],
  },
  sectionTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    letterSpacing: -0.3,
  },
  verTodos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  verTodosText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: TYPOGRAPHY.sizes.sm,
  },

  // ── HEADER DE SEÇÃO COM ÍCONE (ex: "Batatas mais pedidas", "Macarrão
  // mais pedidos") — ícone amarelo "solto" (sem fundo/box) à esquerda do
  // título, descrição cinza colada logo abaixo, alinhada com o início do
  // texto do título (não com o ícone) ──
  cardapioHeaderWrap: {
    paddingHorizontal: SPACING[6],
  },
  cardapioHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[3],
  },
  cardapioHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    flexShrink: 1,
  },
  cardapioTitle: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.lg,
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  cardapioDesc: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.sm,
    marginTop: 1,
    marginLeft: 30 + SPACING[2],
  },

  // ── CATEGORIAS (grid 3x2, estilo iFood — sem sombra/borda) ─────────────────
  catGrid: {
    paddingHorizontal: SPACING[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING[4],
  },
  catGridItem: {
    width: '30%', // 3 colunas (era 48% / 2 colunas)
    alignItems: 'center',
  },
  catGridItemDisabled: {
    opacity: 0.5,
  },
  catGridBox: {
    width: '100%',
    aspectRatio: 1.5, // era 2.3 (2 colunas) — mais quadrado pra caber 3 por linha
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[2],
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  catGridIcon: {
    width: '62%',
    height: '62%',
  },
  catGridLabel: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
    textAlign: 'center',
  },

  // ── MINI CAROUSEL (Em alta) ───────────────────────────────────────────────
  miniCarousel: {
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
  },
  miniCard: {
    width: 170,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  miniImgWrapper: {
    width: '100%',
    height: 130,
    backgroundColor: COLORS.backgroundElevated,
  },
  miniImg: {
    width: '100%',
    height: '100%',
  },
  miniBody: {
    padding: SPACING[3],
    gap: SPACING[2],
    flex: 1,
    justifyContent: 'space-between',
  },
  miniNome: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 16,
    height: 32, // fixo pra 2 linhas — evita card esticar quando nome é grande
  },
  miniPreco: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 16,
  },
  miniFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING[2],
  },
  miniBtnAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginVertical: 2,
  },
  miniTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  miniTagText: {
    color: COLORS.textSecondary,
    fontSize: 9,
    fontWeight: '600',
  },


  // ── CUPONS (iFood style) ──────────────────────────────────────────────────
  cupomSectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#FFD54F1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFD54F33',
  },
  cupomRow: {
    paddingHorizontal: SPACING[6],
    gap: CUPOM_GAP,
    paddingVertical: 4,
  },
  cupomQtd: {
    backgroundColor: '#FFB80015',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FFB80040',
  },
  cupomQtdText: {
    color: '#B8860B',
    fontSize: 11,
    fontWeight: '700',
  },
  cupomCardShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cupomCard: {
    width: CUPOM_CARD_WIDTH,
    height: CUPOM_CARD_HEIGHT,
    borderRadius: 18,
    backgroundColor: CUPOM_CREME,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },

  // ── metade esquerda (laranja) ──
  cupomLeftPanel: {
    width: CUPOM_LEFT_WIDTH,
    backgroundColor: CUPOM_LARANJA,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  cupomBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  cupomBadgeText: {
    color: CUPOM_LARANJA_ESCURO,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 9,
    textAlign: 'center',
  },
  cupomValorRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cupomValorPrefixo: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 4,
    marginRight: 2,
  },
  cupomValorNum: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: -1,
  },
  cupomValorSimbolo: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 20,
    marginBottom: 4,
    marginLeft: 1,
  },
  cupomOff: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 1,
    marginTop: -4,
    marginBottom: 8,
    textAlign: 'center',
  },
  cupomLeftDivider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginBottom: 8,
  },
  cupomLeftDesc: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
    textAlign: 'center',
  },

  // ── costura central: overlay absoluto centrado exatamente na fronteira
  // entre o painel laranja e o creme (não ocupa espaço no layout dos painéis,
  // então o tracejado nunca fica deslocado em relação à cor) ──
  cupomSeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: CUPOM_LEFT_WIDTH - CUPOM_SEAM_WIDTH / 2,
    width: CUPOM_SEAM_WIDTH,
    alignItems: 'center',
  },
  cupomNotchTop: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    marginTop: -10,
  },
  cupomNotchBottom: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    marginBottom: -10,
  },
  cupomDashedCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 4,
  },
  cupomDash: {
    width: 2,
    height: 5,
    borderRadius: 1,
    backgroundColor: CUPOM_LARANJA,
    opacity: 0.35,
  },

  // ── metade direita (creme) ──
  cupomRightPanel: {
    width: CUPOM_RIGHT_WIDTH,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cupomCodigoLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  cupomCodigoLabel: {
    color: CUPOM_MARROM,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cupomCodigoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: CUPOM_LARANJA,
    borderRadius: 7,
    paddingVertical: 5,
    marginTop: 4,
  },
  cupomCodigoTexto: {
    color: CUPOM_LARANJA_ESCURO,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.4,
  },
  cupomInfoLine: {
    height: 1,
    backgroundColor: 'rgba(92,61,10,0.12)',
  },
  cupomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cupomInfoLabel: {
    color: CUPOM_MARROM_CLARO,
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  cupomInfoValor: {
    color: CUPOM_MARROM,
    fontSize: 9,
    fontWeight: '800',
  },
  cupomInfoValorForte: {
    color: CUPOM_MARROM,
    fontSize: 9,
    fontWeight: '900',
  },
  cupomMensagemPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  cupomMensagemText: {
    flex: 1,
    color: CUPOM_MARROM,
    fontSize: 7.5,
    fontWeight: '700',
  },

  // ── decoração de fundo (ícones bem apagados, só textura) ──
  cupomDecorA: {
    position: 'absolute',
    top: -12,
    right: -14,
    opacity: 0.13,
    transform: [{ rotate: '20deg' }],
  },
  cupomDecorB: {
    position: 'absolute',
    bottom: 6,
    left: -10,
    opacity: 0.12,
    transform: [{ rotate: '-18deg' }],
  },
  cupomDecorC: {
    position: 'absolute',
    top: 34,
    right: 8,
    opacity: 0.14,
  },
  cupomDecorD: {
    position: 'absolute',
    top: -6,
    right: -6,
    opacity: 0.1,
    transform: [{ rotate: '15deg' }],
  },

  // ── GRID "Batatas mais pedidas" (2 colunas, largura fixa) ─────────────────
  prodGrid: {
    paddingHorizontal: SPACING[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PROD_GRID_GAP,
  },
  prodCard: {
    width: PROD_CARD_WIDTH,
    backgroundColor: COLORS.backgroundCard,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  prodImgWrapper: {
    width: '100%',
    height: PROD_IMG_HEIGHT,
    position: 'relative',
  },
  prodImg: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.backgroundElevated,
  },
  prodOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  prodInfo: {
    padding: SPACING[3],
    gap: SPACING[2],
  },
  prodTitleGroup: {
    gap: 1,
  },
  prodNome: {
    color: COLORS.text,
    fontWeight: '700',
    fontSize: TYPOGRAPHY.sizes.sm,
    lineHeight: 16,
    height: 32,
  },
  prodDesc: {
    color: COLORS.textMuted,
    fontSize: TYPOGRAPHY.sizes.xs,
    lineHeight: 14,
    height: 28,
  },
  prodTags: {
    flexDirection: 'row',
    gap: SPACING[3],
  },
  prodTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  prodTagText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  prodFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prodPreco: {
    flexShrink: 1,
    marginRight: SPACING[2],
    color: '#000000',
    fontWeight: '800',
    fontSize: TYPOGRAPHY.sizes.base,
  },
  addBtn: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── LOADER ───────────────────────────────────────────────────────────────
  loader: {
    alignItems: 'center',
    paddingVertical: SPACING[10],
  },

});
