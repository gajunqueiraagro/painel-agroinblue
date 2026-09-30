/**
 * A tabela de campos da Mesa de Revisão — MESA-ENR-UX-01 (129); painel v1 no PR-CONC-MESA-PAINEL-V1.
 *
 * Quatro colunas: Campo · Planilha (azul, referência) · Sistema hoje · Vai gravar (texto neutro). Quatro grupos
 * separados por faixa: DO EXTRATO (Tipo, Data pgto., Valor, Conta bancária — só leitura, no topo), DATAS,
 * CLASSIFICAÇÃO (Atividade, Fazenda, Conta do plano, Safra) e IDENTIFICAÇÃO (produto, fornecedor, tipo e nº do
 * documento, forma de pagamento, observação).
 *
 * ⚠ TODO CAMPO EDITÁVEL GRAVA: o `fn_classificacao_apply_row` escreve cada um deles (tipo de documento e forma de
 *   pagamento desde a migration 20261027184600). Um campo editável cujo valor some no Salvar é o silêncio mais caro
 *   que esta tela pode produzir — quem acrescentar campo aqui confere o gravador antes.
 * ⚠ O ÚNICO VERDE É O VALOR DE UMA ENTRADA (item 1). Âmbar = "vai mudar"; azul = a planilha; vermelho = pendente.
 *
 * ⚠ ESTE COMPONENTE NÃO SUBSTITUI `EnriquecimentoDetalhe`. Aquele é a aba, que segue
 * intacta; este é a superfície ampla. Unificar os dois agora obrigaria a aba a herdar a
 * ordem nova sem homologação.
 */
