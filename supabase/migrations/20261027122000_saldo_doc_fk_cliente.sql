-- Alinha financeiro_saldo_documentos com as tabelas irmas (importacoes_v2,
-- saldos_v2): FK de cliente_id para clientes com ON DELETE CASCADE.
ALTER TABLE public.financeiro_saldo_documentos
  ADD CONSTRAINT financeiro_saldo_documentos_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE CASCADE;
