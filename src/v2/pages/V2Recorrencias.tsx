import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus, Repeat, Pencil, Play, Ban, Search, MoreHorizontal,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useRecorrencias, useOcorrenciasDoMes, cancelarRecorrencia, type Recorrencia, type SituacaoRecorrencia } from '@/hooks/useRecorrencias';
import {
  linhasDoMes, resumoDoMes, filtrarLinhas, totalDaLista, proporcoesDoMes, ROTULO_TIPO, ROTULO_SITUACAO_DO_MES,
  type LinhaDoMes, type FiltroDoTipo, type FiltroDaSituacao, type Fatia, type SituacaoDoMes,
} from '@/lib/financeiro/recorrenciasDoMes';
import { SeletorPeriodo } from '@/v2/components/SeletorPeriodo';
import { Segmentado } from '@/components/ui/segmentado';
import { anoMes, mesCorrente, MESES_CURTOS, type Periodo } from '@/v2/lib/periodo';
import { COR_SINAL } from '@/lib/oc/contaCorrente';
import { RecorrenciaDialog } from '@/components/recorrencias/RecorrenciaDialog';
import { GerarLancamentosDialog } from '@/components/recorrencias/GerarLancamentosDialog';
import { hojeLocal } from '@/lib/datas/hojeLocal';

/**
 * V2Recorrencias — as regras que se repetem todo mês.
 * FIN-RECORRENCIA-01, Tempo 1; layout refeito no 01d.
 *
 * ⚠ A ESTRUTURA É A DO `financas` (RecorrenciasPage + RecorrenciasTabela), com
 * os tokens traduzidos para os desta casa — `surface` virou `bg-card`, o
 * primitivo de tabela é o nosso. Nenhuma classe foi copiada por parecer certa:
 * onde a casa já tem uma régua, ela venceu a do original.
 *
 * ⚠ A DENSIDADE NÃO É DEFINIDA AQUI. Ela é o default de `components/ui/table`
 * (cabeçalho 10px, célula 11px, `py-0.5`) — um pouco maior que a do original
 * (9px/10px). Não a apertei: régua própria escrita dentro de uma tela é
 * exatamente como a consistência se perde, e o primitivo serve dezenas de
 * telas.
 *
 * ⚠ O ESTADO DA TABELA É DERIVADO, e nenhuma das colunas do fim existe no
 * banco: próxima competência sai da marca d'água, situação sai de `ativo` mais a
 * comparação com a última competência, e "gerados" é contagem por
 * `recorrencia_id`.
 *
 * ⚠ NÃO HÁ "EXCLUIR". Cancelar é `ativo = false` e NÃO apaga o que já foi
 * gerado — os lançamentos criados são lançamentos normais, editáveis e
 * conciliáveis como quaisquer outros.
 *
 * ⚠ ORDENAÇÃO E BUSCA MORAM AQUI, e não numa lib compartilhada. O original tem
 * `shared/lib/ordenacao` porque três telas de lá a usam; aqui há uma só, e criar
 * a peça compartilhada agora seria inventar arquitetura para um caso.
 */

/** O que uma coluna devolve para comparar. `null` sempre vai para o fim. */
type Chave = { texto: string } | { numero: number } | null;
type Coluna = 'descricao' | 'favorecido' | 'conta' | 'tipo' | 'dia' | 'forma' | 'previsto' | 'valor' | 'situacao';
type Direcao = 'asc' | 'desc';
type Modo = 'mes' | 'regras';

/* Cabecalho azul — o mesmo override local da lista de contratos (PR-PARC-05d item 3). */
const TH = 'h-[19px] px-1 py-0 text-[9.5px] font-medium text-primary-foreground normal-case tracking-normal whitespace-nowrap';
/* ⚠ PADRAO DE TABELA (CLAUDE.md): 10px na linha, 19px de altura, uma linha por registro. Texto corta com o inteiro no
   `title`; numero, dia e valor NUNCA cortam (`whitespace-nowrap`, sem `truncate`). */
