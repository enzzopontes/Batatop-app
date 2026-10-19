import { useState, useEffect } from 'react';
import { supabase } from '../supabaseConfig';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://eucwoxjmjfqylyrqunwk.supabase.co';

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
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Mapear dados do Supabase para o formato esperado pelo app
      const produtosFormatados = data.map((produto) => ({
        id: produto.id,
        nome: produto.name,
        descricao: produto.description,
        descricaoLonga: produto.description,
        preco: produto.price,
        precoFormatado: `R$ ${produto.price.toFixed(2).replace('.', ',')}`,
        categoria: produto.category ? produto.category.charAt(0).toUpperCase() + produto.category.slice(1) : 'Outros',
        imagem: produto.image_url ? (produto.image_url.startsWith('http') ? produto.image_url : `${SUPABASE_URL}/storage/v1/object/public/Products/${produto.image_url.replace(/^\/products\//, '')}`) : null, // Fallback para URL vazia
        ranking: 0,
        avaliacoes: 4.5,
        avaliacoesCount: 0,
        tempo: '15-20',
        destaque: produto.available,
        disponivel: produto.available,
      }));

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
    if (!id) return;
    fetchProduto();
  }, [id]);

  const fetchProduto = async () => {
    try {
      setLoading(true);
      
      // Tentar converter o ID para UUID apenas se necessário, mas o ideal é garantir que o ID passado seja o correto.
      // Removendo a trava para permitir que o erro venha do Supabase ou que funcione se o ID for válido.
      
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      if (!data) {
        throw new Error('Produto não encontrado');
      }

      const produtoFormatado = {
        id: data.id,
        nome: data.name,
        descricao: data.description,
        descricaoLonga: data.description,
        preco: data.price,
        precoFormatado: `R$ ${data.price.toFixed(2).replace('.', ',')}`,
        categoria: data.category ? data.category.charAt(0).toUpperCase() + data.category.slice(1) : 'Outros',
        // Priorizar imagens locais da pasta public/products
        imagem: data.image_url ? (data.image_url.startsWith('http') ? data.image_url : `${SUPABASE_URL}/storage/v1/object/public/Products/${data.image_url.replace(/^\/products\//, '')}`) : null,
        ranking: 0,
        avaliacoes: 4.5,
        avaliacoesCount: 0,
        tempo: '15-20',
        destaque: data.available,
        disponivel: data.available,
      };

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

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      const produtosFormatados = data.map((produto) => ({
        id: produto.id,
        nome: produto.name,
        descricao: produto.description,
        descricaoLonga: produto.description,
        preco: produto.price,
        precoFormatado: `R$ ${produto.price.toFixed(2).replace('.', ',')}`,
        categoria: produto.category ? produto.category.charAt(0).toUpperCase() + produto.category.slice(1) : 'Outros',
        imagem: produto.image_url ? (produto.image_url.startsWith('http') ? produto.image_url : `${SUPABASE_URL}/storage/v1/object/public/Products/${produto.image_url.replace(/^\/products\//, '')}`) : null,
        ranking: 0,
        avaliacoes: 4.5,
        avaliacoesCount: 0,
        tempo: '15-20',
        destaque: produto.available,
        disponivel: produto.available,
      }));

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

  useEffect(() => {
    if (!termo || termo.trim().length === 0) {
      setProdutos([]);
      return;
    }
    buscar();
  }, [termo]);

  const buscar = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${termo}%,description.ilike.%${termo}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const produtosFormatados = data.map((produto) => ({
        id: produto.id,
        nome: produto.name,
        descricao: produto.description,
        descricaoLonga: produto.description,
        preco: produto.price,
        precoFormatado: `R$ ${produto.price.toFixed(2).replace('.', ',')}`,
        categoria: produto.category ? produto.category.charAt(0).toUpperCase() + produto.category.slice(1) : 'Outros',
        imagem: produto.image_url ? (produto.image_url.startsWith('http') ? produto.image_url : `${SUPABASE_URL}/storage/v1/object/public/Products/${produto.image_url.replace(/^\/products\//, '')}`) : null,
        ranking: 0,
        avaliacoes: 4.5,
        avaliacoesCount: 0,
        tempo: '15-20',
        destaque: produto.available,
        disponivel: produto.available,
      }));

      setProdutos(produtosFormatados);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar produtos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { produtos, loading, error };
};