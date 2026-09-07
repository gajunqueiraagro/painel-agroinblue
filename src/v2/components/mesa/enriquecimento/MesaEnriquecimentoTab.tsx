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
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useClassificacaoStaging, useSessoesClassificacao } from '@/v2/hooks/useClassificacaoStaging';
import {
  toRowVM, toSessoesVM, contarAplicaveisExatos, filtrarPorModo, escolherMelhorSessaoId,
  listarContas, filtrarPorConta, resumirGrupos, filtrarPorGrupo, GRUPO_DE_STATUS,
  type EnriqGrupo,
} from '@/v2/lib/mesa/enriquecimentoView';
import { EnriquecimentoLista, type EnriquecimentoListaProps } from './EnriquecimentoLista';
import { EnriquecimentoDetalhe, type EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import { type EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { EnriquecimentoMesaModal } from './EnriquecimentoMesaModal';
import { EnriquecimentoImportarDialog } from './EnriquecimentoImportarDialog';
import { EnriquecimentoTopoNumeros } from './EnriquecimentoTopoNumeros';
import { EnriquecimentoCandidatosInline } from './EnriquecimentoCandidatosInline';
import { MesaCamposTabela } from './MesaCamposTabela';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { baixarCsv, csvCampo } from '@/lib/csv';
import { fmtBRL, fmtData } from './fmt';
import { Button } from '@/components/ui/button';

/** Como a lista da esquerda é ordenada — 133b, o controle "ordenação" da direita. */
type Ordenacao = 'planilha' | 'valor' | 'data';

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
}

export function MesaEnriquecimentoTab({ anoMesRegua, sessaoId: sessaoIdProp, onSessaoId }: MesaEnriquecimentoTabProps = {}) {
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
  const [filtroGrupo, setFiltroGrupo] = useState<EnriqGrupo | 'todas'>('todas');
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('planilha');
  const [filtroModo, setFiltroModo] = useState<'pendentes' | 'todas'>('todas');   // PR-U2d-1 — burn-down

  // PR-U2d-1 — janela de graça: ids recém-aplicados ficam visíveis ~1,4s antes do
  // burn-down (só timing de apresentação; nada de dados do VM aqui).
  const GRACE_MS = 1400;
  const [graceIds, setGraceIds] = useState<Set<string>>(() => new Set());
  const graceTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { graceTimers.current.forEach(clearTimeout); }, []);
  function manterEmGraca(id: string) {
    setGraceIds((prev) => { const n = new Set(prev); n.add(id); return n; });
    const t = setTimeout(() => {
      setGraceIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }, GRACE_MS);
    graceTimers.current.push(t);
  }
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
  const marcarEditada = (id: string) =>
    setEditadasIds((p) => { const n = new Set(p); n.add(id); return n; });
  const limparEditada = (id: string) =>
    setEditadasIds((p) => { if (!p.has(id)) return p; const n = new Set(p); n.delete(id); return n; });
  const [revisei, setRevisei] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // PR-UX-ENR-MODAL-01 — superfície ampla da mesma mesa. Estado de UI puro:
  // não persiste, não sincroniza com URL, não altera nada do fluxo.
  const [mesaAmpliadaOpen, setMesaAmpliadaOpen] = useState(false);

  // Auto-seleção da sessão mais útil na abertura (regra extraída para o módulo puro).
  useEffect(() => {
    if (sessaoId || controlada) return;
    const melhor = escolherMelhorSessaoId(sessoes);
    if (melhor) setSessaoIdLocal(melhor);
  }, [sessaoId, sessoes, controlada]);

  const {
    staging, isFetching,
    applyRow, isApplyingRow, reverterRow, isRevertingRow,
    apply, isApplying,
    editarProposto,
    resolverProximos, isResolvendoProximos, desfazerProximos,
    isResolvendoGrupo, desfazerGrupo,
    casarSessao, isCasando,
  } = useClassificacaoStaging(sessaoId, clienteAtual?.id);

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
    loadClassificacoes, loadFornecedores, loadSafras, loadContas, criarFornecedor } = useFinanceiroV2();
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
  /* O mês da sessão — o fallback do casador quando a régua não vem por prop. Os rótulos de
     conta/mês do drawer "sistema não explicado" saíram com ele (133b). */
  const mesAtivo = sessoes?.find((s) => s.sessao_id === sessaoId)?.excel_ano_mes ?? null;
  // Conta é a partição de trabalho: contadores, lista e fluxo derivam do staging DA CONTA.
  const stagingConta = useMemo(() => filtrarPorConta(staging, filtroConta), [staging, filtroConta]);
  /* 133b — os seis números do topo e as somas em R$, da MESMA lista que a tela desenha.
     ⚠ `contarContagens` SAIU DAQUI: ele conta os treze `match_status`, e a tela agora fala
     em seis grupos. Manter os dois faria dois números para a mesma pergunta. Ele continua
     exportado e testado — a mesa ampliada e as telas legadas o usam. */
  const resumo = useMemo(() => resumirGrupos(stagingConta), [stagingConta]);
  // P0-1A: o lote é da SESSÃO (todas as contas) — não pode depender do filtro de conta.
  const nAplicaveis = useMemo(() => contarAplicaveisExatos(staging), [staging]);
  const rowsVM = useMemo(() => stagingConta.map(toRowVM), [stagingConta]);
  // PR-U2d-1 — modo (pendentes/todas) é o gate; o filtro por status refina dentro dele.
  const rowsModo = useMemo(() => filtrarPorModo(rowsVM, filtroModo, graceIds), [rowsVM, filtroModo, graceIds]);
  const rowsGrupo = useMemo(() => filtrarPorGrupo(rowsModo, filtroGrupo), [rowsModo, filtroGrupo]);
  /* ⚠ A ORDENAÇÃO É DA APRESENTAÇÃO, e por isso é a ÚLTIMA: ordenar antes de filtrar daria
     o mesmo resultado com mais trabalho, e ordenar dentro do filtro esconderia que a ordem
     padrão é a da planilha — que é a que o operador tem aberta ao lado. */
  const rowsFiltradas = useMemo(() => {
    if (ordenacao === 'planilha') return rowsGrupo;
    const copia = [...rowsGrupo];
    if (ordenacao === 'valor') {
      copia.sort((a, b) => Math.abs(b.valorNum ?? 0) - Math.abs(a.valorNum ?? 0));
    } else {
      /* `data` já vem "dd/mm/aaaa" do adapter; comparar strings nesse formato ordenaria por
         dia. Os pedaços invertidos dão a ordem cronológica sem reconverter para Date. */
      const chave = (d: string) => d.split('/').reverse().join('');
      copia.sort((a, b) => chave(a.data).localeCompare(chave(b.data)));
    }
    return copia;
  }, [rowsGrupo, ordenacao]);

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

  // Navegação read-only entre linhas da lista (Anterior/Próximo) — só troca a seleção.
  const idx = rowsNaTela.findIndex((r) => r.id === selecionadoId);
  const canAnterior = idx > 0;
  const canProximo = rowsNaTela.length > 0 && idx < rowsNaTela.length - 1;
  const irAnterior = () => { if (canAnterior) setSelecionadoId(rowsNaTela[idx - 1].id); };
  const irProximo = () => {
    if (idx < 0) { if (rowsNaTela.length) setSelecionadoId(rowsNaTela[0].id); }
    else if (canProximo) setSelecionadoId(rowsNaTela[idx + 1].id);
  };
  const posicao = `${idx >= 0 ? idx + 1 : '—'} / ${rowsNaTela.length}`;

  // R1 — Promise da edição em voo (commit-on-blur de Produto/Documento). salvar() a aguarda
  // antes do apply, para o apply_row NUNCA ler update_proposto antes do editar_proposto commitar.
  const pendingEditRef = useRef<Promise<unknown> | null>(null);

  // Escrita por linha (PR-U1). Salvar = apply_row(overwrite=true); Reverter = reverter_row.
  const isBusy = isApplyingRow || isRevertingRow || isApplying;
  // Linha órfã (subcentro fora do plano) não pode ser aplicada — a trigger do
  // lançamento rejeita. Só será salvável após editar o subcentro (PR-U2).
  const podeSalvar = !!selecionado && !selecionado.aplicado && selecionado.temMatch && !selecionado.subcentroOrfao;
  const podeReverter = !!selecionado && selecionado.aplicado;
  /**
   * 133b-a correção 1 — POR QUE o Salvar está apagado, escrito ao lado.
   *
   * ⚠ SÃO DOIS MOTIVOS, E SÓ DOIS: a linha não tem lançamento vinculado, ou a proposta de
   * subcentro está fora do plano oficial (a trigger do lançamento recusa). Nenhum deles é
   * "falta revisar" — e era isso que a tela dava a entender, obrigando o operador a
   * redigitar um subcentro que já estava certo para "liberar" o botão.
   */
  const motivoSalvar: string | null =
    !selecionado ? 'Escolha uma linha.'
    : selecionado.aplicado ? 'Esta linha já foi gravada — use Reverter para desfazer.'
    : !selecionado.temMatch ? 'Sem lançamento vinculado: escolha um candidato antes de gravar.'
    : selecionado.subcentroOrfao ? 'A conta do plano proposta não existe no plano oficial — escolha uma da lista.'
    : null;
  /**
   * ⚠ NADA A GRAVAR NÃO É ERRO — 133b-a correção 1. Quando o Resultado já confere com o
   * sistema, o apply não escreveria campo nenhum: o gesto que resta é CONFIRMAR que está
   * conferido e seguir, e o botão passa a dizer isso em vez de prometer uma gravação que
   * não acontece.
   */
  const soConfirma = !!selecionado && !selecionado.aplicado && selecionado.temMatch
    && !selecionado.subcentroOrfao && !selecionado.mudaAlgo;

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
      const res: any = await applyRow({ staging_id: id, overwrite: true });
      if (res?.aplicado) { manterEmGraca(id); limparEditada(id); toast.success('Lançamento salvo.'); return true; }
      toast.error(MOTIVO_MSG[res?.motivo] ?? `Não salvo (${res?.motivo ?? 'erro'}).`);
      return false;
    } catch (e: unknown) {
      toast.error(`Erro ao salvar: ${errMsg(e)}`);
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
  function handleConfirmarProximo() {
    if (!selecionado) return;
    limparEditada(selecionado.id);
    setRevisei(true);
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
          if (res?.aplicado) { manterEmGraca(id); ok++; } else falhas++;
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
    onSelecionar: setSelecionadoId,
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
    onConfirmarProximo: handleConfirmarProximo,
    reverterDisabled: !podeReverter,
    aplicarTodosDisabled: !sessaoId || nAplicaveis === 0,
    isBusy,
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

  function baixarSemPar() {
    const linhas = ['linha,data,conta,descricao,valor,motivo'];
    for (const r of stagingConta) {
      if (GRUPO_DE_STATUS[r.match_status] !== 'sem_par') continue;
      linhas.push([
        r.excel_linha_origem ?? '',
        csvCampo(fmtData(r.excel_data)),
        csvCampo(r.conta_filtro_nome ?? r.excel_conta_origem ?? ''),
        csvCampo(r.excel_produto ?? r.excel_fornecedor ?? ''),
        csvCampo(fmtBRL(r.excel_valor)),
        csvCampo(motivoSemPar(r.match_status)),
      ].join(','));
    }
    baixarCsv('enriquecer_sem_par_no_banco', linhas);
  }

  return (
    <div className="flex flex-col gap-1 md:min-h-0 md:flex-1">
      {/* ═══ TOPO: seis números + os mesmos seis como chips ════════════════════════ */}
      <EnriquecimentoTopoNumeros
        resumo={resumo}
        total={rowsModo.length}
        filtro={filtroGrupo}
        onFiltro={(g) => { setFiltroGrupo(g); setSelecionadoId(null); }}
      />

      {/* ═══ BARRA: sessão à esquerda · conta e ordenação à direita ════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-2 py-1">
        <span className="text-[10px] text-muted-foreground">Importação</span>
        {/* ⚠ `Select` DA CASA, NUNCA `<select>` NATIVO: o menu do sistema operacional abre
            com outra fonte e outro idioma em cada máquina. */}
        <Select value={sessaoId ?? ''}
          onValueChange={(id) => { setSessaoId(id); setFiltroConta('todas'); setSelecionadoId(null); }}>
          <SelectTrigger className="h-6 min-w-[240px] text-[10px]">
            <SelectValue placeholder="— nenhuma importação —" />
          </SelectTrigger>
          <SelectContent>
            {sessoesVM.map((sv) => (
              <SelectItem key={sv.id} value={sv.id} className="text-[10px]">{sv.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setImportOpen(true)}>
          ⬆ Importar planilha
        </Button>
        {/* ⚠ RECASAR SEM REIMPORTAR — 133a. Resolver um ambíguo ou mapear uma conta no
            de-para muda o que casa; sem ele, ver o efeito custaria reimportar tudo. */}
        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
          disabled={isCasando || !sessaoId}
          title={!sessaoId ? 'Escolha uma importação.' : 'Procura de novo o lançamento de cada linha, sem reimportar.'}
          onClick={() => { void recasar(); }}>
          {isCasando ? 'Recasando…' : '↻ Recasar'}
        </Button>

        <div className="flex-1" />

        <span className="text-[10px] text-muted-foreground">Conta</span>
        <Select value={filtroConta} onValueChange={(id) => { setFiltroConta(id); setSelecionadoId(null); }}>
          <SelectTrigger className="h-6 min-w-[150px] text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas" className="text-[10px]">Todas</SelectItem>
            {contas.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-[10px]">{c.nome} ({c.total})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-[10px] text-muted-foreground">Ordem</span>
        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as Ordenacao)}>
          <SelectTrigger className="h-6 min-w-[120px] text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="planilha" className="text-[10px]">Ordem da planilha</SelectItem>
            <SelectItem value="valor" className="text-[10px]">Maior valor</SelectItem>
            <SelectItem value="data" className="text-[10px]">Data</SelectItem>
          </SelectContent>
        </Select>

        {/* PR-U2d-1 — burn-down: "Pendentes" esconde o que já acabou. */}
        <div className="flex overflow-hidden rounded border">
          {(['todas', 'pendentes'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setFiltroModo(m)}
              className={`h-6 px-2 text-[10px] capitalize ${
                filtroModo === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/50'}`}>
              {m}
            </button>
          ))}
        </div>

        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]"
          disabled={mesaAmpliadaVazia}
          /* ⚠ A MESA AMPLIADA CONTINUA ALCANÇÁVEL, e não é resíduo: até a 133c dar ação ao
             passo 3, ela é o ÚNICO lugar com Salvar, Reverter e "aplicar ao grupo". Tirá-la
             daqui deixaria a aba sem nenhuma forma de gravar entre um envelope e o outro. */
          title={mesaAmpliadaVazia ? 'Nenhuma linha neste recorte.' : 'Salvar, reverter e aplicar ao grupo — em tela cheia.'}
          onClick={() => setMesaAmpliadaOpen(true)}>
          Mesa ampliada
        </Button>
      </div>

      {isFetching && <div className="shrink-0 px-1 text-[10px] text-muted-foreground">Carregando…</div>}

      {/* ═══ CORPO: lista 400px · tabela de 15 campos ══════════════════════════════ */}
      <div className="grid min-h-0 grid-cols-1 items-start gap-1.5 md:flex-1 md:[grid-template-columns:400px_minmax(0,1fr)] md:[grid-template-rows:minmax(0,1fr)]">
        <EnriquecimentoLista {...listaProps} />

        <div className="flex min-h-0 flex-col gap-1 md:h-full">
          {selecionado ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
                {/* ⚠ OS MESMOS QUATRO CARDS DE 44px DA MESA AMPLIADA — 133b-a pendente 3.
                    A aba tinha um cabeçalho próprio (descrição + uma linha de contexto) e a
                    ampliada tinha os quatro cards: dois desenhos para a mesma pergunta, e o
                    operador que ia e voltava entre as duas relia a linha em dois formatos.
                    ⚠ NÃO ROLA — A21: quem some ao rolar é a identidade da linha que se está
                    conferindo. */}
                <div className="flex h-11 shrink-0 items-center border-b bg-muted px-3">
                  <div className="grid w-full grid-cols-4 gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">Linha</div>
                      <div className="truncate text-[16px] font-medium leading-tight"
                        title={selecionado.descricaoExcel}>{selecionado.linha ?? '—'}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">
                        {selecionado.entradaOuSaida === 'saida' ? 'Saída'
                          : selecionado.entradaOuSaida === 'entrada' ? 'Entrada' : '—'}
                      </div>
                      <div className={`truncate text-[16px] font-medium leading-tight tabular-nums ${
                        selecionado.entradaOuSaida === 'saida' ? 'text-red-600 dark:text-red-400'
                        : selecionado.entradaOuSaida === 'entrada' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}>
                        {selecionado.entradaOuSaida === 'saida' ? '−' : ''}{selecionado.valor}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">Conta bancária</div>
                      <div className="truncate text-[16px] font-medium leading-tight" title={selecionado.banco}>
                        {selecionado.banco}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] leading-tight text-muted-foreground">O que muda</div>
                      <div className={`truncate text-[16px] font-medium leading-tight ${
                        selecionado.mudaAlgo ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}
                        title={selecionado.comparativo.filter((c) => c.tom === 'muda' || c.tom === 'difere')
                          .map((c) => c.campo).join(' · ') || 'Nada muda: o Resultado já confere com o sistema.'}>
                        {(() => {
                          const n = selecionado.comparativo.filter((c) => c.tom === 'muda' || c.tom === 'difere').length;
                          return n === 0 ? 'nada muda' : `${n} campo${n > 1 ? 's' : ''}`;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* A descrição da planilha e o desfazer, na faixa de 10px logo abaixo dos
                    quatro números — como o "Sugerido por" da ampliada. */}
                <div className="shrink-0 border-b px-3 py-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
                      title={selecionado.descricaoExcel}>
                      {selecionado.descricaoExcel} · {selecionado.data}
                    </span>
                    {/* ⚠ O DESFAZER SOBREVIVEU ÀS FAIXAS — 133b. Ele morava em duas faixas
                        coloridas que saíram; sem ele, uma escolha errada não teria volta
                        pela tela, e a RPC de desfazer existe justamente para isso. */}
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
                </div>
                <MesaCamposTabela
                  row={selecionado}
                  classificacoes={classificacoes}
                  fornecedores={fornecedores}
                  fazendas={fazendas}
                  safras={safras}
                  contas={contasBancarias}
                  clienteId={clienteAtual?.id}
                  onEditar={onEditar}
                  onCriarFornecedor={criarFornecedor}
                />
              </div>

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
          ) : (
            <div className="rounded-lg border bg-card p-4 text-center text-[11px] text-muted-foreground">
              Escolha uma linha à esquerda para conferir campo a campo.
            </div>
          )}
        </div>
      </div>

      {/* ═══ RODAPÉ FIXO ══════════════════════════════════════════════════════════ */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1">
        <span className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
          Nada foi gravado no lançamento ainda. Gravar aplica os{' '}
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
        {/* ⚠ DESABILITADO NESTE ENVELOPE, e o motivo está no `title` e ao lado: a gravação em
            lote é a 133c. Um botão que grava metade seria pior que um botão que não grava. */}
        <Button type="button" size="sm" className="h-6 px-2 text-[10px]" disabled
          title="em construção — 133c">
          Gravar {resumo.atualizam.qtd} + {resumo.decide.qtd} decididos
        </Button>
      </div>

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
