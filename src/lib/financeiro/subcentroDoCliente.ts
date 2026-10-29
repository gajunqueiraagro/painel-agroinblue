/**
 * P172 — o que a tela do Plano de Contas precisa para falar com o ESCRITOR ÚNICO dos subcentros do cliente (P171,
 * `fn_subcentro_cliente_criar/_renomear/_inativar/_reativar`, só o admin AGROinBLUE; o banco recusa os outros com 42501).
 * A tela não escreve no plano e não decide nada: SIMULA (a prévia é a própria função com `p_simular`), mostra a frase e só
 * depois grava. Puro: nenhum acesso a banco aqui.
 */
import { FRASE_FALHA_SEM_MOTIVO, FRASE_RESPOSTA_INESPERADA } from './dividendosCadastro';

export const FN_SUBCENTRO_CLIENTE = {
  criar: 'fn_subcentro_cliente_criar',
  renomear: 'fn_subcentro_cliente_renomear',
  inativar: 'fn_subcentro_cliente_inativar',
  reativar: 'fn_subcentro_cliente_reativar',
} as const;

export interface MoldeDeSubcentro {
  chave: string;
  tipo_operacao: string;
  macro_custo: string;
  grupo_custo: string;
  centro_custo: string;
  ordem_exibicao: number;
}

/**
 * OS CENTROS QUE ACEITAM SUBCENTRO DO CLIENTE — espelho declarado de `_fn_subcentro_cliente_molde` (20261028114020), que é
 * fechada (a tela não a lê). Serve só para a tela saber ONDE pôr o "+ Novo subcentro do cliente" e quais linhas têm renomear e
 * inativar; quem decide é o banco (conta fora do molde é recusada). Centro novo = uma linha lá (por migration) e uma aqui.
 */
export const MOLDES_SUBCENTRO_CLIENTE: readonly MoldeDeSubcentro[] = [
  { chave: 'repasses_terceiros', tipo_operacao: '2-Saídas', macro_custo: 'Saída Financeira', grupo_custo: 'Outras Saídas',
    centro_custo: 'Repasses a terceiros', ordem_exibicao: 16006 },
];

/** O molde de uma conta DO CLIENTE (`cliente_id` preenchido) que está num centro que aceita; senão, nulo. */
export function moldeDaConta(c: {
  cliente_id?: string | null; tipo_operacao: string; macro_custo: string; grupo_custo: string | null; centro_custo: string;
}): MoldeDeSubcentro | null {
  if (!c.cliente_id) return null;
  return MOLDES_SUBCENTRO_CLIENTE.find(m => m.tipo_operacao === c.tipo_operacao && m.macro_custo === c.macro_custo
    && m.grupo_custo === (c.grupo_custo ?? '') && m.centro_custo === c.centro_custo) ?? null;
}

export type RespostaDoSubcentro =
  | {
      ok: true;
      /** Renomear: quantos lançamentos recebem o nome novo (a chave da conta não muda). */
      lancamentosTocados: number;
      /** Inativar/reativar/renomear: quantos lançamentos vivos usam a conta (a foto de antes). */
      lancamentosVivos: number;
    }
  | { ok: false; frase: string };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function inteiro(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Lê o par (data, error) de uma chamada `fn_subcentro_cliente_*`.
 * Erro do banco: a mensagem JÁ é a frase (42501 "Só o consultor…"; P0001 "… Nada foi gravado."). Recusa na simulação: vem em
 * `recusa.frase`. Peça torta nunca vira sucesso.
 */
export function lerRespostaDoSubcentro(data: unknown, error: { message?: string | null } | null | undefined): RespostaDoSubcentro {
  if (error) {
    const frase = typeof error.message === 'string' && error.message.trim() !== '' ? error.message.trim() : FRASE_FALHA_SEM_MOTIVO;
    return { ok: false, frase };
  }
  if (!ehObjeto(data) || !('recusa' in data)) return { ok: false, frase: FRASE_RESPOSTA_INESPERADA };
  const recusa = data.recusa;
  if (recusa !== null) {
    if (ehObjeto(recusa) && typeof recusa.frase === 'string' && recusa.frase.trim() !== '') return { ok: false, frase: recusa.frase };
    return { ok: false, frase: FRASE_RESPOSTA_INESPERADA };
  }
  const antes = ehObjeto(data.antes) ? data.antes : null;
  return { ok: true, lancamentosTocados: inteiro(data.lancamentos_tocados), lancamentosVivos: inteiro(antes?.lancamentos_vivos) };
}

export type GestoDoSubcentro = keyof typeof FN_SUBCENTRO_CLIENTE;

const lancamentos = (n: number) => (n === 1 ? '1 lançamento' : `${n.toLocaleString('pt-BR')} lançamentos`);

/** A frase da prévia (a simulação passou). Os números são os do banco. */
export function fraseDaPrevia(gesto: GestoDoSubcentro, r: { lancamentosTocados: number; lancamentosVivos: number }, centro: string): string {
  if (gesto === 'criar') return `A conta nasce em ${centro}, fora do DRE, só para este cliente.`;
  if (gesto === 'renomear') {
    return r.lancamentosTocados === 0 ? 'Nenhum lançamento muda de nome.'
      : `${lancamentos(r.lancamentosTocados)} ${r.lancamentosTocados === 1 ? 'muda' : 'mudam'} de nome (a classificação não muda).`;
  }
  if (gesto === 'inativar') {
    const quem = r.lancamentosVivos === 0 ? 'Nenhum lançamento usa esta conta.'
      : `${lancamentos(r.lancamentosVivos)} ${r.lancamentosVivos === 1 ? 'usa' : 'usam'} esta conta e ${r.lancamentosVivos === 1 ? 'fica' : 'ficam'} nela, sem mudança.`;
    return `${quem} Ela deixa de ser oferecida em lançamentos novos.`;
  }
  return 'Ela volta a ser oferecida em lançamentos novos.';
}
