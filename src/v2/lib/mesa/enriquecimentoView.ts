// ============================================================================
// enriquecimentoView — módulo PURO (sem React, sem Supabase, sem RPC/write).
// Adapter/selector: mapeia a shape do banco (vw_classificacao_staging_preview /
// SessaoClassificacaoResumo) para os ViewModels burros da Mesa Global. NENHUMA
// regra de negócio nova: grava/mantém/órfão vêm das flags will_* da view; os
// demais campos são projeção/formatação e comparação confere/difere de leitura.
// ============================================================================
import type {
  ClassificacaoStagingPreviewRow,
  SessaoClassificacaoResumo,
} from '@/v2/hooks/useClassificacaoStaging';
import type {
  EnriqRowVM, EnriqSessaoVM, EnriqContagensVM, EnriqContaVM, EnriqStatus, EnriqTom, EnriqComparativoLinha,
  EnriqCampoEditavel, EnriqProveniencia, EnriqEdicao, EnriqEstado,
} from '@/v2/components/mesa/enriquecimento/types';
import { fmtData, fmtBRL, fmtTexto, mesAbrev, dataHoraCurta, STATUS_META } from '@/v2/components/mesa/enriquecimento/fmt';

const vazio = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';
const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

// Linha de comparação "de leitura" (Sistema x Excel): confere / difere / —.
function refLinha(campo: string, sistema: string | null, excel: string | null, sFmt: string, eFmt: string): EnriqComparativoLinha {
  let resultado = '—'; let tom: EnriqTom = 'neutro';
  if (!vazio(sistema) && !vazio(excel)) {
    if (norm(sistema) === norm(excel)) { resultado = 'confere'; tom = 'ok'; }
    else { resultado = 'difere'; tom = 'difere'; }
  }
  return { campo, sistema: sFmt, excel: eFmt, resultado, tom };
}

// REGRA PERMANENTE [[feedback-resultado-nunca-vazio]] — Resultado de campo EDITÁVEL nunca
// aparenta vazio: proposta → mostra a proposta ("muda"); sem proposta mas Sistema==Excel
// → "confere"; sem proposta e sem conferir → "mantém". Jamais '—'.
function resultadoEditavel(sistema: string | null, excel: string | null, proposta: string | null): { resultado: string; tom: EnriqTom } {
  if (!vazio(proposta)) return { resultado: fmtTexto(proposta), tom: 'muda' };
  if (!vazio(sistema) && !vazio(excel) && norm(sistema) === norm(excel)) return { resultado: 'confere', tom: 'ok' };
  return { resultado: 'mantém', tom: 'neutro' };
}

/**
 * A proveniência em português de cliente — 129d item 3.
 *
 * ⚠ OS SETE VALORES SÃO OS QUE O BANCO PRODUZ, contados na view em 07/09: `null` (24.856),
 * `orfao` (11.845), `manual` (1.261), `alias` (907), `regra` (858), `plano_exato` (36) e
 * `plano_folha` (28). Não é lista de desejo — é o que existe, e o `default` cobre o dia em
 * que aparecer um oitavo, dizendo que não sabe em vez de inventar um nome.
 * ⚠ O APELIDO GANHA O TEXTO DO EXCEL entre parênteses porque é ele que o operador
 * reconhece: "apelido que você ensinou" sozinho não diz QUAL.
 */
export function comoFoiSugerido(origem: string | null | undefined, textoExcel: string | null | undefined): string {
  const amostra = (textoExcel ?? '').trim();
  const curto = amostra.length > 28 ? `${amostra.slice(0, 28)}…` : amostra;
  switch (origem) {
    case 'alias': return curto ? `apelido que você ensinou (${curto})` : 'apelido que você ensinou';
    case 'regra': return 'regra automática';
    case 'manual': return 'escolha sua, salva antes';
    case 'plano_exato':
    case 'plano_folha': return 'nome igual ao do plano de contas';
    case 'orfao': return 'planilha (conta fora do plano)';
    case null:
    case undefined: return 'sem sugestão';
    default: return 'origem não reconhecida';
  }
}

/**
 * Entrada ou saída — 129d item 4, extraída para o módulo em 133b porque a linha "Tipo"
 * da tabela precisa da MESMA resposta que a lista mostra.
 *
 * `lanc_sinal` é TEXTO ('1' / '-1'); o `tipo_operacao` é o desempate quando o sinal não
 * veio. Sem lançamento, `null`: a tela não afirma nenhum dos dois.
 */
function entradaOuSaidaDe(row: ClassificacaoStagingPreviewRow): 'entrada' | 'saida' | null {
  if (row.lanc_sinal === '1') return 'entrada';
  if (row.lanc_sinal === '-1') return 'saida';
  const t = row.lanc_tipo_operacao ?? row.excel_tipo_operacao;
  if (typeof t === 'string' && t.startsWith('1')) return 'entrada';
  if (typeof t === 'string' && t.startsWith('2')) return 'saida';
  return null;
}

const rotuloTipo = (v: 'entrada' | 'saida' | null): string | null =>
  v === 'entrada' ? 'Entrada' : v === 'saida' ? 'Saída' : null;

/** "Macro · Grupo · Centro" com os que existem; `null` quando nenhum existe. */
function juntarTrilha(...partes: Array<string | null>): string | null {
  const vivas = partes.filter((p): p is string => !!p && p.trim() !== '');
  return vivas.length ? vivas.join(' · ') : null;
}

