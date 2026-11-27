/**
 * FOLHA-ADMISSAO-01 (Gabriel 25/11/2026 08:05) — a ADMISSÃO é a fonte da data da contratação: as regras da tela do funcionário
 * (o "Desde" do salário e da atuação, a atuação vigente, o aviso antes da admissão e o "a atualizar" que some quando o dado existe).
 * ⚠ Arquivo PRÓPRIO, e não o `folhaTela.ts`: aquele é alcançado (pelo lançamento) por 17 telas fora da Folha, e o gate de tela põe sob a
 *   régua de fonte toda tela que o diff alcança — estas regras só servem às telas da Folha.
 */
import { dataBR, type AtuacaoDesde } from '@/lib/folha/folhaTela';

/** FOLHA-ADMISSAO-01 (Gabriel 25/11) — a marca "a atualizar" SOME quando o dado existe (o banco a tira ao gravar o salário; a tela não
 *  espera por ele): salário com histórico, CPF, cargo e admissão preenchidos. As outras marcas ficam como vieram. */
export function aAtualizarDe(f: { a_atualizar: readonly string[]; cpf?: string | null; cargo?: string | null; admissao?: string | null }, temSalario: boolean): string[] {
  const existe: Record<string, boolean> = { salario: temSalario, cpf: !!f.cpf, cargo: !!f.cargo, admissao: !!f.admissao };
  return f.a_atualizar.filter(c => !existe[c]);
}
/** FOLHA-ADMISSAO-01 — o "Desde" do formulário: a 1ª linha (salário ou atuação) nasce na ADMISSÃO (a data da contratação, fonte única);
 *  uma linha NOVA (reajuste, troca de fazenda/atividade) começa VAZIA — nunca a data de hoje. */
export const desdeInicial = (temLinhas: boolean, admissao: string | null): string => (temLinhas ? '' : admissao ?? '');
/** FOLHA-ADMISSAO-01 — "Desde" antes da admissão é AVISO (não bloqueia): a data grava como digitada */
export function avisoDoDesde(desde: string, admissao: string | null): string | null {
  return desde && admissao && desde < admissao ? `antes da admissão (${dataBR(admissao)})` : null;
}
/** a "cara" de uma vigência (fazendas, atividades e %): duas vigências com a mesma chave são a MESMA atuação */
const chaveDaVigencia = (itens: readonly AtuacaoDesde[]): string => itens.map(a => `${a.fazenda_id}|${a.atividade}|${a.pct}`).sort().join(';');
/** FOLHA-ADMISSAO-01 — a atuação que VALE em `hoje` e desde quando: a vigência mais recente até `hoje`; as vigências anteriores IGUAIS
 *  a ela (mesma fazenda, atividade e %) são a mesma atuação, então o "desde" é o da primeira delas ("vale desde 07/05/2022" e não a
 *  vigência repetida de 09/2026). Só vigências futuras (ou nenhuma) → null. */
export function atuacaoVigente(atuacoes: readonly AtuacaoDesde[], hoje: string): { desde: string; itens: AtuacaoDesde[] } | null {
  const porDesde = new Map<string, AtuacaoDesde[]>();
  for (const a of atuacoes) if (a.desde) porDesde.set(a.desde, [...(porDesde.get(a.desde) ?? []), a]);
  const datas = [...porDesde.keys()].filter(d => d <= hoje).sort();
  const ultima = datas[datas.length - 1];
  if (ultima === undefined) return null;
  const chave = (d: string | undefined): string => chaveDaVigencia(porDesde.get(d ?? '') ?? []);
  let i = datas.length - 1;
  while (i > 0 && chave(datas[i - 1]) === chave(ultima)) i--;
  return { desde: datas[i] ?? ultima, itens: porDesde.get(ultima) ?? [] };
}

/**
 * FOLHA-REGUA-01 (Gabriel 26/11 08:14, FASE 0): a ficha mostrava a MESMA atuação duas vezes — no banco são DUAS VIGÊNCIAS de conteúdo igual
 * (a da carga e a regravada pela tela; as duas "desde 07/2026"). A regra é a do `atuacaoVigente`: a vigência que repete a ANTERIOR (mesma
 * `chaveDaVigencia`) é a mesma atuação — não aparece de novo e vale a data da mais antiga. Só exibição: nada muda no banco.
 * Devolve as vigências da mais nova para a mais antiga, cada uma com as suas linhas (a de maior % primeiro).
 */
export function vigenciasDaAtuacao(atuacoes: readonly AtuacaoDesde[]): Array<{ desde: string | null; itens: AtuacaoDesde[] }> {
  const porDesde = new Map<string, AtuacaoDesde[]>();
  for (const a of atuacoes) porDesde.set(a.desde ?? '', [...(porDesde.get(a.desde ?? '') ?? []), a]);
  const out: Array<{ desde: string | null; itens: AtuacaoDesde[] }> = [];
  for (const [desde, itens] of [...porDesde.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (out.length && chaveDaVigencia(out[out.length - 1].itens) === chaveDaVigencia(itens)) continue;
    out.push({ desde: desde || null, itens: [...itens].sort((a, b) => b.pct - a.pct) });
  }
  return out.reverse();
}
