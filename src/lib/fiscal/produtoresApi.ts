/**
 * FISCAL onda 1 (a) · CADASTROS › PRODUTORES — a API: TODA leitura e escrita da tela passa por aqui.
 *
 * ⚠ ESCRITA SÓ PELAS FUNÇÕES DA 117290 (as tabelas fiscais não aceitam INSERT/UPDATE do `authenticated`), sempre em dois tempos:
 * `simular = true` é a prévia (nada grava) e o mesmo pedido com `simular = false` grava. Assinaturas lidas no proto em 09/11
 * (`pg_get_function_arguments`): fn_fiscal_titular_gravar(p_cliente_id, p_titular_id, p_dados, p_simular) · fn_fiscal_fazenda_titulares_gravar
 * (p_fazenda_id, p_inicio, p_titulares, p_simular) · fn_fiscal_titular_condicao_ibs_gravar(p_titular_id, p_inicio, p_condicao, p_motivo,
 * p_simular) · fn_fiscal_titular_grupo_gravar(p_titular_id, p_inicio, p_empresas, p_simular) · fn_fiscal_conta_titular_gravar(p_conta_id,
 * p_titular_id, p_simular) · fn_fiscal_acordo_rateio_gravar(p_cliente_id, p_acordo_id, p_dados, p_simular).
 * ⚠ LEITURA: a lista e os acordos pelas funções; o histórico da condição, os dados do imóvel e as contas direto da tabela, SEMPRE com
 * `.eq('cliente_id', …)` (a RLS por tenant filtra de novo).
 * ⚠ INJETÁVEL (o molde do Patrimônio): a bancada dos prints passa uma API em memória; a tela não sabe a diferença.
 * ⚠ ERRO: a frase pronta do banco (P0001) vai ao operador; o resto vira frase genérica, o texto no console (OC-ABRIR-LENTO-01).
 * ⚠ `(supabase as any)`: as funções e colunas novas nasceram depois do `types.ts` (a única exceção do zero-cast).
 */
import { supabase } from '@/integrations/supabase/client';
import { acordoDaLinha, linhas, titularDaLinha, txt, type Acordo, type CondicaoIbs, type Titular } from './produtores';

export type Resultado<T> = { ok: true; dados: T; erro?: undefined } | { ok: false; erro: string; dados?: undefined };

export interface CondicaoDoHistorico { id: string; condicao: CondicaoIbs | string; vigencia_inicio: string; vigencia_fim: string | null; motivo: string }
export interface ImovelDaFazenda { fazenda_id: string; nirf: string | null; ccir: string | null; car: string | null }
export interface ContaDoCliente { id: string; nome: string; banco: string | null; tipo_conta: string | null; titular_nome: string | null; titular_documento: string | null }
export interface ParteParaGravar { titular_id: string; participacao: number; condicao: string; registra: string }
export interface EmpresaParaGravar { empresa_id: string; participacao: number; atividade: string; entra_no_limite: boolean }

export interface ProdutoresApi {
  lista(clienteId: string): Promise<Resultado<Titular[]>>;
  acordos(clienteId: string): Promise<Resultado<Acordo[]>>;
  historicoDaCondicao(clienteId: string, titularId: string): Promise<Resultado<CondicaoDoHistorico[]>>;
  imoveis(clienteId: string): Promise<Resultado<ImovelDaFazenda[]>>;
  contas(clienteId: string): Promise<Resultado<ContaDoCliente[]>>;
  gravarTitular(clienteId: string, titularId: string | null, dados: Record<string, unknown>, simular: boolean): Promise<Resultado<unknown>>;
  gravarComposicao(fazendaId: string, inicio: string, partes: ParteParaGravar[], simular: boolean): Promise<Resultado<unknown>>;
  gravarCondicao(titularId: string, inicio: string, condicao: CondicaoIbs, motivo: string, simular: boolean): Promise<Resultado<unknown>>;
  gravarGrupo(titularId: string, inicio: string, empresas: EmpresaParaGravar[], simular: boolean): Promise<Resultado<unknown>>;
  gravarContaTitular(contaId: string, titularId: string | null, simular: boolean): Promise<Resultado<unknown>>;
  gravarAcordo(clienteId: string, acordoId: string | null, dados: Record<string, unknown>, simular: boolean): Promise<Resultado<unknown>>;
}

export function fraseDoErroFiscal(error: { code?: string; message?: string } | null | undefined, padrao = 'Não consegui gravar. Tente de novo.'): string {
  if (!error) return padrao;
  if (error.code === 'P0001') return error.message ?? padrao;
  if (error.code === '42501') return 'Sem acesso a este cliente.';
  console.error('[produtores]', error);
  return padrao;
}