export function toRowVM(row: ClassificacaoStagingPreviewRow): EnriqRowVM {
  const statusLabel = STATUS_META[row.match_status]?.label ?? row.match_status;

  // Subcentro — campo GRAVADO pelo apply (usa flags da view).
  // SOBERANIA DO PLANO/SISTEMA: proposta órfã (fora do plano oficial) NUNCA vira Resultado.
  // O editor usa a proposta só se VÁLIDA no plano; caso contrário mantém o subcentro do Sistema
  // (Excel é hipótese, não fonte soberana). Nunca aplicamos subcentro fora do plano.
  const subSistema = row.lanc_subcentro_atual;
  const subExcel = row.proposto_subcentro ?? row.excel_subcentro;   // lado Excel = hipótese (pode ser órfã)
  const subcentroValido = !row.will_create_subcentro_orfao ? row.proposto_subcentro : null;
  const subcentroEfetivo = subcentroValido ?? row.lanc_subcentro_atual;   // valor do editor: nunca a órfã
  let subRes = 'mantém'; let subTom: EnriqTom = 'neutro';
  if (row.will_create_subcentro_orfao) {
    // Excel propôs órfã: Sistema é soberano — se já há subcentro no Sistema, MANTÉM; senão, revisar.
    if (!vazio(subSistema)) { subRes = 'mantém'; subTom = 'neutro'; }
    else { subRes = 'revisar'; subTom = 'bloqueio'; }
  } else if (row.will_set_subcentro) { subRes = 'grava'; subTom = 'muda'; }

  // Favorecido/Fornecedor — campo GRAVADO pelo apply (usa flag da view).
  const favSistema = row.lanc_favorecido_nome_atual;
  const favExcel = row.proposto_favorecido_nome ?? row.excel_fornecedor;
  const favRes = row.will_set_favorecido ? 'grava' : 'mantém';
  const favTom: EnriqTom = row.will_set_favorecido ? 'muda' : 'neutro';

  /* ⚠ A CONTA DO SISTEMA SEGUE O CASE DO CONCILIAR — 133h item 7. Ela era
     `lanc_conta_bancaria_nome ?? conta_filtro_nome ?? excel_conta_origem`, e as duas pontas
     do fallback estavam erradas: a primeira é NULL em 426 das 481 entradas do Raul (a conta
     de uma entrada mora em `conta_destino_id`), e a última exibia o TEXTO DA PLANILHA no
     lugar do que o banco tem — a tela concordando consigo mesma por construção.
     ⚠ `conta_filtro_nome` FICA COMO SEGUNDO RECURSO, e só ele: é a conta que a própria
     staging resolveu (origem/destino do de-para), útil na linha sem lançamento. O texto do
     Excel saiu do fallback — ele é a coluna "Excel" da comparação, não a do sistema. */
  const contaSistema = contaEfetivaNome(
    row.lanc_tipo_operacao, row.lanc_conta_bancaria_nome, row.lanc_conta_destino_nome);
  const banco = contaSistema ?? row.conta_filtro_nome;
  // Descrição/Produto do Sistema = descricao do lançamento (unificado em "Produto / Descrição",
  // P0-3); fallback para observacao quando não há descricao.
  const descricao = row.lanc_descricao ?? row.lanc_observacao;

  const comparativo: EnriqComparativoLinha[] = [
    {
      campo: 'Valor',
      sistema: fmtBRL(row.lanc_valor), excel: fmtBRL(row.excel_valor),
      ...(vazio(row.lanc_valor) || vazio(row.excel_valor)
        ? { resultado: '—', tom: 'neutro' as EnriqTom }
        : row.lanc_valor === row.excel_valor
          ? { resultado: 'confere', tom: 'ok' as EnriqTom }
          : { resultado: 'difere', tom: 'difere' as EnriqTom }),
    },
    // C1 — Banco do Sistema via COALESCE (mesma conta da lista); não '—' quando a conta existe.
    refLinha('Banco', banco, row.excel_conta_origem, fmtTexto(banco), fmtTexto(row.excel_conta_origem)),
    // P0-3 — linha única "Produto / Descrição" (Produto ≡ descricao no oficial). Sistema = descrição do lançamento.
    { campo: 'Produto / Descrição', sistema: fmtTexto(descricao), excel: fmtTexto(row.excel_produto), ...resultadoEditavel(descricao, row.excel_produto, row.proposto_produto) },
    { campo: 'Fornecedor', sistema: fmtTexto(favSistema), excel: fmtTexto(favExcel), resultado: favRes, tom: favTom },
    { campo: 'Fazenda', sistema: fmtTexto(row.lanc_fazenda_nome), excel: fmtTexto(row.excel_fazenda_codigo), ...resultadoEditavel(row.lanc_fazenda_nome, row.excel_fazenda_codigo, row.proposto_fazenda_nome) },
    { campo: 'Subcentro', sistema: fmtTexto(subSistema), excel: fmtTexto(subExcel), resultado: subRes, tom: subTom },
    /* ⚠ TRÊS DATAS, TRÊS LINHAS — 133a. Havia uma só ("Data"), que comparava a
       competência da planilha com o PAGAMENTO do lançamento: dois campos diferentes na
       mesma linha, e era isso que fazia 113 linhas parecerem "sem par". Agora cada uma
       compara o seu par, e o operador vê qual delas de fato diverge. */
    refLinha('Data pagamento', row.lanc_data_pagamento, row.excel_data_pagamento,
      fmtData(row.lanc_data_pagamento), fmtData(row.excel_data_pagamento)),
    refLinha('Data vencimento', row.lanc_data_vencimento, row.excel_data_vencimento,
      fmtData(row.lanc_data_vencimento), fmtData(row.excel_data_vencimento)),
    refLinha('Competência', row.lanc_data_competencia, row.excel_data, fmtData(row.lanc_data_competencia), fmtData(row.excel_data)),
    /* ⚠ A SEGUNDA LINHA DE VENCIMENTO SAIU — 133b-a item 3. O 129c criou `Data venc.`
       (sistema × '—') quando a view ainda não trazia a data da planilha; o 133a criou
       `Data vencimento` (sistema × planilha), que a substitui e compara o par certo. As
       duas conviveram, saídas da MESMA coluna do banco, e qualquer tela que desenhasse o
       comparativo inteiro mostrava vencimento duas vezes.
       ⚠ `Safra` FICA: ela nasceu no mesmo bloco mas não tem irmã. */
    refLinha('Safra', row.lanc_safra_codigo, row.proposto_safra, fmtTexto(row.lanc_safra_codigo), fmtTexto(row.proposto_safra)),
    // P0-5 — Documento: Sistema = numero_documento do lançamento; Excel = excel_documento; Resultado = proposta.
    { campo: 'Documento', sistema: fmtTexto(row.lanc_numero_documento), excel: fmtTexto(row.excel_documento), ...resultadoEditavel(row.lanc_numero_documento, row.excel_documento, row.proposto_numero_documento) },
    // P0-3 — linha "Descrição" separada removida (unificada em "Produto / Descrição").
    // PR-ENR-01 — OBS read-only: observação do lançamento espelhada no Resultado. Não há fonte
    // Excel ('—') nem proposta/apply; Resultado preserva o valor do Sistema ('—' só quando vazio).
    { campo: 'OBS', sistema: fmtTexto(row.lanc_observacao), excel: '—', resultado: fmtTexto(row.lanc_observacao), tom: 'neutro' },
    /* ── 133b: as três linhas que faltavam para os quinze campos do mock ──────────
       ⚠ AS TRÊS SÃO LEITURA, e é isso que elas têm em comum: nenhuma é gravável pela
       Mesa. Estão na tabela porque o operador confere por elas — "saiu ou entrou?",
       "em que centro isto caiu?", "este lançamento ainda está vivo?" — e um campo que
       ele procura e não acha vira uma volta ao Financeiro. */
    { campo: 'Tipo', sistema: fmtTexto(rotuloTipo(entradaOuSaidaDe(row))), excel: fmtTexto(row.excel_tipo_operacao),
      resultado: fmtTexto(rotuloTipo(entradaOuSaidaDe(row))), tom: 'neutro' },
    { campo: 'Macro · Grupo · Centro',
      sistema: fmtTexto(juntarTrilha(row.lanc_macro_atual, row.lanc_grupo_atual, row.lanc_centro_atual)),
      excel: '—',
      resultado: fmtTexto(juntarTrilha(row.lanc_macro_atual, row.lanc_grupo_atual, row.lanc_centro_atual)),
      tom: 'neutro' },
    /* ⚠ SITUAÇÃO É DO LANÇAMENTO, não da linha da planilha: `lanc_status`. Sem lançamento
       vinculado não há situação, e o "—" diz exatamente isso. */
    { campo: 'Situação', sistema: fmtTexto(row.lanc_status), excel: '—',
      resultado: fmtTexto(row.lanc_status), tom: 'neutro' },
  ];

  // D3 — descritores LEGADO (PR-U2b), NÃO renderizados: o detalhe usa editores hardcoded
  // por campo. Mantido só como referência; flags alinhadas à realidade — produto passou a
  // ser aplicado (P0-3, → descricao); safra/categoria continuam carry-only e SEM editor na Mesa.
  const camposEditaveis: EnriqCampoEditavel[] = [
    { campo: 'subcentro',     label: 'Subcentro',  editor: 'plano',      valorAtual: row.proposto_subcentro,        suportadoPeloApply: true },
    { campo: 'favorecido_id', label: 'Favorecido', editor: 'fornecedor', valorAtual: row.proposto_favorecido_nome,  suportadoPeloApply: true },
    { campo: 'fazenda_id',    label: 'Fazenda',    editor: 'fazenda',    valorAtual: row.proposto_fazenda_nome,     suportadoPeloApply: true },
    { campo: 'produto',       label: 'Produto',    editor: 'texto',      valorAtual: row.proposto_produto,          suportadoPeloApply: true },
    { campo: 'safra',         label: 'Safra',      editor: 'texto',      valorAtual: row.proposto_safra,            suportadoPeloApply: false },
    { campo: 'categoria',     label: 'Categoria',  editor: 'texto',      valorAtual: row.proposto_categoria,        suportadoPeloApply: false },
  ];
  // PR-U2b — proveniência (projeção read-only de _meta; só rastreabilidade).
  const proveniencia: EnriqProveniencia = {
    tier: row.proposto_tier,
    origem: row.proposto_origem_resolucao,
    motorVersion: row.motor_version,
    comoFoiSugerido: comoFoiSugerido(row.proposto_origem_resolucao, row.excel_produto ?? row.excel_fornecedor),
  };

  /**
   * O PORQUÊ da linha, em uma frase — 133a item 5.
   *
   * ⚠ SAI DO `casamento_meta`, que é o que o casador do banco gravou: a regra que casou e
   * quantos candidatos havia. Deduzir isso no front seria reconstruir a decisão da RPC por
   * fora — e errar no dia em que ela mudasse.
   */
  const porQue = (() => {
    const meta = (row.casamento_meta ?? {}) as Record<string, unknown>;
    const regra = typeof meta.regra === 'string' ? meta.regra : null;
    /* ⚠ `match_status` COMO STRING, e não como `MatchStatus`: o tipo escrito à mão é menor
       que o CHECK do banco (ver a nota lá), e um `switch` tipado recusaria status
       legítimos como `sugestao_split`. O `default` cobre o desconhecido. */
    const st: string = row.match_status;
    const cand = Number(meta.candidatos ?? 0) || 0;
    switch (st) {
      case 'exato':
      case 'divergente':
        if (regra === 'pagamento_exato') return `casou pelo pagamento de ${fmtData(row.excel_data_pagamento)}`;
        if (regra === 'valor_no_mes') return 'valor único no mês';
        /* ⚠ PAREADO POR ORDEM PEDE CONFERÊNCIA — 133e item F. A migration
           20260907181314 passou a parear N linhas iguais com N lançamentos iguais na ordem
           em que aparecem; é a melhor resposta possível sem mais dado, e continua sendo um
           palpite. O texto diz quantos eram iguais e pede a conferência em vez de afirmar
           que casou. `iguais` vem do `casamento_meta` que a própria RPC gravou. */
        if (regra === 'pareado_por_ordem') {
          const iguais = Number(meta.iguais ?? 0) || 0;
          return iguais > 0
            ? `${iguais} iguais no mês — pareado por ordem, confira`
            : 'pareado por ordem, confira';
        }
        return 'casou com um lançamento do mês';
      case 'ambiguo':
      case 'candidatos_proximos':
        return cand > 0 ? `${cand} lançamentos iguais no dia — escolha` : 'mais de um lançamento igual — escolha';
      case 'sugestao_split': {
        const n = Array.isArray(meta.grupo_ids) ? meta.grupo_ids.length : 0;
        return n > 1
          ? `com mais ${n - 1} linha${n - 1 === 1 ? '' : 's'} do dia soma ${fmtBRL(row.excel_valor)} = 1 movimento do banco`
          : 'junta com outras linhas do dia num movimento do banco';
      }
      case 'sugestao_grupo':
        return 'soma de 2 lançamentos do dia';
      case 'sem_conta_para_match':
        return 'sem conta bancária na planilha';
      case 'sem_match':
        return `nenhum movimento de ${fmtBRL(row.excel_valor)} na ${fmtTexto(banco)}`;
      case 'ja_classificado':
        return `já tem ${fmtTexto(subSistema)}`;
      default:
        return '';
    }
  })();
  // PR-U2c-2A — valores crus da proposta para os editores inline.
  const entradaOuSaida = entradaOuSaidaDe(row);

  /**
   * A DATA QUE A LISTA MOSTRA, AGRUPA E ORDENA — 133e adendo item 5.
   *
   * ⚠ É A DE PAGAMENTO, e a ordem das tentativas é a da soberania: o que o BANCO diz que
   * aconteceu (`lanc_data_pagamento`) vem primeiro; sem lançamento casado, o que a planilha
   * diz que foi pago (`excel_data_pagamento`); e só em último caso a competência.
   * ⚠ ERA A COMPETÊNCIA PRIMEIRO (`excel_data ?? lanc_data_pagamento`), e isso é o inverso:
   * a competência do cliente vai de out/2025 a set/2026 para pagamentos de agosto, então a
   * lista de uma tela de CAIXA agrupava por um mês que não é o mês do dinheiro.
   * ⚠ QUANDO SOBRA A COMPETÊNCIA, A TELA DIZ. `dataEhCompetencia` existe para o "comp." de
   * 10px ao lado — uma data que não é de caixa numa tela de caixa precisa se identificar.
   */
  const dataDeCaixa = (() => {
    if (row.lanc_data_pagamento) return { iso: row.lanc_data_pagamento, ehCompetencia: false };
    if (row.excel_data_pagamento) return { iso: row.excel_data_pagamento, ehCompetencia: false };
    return { iso: row.excel_data ?? row.lanc_data_competencia ?? null, ehCompetencia: true };
  })();

  const edicao: EnriqEdicao = {
    subcentro: subcentroEfetivo,   // BUG — nunca a proposta órfã; proposta válida ou o Sistema soberano
    favorecidoId: row.proposto_favorecido_id,
    fazendaId: row.proposto_fazenda_id,
    produto: row.proposto_produto,
    tipoOperacao: row.lanc_tipo_operacao ?? row.excel_tipo_operacao,
    macro: row.proposto_macro,
    descricaoAtual: descricao,   // P0-3: lanc_descricao (editor "Produto / Descrição")
    numeroDocumento: row.proposto_numero_documento,        // P0-5
    numeroDocumentoAtual: row.lanc_numero_documento,       // P0-5
    fazendaIdAtual: row.lanc_fazenda_id,                   // BUG2: fallback do Select da Fazenda
    /* ── 129c: os seis que passaram a gravar ──────────────────────────────────── */
    safraId: row.proposto_safra_id,
    contaBancariaId: row.proposto_conta_bancaria_id,
    dataCompetencia: row.proposto_data_competencia,
    dataVencimento: row.proposto_data_vencimento,
    dataPagamento: row.proposto_data_pagamento,
    observacao: row.proposto_observacao,
    safraIdAtual: row.lanc_safra_id,
    subcentroAtual: row.lanc_subcentro_atual,
    favorecidoIdAtual: row.lanc_favorecido_id_atual,
    /* 133h item 7 — a conta EFETIVA, não a coluna crua: entrada lê o destino. */
    contaBancariaIdAtual: contaEfetivaId(
      row.lanc_tipo_operacao, row.lanc_conta_bancaria_id, row.lanc_conta_destino_id),
    dataCompetenciaAtual: row.lanc_data_competencia,
    dataVencimentoAtual: row.lanc_data_vencimento,
    dataPagamentoAtual: row.lanc_data_pagamento,
    observacaoAtual: row.lanc_observacao,
  };

  // PR-U2d-1 — estado operacional da linha (ordem: primeira condição que casar vence).
  const temMatch = row.lanc_id != null;
  /**
   * ⚠ A TRAVA AVALIA O RESULTADO, NUNCA A ORIGEM — 133e item E.
   *
   * Ela lia `will_create_subcentro_orfao`, que é sobre a PROPOSTA vinda da planilha: um
   * texto fora do plano oficial travava o Salvar mesmo quando o Resultado efetivo era o
   * subcentro que o sistema já tinha — e o operador só destravava reabrindo a linha e
   * redigitando a MESMA conta do plano que já estava lá (medido por Gabriel, 15:25).
   * ⚠ O QUE VAI SER GRAVADO É `subcentroEfetivo`: a proposta quando ela é válida no plano,
   * senão o subcentro soberano do sistema. Se ele existe, não há órfão a criar — a trigger
   * do lançamento não tem o que recusar, e a trava não tem o que travar.
   * ⚠ O TEXTO DA PLANILHA NÃO SOME: ele vira aviso (`avisoPlanilha`), porque saber que a
   * planilha dizia outra coisa é útil; travar por isso é que não era.
   */
  const subcentroOrfao = !subcentroEfetivo;
  /** O texto que a planilha trouxe e que NÃO existe no plano oficial. `null` quando não há. */
  const avisoPlanilha = row.will_create_subcentro_orfao && !vazio(subExcel) ? subExcel : null;
  /* ⚠ "NADA MUDA" NÃO É "REVISAR" — 133b-a correção 1, e a diferença é um dia de trabalho
     do operador. `will_change_anything` é a flag-mãe da view: falsa, o apply não escreveria
     campo nenhum. A linha caía em `revisar` só porque o `match_status` era `divergente`, e
     a tela pedia revisão de algo que já está igual ao sistema — obrigando a mexer no
     subcentro para "liberar" um Salvar que não teria o que gravar.
     ⚠ A ORDEM IMPORTA: a checagem vem DEPOIS do órfão (que bloqueia de verdade) e ANTES do
     `divergente`, que é justamente o status que produzia o falso "revisar". */
  const estado: EnriqEstado =
    row.aplicado ? 'aplicado'
    : !temMatch ? 'sem_vinculo'                         // sem_match / ambíguo não resolvido
    : subcentroOrfao ? 'revisar'                        // proposta fora do plano → bloqueia apply
    : !row.will_change_anything ? 'nada'                // nada a gravar: já confere com o sistema
    : row.match_status === 'divergente' ? 'revisar'     // lançamento já tem valor diferente
    : row.match_status === 'ja_classificado' ? 'nada'   // já == proposta
    : 'pronto';                                         // exato / ambiguo_resolvido

  return {
    id: row.staging_id,
    linha: row.excel_linha_origem,
    status: row.match_status as EnriqStatus,
    statusLabel,
    estado,
    aplicado: row.aplicado,
    temMatch,
    subcentroOrfao,
    avisoPlanilha,
    mudaAlgo: row.will_change_anything,
    data: fmtData(dataDeCaixa.iso),
    dataIso: dataDeCaixa.iso,
    dataEhCompetencia: dataDeCaixa.ehCompetencia,
    valor: fmtBRL(row.excel_valor ?? row.lanc_valor),
    /* ⚠ O NÚMERO AO LADO DO TEXTO — MESA-ENR-UX-01. O total por grupo é uma SOMA, e somar
       "1.510,00" de volta a partir da string exigiria desformatar o que este adapter
       acabou de formatar: duas conversões e um ponto onde o locale pode trair. A mesma
       fonte da string, crua. `null` quando não há valor de nenhum dos dois lados. */
    valorNum: row.excel_valor ?? row.lanc_valor ?? null,
    entradaOuSaida,
    /* 133h item 6 — a identidade da conta, para o filtro da Mesa deixar de comparar nome. */
    contaId: contaDaLinhaStaging(row).id,
    revisadaEm: row.revisado_em,
    lancId: row.lanc_id,
    contaBancaria: banco,
    /* ⚠ A IDENTIDADE DA LINHA É A DESCRIÇÃO DA PLANILHA — 133b. A lista do passo 2 mostra
       o que o operador escreveu no Excel, não o que o banco importou: é por aquele texto
       que ele reconhece a linha que está procurando. Sem descrição na planilha, cai no
       fornecedor, e só então no "—". */
    descricaoExcel: fmtTexto(row.excel_produto ?? row.excel_fornecedor),
    porQue,
    banco: fmtTexto(banco),
    fornecedor: fmtTexto(favSistema ?? favExcel),
    comparativo,
    camposEditaveis,
    proveniencia,
    edicao,
  };
}

