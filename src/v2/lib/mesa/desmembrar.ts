/**
 * POR QUE o desmembrar (o "Agrupar" da Mesa) não abre — PR-CONC-ENRIQ-AGRUP-2a, decisão do Gabriel (iv): o bloco cuja
 * soma NÃO FECHA ao centavo com o lançamento fica sem proposta e não se desmembra à mão. A RPC
 * (`fn_classificacao_split_substituir`) recusa pela mesma conta (`soma_divergente`, centavos inteiros) e com a mesma frase.
 */
export interface SomaDoBloco { completo: boolean; bate: boolean; diferencaCent: number; carregadas: number; total: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function textoSomaDifere(diferencaCent: number): string {
  return `A soma da planilha difere do lançamento em ${brl(Math.abs(diferencaCent) / 100)}.`;
}

export function motivoDoDesmembrar(b: SomaDoBloco | null): string | null {
  if (!b) return null;
  if (!b.completo) return `${b.carregadas} de ${b.total} linhas carregadas — a soma não se confere.`;
  if (b.bate) return null;
  return textoSomaDifere(b.diferencaCent);
}
