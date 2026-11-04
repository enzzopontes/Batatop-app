# Plano de Backup, Restauração e Rollback (Fase 5)

## 1. Estratégia de Rollback

### 1.1 Rollback de Deploy (Frontend & Serverless - Vercel)
- **Mecanismo**: Deployments imutáveis da Vercel.
- **Procedimento Instantâneo**:
  - Pelo painel: `Vercel Dashboard` > `Project` > `Deployments` > Localizar o deployment anterior estável > Clicar em `...` > `Promote to Production`.
  - Pela CLI:
    ```bash
    vercel rollback [deployment-url]
    ```
- **Tempo Médio de Recuperação (RTO)**: < 2 minutos.

### 1.2 Rollback de Banco de Dados (Supabase / PostgreSQL)
- **Regra**: Nenhuma migration pode ser destrutiva sem migration de reversão pré-testada.
- **Scripts de Rollback (Down Migrations)**:
  - Todo script em `scripts/` deve possuir sua instrução de reversão equivalente (ex.: `DROP POLICY IF EXISTS`, `DROP FUNCTION IF EXISTS`, reversão de colunas).
- **Procedimento de Emergência**:
  1. Identificar a migration causadora da instabilidade.
  2. Executar o script down correspondente no editor SQL do Supabase.
  3. Validar consistência de chaves estrangeiras e integridade referencial.

---

## 2. Estratégia de Backups e Restauração

### 2.1 Backups Automatizados
- **Supabase Cloud Managed Backups**:
  - Backups diários automáticos com criptografia AES-256 em repouso.
  - Retenção mínima: 30 dias.
  - Point-in-Time Recovery (PITR): Habilitado para restauração em qualquer segundo específico dentro da janela.

### 2.2 Procedimento de Restauração (Testado)
1. Criar projeto ou branch temporária de teste no Supabase.
2. Efetuar o restore do snapshot mais recente ou do timestamp alvo.
3. Executar a suíte de testes de integridade (`npm test`) contra o banco restaurado.
4. Validar tabelas essenciais: `products`, `orders`, `order_items`, `profiles`, `coupons`.
5. Comprovada a integridade, direcionar tráfego para a nova instância ou aplicar restore na base principal durante janela de manutenção.
- **RPO Alvo (Perda Máxima de Dados)**: 1 hora.
- **RTO Alvo (Tempo Máximo Fora do Ar)**: 4 horas.
