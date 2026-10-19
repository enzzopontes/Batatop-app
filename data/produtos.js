/**
 * Banco de Dados Centralizado de Produtos
 * Todas as telas usam este arquivo como fonte única de verdade
 */

export const PRODUTOS = [
  {
    id: '1',
    nome: 'Batata de Hot Dog',
    descricao: 'Batata recheada, molho especial de salsicha, requeijão cremoso, mussarela, bacon, batata palha',
    descricaoLonga: 'Nossa famosa batata recheada com um delicioso molho especial de salsicha, requeijão cremoso derretido, mussarela fresca, bacon crocante e uma generosa porção de batata palha. Perfeita para quem ama sabores intensos!',
    preco: 25.99,
    precoFormatado: 'R$ 25,99',
    categoria: 'Batatas',
    imagem: 'https://images.unsplash.com/photo-1585238341710-4b4e6cefc688?w=500&h=500&fit=crop',
    ranking: 1,
    avaliacoes: 4.8,
    avaliacoesCount: 342,
    tempo: '15-20',
    destaque: true,
  },
  {
    id: '2',
    nome: 'Brócolis com Bacon',
    descricao: 'Batata recheada, molho especial com brócolis, bacon, requeijão, mussarela e batata palha',
    descricaoLonga: 'Uma opção mais leve e saudável! Batata recheada com brócolis fresco, bacon crocante, molho especial cremoso, requeijão e mussarela. Perfeito para quem quer algo diferente e nutritivo.',
    preco: 26.99,
    precoFormatado: 'R$ 26,99',
    categoria: 'Batatas',
    imagem: 'https://images.unsplash.com/photo-1599599810694-b5ac4dd64b11?w=500&h=500&fit=crop',
    ranking: 2,
    avaliacoes: 4.7,
    avaliacoesCount: 289,
    tempo: '15-20',
    destaque: true,
  },
  {
    id: '3',
    nome: 'Calabresa Especial',
    descricao: 'Batata com molho cremoso de calabresa, requeijão cremoso, bacon e batata palha',
    descricaoLonga: 'Para os amantes de calabresa! Batata recheada com nosso molho cremoso de calabresa artesanal, requeijão cremoso, bacon crocante e batata palha. Uma explosão de sabor em cada garfada!',
    preco: 25.99,
    precoFormatado: 'R$ 25,99',
    categoria: 'Batatas',
    imagem: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&h=500&fit=crop',
    ranking: 3,
    avaliacoes: 4.9,
    avaliacoesCount: 412,
    tempo: '15-20',
    destaque: true,
  },
  {
    id: '4',
    nome: 'Bolonhesa',
    descricao: 'Macarrão, molho vermelho com carne moída e queijo ralado',
    descricaoLonga: 'Clássico italiano em forma de batata! Macarrão al dente com nosso molho bolonhesa caseiro feito com carne moída fresca, tomate natural e queijo ralado. Uma combinação irresistível!',
    preco: 27.99,
    precoFormatado: 'R$ 27,99',
    categoria: 'Macarrão',
    imagem: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=500&h=500&fit=crop',
    ranking: 4,
    avaliacoes: 4.6,
    avaliacoesCount: 198,
    tempo: '18-23',
    destaque: false,
  },
  {
    id: '5',
    nome: 'Brócolis com Bacon Macarrão',
    descricao: 'Macarrão e molho com brócolis, bacon e queijo ralado',
    descricaoLonga: 'Macarrão fresco com brócolis crocante, bacon frito, molho cremoso e queijo ralado. Uma opção leve e deliciosa para quem prefere algo mais vegetal.',
    preco: 27.99,
    precoFormatado: 'R$ 27,99',
    categoria: 'Macarrão',
    imagem: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=500&h=500&fit=crop',
    ranking: 5,
    avaliacoes: 4.5,
    avaliacoesCount: 156,
    tempo: '18-23',
    destaque: false,
  },
  {
    id: '6',
    nome: 'Filé ao Alho Macarrão',
    descricao: 'Macarrão, molho especial de filé mignon, queijo ralado e alho frito',
    descricaoLonga: 'Luxo em forma de batata! Macarrão premium com molho especial de filé mignon, alho frito crocante, queijo ralado e um toque de manteiga. Perfeito para ocasiões especiais!',
    preco: 29.99,
    precoFormatado: 'R$ 29,99',
    categoria: 'Macarrão',
    imagem: 'https://images.unsplash.com/photo-1612874742237-6526221fcf4f?w=500&h=500&fit=crop',
    ranking: 6,
    avaliacoes: 4.9,
    avaliacoesCount: 267,
    tempo: '20-25',
    destaque: false,
  },
  {
    id: '7',
    nome: 'Batata Cheddar',
    descricao: 'Batata recheada com cheddar derretido, bacon e cebola roxa',
    descricaoLonga: 'Batata recheada com queijo cheddar derretido, bacon crocante, cebola roxa caramelizada e um toque de molho especial. Irresistível!',
    preco: 26.99,
    precoFormatado: 'R$ 26,99',
    categoria: 'Batatas',
    imagem: 'https://images.unsplash.com/photo-1585238341710-4b4e6cefc688?w=500&h=500&fit=crop',
    ranking: 7,
    avaliacoes: 4.7,
    avaliacoesCount: 223,
    tempo: '15-20',
    destaque: false,
  },
  {
    id: '8',
    nome: 'Batata Vegetariana',
    descricao: 'Batata recheada com legumes grelhados, queijo e molho pesto',
    descricaoLonga: 'Para os vegetarianos! Batata recheada com legumes grelhados (abobrinha, berinjela, pimentão), queijo mozzarela e molho pesto caseiro. Saudável e delicioso!',
    preco: 24.99,
    precoFormatado: 'R$ 24,99',
    categoria: 'Batatas',
    imagem: 'https://images.unsplash.com/photo-1599599810694-b5ac4dd64b11?w=500&h=500&fit=crop',
    ranking: 8,
    avaliacoes: 4.6,
    avaliacoesCount: 145,
    tempo: '15-20',
    destaque: false,
  },
];

/**
 * Obter produto por ID
 */
export function getProdutoById(id) {
  return PRODUTOS.find((p) => p.id === id);
}

/**
 * Obter produtos por categoria
 */
export function getProdutosPorCategoria(categoria) {
  if (categoria === 'Todas') return PRODUTOS;
  return PRODUTOS.filter((p) => p.categoria === categoria);
}

/**
 * Obter categorias únicas
 */
export function getCategorias() {
  const categorias = [...new Set(PRODUTOS.map((p) => p.categoria))];
  return ['Todas', ...categorias];
}

/**
 * Buscar produtos por termo
 */
export function buscarProdutos(termo) {
  const termoLower = termo.toLowerCase();
  return PRODUTOS.filter(
    (p) =>
      p.nome.toLowerCase().includes(termoLower) ||
      p.descricao.toLowerCase().includes(termoLower)
  );
}

/**
 * Obter produtos em destaque
 */
export function getProdutosDestaque() {
  return PRODUTOS.filter((p) => p.destaque).slice(0, 3);
}

/**
 * Obter produtos mais avaliados
 */
export function getProdutosMaisAvaliados(limite = 5) {
  return [...PRODUTOS].sort((a, b) => b.avaliacoes - a.avaliacoes).slice(0, limite);
}
