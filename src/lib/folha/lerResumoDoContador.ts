/**
 * FOLHA-RESUMO-CONTADOR-01 (noite 24/11) — o "Extrato Mensal" do contador (o RESUMO da folha, que chega junto do recibo) que a Caixa dava como
 * "não reconhecido". PURO: recebe as linhas de cada página (as do `montarLinhas`, células por " | ") e devolve, por EMPRESA (CAEPF), os
 * empregados com o líquido e o FGTS de cada um e o "Valor do FGTS" do quadro de totais. É ele que vai à `fn_folha_resumo_fgts_aplicar`
 * (Code 6, 118630): a previsão "FGTS 13º 1ª parcela" por fazenda.
 *
 * Layout (a forma, nunca o dado; ⚠ documento real NUNCA no repo, teste ou log — os testes usam linhas inventadas):
 *   "Empresa: | <cód> - <nome da empresa> | Página: | 1/4" · "CAEPF: | <documento> | Emissão: | …" · "Cálculo: | 13o Adiantamento | …" ·
 *   "Competência: | 11/2026" · "EXTRATO MENSAL"; por empregado "Empr.: | <cód> <NOME> | Situação: | …", "ND: | … | Líquido: | <valor>" e
 *   "NF: | … | Valor FGTS: | <valor> | …"; no fim da empresa o quadro "… | Base do FGTS: | <valor>" e "… | Valor do FGTS: | <valor>".
 * CONFERE = a soma do FGTS dos empregados é o "Valor do FGTS" da empresa (ao centavo). Não fecha = a Caixa mostra a diferença; quem decide
 * é o operador (a previsão usa o total do contador).
 * O que não for reconhecido com certeza devolve 'nao_sei' — nunca chuta tipo nem competência.
 */
import { valorDoRecibo, type TipoDaFolha } from './lerFolha';

export interface EmpregadoDoResumo { codigo: string; nome: string; liquido: number | null; fgts: number | null }
export interface EmpresaDoResumo {
  codigo: string;
  /** o nome da empresa no documento ("FULANO FAZ BOA VISTA") — é por ele que o banco acha a fazenda */
  empresa: string;
  /** o CAEPF/CEI/CNPJ, só dígitos */
  cei: string;
  /** o "Valor do FGTS" do quadro de totais (null = o quadro não veio) */
  fgts: number | null;
  baseFgts: number | null;
  /** a soma do FGTS dos empregados */
  somaDosEmpregados: number;
  confere: boolean;
  empregados: EmpregadoDoResumo[];
  paginas: number[];
}
export interface ResumoLido {
  tipo: TipoDaFolha;
  /** 'AAAA-MM' */
  competencia: string;
  empresas: EmpresaDoResumo[];
  /** a soma do "Valor do FGTS" das empresas */
  totalFgts: number;
}
export type LeituraDoResumo = { ok: true; resumo: ResumoLido } | { ok: false; frase: string };

export const FRASE_NAO_E_RESUMO = 'Não é um resumo do contador que eu conheça.';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim());
const digitos = (s: string) => s.replace(/\D/g, '');
const centavos = (v: number) => Math.round(v * 100);
/** o valor logo depois do rótulo (a célula seguinte) */
function depoisDe(c: string[], rotulo: string): number | null {
  const i = c.indexOf(rotulo);
  return i < 0 ? null : valorDoRecibo(c[i + 1] ?? '');
}

function tipoDoCalculo(texto: string): TipoDaFolha | null {
  const t = semAcento(texto);
  if (/^13o?\.?\s*adiantamento$/.test(t)) return '13_1';
  if (/^13o?\.?\s*(integral|final|salario)$/.test(t)) return '13_2';
  if (/^(mensal|folha mensal)$/.test(t)) return 'mensal';
  return null;
}

export function lerResumoDoContador(paginas: string[][]): LeituraDoResumo {
  const ehResumo = paginas.some((p) => p.some((l) => semAcento(l).trim() === 'extrato mensal'));
  if (!ehResumo) return { ok: false, frase: FRASE_NAO_E_RESUMO };
  const empresas = new Map<string, EmpresaDoResumo>();
  let tipo: TipoDaFolha | null = null;
  let competencia: string | null = null;
  for (let p = 0; p < paginas.length; p++) {
    let atual: EmpresaDoResumo | null = null;
    let codigo: string | null = null;
    let nome: string | null = null;
    let pessoa: EmpregadoDoResumo | null = null;
    for (const linha of paginas[p]) {
      const c = celulas(linha);
      if (c[0] === 'Empresa:' && /^\d+\s+-\s+\S/.test(c[1] ?? '')) {
        const m = (c[1] ?? '').match(/^(\d+)\s+-\s+(.+)$/);
        codigo = m ? m[1] : null; nome = m ? m[2].trim() : null;
        continue;
      }
      if (c[0] === 'CAEPF:' && codigo && nome) {
        const cei = digitos(c[1] ?? '');
        if (!cei) return { ok: false, frase: FRASE_NAO_E_RESUMO };
        const chave = `${cei}|${codigo}`;
        atual = empresas.get(chave) ?? null;
        if (!atual) {
          atual = { codigo, empresa: nome, cei, fgts: null, baseFgts: null, somaDosEmpregados: 0, confere: false, empregados: [], paginas: [] };
          empresas.set(chave, atual);
        }
        if (!atual.paginas.includes(p + 1)) atual.paginas.push(p + 1);
        continue;
      }
      if (c[0] === 'Cálculo:') {
        const t = tipoDoCalculo(c[1] ?? '');
        if (!t || (tipo && tipo !== t)) return { ok: false, frase: FRASE_NAO_E_RESUMO };
        tipo = t;
        continue;
      }
      if (c[0] === 'Competência:') {
        const m = (c[1] ?? '').match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
        const comp = m ? `${m[2]}-${m[1]}` : null;
        if (!comp || (competencia && competencia !== comp)) return { ok: false, frase: FRASE_NAO_E_RESUMO };
        competencia = comp;
        continue;
      }
      if (!atual) continue;
      if (c[0] === 'Empr.:') {
        const m = (c[1] ?? '').match(/^(\d+)\s+(.+)$/);
        pessoa = m ? { codigo: m[1], nome: m[2].trim(), liquido: null, fgts: null } : null;
        if (pessoa) atual.empregados.push(pessoa);
        continue;
      }
      if (c[0] === 'ND:' && pessoa) { pessoa.liquido = depoisDe(c, 'Líquido:'); continue; }
      if (c[0] === 'NF:' && pessoa) { pessoa.fgts = depoisDe(c, 'Valor FGTS:'); pessoa = null; continue; }
      const total = depoisDe(c, 'Valor do FGTS:');
      if (total !== null) { atual.fgts = total; continue; }
      const base = depoisDe(c, 'Base do FGTS:');
      if (base !== null) atual.baseFgts = base;
    }
  }
  if (!tipo || !competencia || empresas.size === 0) return { ok: false, frase: FRASE_NAO_E_RESUMO };
  const lista = [...empresas.values()].map((e) => {
    const soma = e.empregados.reduce((s, x) => s + centavos(x.fgts ?? 0), 0) / 100;
    return { ...e, somaDosEmpregados: soma, confere: e.fgts !== null && centavos(e.fgts) === centavos(soma) };
  });
  if (lista.every((e) => e.fgts === null)) return { ok: false, frase: FRASE_NAO_E_RESUMO };
  const totalFgts = lista.reduce((s, e) => s + centavos(e.fgts ?? 0), 0) / 100;
  return { ok: true, resumo: { tipo, competencia, empresas: lista, totalFgts } };
}
