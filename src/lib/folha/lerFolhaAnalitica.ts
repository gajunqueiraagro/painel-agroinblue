/**
 * FOLHA-VERA-PACOTE-01 F1 (Gabriel 27/11) — o "Relatório da Folha Analítico" do contador: o ESPELHO da folha (várias pessoas por página, as
 * rubricas de cada uma e o "Resumo geral" no fim), não o recibo. É a peça do PACOTE DA FOLHA (com as guias do FGTS e do INSS) que dá, por
 * funcionário, o líquido, o FGTS, o INSS e o IRRF — o `lerFolha` (recibo) não o lê: aqui não há "CEI:" nem "Valor Líquido" por pessoa.
 * PURO: recebe as linhas de cada página (as do `montarLinhas`, células por " | ") e devolve a `FolhaAnaliticaLida`.
 *
 * Layout (a forma, nunca o dado; ⚠ documento real NUNCA no repo, teste ou log — os testes usam linhas inventadas):
 *   cabeçalho de cada página: "<EMPRESA>" · "Folha | de Pagamento" · "Relatório da Folha Analítico. | FEVEREIRO 2025" ·
 *     "Emissão | 26/02/2025 | Hr. | …" · "Código | Nome | Admissão | …" · "P | R O V E N T O S | D E S C O N T O S" · "Código Descrição | Ref. | …";
 *   "*** CENTRO DE CUSTO: 00002-RURAL ***";
 *   a pessoa "<código> | <nome, às vezes em várias células> | dd/mm/aaaa | / | / | <salário base> | <horas> | <função>";
 *   as rubricas "<cód> <descrição> | <ref 0,0000> | <valor>" (provento e desconto na mesma linha; a 1ª linha termina com "| <FGTS> | <Líquido>");
 *   o fecho da pessoa "<total proventos> | <total descontos>";
 *   o "RESUMO GERAL DA FOLHA DE PAGAMENTO": "TOTAL DE PROVENTOS... | v | … DESCONTOS... | v" · "<N> | Funcionário(s) | … LÍQUIDO… | v" ·
 *     "TOTAL F.G.T.S........ | v".
 * CONFERE = cada pessoa fecha (proventos − descontos = líquido; a soma das rubricas = proventos + descontos) E a soma das pessoas é o resumo
 * geral (funcionários, proventos, descontos, líquido e FGTS, ao centavo). O que não fecha vai em `naoConfere` (a frase); quem decide é o operador.
 * A folha MENSAL ("<MÊS> <AAAA>") e a 1ª/2ª parcela do 13º ("1 PARCELA 13 SALARIO <AAAA>", nov/2026); outro título (férias, rescisão)
 * devolve 'não sei' — nunca chuta tipo nem competência.
 */
import { valorDoRecibo, type TipoDaFolha } from './lerFolha';

export interface RubricaDaAnalitica { codigo: string; descricao: string; ref: string | null; valor: number }
export interface PessoaDaAnalitica {
  codigo: string;
  nome: string;
  /** 'AAAA-MM-DD' */
  admissao: string | null;
  salarioBase: number | null;
  funcao: string;
  /** o centro de custo do relatório ("00002-RURAL"); null = antes de qualquer centro */
  centro: string | null;
  rubricas: RubricaDaAnalitica[];
  proventos: number | null;
  descontos: number | null;
  fgts: number | null;
  liquido: number | null;
  /** as rubricas do INSS (empregado, férias, 13º) e do IRRF, somadas */
  inss: number;
  irrf: number;
  confere: boolean;
  pagina: number;
}
export interface TotaisDaAnalitica { funcionarios: number; proventos: number; descontos: number; liquido: number; fgts: number }
export interface FolhaAnaliticaLida {
  /** a 1ª linha do cabeçalho ("FULANO DE TAL FAZENDA X") — é por ela que o banco acha empregador e fazenda */
  empresa: string;
  /** 'AAAA-MM' (o 13º: a 1ª parcela é novembro, a 2ª dezembro) */
  competencia: string;
  /** a folha mensal ou a 1ª/2ª parcela do 13º (o MESMO layout, outro título) */
  tipo: TipoDaFolha;
  /** 'AAAA-MM-DD' */
  emissao: string | null;
  pessoas: PessoaDaAnalitica[];
  /** a soma das pessoas (o INSS e o IRRF também, para o confronto com as guias) */
  soma: TotaisDaAnalitica & { inss: number; irrf: number };
  /** o "Resumo geral" do contador (null = não veio) */
  resumo: TotaisDaAnalitica | null;
  confere: boolean;
  naoConfere: string[];
}
export type LeituraDaAnalitica = { ok: true; folha: FolhaAnaliticaLida } | { ok: false; frase: string };

