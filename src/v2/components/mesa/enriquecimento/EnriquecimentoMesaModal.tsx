// ============================================================================
// EnriquecimentoMesaModal — a Mesa de Revisão ampla (MESA-ENR-UX-01, envelope 129).
//
// ⚠ A MOLDURA NÃO ROLA. Cabeçalho, bloco de topo, cabeçalho das colunas e rodapé são
// fixos; rolam DUAS coisas e só elas: a lista da esquerda e a tabela de campos da direita
// (A21). A cadeia que sustenta isso é `h-[92vh]` → `flex-col` → `flex-1 min-h-0` no corpo
// → `min-h-0` em cada card → `overflow-y-auto` só nos dois scrollports. Tirar qualquer
// `min-h-0` faz o filho crescer e a moldura voltar a rolar — foi assim nas duas vezes em
// que o `sticky` "existia e não grudava".
//
// ⚠ COMPONENTE BURRO. Recebe os mesmos prop-bags que a aba usa (lista/detalhe/actions) e
// mais a conta e o balde de cada linha. Nada é buscado nem calculado aqui além de agrupar e
// contar o que já veio.
//
// ⚠ MESA COMPACTA — PR-CONC-ENRIQUECER-V2-01: lista de 168px aberta NA CONTA, cabeçalho com o
// valor e quem/quando/o quê, checklist numa linha (na tabela de campos), quatro blocos, e o
// rodapé ◀ ▶ Reverter | falta | Pular | Aprovar e próximo. Saíram do rodapé o "Salvar" (o
// Aprovar é o Salvar + avanço), "Revisado"/"Exatos" (o "Gravar N prontas" do painel faz o lote)
// e "Ao fornecedor".
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import type { EnriquecimentoListaProps } from './EnriquecimentoLista';
import type { EnriquecimentoDetalheProps } from './EnriquecimentoDetalhe';
import type { EnriquecimentoActionsProps } from './EnriquecimentoActions';
import { MesaCamposTabela, SeloRegraDaLinha } from './MesaCamposTabela';
import { AreaDecisao } from './AreaDecisao';
import type { BaldePainel } from '@/v2/lib/mesa/painelContas';
import type { PreviaAoFornecedor } from '@/v2/lib/mesa/aoFornecedor';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { EnriqRowVM } from './types';
import { dataHoraCurta } from './fmt';

/**
 * A IMPORTAÇÃO ANTIGA — PR-CONC-ENRIQ-ACABAMENTOS-01 (D1). A aberta não é a mais recente do mês (`sessaoMaisNovaQueAberta`,
 * a mesma peneira do seletor): o painel diz por extenso e oferece o link; o Extrato da planilha e a Mesa levam só o selo
 * "importação antiga", com a frase no `title`. Aviso, nunca trava.
 */
export interface ImportacaoMaisRecente { imp: string; criadaEm: string }

export function textoImportacaoAntiga(r: ImportacaoMaisRecente): string {
  const carimbo = dataHoraCurta(r.criadaEm);
  return `importação antiga · a mais recente é ${r.imp}${carimbo ? ` · ${carimbo}` : ''}`;
}

/** O selo do cabeçalho navy (Extrato da planilha e Mesa): âmbar, 9,5px, não encolhe; a frase inteira no `title`. */
export function SeloImportacaoAntiga({ maisRecente }: { maisRecente: ImportacaoMaisRecente }) {
  return (
    <span data-testid="selo-importacao-antiga" title={`${textoImportacaoAntiga(maisRecente)} — troque no seletor de importação do painel`}
      className="inline-flex h-[14px] shrink-0 items-center whitespace-nowrap rounded-[3px] border border-amber-300 bg-amber-100 px-[4px] text-[9.5px] leading-none text-amber-800">
      importação antiga
    </span>
  );
}

/**
 * O FILTRO ÚNICO DA LISTA — PR-CONC-ENRIQUECER-V2-01 (Mesa compacta): Revisar N / Feitas N / Todas.
 *
 * ⚠ "REVISAR" É O MESMO NÚMERO DO BOTÃO "Revisar N" DO PAINEL: prontas + você decide da conta, pelo balde de
 *   `painelContas` (`baldePorId`, montado na aba). "Feitas" = gravadas. Nada é recontado aqui.
 */
export type FiltroMesa = 'revisar' | 'feitas' | 'todas';

export function passaNoFiltroMesa(balde: BaldePainel | undefined, f: FiltroMesa): boolean {
  if (f === 'revisar') return balde === 'pronta' || balde === 'decide';
  if (f === 'feitas') return balde === 'gravada';
  return true;
}

