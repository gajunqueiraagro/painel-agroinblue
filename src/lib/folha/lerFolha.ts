/**
 * FOLHA × CAIXA (Gabriel 20/11: "o lerFolha é seu") — o leitor ÚNICO do recibo de pagamento (holerite) que chega na Caixa de entrada.
 * PURO: recebe as linhas de CADA página (as do `montarLinhas`, uma página por vez, células juntas por " | ") e devolve a `FolhaLida`
 * que vai à `fn_folha_recibos_aplicar` (Code 6, 118380): tipo, competência, empregador e, por pessoa, código, nome, CEI, PÁGINAS e
 * líquido. As páginas são as do PDF (a partir de 1) e servem à divisão (`dividirPdf`): 1 arquivo por funcionário.
 *
 * Layouts (a forma, nunca o dado; ⚠ holerite real NUNCA no repo, teste ou log — os testes usam linhas inventadas):
 * - 'nj'  — "Recibo de Pagamento" do contador do NJ: "CEI: | <12 dígitos> | CC: | … | 13o. | Adiantamento", a linha seguinte
 *           "Mensalista | Novembro | de | 2026", "Código | Nome do Funcionário | …", a pessoa "<código> | <nome> | …" e "Valor Líquido | <valor>".
 * - 'sci' — SCI Visual Practice: "CEI: <documento> | Adiantamento 13o.Salário Novembro/2026" (ou "Referente ao mês de Outubro/2026"),
 *           "Código | Nome do funcionário | C.C:", a pessoa "<código> | <nome> | CBO …" e "SALÁRIO LÍQUIDO | R$ | <valor>".
 * O recibo sai em 2 VIAS na mesma página: a mesma pessoa (CEI + código) conta UMA vez; as vias com líquido diferente = não fecha.
 * O que não for reconhecido com certeza devolve 'nao_sei' (a Caixa trata como arquivo comum) — nunca chuta tipo nem competência.
 * Domésticas (e-Social doméstico): SEM layout — nenhuma amostra no sistema em 20/11 (Chat 14:22: "não sei", como as guias); entra
 * quando chegar um recibo doméstico.
 */

export type TipoDaFolha = '13_1' | '13_2' | 'mensal';
export type LayoutDaFolha = 'nj' | 'sci';

export interface PessoaDaFolha {
  codigo: string;
  nome: string;
  /** o documento do empregador no recibo dela (CEI, CNPJ ou CPF), só dígitos */
  cei: string;
  paginas: number[];
  /** o líquido do recibo, em reais (2 casas) */
  valor: number;
}

export interface FolhaLida {
  layout: LayoutDaFolha;
  tipo: TipoDaFolha;
  /** 'AAAA-MM' */
  competencia: string;
  /** os documentos de empregador do arquivo (só dígitos; o NJ traz 3 CEI no mesmo PDF) */
  empregadores: string[];
  pessoas: PessoaDaFolha[];
  /** a soma dos líquidos, em reais */
  total: number;
}

export type LeituraDaFolha =
  | { ok: true; folha: FolhaLida }
  | { ok: false; motivo: 'nao_sei'; frase: string }
  | { ok: false; motivo: 'nao_fecha'; frase: string };

export const FRASE_NAO_E_FOLHA = 'Não é um recibo de pagamento que eu conheça.';
export const fraseViasDiferentes = (codigo: string) => `As duas vias do funcionário ${codigo} têm líquidos diferentes.`;

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim());
const digitos = (s: string) => s.replace(/\D/g, '');
/** "1.234,56" → 1234.56; null se não for valor */
export function valorDoRecibo(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/);
  return m ? Number(`${m[1].replace(/\./g, '')}.${m[2]}`) : null;
}
function competenciaDe(mes: string, ano: string): string | null {
  const i = MESES.indexOf(semAcento(mes));
  return i < 0 || !/^\d{4}$/.test(ano) ? null : `${ano}-${String(i + 1).padStart(2, '0')}`;
}

/** O tipo e a competência que o cabeçalho do recibo diz (o CEI vem na mesma linha). */
interface Cabecalho { layout: LayoutDaFolha; tipo: TipoDaFolha; competencia: string; cei: string }

function cabecalhoNj(linha: string, seguinte: string | undefined): Cabecalho | null {
  const c = celulas(linha);
  if (c[0] !== 'CEI:' || !c.includes('CC:')) return null;
  const cei = digitos(c[1] ?? '');
  const texto = semAcento(c.slice(2).join(' '));
  let tipo: TipoDaFolha | null = null;
  if (/\b13o?\.?\s+adiantamento\b/.test(texto)) tipo = '13_1';
  else if (/\b13o?\.?\s+(integral|final|2a parcela)\b/.test(texto)) tipo = '13_2';
  const s = celulas(seguinte ?? '');
  const iDe = s.indexOf('de');
  const competencia = iDe > 0 ? competenciaDe(s[iDe - 1], s[iDe + 1] ?? '') : null;
  return tipo && competencia && cei ? { layout: 'nj', tipo, competencia, cei } : null;
}