export const FRASE_NAO_E_ANALITICA = 'Não é um relatório analítico da folha que eu conheça.';

const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const celulas = (linha: string) => linha.split('|').map((c) => c.trim()).filter((c) => c !== '');
const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const ehRef = (s: string) => /^\d+,\d{4}$/.test(s);
const ehData = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);
const isoDe = (s: string) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "FEVEREIRO 2025" → mensal '2025-02'; "1 PARCELA 13 SALARIO 2026" → 13º 1ª '2026-11'; "2 PARCELA 13 SALARIO 2026" → 13º 2ª '2026-12' */
function competenciaDoTitulo(s: string): { competencia: string; tipo: TipoDaFolha } | null {
  const t = semAcento(s).trim().replace(/\s+/g, ' ');
  const d = t.match(/^([12])a? parcela (?:do )?13o? salario (\d{4})$/);
  if (d) return d[1] === '1' ? { competencia: `${d[2]}-11`, tipo: '13_1' } : { competencia: `${d[2]}-12`, tipo: '13_2' };
  const m = t.match(/^([a-z]+) (\d{4})$/);
  const i = m ? MESES.indexOf(m[1]) : -1;
  return m && i >= 0 ? { competencia: `${m[2]}-${String(i + 1).padStart(2, '0')}`, tipo: 'mensal' } : null;
}
const ehTitulo = (c: string[]) => /^relatorio da folha analitico\.?$/.test(semAcento(c[0] ?? ''));
/** as linhas fixas do cabeçalho de toda página (a da empresa é a anterior à "Folha | de Pagamento") */
function ehCabecalho(c: string[]): boolean {
  const t = semAcento(c.join(' '));
  return t === 'folha de pagamento' || ehTitulo(c) || c[0] === 'Emissão' || /^codigo nome admissao/.test(t)
    || /^p r o v e n t o s/.test(t) || /^codigo descricao ref/.test(t);
}

/** Uma linha de rubricas: "texto… | ref | valor" (provento, desconto) e, sobrando, os valores soltos (FGTS e líquido). */
function rubricasDaLinha(c: string[]): { rubricas: RubricaDaAnalitica[]; soltos: number[] } | null {
  const rubricas: RubricaDaAnalitica[] = [];
  const soltos: number[] = [];
  let texto: string[] = [];
  let ref: string | null = null;
  for (const x of c) {
    const v = valorDoRecibo(x);
    if (v !== null) {
      if (texto.length) {
        const m = texto.join(' ').match(/^(\d+)\s+(.+)$/);
        if (!m) return null;
        rubricas.push({ codigo: m[1], descricao: m[2], ref, valor: v });
        texto = []; ref = null;
      } else soltos.push(v);
      continue;
    }
    if (ehRef(x)) { if (!texto.length || ref) return null; ref = x; continue; }
    if (soltos.length) return null;
    texto.push(x);
  }
  return texto.length || !rubricas.length ? null : { rubricas, soltos };
}

/** "00047 | FULANO | DE TAL | 21/04/2017 | / | / | 3.036,00 | 44.0 | FUNÇÃO" */
function pessoaDaLinha(c: string[], centro: string | null, pagina: number): PessoaDaAnalitica | null {
  if (!/^\d{3,6}$/.test(c[0] ?? '')) return null;
  const iAdm = c.findIndex(ehData);
  if (iAdm < 2) return null;
  const iSal = c.findIndex((x, i) => i > iAdm && valorDoRecibo(x) !== null);
  if (iSal < 0) return null;
  const nome = c.slice(1, iAdm).join(' ').replace(/\s+/g, ' ');
  const funcao = c.slice(iSal + 2).join(' ');
  return {
    codigo: c[0], nome, admissao: isoDe(c[iAdm]), salarioBase: valorDoRecibo(c[iSal]), funcao, centro, rubricas: [],
    proventos: null, descontos: null, fgts: null, liquido: null, inss: 0, irrf: 0, confere: false, pagina,
  };
}

