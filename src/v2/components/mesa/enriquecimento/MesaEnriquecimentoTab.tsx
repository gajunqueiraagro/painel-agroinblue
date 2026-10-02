// ============================================================================
// MesaEnriquecimentoTab — container da Mesa Global de Enriquecimento.
// Consome APENAS ViewModels prontos (via @/v2/lib/mesa/enriquecimentoView) e
// guarda só estado de UI (sessão ativa, filtro, seleção, revisei). Nenhuma regra
// de negócio aqui — a inteligência fica em parser → staging → vw_...preview →
// fn_classificacao_apply. Salvar/Reverter/editar por linha estão ativos (apply_row /
// reverter_row / editar_proposto); Aplicar em lote (fn_classificacao_apply) ligado no P0-1A.
// ============================================================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2, notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { useQueryClient } from '@tanstack/react-query';
import { useClassificacaoStaging, useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';
import {
  toRowVM, toSessoesVM, contarAplicaveisExatos, escolherMelhorSessaoId, estaRevisada,
  motivoReverterBloqueado, bloqueiaPorAgrupamento, rodaSugestoesDoSalvar,
  eixoDaAtividade, culturaSugeridaNoSalvar, patchesAoTrocarAtividade, resumoDesfazerSplit,
  listarContas, filtrarPorConta, resumirGrupos, filtrarPorGrupo, grupoDaLinha,
  sessoesDoMes, sessaoMaisNovaQueAberta, contaEfetivaNome, parteDeAgrupamento, explicadoPorSiMesmo,
  type EnriqGrupo,
} from '@/v2/lib/mesa/enriquecimentoView';
import { EnriquecimentoLista, type EnriquecimentoListaProps } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe } from './EnriquecimentoDetalhe';
import { AcaoEhTransferencia } from './AcaoEhTransferencia';
import type { EnriqRowVM, EnriqSessaoVM } from './types';
import { EnriquecimentoMesaModal, type AcoesDaMesa, type DetalheDaMesa } from './EnriquecimentoMesaModal';
import { EnriquecimentoImportarDialog } from './EnriquecimentoImportarDialog';
import { type VistaPasso2 } from './EnriquecimentoTopoNumeros';
import { PainelContasEnriquecer } from './PainelContasEnriquecer';
import {
  ExtratoDaPlanilhaModal, type GestoAgrupar, type GestoDesfazerBloco, type ResultadoAgrupar,
} from './ExtratoDaPlanilhaModal';
import { passaNoFiltroMesa, type FiltroMesa } from './EnriquecimentoMesaModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useContasComExtratoNoMes } from '@/v2/hooks/useContasComExtratoNoMes';
import { EnriquecimentoTransferencias } from './EnriquecimentoTransferencias';
import { EnriquecimentoSemParSistema } from './EnriquecimentoSemParSistema';
import { useTransferenciasEspelhadas } from '@/v2/hooks/useTransferenciasEspelhadas';
import { useSistemaNaoExplicado } from '@/v2/hooks/useSistemaNaoExplicado';
import { useLancamentosConciliados } from '@/v2/hooks/useLancamentosConciliados';
import { useAliasesFazenda } from '@/v2/hooks/useAliasesFazenda';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';
import { EnriquecerProgressoDialog } from '@/components/conciliacao/EnriquecerProgressoDialog';
import { useGravarLoteEnriquecimento, type LinhaParaGravar } from '@/v2/hooks/useGravarLoteEnriquecimento';
import { EnriquecimentoCandidatosInline } from './EnriquecimentoCandidatosInline';
import { AgruparModal } from './AgruparModal';
import { MesaCamposTabela, CAMPOS_OBRIGATORIOS_SE_TRANSFERENCIA, pendenciasDaLinha } from './MesaCamposTabela';
import { ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { ehLinhaAdministrativa, fazendaAdministrativa } from '@/lib/financeiro/escopoDoSubcentro';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Trash2 } from 'lucide-react';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { baixarCsv, csvLinhaPt } from '@/lib/csv';
import { fmtBRL, fmtData } from './fmt';
import { planoIncoerente } from '@/v2/lib/mesa/atividadeDaLinha';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';
import {
  aguardaAgrupamento, baldeDaLinha, elegivelParaLote, montarPainelContas, MOTIVO_AGUARDA_AGRUPAMENTO, type FiltroPainel,
} from '@/v2/lib/mesa/painelContas';
import { aprenderApelidoDaMesa } from '@/v2/lib/mesa/aprenderApelido';
import { levarAoFornecedor, previaAoFornecedor } from '@/v2/lib/mesa/aoFornecedor';
import { motivoDoDesmembrar } from '@/v2/lib/mesa/desmembrar';
import { Button } from '@/components/ui/button';

export interface MesaEnriquecimentoTabProps {
  anoMesRegua?: string;
  /**
   * 133b — a sessão CONTROLADA pela casca de três passos, quando ela existe.
   *
   * ⚠ DOIS DONOS DA MESMA SESSÃO SERIA O DEFEITO DO B-25 DE VOLTA: a barra de passos
   * mostra os números da sessão e esta tela mostra as linhas dela; se cada uma guardasse
   * a sua, trocar a sessão aqui deixaria o topo falando de outra. Sem as props, a tela
   * segue dona do próprio estado — é assim que ela funciona fora da casca.
   */
  sessaoId?: string | null;
  onSessaoId?: (id: string | null) => void;
  /** 133c — o destino do "Ver no Financeiro" no relatório final do lote. */
  onVerNoFinanceiro?: () => void;
  /** PR-CONC-ENRIQUECER-V2-01 — o botão "1 · Planilha e de-para N" do painel volta ao passo 1 da casca. */
  onPlanilha?: () => void;
  /** As pendências do de-para da planilha lida nesta sessão do navegador; `null` quando nenhuma foi lida. */
  pendentesDePara?: number | null;
}

