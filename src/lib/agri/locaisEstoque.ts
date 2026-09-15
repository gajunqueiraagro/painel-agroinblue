/**
 * O VOCABULÁRIO DOS LOCAIS DE ESTOQUE — os rótulos dos enums do EL-01.
 *
 * ⚠ MÓDULO FOLHA, NÃO UM COMPONENTE. O `MOTIVOS` da quebra ficou dentro do `QuebraModal` e já
 * precisou ser exportado dali para o segundo consumidor — um vocabulário de domínio dentro de uma
 * tela é o que faz o import virar componente→componente. Este nasce no lugar certo: a lista, o
 * modal e o que vier do EL-02 leem daqui.
 * ⚠ CADA MAPA É UM `CHECK` DO BANCO ESCRITO EM PORTUGUÊS. Um valor que o mapa não conheça volta
 * cru, nunca vazio: melhor "percentual_mes" na tela que um espaço em branco que esconde o dado.
 */

export type TipoLocal = 'proprio' | 'terceiro';

export const TIPOS_LOCAL = [
  { valor: 'proprio', rotulo: 'Próprio' },
  { valor: 'terceiro', rotulo: 'Terceiro' },
] as const;

export const rotuloTipoLocal = (v: string) =>
  TIPOS_LOCAL.find(t => t.valor === v)?.rotulo ?? v;

export const QUEBRA_TIPOS = [
  { valor: 'nenhuma', rotulo: 'Sem quebra técnica' },
  { valor: 'percentual_mes', rotulo: 'Percentual ao mês' },
  { valor: 'tabela', rotulo: 'Tabela do armazém' },
] as const;

export const QUEBRA_BASES = [
  { valor: 'saldo_fechamento', rotulo: 'saldo de fechamento' },
  { valor: 'saldo_medio', rotulo: 'saldo médio' },
] as const;

export const TAXA_UNIDADES = [
  { valor: 'rs_por_saca_mes', rotulo: 'R$/saca/mês' },
  { valor: 'pct_mes', rotulo: '% ao mês' },
] as const;

export const rotuloBaseQuebra = (v: string | null | undefined) =>
  QUEBRA_BASES.find(b => b.valor === v)?.rotulo ?? (v ?? '—');

export const rotuloTaxaUnidade = (v: string | null | undefined) =>
  TAXA_UNIDADES.find(u => u.valor === v)?.rotulo ?? (v ?? '—');

/**
 * A QUEBRA TÉCNICA EM UMA FRASE, para a linha 2 da lista.
 *
 * ⚠ ELA MUDA DE FORMA COM O TIPO, e é por isso que não é um mapa simples: "0,25% ao mês (saldo de
 * fechamento)" só faz sentido com os dois campos juntos, e sem a base o percentual não diz sobre o
 * que incide.
 * ⚠ SEM CONTRATO NÃO É "sem quebra técnica" — é "sem contrato". O local terceiro sem contrato
 * cadastrado não declarou regra nenhuma; dizer "sem quebra" afirmaria uma regra que ninguém
 * escreveu.
 */
export function rotuloQuebraTecnica(contrato: {
  quebra_tecnica_tipo: string;
  quebra_tecnica_pct: number | null;
  quebra_tecnica_base: string | null;
} | null): string {
  if (!contrato) return 'sem contrato';
  const { quebra_tecnica_tipo: tipo, quebra_tecnica_pct: pct, quebra_tecnica_base: base } = contrato;
  if (tipo === 'nenhuma') return 'sem quebra técnica';
  if (tipo === 'tabela') return 'tabela do armazém';
  if (tipo === 'percentual_mes') {
    /* ⚠ `toLocaleString` pt-BR PORQUE 0.25 SE LÊ "0,25" AQUI, e um ponto decimal numa tela
       brasileira é o tipo de detalhe que faz o operador reler o número. */
    const n = pct == null ? '—' : pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n}% ao mês (${rotuloBaseQuebra(base)})`;
  }
  return tipo;
}
