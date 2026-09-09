// ============================================================================
// Mesa Global de Enriquecimento — view-models da UI.
// A UI é BURRA: só apresenta strings/flags já prontos. Nenhuma regra de negócio,
// nenhum SELECT, nenhum formato aqui — tudo vem do adapter puro enriquecimentoView.
// ============================================================================
// PR-MESA-RESOLUCAO-01 — +'candidatos_proximos' (janela ±10d, PR-MESA-DATA-01) e
// +'resolvido_manual' (escolha humana gravada por fn_classificacao_resolver_proximos).
/* ⚠ `sugestao_grupo` e `sugestao_split` ENTRARAM EM 133a, com o casador do banco:
   1 linha da planilha = N lançamentos, e N linhas = 1 movimento do banco. Os
   identificadores são os do `match_status`; o que muda na tela é o rótulo ("Agrupam"). */
export type EnriqStatus = 'exato' | 'ambiguo' | 'sem_match' | 'ja_classificado' | 'divergente' | 'ambiguo_resolvido' | 'candidatos_proximos' | 'resolvido_manual' | 'resolvido_grupo' | 'sugestao_grupo' | 'sugestao_split' | 'sem_conta_para_match' | 'ja_aplicado';

// PR-U2d-1 — estado OPERACIONAL da linha (ciclo Editar → Aplicar → Resolvida).
// Derivado do VM (aplicado/temMatch/órfão/match_status); é a leitura principal.
export type EnriqEstado = 'pronto' | 'revisar' | 'aplicado' | 'sem_vinculo' | 'nada';

export interface EnriqSessaoVM {
  id: string;
  label: string;          // ex.: "Mai/2026 · Imp 02 · 01/07 09:15 · 191 linhas"
  exatos: number;
  ambiguos: number;
  aplicados: number;
  /**
   * 133h item 2 — o mês da planilha e o carimbo, crus.
   *
   * ⚠ O `label` NÃO SERVE PARA FILTRAR. Ele é texto de apresentação ("Mai/2026 · Imp 02 ·
   * …"), e peneirar o seletor pelo mês da régua lendo o rótulo seria voltar a comparar o
   * que a tela escreveu em vez do que o banco guardou — o mesmo erro do `initialMes` que
   * comparava `8` com `'08'`. `anoMes` é o `excel_ano_mes` da sessão, em 'YYYY-MM'.
   */
  anoMes: string | null;
  /** ISO de `max(created_at)` — a ordem do seletor é por ele, mais recente primeiro. */
  criadaEm: string;
  /** Total de linhas da sessão — o número que a confirmação de exclusão mostra. */
  total: number;
}

// PR-P0-2 — contadores cobrem TODOS os status e somam ao Total; `aplicados` é
// dimensão/flag ortogonal (sobrepõe qualquer status) e NÃO entra na soma.
export interface EnriqContagensVM {
  total: number;                        // = soma dos 6 status
  status: Record<EnriqStatus, number>;  // exato/ambiguo/sem_match/divergente/ja_classificado/ambiguo_resolvido
  aplicados: number;                    // flag informativa (fora da soma)
}

// Conta bancária para o filtro visual (Todas/BB/Bradesco/…). id '__sem__' = sem conta.
export interface EnriqContaVM {
  id: string;
  nome: string;
  total: number;
}

// Tom para colorir o "Resultado" (e o subcentro na lista).
export type EnriqTom = 'neutro' | 'ok' | 'muda' | 'bloqueio' | 'difere';

// Uma linha do comparativo Sistema atual | Excel | Resultado (strings já formatadas).
export interface EnriqComparativoLinha {
  campo: string;
  sistema: string;   // '—' quando vazio/indisponível
  excel: string;
  resultado: string;
  tom: EnriqTom;
}

// PR-U2b — descritor de campo editável da proposta (a UI de U2c consome; aqui só
// prepara). editor = qual componente OFICIAL dos Lançamentos reutilizar.
export type EnriqCampoId = 'subcentro' | 'favorecido_id' | 'fazenda_id' | 'produto' | 'safra' | 'categoria';
export interface EnriqCampoEditavel {
  campo: EnriqCampoId;
  label: string;
  editor: 'plano' | 'fornecedor' | 'fazenda' | 'texto';
  valorAtual: string | null;       // valor proposto atual (display)
  suportadoPeloApply: boolean;     // subcentro/favorecido/fazenda=true; produto/safra/categoria=false (carry-only)
}