/**
 * Sessões → VMs com rótulo identificável: "Mai/2026 · Imp NN · dd/MM HH:mm · N linhas".
 * O índice NN é cronológico por mês (desempata importações quase idênticas).
 * Retorna ordenado por criada_em desc (mais recente primeiro) para o seletor.
 */
export function toSessoesVM(sessoes: SessaoClassificacaoResumo[] | undefined | null): EnriqSessaoVM[] {
  const arr = sessoes ?? [];
  const asc = [...arr].sort((a, b) => a.criada_em.localeCompare(b.criada_em));
  const idxPorMes = new Map<string, number>();
  const vmById = new Map<string, EnriqSessaoVM>();
  for (const s of asc) {
    const mes = s.excel_ano_mes ?? '—';
    const n = (idxPorMes.get(mes) ?? 0) + 1;
    idxPorMes.set(mes, n);
    const carimbo = dataHoraCurta(s.criada_em);
    const partes = [
      mesAbrev(s.excel_ano_mes),
      `Imp ${String(n).padStart(2, '0')}`,
      carimbo,
      `${s.total} linhas`,
    ].filter(Boolean);
    vmById.set(s.sessao_id, {
      id: s.sessao_id,
      label: partes.join(' · '),
      exatos: s.exatos,
      ambiguos: s.ambiguos,
      aplicados: s.aplicados,
      anoMes: s.excel_ano_mes,
      criadaEm: s.criada_em,
      total: s.total,
    });
  }
  return [...asc].reverse().map((s) => vmById.get(s.sessao_id)!).filter(Boolean);
}

