/**
 * data/helpData.js
 * Central de Dados da Ajuda / FAQ do Batata Top
 *
 * Conteúdo adaptado para o aplicativo Batata Top (delivery de batatas recheadas em Iacanga-SP).
 * Sem menções a entregadores, receitas médicas ou serviços de terceiros.
 */

export const HELP_CATEGORIES = [
  {
    id: 'conta',
    title: 'Conta',
    subtitle: 'Tudo sobre sua conta e dados cadastrais',
    icon: 'person-outline',
    iconBg: '#FEF3C7',
    iconColor: '#E3A008',
  },
  {
    id: 'sobre',
    title: 'Sobre o Batata Top',
    subtitle: 'Nossa história, atendimento e informações da loja',
    icon: 'information-circle-outline',
    iconBg: '#FFF3D6',
    iconColor: '#C1440E',
  },
  {
    id: 'produtos',
    title: 'Produtos e serviços',
    subtitle: 'Conheça nossos produtos e formas de pedir',
    icon: 'fast-food-outline',
    iconBg: '#FEF3C7',
    iconColor: '#E3A008',
  },
  {
    id: 'politicas',
    title: 'Políticas e termos',
    subtitle: 'Cancelamento, termos de uso e privacidade',
    icon: 'document-text-outline',
    iconBg: '#FFF3D6',
    iconColor: '#C1440E',
  },
];

