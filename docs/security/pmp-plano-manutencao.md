# Plano de Manutenção e Patching (PMP)

## 1. Objetivo
Estabelecer uma rotina contínua de inspeção, atualização de dependências e aplicação de patches de segurança para manter a superfície de ataque do Site e do App no menor nível de risco possível.

---

## 2. Calendário de Execução

### Rotina Semanal
- Revisar alertas automáticos do Dependabot e do GitHub Security Advisories.
- Analisar logs de erro e anomalias de tráfego nos painéis da Vercel e Supabase.
- Validar taxa de sucesso dos webhooks do Mercado Pago.

### Rotina Mensal
- Executar `npm audit` em ambos os repositórios (`Site-da-mara` e `batata-top`).
- Aplicar patches menores e atualizações de segurança em bibliotecas dependentes.
- Revisar a lista de administradores no Supabase (`profiles.role = 'admin'`) revogando acessos desnecessários (PoLP).
- Testar a integridade dos builds de produção (`npm run build` e EAS build).

### Rotina Trimestral
- Simular restauração de backup do Supabase em ambiente isolado (staging) com validação de dados de pedidos e produtos.
- Rotação preventiva de chaves de API secundárias.
- Reavaliação de políticas RLS no Postgres para assegurar que novas colunas ou tabelas não possuem brechas.
