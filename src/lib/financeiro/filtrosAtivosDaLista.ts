/**
 * LANC-FILTROS-02a — o que está FILTRADO na lista de Lançamentos, para o cabeçalho da caixa de filtros: "N ativos" e, com a caixa
 * recolhida, os chips (até 3 e "+N"). Ativo = diferente do padrão da tela (o que o "Limpar" desfaz). O texto do chip é o rótulo do campo
 * + o valor mostrado no campo ("Fornecedor: Rudimar Moccelin-ME").
 */
import { intervaloDoAno, intervaloDoMes, MESES_CURTOS, type Intervalo } from '@/lib/periodo/intervaloDeDatas';

export interface FiltroDaCaixa {
  campo: string;
  rotulo: string;
  /** o valor como o campo o mostra */
  texto: string;
  ativo: boolean;
}

export const MAXIMO_DE_CHIPS = 3;

export function chipsDosFiltros(filtros: readonly FiltroDaCaixa[]): { ativos: number; chips: FiltroDaCaixa[]; mais: number } {
  const ativos = filtros.filter((f) => f.ativo);
  return { ativos: ativos.length, chips: ativos.slice(0, MAXIMO_DE_CHIPS), mais: Math.max(0, ativos.length - MAXIMO_DE_CHIPS) };
}

export const textoDosAtivos = (n: number) => (n === 1 ? '1 ativo' : `${n} ativos`);

/**
 * O ano × mês de hoje (o mobile, o drill, a memória, o Limpar) como o PERÍODO do seletor, quando é um intervalo só: um ano inteiro
 * ("2026"), ou meses seguidos de UM ano ("out/2026", "ago/2026 – out/2026"). O resto (dois anos, meses salteados, mês em qualquer ano)
 * não é intervalo: nulo, e o gatilho mostra o texto de `textoDosAnosEMeses`.
 */
export function periodoDosAnosEMeses(anos: readonly string[], meses: readonly string[]): Intervalo | null {
  if (anos.length !== 1) return null;
  const ano = Number(anos[0]);
  if (!Number.isInteger(ano) || ano <= 0) return null;
  if (meses.length === 0) return intervaloDoAno(ano);
  const m0 = [...meses].map((m) => Number(m) - 1).sort((a, b) => a - b);
  if (m0.some((m, i) => !Number.isInteger(m) || m < 0 || m > 11 || (i > 0 && m !== m0[i - 1] + 1))) return null;
  return { de: intervaloDoMes(ano, m0[0]).de, ate: intervaloDoMes(ano, m0[m0.length - 1]).ate };
}

/** O texto do gatilho quando o ano × mês não é um intervalo ("2025, 2026 · 3 meses", "Todos os anos · out"). */
export function textoDosAnosEMeses(anos: readonly string[], meses: readonly string[]): string {
  const a = anos.length === 0 ? 'Todos os anos' : anos.length <= 3 ? [...anos].sort().join(', ') : `${anos.length} anos`;
  const m = meses.length === 0 ? '' : meses.length <= 3
    ? ` · ${[...meses].sort().map((x) => MESES_CURTOS[Number(x) - 1] ?? x).join(', ')}` : ` · ${meses.length} meses`;
  return a + m;
}
