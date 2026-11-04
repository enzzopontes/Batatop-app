# Ranking de Prioridade de Segurança (Impacto ÷ Esforço)

Como nenhum comentário específico de vídeo foi colado na Seção 1, foi aplicado o **Ranking Provisório Oficial** com análise ponderada de Impacto (1 a 5) e Esforço (1 a 5), priorizado pela métrica de retorno de segurança `Impacto ÷ Esforço`:

| Rank | Tópico de Segurança | Classificação | Impacto (1-5) | Esforço (1-5) | Score (Imp ÷ Esf) | Status da Implementação / Sub-fase |
|:---:|---|:---:|:---:|:---:|:---:|---|
| **1** | **Controle de Acesso / RLS / IDOR** | Já coberto | 5 | 2 | **2.50** | Concluído na Fase 1 e 2: RLS restrito por dono, inserção direta bloqueada, checagem server-side. |
| **2** | **Segredos Expostos e Bundles** | Já coberto | 5 | 2 | **2.50** | Concluído na Fase 4: remoção de e-mails hardcoded, sanitização de `.gitignore`, isolamento de `service_role`. |
| **3** | **Webhook e Confirmação de Pagamento** | Já coberto | 5 | 3 | **1.67** | Concluído na Fase 3: assinatura HMAC-SHA256, anti-replay, consulta ativa ao Mercado Pago. |
| **4** | **Injeção, Sanitização e Magic Bytes** | Já coberto | 5 | 3 | **1.67** | Concluído na Fase 2: sanitização HTML contextual, bloqueio de SVG/scripts, magic bytes de imagens. |
| **5** | **Rate Limiting e Proteção contra Força Bruta** | Já coberto | 4 | 2 | **2.00** | Concluído na Fase 3: rate limit em login/checkout/api e mitigação de spoofing de IP. |
| **6** | **Sessão Segura, Cookies e MFA** | Já coberto | 4 | 2 | **2.00** | Concluído na Fase 1: cookies `Secure`/`SameSite`, senha mínima 8 caracteres, rotação PKCE. |
| **7** | **Dependências e Supply Chain** | Já coberto | 4 | 2 | **2.00** | Concluído na Fase 6: 0 vulnerabilidades em produção no Site e correção de critical no App, CI com PoLP. |
| **8** | **Backup, Restauração e Rollback** | Já coberto | 4 | 3 | **1.33** | Concluído na Fase 5: migrations idempotentes, runbook de rollback Vercel e PITR Supabase. |
| **9** | **Observabilidade, Logs Limpos e PMP** | Já coberto | 3 | 2 | **1.50** | Concluído na Fase 7: sanitização de PII em logs, runbook de resposta e rotina mensal de patching. |
| **10** | **Transporte HSTS, CSP e CORS** | Já coberto | 4 | 2 | **2.00** | Concluído na Fase 3: HSTS 2 anos com preload, CSP com frame-ancestors none e CORS explícito. |

---

## Decisão de Engenharia
Todos os 10 vetores prioritários foram analisados, corrigidos e validados por testes automatizados em ambos os alvos (App e Site) sem alteração de UI/design.