// ── Selectors (extração da lógica inline do MesaClassificacaoTab) ────────────

// Contas presentes na sessão (para o filtro visual). '__sem__' = sem conta canônica.
/**
 * A conta pela qual uma linha do staging é filtrada — 133h item 6/7.
 *
 * ⚠ A VIEW JÁ FOI CONSERTADA (migration 20260908114919), E MESMO ASSIM A REGRA MORA AQUI.
 * `conta_filtro_id` era `COALESCE(l.conta_bancaria_id, s.conta_origem_id, s.conta_destino_id)`
 * e nunca olhava `l.conta_destino_id`, que é onde mora a conta de uma ENTRADA: 164 das 481
 * entradas do Raul caíam em "Sem conta" com a conta gravada no lançamento. A migration
 * acrescentou `l.conta_destino_id` ao COALESCE e as 164 viraram ZERO — medido.
 * ⚠ MAS COALESCE NÃO É O `CASE` DO CONCILIAR. Numa entrada com as DUAS pontas preenchidas
 * (55 no Raul), o COALESCE devolve `conta_bancaria_id` e a régua do Conciliar devolve o
 * destino. Hoje isso não separa ninguém — nas 55, as duas colunas apontam para a mesma
 * conta (medido: zero divergências) —, mas nada no banco garante que continuem iguais. O
 * front fica com o `CASE`, que é a régua soberana, e usa `conta_filtro_id` só como segundo
 * recurso: ele é quem responde pela linha SEM lançamento, onde a conta é a do de-para.
 */
