/**
 * PROD-PENDENCIAS-VISIVEIS-01 (Gabriel 14/11 17:11) — ONDE fica cada pendência do "cadastro incompleto" da ficha do produtor.
 * ⚠ UMA FONTE: a lista é a do banco (`_fn_fiscal_titular_pendencias`, que vem em `pendencias` da `fn_fiscal_titulares_lista`); a frase
 *   mostrada é o TEXTO DO BANCO. Aqui só se diz em que aba e em que campo cada texto mora (o atalho) — nada é calculado na tela.
 * ⚠ Texto do banco que esta tabela não conhece: aparece na lista assim mesmo, sem atalho (nunca some).
 */
export type AbaDaFicha = 'identificacao' | 'fazendas' | 'fiscal' | 'contas' | 'certificado' | 'grupo';
export type CampoPendente = 'ies' | 'nascimento' | 'email_fiscal' | 'endereco' | 'regime_ir' | 'condicao_ibs' | 'fazendas';

/** Os textos EXATOS do `_fn_fiscal_titular_pendencias` (117290) e onde cada um se resolve. */
export const ONDE_RESOLVER: Readonly<Record<string, { aba: AbaDaFicha; campo: CampoPendente }>> = {
  'Sem inscrição estadual': { aba: 'identificacao', campo: 'ies' },
  'Sem data de nascimento': { aba: 'identificacao', campo: 'nascimento' },
  'Sem e-mail fiscal': { aba: 'identificacao', campo: 'email_fiscal' },
  'Endereço fiscal incompleto': { aba: 'identificacao', campo: 'endereco' },
  'Sem regime do IR': { aba: 'fiscal', campo: 'regime_ir' },
  'Sem condição no IBS/CBS': { aba: 'fiscal', campo: 'condicao_ibs' },
  'Sem fazenda': { aba: 'fazendas', campo: 'fazendas' },
};

/** As abas onde alguma pendência mora (o lugar do ponto âmbar fica reservado só nelas). */
export const ABAS_COM_PENDENCIA: ReadonlySet<AbaDaFicha> = new Set(Object.values(ONDE_RESOLVER).map(o => o.aba));

export interface PendenciaDaFicha { texto: string; aba: AbaDaFicha | null; campo: CampoPendente | null }

/** A lista do banco, na ordem do banco, com o atalho de cada uma (nulo = texto desconhecido, sem atalho). */
export function pendenciasDaFicha(pendencias: readonly string[]): PendenciaDaFicha[] {
  return pendencias.map(texto => {
    const onde = Object.prototype.hasOwnProperty.call(ONDE_RESOLVER, texto) ? ONDE_RESOLVER[texto] : undefined;
    return { texto, aba: onde?.aba ?? null, campo: onde?.campo ?? null };
  });
}

/** Quantas pendências moram em cada aba (o ponto âmbar + número). Aba sem pendência não aparece. */
export function pendenciasPorAba(pendencias: readonly string[]): Partial<Record<AbaDaFicha, number>> {
  const n: Partial<Record<AbaDaFicha, number>> = {};
  for (const p of pendenciasDaFicha(pendencias)) if (p.aba) n[p.aba] = (n[p.aba] ?? 0) + 1;
  return n;
}

/** A frase curta embaixo do campo que falta: o texto do banco, por campo. */
export function frasesPorCampo(pendencias: readonly string[]): Partial<Record<CampoPendente, string>> {
  const f: Partial<Record<CampoPendente, string>> = {};
  for (const p of pendenciasDaFicha(pendencias)) if (p.campo && !f[p.campo]) f[p.campo] = p.texto;
  return f;
}