const TD = 'h-[19px] px-1 py-0 text-[10px] leading-none';
const TD_TEXTO = cn(TD, 'truncate');
const TD_NUM = cn(TD, 'text-right tabular-nums whitespace-nowrap');
/* O estimado e' ambar — a cor de "ainda nao sei" da casa. Um lugar so'. */
const AMBAR = 'text-amber-600';
const COR_DA_SITUACAO: Record<SituacaoDoMes, string> = { certo: 'text-primary', confirmado: COR_SINAL.pos, estimado: AMBAR };

/** Centavos -> "99.999.999,99" (sem R$: a coluna e o cartao ja' dizem que e' dinheiro). */
export const dinheiro = (centavos: number): string =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O valor com a seta e a cor do sinal: ▼ saida (vermelho), ▲ entrada (verde); o ESTIMADO em ambar. Zero e' "0,00" apagado,
 * sem seta. Um lugar so' para a regra — cartoes, linhas e rodape.
 */
function Valor({ centavos, entrada = false, estimado = false, className }: { centavos: number; entrada?: boolean; estimado?: boolean; className?: string }) {
  if (centavos === 0) return <span className={cn('whitespace-nowrap tabular-nums text-muted-foreground', className)}>0,00</span>;
  return (
    <span className={cn('whitespace-nowrap tabular-nums', estimado ? AMBAR : entrada ? COR_SINAL.pos : COR_SINAL.neg, className)}>
      {entrada ? '▲' : '▼'} {dinheiro(centavos)}
    </span>
  );
}

/** As colunas, em px (`table-layout: fixed`): so' a Descricao e' elastica. MEDIDAS — ver o CLAUDE.md (REC-VALOR-CERTO-01). */
const COLUNAS: ReadonlyArray<{ campo: Coluna; rotulo: string; largura: number | null; direita?: boolean }> = [
  { campo: 'descricao', rotulo: 'Descrição', largura: null },
  { campo: 'favorecido', rotulo: 'Favorecido', largura: 118 },
  { campo: 'conta', rotulo: 'Conta', largura: 100 },
  { campo: 'tipo', rotulo: 'Tipo', largura: 70 },
  { campo: 'dia', rotulo: 'Dia', largura: 36, direita: true },
  { campo: 'forma', rotulo: 'Forma', largura: 56 },
  { campo: 'previsto', rotulo: 'Previsto', largura: 84, direita: true },
  { campo: 'valor', rotulo: 'Valor', largura: 100, direita: true },
  { campo: 'situacao', rotulo: 'Situação', largura: 66 },
];
const LARGURA_ACOES = 22;

