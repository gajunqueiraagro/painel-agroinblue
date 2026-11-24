/**
 * REBANHO-ORGAO-01 (F2) — o leitor do COMPROVANTE DE SALDO da IAGRO (MS). PURO: recebe as linhas do PDF como o `montarLinhas` as monta
 * (`src/lib/oc/leitura/montarLinhas.ts`: itens pela altura, células juntas por " | ") e devolve o saldo por espécie × sexo × faixa.
 * O leiaute (a forma, nunca o dado — os testes usam linhas inventadas):
 *   "Produtor: | <nome> | Situação: | ATIVO" · "Propriedade: | <fazenda> | PGA: | <n>" · "Inscrição: | <n> | …" · "Município: | <m> | …"
 *   "… | Vacina Brucelose: | dd/mm/aaaa" · "Fêmeas 0012 sem vacinação contra brucelose: | n" (ou "Fêmeas 0 a 12 Sem Brucelose: | n")
 *   a tabela: "[ESPÉCIE |] <FAIXA> | disponível | a confirmar | total", o sexo ("FÊMEA"/"MACHO") e a espécie em linha solta no meio do
 *   grupo; cada espécie fecha em "Total: | n"; "Saldo constante em | dd/mm/aaaa hh:mm:ss".
 * O sexo: as faixas de cada espécie vêm FÊMEA primeiro, MACHO depois; um sexo novo começa quando a faixa volta a "0 A 12".
 * PROVA: a soma das linhas de cada espécie = o "Total:" impresso; não fechou = 'nao_fecha' (nada se usa).
 */
import type { Faixa, PorFaixa, PorSexo } from './tipos';

export type Especie = 'BOVINO' | 'BUBALINO' | 'OVINO' | 'CAPRINO' | 'EQUINO' | 'SUINO';
const ESPECIES: readonly Especie[] = ['BOVINO', 'BUBALINO', 'OVINO', 'CAPRINO', 'EQUINO', 'SUINO'];

export interface LinhaDoSaldo { disponivel: number; aConfirmar: number; total: number }
export interface SaldoDaEspecie {
  especie: Especie;
  /** bovino/bubalino: as 4 faixas; ovino/caprino: [0-12, acima de 12, —, —] (faixas = 2) */
  faixas: 2 | 4;
  porSexo: PorSexo<LinhaDoSaldo[]>;
  total: number;
}
export interface ComprovanteLido {
  produtor: string | null; propriedade: string | null; inscricao: string | null; municipio: string | null;
  /** 'AAAA-MM-DD' */
  vacinaBrucelose: string | null;
  femeas012SemBrucelose: number | null;
  /** 'AAAA-MM-DDThh:mm:ss' (hora local do órgão) */
  saldoEm: string;
  especies: SaldoDaEspecie[];
  totalGeral: number | null;
}
export type LeituraDoComprovante = { ok: true; comprovante: ComprovanteLido } | { ok: false; motivo: 'nao_sei' | 'nao_fecha'; frase: string };

export const FRASE_NAO_E_COMPROVANTE = 'Não é um Comprovante de Saldo da IAGRO que eu conheça.';
export const fraseNaoFecha = (especie: string) => `As linhas de ${especie.toLowerCase()} não somam o total impresso: nada foi usado.`;

