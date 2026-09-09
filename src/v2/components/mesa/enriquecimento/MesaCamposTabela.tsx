/**
 * A tabela de campos da Mesa de Revisão — MESA-ENR-UX-01 (129).
 *
 * Quatro colunas: campo · Excel (azul, leitura) · Sistema atual · Resultado. Seções em
 * faixa. A ordem é a do mock, e ela não é estética: as três datas primeiro porque é o que
 * o operador confere primeiro no extrato; depois quem é (produto, fornecedor, fazenda);
 * depois onde entra (safra, subcentro, conta); e por último o papel.
 *
 * ⚠ OS ONZE CAMPOS GRAVAM — desde o 129c (migration 20260906195410). Até ali eram cinco:
 * `fn_classificacao_apply_row` escrevia só `subcentro, macro_custo, grupo_custo,
 * centro_custo, plano_conta_id, favorecido_id, fazenda_id, descricao (de 'produto'),
 * numero_documento`, e as datas, a safra, a conta e a observação apareciam em LEITURA com
 * o motivo escrito — porque um campo editável cujo valor some no Salvar é o silêncio mais
 * caro que esta tela pode produzir. Agora a RPC grava as seis, e a coluna `gravaHoje`
 * passou a `true` em todas.
 * ⚠ A COLUNA `gravaHoje` FICA. Ela não é resíduo: é o lugar onde a próxima diferença
 * entre "a tela oferece" e "o banco aceita" volta a ser dita, em vez de virar um campo
 * que engole o que o operador digitou.
 *
 * ⚠ ESTE COMPONENTE NÃO SUBSTITUI `EnriquecimentoDetalhe`. Aquele é a aba, que segue
 * intacta; este é a superfície ampla. Unificar os dois agora obrigaria a aba a herdar a
 * ordem nova sem homologação.
 */
