/**
 * useImportacaoExtrato — orquestra import OFX/CSV de extrato bancário.
 *
 * Fluxo:
 *   1. `gerarPreview({ arquivo, contaBancariaId })`
 *      - Detecta formato pelo nome/conteúdo (.ofx / .csv).
 *      - Roda parser (`parseOFX` ou `parseCSV`).
 *      - Calcula `hash_movimento` para cada movimento.
 *      - Consulta `extrato_bancario_v2` por cliente_id + hashes para marcar duplicados.
 *      - Devolve preview com totais e flag `duplicado` por linha.
 *
 *   2. `confirmarImportacao({ contaBancariaId, nomeArquivo, formato })`
 *      - Cria cabeçalho em `financeiro_importacoes_v2` (tipo='OFX'|'CSV', totais).
 *      - Insere apenas os NÃO-duplicados em `extrato_bancario_v2`, em batches de 500.
 *      - Status inicial dos movimentos: 'nao_conciliado'.
 *      - NÃO cria nada em `financeiro_lancamentos_v2`.
 *      - NÃO faz matching automático.
 *
 * Erros são propagados via `error` state e exception.
 *
 * FRONTEIRA DE MENSAGEM SEGURA (PR-FIN-IMPORT-ERRO-VISIVEL-01).
 * Este hook é o único lugar que sabe distinguir "validação que nós mesmos
 * escrevemos" de "erro que veio do banco, da rede ou do arquivo do usuário".
 * As validações autorais são lançadas como `ErroUsuarioSeguro` e chegam à tela
 * com o texto íntegro; todo o resto vira mensagem genérica na camada de UI.
 *
 * O que NUNCA é promovido a seguro, mesmo vindo de um Error tipado: qualquer
 * string que interpole conteúdo do arquivo (linha de extrato, cabeçalho lido),
 * mensagem do PostgREST, stack, path, SQL ou UUID.
 */
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { parseOFX, lerSaldoDeclaradoOFX, lerPeriodoDeclaradoOFX, type MovimentoBruto } from '@/lib/financeiro/parser/parseOFX';
import { separarLinhasDeSaldo, conferirSaldoDoExtrato, type ConferenciaSaldoExtrato } from '@/lib/financeiro/parser/linhaDeSaldo';
import { parseCSVComRelatorio } from '@/lib/financeiro/parser/parseCSV';
import { extractPdfText } from '@/lib/financeiro/parser/extractPdfText';
import { hashesDoArquivo, normalizarTexto } from '@/lib/financeiro/extratoHash';
import { decodificarExtrato } from '@/lib/financeiro/parser/decodificarExtrato';
import { dataAncoraLancamento, orFiltroDataAncora, OR_CENARIO_NAO_META } from '@/lib/financeiro/dataAncora';
import {
  classificarDuplicidadeOFX,
  type ClassificacaoOFXDup,
  type RegistroExtratoExistente,
} from '@/lib/financeiro/duplicidadeImportacao';
import { ErroUsuarioSeguro, normalizarErro } from '@/lib/erroOperacional';
import { lerRetornoImportacao, textoDoResultadoDaImportacao, type ResultadoImportacao } from '@/lib/financeiro/importacaoExtratoResultado';
import {
  diasEntre, calcularScore, tryGroupingMatch, calcularScoreAgrupado, type LancamentoCandidato,
} from '@/lib/conciliacao/sugestoesCasamento';

/**
 * `CsvLayoutError` (parseCSV) é um erro de validação de layout, mas suas
 * mensagens interpolam conteúdo do arquivo — cabeçalhos lidos e, num dos
 * casos, amostras de linhas do extrato (`linha N: <conteúdo>`). Por isso o
 * texto do parser NÃO é repassado: reconhecemos a classe pelo nome e
 * respondemos com uma orientação autoral, equivalente em utilidade e livre
 * de dado do arquivo.
 *
 * Detecção por `name` e não por `instanceof`: importar a classe criaria
 * acoplamento de tipo com o parser sem ganho — o nome é estável e o único
 * produtor é o próprio parseCSV.
 */
function ehErroDeLayoutCsv(e: unknown): boolean {
  return typeof e === 'object' && e !== null
    && (e as { name?: unknown }).name === 'CsvLayoutError';
}

const MSG_CSV_LAYOUT =
  'O CSV não está num layout reconhecido, ou tem linhas com valor monetário '
  + 'inválido. Confira se existem colunas de Data e de Valor (ou Débito e '
  + 'Crédito) e se os valores estão preenchidos corretamente. '
  + 'Nenhum movimento foi importado.';

/** Status operacional persistido em extrato_bancario_v2.status. */
export type StatusPersistido = 'nao_conciliado' | 'parcial' | 'conciliado' | 'ignorado';

// PR-OFX-DEDUP-01 — ESPELHO TS de public.fn_extrato_chave_doc(text) (a fn SQL IMMUTABLE
// da migration 20260707_pr_ofx_dedup01_chave_natural.sql). Manter os dois lados idênticos:
// 4+ segmentos ':' → 4º segmento (miolo estável do Bradesco); senão coalesce(d,'').
function chaveDocOFX(doc: string | null | undefined): string {
  if (doc != null && doc.split(':').length >= 4) return doc.split(':')[3];
  return doc ?? '';
}

export interface MovimentoPreview extends MovimentoBruto {
  hash: string;
  /** Hash já está em extrato_bancario_v2 (apenas fato físico). */
  existeNoDB: boolean;
  // PR-OFX-DEDUP-01 (1B) — chave natural: seq de ocorrência (ordem física do arquivo)
  // e flag de já-existente por chave natural nos VIVOS do banco (renumeração do FITID).
  /** Enésima ocorrência da mesma chave natural (sem seq) dentro do arquivo, em ordem física. */
  seqOcorrencia?: number;
  /** Um VIVO com a MESMA chave natural (incl. seq) já existe no banco → pular no insert. */
  jaExistenteChave?: boolean;
  /** id do registro em extrato_bancario_v2, quando existeNoDB=true. */
  extratoIdExistente: string | null;
  /** Quando aquele registro entrou no extrato — o "já importado em dd/mm" da prévia. */
  criadoEmExistente?: string | null;
  /** Status operacional do registro persistido (null se não existe). */
  statusPersistido: StatusPersistido | null;
  /** Score 0-100 do melhor candidato em financeiro_lancamentos_v2 (apenas visual). */
  scoreMatch: number;
  /** Sinal de match: scoreMatch >= 50 (1:1 ou agrupado). */
  matchEncontrado: boolean;
  /** id do lançamento candidato 1:1 (null em match agrupado). */
  lancamentoMatchId: string | null;
  /** Nome do fornecedor do candidato 1:1, se houver. */
  fornecedorMatch: string | null;
  /** Descrição do candidato 1:1. */
  descricaoMatch: string | null;
  /** Status do lançamento candidato 1:1 ('realizado'|'agendado'|'programado'|null). */
  statusMatch: string | null;

  /** Match composto por vários lançamentos (N:N). */
  matchAgrupado: boolean;
  /** Quantidade de lançamentos no grupo (0 quando não agrupado). */
  quantidadeItensMatch: number;
  /** Soma absoluta dos valores do grupo (deve bater com |valor| do extrato). */
  valorSomado: number;
  /** Ids dos lançamentos que compõem o grupo. */
  lancamentosIds: string[];
  /** Detalhes para auditoria visual (tooltip/expand). */
  detalhesAgrupados: LancamentoAgrupadoInfo[];
  /** Top-10 candidatos sugeridos para escolha manual (mesmo se score baixo). */
  candidatosPossiveis: CandidatoPossivel[];
  /**
   * Info enriquecida do candidato 1:1 escolhido (`null` em ambíguo, agrupado,
   * ou sem match). Usada pela UI para exibir fornecedor/NF/fazenda/conta/
   * classificação do match auto-escolhido.
   */
  candidatoMatch: CandidatoPossivel | null;
  /**
   * Há 2+ candidatos 1:1 com score equivalente (empate estrito ≤1pt OU
   * valor+data+fornecedor idênticos). Auto-pick é DESLIGADO neste caso —
   * o usuário deve escolher manualmente. matchAmbiguo é independente de
   * matchAgrupado e nunca esconde pendência operacional.
   */
  matchAmbiguo: boolean;
  /** Candidatos top equivalentes — populado SOMENTE quando matchAmbiguo=true. */
  candidatosAmbiguos: CandidatoPossivel[];

