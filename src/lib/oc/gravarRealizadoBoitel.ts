/**
 * A GRAVACAO DO REALIZADO DO BOITEL NO SALVAR DA NEGOCIACAO — OC-BOITEL-REALIZADO-UX-01 / 01c.
 *
 * Duas escritas encadeadas pelos retornos: `oc_salvar_boitel('realizado')` e, com o liquido do
 * acerto, `oc_revalorar_lote`. Mora aqui, e nao na `LancamentosTab`, para a ordem e as recusas
 * serem testaveis sem montar a tela; quem chama injeta as escritas.
 *
 * ⚠ O ID DO LOTE VEM DO BANCO, LIDO DEPOIS DO `oc_salvar_lotes` DO MESMO SALVAR — 01c. Ele vinha
 *   de `lotesApi.lotes[0]?.id`, o estado do render do clique: numa OC NOVA o lote nasce no
 *   `oc_salvar_lotes` desse mesmo Salvar e ainda nao tinha id ali, entao o revalorar era PULADO
 *   em silencio e a tela dizia "Realizado do abate lancado". Medido na 77d963be (RRCC, 26/09):
 *   lote na projecao (628.569,35) com o acerto pelos fatos em 656.957,17.
 * ⚠ SEM LOTE NAO HA SUCESSO: o realizado ja' foi gravado, mas o valor da operacao nao andou —
 *   dizer "lancado" seria a mesma mentira. Volta erro (o chamador o escreve ao lado do Salvar) e
 *   o rascunho fica sujo, entao o proximo Salvar repete as duas escritas (idempotentes).
 * ⚠ NENHUMA RECUSA VAI PARA TOAST (UX-TOAST-01): tudo volta como texto.
 */

export type ResultadoRealizado =
  | { ok: true; versao: number; sucesso: string; avisoPendente: string | null }
  | { ok: false; erro: string };

export interface RevaloracaoFeita {
  versao: number;
  lancamentosAfetados: number;
  /** O compromisso programado que a RPC nao atualizou (`pendente`) — OC-BOITEL-VALOR-01 A4. */
  avisoPendente: string | null;
}

export interface EscritasDoRealizado {
  /** `oc_salvar_boitel(..., 'realizado', payload)` — devolve a versao nova. */
  salvarBoitel: (versao: number) => Promise<number>;
  /** O id do lote da operacao, LIDO DO BANCO agora. `null` sem lote. */
  idDoLote: () => Promise<string | null>;
  /** `oc_revalorar_lote` com o liquido do acerto. */
  revalorar: (versao: number, loteId: string, valor: number) => Promise<RevaloracaoFeita>;
  /** Depois do revalorar: reler os lotes e avisar o cache zootecnico. */
  depoisDeRevalorar: () => Promise<void>;
  /** 40001 — outra acao mexeu na operacao entre o render e o clique. */
  ehConflitoDeVersao: (e: unknown) => boolean;
}

const msg = (e: unknown, padrao: string) => (e instanceof Error && e.message ? e.message : padrao);

export async function gravarRealizadoBoitel(
  versaoInicial: number,
  /** `liquidoDaVendaBoitel(realizado)` — o "(=) Saldo do acerto". */
  liquido: number | null,
  escritas: EscritasDoRealizado,
): Promise<ResultadoRealizado> {
  let v = versaoInicial;
  try {
    v = await escritas.salvarBoitel(v);
  } catch (e) {
    /* Recarregar aqui apagaria o rascunho; a frase manda conferir antes de salvar de novo. */
    if (escritas.ehConflitoDeVersao(e)) {
      return { ok: false, erro: 'Realizado não gravado: esta operação mudou em outro lugar. Feche, reabra e confira antes de salvar de novo.' };
    }
    return { ok: false, erro: `Realizado não gravado: ${msg(e, 'falha ao gravar.')}` };
  }

  /* ⚠ SEM LIQUIDO POSITIVO NAO HA O QUE REVALORAR — o comportamento de antes, fora do escopo do
     01c: um acerto negativo nao vira valor do lote (a RPC recusa `<= 0`). */
  if (liquido == null || !(liquido > 0)) {
    return { ok: true, versao: v, sucesso: 'Realizado do abate lançado.', avisoPendente: null };
  }

  let loteId: string | null;
  try {
    loteId = await escritas.idDoLote();
  } catch (e) {
    return { ok: false, erro: `Realizado gravado, mas o lote não foi lido para revalorar: ${msg(e, 'falha na leitura.')} Salve de novo.` };
  }
  if (!loteId) {
    return { ok: false, erro: 'Realizado gravado, mas a operação não tem lote para revalorar — o valor da operação não mudou. Confira o lote e salve de novo.' };
  }

  try {
    const r = await escritas.revalorar(v, loteId, liquido);
    v = r.versao;
    await escritas.depoisDeRevalorar();
    const n = r.lancamentosAfetados;
    return {
      ok: true, versao: v,
      sucesso: n > 0
        ? `Realizado lançado. Lote revalorado e ${n} lançamento${n > 1 ? 's' : ''} do rebanho corrigido${n > 1 ? 's' : ''}.`
        : 'Realizado lançado. Lote revalorado.',
      avisoPendente: r.avisoPendente,
    };
  } catch (e) {
    return { ok: false, erro: `Realizado gravado, mas o lote não foi revalorado: ${msg(e, 'falha ao revalorar.')} Salve de novo.` };
  }
}