/** A cor da bolinha da lista — a mesma da barra de andamento do painel. */
const COR_DO_BALDE: Record<BaldePainel, string> = {
  gravada: 'bg-emerald-500', pronta: 'bg-amber-400', decide: 'bg-red-500', semBanco: 'bg-slate-400', aguarda: 'bg-violet-400',
  outras: 'bg-slate-300',
};
const NOME_DO_BALDE: Record<BaldePainel, string> = {
  gravada: 'Gravada', pronta: 'Pronta para gravar', decide: 'Você decide', semBanco: 'Sem par no banco',
  aguarda: 'Aguarda agrupamento', outras: '—',
};

/* ⚠ COR E SINAL SAEM DO MESMO LUGAR — 129d item 4. `null` (sem lançamento) não pinta nem prefixa. */
const corDoSinal = (s: 'entrada' | 'saida' | null) =>
  s === 'saida' ? 'text-red-600 dark:text-red-400'
  : s === 'entrada' ? 'text-emerald-600 dark:text-emerald-400'
  : '';
const sinalPrefixo = (s: 'entrada' | 'saida' | null) => (s === 'saida' ? '−' : s === 'entrada' ? '+' : '');

/**
 * A mensagem única do rodapé da Mesa — PR-CONC-MESA-ORDEM-03. Prioridade: 1) o banco recusou a gravação (vermelho) ·
 * 2) o banco recusou a edição de um campo (vermelho) · 3) o Recasar trocou o par: "par mudou no Recasar · confira" (âmbar,
 * PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU D8 — não bloqueia, só pede conferência) · 4) "falta: …" (vermelho) · 5) a linha GRAVADA:
 * "alterada · falta gravar" (âmbar) ou "já gravada" (neutro), com o motivo do Reverter apagado colado · 6) a planilha diverge
 * do extrato (âmbar). Exportada para o teste afirmar a ordem.
 * ⚠ OS ERROS DE EDITAR E DE SALVAR MORAM AQUI, NÃO EM TOAST (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D9, UX-TOAST-01).
 */
export function mensagemDoRodape(a: {
  erroBanco?: string | null; erroEdicao?: string | null; parMudou?: boolean; falta?: string | null;
  gravada?: { alterada: boolean } | null; motivoReverter?: string | null;
  divergenciasDoExtrato?: readonly string[] | null;
}): { tipo: 'erro' | 'par_mudou' | 'falta' | 'alterada' | 'gravada' | 'diverge' | null; texto: string } {
  if (a.erroBanco) return { tipo: 'erro', texto: `Não gravou — o banco recusou: ${a.erroBanco}` };
  if (a.erroEdicao) return { tipo: 'erro', texto: `Não alterou — ${a.erroEdicao}` };
  if (a.parMudou) return { tipo: 'par_mudou', texto: 'par mudou no Recasar · confira' };
  if (a.falta) return { tipo: 'falta', texto: `falta: ${a.falta.replace(/^Falta preencher: /, '').replace(/\.$/, '')}` };
  if (a.gravada) {
    const base = a.gravada.alterada ? 'alterada · falta gravar' : 'já gravada';
    return { tipo: a.gravada.alterada ? 'alterada' : 'gravada', texto: a.motivoReverter ? `${base} · ${a.motivoReverter}` : base };
  }
  if (a.divergenciasDoExtrato && a.divergenciasDoExtrato.length > 0) {
    return { tipo: 'diverge',
      texto: `Planilha diverge do extrato em: ${a.divergenciasDoExtrato.join(' · ')} — o extrato manda, e estes campos não serão gravados.` };
  }
  return { tipo: null, texto: '' };
}

/**
 * O que a Mesa recebe a mais que a aba antiga — PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL. Os prop-bags continuam os da aba
 * (`EnriquecimentoActionsProps` / `EnriquecimentoDetalheProps`); estes campos só existem para a Mesa.
 */
