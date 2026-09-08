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
import type { ClassificacaoItem, FornecedorV2 } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { ResultadoSubcentroEditor } from './ResultadoSubcentroEditor';
import { ResultadoFavorecidoEditor } from './ResultadoFavorecidoEditor';
import { ResultadoFazendaEditor } from './ResultadoFazendaEditor';
import { ResultadoProdutoEditor } from './ResultadoProdutoEditor';
import { ResultadoDocumentoEditor } from './ResultadoDocumentoEditor';
import {
  ResultadoDataEditor, ResultadoSafraEditor, ResultadoContaEditor, ResultadoObservacaoEditor,
} from './ResultadoCamposGravaveis';
import type { ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import type { Safra } from '@/hooks/useFinanceiroV2';

/** Por que um campo ainda não é editável aqui. Texto curto, mostrado ao lado do valor. */
const MOTIVO_SEM_APPLY = 'o Salvar ainda não grava este campo';

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

const ORDEM: Array<{ campo: string; rotulo: string; bloco: Bloco; gravaHoje: boolean }> = [
  /* ⚠ A ORDEM É A DO OPERADOR — 133e item D, e ela não é estética: o bloco 1 é o MOVIMENTO
     (o que aconteceu no banco: quando, quanto, em que conta, se está vivo, em que fazenda),
     e é por ele que se reconhece a linha no extrato. O bloco 2 é a CLASSIFICAÇÃO — o que se
     está aqui para decidir. Misturados, o olho ia e voltava entre conferir e decidir.
     ⚠ "MACRO · GRUPO · CENTRO" SAIU: os três derivam da conta do plano e mudam junto com
     ela; repeti-los era gastar uma das 15 linhas para mostrar o que a linha de cima decide.
     ⚠ "TIPO DE DOCUMENTO" FICA DE FORA até existir na view: `vw_classificacao_staging_preview`
     não o traz e o parser da Mesa não o lê, então a linha só saberia mostrar "—" nas três
     colunas. Um campo mudo ocupando 22px é pior que a ausência dele — quando a view o
     trouxer, ele entra aqui, no bloco 2, antes do Documento.
     ⚠ TREZE LINHAS × 22px = 286px, mais 6px da faixa. */
  { campo: 'Tipo', rotulo: 'Tipo', bloco: 1, gravaHoje: false },
  { campo: 'Competência', rotulo: 'Competência', bloco: 1, gravaHoje: true },
  { campo: 'Data vencimento', rotulo: 'Data venc.', bloco: 1, gravaHoje: true },
  { campo: 'Data pagamento', rotulo: 'Data pgto.', bloco: 1, gravaHoje: true },
  { campo: 'Valor', rotulo: 'Valor', bloco: 1, gravaHoje: false },
  { campo: 'Banco', rotulo: 'Conta bancária', bloco: 1, gravaHoje: true },
  { campo: 'Situação', rotulo: 'Situação', bloco: 1, gravaHoje: false },
  { campo: 'Fazenda', rotulo: 'Fazenda', bloco: 1, gravaHoje: true },
  { campo: 'Produto / Descrição', rotulo: 'Produto / descr.', bloco: 2, gravaHoje: true },
  { campo: 'Fornecedor', rotulo: 'Fornecedor', bloco: 2, gravaHoje: true },
  { campo: 'Subcentro', rotulo: 'Conta do plano', bloco: 2, gravaHoje: true },
  { campo: 'Safra', rotulo: 'Safra', bloco: 2, gravaHoje: true },
  { campo: 'Documento', rotulo: 'Documento', bloco: 2, gravaHoje: true },
  { campo: 'OBS', rotulo: 'Observação', bloco: 2, gravaHoje: true },
];

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
}

export function MesaCamposTabela({
  row, classificacoes, fornecedores, fazendas, clienteId, safras, contas, onEditar, onCriarFornecedor,
}: MesaCamposTabelaProps) {
  const porCampo = new Map(row.comparativo.map(c => [c.campo, c]));
  /* ⚠ RÓTULO EM 104px — 133b-a. Era 120px, e a coluna sobrava largura que faz falta às três
     colunas de conteúdo; nenhum dos quinze rótulos passa de 104px em 11px. */
  /* ⚠ AS TRÊS COLUNAS DE CONTEÚDO EM `minmax(0,1fr)` — 133e item D. O Resultado tinha
     1.3fr e comia a largura de "Sistema atual"; em 1440 a Conta do plano e o Fornecedor
     truncavam de um lado enquanto sobrava espaço do outro. `minmax(0,…)` é o que permite a
     célula ENCOLHER: sem o `0`, o `truncate` não tem em relação a quê truncar. */
  const COLS = '104px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)';

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

      {ORDEM.map(({ campo, rotulo, bloco, gravaHoje }, indice) => {
        /* Zebra pela POSIÇÃO na tabela: o olho segue a linha, e alternar por bloco criaria
           faixas de tamanhos diferentes. */
        const zebra = indice % 2 === 1;
        const c = porCampo.get(campo) ?? VAZIA;
        const igual = c.tom === 'ok';
        const vaiMudar = c.tom === 'muda' || c.tom === 'difere';
        const editavel = gravaHoje && !row.aplicado && !!onEditar;
        const abreBloco2 = bloco === 2 && ORDEM[indice - 1]?.bloco === 1;

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
            <div className={`grid h-[22px] items-center gap-2 border-b border-border/50 px-3 text-[11px] leading-[1.3] ${
              zebra ? 'bg-muted/30' : ''}`}
              style={{ gridTemplateColumns: COLS }}>
              <span className="truncate text-[10px] text-muted-foreground" title={rotulo}>{rotulo}</span>
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
                    classificacoes={classificacoes} onEditar={onEditar} />
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
                  <span
                    title={gravaHoje ? c.resultado : `${c.resultado} — ${MOTIVO_SEM_APPLY}`}
                    className={`flex h-[22px] items-center gap-1.5 truncate rounded border border-border/60 bg-muted px-1.5 ${
                      igual ? 'text-emerald-700 dark:text-emerald-400'
                        : vaiMudar ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'text-muted-foreground'}`}>
                    {igual && <span aria-hidden>✓</span>}
                    <span className="truncate">{c.resultado}</span>
                    {!gravaHoje && (
                      <span className="ml-auto shrink-0 text-[9px] italic opacity-70">leitura</span>
                    )}
                  </span>
                )}
              </div>
            </div>
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
