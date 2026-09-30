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
import { Fragment } from 'react';
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
   * O campo só se EDITA quando o Resultado é transferência — PR-MESA-TRANSF-01.
   * ⚠ A LINHA EXISTE SEMPRE desde o PR-CONC-MESA-LAYOUT-FIXO-01 (nenhuma linha aparece ou some por condição): fora da
   *   transferência ela é leitura "—", com "só em transferência" no slot da dica.
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
 * AS MEDIDAS DA GRADE — PR-CONC-MESA-LAYOUT-FIXO-01 (regra soberana do Gabriel, 30/09: nada desloca ao selecionar,
 * digitar ou trocar de linha).
 *
 * ⚠ MEDIDAS NO PIOR TEXTO RENDERIZADO (Inter, canvas `measureText`), pela regra de coluna do CLAUDE.md (pior texto +
 *   8 de folga + padding): o rótulo "Forma de pagamento *" a 10,5px mede 114px -> 114 + 8 + 18 (padding 12/6) = 140; a
 *   dica "pelo histórico do banco" a 8,5px mede 95px -> 95 + 8 = 103, arredondado a 104. "Vai gravar" leva 44% da
 *   largura do painel (o campo + o slot); Planilha e Sistema dividem o resto — tudo sai da largura do PAINEL, nada do
 *   conteúdo.
 */
export const LARGURA_COL_CAMPO = '140px';
export const LARGURA_COL_VAI_GRAVAR = '44%';
export const LARGURA_SLOT_DICA = '104px';
export const ALTURA_LINHA = '22px';
export const ALTURA_CABECALHO = '20px';
export const ALTURA_FAIXA_GRUPO = '6px';
export const ALTURA_SLOT_AVISO = '18px';
/** "classificado · sistema prevalece" a 8,5px mede 128px (canvas, Inter) -> 128 + 8 + 12 de padding = 148. */
export const LARGURA_SELO = '148px';

/**
 * O selo da regra da linha — PR-CONC-MESA-PAINEL-V1 item 6, no rodapé da Mesa, antes do Salvar.
 * ⚠ NO CRU A PLANILHA PREVALECE (a precedência do banco a levou ao Resultado); no classificado, o sistema. Sem
 *   lançamento (`null`) não há regra, e o selo é um espaço vazio da MESMA largura. Rótulo auxiliar a 8,5px.
 */
