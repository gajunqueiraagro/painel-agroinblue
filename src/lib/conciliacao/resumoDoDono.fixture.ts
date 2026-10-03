/**
 * APOIO DE TESTE — a linha de conta como o dono a devolve desde o PR-CONC-INTERNA-SEPARADA-01a.
 *
 * Em conta SEM PAR (e na própria interna) o dono manda `proprio` igual aos campos de topo, a posição própria igual à da
 * conta e o saldo corrido próprio igual ao corrido. Os fixtures escritos à mão nos testes descrevem só o topo; `comProprio`
 * acrescenta o que o dono mandaria — a MESMA regra, sem número novo. Quem testa conta-mãe escreve o `proprio` dela à mão
 * (ele difere do topo, que é o consolidado do par), e ele é respeitado.
 */
const SALDOS = ['saldo_inicial', 'saldo_sistema', 'saldo_extrato', 'diferenca'];
const FLUXOS = ['entradas', 'saidas', 'entradas_terceiros', 'entradas_transferencias', 'saidas_terceiros', 'saidas_transferencias'];

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function comProprio(linha: Record<string, unknown>): Record<string, unknown> {
  if (linha.nivel === 'tipo' || linha.nivel === 'total') return linha;
  const out: Record<string, unknown> = { ...linha };
  if (linha.proprio === undefined) {
    const proprio: Record<string, unknown> = {};
    for (const c of SALDOS) proprio[c] = linha[c] ?? null;
    for (const c of FLUXOS) proprio[c] = linha[c] ?? 0;
    out.proprio = proprio;
  }
  const pos = linha.posicao;
  if (ehObjeto(pos) && !('saldo_sistema_proprio_na_data' in pos)) {
    out.posicao = { ...pos, saldo_sistema_proprio_na_data: pos.saldo_sistema_na_data ?? null };
  }
  const ls = linha.linhas_sistema;
  if (Array.isArray(ls)) {
    out.linhas_sistema = ls.map((l: unknown) => (ehObjeto(l) && !('saldo_apos_proprio' in l) ? { ...l, saldo_apos_proprio: l.saldo_apos } : l));
  }
  return out;
}
