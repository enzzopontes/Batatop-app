import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseConfig';
import { resolveProductImage } from '../utils/resolveProductImage';
import { fetchActivePromoConfig, resolveProductPrice } from './useProdutos';

export const useProductRanking = () => {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRanking = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent && mountedRef.current) {
        setLoading(true);
      }

      // 1. Busca produtos, ranking via RPC (degradável) e configuração de promoções em paralelo
      const [productsResult, salesResult, promoCfg] = await Promise.all([
        supabase.from('products').select('*'),
        supabase
          .rpc('get_product_ranking', { p_limit: 50 })
          .catch((rpcErr) => ({ data: null, error: rpcErr })),
        fetchActivePromoConfig(),
      ]);

      if (!mountedRef.current) return;

      const { data: rawProductsData, error: productsError } = productsResult;
      if (productsError) throw productsError;

      const productsData = Array.isArray(rawProductsData) ? rawProductsData : [];

      // 2. Degrada falha na RPC sem derrubar o catálogo de produtos
      let salesData = [];
      if (salesResult?.error) {
        console.warn('Erro ao buscar ranking de produtos (RPC), mantendo catálogo sem ordenação por vendas:', salesResult.error);
      } else if (Array.isArray(salesResult?.data)) {
        salesData = salesResult.data;
      }

      // 3. Mapeia quantidades vendidas por produto
      const salesCounts = {};
      
      // Inicializa a contagem para todos os produtos com 0
      productsData.forEach(p => {
        salesCounts[p.id] = 0;
      });

      // Conta as vendas dos itens retornados pela RPC
      if (salesData.length > 0) {
        salesData.forEach(item => {
          const rawQty = Number(item.total_quantity ?? item.total_sold ?? item.quantity ?? 0);
          const qty = Number.isFinite(rawQty) ? rawQty : 0;
          if (item.product_id && salesCounts[item.product_id] !== undefined) {
            salesCounts[item.product_id] = qty;
          }
        });
      }

      // 4. Ordena os produtos pela quantidade total de vendas (descrescente)
      // Mantém ordenação secundária por data de criação para desempate
      const sortedProducts = [...productsData].sort((a, b) => {
        const salesA = salesCounts[a.id] || 0;
        const salesB = salesCounts[b.id] || 0;

        if (salesB !== salesA) {
          return salesB - salesA;
        }

        // Desempate: mais recente criado primeiro
        const tsA = new Date(a.created_at || 0).getTime();
        const tsB = new Date(b.created_at || 0).getTime();
        return (Number.isFinite(tsB) ? tsB : 0) - (Number.isFinite(tsA) ? tsA : 0);
      });

      // 5. Mapeia no formato esperado pelas telas do aplicativo React Native
      const produtosRankeados = sortedProducts.map((produto) => {
        const parsedBase = Number(produto.price);
        const precoOriginal = Number.isFinite(parsedBase) ? parsedBase : 0;
        const resolved = resolveProductPrice(produto, promoCfg);
        const safePrice = Number.isFinite(resolved) ? resolved : precoOriginal;
        return {
          id: produto.id,
          nome: produto.name,
          descricao: produto.description,
          descricaoLonga: produto.description,
          preco: safePrice,
          precoOriginal,
          emPromocao: safePrice < precoOriginal,
          precoFormatado: `R$ ${safePrice.toFixed(2).replace('.', ',')}`,
          categoria: produto.category ? produto.category.charAt(0).toUpperCase() + produto.category.slice(1) : 'Outros',
          imagem: resolveProductImage(produto.image_url, null),
          vendas: salesCounts[produto.id] || 0,
          avaliacoes: 4.5,
          avaliacoesCount: 0,
          tempo: '15-20',
          destaque: produto.available,
          disponivel: produto.available,
          category: produto.category || '',
          category_id: produto.category_id ?? null,
          available: produto.available !== false,
          is_featured: Boolean(produto.is_featured),
          badge_text: produto.badge_text ?? null,
          original_price: produto.original_price ?? null,
        };
      });

      if (mountedRef.current) {
        setProdutos(produtosRankeados);
        setError(null);
      }
    } catch (err) {
      console.error('Erro ao buscar ranking de produtos:', err);
      if (mountedRef.current) {
        setError(err.message || 'Erro ao carregar o ranking');
      }
    } finally {
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const silentRefetch = useCallback(() => fetchRanking({ silent: true }), [fetchRanking]);

  useEffect(() => {
    fetchRanking();
  }, [fetchRanking]);

  return { produtos, loading, error, refetch: fetchRanking, silentRefetch };
};
