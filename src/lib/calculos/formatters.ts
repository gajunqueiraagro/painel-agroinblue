/**
 * Formatadores numéricos centralizados — padrão pt-BR.
 */

/**
 * Formata número com casas decimais e separador de vírgula (pt-BR).
 * Retorna '—' para valores nulos/undefined.
 */
export function formatNum(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined) return '—';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formata número como moeda brasileira (R$).
 */
export function formatMoeda(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número com locale pt-BR, ideal para tabelas financeiras e econômicas.
 * Retorna '-' para zero, null ou NaN.
 * Uso: valores monetários, arrobas, pesos em tabelas.
 */
export function fmtValor(v?: number | null, decimals = 2): string {
  if (v === undefined || v === null || isNaN(v) || v === 0) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Formata peso em quilogramas — ex: "450,00 kg"
 */
export function formatKg(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

/**
 * Formata arrobas — ex: "18,50 @"
 */
export function formatArroba(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} @`;
}

/**
 * Formata percentual — ex: "52,3%"
 */
export function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Formata quantidade de cabeças — ex: "1.250 cab"
 */
export function formatCabecas(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} cab`;
}

// ═══════════════════════════════════════════════════════════════
// Formatadores do Painel do Consultor (auditoria)
// Regra global: formato único por tipo de dado.
// ═══════════════════════════════════════════════════════════════

/**
 * Cabeças (cab): inteiro com separador de milhar — ex: 1.219
 * Zero → "0"
 */
export function formatCabPainel(val: number): string {
  return Math.round(val).toLocaleString('pt-BR');
}

/**
 * Médias zootécnicas com 2 casas — ex: 339,08 / 1,51
 * Usar para: peso médio, UA, UA/ha, @/ha, médias físicas
 */
export function formatMed2(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * GMD (kg/cab/dia): 3 casas decimais — ex: 2,071
 * Zero → "0,000"
 */
export function formatGMD(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/**
 * Pesos totais / produção com 2 casas — ex: 398.425,00
 * Usar para: peso total kg, peso total @, produção kg, produção @
 */
export function formatPeso3(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Padrão geral (kg, @, valores técnicos): separador milhar + 2 decimais — ex: 398.425,00
 * Zero → "0,00"
 */
export function formatPadrao(val: number): string {
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formatador único do painel do consultor.
 * tipo: 'cab' | 'gmd' | 'med2' | 'peso3' | 'money' | 'padrao'
 */
export type PainelFormatType = 'cab' | 'gmd' | 'med2' | 'peso3' | 'money' | 'moneyInt' | 'padrao';

/**
 * Formata moeda sem casas decimais — ex: R$ 3.996.222
 */
export function formatMoedaInt(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatPainel(val: number, tipo: PainelFormatType): string {
  if (tipo === 'cab') return formatCabPainel(val);
  if (tipo === 'gmd') return formatGMD(val);
  if (tipo === 'med2') return formatMed2(val);
  if (tipo === 'peso3') return formatPeso3(val);
  if (tipo === 'money') return formatMoeda(val);
  if (tipo === 'moneyInt') return formatMoedaInt(val);
  return formatPadrao(val);
}

/**
 * O NÚMERO DA NOTA FISCAL EM 000.000.000 — padrão A25.
 *
 * ⚠ EXTRAÍDO, NÃO ESCRITO. O corpo veio de `numeroEmRepouso`, em
 * `components/compra/DocumentoFormOC.tsx`, que já era a regra certa da casa desde o
 * PR-OC-DOC-TABELA-01. Escrever um terceiro aqui criaria a divergência que este arquivo existe
 * para acabar — e a casa já tinha DOIS.
 *
 * ⚠ O OUTRO NÃO É EQUIVALENTE, e por isso não foi ele o escolhido: `formatNFNumber`, em
 * `lib/financeiro/documentoHelper.ts`, faz `slice(0, 9)` — ele TRUNCA um número de dez dígitos
 * e mostra nove, apagando dado na tela sem avisar. Aqui, número com mais de nove dígitos volta
 * COMO VEIO: não é `nNF` (o leiaute da NF-e define nove), e mutilar para caber na máscara é
 * pior do que exibir fora do formato.
 *
 * ⚠ O `nNF` TEM NOVE DÍGITOS POR DEFINIÇÃO, e é assim que a nota se lê. Os zeros à esquerda
 * entram EM REPOUSO — na lista, no blur —, nunca enquanto se digita: teclar "7" viraria
 * "000.000.007" e o cursor saltaria para o fim a cada tecla.
 */
export function formatarNF(valor: string | null | undefined): string {
  const bruto = (valor ?? '').trim();
  if (!bruto) return '';
  const d = bruto.replace(/\D/g, '');
  if (!d || d.length > 9) return bruto;
  return d.padStart(9, '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
