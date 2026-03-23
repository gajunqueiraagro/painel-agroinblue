/**
 * Labels e helpers de exibição centralizados.
 * Evita duplicação de mapeamentos em telas e exportações.
 */

/** Labels de tipo de uso do pasto. */
export function tipoUsoLabel(tipo: string | null): string {
  if (!tipo) return '—';
  const labels: Record<string, string> = {
    cria: 'Cria',
    recria: 'Recria',
    engorda: 'Engorda',
    reforma_pecuaria: 'Reforma Pec.',
    agricultura: 'Agricultura',
    app: 'APP',
    reserva_legal: 'Reserva Legal',
    benfeitorias: 'Benfeitorias',
  };
  return labels[tipo] || tipo;
}

/** Labels abreviados de tipo de uso (para PDF compacto). */
export function tipoUsoLabelCurto(tipo: string | null): string {
  if (!tipo) return '—';
  const labels: Record<string, string> = {
    cria: 'Cria',
    recria: 'Recria',
    engorda: 'Engorda',
    reforma_pecuaria: 'Ref. Pec.',
    agricultura: 'Agric.',
    app: 'APP',
    reserva_legal: 'Res. Legal',
    benfeitorias: 'Benf.',
  };
  return labels[tipo] || tipo;
}

/** Nomes curtos dos meses. */
export const MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Colunas de meses para tabelas. */
export const MESES_COLS = [
  { key: '01', label: 'Jan' },
  { key: '02', label: 'Fev' },
  { key: '03', label: 'Mar' },
  { key: '04', label: 'Abr' },
  { key: '05', label: 'Mai' },
  { key: '06', label: 'Jun' },
  { key: '07', label: 'Jul' },
  { key: '08', label: 'Ago' },
  { key: '09', label: 'Set' },
  { key: '10', label: 'Out' },
  { key: '11', label: 'Nov' },
  { key: '12', label: 'Dez' },
];

/** Options de meses para selects (com "Todos"). */
export const MESES_OPTIONS = [
  { value: 'todos', label: 'Todos os meses' },
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

/** Options de meses sem "Todos" (para selects simples). */
export const MESES_SELECT = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

/** Options de período acumulado "Até mês" (para selects de desfrute/análise). */
export const MESES_OPTIONS_ACUMULADO = [
  { value: '12', label: 'Ano todo' },
  { value: '01', label: 'Até Janeiro' },
  { value: '02', label: 'Até Fevereiro' },
  { value: '03', label: 'Até Março' },
  { value: '04', label: 'Até Abril' },
  { value: '05', label: 'Até Maio' },
  { value: '06', label: 'Até Junho' },
  { value: '07', label: 'Até Julho' },
  { value: '08', label: 'Até Agosto' },
  { value: '09', label: 'Até Setembro' },
  { value: '10', label: 'Até Outubro' },
  { value: '11', label: 'Até Novembro' },
];