  // ── P0-OFX-DUP-GUARD / FASE 1A — suspeita de duplicata (camada aditiva) ──
  // Só populado em movimentos NOVOS (existeNoDB=false) que casam conta+data+valor
  // com um extrato ATIVO (cancelado_em IS NULL). FASE 1A é só detecção: NÃO
  // altera o insert nem pula linha (decisão/skip ficam para a 1B).
  /** Classificação da suspeita (null/undefined = sem suspeita). */
  dupClassificacao?: ClassificacaoOFXDup | null;
  /** id do extrato existente que disparou a suspeita. */
  dupExistenteId?: string | null;
  /** Resumo legível da decisão. */
  dupResumo?: string | null;
  /** Default sugerido p/ a 1B: FORTE=false (pular), PROVÁVEL/COINCIDÊNCIA=true. */
  dupImportar?: boolean;
  /** 1B (display) — descrição da linha existente que disparou a suspeita. */
  dupExistenteDescricao?: string | null;
  /** 1B (display) — documento/FITID da linha existente que disparou a suspeita. */
  dupExistenteDocumento?: string | null;
}

export interface LancamentoAgrupadoInfo {
  id: string;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;        // signed (negativo = saída)
  macroCusto: string | null;
  grupoCusto: string | null;
  centroCusto: string | null;
  subcentro: string | null;
  /** Status atual do lançamento (para decidir se converte). */
  statusTransacao: string | null;
  numeroDocumento: string | null;
  fazenda: string | null;
  contaBancaria: string | null;
}

/** Candidato sugerido para movimentos sem match automático (ranking heurístico). */
export interface CandidatoPossivel {
  id: string;
  data: string | null;
  fornecedor: string | null;
  descricao: string | null;
  valor: number;        // signed
  statusTransacao: string | null;
  diffValor: number;    // |valor lanc| - |valor mov|
  diffDias: number;     // |data lanc - data mov| em dias
  numeroDocumento: string | null;
  // ── Enriquecimentos para distinguir candidatos equivalentes (NF/fazenda/conta) ──
  fazenda: string | null;
  contaBancaria: string | null;
  // Classificação financeira (apenas leitura — nunca alterada pela conciliação).
  macroCusto: string | null;
  grupoCusto: string | null;
  centroCusto: string | null;
  subcentro: string | null;
  /** |valor| original do lançamento. */
  valorOriginal: number;
  /** Soma absoluta de valor_aplicado dos vínculos existentes em conciliacao_bancaria_itens. */
  valorJaConciliado: number;
  /** valorOriginal - valorJaConciliado (limitado a 0). */
  saldoConciliar: number;
  /** valorJaConciliado > 0. */
  jaVinculadoOFX: boolean;
  /** valorJaConciliado >= valorOriginal (tolerância 0.01). */
  conciliadoIntegralmente: boolean;
}

export interface PreviewResult {
  movimentos: MovimentoPreview[];
  totalLinhas: number;
  /** Movimentos cujo hash AINDA não está no banco — alvo do "Salvar extrato". */
  novosParaSalvar: number;
  /** Total de movimentos cujo hash já existe em extrato_bancario_v2 (qualquer status). */
  existentesNoBanco: number;
  /** PR-OFX-DEDUP-01 (1B) — novos por hash mas já existentes por chave natural (renumerados). */
  jaExistentesPorChave: number;
  /** existeNoDB && statusPersistido='nao_conciliado'. Pendência aberta. */
  pendentes: number;
  /** existeNoDB && statusPersistido='parcial'. Parcialmente conciliado. */
  parciais: number;
  /** existeNoDB && statusPersistido='conciliado'. Já fechado. */
  conciliados: number;
  /** existeNoDB && statusPersistido='ignorado'. */
  ignorados: number;
  /** Suspeitas de duplicata que, pelo padrão ou pela escolha do operador, NÃO vão entrar. */
  suspeitasForaDaImportacao: number;
  /**
   * Match counters — calculados sobre movimentos AINDA acionáveis
   * (não existe no DB ou status_persistido ∈ {nao_conciliado, parcial}).
   */
  matchDireto: number;
  matchAgrupados: number;
  semMatch: number;
  /** Movimentos com 2+ candidatos top equivalentes — exigem escolha manual. */
  ambiguos: number;
  /** P0-OFX-DUP-GUARD 1A — movimentos NOVOS classificados como suspeita de duplicata. */
  suspeitasDuplicata: number;
  /**
   * BUG-CSV-PARSE-VALOR-01 — linhas datadas do CSV sem NENHUM valor monetário
   * (todas as colunas monetárias vazias), puladas como informativas. 0 para OFX.
   */
  linhasInformativas: number;
  formato: 'OFX' | 'CSV';
  /**
   * FIN-OFX-LEDGERBAL-PARSER-01 — o saldo que o BANCO declara no arquivo
   * (`LEDGERBAL/BALAMT`), repassado do parser SEM transformação: o motor não
   * soma, não arredonda, não compara e não grava. É fato do arquivo, e a única
   * coisa que se faz com ele é mostrar.
   *
   * ⚠ `null` QUANDO O ARQUIVO NÃO DECLARA — e nunca zero. Ausência é ausência:
   * um OFX sem `LEDGERBAL` não afirma que o saldo é R$ 0,00, afirma que não
   * disse. E jamais o somatório dos movimentos no lugar: somatório bate consigo
   * mesmo e não confere coisa nenhuma. Sempre null para CSV, que não tem a tag.
   */
  saldoDeclarado: number | null;
  /** `LEDGERBAL/DTASOF` — a data a que o saldo declarado se refere. ISO. */
  saldoDeclaradoData: string | null;
  /**
   * PR-CONC-OFX-LINHA-SALDO-01 — as linhas de SALDO que o banco mandou como movimento ("SALDO ANTERIOR", "SALDO
   * TOTAL DISPONÍVEL DIA" do Itaú). Saem de `movimentos` antes de tudo: não geram hash, não entram na contagem, não
   * se gravam. Ficam aqui só para a prévia mostrá-las apagadas e conferir o último saldo contra o declarado.
   */
  linhasSaldo: MovimentoBruto[];
  /** O último saldo do extrato × `saldoDeclarado`. Só informa; o saldo manual da conta é soberano. */
  conferenciaSaldo: ConferenciaSaldoExtrato;
  /**
   * `BANKTRANLIST/DTSTART` e `DTEND` — o período que o ARQUIVO declara.
   *
   * ⚠ `null` QUANDO O ARQUIVO NÃO DIZ, e aí quem mostra cai para as datas dos
   * movimentos. Não é o mesmo período: derivar do primeiro e do último
   * lançamento encurta o mês que começa ou termina sem movimento, e quem
   * confere a cobertura do arquivo conclui que faltou pedaço.
   */
  periodoDeclaradoInicio: string | null;
  periodoDeclaradoFim: string | null;
}

/**
 * Recalcula todos os agregados a partir do array de movimentos.
 *
 * Precedência absoluta: `statusPersistido` define pendência. Heurísticas
 * (`matchAgrupado`, `scoreMatch`) só contam para os contadores de match,
 * e ainda assim restritos a movimentos AINDA acionáveis. Um agrupado
 * conciliado conta apenas em `conciliados` — nunca em `pendentes` nem
 * em `matchAgrupados`.
 */
function recomputarAgregados(
  movimentos: MovimentoPreview[],
): Pick<
  PreviewResult,
  | 'novosParaSalvar' | 'existentesNoBanco' | 'jaExistentesPorChave' | 'pendentes' | 'parciais'
  | 'conciliados' | 'ignorados' | 'matchDireto' | 'matchAgrupados'
  | 'semMatch' | 'ambiguos' | 'suspeitasDuplicata' | 'suspeitasForaDaImportacao'
