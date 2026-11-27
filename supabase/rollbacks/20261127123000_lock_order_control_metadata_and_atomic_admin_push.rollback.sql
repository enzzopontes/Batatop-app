-- Rollback de 20261127123000_lock_order_control_metadata_and_atomic_admin_push.sql
-- Executar manualmente (SQL editor ou MCP execute_sql). Nao e aplicado automaticamente pelo CLI.
--
-- 1) Remove as RPCs novas (nenhum outro objeto depende delas; o rollback exige que
--    notify-admin-order seja re-deployada na versao anterior antes, senao ela falha ao chamar a RPC).
DROP FUNCTION IF EXISTS public.release_admin_push(uuid);
DROP FUNCTION IF EXISTS public.claim_admin_push(uuid, uuid, boolean);

-- 2) merge_order_metadata: a definicao desta migracao e identica a que ja estava em
--    producao (allowlist) antes dela. Nenhuma acao necessaria.
--    NAO restaurar a denylist de 20261015220000_comprehensive_security_and_logic_fixes.sql:
--    ela e mais fraca (permite o dono alterar bark_attempts, mp_payment_id, payment_online, delivery_fee).
--
-- 3) Estado de dados: pedidos com metadata.admin_push_claimed_at ficam inalterados (chave inerte).
--    Para limpar (opcional, com WHERE):
-- UPDATE public.orders SET metadata = metadata - 'admin_push_claimed_at' WHERE metadata ? 'admin_push_claimed_at';