import type { EnriqRowVM, EnriqComparativoLinha } from './types';
import { badgeDeStatusTransacao } from '@/lib/statusOperacional';
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { ResultadoSubcentroEditor } from './ResultadoSubcentroEditor';
import { ResultadoFavorecidoEditor } from './ResultadoFavorecidoEditor';
import { ResultadoFazendaEditor } from './ResultadoFazendaEditor';
import { ResultadoProdutoEditor } from './ResultadoProdutoEditor';
import { ResultadoDocumentoEditor } from './ResultadoDocumentoEditor';
import {
  ResultadoDataEditor, ResultadoSafraEditor, ResultadoContaEditor, ResultadoObservacaoEditor,
  ResultadoTipoEditor, ResultadoContaDestinoEditor,
} from './ResultadoCamposGravaveis';
import { ehTipoTransferencia, subcentroDeTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import type { ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { Safra } from '@/hooks/useFinanceiroV2';

/** Por que um campo ainda não é editável aqui. Texto curto, mostrado ao lado do valor. */
const MOTIVO_SEM_APPLY = 'o Salvar ainda não grava este campo';

/** Por que a conta do plano está travada numa transferência — PR-MESA-TRANSF-01 item 3. */
const MOTIVO_TRANSFERENCIA =
  'transferência entre contas usa esta conta do plano e nenhuma outra (fora da DRE); '
  + 'troque o Tipo para liberar';

/**
 * Os campos que o EXTRATO manda — 133h item 12.
 *
 * ⚠ NÃO É PREFERÊNCIA DE TELA, É O QUE A RPC FAZ. Desde a migration 20260908110224,
 * `fn_classificacao_apply_row` IGNORA `data_pagamento` e `conta_bancaria_id` do proposto
 * quando o lançamento tem vínculo ativo com o extrato. Oferecer o campo editável seria a
 * tela prometendo uma gravação que o banco descarta em silêncio — o defeito mais caro que
 * esta Mesa pode ter, porque o operador vê o valor mudar e nada acontece.
 * ⚠ `Valor` E `Tipo` JÁ ERAM LEITURA (`gravaHoje: false`); entram na lista porque o motivo
 * passa a ser outro e o operador precisa ler o motivo certo.
 */
/* ⚠ `Tipo` SAIU DA LISTA — PR-MESA-TRANSF-01. Ele nunca foi campo do extrato: o OFX diz
   quanto, quando e em que conta, e o tipo de operação é classificação do sistema. Enquanto
   esteve aqui, a linha de uma fatura de cartão dizia "o extrato manda neste campo" sobre
   um campo que a `fn_classificacao_apply_row` sequer escrevia — e o operador não tinha
   como transformar a saída crua do OFX na transferência que ela é. */
const CAMPOS_DO_BANCO = new Set(['Data pagamento', 'Valor', 'Banco']);
const MOTIVO_DO_BANCO = 'o extrato manda neste campo — conciliado';

/**
 * A ordem do mock, com a seção de cada linha e se o Salvar grava.
 *
 * `campo` casa com `EnriqComparativoLinha.campo` produzido pelo adapter. Quando o
 * comparativo não traz a linha (Data venc., Safra, Conta bancária ainda não existem na
 * view), ela aparece assim mesmo, com "—" nas três colunas: esconder faria a tela mentir
 * por omissão sobre um campo que o operador procura.
 */
/** Os dois blocos do 133e item D. A faixa de 6px é o único separador; não há títulos. */
type Bloco = 1 | 2;

const ORDEM: Array<{
  campo: string; rotulo: string; bloco: Bloco; gravaHoje: boolean;
  /**
   * A linha só existe quando o Resultado é transferência — PR-MESA-TRANSF-01.
   *
   * ⚠ NÃO É ESCONDER DADO, É NÃO INVENTAR CAMPO: uma saída não tem conta de destino, e uma
   * linha "Conta destino: —" em 17.732 saídas ensinaria o operador a ignorar um campo que,
   * nas 43 transferências, é o que impede o guard do banco de recusar a gravação.
   */
  soTransferencia?: boolean;
  /** Obrigatório SÓ na transferência — o guard do banco recusa sem ele. */
  obrigatorioSeTransferencia?: boolean;
  /** 133g item 5 — separador de 2px DEPOIS desta linha. São os quatro cortes do olho. */
  corta?: boolean;
  /**
   * 133g item 6 — sem ele o lançamento não fecha, e o Salvar diz qual falta.
   *
   * ⚠ A LISTA É DE PRODUTO, não do banco: `Valor` e `Data pgto.` já vêm do extrato e nunca
   * estão vazios; entram na lista porque, se um dia estiverem, o operador precisa ver o
   * vermelho antes de gravar — e não descobrir no fechamento.
   */
  obrigatorio?: boolean;
}> = [
  /* ⚠ A ORDEM É A DO OPERADOR — 133e item D, e ela não é estética: o bloco 1 é o MOVIMENTO
     (o que aconteceu no banco: quando, quanto, em que conta, se está vivo, em que fazenda),
     e é por ele que se reconhece a linha no extrato. O bloco 2 é a CLASSIFICAÇÃO — o que se
     está aqui para decidir.
     ⚠ "MACRO · GRUPO · CENTRO" SAIU: os três derivam da conta do plano e mudam junto com
     ela; repeti-los era gastar uma das linhas para mostrar o que a linha de cima decide.
     ⚠ "TIPO DE DOCUMENTO" FICA DE FORA até existir na view: `vw_classificacao_staging_preview`
     não o traz e o parser da Mesa não o lê, então a linha só saberia mostrar "—" nas três
     colunas. Um campo mudo ocupando 22px é pior que a ausência dele.
     ⚠ QUATORZE LINHAS × 22px = 308px, mais 6 da faixa de bloco e 6 dos três separadores.
     A décima quinta (Conta destino) só aparece na transferência. */
  /* ⚠ O TIPO GRAVA DESDE A MIGRATION 20260909180123 — PR-MESA-TRANSF-01. Era `false` com o
     motivo certo ("o Salvar ainda não grava este campo"), e virou `true` no dia em que a
     RPC passou a escrever `tipo_operacao`. Deixá-lo em leitura seria a tela mentindo na
     direção oposta. */
  { campo: 'Tipo', rotulo: 'Tipo', bloco: 1, gravaHoje: true, obrigatorio: true },
  { campo: 'Competência', rotulo: 'Competência', bloco: 1, gravaHoje: true },
  { campo: 'Data vencimento', rotulo: 'Data venc.', bloco: 1, gravaHoje: true },
  { campo: 'Data pagamento', rotulo: 'Data pgto.', bloco: 1, gravaHoje: true, obrigatorio: true },
  { campo: 'Valor', rotulo: 'Valor', bloco: 1, gravaHoje: false, obrigatorio: true, corta: true },
  { campo: 'Banco', rotulo: 'Conta bancária', bloco: 1, gravaHoje: true, obrigatorio: true },
  { campo: 'Conta destino', rotulo: 'Conta destino', bloco: 1, gravaHoje: true,
    soTransferencia: true, obrigatorioSeTransferencia: true },
  { campo: 'Situação', rotulo: 'Situação', bloco: 1, gravaHoje: false },
  { campo: 'Fazenda', rotulo: 'Fazenda', bloco: 1, gravaHoje: true, obrigatorio: true, corta: true },
  { campo: 'Produto / Descrição', rotulo: 'Produto / descr.', bloco: 2, gravaHoje: true, obrigatorio: true },
  { campo: 'Fornecedor', rotulo: 'Fornecedor', bloco: 2, gravaHoje: true },
  { campo: 'Subcentro', rotulo: 'Conta do plano', bloco: 2, gravaHoje: true, obrigatorio: true },
  { campo: 'Safra', rotulo: 'Safra', bloco: 2, gravaHoje: true, corta: true },
  { campo: 'Documento', rotulo: 'Documento', bloco: 2, gravaHoje: true },
  { campo: 'OBS', rotulo: 'Observação', bloco: 2, gravaHoje: true },
];

/** Os campos que o Salvar exige — exportado porque o container monta o motivo com eles. */
export const CAMPOS_OBRIGATORIOS_MESA = ORDEM.filter((o) => o.obrigatorio).map((o) => o.rotulo);

/**
 * Os que só são obrigatórios na transferência — PR-MESA-TRANSF-01.
 *
 * ⚠ LISTA SEPARADA, E NÃO UM `obrigatorio: true`: a conta de destino não existe numa saída,
 * e entrar na lista única faria o Salvar de 17.732 saídas pedir um campo que a tela nem
 * desenha. Sai da MESMA `ORDEM` que desenha o asterisco — duas listas divergiriam.
 */
export const CAMPOS_OBRIGATORIOS_SE_TRANSFERENCIA =
  ORDEM.filter((o) => o.obrigatorioSeTransferencia).map((o) => o.rotulo);

const VAZIA: EnriqComparativoLinha = { campo: '', sistema: '—', excel: '—', resultado: '—', tom: 'neutro' };

export interface MesaCamposTabelaProps {
  row: EnriqRowVM;
  classificacoes?: ClassificacaoItem[];
  fornecedores?: FornecedorV2[];
  fazendas?: Fazenda[];
  clienteId?: string;
  /** 129c — as listas dos seis campos que passaram a gravar. */
  safras?: Safra[];
  contas?: ContaSelecionavel[];
  onEditar?: (patch: Record<string, unknown>) => Promise<void>;
  onCriarFornecedor?: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  /**
   * 133h item 12 — o lançamento desta linha tem vínculo ATIVO com o extrato.
   *
   * ⚠ VEM DE FORA porque a view não o expõe: `vw_classificacao_staging_preview` não traz
   * nenhuma coluna de conciliação (conferido nas 80 colunas dela), e `lanc_status` não
   * serve — medido no Proto: 2.459 'realizado' COM vínculo e 27.212 'realizado' SEM.
   * `undefined` = ainda não se sabe, e aí nada trava: travar por suposição seria pior.
   */
  conciliado?: boolean;
}

export function MesaCamposTabela({
  row, classificacoes, fornecedores, fazendas, clienteId, safras, contas, onEditar, onCriarFornecedor,
  conciliado,
}: MesaCamposTabelaProps) {
  const porCampo = new Map(row.comparativo.map(c => [c.campo, c]));
  /* ⚠ RÓTULO EM 104px — 133b-a. Era 120px, e a coluna sobrava largura que faz falta às três
     colunas de conteúdo; nenhum dos quinze rótulos passa de 104px em 11px. */
  /* ⚠ AS TRÊS COLUNAS DE CONTEÚDO EM `minmax(0,1fr)` — 133e item D. O Resultado tinha
     1.3fr e comia a largura de "Sistema atual"; em 1440 a Conta do plano e o Fornecedor
     truncavam de um lado enquanto sobrava espaço do outro. `minmax(0,…)` é o que permite a
     célula ENCOLHER: sem o `0`, o `truncate` não tem em relação a quê truncar. */
  const COLS = '104px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)';
  /* ⚠ O RESULTADO MANDA, NÃO O LANÇAMENTO — PR-MESA-TRANSF-01. `edicao.tipoOperacao` já é
     "proposta, senão o que o lançamento é": é ele que decide se a linha do destino existe e
     se a conta do plano está travada, porque é ele que vai ser gravado. */
  const ehTransf = ehTipoTransferencia(row.edicao.tipoOperacao);
  /* A linha 18010 do plano, pelo `ordem_exibicao`; `null` sem catálogo — e aí nada é
     forçado, que é o certo: forçar por suposição gravaria um subcentro adivinhado. */
  const subcentroTransferencia = subcentroDeTransferencia(classificacoes);
  /* ⚠ FILTRA ANTES DE MAPEAR, e isso não é estilo: a zebra e a faixa do bloco 2 se decidem
     pela POSIÇÃO da linha. Pulando a linha do destino dentro do `map`, o índice continuava
     contando por ela — e nas 17.732 saídas duas linhas sombreadas ficavam coladas, no
     lugar exato onde o campo não existe. */
  const linhas = ORDEM.filter((o) => !o.soTransferencia || ehTransf);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* ⚠ O CABEÇALHO DAS COLUNAS É STICKY DENTRO DESTE SCROLLPORT — A21. Ele mora no
          mesmo elemento que rola; posto fora, subiria junto com a moldura.
          ⚠ SEM UPPERCASE — 133b-a: caixa alta em 10px sobre três palavras curtas custa
          largura e não ganha hierarquia; o peso 500 e a cor já separam o cabeçalho. */}
      <div className="sticky top-0 z-10 grid gap-2 border-b bg-card px-3 py-1 text-[10px] font-medium"
        style={{ gridTemplateColumns: COLS }}>
        <span />
        <span className="text-blue-600">Excel</span>
        <span className="text-muted-foreground">Sistema atual</span>
        <span className="text-emerald-600">Resultado</span>
      </div>

      {linhas.map(({ campo, rotulo, bloco, gravaHoje, corta, obrigatorio, obrigatorioSeTransferencia }, indice) => {
        /* Zebra pela POSIÇÃO na tabela: o olho segue a linha, e alternar por bloco criaria
           faixas de tamanhos diferentes. */
        const zebra = indice % 2 === 1;
        const c = porCampo.get(campo) ?? VAZIA;
        const igual = c.tom === 'ok';
        const vaiMudar = c.tom === 'muda' || c.tom === 'difere';
        /* 133h item 12 — campo do banco não se edita em linha conciliada. */
        const travadoPeloBanco = !!conciliado && CAMPOS_DO_BANCO.has(campo);
        /* ⚠ EM TRANSFERÊNCIA A CONTA DO PLANO É UMA SÓ — PR-MESA-TRANSF-01 item 3. A 18010
           mantém o movimento FORA da DRE; qualquer outra conta o traria de volta como
           receita ou despesa, e o operador não teria como saber que foi isso que aconteceu.
           O campo trava e o motivo fica escrito; sair de "Transferência" destrava. */
        const travadoPorTransferencia = ehTransf && campo === 'Subcentro' && !!subcentroTransferencia;
        const editavel = gravaHoje && !row.aplicado && !!onEditar
          && !travadoPeloBanco && !travadoPorTransferencia;
        /* ⚠ DIVERGÊNCIA É INFORMAÇÃO, NUNCA GRAVAÇÃO: a RPC já ignora o proposto nestes
           campos, então o que a planilha diz vira aviso — e o operador vê ANTES de salvar
           que o arquivo dele discorda do extrato.
           ⚠ A LISTA VEM DO ADAPTER — 133h-b item 4. Comparar `c.excel !== c.sistema` aqui
           era o falso positivo: os dois lados falam vocabulários diferentes ("2-Saídas" ×
           "Saída") e o valor de uma parte de agrupamento é MENOR por definição. */
        const dv = row.divergenciasBanco.find((d) => d.campo === campo);
        const divergeDoBanco = travadoPeloBanco && !!dv;
        /* 4c — a linha é parte de um agrupamento: o valor não diverge, ele é uma parte. */
        const valorDeParte = campo === 'Valor' && row.parteDeAgrupamento;
        const abreBloco2 = bloco === 2 && linhas[indice - 1]?.bloco === 1;
        /* 133g item 6 — vazio no RESULTADO é o que importa: é ele que vai ser gravado. */
        const exigido = !!obrigatorio || (!!obrigatorioSeTransferencia && ehTransf);
        const faltando = exigido && (c.resultado === '—' || c.resultado.trim() === '');

        return (
          <div key={rotulo}>
            {/* ⚠ 6px DE FAIXA, SEM TÍTULO — 133e item D. Os títulos de seção custavam uma
                linha inteira cada para nomear o que a ordem já agrupa; a faixa separa sem
                gastar altura, e 6px é o que o olho precisa para ver que mudou de assunto. */}
            {abreBloco2 && <div className="h-1.5 bg-muted" />}
            {/* ⚠ AS TRÊS COLUNAS NA MESMA MEDIDA — 129d item 2. Excel e Sistema estavam em
                11px sobre linha alta enquanto o Resultado ficava dentro de um controle de
                24px: as duas primeiras SALTAVAM, e a tela parecia desalinhada. O que
                distingue é a COR (azul = referência, cinza = o que está gravado), não o
                tamanho.
                ⚠ 22px EXATOS — 133d item 4. Eram 24 (`py-[3px]` sobre 11px/1.3); com o painel
                direito somando 470px, a altura da linha é o que decide se 15 campos cabem em
                900 sem rolar. `h-[22px]` + `items-center` no lugar do padding: a medida passa
                a ser declarada, não derivada.
                ⚠ NUNCA QUEBRA: `truncate` em cada célula e o texto inteiro no `title`. */}
            {/* ⚠ TODA LINHA COM A MESMA ALTURA — 133e item D. Conta bancária e Fornecedor
                saltavam porque o CONTROLE tinha altura própria e empurrava a linha; agora a
                linha declara 22px e `items-center` centra o que estiver dentro, controle ou
                texto. O controle mora dentro da linha, nunca a define (ver `medidasMesa`). */}
            <div className={`grid h-[22px] items-center gap-2 border-b border-border/50 px-3 text-[10px] leading-[1.3] ${
              zebra ? 'bg-muted/30' : ''}`}
              style={{ gridTemplateColumns: COLS }}>
              <span className="truncate text-[10px] text-muted-foreground" title={rotulo}>
                {rotulo}
                {/* ⚠ ASTERISCO VERMELHO — 133g item 6. O operador não deve descobrir que um
                    campo era obrigatório quando o Salvar recusa: ele vê antes de mexer. */}
                {exigido && <span className="text-red-600 dark:text-red-400"> *</span>}
              </span>
              {/* ⚠ O EXCEL É REFERÊNCIA, NUNCA GRAVADO DIRETO — por isso azul e sem controle. */}
              <span className="truncate text-blue-700/90" title={c.excel}>{c.excel}</span>
              {/* ⚠ O TIPO É COLORIDO — 133e item D: "Saída" em vermelho, "Entrada" em verde.
                  É o campo que responde "saiu ou entrou?", e a cor responde antes da leitura. */}
              <span className={`truncate ${
                campo === 'Tipo' && c.sistema === 'Saída' ? 'text-red-600 dark:text-red-400'
                : campo === 'Tipo' && c.sistema === 'Entrada' ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-slate-700 dark:text-slate-300'}`} title={c.sistema}>{c.sistema}</span>
              <div className="min-w-0">
                {editavel && campo === 'Subcentro' && classificacoes ? (
                  <ResultadoSubcentroEditor value={row.edicao.subcentro} tipoOperacao={row.edicao.tipoOperacao}
                    classificacoes={classificacoes} onEditar={onEditar}
                    subcentroTransferencia={subcentroTransferencia}
                    contaDestinoSugeridaId={row.edicao.contaDestinoSugeridaId} />
                ) : editavel && campo === 'Fornecedor' && fornecedores && onCriarFornecedor ? (
                  <ResultadoFavorecidoEditor value={row.edicao.favorecidoId} fornecedores={fornecedores}
                    fazendaId={row.edicao.fazendaId} onEditar={onEditar} onCriarFornecedor={onCriarFornecedor} />
                ) : editavel && campo === 'Fazenda' && fazendas ? (
                  <ResultadoFazendaEditor value={row.edicao.fazendaId} fazendaIdAtual={row.edicao.fazendaIdAtual}
                    fazendas={fazendas} forcaAdministrativo={row.edicao.macro === 'Dividendos'} onEditar={onEditar} />
                ) : editavel && campo === 'Produto / Descrição' ? (
                  <ResultadoProdutoEditor value={row.edicao.produto} descricaoAtual={row.edicao.descricaoAtual}
                    clienteId={clienteId} onEditar={onEditar} />
                ) : editavel && campo === 'Documento' ? (
                  <ResultadoDocumentoEditor value={row.edicao.numeroDocumento}
                    numeroDocumentoAtual={row.edicao.numeroDocumentoAtual} onEditar={onEditar} />
                ) : editavel && campo === 'Competência' ? (
                  <ResultadoDataEditor value={row.edicao.dataCompetencia}
                    valorAtual={row.edicao.dataCompetenciaAtual} campo="data_competencia" onEditar={onEditar} />
                ) : editavel && campo === 'Data vencimento' ? (
                  <ResultadoDataEditor value={row.edicao.dataVencimento}
                    valorAtual={row.edicao.dataVencimentoAtual} campo="data_vencimento" onEditar={onEditar} />
                ) : editavel && campo === 'Data pagamento' ? (
                  <ResultadoDataEditor value={row.edicao.dataPagamento}
                    valorAtual={row.edicao.dataPagamentoAtual} campo="data_pagamento" onEditar={onEditar} />
                ) : editavel && campo === 'Safra' && safras ? (
                  <ResultadoSafraEditor value={row.edicao.safraId} valorAtual={row.edicao.safraIdAtual}
                    safras={safras} onEditar={onEditar} />
                ) : editavel && campo === 'Banco' && contas ? (
                  <ResultadoContaEditor value={row.edicao.contaBancariaId}
                    valorAtual={row.edicao.contaBancariaIdAtual} contas={contas} onEditar={onEditar} />
                ) : editavel && campo === 'Tipo' ? (
                  <ResultadoTipoEditor value={row.edicao.tipoOperacaoProposto}
                    valorAtual={row.edicao.tipoOperacaoAtual ?? row.edicao.tipoOperacaoExcel}
                    subcentroTransferencia={subcentroTransferencia}
                    subcentroAtualProposto={row.edicao.subcentro}
                    contaDestinoSugeridaId={row.edicao.contaDestinoSugeridaId}
                    onEditar={onEditar} />
                ) : editavel && campo === 'Conta destino' && contas ? (
                  <ResultadoContaDestinoEditor value={row.edicao.contaDestinoId}
                    valorAtual={row.edicao.contaDestinoIdAtual} contas={contas}
                    contaOrigemId={row.edicao.contaBancariaId ?? row.edicao.contaBancariaIdAtual}
                    onEditar={onEditar} />
                ) : editavel && campo === 'OBS' ? (
                  <ResultadoObservacaoEditor value={row.edicao.observacao}
                    valorAtual={row.edicao.observacaoAtual} onEditar={onEditar} />
                ) : (
                  /* ⚠ LEITURA NÃO PODE PARECER CAMPO — medido na tela: com borda de input e
                     altura de controle, as datas e a safra pareciam editáveis e vazias, e o
                     operador tentaria clicar. Sem borda, fundo chapado e o motivo no
                     `title`: é a mesma regra do botão desabilitado que diz por quê.
                     ⚠ E SEM ÍCONE DE CALENDÁRIO: ele prometeria um DatePicker que não
                     existe. O que confere ou muda continua com a cor de sempre. */
                  /* ⚠ CAMPO TRAVADO TEM CARA DE TRAVADO — 133b-a: `bg-muted`,
                     `border-border/60` e texto muted, 22px como os editáveis. Antes a
                     leitura ganhava borda verde ou âmbar e parecia um controle vazio, e o
                     operador tentava clicar.
                     ⚠ O ÂMBAR DO "VAI MUDAR" FICA NO TEXTO, não na moldura: é o valor que
                     muda, não a célula. */
                  /* ⚠ SITUAÇÃO É PÍLULA, NUNCA TEXTO SOLTO — 133g item 7. As cores são as da
                     casa (`badgeDeStatusTransacao`, em `statusOperacional`), a mesma fonte da
                     lista do Financeiro: realizado verde, programado azul, previsto cinza,
                     cancelado vermelho. Cada tela inventando a sua seria o defeito do A23 de
                     volta, num campo em que a cor É a informação. */
                  campo === 'Situação' ? (
                    <span className="flex h-[22px] items-center">
                      <span className={`truncate rounded px-1.5 py-px text-[10px] font-medium ${badgeDeStatusTransacao(c.sistema === '—' ? null : c.sistema).cls}`}>
                        {badgeDeStatusTransacao(c.sistema === '—' ? null : c.sistema).label}
                      </span>
                    </span>
                  ) : (
                  <span
                    title={faltando ? 'Obrigatório — o Salvar não grava sem ele.'
                      : travadoPeloBanco
                        ? (divergeDoBanco
                            ? `${c.sistema} — ${MOTIVO_DO_BANCO}. A planilha diz "${c.excel}", e isso NÃO será gravado.`
                            : `${c.sistema} — ${MOTIVO_DO_BANCO}`)
                      : travadoPorTransferencia ? `${subcentroTransferencia} — ${MOTIVO_TRANSFERENCIA}`
                      : gravaHoje ? c.resultado : `${c.resultado} — ${MOTIVO_SEM_APPLY}`}
                    className={`flex h-[22px] items-center gap-1.5 truncate rounded border px-1.5 ${
                      faltando ? 'border-destructive/60 bg-destructive/5 text-destructive'
                        : valorDeParte ? 'border-violet-300 bg-violet-50/60 text-violet-800 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-200'
                        : divergeDoBanco ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : igual ? 'border-border/60 bg-muted text-emerald-700 dark:text-emerald-400'
                        : vaiMudar ? 'border-border/60 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-border/60 bg-muted text-muted-foreground'}`}>
                    {igual && !travadoPeloBanco && <span aria-hidden>✓</span>}
                    {/* ⚠ EM LINHA CONCILIADA O RESULTADO É O DO BANCO, não o do proposto: a
                        RPC ignora o proposto nestes campos, e mostrar o proposto aqui seria
                        a tela anunciando um valor que nunca vai ser gravado. */}
                    <span className="truncate">
                      {faltando ? 'obrigatório'
                        : travadoPeloBanco ? c.sistema
                        : travadoPorTransferencia ? subcentroTransferencia
                        : c.resultado}
                    </span>
                    {/* ⚠ O AVISO SAIU DE DENTRO DA CÉLULA — 133h-b item 4d. Ele não cabia
                        em 22px ao lado do valor e saía cortado justamente na parte que
                        importa (o que a planilha diz). Aqui fica só o ícone; o texto vai
                        para a linha de contexto abaixo, onde pode quebrar. */}
                    {divergeDoBanco && (
                      <span className="ml-auto shrink-0 text-[9px]" aria-hidden title="Difere do extrato">⚠</span>
                    )}
                    {!gravaHoje && !faltando && !divergeDoBanco && !valorDeParte && (
                      <span className="ml-auto shrink-0 text-[9px] italic opacity-70">leitura</span>
                    )}
                    {travadoPeloBanco && gravaHoje && !divergeDoBanco && (
                      <span className="ml-auto shrink-0 text-[9px] italic opacity-70">do extrato</span>
                    )}
                    {/* ⚠ O CAMPO TRAVADO DIZ POR QUÊ, ao lado — a mesma regra do botão
                        desabilitado. "Fixo" sem motivo faria o operador procurar o defeito. */}
                    {travadoPorTransferencia && !faltando && (
                      <span className="ml-auto shrink-0 text-[9px] italic opacity-70">transferência</span>
                    )}
                  </span>
                  )
                )}
              </div>
            </div>
            {/* ⚠ A LINHA DE CONTEXTO DO CAMPO — 133h-b item 4c/4d. Ela só existe quando há o
                que dizer, e ocupa a COLUNA do Resultado: assim o texto se alinha ao valor a
                que se refere, em vez de flutuar sob a tabela inteira. `wrap` permitido — é
                aqui que a frase cabe. */}
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
            {/* ⚠ 2px, NÃO 0,5 — 133g item 5. A linha de 0,5px separa CAMPOS; estes três
                separam ASSUNTOS: dinheiro · onde · o que · papel. São os cortes por onde o
                olho bate, e a 0,5px eles não existiam. */}
            {corta && <div className="h-0.5 bg-border" />}
          </div>
        );
      })}

      {/* ⚠ AVISO, NÃO TRAVA — 133e item E. O texto da planilha fora do plano oficial travava
          o Salvar; agora ele é uma linha de 10px âmbar, e o Salvar olha o RESULTADO. */}
      {row.avisoPlanilha && (
        <p className="truncate px-3 py-0.5 text-[10px] leading-tight text-amber-700 dark:text-amber-400"
          title={`A planilha trouxe "${row.avisoPlanilha}", que não existe no plano oficial. O Resultado usa a conta do plano do sistema.`}>
          planilha dizia: {row.avisoPlanilha}
        </p>
      )}
      <p className="px-3 py-1 text-[10px] leading-tight text-muted-foreground">
        ✓ confere · faixa âmbar = vai mudar · Excel em azul é referência, nunca gravado
        direto. Deixar um campo vazio remove a proposta dele.
      </p>
    </div>
  );
}
