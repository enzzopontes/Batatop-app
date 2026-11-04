# Runbook de Resposta a Incidentes de Segurança (Fase 7)

## 1. Métricas de Resiliência
- **RTO (Recovery Time Objective)**: Máximo 4 horas para restabelecimento total dos serviços.
- **RPO (Recovery Point Objective)**: Máximo 1 hora de perda de transações (garantido por PITR e réplica do Supabase).

---

## 2. Fases de Resposta a Incidentes (NIST SP 800-61 / ISO 27035)

### Fase 1: Detecção e Análise
- **Sinais de Alerta**:
  - Pico anômalo de erros 401/403/429 nos logs da Vercel.
  - Alertas de falha de assinatura HMAC de webhook do Mercado Pago.
  - Alerta do Dependabot de vulnerabilidade Crítica/Alta em dependência.
  - Notificação de atividade incomum na console do Supabase (acesso indevido a tabelas).
- **Classificação de Severidade**:
  - **SEV-1 (Crítica)**: Vazamento de banco, execução remota de código, bypass de autenticação/pagamento.
  - **SEV-2 (Alta)**: Tentativas maciças de força bruta, falha de webhook em lote, IDOR mitigável.
  - **SEV-3 (Média/Baixa)**: Falha isolada de rate limit, bug cosmético de cabeçalho.

### Fase 2: Contenção
- **Ações Imediatas (Sob autorização expressa)**:
  - Ativar `Attack Mode` / WAF no painel da Vercel ou Supabase para mitigar tráfego volumétrico.
  - Em caso de credencial comprometida: rotacionar imediatamente `SUPABASE_SERVICE_ROLE_KEY` ou `MERCADO_PAGO_ACCESS_TOKEN` na Vercel e reiniciar os deployments.
  - Em caso de invasão de conta: invalidar sessões via Supabase Auth Admin API (`auth.admin.signOut(userId)`).

### Fase 3: Erradicação
- Identificar e neutralizar o vetor de ataque (ex.: correção de query, ajuste de policy RLS, bloqueio de IP no firewall).
- Executar varredura completa de histórico git e bundles para assegurar que nenhum artefato permaneceu exposto.

### Fase 4: Recuperação
- Restauração de base de dados via Point-in-Time Recovery (PITR) se houver corrupção ou perda de dados.
- Execução da suíte completa de testes (`npm test` no Site e App) para homologação.
- Redirecionamento ordenado do tráfego para a versão remediada.

### Fase 5: Lições Aprendidas e Post-Mortem
- Reunião de retrospectiva técnica em até 5 dias úteis.
- Documentação do incidente contendo: cronologia dos fatos, causa-raiz, impacto, ações tomadas e melhorias preventivas aplicadas ao código e à infraestrutura.
