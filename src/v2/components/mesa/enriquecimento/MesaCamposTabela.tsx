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
const ORDEM: Array<{ campo: string; rotulo: string; gravaHoje: boolean }> = [
  /* ⚠ OS NOMES SÃO OS DO ADAPTER, e mudaram em 133a: a linha única 'Data' virou três, uma
     por par (pagamento×pagamento, vencimento×vencimento, competência×competência). O
     pagamento vem primeiro porque é por ele que o casador procura.
     ⚠ QUINZE CAMPOS EM 133b, e os quatro que entraram são LEITURA: Valor e Tipo dizem o que
     o movimento é (e é por eles que o operador reconhece a linha no extrato), Macro · Grupo
     · Centro mostra onde a conta do plano cai, e Situação diz se o lançamento está vivo.
     ⚠ AS FAIXAS DE SEÇÃO SAÍRAM — 133b-a. DATAS, IDENTIFICAÇÃO e CLASSIFICAÇÃO custavam
     três linhas inteiras para nomear o que a própria ORDEM já agrupa: as datas juntas, o
     movimento junto, a classificação junta. Com elas, 15 campos não cabiam sem rolar. */
  { campo: 'Data pagamento', rotulo: 'Data pgto.', gravaHoje: true },
  { campo: 'Data vencimento', rotulo: 'Data venc.', gravaHoje: true },
  { campo: 'Competência', rotulo: 'Competência', gravaHoje: true },
  { campo: 'Valor', rotulo: 'Valor', gravaHoje: false },
  { campo: 'Tipo', rotulo: 'Tipo', gravaHoje: false },
  { campo: 'Banco', rotulo: 'Conta bancária', gravaHoje: true },
  { campo: 'Subcentro', rotulo: 'Conta do plano', gravaHoje: true },
  { campo: 'Macro · Grupo · Centro', rotulo: 'Macro·Grupo·Centro', gravaHoje: false },
  { campo: 'Fornecedor', rotulo: 'Fornecedor', gravaHoje: true },
  { campo: 'Fazenda', rotulo: 'Fazenda', gravaHoje: true },
  { campo: 'Safra', rotulo: 'Safra', gravaHoje: true },
  { campo: 'Produto / Descrição', rotulo: 'Produto / descr.', gravaHoje: true },
  { campo: 'Documento', rotulo: 'Documento', gravaHoje: true },
  { campo: 'OBS', rotulo: 'Observação', gravaHoje: true },
  { campo: 'Situação', rotulo: 'Situação', gravaHoje: false },
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
  const COLS = '104px minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr)';

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

      {ORDEM.map(({ campo, rotulo, gravaHoje }, indice) => {
        /* Zebra pela POSIÇÃO na tabela: o olho segue a linha, e alternar por bloco criaria
           faixas de tamanhos diferentes. */
        const zebra = indice % 2 === 1;
        const c = porCampo.get(campo) ?? VAZIA;
        const igual = c.tom === 'ok';
        const vaiMudar = c.tom === 'muda' || c.tom === 'difere';
        const editavel = gravaHoje && !row.aplicado && !!onEditar;

        return (
          <div key={rotulo}>
            {/* ⚠ AS TRÊS COLUNAS NA MESMA MEDIDA — 129d item 2. Excel e Sistema estavam em
                11px sobre linha alta enquanto o Resultado ficava dentro de um controle de
                24px: as duas primeiras SALTAVAM, e a tela parecia desalinhada. O que
                distingue é a COR (azul = referência, cinza = o que está gravado), não o
                tamanho.
                ⚠ 24px EXATOS — 133b-a: `padding 3px 12px` + `line-height 1.3` sobre 11px dá
                3 + 18 + 3 = 24. Quinze campos = 360px, que cabem em 900 de altura com o topo
                (44) e o rodapé (44) sem rolar. Trocar o padding por `items-center` num
                container mais alto voltaria a estourar.
                ⚠ NUNCA QUEBRA: `truncate` em cada célula e o texto inteiro no `title`. */}
            <div className={`grid items-center gap-2 border-b border-border/50 px-3 py-[3px] text-[11px] leading-[1.3] ${
              zebra ? 'bg-muted/30' : ''}`}
              style={{ gridTemplateColumns: COLS }}>
              <span className="truncate text-[11px] text-muted-foreground" title={rotulo}>{rotulo}</span>
              {/* ⚠ O EXCEL É REFERÊNCIA, NUNCA GRAVADO DIRETO — por isso azul e sem controle. */}
              <span className="truncate text-blue-700/90" title={c.excel}>{c.excel}</span>
              <span className="truncate text-slate-700 dark:text-slate-300" title={c.sistema}>{c.sistema}</span>
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

      <p className="px-3 py-1 text-[10px] leading-tight text-muted-foreground">
        ✓ confere · faixa âmbar = vai mudar · Excel em azul é referência, nunca gravado
        direto. Deixar um campo vazio remove a proposta dele.
      </p>
    </div>
  );
}
