/**
 * O RESUMO DO DESFAZER DE ARQUIVO — PR-CONC-IMPORT-BANCO-01B.
 *
 * ⚠ O RELATÓRIO É DA RPC, NUNCA DA TELA: `fn_extrato_desfazer_arquivo(..., p_simular = true)` devolve as contagens; aqui só se
 * escrevem em português. Cada parte só aparece com contagem > 0, e a tela quebra a linha ENTRE partes (nunca no meio de uma).
 * Para o desfazer de 03/10 do Agnaldo, que esta frase teria mostrado:
 *   "100 movimentos de 03/08 a 02/09 · 93 de agosto, 7 de setembro · 108 conciliações serão desfeitas · 80 lançamentos serão
 *    cancelados (79 classificados, 17 editados à mão) · 1 volta a programado · 2 liquidações de OC serão estornadas"
 * ⚠ CLASSIFICADO = com conta do plano (`plano_conta_id`); "editado à mão" = `editado_manual`. Os dois números, sem trocar um
 *   pelo outro (o modal antigo dizia "17 já enriquecidos" de 80 classificados).
 */

export interface SimulacaoDesfazer {
  ok?: boolean;
  motivo?: string;
  frase?: string;
  extratos?: number;
  periodo_inicio?: string;
  periodo_fim?: string;
  por_mes?: { mes: string; qtde: number }[];
  conciliacoes_desfeitas?: number;
  crus_cancelados?: number;
  crus_classificados?: number;
  crus_enriquecidos?: number;
  voltam_a_programado?: number;
  liquidacoes_oc_estornadas?: unknown[];
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const n = (v: number) => v.toLocaleString('pt-BR');
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (q: number, um: string, varios: string) => `${n(q)} ${q === 1 ? um : varios}`;

export function partesDoResumoDoDesfazer(r: SimulacaoDesfazer): string[] {
  const partes: string[] = [];
  const ext = r.extratos ?? 0;
  if (ext > 0) {
    const periodo = r.periodo_inicio && r.periodo_fim
      ? (r.periodo_inicio === r.periodo_fim ? ` em ${ddmm(r.periodo_inicio)}` : ` de ${ddmm(r.periodo_inicio)} a ${ddmm(r.periodo_fim)}`)
      : '';
    partes.push(`${plural(ext, 'movimento', 'movimentos')}${periodo}`);
  }
  const meses = (r.por_mes ?? []).filter((m) => m.qtde > 0);
  /* Um mês só já está dito no período; o recorte por mês é o que avisa que o arquivo atravessa a virada. */
  if (meses.length > 1) {
    partes.push(meses.map((m) => `${n(m.qtde)} de ${MESES[Number(m.mes.slice(5, 7)) - 1] ?? m.mes}`).join(', '));
  }
  const conc = r.conciliacoes_desfeitas ?? 0;
  if (conc > 0) partes.push(conc === 1 ? '1 conciliação será desfeita' : `${n(conc)} conciliações serão desfeitas`);
  const crus = r.crus_cancelados ?? 0;
  if (crus > 0) {
    const cls = r.crus_classificados ?? 0;
    const edit = r.crus_enriquecidos ?? 0;
    const editados = edit > 0 ? plural(edit, 'editado à mão', 'editados à mão') : '';
    if (cls === crus) {
      partes.push(`${plural(crus, 'lançamento classificado será cancelado', 'lançamentos classificados serão cancelados')}${editados ? ` (${editados})` : ''}`);
    } else {
      const dentro = [cls > 0 ? plural(cls, 'classificado', 'classificados') : '', editados].filter(Boolean).join(', ');
      partes.push(`${plural(crus, 'lançamento será cancelado', 'lançamentos serão cancelados')}${dentro ? ` (${dentro})` : ''}`);
    }
  }
  const volta = r.voltam_a_programado ?? 0;
  if (volta > 0) partes.push(volta === 1 ? '1 volta a programado' : `${n(volta)} voltam a programado`);
  const liq = r.liquidacoes_oc_estornadas?.length ?? 0;
  if (liq > 0) partes.push(liq === 1 ? '1 liquidação de OC será estornada' : `${n(liq)} liquidações de OC serão estornadas`);
  return partes;
}
