/* ── PR-AREA-REGENERAR-01J — vocabulario compartilhado da regeneracao de area ──
   Extraido de src/pages/FechamentoTab.tsx sem alterar uma virgula. Passou a ter dois
   consumidores quando "Regenerar historico" mudou para o cadastro de pastos: o lote
   vive em PastosTab e o mes unico continua em FechamentoTab. Duplicar faria duas
   copias que divergem — a lista de erros e a soma das familias tem que ser a MESMA
   nos dois lugares, senao a mesma falha ganha dois textos e o mesmo mes ganha dois
   totais. Um modulo, dois importadores. */

/* ── PR-AREA-ERROS-MAPA-01 — os NOVE codigos alcancaveis pela regeneracao ──
   O mapa existe para o vocabulario interno do banco nao vazar para o operador: sem
   ele, a tela imprime "area_produtiva_derivada_zero: nenhum pasto de pecuaria..." na
   cara de quem clicou em regenerar.

   Escrito no 01B com SEIS codigos, quando a funcao era so-area. A cadeia cresceu nos
   PRs 01D, 01G e 01H, e hoje a regeneracao atravessa QUATRO funcoes — os codigos vem
   de todas elas, nao so da que a tela chama:
     fn_regenerar_area_do_mes            nao_autenticado, ano_mes_invalido,
                                         fazenda_inexistente, sem_permissao,
                                         mes_oficializado, cards_abertos_com_dados
     fn_gerar_area_de_snapshot           area_produtiva_derivada_zero,
                                         snapshot_nao_vigente
     fn_obter_ou_criar_fechamentos_lote  falha_concorrencia_irrecuperavel_lote

   Casamento por PREFIXO porque quatro mensagens carregam explicacao depois do codigo
   ("ano_mes_invalido: esperado YYYY-MM (01-12)").

   conjunto_nao_vigente SAIU. Ele existe no banco, mas so em fn_oficializar_p1, que
   NAO esta na cadeia da regeneracao — nenhuma das quatro funcoes acima a chama. Era
   guarda da propria fn_regenerar_area_do_mes ate o 01D, que a removeu ao passar a
   materializar o conjunto ausente. Ficou prometendo um texto que nunca sai.

   FORA DO MAPA POR DECISAO: guard_fechamento_pastos_snapshot, o trigger que barra
   alteracao de card em mes com P2 fechado ou validado. Ele e alcancavel pelo passo de
   conciliacao, mas levanta mensagem interpolada em portugues ("Mes % possui Valor do
   Rebanho validado ou P2 fechado. Reabra o pilar P2 antes de alterar pastos."), sem
   codigo snake_case. O prefixo nao a alcanca por construcao, e o fallback ja entrega
   texto legivel — mapear seria duplicar uma frase que ja esta pronta. */
export const ERROS_REGENERAR: ReadonlyArray<readonly [string, string]> = [
  ['nao_autenticado',      'Sessão expirada. Entre novamente.'],
  ['ano_mes_invalido',     'Mês inválido.'],
  ['fazenda_inexistente',  'Fazenda não encontrada.'],
  ['sem_permissao',        'Você não tem permissão para regenerar esta fazenda.'],
  ['mes_oficializado',     'Mês oficializado. Reabra formalmente antes de regenerar.'],
  ['cards_abertos_com_dados',   'Há card de pasto aberto com dados neste mês. Feche o mês manualmente antes de regenerar.'],
  ['area_produtiva_derivada_zero', 'Nenhum pasto de pecuária, agricultura ou silvicultura no mês. A área produtiva ficaria zero.'],
  ['snapshot_nao_vigente',      'O conjunto do mês mudou durante a operação. Tente novamente.'],
  ['falha_concorrencia_irrecuperavel_lote', 'Não foi possível criar os cards do mês. Tente novamente.'],
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
