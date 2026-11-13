/**
 * FIN-GUARDA-CHUVA G2 — a LINHA DE CRÉDITO na tela (dono puro). O banco (118060) é a fonte: `fn_linha_credito_salvar` (prévia =
 * p_simular), `fn_linha_credito_cancelar` e `fn_linha_credito_tela` (limite × soma dos contratos-filhos; a liquidação de um irmão da
 * mesma linha NÃO soma no liberado). Aqui só: o rótulo, as opções do seletor do contrato, a leitura das respostas do banco, a faixa
 * do grupo e as frases dos avisos/recusas. Nenhuma soma de dinheiro é feita aqui.
 */

export interface LinhaDoCadastro {
  id: string;
  credorId: string | null;
  credorNome: string | null;
  numero: string | null;
  programa: string | null;
  descricao: string | null;
  limite: number | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  cancelada: boolean;
}

/** O nome da linha em uma frase: "PR-78.179 · FCO Armazenagem" (nº primeiro; sem nada, "Linha de crédito"). */
export function rotuloDaLinha(l: Pick<LinhaDoCadastro, 'numero' | 'programa' | 'descricao'>): string {
  const partes = [l.numero, l.programa ?? l.descricao].map((p) => (p ?? '').trim()).filter(Boolean);
  return partes.length ? partes.join(' · ') : 'Linha de crédito';
}

export interface OpcaoDeLinha { value: string; label: string }

/**
 * As opções do seletor "Linha de crédito" do contrato: SÓ as vivas, as do MESMO banco do contrato primeiro (depois as outras),
 * cada grupo em ordem de rótulo. O rótulo leva o banco: "PR-78.179 · FCO Armazenagem · Banco BRDE".
 * A linha que o contrato JÁ TEM entra mesmo cancelada (para o valor salvo aparecer), marcada "(cancelada)".
 */
export function opcoesDeLinha(linhas: readonly LinhaDoCadastro[], credorDoContrato: string | null, linhaAtual: string | null = null): OpcaoDeLinha[] {
  const visiveis = linhas.filter((l) => !l.cancelada || l.id === linhaAtual);
  const chave = (l: LinhaDoCadastro) => (credorDoContrato && l.credorId === credorDoContrato ? 0 : 1);
  return [...visiveis]
    .sort((a, b) => chave(a) - chave(b) || rotuloDaLinha(a).localeCompare(rotuloDaLinha(b), 'pt-BR') || a.id.localeCompare(b.id))
    .map((l) => ({
      value: l.id,
      label: [rotuloDaLinha(l), l.credorNome].filter(Boolean).join(' · ') + (l.cancelada ? ' (cancelada)' : ''),
    }));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null);

export interface ContratoDaLinha {
  id: string; numero: string | null; descricao: string | null; status: string | null;
  contratado: number; liberado: number; liberadoPorLiquidacao: number; saldo: number; jurosPagos: number; credorDiferente: boolean;
}
export interface TotaisDaLinha {
  contratos: number; contratado: number; liberado: number; liberadoPorLiquidacao: number;
  faltaLiberar: number | null; saldo: number; jurosPagos: number;
}
export interface TelaDaLinha { linha: LinhaDoCadastro; contratos: ContratoDaLinha[]; totais: TotaisDaLinha; avisos: string[] }

/** Lê a resposta de `fn_linha_credito_tela`. Fora do formato = null (a tela diz "Não consegui ler a linha"), nunca inventa. */
export function lerTelaDaLinha(resposta: unknown): TelaDaLinha | null {
  const r = obj(resposta);
  const l = obj(r?.linha);
  const t = obj(r?.totais);
  if (!r || !l || !t || typeof l.id !== 'string') return null;
  const linha: LinhaDoCadastro = {
    id: l.id, credorId: txt(l.credor_id), credorNome: txt(l.credor), numero: txt(l.numero), programa: txt(l.programa), descricao: txt(l.descricao),
    limite: num(l.limite), vigenciaInicio: txt(l.vigencia_inicio), vigenciaFim: txt(l.vigencia_fim), cancelada: false,
  };
  const contratos: ContratoDaLinha[] = (Array.isArray(r.contratos) ? r.contratos : []).flatMap((c) => {
    const o = obj(c);
    if (!o || typeof o.id !== 'string') return [];
    return [{
      id: o.id, numero: txt(o.numero), descricao: txt(o.descricao), status: txt(o.status),
      contratado: num(o.contratado) ?? 0, liberado: num(o.liberado) ?? 0, liberadoPorLiquidacao: num(o.liberado_por_liquidacao) ?? 0,
      saldo: num(o.saldo) ?? 0, jurosPagos: num(o.juros_pagos) ?? 0, credorDiferente: o.credor_diferente === true,
    }];
  });
  const totais: TotaisDaLinha = {
    contratos: num(t.contratos) ?? 0, contratado: num(t.contratado) ?? 0, liberado: num(t.liberado) ?? 0,
    liberadoPorLiquidacao: num(t.liberado_por_liquidacao) ?? 0, faltaLiberar: num(t.falta_liberar),
    saldo: num(t.saldo) ?? 0, jurosPagos: num(t.juros_pagos) ?? 0,
  };
  const avisos = (Array.isArray(r.avisos) ? r.avisos : []).flatMap((a) => { const o = obj(a); return o && typeof o.codigo === 'string' ? [o.codigo] : []; });
  return { linha, contratos, totais, avisos };
}