export interface AcoesDaMesa extends EnriquecimentoActionsProps {
  /** A linha selecionada é GRAVADA: `alterada` = editada depois de gravar, com diferença (D3). `null` = não gravada. */
  gravada?: { alterada: boolean } | null;
  /** Por que o Reverter está apagado numa linha gravada (D4) — escrito no rodapé. */
  motivoReverter?: string | null;
  /** O banco recusou a edição de um campo desta linha (D9) — escrito no rodapé, em vermelho. */
  erroEdicao?: string | null;
  /** O Recasar trocou o par desta linha depois da última edição/gravação (PR-CONC-ENRIQ-PROPOSTA-PAR-MUDOU D8) — âmbar. */
  parMudou?: boolean;
  /**
   * DESFAZER O DESMEMBRAMENTO — PR-CONC-ENRIQ-SPLIT-REVERTER (D8). Enquanto existe, o fluxo ocupa o slot da MENSAGEM do
   * rodapé (nada novo aparece, nenhuma altura muda): `confirmar` (a simulação do banco em âmbar + Confirmar/cancelar),
   * `motivo` (campo curto obrigatório + Confirmar/cancelar) e `erro` (a recusa do banco em vermelho). Sem toast.
   */
  desfazerSplit?: { etapa: 'confirmar' | 'motivo' | 'erro'; texto: string; titulo?: string; editados?: number } | null;
  onDesfazerConfirmar?: () => void;
  onDesfazerMotivo?: (motivo: string) => void;
  onDesfazerCancelar?: () => void;
}

/**
 * A barra do desfazer do desmembramento, no slot da mensagem do rodapé — PR-CONC-ENRIQ-SPLIT-REVERTER (decisão 2 do Gabriel:
 * o texto curto cabe; as frases completas vão no `title`). Medido a 1135: o slot tem 472px; "desfaz: 5 linhas voltam ·
 * R$ 2.667.572,77 vira um só" pede 245 e os dois botões ~120.
 */
