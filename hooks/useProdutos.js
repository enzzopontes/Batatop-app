import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseConfig';
import { resolveProductImage } from '../utils/resolveProductImage';

export const sanitizePostgrestSearch = (raw) => {
  if (raw == null) return '';
  return String(raw)
    .replace(/[,()\\*%"]/g, '')
    .trim()
    .slice(0, 80)
    .trim();
};

export const fetchActivePromoConfig = async () => {
  try {
    const { data, error } = await supabase
      .from('store_settings')
      .select('setting_value')
      .eq('setting_key', 'store_status')
      .maybeSingle();

    if (error || !data?.setting_value) return null;

    const val =
      typeof data.setting_value === 'string'
        ? JSON.parse(data.setting_value)
        : data.setting_value;

    return val && typeof val === 'object' ? val : null;
  } catch {
    return null;
  }
};

export const resolveProductPrice = (produto, promoCfg) => {
  const basePrice = Number(produto?.price);
  if (!promoCfg || typeof promoCfg !== 'object') {
    return basePrice;
  }

  const category = String(produto?.category || '').toLowerCase();
  const promoProducts = Array.isArray(promoCfg.promoProducts)
    ? promoCfg.promoProducts
    : [];
  const findPromoEntry = () =>
    promoProducts.find((e) => e && String(e.productId) === String(produto?.id));

  if (promoCfg.itemPromo?.isActive) {
    const entry = findPromoEntry();
    if (entry != null && entry.promoPrice != null && entry.promoPrice !== '') {
      const p = Number(entry.promoPrice);
      if (Number.isFinite(p)) return p;
    }
    return basePrice;
  }

  if (promoCfg.superPromo?.isActive) {
    if (
      category === 'batata' &&
      promoCfg.superPromo.price != null &&
      promoCfg.superPromo.price !== ''
    ) {
      const p = Number(promoCfg.superPromo.price);
      if (Number.isFinite(p)) return p;
    }
    return basePrice;
  }

  if (promoCfg.isPromoActive) {
    const entry = findPromoEntry();
    if (entry != null && entry.promoPrice != null && entry.promoPrice !== '') {
      const p = Number(entry.promoPrice);
      if (Number.isFinite(p)) return p;
    }
    if (category === 'batata') {
      const rawPromo =
        promoCfg.promoPrice != null && promoCfg.promoPrice !== ''
          ? promoCfg.promoPrice
          : 24.99;
      const p = Number(rawPromo);
      if (Number.isFinite(p)) return p;
    }
  }

  return basePrice;
};

const formatProduto = (produto, promoCfg) => {
  const rawBase = Number(produto?.price);
  const precoOriginal = Number.isFinite(rawBase) ? rawBase : 0;
  const resolved = resolveProductPrice(produto, promoCfg);
  const effectivePrice = Number.isFinite(resolved) ? resolved : precoOriginal;

  return {
    id: produto.id,
    nome: produto.name,
    descricao: produto.description,
    descricaoLonga: produto.description,
    preco: effectivePrice,
    precoOriginal,
    emPromocao: effectivePrice < precoOriginal,
    precoFormatado: `R$ ${effectivePrice.toFixed(2).replace('.', ',')}`,
    categoria: produto.category ? produto.category.charAt(0).toUpperCase() + produto.category.slice(1) : 'Outros',
    category: produto.category,
    imagem: resolveProductImage(produto.image_url, null), // Fallback para URL vazia
    ranking: 0,
    avaliacoes: 4.5,
    avaliacoesCount: 0,
    tempo: '15-20',
    destaque: produto.available,
    disponivel: produto.available,
  };
};

export const useProdutos = () => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProdutos();
  }, []);

  const fetchProdutos = async () => {
    try {
      setLoading(true);
      const [{ data, error }, promoCfg] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false }),
        fetchActivePromoConfig(),
      ]);

      if (error) throw error;

      // Mapear dados do Supabase para o formato esperado pelo app
      const rows = Array.isArray(data) ? data : [];
      const produtosFormatados = rows.map((produto) => formatProduto(produto, promoCfg));

      setProdutos(produtosFormatados);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { produtos, loading, error, refetch: fetchProdutos };
};

export const useProdutoById = (id) => {
  const [produto, setProduto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) {
      setProduto(null);
      setLoading(false);
      return;
    }
    fetchProduto();
  }, [id]);

  const fetchProduto = async () => {
    try {
      setLoading(true);
      
      // Tentar converter o ID para UUID apenas se necessário, mas o ideal é garantir que o ID passado seja o correto.
      // Removendo a trava para permitir que o erro venha do Supabase ou que funcione se o ID for válido.
      
      const [{ data, error }, promoCfg] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single(),
        fetchActivePromoConfig(),
      ]);

      if (error) throw error;
      
      if (!data) {
        throw new Error('Produto não encontrado');
      }

      // Priorizar imagens locais da pasta public/products
      const produtoFormatado = formatProduto(data, promoCfg);

      setProduto(produtoFormatado);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar produto:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { produto, loading, error };
};

export const useProdutosPorCategoria = (categoria) => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProdutosPorCategoria();
  }, [categoria]);

  const fetchProdutosPorCategoria = async () => {
    try {
      setLoading(true);
      let query = supabase.from('products').select('*');

      if (categoria && categoria !== 'Todas') {
        // Converter para o formato do banco (ex: Batatas -> batatas)
        query = query.ilike('category', categoria);
      }

      const [{ data, error }, promoCfg] = await Promise.all([
        query.order('created_at', { ascending: false }),
        fetchActivePromoConfig(),
      ]);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const produtosFormatados = rows.map((produto) => formatProduto(produto, promoCfg));

      setProdutos(produtosFormatados);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar produtos por categoria:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { produtos, loading, error, refetch: fetchProdutosPorCategoria };
};

export const useBuscarProdutos = (termo) => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const buscar = useCallback(async (rawTermo) => {
    const cleanTermo = sanitizePostgrestSearch(rawTermo);
    const reqId = ++requestIdRef.current;

    if (!cleanTermo) {
      if (mountedRef.current) {
        setProdutos([]);
        setError(null);
        setLoading(false);
      }
      return;
    }

    try {
      if (mountedRef.current) setLoading(true);
      const [{ data, error: queryError }, promoCfg] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('available', true)
          .or(`name.ilike.%${cleanTermo}%,description.ilike.%${cleanTermo}%`)
          .order('created_at', { ascending: false }),
        fetchActivePromoConfig(),
      ]);

      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      if (queryError) throw queryError;

      const rows = Array.isArray(data) ? data : [];
      const produtosFormatados = rows.map((produto) => formatProduto(produto, promoCfg));

      setProdutos(produtosFormatados);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || reqId !== requestIdRef.current) return;
      console.error('Erro ao buscar produtos:', err);
      setError(err.message || 'Erro ao buscar produtos');
    } finally {
      if (mountedRef.current && reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const sanitizedTermo = sanitizePostgrestSearch(termo);
    if (!sanitizedTermo) {
      requestIdRef.current += 1;
      setProdutos([]);
      setError(null);
      setLoading(false);
      return;
    }

    const debounceTimer = setTimeout(() => {
      buscar(sanitizedTermo);
    }, 250);

    return () => clearTimeout(debounceTimer);
  }, [termo, buscar]);

  const refetch = useCallback(() => buscar(termo), [buscar, termo]);

  return { produtos, loading, error, refetch };
};