export function contaDaLinhaStaging(r: ClassificacaoStagingPreviewRow): { id: string; nome: string } {
  const idEfetivo = contaEfetivaId(r.lanc_tipo_operacao, r.lanc_conta_bancaria_id, r.lanc_conta_destino_id);
  const nomeEfetivo = contaEfetivaNome(r.lanc_tipo_operacao, r.lanc_conta_bancaria_nome, r.lanc_conta_destino_nome);
  const id = idEfetivo ?? r.conta_filtro_id ?? '__sem__';
  const nome = (idEfetivo ? nomeEfetivo : r.conta_filtro_nome) ?? r.conta_filtro_nome ?? 'Sem conta';
  return { id, nome };
}

export function listarContas(staging: ClassificacaoStagingPreviewRow[]): EnriqContaVM[] {
  const m = new Map<string, EnriqContaVM>();
  for (const r of staging) {
    const { id, nome } = contaDaLinhaStaging(r);
    const cur = m.get(id) ?? { id, nome, total: 0 };
    cur.total++;
    m.set(id, cur);
  }
  return [...m.values()].sort((a, b) =>
    a.id === '__sem__' ? 1 : b.id === '__sem__' ? -1 : b.total - a.total,
  );
}

// Filtra o staging por conta ('todas' = sem filtro). Só visualização.
export function filtrarPorConta(
  staging: ClassificacaoStagingPreviewRow[],
  contaId: string,
): ClassificacaoStagingPreviewRow[] {
  return contaId === 'todas'
    ? staging
    : staging.filter((r) => contaDaLinhaStaging(r).id === contaId);
}

