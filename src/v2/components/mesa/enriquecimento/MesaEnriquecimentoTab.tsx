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
  toRowVM, toSessoesVM, contarAplicaveisExatos, escolherMelhorSessaoId, diferencasDoResultado,
  listarContas, filtrarPorConta, resumirGrupos, filtrarPorGrupo, grupoDaLinha,
  sessoesDoMes, contaEfetivaNome, parteDeAgrupamento, explicadoPorSiMesmo,
  type EnriqGrupo,
} from '@/v2/lib/mesa/enriquecimentoView';
import { EnriquecimentoLista, type EnriquecimentoListaProps } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe, type EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import { type EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { AcaoEhTransferencia } from './AcaoEhTransferencia';
import type { EnriqRowVM, EnriqSessaoVM } from './types';
import { EnriquecimentoMesaModal } from './EnriquecimentoMesaModal';
import { EnriquecimentoImportarDialog } from './EnriquecimentoImportarDialog';
import { EnriquecimentoTopoNumeros, type VistaPasso2 } from './EnriquecimentoTopoNumeros';
import { EnriquecimentoTransferencias } from './EnriquecimentoTransferencias';
import { EnriquecimentoSemParSistema } from './EnriquecimentoSemParSistema';
import { useTransferenciasEspelhadas } from '@/v2/hooks/useTransferenciasEspelhadas';
import { useSistemaNaoExplicado } from '@/v2/hooks/useSistemaNaoExplicado';
import { useLancamentosConciliados } from '@/v2/hooks/useLancamentosConciliados';
import type { ContaResolvivel } from '@/v2/lib/mesa/resolverConta';
import { EnriquecerProgressoDialog } from '@/components/conciliacao/EnriquecerProgressoDialog';
import { useGravarLoteEnriquecimento, type LinhaParaGravar } from '@/v2/hooks/useGravarLoteEnriquecimento';
import { EnriquecimentoCandidatosInline } from './EnriquecimentoCandidatosInline';
import { AgruparModal } from './AgruparModal';
import { MesaCamposTabela, CAMPOS_OBRIGATORIOS_MESA } from './MesaCamposTabela';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Trash2 } from 'lucide-react';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { baixarCsv, csvLinhaPt } from '@/lib/csv';
import { fmtBRL, fmtData } from './fmt';
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
}