export default function V2Recorrencias() {
  const { recorrencias, loading, recarregar, clienteId } = useRecorrencias();
  const { contasBancarias, loadContas } = useFinanceiroV2();

  /* ⚠ ERA ISTO QUE DEIXAVA A COLUNA "Conta" EM BRANCO (PR-REC-01 item 4): `useFinanceiroV2` expoe `loadContas` e NAO o
     chama sozinho. ⚠ NAO E' QUERY NOVA NEM JOIN: e' a chamada que faltava. */
  useEffect(() => {
    if (clienteId) void loadContas();
  }, [clienteId, loadContas]);
  const [editando, setEditando] = useState<Recorrencia | null | undefined>(undefined);
  const [gerando, setGerando] = useState<Recorrencia | null>(null);
  const [cancelando, setCancelando] = useState<Recorrencia | null>(null);
  const [busca, setBusca] = useState('');
  /* Ao abrir: por Dia, crescente. O clique numa coluna comeca do MAIOR para o menor. */
  const [ordem, setOrdem] = useState<{ campo: Coluna; direcao: Direcao }>({ campo: 'dia', direcao: 'asc' });

  /* ── O MES — REC-VALOR-CERTO-01 ───────────────────────────────────────────────────────────────────────────────────
     A regua (ano + doze meses, um mes so') nasce no mes corrente; o mes e' o do VENCIMENTO. As ocorrencias vivas do mes vem
     numa consulta; TUDO o que a tela mostra de numero sai do dono (`recorrenciasDoMes.ts`) — cartoes, barra, lista e rodape. */
  const [periodo, setPeriodo] = useState<Periodo>(() => mesCorrente());
  const mes = anoMes(periodo.de);
  const rotuloMes = `${MESES_CURTOS[periodo.de.mes - 1].toLowerCase()}/${String(periodo.de.ano).slice(2)}`;
  const { ocorrencias, incompleto, recarregar: recarregarMes } = useOcorrenciasDoMes(clienteId, mes);
  const [modo, setModo] = useState<Modo>('mes');
  const [filtroTipo, setFiltroTipo] = useState<FiltroDoTipo>('todas');
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroDaSituacao>('todas');

  const linhas = useMemo(() => linhasDoMes(recorrencias, ocorrencias, mes), [recorrencias, ocorrencias, mes]);
  const resumo = useMemo(() => resumoDoMes(linhas), [linhas]);
  const proporcoes = useMemo(() => proporcoesDoMes(resumo), [resumo]);
  const linhaDe = useMemo(() => new Map(linhas.map(l => [l.regraId, l])), [linhas]);
  const ativas = useMemo(() => recorrencias.filter(r => r.ativo).length, [recorrencias]);

  /* ⚠ O NOME DA CONTA É O MESMO QUE O SELETOR MOSTRA — `nome_exibicao || nome_conta`, a régua de `ContaBancariaSelect`. */
  const nomeConta = (id: string) => {
    const c = contasBancarias.find(x => x.id === id);
    return c ? (c.nome_exibicao || c.nome_conta) : '—';
  };

  /* ── A LISTA ──────────────────────────────────────────────────────────────────────────────────────────────────────
     "No mês": as recorrencias que tem linha no mes, pelo filtro do dono (`filtrarLinhas`). "Todas as regras": toda regra,
     inclusive a que esta' fora da vigencia no mes (a coluna do mes fica "—"); os filtros do mes nao se aplicam a ela.
     ⚠ A BUSCA ALCANÇA TUDO O QUE A LINHA MOSTRA, inclusive o que veio de outro cadastro. */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const naBusca = (r: Recorrencia) => termo === ''
      || [r.descricao, r.favorecidoNome ?? '', nomeConta(r.contaBancariaId), r.subcentro, r.formaPagamento ?? '', rotuloSituacao(r)]
        .join(' ').toLowerCase().includes(termo);
    if (modo === 'regras') return recorrencias.filter(naBusca);
    const doFiltro = new Set(filtrarLinhas(linhas, filtroTipo, filtroSituacao).map(l => l.regraId));
    return recorrencias.filter(r => doFiltro.has(r.id) && naBusca(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorrencias, linhas, modo, filtroTipo, filtroSituacao, busca, contasBancarias]);

  /* O rodape: o total do dono sobre as linhas DO MES que estao na lista (filtro e busca aplicados). */
  const total = useMemo(() => {
    const linhasNaLista: LinhaDoMes[] = [];
    for (const r of visiveis) { const l = linhaDe.get(r.id); if (l) linhasNaLista.push(l); }
    return totalDaLista(linhasNaLista);
  }, [visiveis, linhaDe]);

  const ordenadas = useMemo(() => {
    const chaveDe = (r: Recorrencia): Chave => {
      const l = linhaDe.get(r.id);
      switch (ordem.campo) {
        case 'descricao': return { texto: r.descricao };
        case 'favorecido': return r.favorecidoNome ? { texto: r.favorecidoNome } : null;
        case 'conta': return { texto: nomeConta(r.contaBancariaId) };
        case 'tipo': return { texto: ROTULO_TIPO[r.valorAConfirmar ? 'a_confirmar' : 'certo'] };
        case 'dia': return { numero: r.diaVencimento };
        case 'forma': return r.formaPagamento ? { texto: r.formaPagamento } : null;
        case 'previsto': return { numero: Math.abs(r.valorBase) };
        case 'valor': return l ? { numero: l.valor } : null;
        case 'situacao': return l ? { texto: ROTULO_SITUACAO_DO_MES[l.situacao] } : null;
      }
    };
    const copia = [...visiveis];
    copia.sort((a, b) => {
      const ka = chaveDe(a), kb = chaveDe(b);
      /* ⚠ VAZIO VAI PARA O FIM EM QUALQUER DIREÇÃO: uma coluna sem valor não é "menor", é ausente. */
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      const base = 'texto' in ka && 'texto' in kb
        ? ka.texto.localeCompare(kb.texto, 'pt-BR', { sensitivity: 'base', numeric: true })
        : 'numero' in ka && 'numero' in kb ? ka.numero - kb.numero : 0;
      return ordem.direcao === 'asc' ? base : -base;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, ordem, contasBancarias, linhaDe]);

  /** Clicar na coluna ativa inverte; clicar em outra ordena por ela, do MAIOR para o menor. */
  const alternar = (campo: Coluna) => setOrdem(o =>
    o.campo === campo ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: 'desc' });

  const recarregarTudo = async () => { await Promise.all([recarregar(), recarregarMes()]); };

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    const { ok, erro } = await cancelarRecorrencia(cancelando.id);
    if (!ok) { toast.error(erro ?? 'O banco recusou o cancelamento.'); return; }
    toast.success('Recorrência cancelada. Os lançamentos já gerados continuam onde estão.');
    setCancelando(null);
    await recarregarTudo();
  };

  /* ── OS CARTOES — do dono, e NAO mudam com o filtro (sao do mes). Clicar liga o filtro correspondente; de novo, desliga. */
  const cartoes: ReadonlyArray<{
    chave: string; rotulo: string; fatia: Fatia; estimado?: boolean; borda: string;
    ligado: boolean; ligar: () => void;
  }> = [
    { chave: 'total', rotulo: `Recorrente em ${rotuloMes}`, fatia: resumo.total, borda: 'border-l-primary',
      ligado: false, ligar: () => { setFiltroTipo('todas'); setFiltroSituacao('todas'); } },
    { chave: 'certo', rotulo: 'Valor certo', fatia: resumo.certo, borda: 'border-l-primary',
      ligado: filtroTipo === 'certo', ligar: () => { setFiltroTipo(t => (t === 'certo' ? 'todas' : 'certo')); setFiltroSituacao('todas'); } },
    { chave: 'confirmado', rotulo: 'A confirmar · já informado', fatia: resumo.confirmado, borda: 'border-l-[#15803d]',
      ligado: filtroSituacao === 'confirmado', ligar: () => { setFiltroSituacao(x => (x === 'confirmado' ? 'todas' : 'confirmado')); setFiltroTipo('todas'); } },
    { chave: 'estimado', rotulo: 'A confirmar · ainda estimado', fatia: resumo.estimado, estimado: true, borda: 'border-l-amber-500',
      ligado: filtroSituacao === 'estimado', ligar: () => { setFiltroSituacao(x => (x === 'estimado' ? 'todas' : 'estimado')); setFiltroTipo('todas'); } },
    { chave: 'folha', rotulo: 'Folha de pagamento · dentro do total', fatia: resumo.folha, borda: 'border-l-muted-foreground/40',
      ligado: filtroTipo === 'folha', ligar: () => { setFiltroTipo(t => (t === 'folha' ? 'todas' : 'folha')); setFiltroSituacao('todas'); } },
  ];

  const Cab = ({ campo, rotulo, direita }: { campo: Coluna; rotulo: string; direita?: boolean }) => {
    const ativo = ordem.campo === campo;
    /* ⚠ A SETA É SEMPRE VISÍVEL, apagada quando a coluna não é a ativa. */
    const Seta = !ativo ? ChevronsUpDown : ordem.direcao === 'asc' ? ChevronUp : ChevronDown;
    return (
      <TableHead className={cn('cursor-pointer select-none', TH, direita && 'text-right')}
        onClick={() => alternar(campo)}
        aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <span className={cn('inline-flex items-center gap-0.5', direita && 'flex-row-reverse')}>
          {rotulo}
          <Seta className={cn('h-2.5 w-2.5 shrink-0', !ativo && 'text-primary-foreground/70')} aria-hidden />
        </span>
      </TableHead>
    );
  };

  const filtrosDoMesApagados = modo === 'regras';
  const MOTIVO_FILTRO_APAGADO = 'filtros do mês: valem em "No mês"';

  return (
    /* ⚠ `h-full`, E NAO `flex-1` — a licao do 04c/04b: esta tela mede contra o pai, e o `/v2` so' da' altura porque
       `recorrencias` entrou em `SECOES_APP_SHELL`. */
    <div className="w-full min-w-0 h-full min-h-0 flex flex-col bg-background max-w-5xl mx-auto">
      <div className="shrink-0 px-4 pt-2 pb-1.5 space-y-1.5">
        {/* CABEÇALHO — título, o que a tela é, e a ação à direita. */}
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-none tracking-tight text-foreground">
              Recorrências
            </h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              A regra que gera lançamentos previstos — nunca um lançamento
            </p>
          </div>
          <div className="flex-1" />
          <Button size="sm"
            className="h-7 gap-1 bg-cta px-2.5 text-xs font-semibold text-cta-foreground hover:bg-cta-hover"
            disabled={!clienteId}
            title={clienteId ? undefined : 'Escolha um cliente primeiro'}
            onClick={() => setEditando(null)}>
            <Plus className="size-3.5" /> Nova recorrência
          </Button>
        </div>

        {/* A RÉGUA DO MÊS — a da casa (`SeletorPeriodo`), um mês só, meses neutros (sem `tomPorMes`). */}
        <SeletorPeriodo modo="ano-mes" modoUnico periodo={periodo} onPeriodoChange={setPeriodo} />

        {/* OS CINCO CARTÕES — todos do dono. ⚠ VALOR NUNCA CORTA: `whitespace-nowrap`, sem `truncate`; só o rótulo corta,
            com o inteiro no `title`. */}
        <div className="grid grid-cols-5 gap-1.5" data-testid="rec-cartoes">
          {cartoes.map(c => {
            const rotulo = c.chave === 'total' ? `${c.rotulo} · ${c.fatia.qtd} ${c.fatia.qtd === 1 ? 'conta' : 'contas'}` : `${c.rotulo} · ${c.fatia.qtd}`;
            const titulo = c.chave === 'total' ? `${rotulo} · ${ativas} ${ativas === 1 ? 'regra ativa' : 'regras ativas'}` : rotulo;
            return (
              <button key={c.chave} type="button" data-testid={`rec-cartao-${c.chave}`} aria-pressed={c.ligado}
                onClick={c.ligar} title={titulo}
                className={cn('h-[42px] min-w-0 rounded-md border border-l-[3px] px-2 py-1.5 text-left transition-colors',
                  c.borda, c.ligado ? 'bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted/40')}>
                <div className={cn('truncate text-[10px] leading-none', c.estimado ? AMBAR : 'text-muted-foreground')}>{rotulo}</div>
                <div className="mt-0.5 text-[13px] font-semibold leading-tight">
                  <Valor centavos={c.fatia.valor} estimado={c.estimado} />
                </div>
              </button>
            );
          })}
        </div>

        {/* A BARRA DE PROPORÇÃO — certo (navy) · confirmado (verde) · estimado (âmbar), larguras do dono. Sempre presente. */}
        <div className="flex h-[8px] w-full overflow-hidden rounded-sm bg-muted" data-testid="rec-barra"
          title={`certo ${dinheiro(resumo.certo.valor)} · já informado ${dinheiro(resumo.confirmado.valor)} · ainda estimado ${dinheiro(resumo.estimado.valor)}`}>
          <div className="h-full bg-primary" style={{ width: `${proporcoes.certo}%` }} />
          <div className="h-full bg-[#15803d]" style={{ width: `${proporcoes.confirmado}%` }} />
          <div className="h-full bg-amber-500" style={{ width: `${proporcoes.estimado}%` }} />
        </div>

        {/* OS FILTROS — uma linha FIXA de 22px. Os dois primeiros são do mês; em "Todas as regras" ficam apagados com o motivo. */}
        <div className="flex h-[22px] items-center gap-1.5" data-testid="rec-filtros">
          <Segmentado altura={22} valor={filtroTipo} onEscolher={setFiltroTipo}
            opcoes={[
              { valor: 'todas', rotulo: 'Todas', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
              { valor: 'certo', rotulo: 'Valor certo', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
              { valor: 'a_confirmar', rotulo: 'A confirmar', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
              { valor: 'folha', rotulo: 'Folha', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
            ]} />
          <Segmentado altura={22} valor={filtroSituacao} onEscolher={setFiltroSituacao}
            opcoes={[
              { valor: 'todas', rotulo: 'Todas', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
              { valor: 'confirmado', rotulo: 'Confirmado', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
              { valor: 'estimado', rotulo: 'Estimado', desabilitada: filtrosDoMesApagados, title: filtrosDoMesApagados ? MOTIVO_FILTRO_APAGADO : undefined },
            ]} />
          <Segmentado altura={22} valor={modo} onEscolher={setModo}
            opcoes={[
              { valor: 'mes', rotulo: 'No mês', title: 'As recorrências com conta vencendo no mês escolhido' },
              { valor: 'regras', rotulo: 'Todas as regras', title: 'Todas as regras, inclusive as que estão fora da vigência neste mês' },
            ]} />
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por descrição, favorecido, conta…"
              className="h-[22px] pl-7 text-[10px]" />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="shrink-0 px-3 py-8 text-center text-xs text-muted-foreground">Carregando…</p>
      ) : recorrencias.length === 0 ? (
        /* ⚠ VAZIO COM CAMINHO, não área em branco. */
        <div className="mx-4 shrink-0 rounded-lg border bg-card px-3 py-10 text-center">
          <Repeat className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-[12px] font-medium">Nenhuma recorrência cadastrada</p>
          <p className="mx-auto mt-1 max-w-md text-[10px] leading-snug text-muted-foreground">
            Uma recorrência é uma regra, não um lançamento: ela gera previsões até o mês que você
            escolher. Aluguel, energia, mensalidade.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Use o botão “Nova recorrência” para começar.
          </p>
        </div>
      ) : (
        /* ⚠ UM SCROLLPORT SÓ (A21): quem rola é o wrapper da tabela; o cabeçalho navy gruda nele e o rodapé "Total do mês"
           fica FORA da rolagem, com a mesma régua de colunas (`colgroup` repetido). */
        <div className="min-h-0 flex-1 px-4 pb-1">
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
            <div className="min-h-0 flex-1">
              <Table density="dense" className="table-fixed" data-testid="rec-tabela"
                wrapperClassName="h-full overflow-x-hidden overflow-y-scroll">
                <Colunas />
                <TableHeader className="sticky top-0 z-10 bg-primary text-primary-foreground [&_tr]:border-b-0 [&_tr]:hover:bg-primary">
                  <TableRow className="h-[19px]">
                    {COLUNAS.map(c => (
                      <Cab key={c.campo} campo={c.campo} direita={c.direita}
                        rotulo={c.campo === 'valor' ? `Valor em ${rotuloMes}` : c.rotulo} />
                    ))}
                    <TableHead className={TH} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenadas.map(r => {
                    const conta = nomeConta(r.contaBancariaId);
                    const favorecido = r.favorecidoNome ?? '—';
                    const forma = r.formaPagamento ?? '—';
                    const l = linhaDe.get(r.id);
                    const entrada = r.valorBase > 0;
                    /* ⚠ O QUE SAIU DA LISTA MORA AQUI: periodicidade, próxima competência e a situação da REGRA. */
                    const tituloDescricao = `${r.descricao} · mensal, dia ${r.diaVencimento} · próxima: ${r.proximaCompetencia ? mesBr(r.proximaCompetencia) : '—'} · regra: ${rotuloSituacao(r)}${r.gerados > 0 ? ` · ${r.gerados} geradas` : ''}${r.folha ? ' · folha de pagamento' : ''}`;
                    return (
                      /* ⚠ A LINHA INTEIRA ABRE A RECORRENCIA; o "..." é o caminho para Gerar e Cancelar. */
                      <TableRow key={r.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => setEditando(r)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditando(r); } }}
                        className={cn('h-[19px] cursor-pointer hover:bg-muted/40', r.situacao === 'cancelada' && 'opacity-55')}>
                        <TableCell className={TD_TEXTO} title={tituloDescricao}>
                          <span className="font-semibold">{r.descricao}</span>
                        </TableCell>
                        <TableCell className={TD_TEXTO} title={favorecido}>{favorecido}</TableCell>
                        <TableCell className={TD_TEXTO} title={conta}>{conta}</TableCell>
                        <TableCell className={cn(TD, 'whitespace-nowrap')}>
                          <span className={r.valorAConfirmar ? AMBAR : 'text-muted-foreground'}>
                            {ROTULO_TIPO[r.valorAConfirmar ? 'a_confirmar' : 'certo']}
                          </span>
                        </TableCell>
                        <TableCell className={TD_NUM}>{r.diaVencimento}</TableCell>
                        <TableCell className={TD_TEXTO} title={forma}>{forma}</TableCell>
                        <TableCell className={cn(TD_NUM, 'text-muted-foreground')}>{dinheiro(Math.round(Math.abs(r.valorBase) * 100))}</TableCell>
                        {/* ⚠ "—" FORA DO MÊS: a regra não tem conta vencendo nele (só aparece em "Todas as regras"). */}
                        <TableCell className={TD_NUM}>
                          {l ? <Valor centavos={l.valor} entrada={entrada} estimado={l.situacao === 'estimado'} /> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className={cn(TD, 'whitespace-nowrap')}>
                          {l ? <span className={COR_DA_SITUACAO[l.situacao]}>{ROTULO_SITUACAO_DO_MES[l.situacao]}</span>
                            : <span className="text-muted-foreground" title="sem conta vencendo neste mês">—</span>}
                        </TableCell>
                        {/* `stopPropagation` no invólucro: abrir o menu não é abrir a linha. */}
                        <TableCell className={cn(TD, 'px-0 text-right select-none')}
                          onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-[17px] w-5 p-0"
                                title="Ações desta recorrência">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditando(r)}>
                                <Pencil className="mr-2 h-3 w-3" /> Editar
                              </DropdownMenuItem>
                              {/* ⚠ GERAR SÓ ONDE HÁ O QUE GERAR: cancelada não gera (a RPC recusa), concluída não tem próxima. */}
                              {r.situacao === 'ativa' && (
                                <DropdownMenuItem onClick={() => setGerando(r)}>
                                  <Play className="mr-2 h-3 w-3" /> Gerar lançamentos
                                </DropdownMenuItem>
                              )}
                              {r.ativo && (
                                <DropdownMenuItem className="text-destructive" onClick={() => setCancelando(r)}>
                                  <Ban className="mr-2 h-3 w-3" /> Cancelar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {ordenadas.length === 0 && (
                    <TableRow className="h-[19px] hover:bg-transparent">
                      <TableCell colSpan={COLUNAS.length + 1} className={cn(TD, 'py-4 text-center text-muted-foreground')}>
                        {busca.trim() !== '' ? `Nenhuma recorrência para “${busca.trim()}”.`
                          : modo === 'mes' ? `Nenhuma recorrência com conta vencendo em ${rotuloMes} neste filtro.` : 'Nenhuma recorrência.'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* O RODAPÉ PRESO — "Total do mês", do dono, com o filtro e a busca aplicados. Mesma régua (`Colunas`), fora da
                rolagem; `overflow-y-scroll` nos dois para a coluna de valor alinhar com a das linhas. */}
            <div className="shrink-0 overflow-x-hidden overflow-y-scroll border-t bg-primary text-primary-foreground" data-testid="rec-rodape">
              <table className="w-full table-fixed border-collapse">
                <Colunas />
                <tbody>
                  <tr className="h-[22px]">
                    <td className="truncate px-1 text-[10px] font-semibold" colSpan={6}
                      title={incompleto ? 'O mês pode estar incompleto: a consulta bateu no teto de linhas.' : undefined}>
                      Total do mês · {total.qtd} {total.qtd === 1 ? 'conta' : 'contas'}
                      {total.entradasQtd > 0 && <span className="ml-2 font-normal">· {total.entradasQtd} {total.entradasQtd === 1 ? 'entrada' : 'entradas'} ▲ {dinheiro(total.entradasValor)} à parte</span>}
                      {incompleto && <span className="ml-2 font-normal text-amber-300">· mês incompleto</span>}
                    </td>
                    <td className="whitespace-nowrap px-1 text-right text-[10px] tabular-nums" data-testid="rec-total-previsto">{dinheiro(total.previsto)}</td>
                    <td className="whitespace-nowrap px-1 text-right text-[10px] font-semibold tabular-nums" data-testid="rec-total-valor">
                      {total.valor === 0 ? '0,00' : `▼ ${dinheiro(total.valor)}`}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {editando !== undefined && (
        <RecorrenciaDialog
          recorrencia={editando} clienteId={clienteId}
          aoFechar={() => setEditando(undefined)}
          aoSalvar={async () => { await recarregarTudo(); }}
        />
      )}

      {gerando && (
        <GerarLancamentosDialog
          recorrencia={gerando}
          aoFechar={() => setGerando(null)}
          aoGerar={async () => { await recarregarTudo(); }}
        />
      )}

      <AlertDialog open={!!cancelando} onOpenChange={o => !o && setCancelando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar recorrência?</AlertDialogTitle>
            {/* ⚠ O TEXTO RESPONDE A DÚVIDA DO CLIQUE. */}
            <AlertDialogDescription className="text-[11px] leading-snug">
              A regra para de gerar daqui para a frente. <b>Os lançamentos já gerados NÃO são
              apagados</b> — eles continuam no financeiro, editáveis e conciliáveis como quaisquer
              outros. Você pode reativar a regra depois editando-a.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void confirmarCancelamento(); }}>
              Cancelar recorrência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** A régua de colunas, UMA para a tabela e para o rodapé. */
function Colunas() {
  return (
    <colgroup>
      {COLUNAS.map(c => <col key={c.campo} style={c.largura === null ? undefined : { width: c.largura }} />)}
      <col style={{ width: LARGURA_ACOES }} />
    </colgroup>
  );
}

/**
 * O rótulo da Situação — PR-REC-01 item 5.
 *
 * ⚠ "CONCLUÍDA" NÃO ERA DEFEITO, ERA ROTULO MUDO. As 25 do NJ geraram tudo o que a regra
 * previa até `data_fim`; a tela dizia "concluída" e o operador lia "parou de funcionar".
 * "Gerada até dez/26" diz a mesma coisa e responde a pergunta seguinte — até quando?
 * ⚠ CANCELADA VENCE, como no hook: regra desligada à mão não é regra que terminou.
 * ⚠ `data_fim` é de CADA LINHA. As 25 vão de 31/12/2026 a 30/06/2027 (medido) — um rótulo
 * único em "dez/26" mentiria em boa parte delas.
 */
export function rotuloSituacao(r: { situacao: SituacaoRecorrencia; dataFim: string | null }): string {
  if (r.situacao === 'cancelada') return 'Pausada';
  const hoje = hojeLocal();
  if (r.dataFim && r.dataFim < hoje) return 'Encerrada';
  if (r.situacao === 'concluida') return `Gerada até ${r.dataFim ? mesBr(r.dataFim) : '—'}`;
  return 'Ativa';
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesBr = (iso: string): string => {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  return `${MES_CURTO[m - 1]}/${String(a).slice(2)}`;
};
