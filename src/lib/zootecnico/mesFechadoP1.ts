/**
 * A FRASE DO "MÊS FECHADO (P1)" — FAZ-ATIVIDADE-01c.
 *
 * Uma pergunta só, feita do mesmo jeito em toda superfície de lançamento: o mês da DATA DIGITADA,
 * para a FAZENDA ESCOLHIDA no próprio formulário, está fechado no Mapa de Pastos?
 *
 * ⚠ NASCE DE UM AVISO QUE FALAVA DO MÊS ERRADO. Até este PR, `LancamentosTab` mostrava
 * "Mês fechado (P1)" na tela de TIPOS, fora do modal, e o mês vinha do `useState` da data, semeado
 * com `new Date()` — o mês corrente da máquina. O operador via o aviso de setembro querendo lançar
 * em agosto, e não via nada quando lançava em setembro num mês aberto. A pergunta só tem resposta
 * depois que existem data e fazenda, e as duas só existem dentro do modal.
 *
 * ⚠ ESTE ARQUIVO NÃO INVENTA IDIOMA: ele extrai o que `AbateModalShell`, `VendaModalShell` e
 * `CompraModalShell` já faziam, palavra por palavra, para que os cinco formulários que não tinham
 * o aviso (Nascimento, Morte, Compra Meta, Venda Meta e o genérico de Consumo/Transferência/
 * legados) digam exatamente a mesma coisa. Os três shells originais seguem com a cópia local deles
 * — não foram tocados neste PR, e unificá-los é frente própria.
 */

export const MESES_EXTENSO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'] as const;

/** `'2026-08-14'` → `'2026-08'`; vazio/ausente → `undefined`, que o hook lê como "não pergunte". */
export function anoMesDaData(data: string | null | undefined): string | undefined {
  return data ? data.slice(0, 7) : undefined;
}

/**
 * A frase do banner, ou `null` quando não há o que avisar.
 *
 * ⚠ `null` É A SENTINELA ÚNICA: quem chama usa o MESMO valor para decidir se mostra o banner e se
 * trava o Salvar. Duas condições separadas já produziram, neste repo, um botão travado sem
 * explicação ao lado — "não dá para travar em silêncio por construção" (AbateModalShell).
 */
export function mesFechadoMotivo(
  fechado: boolean,
  anoMes: string | undefined,
  fazendaNome: string | null | undefined,
): string | null {
  if (!fechado || !anoMes) return null;
  const mes = MESES_EXTENSO[Number(anoMes.slice(5, 7)) - 1];
  /* ZOOT-MES-FECHADO-MODAL-01 (Gabriel, 15/10/2026): a frase diz O QUE trava e ONDE destrava — os dois caminhos. */
  return `${mes}/${anoMes.slice(0, 4)} fechado no Mapa de Pastos (P1) para ${fazendaNome ?? 'esta fazenda'}. `
    + 'Reabra pelo botão ao lado ou em Produção › Fechamento Área.';
}

/** ZOOT-MES-FECHADO-MODAL-01 — a dica CURTA ao lado do botão: a frase inteira está na faixa logo acima e no `title`. */
export const DICA_MES_FECHADO = 'mês fechado (P1) — veja o aviso acima';

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

/**
 * ZOOT-MES-FECHADO-MODAL-01 — a frase da TRAVA MASTER (`useMasterLock`: todos os pastos fechados E valor do rebanho
 * preenchido, pela fazenda do cabeçalho), ou `null`. A regra da trava não mora aqui: quem chama passa o MESMO estado que
 * recusava o clique (`isReadOnly`). Mesma sentinela única do P1: o mesmo valor desenha a faixa e trava o botão.
 */
export function travaMasterMotivo(
  travado: boolean,
  anoMes: string | undefined,
  fazendaNome: string | null | undefined,
): string | null {
  if (!travado || !anoMes) return null;
  const mes = MESES_CURTOS[Number(anoMes.slice(5, 7)) - 1];
  return `Mês ${mes}/${anoMes.slice(0, 4)} com trava master (${fazendaNome ?? 'esta fazenda'}). Desbloqueie com a senha master.`;
}

/** O `title` do botão travado: as mesmas frases da faixa, P1 primeiro. `undefined` quando nada trava. */
export function tituloDaTrava(p1: string | null | undefined, master: string | null | undefined): string | undefined {
  const partes = [p1, master].filter((t): t is string => !!t);
  return partes.length > 0 ? partes.join(' ') : undefined;
}
