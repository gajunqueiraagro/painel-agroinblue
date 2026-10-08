/**
 * useFornecedoresDoCliente — FORN-SELETOR-PADRAO-01 passo 1a. A ligação do LEITOR ÚNICO com o banco e com a tela.
 *
 * ⚠ UMA INSTÂNCIA DO LEITOR PARA O APLICATIVO (`leitorDeFornecedores`): o cache é dela, por cliente. Seletor de fornecedor
 *   NÃO consulta `financeiro_fornecedores` por conta própria — chama este hook.
 * ⚠ QUEM GRAVA NO CADASTRO chama `notificarFornecedoresMudaram(cliente)` depois de gravar, só no sucesso.
 * ⚠ TROCAR DE CLIENTE NUNCA MOSTRA A LISTA DO ANTERIOR: o que o hook devolve é sempre do cliente pedido NESTE render
 *   (o estado guarda de quem é; resposta atrasada de outro cliente é descartada).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  criarLeitorDeFornecedores, type FonteDeFornecedores, type FornecedorLido, type LeitorDeFornecedores,
} from '@/lib/fornecedores/leitorDeFornecedores';

const COLUNAS = 'id, nome, cpf_cnpj, fazenda_id, ativo, tipo_recebimento, pix_tipo_chave, pix_chave, banco, agencia, conta, tipo_conta, cpf_cnpj_pagamento, nome_favorecido, observacao_pagamento';

type LinhaDoBanco = Omit<FornecedorLido, 'ativo'> & { ativo: boolean | null };

/* `ativo` nulo no banco conta como ativo (a regra do seletor sempre foi `ativo !== false`) */
const lido = (r: LinhaDoBanco): FornecedorLido => ({ ...r, ativo: r.ativo !== false });

export const fonteDoBanco: FonteDeFornecedores = {
  lerPagina: async (clienteId, de, ate, contar) => {
    const { data, error, count } = await supabase
      .from('financeiro_fornecedores')
      .select(COLUNAS, contar ? { count: 'exact' } : undefined)
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .order('nome').order('id')
      .range(de, ate);
    if (error) throw new Error(error.message);
    return { linhas: (data ?? []).map(lido), total: contar ? (count ?? null) : null };
  },
  lerPorId: async (clienteId, id) => {
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .select(COLUNAS)
      .eq('cliente_id', clienteId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? lido(data) : null;
  },
};

export const leitorDeFornecedores: LeitorDeFornecedores = criarLeitorDeFornecedores(fonteDoBanco);

/** O cadastro de fornecedores deste cliente mudou (criar, editar, inativar, reativar, fundir): quem mostra relê. */
export function notificarFornecedoresMudaram(clienteId: string | null | undefined): void {
  if (clienteId) leitorDeFornecedores.notificarMudou(clienteId);
}

export const FRASE_FALHA_AO_LER_FORNECEDORES = 'Não foi possível carregar os fornecedores.';

interface Estado {
  cliente: string | null;
  lista: FornecedorLido[] | null;
  erro: string | null;
  gravadoDe: string | null;
  gravado: FornecedorLido | null;
}
const VAZIO: Estado = { cliente: null, lista: null, erro: null, gravadoDe: null, gravado: null };
const SEM_NINGUEM: FornecedorLido[] = [];

export interface FornecedoresDoCliente {
  /** Os ATIVOS do cliente pedido. Vazia enquanto lê, e sempre deste cliente. */
  fornecedores: FornecedorLido[];
  /** O valor gravado (`gravadoId`) quando NÃO está entre os ativos: o campo o mostra marcado "inativo". */
  gravado: FornecedorLido | null;
  carregando: boolean;
  /** A frase da falha (nulo = sem falha). O campo a escreve ao lado, com "Tentar de novo". */
  erro: string | null;
  tentarDeNovo: () => void;
}

export function useFornecedoresDoCliente(
  clienteId: string | null | undefined, gravadoId?: string | null, leitor: LeitorDeFornecedores = leitorDeFornecedores,
): FornecedoresDoCliente {
  const cliente = clienteId || null;
  const idGravado = gravadoId || null;
  const [estado, setEstado] = useState<Estado>(VAZIO);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!cliente) return;
    return leitor.inscrever(cliente, () => setVersao((v) => v + 1));
  }, [cliente, leitor]);

  useEffect(() => {
    if (!cliente) return;
    let vivo = true;
    leitor.ler(cliente).then(
      (lista) => { if (vivo) setEstado((e) => ({ ...(e.cliente === cliente ? e : VAZIO), cliente, lista, erro: null })); },
      (e: unknown) => {
        if (!vivo) return;
        const detalhe = e instanceof Error ? e.message : String(e);
        setEstado((a) => ({ ...(a.cliente === cliente ? a : VAZIO), cliente, lista: null, erro: `${FRASE_FALHA_AO_LER_FORNECEDORES} (${detalhe})` }));
      },
    );
    return () => { vivo = false; };
  }, [cliente, versao, leitor]);

  /* ⚠ SÓ O QUE É DESTE CLIENTE: estado de outro cliente não é lido; na troca vale o cache do novo (ou nada) */
  const doCliente = estado.cliente === cliente;
  const lista = (doCliente ? estado.lista : null) ?? (cliente ? leitor.doCache(cliente) : null);
  const erro = doCliente ? estado.erro : null;
  const foraDosAtivos = !!cliente && !!idGravado && lista !== null && !lista.some((f) => f.id === idGravado);

  useEffect(() => {
    if (!cliente || !idGravado || !foraDosAtivos) return;
    let vivo = true;
    const chave = `${cliente}|${idGravado}`;
    leitor.lerPorId(cliente, idGravado).then(
      (f) => { if (vivo) setEstado((e) => (e.cliente === cliente ? { ...e, gravadoDe: chave, gravado: f } : e)); },
      () => { /* o gravado que não se conseguiu ler fica sem nome; a lista segue valendo */ },
    );
    return () => { vivo = false; };
  }, [cliente, idGravado, foraDosAtivos, versao, leitor]);

  const tentarDeNovo = useCallback(() => setVersao((v) => v + 1), []);
  const gravado = doCliente && foraDosAtivos && estado.gravadoDe === `${cliente}|${idGravado}` ? estado.gravado : null;

  return {
    fornecedores: lista ?? SEM_NINGUEM,
    gravado,
    carregando: !!cliente && lista === null && erro === null,
    erro,
    tentarDeNovo,
  };
}
