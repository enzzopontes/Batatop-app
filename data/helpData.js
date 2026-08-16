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

  // TERMOS DE USO COMPLETO E ESTRUTURADO (FOTO ENVIADA PELO USUÁRIO)
  {
    id: 'termos-de-uso',
    categoryId: 'politicas',
    title: 'Termos & Condições de Uso',
    shortDesc: 'Regras gerais de utilização do aplicativo.',
    isRichTerms: true,
    introText: `Por meio deste documento, são estabelecidos os termos e as condições gerais para a utilização da Plataforma Batata Top ("Plataforma Batata Top"), por Você ("Você"), que é nosso usuário.\n\nNosso maior objetivo é fazer milhares de pessoas felizes, proporcionando momentos únicos e importantes nos seus dias. O nosso propósito é revolucionar o universo da alimentação por uma vida mais prática e prazerosa! Nos enche de orgulho auxiliar a alavancar o comércio local de Iacanga-SP.\n\nChega mais e vem conferir como funciona o nosso serviço! :)`,
    highlights: [
      {
        tag: '#SuaResponsabilidade',
        icon: 'heart-outline',
        content: `Esperamos de você uma comunicação respeitosa e não agressiva com os estabelecimentos e o próprio Batata Top, sempre zelando pela ética e integridade.\nLembramos que **#NãoToleramosNoBatataTop** qualquer forma de preconceito, assédio, bullying e incitação à violência. As condutas que envolverem preconceito ou assédio estão sujeitas à suspensão ou cancelamento da sua Conta de Usuário em nossa Plataforma Batata Top, sem aviso prévio.`,
      },
      {
        tag: '#SeuDireito',
        icon: 'star-outline',
        content: `Ao criar uma conta no Batata Top, nós poderemos coletar algumas informações importantes sobre você.\nNós sinalizamos para que você fique tranquilo, pois suas informações de pagamento online são armazenadas somente de forma mascarada pelo Mercado Pago. Assim, os dados completos de seus cartões não ficam armazenados em nossas bases e suas transações online são feitas com o mais alto padrão de segurança.\nNós mostramos como respeitamos a sua privacidade em nossa missão de proporcionar um serviço cada vez melhor! Para saber mais sobre como o Batata Top obtém, armazena, utiliza, compartilha e protege suas informações, confira a nossa Declaração de Privacidade dos Usuários.`,
      },
    ],
    termsAccordion: [
      {
        num: '1',
        title: 'Como funciona o Batata Top?',
        body: 'O Batata Top é uma plataforma mobile de intermediação de pedidos de alimentos e bebidas preparados na hora na cidade de Iacanga-SP. Você visualiza o cardápio, escolhe seus adicionais, faz o pagamento via PIX, Cartão ou Dinheiro e recebe seu pedido quentinho no conforto de casa ou retira no local.',
      },
      {
        num: '2',
        title: 'Quem pode usar o Batata Top?',
        body: 'Qualquer pessoa física maior de 18 anos ou menor devidamente autorizado por responsáveis legais, residente ou presente na área urbana do município de Iacanga-SP.',
      },
      {
        num: '3',
        title: 'Como Você recebe seu Pedido?',
        body: 'No checkout, você escolhe entre Delivery (entrega no seu endereço cadastrado) ou Retirada (busca no endereço da loja quando o status indicar Pronto).',
      },
      {
        num: '4',
        title: 'Informações sobre Preços, Pagamentos, Descontos no Pagamento e Promoções',
        body: 'Os preços dos produtos, cupons de desconto e taxas de entrega são exibidos antes da confirmação do pedido. Pagamentos via PIX ou cartão de crédito/débito são validados em ambiente seguro com o Mercado Pago.',
      },
      {
        num: '5',
        title: 'Informações sobre cancelamento de Pedidos e estorno',
        body: 'O cancelamento com estorno integral pode ser feito se o pedido ainda não tiver entrado na fase de preparo pela cozinha. Após o preparo, consulte as regras da Política de Cancelamento.',
      },
      {
        num: '6',
        title: 'Declaração de Privacidade de Usuários',
        body: 'Seus dados pessoais são tratados com sigilo absoluto nos termos da LGPD. Nunca compartilhamos suas informações com terceiros para fins não relacionados à entrega do seu pedido.',
      },
      {
        num: '7',
        title: 'Propriedade Intelectual',
        body: 'Todos os direitos de marca, logotipo, código-fonte e design pertencem exclusivamente à plataforma Batata Top.',
      },
      {
        num: '8',
        title: 'O que o Batata Top não tolera?',
        body: 'Não toleramos qualquer tipo de preconceito, ofensas a funcionários ou entregadores, uso de cartões clonados ou fraudes no sistema de cupons.',
      },
      {
        num: '9',
        title: 'O que mais Você precisa saber?',
        body: 'Reservamo-nos o direito de atualizar estes termos periodicamente. A versão vigente sempre estará acessível nesta seção da Central de Ajuda.',
      },
    ],
  },

  // DECLARAÇÃO DE PRIVACIDADE COMPLETA E ESTRUTURADA
  {
    id: 'declaracao-de-privacidade',
    categoryId: 'politicas',
    title: 'Declaração de Privacidade',
    shortDesc: 'Como tratamos e protegemos seus dados pessoais.',
    isRichPrivacy: true,
    updateDate: '2 de outubro de 2026',
    readingTime: '5 minutos',
    content: `
### Seus dados são seus.

A proteção dos seus dados é muito importante para o **Batata Top**. Respeitamos a sua privacidade na nossa missão de proporcionar o melhor delivery de batatas recheadas de Iacanga-SP!

Esta **Declaração de Privacidade** descreve como obtemos, armazenamos, utilizamos, compartilhamos e protegemos as suas informações pessoais.

Recomendamos que você conheça nossas práticas:

### 1. Que dados coletamos?
- **Dados cadastrais:** Nome completo, e-mail, número de telefone com DDD e data de nascimento.
- **Endereço de entrega:** Logradouro, número, bairro, cidade (Iacanga-SP) e ponto de referência.
- **Dados de pagamento:** As transações online com cartão de crédito/débito e PIX são processadas diretamente pelo **Mercado Pago**. O Batata Top não armazena o número completo do seu cartão de crédito.
- **Histórico de pedidos:** Itens comprados, adicionais selecionados, valores e cupons utilizados.

### 2. Para que usamos seus dados?
- Para processar, preparar e entregar seu pedido no seu endereço em Iacanga-SP.
- Para enviar notificações sobre o andamento do seu pedido (em preparo, saiu para entrega, etc.).
- Para permitir a aplicação de cupons de desconto e promoções personalizadas.
- Para garantir a segurança do seu cadastro e evitar fraudes.

### 3. Como protegemos seus dados?
- Todas as conexões entre o app e nossos servidores Supabase e Mercado Pago são protegidas com **criptografia SSL de alta segurança**.
- Seus dados nunca são vendidos ou repassados a terceiros para marketing ou publicidade indesejada.

### 4. Quais são os seus direitos?
Nos termos da Lei Geral de Proteção de Dados (LGPD), você tem o direito de:
- Confirmar a existência de tratamento dos seus dados;
- Acessar e atualizar seus dados pessoais na tela **Meus Dados** no app;
- Solicitar a exclusão definitiva da sua conta e dos seus dados armazenados através do nosso suporte.
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
