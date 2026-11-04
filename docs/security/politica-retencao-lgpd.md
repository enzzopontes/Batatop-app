# Política de Retenção, Descarte e Privacidade (LGPD)

## 1. Mapeamento de Dados Coletados

| Dado | Finalidade | Base Legal (LGPD) | Período de Retenção |
|---|---|---|---|
| Nome do Cliente | Identificação na entrega | Execução de Contrato (Art. 7º, V) | 5 anos (obrigação fiscal) |
| Telefone / WhatsApp | Contato operacional da entrega | Execução de Contrato (Art. 7º, V) | 5 anos |
| Endereço de Entrega | Local de entrega do pedido | Execução de Contrato (Art. 7º, V) | 5 anos |
| E-mail | Autenticação e recibos | Execução de Contrato (Art. 7º, V) | Enquanto a conta estiver ativa |
| Histórico de Pedidos | Gestão de vendas e fiscal | Obrigação Legal/Regulatória (Art. 7º, II) | 5 anos |
| Logs de Acesso e IP | Segurança da informação | Marco Civil da Internet (Art. 15) | 6 meses |

---

## 2. Direitos do Titular (Art. 18 LGPD)

### 2.1 Direito à Exclusão / Anonimização
- Mediante solicitação formal do titular:
  - O perfil do usuário em `profiles` e `auth.users` é desativado e anonimizado (`nome: 'Cliente Anonimizado'`, `email: 'anon_uuid@deleted.local'`).
  - Endereços salvos em `addresses` são expurgados imediatamente.
  - Dados estritamente necessários para prestação de contas fiscais (número do pedido, valor, data) são mantidos dissociados de identidade nominal.

### 2.2 Medidas Técnicas de Proteção
- Chaves privadas mantidas em variáveis de ambiente restritas à Vercel.
- Criptografia em trânsito via TLS 1.3 obrigatório (HSTS ativo).
- Criptografia no App móvel utilizando AES-256-GCM com chaves no SecureStore de hardware.
- RLS ativado em 100% das tabelas do banco de dados relacional.