const tabela = (nome: string) => (supabase as any).from(nome);

async function rpc(nome: string, args: Record<string, unknown>, padrao?: string): Promise<Resultado<unknown>> {
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) return { ok: false, erro: fraseDoErroFiscal(error, padrao) };
  return { ok: true, dados: data };
}

export const apiDoBanco: ProdutoresApi = {
  async lista(clienteId) {
    const r = await rpc('fn_fiscal_titulares_lista', { p_cliente_id: clienteId }, 'Não consegui ler os produtores. Tente de novo.');
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, dados: linhas(r.dados).map(titularDaLinha) };
  },
  async acordos(clienteId) {
    const r = await rpc('fn_fiscal_acordos_lista', { p_cliente_id: clienteId }, 'Não consegui ler os acordos. Tente de novo.');
    if (!r.ok) return { ok: false, erro: r.erro };
    return { ok: true, dados: linhas(r.dados).map(acordoDaLinha) };
  },
  async historicoDaCondicao(clienteId, titularId) {
    const { data, error } = await tabela('fiscal_titular_condicao_ibs').select('id, condicao, vigencia_inicio, vigencia_fim, motivo')
      .eq('cliente_id', clienteId).eq('titular_id', titularId).is('substituida_em', null).order('vigencia_inicio', { ascending: false });
    if (error) return { ok: false, erro: fraseDoErroFiscal(error, 'Não consegui ler o histórico. Tente de novo.') };
    return { ok: true, dados: linhas(data).map(r => ({
      id: String(r.id ?? ''), condicao: txt(r.condicao) ?? '', vigencia_inicio: txt(r.vigencia_inicio) ?? '', vigencia_fim: txt(r.vigencia_fim),
      motivo: txt(r.motivo) ?? '',
    })) };
  },
  async imoveis(clienteId) {
    const { data, error } = await tabela('fazenda_cadastros').select('fazenda_id, nirf, ccir, car').eq('cliente_id', clienteId);
    if (error) return { ok: false, erro: fraseDoErroFiscal(error, 'Não consegui ler os imóveis. Tente de novo.') };
    return { ok: true, dados: linhas(data).map(r => ({ fazenda_id: String(r.fazenda_id ?? ''), nirf: txt(r.nirf), ccir: txt(r.ccir), car: txt(r.car) })) };
  },
  async contas(clienteId) {
    const { data, error } = await tabela('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao, banco, tipo_conta, titular_nome, titular_documento')
      .eq('cliente_id', clienteId).eq('ativa', true).order('ordem_exibicao');
    if (error) return { ok: false, erro: fraseDoErroFiscal(error, 'Não consegui ler as contas. Tente de novo.') };
    return { ok: true, dados: linhas(data).map(r => ({
      id: String(r.id ?? ''), nome: txt(r.nome_exibicao) ?? txt(r.nome_conta) ?? '', banco: txt(r.banco), tipo_conta: txt(r.tipo_conta),
      titular_nome: txt(r.titular_nome), titular_documento: txt(r.titular_documento),
    })) };
  },
  gravarTitular: (clienteId, titularId, dados, simular) =>
    rpc('fn_fiscal_titular_gravar', { p_cliente_id: clienteId, p_titular_id: titularId, p_dados: dados, p_simular: simular }),
  gravarComposicao: (fazendaId, inicio, partes, simular) =>
    rpc('fn_fiscal_fazenda_titulares_gravar', { p_fazenda_id: fazendaId, p_inicio: inicio, p_titulares: partes, p_simular: simular }),
  gravarCondicao: (titularId, inicio, condicao, motivo, simular) =>
    rpc('fn_fiscal_titular_condicao_ibs_gravar', { p_titular_id: titularId, p_inicio: inicio, p_condicao: condicao, p_motivo: motivo, p_simular: simular }),
  gravarGrupo: (titularId, inicio, empresas, simular) =>
    rpc('fn_fiscal_titular_grupo_gravar', { p_titular_id: titularId, p_inicio: inicio, p_empresas: empresas, p_simular: simular }),
  gravarContaTitular: (contaId, titularId, simular) =>
    rpc('fn_fiscal_conta_titular_gravar', { p_conta_id: contaId, p_titular_id: titularId, p_simular: simular }),
  gravarAcordo: (clienteId, acordoId, dados, simular) =>
    rpc('fn_fiscal_acordo_rateio_gravar', { p_cliente_id: clienteId, p_acordo_id: acordoId, p_dados: dados, p_simular: simular }),
};
