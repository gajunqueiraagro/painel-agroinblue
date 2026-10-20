/**
 * PAGAR A PARCELA POS-FIXADA PELO EXTRATO — FIN-POS-FIXADO-01b (Gabriel, 20/10/2026). Puro.
 *
 * Quem decide e' o BANCO (`fn_financiamento_parcela_pos_pagar`): juro real = |extrato| − principal − encargos; o principal nunca
 * muda; negativo e' recusado com a frase; a parcela fica paga pelo gatilho do FIN-PARCELA-STATUS-01. Aqui so' se LE o que o banco
 * devolve e se reconhece, entre os lancamentos levados no modal de casar, os da parcela pos com juros estimado — pelo que
 * `fn_juros_estimados_do_cliente` (a regra do 01a) e as parcelas dela dizem. Nenhuma conta de juro na tela.
 */

const campo = (o: unknown, k: string): unknown => (o != null && typeof o === 'object' ? Reflect.get(o, k) : undefined);
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const numero = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** A frase quando o operador leva so' parte da parcela, ou outra coisa junto. */
export const FRASE_LEVE_O_PAR =
  'Parcela de contrato pós-fixado: leve o principal e os juros desta parcela, e nada mais, para gravar o juro real.';

/**
 * lancamento (principal ou juros) -> parcela, para as parcelas pos com juros estimado. `estimados` e' o retorno de
 * `fn_juros_estimados_do_cliente` (lancamento de juros -> parcela); `parcelas` as linhas `{id, lancamento_id}` dessas parcelas.
 * Peca torta = nulo (a leitura inteira nao vale, e o modal segue o caminho de sempre).
 */
export function mapaDaParcelaPos(estimados: unknown, parcelas: unknown): Map<string, string> | null {
  if (!Array.isArray(estimados) || !Array.isArray(parcelas)) return null;
  const mapa = new Map<string, string>();
  for (const e of estimados) {
    const lj = texto(campo(e, 'lancamento_id'));
    const p = texto(campo(e, 'parcela_id'));
    if (!lj || !p) return null;
    mapa.set(lj, p);
  }
  for (const q of parcelas) {
    const p = texto(campo(q, 'id'));
    const lp = texto(campo(q, 'lancamento_id'));
    if (!p) return null;
    if (lp) mapa.set(lp, p);
  }
  return mapa;
}

/** A parcela pos dos levados: a de qualquer levado que seja principal ou juros dela; nenhum = nulo. */
export function parcelaPosDosLevados(ids: readonly string[], mapa: ReadonlyMap<string, string> | null): string | null {
  if (!mapa) return null;
  for (const id of ids) {
    const p = mapa.get(id);
    if (p) return p;
  }
  return null;
}

export interface RespostaPosPagar {
  ok: boolean;
  frase: string | null;
  principalId: string | null;
  jurosId: string | null;
  jurosEstimado: number | null;
  juroReal: number | null;
  noExtrato: number | null;
}

/** O retorno do dono, sem cast. Peca torta = nulo. */
export function lerRespostaPosPagar(dado: unknown): RespostaPosPagar | null {
  const ok = campo(dado, 'ok');
  if (typeof ok !== 'boolean') return null;
  const parcela = campo(dado, 'parcela');
  const recusa = campo(dado, 'recusa');
  const frase = recusa == null ? null : texto(campo(recusa, 'frase'));
  if (!ok && !frase) return null;
  return {
    ok,
    frase,
    principalId: texto(campo(parcela, 'principal_id')),
    jurosId: texto(campo(parcela, 'juros_id')),
    jurosEstimado: numero(campo(parcela, 'juros_estimado')),
    juroReal: numero(campo(parcela, 'juro_real')),
    noExtrato: numero(campo(dado, 'no_extrato')),
  };
}

/** Os levados sao exatamente o principal e os juros da parcela que o banco leu. */
export function levadosSaoOPar(ids: readonly string[], r: RespostaPosPagar): boolean {
  if (!r.principalId || !r.jurosId || ids.length !== 2) return false;
  return ids.includes(r.principalId) && ids.includes(r.jurosId);
}

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A linha do resumo: o juro real e o estimado, com os numeros do banco. */
export function fraseDoJuroReal(r: RespostaPosPagar): string | null {
  if (!r.ok || r.juroReal == null) return null;
  const est = r.jurosEstimado == null ? '' : ` · estimado R$ ${brl(r.jurosEstimado)}`;
  return `Juro real pelo extrato: R$ ${brl(r.juroReal)}${est} · o principal não muda`;
}
