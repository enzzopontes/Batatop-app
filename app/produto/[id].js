import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
  TextInput,
  StatusBar,
  AppState,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../supabaseConfig';
import { useCart } from '../../utils/cartStore';
import { getEffectiveSession } from '../../utils/authSession';
import { setPendingCartIntent } from '../../utils/pendingCartIntent';
import { requestAuthSheet } from '../../utils/authSheetRequest';
import { COLORS, SHADOWS, RADIUS } from '../../constants/theme';
import useAddressVerification from '../hooks/useAddressVerification';
import AddressVerificationModal from '../../components/AddressVerificationModal';
import NoAddressModal from '../../components/NoAddressModal';

const { width } = Dimensions.get('window');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://eucwoxjmjfqylyrqunwk.supabase.co';
const SUPABASE_STORAGE = `${SUPABASE_URL}/storage/v1/object/public/Products/`;

const CATEGORY_FALLBACKS = {
  batatas: 'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=800',
  bebidas: 'https://images.unsplash.com/photo-1544145945-f904253d0c7b?w=800',
  macarrao: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800',
};

function resolveImage(imageUrl, categoria) {
  if (imageUrl) {
    if (imageUrl.startsWith('http')) return { uri: imageUrl };
    return { uri: SUPABASE_STORAGE + imageUrl.replace(/^\/products\//, '') };
  }
  const fallback = CATEGORY_FALLBACKS[categoria?.toLowerCase()] ||
    'https://images.unsplash.com/photo-1518013391915-e40643a1bce1?w=800';
  return { uri: fallback };
}

export default function ProdutoDetail() {
  const { id, editCartItemId, initialQty, initialObs, initialAdicionais } = useLocalSearchParams();
  const router = useRouter();
  const { add: addToCart, updateItem, setHideFloating } = useCart();
  const insets = useSafeAreaInsets();

  const [produto, setProduto] = useState(null);
  const [adicionais, setAdicionais] = useState([]);
  const [bebidas, setBebidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(false);
  const [quantidade, setQuantidade] = useState(initialQty ? Math.max(1, Number(initialQty)) : 1);
  // { [adicionalId]: quantidade (0 = não selecionado) }
  const [adicionaisSelecionados, setAdicionaisSelecionados] = useState({});
  // { [bebidaId]: quantidade (0 = não selecionado) } — só vira item do
  // carrinho de fato quando a pessoa aperta "Adicionar" no rodapé.
  const [bebidasSelecionadas, setBebidasSelecionadas] = useState({});
  const [observacoes, setObservacoes] = useState(initialObs ? String(initialObs) : '');

  // Verificação de endereço (GPS vs endereço selecionado) — ver
  // app/hooks/useAddressVerification.js
  const { verifyAddress, confirmContinue } = useAddressVerification();
  const [showNoAddress, setShowNoAddress] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [verifyAddressData, setVerifyAddressData] = useState(null);
  // Trava contra clique duplo/repetido em "Adicionar" (evita rodar a
  // verificação + montar o carrinho mais de uma vez em paralelo).
  const [isAdding, setIsAdding] = useState(false);

  // Padrão da seção 10 do CLAUDE.md — footer acompanha o teclado via valor
  // nativo (imune a ciclos de background/foreground), nada de resize da
  // janela ou Keyboard.addListener.
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const footerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  useEffect(() => {
    if (id) {
      fetchProduto();
      fetchAdicionais();
      fetchBebidas();
    }
  }, [id]);

  useEffect(() => {
    if (initialAdicionais) {
      try {
        const parsed = JSON.parse(initialAdicionais);
        if (Array.isArray(parsed)) {
          const map = {};
          parsed.forEach((a) => {
            const key = a.id || a.adicional_id;
            if (key) {
              map[key] = (map[key] || 0) + 1;
            }
          });
          setAdicionaisSelecionados(map);
        }
      } catch (e) {
        console.warn('Erro ao parsear initialAdicionais:', e);
      }
    }
  }, [initialAdicionais]);

  const fetchProduto = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setProduto({
        id: data.id,
        nome: data.name,
        descricao: data.description,
        preco: data.price,
        precoFormatado: `R$ ${data.price.toFixed(2).replace('.', ',')}`,
        categoria: data.category,
        imagem: data.image_url,
        disponivel: data.available,
      });
    } catch (err) {
      console.error('Erro ao buscar produto:', err);
      Alert.alert('Erro', 'Não foi possível carregar o produto');
    } finally {
      setLoading(false);
    }
  };

  const fetchAdicionais = async () => {
    try {
      const { data, error } = await supabase
        .from('adicionais')
        .select('*')
        .eq('available', true);

      if (error) throw error;
      setAdicionais(data || []);
    } catch (err) {
      console.error('Erro ao buscar adicionais:', err);
    }
  };

  // Bebidas vêm de `products` (categoria "bebida"/"bebidas"), não da tabela
  // de adicionais — cada uma entra no carrinho como item próprio.
  const fetchBebidas = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('category', 'bebida%')
        .eq('available', true)
        .neq('id', id);

      if (error) throw error;
      setBebidas(data || []);
    } catch (err) {
      console.error('Erro ao buscar bebidas:', err);
    }
  };

  const incrementAdicional = (adicionalId) => {
    setAdicionaisSelecionados((prev) => ({
      ...prev,
      [adicionalId]: (prev[adicionalId] || 0) + 1,
    }));
  };

  const decrementAdicional = (adicionalId) => {
    setAdicionaisSelecionados((prev) => {
      const current = prev[adicionalId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[adicionalId];
        return next;
      }
      return { ...prev, [adicionalId]: current - 1 };
    });
  };

  const incrementBebida = (bebidaId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBebidasSelecionadas((prev) => ({
      ...prev,
      [bebidaId]: (prev[bebidaId] || 0) + 1,
    }));
  };

  const decrementBebida = (bebidaId) => {
    setBebidasSelecionadas((prev) => {
      const current = prev[bebidaId] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[bebidaId];
        return next;
      }
      return { ...prev, [bebidaId]: current - 1 };
    });
  };

  const totalAdicionais = adicionais.reduce((acc, item) => {
    const qty = adicionaisSelecionados[item.id] || 0;
    return acc + item.price * qty;
  }, 0);

  // Agrupa adicionais por adicional_categoria (ordem = primeira aparição no array)
  const categoriasAdicionais = useMemo(() => {
    const grupos = {};
    const ordem = [];
    adicionais.forEach((item) => {
      const cat = item.adicional_categoria?.trim() || 'Outros';
      if (!grupos[cat]) {
        grupos[cat] = [];
        ordem.push(cat);
      }
      grupos[cat].push(item);
    });
    return ordem.map((categoria) => ({ categoria, itens: grupos[categoria] }));
  }, [adicionais]);

  // Frases fixas para categorias comuns (estilo iFood) — 5 variações cada, uma é
  // sorteada por categoria toda vez que a tela é aberta (rodízio)
  const FRASES_CATEGORIA = {
    molho: ['Que tal um molho?', 'Bora escolher um molho?', 'Um molhinho especial?', 'Qual molho vai ser?', 'Dá um toque com molho?'],
    molhos: ['Que tal um molho?', 'Bora escolher um molho?', 'Um molhinho especial?', 'Qual molho vai ser?', 'Dá um toque com molho?'],
    bebida: ['Bora escolher uma bebida?', 'Vai querer algo pra beber?', 'Que tal matar a sede?', 'Escolha sua bebida', 'Falta a bebida, hein?'],
    bebidas: ['Bora escolher uma bebida?', 'Vai querer algo pra beber?', 'Que tal matar a sede?', 'Escolha sua bebida', 'Falta a bebida, hein?'],
    borda: ['Vamos turbinar a borda?', 'Que tal recheiar a borda?', 'Borda recheada, bora?', 'Dá um up na borda?', 'Escolha sua borda'],
    bordas: ['Vamos turbinar a borda?', 'Que tal recheiar a borda?', 'Borda recheada, bora?', 'Dá um up na borda?', 'Escolha sua borda'],
    sabor: ['Qual vai ser o sabor?', 'Escolha o seu sabor', 'Bora escolher o sabor?', 'Qual sabor você quer?', 'Hora de escolher o sabor'],
    sabores: ['Qual vai ser o sabor?', 'Escolha o seu sabor', 'Bora escolher o sabor?', 'Qual sabor você quer?', 'Hora de escolher o sabor'],
    extra: ['Vai querer um extra?', 'Bora caprichar com um extra?', 'Que tal um extra?', 'Dá um upgrade extra?', 'Adiciona um extra?'],
    extras: ['Vai querer um extra?', 'Bora caprichar com um extra?', 'Que tal um extra?', 'Dá um upgrade extra?', 'Adiciona um extra?'],
    adicional: ['Bora dar um upgrade?', 'Que tal turbinar o pedido?', 'Vai querer adicionar algo?', 'Capricha no pedido?', 'Adiciona um extra especial?'],
    adicionais: ['Bora dar um upgrade?', 'Que tal turbinar o pedido?', 'Vai querer adicionar algo?', 'Capricha no pedido?', 'Adiciona um extra especial?'],
    queijo: ['Mais queijo, por favor?', 'Bora caprichar no queijo?', 'Um queijo a mais?', 'Reforça o queijo?', 'Queijo nunca é demais'],
    queijos: ['Mais queijo, por favor?', 'Bora caprichar no queijo?', 'Um queijo a mais?', 'Reforça o queijo?', 'Queijo nunca é demais'],
    carne: ['Reforça a carne?', 'Bora turbinar a carne?', 'Mais carne, por favor?', 'Dá um up na carne?', 'Capricha na carne?'],
    carnes: ['Reforça a carne?', 'Bora turbinar a carne?', 'Mais carne, por favor?', 'Dá um up na carne?', 'Capricha na carne?'],
    bacon: ['Bacon nunca é demais', 'Bora colocar bacon?', 'Um bacon a mais?', 'Que tal reforçar com bacon?', 'Dá um crocante com bacon?'],
    acompanhamento: ['Que tal um acompanhamento?', 'Falta um acompanhamento', 'Vai querer acompanhar com algo?', 'Escolha seu acompanhamento', 'Bora completar o pedido?'],
    acompanhamentos: ['Que tal um acompanhamento?', 'Falta um acompanhamento', 'Vai querer acompanhar com algo?', 'Escolha seu acompanhamento', 'Bora completar o pedido?'],
    cobertura: ['Escolha sua cobertura', 'Que tal uma cobertura?', 'Bora escolher a cobertura?', 'Vai de qual cobertura?', 'Capricha na cobertura?'],
    coberturas: ['Escolha sua cobertura', 'Que tal uma cobertura?', 'Bora escolher a cobertura?', 'Vai de qual cobertura?', 'Capricha na cobertura?'],
    recheio: ['Qual recheio hoje?', 'Escolha o recheio', 'Bora escolher o recheio?', 'Vai de qual recheio?', 'Que tal um recheio especial?'],
    recheios: ['Qual recheio hoje?', 'Escolha o recheio', 'Bora escolher o recheio?', 'Vai de qual recheio?', 'Que tal um recheio especial?'],
    proteina: ['Quer reforçar a proteína?', 'Bora turbinar a proteína?', 'Mais proteína, por favor?', 'Dá um up na proteína?', 'Capricha na proteína?'],
    proteinas: ['Quer reforçar a proteína?', 'Bora turbinar a proteína?', 'Mais proteína, por favor?', 'Dá um up na proteína?', 'Capricha na proteína?'],
    doce: ['Um docinho pra fechar?', 'Que tal uma sobremesa?', 'Bora fechar com um doce?', 'Falta um docinho', 'Vai de sobremesa?'],
    doces: ['Um docinho pra fechar?', 'Que tal uma sobremesa?', 'Bora fechar com um doce?', 'Falta um docinho', 'Vai de sobremesa?'],
    sobremesa: ['Um docinho pra fechar?', 'Que tal uma sobremesa?', 'Bora fechar com um doce?', 'Falta um docinho', 'Vai de sobremesa?'],
    sobremesas: ['Um docinho pra fechar?', 'Que tal uma sobremesa?', 'Bora fechar com um doce?', 'Falta um docinho', 'Vai de sobremesa?'],
  };

  // Frases genéricas variadas (fallback p/ categorias sem match) — 5 templates,
  // sorteia um por categoria a cada abertura da tela
  const FRASES_GENERICAS = [
    (cat) => `Que tal um ${cat.toLowerCase()}?`,
    (cat) => `Bora incrementar com ${cat.toLowerCase()}?`,
    (cat) => `Dá um up com ${cat.toLowerCase()}`,
    (cat) => `Escolha seu ${cat.toLowerCase()}`,
    (cat) => `Vai de ${cat.toLowerCase()}?`,
  ];

  // Sorteia, uma vez por montagem da tela (a cada abertura), qual das 5 frases
  // usar para cada categoria de adicional. Assim, toda vez que o usuário abre
  // o produto de novo, pode aparecer uma frase diferente (rodízio).
  const fraseIndices = useMemo(() => {
    const map = {};
    categoriasAdicionais.forEach(({ categoria }) => {
      map[categoria] = Math.floor(Math.random() * 5);
    });
    return map;
  }, [categoriasAdicionais]);

  const gerarFraseCategoria = (categoria) => {
    const chave = categoria.trim().toLowerCase();
    const idx = fraseIndices[categoria] ?? 0;
    if (FRASES_CATEGORIA[chave]) return FRASES_CATEGORIA[chave][idx];
    return FRASES_GENERICAS[idx](categoria);
  };

  // Mesmo rodízio de frases (sorteia 1 de 5 a cada abertura da tela), mas
  // separado do de adicionais já que bebidas vem de outra fonte de dados.
  const fraseBebidaIndex = useMemo(() => Math.floor(Math.random() * 5), []);
  const fraseBebida = FRASES_CATEGORIA.bebidas[fraseBebidaIndex];

  // Produto sendo visto já é uma bebida? Nesse caso não mostra a seção
  // (senão a Coca-Cola apareceria dentro da própria tela da Coca-Cola).
  const isBebida = produto?.categoria?.trim().toLowerCase().startsWith('bebida');

  const calcularPrecoTotal = () => {
    if (!produto) return 0;
    return (produto.preco + totalAdicionais) * quantidade;
  };

  const formatPreco = (valor) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Monta a lista de itens que iriam pro carrinho (produto principal +
  // bebidas avulsas), sem efeito colateral nenhum. Extraído do handler de
  // clique pra poder ser reaproveitado tanto no fluxo normal (usuário já
  // logado) quanto guardado como intenção pendente (usuário deslogado —
  // ver utils/pendingCartIntent.js), sem duplicar a lógica de preço.
  const buildCartItems = () => {
    if (!produto) return [];

    // Expande adicionais com quantidade > 0, repetindo o item conforme qty
    const adicionaisList = adicionais
      .filter((a) => (adicionaisSelecionados[a.id] || 0) > 0)
      .flatMap((a) =>
        Array.from({ length: adicionaisSelecionados[a.id] }, () => a)
      );

    const precoTotalItem = produto.preco + totalAdicionais;

    const items = [
      {
        id: produto.id,
        nome: produto.nome,
        preco: `R$ ${precoTotalItem.toFixed(2).replace('.', ',')}`,
        precoNum: precoTotalItem * 100,
        imagem: produto.imagem,
        quantidade,
        adicionais: adicionaisList,
        observacoes,
      },
    ];

    // Bebidas entram no carrinho como itens independentes (não como
    // adicional deste produto), mas só agora — no clique de "Adicionar" —
    // e não mais assim que a pessoa toca no "+". Se ela sair da tela sem
    // confirmar, as bebidas escolhidas somem junto.
    bebidas
      .filter((b) => (bebidasSelecionadas[b.id] || 0) > 0)
      .forEach((bebida) => {
        const qty = bebidasSelecionadas[bebida.id];
        items.push({
          id: bebida.id,
          nome: bebida.name,
          preco: `R$ ${bebida.price.toFixed(2).replace('.', ',')}`,
          precoNum: bebida.price * 100,
          imagem: bebida.image_url,
          quantidade: qty,
          adicionais: [],
          observacoes: '',
        });
      });

    return items;
  };

  // router.back() pode não ter pra onde voltar (ex: Fast Refresh resetou a
  // pilha, ou a tela foi aberta direto por deep link) — nesse caso cai pra
  // home em vez de disparar o warning "GO_BACK not handled".
  const voltarOuHome = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleAdicionarAoCarrinho = async () => {
    if (!produto || isAdding) return;
    setIsAdding(true);
    try {
      if (editCartItemId) {
        const items = buildCartItems();
        if (items.length > 0) {
          updateItem(editCartItemId, items[0]);
          for (let i = 1; i < items.length; i++) {
            addToCart(items[i]);
          }
        }
        voltarOuHome();
        return;
      }

      // Gate de endereço: verifica se o GPS atual bate com o endereço
      // selecionado (raio de 30m — ver app/hooks/useAddressVerification.js).
      // Roda antes do gate de login: sem sessão, o hook devolve
      // 'no_session' e cai direto no fluxo de login já existente abaixo.
      const addressCheck = await verifyAddress();

      if (addressCheck.status === 'no_address') {
        setShowNoAddress(true);
        return;
      }
      if (addressCheck.status === 'needs_confirmation') {
        setVerifyAddressData(addressCheck.address);
        setShowVerify(true);
        return;
      }

      // Gate de login: sem sessão efetiva, não adiciona nada agora. Guarda a
      // intenção (o que seria adicionado) em memória e pede pra abrir o
      // AuthBottomSheet global — que já está montado em _layout.js e aparece
      // por cima desta própria tela, sem navegar pra lugar nenhum. Se a
      // pessoa completar o login (por qualquer canal), o _layout.js consome
      // essa intenção sozinho assim que resolver o usuário como logado (ver
      // utils/pendingCartIntent.js). Se ela sair sem logar, a intenção só
      // fica parada aí — não vira item nenhum.
      const session = await getEffectiveSession();
      if (!session) {
        setPendingCartIntent(buildCartItems());
        requestAuthSheet();
        return;
      }

      buildCartItems().forEach(addToCart);
      voltarOuHome();
    } finally {
      setIsAdding(false);
    }
  };

  // "Continuar assim" no modal de verificação de endereço — grava o GPS
  // atual como verificado (não pergunta de novo nesse raio) e segue o
  // fluxo normal de adicionar.
  const handleContinuarMesmoEndereco = async () => {
    setShowVerify(false);
    await confirmContinue();
    setIsAdding(true);
    try {
      const session = await getEffectiveSession();
      if (!session) {
        setPendingCartIntent(buildCartItems());
        requestAuthSheet();
        return;
      }
      buildCartItems().forEach(addToCart);
      voltarOuHome();
    } finally {
      setIsAdding(false);
    }
  };

  // "Cadastrar endereço" (NoAddressModal) — pessoa sem nenhum endereço
  // salvo. Pula a lista e vai direto pro MapSelector (ver ?autoMap=1 em
  // app/addresses.js). Guarda o carrinho pendente — addresses.js consome
  // sozinho assim que o endereço for salvo.
  const handleCadastrarEndereco = () => {
    setShowNoAddress(false);
    setPendingCartIntent(buildCartItems());
    router.push('/addresses?autoMap=1');
  };

  // "Trocar o endereço" (AddressVerificationModal) — já tem endereço(s)
  // salvo(s), mostra a lista normal pra escolher/trocar.
  const handleTrocarEndereco = () => {
    setShowVerify(false);
    setPendingCartIntent(buildCartItems());
    router.push('/addresses');
  };

  // Fix do bug em que a status bar translúcida "esquece" a configuração e
  // fica preta/opaca depois de um tempo (comum no Android quando o app
  // volta do background ou quando outra tela mexe na StatusBar). Reaplica
  // o estilo sempre que a tela ganha foco e sempre que o app volta ao
  // primeiro plano.
  useFocusEffect(
    useCallback(() => {
      const applyStatusBar = () => {
        StatusBar.setBarStyle('light-content', true);
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent', true);
      };

      applyStatusBar();

      // Enquanto a tela de produto está em foco, o botão flutuante "ver
      // carrinho" fica escondido (senão fica feio descendo por cima do
      // footer fixo daqui). Volta a aparecer normalmente ao sair da tela.
      setHideFloating(true);

      const subscription = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          applyStatusBar();
        }
      });

      return () => {
        subscription.remove();
        setHideFloating(false);
      };
    }, [])
  );

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  if (!produto) {
    return (
      <View style={s.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={COLORS.textMuted} />
        <Text style={s.errorText}>Produto não encontrado</Text>
        <Pressable style={s.btnVoltar} onPress={() => router.back()}>
          <Text style={s.btnVoltarText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}>

        {/* Imagem hero */}
        <View style={s.imageContainer}>
          <Image
            source={resolveImage(produto.imagem, produto.categoria)}
            style={s.image}
            resizeMode="cover"
            onError={() => setUseFallback(true)}
          />

          {/* Botao voltar */}
          <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={24} color="#FFB800" />
          </TouchableOpacity>
        </View>

        {/* Conteudo */}
        <View style={s.content}>

          {/* Nome e preco lado a lado, embaixo da foto */}
          <View style={s.nomePrecoRow}>
            <Text style={s.titulo}>{produto.nome}</Text>
            <Text style={s.precoPrincipal}>{produto.precoFormatado}</Text>
          </View>

          {/* Descricao */}
          <Text style={s.descricao}>{produto.descricao}</Text>

          {/* Adicionais */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Adicionais</Text>
            <View style={s.opcionalBadge}>
              <Text style={s.opcionalText}>OPCIONAL</Text>
            </View>
          </View>

          {adicionais.length === 0 ? (
            <Text style={s.semAdicionais}>Nenhum adicional disponível</Text>
          ) : (
            categoriasAdicionais.map(({ categoria, itens }) => (
              <View key={categoria} style={s.categoriaGroup}>
                <View style={s.categoriaHeaderBg}>
                  <Text style={s.categoriaTitle}>{gerarFraseCategoria(categoria)}</Text>
                  <Text style={s.categoriaSubtitle}>Escolha até 10 opções</Text>
                </View>
                {itens.map((item, index) => {
                  const qty = adicionaisSelecionados[item.id] || 0;
                  const isLast = index === itens.length - 1;
                  return (
                    <View
                      key={item.id}
                      style={[s.adicionalItem, !isLast && s.adicionalItemDivider]}
                    >
                      <View style={s.adicionalInfo}>
                        <Text style={s.adicionalNome}>{item.name}</Text>
                        <Text style={s.adicionalPreco}>
                          + R$ {item.price.toFixed(2).replace('.', ',')}
                        </Text>
                      </View>
                      <View style={[s.adicionalQtyContainer, qty > 0 && s.adicionalQtyContainerAtivo]}>
                        {qty > 0 && (
                          <TouchableOpacity
                            style={s.qtyAdicionalBtn}
                            onPress={() => decrementAdicional(item.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="remove" size={16} color="#333" />
                          </TouchableOpacity>
                        )}
                        {qty > 0 && (
                          <Text style={s.qtyAdicionalText}>{qty}</Text>
                        )}
                        <TouchableOpacity
                          style={s.addBtn}
                          onPress={() => incrementAdicional(item.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={20} color="#FFB800" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}

          {/* Bebidas — mesma vitrine visual das categorias de adicionais,
              mas cada item aqui é um produto próprio (products.category
              começando com "bebida") e vira item separado no carrinho. */}
          {!isBebida && bebidas.length > 0 && (
            <View style={s.categoriaGroup}>
              <View style={s.categoriaHeaderBg}>
                <Text style={s.categoriaTitle}>{fraseBebida}</Text>
                <Text style={s.categoriaSubtitle}>Escolha até 10 opções</Text>
              </View>
              {bebidas.map((bebida, index) => {
                const qty = bebidasSelecionadas[bebida.id] || 0;
                const isLast = index === bebidas.length - 1;
                return (
                  <View
                    key={bebida.id}
                    style={[s.adicionalItem, !isLast && s.adicionalItemDivider]}
                  >
                    <View style={s.adicionalInfo}>
                      <Text style={s.adicionalNome}>{bebida.name}</Text>
                      <Text style={s.adicionalPreco}>
                        + R$ {bebida.price.toFixed(2).replace('.', ',')}
                      </Text>
                    </View>
                    <View style={s.bebidaRight}>
                      <Image
                        source={resolveImage(bebida.image_url, bebida.category)}
                        style={s.bebidaImagem}
                        resizeMode="contain"
                      />
                      <View style={[s.adicionalQtyContainer, qty > 0 && s.adicionalQtyContainerAtivo]}>
                        {qty > 0 && (
                          <TouchableOpacity
                            style={s.qtyAdicionalBtn}
                            onPress={() => decrementBebida(bebida.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="remove" size={16} color="#333" />
                          </TouchableOpacity>
                        )}
                        {qty > 0 && (
                          <Text style={s.qtyAdicionalText}>{qty}</Text>
                        )}
                        <TouchableOpacity
                          style={s.addBtn}
                          onPress={() => incrementBebida(bebida.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={20} color="#FFB800" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Observacoes */}
          <View style={[s.sectionHeader, { marginTop: 8 }]}>
            <Text style={s.sectionTitle}>Observações</Text>
          </View>
          <TextInput
            style={s.inputObs}
            placeholder="Ex: sem cebola, maionese à parte..."
            placeholderTextColor={COLORS.textMuted}
            multiline
            value={observacoes}
            onChangeText={setObservacoes}
          />
        </View>
      </ScrollView>

      {/* Footer fixo */}
      <Animated.View style={[s.footer, footerAnimatedStyle, { paddingBottom: insets.bottom }]}>
        <View style={s.quantidadeContainer}>
          <TouchableOpacity
            style={s.qtyBtn}
            onPress={() => setQuantidade(Math.max(1, quantidade - 1))}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={20} color="#333" />
          </TouchableOpacity>
          <Text style={s.quantidadeText}>{quantidade}</Text>
          <TouchableOpacity
            style={s.qtyBtn}
            onPress={() => setQuantidade(quantidade + 1)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color="#333" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[s.botaoAdicionar, isAdding && s.botaoAdicionarDisabled]}
          onPress={handleAdicionarAoCarrinho}
          activeOpacity={0.85}
          disabled={isAdding}
        >
          {isAdding ? (
            <ActivityIndicator color="#333" style={{ marginRight: 8 }} />
          ) : (
            <Ionicons name="cart-outline" size={20} color="#333" style={{ marginRight: 8 }} />
          )}
          <Text style={s.botaoAdicionarText}>{editCartItemId ? 'Salvar alterações' : 'Adicionar'}</Text>
          <Text style={s.botaoAdicionarPreco}>{formatPreco(calcularPrecoTotal())}</Text>
        </TouchableOpacity>
      </Animated.View>

      <NoAddressModal
        visible={showNoAddress}
        onClose={() => setShowNoAddress(false)}
        onCadastrar={handleCadastrarEndereco}
      />
      <AddressVerificationModal
        visible={showVerify}
        address={verifyAddressData}
        onTrocar={handleTrocarEndereco}
        onContinuar={handleContinuarMesmoEndereco}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#fff' },
  errorText: { fontSize: 16, color: COLORS.textSecondary },
  btnVoltar: { backgroundColor: '#FFB800', paddingHorizontal: 30, paddingVertical: 12, borderRadius: RADIUS.lg, marginTop: 8 },
  btnVoltarText: { color: '#333', fontWeight: 'bold', fontSize: 15 },

  // Imagem
  // Container com altura fixa e overflow escondido; a imagem é renderizada
  // mais alta que o container e ancorada no topo (top: 0), então o corte
  // acontece só embaixo — o produto fica mais visível na parte de cima.
  imageContainer: { width, height: 400, position: 'relative', overflow: 'hidden' },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: 460 },
  closeBtn: {
    position: 'absolute',
    top: 64,
    left: 18,
    backgroundColor: '#fff',
    borderRadius: 99,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },

  // Conteudo
  content: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -8,
    padding: 24,
  },
  nomePrecoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },
  titulo: {
    flex: 1,
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '900',
  },
  descricao: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  precoPrincipal: { color: '#FFB800', fontSize: 20, fontWeight: '800' },

  // Secoes
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  opcionalBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  opcionalText: { fontSize: 10, color: COLORS.textMuted, fontWeight: '700', letterSpacing: 0.5 },
  semAdicionais: { color: COLORS.textMuted, fontSize: 14, marginBottom: 16 },

  // Categorias de adicionais
  categoriaGroup: { marginBottom: 4 },
  categoriaHeaderBg: {
    backgroundColor: '#F7F5F1',
    marginHorizontal: -24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 4,
  },
  categoriaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.2,
  },
  categoriaSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 2,
  },

  // Adicionais (soltos, sem card, separados por linha)
  adicionalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  adicionalItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  adicionalInfo: { flex: 1 },
  adicionalNome: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  adicionalPreco: { fontSize: 13, color: '#FFB800', marginTop: 2 },
  // Pílula flutuante "- 1 +": só aparece com fundo/sombra quando tem
  // quantidade selecionada (qty > 0); com qty 0 fica só o botão "+" solto.
  adicionalQtyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#fff',
    borderRadius: 99,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  adicionalQtyContainerAtivo: {
    backgroundColor: '#fff',
    ...SHADOWS.md,
  },
  qtyAdicionalBtn: {
    width: 28,
    height: 28,
    borderRadius: 99,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyAdicionalText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 18,
    textAlign: 'center',
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 99,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bebidas: foto do produto ao lado do botao "+", igual ao print de
  // referencia (iFood-like).
  bebidaRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bebidaImagem: { width: 48, height: 48 },

  // Observacoes
  inputObs: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: RADIUS.lg,
    padding: 14,
    height: 80,
    textAlignVertical: 'top',
    color: COLORS.text,
    fontSize: 14,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  quantidadeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 10,
  },
  qtyBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  quantidadeText: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 22, textAlign: 'center' },
  botaoAdicionar: {
    flex: 1,
    backgroundColor: '#FFB800',
    borderRadius: RADIUS.lg,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  botaoAdicionarDisabled: { opacity: 0.7 },
  botaoAdicionarText: { color: '#333', fontWeight: '700', fontSize: 15, flex: 1 },
  botaoAdicionarPreco: { color: '#333', fontWeight: '700', fontSize: 15 },
});