> {
  const acionaveis = movimentos.filter(
    (m) =>
      !m.existeNoDB ||
      m.statusPersistido === 'nao_conciliado' ||
      m.statusPersistido === 'parcial',
  );
  return {
    // PR-OFX-DEDUP-01 (1B) — renumerados (jaExistenteChave) saem de "novos" e viram "já existentes".
    /* ⚠ A SUSPEITA SAI DE "NOVOS" ENQUANTO NÃO FOR MARCADA — PR-IMPORT-DUPLICATA-UNIFICA-01, e
       o padrão é esse porque DUPLICAR É PIOR QUE FALTAR: duplicata suja saldo e conciliação e
       só se descobre depois; o que falta o operador vê na hora e reimporta. Marcar a linha a
       devolve para "novos", e o número do botão de gravar sobe junto.
       ⚠ E O CRITÉRIO É `dupImportar === false`, não "tem suspeita": a COINCIDÊNCIA nasce
       marcada e continua contando como nova. */
    novosParaSalvar:   movimentos.filter((m) =>
      !m.existeNoDB && !m.jaExistenteChave && m.dupImportar !== false
    ).length,
    /* ⚠ SÓ A SUSPEITA — PR-CONC-OFX-LINHA-SALDO-01: com caixa em toda linha, o "novo" desmarcado pelo operador
       também tem `dupImportar === false`, e não é "duplicado?". */
    suspeitasForaDaImportacao: movimentos.filter((m) =>
      !m.existeNoDB && !m.jaExistenteChave && !!m.dupClassificacao && m.dupImportar === false
    ).length,
    existentesNoBanco: movimentos.filter((m) =>  m.existeNoDB).length,
    jaExistentesPorChave: movimentos.filter((m) => !m.existeNoDB && m.jaExistenteChave === true).length,
    // Pendente = null (não salvo) OR nao_conciliado. Conciliado/parcial/ignorado
    // NUNCA entram, mesmo que sejam agrupados.
    pendentes:         movimentos.filter((m) =>
      m.statusPersistido === null || m.statusPersistido === 'nao_conciliado'
    ).length,
    parciais:          movimentos.filter((m) => m.statusPersistido === 'parcial').length,
    conciliados:       movimentos.filter((m) => m.statusPersistido === 'conciliado').length,
    ignorados:         movimentos.filter((m) => m.statusPersistido === 'ignorado').length,
    // matchDireto exclui ambíguos — empates não contam como match único.
    matchDireto:       acionaveis.filter((m) => m.matchEncontrado && !m.matchAgrupado && !m.matchAmbiguo).length,
    matchAgrupados:    acionaveis.filter((m) => m.matchAgrupado).length,
    // semMatch exclui ambíguos — eles têm candidatos, só não há vencedor único.
    semMatch:          acionaveis.filter((m) => !m.matchEncontrado && !m.matchAmbiguo).length,
    ambiguos:          acionaveis.filter((m) => m.matchAmbiguo).length,
    // P0-OFX-DUP-GUARD 1A — suspeitas só existem em movimentos novos; campo
    // preservado pelos rebuilds (spread ...m). Não afeta nenhum outro contador.
    suspeitasDuplicata: movimentos.filter((m) => !!m.dupClassificacao).length,
  };
}

/**
 * Quais destes hashes JÁ ESTÃO no extrato desta conta — a dedupe da importação.
 *
 * ⚠ CANCELADO NÃO CONTA, e foi por não olhar isso que a importação travou na Vera Ligia
 * (17/09/2026): ela cancelou uma importação duplicada e o arquivo seguinte passou a vir
 * "0 novos · 34 já no extrato", porque as 33 linhas canceladas continuavam respondendo
 * "existe". Cancelar precisa devolver o direito de reimportar — senão cancelar é uma via
 * sem volta.
 * ⚠ E NÃO ADIANTARIA FILTRAR POR `status`: NÃO EXISTE status 'cancelado'. Os movimentos de
 * uma importação desfeita seguem 'nao_conciliado'; quem marca o cancelamento é a COLUNA
 * `cancelado_em`. Quem filtrar por status não enxerga cancelamento nenhum.
 *
 * ⚠ A REGRA É A DO ÍNDICE DO BANCO, copiada e não reinventada — `idx_extrato_v2_hash_unico`
 * é `UNIQUE (cliente_id, hash_movimento) WHERE cancelado_em IS NULL AND status <> 'ignorado'`.
 * A prévia tem de dizer exatamente o que o banco vai aceitar; qualquer outra régua faz a tela
 * prometer uma coisa e o INSERT fazer outra. Por isso o ignorado sai pelo `status`, que é o
 * que o índice usa (`ignorado_em` e `status='ignorado'` estão 1:1 hoje — 16 e 16 —, mas uma
 * régua só é uma régua só).
 *
 * ⚠ UMA FUNÇÃO, DOIS CHAMADORES: esta consulta existia DUAS VEZES, copiada entre a prévia e o
 * `refreshStatusPersistidos`. Consertar uma só reintroduziria o defeito no próximo salvar.
 */
async function buscarPersistidosPorHash(
  clienteId: string,
  contaBancariaId: string,
  hashes: string[],
): Promise<Map<string, { id: string; status: StatusPersistido; criadoEm: string | null }>> {
  const mapa = new Map<string, { id: string; status: StatusPersistido; criadoEm: string | null }>();
  if (hashes.length === 0) return mapa;
  // BUG-CSV-DEDUP-01: paginação OBRIGATÓRIA — o PostgREST corta em ~1000 linhas por request.
  // Sem paginar, arquivos com >1000 movimentos já existentes vinham truncados e as duplicatas
  // escapavam para o INSERT.
  const PAGE_DEDUP = 1000;
  for (let from = 0; ; from += PAGE_DEDUP) {
    const { data, error } = await supabase
      .from('extrato_bancario_v2' as any)
      .select('id, hash_movimento, status, created_at')
      .eq('cliente_id', clienteId)
      /* A conta já entra no hash, então este filtro não muda o resultado — ele só evita
         varrer o cliente inteiro para responder por uma conta. */
      .eq('conta_bancaria_id', contaBancariaId)
      .is('cancelado_em', null)
      .neq('status', 'ignorado')
      .in('hash_movimento', hashes)
      .order('id', { ascending: true })
      .range(from, from + PAGE_DEDUP - 1);
    if (error) throw error;
    const lote = (data as unknown as
      { id: string; hash_movimento: string; status: StatusPersistido; created_at: string | null }[] ?? []);
    for (const r of lote) mapa.set(r.hash_movimento, { id: r.id, status: r.status, criadoEm: r.created_at });
    if (lote.length < PAGE_DEDUP) break;
    if (from > 500_000) break; // salvaguarda anti-loop
  }
  return mapa;
}

/* ⚠ A RÉGUA DA "PROVÁVEL REIMPORTAÇÃO" SAIU DAQUI — PR-IMPORT-DUPLICATA-UNIFICA-01. Ela
   comparava conta+data+valor+descrição IDÊNTICA e parava aí; a suspeita por SEMELHANÇA
   (`classificarDuplicidadeOFX`), que já existia e já rodava em toda prévia, cobre esses casos e
   mais — idêntica é Jaccard 1. Conferido antes de apagar: no proto não há NENHUM movimento vivo
   com descrição vazia ou só de palavras de uma letra, que seriam os únicos casos em que texto
   igual não alcança o limiar de 0,5. Nada se perdeu; o que ficou foi o PAREAMENTO, que subiu
   para o lado da classificação. */

export interface ConfirmarParams {
  contaBancariaId: string;
  nomeArquivo: string;
  formato: 'OFX' | 'CSV';
  /**
   * 1B — quando true, importa TODAS as suspeitas (ignora dupImportar===false).
   * Usado pela ação "Importar tudo" do alerta. Default/false respeita a decisão
   * por linha (FORTE pula por padrão; PROVÁVEL/COINCIDÊNCIA importam).
   */
  forcarImportarSuspeitas?: boolean;
}

function detectarFormato(nomeArquivo: string, conteudo: string): 'OFX' | 'CSV' | 'PDF' | null {
  const lower = nomeArquivo.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.ofx') || /<OFX>/i.test(conteudo)) return 'OFX';
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return 'CSV';
  return null;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ⚠ A CÓPIA LOCAL DE `normalizarTexto` SAIU DAQUI — PR-IMPORT-REIMPORTACAO-01. Ela era byte a
   byte igual à de `extratoHash.ts`, que agora é exportada: duas cópias da normalização da
   identidade do movimento, e a comparação de texto deste arquivo tinha de concordar com o hash
   por coincidência. Agora concorda por construção. */


/** Comparação textual estrita para ambiguidade (sem incluir parcial difuso). */
function similarFornecedorEstrito(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const an = a
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const bn = b
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!an || !bn) return false;
  return an === bn || an.includes(bn) || bn.includes(an);
}

/**
 * Detecta empate de candidatos 1:1 — regra estrita (financeiro):
 *   ambíguo = score IGUAL ao topo OU diferença ≤ 1pt OU
 *             (mesmo valor + mesma data + fornecedor parecido).
 * Tolerância maior gera falso-ambíguo. Por isso ≤ 1, não ≤ 5.
 */
interface CandidatoComScore {
  lanc: LancamentoCandidato;
  score: number;
  fornNome: string | null;
}
function detectarAmbiguidade(
  candidatos: CandidatoComScore[],
): { scoreMax: number; empatesTop: CandidatoComScore[]; ambiguo: boolean } {
  if (candidatos.length === 0) return { scoreMax: 0, empatesTop: [], ambiguo: false };
  const sorted = [...candidatos].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.score < 50) return { scoreMax: top.score, empatesTop: [], ambiguo: false };

  const empatesTop = sorted.filter((c) => {
    if (Math.abs(c.score - top.score) <= 1) return true;
    // Caso especial: scores diferentes mas valor+data+fornecedor idênticos
    const valorIgual =
      Math.abs(Math.abs(c.lanc.valor) - Math.abs(top.lanc.valor)) <= 0.01;
    const dataIgual = dataAncoraLancamento(c.lanc) === dataAncoraLancamento(top.lanc);
    const fornParecido = similarFornecedorEstrito(c.fornNome, top.fornNome);
    return valorIgual && dataIgual && fornParecido;
  });

  return {
    scoreMax: top.score,
    empatesTop,
    ambiguo: empatesTop.length > 1,
  };
}

