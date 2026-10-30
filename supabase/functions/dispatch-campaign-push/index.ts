import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PROMOTIONS_CHANNEL_ID = 'promotions';
const EXPO_CHUNK_SIZE = 100;

const ADMIN_EMAILS = ['enzzobaraldo2008@gmail.com', 'maraysis9010@gmail.com'];

function isExpoToken(token: string): boolean {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.*\]$/.test(token.trim());
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: 'Variáveis de ambiente do Supabase não configuradas' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validação de Autorização (Admin ou Service Role)
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const isServiceCall = token === serviceRoleKey;

    if (!isServiceCall) {
      if (!token) {
        return new Response(JSON.stringify({ success: false, error: 'Token de autenticação obrigatório' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Usuário não autenticado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let isAdmin = ADMIN_EMAILS.includes(user.email || '');
      if (!isAdmin) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role === 'admin') {
          isAdmin = true;
        }
      }

      if (!isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Acesso negado: privilégio de administrador necessário' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(JSON.stringify({ success: false, error: 'campaignId é obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Carrega a campanha com cupom vinculado
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*, coupons (*)')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ success: false, error: 'Campanha não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (campaign.status === 'completed') {
      return new Response(JSON.stringify({ success: true, message: 'Campanha já foi concluída anteriormente', skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Marca como em processamento
    await supabase
      .from('campaigns')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    // Busca todos os tokens de clientes em user_push_tokens
    const { data: tokensData, error: tokensError } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token');

    if (tokensError) {
      await supabase
        .from('campaigns')
        .update({ status: 'failed', metadata: { error: tokensError.message }, updated_at: new Date().toISOString() })
        .eq('id', campaignId);

      return new Response(JSON.stringify({ success: false, error: tokensError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rawTokens = (tokensData || []).map((t) => t.expo_push_token).filter(Boolean);
    const validTokens = [...new Set(rawTokens.filter(isExpoToken))];

    if (validTokens.length === 0) {
      await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          total_recipients: 0,
          success_count: 0,
          failure_count: 0,
          sent_at: new Date().toISOString(),
          metadata: { note: 'Nenhum token válido encontrado para envio' },
        })
        .eq('id', campaignId);

      return new Response(JSON.stringify({ success: true, total: 0, sent: 0, message: 'Nenhum token ativo encontrado' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepara payload com cupom se disponível
    const coupon = campaign.coupons;
    const couponCode = coupon?.code || null;

    let notificationTitle = campaign.title;
    let notificationBody = campaign.body;

    if (couponCode && !notificationBody.includes(couponCode)) {
      notificationBody = `${notificationBody}\nUse o cupom: ${couponCode}`;
    }

    const pushPayloadTemplate = {
      title: notificationTitle,
      body: notificationBody,
      sound: 'default',
      priority: 'high',
      channelId: PROMOTIONS_CHANNEL_ID,
      data: {
        campaignId: campaign.id,
        couponCode: couponCode,
        screen: couponCode ? 'cupons' : 'cardapio',
        url: couponCode ? '/cupons' : '/cardapio',
        imageUrl: campaign.image_url || null,
      },
      android: {
        channelId: PROMOTIONS_CHANNEL_ID,
        priority: 'high',
        color: '#E3A008',
      },
    };

    // Fatiamento dos tokens em chunks de 100 para respeitar limite estrito do Expo
    const tokenChunks = chunkArray(validTokens, EXPO_CHUNK_SIZE);
    let totalSuccess = 0;
    let totalFailure = 0;
    const staleTokens: string[] = [];

    for (const chunk of tokenChunks) {
      const messages = chunk.map((to) => ({
        ...pushPayloadTemplate,
        to,
      }));

      try {
        const expoRes = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
        });

        if (!expoRes.ok) {
          totalFailure += chunk.length;
          continue;
        }

        const expoData = await expoRes.json();
        const tickets = expoData.data || [];

        for (let i = 0; i < tickets.length; i++) {
          const ticket = tickets[i];
          if (ticket.status === 'ok') {
            totalSuccess++;
          } else {
            totalFailure++;
            if (ticket.details?.error === 'DeviceNotRegistered') {
              staleTokens.push(chunk[i]);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao enviar chunk para Expo:', err);
        totalFailure += chunk.length;
      }
    }

    // Limpeza automática de tokens inválidos (DeviceNotRegistered) sem travar o restante
    if (staleTokens.length > 0) {
      try {
        await supabase
          .from('user_push_tokens')
          .delete()
          .in('expo_push_token', staleTokens);
      } catch (cleanupErr) {
        console.warn('Erro ao remover tokens expirados:', cleanupErr);
      }
    }

    // Atualiza status final da campanha
    const finalStatus = totalSuccess > 0 ? 'completed' : 'failed';
    await supabase
      .from('campaigns')
      .update({
        status: finalStatus,
        total_recipients: validTokens.length,
        success_count: totalSuccess,
        failure_count: totalFailure,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          staleTokensRemoved: staleTokens.length,
          chunksProcessed: tokenChunks.length,
        },
      })
      .eq('id', campaignId);

    return new Response(JSON.stringify({
      success: true,
      campaignId,
      totalRecipients: validTokens.length,
      successCount: totalSuccess,
      failureCount: totalFailure,
      staleTokensRemoved: staleTokens.length,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('Erro inesperado no dispatch-campaign-push:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
