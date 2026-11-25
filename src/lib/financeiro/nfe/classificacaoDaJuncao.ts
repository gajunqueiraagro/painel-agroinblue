/**
 * NOTA-JUNTAR-CLASSIF-01 (Gabriel 24/11 19:05; NJ, NF 176.663, 2 parcelas: 1/2 Manutenção Máquinas Agricultura, 2/2 Manutenção Máquinas Pecuária) —
 * juntar exige UMA classificação nas parcelas (regra de 13/11, `fn_parcelamento_juntar_lancamentos`); o aviso RESOLVE em 1 clique: "usar a da k/N
 * em todas" põe a conta (e a safra) daquela parcela no "Aplicar a todas" e a `fn_nota_completar` padroniza ANTES de juntar (paga/conciliada também:
 * só o caixa trava). "Dividir por item" espera o rateio (NOTA-ITENS-CLASSIF-01): "em breve", não junta.
 * DA-NOTA ETAPA 2 (Gabriel 19:07) — o subcentro mostra o que DIFERENCIA: o nome curto da conta + a atividade ("Manut. Máquinas · Pecuária"). PURO.
 */

export const FRASE_CLASSIFICACOES_DIFERENTES = 'Escolha a classificação acima.';
/** a recusa do banco que o aviso resolve (`fn_parcelamento_juntar_lancamentos`, motivo 'classificacoes') */
export const ehRecusaDeClassificacoes = (frase: string) => /classifica[çc][õo]es diferentes/i.test(frase);

const ATIVIDADE: Record<string, string> = { pecuaria: 'Pecuária', agricultura: 'Agricultura', silvicultura: 'Silvicultura', administrativo: 'Administrativo' };
/* o fim do nome que repete a atividade ("… Pecuária", "… Agrícolas") sai: a atividade vem depois do "·" */
const FIM_DA_ATIVIDADE = /\s+(pecu[áa]ria|agricultura|agr[íi]colas?|silvicultura|administrativo)\s*$/i;
const ABREVIA: ReadonlyArray<[RegExp, string]> = [[/\bManuten[çc][ãa]o\b/g, 'Manut.'], [/\bInvestimento\b/g, 'Invest.'], [/\bEquipamentos\b/g, 'Equip.']];

/** "Manutenção Máquinas Pecuária" (pecuaria) → "Manut. Máquinas · Pecuária". Sem atividade conhecida = o nome como está. */
export function nomeCurtoDaConta(subcentro: string | null | undefined, escopo: string | null | undefined): string {
  const nome = (subcentro ?? '').trim();
  if (!nome) return '';
  const atividade = ATIVIDADE[(escopo ?? '').toLowerCase()];
  if (!atividade) return nome;
  const base = ABREVIA.reduce((t, [r, s]) => t.replace(r, s), nome.replace(FIM_DA_ATIVIDADE, '')).trim();
  return base ? `${base} · ${atividade}` : atividade;
}

export interface ParcelaDaJuncao { id: string; rotulo: string; planoContaId: string | null; safraId: string | null }
export interface OpcaoDaClassificacao { planoContaId: string; safraId: string | null; rotulo: string }

/** Até quantas classificações viram botão (o `Segmentado` leva até 4: 3 + "Dividir por item"); acima, escolhe-se no "Aplicar a todas". */
export const MAX_OPCOES_DE_CLASSIFICACAO = 3;

/**
 * As classificações que as parcelas a juntar têm HOJE, cada uma pela 1ª parcela que a tem (na ordem); nula = não há o que escolher (uma só).
 * Parcela sem conta conta como diferente (o banco recusa), mas não vira opção.
 */
export function classificacoesParaJuntar(parcelas: readonly ParcelaDaJuncao[]): { opcoes: OpcaoDaClassificacao[]; mais: number } | null {
  const distintas = new Set(parcelas.map((p) => p.planoContaId ?? ''));
  if (distintas.size <= 1) return null;
  const vistas = new Map<string, OpcaoDaClassificacao>();
  for (const p of parcelas) {
    if (p.planoContaId && !vistas.has(p.planoContaId)) vistas.set(p.planoContaId, { planoContaId: p.planoContaId, safraId: p.safraId, rotulo: p.rotulo });
  }
  const todas = [...vistas.values()];
  return { opcoes: todas.slice(0, MAX_OPCOES_DE_CLASSIFICACAO), mais: Math.max(0, todas.length - MAX_OPCOES_DE_CLASSIFICACAO) };
}