export const HELP_ARTICLES = [
  // --- CATEGORIA: CONTA ---
  {
    id: 'dicas-de-seguranca',
    categoryId: 'conta',
    title: 'Dicas de segurança',
    shortDesc: 'Recomendações importantes para proteger sua conta e seus pedidos.',
    content: `
### Para consumidores

- **Sempre dê preferência a dispositivos e redes de confiança:** Cuidado com aparelhos e redes de internet públicas ou compartilhadas, pois aumentam a exposição das suas informações.

- **Mantenha seu aplicativo atualizado:** Quanto mais recente for a sua atualização, mais seguro estará o seu aplicativo.

- **Proteja sua conta:** Nunca compartilhe os códigos que enviamos em seu celular ou e-mail com terceiros.

- **Cadastre seu endereço corretamente:** Dê informações precisas sobre o endereço de entrega em Iacanga-SP, com complemento (quando existir) e pontos de referência.

- **Atenção ao pagar:** Ao pagar na entrega do seu pedido (dinheiro ou maquininha), verifique se o valor está correto antes de concluir a operação.

- **Cheque o lacre da refeição:** Verifique se a embalagem da sua batata está devidamente lacrada e em boas condições.

- **Atenção com e-mails e SMS falsos:** Verifique se as mensagens oficiais são do Batata Top antes de responder a qualquer contato.

- **Nos avise:** Se a refeição não chegou ou teve algum problema, entre em contato pelo nosso suporte no app.
    `,
  },
  {
    id: 'perdi-meu-celular-ou-computador',
    categoryId: 'conta',
    title: 'Perdi meu celular ou computador',
    shortDesc: 'Procedimento para bloquear sua conta temporariamente.',
    content: `
Se você perdeu o celular ou computador, podemos iniciar o procedimento de segurança **"Bloqueio Temporário de Conta"**.

Em caso de bloqueio temporário:
- Sua conta será bloqueada temporariamente até que você inicie o processo de recuperação de conta no Batata Top;
- Todos os seus dispositivos conectados ao aplicativo serão desconectados automaticamente.
    `,
    actionButton: {
      text: 'Bloquear conta temporariamente',
      type: 'warning',
    },
  },
  {
    id: 'desbloqueio-de-conta',
    categoryId: 'conta',
    title: 'Desbloqueio de conta',
    shortDesc: 'Como reativar o seu acesso com segurança.',
    content: `
Para realizar o desbloqueio de conta, é necessário ter acesso ao e-mail cadastrado na sua conta do Batata Top.

Antes de iniciar o processo, lembre-se:
- O desbloqueio pode ser solicitado diretamente pelo aplicativo no seu dispositivo móvel ou através do suporte;
- Sua conta será reativada após a validação dos dados de segurança.
    `,
    actionButton: {
      text: 'Desbloquear',
      type: 'primary',
    },
  },

  // --- CATEGORIA: SOBRE O BATATA TOP ---
  {
    id: 'sobre-o-batata-top-info',
    categoryId: 'sobre',
    title: 'Conheça o Batata Top',
    shortDesc: 'A melhor batata recheada de Iacanga-SP!',
    content: `
O **Batata Top** é o seu aplicativo exclusivo de delivery de batatas recheadas para a cidade de **Iacanga-SP**.

Trabalhamos com ingredientes selecionados, batatas assadas no ponto certo e recheios generosos preparados na hora para levar sabor e qualidade até a sua mesa.

- **Atendimento local:** Atendemos toda a zona urbana de Iacanga-SP.
- **Opções:** Delivery direto na sua porta ou Retirada no local.
- **Suporte rápido:** Atendimento direto pelo app e WhatsApp.
    `,
  },
  {
    id: 'assessoria-de-imprensa',
    categoryId: 'sobre',
    title: 'Assessoria de Imprensa',
    shortDesc: 'Contato para matérias, eventos e imprensa.',
    content: `
Se você quiser informações, matérias ou notícias sobre o Batata Top, entre em contato direto com a nossa equipe de atendimento e imprensa.
    `,
    actionButton: {
      text: 'Falar com o Suporte',
      type: 'whatsapp',
    },
  },
  {
    id: 'produtos-do-batata-top',
    categoryId: 'sobre',
    title: 'Produtos do Batata Top',
    shortDesc: 'Conheça nosso cardápio e especialidades.',
    content: `
Nosso cardápio oferece batatas recheadas tradicionais, especiais e doces, além de bebidas e porções complementares.

Você pode escolher adicionais extras como queijo cheddar, bacon crocante, catupiry original, batata palha e muito mais ao montar seu pedido!
    `,
  },

  // --- CATEGORIA: PRODUTOS E SERVIÇOS ---
  {
    id: 'historico-de-pedidos',
    categoryId: 'produtos',
    title: 'Histórico de Pedidos',
    shortDesc: 'Como consultar e acompanhar todas as suas compras.',
    content: `
A funcionalidade de **visualização do histórico de pedidos** permite que você acompanhe todas as suas compras diretamente pelo app.

No menu **Pedidos**, você encontra a lista completa com:
- Todos os pedidos realizados e seus detalhes;
- O conteúdo de cada pedido e seu status (aguardando pagamento, em preparo, pronto para retirada ou entregue);
- As avaliações publicadas;
- Valor total, forma de pagamento escolhida e adicionais selecionados.
    `,
  },
  {
    id: 'formas-de-pagamento',
    categoryId: 'produtos',
    title: 'Formas de pagamento aceitas',
    shortDesc: 'PIX, Cartão de Crédito, Débito e Dinheiro.',
    content: `
Aceitamos as seguintes formas de pagamento no Batata Top:

- **PIX:** Processamento rápido e seguro com QR Code / Copia e Cola via Mercado Pago. O pedido entra em preparo logo após a confirmação.
- **Cartão de Crédito e Débito:** Transação segura no checkout transparente do aplicativo.
- **Dinheiro:** Pagamento no ato da entrega ou retirada (você pode informar se precisa de troco no checkout).
    `,
  },
  {
    id: 'como-usar-cupom',
    categoryId: 'produtos',
    title: 'Como usar cupom de desconto',
    shortDesc: 'Aplique códigos promocionais em seus pedidos.',
    content: `
Na tela de **Checkout**, digite o código do cupom no campo indicado antes de finalizar a compra.

Se o cupom for válido e atender às condições da promoção, o valor do desconto será aplicado automaticamente no total do seu pedido!
    `,
  },

  // --- CATEGORIA: POLÍTICAS E TERMOS ---
  {
    id: 'politica-de-cancelamento',
    categoryId: 'politicas',
    title: 'Política de Cancelamento de Pedidos',
    shortDesc: 'Regras e prazos para cancelamento de compras.',
    content: `
Sabemos que, às vezes, imprevistos acontecem e cancelar o pedido pode ser necessário. Para garantir transparência, apresentamos aqui as regras do **Batata Top**:

### 1. Antes do início do preparo
- Se o pedido ainda estiver aguardando pagamento ou pendente de confirmação, o cancelamento com reembolso total é garantido.

### 2. Durante o preparo da refeição
- Como se trata de alimento preparado na hora sob encomenda, se o pedido já estiver em preparo pela cozinha, o cancelamento dependerá da confirmação com a loja.

### 3. Durante a entrega
- A pessoa responsável pela entrega aguardará no endereço informado por tempo razoável. Caso não seja localizado ninguém no local e não haja contato do cliente, o pedido poderá ser considerado entregue ou cancelado sem reembolso devido à perda do alimento.

### 4. Critérios que permitem Cancelamento / Reembolso:
- Pedido com ingredientes errados em relação ao solicitado;
- Problemas comprovados de qualidade no produto no momento do recebimento.
    `,
  },
  {
    id: 'politica-de-avaliacoes',
    categoryId: 'politicas',
    title: 'Política de Avaliações de Pedidos',
    shortDesc: 'Como funciona a avaliação de 1 a 5 estrelas.',
    content: `
As avaliações no Batata Top têm como objetivo coletar a opinião sincera dos nossos clientes para aprimorar continuamente nosso atendimento e nossos pratos.

### O que você pode avaliar no app:
- **A refeição:** O sabor, a temperatura, o ponto da batata e o recheio.
- **A entrega e o atendimento:** A agilidade e o estado de entrega da embalagem.

### O que é permitido:
- Dar sua opinião honesta baseada na sua experiência real;
- Comentar sobre a qualidade do produto e embalagem.

### O que não é permitido:
- Comentários ofensivos, preconceituosos ou com linguagem inadequada;
- Avaliações falsas ou não relacionadas ao pedido realizado.
    `,
  },

  // TERMOS DE USO COMPLETO E ESTRUTURADO (APP BATATA TOP)
  {
    id: 'termos-de-uso',
    categoryId: 'politicas',
    title: 'Termos & Condições de Uso',
    shortDesc: 'Regras gerais de utilização do aplicativo.',
    isRichTerms: true,
    introText: `Estes Termos regulam o acesso e uso da plataforma mobile Batata Top para pedidos de batatas recheadas, refeições e bebidas preparadas sob demanda no município de Iacanga-SP.\n\nAo criar uma conta ou concluir um pedido, você declara ter lido, compreendido e aceito integralmente estes Termos de Uso.`,
    highlights: [
      {
        tag: '#SuaResponsabilidade',
        icon: 'heart-outline',
        content: `A Batata Top preza pelo respeito mútuo. É expressamente proibido desrespeitar, ofender ou ameaçar entregadores, atendentes ou funcionários, tentar fraudar sistemas de cupons promocionais ou fornecer intencionalmente dados falsos.\nO descumprimento destas regras resultará no cancelamento imediato de pedidos e na suspensão ou exclusão da conta.`,
      },
      {
        tag: '#SeuDireito',
        icon: 'star-outline',
        content: `O tratamento dos dados coletados segue estritamente a nossa Declaração de Privacidade e a Lei Geral de Proteção de Dados (LGPD). Seus pagamentos online são processados de forma criptografada pelo Mercado Pago, sem retenção de cartões em nossos servidores.`,
      },
    ],
    termsAccordion: [
      {
        num: '1',
        title: 'Objeto e Aceitação',
        body: 'Estes Termos regulam o acesso e uso da plataforma mobile Batata Top para pedidos de batatas recheadas, refeições e bebidas preparadas sob demanda no município de Iacanga-SP. Ao criar uma conta ou concluir um pedido, você declara ter lido, compreendido e aceito integralmente estes Termos de Uso.',
      },
      {
        num: '2',
        title: 'Cadastro e Requisitos',
        body: '• Idade mínima: 18 anos completos ou menores devidamente representados por seus responsáveis legais.\n• Veracidade dos dados: O usuário é o único responsável pela veracidade do nome, e-mail, telefone e endereço informados.\n• Uso pessoal: A conta é intransferível. Não compartilhe seu código de autenticação ou credenciais de acesso com terceiros.',
      },
      {
        num: '3',
        title: 'Pedidos e Modalidades de Recebimento',
        body: '• Delivery: O entregador levará o pedido até o endereço cadastrado em Iacanga-SP. O cliente deve se atentar ao telefone e acompanhar as notificações de status para receber a refeição.\n• Retirada no Balcão: O cliente retira o pedido diretamente no endereço da loja assim que o status do aplicativo indicar "Pronto para retirada".\n• Horários e Disponibilidade: Pedidos estão sujeitos ao horário de funcionamento da cozinha e à disponibilidade diária de estoque e insumos.',
      },
      {
        num: '4',
        title: 'Preços, Cupons e Pagamentos',
        body: '• Valores e taxas: O valor total do pedido, incluindo adicionais, descontos de cupons e taxa de entrega, é exibido no resumo antes da confirmação.\n• Processamento online: Pagamentos por Cartão de Crédito, Débito e PIX são intermediados com segurança pelo Mercado Pago. O Batata Top não armazena dados de cartão em seus servidores.\n• Pagamento na entrega: Quando disponível a opção de pagamento presencial (dinheiro ou maquininha), o valor ou necessidade de troco deve ser especificado no fechamento do pedido.',
      },
      {
        num: '5',
        title: 'Cancelamentos e Reembolsos',
        body: '• Antes do preparo: O cancelamento com reembolso integral pode ser solicitado pelo app ou suporte enquanto o pedido ainda não tiver entrado na cozinha.\n• Durante o preparo ou entrega: Por se tratar de alimento perecível feito sob encomenda, não serão aceitos cancelamentos após o início da produção, salvo falha comprovada da loja (atraso excessivo injustificado ou envio incorreto).\n• Ausência do cliente: Caso o entregador aguarde no endereço informado sem sucesso de contato com o cliente, o pedido poderá ser retornado ou descartado sem direito a estorno.',
      },
      {
        num: '6',
        title: 'Conduta do Usuário',
        body: 'A Batata Top preza pelo respeito mútuo. É expressamente proibido desrespeitar, ofender ou ameaçar entregadores, atendentes ou funcionários; tentar fraudar sistemas de cupons promocionais ou efetuar pagamentos com cartões clonados/roubados; ou fornecer intencionalmente endereços ou dados falsos. O descumprimento resultará no cancelamento imediato de pedidos e na suspensão ou exclusão definitiva da conta.',
      },
      {
        num: '7',
        title: 'Privacidade e Proteção de Dados',
        body: 'O tratamento dos dados coletados segue estritamente a nossa Declaração de Privacidade e a Lei Geral de Proteção de Dados (LGPD).',
      },
      {
        num: '8',
        title: 'Atendimento e Suporte',
        body: 'Em caso de dúvidas, atrasos ou problemas com o pedido:\n• WhatsApp oficial / Suporte no App: (14) 99736-1015\n• E-mail: enzzobaraldo2008@gmail.com\n• Localidade: Iacanga-SP',
      },
    ],
  },

  // DECLARAÇÃO DE PRIVACIDADE COMPLETA E ESTRUTURADA
  {
    id: 'declaracao-de-privacidade',
    categoryId: 'politicas',
    title: 'Declaração de Privacidade',
    shortDesc: 'Como tratamos e protegemos seus dados pessoais sob a LGPD.',
    isRichPrivacy: true,
    updateDate: '16 de outubro de 2026',
    readingTime: '6 minutos',
    content: `
### Seus dados são seus.

A proteção da sua privacidade é prioridade absoluta no Batata Top. Assumimos o compromisso de tratar suas informações pessoais com total transparência, segurança e em estrita conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).

Esta Declaração de Privacidade descreve como coletamos, utilizamos, armazenamos, compartilhamos e protegemos os seus dados durante o uso do nosso aplicativo de delivery em Iacanga-SP.

Ao utilizar o Batata Top, você concorda com as práticas descritas a seguir.

### 1. Que dados coletamos?

Coletamos apenas as informações necessárias para operar o serviço de delivery e cumprir exigências legais:

- Dados cadastrais: Nome completo, endereço de e-mail e número de telefone celular com DDD (utilizado para confirmação da conta e contato operacional sobre o pedido).
- CPF (opcional): Coletado somente caso você opte por incluí-lo na emissão do documento fiscal ou para cumprimento de obrigações tributárias.
- Dados de entrega e endereço: Rua, número, complemento, bairro, cidade (Iacanga-SP) e referências fornecidas por você para a localização exata do imóvel.
- Localização e GPS (opcional): Coordenadas obtidas quando você autoriza a permissão no aparelho, utilizadas exclusivamente em primeiro plano para agilizar a seleção do endereço e exibir a estimativa de entrega no mapa.
- Dados de pagamento: Todas as cobranças online por PIX e cartão de crédito ou débito são processadas de forma criptografada pelo Mercado Pago. O Batata Top não armazena números de cartão, códigos de segurança (CVV) ou senhas bancárias em seus servidores.
- Histórico de pedidos: Produtos adquiridos, complementos, valores, cupons aplicados, datas e horários das compras.
- Identificadores de dispositivo e acesso: Versão do aplicativo, modelo do dispositivo, endereço IP, logs de acesso (conforme o Marco Civil da Internet) e token de notificação para entrega de avisos no aparelho.

### 2. Para que usamos seus dados?

Utilizamos os dados coletados com fundamentos legais legítimos previstos na LGPD:

- Processar e entregar seus pedidos: Preparar os alimentos encomendados e garantir que o entregador chegue com precisão ao seu endereço em Iacanga-SP.
- Envio de notificações em tempo real: Manter você informado sobre cada status do pedido (recebido, em preparo, saiu para entrega) por meio de notificações push (serviço Expo) ou mensagens operacionais.
- Suporte e atendimento: Solucionar dúvidas, atender solicitações de suporte, cancelamento ou ajustes em pedidos.
- Prevenção à fraude e segurança: Identificar atividades suspeitas, validar pagamentos e proteger os clientes e a plataforma contra fraudes eletrônicas.
- Cumprimento de obrigações legais: Emissão de comprovantes fiscais e guarda obrigatória de registros de conexão nos termos da lei.

### 3. Compartilhamento de dados

O Batata Top não comercializa, não aluga e não transfere seus dados pessoais para terceiros com finalidade de propaganda ou mala direta. O compartilhamento ocorre apenas quando essencial:

- Entregadores parceiros: Recebem unicamente o primeiro nome, telefone de contato e endereço de entrega completo para viabilizar a entrega física da sua refeição.
- Intermediador de pagamento (Mercado Pago): Envio seguro dos dados da transação para autorização e liquidação dos pagamentos em ambiente criptografado e certificado PCI-DSS.
- Provedores de infraestrutura: Serviços de hospedagem em nuvem de alto padrão de segurança e serviço de notificações (Expo) para entrega técnica de mensagens.
- Autoridades competentes: Apenas mediante determinação judicial formal ou exigência legal cabível.

### 4. Como protegemos e armazenamos seus dados?

- Criptografia de ponta a ponta: Todo o tráfego de dados entre o aplicativo e os nossos servidores opera sob protocolo HTTPS com criptografia SSL/TLS.
- Acesso controlado: Somente operadores autorizados e vinculados a termos de confidencialidade têm acesso aos dados operacionais necessários ao atendimento.
- Retenção responsável: Os dados pessoais são mantidos enquanto sua conta estiver ativa ou pelo período necessário para cumprimento de prazos legais e regulatórios vigentes.

### 5. Quais são os seus direitos (LGPD — Art. 18)?

A Lei Geral de Proteção de Dados assegura a você os seguintes direitos:

- Confirmação e acesso: Saber se seus dados são tratados e solicitar acesso às informações cadastradas.
- Correção de dados: Solicitar a correção de dados incompletos, inexatos ou desatualizados diretamente pelo app.
- Revogação de consentimento: Desativar permissões de localização (GPS) ou notificações a qualquer momento nas configurações do seu celular.
- Eliminação dos dados: Solicitar a exclusão definitiva dos seus dados cadastrais, ressalvadas as informações de guarda legalmente obrigatória.

### 6. Como solicitar a exclusão da sua conta e dados?

Você pode solicitar o encerramento da conta e o expurgo dos seus dados pessoais a qualquer momento:

- Pelo aplicativo: Acesse o menu Perfil e selecione a opção de exclusão de conta ou entre em contato direto pelo suporte.
- Pelo canal de suporte: Encaminhe sua solicitação com o assunto "Exclusão de Dados — LGPD" contendo seu telefone ou e-mail cadastrado para o nosso atendimento oficial. O processo é analisado e concluído em conformidade com os prazos da legislação brasileira.

### 7. Contato do Encarregado de Dados (DPO) e Suporte

Para esclarecer dúvidas sobre esta Declaração de Privacidade ou exercer seus direitos de titular de dados:

- Encarregado pelo tratamento de dados (DPO): Equipe de Privacidade e Suporte Batata Top
- E-mail de atendimento: enzzobaraldo2008@gmail.com
- Atendimento direto em Iacanga-SP: Pelo chat de ajuda no aplicativo ou WhatsApp oficial de suporte da loja.
    `,
  },
];

export function getArticleById(id) {
  return HELP_ARTICLES.find((art) => art.id === id) || null;
}

export function getCategoryById(id) {
  return HELP_CATEGORIES.find((cat) => cat.id === id) || null;
}

export function getArticlesByCategory(categoryId) {
  return HELP_ARTICLES.filter((art) => art.categoryId === categoryId);
}