const ehInss = (d: string) => /(^|[^a-z])i\.?n\.?s\.?s(?![a-z])/.test(semAcento(d));
const ehIrrf = (d: string) => /imposto de renda|(^|[^a-z])i\.?r\.?r\.?f(?![a-z])/.test(semAcento(d));

function fecharPessoa(p: PessoaDaAnalitica): PessoaDaAnalitica {
  const soma = p.rubricas.reduce((s, r) => s + centavos(r.valor), 0);
  const inss = p.rubricas.filter((r) => ehInss(r.descricao)).reduce((s, r) => s + centavos(r.valor), 0);
  const irrf = p.rubricas.filter((r) => ehIrrf(r.descricao)).reduce((s, r) => s + centavos(r.valor), 0);
  const confere = p.proventos !== null && p.descontos !== null && p.liquido !== null
    && centavos(p.proventos) - centavos(p.descontos) === centavos(p.liquido)
    && soma === centavos(p.proventos) + centavos(p.descontos);
  return { ...p, inss: reais(inss), irrf: reais(irrf), confere };
}

interface ResumoParcial { centro: string; funcionarios: number | null; proventos: number | null; descontos: number | null; liquido: number | null; fgts: number | null }
const resumoCompleto = (r: ResumoParcial): TotaisDaAnalitica | null =>
  r.funcionarios !== null && r.proventos !== null && r.descontos !== null && r.liquido !== null && r.fgts !== null
    ? { funcionarios: r.funcionarios, proventos: r.proventos, descontos: r.descontos, liquido: r.liquido, fgts: r.fgts } : null;