/* ⚠ O MOTOR DO CASAMENTO (`diasEntre`, `calcularScore`, `tryGroupingMatch`, `calcularScoreAgrupado`) SAIU DAQUI
   VERBATIM para `src/lib/conciliacao/sugestoesCasamento.ts` — PR-CONC-SUGESTOES-CASAR-01. A Conferência usa o mesmo
   motor no "Ver sugestões"; a prévia chama com os mesmos parâmetros e não mudou de comportamento. */

export function useImportacaoExtrato() {
  const { clienteAtual } = useCliente();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  /* A conta da prévia em curso — o `refreshStatusPersistidos` precisa dela para repetir a
     MESMA dedupe, e o `PreviewResult` não a carrega. */
  const contaDoPreviewRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function gerarPreview(params: {
    arquivo: File;
    contaBancariaId: string;
  }): Promise<PreviewResult> {
    setLoading(true);
    setError(null);
    try {
      if (!clienteAtual?.id) throw new ErroUsuarioSeguro('Cliente não selecionado');

      // Guard PDF: detectar pelo nome antes de ler como texto (arquivo PDF
      // eh binario; arquivo.text() retornaria lixo UTF-8). Parser PDF
      // definitivo fica para PR-B. Aqui apenas guard com mensagem clara.
      const lowerName = params.arquivo.name.toLowerCase();
      if (lowerName.endsWith('.pdf')) {
        const { hasTextLayer } = await extractPdfText(params.arquivo);
        if (!hasTextLayer) {
          throw new ErroUsuarioSeguro(
            'Este PDF parece ser escaneado/imagem. Envie OFX, CSV ou PDF digital baixado do banco. OCR sera tratado futuramente.'
          );
        }
        throw new ErroUsuarioSeguro(
          'PDF digital detectado, mas o parser PDF ainda esta em desenvolvimento. Use OFX/CSV por enquanto, ou aguarde a proxima versao.'
        );
      }

      /* ⚠ PELO CHARSET DECLARADO, NUNCA `.text()` — PR-CONC-CRIAR-LOTE-LAYOUT-01. `.text()` é sempre UTF-8, e o OFX
         do BB e do Bradesco vem em cp1252: "Cartão" gravava como "Cart\uFFFDo" (326 linhas no proto em 30/09). */
      const conteudo = decodificarExtrato(await params.arquivo.arrayBuffer());
      const formato = detectarFormato(params.arquivo.name, conteudo);
      if (!formato) throw new ErroUsuarioSeguro('Formato não reconhecido (espera-se .ofx, .csv ou .pdf)');
      // Defensivo: o branch PDF acima sempre throwa antes de chegar aqui.
      // Esse narrowing existe pra TS estreitar formato pra 'OFX' | 'CSV'
      // (o tipo de retorno de detectarFormato inclui 'PDF').
      if (formato === 'PDF') throw new Error('PDF deveria ter sido tratado pelo guard acima.');

      // BUG-CSV-PARSE-VALOR-01: CSV usa parseCSVComRelatorio p/ contabilizar linhas
      // datadas SEM valor monetário (informativas), que são puladas — nunca gravadas 0.
      let movimentosBrutos: MovimentoBruto[];
      let linhasInformativas = 0;
      // FIN-OFX-LEDGERBAL-PARSER-01 — leitura à parte, e à parte de propósito: o
      // saldo declarado NÃO entra na lista de movimentos, não gera hash, não é
      // comparado com nada e não muda uma linha do que se grava. Só atravessa.
      let saldoDeclarado: number | null = null;
      let saldoDeclaradoData: string | null = null;
      let periodoDeclaradoInicio: string | null = null;
      let periodoDeclaradoFim: string | null = null;
      if (formato === 'OFX') {
        movimentosBrutos = parseOFX(conteudo);
        const saldo = lerSaldoDeclaradoOFX(conteudo);
        saldoDeclarado = saldo?.saldoDeclarado ?? null;
        saldoDeclaradoData = saldo?.saldoData ?? null;
        /* Também à parte dos movimentos, e pelo mesmo motivo: é fato do arquivo,
           não linha de extrato. */
        const periodo = lerPeriodoDeclaradoOFX(conteudo);
        periodoDeclaradoInicio = periodo?.inicio ?? null;
        periodoDeclaradoFim = periodo?.fim ?? null;
      } else {
        const rel = parseCSVComRelatorio(conteudo);
        movimentosBrutos = rel.movimentos;
        linhasInformativas = rel.linhasInformativas.length;
      }
      /* ⚠ LINHA DE SALDO NÃO É MOVIMENTO — PR-CONC-OFX-LINHA-SALDO-01. O Itaú manda "SALDO ANTERIOR" e "SALDO TOTAL
         DISPONÍVEL DIA" como `<STMTTRN>`, com o saldo inteiro no valor: importadas, viravam entradas do tamanho do caixa
         (NJ, jul/26: cinco de R$ 1,7 mi). Saem AQUI, antes do hash — um helper só, para OFX e CSV. A identidade dos
         movimentos não muda: o hash não usa posição, e o FITID da linha de saldo é só dela. */
      const separadas = separarLinhasDeSaldo(movimentosBrutos);
      movimentosBrutos = separadas.movimentos;
      const linhasSaldo = separadas.saldos;
      if (movimentosBrutos.length === 0) {
        // Caminho real do "OFX inválido": parseOFX não lança — um arquivo
        // corrompido, truncado ou que não é OFX simplesmente não produz
        // movimento. `formato` é o literal 'OFX' | 'CSV' da nossa própria
        // união, não conteúdo do arquivo.
        throw new ErroUsuarioSeguro(
          `Nenhum movimento encontrado no arquivo. Verifique se o ${formato} `
          + 'é um extrato válido do banco e não está vazio ou truncado.',
        );
      }

      // Calcular hashes — PR-CONC-IMPORT-BANCO-01B: com a OCORRÊNCIA entre movimentos de conteúdo idêntico
      // (`hashesDoArquivo`): dois "RENTAB 0,13" iguais no mesmo dia são dois movimentos, cada um com hash próprio.
      const hashesArquivo = await hashesDoArquivo(params.contaBancariaId, movimentosBrutos);
      const movimentosComHash = movimentosBrutos.map((m, i) => ({ ...m, hash: hashesArquivo[i] }));

      // Consulta dos hashes JÁ persistidos: traz id + status para que a UI
      // possa diferenciar "existe no banco" (fato físico) de "já processado"
      // (status operacional). Hash existente NÃO significa pendência fechada.
      const hashes = movimentosComHash.map((m) => m.hash);
      // BUG-CSV-DEDUP-01: paginação OBRIGATÓRIA — o PostgREST corta em ~1000 linhas por
      // request. Sem paginar, arquivos com >1000 movimentos já existentes vinham truncados,
      // as duplicatas escapavam para o INSERT e explodiam a unique idx_extrato_v2_hash_unico.
      // Mesmo padrão de useFinanceiroV2 / useSessoesClassificacao (.range em laço até < PAGE).
      /* ⚠ `created_at` ENTRA AQUI — PR-IMPORT-DESFAZER-01 parte C. A prévia dizia "JÁ
         EXISTE" sem dizer desde quando, e o operador lia como "o sistema já lançou isso".
         Uma coluna a mais na consulta que já roda transforma o susto em fato: "já importado
         em 18/08". Nenhuma lógica de dedupe muda. */
      contaDoPreviewRef.current = params.contaBancariaId;
      const persistidoPorHash = await buscarPersistidosPorHash(
        clienteAtual.id, params.contaBancariaId, hashes);

      // ── Match financeiro: buscar candidatos em financeiro_lancamentos_v2 ──
      // Range de datas amplo (±10 dias para cobrir 1:1 e composição N:N).
      const datas = movimentosComHash.map((m) => m.data).sort();
      const dataMin = datas[0];
      const dataMax = datas[datas.length - 1];

      // ── P0-OFX-DUP-GUARD / FASE 1A — candidatos p/ suspeita de duplicata ──
      // Extratos ATIVOS (cancelado_em IS NULL) da mesma conta no range de datas
      // do arquivo. Camada ADITIVA: não altera o dedup por hash nem o insert.
      const { data: candRows, error: errCand } = await supabase
        .from('extrato_bancario_v2' as any)
        .select('id, data_movimento, valor, documento, descricao, seq_ocorrencia, status')
        .eq('cliente_id', clienteAtual.id)
        .eq('conta_bancaria_id', params.contaBancariaId)
        .gte('data_movimento', dataMin)
        .lte('data_movimento', dataMax)
        .is('cancelado_em', null)
        /* ⚠ IGNORADO NÃO É CANDIDATO A DUPLICATA — PR-IMPORT-DUPLICATA-UNIFICA-01. A query
           filtrava só o cancelado, e um movimento que o operador tirou da conciliação de
           propósito continuava acusando o arquivo novo de duplicar. É a mesma régua do índice
           do banco e da dedupe por hash: vivo é o que não foi cancelado NEM ignorado.
           Medido: 15 ignorados vivos no proto entravam nesta lista. */
        .neq('status', 'ignorado');
      if (errCand) throw errCand;
      const candidatosDup = (candRows ?? []) as unknown as RegistroExtratoExistente[];

      // PR-OFX-DEDUP-01 (1B) — conjunto das CHAVES NATURAIS VIVAS já no banco (cancelado_em
      // null pela query + status <> 'ignorado'), para o dedupe determinístico pré-insert.
      const chavesVivasNoBanco = new Set<string>();
      for (const r of (candRows ?? []) as unknown as
        { data_movimento: string; valor: number; documento: string | null; seq_ocorrencia: number; status: string }[]) {
        if (r.status === 'ignorado') continue;
        chavesVivasNoBanco.add(`${r.data_movimento}|${r.valor}|${chaveDocOFX(r.documento)}|${r.seq_ocorrencia}`);
      }

      const fetchIni = addDays(dataMin, -10);
      const fetchFim = addDays(dataMax, +10);

      // Inclui agendado/programado para permitir conversão assistida via OFX.
      // Exclui cenário META — não é alvo de conciliação.
      const { data: lancsRaw } = await supabase
        .from('financeiro_lancamentos_v2')
        .select('id, data_pagamento, data_vencimento, data_competencia, valor, sinal, descricao, favorecido_id, conta_bancaria_id, conta_destino_id, macro_custo, grupo_custo, centro_custo, subcentro, status_transacao, numero_documento, cenario, fazenda_id')
        .eq('cliente_id', clienteAtual.id)
        // PR-CONCIL-AGENDADO-01 (D9): vivo = cancelado IS NOT TRUE (coluna anulável).
        .not('cancelado', 'is', true)
        // D9: cenario é anulável — 'diferente de meta OU nulo'.
        .or(OR_CENARIO_NAO_META)
        .in('status_transacao', ['realizado', 'agendado', 'programado'])
        .or(`conta_bancaria_id.eq.${params.contaBancariaId},conta_destino_id.eq.${params.contaBancariaId}`)
        // D1: janela ±10d sobre a âncora COALESCE(pagamento, vencimento, competência).
        .or(orFiltroDataAncora(fetchIni, fetchFim));

      const lancs = (lancsRaw ?? []) as unknown as LancamentoCandidato[];

      // ── Lookups paralelos: fornecedores, fazendas, contas, vínculos existentes ──
      const favIds = Array.from(
        new Set(lancs.map((l) => l.favorecido_id).filter((x): x is string => !!x)),
      );
      const fazIds = Array.from(
        new Set(lancs.map((l) => l.fazenda_id).filter((x): x is string => !!x)),
      );
      const contaIds = Array.from(
        new Set(
          lancs
            .flatMap((l) => [l.conta_bancaria_id, l.conta_destino_id])
            .filter((x): x is string => !!x),
        ),
      );
      const lancIds = lancs.map((l) => l.id);

      const [fornsRes, fazsRes, contasRes, vinculosRes] = await Promise.all([
        favIds.length > 0
          ? supabase.from('financeiro_fornecedores').select('id, nome').in('id', favIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        fazIds.length > 0
          ? supabase.from('fazendas').select('id, nome').in('id', fazIds)
          : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
        contaIds.length > 0
          ? supabase
              .from('financeiro_contas_bancarias')
              .select('id, nome_conta, nome_exibicao')
              .in('id', contaIds)
          : Promise.resolve({ data: [] as { id: string; nome_conta: string; nome_exibicao: string | null }[] }),
        lancIds.length > 0
          ? supabase
              .from('conciliacao_bancaria_itens' as any)
              .select('lancamento_id, valor_aplicado')
              .eq('cliente_id', clienteAtual.id)
              .in('lancamento_id', lancIds)
              .is('desfeito_em', null)   // PR-CBI-READ-01: só vínculos ativos
          : Promise.resolve({ data: [] as { lancamento_id: string; valor_aplicado: number }[] }),
      ]);

      const fornMap = new Map<string, string>();
      for (const f of (fornsRes.data ?? []) as { id: string; nome: string }[]) {
        fornMap.set(f.id, f.nome);
      }
      const fazendaMap = new Map<string, string>();
      for (const f of (fazsRes.data ?? []) as { id: string; nome: string }[]) {
        fazendaMap.set(f.id, f.nome);
      }
      const contaMap = new Map<string, string>();
      for (const c of (contasRes.data ?? []) as
        { id: string; nome_conta: string; nome_exibicao: string | null }[]
      ) {
        contaMap.set(c.id, c.nome_exibicao || c.nome_conta);
      }
      // Soma dos valor_aplicado por lançamento — base para saldo conciliável e
      // para excluir do auto-match os lançamentos já totalmente cobertos.
      const totalAplicadoPorLanc = new Map<string, number>();
      for (const v of (vinculosRes.data ?? []) as
        { lancamento_id: string; valor_aplicado: number }[]
      ) {
        const cur = totalAplicadoPorLanc.get(v.lancamento_id) ?? 0;
        totalAplicadoPorLanc.set(
          v.lancamento_id,
          cur + Math.abs(Number(v.valor_aplicado) || 0),
        );
      }

      // Mapa lancId → nomeFornecedor (para score agrupado consultar por l.id).
      const fornByLancId = new Map<string, string>();
      for (const l of lancs) {
        if (l.favorecido_id) {
          const nome = fornMap.get(l.favorecido_id);
          if (nome) fornByLancId.set(l.id, nome);
        }
      }

      // Lançamentos já conciliados integralmente — excluídos do auto-match
      // mas continuam disponíveis em candidatosPossiveis para auditoria manual.
      function jaConciliadoIntegralmente(l: LancamentoCandidato): boolean {
        const aplicado = totalAplicadoPorLanc.get(l.id) ?? 0;
        const valorAbs = Math.abs(Number(l.valor) || 0);
        return aplicado >= valorAbs - 0.01;
      }
      const lancsLivres = lancs.filter((l) => !jaConciliadoIntegralmente(l));

      // Helper: monta um CandidatoPossivel completo (com fazenda/conta/saldo/classificação).
      function montarCandidato(
        l: LancamentoCandidato,
        movDataISO: string,
        valorMovAbs: number,
      ): CandidatoPossivel {
        const valorOriginal = Math.abs(Number(l.valor) || 0);
        const valorJaConciliado = totalAplicadoPorLanc.get(l.id) ?? 0;
        const saldoConciliar = Math.max(0, valorOriginal - valorJaConciliado);
        const ancCand = dataAncoraLancamento(l);
        return {
          id: l.id,
          data: ancCand,
          fornecedor: l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null,
          descricao: l.descricao,
          valor: (Number(l.valor) || 0) * ((Number(l.sinal) || 0) >= 0 ? 1 : -1),
          statusTransacao: l.status_transacao,
          diffValor: Math.abs(valorOriginal - valorMovAbs),
          diffDias: ancCand ? Math.abs(diasEntre(movDataISO, ancCand)) : 999,
          numeroDocumento: l.numero_documento,
          fazenda: l.fazenda_id ? fazendaMap.get(l.fazenda_id) ?? null : null,
          contaBancaria: l.conta_bancaria_id ? contaMap.get(l.conta_bancaria_id) ?? null : null,
          macroCusto: l.macro_custo,
          grupoCusto: l.grupo_custo,
          centroCusto: l.centro_custo,
          subcentro: l.subcentro,
          valorOriginal,
          valorJaConciliado,
          saldoConciliar,
          jaVinculadoOFX: valorJaConciliado > 0,
          conciliadoIntegralmente: valorJaConciliado >= valorOriginal - 0.01,
        };
      }

      // Para cada movimento:
      //   1) tentar match 1:1 sobre `lancsLivres` (excluídos os já totalmente
      //      conciliados). Detectar ambiguidade — se houver empate estrito,
      //      desativar auto-pick e expor candidatosAmbiguos para escolha humana;
      //   2) se 1:1 falhar, tentar composição (subset, até 8 itens, ±10 dias,
      //      sinal compatível, timeout 200ms).
      const movimentos: MovimentoPreview[] = movimentosComHash.map((m) => {
        const valorMov = Math.abs(m.valor);

        // ── 1) Score de TODOS os candidatos viáveis (auto-match exclui já-totalmente-conciliados) ──
        const candidatosScore: CandidatoComScore[] = [];
        for (const l of lancsLivres) {
          if (Math.abs(Math.abs(Number(l.valor) || 0) - valorMov) > 0.01) continue;
          const ancL = dataAncoraLancamento(l);
          if (!ancL) continue;
          if (Math.abs(diasEntre(m.data, ancL)) > 7) continue;
          const fornNome = l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null;
          const s = calcularScore(m.data, m.descricao, l, fornNome);
          candidatosScore.push({ lanc: l, score: s, fornNome });
        }

        const { scoreMax, empatesTop, ambiguo } = detectarAmbiguidade(candidatosScore);
        const matchAmbiguo = ambiguo;
        // Auto-pick SOMENTE quando há candidato único (não ambíguo) com score ≥ 50.
        const melhor: LancamentoCandidato | null =
          !matchAmbiguo && empatesTop.length === 1 && scoreMax >= 50
            ? empatesTop[0].lanc
            : null;
        const melhorScore = scoreMax;
        const fornecedorMatch = melhor?.favorecido_id ? fornMap.get(melhor.favorecido_id) ?? null : null;

        // Lista de candidatos ambíguos enriquecida (somente quando há empate real).
        const candidatosAmbiguos: CandidatoPossivel[] = matchAmbiguo
          ? empatesTop.map((c) => montarCandidato(c.lanc, m.data, valorMov))
          : [];

        // Top-10 candidatos sugeridos (ranking por valor próximo, data, similaridade).
        // Mantém TODOS os lançamentos do range (incluindo já vinculados ou conciliados)
        // — modal manual é responsável por mostrar flags e desabilitar quando preciso.
        const sinalEsperado = m.tipo === 'credito' ? 1 : -1;
        const movN = normalizarTexto(m.descricao);
        const candidatosPossiveis: CandidatoPossivel[] = lancs
          .filter((l) => {
            const ancL = dataAncoraLancamento(l);
            if (!ancL) return false;
            const dDiff = Math.abs(diasEntre(m.data, ancL));
            if (dDiff > 10) return false;
            const sinalLanc = (Number(l.sinal) || 0) >= 0 ? 1 : -1;
            return sinalLanc === sinalEsperado;
          })
          .map((l) => {
            const valorL = Math.abs(Number(l.valor) || 0);
            const diffValor = Math.abs(valorL - valorMov);
            const ancL = dataAncoraLancamento(l);
            const diffDias = ancL ? Math.abs(diasEntre(m.data, ancL)) : 999;
            const fornN = normalizarTexto(l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null);
            const lancN = normalizarTexto(l.descricao);
            const similaridade = (movN && (
              (lancN && (movN.includes(lancN) || lancN.includes(movN))) ||
              (fornN && movN.includes(fornN))
            )) ? 1 : 0;
            return { lanc: l, diffValor, diffDias, similaridade };
          })
          // ordenar: menor diff de valor → menor diff de data → maior similaridade.
          .sort((a, b) => {
            if (a.diffValor !== b.diffValor) return a.diffValor - b.diffValor;
            if (a.diffDias !== b.diffDias) return a.diffDias - b.diffDias;
            return b.similaridade - a.similaridade;
          })
          .slice(0, 10)
          .map(({ lanc: l }) => montarCandidato(l, m.data, valorMov));

        const persistido = persistidoPorHash.get(m.hash) ?? null;
        const candidatoMatch = melhor ? montarCandidato(melhor, m.data, valorMov) : null;
        const baseFields: MovimentoPreview = {
          ...m,
          existeNoDB: persistido !== null,
          extratoIdExistente: persistido?.id ?? null,
          criadoEmExistente: persistido?.criadoEm ?? null,
          statusPersistido: persistido?.status ?? null,
          scoreMatch: melhorScore,
          // matchEncontrado=true quando há candidatos viáveis — inclui ambíguos
          // (existem candidatos, só não há vencedor único).
          matchEncontrado: melhorScore >= 50,
          lancamentoMatchId: melhor?.id ?? null,
          fornecedorMatch,
          descricaoMatch: melhor?.descricao ?? null,
          statusMatch: melhor?.status_transacao ?? null,
          matchAgrupado: false,
          quantidadeItensMatch: 0,
          valorSomado: 0,
          lancamentosIds: [],
          detalhesAgrupados: [],
          candidatosPossiveis,
          candidatoMatch,
          matchAmbiguo,
          candidatosAmbiguos,
        };

        // ── 2) tentativa de composição ──
        // Pula se já há match 1:1 forte (>85) — não vale a pena buscar grupo.
        // Pula se 1:1 já é razoável (>=50) — match direto vence agrupado por design.
        if (melhorScore < 50) {
          const sinalEsperado = m.tipo === 'credito' ? 1 : -1;
          const pool = lancs.filter((l) => {
            const ancL = dataAncoraLancamento(l);
            if (!ancL) return false;
            if (Math.abs(diasEntre(m.data, ancL)) > 10) return false;
            // Compatibilidade de sinal: positivo = entrada, negativo = saída
            const sinalLanc = (Number(l.sinal) || 0) >= 0 ? 1 : -1;
            return sinalLanc === sinalEsperado;
          });

          // Limita pool a 30 mais próximos da data para reduzir explosão DFS.
          const poolReduzido = pool
            .map((l) => {
              const ancL = dataAncoraLancamento(l);
              return { l, dist: ancL ? Math.abs(diasEntre(m.data, ancL)) : 999 };
            })
            .sort((a, b) => a.dist - b.dist)
            .slice(0, 30)
            .map((x) => x.l);

          const grupo = tryGroupingMatch(valorMov, poolReduzido, m.data, 8, 200);
          if (grupo && grupo.itens.length >= 2) {
            const scoreGrupo = calcularScoreAgrupado(m.data, m.descricao, grupo.itens, fornByLancId);
            if (scoreGrupo >= 50) {
              const detalhes: LancamentoAgrupadoInfo[] = grupo.itens
                .map((l) => ({
                  id: l.id,
                  data: dataAncoraLancamento(l),
                  fornecedor: l.favorecido_id ? fornMap.get(l.favorecido_id) ?? null : null,
                  descricao: l.descricao,
                  valor: (Number(l.valor) || 0) * ((Number(l.sinal) || 0) >= 0 ? 1 : -1),
                  macroCusto: l.macro_custo,
                  grupoCusto: l.grupo_custo,
                  centroCusto: l.centro_custo,
                  subcentro: l.subcentro,
                  statusTransacao: l.status_transacao,
                  numeroDocumento: l.numero_documento,
                  fazenda: l.fazenda_id ? fazendaMap.get(l.fazenda_id) ?? null : null,
                  contaBancaria: l.conta_bancaria_id ? contaMap.get(l.conta_bancaria_id) ?? null : null,
                }))
                .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? ''));
              return {
                ...baseFields,
                scoreMatch: scoreGrupo,
                matchEncontrado: true,
                lancamentoMatchId: null,
                fornecedorMatch: null,
                descricaoMatch: null,
                matchAgrupado: true,
                quantidadeItensMatch: grupo.itens.length,
                valorSomado: grupo.somaAbs,
                lancamentosIds: grupo.itens.map((x) => x.id),
                detalhesAgrupados: detalhes,
              };
            }
          }
        }

        return baseFields;
      });

      /* ── SUSPEITA DE DUPLICATA — a régua ÚNICA da importação ──────────────────────────
         PR-IMPORT-DUPLICATA-UNIFICA-01.

         ⚠ ELA SUBSTITUI A "PROVÁVEL REIMPORTAÇÃO" QUE SUBIU EM 17/09, e a substituição é o
         conserto de um erro meu: aquela régua exigia descrição IDÊNTICA, e esta compara por
         SEMELHANÇA (Jaccard ≥ 0,5 sobre as palavras) — ou seja, a de ontem era um caso
         particular desta (idêntica ⇒ Jaccard 1). E a diferença não é acadêmica: o movimento que
         escapou na Vera Ligia, "RESGATE CDB" contra "INT RESGATE CDB" já gravado, dá Jaccard
         0,667 e esta régua o pega; a de ontem não pegava. Duas colunas de selo para a mesma
         pergunta seria pior que uma.

         ⚠ O PAREAMENTO É NOSSO, E SEM ELE A RÉGUA ACUSA PAGAMENTO LEGÍTIMO. `classificarDuplicidadeOFX`
         compara um movimento contra a lista inteira e não CONSOME o candidato: com quatro PIX
         iguais gravados e CINCO no arquivo, os cinco seriam acusados — e o quinto é pagamento
         novo, não repetição. Medido no proto: 65 grupos de mesma conta+data+valor+descrição têm
         2+ linhas vivas (154 movimentos, o maior grupo com 5). Por isso cada candidato só pode
         ser reivindicado UMA vez, e o excedente continua novo.

         ⚠ E A ORDEM DAS DUAS PASSADAS IMPORTA: o FORTE (documento/FITID igual) é a certeza, o
         PROVÁVEL é a semelhança. Numa passada só, em ordem de arquivo, um movimento apenas
         parecido poderia consumir o candidato que era do par EXATO, e o exato cairia para
         "novo". Primeiro casam os FORTES, depois o resto disputa o que sobrou. */
      const dupDisponiveis = new Map(candidatosDup.map((c) => [c.id, c]));
      /* Quem já casou por HASH também já reivindicou a sua linha: deixá-la na urna faria a
         mesma linha viva ser usada duas vezes. */
      for (const m of movimentos) {
        if (m.existeNoDB && m.extratoIdExistente) dupDisponiveis.delete(m.extratoIdExistente);
      }
      const classificarComConsumo = (m: MovimentoPreview, soForte: boolean) => {
        if (m.existeNoDB || m.dupClassificacao) return;
        const dup = classificarDuplicidadeOFX(
          { contaBancariaId: params.contaBancariaId, dataMovimento: m.data, valor: m.valor, documento: m.documento, descricao: m.descricao },
          [...dupDisponiveis.values()],
        );
        if (!dup) return;
        if (soForte && dup.classificacao !== 'FORTE') return;
        const existente = dupDisponiveis.get(dup.registroExistenteId);
        dupDisponiveis.delete(dup.registroExistenteId);
        m.dupClassificacao = dup.classificacao;
        m.dupExistenteId = dup.registroExistenteId;
        m.dupResumo = dup.resumo;
        /* ⚠ O PADRÃO DO PROVÁVEL MUDOU PARA "NÃO IMPORTA" — decisão do Gabriel, e a razão é a
           mesma de sempre: DUPLICAR É PIOR QUE FALTAR. A duplicata suja saldo e conciliação e
           só aparece depois; o que falta o operador vê na hora e reimporta. A lib devolve
           `dupImportar: true` no PROVÁVEL (o default da FASE 1A, quando isto era só detecção
           sem tela); aqui ele é sobrescrito, porque agora existe tela para decidir.
           ⚠ COINCIDÊNCIA CONTINUA ENTRANDO: ela é só "mesmo dia e mesmo valor, texto e
           documento diferentes", que na pecuária é rotina — dois pagamentos de igual valor no
           mesmo dia acontecem toda semana. Bloqueá-la por padrão faria o operador desmarcar
           dezenas de linhas verdadeiras para importar um mês. */
        m.dupImportar = dup.classificacao === 'COINCIDENCIA_POSSIVEL';
        m.dupExistenteDescricao = existente?.descricao ?? null;
        m.dupExistenteDocumento = existente?.documento ?? null;
      };
      for (const m of movimentos) classificarComConsumo(m, true);
      for (const m of movimentos) classificarComConsumo(m, false);

      // PR-OFX-DEDUP-01 (1B) — seq de ocorrência em ORDEM FÍSICA do arquivo (movimentos
      // preserva a ordem de parseOFX → .map; índice do array = sequência do STMTTRN) +
      // dedupe determinístico por chave natural contra os VIVOS do banco (pega a renumeração
      // do FITID que o hash não pega). Camadas hash e FASE 1A permanecem intactas.
      const seqPorChave = new Map<string, number>();
      for (const m of movimentos) {
        const kSemSeq = `${m.data}|${m.valor}|${chaveDocOFX(m.documento)}`;
        const seq = (seqPorChave.get(kSemSeq) ?? 0) + 1;
        seqPorChave.set(kSemSeq, seq);
        m.seqOcorrencia = seq;
        m.jaExistenteChave = chavesVivasNoBanco.has(`${kSemSeq}|${seq}`);
      }

      /* ⚠ A CONSULTA A MAIS QUE O PR-IMPORT-REIMPORTACAO-01 TROUXE SAIU JUNTO COM A RÉGUA DELE:
         a suspeita por semelhança usa `candidatosDup`, que a prévia já buscava antes de tudo
         isto. Uma varredura a menos por importação. */
      const result: PreviewResult = {
        movimentos,
        totalLinhas: movimentos.length,
        ...recomputarAgregados(movimentos),
        linhasInformativas, // BUG-CSV-PARSE-VALOR-01 — datadas sem valor, puladas
        formato,
        saldoDeclarado,
        saldoDeclaradoData,
        periodoDeclaradoInicio,
        periodoDeclaradoFim,
        linhasSaldo,
        conferenciaSaldo: conferirSaldoDoExtrato(linhasSaldo, saldoDeclarado),
      };
      setPreview(result);
      return result;
    } catch (e: any) {
      // O layout de CSV é validação legítima, mas o texto do parser carrega
      // conteúdo do arquivo — troca-se por orientação autoral equivalente.
      const seguro = ehErroDeLayoutCsv(e) ? new ErroUsuarioSeguro(MSG_CSV_LAYOUT) : e;
      // `error` é RENDERIZADO na tela (ExtratoImportPreview) — nunca a mensagem
      // crua. Antes: `setError(e?.message ?? String(e))`, que exibia texto do
      // PostgREST e do parser direto no painel.
      setError(normalizarErro(seguro, 'gerarPreview').mensagem);
      throw seguro;
    } finally {
      setLoading(false);
    }
  }

  async function confirmarImportacao(params: ConfirmarParams): Promise<ResultadoImportacao> {
    // Invariante de programação, não erro de operador: segue Error comum e
    // chega à tela como mensagem genérica — é bug nosso, não ação do usuário.
    if (!preview) throw new Error('Sem preview gerado — chame gerarPreview primeiro');
    if (!clienteAtual?.id) throw new ErroUsuarioSeguro('Cliente não selecionado');

    // PR-FIX-OFX-IMPORT-ID — extrato bancário NÃO TEM FAZENDA, e o cabeçalho de
    // importação registra isso gravando fazenda_id NULL SEMPRE, inclusive quando há
    // fazenda selecionada na tela. A conta bancária pertence ao cliente, e
    // extrato_bancario_v2 não tem coluna fazenda_id: preencher a fazenda aqui seria
    // informação decorativa, e abriria a porta para o MESMO extrato ser importado
    // duas vezes em fazendas diferentes e tratado como coisas distintas.
    // O fluxo Excel de lançamentos (useFinanceiro.ts) não muda — lá a fazenda é real.
    //
    // Até aqui o header só nascia com fazenda específica, e o comentário anterior dava
    // a razão: "financeiro_importacoes_v2 ainda exige fazenda_id NOT NULL". A premissa
    // era falsa no banco — a coluna é nullable no proto — e verdadeira só no repo, que
    // nunca versionou o DROP NOT NULL. O resultado foi importacao_id NULL em 3.638 de
    // 3.638 linhas de extrato: nenhum lote rastreável, nunca.

    // P0-OFX-DUP-GUARD / FASE 1B — SKIP controlado: pula APENAS o que o operador
    // (ou o default da régua) marcou explicitamente p/ pular (dupImportar===false).
    // undefined (sem suspeita) e true (importar) entram como antes -> sem suspeitas,
    // o conjunto é byte-idêntico ao comportamento pré-1B. "Importar tudo" do alerta
    // passa forcarImportarSuspeitas=true (ignora o skip).
    const novos = preview.movimentos.filter(
      // PR-OFX-DEDUP-01 (1B): jaExistenteChave é dedupe DETERMINÍSTICO (chave natural viva no
      // banco) → sempre pula, mesmo com forcarImportarSuspeitas (reinserir violaria o UNIQUE).
      /* ⚠ UMA REGRA SÓ PARA A SUSPEITA — PR-IMPORT-DUPLICATA-UNIFICA-01: `dupImportar === false`
         não entra, e é a MESMA condição que o contador e o selo usam. Havia duas (a suspeita por
         semelhança e a "provável reimportação"), com padrões diferentes, decidindo a mesma coisa. */
      (m) => !m.existeNoDB && !m.jaExistenteChave
        && (params.forcarImportarSuspeitas || m.dupImportar !== false),
    );
    // BUG-CSV-DEDUP-01 (UX): tudo já existe → mensagem clara, nunca erro SQL.
    if (novos.length === 0) throw new ErroUsuarioSeguro('Extrato já importado anteriormente. Nenhuma movimentação nova foi encontrada.');

    setLoading(true);
    setError(null);
    try {
      /* ⚠ A GRAVAÇÃO É DO BANCO — PR-CONC-IMPORT-BANCO-01B. `fn_extrato_importar_arquivo` grava o cabeçalho e os
         movimentos numa transação só: ou entram juntos, ou nada fica (antes o cabeçalho ia num pedido e os movimentos em
         outro, e a falha deixava cabeçalho 'processada' vazio — 4 no Agnaldo em 03/10). Ela confere a conta do cliente e
         PULA, com o motivo, o que já existe vivo pelos DOIS índices únicos (hash e chave natural) — nunca erro.
         ⚠ O COMENTÁRIO QUE MORAVA AQUI ESTAVA ERRADO: dizia que, sem `onConflict`, o PostgREST emitia `ON CONFLICT DO
         NOTHING` sem alvo. Medido em `pg_stat_statements` (03/10): ele emite `ON CONFLICT("id") DO NOTHING` — o alvo é a
         CHAVE PRIMÁRIA —, então o `ignoreDuplicates` nunca cobriu hash nem chave natural, e dois movimentos idênticos no
         mesmo arquivo estouravam 23505 em `idx_extrato_v2_hash_unico`, traduzido como "já importado".
         ⚠ FAZENDA NULA, como sempre (PR-FIX-OFX-IMPORT-ID): extrato bancário não tem fazenda — quem grava é a RPC. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error: eRpc } = await (supabase as any).rpc('fn_extrato_importar_arquivo', {
        p_cliente_id: clienteAtual.id,
        p_conta_bancaria_id: params.contaBancariaId,
        p_nome_arquivo: params.nomeArquivo,
        p_tipo_arquivo: params.formato,
        p_total_linhas: preview.totalLinhas,
        p_total_com_erro: preview.existentesNoBanco,
        /* PR-IMPORTAR-SALDO-OFX-01 — o saldo que o ARQUIVO declara (LEDGERBAL/DTASOF): conferência, nunca 0 no lugar de nulo. */
        p_saldo_declarado: preview.saldoDeclarado,
        p_saldo_declarado_data: preview.saldoDeclaradoData,
        p_movimentos: novos.map((m) => ({
          data: m.data, descricao: m.descricao, documento: m.documento, valor: m.valor, tipo: m.tipo,
          hash: m.hash, seq: m.seqOcorrencia ?? 1,   // PR-OFX-DEDUP-01 (1B)
        })),
      });
      if (eRpc) throw eRpc;
      const r = lerRetornoImportacao(data);
      /* Recusa escrita pelo BANCO (conta de outro cliente, conta inexistente): a frase é dele, autoral, chega inteira. */
      if (!r.ok) throw new ErroUsuarioSeguro(r.frase ?? 'Não foi possível gravar o extrato. Nada foi gravado.');

      const idsPorHash = new Map<string, string>(r.ids.map((x) => [x.hash, x.id]));
      /* CONC-SEM-F5-01 — gravou com a Conciliação montada: avisa o canal de lançamentos, e o dono relê sem F5. */
      notificarLancamentosMudaram(clienteAtual.id);
      // Atualiza o preview em memória: cada movimento novo passa a ter
      // existeNoDB=true, statusPersistido='nao_conciliado' e o id do
      // registro recém-criado. Permite ações imediatamente após salvar.
      setPreview((prev) => {
        if (!prev) return prev;
        const movs: MovimentoPreview[] = prev.movimentos.map((m) => {
          if (m.existeNoDB) return m;
          const novoId = idsPorHash.get(m.hash) ?? null;
          if (!novoId) return m;
          return {
            ...m,
            existeNoDB: true,
            extratoIdExistente: novoId,
            statusPersistido: 'nao_conciliado' as const,
          };
        });
        return {
          ...prev,
          movimentos: movs,
          ...recomputarAgregados(movs),
        };
      });

      /* "Já existiam" = o que a prévia já sabia que existia + o que o banco pulou. O que o operador desmarcou não entra:
         não é "já existia", é escolha dele. */
      const jaExistiam = preview.movimentos.filter((m) => m.existeNoDB || m.jaExistenteChave).length + r.pulados;
      return {
        inseridos: r.inseridos,
        importacaoId: r.importacaoId,
        jaExistiam,
        mensagem: textoDoResultadoDaImportacao(r.inseridos, jaExistiam),
      };
    } catch (e: unknown) {
      /* Recusa autoral passa inteira; o resto (rede, permissão, erro inesperado) é generalizado pela categoria, e como a
         gravação é UMA transação, a frase pode afirmar o que é verdade: nada foi gravado. */
      const seguro = e instanceof ErroUsuarioSeguro
        ? e
        : new ErroUsuarioSeguro(`Não foi possível gravar o extrato (${normalizarErro(e, 'confirmarImportacao').mensagem.replace(/\.$/, '')}). Nada foi gravado — tente de novo.`);
      setError(seguro.message);
      throw seguro;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPreview(null);
    setError(null);
  }

  /**
   * Re-consulta extrato_bancario_v2 para os hashes do preview atual e
   * atualiza existeNoDB / extratoIdExistente / statusPersistido + agregados.
   *
   * Disparado após cada baixa/vínculo individual para que os contadores
   * (pendentes / parciais / conciliados) reflitam o estado real do DB.
   */
  async function refreshStatusPersistidos(): Promise<void> {
    if (!preview || !clienteAtual?.id) return;
    const hashes = preview.movimentos.map((m) => m.hash);
    if (hashes.length === 0) return;

    // BUG-CSV-DEDUP-01: mesma paginação obrigatória (PostgREST corta em ~1000) para os
    // contadores refletirem TODOS os hashes existentes, não só os 1000 primeiros.
    /* ⚠ A CONTA VEM DO REF, não de uma prop: este refresh roda depois da prévia, e a conta
       dela é a que vale. Sem conta não há o que refrescar — a mesma pergunta precisa do
       mesmo recorte nos dois chamadores. */
    const contaDaPrevia = contaDoPreviewRef.current;
    if (!contaDaPrevia) return;
    let persistidoPorHash: Map<string, { id: string; status: StatusPersistido; criadoEm: string | null }>;
    try {
      persistidoPorHash = await buscarPersistidosPorHash(clienteAtual.id, contaDaPrevia, hashes);
    } catch (e) {
      console.error(normalizarErro(e, 'refreshStatusPersistidos').diagnostico);
      return;
    }

    setPreview((prev) => {
      if (!prev) return prev;
      const movs: MovimentoPreview[] = prev.movimentos.map((m) => {
        const persistido = persistidoPorHash.get(m.hash) ?? null;
        return {
          ...m,
          existeNoDB: persistido !== null,
          extratoIdExistente: persistido?.id ?? null,
          criadoEmExistente: persistido?.criadoEm ?? null,
          statusPersistido: persistido?.status ?? null,
        };
      });
      return {
        ...prev,
        movimentos: movs,
        ...recomputarAgregados(movs),
      };
    });
  }

  // ── P0-OFX-DUP-GUARD / FASE 1B — decisão importar/pular das suspeitas ──
  /** Inverte a decisão de uma suspeita (toggle Importar/Pular por linha). */
  function toggleImportarSuspeita(hash: string): void {
    setPreview((prev) => {
      if (!prev) return prev;
      const movs = prev.movimentos.map((m) =>
        m.hash === hash && m.dupClassificacao ? { ...m, dupImportar: !m.dupImportar } : m,
      );
      return { ...prev, movimentos: movs, ...recomputarAgregados(movs) };
    });
  }
  /** "Marcar todas" do cabeçalho: todas as suspeitas passam a entrar (ou a ficar de fora). */
  function marcarTodasSuspeitas(importar: boolean): void {
    setPreview((prev) => {
      if (!prev) return prev;
      const movs = prev.movimentos.map((m) =>
        m.dupClassificacao ? { ...m, dupImportar: importar } : m,
      );
      return { ...prev, movimentos: movs, ...recomputarAgregados(movs) };
    });
  }

  /**
   * PR-CONC-OFX-LINHA-SALDO-01 — TODA LINHA IMPORTÁVEL TEM CAIXA. O "novo" nascia sem caixa, e o operador não tinha
   * como impedir uma linha de entrar (foi como o saldo do Itaú entrou). A marca é o mesmo `dupImportar` que a suspeita
   * já usava — `false` = fica de fora; qualquer outro valor = entra —, então a contagem do botão e o que se grava
   * seguem a regra única de `recomputarAgregados`/`confirmarImportacao`, sem segunda régua.
   */
  const importavel = (m: MovimentoPreview) => !m.existeNoDB && !m.jaExistenteChave;
  function toggleImportar(hash: string): void {
    setPreview((prev) => {
      if (!prev) return prev;
      const movs = prev.movimentos.map((m) =>
        m.hash === hash && importavel(m) ? { ...m, dupImportar: m.dupImportar === false } : m,
      );
      return { ...prev, movimentos: movs, ...recomputarAgregados(movs) };
    });
  }
  /** "Marcar todas" do cabeçalho: toda linha importável entra (ou fica de fora). */
  function marcarTodasImportaveis(importar: boolean): void {
    setPreview((prev) => {
      if (!prev) return prev;
      const movs = prev.movimentos.map((m) => (importavel(m) ? { ...m, dupImportar: importar } : m));
      return { ...prev, movimentos: movs, ...recomputarAgregados(movs) };
    });
  }

  return {
    preview,
    loading,
    error,
    gerarPreview,
    confirmarImportacao,
    refreshStatusPersistidos,
    reset,
    toggleImportarSuspeita,
    marcarTodasSuspeitas,
    toggleImportar,
    marcarTodasImportaveis,
  };
}
