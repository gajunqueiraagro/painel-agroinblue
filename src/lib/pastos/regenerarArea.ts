/* ── PR-AREA-REGENERAR-01J — vocabulario compartilhado da regeneracao de area ──
   Extraido de src/pages/FechamentoTab.tsx sem alterar uma virgula. Passou a ter dois
   consumidores quando "Regenerar historico" mudou para o cadastro de pastos: o lote
   vive em PastosTab e o mes unico continua em FechamentoTab. Duplicar faria duas
   copias que divergem — a lista de erros e a soma das familias tem que ser a MESMA
   nos dois lugares, senao a mesma falha ganha dois textos e o mesmo mes ganha dois
   totais. Um modulo, dois importadores. */

/* ── PR-AREA-REGENERAR-01B — erros proprios de fn_regenerar_area_do_mes ──
   A funcao levanta seis erros com MESSAGE proprio. Exibir error.message cru
   entregaria "conjunto_nao_vigente" ao operador, que nao tem como saber o que e um
   conjunto vigente. O casamento e por PREFIXO porque duas mensagens carregam
   explicacao depois do codigo ("ano_mes_invalido: esperado YYYY-MM (01-12)"). */
export const ERROS_REGENERAR: ReadonlyArray<readonly [string, string]> = [
  ['nao_autenticado',      'Sessão expirada. Entre novamente.'],
  ['ano_mes_invalido',     'Mês inválido.'],
  ['fazenda_inexistente',  'Fazenda não encontrada.'],
  ['sem_permissao',        'Você não tem permissão para regenerar esta fazenda.'],
  ['mes_oficializado',     'Mês oficializado. Reabra formalmente antes de regenerar.'],
  ['conjunto_nao_vigente', 'Feche o mês antes de regenerar a área.'],
];

/* PR-AREA-REGENERAR-01F — as SETE familias de fechamento_area_snapshot.
   Nao entra area_produtiva_ha, que e a PARCELA pecuaria + agricultura + silvicultura e
   somaria em dobro. Nao entra area_total_ha, que e a MATRICULA copiada do cadastro: ela
   nao muda quando o cadastro de pastos muda, e mostra-la faria o toast dizer "nao mudou"
   sempre. */
export const CAMPOS_FAMILIA: readonly string[] = [
  'area_pecuaria_ha', 'area_agricultura_ha', 'area_silvicultura_ha',
  'area_reserva_ha', 'area_app_ha', 'area_benfeitorias_ha', 'area_outras_ha',
];

export function paraNumero(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/* area_anterior e area_nova chegam como to_jsonb da LINHA INTEIRA de
   fechamento_area_snapshot. O que interessa e a soma das familias — foi ela que a
   regeneracao produziu, e e ela que muda quando o cadastro de pastos muda.
   Ler so a produtiva escondia o essencial: na Sta. Tereza o toast disse
   632,30 -> 644,20 quando a correcao real foi 632,30 -> 837,92. Os 193,72 de reserva,
   APP e benfeitorias eram justamente o que faltava no cadastro.
   Campo ausente vale zero NA SOMA; bloco nulo ou nao-objeto devolve null, e o
   formatNum imprime travessao — ausencia de dado nao e 0,00.
   Object.entries em vez de bloco[campo]: indexar exigiria cast, e `in` so estreita
   com chave literal. */
export function somarFamilias(bloco: unknown): number | null {
  if (bloco === null || typeof bloco !== 'object') return null;
  let soma = 0;
  for (const [chave, valor] of Object.entries(bloco)) {
    if (CAMPOS_FAMILIA.includes(chave)) soma += paraNumero(valor);
  }
  return soma;
}

/* ── PR-AREA-REGENERAR-01E — lote ──
   Cada mes e uma chamada e uma TRANSACAO propria. Nao ha atomicidade possivel entre
   eles: 79 meses numa transacao so seria um lock enorme sobre a fazenda inteira. Logo,
   falha no mes 40 nao desfaz os 39 anteriores — o lote precisa RELATAR, nao so
   executar, e o relatorio nao pode ser um toast que some. */
export type FalhaLote = { anoMes: string; motivo: string };
export type LoteRelatorio = { total: number; regenerados: number; inalterados: number; falhas: FalhaLote[] };