export function contarContagens(staging: ClassificacaoStagingPreviewRow[]): EnriqContagensVM {
  // PR-P0-2 — conta os status (somam ao total); aplicados é flag à parte.
  // PR-MESA-RESOLUCAO-01 — +candidatos_proximos/+resolvido_manual (o `if (k in status)`
  // abaixo ignora status sem chave; sem estes dois o chip ficaria sempre zerado).
  const status: Record<EnriqStatus, number> = {
    exato: 0, ambiguo: 0, sem_match: 0, divergente: 0, ja_classificado: 0, ambiguo_resolvido: 0,
    candidatos_proximos: 0, resolvido_manual: 0, resolvido_grupo: 0,   // PR-MESA-GRUPO-01
    /* ⚠ 133a — os quatro do casador novo. Sem a chave, o `if (k in status)` abaixo ignora
       o status e o chip fica sempre zerado: foi o que aconteceria com "Agrupam". */
    sugestao_grupo: 0, sugestao_split: 0, sem_conta_para_match: 0, ja_aplicado: 0,
  };
  let aplicados = 0;
  for (const r of staging) {
    const k = r.match_status as EnriqStatus;
    if (k in status) status[k]++;
    if (r.aplicado) aplicados++;
  }
  return { total: staging.length, status, aplicados };
}

/**
 * Os SEIS grupos do topo do passo 2 — [ENRIQUECER-TELA-01] (133b).
 *
 * ⚠ GRUPO NÃO É STATUS. O banco tem treze `match_status`; o operador tem seis perguntas.
 * O mapa abaixo é a única tradução, e é ele que faz o chip, o número do topo e o filtro
 * concordarem — três lugares lendo três listas divergiriam na primeira regra nova.
 * ⚠ `ja_classificado` MORA EM "Já gravadas" porque o gesto acabou: o lançamento já tem
 * classificação e a linha não pede nada. Ele mantém o rótulo próprio na pílula da linha
 * (STATUS_META), que é onde a distinção ainda informa.
 * ⚠ "Transferência entre contas" NASCE VAZIO e assim fica até a 133c: nenhum status atual
 * significa transferência, e inventar um agora produziria um número que não se explica.
 */
export type EnriqGrupo = 'atualizam' | 'decide' | 'agrupam' | 'transferencia' | 'sem_par' | 'ja_gravadas';

export const GRUPO_DE_STATUS: Readonly<Record<string, EnriqGrupo>> = {
  exato: 'atualizam',
  divergente: 'atualizam',
  ambiguo: 'decide',
  candidatos_proximos: 'decide',
  sugestao_grupo: 'agrupam',
  sugestao_split: 'agrupam',
  sem_match: 'sem_par',
  sem_conta_para_match: 'sem_par',
  ja_classificado: 'ja_gravadas',
  ja_aplicado: 'ja_gravadas',
  ambiguo_resolvido: 'ja_gravadas',
  resolvido_manual: 'ja_gravadas',
  resolvido_grupo: 'ja_gravadas',
};

/**
 * O GRUPO DE UMA LINHA — e `aplicado` manda em tudo (133c-a).
 *
 * ⚠ MEDIDO NO PROTO, e o número assusta: 933 linhas `exato` JÁ APLICADAS, 150 `divergente`,
 * 546 `sem_match` e 9 `sugestao_split`. Nenhuma RPC de gravação mexe em `match_status` —
 * `apply_row` e `split_substituir` só ligam `aplicado = true`. Sem esta função, o topo
 * continuaria contando as 933 em "Atualizam sem perguntar" DEPOIS de o operador gravá-las,
 * e "Já gravadas" nunca subiria. O passo 3 do 133c tornaria isso gritante: gravar 337
 * linhas e ver o mesmo número no topo.
 * ⚠ E É O QUE MAPEIA O SPLIT. `fn_classificacao_split_substituir` deixa a linha em
 * `sugestao_split` com `aplicado = true` (conferido no corpo da função, não suposto): o
 * gesto acabou, e o vocabulário tem de dizer "Já gravadas".
 */
export function grupoDaLinha(status: string, aplicado: boolean): EnriqGrupo | undefined {
  if (aplicado) return 'ja_gravadas';
  return GRUPO_DE_STATUS[status];
}

export interface EnriqGrupoResumo {
  qtd: number;
  /** `sum(abs(excel_valor))` das linhas do grupo. */
  soma: number;
  /** Linhas do banco envolvidas — só faz sentido em "agrupam" (`match_lancamento_ids`). */
  lancamentos: number;
}

export type EnriqResumoGrupos = Record<EnriqGrupo, EnriqGrupoResumo>;

/**
 * ⚠ A SOMA SAI DAS LINHAS JÁ CARREGADAS, não de uma consulta nova: a sessão inteira já é
 * lida para os chips, e um segundo SELECT para somar o que está na memória seria uma ida
 * ao banco para responder o que a tela já sabe — e uma segunda verdade quando as duas
 * chegassem em ordens diferentes.
 */
export function resumirGrupos(staging: ClassificacaoStagingPreviewRow[]): EnriqResumoGrupos {
  const zero = (): EnriqGrupoResumo => ({ qtd: 0, soma: 0, lancamentos: 0 });
  const r: EnriqResumoGrupos = {
    atualizam: zero(), decide: zero(), agrupam: zero(),
    transferencia: zero(), sem_par: zero(), ja_gravadas: zero(),
  };
  for (const linha of staging) {
    const g = grupoDaLinha(linha.match_status, linha.aplicado);
    /* Status desconhecido não entra em grupo nenhum — some do topo, não vira número
       errado num grupo qualquer. A lista continua mostrando a linha. */
    if (!g) continue;
    r[g].qtd += 1;
    r[g].soma += Math.abs(Number(linha.excel_valor) || 0);
    r[g].lancamentos += Array.isArray(linha.match_lancamento_ids) ? linha.match_lancamento_ids.length : 0;
  }
  return r;
}