function BarraDesfazerSplit({ estado, onConfirmar, onMotivo, onCancelar }: {
  estado: NonNullable<AcoesDaMesa['desfazerSplit']>;
  onConfirmar?: () => void; onMotivo?: (m: string) => void; onCancelar?: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const botao = 'h-[22px] shrink-0 whitespace-nowrap px-2 text-[10px]';
  return (
    <span data-testid="desfazer-split" data-etapa={estado.etapa} title={estado.titulo ?? estado.texto}
      className={`flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10px] ${
        estado.etapa === 'erro' ? 'font-medium text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
      {estado.etapa === 'motivo' ? (
        <>
          <span className="shrink-0">motivo:</span>
          <Input data-testid="desfazer-motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && motivo.trim()) { e.preventDefault(); onMotivo?.(motivo.trim()); } }}
            className="h-[22px] w-[200px] shrink-0 px-1.5 py-0 text-[10px] text-foreground" />
          <Button size="sm" className={botao} data-testid="desfazer-confirmar" disabled={!motivo.trim()}
            onClick={() => onMotivo?.(motivo.trim())}>Confirmar</Button>
        </>
      ) : (
        <>
          {/* o texto curto, cortado NA BORDA se faltar espaço (nunca "…"); o inteiro mora no `title` */}
          <span className="min-w-0 overflow-hidden">{estado.texto}</span>
          {estado.etapa === 'confirmar' && !!estado.editados && (
            <span data-testid="desfazer-editados" className="shrink-0 font-medium text-amber-700 dark:text-amber-400">
              · {estado.editados} editados
            </span>
          )}
          {estado.etapa === 'confirmar' && (
            <Button size="sm" className={botao} data-testid="desfazer-confirmar" onClick={onConfirmar}>Confirmar</Button>
          )}
        </>
      )}
      <Button size="sm" variant="ghost" className={botao} data-testid="desfazer-cancelar" onClick={onCancelar}>
        {estado.etapa === 'erro' ? 'fechar' : 'cancelar'}
      </Button>
    </span>
  );
}
export interface DetalheDaMesa extends EnriquecimentoDetalheProps {
  /**
   * Sobe quando uma edição falha (D9): a grade remonta e cada campo volta ao valor que o banco tem — os editores de
   * texto guardam o rascunho em estado local, e um valor recusado não pode ficar parecendo aceito.
   */
  versaoRestauro?: number;
  /** PR-CONC-ENRIQ-MESA-CULTURA-FASE-B — culturas plantadas na safra da linha e a sugestão de cultura recusada (D5). */
  culturasDaSafra?: readonly string[];
  culturaRecusada?: boolean;
  onRecusarCultura?: () => void;
}

/**
 * AS MEDIDAS DA LISTA COMPACTA — decisão do Gabriel no briefing do PR-CONC-ENRIQUECER-V2-01: 168px de largura, linhas
 * de 16px, texto de 8,5px (exceção declarada ao piso de 9,5px, registrada no CLAUDE.md — a lista é NAVEGAÇÃO: o
 * painel ao lado repete cada linha inteira).
 */
export const LARGURA_LISTA_MESA = '168px';
export const ALTURA_ITEM_LISTA = '16px';

/** Foco num campo (ou num combobox aberto) é do campo: o Enter e as setas não são da Mesa ali. */
function focoEmCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  const tag = alvo.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || alvo.isContentEditable) return true;
  /* Botão focado responde ao próprio Enter — exceto o item da lista, que é só navegação (clicou, e o Enter aprova). */
  if (tag === 'BUTTON' && alvo.getAttribute('data-testid') !== 'item-mesa') return true;
  if (alvo.closest('[role="listbox"],[role="combobox"],[role="menu"],[role="dialog"] [cmdk-root],[cmdk-root]')) return true;
  return alvo.getAttribute('aria-expanded') === 'true';
}

export interface EnriquecimentoMesaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo da sessão ativa (mesmo label do seletor da toolbar). '—' quando não há. */
  sessaoLabel: string | null;
  lista: EnriquecimentoListaProps;
  detalhe: DetalheDaMesa;
  actions: AcoesDaMesa;
  /**
   * 133d item 3 — as faixas de decisão da linha (sobrescrever, desfazer, agrupar, candidatos).
   * ⚠ NÓ, E NÃO MAIS PROPS: elas dependem de oito handlers e cinco estados que já vivem no container.
   */
  faixas?: React.ReactNode;
  /**
   * 133e adendo item 3 — a ORDEM VISÍVEL da Mesa, para o pai navegar por ela. Quem sabe o que está visível é este
   * componente; quem sabe salvar é o pai.
   */
  onOrdemVisivel?: (ids: string[]) => void;
  /** 133h item 12 — os lançamentos com vínculo ativo ao extrato (a tabela de campos decide o que travar). */
  conciliadosIds?: ReadonlySet<string>;
  /**
   * A CONTA em que a Mesa abre — PR-CONC-ENRIQUECER-V2-01: o painel abre a Mesa por conta ("Revisar N") e o Extrato da
   * planilha abre na linha clicada. `null` = todas.
   */
  contaId?: string | null;
  contaNome?: string | null;
  /** O balde de cada linha (`baldeDaLinha`), montado na aba — a mesma partição do painel. */
  baldePorId: ReadonlyMap<string, BaldePainel>;
  /** O recorte em que a lista abre; a aba escolhe "todas" quando abre numa linha que não pede revisão. */
  filtroInicial?: FiltroMesa;
  /**
   * "Ao fornecedor" no "⋯" do cabeçalho — PR-CONC-ENRIQ-AGRUP-2a. A PRÉVIA vem pronta da aba (`previaAoFornecedor`):
   * o menu a mostra ANTES do gesto, e o gesto grava só a proposta.
   */
  aoFornecedor?: { previa: PreviaAoFornecedor | null; aplicando: boolean; onAplicar: () => void };
  /** A importação mais recente do mês, quando a aberta NÃO é ela (D1) — o selo ao lado do rótulo da sessão. */
  importacaoMaisRecente?: ImportacaoMaisRecente | null;
}

export function EnriquecimentoMesaModal({
  open, onOpenChange, sessaoLabel, lista, detalhe, actions, faixas, onOrdemVisivel, conciliadosIds,
  contaId = null, contaNome, baldePorId, filtroInicial = 'revisar', aoFornecedor, importacaoMaisRecente = null,
}: EnriquecimentoMesaModalProps) {
  const [filtro, setFiltro] = useState<FiltroMesa>(filtroInicial);
  /* ⚠ O RECORTE RENASCE A CADA ABERTURA: quem abre por "Revisar" quer as pendências; quem abre numa linha feita
     pelo Extrato da planilha quer vê-la. */
  useEffect(() => { if (open) setFiltro(filtroInicial); }, [open, filtroInicial]);

  const daConta = useMemo(
    () => lista.rows.filter((r) => contaId === null || r.contaId === contaId),
    [lista.rows, contaId]);
  const contagens = useMemo(() => ({
    revisar: daConta.filter((r) => passaNoFiltroMesa(baldePorId.get(r.id), 'revisar')).length,
    feitas: daConta.filter((r) => passaNoFiltroMesa(baldePorId.get(r.id), 'feitas')).length,
    todas: daConta.length,
  }), [daConta, baldePorId]);

  const visiveis = useMemo(
    () => daConta.filter((r) => passaNoFiltroMesa(baldePorId.get(r.id), filtro)),
    [daConta, baldePorId, filtro]);

  /** Faixa por DIA, na ordem em que as linhas chegaram — 133e item A. */
  const grupos = useMemo(() => {
    const ordem: string[] = [];
    const mapa = new Map<string, EnriqRowVM[]>();
    for (const r of visiveis) {
      const k = (r.dataEhCompetencia ? `${r.data} comp.` : r.data) || '—';
      const atual = mapa.get(k);
      if (atual) atual.push(r); else { mapa.set(k, [r]); ordem.push(k); }
    }
    return ordem.map((nome) => ({ nome, linhas: mapa.get(nome) ?? [] }));
  }, [visiveis]);

  const selecionada = lista.rows.find((r) => r.id === lista.selecionadoId) ?? null;

  /**
   * "É TRANSFERÊNCIA PARA/DE OUTRA CONTA…" NO "⋯" — PR-CONC-MESA-TRANSFERENCIA-VOLTA. O gesto existia na aba
   * (`actions.slotTransferencia`, 133i-c, 9fb376ab) mas NUNCA foi desenhado: o componente que o desenhava
   * (`EnriquecimentoActions`) saiu da Mesa dois dias antes (fe26d14c). O Dialog renderiza o MESMO nó — nenhuma cópia,
   * nenhum handler novo. Fecha ao trocar de linha e quando o slot some (o sucesso transforma a linha em transferência e
   * a condição da aba deixa de oferecer o gesto).
   */
  const [transfAberto, setTransfAberto] = useState(false);
  const temTransferencia = actions.slotTransferencia !== null && actions.slotTransferencia !== undefined;
  useEffect(() => { setTransfAberto(false); }, [lista.selecionadoId]);
  useEffect(() => { if (!temTransferencia) setTransfAberto(false); }, [temTransferencia]);

  /* A ordem visível sobe a cada mudança de recorte; fechado, o pai volta à lista dele. */
  useEffect(() => {
    if (!open) return;
    onOrdemVisivel?.(visiveis.map((r) => r.id));
  }, [open, visiveis, onOrdemVisivel]);

  /* 133e adendo item 4 — a linha selecionada acompanha a navegação (`nearest`: rola o mínimo). */
  const selRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (open) selRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, lista.selecionadoId]);

  /* O gesto principal: grava e avança. ⚠ NA LINHA GRAVADA (PR-CONC-ENRIQ-LINHA-GRAVADA-EDITAVEL D3) ele é "Gravar
     alteração" e só acende com alteração pendente; sem ela, apagado ("já gravada") — o "só seguir" saiu: seguir é o ▶ e
     o Pular. Quem decide se grava é a aba (`salvarDisabled`). */
  const aprovarDesabilitado = !!actions.salvarDisabled || !!actions.isBusy;
  const aprovar = () => { actions.onSalvarProximo(); };
  const gravada = actions.gravada ?? null;

  /**
   * ENTER = APROVAR E PRÓXIMO — PR-CONC-ENRIQUECER-V2-01 ("Enter = o mesmo do Salvar e próximo"); Ctrl/Cmd+Enter segue
   * valendo (133b-a). ⚠ RESPEITA O MESMO `disabled` DO BOTÃO, e o Enter num campo é do campo: o combobox confirma
   * com Enter, o texto também. Só com o modal aberto.
   */
  useEffect(() => {
    if (!open) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
      const comModificador = e.metaKey || e.ctrlKey;
      if (!comModificador && focoEmCampo(e.target)) return;
      if (aprovarDesabilitado) return;
      e.preventDefault();
      aprovar();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  });

  /* ArrowDown / ArrowUp trocam a linha — 133h-b item 7; campo focado manda. */
  useEffect(() => {
    if (!open) return;
    const aoNavegar = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (focoEmCampo(e.target) && !(e.target instanceof HTMLButtonElement)) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') { if (actions.canProximo) actions.onProximo(); }
      else if (actions.canAnterior) actions.onAnterior();
    };
    document.addEventListener('keydown', aoNavegar);
    return () => document.removeEventListener('keydown', aoNavegar);
  }, [open, actions]);

  const pctFeitas = contagens.todas > 0 ? (100 * contagens.feitas) / contagens.todas : 0;
  /* "falta:" é pendência de campo; na gravada SEM alteração o motivo do botão apagado é "já gravada", que tem lugar próprio. */
  const falta = actions.salvarMotivo && !(gravada && !gravada.alterada) ? actions.salvarMotivo : null;
  /* A MENSAGEM DO RODAPÉ — uma só, pela prioridade (`mensagemDoRodape`). */
  const mensagem = mensagemDoRodape({
    erroBanco: actions.erroBanco, erroEdicao: actions.erroEdicao, parMudou: actions.parMudou, falta, gravada,
    motivoReverter: actions.motivoReverter, divergenciasDoExtrato: actions.divergenciasDoExtrato,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="h-9 shrink-0 flex-row items-center gap-2.5 space-y-0 bg-primary px-4">
          <DialogTitle className="whitespace-nowrap text-[12px] font-medium text-primary-foreground">
            Mesa · {contaNome ?? 'todas as contas'}
          </DialogTitle>
          <span className="min-w-0 truncate text-[10px] text-primary-foreground/85" title={sessaoLabel ?? undefined}>
            {sessaoLabel ?? '—'}
          </span>
          {importacaoMaisRecente && <SeloImportacaoAntiga maisRecente={importacaoMaisRecente} />}
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-2 p-2" style={{ gridTemplateColumns: `${LARGURA_LISTA_MESA} 1fr` }}>
          {/* ═══ ESQUERDA: a lista da conta, só navegação ═════════════════════ */}
          <div data-testid="lista-mesa" className="flex min-h-0 min-w-0 flex-col rounded-md border bg-card">
            <div className="flex shrink-0 flex-col gap-1 border-b px-1.5 py-1">
              <Segmentado<FiltroMesa> valor={filtro} onEscolher={setFiltro} altura={20} fonte={9.5} opcoes={[
                { valor: 'revisar', rotulo: `Revisar ${contagens.revisar}` },
                { valor: 'feitas', rotulo: `Feitas ${contagens.feitas}` },
                { valor: 'todas', rotulo: 'Todas' },
              ]} />
              <div data-testid="progresso-mesa" title={`${contagens.feitas} de ${contagens.todas} feitas`}
                className="h-[4px] w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-emerald-500" style={{ width: `${pctFeitas}%` }} />
              </div>
            </div>
            {/* ⚠ O ÚNICO SCROLLPORT DESTE LADO (A21). */}
            <div className="min-h-0 flex-1 overflow-y-auto text-[8.5px]">
              {visiveis.length === 0 ? (
                <p className="py-6 text-center text-[9.5px] text-muted-foreground">Nada neste recorte.</p>
              ) : grupos.map(({ nome, linhas }) => (
                <div key={nome}>
                  {/* ⚠ FUNDO OPACO E `z` ACIMA — A21. */}
                  <div style={{ height: ALTURA_ITEM_LISTA }}
                    className="sticky top-0 z-[2] flex items-center gap-1 border-b bg-muted px-1.5 font-medium">
                    <span className="min-w-0 truncate">{nome}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{linhas.length}</span>
                  </div>
                  {linhas.map((r) => {
                    const sel = r.id === lista.selecionadoId;
                    const balde = baldePorId.get(r.id) ?? 'outras';
                    /* ⚠ GRAVADA COM ALTERAÇÃO PENDENTE (D6): continua em "Feitas" (o balde é o mesmo), mas a bolinha fica
                       âmbar — o token da "pronta", a cor de "falta gravar" que a lista já tem. */
                    const alterada = !!r.gravada?.alterada;
                    return (
                      <button type="button" key={r.id} ref={sel ? selRef : undefined} data-testid="item-mesa"
                        data-balde={balde} data-alterada={alterada ? 'sim' : undefined}
                        onClick={() => lista.onSelecionar(r.id)}
                        title={`${r.fornecedor} · ${r.data} · ${alterada ? 'Gravada · alterada, falta gravar' : NOME_DO_BALDE[balde]}`}
                        style={{ height: ALTURA_ITEM_LISTA }}
                        className={`flex w-full items-center gap-1 border-b border-border/50 px-1.5 text-left ${
                          sel ? 'border-l-[3px] border-l-primary bg-primary/[0.08] pl-[3px]' : ''}`}>
                        <span data-testid="bolinha-mesa"
                          className={`h-[6px] w-[6px] shrink-0 rounded-full ${alterada ? COR_DO_BALDE.pronta : COR_DO_BALDE[balde]}`} />
                        {/* cortado na borda, sem "…" (regra da reticência); o nome inteiro está no `title` do item */}
                        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">{r.fornecedor}</span>
                        <span className={`shrink-0 whitespace-nowrap font-medium tabular-nums ${corDoSinal(r.entradaOuSaida)}`}>
                          {sinalPrefixo(r.entradaOuSaida)}{r.valor}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ DIREITA: a linha selecionada ════════════════════════════════════ */}
          <div className="flex min-h-0 min-w-0 flex-col rounded-md border bg-card">
            {!selecionada ? (
              <p className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[11px] text-muted-foreground">
                Selecione uma linha à esquerda para revisar.
              </p>
            ) : (
              <>
                {/* ═══ CABEÇALHO DO PAINEL — 36px: valor (cor do sinal), quem/quando/o quê, selo, n / N ═══ */}
                <div data-testid="cabecalho-painel" className="flex h-9 shrink-0 items-center gap-2.5 border-b bg-muted px-3">
                  <span className={`shrink-0 whitespace-nowrap text-[16px] font-medium tabular-nums ${corDoSinal(selecionada.entradaOuSaida)}`}>
                    {sinalPrefixo(selecionada.entradaOuSaida)}{selecionada.valor}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
                    title={[selecionada.fornecedor, selecionada.data, selecionada.edicao.descricaoAtual ?? '—'].join(' · ')}>
                    <span className="font-medium text-foreground">{selecionada.fornecedor}</span>
                    {' · '}{selecionada.data}{' · '}{selecionada.edicao.descricaoAtual ?? '—'}
                  </span>
                  <SeloRegraDaLinha ehCru={selecionada.ehCru} />
                  {(aoFornecedor || temTransferencia) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="ghost" className="h-[22px] w-[22px] shrink-0 p-0"
                          aria-label="Mais ações da linha" data-testid="menu-linha-mesa">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[340px]">
                        {temTransferencia && (
                          <DropdownMenuItem data-testid="abrir-transferencia" onSelect={() => setTransfAberto(true)}>
                            {selecionada.entradaOuSaida === 'entrada' ? 'É transferência de outra conta…' : 'É transferência para outra conta…'}
                          </DropdownMenuItem>
                        )}
                        {aoFornecedor && (
                          <>
                            {/* ⚠ A PRÉVIA ANTES DO GESTO: quantas linhas e quais campos mudam — e quantas ficam com o sistema. */}
                            <DropdownMenuLabel data-testid="previa-ao-fornecedor" className="whitespace-normal text-[10px] font-normal text-zinc-300">
                              Ao fornecedor: {aoFornecedor.previa?.resumo ?? '—'}
                            </DropdownMenuLabel>
                            <DropdownMenuItem data-testid="aplicar-ao-fornecedor"
                              disabled={!aoFornecedor.previa || aoFornecedor.previa.alvos.length === 0 || aoFornecedor.aplicando}
                              onSelect={() => aoFornecedor.onAplicar()}>
                              {aoFornecedor.aplicando ? 'Levando…'
                                : `Levar à proposta de ${aoFornecedor.previa?.alvos.length ?? 0} linha${aoFornecedor.previa?.alvos.length === 1 ? '' : 's'} (não grava o lançamento)`}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <span data-testid="posicao" className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                    {actions.posicao}
                  </span>
                </div>

                {/* O Dialog da transferência: por cima da Mesa, fora do fluxo do layout (nada cresce, nada desloca). */}
                <Dialog open={transfAberto && temTransferencia} onOpenChange={setTransfAberto}>
                  <DialogContent data-testid="dialog-transferencia"
                    className="flex w-[520px] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
                    <DialogHeader className="h-9 shrink-0 flex-row items-center space-y-0 bg-primary px-4">
                      <DialogTitle className="truncate pr-6 text-[12px] font-medium text-primary-foreground">
                        Transferência · {selecionada.fornecedor} · {sinalPrefixo(selecionada.entradaOuSaida)}{selecionada.valor}
                      </DialogTitle>
                    </DialogHeader>
                    <div data-testid="corpo-transferencia" className="flex min-h-[56px] flex-col justify-center gap-1 px-4 py-3">
                      {actions.slotTransferencia}
                    </div>
                  </DialogContent>
                </Dialog>

                <MesaCamposTabela
                  /* a remontagem que devolve cada campo ao valor do banco quando uma edição falha (D9) */
                  key={`${selecionada.id}:${detalhe.versaoRestauro ?? 0}`}
                  row={selecionada}
                  classificacoes={detalhe.classificacoes}
                  fornecedores={detalhe.fornecedores}
                  fazendas={detalhe.fazendas}
                  clienteId={detalhe.clienteId}
                  safras={detalhe.safras}
                  contas={detalhe.contas}
                  onEditar={detalhe.onEditar}
                  onCriarFornecedor={detalhe.onCriarFornecedor}
                  conciliado={selecionada.lancId ? conciliadosIds?.has(selecionada.lancId) : false}
                  atividade={detalhe.atividade}
                  onAtividade={detalhe.onAtividade}
                  culturasDaSafra={detalhe.culturasDaSafra}
                  culturaRecusada={detalhe.culturaRecusada}
                  onRecusarCultura={detalhe.onRecusarCultura}
                />
              </>
            )}

            {/* ═══ RODAPÉ — 32px: ◀ ▶ Reverter | decisão | mensagem | Pular | Aprovar e próximo ═══
                ⚠ AS DUAS LINHAS VAZIAS SAÍRAM (PR-CONC-MESA-ORDEM-03): a barra de decisão (20px) virou o slot de largura fixa
                aqui dentro, e o slot de 18px acima do rodapé virou a MENSAGEM, na mesma faixa do "falta:". A tabela ganhou
                os 38px; o rodapé não muda de altura em estado nenhum. */}
            <div data-testid="rodape-mesa" className="flex h-8 shrink-0 items-center gap-1.5 border-t px-2">
              <Button size="sm" variant="ghost" className="h-[22px] w-[26px] shrink-0 p-0 text-[11px]" aria-label="Anterior"
                onClick={actions.onAnterior} disabled={!actions.canAnterior}>◀</Button>
              <Button size="sm" variant="ghost" className="h-[22px] w-[26px] shrink-0 p-0 text-[11px]" aria-label="Próximo"
                onClick={actions.onProximo} disabled={!actions.canProximo}>▶</Button>
              <Button size="sm" variant="outline" className="h-[22px] shrink-0 whitespace-nowrap px-2 text-[10px]"
                data-testid="reverter" title={actions.motivoReverter ?? undefined}
                onClick={actions.onReverter} disabled={actions.reverterDisabled || actions.isBusy}>↺ Reverter</Button>
              {/* ⚠ O SLOT DA DECISÃO: largura FIXA, sempre presente (vazio sem decisão). Trocar de linha fecha o Dialog. */}
              <AreaDecisao chave={selecionada?.id ?? null}
                titulo={selecionada ? `${selecionada.fornecedor} · ${sinalPrefixo(selecionada.entradaOuSaida)}${selecionada.valor}` : undefined}>
                {selecionada ? faixas : null}
              </AreaDecisao>
              {/* ⚠ A MENSAGEM, UMA LINHA, nesta prioridade: o banco recusou > falta (o `salvarMotivo`, que sai da MESMA lista
                  do checklist — 133b-a correção 1) > a planilha diverge do extrato. Vazia, o lugar fica (flex-1). */}
              {actions.desfazerSplit ? (
                /* PR-CONC-ENRIQ-SPLIT-REVERTER: o fluxo do desfazer ocupa o MESMO slot (flex-1) — nada muda de altura */
                <BarraDesfazerSplit key={`${selecionada?.id ?? ''}:${actions.desfazerSplit.etapa}`} estado={actions.desfazerSplit}
                  onConfirmar={actions.onDesfazerConfirmar} onMotivo={actions.onDesfazerMotivo} onCancelar={actions.onDesfazerCancelar} />
              ) : mensagem.tipo === 'falta' ? (
                <span data-testid="falta" data-mensagem="falta" className="min-w-0 flex-1 truncate text-[10px] text-red-600 dark:text-red-400"
                  title={mensagem.texto}>{mensagem.texto}</span>
              ) : (
                <span data-testid="mensagem-rodape" data-mensagem={mensagem.tipo ?? 'nenhuma'} title={mensagem.texto || undefined}
                  className={`min-w-0 flex-1 truncate text-[10px] ${
                    mensagem.tipo === 'erro' ? 'font-medium text-red-700 dark:text-red-400'
                      : mensagem.tipo === 'diverge' || mensagem.tipo === 'alterada' || mensagem.tipo === 'par_mudou'
                        ? 'text-amber-700 dark:text-amber-400'
                      : mensagem.tipo === 'gravada' ? 'text-muted-foreground' : ''}`}>
                  {mensagem.texto}
                </span>
              )}
              <Button size="sm" variant="outline" className="h-[22px] shrink-0 whitespace-nowrap px-2 text-[10px]"
                data-testid="pular" onClick={actions.onProximo} disabled={!actions.canProximo}
                title="Vai para a próxima sem gravar esta.">Pular</Button>
              <Button size="sm" data-testid="aprovar"
                className="h-[22px] shrink-0 whitespace-nowrap bg-cta px-2.5 text-[10px] font-semibold text-cta-foreground hover:bg-cta-hover"
                onClick={aprovar} disabled={aprovarDesabilitado}
                title={gravada
                  ? `${actions.salvarMotivo ?? 'Grava no lançamento só o que você alterou; a linha fica selecionada.'} (Enter)`
                  : `${actions.salvarMotivo ?? 'Grava esta linha no lançamento e vai para a próxima.'} (Enter)`}>
                {gravada ? 'Gravar alteração' : actions.canProximo ? 'Aprovar e próximo' : 'Aprovar — fim da lista'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