import type { EnriqRowVM, EnriqComparativoLinha } from './types';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { ResultadoSubcentroEditor } from './ResultadoSubcentroEditor';
import { ResultadoFavorecidoEditor } from './ResultadoFavorecidoEditor';
import { ResultadoFazendaEditor } from './ResultadoFazendaEditor';
import { ResultadoProdutoEditor } from './ResultadoProdutoEditor';
import { ResultadoDocumentoEditor } from './ResultadoDocumentoEditor';
import {
  ResultadoDataEditor, ResultadoSafraEditor, ResultadoObservacaoEditor, ResultadoContaDestinoEditor,
} from './ResultadoCamposGravaveis';
import { ResultadoListaEditor, ResultadoAtividadeEditor } from './ResultadoListaEditor';
import { TIPOS_DOCUMENTO } from '@/lib/financeiro/documentoHelper';
import { FORMAS_PAGAMENTO_V2 } from '@/lib/financeiro/formasPagamentoV2';
import { ATIVIDADES } from '@/lib/financeiro/ultimaAtividade';
import { atividadeDoSubcentro, planoIncoerente, rotuloAtividade } from '@/v2/lib/mesa/atividadeDaLinha';
import { ehTipoTransferencia, subcentroDeTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { ehLinhaAdministrativa, escopoDoSubcentro, fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';
import type { ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { Safra } from '@/hooks/useFinanceiroV2';

/** Por que a conta do plano está travada numa transferência — PR-MESA-TRANSF-01 item 3. */
const MOTIVO_TRANSFERENCIA =
  'transferência entre contas usa esta conta do plano e nenhuma outra (fora da DRE); '
  + 'o tipo muda pelo passo "Transferências entre contas"';

/** A conta do plano é de outra atividade — PR-CONC-MESA-PAINEL-V1 item 3. */
const MOTIVO_PLANO_INCOERENTE = 'a conta do plano é de outra atividade — escolha uma conta da atividade acima';

/**
 * O que o EXTRATO diz — PR-CONC-MESA-PAINEL-V1 item 2: Tipo, Data pgto., Valor e Conta bancária, no TOPO, numa caixa
 * tracejada "do extrato", SÓ LEITURA.
 *
 * ⚠ É O MOVIMENTO DO BANCO, e a Mesa classifica, não reescreve o banco. A `fn_classificacao_apply_row` já ignorava a
 *   data de pagamento e a conta do proposto em linha conciliada (133h item 12); o que mudou é que a Mesa deixou de
 *   oferecê-las em qualquer linha. O TIPO entra aqui pela mesma razão: a transferência tem passo próprio
 *   ("Transferências entre contas", PR-CONC-TRANSFERENCIAS-01), que fecha as duas pontas.
 */
type Grupo = 'extrato' | 'datas' | 'classificacao' | 'identificacao';

/**
 * A ordem do mock (artifact VKVkcrkN9T2J9wARLk4738), com o grupo de cada linha.
 *
 * `campo` casa com `EnriqComparativoLinha.campo` produzido pelo adapter. Quando o comparativo não traz a linha, ela
 * aparece assim mesmo, com "—": esconder faria a tela mentir por omissão sobre um campo que o operador procura.
 * ⚠ SITUAÇÃO SAIU (item 2): é estado do lançamento, não campo que a Mesa decide, e ocupava uma linha do painel.
 */
const ORDEM: Array<{
  campo: string; rotulo: string; grupo: Grupo;
  /**
   * A linha só existe quando o Resultado é transferência — PR-MESA-TRANSF-01.
   * ⚠ NÃO É ESCONDER DADO, É NÃO INVENTAR CAMPO: uma saída não tem conta de destino.
   */
  soTransferencia?: boolean;
  /** Obrigatório SÓ na transferência — o guard do banco recusa sem ele. */
  obrigatorioSeTransferencia?: boolean;
  /** 133g item 6 — sem ele o lançamento não fecha, e o Salvar diz qual falta. */
  obrigatorio?: boolean;
}> = [
  { campo: 'Tipo', rotulo: 'Tipo', grupo: 'extrato', obrigatorio: true },
  { campo: 'Data pagamento', rotulo: 'Data pgto.', grupo: 'extrato', obrigatorio: true },
  { campo: 'Valor', rotulo: 'Valor', grupo: 'extrato', obrigatorio: true },
  { campo: 'Banco', rotulo: 'Conta bancária', grupo: 'extrato', obrigatorio: true },
  { campo: 'Conta destino', rotulo: 'Conta destino', grupo: 'extrato',
    soTransferencia: true, obrigatorioSeTransferencia: true },
  { campo: 'Competência', rotulo: 'Competência', grupo: 'datas' },
  { campo: 'Data vencimento', rotulo: 'Data venc.', grupo: 'datas' },
  { campo: 'Atividade', rotulo: 'Atividade', grupo: 'classificacao', obrigatorio: true },
  { campo: 'Fazenda', rotulo: 'Fazenda', grupo: 'classificacao', obrigatorio: true },
  { campo: 'Subcentro', rotulo: 'Conta do plano', grupo: 'classificacao', obrigatorio: true },
  { campo: 'Safra', rotulo: 'Safra', grupo: 'classificacao' },
  { campo: 'Produto / Descrição', rotulo: 'Produto / descr.', grupo: 'identificacao', obrigatorio: true },
  { campo: 'Fornecedor', rotulo: 'Fornecedor', grupo: 'identificacao' },
  { campo: 'Tipo de documento', rotulo: 'Tipo de documento', grupo: 'identificacao' },
  { campo: 'Documento', rotulo: 'Nº documento', grupo: 'identificacao' },
  { campo: 'Forma de pagamento', rotulo: 'Forma de pagamento', grupo: 'identificacao' },
  { campo: 'OBS', rotulo: 'Observação', grupo: 'identificacao' },
];

/** O grupo do extrato é só leitura — exportado para o teste afirmar a lista, não uma cópia dela. */
export const CAMPOS_DO_EXTRATO = ORDEM.filter((o) => o.grupo === 'extrato' && !o.soTransferencia).map((o) => o.rotulo);

/** Os campos que o Salvar exige — exportado porque o container monta o motivo com eles. */
export const CAMPOS_OBRIGATORIOS_MESA = ORDEM.filter((o) => o.obrigatorio).map((o) => o.rotulo);

/**
 * Os que só são obrigatórios na transferência — PR-MESA-TRANSF-01.
 * ⚠ LISTA SEPARADA: a conta de destino não existe numa saída. Sai da MESMA `ORDEM` que desenha o asterisco.
 */
export const CAMPOS_OBRIGATORIOS_SE_TRANSFERENCIA =
  ORDEM.filter((o) => o.obrigatorioSeTransferencia).map((o) => o.rotulo);

const VAZIA: EnriqComparativoLinha = { campo: '', sistema: '—', excel: '—', resultado: '—', tom: 'neutro' };

/**
 * O selo da regra da linha — PR-CONC-MESA-PAINEL-V1 item 6, no rodapé da Mesa, antes do Salvar.
 * ⚠ NO CRU A PLANILHA PREVALECE (a precedência do banco a levou ao Resultado); no classificado, o sistema. Sem
 *   lançamento (`null`) não há regra, e não há selo. Rótulo auxiliar a 8,5px (a exceção de selo).
 */
export function SeloRegraDaLinha({ ehCru }: { ehCru: boolean | null }) {
  if (ehCru === null) return null;
  return (
    <span data-testid="selo-regra"
      className="shrink-0 whitespace-nowrap rounded bg-primary/10 px-1.5 py-px text-[8.5px] text-primary">
      {ehCru ? 'cru · planilha prevalece' : 'classificado · sistema prevalece'}
    </span>
  );
}

export interface MesaCamposTabelaProps {
  row: EnriqRowVM;
  classificacoes?: ClassificacaoItem[];
  fornecedores?: FornecedorV2[];
  fazendas?: Fazenda[];
  clienteId?: string;
  /** 129c — as listas dos campos que gravam. */
  safras?: Safra[];
  contas?: ContaSelecionavel[];
  onEditar?: (patch: Record<string, unknown>) => Promise<void>;
  onCriarFornecedor?: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  /**
   * 133h item 12 — o lançamento desta linha tem vínculo ATIVO com o extrato. Só muda o MOTIVO escrito no grupo do
   * extrato; a leitura vale para toda linha desde o PR-CONC-MESA-PAINEL-V1.
   */
  conciliado?: boolean;
  /**
   * A ATIVIDADE escolhida nesta linha — PR-CONC-MESA-PAINEL-V1 item 3. `null`/ausente = a proposta (escopo da conta
   * resolvida). O estado mora na aba, por linha: não é campo do banco, é o filtro da conta do plano.
   */
  atividade?: string | null;
  onAtividade?: (atividade: string) => void;
}

export function MesaCamposTabela({
  row, classificacoes, fornecedores, fazendas, clienteId, safras, contas, onEditar, onCriarFornecedor,
  conciliado, atividade, onAtividade,
}: MesaCamposTabelaProps) {
  const porCampo = new Map(row.comparativo.map(c => [c.campo, c]));
  /* ⚠ AS TRÊS COLUNAS DE CONTEÚDO EM `minmax(0,…)` — 133e item D: sem o `0`, o `truncate` não tem em relação a quê
     truncar. "Vai gravar" um pouco mais larga: é onde moram os controles. */
  const COLS = '116px minmax(0,1fr) minmax(0,1fr) minmax(0,1.15fr)';
  /* ⚠ O RESULTADO MANDA, NÃO O LANÇAMENTO — PR-MESA-TRANSF-01. */
  const ehTransf = ehTipoTransferencia(row.edicao.tipoOperacao);
  const subcentroTransferencia = subcentroDeTransferencia(classificacoes);
  /* ⚠ O SUBCENTRO EFETIVO É O PROPOSTO OU O ATUAL, nessa ordem: é o que a linha vai gravar. */
  const subcentroEfetivoResultado = row.edicao.subcentro ?? row.edicao.subcentroAtual ?? null;
  const contaEhAdministrativa = ehLinhaAdministrativa(classificacoes, subcentroEfetivoResultado, row.edicao.macro);
  /**
   * PLANO × FAZENDA — PR-CONC-MESA-DIVERGENCIA-EXCEL-01 item d. AVISA, não trava.
   */
  const escopoResultado = escopoDoSubcentro(classificacoes, subcentroEfetivoResultado);
  const fazendaResultadoId = row.edicao.fazendaId ?? row.edicao.fazendaIdAtual;
  const admId = fazendaAdministrativa(fazendas)?.id ?? null;
  const avisoPlanoFazenda = (escopoResultado === 'pecuaria' || escopoResultado === 'agricultura')
    && !!admId && fazendaResultadoId === admId
    ? `conta do plano de ${escopoResultado === 'pecuaria' ? 'pecuária' : 'agricultura'} na fazenda Administrativo — o rateio do DRE sai errado`
    : null;
  /* ── ATIVIDADE — item 3 ─────────────────────────────────────────────────────────────────────────────────────────
     ⚠ A ESCOLHIDA, SENÃO A PROPOSTA. E a conta do plano de outra atividade vira PENDENTE: o Salvar não grava plano
       incoerente (a aba cobra pelo mesmo `planoIncoerente`). */
  const atividadeEfetiva = atividade ?? row.edicao.atividadeProposta;
  const atividadeSistema = atividadeDoSubcentro(classificacoes, row.edicao.subcentroAtual);
  const incoerente = planoIncoerente(classificacoes, subcentroEfetivoResultado, atividadeEfetiva);
  /* ⚠ VALOR SEGUE O SINAL EM TODAS AS COLUNAS (item 1) — e é o ÚNICO verde da tabela: entrada. */
  const corDoSinal = row.entradaOuSaida === 'saida' ? 'text-red-600 dark:text-red-400'
    : row.entradaOuSaida === 'entrada' ? 'text-emerald-700 dark:text-emerald-400' : '';
  /* ⚠ FILTRA ANTES DE MAPEAR: a faixa de grupo se decide pela POSIÇÃO da linha. */
  const linhas = ORDEM.filter((o) => !o.soTransferencia || ehTransf);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* ⚠ O CABEÇALHO DAS COLUNAS É STICKY DENTRO DESTE SCROLLPORT — A21.
          ⚠ "VAI GRAVAR" EM TEXTO NEUTRO (item 1): o verde do título e dos valores lia-se como "está certo", e o que a
          coluna diz é só o que o Salvar escreve. A planilha segue azul — é a voz dela, nunca gravada direto. */}
      <div className="sticky top-0 z-10 grid gap-2 border-b bg-card px-3 py-1 text-[9.5px] font-medium"
        style={{ gridTemplateColumns: COLS }}>
        <span className="text-muted-foreground">Campo</span>
        <span className="text-blue-600 dark:text-blue-400">Planilha</span>
        <span className="text-muted-foreground">Sistema hoje</span>
        <span className="text-foreground" data-testid="cabecalho-vai-gravar">Vai gravar</span>
      </div>

      {linhas.map(({ campo, rotulo, grupo, obrigatorio, obrigatorioSeTransferencia }, indice) => {
        const zebra = indice % 2 === 1;
        const c = porCampo.get(campo) ?? VAZIA;
        const vaiMudar = c.tom === 'muda' || c.tom === 'difere';
        const doExtrato = grupo === 'extrato' && campo !== 'Conta destino';
        /* ⚠ EM TRANSFERÊNCIA A CONTA DO PLANO É UMA SÓ — PR-MESA-TRANSF-01 item 3 (a 18010, fora da DRE). */
        const travadoPorTransferencia = ehTransf && campo === 'Subcentro' && !!subcentroTransferencia;
        const editavel = !row.aplicado && !!onEditar && !doExtrato && !travadoPorTransferencia;
        /* ⚠ DIVERGÊNCIA COM O EXTRATO É INFORMAÇÃO, NUNCA GRAVAÇÃO — a lista vem do adapter (133h-b item 4). */
        const dv = row.divergenciasBanco.find((d) => d.campo === campo);
        const divergeDoBanco = doExtrato && !!dv;
        const valorDeParte = campo === 'Valor' && row.parteDeAgrupamento;
        const abreGrupo = indice > 0 && linhas[indice - 1]?.grupo !== grupo;
        /* PR-CONC-MESA-DIVERGENCIA-EXCEL-01 — a planilha discorda do Resultado. */
        const dp = row.divergenciasPlanilha.find((d) => d.campo === campo);
        const divergePlanilha = !!dp && !divergeDoBanco;
        const avisoCoerencia = campo === 'Fazenda' ? avisoPlanoFazenda : null;
        const planoPendente = campo === 'Subcentro' && incoerente;
        const exigido = !!obrigatorio || (!!obrigatorioSeTransferencia && ehTransf);
        /* 133g item 6 — vazio no RESULTADO é o que importa. A Atividade só se cobra com o catálogo na mão. */
        const faltando = campo === 'Atividade'
          ? !!classificacoes && !atividadeEfetiva
          : exigido && (c.resultado === '—' || c.resultado.trim() === '');
        const corValor = campo === 'Valor' ? corDoSinal : '';
        /* No extrato, o que vale é o que o banco tem; o Tipo proposto (18010 escolhida) é o que vai gravar. */
        const valorExtrato = campo === 'Tipo' && row.edicao.tipoOperacaoProposto ? c.resultado : c.sistema;

        return (
          <div key={rotulo}>
            {/* ⚠ 6px DE FAIXA, SEM TÍTULO — os grupos (extrato · datas · classificação · identificação) se separam
                sem gastar altura. */}
            {abreGrupo && <div className="h-1.5 bg-muted" />}
            {/* ⚠ 22px EXATOS, NUNCA QUEBRA — `truncate` em cada célula e o texto inteiro no `title`. */}
            <div className={`grid h-[22px] items-center gap-2 border-b border-border/50 px-3 text-[10.5px] leading-[1.3] ${
              zebra ? 'bg-muted/30' : ''}`}
              style={{ gridTemplateColumns: COLS }}>
              <span className="truncate text-muted-foreground" title={rotulo}>
                {rotulo}
                {exigido && <span className="text-red-600 dark:text-red-400"> *</span>}
              </span>
              <span className={`truncate ${corValor || 'text-blue-700/90 dark:text-blue-400'}`} title={c.excel}>{c.excel}</span>
              <span className={`truncate ${corValor || 'text-slate-700 dark:text-slate-300'}`} title={c.sistema}>{c.sistema}</span>
              <div className="min-w-0">
                {doExtrato ? (
                  /* ⚠ CAIXA TRACEJADA "do extrato" — item 2: só leitura, e com cara de leitura. */
                  <span data-testid={`extrato-${rotulo}`}
                    title={faltando ? 'Obrigatório — o Salvar não grava sem ele.'
                      : divergeDoBanco ? `${valorExtrato} — o extrato manda${conciliado ? ' (conciliado)' : ''}. A planilha diz "${dv?.planilha}", e isso NÃO será gravado.`
                      : `${valorExtrato} — do extrato, só leitura`}
                    className={`flex h-5 items-center gap-1.5 rounded border border-dashed px-1.5 ${
                      faltando ? 'border-destructive/60 bg-destructive/5 text-destructive'
                        : valorDeParte ? 'border-violet-300 bg-violet-50/60 text-violet-800 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-200'
                        : 'border-border bg-muted/60'}`}>
                    <span className={`min-w-0 flex-1 truncate ${campo === 'Valor' ? 'tabular-nums' : ''} ${corValor}`}>
                      {faltando ? 'obrigatório' : valorExtrato}
                    </span>
                    {divergeDoBanco && <span className="shrink-0 text-[9px] text-amber-700" aria-hidden title="Difere do extrato">⚠</span>}
                    <span className="shrink-0 whitespace-nowrap text-[8.5px] text-muted-foreground">do extrato</span>
                  </span>
                ) : editavel && campo === 'Atividade' && classificacoes && onAtividade ? (
                  <ResultadoAtividadeEditor value={atividadeEfetiva} valorAtual={atividadeSistema}
                    opcoes={ATIVIDADES} onEscolher={onAtividade} />
                ) : editavel && campo === 'Subcentro' && classificacoes ? (
                  <div className={`flex min-w-0 items-center gap-1 ${planoPendente ? 'rounded ring-1 ring-destructive/70' : ''}`}
                    data-testid={planoPendente ? 'plano-pendente' : undefined}>
                    <div className="min-w-0 flex-1">
                      <ResultadoSubcentroEditor value={row.edicao.subcentro} tipoOperacao={row.edicao.tipoOperacao}
                        classificacoes={classificacoes} onEditar={onEditar}
                        subcentroTransferencia={subcentroTransferencia}
                        contaDestinoSugeridaId={row.edicao.contaDestinoSugeridaId}
                        escopoNegocio={atividadeEfetiva} />
                    </div>
                    {/* ⚠ "Sugerido por" VIROU O "?" (item 5): a mesma frase, no tooltip, ao lado do campo a que se refere. */}
                    <span data-testid="por-que-sugerido" role="img" aria-label={`Sugerido por: ${row.proveniencia.comoFoiSugerido}`}
                      title={`Sugerido por: ${row.proveniencia.comoFoiSugerido}`}
                      className="inline-flex h-3 w-3 shrink-0 cursor-help items-center justify-center rounded-full border border-muted-foreground text-[8px] font-bold text-muted-foreground">?</span>
                  </div>
                ) : editavel && campo === 'Fornecedor' && fornecedores && onCriarFornecedor ? (
                  <ResultadoFavorecidoEditor value={row.edicao.favorecidoId} valorAtual={row.edicao.favorecidoIdAtual}
                    fornecedores={fornecedores}
                    fazendaId={row.edicao.fazendaId} onEditar={onEditar} onCriarFornecedor={onCriarFornecedor} />
                ) : editavel && campo === 'Fazenda' && fazendas ? (
                  <ResultadoFazendaEditor value={row.edicao.fazendaId} fazendaIdAtual={row.edicao.fazendaIdAtual}
                    fazendas={fazendas} forcaAdministrativo={contaEhAdministrativa} onEditar={onEditar} />
                ) : editavel && campo === 'Produto / Descrição' ? (
                  <ResultadoProdutoEditor value={row.edicao.produto} descricaoAtual={row.edicao.descricaoAtual}
                    clienteId={clienteId} onEditar={onEditar} />
                ) : editavel && campo === 'Documento' ? (
                  <ResultadoDocumentoEditor value={row.edicao.numeroDocumento}
                    numeroDocumentoAtual={row.edicao.numeroDocumentoAtual} onEditar={onEditar} />
                ) : editavel && campo === 'Tipo de documento' ? (
                  <ResultadoListaEditor value={row.edicao.tipoDocumento} valorAtual={row.edicao.tipoDocumentoAtual}
                    opcoes={TIPOS_DOCUMENTO} campo="tipo_documento" onEditar={onEditar} />
                ) : editavel && campo === 'Forma de pagamento' ? (
                  <ResultadoListaEditor value={row.edicao.formaPagamento} valorAtual={row.edicao.formaPagamentoAtual}
                    sugerido={row.edicao.formaPagamentoSugerida} rotuloSugestao="pelo histórico do banco"
                    opcoes={FORMAS_PAGAMENTO_V2} campo="forma_pagamento" onEditar={onEditar} />
                ) : editavel && campo === 'Competência' ? (
                  <ResultadoDataEditor value={row.edicao.dataCompetencia}
                    valorAtual={row.edicao.dataCompetenciaAtual} campo="data_competencia" onEditar={onEditar} />
                ) : editavel && campo === 'Data vencimento' ? (
                  <ResultadoDataEditor value={row.edicao.dataVencimento}
                    valorAtual={row.edicao.dataVencimentoAtual} campo="data_vencimento" onEditar={onEditar} />
                ) : editavel && campo === 'Safra' && safras ? (
                  <ResultadoSafraEditor value={row.edicao.safraId} valorAtual={row.edicao.safraIdAtual}
                    safras={safras} sugeridaId={row.edicao.safraSugeridaId}
                    onEditar={onEditar} administrativo={contaEhAdministrativa} />
                ) : editavel && campo === 'Conta destino' && contas ? (
                  <ResultadoContaDestinoEditor value={row.edicao.contaDestinoId}
                    valorAtual={row.edicao.contaDestinoIdAtual} contas={contas}
                    contaOrigemId={row.edicao.contaBancariaId ?? row.edicao.contaBancariaIdAtual}
                    onEditar={onEditar} />
                ) : editavel && campo === 'OBS' ? (
                  <ResultadoObservacaoEditor value={row.edicao.observacao}
                    valorAtual={row.edicao.observacaoAtual} onEditar={onEditar} />
                ) : (
                  /* ⚠ LEITURA NÃO PODE PARECER CAMPO — sem ícone, fundo chapado e o motivo no `title`.
                     ⚠ TEXTO NEUTRO (item 1): o "confere" deixou de ser verde; o âmbar continua sendo "vai mudar". */
                  <span
                    title={faltando ? 'Obrigatório — o Salvar não grava sem ele.'
                      : travadoPorTransferencia ? `${subcentroTransferencia} — ${MOTIVO_TRANSFERENCIA}`
                      : c.resultado}
                    className={`flex h-5 items-center gap-1.5 truncate rounded border px-1.5 ${
                      faltando ? 'border-destructive/60 bg-destructive/5 text-destructive'
                        : vaiMudar ? 'border-border/60 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-border/60 bg-muted text-foreground'}`}>
                    <span className="truncate">
                      {faltando ? 'obrigatório'
                        : travadoPorTransferencia ? subcentroTransferencia
                        : campo === 'Atividade' ? (rotuloAtividade(atividadeEfetiva) ?? '—')
                        : c.resultado}
                    </span>
                    {travadoPorTransferencia && !faltando && (
                      <span className="ml-auto shrink-0 text-[8.5px] italic opacity-70">transferência</span>
                    )}
                  </span>
                )}
              </div>
            </div>
            {/* ⚠ A LINHA DE CONTEXTO DO CAMPO — só quando há o que dizer, na coluna do Resultado. */}
            {(divergePlanilha || avisoCoerencia || planoPendente) && !valorDeParte && (
              <div className="grid gap-2 px-3 pb-0.5" style={{ gridTemplateColumns: COLS }}>
                <span /><span /><span />
                <span className="flex flex-col text-[10px] leading-tight">
                  {planoPendente && (
                    <span className="text-destructive" data-testid="plano-incoerente">{MOTIVO_PLANO_INCOERENTE}</span>
                  )}
                  {divergePlanilha && (
                    <span className="text-blue-700 dark:text-blue-400" data-testid="marca-planilha">planilha: {dp?.planilha}</span>
                  )}
                  {avisoCoerencia && (
                    <span className="text-amber-700 dark:text-amber-400" data-testid="aviso-plano-fazenda">{avisoCoerencia}</span>
                  )}
                </span>
              </div>
            )}
            {(divergeDoBanco || valorDeParte) && (
              <div className="grid gap-2 px-3 pb-0.5" style={{ gridTemplateColumns: COLS }}>
                <span /><span /><span />
                {valorDeParte ? (
                  <span className="text-[10px] leading-tight text-violet-700 dark:text-violet-400">
                    parte de {c.sistema} (agrupamento)
                  </span>
                ) : (
                  <span className="text-[10px] leading-tight text-amber-700 dark:text-amber-400">
                    difere do banco: planilha diz {dv?.planilha}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ⚠ AVISO, NÃO TRAVA — 133e item E. */}
      {row.avisoPlanilha && (
        <p className="truncate px-3 py-0.5 text-[10px] leading-tight text-amber-700 dark:text-amber-400"
          title={`A planilha trouxe "${row.avisoPlanilha}", que não existe no plano oficial. O Resultado usa a conta do plano do sistema.`}>
          planilha dizia: {row.avisoPlanilha}
        </p>
      )}
    </div>
  );
}