function cabecalhoSci(linha: string): Cabecalho | null {
  const m = linha.match(/^CEI:\s*([\d./-]+)\s*\|\s*(.+)$/);
  if (!m) return null;
  const cei = digitos(m[1]);
  const texto = semAcento(m[2]);
  let tipo: TipoDaFolha | null = null;
  let mesAno: RegExpMatchArray | null = null;
  if ((mesAno = texto.match(/^adiantamento 13o?\.?\s*salario ([a-z]+)\/(\d{4})$/))) tipo = '13_1';
  else if ((mesAno = texto.match(/^(?:13o?\.?\s*salario|pagamento 13o?\.?\s*salario|13o?\.?\s*salario integral) ([a-z]+)\/(\d{4})$/))) tipo = '13_2';
  else if ((mesAno = texto.match(/^referente ao mes de ([a-z]+)\/(\d{4})$/))) tipo = 'mensal';
  const competencia = mesAno ? competenciaDe(mesAno[1], mesAno[2]) : null;
  return tipo && competencia && cei ? { layout: 'sci', tipo, competencia, cei } : null;
}

const ehTituloDaPessoa = (linha: string) => /^c[oó]digo \| nome do funcion[aá]rio\b/i.test(linha);
function pessoaDaLinha(linha: string | undefined): { codigo: string; nome: string } | null {
  const c = celulas(linha ?? '');
  return c.length >= 2 && /^\d+$/.test(c[0]) && /\p{L}/u.test(c[1]) ? { codigo: c[0], nome: c[1] } : null;
}
function liquidoDaLinha(linha: string, layout: LayoutDaFolha): number | null {
  const c = celulas(linha);
  if (layout === 'nj') return c[0] === 'Valor Líquido' ? valorDoRecibo(c[1] ?? '') : null;
  return c[0] === 'SALÁRIO LÍQUIDO' ? valorDoRecibo(c[c.length - 1] ?? '') : null;
}

export function lerFolha(paginas: string[][]): LeituraDaFolha {
  const pessoas = new Map<string, PessoaDaFolha>();
  let geral: Cabecalho | null = null;
  for (let p = 0; p < paginas.length; p++) {
    const linhas = paginas[p];
    let cab: Cabecalho | null = null;
    for (let i = 0; i < linhas.length; i++) {
      const achado = cabecalhoNj(linhas[i], linhas[i + 1]) ?? cabecalhoSci(linhas[i]);
      if (achado) {
        /* um arquivo = um tipo, uma competência, um layout (o CEI pode variar: o NJ tem 3) */
        if (geral && (geral.layout !== achado.layout || geral.tipo !== achado.tipo || geral.competencia !== achado.competencia)) {
          return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_FOLHA };
        }
        geral = geral ?? achado;
        cab = achado;
        continue;
      }
      if (!cab || !ehTituloDaPessoa(linhas[i])) continue;
      const quem = pessoaDaLinha(linhas[i + 1]);
      if (!quem) continue;
      let valor: number | null = null;
      for (let j = i + 2; j < linhas.length && valor === null; j++) {
        if (ehTituloDaPessoa(linhas[j])) break;
        valor = liquidoDaLinha(linhas[j], cab.layout);
      }
      if (valor === null) continue;
      const chave = `${cab.cei}|${quem.codigo}`;
      const ja = pessoas.get(chave);
      if (!ja) { pessoas.set(chave, { codigo: quem.codigo, nome: quem.nome, cei: cab.cei, paginas: [p + 1], valor }); continue; }
      if (ja.valor !== valor) return { ok: false, motivo: 'nao_fecha', frase: fraseViasDiferentes(quem.codigo) };
      if (!ja.paginas.includes(p + 1)) ja.paginas.push(p + 1);
    }
  }
  if (!geral || pessoas.size === 0) return { ok: false, motivo: 'nao_sei', frase: FRASE_NAO_E_FOLHA };
  const lista = [...pessoas.values()];
  const total = Math.round(lista.reduce((s, x) => s + x.valor * 100, 0)) / 100;
  return {
    ok: true,
    folha: { layout: geral.layout, tipo: geral.tipo, competencia: geral.competencia, empregadores: [...new Set(lista.map((x) => x.cei))], pessoas: lista, total },
  };
}