export function MesaEnriquecimentoTab({
  anoMesRegua, sessaoId: sessaoIdProp, onSessaoId, onVerNoFinanceiro,
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
  const [importOpen, setImportOpen] = useState(false);
  // PR-UX-ENR-MODAL-01 — superfície ampla da mesma mesa. Estado de UI puro:
  // não persiste, não sincroniza com URL, não altera nada do fluxo.
  const [mesaAmpliadaOpen, setMesaAmpliadaOpen] = useState(false);

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
    applyRow, isApplyingRow, reverterRow, isRevertingRow,
    apply, isApplying,
    editarProposto,
    resolverProximos, isResolvendoProximos, desfazerProximos,
    resolverGrupo, isResolvendoGrupo, desfazerGrupo,
    splitSubstituir, isSubstituindo,
    casarSessao, isCasando,
    excluirSessao, isExcluindoSessao,
    marcarRevisada,
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
    () => stagingConta.map((r) => toRowVM(r, contasResolviveis)),
    [stagingConta, contasResolviveis]);
  /* 133h item 3 — o único gate é o card do topo; `filtrarPorModo` saiu daqui com o
     "Todas | Pendentes". A função segue exportada e testada, para as telas legadas. */
  const rowsGrupo = useMemo(() => filtrarPorGrupo(rowsVM, filtroGrupo), [rowsVM, filtroGrupo]);
  /* ⚠ A ORDENAÇÃO É DA APRESENTAÇÃO, e por isso é a ÚLTIMA: ordenar antes de filtrar daria
     o mesmo resultado com mais trabalho, e ordenar dentro do filtro esconderia que a ordem
     padrão é a da planilha — que é a que o operador tem aberta ao lado. */
  const rowsFiltradas = useMemo(() => {
    /* ⚠ PAGAMENTO DECRESCENTE, DEPOIS VALOR — 133e adendo item 5, agora sem alternativa.
       `dataIso` já vem do adapter em `YYYY-MM-DD`: ordenar por ele é comparação de string,
       sem `Date` e sem desformatar o que o adapter formatou. Linha sem data vai para o fim. */
    return [...rowsGrupo].sort((a, b) => {
      const da = a.dataIso ?? ''; const db = b.dataIso ?? '';
      if (da !== db) return db.localeCompare(da);
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
   * ⚠ "MESMO DIA" É `excel_data`, medido: nos 20 grupos do NJ Pecuária, todas as linhas de um
   * grupo compartilham a mesma `excel_data` — nenhum grupo cruza dias.
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
    return staging.filter((r) => {
      if (r.aplicado) return false;
      if (r.excel_data !== dia) return false;
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

  // R1 — Promise da edição em voo (commit-on-blur de Produto/Documento). salvar() a aguarda
  // antes do apply, para o apply_row NUNCA ler update_proposto antes do editar_proposto commitar.
  const pendingEditRef = useRef<Promise<unknown> | null>(null);

  // Escrita por linha (PR-U1). Salvar = apply_row(overwrite=true); Reverter = reverter_row.
  const isBusy = isApplyingRow || isRevertingRow || isApplying;
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
    const porRotulo = new Map(selecionado.comparativo.map((c) => [c.campo, c]));
    /* O `campo` do adapter e o `rotulo` da tabela não são o mesmo nome; a tabela exporta os
       RÓTULOS, que é o que o operador lê no motivo. */
    const paresCampoRotulo: Array<[string, string]> = [
      ['Data pagamento', 'Data pgto.'], ['Valor', 'Valor'], ['Banco', 'Conta bancária'],
      ['Fazenda', 'Fazenda'], ['Produto / Descrição', 'Produto / descr.'],
      ['Subcentro', 'Conta do plano'],
    ];
    return paresCampoRotulo
      .filter(([campo, rot]) => {
        if (!CAMPOS_OBRIGATORIOS_MESA.includes(rot)) return false;
        const c = porRotulo.get(campo);
        return !c || c.resultado === '—' || c.resultado.trim() === '';
      })
      .map(([, rot]) => rot);
  }, [selecionado]);

  const podeSalvar = !!selecionado && !selecionado.aplicado && selecionado.temMatch
    /* 133i item 11 — parte de agrupamento só entra no lançamento pelo Agrupar. */
    && !selecionado.parteDeAgrupamento
    && obrigatoriosVazios.length === 0;
  const podeReverter = !!selecionado && selecionado.aplicado;
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
    : selecionado.aplicado ? 'Esta linha já foi gravada — use Reverter para desfazer.'
    : !selecionado.temMatch ? 'Sem lançamento vinculado: escolha um candidato antes de gravar.'
    /* ⚠ 133i item 11 — PARTE DE AGRUPAMENTO NÃO SE GRAVA SOZINHA. O `apply_row` aplica a
       linha por cima do lançamento CONSOLIDADO, e o consolidado vale a soma das partes:
       gravar uma delas escreve a classificação de R$ 8.000 num lançamento de R$ 25.590,80,
       e a segunda linha sobrescreve a primeira. Foi o que aconteceu no DARF de 25.590,80,
       com duas linhas gravadas sobre o mesmo lançamento. O gesto certo é Agrupar, que
       cria uma linha por parte. */
    : selecionado.parteDeAgrupamento
      ? 'Faz parte de um agrupamento — use Agrupar.'
    : obrigatoriosVazios.length > 0
      ? `Falta preencher: ${obrigatoriosVazios.join(', ')}.`
    : null;
  /**
   * ⚠ NADA A GRAVAR NÃO É ERRO — 133b-a correção 1. Quando o Resultado já confere com o
   * sistema, o apply não escreveria campo nenhum: o gesto que resta é CONFIRMAR que está
   * conferido e seguir, e o botão passa a dizer isso em vez de prometer uma gravação que
   * não acontece.
   */
  /**
   * 133h item 10 — as diferenças REAIS entre o Resultado e o lançamento.
   *
   * ⚠ `mudaAlgo` (a `will_change_anything` da view) SAIU DAQUI, e o envelope diz por quê:
   * ela só olha subcentro e fornecedor, e só quando o lançamento está vazio neles. Uma
   * linha cuja única mudança era a safra (25/26 -> 26/27) caía em `soConfirma`, o botão
   * dizia "Confirmar e Próximo", o operador confirmava — e a safra nova nunca era gravada.
   */
  const diferencas = useMemo(
    () => (selecionado ? diferencasDoResultado(selecionado.edicao) : []),
    [selecionado]);
  const soConfirma = !!selecionado && !selecionado.aplicado && selecionado.temMatch
    && !selecionado.parteDeAgrupamento
    && obrigatoriosVazios.length === 0 && diferencas.length === 0;
  /* 133i item 2c — já gravada e sem diferença: o gesto que resta é seguir. */
  const soAvanca = !!selecionado && selecionado.aplicado && diferencas.length === 0;

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

  async function salvar(): Promise<boolean> {
    if (!selecionado) return false;
    const id = selecionado.id;                       // captura antes do await (seleção pode mudar)
    try {
      // R1 — aguarda qualquer edição pendente (commit-on-blur de Produto/Documento) COMMITAR
      // antes de o apply_row ler update_proposto. Sem timeout/polling: só await da Promise.
      // (erro da edição já foi tratado no onEditar; aqui só garantimos a ordem.)
      try { await pendingEditRef.current; } catch { /* noop */ }
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
      if (precisaAlinhar(selecionado)) {
        await editarProposto({ staging_id: id, patch: { subcentro: selecionado.edicao.subcentro } });
      }
      const res: any = await applyRow({ staging_id: id, overwrite: true });
      if (res?.aplicado) { limparEditada(id); setErroBanco(null); toast.success('Lançamento salvo.'); return true; }
      /* 133h item 8 — SALVAR NUNCA FALHA EM SILÊNCIO: sem tradução conhecida, o motivo
         cru do banco vai para a tela. "Não salvo (undefined)" era o que aparecia quando a
         RPC devolvia um motivo novo. */
      const msg = MOTIVO_MSG[res?.motivo] ?? `o banco respondeu "${res?.motivo ?? 'sem motivo'}"`;
      setErroBanco({ id, msg });
      toast.error(`Não salvo — ${msg}`);
      return false;
    } catch (e: unknown) {
      /* O erro do trigger/constraint chega por aqui, e é ele que o operador precisa ler. */
      const msg = errMsg(e);
      setErroBanco({ id, msg });
      toast.error(`Não salvo — o banco recusou: ${msg}`);
      return false;
    }
  }
  async function handleSalvarProximo() {
    const ok = await salvar();
    if (ok) irProximo();
  }
  /**
   * Confirmar e próximo — 133b-a correção 1. NÃO chama o banco: não há o que gravar.
   *
   * ⚠ MARCA "REVISADO" E AVANÇA, que é exatamente o que o operador quis dizer. Chamar o
   * `apply_row` aqui gastaria uma ida ao banco para receber `nada_a_gravar` e mostrar um
   * toast de erro no fim de um gesto que deu certo.
   */
  async function handleConfirmarProximo() {
    if (!selecionado) return;
    const id = selecionado.id;
    limparEditada(id);
    setRevisei(true);
    /* ⚠ 133h item 9 — A CONFIRMAÇÃO PERSISTE. Ela vivia num `useState` do container:
       recarregar a página, trocar de sessão ou fechar a aba apagava tudo o que já tinha
       sido conferido, sem aviso — e Gabriel refez linhas por causa disso (07:47).
       ⚠ AVANÇA MESMO SE A MARCA FALHAR, e o erro aparece: travar a navegação por causa de
       uma marca de revisão seria pior que a marca não existir. */
    try {
      await marcarRevisada({ staging_id: id, revisada: true });
    } catch (e: unknown) {
      toast.error(`Confirmado na tela, mas não foi possível marcar como revisada: ${errMsg(e)}`);
    }
    irProximo();
  }
  async function handleReverter() {
    if (!selecionado) return;
    try {
      const res: any = await reverterRow(selecionado.id);
      if (res?.ok) { limparEditada(selecionado.id); toast.success('Revertido.'); }
      else toast.error(MOTIVO_MSG[res?.motivo] ?? `Não revertido (${res?.motivo ?? 'erro'}).`);
    } catch (e: unknown) {
      toast.error(`Erro ao reverter: ${errMsg(e)}`);
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

  // PR-U2c-2A — edição da proposta via editarProposto (os editores dos passos
  // 2B..2E chamam isto). patch = { subcentro | favorecido_id | fazenda_id | produto | ... }.
  async function onEditar(patch: Record<string, unknown>): Promise<void> {
    if (!selecionado) return;
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
        if (rej && Object.keys(rej).length > 0) {
          toast.error(`Alguns campos não aplicados: ${JSON.stringify(rej)}`);
        }
      } else {
        toast.error(MOTIVO_MSG[res?.motivo] ?? `Não editado (${res?.motivo ?? 'erro'}).`);
      }
    } catch (e: unknown) {
      toast.error(`Erro ao editar: ${errMsg(e)}`);
    } finally {
      if (pendingEditRef.current === p) pendingEditRef.current = null;
    }
  }

  /**
   * Aplicar ao grupo — MESA-ENR-UX-01 (129).
   *
   * ⚠ MESMAS DUAS RPCs DO SALVAR, uma linha por vez: `editarProposto` grava a proposta e
   * `applyRow` a aplica. Não há writer novo, e por isso cada linha rende o seu próprio
   * evento — o que a auditoria precisa para dizer o que mudou em qual lançamento.
   * ⚠ TRÊS CAMPOS, NÃO QUATRO. O envelope pede Fornecedor, Fazenda, Safra e Subcentro;
   * `fn_classificacao_apply_row` não grava `safra_id`, então a safra fica de fora e o
   * botão diz isso no título. Mandá-la no patch faria a RPC devolvê-la em
   * `campos_rejeitados` e o operador veria um toast de erro no meio de um lote que deu
   * certo.
   * ⚠ SEQUENCIAL, NÃO EM PARALELO: são escritas na mesma sessão de staging, e o `await`
   * em fila mantém a ordem dos eventos legível na auditoria. Um grupo tem unidades, não
   * centenas — o custo é o do gesto.
   * ⚠ FALHA DE UMA NÃO CANCELA AS OUTRAS, e o toast final diz quantas foram: parar no meio
   * deixaria o grupo pela metade sem o operador saber quais.
   */
  const [aplicandoGrupo, setAplicandoGrupo] = useState(false);
  async function handleAplicarAoGrupo(ids: string[]) {
    if (!selecionado || ids.length === 0) return;
    /* ⚠ A SAFRA ENTROU NO 129c. Antes ela ficava de fora porque o apply não a gravava e
       mandá-la voltaria em `campos_rejeitados` — um toast de erro no meio de um lote que
       deu certo. Agora `fn_classificacao_apply_row` grava `safra_id`, e o envelope pede
       os quatro. `safra` (o texto do Excel) continua carry-only: quem grava é o id. */
    const patch = {
      subcentro: selecionado.edicao.subcentro,
      favorecido_id: selecionado.edicao.favorecidoId,
      fazenda_id: selecionado.edicao.fazendaId,
      safra_id: selecionado.edicao.safraId,
    };
    setAplicandoGrupo(true);
    let ok = 0; let falhas = 0;
    try {
      for (const id of ids) {
        try {
          await editarProposto({ staging_id: id, patch });
          const res: any = await applyRow({ staging_id: id, overwrite: true });
          if (res?.aplicado) { ok++; } else falhas++;
        } catch { falhas++; }
      }
      toast[falhas === 0 ? 'success' : 'warning'](
        falhas === 0
          ? `${ok} ${ok === 1 ? 'linha aplicada' : 'linhas aplicadas'} ao grupo.`
          : `${ok} aplicadas · ${falhas} não aplicadas.`);
    } finally {
      setAplicandoGrupo(false);
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
  const detalheProps: EnriquecimentoDetalheProps = {
    row: selecionado,
    classificacoes,
    fornecedores,
    fazendas,
    safras,
    contas: contasBancarias,
    clienteId: clienteAtual?.id,
    hideBanco: filtroConta !== 'todas',
    onEditar,
    onCriarFornecedor: criarFornecedor,
  };
  const actionsProps: EnriquecimentoActionsProps = {
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
    soConfirma,
    soAvanca,
    onConfirmarProximo: () => { void handleConfirmarProximo(); },
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
      <AcaoEhTransferencia
        lancamentoId={selecionado.lancId}
        sentido={sentidoDaLinha}
        contaPropriaId={selecionado.edicao.contaBancariaIdAtual ?? null}
        contas={contasParaTransferencia}
        onAplicado={() => {
          toast.success('Transferência aplicada.');
          void qcMesa.invalidateQueries({ queryKey: ['classificacao-staging'] });
          void qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
        }}
        onErro={(m) => toast.error(m)}
      />
    ) : null,
    reverterDisabled: !podeReverter,
    aplicarTodosDisabled: !sessaoId || nAplicaveis === 0,
    isBusy,
    divergenciasDoExtrato,
    erroBanco: erroBanco && selecionado && erroBanco.id === selecionado.id ? erroBanco.msg : null,
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
    const ELEGIVEIS = new Set(['exato', 'divergente', 'ambiguo_resolvido', 'resolvido_manual', 'resolvido_grupo']);
    const out: LinhaParaGravar[] = [];
    for (const r of staging) {
      if (r.aplicado) continue;
      /* ⚠ 133i item 11 — O LOTE TAMBÉM NÃO PODE. Ele é o caminho que grava centenas: com a
         parte de um agrupamento na fila, o `apply_row` a escreve por cima do consolidado
         sem ninguém ver. Foi assim que o DARF de 25.590,80 recebeu duas classificações. */
      if (parteDeAgrupamento(r)) continue;
      const status: string = r.match_status;
      const sobrescrever = sobrescreverIds.has(r.staging_id);
      const entra = ELEGIVEIS.has(status) || (status === 'ja_classificado' && sobrescrever);
      if (!entra) continue;
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
  const faixasDaLinha = !selecionado ? null : (
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
              <span className="min-w-0 flex-1 text-[11px] text-violet-900 dark:text-violet-200">
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
              <span className="min-w-0 flex-1 text-[11px] text-amber-800 dark:text-amber-300">
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
          <div className="text-[10px] leading-[1.35] text-violet-900 dark:text-violet-200">
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
            <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
              disabled={isSubstituindo || !linhaCrua?.lanc_id || candidatasDoGrupo.length < 2}
              title={!linhaCrua?.lanc_id
                ? 'Esta linha não tem lançamento para agrupar.'
                : candidatasDoGrupo.length < 2
                  ? 'Não há duas linhas sem par no mesmo dia e conta.'
                  : 'Escolher quais linhas compõem este movimento.'}
              onClick={() => setAgruparOpen(true)}>
              Agrupar {gruposIdsDoSplit.length} linhas neste lançamento
            </Button>
            {candidatasDoGrupo.length > gruposIdsDoSplit.length && (
              <span className="text-[10px] text-violet-800 dark:text-violet-300">
                {candidatasDoGrupo.length} linhas do dia sem par — dá para incluir ou tirar
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

  return (
    <div className="flex flex-col gap-1 md:min-h-0 md:flex-1">
      {/* ═══ TOPO: seis números + os mesmos seis como chips ════════════════════════ */}
      <EnriquecimentoTopoNumeros
        resumo={resumo}
        total={rowsVM.length}
        filtro={filtroGrupo}
        onFiltro={(g) => { setFiltroGrupo(g); setSelecionadoId(null); }}
        /* ⚠ O CHIP CONTA O QUE A LISTA MOSTRA — 133e item G. Com o total do mês no chip e o
           recorte da conta na lista, os dois discordariam sempre que houvesse filtro. */
        /* ⚠ O CARD SOMA AS TRÊS FAMÍLIAS — 133f item 2. Elas respondem à mesma pergunta
           ("este dinheiro saiu mesmo?") e vivem no mesmo chip; um card que contasse só os
           pares entre contas diria 7 enquanto a tela tem 14. `únicos` vira o que ainda
           PEDE trabalho — o que está feito não é trabalho. */
        transferencias={transf.carregando ? undefined : {
          total: paresDaConta.length + transf.estornos.total + transf.faturas.total,
          unicos: paresDaConta.filter((p) => !p.ambiguo).length
            + transf.estornos.pendentes + transf.faturas.pendentes,
        }}
        semParSistema={semParSistema?.length}
        /* ⚠ 133i item 7 — O NÚMERO É O DA LISTA, e não o do mês. O envelope fala em
           "lançamentos do mês"; medido no NJ agosto, são 84 lançamentos assim, e a sessão
           aponta para 104 deles em 670 linhas. Contar o mês e filtrar a sessão faria o card
           e a lista falarem de universos diferentes — o defeito que os outros sete cards
           evitam por construção. Fica o da sessão; o do mês é decisão de produto. */
        incompletos={incompletos}
      />

      {/* ═══ TOOLBAR — UMA LINHA DE 32px (133d item 2) ════════════════════════════
          ⚠ SEM RÓTULO ACIMA DO CAMPO: o VALOR é o rótulo. "Todas as contas" e "Ordem da
          planilha" dizem o que o campo é sem gastar uma palavra ao lado — e as palavras ao
          lado eram o que fazia a barra quebrar em duas linhas.
          ⚠ NADA OCUPA A LINHA INTEIRA: `flex-nowrap` e larguras fixas. Com `flex-wrap`, o
          primeiro campo que não coubesse levava a barra para 64px e o topo para fora da
          dobra. */}
      <div className="flex h-8 w-full shrink-0 flex-nowrap items-center gap-1.5 overflow-hidden rounded-lg border bg-card px-2">
        {/* ⚠ `Select` DA CASA, NUNCA `<select>` NATIVO: o menu do sistema operacional abre
            com outra fonte e outro idioma em cada máquina. */}
        {/* ⚠ VIROU `DropdownMenu` PORQUE CADA ITEM GANHOU UM SEGUNDO GESTO — 133h item 2.
            Um `SelectItem` do Radix engole o clique do que estiver dentro dele: o ícone de
            excluir viraria "escolher esta sessão". O menu permite os dois — a linha escolhe,
            o ícone pede a exclusão — e continua sendo controle da casa, nunca nativo.
            ⚠ A SESSÃO É O QUE CEDE — 133e item C. Ela era 260px fixos e empurrava a barra
            para além do container em 1280; agora é ELÁSTICA entre 160 e 320 e trunca,
            enquanto os controles de largura fixa e os botões não encolhem. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button"
              className="flex h-6 min-w-[160px] max-w-[320px] flex-1 items-center gap-1 rounded-md border border-input bg-background px-2 text-left text-[11px] hover:bg-muted/50">
              <span className="min-w-0 flex-1 truncate" title={sessaoLabel ?? undefined}>
                {sessaoLabel ?? '— nenhuma importação —'}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-[340px] overflow-y-auto">
            {sessoesDoMesVM.length === 0 ? (
              <div className="px-2 py-3 text-center text-[10px] text-muted-foreground">
                Nenhuma importação para {mesDaRegua && anoDaRegua ? `${String(mesDaRegua).padStart(2, '0')}/${anoDaRegua}` : 'este mês'}.
              </div>
            ) : sessoesDoMesVM.map((sv) => (
              <DropdownMenuItem key={sv.id} className="gap-1 text-[11px]"
                onSelect={() => { setSessaoId(sv.id); setFiltroConta('todas'); setSelecionadoId(null); }}>
                <span className="min-w-0 flex-1 truncate" title={sv.label}>{sv.label}</span>
                {/* ⚠ `preventDefault` NO ÍCONE: sem ele o menu fecha e a confirmação inline
                    nasce sem que ninguém a veja — o gesto de pedir a exclusão não é o de
                    escolher a sessão. */}
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
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]"
          onClick={() => setImportOpen(true)}>
          ⬆ Importar planilha
        </Button>
        {/* ⚠ RECASAR SEM REIMPORTAR — 133a. Resolver um ambíguo ou mapear uma conta no
            de-para muda o que casa; sem ele, ver o efeito custaria reimportar tudo. */}
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]"
          disabled={isCasando || !sessaoId}
          title={!sessaoId ? 'Escolha uma importação.' : 'Procura de novo o lançamento de cada linha, sem reimportar.'}
          onClick={() => { void recasar(); }}>
          {isCasando ? 'Recasando…' : '↻ Recasar'}
        </Button>

        {/* ⚠ O SELETOR DE CONTA É UM SÓ NO SISTEMA — 133g item 9. Esta lista era montada à
            mão e saía na ordem do VOLUME (a conta com mais linhas primeiro), sem gaveta
            nenhuma: quinze contas correntes, investimentos e cartões embaralhados. Agora
            agrupa por tipo como todo seletor de conta, e a CONTAGEM continua no rótulo —
            ela é o que diz onde está o trabalho.
            ⚠ "Todas" e "Sem conta" ENTRAM POR `prependItems`: são sentinelas do filtro, não
            contas do cadastro, e um grupo com elas dentro seria mentira sobre o cadastro. */}
        <div className="w-[170px] shrink-0">
          <ContaBancariaSelect
            value={filtroConta}
            onValueChange={(id) => { setFiltroConta(id); setSelecionadoId(null); }}
            contas={contasDoFiltro}
            prependItems={itensFixosDoFiltro}
            className="h-6 text-[11px]"
          />
        </div>

        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]"
          disabled={mesaAmpliadaVazia}
          title={mesaAmpliadaVazia ? 'Nenhuma linha neste recorte.' : 'Revisar campo a campo e salvar — em tela cheia.'}
          onClick={() => setMesaAmpliadaOpen(true)}>
          Mesa ampliada
        </Button>
      </div>

      {/* ⚠ A CONFIRMAÇÃO É INLINE E EFÊMERA — 133h item 2: ela só ocupa altura enquanto
          existe, e some no gesto seguinte. Um diálogo modal para apagar uma importação de
          rascunho seria pesado demais para o que o banco já protege (linha gravada recusa),
          e leve demais seria apagar no primeiro clique. */}
      {exclusaoPendente && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/20">
          <span className="min-w-0 flex-1 truncate text-[10px] text-amber-900 dark:text-amber-200"
            title={exclusaoPendente.label}>
            <b className="tabular-nums">{exclusaoPendente.linhas}</b> linhas · nenhuma gravada — excluir{' '}
            {exclusaoPendente.label}?
          </span>
          <Button type="button" size="sm" className="h-6 shrink-0 px-2 text-[10px]"
            disabled={isExcluindoSessao}
            onClick={() => { void confirmarExclusao(); }}>
            {isExcluindoSessao ? 'Excluindo…' : 'Excluir'}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[10px]"
            onClick={() => setExclusaoPendente(null)}>
            Não
          </Button>
        </div>
      )}

      {isFetching && <div className="shrink-0 px-1 text-[10px] text-muted-foreground">Carregando…</div>}

      {/* ═══ CORPO ════════════════════════════════════════════════════════════════
          ⚠ DOIS CHIPS TROCAM O CORPO INTEIRO — 133c. Transferência e "sem par no sistema"
          não olham linhas da planilha: a unidade de um é o PAR de lançamentos, a do outro é
          o lançamento órfão. Encaixá-los na lista de linhas faria o contador do chip e o
          tamanho da lista falarem de coisas diferentes. */}
      {filtroGrupo === 'transferencia' ? (
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
      ) : filtroGrupo === 'sem_par_sistema' ? (
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
               transferencia e pagar parcela. Por isso a invalidacao e' a mesma, mais a
               lista de financiamentos — que muda quando uma parcela e' paga. */
            qcMesa.invalidateQueries({ queryKey: ['sistema-nao-explicado'] });
            qcMesa.invalidateQueries({ queryKey: ['parcelas-financiamento-pendentes'] });
            qcMesa.invalidateQueries({ queryKey: ['financiamentos-lista', clienteAtual?.id] });
            qcMesa.invalidateQueries({ queryKey: ['financiamento-parcelas'] });
            if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
            toast.success('Aplicado.');
          }}
          onErro={(m) => toast.error(`Não foi possível: ${m}`)}
        />
      ) : (
      <>
        {/* ⚠ A TABELA SAIU DA TELA PRINCIPAL — 133d item 3. O passo 2 tinha lista de 400px
            + tabela de 15 campos + candidatos + rodapé, e nada disso cabia em 900px: a
            página rolava, e rolar a página tira o topo de 6 números da vista bem na hora
            de conferir. Aqui ele é uma LISTA de largura total; revisar campo a campo é o
            gesto da Mesa, e clicar na linha leva direto a ela.
            ⚠ NÃO É PERDA DE CAMINHO: a Mesa ampliada tem a mesma tabela, os mesmos
            candidatos e o Salvar — e agora abre NA LINHA que o operador escolheu. */}
        <p className="shrink-0 px-1 text-[10px] text-muted-foreground">
          Clique na linha para revisar e salvar na Mesa.
        </p>
        <div className="min-h-0 md:flex-1">
          <EnriquecimentoLista {...listaProps} />
        </div>
      </>
      )}

      {/* ═══ RODAPÉ FIXO ══════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
        <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
          {/* ⚠ 133h item 11 — O RODAPÉ DIZ QUAL DOS DOIS TOCA O FINANCEIRO. A tela tinha
              "Salvar" e "Confirmar" lado a lado e não dizia em lugar nenhum que só um
              deles grava; o operador confirmava a sessão inteira achando que estava
              gravando, e nada chegava ao lançamento. */}
          <b>Salvar</b> grava no lançamento agora. <b>Confirmar</b> só marca a linha como revisada.
          {' · '}
          <b className="tabular-nums">{revisadas}</b>/<b className="tabular-nums">{rowsVM.length}</b> revisado
          {' · '}
          Gravar aplica os{' '}
          <b className="tabular-nums">{resumo.atualizam.qtd}</b> que atualizam, os que você decidiu e os
          agrupamentos que você aceitou. Os sem par ficam no relatório.
          {editadasIds.size > 0 && (
            <> · <b className="tabular-nums text-amber-700 dark:text-amber-400">{editadasIds.size}</b>{' '}
              editada{editadasIds.size === 1 ? '' : 's'} nesta sessão, marcada{editadasIds.size === 1 ? '' : 's'} em âmbar.</>
          )}
        </span>
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]"
          disabled={resumo.sem_par.qtd === 0}
          title={resumo.sem_par.qtd === 0 ? 'Nenhuma linha sem par neste recorte.' : 'CSV com linha, data, conta, descrição, valor e motivo'}
          onClick={baixarSemPar}>
          Baixar sem par (CSV)
        </Button>
        {/* ⚠ O NÚMERO DO BOTÃO É O DA FILA, não o do topo — 133c. O topo conta por grupo
            dentro do recorte de conta; a fila é a sessão inteira, sem as já aplicadas e sem
            as `ja_classificado` que ninguém liberou. Dois números diferentes com o mesmo
            rótulo seria a tela discordando de si mesma. */}
        <Button type="button" size="sm" className="h-6 px-2 text-[10px]"
          disabled={linhasDoLote.length === 0 || lote.gravando}
          title={linhasDoLote.length === 0
            ? 'Nada a gravar: as linhas que atualizam já foram aplicadas, ou não há nenhuma.'
            : `Aplica ${linhasDoLote.length} linha(s) uma a uma, com progresso. Nada é criado.`}
          onClick={() => { void handleGravarLote(); }}>
          {lote.gravando ? `Gravando… ${lote.progresso.feitas} de ${lote.progresso.total}` : `Gravar ${linhasDoLote.length}`}
        </Button>
      </div>

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
        onAplicarAoGrupo={handleAplicarAoGrupo}
        aplicandoGrupo={aplicandoGrupo}
        faixas={faixasDaLinha}
        onOrdemVisivel={setOrdemDaMesa}
        /* 133h item 6 — o cadastro, para o filtro de conta da Mesa agrupar por tipo. */
        contas={contasBancarias}
        /* 133h item 12 — quem veio do extrato tem campos que a RPC ignora. */
        conciliadosIds={conciliados}
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