const celulas = (l: string) => l.split('|').map((c) => c.trim()).filter((c) => c !== '');
const inteiro = (s: string | undefined): number | null => (s !== undefined && /^-?\d+$/.test(s) ? Number(s) : null);
const dataISO = (s: string | undefined): string | null => {
  const m = (s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** O valor ao lado do rótulo (a célula seguinte), em qualquer linha. */
function aoLado(linhas: readonly string[], rotulo: RegExp): string | null {
  for (const l of linhas) {
    const c = celulas(l);
    const i = c.findIndex((x) => rotulo.test(x));
    if (i >= 0 && c[i + 1] !== undefined && !/:$/.test(c[i + 1])) return c[i + 1];
  }
  return null;
}
const FAIXA_DO_ROTULO: { re: RegExp; i: Faixa }[] = [
  { re: /^0 A 12 MESES$/, i: 0 }, { re: /^13 A 24 MESES$/, i: 1 }, { re: /^25 A 36 MESES$/, i: 2 },
  { re: /^ACIMA DE 36 MESES$/, i: 3 }, { re: /^ACIMA DE 12 MESES$/, i: 1 },
];

export function lerComprovanteIagro(linhas: readonly string[]): LeituraDoComprovante {
  if (!linhas.some((l) => /^Comprovante de Saldo$/i.test(l.trim())) || !linhas.some((l) => /IAGRO/.test(l))) {
    return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
  }
  const inicio = linhas.findIndex((l) => /^Espécie \| Sexo \| Faixa/.test(l.trim()));
  const fim = linhas.findIndex((l) => /^Saldo constante em/.test(l.trim()));
  if (inicio < 0 || fim < inicio) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
  const mSaldo = linhas[fim].match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}(?::\d{2})?)/);
  if (!mSaldo) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };

  const especies: SaldoDaEspecie[] = [];
  let grupo: { rotulo: Faixa; linha: LinhaDoSaldo }[] = [];
  let especie: Especie | null = null;
  for (const l of linhas.slice(inicio + 1, fim)) {
    const c = celulas(l);
    const achada = c.find((x): x is Especie => (ESPECIES as readonly string[]).includes(x));
    if (achada) especie = achada;
    if (c[0] === 'Total:') {
      const total = inteiro(c[1]);
      if (!especie || total === null || grupo.length === 0) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
      /* FÊMEA primeiro; o MACHO começa quando a faixa volta ao começo */
      const corte = grupo.findIndex((g, i) => i > 0 && g.rotulo <= grupo[i - 1].rotulo);
      if (corte <= 0) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
      const f = grupo.slice(0, corte).map((g) => g.linha);
      const m = grupo.slice(corte).map((g) => g.linha);
      const n = f.length;
      if ((n !== 4 && n !== 2) || m.length !== n) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
      const soma = [...f, ...m].reduce((s, x) => s + x.total, 0);
      if (soma !== total || [...f, ...m].some((x) => x.disponivel + x.aConfirmar !== x.total)) {
        return { ok: false, motivo: 'nao_fecha', frase: fraseNaoFecha(especie) };
      }
      especies.push({ especie, faixas: n === 4 ? 4 : 2, porSexo: { F: f, M: m }, total });
      grupo = []; especie = null;
      continue;
    }
    const iFaixa = c.findIndex((x) => FAIXA_DO_ROTULO.some((r) => r.re.test(x)));
    if (iFaixa < 0) continue;
    const nums = c.slice(iFaixa + 1).map(inteiro);
    if (nums.length !== 3 || nums.some((x) => x === null)) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
    const rot = FAIXA_DO_ROTULO.find((r) => r.re.test(c[iFaixa]));
    if (!rot) continue;
    grupo.push({ rotulo: rot.i, linha: { disponivel: nums[0] ?? 0, aConfirmar: nums[1] ?? 0, total: nums[2] ?? 0 } });
  }
  if (grupo.length || especies.length === 0) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_COMPROVANTE };
  const tg = linhas.map((l) => l.match(/Total Geral:\s*\|?\s*(\d+)/)).find(Boolean);
  const totalGeral = tg ? Number(tg[1]) : null;
  if (totalGeral !== null && totalGeral !== especies.reduce((s, e) => s + e.total, 0)) {
    return { ok: false, motivo: 'nao_fecha', frase: fraseNaoFecha('todas as espécies') };
  }
  const semBruc = aoLado(linhas, /^Fêmeas (0012 sem vacinação contra brucelose|0 a 12 Sem Brucelose):$/i);
  return { ok: true, comprovante: {
    produtor: aoLado(linhas, /^Produtor:$/), propriedade: aoLado(linhas, /^Propriedade:$/), inscricao: aoLado(linhas, /^Inscrição:$/),
    municipio: aoLado(linhas, /^Município:$/), vacinaBrucelose: dataISO(aoLado(linhas, /^Vacina Brucelose:$/) ?? undefined),
    femeas012SemBrucelose: inteiro(semBruc ?? undefined),
    saldoEm: `${mSaldo[3]}-${mSaldo[2]}-${mSaldo[1]}T${mSaldo[4].length === 5 ? `${mSaldo[4]}:00` : mSaldo[4]}`,
    especies, totalGeral,
  } };
}

/** O saldo de BOVINOS por sexo × faixa (o que a tabela da declaração usa). Sem bovino no comprovante = null ("—", nunca zero). */
export function bovinosDoComprovante(c: ComprovanteLido): PorSexo<PorFaixa> | null {
  const b = c.especies.find((e) => e.especie === 'BOVINO' && e.faixas === 4);
  if (!b) return null;
  const v = (s: 'F' | 'M'): PorFaixa => [b.porSexo[s][0].total, b.porSexo[s][1].total, b.porSexo[s][2].total, b.porSexo[s][3].total];
  return { F: v('F'), M: v('M') };
}