// PR-U2b — proveniência da resolução (projeção read-only de _meta). Só rastreabilidade.
export interface EnriqProveniencia {
  tier: string | null;
  origem: string | null;           // origem_resolucao (tier | 'manual' | 'orfao')
  motorVersion: number | null;
  /**
   * A mesma proveniência em português de cliente — MESA-ENR-UX-02 (129d).
   *
   * ⚠ "alias · motor v1" É JARGÃO NOSSO. O operador não sabe o que é tier, alias ou
   * motor; ele sabe que ensinou um apelido, ou que não ensinou nada. A frase é montada no
   * adapter, junto do resto — a UI é burra e não traduz vocabulário de banco.
   */
  comoFoiSugerido: string;
}

// PR-U2c-2A — valores crus da proposta que os editores inline (U2c-2B..2E) consomem.
export interface EnriqEdicao {
  subcentro: string | null;
  favorecidoId: string | null;
  fazendaId: string | null;
  produto: string | null;
  tipoOperacao: string | null;     // filtro do PlanoSubcentroSelect
  macro: string | null;            // FazendaSelect: força Administrativo se 'Dividendos'
  descricaoAtual: string | null;   // P0-3: lanc_descricao (editor "Produto / Descrição")
  numeroDocumento: string | null;      // P0-5: proposto_numero_documento
  numeroDocumentoAtual: string | null; // P0-5: lanc_numero_documento (fallback)
  fazendaIdAtual: string | null;       // BUG2: lanc_fazenda_id (valor efetivo p/ o Select não parecer vazio)
  /* ── 129c: os seis que passaram a gravar ────────────────────────────────────
     ⚠ `safraId` É O QUE GRAVA; o campo `safra` acima é o TEXTO do Excel e continua
     carry-only. Guardar os dois não é redundância: um é o que o operador escolheu, o
     outro é o que a planilha trouxe, e eles podem discordar. */
  safraId: string | null;
  contaBancariaId: string | null;
  dataCompetencia: string | null;
  dataVencimento: string | null;
  dataPagamento: string | null;
  observacao: string | null;
  /* Os valores EFETIVOS do lançamento, para o editor não abrir vazio sobre um campo que
     já tem valor — mesmo motivo do `fazendaIdAtual`. */
  safraIdAtual: string | null;
  /* 133h item 10 — os dois que faltavam para saber se o Resultado difere do sistema. */
  subcentroAtual: string | null;
  favorecidoIdAtual: string | null;
  contaBancariaIdAtual: string | null;
  dataCompetenciaAtual: string | null;
  dataVencimentoAtual: string | null;
  dataPagamentoAtual: string | null;
  observacaoAtual: string | null;
  /* ── PR-MESA-TRANSF-01: o tipo e o destino, propostos e efetivos ──────────────
     ⚠ `tipoOperacao` ACIMA CONTINUA SENDO O TIPO DO RESULTADO (é ele que filtra a
     subárvore do plano); estes dois separam as duas metades da pergunta, que é o que
     `diferencasDoResultado` precisa para dizer se há algo a gravar. */
  tipoOperacaoProposto: string | null;
  tipoOperacaoAtual: string | null;
  /** O que a PLANILHA diz — a proposta que o operador confirma no dropdown. */
  tipoOperacaoExcel: string | null;
  contaDestinoId: string | null;
  contaDestinoIdAtual: string | null;
  /**
   * A conta que o texto de destino da planilha resolve — PR-MESA-TRANSF-01 item 4.
   *
   * ⚠ É AQUI QUE O APELIDO ENSINADO VOLTA: o texto "Cartão ELO" da coluna de destino passa
   * pelo resolvedor soberano (`resolverContaPorTexto`), que conhece os apelidos do cadastro.
   * Ela NÃO é o Resultado — vira proposta no gesto de escolher "Transferência", que é o
   * único momento em que a tela pode gravar sem o operador ter pedido.
   */
  contaDestinoSugeridaId: string | null;
}