export function SeloRegraDaLinha({ ehCru }: { ehCru: boolean | null }) {
  /* sem lançamento não há regra — mas o lugar fica guardado, vazio, para o rodapé não andar */
  if (ehCru === null) return <span data-testid="selo-regra-vazio" aria-hidden className="shrink-0" style={{ width: LARGURA_SELO }} />;
  return (
    <span data-testid="selo-regra"
      /* largura fixa: "cru" e "classificado" têm tamanhos diferentes, e o selo não pode empurrar o rodapé */
      style={{ width: LARGURA_SELO }}
      className="shrink-0 truncate whitespace-nowrap rounded bg-primary/10 px-1.5 py-px text-center text-[8.5px] text-primary">
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
  /* A safra que a competência sugere, quando nada mais a define — a mesma condição do `ResultadoSafraEditor`. */
  const safraEhSugestao = !row.edicao.safraId && !row.edicao.safraIdAtual && !!row.edicao.safraSugeridaId
    && !contaEhAdministrativa;
  const formaEhSugestao = !row.edicao.formaPagamento && !row.edicao.formaPagamentoAtual
    && !!row.edicao.formaPagamentoSugerida;

  /* ── O SLOT DE AVISO DO TOPO — PR-CONC-MESA-LAYOUT-FIXO-01 item 3 ──────────────────────────────────────────────
     ⚠ UMA LINHA, ALTURA FIXA, SEMPRE PRESENTE (vazia quando não há aviso). Os avisos eram linhas NOVAS: "planilha
       dizia" nascia abaixo da tabela e empurrava o rodapé (print 18:59), o de plano × fazenda abria linha debaixo da
       Fazenda. Mais de um aviso: juntos, truncados, e o texto inteiro no `title`. */
  const avisos: Array<{ id: string; texto: string; cls: string; title?: string }> = [];
  if (incoerente) avisos.push({ id: 'plano-incoerente', texto: MOTIVO_PLANO_INCOERENTE, cls: 'text-destructive' });
  if (avisoPlanoFazenda) {
    avisos.push({ id: 'aviso-plano-fazenda', texto: avisoPlanoFazenda, cls: 'text-amber-700 dark:text-amber-400' });
  }
  if (row.avisoPlanilha) {
    avisos.push({ id: 'aviso-planilha-dizia', texto: `planilha dizia: ${row.avisoPlanilha}`,
      cls: 'text-amber-700 dark:text-amber-400',
      title: `A planilha trouxe "${row.avisoPlanilha}", que não existe no plano oficial. O Resultado usa a conta do plano do sistema.` });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div data-testid="slot-aviso" style={{ height: ALTURA_SLOT_AVISO }}
        className="flex shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b px-3 text-[10px]"
        title={avisos.map((a) => a.title ?? a.texto).join(' · ') || undefined}>
        {avisos.map((a, i) => (
          <span key={a.id} data-testid={a.id} className={`min-w-0 truncate ${a.cls}`}>
            {i > 0 && <span aria-hidden className="text-muted-foreground">· </span>}{a.texto}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ⚠ TABELA DE LAYOUT FIXO — PR-CONC-MESA-LAYOUT-FIXO-01 item 1. `table-layout: fixed` + `colgroup`: a largura
            das colunas sai do colgroup e da largura do painel, NUNCA do conteúdo. Era um grid, e a célula do resultado
            encolhia quando o rótulo "pelo histórico do banco" entrava ao lado do select (print 19:50). */}
        <table className="w-full table-fixed border-collapse text-[10.5px] leading-[1.3]" data-testid="grade-mesa">
          <colgroup>
            <col data-testid="col-campo" style={{ width: LARGURA_COL_CAMPO }} />
            <col data-testid="col-planilha" />
            <col data-testid="col-sistema" />
            <col data-testid="col-vai-gravar" style={{ width: LARGURA_COL_VAI_GRAVAR }} />
          </colgroup>
          {/* ⚠ O CABEÇALHO DAS COLUNAS É STICKY DENTRO DESTE SCROLLPORT — A21.
              ⚠ "VAI GRAVAR" EM TEXTO NEUTRO (PR-CONC-MESA-PAINEL-V1 item 1). */}
          <thead>
            <tr style={{ height: ALTURA_CABECALHO }} className="text-left text-[9.5px] font-medium">
              <th className="sticky top-0 z-10 border-b bg-card pl-3 pr-1.5 font-medium text-muted-foreground">Campo</th>
              <th className="sticky top-0 z-10 border-b bg-card px-1.5 font-medium text-blue-600 dark:text-blue-400">Planilha</th>
              <th className="sticky top-0 z-10 border-b bg-card px-1.5 font-medium text-muted-foreground">Sistema hoje</th>
              <th className="sticky top-0 z-10 border-b bg-card px-1.5 font-medium text-foreground" data-testid="cabecalho-vai-gravar">Vai gravar</th>
            </tr>
          </thead>
          <tbody>
            {ORDEM.map(({ campo, rotulo, grupo, soTransferencia, obrigatorio, obrigatorioSeTransferencia }, indice) => {
              const zebra = indice % 2 === 1;
              const c = porCampo.get(campo) ?? VAZIA;
              const vaiMudar = c.tom === 'muda' || c.tom === 'difere';
              const doExtrato = grupo === 'extrato' && campo !== 'Conta destino';
              /* ⚠ A LINHA DO DESTINO EXISTE SEMPRE (item 1: nenhuma linha aparece ou some por condição); fora da
                 transferência ela é leitura, com o motivo no slot. */
              const foraDeTransferencia = !!soTransferencia && !ehTransf;
              /* ⚠ EM TRANSFERÊNCIA A CONTA DO PLANO É UMA SÓ — PR-MESA-TRANSF-01 item 3 (a 18010, fora da DRE). */
              const travadoPorTransferencia = ehTransf && campo === 'Subcentro' && !!subcentroTransferencia;
              const editavel = !row.aplicado && !!onEditar && !doExtrato && !travadoPorTransferencia
                && !foraDeTransferencia;
              /* ⚠ DIVERGÊNCIA COM O EXTRATO É INFORMAÇÃO, NUNCA GRAVAÇÃO — a lista vem do adapter (133h-b item 4). */
              const dv = row.divergenciasBanco.find((d) => d.campo === campo);
              const divergeDoBanco = doExtrato && !!dv;
              const valorDeParte = campo === 'Valor' && row.parteDeAgrupamento;
              const abreGrupo = indice > 0 && ORDEM[indice - 1]?.grupo !== grupo;
              /* PR-CONC-MESA-DIVERGENCIA-EXCEL-01 — a planilha discorda do Resultado. */
              const dp = row.divergenciasPlanilha.find((d) => d.campo === campo);
              const divergePlanilha = !!dp && !divergeDoBanco;
              const planoPendente = campo === 'Subcentro' && incoerente;
              const exigido = !!obrigatorio || (!!obrigatorioSeTransferencia && ehTransf);
              /* 133g item 6 — vazio no RESULTADO é o que importa. A Atividade só se cobra com o catálogo na mão. */
              const faltando = campo === 'Atividade'
                ? !!classificacoes && !atividadeEfetiva
                : exigido && (c.resultado === '—' || c.resultado.trim() === '');
              const corValor = campo === 'Valor' ? corDoSinal : '';
              /* No extrato, o que vale é o que o banco tem; o Tipo proposto (18010 escolhida) é o que vai gravar. */
              const valorExtrato = campo === 'Tipo' && row.edicao.tipoOperacaoProposto ? c.resultado : c.sistema;

              /* ── O SLOT DA DICA — item 2: largura FIXA em toda linha, dentro da célula "Vai gravar", à direita do
                 campo. Ele existe mesmo vazio: é isso que deixa o campo com a mesma largura em todas as linhas. */
              const dicas: Array<{ id?: string; texto: string; cls: string; title?: string }> = [];
              if (doExtrato) {
                dicas.push(valorDeParte
                  ? { texto: 'parte · agrupamento', cls: 'text-violet-700 dark:text-violet-400', title: `parte de ${c.sistema} (agrupamento)` }
                  : divergeDoBanco
                    ? { texto: 'do extrato ⚠', cls: 'text-amber-700 dark:text-amber-400',
                        title: `${valorExtrato} — o extrato manda${conciliado ? ' (conciliado)' : ''}. A planilha diz "${dv?.planilha}", e isso NÃO será gravado.` }
                    : { texto: 'do extrato', cls: 'text-muted-foreground', title: `${valorExtrato} — do extrato, só leitura` });
              }
              if (foraDeTransferencia) {
                dicas.push({ texto: 'só em transferência', cls: 'text-muted-foreground',
                  title: 'A conta de destino só existe quando o lançamento é transferência entre contas.' });
              }
              if (travadoPorTransferencia) {
                dicas.push({ texto: 'transferência', cls: 'italic text-muted-foreground', title: `${subcentroTransferencia} — ${MOTIVO_TRANSFERENCIA}` });
              }
              if (campo === 'Safra' && editavel && safraEhSugestao) {
                dicas.push({ texto: 'pela competência', cls: 'text-muted-foreground', title: 'Safra sugerida pela competência — grava ao salvar' });
              }
              if (campo === 'Forma de pagamento' && editavel && formaEhSugestao) {
                dicas.push({ id: 'rotulo-sugestao', texto: 'pelo histórico do banco', cls: 'text-muted-foreground',
                  title: 'Forma sugerida pelo histórico do banco — grava ao salvar' });
              }
              if (divergePlanilha) {
                dicas.push({ id: 'marca-planilha', texto: dp?.texto ?? `planilha: ${dp?.planilha}`,
                  cls: dp?.texto ? 'text-destructive' : 'text-blue-700 dark:text-blue-400' });
              }
              const tituloSlot = dicas.map((d) => d.title ?? d.texto).join(' · ');

              return (
                <Fragment key={rotulo}>
                  {/* ⚠ 6px DE FAIXA, SEM TÍTULO — os grupos (extrato · datas · classificação · identificação). */}
                  {abreGrupo && (
                    <tr aria-hidden style={{ height: ALTURA_FAIXA_GRUPO }} className="bg-muted">
                      <td colSpan={4} className="p-0" />
                    </tr>
                  )}
                  {/* ⚠ 22px EXATOS E SEMPRE PRESENTE — nunca quebra: cada célula trunca e leva o texto no `title`. */}
                  <tr style={{ height: ALTURA_LINHA }} data-testid={`linha-${rotulo}`}
                    className={`border-b border-border/50 ${zebra ? 'bg-muted/30' : ''}`}>
                    <td className="truncate py-0 pl-3 pr-1.5 text-muted-foreground" title={rotulo}>
                      {rotulo}
                      {exigido && <span className="text-red-600 dark:text-red-400"> *</span>}
                    </td>
                    <td className={`truncate px-1.5 py-0 ${corValor || 'text-blue-700/90 dark:text-blue-400'}`} title={c.excel}>{c.excel}</td>
                    <td className={`truncate px-1.5 py-0 ${corValor || 'text-slate-700 dark:text-slate-300'}`} title={c.sistema}>{c.sistema}</td>
                    <td className="px-1.5 py-0">
                      {/* sem altura própria: o controle (20px) centra na linha de 22 — dar 22 a este bloco somava a
                          borda de 1px e a linha media 23 (medido no navegador) */}
                      <div className="flex items-center gap-1">
                        <div className={`min-w-0 flex-1 ${planoPendente ? 'rounded ring-1 ring-destructive/70' : ''}`}
                          data-testid={planoPendente ? 'plano-pendente' : undefined}>
                          {doExtrato ? (
                            /* ⚠ CAIXA TRACEJADA — só leitura, e com cara de leitura. */
                            <span data-testid={`extrato-${rotulo}`}
                              title={faltando ? 'Obrigatório — o Salvar não grava sem ele.' : valorExtrato}
                              className={`flex h-5 items-center rounded border border-dashed px-1.5 ${
                                faltando ? 'border-destructive/60 bg-destructive/5 text-destructive'
                                  : valorDeParte ? 'border-violet-300 bg-violet-50/60 text-violet-800 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-200'
                                  : 'border-border bg-muted/60'}`}>
                              <span className={`min-w-0 flex-1 truncate ${campo === 'Valor' ? 'tabular-nums' : ''} ${corValor}`}>
                                {faltando ? 'obrigatório' : valorExtrato}
                              </span>
                            </span>
                          ) : editavel && campo === 'Atividade' && classificacoes && onAtividade ? (
                            <ResultadoAtividadeEditor value={atividadeEfetiva} valorAtual={atividadeSistema}
                              opcoes={ATIVIDADES} onEscolher={onAtividade} />
                          ) : editavel && campo === 'Subcentro' && classificacoes ? (
                            <ResultadoSubcentroEditor value={row.edicao.subcentro} tipoOperacao={row.edicao.tipoOperacao}
                              classificacoes={classificacoes} onEditar={onEditar}
                              subcentroTransferencia={subcentroTransferencia}
                              contaDestinoSugeridaId={row.edicao.contaDestinoSugeridaId}
                              escopoNegocio={atividadeEfetiva} />
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
                               ⚠ TEXTO NEUTRO (PAINEL-V1 item 1): o âmbar continua sendo "vai mudar". */
                            <span
                              title={faltando ? 'Obrigatório — o Salvar não grava sem ele.'
                                : travadoPorTransferencia ? `${subcentroTransferencia} — ${MOTIVO_TRANSFERENCIA}`
                                : c.resultado}
                              className={`flex h-5 items-center truncate rounded border px-1.5 ${
                                faltando ? 'border-destructive/60 bg-destructive/5 text-destructive'
                                  : vaiMudar ? 'border-border/60 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                                  : 'border-border/60 bg-muted text-foreground'}`}>
                              <span className="truncate">
                                {faltando ? 'obrigatório'
                                  : travadoPorTransferencia ? subcentroTransferencia
                                  : foraDeTransferencia ? '—'
                                  : campo === 'Atividade' ? (rotuloAtividade(atividadeEfetiva) ?? '—')
                                  : c.resultado}
                              </span>
                            </span>
                          )}
                        </div>
                        {/* ⚠ O SLOT: largura fixa, sempre presente, texto de 8,5px truncado com o todo no `title`.
                            O "?" da Conta do plano mora aqui (PAINEL-V1 item 5). */}
                        <span data-testid="slot-dica" title={tituloSlot || undefined}
                          className="flex shrink-0 items-center gap-1 overflow-hidden whitespace-nowrap text-[8.5px]"
                          style={{ width: LARGURA_SLOT_DICA }}>
                          {campo === 'Subcentro' && (
                            <span data-testid="por-que-sugerido" role="img" aria-label={`Sugerido por: ${row.proveniencia.comoFoiSugerido}`}
                              title={`Sugerido por: ${row.proveniencia.comoFoiSugerido}`}
                              className="inline-flex h-3 w-3 shrink-0 cursor-help items-center justify-center rounded-full border border-muted-foreground text-[8px] font-bold text-muted-foreground">?</span>
                          )}
                          {dicas.map((d) => (
                            <span key={d.texto} data-testid={d.id} className={`min-w-0 truncate ${d.cls}`}>{d.texto}</span>
                          ))}
                        </span>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