export function MesaEnriquecimentoTab({
  anoMesRegua, sessaoId: sessaoIdProp, onSessaoId, onVerNoFinanceiro, onPlanilha, pendentesDePara,
}: MesaEnriquecimentoTabProps = {}) {
  const { clienteAtual } = useCliente();
  const { data: sessoes } = useSessoesClassificacao(clienteAtual?.id ?? null);

  // Estado de UI apenas.
  const [sessaoIdLocal, setSessaoIdLocal] = useState<string | null>(null);
  const controlada = sessaoIdProp !== undefined;
  const sessaoId = controlada ? (sessaoIdProp ?? null) : sessaoIdLocal;
  const setSessaoId = (id: string | null) => {
    if (controlada) onSessaoId?.(id); else setSessaoIdLocal(id);
  };
  const [filtroConta, setFiltroConta] = useState<string>('todas');
  /* ⚠ O FILTRO PASSOU A SER POR GRUPO — 133b. Eram treze `match_status`; os chips do topo
     são seis, e filtrar por status enquanto o chip fala de grupo faria o número do chip e
     o tamanho da lista discordarem. */
  const [filtroGrupo, setFiltroGrupo] = useState<VistaPasso2>('todas');
  /**
   * 133h item 3 — a ordem é FIXA: pagamento decrescente, depois valor. O seletor saiu.
   *
   * ⚠ "ORDEM DA PLANILHA" ERA UM CONTROLE PARA UM GESTO QUE ACABOU. Ele fazia sentido
   * quando a tela era o espelho do arquivo e se conferia linha a linha contra o Excel
   * aberto ao lado; desde o 133d a tela é a fila de trabalho do caixa, e ordenar por
   * `excel_linha_origem` põe o de 02/08 depois do de 28/08 porque foi digitado antes.
   * ⚠ E O "Todas | Pendentes" SAIU JUNTO — com os cards do topo virando o filtro (item 1),
   * ele era um segundo recorte sobre o mesmo conjunto, e os dois se contradiziam: "Já
   * gravadas" com "Pendentes" ligado mostrava uma lista vazia sem dizer por quê.
   * ⚠ A JANELA DE GRAÇA MORREU COM ELE, e é remoção, não esquecimento: `graceIds` existia
   * só para a linha recém-gravada não sumir debaixo do cursor sob "Pendentes". Sem o modo,
   * nada some — e um `setState` a cada gravação para alimentar um filtro que não existe
   * mais é o tipo de sobra que este repo já pagou caro.
   */

  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  /**
   * 133b-a correção 2 — as linhas editadas e ainda NÃO gravadas no lançamento.
   *
   * ⚠ A EDIÇÃO NÃO GRAVA NO LANÇAMENTO, grava a PROPOSTA (`fn_classificacao_editar_proposto`).
   * A tela não dizia isso, e o operador que editava um campo via a linha mudar de estado
   * e sumir do recorte — concluindo que tinha gravado. O ponto âmbar e o rodapé desfazem
   * as duas confusões: o que ele mexeu está aqui, e ainda não foi para o lançamento.
   */
  const [editadasIds, setEditadasIds] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * 133c item 1 — as linhas que o operador liberou para SOBRESCREVER.
   *
   * ⚠ POR LINHA E DEFAULT DESLIGADO. `p_overwrite` ligado em lote passaria por cima de
   * classificação que alguém fez à mão depois da importação; a RPC devolve
   * `pulado_subcentro_preenchido` justamente para que isso seja decisão e não efeito.
   */
  const [sobrescreverIds, setSobrescreverIds] = useState<ReadonlySet<string>>(() => new Set());
  const alternarSobrescrever = (id: string) =>
    setSobrescreverIds((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [verProgresso, setVerProgresso] = useState(false);
  /* A confirmação inline do agrupar — uma linha âmbar com Sim/Não, não um modal: a
     pergunta é sobre a linha que está na tela, e um modal a cobriria. */
  const [confirmandoGrupo, setConfirmandoGrupo] = useState(false);
  /* 133i item 1 — o modal onde o agrupamento é escolhido, não apenas aceito. */
  const [agruparOpen, setAgruparOpen] = useState(false);
  /**
   * 133e adendo item 3 — a ordem visível DENTRO da Mesa ampliada.
   *
   * ⚠ A MESA FILTRA POR CONTA E SITUAÇÃO POR CONTA PRÓPRIA, e a navegação daqui andava pela
   * lista da aba: com a Lavoura filtrada lá dentro, "Salvar e próximo" pulava para o Banco
   * do Brasil. Enquanto o modal está aberto, é a ordem DELE que manda — quem sabe o que está
   * visível é ele; quem sabe salvar é esta tela.
   * ⚠ FECHADO, VOLTA A SER A LISTA DA ABA. `null` não é "vazio": é "a Mesa não está mandando".
   */
  const [ordemDaMesa, setOrdemDaMesa] = useState<string[] | null>(null);
  const marcarEditada = (id: string) =>
    setEditadasIds((p) => { const n = new Set(p); n.add(id); return n; });
  const limparEditada = (id: string) =>
    setEditadasIds((p) => { if (!p.has(id)) return p; const n = new Set(p); n.delete(id); return n; });
  const [revisei, setRevisei] = useState(false);
  /**
   * A ATIVIDADE escolhida por linha — PR-CONC-MESA-PAINEL-V1 item 3.
   * ⚠ ESTADO DE TELA, NÃO DE BANCO: a atividade é o filtro da conta do plano (o escopo gravado é cópia do plano). Sem
   *   escolha, vale a proposta (`edicao.atividadeProposta`, o escopo da conta resolvida).
   */
  const [atividadePorLinha, setAtividadePorLinha] = useState<Record<string, string>>({});
  /**
   * A SUGESTÃO DE CULTURA DA PLANILHA RECUSADA, por linha — PR-CONC-ENRIQ-MESA-CULTURA-FASE-B (D5). O operador escolheu outra
   * coisa ("Todas (rateia)" inclusive): a sugestão some e o Salvar não a grava. Estado de tela, como a atividade.
   */
  const [culturaRecusadaIds, setCulturaRecusadaIds] = useState<ReadonlySet<string>>(new Set());
  /**
   * O DESFAZER DO DESMEMBRAMENTO EM ANDAMENTO — PR-CONC-ENRIQ-SPLIT-REVERTER (D8). Por linha (`id`): a simulação do banco
   * (`confirmar`), o motivo (`motivo`) ou a recusa (`erro`). Mora no slot da mensagem do rodapé; trocar de linha o fecha.
   */
  const [desfazerSplit, setDesfazerSplit] = useState<{
    id: string; etapa: 'confirmar' | 'motivo' | 'erro'; texto: string; titulo?: string; editados?: number;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // PR-UX-ENR-MODAL-01 — superfície ampla da mesma mesa. Estado de UI puro:
  // não persiste, não sincroniza com URL, não altera nada do fluxo.
  const [mesaAmpliadaOpen, setMesaAmpliadaOpen] = useState(false);
  /* ── PR-CONC-ENRIQUECER-V2-01 — o painel por conta, o Extrato da planilha e a Mesa por conta (estado de UI). ── */
  const [filtroPainel, setFiltroPainel] = useState<FiltroPainel>('todas');
  const [extratoOpen, setExtratoOpen] = useState(false);
  const [extratoContaId, setExtratoContaId] = useState<string | null>(null);
  const [listaAberta, setListaAberta] = useState<'transferencias' | 'fora' | null>(null);
  /** A conta em que a Mesa abre (`null` = todas) e o recorte inicial da lista dela. */
  const [mesaContaId, setMesaContaId] = useState<string | null>(null);
  const [mesaFiltroInicial, setMesaFiltroInicial] = useState<FiltroMesa>('revisar');
  /** Abre a Mesa numa conta, já numa linha (quando há) e num recorte. */
  const abrirMesa = (contaId: string | null, stagingId: string | null, filtro: FiltroMesa) => {
    setMesaContaId(contaId);
    setMesaFiltroInicial(filtro);
    if (stagingId) setSelecionadoId(stagingId);
    setMesaAmpliadaOpen(true);
  };

  /* Auto-seleção da sessão mais útil na abertura (regra extraída para o módulo puro).
     ⚠ DENTRO DO MÊS DA RÉGUA — 133h item 2. Com o seletor peneirado pelo mês, abrir numa
     sessão de julho enquanto a lista só mostra agosto deixaria o rótulo do gatilho falando
     de uma importação que não está na lista: a tela discordando de si mesma. Sem sessão no
     mês, cai na regra antiga (a mais recente de todas) — melhor que abrir vazio. */
  useEffect(() => {
    if (sessaoId || controlada) return;
    const mes = anoMesRegua ?? null;
    const doMes = mes ? (sessoes ?? []).filter((x) => x.excel_ano_mes === mes) : [];
    const melhor = escolherMelhorSessaoId(doMes.length > 0 ? doMes : sessoes);
    if (melhor) setSessaoIdLocal(melhor);
  }, [sessaoId, sessoes, controlada, anoMesRegua]);

  const {
    staging, isFetching,
    applyRow, isApplyingRow, reverterRow, isRevertingRow, desfazerSplit: desfazerSplitRpc, isDesfazendoSplit,
    apply, isApplying,
    editarProposto,
    resolverProximos, isResolvendoProximos, desfazerProximos,
    resolverGrupo, isResolvendoGrupo, desfazerGrupo,
    splitSubstituir, isSubstituindo,
    /* PR-CONC-ENRIQ-BLOCO-NM-B — o bloco conferido e o casar 1×1 do Extrato da planilha */
    conferirBloco, desfazerBloco, casarManual,
    /* PR-CONC-ENRIQ-BLOCO-ESTADOS — soltar o par de uma linha (modo par do Extrato da planilha) */
    soltarPar,
    casarSessao, isCasando,
    excluirSessao, isExcluindoSessao,
    /* ⚠ `marcarRevisada` SAIU DAQUI — PR-MESA-SALVAR-UNICO-01 item 1. Ela tinha UM chamador
       no front (o ramo "sem diferença" do Salvar e próximo), e ele deixou de existir: o
       botão grava sempre. A RPC continua no banco e exportada pelo hook; o que não existe
       mais é o gesto de marcar revisada SEM gravar. Quem quiser esse gesto de volta precisa
       de uma porta própria — o checkbox "Revisado" desta barra nunca a chamou (ele é o
       estado local que libera o "Aplicar todos os Exatos"). */
  } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

  /* 133c — o motor do passo 3. O progresso vive aqui (no hook), não no diálogo. */
  const lote = useGravarLoteEnriquecimento(sessaoId, clienteAtual?.id);
  /* 133c item 3 — os pares espelhados do MÊS DA RÉGUA (não da sessão): transferência é
     fato do banco, e o mês que se está conciliando é o que a tela mostra. O mês da sessão
     é o fallback, e ele é derivado aqui em cima para não depender de `mesAtivo`, que só
     existe depois da lista de sessões. */
  const mesParaTransferencias = anoMesRegua
    ?? sessoes?.find((sv) => sv.sessao_id === sessaoId)?.excel_ano_mes
    ?? null;
  const transf = useTransferenciasEspelhadas(clienteAtual?.id, mesParaTransferencias);
  /* 133c item 4 — a visão inversa, no escopo da conta selecionada (null = todas). */
  const contaIdSel = (filtroConta === 'todas' || filtroConta === '__sem__') ? null : filtroConta;
  const { data: semParSistema, isLoading: carregandoSemPar } =
    useSistemaNaoExplicado(sessaoId, contaIdSel, mesParaTransferencias);

  /**
   * Recasar a sessão inteira — 133a.
   *
   * ⚠ SEM REIMPORTAR. Resolver um ambíguo ou mapear uma conta no de-para muda o que casa;
   * antes disto, ver o efeito custava reimportar as 492 linhas. A RPC não toca em linha
   * aplicada nem resolvida à mão, então rodar de novo é seguro por construção.
   */
  async function recasar() {
    if (!sessaoId) return;
    const mes = anoMesRegua ?? mesAtivo;
    if (!mes) { toast.error('Escolha o mês na régua para recasar.'); return; }
    try {
      const r = await casarSessao({ sessao_id: sessaoId, ano_mes: mes });
      const agrupam = r.sugestaoGrupo + r.sugestaoSplit;
      toast.success(
        `${r.casou} atualizam · ${r.ambiguo} você decide · ${agrupam} agrupam · ${r.semPar + r.semConta} sem par`);
    } catch (e: unknown) {
      toast.error(`Erro ao recasar: ${errMsg(e)}`);
    }
  }

  /* ⚠ O DRAWER DE CANDIDATOS SAIU — 133b. Os candidatos moram embaixo da tabela, e a linha
     a que eles se referem é a SELECIONADA: não há mais um segundo "id aberto" que pudesse
     divergir da seleção. */

  // PR-U2c-2A — data layer dos editores inline (fonte única: mesmos dados do
  // Lançamento oficial). Loaders manuais → só carrega o necessário.
  /* ⚠ SAFRAS E CONTAS ENTRARAM NO 129c, quando os seis campos passaram a gravar. Sem os
     dois loaders o Select abre vazio e não há o que escolher — foi exatamente o defeito
     do `loadSafras` que o 121e pagou no custeio. */
  const { classificacoes, fornecedores, safras, contasBancarias,
    loadClassificacoes, loadFornecedores, loadSafras, loadContas, criarFornecedor,
    excluirLancamento } = useFinanceiroV2();
  const qcMesa = useQueryClient();
  const { fazendas } = useFazenda();
  /* Os apelidos do de-para — a Mesa resolve a fazenda da planilha pelo mesmo resolvedor do passo 1. */
  const aliasesFazenda = useAliasesFazenda(clienteAtual?.id);
  useEffect(() => {
    if (!clienteAtual?.id) return;
    loadClassificacoes();
    loadFornecedores();
    loadSafras();
    loadContas();
  }, [clienteAtual?.id, loadClassificacoes, loadFornecedores, loadSafras, loadContas]);

  // ViewModels prontos (adapters/selectors puros).
  const sessoesVM = useMemo(() => toSessoesVM(sessoes), [sessoes]);
  const contas = useMemo(() => listarContas(staging), [staging]);
  /**
   * As contas do filtro, com o `tipo_conta` do CADASTRO — 133g item 9.
   *
   * ⚠ O STAGING NÃO SABE O TIPO. `listarContas` devolve id, nome e total lidos de
   * `conta_filtro_id`/`conta_filtro_nome` da view; o tipo mora em
   * `financeiro_contas_bancarias`, e é o join com ele que permite agrupar. Conta que a
   * sessão cita e o cadastro não tem cai em "Outros" — some do dropdown seria pior.
   * ⚠ O NOME É O DO CADASTRO QUANDO EXISTE: o da sessão é um carimbo do dia da importação,
   * e uma conta renomeada depois apareceria aqui com o nome velho.
   */
  const contasDoFiltro = useMemo<ContaSelecionavel[]>(
    () => contas
      .filter((c) => c.id !== '__sem__')
      .map((c) => {
        const cad = contasBancarias.find((cb) => cb.id === c.id);
        return {
          id: c.id,
          nome_conta: `${cad ? (cad.nome_exibicao || cad.nome_conta) : c.nome} (${c.total})`,
          nome_exibicao: null,
          tipo_conta: cad?.tipo_conta ?? null,
        };
      }),
    [contas, contasBancarias]);

  /** "Todas as contas" sempre; "Sem conta" só quando a sessão tem linha sem conta. */
  const itensFixosDoFiltro = useMemo(() => {
    const semConta = contas.find((c) => c.id === '__sem__');
    const itens = [{ value: 'todas', label: 'Todas as contas' }];
    if (semConta) itens.push({ value: '__sem__', label: `Sem conta (${semConta.total})` });
    return itens;
  }, [contas]);
  /* O mês da sessão — o fallback do casador quando a régua não vem por prop. Os rótulos de
     conta/mês do drawer "sistema não explicado" saíram com ele (133b). */
  const mesAtivo = sessoes?.find((s) => s.sessao_id === sessaoId)?.excel_ano_mes ?? null;
  /* O cabeçalho do modal de progresso fala em mês/ano; a régua manda, e o mês da sessão é
     o fallback — a mesma precedência do casador (133a). */
  const [anoDaRegua, mesDaRegua] = (() => {
    const m = /^(\d{4})-(\d{2})$/.exec(anoMesRegua ?? mesAtivo ?? '');
    return m ? [Number(m[1]), Number(m[2])] : [null, null];
  })();

  /**
   * As importações que o seletor oferece — 133h item 2.
   *
   * ⚠ SÓ O MÊS DA RÉGUA, mais recente primeiro. Sem a peneira, o seletor era a história
   * inteira do cliente (166 sessões no NJ) com rótulos que só diferem pelo carimbo — e a
   * de maio ficava a um clique de distância de quem está conciliando agosto.
   * ⚠ QUANDO NÃO HÁ RÉGUA, o mês da sessão ativa é o fallback: é a mesma precedência do
   * casador, e não a de "mostre tudo".
   */
  /* A importação mais nova do mês, quando NÃO é a aberta — PR-CONC-EXCEL-SESSAO-E-DEPARA-01. */
  const sessaoMaisNova = useMemo(
    () => sessaoMaisNovaQueAberta(sessoes, anoMesRegua, sessaoId),
    [sessoes, anoMesRegua, sessaoId]);
  const sessoesDoMesVM = useMemo(
    () => sessoesDoMes(sessoesVM, anoMesRegua ?? mesAtivo),
    [sessoesVM, anoMesRegua, mesAtivo]);

  /**
   * A exclusão de sessão, em dois tempos — 133h item 2.
   *
   * ⚠ O ENSAIO VEM DA MESMA RPC (`p_simular=true`), e é o que a confirmação mostra. Contar
   * as linhas aqui seria uma segunda régua sobre a mesma pergunta; a que manda é a do
   * banco, que também é quem recusa.
   */
  const [exclusaoPendente, setExclusaoPendente] = useState<
    { id: string; label: string; linhas: number } | null>(null);

  async function pedirExclusao(sv: EnriqSessaoVM) {
    setExclusaoPendente(null);
    try {
      const r = await excluirSessao({ sessao_id: sv.id, simular: true });
      if (!r.ok) {
        toast.error(r.motivo === 'sessao_com_linhas_gravadas'
          ? `${r.gravadas ?? 0} linha(s) gravada(s) — esta importação não pode ser excluída.`
          : `Não foi possível excluir: ${r.motivo ?? 'motivo não informado'}.`);
        return;
      }
      setExclusaoPendente({ id: sv.id, label: sv.label, linhas: r.linhas ?? sv.total });
    } catch (e: unknown) {
      toast.error(`Não foi possível excluir: ${errMsg(e)}`);
    }
  }

  async function confirmarExclusao() {
    const alvo = exclusaoPendente;
    if (!alvo) return;
    try {
      const r = await excluirSessao({ sessao_id: alvo.id, simular: false });
      if (!r.ok) {
        toast.error(r.motivo === 'sessao_com_linhas_gravadas'
          ? `${r.gravadas ?? 0} linha(s) gravada(s) — esta importação não pode ser excluída.`
          : `Não foi possível excluir: ${r.motivo ?? 'motivo não informado'}.`);
        return;
      }
      toast.success(`Importação excluída — ${r.apagadas ?? 0} linha(s).`);
      setExclusaoPendente(null);
      /* ⚠ A ATIVA VIRA A MAIS RECENTE DO MÊS, e não "nenhuma": quem apaga uma importação
         velha quer continuar trabalhando no mês, não voltar à tela vazia. A lista ainda
         não foi reconsultada, então a escolha exclui o id apagado à mão. */
      if (alvo.id === sessaoId) {
        const proxima = sessoesDoMesVM.find((x) => x.id !== alvo.id) ?? null;
        setSessaoId(proxima?.id ?? null);
        setFiltroConta('todas');
        setSelecionadoId(null);
      }
    } catch (e: unknown) {
      toast.error(`Não foi possível excluir: ${errMsg(e)}`);
    }
  }
  // Conta é a partição de trabalho: contadores, lista e fluxo derivam do staging DA CONTA.
  const stagingConta = useMemo(() => filtrarPorConta(staging, filtroConta), [staging, filtroConta]);
  /* 133b — os seis números do topo e as somas em R$, da MESMA lista que a tela desenha.
     ⚠ `contarContagens` SAIU DAQUI: ele conta os treze `match_status`, e a tela agora fala
     em seis grupos. Manter os dois faria dois números para a mesma pergunta. Ele continua
     exportado e testado — a mesa ampliada e as telas legadas o usam. */
  const resumo = useMemo(() => resumirGrupos(stagingConta), [stagingConta]);
  // P0-1A: o lote é da SESSÃO (todas as contas) — não pode depender do filtro de conta.
  const nAplicaveis = useMemo(() => contarAplicaveisExatos(staging), [staging]);
  /**
   * 133h-b item 4b — o cadastro entra no adapter para a conta ser comparada por ID.
   *
   * ⚠ `stagingConta.map(toRowVM)` NÃO SERVE MAIS: `Array.map` passa (item, índice, array),
   * e o índice cairia no segundo parâmetro. É o mesmo tropeço clássico do
   * `['1','2'].map(parseInt)`; aqui o TS o pegou, e a arrow explícita é o conserto.
   */
  const contasResolviveis = useMemo<ContaResolvivel[]>(
    () => contasBancarias.map((c) => ({
      id: c.id, nome_conta: c.nome_conta, nome_exibicao: c.nome_exibicao,
      banco: c.banco, agencia: c.agencia, numero_conta: c.numero_conta, aliases: c.aliases,
    })),
    [contasBancarias]);
  const rowsVM = useMemo(
    /* ⚠ OS CATÁLOGOS ENTRAM AQUI — PR-MESA-SUGESTOES-01. São eles que deixam a view calcular a
       safra pela competência e reconhecer uma transferência; sem eles a linha sai como saía
       antes, que é o comportamento de todo teste que monta a view sem catálogo. */
    () => stagingConta.map((r) => toRowVM(r, contasResolviveis, { classificacoes, safras, fazendas, aliasesFazenda })),
    [stagingConta, contasResolviveis, classificacoes, safras, fazendas, aliasesFazenda]);
  /* PR-CONC-MESA-DIVERGENCIA-EXCEL-01 — "N divergem da planilha", do mesmo universo das outras contagens. */
  /* Só os campos de CLASSIFICAÇÃO contam (PR-CONC-MESA-CRU-EXCEL-PREVALECE-01); Produto, Documento e datas ficam só na marca. */
  const divergemPlanilha = useMemo(() => rowsVM.filter((r) => r.divergenciasPlanilha.some((d) => d.contador)).length, [rowsVM]);
  /* 133h item 3 — o único gate é o card do topo; `filtrarPorModo` saiu daqui com o
     "Todas | Pendentes". A função segue exportada e testada, para as telas legadas. */
  /* ⚠ AS DUAS CONTAGENS SAEM DE `rowsVM`, o recorte da CONTA — o mesmo universo do contador
     "Revisado N/96" do rodapé e do "Todas · N" da barra. Contá-las sobre `rowsFiltradas`
     daria o número do recorte de dentro do recorte, e os dois totais deixariam de somar. */
  const revisao = useMemo(() => {
    const revisadas = rowsVM.filter(estaRevisada).length;
    return { aRevisar: rowsVM.length - revisadas, revisadas };
  }, [rowsVM]);

  const rowsGrupo = useMemo(() => filtrarPorGrupo(rowsVM, filtroGrupo), [rowsVM, filtroGrupo]);
  /* ⚠ A ORDENAÇÃO É DA APRESENTAÇÃO, e por isso é a ÚLTIMA: ordenar antes de filtrar daria
     o mesmo resultado com mais trabalho, e ordenar dentro do filtro esconderia que a ordem
     padrão é a da planilha — que é a que o operador tem aberta ao lado. */
  const rowsFiltradas = useMemo(() => {
    /* ⚠ PAGAMENTO CRESCENTE — PR-MESA-ORDEM-REVISADO-01 item A. Era decrescente, e a lista
       abria em 28/08 enquanto o operador trabalha do dia 1 para o 31: ele começava pelo fim
       do mês e descia a lista de trás para frente, conferindo contra uma planilha que está
       em ordem de calendário ao lado. O envelope 133e escolheu decrescente para pôr o
       movimento mais recente no topo; a medição na mesa desfez a escolha.
       ⚠ DENTRO DO DIA, A ORDEM É A DE ANTES: valor decrescente. Só o eixo do dia virou.
       ⚠ LINHA SEM DATA CONTINUA NO FIM, e agora isso é explícito: em ordem crescente a
       string vazia iria para o TOPO, e um punhado de linhas sem data abrindo o mês é o
       oposto do que este item pede. `dataIso` vem `YYYY-MM-DD` do adapter — comparação de
       string, sem `Date` e sem desformatar o que já foi formatado. */
    return [...rowsGrupo].sort((a, b) => {
      const da = a.dataIso ?? ''; const db = b.dataIso ?? '';
      if (!da !== !db) return da ? -1 : 1;
      if (da !== db) return da.localeCompare(db);
      return Math.abs(b.valorNum ?? 0) - Math.abs(a.valorNum ?? 0);
    });
  }, [rowsGrupo]);

  /**
   * 133b-a correção 2 — a linha SELECIONADA nunca sai do recorte.
   *
   * ⚠ EDITAR MUDAVA O ESTADO DA LINHA E ELA SUMIA DEBAIXO DO CURSOR: o operador escolhia
   * um subcentro, o `will_change_anything` virava, o filtro reavaliava e a linha que ele
   * estava editando desaparecia — com o painel da direita esvaziando junto. O recorte só
   * volta a valer para ela quando o operador troca de filtro ou vai para a próxima, que
   * são os dois momentos em que ele já não está olhando para ela.
   * ⚠ FIXADA NA POSIÇÃO ORIGINAL, não empurrada para o fim: `Anterior`/`Próximo` andam
   * pela lista que está na tela, e realocá-la faria a navegação pular.
   */
  const rowsNaTela = useMemo(() => {
    if (!selecionadoId || rowsFiltradas.some((r) => r.id === selecionadoId)) return rowsFiltradas;
    const presa = rowsVM.find((r) => r.id === selecionadoId);
    if (!presa) return rowsFiltradas;
    const posicaoOriginal = rowsVM.findIndex((r) => r.id === selecionadoId);
    const antes = rowsFiltradas.filter((r) => rowsVM.findIndex((x) => x.id === r.id) < posicaoOriginal);
    return [...antes, presa, ...rowsFiltradas.slice(antes.length)];
  }, [rowsFiltradas, rowsVM, selecionadoId]);
  const selecionado = rowsNaTela.find((r) => r.id === selecionadoId) ?? null;
  /* ── CULTURA-FASE-B: o eixo de rateio da linha selecionada (a atividade escolhida, senão a proposta) e as culturas
     plantadas na safra dela — SÓ NA LAVOURA (pecuária e o resto não consultam). O cache é do dono (`useCulturasDaSafra`):
     uma consulta por safra por sessão. */
  const atividadeSel = selecionado ? (atividadePorLinha[selecionado.id] ?? selecionado.edicao.atividadeProposta) : null;
  const eixoSel = eixoDaAtividade(atividadeSel);
  const safraSel = selecionado
    ? (selecionado.edicao.safraId ?? selecionado.edicao.safraIdAtual ?? selecionado.edicao.safraSugeridaId) : null;
  const culturasDaSafraSel = useCulturasDaSafra(eixoSel === 'cultura' ? safraSel : null);
  /* SPLIT-REVERTER: o fluxo do desfazer é da linha em que começou — trocar de linha o fecha */
  useEffect(() => { setDesfazerSplit((d) => (d && d.id !== selecionadoId ? null : d)); }, [selecionadoId]);

  /* ⚠ O "A revisar é o default" (PR-MESA-ORDEM-REVISADO-01 item C) SAIU COM A LISTA DA TELA PRINCIPAL —
     PR-CONC-ENRIQUECER-V2-01: o recorte agora é da Mesa (Revisar / Feitas / Todas, por conta), e a lista que ela recebe
     é a sessão inteira, na ordem da tela. */

  /**
   * A primeira linha que ainda pede trabalho, na ordem da tela — item A.
   *
   * ⚠ SAI DE `rowsNaTela`, e não de `rowsVM`: a Mesa abre na lista que está na tela, com o
   * filtro e a conta que o operador escolheu. Apontar para uma linha fora do recorte faria
   * a Mesa abrir numa linha que a lista atrás dela não mostra.
   * ⚠ SEM NENHUMA A REVISAR, A PRIMEIRA DA LISTA. O mês fechado ainda se consulta.
   */
  const primeiraNaoRevisada = useMemo(
    () => rowsNaTela.find((r) => !estaRevisada(r)) ?? rowsNaTela[0] ?? null,
    [rowsNaTela]);

  // PR-MESA-RESOLUCAO-01 / PR-DRAWER-1TO1-01 — lançamentos já vinculados por QUALQUER linha
  // da sessão (lanc_id = match_lancamento_id via view) → o drawer os oculta (o guard
  // server-side é a trava real) e mostra QUAIS linhas os usaram. Map: lanc_id → linhas Excel.
  const lancIdsUsados = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const r of staging) {
      if (!r.lanc_id) continue;
      const arr = m.get(r.lanc_id) ?? [];
      if (r.excel_linha_origem != null && !arr.includes(r.excel_linha_origem)) arr.push(r.excel_linha_origem);
      m.set(r.lanc_id, arr);
    }
    return m;
  }, [staging]);
  /** A linha CRUA da selecionada — a faixa de candidatos precisa do valor e da data do Excel. */
  const linhaCrua = useMemo(
    () => staging.find((r) => r.staging_id === selecionadoId) ?? null,
    [staging, selecionadoId],
  );

  /**
   * As `staging_ids` do grupo de split — 133c-a.
   *
   * ⚠ SAEM DO `casamento_meta.grupo_ids` QUE O CASADOR GRAVOU. Remontar o grupo aqui (por
   * dia + conta + soma) seria a segunda resposta para "quais linhas compõem este movimento",
   * e ela divergiria do banco na primeira mudança da regra do casador.
   */
  const gruposIdsDoSplit = useMemo((): string[] => {
    const meta = linhaCrua?.casamento_meta;
    const ids = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).grupo_ids : null;
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  }, [linhaCrua]);

  /**
   * A linha precisa que o proposto seja alinhado ao Resultado antes de gravar? — 133h-b item 8.
   *
   * ⚠ O 133h COBRIU SÓ A LINHA EDITADA, e a medição mostra o tamanho do buraco: das 27.153
   * linhas do NJ Pecuária com proposta fora do plano, 16.236 têm subcentro no sistema — nelas o
   * Resultado é "mantém", `edicao.subcentro === subcentroAtual`, e a condição antiga
   * (`!==`) as deixava passar com o texto cru no proposto. Eram justamente as linhas que o
   * operador NÃO toca, isto é, quase todas as do lote.
   * ⚠ AS 10.917 SEM SUBCENTRO NENHUM CONTINUAM DE FORA, e é o certo: não há Resultado a
   * alinhar, e a trava do obrigatório ("falta: conta do plano") é quem responde por elas.
   * ⚠ O BANCO JÁ SE DEFENDE desde a migration 20260908121828 — ele descarta a conta do
   * plano fora do plano oficial em vez de deixar o trigger derrubar a transação. A tela
   * alinha assim mesmo: deixar lixo no `update_proposto` faria o próximo leitor dele (uma
   * RPC nova, um relatório) herdar um texto que não existe no plano.
   */
  const precisaAlinhar = (r: EnriqRowVM): boolean =>
    !!r.avisoPlanilha && !!r.edicao.subcentro;

  /**
   * Os números do agrupamento — 133h-b item 3.
   *
   * ⚠ A FAIXA DIZIA "Esta linha e mais 2 do mesmo dia somam um único movimento" E NENHUM
   * NÚMERO. O operador tinha de aceitar no escuro um gesto que CANCELA um lançamento e cria
   * outros dois. Agora ela mostra os três lados: o que o extrato tem, o que a planilha
   * soma, e se bate.
   * ⚠ AS PARTES SAEM DO `staging` PELOS `grupo_ids` DO CASADOR — nunca remontadas por
   * dia+conta+soma aqui, que seria a segunda resposta para a mesma pergunta.
   * ⚠ CENTAVOS EM INTEIRO: a diferença é a razão de existir da faixa, e comparar float
   * acenderia "passa R$ 0,00".
   */
  const grupoDoSplit = useMemo(() => {
    if (gruposIdsDoSplit.length < 2) return null;
    const ids = new Set(gruposIdsDoSplit);
    const partes = staging.filter((r) => ids.has(r.staging_id));
    const somaCent = partes.reduce((acc, r) => acc + Math.round((Number(r.excel_valor) || 0) * 100), 0);
    const lancCent = Math.round((Number(linhaCrua?.lanc_valor) || 0) * 100);
    return {
      partes,
      soma: somaCent / 100,
      lancValor: lancCent / 100,
      diferencaCent: lancCent - somaCent,
      bate: lancCent === somaCent,
      /* Faltam partes na sessão carregada? Aí a soma não representa o grupo. */
      completo: partes.length === gruposIdsDoSplit.length,
    };
  }, [gruposIdsDoSplit, staging, linhaCrua]);
  /**
   * POR QUE o desmembrar não abre — PR-CONC-ENRIQ-AGRUP-2a, decisão do Gabriel (iv): a soma da planilha tem de fechar com
   * o lançamento AO CENTAVO; sem isso o bloco fica sem proposta e não se desmembra à mão. A RPC recusa pela mesma conta
   * (`soma_divergente`, centavos inteiros).
   */
  const motivoDesmembrar: string | null = motivoDoDesmembrar(grupoDoSplit ? {
    completo: grupoDoSplit.completo, bate: grupoDoSplit.bate, diferencaCent: grupoDoSplit.diferencaCent,
    carregadas: grupoDoSplit.partes.length, total: gruposIdsDoSplit.length,
  } : null);

  /**
   * As linhas que PODEM compor este movimento — 133i item 1.
   *
   * ⚠ NÃO É O `grupo_ids`, É O UNIVERSO: todas as linhas do MESMO DIA e da MESMA CONTA que
   * ainda não têm par. O casador acerta a maioria e erra na margem; com o conjunto fechado
   * na sugestão, um acerto de 2 em 3 não tinha gesto de conserto.
   *
   * ⚠ ESPELHA OS GUARDS (d) e (f) DA RPC, e é por isso que a tela não oferece o que o banco
   * recusa: mesmo `match_status` elegível, sem `match_lancamento_ids`, não aplicada, e conta
   * compatível. Conferido na definição de `fn_classificacao_split_substituir`.
   *
   * ⚠ `conta_filtro_id` SERVE AQUI, e só aqui, porque a linha NÃO tem lançamento: nesse
   * caso ele é `COALESCE(s.conta_origem_id, s.conta_destino_id)` — exatamente a coluna que
   * o guard (f) lê. Com lançamento, ele traria a conta do lançamento e a comparação seria
   * outra.
   *
   * ⚠ O DIA SAIU DO FILTRO E VIROU ORDENAÇÃO — PR-ENRIQ-AGRUPAR-01. A versão anterior
   * excluía quem tivesse `excel_data` diferente do dia do lançamento, medindo "nos 20 grupos
   * do NJ Pecuária nenhum grupo cruza dias". A medida estava certa e a conclusão não: em
   * Agnaldo o grupo de 03/08 tem quatro linhas de 31/07 e uma de 28/07 (DAEMS, R$ 33,61), e
   * o filtro escondia justamente a que o casador já havia sugerido — o painel contava cinco,
   * o modal mostrava quatro, e não havia gesto para trazê-la.
   *
   * ⚠ E A RPC NÃO TEM GUARD DE DATA. Os oito guards de `fn_classificacao_split_substituir`
   * são permissão, lançamento vivo, não-referenciado, ids elegíveis, soma, conta, um extrato
   * e subcentro canônico — `excel_data` não aparece em nenhum. O filtro do dia era MAIS
   * restritivo que o banco, o contrário do que este bloco se propõe a fazer.
   *
   * A data continua mandando na ORDEM: as do dia do lançamento primeiro, depois as demais
   * por data — o que é provável de compor vem antes, sem que nada fique inalcançável.
   */
  const ELEGIVEL_PARA_GRUPO = useMemo(
    () => new Set(['sem_match', 'sem_conta_para_match', 'candidatos_proximos', 'sugestao_split']),
    []);
  const candidatasDoGrupo = useMemo(() => {
    if (!linhaCrua?.lanc_id) return [];
    const dia = linhaCrua.excel_data;
    if (!dia) return [];
    const contasDoLanc = new Set(
      [linhaCrua.lanc_conta_bancaria_id, linhaCrua.lanc_conta_destino_id].filter((x): x is string => !!x));
    const elegiveis = staging.filter((r) => {
      if (r.aplicado) return false;
      if (!ELEGIVEL_PARA_GRUPO.has(String(r.match_status))) return false;
      if (r.match_lancamento_ids) return false;
      /* ⚠ `lanc_id`, NÃO `match_lancamento_id`: a coluna crua não existe na view — ela é o
         JOIN, e o que sobra é `l.id`. Canto conhecido: se o `match_lancamento_id` apontar
         para um lançamento cancelado, o JOIN não traz e a linha aparece aqui como livre;
         a RPC recusaria com `staging_invalido`, e o erro chega ao operador pelo toast. */
      if (r.lanc_id && r.lanc_id !== linhaCrua.lanc_id) return false;
      /* Sem conta na linha, o guard (f) aceita — a conta virá do lançamento. */
      if (!r.conta_filtro_id) return true;
      return contasDoLanc.size === 0 || contasDoLanc.has(r.conta_filtro_id);
    });
    /* Mesma data do lançamento primeiro; depois, as demais em ordem de data. */
    return [...elegiveis].sort((a, b) => {
      const pa = a.excel_data === dia ? 0 : 1;
      const pb = b.excel_data === dia ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.excel_data ?? '') < (b.excel_data ?? '') ? -1 : (a.excel_data ?? '') > (b.excel_data ?? '') ? 1 : 0;
    });
  }, [staging, linhaCrua, ELEGIVEL_PARA_GRUPO]);

  /**
   * A lista pela qual se NAVEGA — 133e adendo item 3.
   *
   * ⚠ É A QUE ESTÁ NA TELA, sempre: a da Mesa quando ela está aberta (ela tem filtro
   * próprio), a da aba quando não está. Navegar por um universo maior que o visível é o que
   * fazia o "próximo" trocar de conta sem o operador pedir.
   */
  const ordemNavegacao = useMemo(() => {
    if (!mesaAmpliadaOpen || !ordemDaMesa) return rowsNaTela;
    const porId = new Map(rowsNaTela.map((r) => [r.id, r]));
    return ordemDaMesa.map((id) => porId.get(id)).filter((r): r is EnriqRowVM => !!r);
  }, [mesaAmpliadaOpen, ordemDaMesa, rowsNaTela]);

  // Navegação read-only entre linhas da lista (Anterior/Próximo) — só troca a seleção.
  const idx = ordemNavegacao.findIndex((r) => r.id === selecionadoId);
  const canAnterior = idx > 0;
  const canProximo = ordemNavegacao.length > 0 && idx < ordemNavegacao.length - 1;
  const irAnterior = () => { if (canAnterior) setSelecionadoId(ordemNavegacao[idx - 1].id); };
  const irProximo = () => {
    if (idx < 0) { if (ordemNavegacao.length) setSelecionadoId(ordemNavegacao[0].id); }
    else if (canProximo) setSelecionadoId(ordemNavegacao[idx + 1].id);
  };
  /* "Linha n / N" no MESMO recorte da navegação — dois universos com um rótulo só seria a
     tela dizendo que faltam 200 quando o recorte tem 9. */
  const posicao = `${idx >= 0 ? idx + 1 : '—'} / ${ordemNavegacao.length}`;

  /**
   * 133h adendo item 15 — o erro do banco na ÚLTIMA gravação desta linha.
   *
   * ⚠ POR LINHA, e some ao trocar de linha ou ao gravar com sucesso: um erro que sobrevive
   * à navegação acusa a linha errada, que é pior que não acusar.
   */
  const [erroBanco, setErroBanco] = useState<{ id: string; msg: string } | null>(null);
  /**
   * O ERRO DA EDIÇÃO DE UM CAMPO — PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D9. Era toast no canto (UX-TOAST-01); agora mora
   * no rodapé, por linha, como o `erroBanco`. `versaoRestauro` sobe a cada recusa e remonta a grade: o campo recusado
   * volta ao valor que o banco tem, em vez de ficar com o rascunho parecendo aceito.
   */
  const [erroEdicao, setErroEdicao] = useState<{ id: string; msg: string } | null>(null);
  const [versaoRestauro, setVersaoRestauro] = useState(0);

  // R1 — Promise da edição em voo (commit-on-blur de Produto/Documento). salvar() a aguarda
  // antes do apply, para o apply_row NUNCA ler update_proposto antes do editar_proposto commitar.
  const pendingEditRef = useRef<Promise<unknown> | null>(null);

  // Escrita por linha (PR-U1). Salvar = apply_row(overwrite=true); Reverter = reverter_row.
  const isBusy = isApplyingRow || isRevertingRow || isApplying || isDesfazendoSplit;
  // Linha órfã (subcentro fora do plano) não pode ser aplicada — a trigger do
  // lançamento rejeita. Só será salvável após editar o subcentro (PR-U2).
  /**
   * 133g item 6 — os obrigatórios VAZIOS no Resultado, pelo nome.
   *
   * ⚠ A LISTA VEM DA TABELA, não de uma segunda lista aqui: `CAMPOS_OBRIGATORIOS_MESA` é a
   * mesma `ORDEM` que desenha o asterisco vermelho. Duas listas divergiriam no dia em que um
   * campo entrasse ou saísse, e o operador veria asterisco num campo que não trava — ou o
   * contrário, que é pior.
   */
  const obrigatoriosVazios = useMemo(() => {
    if (!selecionado) return [];
    /* ⚠ A LISTA MORA NA TABELA DESDE O PR-CONC-ENRIQUECER-V2-01 (`pendenciasDaLinha`): o checklist da Mesa desenha, o
       rodapé escreve "falta: ..." e este botão se apaga pela MESMA função. Antes era uma segunda lista aqui, com pares
       campo×rótulo próprios. As regras são as de antes: obrigatório vazio no Resultado; Atividade vazia e plano de
       outra atividade só com o catálogo na mão; transferência sem conta de destino. */
    return pendenciasDaLinha(selecionado, {
      classificacoes, atividade: atividadePorLinha[selecionado.id] ?? null,
    });
  }, [selecionado, classificacoes, atividadePorLinha]);

  /* PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL — a linha GRAVADA grava de novo só com alteração pendente (D3); o Reverter
     depende do estado anterior que o banco guardou (D4). */
  const gravadaSel = selecionado?.gravada ?? null;
  const motivoReverter = selecionado ? motivoReverterBloqueado(selecionado) : null;
  const podeSalvar = !!selecionado && (!selecionado.aplicado || !!gravadaSel?.alterada) && selecionado.temMatch
    /* 133i item 11 — parte de agrupamento só entra no lançamento pelo Agrupar; o filho de split gravado passa (D7). */
    && !bloqueiaPorAgrupamento(selecionado)
    && obrigatoriosVazios.length === 0;
  const podeReverter = !!selecionado && selecionado.aplicado && !motivoReverter;
  /**
   * 133b-a correção 1 — POR QUE o Salvar está apagado, escrito ao lado.
   *
   * ⚠ SÃO DOIS MOTIVOS, E SÓ DOIS: a linha não tem lançamento vinculado, ou a proposta de
   * subcentro está fora do plano oficial (a trigger do lançamento recusa). Nenhum deles é
   * "falta revisar" — e era isso que a tela dava a entender, obrigando o operador a
   * redigitar um subcentro que já estava certo para "liberar" o botão.
   */
  /**
   * ⚠ SALVAR DESABILITA SÓ COM OBRIGATÓRIO VAZIO — 133g item 6. "Sem lançamento vinculado"
   * continua sendo trava porque sem ele não há o que atualizar; o resto virou aviso.
   */
  const motivoSalvar: string | null =
    !selecionado ? 'Escolha uma linha.'
    /* D3/D4 — a gravada sem alteração não tem o que gravar; o "use Reverter" saiu (o Reverter diz o próprio motivo). */
    : selecionado.aplicado && !gravadaSel?.alterada ? 'Já gravada: altere um campo para gravar de novo.'
    /* PR-CONC-ENRIQ-BLOCO-NM-B — o bloco conferido não grava no lançamento: a linha é leitura; desfaz-se pelo Extrato. */
    : selecionado.status === 'conferido_bloco'
      ? 'Conferida em bloco: os lançamentos já estão classificados — desfaça pelo Extrato da planilha.'
    /* PR-CONC-ENRIQ-AGRUP-2a — resolvida como grupo (N lançamentos), sem gravação até o 2b: diz POR QUE, em vez de
       "sem lançamento vinculado" (ela tem N). */
    : aguardaAgrupamento({ aplicado: selecionado.aplicado, match_status: selecionado.status }) ? MOTIVO_AGUARDA_AGRUPAMENTO
    : !selecionado.temMatch ? 'Sem lançamento vinculado: escolha um candidato antes de gravar.'
    /* ⚠ 133i item 11 — PARTE DE AGRUPAMENTO NÃO SE GRAVA SOZINHA. O `apply_row` aplica a
       linha por cima do lançamento CONSOLIDADO, e o consolidado vale a soma das partes:
       gravar uma delas escreve a classificação de R$ 8.000 num lançamento de R$ 25.590,80,
       e a segunda linha sobrescreve a primeira. Foi o que aconteceu no DARF de 25.590,80,
       com duas linhas gravadas sobre o mesmo lançamento. O gesto certo é Agrupar, que
       cria uma linha por parte. */
    : bloqueiaPorAgrupamento(selecionado)
      ? 'Faz parte de um agrupamento — use Agrupar.'
    /* ⚠ A TRANSFERÊNCIA GANHA FRASE PRÓPRIA — PR-MESA-SUGESTOES-01 §2. "Falta preencher: Conta
       destino" descreve o campo; "Transferência exige conta de destino" descreve a REGRA, e é a
       regra que explica por que um campo que não existe nas outras linhas apareceu nesta. A
       genérica continua valendo para todo o resto, inclusive quando falta mais de um campo. */
    : (ehTipoTransferencia(selecionado.edicao.tipoOperacao)
        && !(selecionado.edicao.contaDestinoId ?? selecionado.edicao.contaDestinoIdAtual)
        && obrigatoriosVazios.length === CAMPOS_OBRIGATORIOS_SE_TRANSFERENCIA.length)
      ? 'Transferência exige conta de destino.'
    : obrigatoriosVazios.length > 0
      ? `Falta preencher: ${obrigatoriosVazios.join(', ')}.`
    : null;
  /* ⚠ O "SÓ SEGUIR" DA LINHA GRAVADA SAIU — PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D3 (era o 133i item 2c, `soAvanca`).
     A linha gravada passou a ser editável: com alteração pendente o botão principal é "Gravar alteração"; sem ela, fica
     apagado e o rodapé diz "já gravada". Seguir é o ▶ e o Pular. As diferenças REAIS (`diferencasDoResultado`, 133h item
     10) agora decidem dentro do estado da linha gravada (`EnriqRowVM.gravada.alterada`), um dono só. */

  /* ⚠ 133h item 9 — "revisado" É `revisado_em` OU `aplicado`: gravar uma linha é a forma
     mais forte de tê-la revisado, e contá-la como pendente faria o contador nunca fechar. */
  const revisadas = useMemo(
    () => rowsVM.filter((r) => !!r.revisadaEm || r.aplicado).length,
    [rowsVM]);
  /* 133i item 7 — classificados sem produto ou sem fornecedor, no recorte da tela. */
  const incompletos = useMemo(() => rowsVM.filter((r) => r.lancamentoIncompleto).length, [rowsVM]);

  /* 133h item 12 — quais lançamentos da sessão vieram do extrato. */
  const lancIdsDaSessao = useMemo(
    () => rowsVM.map((r) => r.lancId).filter((x): x is string => !!x),
    [rowsVM]);
  const { conciliados } = useLancamentosConciliados(lancIdsDaSessao);
  const selecionadoConciliado = !!selecionado?.lancId && conciliados.has(selecionado.lancId);

  /* ── 133i-c item 1 — quando a ação de transferência cabe nesta linha ──────────
     O sentido sai do MESMO ternário da lista sem par: '3…' já é transferência (null),
     '1…' entrada, '2…' saída. */
  const sentidoDaLinha: 'entrada' | 'saida' | null = (() => {
    const t = (selecionado?.edicao.tipoOperacao ?? '').trim();
    if (t.startsWith('3')) return null;
    if (t.startsWith('1')) return 'entrada';
    if (t.startsWith('2')) return 'saida';
    return null;
  })();

  /* PR-CONC-MESA-TRANSFERENCIA-VOLTA — a recusa do gesto fica ESCRITA no Dialog, junto do botão (UX-TOAST-01); trocar de
     linha a apaga. */
  const [erroTransferencia, setErroTransferencia] = useState<string | null>(null);
  useEffect(() => { setErroTransferencia(null); }, [selecionadoId]);

  const podeMarcarTransferencia = !!selecionado
    && !!selecionado.lancId
    && sentidoDaLinha !== null
    && !explicadoPorSiMesmo({
         tipo_operacao: selecionado.edicao.tipoOperacao,
         subcentro: selecionado.edicao.subcentroAtual ?? null,
       });

  /* A lista de contas no formato do seletor — a MESMA que a aba já monta para os campos. */
  const contasParaTransferencia = useMemo(
    () => contasBancarias.map((c) => ({
      id: c.id,
      nome_conta: c.nome_conta,
      nome_exibicao: c.nome_exibicao ?? null,
      tipo_conta: c.tipo_conta ?? null,
    })),
    [contasBancarias]);

  /**
   * O que a planilha diz e o extrato desmente — 133h item 12.
   *
   * ⚠ NUNCA VIRA GRAVAÇÃO, e por isso é uma lista e não um bloqueio: a RPC já ignora estes
   * campos em linha conciliada. O que faltava era o operador SABER — "se salvar errado, tem
   * que me mostrar a divergência".
   */
  const divergenciasDoExtrato = useMemo(() => {
    if (!selecionado || !selecionadoConciliado) return [] as string[];
    /* ⚠ A COMPARAÇÃO SAIU DAQUI — 133h-b item 4e. Ela era feita por TEXTO sobre o
       `comparativo` ("2-Saídas" × "Saída", nome longo da conta × nome do cadastro, valor da
       parte × valor do agrupado) e o rodapé gritava divergência em quase toda linha. Agora
       o adapter já entrega a lista peneirada, e o rodapé só existe quando ela sobra. */
    return selecionado.divergenciasBanco.map((d) => `${d.rotulo} (${d.banco} × ${d.planilha})`);
  }, [selecionado, selecionadoConciliado]);

  // Extrai mensagem humana de qualquer erro (PostgrestError não é instanceof Error).
  const errMsg = (e: unknown): string => {
    if (e instanceof Error && e.message) return e.message;
    if (e && typeof e === 'object' && 'message' in e && (e as any).message) return String((e as any).message);
    try { return JSON.stringify(e); } catch { return String(e); }
  };

  const MOTIVO_MSG: Record<string, string> = {
    sem_lancamento_vinculado: 'Sem lançamento vinculado — resolva o ambíguo ou não é possível salvar sem match.',
    lancamento_inexistente_ou_cancelado: 'Lançamento não encontrado ou cancelado.',
    pulado_subcentro_preenchido: 'Subcentro já preenchido — nada a gravar no modo conservador.',
    sem_permissao: 'Sem permissão para este cliente.',
    nada_a_reverter: 'Nada a reverter nesta linha.',
    // PR-MESA-RESOLUCAO-01
    nao_candidatos_proximos: 'Esta linha não está em "candidatos próximos".',
    candidato_invalido: 'Candidato fora da janela — recarregue os candidatos.',
    lancamento_ja_escolhido: 'Lançamento já escolhido por outra linha desta sessão.',
    nao_resolvido: 'Linha não está resolvida manualmente.',
    // PR-MESA-GRUPO-01
    status_nao_elegivel: 'Só linhas em "candidatos próximos" ou "sem match" podem ser agrupadas.',
    use_resolver_proximos: 'Um único lançamento — use "Escolher candidato" (não agrupamento).',
    soma_divergente: 'A soma dos selecionados não bate com o valor do Excel.',
    ids_duplicados: 'Há lançamentos repetidos na seleção.',
    lista_vazia: 'Selecione ao menos dois lançamentos para agrupar.',
    nao_resolvido_grupo: 'Linha não está resolvida como grupo.',
  };

  /* ⚠ CRIAR GRUPO SAIU DA TELA JUNTO COM O DRAWER — 133b, e é perda declarada, não
     descuido: a composição por soma (N lançamentos = 1 linha da planilha) era a segunda
     seção do `EnriquecimentoCandidatosDrawer`, com seleção múltipla e conferência de soma
     ao vivo. Ela volta na 133c, que é onde o envelope pôs "agrupamento com ação".
     ⚠ `fn_classificacao_resolver_grupo` e `fn_classificacao_candidatos_grupo` CONTINUAM
     INTACTAS no banco, e `desfazerGrupo` segue ligado no botão da direita: as sessões que
     já têm grupos resolvidos podem desfazê-los. O que falta é criar um novo. */
  /**
   * Juntar N lançamentos NESTA linha — 133c item 2, o caso `sugestao_grupo`.
   *
   * ⚠ O CASO `sugestao_split` (N linhas = 1 lançamento) NÃO TEM BOTÃO, e a medição é a
   * razão: `fn_classificacao_split_substituir` recusa por construção as linhas que o
   * casador do 133a produz. Ela exige `match_lancamento_id IS NULL` (guard d) e recusa com
   * `ja_referenciado` quando alguma linha da sessão aponta para o lançamento (guard c) —
   * e as 16 linhas `sugestao_split` do Proto têm as duas coisas, porque o casador já lhes
   * atribuiu o alvo. A RPC foi escrita para o fluxo ANTIGO, em que o operador escolhia o
   * lançamento à mão no drawer. Um botão aqui falharia em 100% dos cliques. Reportado.
   */
  async function handleJuntarNestaLinha(lancIds: string[]) {
    if (!selecionadoId || lancIds.length === 0) return;
    setConfirmandoGrupo(false);
    try {
      const res: any = await resolverGrupo({ staging_id: selecionadoId, lancamento_ids: lancIds });
      if (res?.ok) toast.success(`Grupo criado — ${lancIds.length} lançamentos nesta linha.`);
      else toast.error(res?.mensagem ?? MOTIVO_MSG[res?.motivo] ?? `Não agrupado (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao agrupar: ${errMsg(e)}`);
    }
  }

  /**
   * N linhas = 1 lançamento — 133c-a, o caso `sugestao_split`.
   *
   * ⚠ OS IDS SÃO OS DE `casamento_meta.grupo_ids`, gravados pelo casador do 133a — não uma
   * lista montada aqui. Reconstruir o grupo no front seria a segunda resposta para "quais
   * linhas compõem este movimento", e ela divergiria do banco na primeira mudança da regra.
   * ⚠ O EFEITO É PESADO E A RPC É ATÔMICA: cria N lançamentos, cancela o consolidado e
   * religa o vínculo do extrato aos novos. Por isso a pergunta vem antes, na própria linha.
   */
  async function handleAgruparNesteLancamento(lancamentoId: string, stagingIds: string[]) {
    if (!sessaoId || stagingIds.length < 2) return;
    setConfirmandoGrupo(false);
    try {
      const res: any = await splitSubstituir({
        lancamento_id: lancamentoId, sessao_id: sessaoId, staging_ids: stagingIds,
      });
      if (res?.ok) {
        const n = Array.isArray(res.lancamentos_criados) ? res.lancamentos_criados.length : stagingIds.length;
        toast.success(`${n} lançamentos criados no lugar do consolidado.`);
        /* O extrato mudou de dono e o consolidado foi cancelado: o Financeiro precisa saber. */
        if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      } else {
        toast.error(res?.mensagem ?? MOTIVO_MSG[res?.motivo] ?? `Não agrupado (${res?.motivo ?? 'erro'}).`);
      }
    } catch (e: unknown) {
      toast.error(`Erro ao agrupar: ${errMsg(e)}`);
    }
  }

  /**
   * O AGRUPAR DO EXTRATO DA PLANILHA — PR-CONC-ENRIQ-AGRUP-2b-TELA; o bloco e o casar 1×1 no PR-CONC-ENRIQ-BLOCO-NM-B. A
   * seleção do modal (linhas "sem par" × lançamentos "Só no sistema") grava pelos mutations do hook, sem toast e sem
   * avançar de linha: o modal escreve a recusa na barra (UX-TOAST-01) e mantém a seleção. A frase é a da RPC
   * (`res.mensagem`); `MOTIVO_MSG` só cobre a RPC antiga que não a manda.
   *   bloco      -> `conferirBloco`  (N linhas × M lançamentos classificados; nada se grava no lançamento)
   *   casar      -> `casarManual`    (1×1; cru: a planilha sobe para a proposta; classificado: bloco 1×1 no banco)
   *   desmembrar -> `splitSubstituir` · juntar -> `resolverGrupo` (como no 2b)
   *   soltar     -> `soltarPar`      (PR-CONC-ENRIQ-BLOCO-ESTADOS: a linha volta a não ter par; o lançamento não muda)
   * ⚠ O ESPELHO DO MODAL SE RELÊ AQUI: os mutations invalidam o staging, não a `espelho-conciliacao` — e o desmembrar
   *   cancela o consolidado e cria N lançamentos, que é o que o lado Sistema mostra. O bloco e o casar mudam o que a
   *   planilha explica: o "fora da planilha" do painel (`sistema-nao-explicado`) se relê junto.
   */
  async function agruparDoExtrato(g: GestoAgrupar): Promise<ResultadoAgrupar> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o jsonb das RPCs, como nos handlers acima
      const res: any = g.forma === 'soltar'
        ? await soltarPar({ staging_id: g.stagingIds[0] ?? '' })
        : g.forma === 'bloco'
        ? await conferirBloco({ sessao_id: sessaoId ?? '', staging_ids: g.stagingIds, lancamento_ids: g.lancamentoIds })
        : g.forma === 'casar'
          ? await casarManual({ staging_id: g.stagingIds[0] ?? '', lancamento_id: g.lancamentoIds[0] ?? '' })
          : g.forma === 'desmembrar'
            ? await splitSubstituir({ lancamento_id: g.lancamentoIds[0] ?? '', sessao_id: sessaoId ?? '', staging_ids: g.stagingIds })
            : await resolverGrupo({ staging_id: g.stagingIds[0] ?? '', lancamento_ids: g.lancamentoIds });
      if (!res?.ok) {
        return { ok: false, mensagem: res?.mensagem ?? MOTIVO_MSG[res?.motivo] ?? `O banco recusou (${res?.motivo ?? 'erro'}).` };
      }
      if (g.forma === 'desmembrar' && clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      if (clienteAtual?.id) void qcMesa.invalidateQueries({ queryKey: ['espelho-conciliacao', clienteAtual.id] });
      if (g.forma === 'bloco' || g.forma === 'casar' || g.forma === 'soltar') {
        void qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
      }
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, mensagem: `Erro ao gravar: ${errMsg(e)}` };
    }
  }

  /** O "Desfazer bloco" do Extrato da planilha (NM-B): as linhas voltam ao estado anterior guardado no bloco. */
  async function desfazerBlocoDoExtrato(g: GestoDesfazerBloco): Promise<ResultadoAgrupar> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- o jsonb da RPC, como nos handlers acima
      const res: any = await desfazerBloco({ bloco_id: g.blocoId, motivo: g.motivo });
      if (!res?.ok) return { ok: false, mensagem: res?.mensagem ?? `O banco recusou (${res?.motivo ?? 'erro'}).` };
      if (clienteAtual?.id) void qcMesa.invalidateQueries({ queryKey: ['espelho-conciliacao', clienteAtual.id] });
      void qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, mensagem: `Erro ao desfazer: ${errMsg(e)}` };
    }
  }

  async function handleDesfazerGrupo(stagingId: string) {
    try {
      const res: any = await desfazerGrupo(stagingId);
      if (res?.ok) toast.success('Grupo desfeito.');
      else toast.error(MOTIVO_MSG[res?.motivo] ?? `Não desfeito (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao desfazer grupo: ${errMsg(e)}`);
    }
  }

  // PR-MESA-RESOLUCAO-01 — escolhe UM candidato (resolver_proximos). O guard
  // anti-duplo-match responde com `mensagem` citando a linha conflitante.
  async function handleResolverProximos(lancId: string) {
    if (!selecionadoId) return;
    try {
      const res: any = await resolverProximos({ staging_id: selecionadoId, lancamento_id: lancId });
      if (res?.ok) {
        toast.success('Candidato escolhido — vínculo gravado.');
        /* ⚠ "E IR PARA A PRÓXIMA" É PARTE DO GESTO — 133b. O operador que decide um ambíguo
           quer o seguinte; parar na mesma linha o obriga a um clique por decisão. */
        irProximo();
      } else {
        toast.error(res?.mensagem ?? MOTIVO_MSG[res?.motivo] ?? `Não resolvido (${res?.motivo ?? 'erro'}).`);
      }
    } catch (e: unknown) {
      toast.error(`Erro ao escolher: ${errMsg(e)}`);
    }
  }
  async function handleDesfazerProximos(stagingId: string) {
    try {
      const res: any = await desfazerProximos(stagingId);
      if (res?.ok) toast.success('Escolha desfeita.');
      else toast.error(MOTIVO_MSG[res?.motivo] ?? `Não desfeito (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao desfazer: ${errMsg(e)}`);
    }
  }

  /**
   * ⚠ `silencioso` EXISTE PORQUE O TOAST TAPA OS CONTROLES — TOAST-MESA-01. O container é
   * `bottom-right` (decisão do PR-TOAST-POSICAO-01), e é exatamente onde moram "Salvar e
   * próximo", "Revisado N/27" e a navegação: o aviso de que deu certo cobria o botão que se
   * usa em seguida, numa tela cujo gesto é repetir esse botão dezenas de vezes.
   * ⚠ E NO "SALVAR E PRÓXIMO" O TOAST NÃO INFORMA NADA: a linha avança na hora, e avançar É
   * a confirmação de que salvou. Um aviso que repete o que a tela já mostrou, tapando o
   * próximo clique, é custo sem contrapartida.
   * ⚠ O TOAST DE ERRO NUNCA É SILENCIADO, em nenhum dos dois caminhos. Ele é a única
   * notícia de que o banco recusou, e a linha NÃO avança quando isso acontece — então ele
   * não tapa o botão de um gesto que continua.
   */
  async function salvar(opts?: { silencioso?: boolean }): Promise<boolean> {
    if (!selecionado) return false;
    const id = selecionado.id;                       // captura antes do await (seleção pode mudar)
    try {
      // R1 — aguarda qualquer edição pendente (commit-on-blur de Produto/Documento) COMMITAR
      // antes de o apply_row ler update_proposto. Sem timeout/polling: só await da Promise.
      // (erro da edição já foi tratado no onEditar; aqui só garantimos a ordem.)
      try { await pendingEditRef.current; } catch { /* noop */ }
      /* ⚠ AS TRÊS PROPOSTAS AUTOMÁTICAS ABAIXO SÓ RODAM EM LINHA NÃO GRAVADA — PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D11.
         Na gravada o sistema prevalece e só vale o que o operador editou: o banco já alinhou a proposta ao lançamento na
         primeira edição, e uma sugestão aqui gravaria o que ninguém pediu. */
      const sugestoes = rodaSugestoesDoSalvar(selecionado);
      /* ⚠ AS QUATRO (a cultura da planilha entrou no CULTURA-FASE-B) LEVAM `_sugestao: true` — PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU D2. O banco lê e não grava: as chaves delas NÃO
         entram em `chaves_do_operador`, e quando o Recasar troca o par elas são recalculadas para o par novo, em vez de
         ficarem presas como se o operador as tivesse escolhido. Edição do operador nunca leva a marca. */
      /**
       * 133h item 13 — O RESULTADO É A FONTE DO PROPOSTO, SEMPRE.
       *
       * ⚠ O TEXTO FORA DO PLANO FICAVA NO `update_proposto` E BLOQUEAVA A GRAVAÇÃO. A tela
       * já resolvia isso na apresentação (`subcentroEfetivo` nunca é a proposta órfã), mas
       * o staging continuava com "Despesas Administrativas", que não existe no plano; o
       * `apply_row` mandava esse texto ao lançamento e o TRIGGER
       * `trg_resolve_classificacao_plano` derrubava a transação com "Subcentro ... nao
       * existe no plano de contas" — medido em `resolve_classificacao_from_plano`.
       * ⚠ O CONSERTO É ALINHAR O PROPOSTO AO QUE A TELA MOSTRA, e não silenciar o trigger:
       * ele é a defesa que impede subcentro inventado de entrar no plano. O texto da
       * planilha não some — continua no aviso "planilha dizia", que é o lugar dele.
       */
      if (sugestoes && precisaAlinhar(selecionado)) {
        await editarProposto({ staging_id: id, patch: { subcentro: selecionado.edicao.subcentro, _sugestao: true } });
      }
      /**
       * A SAFRA SUGERIDA VIRA PROPOSTA NO SALVAR — PR-MESA-SUGESTOES-01 §1.
       *
       * ⚠ AQUI, E NÃO NUM EFEITO AO ABRIR A LINHA. Escrever no `update_proposto` quando o
       * operador apenas SELECIONA uma linha faria navegar pela lista gravar propostas em massa —
       * e a auditoria registraria dezenas de edições que ninguém fez. O alinhamento do subcentro,
       * logo acima, já resolveu isto do mesmo jeito: a tela mostra, o Salvar grava.
       * ⚠ E SÓ QUANDO O RESULTADO CONTINUA VAZIO: se o operador escolheu uma safra à mão entre
       * abrir e salvar, é a dele que vale — a sugestão não sobrescreve escolha.
       */
      if (sugestoes && selecionado.edicao.safraSugeridaId
          && !selecionado.edicao.safraId
          && !contaAdministrativa(selecionado)) {
        await editarProposto({
          staging_id: id, patch: { safra_id: selecionado.edicao.safraSugeridaId, _sugestao: true },
        });
      }
      /**
       * A FORMA DE PAGAMENTO PELO HISTÓRICO VIRA PROPOSTA NO SALVAR — PR-CONC-MESA-PAINEL-V1 item 4, o MESMO padrão da
       * safra logo acima: a tela mostra em âmbar, o Salvar grava; nunca ao abrir a linha. Só no cru (o adapter só a
       * calcula lá) e só com o Resultado ainda vazio.
       */
      if (sugestoes && selecionado.edicao.formaPagamentoSugerida && !selecionado.edicao.formaPagamento) {
        await editarProposto({
          staging_id: id, patch: { forma_pagamento: selecionado.edicao.formaPagamentoSugerida, _sugestao: true },
        });
      }
      /**
       * A CULTURA DA PLANILHA VIRA PROPOSTA NO SALVAR — PR-CONC-ENRIQ-MESA-CULTURA-FASE-B (D5), o mesmo padrão da safra
       * sugerida e da forma pelo histórico: o seletor mostra em âmbar, o Salvar grava. Só na lavoura, só sem cultura em lugar
       * nenhum, só em linha NÃO gravada (`culturaSugeridaNoSalvar` lê `rodaSugestoesDoSalvar`), e nunca recusada.
       */
      const culturaSug = culturaSugeridaNoSalvar(selecionado,
        eixoDaAtividade(atividadePorLinha[id] ?? selecionado.edicao.atividadeProposta), culturaRecusadaIds.has(id));
      if (sugestoes && culturaSug) {
        await editarProposto({ staging_id: id, patch: { cultura: culturaSug, _sugestao: true } });
      }
      const res: any = await applyRow({ staging_id: id, overwrite: true });
      if (res?.aplicado) {
        limparEditada(id);
        setErroBanco(null);
        /* Curto de propósito no "Salvar" simples: ele confirma e sai de cena antes de o
           operador voltar ao rodapé. O padrão do app são 4s. */
        if (!opts?.silencioso) toast.success('Lançamento salvo.', { duration: 1500 });
        return true;
      }
      /* 133h item 8 — SALVAR NUNCA FALHA EM SILÊNCIO: sem tradução conhecida, o motivo
         cru do banco vai para a tela. "Não salvo (undefined)" era o que aparecia quando a
         RPC devolvia um motivo novo. */
      const msg = MOTIVO_MSG[res?.motivo] ?? `o banco respondeu "${res?.motivo ?? 'sem motivo'}"`;
      /* ⚠ SEM TOAST (D9, UX-TOAST-01): a recusa fica escrita no rodapé ("Não gravou — o banco recusou: …"). */
      setErroBanco({ id, msg });
      return false;
    } catch (e: unknown) {
      /* O erro do trigger/constraint chega por aqui, e é ele que o operador precisa ler. */
      const msg = errMsg(e);
      setErroBanco({ id, msg });
      return false;
    }
  }
  /**
   * Salvar e próximo — PR-MESA-SALVAR-UNICO-01 item 1.
   *
   * ⚠ É O `salvar()`, E SÓ DEPOIS O AVANÇO. Nada mais. O botão tinha um segundo caminho
   * para a linha "sem diferença": marcava revisada e seguia, SEM chamar o `apply_row`. Dois
   * resultados para o mesmo gesto — "Salvar" na mesma linha a deixava gravada e em leitura;
   * "Salvar e próximo" a deixava editável, e ao voltar nela o operador via o trabalho
   * desfeito. Medido por Gabriel no cartão de jul/26.
   * ⚠ E O `apply_row` COM PROPOSTA VAZIA É SEGURO — conferido no `pg_proc`, não suposto: com
   * `p_overwrite = true` o guard conservador (`pulado_subcentro_preenchido`) nem é
   * alcançado, o UPDATE é COALESCE campo a campo (proposta nula deixa como está) e a função
   * marca `aplicado = true` devolvendo `aplicado_overwrite`. Gravar "nada" é gravar que se
   * conferiu — que é o que o operador quis dizer.
   */
  async function handleSalvarProximo() {
    /* ⚠ "GRAVAR ALTERAÇÃO" NÃO AVANÇA (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL): corrigir uma linha gravada é gesto pontual,
       e o operador confere ali mesmo que ela voltou a "já gravada". A não gravada segue como sempre: grava e avança. */
    const eraGravada = !!selecionado?.aplicado;
    const ok = await salvar({ silencioso: true });
    if (ok && !eraGravada) irProximo();
  }
  async function handleReverter() {
    if (!selecionado) return;
    /* SPLIT-REVERTER: linha de split com registro — o Reverter desfaz o desmembramento inteiro, pelo fluxo da barra */
    if (selecionado.aplicado && selecionado.splitId) { void iniciarDesfazerSplit(selecionado.id); return; }
    try {
      const res: any = await reverterRow(selecionado.id);
      if (res?.ok) { limparEditada(selecionado.id); toast.success('Revertido.'); }
      else toast.error(MOTIVO_MSG[res?.motivo] ?? `Não revertido (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao reverter: ${errMsg(e)}`);
    }
  }

  /**
   * DESFAZER O DESMEMBRAMENTO — PR-CONC-ENRIQ-SPLIT-REVERTER (D8). Três passos na barra do rodapé, sem toast e sem Dialog:
   * a SIMULAÇÃO do banco (`p_simular`) com Confirmar/cancelar; o MOTIVO (obrigatório); a execução. A recusa — da simulação
   * ou da execução — fica escrita em vermelho no mesmo slot. Depois de desfazer, a Mesa fica na mesma linha (D9).
   */
  async function iniciarDesfazerSplit(id: string) {
    try {
      const res: any = await desfazerSplitRpc({ staging_id: id, motivo: null, simular: true });
      if (res?.ok) setDesfazerSplit({ id, etapa: 'confirmar', ...resumoDesfazerSplit(res) });
      else setDesfazerSplit({ id, etapa: 'erro', texto: String(res?.mensagem ?? `o banco recusou (${res?.motivo ?? 'sem motivo'})`) });
    } catch (e: unknown) {
      setDesfazerSplit({ id, etapa: 'erro', texto: `o banco recusou: ${errMsg(e)}` });
    }
  }
  async function executarDesfazerSplit(id: string, motivo: string) {
    try {
      const res: any = await desfazerSplitRpc({ staging_id: id, motivo, simular: false });
      if (res?.ok) {
        setDesfazerSplit(null);
        limparEditada(id);
        if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      } else {
        setDesfazerSplit({ id, etapa: 'erro', texto: String(res?.mensagem ?? `o banco recusou (${res?.motivo ?? 'sem motivo'})`) });
      }
    } catch (e: unknown) {
      setDesfazerSplit({ id, etapa: 'erro', texto: `o banco recusou: ${errMsg(e)}` });
    }
  }

  // P0-1A — acelerador em lote: aplica todos os Exatos pendentes DA SESSÃO (conservador,
  // nunca sobrescreve). A RPC retorna contagens (não ids) → burn-down direto via
  // invalidation; sem janela de graça.
  async function handleAplicarTodos() {
    if (!sessaoId) return;
    try {
      const res = await apply(sessaoId);
      toast.success(`Lote concluído: ${res.aplicados} aplicados · ${res.pulados_subcentro_preenchido} pulados (já classificados) · ${res.erros} erros.`);
    } catch (e: unknown) {
      toast.error(`Erro no lote: ${errMsg(e)}`);
    }
  }

  /**
   * ADMINISTRATIVO NÃO TEM SAFRA, TAMBÉM AQUI — MESA-SAFRA-ADM-01.
   *
   * ⚠ A REGRA É A DO MODAL, PELA MESMA FUNÇÃO (`ehSubcentroAdministrativo`), não por uma
   * cópia: os subcentros mudam de escopo no plano — quatro mudaram em 11/09/2026 — e uma
   * segunda lista aqui envelheceria calada.
   * ⚠ O SUBCENTRO QUE VALE É O DO PRÓPRIO PATCH, quando ele traz um: escolher uma conta
   * administrativa e a safra saírem juntas é UM gesto, e a decisão tem de olhar o que a
   * linha VAI virar, não o que ela era.
   * ⚠ ZERAR NO PAYLOAD, E NÃO SÓ DESABILITAR O CAMPO: o trigger
   * `resolve_classificacao_from_plano` já zera a safra ao aplicar, então mandá-la era
   * gravar uma proposta que o banco descartava — a Mesa exibia 25/26-AMD numa linha que
   * ia para o lançamento sem safra nenhuma.
   */
  function contaAdministrativa(row: EnriqRowVM, subcentroDoPatch?: unknown): boolean {
    const sub = typeof subcentroDoPatch === 'string' ? subcentroDoPatch
      : (row.edicao.subcentro ?? row.edicao.subcentroAtual ?? null);
    return ehLinhaAdministrativa(classificacoes, sub, row.edicao.macro);
  }
  function ajustarSeAdministrativo(patch: Record<string, unknown>, row: EnriqRowVM) {
    if (!contaAdministrativa(row, patch.subcentro)) return patch;
    const ajustado = { ...patch };
    /* Só acrescenta a chave quando há o que zerar: patch sem safra e linha sem safra não
       precisa de `safra_id: null` — seria ruído no evento da auditoria. */
    if ('safra_id' in patch || row.edicao.safraId || row.edicao.safraIdAtual) ajustado.safra_id = null;
    /**
     * A FAZENDA, PELO MESMO CAMINHO — FIN-FAZENDA-ADM-01.
     *
     * ⚠ E AQUI ELA FALTAVA DE VERDADE, não só na aparência: o `ResultadoFazendaEditor` chama
     * `onEditar` apenas quando NÃO está forçado (`if (!forcaAdministrativo)`), então o
     * `FazendaSelect` mostrava "Administrativo" e a proposta nunca recebia nada — a tela
     * dizia uma fazenda e o apply gravava outra. Forçar no payload fecha isso.
     * ⚠ VAI PARA A FAZENDA "Administrativo", não para nulo: zero lançamentos administrativos
     * têm fazenda nula (medido), e a fazenda é campo exigido no save do modal.
     * ⚠ SEM A FAZENDA CADASTRADA, NÃO INVENTA: se o cliente não tiver uma "Administrativo",
     * o patch segue sem `fazenda_id` — melhor manter o que está do que apagar.
     */
    const adm = fazendaAdministrativa(fazendas);
    if (adm && (row.edicao.fazendaId ?? row.edicao.fazendaIdAtual) !== adm.id) ajustado.fazenda_id = adm.id;
    return ajustado;
  }

  // PR-U2c-2A — edição da proposta via editarProposto (os editores dos passos
  // 2B..2E chamam isto). patch = { subcentro | favorecido_id | fazenda_id | produto | ... }.
  /** A edição foi recusada (D9): a frase no rodapé desta linha, e a grade remonta para o campo voltar ao valor do banco. */
  function recusarEdicao(id: string, msg: string) {
    setErroEdicao({ id, msg });
    setVersaoRestauro((v) => v + 1);
  }
  async function onEditar(patchOriginal: Record<string, unknown>): Promise<void> {
    if (!selecionado) return;
    const patch = ajustarSeAdministrativo(patchOriginal, selecionado);
    const idLinha = selecionado.id;   // captura antes do await (a seleção pode mudar)
    // R1 — dispara a edição e registra a Promise SINCRONAMENTE (antes do 1º await), para o
    // salvar() disparado logo em seguida (blur→click) poder aguardá-la antes do apply.
    const p = editarProposto({ staging_id: selecionado.id, patch });
    pendingEditRef.current = p;
    /* Marca ANTES do await: o ponto âmbar é sobre o gesto, não sobre a resposta do banco —
       e o operador precisa vê-lo no mesmo render em que soltou o campo. */
    marcarEditada(selecionado.id);
    try {
      const res: any = await p;
      if (res?.ok) {
        const rej = res?.campos_rejeitados;
        /* ⚠ RECUSA DE CAMPO NO RODAPÉ, NÃO EM TOAST (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D9): a frase fica escrita, e a
           grade remonta para o campo recusado voltar ao valor que o banco tem. */
        if (rej && typeof rej === 'object' && Object.keys(rej).length > 0) {
          recusarEdicao(idLinha, `campo recusado: ${Object.entries(rej).map(([k, v]) => `${k} (${String(v)})`).join(', ')}`);
        } else {
          setErroEdicao((e) => (e && e.id === idLinha ? null : e));
        }
        /* ⚠ A MESA APRENDE A CONTA QUE O OPERADOR ESCOLHEU — PR-CONC-EXCEL-PLANILHA-COMPLETA-01 (opção A do Gabriel): o
           apelido COMPOSTO "conta ⟂ safra" quando a linha traz safra, o simples quando não, pelo MESMO caminho do
           importador (`persistirApelidos`). Só no gesto de escolher a conta — não no alinhamento do Salvar, que não é
           escolha. Na próxima importação a mesma conta com a mesma safra resolve sozinha. */
        const subEscolhido = typeof patchOriginal.subcentro === 'string' ? patchOriginal.subcentro : null;
        const crua = staging.find((r) => r.staging_id === idLinha);
        if (subEscolhido && crua?.excel_subcentro && clienteAtual?.id) {
          const r = await aprenderApelidoDaMesa({
            clienteId: clienteAtual.id,
            contaPlanilha: crua.excel_subcentro,
            safraPlanilha: crua.excel_safra,
            subcentro: subEscolhido,
            planoContaId: classificacoes?.find((c) => c.subcentro === subEscolhido)?.id,
          });
          /* a conta FOI gravada na proposta; só o apelido falhou — escrito no rodapé, sem desfazer o campo */
          if (!r.ok) setErroEdicao({ id: idLinha, msg: `a conta foi escolhida, mas o apelido não foi memorizado: ${r.erro ?? 'motivo desconhecido'}` });
        }
      } else {
        recusarEdicao(idLinha, MOTIVO_MSG[res?.motivo] ?? `o banco respondeu "${res?.motivo ?? 'sem motivo'}"`);
      }
    } catch (e: unknown) {
      recusarEdicao(idLinha, errMsg(e));
    } finally {
      if (pendingEditRef.current === p) pendingEditRef.current = null;
    }
  }

  /**
   * "AO FORNECEDOR" — RELIGADO NO "⋯" DO CABEÇALHO DA MESA (PR-CONC-ENRIQ-AGRUP-2a; saiu do rodapé em a2103de2).
   *
   * ⚠ GRAVA SÓ A PROPOSTA (`editarProposto`), uma linha por vez — nunca o `applyRow`: quem grava o lançamento é o
   *   "Aprovar" de cada linha (decisão do Gabriel). A prévia e os alvos saem de `previaAoFornecedor` (id do fornecedor,
   *   só não aprovadas, classificada fica com o sistema).
   * ⚠ TRAVA DE DUPLO CLIQUE NO `ref`, não só no estado: dois cliques no mesmo tick leem o mesmo `aplicandoFornecedor`
   *   ainda falso.
   */
  const previaFornecedor = useMemo(
    () => (linhaCrua ? previaAoFornecedor(linhaCrua, staging, { classificacoes, fazendas }) : null),
    [linhaCrua, staging, classificacoes, fazendas]);
  const [aplicandoFornecedor, setAplicandoFornecedor] = useState(false);
  const aplicandoFornecedorRef = useRef(false);
  async function aplicarAoFornecedor() {
    if (aplicandoFornecedorRef.current || !previaFornecedor || previaFornecedor.alvos.length === 0) return;
    aplicandoFornecedorRef.current = true;
    setAplicandoFornecedor(true);
    try {
      const { ok, falhas } = await levarAoFornecedor(previaFornecedor.alvos, editarProposto, marcarEditada);
      toast[falhas === 0 ? 'success' : 'warning'](falhas === 0
        ? `Proposta levada a ${ok} linha${ok === 1 ? '' : 's'} do fornecedor — nada foi gravado no lançamento.`
        : `${ok} propostas levadas · ${falhas} recusadas.`);
    } finally {
      aplicandoFornecedorRef.current = false;
      setAplicandoFornecedor(false);
    }
  }


  // PR-UX-ENR-MODAL-01 — prop-bags únicos. A aba e o modal ampliado consomem
  // EXATAMENTE as mesmas props; a lista de props existe em UM lugar só.
  const listaProps: EnriquecimentoListaProps = {
    rows: rowsNaTela,
    selecionadoId,
    /* ⚠ SELECIONAR E ABRIR SÃO O MESMO GESTO — 133d item 3. Na tela principal não há mais
       painel de detalhe: clicar numa linha só para vê-la "selecionada" não levaria a lugar
       nenhum. A seleção continua sendo o estado (a Mesa abre nela e o Anterior/Próximo a
       usam); o que mudou é que ela agora abre a Mesa junto. */
    onSelecionar: (id: string) => { setSelecionadoId(id); setMesaAmpliadaOpen(true); },
    hideBanco: filtroConta !== 'todas',
    editadasIds,
  };
  const detalheProps: DetalheDaMesa = {
    row: selecionado,
    classificacoes,
    fornecedores,
    fazendas,
    safras,
    contas: contasBancarias,
    clienteId: clienteAtual?.id,
    hideBanco: filtroConta !== 'todas',
    /* a linha conferida em bloco é LEITURA na Mesa: sem `onEditar`, nenhum campo vira editor (NM-B) */
    onEditar: selecionado?.status === 'conferido_bloco' ? undefined : onEditar,
    onCriarFornecedor: criarFornecedor,
    atividade: selecionado ? (atividadePorLinha[selecionado.id] ?? null) : null,
    onAtividade: (a: string) => {
      if (!selecionado) return;
      const id = selecionado.id;
      setAtividadePorLinha((p) => ({ ...p, [id]: a }));
      /* ⚠ O EIXO QUE NÃO SE APLICA SAI NA HORA (CULTURA-FASE-B D6, como o modal do Financeiro): a proposta de cultura ao
         virar pecuária, a de fase ao virar lavoura. O gatilho do banco já zeraria na gravação; limpar aqui é para a tela
         não mostrar o que não vai gravar. Pelo `onEditar` de sempre. */
      for (const patch of patchesAoTrocarAtividade(selecionado.edicao, a)) void onEditar(patch);
    },
    culturasDaSafra: culturasDaSafraSel,
    culturaRecusada: selecionado ? culturaRecusadaIds.has(selecionado.id) : false,
    onRecusarCultura: () => {
      if (!selecionado) return;
      const id = selecionado.id;
      setCulturaRecusadaIds((p) => { if (p.has(id)) return p; const n = new Set(p); n.add(id); return n; });
    },
    versaoRestauro,
  };
  const actionsProps: AcoesDaMesa = {
    posicao,
    onAnterior: irAnterior,
    onProximo: irProximo,
    canAnterior,
    canProximo,
    revisado: revisei,
    onRevisado: setRevisei,
    onSalvar: () => { void salvar(); },
    onSalvarProximo: () => { void handleSalvarProximo(); },
    onReverter: () => { void handleReverter(); },
    onAplicarTodos: () => { void handleAplicarTodos(); },
    nAplicaveis,
    salvarDisabled: !podeSalvar,
    salvarMotivo: motivoSalvar,
    /* ── 133i-c item 1 — "É transferência para/de ▾" TAMBÉM NA MESA ──────────────
       ⚠ MESMO COMPONENTE E MESMO HOOK da lista "Sem par no sistema"
       (`EnriquecimentoSemParSistema:158`), montado aqui com a linha selecionada. Duas
       cópias do mesmo gesto divergiriam na primeira regra nova — e este gesto reescreve
       tipo e classificação de lançamento conciliado, que é o pior lugar para ter duas.
       ⚠ SÓ APARECE QUANDO CABE: precisa de lançamento casado (`lancId`), de sentido
       (entrada/saída — `3-Transferências` devolve `null`) e de a linha NÃO ser explicada
       por si mesma. `explicadoPorSiMesmo` é o predicado que a própria frente já usa para
       "transferência ou estorno nunca é pendência" — reusado em vez de reescrito. */
    slotTransferencia: podeMarcarTransferencia && selecionado?.lancId ? (
      <>
        <AcaoEhTransferencia
          lancamentoId={selecionado.lancId}
          sentido={sentidoDaLinha}
          contaPropriaId={selecionado.edicao.contaBancariaIdAtual ?? null}
          contas={contasParaTransferencia}
          onAplicado={() => {
            setErroTransferencia(null);
            toast.success('Transferência aplicada.');
            void qcMesa.invalidateQueries({ queryKey: ['classificacao-staging'] });
            void qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
          }}
          onErro={(m) => setErroTransferencia(m)}
        />
        {/* a recusa junto do botão — o slot de 14px existe sempre (layout fixo do Dialog) */}
        <p data-testid="erro-transferencia" className="min-h-[14px] text-[10px] leading-[14px] text-red-600">
          {erroTransferencia ?? ''}
        </p>
      </>
    ) : null,
    reverterDisabled: !podeReverter,
    aplicarTodosDisabled: !sessaoId || nAplicaveis === 0,
    isBusy,
    divergenciasDoExtrato,
    erroBanco: erroBanco && selecionado && erroBanco.id === selecionado.id ? erroBanco.msg : null,
    /* PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL — o estado da gravada (D3), o motivo do Reverter apagado (D4) e a recusa de edição (D9). */
    gravada: gravadaSel ? { alterada: gravadaSel.alterada } : null,
    motivoReverter,
    erroEdicao: erroEdicao && selecionado && erroEdicao.id === selecionado.id ? erroEdicao.msg : null,
    /* PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU D8 — o Recasar trocou o par depois da última edição/gravação: "confira", sem bloquear. */
    parMudou: selecionado?.parMudou ?? false,
    /* PR-CONC-ENRIQ-SPLIT-REVERTER D8 — o fluxo do desfazer do desmembramento, no slot da mensagem */
    desfazerSplit: desfazerSplit && selecionado && desfazerSplit.id === selecionado.id
      ? { etapa: desfazerSplit.etapa, texto: desfazerSplit.texto, titulo: desfazerSplit.titulo, editados: desfazerSplit.editados }
      : null,
    onDesfazerConfirmar: () => setDesfazerSplit((d) => (d ? { ...d, etapa: 'motivo' } : d)),
    onDesfazerMotivo: (motivo: string) => { if (desfazerSplit) void executarDesfazerSplit(desfazerSplit.id, motivo); },
    onDesfazerCancelar: () => setDesfazerSplit(null),
  };
  // Contagem da mesa ampliada: reusa rowsFiltradas (sessão + filtros vigentes). Nada recalculado.
  const mesaAmpliadaVazia = rowsNaTela.length === 0;
  const sessaoLabel = sessoesVM.find((s) => s.id === sessaoId)?.label ?? null;

  /* ⚠ "VOCÊ DECIDE" É O ÚNICO ESTADO COM FAIXA DE CANDIDATOS — 133b. Os outros três avisos
     coloridos que ficavam aqui ("sem match", "grupo resolvido", "escolhido manualmente")
     diziam o que a pílula da linha já diz; o que eles tinham de próprio — desfazer grupo e
     desfazer escolha — continua na mesa ampliada, onde o gesto é raro e cabe. */
  const pedeDecisao = selecionado?.status === 'ambiguo' || selecionado?.status === 'candidatos_proximos';

  /**
   * O CSV do que não tem par — 133b, usando `src/lib/csv.ts` (o BOM que faz o Excel
   * brasileiro abrir o acento certo mora lá).
   *
   * ⚠ SOBRE O RECORTE DE CONTA VIGENTE, não sobre a sessão inteira: o rodapé fala dos
   * números que estão na tela, e um CSV maior que eles seria uma terceira contagem.
   */
  /* ⚠ RECEBE `string`, e não `MatchStatus`: o tipo escrito à mão é MENOR que o CHECK do
     banco (ver a nota em useClassificacaoStaging), e comparar diretamente com ele faria o
     TS acusar "comparação sem interseção" num status que existe de verdade. */
  const motivoSemPar = (status: string): string =>
    status === 'sem_conta_para_match'
      ? 'sem conta bancária na planilha'
      : 'nenhum movimento com este valor na conta';

  /**
   * O UNIVERSO DO LOTE — 133c item 1.
   *
   * ⚠ SAI DA SESSÃO INTEIRA, não do recorte da tela. O botão promete "gravar os que
   * atualizam"; se ele obedecesse ao chip de conta, o número do rodapé e o número gravado
   * seriam diferentes toda vez que houvesse filtro — e o operador só descobriria depois.
   * ⚠ `ja_classificado` SÓ COM "SOBRESCREVER" MARCADO. Sem a marca ele nem entra na fila:
   * mandá-lo para a RPC renderia `pulado_subcentro_preenchido` e um evento âmbar no feed
   * para cada linha já resolvida — ruído sobre trabalho que já estava certo.
   */
  const linhasDoLote = useMemo((): LinhaParaGravar[] => {
    const out: LinhaParaGravar[] = [];
    for (const r of staging) {
      /* ⚠ A REGRA DO LOTE MORA EM `elegivelParaLote` (painelContas) desde o PR-CONC-ENRIQUECER-V2-01: o painel por conta
         conta as "prontas" pela MESMA função, e o "Gravar N" e a coluna Prontas não podem divergir.
         ⚠ 133i item 11 — parte de agrupamento continua fora: o `apply_row` a escreveria por cima do consolidado. */
      const sobrescrever = sobrescreverIds.has(r.staging_id);
      if (!elegivelParaLote(r, sobrescrever)) continue;
      const vm = toRowVM(r);
      out.push({
        stagingId: r.staging_id,
        linha: r.excel_linha_origem ?? 0,
        data: r.excel_data ?? r.lanc_data_pagamento ?? '',
        valor: Math.abs(Number(r.excel_valor) || 0),
        titulo: vm.descricaoExcel,
        camposQueMudam: vm.comparativo.filter((c) => c.tom === 'muda' || c.tom === 'difere').map((c) => c.campo),
        sobrescrever,
        /* 133h-b item 8 — o Resultado é a fonte do proposto também no lote. */
        alinharSubcentro: precisaAlinhar(vm) ? vm.edicao.subcentro : null,
      });
    }
    return out;
  }, [staging, sobrescreverIds]);

  async function handleGravarLote() {
    if (linhasDoLote.length === 0) return;
    setVerProgresso(true);
    await lote.gravar(linhasDoLote);
  }

  /**
   * Cancelar como duplicado — 133c item 4.
   *
   * ⚠ PELO `excluirLancamento` DO HOOK OFICIAL, nunca por UPDATE direto: ele coleta os
   * vínculos ativos ANTES (o trigger os desfaz no cancelamento) e recomputa o status de
   * cada extrato depois. Um UPDATE cru deixaria o extrato marcado como conciliado contra
   * um lançamento morto — e o mês fecharia mentindo.
   * ⚠ O MOTIVO É OBRIGATÓRIO e vai para `cancelado_motivo`: é o que a próxima pessoa a
   * olhar aquele lançamento vai ler.
   */
  async function handleCancelarDuplicado(lancId: string, motivo: string): Promise<boolean> {
    const ok = await excluirLancamento(lancId, motivo);
    if (ok) {
      if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      await qcMesa.invalidateQueries({
        queryKey: ['sistema-nao-explicado', sessaoId, contaIdSel, mesParaTransferencias],
      });
    }
    return ok;
  }

  /**
   * ⚠ O PAR PERTENCE ÀS DUAS CONTAS — 133e item G. O filtro comparava a conta selecionada
   * com a da linha da planilha, e o par não é uma linha da planilha: ele é uma SAÍDA numa
   * conta e uma ENTRADA em outra. Com o Itaú filtrado a lista mostrava 0 enquanto o topo
   * dizia 7 — porque nenhum par "é" do Itaú; sete têm o Itaú de um dos lados.
   */
  const paresDaConta = useMemo(() => {
    if (!contaIdSel) return transf.dados.pares;
    return transf.dados.pares.filter(
      (p) => p.conta_saida_id === contaIdSel || p.conta_entrada_id === contaIdSel);
  }, [transf.dados.pares, contaIdSel]);

  /**
   * O CSV do que ficou sem par — 133i item 13.
   *
   * ⚠ ABRIA EM UMA COLUNA SÓ NO EXCEL. Cada linha era um `join(',')` com TODO campo entre
   * aspas; o Excel brasileiro usa `;` como separador de lista, então lia o arquivo inteiro
   * como uma coluna de texto. `csvLinhaPt` põe o `;` e só usa aspas onde elas mudam o
   * significado — o BOM continua, e é ele que salva o acento.
   */
  function baixarSemPar() {
    const linhas = [csvLinhaPt(['linha', 'data', 'conta', 'descricao', 'valor', 'motivo'])];
    for (const r of stagingConta) {
      if (grupoDaLinha(r.match_status, r.aplicado) !== 'sem_par') continue;
      linhas.push(csvLinhaPt([
        r.excel_linha_origem ?? '',
        fmtData(r.excel_data),
        r.conta_filtro_nome ?? r.excel_conta_origem ?? '',
        r.excel_produto ?? r.excel_fornecedor ?? '',
        fmtBRL(r.excel_valor),
        motivoSemPar(r.match_status),
      ]));
    }
    baixarCsv('enriquecer_sem_par_no_banco', linhas);
  }

  /**
   * As faixas de decisão da linha — 133d item 3, agora dentro da Mesa ampliada.
   *
   * ⚠ ELAS SEGUEM A TABELA, e é por isso que mudaram de casa junto com ela: "escolha o
   * candidato" e "agrupe estas N linhas" são perguntas sobre a linha que se está olhando
   * campo a campo. Na tela principal, sem a tabela ao lado, seriam perguntas no vazio.
   */
  /* ⚠ SEM DECISÃO, SEM FAIXA — PR-CONC-MESA-FAIXAS-FIXAS-01: `null` aqui é o que faz a área fixa da Mesa dizer "nenhuma
     decisão pendente" em vez de ficar em branco. As quatro condições são as mesmas que abrem cada faixa abaixo. */
  const temDecisaoNaLinha = !!selecionado && (
    ((selecionado.status === 'ja_classificado' || selecionado.status === 'resolvido_manual'
      || selecionado.status === 'resolvido_grupo') && !selecionado.aplicado)
    || (selecionado.status === 'sugestao_grupo' && !selecionado.aplicado)
    || (selecionado.status === 'sugestao_split' && !selecionado.aplicado)
    || pedeDecisao);
  const faixasDaLinha = !selecionado || !temDecisaoNaLinha ? null : (
    <>
      {/* sobrescrever + desfazer — 10px, na mesma linha */}
      {(selecionado.status === 'ja_classificado' || selecionado.status === 'resolvido_manual'
        || selecionado.status === 'resolvido_grupo') && !selecionado.aplicado && (
        <div className="flex shrink-0 items-center gap-2 border-t px-3 py-0.5">
          {/* ⚠ SOBRESCREVER É POR LINHA E NASCE DESLIGADO — 133c item 1. Só aparece onde faz
              diferença: a linha que o banco já classificou. Sem a marca ela nem entra na
              fila do lote. */}
          {selecionado.status === 'ja_classificado' && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[10px] text-muted-foreground"
              title="O lançamento já tem classificação. Marcado, o Gravar troca o que está lá pelo Resultado desta linha.">
              <input type="checkbox" className="h-3 w-3"
                checked={sobrescreverIds.has(selecionado.id)}
                onChange={() => alternarSobrescrever(selecionado.id)} />
              sobrescrever
            </label>
          )}
          {(selecionado.status === 'resolvido_manual' || selecionado.status === 'resolvido_grupo') && (
            <Button type="button" size="sm" variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]"
              disabled={isResolvendoProximos || isResolvendoGrupo}
              title={selecionado.status === 'resolvido_grupo'
                ? 'Desfaz o agrupamento e devolve a linha à decisão.'
                : 'Desfaz o candidato escolhido à mão e devolve a linha à decisão.'}
              onClick={() => {
                if (selecionado.status === 'resolvido_grupo') void handleDesfazerGrupo(selecionado.id);
                else void handleDesfazerProximos(selecionado.id);
              }}>
              ↺ Desfazer
            </Button>
          )}
        </div>
      )}

      {/* 1 linha = N lançamentos */}
      {selecionado.status === 'sugestao_grupo' && !selecionado.aplicado && (
        <div className="shrink-0 border-t border-violet-300 bg-violet-50/60 px-3 py-1 dark:border-violet-800 dark:bg-violet-950/20">
          {!confirmandoGrupo ? (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[10.5px] text-violet-900 dark:text-violet-200">
                {(linhaCrua?.match_lancamento_ids?.length ?? 0)} lançamentos do dia somam o valor desta linha.
              </span>
              <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
                disabled={isResolvendoGrupo || !(linhaCrua?.match_lancamento_ids?.length)}
                onClick={() => setConfirmandoGrupo(true)}>
                Juntar os {linhaCrua?.match_lancamento_ids?.length ?? 0} lançamentos nesta linha
              </Button>
            </div>
          ) : (
            /* ⚠ CONFIRMAÇÃO INLINE, NÃO MODAL — 133c. A pergunta é sobre a linha que está na
               tela, e um segundo modal a cobriria justamente quando ela importa. */
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[10.5px] text-amber-800 dark:text-amber-300">
                Isso une {linhaCrua?.match_lancamento_ids?.length ?? 0} lançamentos nesta linha. Continuar?
              </span>
              <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
                disabled={isResolvendoGrupo}
                onClick={() => { void handleJuntarNestaLinha(linhaCrua?.match_lancamento_ids ?? []); }}>
                Sim
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]"
                onClick={() => setConfirmandoGrupo(false)}>
                Não
              </Button>
            </div>
          )}
        </div>
      )}

      {/* N linhas = 1 lançamento — o botão nasceu em 133c-a, com a migration que soltou os
          guards da RPC. */}
      {selecionado.status === 'sugestao_split' && !selecionado.aplicado && (
        <div className="shrink-0 border-t border-violet-300 bg-violet-50/60 px-3 py-1 dark:border-violet-800 dark:bg-violet-950/20">
          {/* ⚠ TRÊS LINHAS COM OS NÚMEROS — 133h-b item 3. A faixa dizia "esta linha e mais
              2 do mesmo dia somam um único movimento" e nenhum valor: o operador aceitava
              no escuro um gesto que CANCELA um lançamento. Extrato, planilha e resultado,
              lado a lado, é o que permite conferir antes de aceitar. */}
          <div className="text-[10.5px] leading-[1.35] text-violet-900 dark:text-violet-200">
            <div className="truncate">
              <b>Extrato:</b> {selecionado.comparativo.find((c) => c.campo === 'Produto / Descrição')?.sistema ?? '—'}
              {' · '}{selecionado.data}{' · '}{fmtBRL(grupoDoSplit?.lancValor ?? null)}
            </div>
            <div className="truncate" title={grupoDoSplit?.partes.map((r) => `${fmtBRL(r.excel_valor)} ${r.excel_fornecedor ?? r.excel_produto ?? '—'}`).join(' · ')}>
              <b>Planilha:</b> {gruposIdsDoSplit.length} linhas do dia = {fmtBRL(grupoDoSplit?.soma ?? null)}
              {grupoDoSplit && grupoDoSplit.partes.length > 0 && (
                <> ({grupoDoSplit.partes.map((r) => `${fmtBRL(r.excel_valor)} ${r.excel_fornecedor ?? r.excel_produto ?? '—'}`).join(' · ')})</>
              )}
            </div>
            <div>
              <b>Resultado:</b>{' '}
              {!grupoDoSplit ? <span className="text-muted-foreground">apurando…</span>
                : !grupoDoSplit.completo
                  ? <span className="text-amber-700 dark:text-amber-400">
                      {grupoDoSplit.partes.length} de {gruposIdsDoSplit.length} linhas carregadas — soma incompleta
                    </span>
                : grupoDoSplit.bate
                  ? <span className="font-medium text-emerald-700 dark:text-emerald-400">bate ao centavo</span>
                : grupoDoSplit.diferencaCent < 0
                  ? <span className="font-medium text-amber-700 dark:text-amber-400">
                      passa {fmtBRL(Math.abs(grupoDoSplit.diferencaCent) / 100)}
                    </span>
                  : <span className="font-medium text-amber-700 dark:text-amber-400">
                      falta {fmtBRL(grupoDoSplit.diferencaCent / 100)}
                    </span>}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-2">
            {/* ⚠ O BOTÃO ABRE O MODAL — 133i item 1. Ele confirmava inline sobre um
                conjunto FECHADO (o `grupo_ids` do casador); agora o conjunto é escolhido,
                com os números na frente, antes de um gesto que cancela um lançamento.
                ⚠ ELE NÃO EXIGE MAIS QUE A SUGESTÃO BATA: quem decide se bate é a soma das
                MARCADAS, dentro do modal. Travá-lo aqui esconderia justamente o caso em que
                o operador precisa entrar para consertar a sugestão. */}
            {/* ⚠ PR-CONC-ENRIQ-AGRUP-2a — DECISÃO DO GABRIEL (iv): bloco cuja soma NÃO FECHA fica sem proposta e SEM
                desmembrar à mão. Revoga o "ele não exige mais que a sugestão bata" (133i item 1): o botão só abre com a
                soma ao centavo, e o motivo fica escrito ao lado (regra do botão desabilitado). */}
            <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
              data-testid="botao-desmembrar"
              disabled={isSubstituindo || !linhaCrua?.lanc_id || candidatasDoGrupo.length < 2 || !!motivoDesmembrar}
              title={!linhaCrua?.lanc_id
                ? 'Esta linha não tem lançamento para agrupar.'
                : candidatasDoGrupo.length < 2
                  ? 'Não há duas linhas sem par no mesmo dia e conta.'
                  : motivoDesmembrar ?? 'Escolher quais linhas compõem este movimento.'}
              onClick={() => setAgruparOpen(true)}>
              Agrupar {gruposIdsDoSplit.length} linhas neste lançamento
            </Button>
            {motivoDesmembrar && (
              <span data-testid="motivo-desmembrar" className="text-[10px] text-amber-700 dark:text-amber-400">{motivoDesmembrar}</span>
            )}
            {candidatasDoGrupo.length > gruposIdsDoSplit.length && (
              <span className="text-[10px] text-violet-800 dark:text-violet-300">
                {candidatasDoGrupo.length} linhas sem par — dá para incluir ou tirar
              </span>
            )}
          </div>
        </div>
      )}

      {pedeDecisao && (
        <EnriquecimentoCandidatosInline
          stagingId={selecionado.id}
          excelValor={linhaCrua?.excel_valor ?? null}
          excelData={linhaCrua?.excel_data ?? null}
          onEscolher={(lancId) => { void handleResolverProximos(lancId); }}
          isResolvendo={isResolvendoProximos}
          lancIdsUsados={lancIdsUsados}
          temProxima={canProximo}
        />
      )}
    </>
  );

  /* ── O PAINEL POR CONTA — PR-CONC-ENRIQUECER-V2-01. Nada de conta nova: os baldes saem de `baldeDaLinha` (o
     `grupoDaLinha` dos cards e o `elegivelParaLote` do "Gravar N"); "fora da planilha" é a lista de
     `fn_classificacao_sistema_nao_explicado` (a do card de antes), contada por conta; "falta OFX" lê o extrato do mês. */
  const contasComOfx = useContasComExtratoNoMes(clienteAtual?.id, anoMesRegua ?? mesAtivo);
  const foraPlanilhaPorConta = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of semParSistema ?? []) {
      if (l.conta_bancaria_id) m.set(l.conta_bancaria_id, (m.get(l.conta_bancaria_id) ?? 0) + 1);
    }
    return m;
  }, [semParSistema]);
  const linhasPainel = useMemo(
    () => montarPainelContas(staging, { foraPlanilhaPorConta, contasComOfx, sobrescreverIds }),
    [staging, foraPlanilhaPorConta, contasComOfx, sobrescreverIds]);
  const baldePorId = useMemo(
    () => new Map(staging.map((r) => [r.staging_id, baldeDaLinha(r, sobrescreverIds.has(r.staging_id))])),
    [staging, sobrescreverIds]);
  /* As linhas que a planilha trouxe sem conta — o aviso que morava na casca (EnriquecerTresPassos) e veio para o slot. */
  const linhasSemConta = useMemo(
    () => staging.filter((r) => String(r.match_status) === 'sem_conta_para_match').length, [staging]);
  const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesRotulo = mesDaRegua && anoDaRegua ? `${MESES_CURTOS[mesDaRegua - 1]}/${anoDaRegua}` : '—';
  const mesCurto = mesDaRegua && anoDaRegua ? `${MESES_CURTOS[mesDaRegua - 1]}/${String(anoDaRegua).slice(2)}` : '—';

  /* ── O SELETOR DE SESSÃO — o mesmo menu (com "(mais recente)" e a lixeira), agora no cabeçalho navy do painel ── */
  const ehMaisRecente = !!sessaoId && sessaoId === sessoesDoMesVM[0]?.id;
  const seletorSessao = (
    /* ⚠ `DropdownMenu` DA CASA, NUNCA `<select>` NATIVO (133h item 2): a linha escolhe, o ícone pede a exclusão. */
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="seletor-sessao"
          className="flex h-6 min-w-0 max-w-[460px] items-center gap-1 rounded border border-primary-foreground/30 bg-primary-foreground/10 px-2 text-left text-[10px] text-primary-foreground hover:bg-primary-foreground/20">
          <span className="min-w-0 truncate" title={sessaoLabel ?? undefined}>{sessaoLabel ?? '— nenhuma importação —'}</span>
          {ehMaisRecente && <span className="shrink-0 whitespace-nowrap text-primary-foreground/75">(mais recente)</span>}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      {/* 400px: o rótulo inteiro + "(mais recente)" + a lixeira sem cortar (PR-CONC-EXCEL-SESSAO-E-DEPARA-01) */}
      <DropdownMenuContent align="end" className="max-h-[60vh] w-[400px] overflow-y-auto">
        {sessoesDoMesVM.length === 0 ? (
          <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
            Nenhuma importação para {mesDaRegua && anoDaRegua ? `${String(mesDaRegua).padStart(2, '0')}/${anoDaRegua}` : 'este mês'}.
          </div>
        ) : sessoesDoMesVM.map((sv) => (
          <DropdownMenuItem key={sv.id} className="gap-1"
            onSelect={() => { setSessaoId(sv.id); setFiltroConta('todas'); setSelecionadoId(null); }}>
            <span className="min-w-0 flex-1 truncate" title={sv.label}>{sv.label}</span>
            {sv.id === sessoesDoMesVM[0]?.id && (
              <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">(mais recente)</span>
            )}
            <button type="button"
              title={`Excluir a importação de ${sv.total} linha(s)`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); void pedirExclusao(sv); }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-[14px] w-[14px]" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  /* ── O SLOT DE AVISO DO PAINEL — fixo, 18px: a exclusão pedida, a sessão mais nova e as linhas sem conta ── */
  const avisosPainel: Array<{ id: string; conteudo: React.ReactNode; texto: string; cls: string }> = [];
  if (exclusaoPendente) {
    const texto = `${exclusaoPendente.linhas} linhas · nenhuma gravada — excluir ${exclusaoPendente.label}?`;
    avisosPainel.push({ id: 'confirmar-exclusao', texto, cls: 'text-amber-800 dark:text-amber-300', conteudo: (
      <>
        <span className="min-w-0 truncate">{texto}</span>
        <button type="button" className="shrink-0 font-medium underline" disabled={isExcluindoSessao}
          onClick={() => { void confirmarExclusao(); }}>{isExcluindoSessao ? 'Excluindo…' : 'Excluir'}</button>
        <button type="button" className="shrink-0 underline" onClick={() => setExclusaoPendente(null)}>Não</button>
      </>
    ) });
  }
  if (sessaoMaisNova) {
    const texto = `Há uma importação mais nova deste mês (${sessaoMaisNova.imp}) —`;
    avisosPainel.push({ id: 'aviso-sessao-mais-nova', texto, cls: 'text-amber-700 dark:text-amber-400', conteudo: (
      <>
        <span className="truncate">{texto}</span>
        <button type="button" className="shrink-0 underline"
          onClick={() => { setSessaoId(sessaoMaisNova.id); setFiltroConta('todas'); setSelecionadoId(null); }}>abrir</button>
      </>
    ) });
  }
  /* PR-CONC-ENRIQ-AGRUP-2a — N:1 resolvido sem caminho de gravação: fora do "Gravar N", e dito no slot. */
  const nAguarda = linhasPainel.reduce((a, l) => a + l.aguarda, 0);
  if (nAguarda > 0) {
    const texto = `${nAguarda} linha${nAguarda === 1 ? '' : 's'} aguarda${nAguarda === 1 ? '' : 'm'} agrupamento — a gravação de vários lançamentos numa linha chega no próximo PR.`;
    avisosPainel.push({ id: 'aviso-aguarda-agrupamento', texto, cls: 'text-violet-800 dark:text-violet-300',
      conteudo: <span className="truncate">{texto}</span> });
  }
  if (linhasSemConta > 0) {
    const texto = `${linhasSemConta} linha${linhasSemConta === 1 ? '' : 's'} desta planilha ${linhasSemConta === 1 ? 'ficou' : 'ficaram'} sem conta — reimporte a planilha.`;
    avisosPainel.push({ id: 'aviso-sem-conta', texto, cls: 'text-amber-800 dark:text-amber-300', conteudo: (
      <>
        <span className="truncate">{texto}</span>
        {onPlanilha && (
          <button type="button" className="shrink-0 underline" onClick={onPlanilha}>ir para a planilha e de-para</button>
        )}
      </>
    ) });
  }

  const nTransferencias = transf.carregando ? null
    : paresDaConta.length + transf.estornos.total + transf.faturas.total;
  const menuPainel = [
    { rotulo: isCasando ? 'Recasando…' : '↻ Recasar', desabilitado: isCasando || !sessaoId,
      title: 'Procura de novo o lançamento de cada linha, sem reimportar.', onClick: () => { void recasar(); } },
    { rotulo: '⬆ Importar planilha', onClick: () => setImportOpen(true) },
    { rotulo: `Transferências entre contas${nTransferencias === null ? '' : ` (${nTransferencias})`}`,
      onClick: () => setListaAberta('transferencias') },
    { rotulo: `No sistema, fora da planilha (${semParSistema?.length ?? 0})`, onClick: () => setListaAberta('fora') },
    { rotulo: 'Mesa · todas as contas', desabilitado: rowsNaTela.length === 0,
      onClick: () => abrirMesa(null, primeiraNaoRevisada?.id ?? null, 'todas') },
    { rotulo: 'Baixar sem par (CSV)', desabilitado: resumo.sem_par.qtd === 0, onClick: baixarSemPar },
  ];

  return (
    <div className="flex flex-col gap-1 md:min-h-0 md:flex-1">
      {/* ═══ O PAINEL POR CONTA — PR-CONC-ENRIQUECER-V2-01 ═══════════════════════════════════════════════════
          ⚠ ELE SUBSTITUI o topo de seis chips, a barra de 32px, a lista de linhas e o rodapé do passo 2. O trabalho
          agora se escolhe POR CONTA: "Extrato da planilha" confere, "Revisar N" abre a Mesa nas pendências dela.
          ⚠ NENHUM GESTO SE PERDEU: recasar, importar, transferências, sistema fora da planilha, Mesa de todas as contas
          e o CSV dos sem par moram no "⋯" (e o card "No sistema, fora da planilha" abre a lista). */}
      <PainelContasEnriquecer
        mesRotulo={mesRotulo}
        clienteNome={clienteAtual?.nome ?? '—'}
        seletorSessao={seletorSessao}
        linhas={linhasPainel}
        mesCurto={mesCurto}
        filtro={filtroPainel}
        onFiltro={setFiltroPainel}
        pendentesDePara={pendentesDePara ?? null}
        onPlanilha={onPlanilha}
        onExtrato={(contaId) => { setExtratoContaId(contaId ?? linhasPainel[0]?.contaId ?? null); setExtratoOpen(true); }}
        onRevisar={(contaId) => {
          const primeira = rowsNaTela.find((r) => r.contaId === contaId && passaNoFiltroMesa(baldePorId.get(r.id), 'revisar'));
          abrirMesa(contaId, primeira?.id ?? null, 'revisar');
        }}
        gravarN={linhasDoLote.length}
        gravando={lote.gravando}
        gravarRotulo={lote.gravando ? `Gravando… ${lote.progresso.feitas} de ${lote.progresso.total}` : undefined}
        onGravar={() => { void handleGravarLote(); }}
        onForaPlanilha={() => setListaAberta('fora')}
        menu={menuPainel}
        avisos={avisosPainel}
        carregando={isFetching}
      />

      {/* ═══ AS DUAS LISTAS QUE NÃO SÃO LINHA DA PLANILHA — em diálogo, chamadas pelo "⋯" e pelo card ═══════
          ⚠ MESMOS COMPONENTES E MESMAS AÇÕES de antes (133c): transferência é o PAR de lançamentos, e "fora da planilha"
          é o lançamento órfão. Só mudou a casa: eram o corpo da tela, trocado por chip. */}
      <Dialog open={listaAberta !== null} onOpenChange={(o) => { if (!o) setListaAberta(null); }}>
        <DialogContent className="flex h-[86vh] max-h-[86vh] w-[92vw] max-w-[1200px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="h-9 shrink-0 flex-row items-center space-y-0 bg-primary px-4">
            <DialogTitle className="text-[12px] font-medium text-primary-foreground">
              {listaAberta === 'transferencias' ? 'Transferências entre contas' : 'No sistema, fora da planilha'} · {mesRotulo}
            </DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col p-2">
            {listaAberta === 'transferencias' ? (
              <EnriquecimentoTransferencias
                pares={paresDaConta}
                carregando={transf.carregando}
                simular={transf.simular}
                unir={transf.unir}
                unindo={transf.unindo}
                estornos={transf.estornos.pares}
                faturas={transf.faturas.faturas}
                simularEstorno={transf.simularEstorno}
                aplicarEstorno={transf.aplicarEstorno}
                simularFatura={transf.simularFatura}
                aplicarFatura={transf.aplicarFatura}
                onErro={(m) => toast.error(`Não foi possível concluir: ${m}`)}
                onUnido={(n) => toast.success(n > 0
                  ? `Transferência unida — ${n} vínculo${n === 1 ? '' : 's'} do extrato movido${n === 1 ? '' : 's'}.`
                  : 'Aplicado.')}
              />
            ) : listaAberta === 'fora' ? (
              <EnriquecimentoSemParSistema
                linhas={semParSistema ?? []}
                carregando={carregandoSemPar}
                onCancelar={handleCancelarDuplicado}
                onAbrirNoFinanceiro={onVerNoFinanceiro}
                /* 133i-b item 1 — o cadastro para a ação "É transferência para/de ▾". */
                contas={contasBancarias}
                /* 133i-c item 3 — o cliente, para as parcelas pendentes de "É parcela de financiamento ▾". */
                clienteId={clienteAtual?.id ?? null}
                onMudou={() => {
                  /* ⚠ AS DUAS ACOES DA LISTA CAEM AQUI, e as duas tiram a linha da lista: virar
                     transferencia e pagar parcela. */
                  qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
                  qcMesa.invalidateQueries({ queryKey: ['parcelas-financiamento-pendentes'] });
                  qcMesa.invalidateQueries({ queryKey: ['financiamentos-lista', clienteAtual?.id] });
                  qcMesa.invalidateQueries({ queryKey: ['financiamento-parcelas'] });
                  if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
                  toast.success('Aplicado.');
                }}
                onErro={(m) => toast.error(`Não foi possível: ${m}`)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ O EXTRATO DA PLANILHA — fica montado embaixo da Mesa: fechar a Mesa volta ao mesmo ponto ═══ */}
      <ExtratoDaPlanilhaModal
        open={extratoOpen}
        onOpenChange={setExtratoOpen}
        clienteId={clienteAtual?.id ?? null}
        anoMes={anoMesRegua ?? mesAtivo ?? ''}
        mesRotulo={mesRotulo}
        staging={staging}
        contas={linhasPainel.map((l) => ({ id: l.contaId, nome: l.nome }))}
        contaId={extratoContaId}
        onContaId={setExtratoContaId}
        sobrescreverIds={sobrescreverIds}
        onAbrirLinha={(stagingId, contaId) => {
          const balde = baldePorId.get(stagingId);
          abrirMesa(contaId, stagingId, passaNoFiltroMesa(balde, 'revisar') ? 'revisar' : 'todas');
        }}
        onAgrupar={agruparDoExtrato}
        onDesfazerBloco={desfazerBlocoDoExtrato}
      />

      {/* ⚠ MONTADO SEMPRE, visível por estado — o idioma do 131. Desmontá-lo ao fechar
          perderia o `scrollIntoView` do feed e faria o modal reabrir no topo; e quem fecha
          no meio quer voltar ao PONTO, não ao começo. */}
      <EnriquecerProgressoDialog
        open={verProgresso}
        onOpenChange={setVerProgresso}
        progresso={lote.progresso}
        resultado={lote.resultado}
        gravando={lote.gravando}
        onParar={lote.parar}
        onVerNoFinanceiro={onVerNoFinanceiro}
        onDesfazerLote={lote.podeDesfazer ? () => { void lote.desfazerLote(); } : undefined}
        arquivo={sessaoLabel}
        aba={null}
        linhasLidas={staging.length}
        mes={mesDaRegua}
        ano={anoDaRegua}
        cliente={clienteAtual?.nome ?? '—'}
      />

      {/* PR-UX-ENR-MODAL-01 — mesma mesa, superfície ampla. Mesmos prop-bags. */}
      <EnriquecimentoMesaModal
        open={mesaAmpliadaOpen}
        onOpenChange={setMesaAmpliadaOpen}
        sessaoLabel={sessaoLabel}
        lista={listaProps}
        detalhe={detalheProps}
        actions={actionsProps}
        faixas={faixasDaLinha}
        onOrdemVisivel={setOrdemDaMesa}
        /* 133h item 12 — quem veio do extrato tem campos que a RPC ignora. */
        conciliadosIds={conciliados}
        /* PR-CONC-ENRIQUECER-V2-01 — a Mesa abre na conta escolhida no painel (ou na da linha do Extrato). */
        contaId={mesaContaId}
        contaNome={mesaContaId ? (linhasPainel.find((l) => l.contaId === mesaContaId)?.nome ?? null) : null}
        baldePorId={baldePorId}
        filtroInicial={mesaFiltroInicial}
        aoFornecedor={{ previa: previaFornecedor, aplicando: aplicandoFornecedor, onAplicar: () => { void aplicarAoFornecedor(); } }}
      />

      {/* 133i item 1 — o agrupamento vira escolha, com os números na frente. */}
      <AgruparModal
        open={agruparOpen}
        onOpenChange={setAgruparOpen}
        movimento={{
          data: linhaCrua?.lanc_data_pagamento ?? linhaCrua?.excel_data ?? null,
          descricao: linhaCrua?.lanc_descricao ?? linhaCrua?.lanc_observacao ?? null,
          /* A conta pela régua do Conciliar — entrada lê o destino (133h item 7). */
          contaNome: linhaCrua
            ? contaEfetivaNome(linhaCrua.lanc_tipo_operacao, linhaCrua.lanc_conta_bancaria_nome, linhaCrua.lanc_conta_destino_nome)
            : null,
          valor: linhaCrua?.lanc_valor ?? null,
          documento: linhaCrua?.lanc_numero_documento ?? null,
        }}
        candidatas={candidatasDoGrupo}
        sugeridasIds={gruposIdsDoSplit}
        agrupando={isSubstituindo}
        onConfirmar={async (ids) => {
          await handleAgruparNesteLancamento(linhaCrua?.lanc_id ?? '', ids);
          setAgruparOpen(false);
          /* ⚠ AVANÇA DEPOIS DE AGRUPAR: as linhas que entraram viraram lançamentos e saem
             da fila; ficar parado na que acabou de sumir deixaria o painel vazio. */
          irProximo();
        }}
      />

      <EnriquecimentoImportarDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clienteId={clienteAtual?.id ?? null}
        onImportado={(sid) => { setSessaoId(sid); setFiltroConta('todas'); setFiltroGrupo('todas'); setSelecionadoId(null); setImportOpen(false); }}
        /* ⚠ O MÊS É O DA RÉGUA — 133a. A competência das linhas do cliente vai de 10/2025 a
           09/2026; o mês que se está conciliando é o que a tela mostra, e é contra ele que
           o casador procura lançamento. Sem a régua, cai no mês da sessão. */
        anoMes={anoMesRegua ?? mesAtivo ?? ''}
      />
    </div>
  );

}
