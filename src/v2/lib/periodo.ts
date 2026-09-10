/**
 * O PERÍODO É UM INTERVALO — PR-SELETOR-PERIODO-02.
 *
 * ⚠ O MÊS ÚNICO NÃO É UM CASO À PARTE, é `de === ate`. Ter dois tipos — "um mês" e "um
 * intervalo" — obrigaria cada tela a perguntar qual dos dois chegou antes de filtrar, e a
 * pergunta apareceria em catorze lugares. Com um tipo só, quem sabe fazer intervalo faz, e
 * quem só sabe um mês lê `de` e ignora o resto.
 *
 * ⚠ ANO E MÊS SÃO NÚMEROS, e o texto `'YYYY-MM'` é derivado na borda. As telas guardavam o
 * mês em quatro vocabulários diferentes (`'todos'`, `'__all__'`, `'01'`, `1`) porque cada
 * uma escolheu o seu; a conversão continua existindo, mas agora só na saída, e o miolo
 * fala um idioma só.
 *
 * ⚠ COMPARAR PERÍODO É COMPARAR TEXTO `'YYYY-MM'`, não datas. `'2024-01' <= '2024-03'` é
 * verdade em ordem lexicográfica porque o mês é zero-padded, e é assim que o banco já
 * guarda (`ano_mes`) e como o `FinV2SaldosTab` já filtrava antes deste PR. Sem `Date`, sem
 * fuso, sem o 31 de um mês que o outro não tem.
 */

export interface PontoPeriodo {
  /** Ano com quatro dígitos. */
  readonly ano: number;
  /** Mês de 1 a 12. */
  readonly mes: number;
}

export interface Periodo {
  readonly de: PontoPeriodo;
  readonly ate: PontoPeriodo;
}

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const;

export const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

/** Um mês só: os dois extremos no mesmo ponto. */
export function mesUnico(ano: number, mes: number): Periodo {
  const p = { ano, mes };
  return { de: p, ate: p };
}

/** O ano inteiro — janeiro a dezembro. É o que `'todos'`/`'__all__'` queriam dizer. */
export function anoInteiro(ano: number): Periodo {
  return { de: { ano, mes: 1 }, ate: { ano, mes: 12 } };
}

export function ehMesUnico(p: Periodo): boolean {
  return p.de.ano === p.ate.ano && p.de.mes === p.ate.mes;
}

export function ehAnoInteiro(p: Periodo): boolean {
  return p.de.ano === p.ate.ano && p.de.mes === 1 && p.ate.mes === 12;
}

/** `{ano:2026, mes:2}` → `'2026-02'`. A forma que se compara e que o banco guarda. */
export function anoMes(pt: PontoPeriodo): string {
  return `${pt.ano}-${String(pt.mes).padStart(2, '0')}`;
}

/** Quantos meses o intervalo cobre, contando os dois extremos. */
export function contarMeses(p: Periodo): number {
  return (p.ate.ano - p.de.ano) * 12 + (p.ate.mes - p.de.mes) + 1;
}

/**
 * ⚠ CLICAR NO FIM ANTES DO INÍCIO É USO NORMAL, não erro. Quem quer "de março a janeiro"
 * quis "de janeiro a março" e clicou na ordem que enxergou. Ordenar aqui, uma vez, evita
 * que catorze telas tenham de se defender de um intervalo invertido — e um intervalo
 * invertido filtra ZERO linhas em silêncio, que é o pior defeito possível num filtro.
 */
export function ordenar(p: Periodo): Periodo {
  return anoMes(p.de) <= anoMes(p.ate) ? p : { de: p.ate, ate: p.de };
}

/** O mês `'YYYY-MM'` cai dentro do período? */
export function dentro(p: Periodo, mesTexto: string): boolean {
  return mesTexto >= anoMes(p.de) && mesTexto <= anoMes(p.ate);
}

export function mesmoPeriodo(a: Periodo, b: Periodo): boolean {
  return anoMes(a.de) === anoMes(b.de) && anoMes(a.ate) === anoMes(b.ate);
}

/**
 * A frase que fica sob a fita.
 *
 * ⚠ O MÊS ÚNICO SE ESCREVE POR EXTENSO e o intervalo em três letras — não é inconsistência,
 * é o que cada um precisa. "agosto/2026" é uma afirmação e cabe; "fevereiro → abril/2026"
 * empurraria a contagem para fora da linha em tela estreita. E o ano aparece UMA vez quando
 * os dois extremos são do mesmo ano, duas quando não são: é a diferença entre "três meses
 * de 2026" e "dois anos".
 */
export function descreverPeriodo(p: Periodo): string {
  if (ehMesUnico(p)) return `${MESES_LONGOS[p.de.mes - 1]}/${p.de.ano}`;
  const de = MESES_CURTOS[p.de.mes - 1].toLowerCase();
  const ate = MESES_CURTOS[p.ate.mes - 1].toLowerCase();
  return p.de.ano === p.ate.ano
    ? `${de} → ${ate}/${p.ate.ano}`
    : `${de}/${p.de.ano} → ${ate}/${p.ate.ano}`;
}

/** O primeiro dia do início e o último do fim, em `dd/mm/aaaa` — a nota do popover. */
export function descreverDias(p: Periodo): string {
  const ultimo = new Date(p.ate.ano, p.ate.mes, 0).getDate();
  const dd = (n: number) => String(n).padStart(2, '0');
  return `01/${dd(p.de.mes)}/${p.de.ano} a ${ultimo}/${dd(p.ate.mes)}/${p.ate.ano}`;
}

/** O mês corrente, que é para onde o "×" da frase volta. */
export function mesCorrente(): Periodo {
  const hoje = new Date();
  return mesUnico(hoje.getFullYear(), hoje.getMonth() + 1);
}