/**
 * As linhas de um grupo — o filtro dos chips do passo 2.
 *
 * ⚠ ACEITA `string`, e não só `EnriqGrupo`: desde a 133c dois chips não contam linhas da
 * planilha (transferência e "sem par no sistema" olham lançamentos do banco). Para eles a
 * lista da esquerda é OUTRA, e o que esta função devolve — vazio — é a verdade: nenhuma
 * linha da planilha pertence àquele recorte.
 */
export function filtrarPorGrupo(rows: EnriqRowVM[], grupo: string): EnriqRowVM[] {
  return grupo === 'todas' ? rows : rows.filter((l) => grupoDaLinha(l.status, l.aplicado) === grupo);
}

// P0-1A: conceito "aplicável em lote" vem PRONTO da view (lote_aplicavel) —
// nenhuma regra da apply_row replicada aqui.
export function contarAplicaveisExatos(staging: ClassificacaoStagingPreviewRow[]): number {
  return staging.filter((r) => r.lote_aplicavel).length;
}

export function filtrarPorStatus(rows: EnriqRowVM[], filtro: EnriqStatus | 'todos'): EnriqRowVM[] {
  return filtro === 'todos' ? rows : rows.filter((r) => r.status === filtro);
}

// PR-U2d-1 — burn-down. 'pendentes' (default) mostra só o que precisa de ação
// (pronto/revisar/sem_vinculo); 'todas' mostra tudo (aplicado/nada esmaecidos na lista).
// `graceIds` (janela de graça): ids recém-aplicados seguram na lista ~1,4s para o
// operador ver o estado resolvido antes do burn-down (só timing de visibilidade —
// o conteúdo da linha segue 100% derivado do VM).
export function filtrarPorModo(rows: EnriqRowVM[], modo: 'pendentes' | 'todas', graceIds?: Set<string>): EnriqRowVM[] {
  if (modo === 'todas') return rows;
  return rows.filter((r) =>
    r.estado === 'pronto' || r.estado === 'revisar' || r.estado === 'sem_vinculo' || (graceIds?.has(r.id) ?? false),
  );
}

export function escolherMelhorSessaoId(sessoes: SessaoClassificacaoResumo[] | undefined | null): string | null {
  if (!sessoes || sessoes.length === 0) return null;
  /* ⚠ RECÊNCIA, NUNCA VOLUME — B-40 item 5, e a troca foi medida.
     A regra anterior ordenava por `exatos + ambiguos`, isto é, por quantidade de
     trabalho pendente, e só desempatava por data. No NJ isso abria a sessão de
     Mai/2026 (340 pendentes, de 17/06) em vez da de Jul/2026 (82, de 18/08): a
     tela do dia começava num arquivo de três meses atrás, e o operador nem sabia
     por quê. São 166 sessões acumuladas — a chance de a mais volumosa ser a
     atual só diminui com o tempo.
     ⚠ E O TRABALHO PENDENTE NÃO SUMIU: as antigas seguem no seletor, acessíveis.
     O que mudou é que nenhuma delas se impõe sozinha na abertura. */
  const ordenadas = [...sessoes].sort((a, b) => b.criada_em.localeCompare(a.criada_em));
  return ordenadas[0]?.sessao_id ?? null;
}

/**
 * As sessões do MÊS DA RÉGUA, mais recente primeiro — 133h item 2.
 *
 * ⚠ O SELETOR MOSTRAVA A HISTÓRIA INTEIRA. São 166 sessões acumuladas no NJ, e o operador
 * que está conciliando agosto via as de maio, junho e julho na mesma lista — com rótulos
 * quase iguais, porque o que muda entre elas é o carimbo. Peneirar pelo mês não esconde
 * trabalho: sessão de outro mês é trabalho de outro mês.
 *
 * ⚠ `null` NA RÉGUA DEVOLVE TUDO, e é a saída honesta: sem mês não há como peneirar, e uma
 * lista vazia diria "não há importação" onde o certo é "não sei qual mês você quer".
 */