export interface EnriqRowVM {
  id: string;
  linha: number | null;      // excel_linha_origem (contexto)
  status: EnriqStatus;
  statusLabel: string;
  estado: EnriqEstado;       // PR-U2d-1 — estado operacional (leitura principal)
  aplicado: boolean;
  temMatch: boolean;        // lanc_id != null → pode Salvar (sem_match/ambíguo não resolvido = false)
  /** O id do lançamento casado — 133h item 12, para saber se ele veio do extrato. */
  lancId: string | null;
  /**
   * O que a planilha diz e o extrato desmente — 133h-b item 4, já peneirado.
   *
   * ⚠ VAZIO É O CASO NORMAL. A versão anterior comparava TEXTO com TEXTO e acendia âmbar em
   * quase toda linha: "2-Saídas" ≠ "Saída", o nome longo da conta ≠ o nome do cadastro, e o
   * valor de uma parte ≠ o do lançamento agrupado. Um aviso que aparece sempre não é aviso.
   */
  divergenciasBanco: ReadonlyArray<{ campo: string; rotulo: string; banco: string; planilha: string }>;
  /** A linha é uma PARTE de um lançamento maior — 133h-b item 4c. */
  parteDeAgrupamento: boolean;
  /** O lançamento está classificado, mas sem produto ou sem fornecedor — 133i item 7. */
  lancamentoIncompleto: boolean;
  /**
   * O RESULTADO não tem conta do plano — 133e item E. É a única trava de subcentro que
   * resta, e ela é sobre o que vai ser gravado, não sobre o que a planilha trouxe.
   */
  subcentroOrfao: boolean;
  /**
   * O texto que a planilha trouxe e que não existe no plano oficial. `null` quando não há.
   *
   * ⚠ AVISO, NÃO TRAVA — 133e item E. Ele travava o Salvar, e o operador destravava
   * redigitando a MESMA conta do plano que o Resultado já mostrava.
   */
  avisoPlanilha: string | null;
  mudaAlgo: boolean;
  // LISTA (esquerda) — só o necessário para localizar o lançamento (lado SISTEMA).
  /** A data de CAIXA, já formatada — pagamento do lançamento, ou da planilha, ou competência. */
  data: string;
  /** A mesma data em ISO, para ordenar sem desformatar. `null` quando não há nenhuma. */
  dataIso: string | null;
  /** `true` quando sobrou a competência: a tela marca "comp." ao lado (133e adendo item 5). */
  dataEhCompetencia: boolean;
  valor: string;
  /** O mesmo valor da string acima, cru — para somar por grupo sem desformatar. */
  valorNum: number | null;
  /**
   * Entrada ou saída — 129d item 4.
   *
   * ⚠ O SINAL PRECISA SER VISÍVEL EM TODA LINHA. Uma lista onde saída e entrada têm a
   * mesma cara faz o operador conferir R$ 164,38 sem saber se saiu ou entrou — e o
   * extrato dele tem os dois. Sai de `lanc_sinal`/`lanc_tipo_operacao`; `null` quando o
   * lançamento não existe (linha sem vínculo), e aí a tela não afirma nenhum dos dois.
   */
  entradaOuSaida: 'entrada' | 'saida' | null;
  /** A conta bancária do lançamento — contexto da lista (129d item 8). */
  contaBancaria: string | null;
  /**
   * O ID da conta efetiva da linha — 133h item 6.
   *
   * ⚠ FILTRAR POR NOME ERA O DEFEITO. A Mesa ampliada peneirava por `contaBancaria`, e nome
   * não é identidade: duas contas podem exibir o mesmo texto, uma renomeada muda o filtro
   * debaixo do operador, e a lista não tinha como agrupar por tipo (o tipo mora no
   * cadastro, e o cadastro se acha pelo id). `'__sem__'` quando a linha não tem conta.
   */
  contaId: string;
  /**
   * Quando esta linha foi confirmada como revisada — 133h item 9. `null` = ninguém marcou.
   *
   * ⚠ É O QUE DÁ TRÊS ESTADOS À BOLINHA: cinza (ninguém olhou), azul (revisada, ainda não
   * gravada) e verde (gravada). Sem ela eram dois, e conferir uma linha não deixava rastro
   * nenhum na lista — o operador reabria a sessão e não sabia onde tinha parado.
   */
  revisadaEm: string | null;
  /**
   * A IDENTIDADE da linha na lista do passo 2 — 133h-b item 2.
   *
   * ⚠ O NOME FICOU, O CONTEÚDO MUDOU: era `excel_produto` sempre; passou a ser a descrição
   * do LANÇAMENTO quando a linha tem um, porque é ela que reflete o que o operador salvou.
   * Renomear o campo tocaria cinco arquivos para trocar uma palavra — o comentário resolve.
   */
  descricaoExcel: string;
  /** O texto da planilha quando ele DIFERE da identidade; `null` quando é o mesmo (133h-b item 2). */
  contexto: string | null;
  /**
   * Por que esta linha está no estado em que está — 133a item 5.
   *
   * ⚠ VEM DO `casamento_meta` GRAVADO PELO BANCO, não de dedução no front: quem decidiu
   * foi o casador, e ele registrou a regra. Uma frase montada aqui divergiria dele no dia
   * em que a regra mudasse — e o operador leria uma explicação que não corresponde ao que
   * aconteceu.
   */
  porQue: string;
  banco: string;
  fornecedor: string;
  // DETALHE (direita) — comparativo completo Sistema | Excel | Resultado.
  comparativo: EnriqComparativoLinha[];
  // PR-U2b — infra do editor (ainda SEM edição visual): descritores + proveniência.
  camposEditaveis: EnriqCampoEditavel[];
  proveniencia: EnriqProveniencia;
  // PR-U2c-2A — valores crus da proposta (para os editores inline).
  edicao: EnriqEdicao;
}