/** A frase de cada aviso do banco (salvar e tela). Código desconhecido aparece cru — nunca some. */
export const FRASE_DO_AVISO: Record<string, string> = {
  contratado_maior_que_limite: 'A soma dos contratos da linha passa do limite.',
  contratos_de_outro_credor: 'A linha tem contratos de outro banco.',
  contrato_de_outro_credor: 'Há contrato de outro banco nesta linha.',
  liberado_maior_que_limite: 'O liberado passa do limite da linha.',
  vigencia_encerrada_com_saldo_a_liberar: 'A vigência acabou e ainda falta liberar.',
};
export const fraseDoAviso = (codigo: string): string => FRASE_DO_AVISO[codigo] ?? codigo;

export interface FormDaLinha {
  credorId: string | null; numero: string; programa: string; descricao: string;
  limite: number | null; vigenciaInicio: string | null; vigenciaFim: string | null;
}
export const formDaLinhaVazio = (credorId: string | null = null): FormDaLinha =>
  ({ credorId, numero: '', programa: '', descricao: '', limite: null, vigenciaInicio: null, vigenciaFim: null });
export const formDaLinha = (l: LinhaDoCadastro): FormDaLinha => ({
  credorId: l.credorId, numero: l.numero ?? '', programa: l.programa ?? '', descricao: l.descricao ?? '',
  limite: l.limite, vigenciaInicio: l.vigenciaInicio, vigenciaFim: l.vigenciaFim,
});

/** O `p_dados` de `fn_linha_credito_salvar` — os 7 campos, sempre todos (o banco compara antes × depois e diz "sem mudança"). */
export function pedidoDaLinha(f: FormDaLinha): Record<string, string | number | null> {
  return {
    credor_id: f.credorId, numero: f.numero.trim() || null, programa: f.programa.trim() || null, descricao: f.descricao.trim() || null,
    limite: f.limite, vigencia_inicio: f.vigenciaInicio, vigencia_fim: f.vigenciaFim,
  };
}

export interface PreviaDaLinha {
  ok: boolean; semMudanca: boolean; id: string | null; recusa: string | null; avisos: string[];
  /** campo a campo, só os que mudam: [rótulo, antes, depois] — antes é null na criação */
  mudancas: { campo: string; antes: string | null; depois: string | null }[];
}

const ROTULO_DO_CAMPO: Record<string, string> = {
  credor_id: 'Banco', numero: 'Nº da cédula', programa: 'Programa', descricao: 'Descrição', limite: 'Limite',
  vigencia_inicio: 'Início da vigência', vigencia_fim: 'Fim da vigência',
};
const fmtReal = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Lê a resposta do salvar (prévia ou gravação). `nomeDoCredor` traduz o id do banco para o nome no antes × depois. */
export function lerPreviaDaLinha(resposta: unknown, nomeDoCredor: (id: string) => string | null = () => null): PreviaDaLinha | null {
  const r = obj(resposta);
  if (!r || typeof r.ok !== 'boolean') return null;
  const recusa = obj(r.recusa);
  const antes = obj(r.antes);
  const depois = obj(r.depois) ?? {};
  const mostra = (campo: string, v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (campo === 'credor_id') return typeof v === 'string' ? (nomeDoCredor(v) ?? 'banco escolhido') : null;
    if (campo === 'limite') { const n = num(v); return n === null ? null : fmtReal(n); }
    if (campo.startsWith('vigencia')) return typeof v === 'string' ? dataBr(v) : null;
    return typeof v === 'string' ? v : String(v);
  };
  const mudancas = Object.keys(ROTULO_DO_CAMPO).flatMap((campo) => {
    const a = antes ? mostra(campo, antes[campo]) : null;
    const d = mostra(campo, depois[campo]);
    return a === d ? [] : [{ campo: ROTULO_DO_CAMPO[campo], antes: antes ? a : null, depois: d }];
  });
  return {
    ok: r.ok, semMudanca: r.sem_mudanca === true, id: txt(r.id), recusa: recusa ? (txt(recusa.frase) ?? 'Recusado pelo banco.') : null,
    avisos: (Array.isArray(r.avisos) ? r.avisos : []).flatMap((a) => { const o = obj(a); return o && typeof o.codigo === 'string' ? [fraseDoAviso(o.codigo)] : []; }),
    mudancas,
  };
}

/**
 * A FAIXA DO GRUPO na lista (Chat 22:35): Limite · Liberado · Falta liberar · Saldo · Juros pagos. Liberado e pago em VERDE;
 * falta liberar e saldo devedor em VERMELHO (o que ainda é dívida/pendente). Sem limite, "Falta liberar" é "—" (dado ausente).
 */
export interface ItemDaFaixa { rotulo: string; valor: string; tom: 'verde' | 'vermelho' | 'neutro' }
export function faixaDaLinha(t: TotaisDaLinha, limite: number | null): ItemDaFaixa[] {
  return [
    { rotulo: 'Limite', valor: limite === null ? '—' : fmtReal(limite), tom: 'neutro' },
    { rotulo: 'Liberado', valor: fmtReal(t.liberado), tom: 'verde' },
    { rotulo: 'Falta liberar', valor: t.faltaLiberar === null ? '—' : fmtReal(t.faltaLiberar), tom: t.faltaLiberar !== null && t.faltaLiberar > 0 ? 'vermelho' : 'neutro' },
    { rotulo: 'Saldo devedor', valor: fmtReal(t.saldo), tom: t.saldo > 0 ? 'vermelho' : 'neutro' },
    { rotulo: 'Juros pagos', valor: fmtReal(t.jurosPagos), tom: 'verde' },
  ];
}
