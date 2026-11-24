/**
 * FOLHA-RESUMO-CONTADOR-01 — a REGRA PURA do resumo do contador ("Extrato Mensal") na Caixa: do `ResumoLido` ao pedido da
 * `fn_folha_resumo_fgts_aplicar` (Code 6, 118630: {md5, competencia, tipo, nome} + um item por empresa {empresa, cei, fgts, fazenda_id?})
 * e da resposta do banco às linhas da prévia (uma por empresa, na ordem do PDF).
 *
 * ⚠ A FAZENDA PELO CAEPF: o CAEPF do documento que está em `fiscal_caepf` (vivo) dá a fazenda (`fazenda_id` no item); sem ele, o banco
 *   tenta pelo nome da empresa e, sem achar, devolve a pendência 'sem_fazenda' (nada grava enquanto houver pendência).
 * ⚠ O BANCO DECIDE molde, vencimento, descrição e "já aplicado"; a tela só mostra. O que não vier é null ("—"), nunca zero.
 */
import type { EmpresaDoResumo, ResumoLido } from './lerResumoDoContador';
import { ROTULO_DO_TIPO, competenciaBR } from './folhaNaCaixa';

export interface DocumentoDoResumo { md5: string; competencia: string; tipo: ResumoLido['tipo']; nome: string }
export interface ItemDoResumo { empresa: string; cei: string; fgts: number; fazenda_id?: string }

const so = (s: string) => s.replace(/\D/g, '');

/** `fazendaDoCaepf`: CAEPF (só dígitos) → fazenda_id, os vivos do cliente. */
export function pedidoDoResumo(resumo: ResumoLido, nomeDoArquivo: string, md5DoDocumento: string, fazendaDoCaepf: ReadonlyMap<string, string>):
  { documento: DocumentoDoResumo; itens: ItemDoResumo[] } {
  return {
    documento: { md5: md5DoDocumento, competencia: resumo.competencia, tipo: resumo.tipo, nome: nomeDoArquivo },
    itens: resumo.empresas.filter((e) => e.fgts !== null && e.fgts > 0).map((e) => {
      const faz = fazendaDoCaepf.get(so(e.cei));
      return { empresa: e.empresa, cei: e.cei, fgts: e.fgts ?? 0, ...(faz ? { fazenda_id: faz } : {}) };
    }),
  };
}

export interface PrevisaoDoFgts { cei: string; fazenda: string | null; descricao: string | null; valor: number | null; vencimento: string | null; lancamentoId: string | null }
export interface PendenciaDoFgts { cei: string; pendencia: 'sem_fazenda' | 'sem_molde' | string }
export interface RespostaDoResumo { jaAplicado: boolean; previsoes: PrevisaoDoFgts[]; pendencias: PendenciaDoFgts[]; soma: number | null }

const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : null;
}
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(objeto).filter((x): x is Record<string, unknown> => x !== null) : []);

/** A resposta da função (prévia ou aplicar); null = não entendi. */
export function respostaDoResumo(data: unknown): RespostaDoResumo | null {
  const d = objeto(data);
  if (!d || d.ok !== true) return null;
  if (d.ja_aplicado === true) return { jaAplicado: true, previsoes: [], pendencias: [], soma: null };
  return {
    jaAplicado: false,
    previsoes: lista(d.previsoes).map((p) => ({
      cei: so(texto(p.cei) ?? ''), fazenda: texto(p.fazenda), descricao: texto(p.descricao), valor: numero(p.valor),
      vencimento: texto(p.vencimento), lancamentoId: texto(p.lancamento_id),
    })),
    pendencias: lista(d.pendencias).map((p) => ({ cei: so(texto(p.cei) ?? ''), pendencia: texto(p.pendencia) ?? 'pendente' })),
    soma: numero(d.soma),
  };
}

/* ═══ as linhas da prévia (uma por empresa) ═══ */
export type OQueAconteceNoFgts = 'preve' | 'sem_fazenda' | 'sem_molde' | 'sem_fgts' | 'sem_resposta';
export interface LinhaDoResumo {
  k: number; empresa: string; cei: string; fgts: number | null; somaDosEmpregados: number; confere: boolean; empregados: number;
  acontece: OQueAconteceNoFgts; fazenda: string | null; descricao: string | null; vencimento: string | null;
}
export function linhasDoResumo(resumo: ResumoLido, r: RespostaDoResumo | null): LinhaDoResumo[] {
  return resumo.empresas.map((e: EmpresaDoResumo, k) => {
    const cei = so(e.cei);
    const p = r?.previsoes.find((x) => x.cei === cei);
    const pend = r?.pendencias.find((x) => x.cei === cei);
    const acontece: OQueAconteceNoFgts = e.fgts === null || e.fgts <= 0 ? 'sem_fgts' : p ? 'preve'
      : pend ? (pend.pendencia === 'sem_molde' ? 'sem_molde' : 'sem_fazenda') : 'sem_resposta';
    return {
      k, empresa: e.empresa, cei: e.cei, fgts: e.fgts, somaDosEmpregados: e.somaDosEmpregados, confere: e.confere, empregados: e.empregados.length,
      acontece, fazenda: p?.fazenda ?? null, descricao: p?.descricao ?? null, vencimento: p?.vencimento ?? null,
    };
  });
}
/** O motivo de o "Prever" estar apagado (null = pode). */
export function motivoDoPrever(linhas: readonly LinhaDoResumo[], r: RespostaDoResumo | null): string | null {
  if (!r) return null;
  if (r.jaAplicado) return 'Este resumo já foi aplicado.';
  const n = linhas.filter((l) => l.acontece === 'sem_fazenda' || l.acontece === 'sem_molde').length;
  if (n) return `${n} ${n === 1 ? 'empresa sem fazenda ou sem molde' : 'empresas sem fazenda ou sem molde'}: cadastre o CAEPF na fazenda e abra de novo.`;
  if (!linhas.some((l) => l.acontece === 'preve')) return 'Nenhum FGTS a prever neste resumo.';
  return null;
}

/** "3 empresas · FGTS R$ 1.635,15 · confere" (a linha da Caixa) */
export function fraseDaLinhaDoResumo(resumo: ResumoLido): string {
  const n = resumo.empresas.length;
  const confere = resumo.empresas.every((e) => e.confere);
  return `Resumo do contador · ${n} ${n === 1 ? 'empresa' : 'empresas'} · ${confere ? 'FGTS confere' : 'FGTS não fecha'} · "Abrir" mostra a prévia`;
}
export const rotuloDoResumo = (resumo: ResumoLido): string => `Resumo · ${ROTULO_DO_TIPO[resumo.tipo]} · ${competenciaBR(resumo.competencia)}`;