export function lerFolhaAnalitica(paginas: string[][]): LeituraDaAnalitica {
  let empresa: string | null = null;
  let competencia: string | null = null;
  let tipo: TipoDaFolha | null = null;
  let emissao: string | null = null;
  let centro: string | null = null;
  let pessoa: PessoaDaAnalitica | null = null;
  let resumo: ResumoParcial | null = null;
  const pessoas: PessoaDaAnalitica[] = [];
  const resumos = new Map<string, TotaisDaAnalitica>();
  const naoConfere: string[] = [];
  const fechar = () => { if (pessoa) pessoas.push(fecharPessoa(pessoa)); pessoa = null; };
  const guardarResumo = () => {
    const r = resumo ? resumoCompleto(resumo) : null;
    if (resumo && r) resumos.set(resumo.centro, r);
    resumo = null;
  };

  for (let p = 0; p < paginas.length; p++) {
    const linhas = paginas[p];
    for (let i = 0; i < linhas.length; i++) {
      const c = celulas(linhas[i]);
      if (!c.length) continue;
      /* o cabeçalho da página: a empresa é a linha antes da "Folha | de Pagamento" */
      if (semAcento(c.join(' ')) === 'folha de pagamento') {
        const e = i > 0 ? celulas(linhas[i - 1]).join(' ') : '';
        if (!e || (empresa && empresa !== e)) return { ok: false, frase: FRASE_NAO_E_ANALITICA };
        empresa = e;
        continue;
      }
      if (ehTitulo(c)) {
        const comp = competenciaDoTitulo(c[1] ?? '');
        if (!comp || (competencia && competencia !== comp.competencia) || (tipo && tipo !== comp.tipo)) return { ok: false, frase: FRASE_NAO_E_ANALITICA };
        competencia = comp.competencia;
        tipo = comp.tipo;
        continue;
      }
      if (c[0] === 'Emissão') { if (ehData(c[1] ?? '')) emissao = isoDe(c[1]); continue; }
      if (ehCabecalho(c)) continue;
      if (linhas[i + 1] !== undefined && semAcento(celulas(linhas[i + 1]).join(' ')) === 'folha de pagamento') continue;

      const t = semAcento(c.join(' '));
      const mCentro = c.join(' ').match(/^\*{3}\s*CENTRO DE CUSTO:\s*(.+?)\s*\*{3}$/i);
      if (mCentro) {
        if (resumo) resumo.centro = mCentro[1]; else { fechar(); centro = mCentro[1]; }
        continue;
      }
      if (t === 'resumo geral da folha de pagamento') { fechar(); guardarResumo(); resumo = { centro: '', funcionarios: null, proventos: null, descontos: null, liquido: null, fgts: null }; continue; }
      if (resumo) {
        const r: ResumoParcial = resumo;
        const ultimo = [...c].reverse().map(valorDoRecibo).find((v) => v !== null) ?? null;
        if (/^total de proventos/.test(t)) {
          r.proventos = valorDoRecibo(c[1] ?? '');
          r.descontos = /descontos/.test(t) ? ultimo : 0;
        } else if (c[1] && /^funcionario\(s\)$/.test(semAcento(c[1])) && /^\d+$/.test(c[0])) {
          r.funcionarios = Number(c[0]); r.liquido = ultimo;
        } else if (/^total f\.g\.t\.s/.test(t)) {
          r.fgts = valorDoRecibo(c[1] ?? '');
          guardarResumo();
        }
        continue;
      }
      const nova = pessoaDaLinha(c, centro, p + 1);
      if (nova) { fechar(); pessoa = nova; continue; }
      if (!pessoa) continue;
      const atual: PessoaDaAnalitica = pessoa;
      /* o fecho: "<proventos> | <descontos>" */
      if (c.length <= 2 && c.every((x) => valorDoRecibo(x) !== null)) {
        atual.proventos = valorDoRecibo(c[0]);
        atual.descontos = c[1] !== undefined ? valorDoRecibo(c[1]) : 0;
        fechar();
        continue;
      }
      const r = rubricasDaLinha(c);
      if (!r) { naoConfere.push(`Linha que não entendi no funcionário ${atual.codigo}.`); continue; }
      atual.rubricas.push(...r.rubricas);
      if (r.soltos.length > 2 || (r.soltos.length && atual.liquido !== null)) { naoConfere.push(`O funcionário ${atual.codigo} tem valores a mais.`); continue; }
      if (r.soltos.length === 2) { atual.fgts = r.soltos[0]; atual.liquido = r.soltos[1]; }
      if (r.soltos.length === 1) atual.liquido = r.soltos[0];
    }
  }
  fechar();
  guardarResumo();
  if (!empresa || !competencia || !tipo || !pessoas.length) return { ok: false, frase: FRASE_NAO_E_ANALITICA };

  const somaC = (f: (x: PessoaDaAnalitica) => number | null) => pessoas.reduce((s, x) => s + centavos(f(x) ?? 0), 0);
  const soma = {
    funcionarios: pessoas.length, proventos: reais(somaC((x) => x.proventos)), descontos: reais(somaC((x) => x.descontos)),
    liquido: reais(somaC((x) => x.liquido)), fgts: reais(somaC((x) => x.fgts)), inss: reais(somaC((x) => x.inss)), irrf: reais(somaC((x) => x.irrf)),
  };
  /* o resumo geral: o sem centro; sem ele, a soma dos centros */
  const geral: TotaisDaAnalitica | null = resumos.get('') ?? (resumos.size ? [...resumos.values()].reduce((a, b) => ({
    funcionarios: a.funcionarios + b.funcionarios, proventos: reais(centavos(a.proventos) + centavos(b.proventos)),
    descontos: reais(centavos(a.descontos) + centavos(b.descontos)), liquido: reais(centavos(a.liquido) + centavos(b.liquido)), fgts: reais(centavos(a.fgts) + centavos(b.fgts)),
  })) : null);

  for (const x of pessoas) if (!x.confere) naoConfere.push(`O funcionário ${x.codigo} não fecha (proventos − descontos ≠ líquido).`);
  if (!geral) naoConfere.push('O resumo geral não veio.');
  else {
    if (geral.funcionarios !== soma.funcionarios) naoConfere.push(`O resumo geral diz ${geral.funcionarios} funcionários; li ${soma.funcionarios}.`);
    const campos: Array<[keyof TotaisDaAnalitica, string]> = [['proventos', 'Proventos'], ['descontos', 'Descontos'], ['liquido', 'Líquido'], ['fgts', 'FGTS']];
    for (const [k, rotulo] of campos) {
      if (k !== 'funcionarios' && centavos(geral[k]) !== centavos(soma[k])) naoConfere.push(`${rotulo}: o resumo geral diz ${brl(geral[k])}; a soma dos funcionários dá ${brl(soma[k])}.`);
    }
  }
  return { ok: true, folha: { empresa, competencia, tipo, emissao, pessoas, soma, resumo: geral, confere: naoConfere.length === 0, naoConfere } };
}