export function sessoesDoMes(
  sessoes: readonly EnriqSessaoVM[],
  anoMesRegua: string | null | undefined,
): EnriqSessaoVM[] {
  const base = anoMesRegua
    ? sessoes.filter((s) => s.anoMes === anoMesRegua)
    : [...sessoes];
  return base.sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

/**
 * Um lançamento órfão tem candidato a duplicata? — 133h item 5.
 *
 * ⚠ MESMO VALOR, MESMA CONTA, ±5 DIAS, e nada além disso. "Cancelar como duplicado" apaga
 * dinheiro do mês; oferecê-lo em toda linha convida a usá-lo como faxina, e a primeira
 * planilha incompleta levaria o mês junto. O botão só existe quando a tela consegue APONTAR
 * o par — se não há par, não há o que duplicar, e sobra "Abrir no Financeiro".
 *
 * ⚠ A COMPARAÇÃO É SOBRE A LISTA JÁ CARREGADA, sem ida ao banco: o universo é o dos órfãos
 * do mês, que é justamente onde uma importação repetida deixa os dois lados do par.
 *
 * ⚠ CENTAVOS EM INTEIRO. Comparar `number` de ponto flutuante faria 165.88 !== 165.88 em
 * casos que já mordem este repo.
 */
export function temCandidatoDuplicata(
  alvo: { lanc_id: string; valor: number | null; data_pagamento: string | null; conta_nome: string | null },
  lista: readonly { lanc_id: string; valor: number | null; data_pagamento: string | null; conta_nome: string | null }[],
  diasTolerancia = 5,
): boolean {
  if (alvo.valor === null || !alvo.data_pagamento) return false;
  const centavos = Math.round(alvo.valor * 100);
  const dia = Date.parse(`${alvo.data_pagamento}T00:00:00Z`);
  if (Number.isNaN(dia)) return false;
  const janela = diasTolerancia * 86_400_000;
  return lista.some((o) => {
    if (o.lanc_id === alvo.lanc_id) return false;
    if (o.valor === null || !o.data_pagamento) return false;
    if (Math.round(o.valor * 100) !== centavos) return false;
    if ((o.conta_nome ?? null) !== (alvo.conta_nome ?? null)) return false;
    const d = Date.parse(`${o.data_pagamento}T00:00:00Z`);
    return !Number.isNaN(d) && Math.abs(d - dia) <= janela;
  });
}

/**
 * A conta do lançamento, pela régua do Conciliar — 133h item 7.
 *
 * ⚠ ENTRADA MORA EM `conta_destino_id`, E ESTE É O DEFEITO QUE O ENVELOPE DESCREVE. Medido
 * no Proto (cliente Raul, 18.256 linhas de staging com lançamento):
 *     2-Saídas          17.732 linhas — 17.732 com conta_bancaria_id, 0 com destino
 *     1-Entradas           481 linhas —     55 com conta_bancaria_id, 481 com destino
 *                                          426 delas SÓ com destino
 *     3-Transferências      43 linhas — as duas pontas preenchidas
 * Ler só `conta_bancaria_id` devolvia `null` em 426 entradas: o Resultado mostrava "—" com
 * a conta certa gravada dos dois lados, e "difere" quando a planilha trazia a conta.
 *
 * ⚠ É A MESMA REGRA DO CONCILIAR — `CASE tipo_operacao WHEN '1-Entradas' THEN
 * conta_destino_id ELSE conta_bancaria_id`. Uma segunda régua aqui faria a Mesa e a
 * conciliação discordarem sobre em que conta o dinheiro entrou.
 *
 * ⚠ TRANSFERÊNCIA TEM DUAS, e nenhuma das duas é "a" conta: quem precisa das duas usa
 * `contasDoLancamento`. Aqui ela responde pela ORIGEM, que é de onde o dinheiro saiu — o
 * mesmo lado que o `ELSE` do Conciliar escolhe.
 */
export function contaEfetivaId(
  tipoOperacao: string | null | undefined,
  contaBancariaId: string | null | undefined,
  contaDestinoId: string | null | undefined,
): string | null {
  return (tipoOperacao === '1-Entradas' ? contaDestinoId : contaBancariaId) ?? null;
}

/** O par (origem, destino) de uma transferência; para os demais tipos, só a efetiva. */
export function contasDoLancamento(
  tipoOperacao: string | null | undefined,
  contaBancariaId: string | null | undefined,
  contaDestinoId: string | null | undefined,
): string[] {
  const ids = tipoOperacao === '3-Transferências'
    ? [contaBancariaId, contaDestinoId]
    : [contaEfetivaId(tipoOperacao, contaBancariaId, contaDestinoId)];
  return ids.filter((x): x is string => !!x);
}

/**
 * O NOME da conta efetiva, com o mesmo CASE — 133h item 7.
 *
 * ⚠ SÓ NOMES DO LANÇAMENTO, sem cair no texto da planilha. O fallback antigo terminava em
 * `excel_conta_origem`, e era ele que fazia o campo do sistema exibir o que o operador
 * escreveu no Excel como se fosse o que o banco tem — a tela concordando consigo mesma por
 * construção. Sem conta no lançamento, `null`: traço é ausência, e é a verdade.
 */
export function contaEfetivaNome(
  tipoOperacao: string | null | undefined,
  contaBancariaNome: string | null | undefined,
  contaDestinoNome: string | null | undefined,
): string | null {
  return (tipoOperacao === '1-Entradas' ? contaDestinoNome : contaBancariaNome) ?? null;
}

/**
 * O que o Resultado muda no lançamento — 133h item 10.
 *
 * ⚠ `will_change_anything` DA VIEW NÃO RESPONDE ESTA PERGUNTA, e é medição no SQL dela:
 * ela é `(lanc.subcentro IS NULL E há proposto) OU (lanc.favorecido_id IS NULL E há
 * proposto)` — DOIS campos, e só quando o lançamento está VAZIO neles. Safra, conta, as
 * três datas, documento e observação não entram. Era por isso que uma linha com safra
 * 25/26 -> 26/27 mostrava "Confirmar e Próximo": a tela dizia que não havia nada a gravar,
 * o operador confirmava, e a safra nova ficava no staging para sempre.
 *
 * ⚠ COMPARA O EFETIVO, NÃO A PROPOSTA CRUA. `edicao.subcentro` já é o Resultado (proposta
 * válida no plano, ou o subcentro do sistema quando a proposta é órfã) — é o que a tela
 * mostra, e o que o item 13 manda gravar.
 *
 * ⚠ CAMPO VAZIO NA PROPOSTA NÃO É DIFERENÇA. O gravador é COALESCE: proposta nula deixa o
 * lançamento como está. Contá-la como divergência acenderia "Salvar" em toda linha.
 *
 * Devolve os RÓTULOS, em português de operador — a tela lista, o `soConfirma` só conta.
 */
export function diferencasDoResultado(edicao: EnriqEdicao): string[] {
  const difs: string[] = [];
  const cmp = (rotulo: string, proposto: string | null, atual: string | null) => {
    if (proposto === null || proposto === '') return;
    if (proposto !== atual) difs.push(rotulo);
  };
  cmp('conta do plano', edicao.subcentro, edicao.subcentroAtual);
  cmp('fornecedor', edicao.favorecidoId, edicao.favorecidoIdAtual);
  cmp('fazenda', edicao.fazendaId, edicao.fazendaIdAtual);
  cmp('produto / descrição', edicao.produto, edicao.descricaoAtual);
  cmp('documento', edicao.numeroDocumento, edicao.numeroDocumentoAtual);
  cmp('safra', edicao.safraId, edicao.safraIdAtual);
  cmp('conta bancária', edicao.contaBancariaId, edicao.contaBancariaIdAtual);
  cmp('data de competência', edicao.dataCompetencia, edicao.dataCompetenciaAtual);
  cmp('data de vencimento', edicao.dataVencimento, edicao.dataVencimentoAtual);
  cmp('data de pagamento', edicao.dataPagamento, edicao.dataPagamentoAtual);
  cmp('observação', edicao.observacao, edicao.observacaoAtual);
  return difs;
}
