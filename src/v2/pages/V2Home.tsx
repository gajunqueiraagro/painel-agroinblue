import { useEffect, useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import type { StatusValidacaoArea } from '@/hooks/usePainelConsultorData';
import type { SeriesPorModo } from '@/hooks/usePainelConsultorData';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useFluxoCaixa } from '@/hooks/useFluxoCaixa';
import { useEndividamentoAtual } from '@/hooks/useEndividamentoAtual';
import { IndicadorHistoricoModal } from '@/v2/components/IndicadorHistoricoModal';
import { useHistoricoZootCache } from '@/hooks/useHistoricoZootCache';
import { useSeriePorFazenda } from '@/hooks/useSeriePorFazenda';
import { useHistoricoIndicador, type HistoricoIndicadorKey } from '@/hooks/useHistoricoIndicador';
import { useStatusPilaresLote, type StatusFazenda } from '@/hooks/useStatusPilaresLote';
import { useSaldosPorConta } from '@/hooks/useSaldosPorConta';
import { useProdutivoPorFazenda } from '@/hooks/useProdutivoPorFazenda';
import {
  makeRealizadoSource, makeRealizadoSourceEntrada, agregaPorSubcentroGenerico,
} from '@/lib/painelConsultor/agregadosFinanceiros';
import {
  isReposicaoBovinos, isDividendoOuRetirada, isCaptacaoSemEscopo,
  isDeducaoReceitas, isTributos, isEntradaNaoClassificada,
} from '@/lib/financeiro/classificacao';
import type { StatusPilar } from '@/hooks/useStatusPilares';
import { useStatusPilaresAno, type StatusCelulaAno } from '@/hooks/useStatusPilaresAno';
import type { V2Section } from '@/v2/lib/navGrupos';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BlocoAtividade } from '@/v2/components/BlocoAtividade';
import { useMovimentacoesAgregadas, type Lente, type TipoMov } from '@/v2/hooks/useMovimentacoesAgregadas';
import { ModalAtividade, type IndicadorAtividade, type Assunto } from '@/v2/components/ModalAtividade';
import { calcularRazaoEstoqueAcumulada, mediaIgnorandoZero } from '@/lib/calculos/eficienciaArea';
import { BarChart3, ArrowLeftRight, Wallet } from 'lucide-react';

const fmtN = (v: number | null | undefined, dec = 0) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? null
  : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

// R$ 22.300.000 → "R$ 22,3M". Para valores grandes onde a precisão centavos não importa.
const fmtRAbreviado = (v: number | null | undefined): string | null => {
  if (v == null || isNaN(v)) return null;
  const abs = Math.abs(v);
  const fmt = (n: number, suf: string) => `R$ ${n.toFixed(1).replace('.', ',')}${suf}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

interface MetricTileProps {
  label: string;
  value: string | null;
  unit?: string;
  loading?: boolean;
  pending?: boolean;
  tone?: 'default' | 'positive' | 'negative' | 'blue';
  status?: string | null;
  deltaMes?: number | null;
  deltaAno?: number | null;
  deltaMeta?: number | null;
  /** Inverte apenas a cor (verde/vermelho) dos deltas, mantendo seta e número.
   * Use em indicadores onde "menos é melhor" (ex.: dívida, alavancagem). */
  inverseDelta?: boolean;
  /** Quando true, oculta inteiramente o bloco de deltas (vs mês/ano/META). */
  hideDelta?: boolean;
  onClick?: () => void;
}

function MetricTile({ label, value, unit, loading, pending, tone = 'default', status, deltaMes, deltaAno, deltaMeta, inverseDelta, hideDelta, onClick }: MetricTileProps) {
  const deltaColor = (d: number) => {
    const positivo = d >= 0;
    const verde = inverseDelta ? !positivo : positivo;
    return verde ? 'text-emerald-600' : 'text-red-500';
  };
  const valColor =
    tone === 'positive' ? 'text-emerald-700' :
    tone === 'negative' ? 'text-red-700' :
    tone === 'blue'     ? 'text-primary' :
    'text-foreground';
  return (
    <div
      onClick={onClick}
      className={`min-w-0${onClick ? ' cursor-pointer' : ''}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
        {label}
      </p>
      <p className={`text-[1.4rem] font-black leading-none tabular-nums ${pending ? 'text-muted-foreground/30' : valColor}`}>
        {loading
          ? <span className="inline-block w-20 h-6 bg-muted/50 rounded animate-pulse align-middle" />
          : status
            ? <span className="text-[0.75rem] font-semibold text-amber-600">{status}</span>
            : <>{value ?? '—'}{unit && value ? <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span> : null}</>
        }
      </p>
      {!hideDelta && (
        <div className="mt-1 space-y-px">
          {deltaMes != null
            ? <p className={`text-[10px] font-medium ${deltaColor(deltaMes)}`}>
                {deltaMes >= 0 ? '↑' : '↓'} {Math.abs(deltaMes).toFixed(1)}% vs mês
              </p>
            : <p className="text-[10px] text-muted-foreground/40">— vs mês</p>
          }
          {deltaAno != null
            ? <p className={`text-[10px] font-medium ${deltaColor(deltaAno)}`}>
                {deltaAno >= 0 ? '↑' : '↓'} {Math.abs(deltaAno).toFixed(1)}% vs ano ant.
              </p>
            : <p className="text-[10px] text-muted-foreground/40">— vs ano ant.</p>
          }
          {deltaMeta != null
            ? <p className={`text-[10px] font-medium ${deltaColor(deltaMeta)}`}>
                {deltaMeta >= 0 ? '↑' : '↓'} {Math.abs(deltaMeta).toFixed(1)}% vs META
              </p>
            : <p className="text-[10px] text-muted-foreground/40">— vs META</p>
          }
        </div>
      )}
    </div>
  );
}

function SectionBlock({ title, subtitle, children, naoFechado, avisoNaoFechado }: {
  title: string; subtitle?: string; children: React.ReactNode;
  /* PR-HOME-BLOCOS-PARCIAIS-01 — bloco que DEPENDE de fechamento fica esmaecido com
     aviso por cima quando o mes nao fechou. Sem isto, a regua dizia "vermelho, ninguem
     fechou" e o bloco logo abaixo mostrava "0,0 @ · ↓ 100,0% vs mes" como se a producao
     tivesse desabado — duas afirmacoes contraditorias na mesma tela, e a de baixo era a
     errada. O zero do banco esta certo; o que faltava era CONTEXTO. */
  naoFechado?: boolean;
  avisoNaoFechado?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border/40 p-5">
      {/* Titulo e subtitulo NAO esmaecem: o operador precisa saber que bloco e aquele. */}
      <div className="flex items-baseline gap-2 mb-4">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">{title}</h3>
        {subtitle && <span className="text-[10px] text-muted-foreground">({subtitle})</span>}
      </div>
      <div className="relative">
        {/* pointer-events-none impede clicar num card e abrir o historico de um numero
            parcial. O overlay e ABSOLUTO: nao empurra layout nem muda a altura do bloco. */}
        <div className={`grid grid-cols-2 gap-x-6 gap-y-5${naoFechado ? ' opacity-40 pointer-events-none select-none' : ''}`}>
          {children}
        </div>
        {naoFechado && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-card/80 px-2 text-center pointer-events-none">
            <span className="text-xs font-semibold text-muted-foreground">{avisoNaoFechado}</span>
            <span className="text-[10px] text-muted-foreground">
              Os números aparecem quando o fechamento for concluído.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── PR-HOME-CAIXA-CONSOLIDADO-01 — linha do bloco de Caixa ──
   Travessao quando nao ha valor, NUNCA zero: zero afirma "nao houve", travessao diz
   "nao ha dado". Regra de sentinela do CLAUDE.md. */
function LinhaCaixa({ label, valor, tipo = 'detalhe', corValor }: {
  label: string;
  valor: number | null;
  tipo?: 'detalhe' | 'subtotal' | 'total';
  corValor?: string;
}) {
  /* Hierarquia: TOTAL em text-xs, DETALHE em text-[9px] + leading-tight. O bloco
     "Disponivel em conta" reusa este componente e herda a mesma hierarquia —
     subtotal de tipo maior que as contas, que e o efeito desejado la tambem.
     SUBTOTAL e' o degrau do meio, criado para o Saldo INICIAL: ele abre o bloco
     mas nao e' a conclusao dele, e com o mesmo peso do Saldo final os dois
     competiam. Sem `pl-2` — nao e' detalhe indentado, e' cabeca de bloco.
     Prop nova em vez de embrulhar em <div> com classe: a hierarquia mora no
     componente, e quem chamar de fora herda a mesma escala. */
  const base = tipo === 'total'
    ? 'text-xs font-medium text-foreground'
    : tipo === 'subtotal'
    ? 'text-[10px] font-medium text-muted-foreground'
    : 'text-[9px] leading-tight text-muted-foreground pl-2';
  return (
    <div className={`flex items-baseline justify-between gap-3 ${base}`}>
      <span className="truncate">{label}</span>
      <span className={`tabular-nums shrink-0 ${corValor ?? ''}`}>
        {valor == null ? '—' : fmtR(valor)}
      </span>
    </div>
  );
}

/* Formatador unico de area. Duas casas, sempre com sufixo. */
function fmtHa(v: number | null): string {
  return v == null
    ? '—'
    : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

/* Area em hectares INTEIROS para tabela e barra: o mockup usa densidade
   alta e centavo de hectare nao muda decisao nenhuma. `fmtHa` (2 casas)
   permanece para os poucos lugares que precisam de precisao. */
function fmtHaInt(v: number | null): string {
  return v == null || v === 0
    ? '—'
    : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/* Media dos meses COM snapshot, Jan -> mes selecionado. Mes sem snapshot e
   AUSENCIA, nao zero: incluir null na conta diluiria a media e faria a area
   "encolher" so porque um mes nao fechou. null quando nenhum mes tem dado. */
function mediaSerie(serie: (number | null)[] | undefined, ateIdx: number): number | null {
  if (!serie) return null;
  const vals = serie.slice(0, ateIdx + 1).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

/* Produtiva sobre total; Pec/Agri/Silvi sobre produtiva. NAO limitar a
   100%: quando ha pasto arrendado de terceiro a produtiva excede a
   matricula (Vera Ligia, 102,8%) e truncar esconderia o fato. */
function pctDe(parte: number | null, base: number | null): string {
  if (parte == null || base == null || base <= 0 || parte === 0) return '—';
  return `${((parte / base) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/* Irmao de LinhaCaixa: mesma anatomia, unidade diferente. Area em ha nao
   pode usar fmtR — o bloco inteiro perderia o sentido com cifrao. */
function LinhaArea({ label, valor, tipo = 'detalhe' }: {
  label: string;
  valor: number | null;
  tipo?: 'detalhe' | 'total';
}) {
  const base = tipo === 'total'
    ? 'font-medium text-foreground'
    : 'text-muted-foreground pl-2.5';
  return (
    <div className={`flex items-baseline justify-between gap-3 text-[11px] ${base}`}>
      <span className="truncate">{label}</span>
      <span className="tabular-nums shrink-0">{fmtHa(valor)}</span>
    </div>
  );
}

/* Irmao de LinhaCaixa para o modo Resumido: mesma anatomia, com afordancia de
   clique. No modo Macro as linhas NAO sao clicaveis — elas ja sao o detalhe. */
function LinhaCaixaClicavel({ label, valor, onClick }: {
  label: string;
  valor: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-baseline justify-between gap-3 rounded px-1 -mx-1 text-[9px] leading-tight text-muted-foreground pl-2 text-left transition-colors hover:bg-muted/30 cursor-pointer"
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums shrink-0">{valor == null ? '—' : fmtR(valor)}</span>
    </button>
  );
}

/* Soma so o que EXISTE: null nao entra na conta. */
function somaLinhas(valores: (number | null)[]): number {
  return valores.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/* ── PR-HOME-REGUA-MESES-01 — regua de 12 meses ──
   Substitui o dropdown de mes (que saiu de periodoConfig, entrada 'home'). Um seletor
   so, e ele mostra o ANO INTEIRO de uma vez: o dropdown escondia o historico.

   REGRA DE COR, por mes, agregando as fazendas do escopo:
     cinza claro  nenhuma fazenda iniciou o mes
     verde        TODAS as fazendas fecharam
     vermelho     nenhuma fechou
     ambar        o resto — alguma fechou, alguma nao

   'nao_implementado' e 'nao_aplicavel' NAO CONTAM como pendencia: fazenda com
   p1 oficial e p2 nao_aplicavel esta FECHADA — o mapa fechou e nao havia rebanho a
   fechar. Sao os 14 casos de Sta. Luzia e Retiro Agricultura em 2026.

   'nao_iniciado' NAO E PENDENCIA. Mes que ninguem abriu e cinza, nao ambar — foram 149
   celulas assim em 2026, e pinta-las de ambar afogaria as 3 pendencias reais.

   Verde exige TODAS as fazendas, por decisao explicita: "se tem 1 ou 12 fazendas, tem
   que fechar todas todo mes". Verde raro e informacao, nao defeito de UX. */
const CELULA_MES = 'rounded border px-1 py-0.5 text-[10px] leading-tight font-semibold';

type CorMes = 'verde' | 'ambar' | 'vermelho' | 'cinza';

const COR_CELULA: Record<CorMes, string> = {
  verde:    'bg-emerald-600/15 text-emerald-700 border-emerald-600/30',
  ambar:    'bg-amber-500/15   text-amber-700   border-amber-500/30',
  vermelho: 'bg-red-500/15     text-red-700     border-red-500/30',
  cinza:    'bg-muted          text-muted-foreground border-border/40',
};

/* Pilar que nao existe ou nao se aplica sai da conta; o que sobra tem que ser oficial. */
function pilarOk(s: StatusPilar): boolean {
  return s === 'oficial' || s === 'nao_aplicavel' || s === 'nao_implementado';
}

function corDoMes(celulas: StatusCelulaAno[]): CorMes {
  if (celulas.length === 0) return 'cinza';
  const iniciadas = celulas.filter(c => c.p1 !== 'nao_iniciado');
  if (iniciadas.length === 0) return 'cinza';
  const fechadas = iniciadas.filter(c => pilarOk(c.p1) && pilarOk(c.p2)).length;
  if (fechadas === celulas.length) return 'verde';   // TODAS as fazendas, nao so as iniciadas
  if (fechadas === 0) return 'vermelho';
  return 'ambar';
}

function ReguaMeses({ celulas, mesSelecionado, ano, loading, erro, onMesChange, meses }: {
  celulas: StatusCelulaAno[];
  mesSelecionado: number;
  ano: number;
  loading: boolean;
  erro: string | null;
  onMesChange?: (mes: string) => void;
  meses: string[];
}) {
  /* Skeleton com os ROTULOS REAIS em text-transparent: a altura de carregamento e a
     altura final por construcao, e nao uma estimativa mantida a mao. */
  if (loading) {
    return (
      <div className="mt-1 grid grid-cols-12 gap-0.5">
        {meses.map(m => (
          <span key={m} className={`${CELULA_MES} ${COR_CELULA.cinza} text-transparent animate-pulse text-center`}>{m}</span>
        ))}
      </div>
    );
  }

  /* Erro do status NAO pode tirar do operador a escolha do mes. Sem cor, mas clicavel. */
  const semCor = erro !== null;
  const hoje = new Date();
  const mesCorrente = (hoje.getFullYear() === ano) ? hoje.getMonth() + 1 : 0;

  return (
    <div className="mt-1 grid grid-cols-12 gap-0.5">
      {meses.map((rotulo, i) => {
        const mm = i + 1;
        const doMes = celulas.filter(c => c.mes === mm);
        const cor: CorMes = semCor ? 'cinza' : corDoMes(doMes);
        const selecionado = mm === mesSelecionado;
        const corrente = mm === mesCorrente;
        const realce = selecionado
          ? ' ring-2 ring-primary'
          : corrente ? ' ring-1 ring-border font-bold' : '';
        // Mes futuro continua CLICAVEL: o operador pode querer olhar.
        return (
          <button
            key={rotulo}
            type="button"
            onClick={() => onMesChange?.(String(mm))}
            className={`${CELULA_MES} ${COR_CELULA[cor]}${realce} text-center cursor-pointer hover:opacity-80`}
          >
            {rotulo}
          </button>
        );
      })}
    </div>
  );
}

/* PR-HOME-STATUS-BLOCO-01 — faixa de status de fechamento.
   DISCRETA QUANDO ESTA TUDO FECHADO, e isso e regra, nao economia de pixel: faixa que
   grita todos os dias vira faixa que ninguem le. O destaque existe para a EXCECAO.
   Em modo global lista SO as fazendas com pendencia — as fechadas nao ocupam espaco.
   P3/P4/P5 nao aparecem: estao 'nao_implementado', e mostra-los como cinza no topo da
   tela principal seria ruido permanente.
   Nao corrige, nao fecha, nao abre dialogo de acao — so informa onde a pendencia esta. */
/* Pilula unica dos dois badges. Mesma caixa nos dois, para a barra sticky nao mudar de
   altura entre estados — e o skeleton usa a MESMA classe com texto transparente, entao
   a altura de carregamento e exatamente a altura final. */
const PILL_STATUS = 'rounded-full border px-2 py-0.5 text-[10px] leading-tight';

function StatusFechamentoBanda({ status, isGlobal, loading, mesLabel, onIrPara }: {
  status: StatusFazenda[];
  isGlobal: boolean;
  loading: boolean;
  mesLabel: string;
  onIrPara?: (section: V2Section, fazendaId: string) => void;
}) {
  // useState ANTES de qualquer return: hook nao pode ficar atras de saida antecipada.
  const [modalAberto, setModalAberto] = useState(false);

  if (loading) {
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        <span className={`${PILL_STATUS} border-border/40 bg-muted text-transparent animate-pulse`}>Rebanho 0/0</span>
        <span className={`${PILL_STATUS} border-border/40 bg-muted text-transparent animate-pulse`}>Financeiro (em construção)</span>
      </div>
    );
  }
  if (status.length === 0) return null;

  /* PR-HOME-STATUS-NAO-APLICAVEL-01 — a pergunta certa e "esta PENDENTE?", nao "nao e
     oficial?". As duas coincidiam por acidente enquanto so havia dois estados uteis;
     com 'nao_aplicavel' no contrato, nao-oficial deixou de significar pendente e a tela
     passaria a cobrar rebanho de fazenda sem gado. Um helper, quatro usos. */
  const pendente = (s: StatusPilar) => s === 'pendente';

  /* '✓' so para oficial; travessao para o que nao e nem oficial nem pendente — sentinela
     do CLAUDE.md, em vez de chamar de pendente o que nao e. */
  const marca = (s: StatusPilar) => (s === 'oficial' ? '✓' : pendente(s) ? 'pendente' : '—');

  const faltaDe = (f: StatusFazenda): string | null => {
    const faltas: string[] = [];
    if (pendente(f.p1)) faltas.push('mapa de pastos');
    if (pendente(f.p2)) faltas.push('valor do rebanho');
    return faltas.length > 0 ? faltas.join(' e ') : null;
  };

  /* P1 ANTES de P2, e nao por ordem alfabetica: o mapa de pastos e pre-requisito do
     valor do rebanho. Mandar o operador ao valor primeiro seria manda-lo a uma tela
     que ele ainda nao pode fechar. */
  const destinoDe = (f: StatusFazenda): V2Section =>
    (pendente(f.p1) ? 'fechamento' : 'valor-rebanho');

  const total = status.length;
  /* Fechada = NENHUM pilar pendente, e nao "todos oficiais". A Sta. Luzia, com P1
     oficial e P2 'nao_aplicavel', tem o mes DELA fechado — o que nao existe ali e a
     cobranca de rebanho. O denominador segue sendo todas as fazendas do cliente: ela e
     uma fazenda do cliente. */
  const fechadas = status.filter(f => !pendente(f.p1) && !pendente(f.p2)).length;
  const tudoFechado = fechadas === total;
  const escopo = isGlobal ? 'todas as fazendas' : status[0].nome;

  /* A FRACAO e deliberada: com 12 fazendas, "3/12" informa o TAMANHO do problema, e um
     simbolo de erro sozinho nao informa nada. Em fazenda especifica nao ha fracao — ali
     a informacao util e o NOME do que falta. */
  const rotuloRebanho = tudoFechado
    ? 'Rebanho ✓'
    : isGlobal
      ? `Rebanho ${fechadas}/${total}`
      : `Rebanho · ${faltaDe(status[0])}`;

  const classeRebanho = tudoFechado
    ? `${PILL_STATUS} border-border/40 bg-transparent text-muted-foreground`
    : `${PILL_STATUS} border-border/40 bg-amber-500/15 text-amber-700`;

  return (
    <>
      <div className="mt-1 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className={`${classeRebanho} cursor-pointer hover:bg-amber-500/25`}
        >
          {rotuloRebanho}
        </button>
        {/* Financeiro e o P3, declarado 'nao_implementado' em PR-PILARES-CALCULO-01: a
            regra existe, os campos de conferencia bancaria nao. CINZA INERTE e SEM
            clique — o badge mostra a forma final da faixa, nunca finge medicao. */}
        <span className={`${PILL_STATUS} border-border/40 bg-muted text-muted-foreground`}>
          Financeiro (em construção)
        </span>
      </div>

      {/* O modal e o lugar do quadro COMPLETO: aqui a fazenda fechada tambem aparece,
          ao contrario da faixa, onde ela so ocuparia espaco. */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Fechamento do rebanho — {escopo} · {mesLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            {status.map(f => {
              const falta = faltaDe(f);
              const detalhe = (
                <>
                  <span className="font-medium">{f.nome}</span>
                  {/* O P1 aparece SEMPRE — e o que garante que a linha nunca fica vazia.
                      O P2 some quando nao se aplica: dizer "valor do rebanho pendente"
                      onde nao ha gado e a cobranca que este PR existe para acabar. */}
                  {' · '}mapa de pastos {marca(f.p1)}
                  {f.p2 !== 'nao_aplicavel' && <>{' · '}valor do rebanho {marca(f.p2)}</>}
                </>
              );
              return falta && onIrPara ? (
                <button
                  key={f.fazendaId}
                  type="button"
                  onClick={() => { setModalAberto(false); onIrPara(destinoDe(f), f.fazendaId); }}
                  className="block w-full rounded border border-border/40 px-2 py-1 text-left text-[11px] text-amber-700 cursor-pointer hover:bg-amber-500/15"
                >
                  {detalhe}
                </button>
              ) : (
                <div
                  key={f.fazendaId}
                  className={`rounded border border-border/40 px-2 py-1 text-[11px] ${falta ? 'text-amber-700' : 'text-muted-foreground'}`}
                >
                  {detalhe}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function V2Home({ ano, mes, viewMode = 'mes', onViewModeChange, onIrPara, onMesChange }: {
  ano: string;
  mes: string;
  viewMode?: 'mes' | 'periodo';
  onViewModeChange?: (v: 'mes' | 'periodo') => void;
  /* OPCIONAL: sem ela a faixa continua informando, so nao clica. */
  onIrPara?: (section: V2Section, fazendaId: string) => void;
  /* OPCIONAL pelo mesmo motivo. `mes` e estado do V2Index; a regua so o comunica.
     FORMATO: '1'..'12', SEM zero a esquerda — e o que setMes recebe em todo o V2Index e
     o que o V2FilterBar sempre mandou (MESES[].v). Zero a esquerda quebraria o filtro
     em silencio. */
  onMesChange?: (mes: string) => void;
}) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal, fazendasComPecuaria, fazendas } = useFazenda();
  const fazendaIdsPecuaria = useMemo(
    () => fazendasComPecuaria.map(f => f.id),
    [fazendasComPecuaria],
  );
  const h = new Date().getHours();
  const g = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  const mesNum = parseInt(mes);
  const anoNum = parseInt(ano);

  /* Status de fechamento da faixa. Em modo global pergunta fazenda a fazenda; com
     fazenda especifica, so a dela. anoMes e sempre 'YYYY-MM', o formato que a RPC
     recebe — `mes` chega como string sem garantia de zero a esquerda. */
  const anoMesStatus = useMemo(
    () => (anoNum && mesNum ? `${anoNum}-${String(mesNum).padStart(2, '0')}` : undefined),
    [anoNum, mesNum],
  );
  const fazendasStatus = useMemo(
    () => (isGlobal ? fazendasComPecuaria : fazendaAtual ? [fazendaAtual] : []),
    [isGlobal, fazendasComPecuaria, fazendaAtual],
  );
  const { data: statusFechamento, loading: loadingStatusFechamento } =
    useStatusPilaresLote(fazendasStatus, anoMesStatus);

  /* Grade do ANO para a regua: UMA chamada, 12 meses x N fazendas. Em fazenda especifica
     as celulas das outras sao filtradas na tela — a RPC devolve o cliente inteiro. */
  const { data: gradeAno, loading: loadingGradeAno, error: erroGradeAno } =
    useStatusPilaresAno(clienteAtual?.id, anoNum);
  const gradeEscopo = useMemo(
    () => (isGlobal ? gradeAno : gradeAno.filter(c => c.fazendaId === fazendaAtual?.id)),
    [gradeAno, isGlobal, fazendaAtual?.id],
  );

  const isPeriodo = viewMode === 'periodo';

  /* PR-HOME-BLOCOS-PARCIAIS-01 — o mesmo corDoMes que pinta a regua decide se os blocos
     dependentes de fechamento esmaecem. UMA regra, dois usos: reimplementar aqui criaria
     a divergencia que esta frente passou o dia eliminando. Sem chamada extra ao hook —
     gradeEscopo ja esta em mao.

     So VERMELHO (ninguem fechou) e CINZA (ninguem abriu) recebem o aviso. AMBAR fica de
     fora de proposito: ali os numeros sao PARCIAIS mas REAIS, e a faixa logo acima ja
     diz quantas fazendas faltam.

     Em modo PERIODO nao se aplica: o bloco acumula Jan..mes, e esmaecer sete meses de
     dado real porque o ultimo esta aberto esconderia mais verdade do que protege.

     Enquanto carrega ou se o hook falhou, tambem nao: gradeEscopo vazio daria 'cinza' e
     a tela acusaria "mes nao iniciado" sem ter perguntado ao banco. */
  const corMesSelecionado = useMemo(
    () => corDoMes(gradeEscopo.filter(c => c.mes === mesNum)),
    [gradeEscopo, mesNum],
  );
  const mesSemFechamento =
    !isPeriodo && !loadingGradeAno && erroGradeAno === null
    && (corMesSelecionado === 'vermelho' || corMesSelecionado === 'cinza');
  const avisoMes = corMesSelecionado === 'cinza' ? 'Mês não iniciado' : 'Mês não fechado';

  const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const ml = isPeriodo
    ? `Jan–${MES_ABREV[mesNum - 1]} ${ano}`
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const [modalIndicador, setModalIndicador] = useState<string | null>(null);
  /* PR-ATIVIDADE-01 — o modal por ASSUNTO. Estado proprio: ele nao e um
     `modalIndicador` com outro valor, e sim outra pergunta. */
  const [modalAtividade, setModalAtividade] = useState<Assunto | null>(null);
  /* O assunto ATIVO dentro do modal, informado por ele. `modalAtividade` diz
     por qual bloco o modal foi aberto e NAO acompanha a troca de assunto no
     cabecalho — usar um pelo outro foi o defeito de 24/08: as series do
     Zootecnico nunca carregavam quando se chegava nele por dentro do modal. */
  const [assuntoAtivo, setAssuntoAtivo] = useState<Assunto | null>(null);

  /* Fatia do donut sob o mouse. Guarda o LABEL, nao o indice: `fatias` muda de
     tamanho conforme familias zeram, e indice apontaria para outra fatia. */
  const [fatiaHover, setFatiaHover] = useState<string | null>(null);

  /* Modo do bloco Caixa. NAO persiste: abre sempre em 'resumido', inclusive
     ao trocar de mes ou de viewMode. */
  const [modoCaixa, setModoCaixa] = useState<'resumido' | 'macro'>('resumido');
  /* Linha do Resumido cujo modal esta aberto. null = fechado. */
  const [linhaCaixaModal, setLinhaCaixaModal] = useState<string | null>(null);

  /* A verificacao de integridade do cache (fn_zoot_cache_has_gap) foi
     REMOVIDA daqui em 24/08. Custava 2,3s de servidor e ~3,9s de parede
     por abertura da Home em Global, e a medicao contra a base inteira —
     todos os clientes, todos os anos, os dois cenarios — achou UMA
     divergencia, na meta de 2027 de um cliente.
     Ela tambem NAO detecta valor errado: compara contagem de linhas,
     entao as 12 linhas de dez/2025 das 3 Muchachas passaram com 20.539
     kg a menos.
     A funcao continua existindo no banco e vai para a tela de Auditoria,
     onde quem abre esta investigando. NAO recolocar no caminho de
     abertura. */

  // Lançamentos compartilhados — carregados uma única vez, reutilizados pelas 3 chamadas de usePainelConsultorData abaixo.
  const { lancamentos: lancPecShared } = useLancamentos({ ano: anoNum });
  const { lancamentos: lancFinShared, rateioADM } = useFinanceiro({ ano: anoNum });
  // Não passar externo enquanto ainda está carregando (length = 0)
  // Undefined = hook interno roda; array com dados = hook interno desligado
  const sharedLanc = {
    lancPecExterno: lancPecShared.length > 0 ? lancPecShared : undefined,
    lancFinExterno: lancFinShared.length > 0 ? lancFinShared : undefined,
  };

  const {
    cabecas, pesoMedio, gmd, arrobas, desfrute,
    receita, desembolso, resultado, valorRebanhoMes: valorReb,
    areaProdutivaMes, areaPecuariaRealMes, areaPecuariaRealPorMes, areaPecuariaMetaPorMes,
    // PR-HOME-AREA-COMPOSICAO-01 — composicao da area no mes, do snapshot oficial.
    areaProdutivaRealPorMes, areaAgriculturaRealPorMes,
    areaTotalRealPorMes, areaSilviculturaRealPorMes, areaReservaRealPorMes,
    areaAppRealPorMes, areaBenfeitoriasRealPorMes, areaOutrasRealPorMes,
    areaPorFazendaMes,
    snapshotsFazenda,
    lotUaHa, kgHa, statusArea, faltandoCount,
    seriesMensais, seriesMeta, cabecasIndicador, pesoMedioIndicador, gmdIndicador, uaHaIndicador, kgHaIndicador, arrobasIndicador, desfruteIndicador, desfrutePctArrIndicador, valorRebanhoIndicador,
    receitaPecIndicador, custeioPecIndicador, custoArrIndicador, precoArrIndicador, custoCabIndicador, margemArrIndicador,
    // PR-HOME-CAIXA-CONSOLIDADO-01 — as 15 linhas de fluxo e o saldo.
    receitaPecCaixaIndicador, receitaAgriIndicador, receitaOutrasIndicador, captacaoIndicador, entradasNaoClassificadasIndicador,
    captacaoPecIndicador, captacaoAgriIndicador, captacaoSilviIndicador, captacaoSemEscopoIndicador,
    /* PR-VG-CAIXA-01 — ja existiam no PC-100 desde 22/08; a tela e' que nao os
       consumia. Ver o comentario em `entradasCaixa`. */
    aportePessoalIndicador, retornoEmprestimosIndicador,
    receitaSilvicolaIndicador, custeioSilviIndicador, investSilviIndicador, amortizacaoSilviIndicador,
    investPecIndicador, investBovinosIndicador, amortizacaoPecIndicador,
    amortizacoesIndicador,
    custeioAgriIndicador, investAgriIndicador, amortizacaoAgriIndicador,
    dividendosIndicador, deducoesTributosIndicador, tributosIndicador,
    caixaIndicador,
    /* PR-ATIVIDADE-08 — quatro que o PC-100 ja produzia e nenhuma tela lia.
       Saem da MESMA desestruturacao: nenhuma chamada nova ao hook.
       `kgHaIndicador` ja vinha, na linha de cima. */
    arrobasEstoqueIndicador, arrobasHaIndicador, precoArrEstoqueIndicador,
    valorRebanhoSemEfeitoIndicador, areaProdutivaPecIndicador,
    /* PR-FINANCEIRO-01 — o DRE de caixa. Quase todos ja existiam no PC-100
       com a MESMA forma dos zootecnicos; so os dois `custoVariavel` de
       agricultura e silvicultura nasceram neste PR, porque o par existia
       apenas na pecuaria e a hierarquia nao fechava. */
    custoFixoPecIndicador, custoVariavelPecIndicador,
    custoFixoAgriIndicador, custoVariavelAgriIndicador,
    custoFixoSilviIndicador, custoVariavelSilviIndicador,
    jurosPecIndicador, jurosAgriIndicador, jurosSilviIndicador,
    loading: loadingPainel,
  } = usePainelConsultorData({ ano: anoNum, mes: mesNum, viewMode, incluirComparativos: true, ...sharedLanc });

  /* ── PR-HOME-CAIXA-CONSOLIDADO-01 ──
     O bloco SEGUE o viewMode da tela. Nao ha seletor proprio: a Visao Geral ja tem
     "No mes / No periodo", e um segundo controle para a mesma pergunta faria a tela
     falar com duas vozes.

     SALDO — caixaIndicador.serieAno tem length 13, com a posicao 0 = DEZEMBRO do ano
     anterior (caixaIndicador.ts:22). O encadeamento sai de graca:
       mes     -> inicial = serieAno[mes-1] (mes anterior; em janeiro, dez do ano ant.)
       periodo -> inicial = serieAno[0]     (dez do ano anterior)
     Final e sempre serieAno[mes]. Nenhum agregado novo, nenhuma query. */
  const rotuloSaldoInicial = isPeriodo
    ? 'Saldo inicial do ano'
    : `Saldo inicial · ${mesNum > 1 ? MES_ABREV[mesNum - 2] : 'Dez'}`;
  const rotuloSaldoFinal = `Saldo final · ${MES_ABREV[mesNum - 1]}`;

  const serieCaixa = caixaIndicador?.serieAno;
  const saldoInicial = serieCaixa
    ? (isPeriodo ? (serieCaixa[0] ?? null) : (serieCaixa[mesNum - 1] ?? null))
    : null;
  const saldoFinal = serieCaixa ? (serieCaixa[mesNum] ?? null) : null;

  /* ── PR-HOME-DISPONIVEL-CONTA-01 — onde o saldo do mes esta ──
     Escopo CLIENTE, nunca fazenda (regra de useSaldoCaixaMensal): identico em
     Global e em fazenda especifica. anoMesStatus ja e o 'YYYY-MM' do mes
     SELECIONADO — o mesmo do bloco Caixa, nao o mes corrente. */
  const { data: saldosPorConta } = useSaldosPorConta(clienteAtual?.id, anoMesStatus ?? '');

  /* ── PR-HOME-PRODUTIVO-FAZENDA-01 — produtivo por fazenda no mes selecionado ── */
  const { data: produtivoPorFazenda } = useProdutivoPorFazenda(clienteAtual?.id, anoNum, mesNum, isPeriodo);

  const ROTULO_TIPO_CONTA: Record<string, string> = {
    cc: 'Conta corrente', inv: 'Investimento', cartao: 'Cartão',
  };

  /* Conta zerada nao aparece; grupo inteiro zerado nao aparece nem como rotulo
     ('cartao' cai nesse caso em todos os clientes hoje). O hook devolve tudo —
     esconder e decisao da tela. */
  const gruposConta = useMemo(() => {
    const comSaldo = (saldosPorConta ?? []).filter(c => c.saldo !== 0);
    const out: { tipo: string; rotulo: string; subtotal: number; contas: typeof comSaldo }[] = [];
    for (const c of comSaldo) {
      const tipo = c.tipo_conta ?? '—';
      let g = out.find(x => x.tipo === tipo);
      if (!g) {
        /* Tipo fora da lista oficial entra com o valor CRU: inventar rotulo
           esconderia um tipo novo do plano de contas. */
        g = { tipo, rotulo: ROTULO_TIPO_CONTA[tipo] ?? tipo, subtotal: 0, contas: [] };
        out.push(g);
      }
      g.contas.push(c);
      g.subtotal += c.saldo;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldosPorConta]);

  const totalEmConta = gruposConta.reduce((acc, g) => acc + g.subtotal, 0);

  /* MOSTRAR, NAO FORCAR — mesmo principio da diferenca de fechamento do Caixa.
     Tolerancia de R$ 1,00 para nao exibir centavo de arredondamento. */
  const difEmConta = saldoFinal != null ? totalEmConta - saldoFinal : null;
  const mostrarDifEmConta = difEmConta != null && Math.abs(difEmConta) > 1;

  /* ── Composicao da area do mes ──
     Area e ESTOQUE: NUNCA soma ao longo do periodo.
     Em viewMode='periodo' o bloco mostra a MEDIA dos meses com snapshot
     (Jan -> mes selecionado), nao a soma: quando entra e sai pasto
     arrendado durante o ano, a media descreve a area efetivamente operada.
     null = nenhum mes do intervalo tem snapshot -> "—". */
  const areaIdx = mesNum - 1;
  const areaNoModo = (serie: (number | null)[] | undefined): number | null =>
    isPeriodo ? mediaSerie(serie, areaIdx) : (serie?.[areaIdx] ?? null);
  const areaTotal     = areaNoModo(areaTotalRealPorMes);
  const areaProdutiva = areaNoModo(areaProdutivaRealPorMes);
  const areaPec       = areaNoModo(areaPecuariaRealPorMes);
  const areaAgri      = areaNoModo(areaAgriculturaRealPorMes);
  const areaSilvi     = areaNoModo(areaSilviculturaRealPorMes);
  const areaReserva   = areaNoModo(areaReservaRealPorMes);
  const areaApp       = areaNoModo(areaAppRealPorMes);
  const areaBenf      = areaNoModo(areaBenfeitoriasRealPorMes);
  const areaOutras    = areaNoModo(areaOutrasRealPorMes);

  /* Area e lotacao SEMPRE do snapshot oficial. A view tem area propria e
     lotacao derivada dela — divergentes (Pureza jul/2026: 4.726 ha e 0,73
     contra 3.595 ha e 0,96). Cruzar por fazenda_id e recalcular. */
  const linhasProdutivas = useMemo(
    () => (produtivoPorFazenda ?? [])
      .map(p => {
        const area = areaPorFazendaMes.find(a => a.fazenda_id === p.fazenda_id);
        const areaPec = area?.area_pecuaria_ha ?? 0;

        /* RAZAO DE AGREGADOS — media do UA ÷ media da area, pela funcao unica
           da `eficienciaArea`. Ate 24/08 este bloco fazia media das RAZOES
           mensais, deliberadamente, para espelhar o `rollingAvg(lotUaHa)` que o
           PC-100 usava. O PR-RAZAO-ESTOQUE-01 trocou a regra do PC-100 e este
           bloco ficaria para tras — com o tile UA/ha do bloco Eficiencia e esta
           coluna na MESMA tela, discordando.

           O divisor proprio que motivava o codigo a mao continua garantido: a
           funcao so conta o mes que TEM area, entao fazenda com 3 de 7 meses
           fechados divide por 3, nunca por 7. Era esse o cuidado, e ele nao se
           perde — muda so o que se promedia.

           Area do MES, do snapshot oficial — nunca a `area_produtiva_ha` da
           view, que e lixo conhecido (Pureza jul/2026: 4.726 contra 3.595). */
        const lotacaoPeriodo = (() => {
          const area12 = Array.from({ length: 12 }, (_, i) =>
            snapshotsFazenda.find(x => x.fazenda_id === p.fazenda_id && x.mes === i + 1)
              ?.area_pecuaria_ha ?? null);
          /* A serie acumula ate cada mes; ler em `mesNum - 1` ja recorta o
             periodo, e mes futuro nao influencia a posicao lida. */
          const v = calcularRazaoEstoqueAcumulada(p.uaPorMes, area12)[mesNum - 1];
          return Number.isFinite(v) ? v : null;
        })();

        return {
          ...p,
          areaPec,
          /* No MES nada muda: `ua_media[m] / area[m]` e exatamente o que o
             PC-100 faz (eficienciaArea.ts:35-36). Area zero exibe "—", nunca
             divisao por zero. */
          lotacao: isPeriodo
            ? lotacaoPeriodo
            : (areaPec > 0 ? p.ua_media / areaPec : null),
        };
      })
      .filter(l => l.cabecas > 0 || l.areaPec > 0)
      .sort((a, b) => b.cabecas - a.cabecas),
    [produtivoPorFazenda, areaPorFazendaMes, snapshotsFazenda, isPeriodo, mesNum],
  );

  /* Total consome os indicadores do PC-100, os MESMOS objetos dos tiles do bloco
     Eficiencia. Bate por construcao, nao por coincidencia. NAO recalcular: o GMD,
     em especial, nao e reproduzivel a partir das colunas da view (medido: 0,355
     contra 0,378 na Pureza — o denominador nao e cabecas finais).
     Area e a excecao: e area, nao indicador, entao soma as linhas.
     Desfrute divide SOMAS, nunca promedia percentuais. */
  const totProdutivo = useMemo(() => {
    const arrIni = linhasProdutivas.reduce((s, l) => s + l.arrIniciais, 0);
    const arrVend = linhasProdutivas.reduce((s, l) => s + l.arrVendidas, 0);
    return {
      areaPec: linhasProdutivas.reduce((s, l) => s + l.areaPec, 0),
      desfrute: arrIni > 0 ? (arrVend / arrIni) * 100 : null,
    };
  }, [linhasProdutivas]);

  /* Nome da fazenda: `fazendas` do FazendaContext — a lista COMPLETA, a mesma que
     alimenta o seletor. Nao `fazendasComPecuaria`, que filtra tem_pecuaria !== false
     e deixaria de fora justamente a Retiro Agricultura, que o PR-AREA-FONTE-OPERACAO-01
     trouxe para a area. Sem query nova. */
  const nomeFazendaPorId = useMemo<Record<string, string>>(
    () => Object.fromEntries(fazendas.map(f => [f.id, f.nome])),
    [fazendas],
  );

  /* MOSTRAR, NAO MAQUIAR. Produtiva > total acontece quando ha pasto
     arrendado DE TERCEIRO: a terra nao esta na matricula, mas o gado e do
     cliente e a area entra em uso. Medido em 2026-07: 3 Muchachas, 50,00 ha
     (`Arrendamento - Baldasso`). O sistema ainda nao tem campo de posse,
     entao a linha NAO afirma que e arrendamento — mostra o fato. */
  const areaExcedente = (areaProdutiva != null && areaTotal != null && areaProdutiva > areaTotal)
    ? areaProdutiva - areaTotal
    : null;

  const entradasCaixa = [
    /* CAIXA, nao competencia. receitaPecIndicador e competencia zootecnica
       (fonte soberana da DRE) e alimenta o card grande e o Preco R$/@ — os
       dois permanecem intocados. Aqui o regime e caixa: o bloco fecha contra
       saldo bancario real, e misturar regimes num total que precisa fechar
       era o defeito. As duas leituras divergem por natureza. */
    { label: 'Receitas pecuária',      valor: receitaPecCaixaIndicador?.valor ?? null },
    { label: 'Receitas agricultura',   valor: receitaAgriIndicador?.valor   ?? null },
    { label: 'Receitas silvicultura',  valor: receitaSilvicolaIndicador?.valor ?? null },
    { label: 'Outras receitas',        valor: receitaOutrasIndicador?.valor ?? null },
    /* Captacao aberta por escopo: as quatro PARTICIONAM captacaoIndicador, que
       permanece como total e alimenta a verificacao de fechamento abaixo do bloco.
       Sem condicional propria — o filtro `temValor` cuida das zeradas. */
    { label: 'Captação pecuária',     valor: captacaoPecIndicador?.valor       ?? null },
    { label: 'Captação agricultura',  valor: captacaoAgriIndicador?.valor      ?? null },
    { label: 'Captação silvicultura', valor: captacaoSilviIndicador?.valor     ?? null },
    /* ⚠ AS DUAS QUE SUMIRAM. Em 22/08 `isAportePessoal` e `isRetornoEmprestimos`
       viraram predicates proprios e passaram a ser NEGADOS dentro de
       `isCaptacaoSemEscopo` (classificacao.ts:655-661). Os indicadores nasceram
       no PC-100, a tela nunca ganhou as linhas, e R$ 904.898 sairam de "Aportes
       e outras" sem entrar em lugar nenhum — some do bloco e quebrava a
       verificacao de captacao logo abaixo.
       "Aportes e outras" FICA: com estas duas ao lado, ela passa a ser o residuo
       verdadeiro — subcentro novo que ninguem mapeou. O `temValor` a esconde
       quando zera. */
    { label: 'Aporte pessoal',        valor: aportePessoalIndicador?.valor      ?? null },
    { label: 'Retorno de empréstimos', valor: retornoEmprestimosIndicador?.valor ?? null },
    { label: 'Aportes e outras',      valor: captacaoSemEscopoIndicador?.valor ?? null },
    /* Residuo de entrada: grupo fora dos oficiais. A condicional propria que existia
       aqui saiu — `temValor` faz a mesma coisa para TODAS as linhas, e duas regras
       para o mesmo efeito e onde uma delas apodrece. Comportamento identico: antes
       `> 0`, agora `!= null && !== 0`. Valor negativo passaria a aparecer, o que e
       melhor do que sumir. */
    { label: 'Não classificado',      valor: entradasNaoClassificadasIndicador?.valor ?? null },
  ];

  /* Linha zerada nao renderiza: cada cliente ve so o que movimenta. O operador nao ve
     a categoria quando ela esta zerada — custo aceito e ja vigente na silvicultura das
     saidas e no grupo Cartao do Disponivel em conta. Preferido a agrupar linhas COM
     conteudo, que apagaria a leitura por atividade. */
  const temValor = (v: number | null) => v != null && v !== 0;
  const entradasVisiveis = entradasCaixa.filter(l => temValor(l.valor));

  /* PR-HOME-DENSIDADE-01 — as MESMAS linhas, na MESMA ordem, agora agrupadas por
     familia so para ganhar um separador visual. saidasCaixa e o flat destes grupos,
     entao totalSaidas continua sendo a soma exata das linhas exibidas. */
  const saidasGrupos: { familia: string; linhas: { label: string; valor: number | null }[] }[] = [
    { familia: 'Pecuária', linhas: [
      { label: 'Custeio pecuária',          valor: custeioPecIndicador?.valor       ?? null },
      /* ⚠ IRMA de Custeio, nunca dentro dele. `isCusteioProducaoPecuaria` filtra
         so `Custo Fixo` e `Custo Variavel`, e o comentario dela e' explicito —
         "NAO inclui: Juros Financ. Pec." —, entao `custeioPecIndicador` e' a
         versao SEM juros e nao ha contagem dupla. Existe
         `custeioPecComJurosIndicador` no PC-100; se alguma linha daqui passasse
         a consumi-lo, esta teria de sair no mesmo movimento.
         Sem ela, R$ 16.551 de juros nao entravam em saida nenhuma — mesmo
         padrao do Aporte Pessoal: indicador no PC-100, tela sem consumidor. */
      { label: 'Juros financ. pec.',        valor: jurosPecIndicador?.valor         ?? null },
      { label: 'Investimento pecuária',     valor: investPecIndicador?.valor        ?? null },
      { label: 'Reposição de bovinos',      valor: investBovinosIndicador?.valor    ?? null },
      { label: 'Amortização financ. pec.',  valor: amortizacaoPecIndicador?.valor   ?? null },
    ] },
    { familia: 'Agricultura', linhas: [
      { label: 'Custeio agricultura',       valor: custeioAgriIndicador?.valor      ?? null },
      { label: 'Juros financ. agri.',       valor: jurosAgriIndicador?.valor        ?? null },
      { label: 'Investimento agricultura',  valor: investAgriIndicador?.valor       ?? null },
      { label: 'Amortização financ. agri.', valor: amortizacaoAgriIndicador?.valor  ?? null },
    ] },
    /* Silvicultura nasce condicional: hoje o proto tem ZERO lancamento de custo
       silvicola, e tres linhas de R$ 0 poluiriam a tela de todos os clientes.
       Os predicates existem para que o custo NAO suma quando aparecer — mesmo
       principio da linha residual de entradas. */
    { familia: 'Silvicultura', linhas: [
      ...(((custeioSilviIndicador?.valor ?? 0) > 0)
        ? [{ label: 'Custeio silvicultura', valor: custeioSilviIndicador?.valor ?? null }] : []),
        ...(((jurosSilviIndicador?.valor ?? 0) > 0)
          ? [{ label: 'Juros financ. silvi.', valor: jurosSilviIndicador?.valor ?? null }] : []),
      ...(((investSilviIndicador?.valor ?? 0) > 0)
        ? [{ label: 'Investimento silvicultura', valor: investSilviIndicador?.valor ?? null }] : []),
      ...(((amortizacaoSilviIndicador?.valor ?? 0) > 0)
        ? [{ label: 'Amortização financ. silvi.', valor: amortizacaoSilviIndicador?.valor ?? null }] : []),
    ] },
    { familia: 'Transversal', linhas: [
      { label: 'Dividendos',                valor: dividendosIndicador?.valor       ?? null },
      { label: 'Deduções de receitas',      valor: deducoesTributosIndicador?.valor ?? null },
      { label: 'Tributos',                  valor: tributosIndicador?.valor         ?? null },
    ] },
  ];

  /* Grupo TODO ausente ou zerado nao rende linhas nem separador — senao sobra um
     traco solto. Silvicultura cai nesse caso em todos os clientes hoje. */
  const saidasGruposVisiveis = saidasGrupos
    .map(g => ({ ...g, linhas: g.linhas.filter(l => temValor(l.valor)) }))
    .filter(g => g.linhas.length > 0);

  const saidasCaixa = saidasGruposVisiveis.flatMap(g => g.linhas);

  /* Totais = SOMA DAS LINHAS EXIBIDAS. NAO usar saidasTotaisIndicador: ele tem regra
     propria (deducao e ajuste de entrada e nao entra nele), e o total divergiria das
     partes logo abaixo — o pior defeito possivel num bloco que existe para fechar conta. */
  /* ── PR-HOME-CAIXA-RESUMIDO-MODAL-01 ──
     Agregados do modo Resumido somam os MESMOS indicadores que o modo Macro
     exibe linha a linha. Fecha por construcao: nao existe caminho em que o
     agrupado difira das partes, porque sao as mesmas parcelas.
     NAO agregar no hook: custeioPecIndicador e um memo legado com regra
     propria de rateio, e custeioAgriIndicador e a versao SEM juros —
     somar os arrays do _finSoberano produziria numero parecido e diferente. */
  const somaInd = (...xs: (number | null | undefined)[]) =>
    xs.reduce<number>((acc, v) => acc + (v ?? 0), 0);

  /* Cada parcela vira item de modal: rotulo + o MESMO `?.valor` que entra na
     soma. Total do modal e valor da linha sao o mesmo numero, sempre. */
  const parcelasAtividade: Record<string, { label: string; valor: number | null }[]> = {
    'Receitas': [
      { label: 'Pecuária',     valor: receitaPecCaixaIndicador?.valor ?? null },
      { label: 'Agricultura',  valor: receitaAgriIndicador?.valor ?? null },
      { label: 'Silvicultura', valor: receitaSilvicolaIndicador?.valor ?? null },
      { label: 'Outras receitas', valor: receitaOutrasIndicador?.valor ?? null },
    ],
    'Captação': [
      { label: 'Pecuária',     valor: captacaoPecIndicador?.valor ?? null },
      { label: 'Agricultura',  valor: captacaoAgriIndicador?.valor ?? null },
      { label: 'Silvicultura', valor: captacaoSilviIndicador?.valor ?? null },
    ],
    'Custeio': [
      { label: 'Pecuária',     valor: custeioPecIndicador?.valor ?? null },
      { label: 'Agricultura',  valor: custeioAgriIndicador?.valor ?? null },
      { label: 'Silvicultura', valor: custeioSilviIndicador?.valor ?? null },
    ],
    'Investimento': [
      { label: 'Pecuária',     valor: investPecIndicador?.valor ?? null },
      { label: 'Agricultura',  valor: investAgriIndicador?.valor ?? null },
      { label: 'Silvicultura', valor: investSilviIndicador?.valor ?? null },
    ],
    'Amortização': [
      { label: 'Pecuária',     valor: amortizacaoPecIndicador?.valor ?? null },
      { label: 'Agricultura',  valor: amortizacaoAgriIndicador?.valor ?? null },
      { label: 'Silvicultura', valor: amortizacaoSilviIndicador?.valor ?? null },
    ],
  };

  const recResumo   = somaInd(...parcelasAtividade['Receitas'].map(x => x.valor));
  const captResumo  = somaInd(...parcelasAtividade['Captação'].map(x => x.valor));
  const custResumo  = somaInd(...parcelasAtividade['Custeio'].map(x => x.valor));
  const invResumo   = somaInd(...parcelasAtividade['Investimento'].map(x => x.valor));
  const amortResumo = somaInd(...parcelasAtividade['Amortização'].map(x => x.valor));
  const dedTribResumo = somaInd(deducoesTributosIndicador?.valor, tributosIndicador?.valor);

  const entradasResumo = [
    { label: 'Receitas',          valor: recResumo },
    { label: 'Captação',          valor: captResumo },
    /* Ver o comentario em `entradasCaixa`: as duas mesmas linhas, para o
       Resumido e o Detalhado nao contarem coisas diferentes. */
    { label: 'Aporte pessoal',        valor: aportePessoalIndicador?.valor      ?? null },
    { label: 'Retorno de empréstimos', valor: retornoEmprestimosIndicador?.valor ?? null },
    { label: 'Aportes e outras',  valor: captacaoSemEscopoIndicador?.valor ?? null },
    { label: 'Não classificado',  valor: entradasNaoClassificadasIndicador?.valor ?? null },
  ].filter(l => temValor(l.valor));

  const saidasResumo = [
    { label: 'Custeio',              valor: custResumo },
    /* `somaInd`, como as outras: ele preserva a distincao entre null e zero,
       que `(a ?? 0) + (b ?? 0)` apagaria — sem juros no periodo a linha some
       pelo `temValor` em vez de exibir R$ 0,00. Ver a irma no Detalhado,
       aberta por familia. */
    { label: 'Juros de financiamento', valor: somaInd(jurosPecIndicador?.valor,
                                                     jurosAgriIndicador?.valor,
                                                     jurosSilviIndicador?.valor) },
    { label: 'Investimento',         valor: invResumo },
    { label: 'Reposição de bovinos', valor: investBovinosIndicador?.valor ?? null },
    { label: 'Amortização',          valor: amortResumo },
    { label: 'Dividendos',           valor: dividendosIndicador?.valor ?? null },
    { label: 'Deduções e tributos',  valor: dedTribResumo },
  ].filter(l => temValor(l.valor));

  /* Quebra por SUBCENTRO das linhas que nao tem atividade. Usa os MESMOS
     adapters e predicates dos agregadores oficiais sobre `lancFinShared`, que
     ja esta carregado — nenhuma consulta nova. `agregaPorSubcentroGenerico`
     devolve meses[12]; o recorte segue o viewMode, como o resto do bloco. */
  const parcelasSubcentro = useMemo<Record<string, { label: string; valor: number | null }[]>>(() => {
    if (!lancFinShared.length) return {};
    const srcSaida   = makeRealizadoSource(lancFinShared, anoNum);
    const srcEntrada = makeRealizadoSourceEntrada(lancFinShared, anoNum);
    const recorte = (meses: number[]) =>
      isPeriodo ? meses.slice(0, mesNum).reduce((a, b) => a + b, 0) : (meses[mesNum - 1] ?? 0);
    const lista = (rec: Record<string, { meses: number[] }>) =>
      Object.entries(rec)
        .map(([label, v]) => ({ label, valor: recorte(v.meses) }))
        .filter(x => x.valor !== 0)
        .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    /* Deducoes e tributos e a soma de DOIS predicates: concatenar as duas
       quebras, cada uma com o seu, em vez de inventar um predicate novo. */
    const dedTrib = [
      ...lista(agregaPorSubcentroGenerico(srcSaida, isDeducaoReceitas, 'modalDeducoes')),
      ...lista(agregaPorSubcentroGenerico(srcSaida, isTributos, 'modalTributos')),
    ].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
    return {
      'Reposição de bovinos': lista(agregaPorSubcentroGenerico(srcSaida, isReposicaoBovinos, 'modalReposicao')),
      'Dividendos':           lista(agregaPorSubcentroGenerico(srcSaida, isDividendoOuRetirada, 'modalDividendos')),
      'Aportes e outras':     lista(agregaPorSubcentroGenerico(srcEntrada, isCaptacaoSemEscopo, 'modalAportes')),
      'Deduções e tributos':  dedTrib,
      'Não classificado':     lista(agregaPorSubcentroGenerico(srcEntrada, isEntradaNaoClassificada, 'modalNaoClassif')),
    };
  }, [lancFinShared, anoNum, mesNum, isPeriodo]);

  /* Quebra de qualquer linha do Resumido: por atividade quando ha, por
     subcentro no resto. Itens zerados nao entram. */
  const quebraDaLinha = (label: string) =>
    (parcelasAtividade[label] ?? parcelasSubcentro[label] ?? [])
      .filter(x => temValor(x.valor))
      .sort((a, b) => Math.abs(b.valor ?? 0) - Math.abs(a.valor ?? 0));

  const resumido = modoCaixa === 'resumido';

  const totalEntradas = somaLinhas((resumido ? entradasResumo : entradasVisiveis).map(l => l.valor));
  const totalSaidas   = somaLinhas((resumido ? saidasResumo : saidasCaixa).map(l => l.valor));

  /* MOSTRAR, NAO FORCAR. Se a conta nao fecha, a diferenca aparece — maquiar seria
     inventar. Tolerancia de R$ 1,00 para nao exibir centavo de arredondamento. */
  const difCaixa = (saldoInicial != null && saldoFinal != null)
    ? saldoFinal - (saldoInicial + totalEntradas - totalSaidas)
    : null;
  const mostrarDifCaixa = difCaixa != null && Math.abs(difCaixa) > 1;

  // ── Histórico OFICIAL PC-100 (Opção B) ──
  // Lista de indicadores cujo histórico inferior consome fonte oficial PC-100
  // em vez de useHistoricoIndicador (cache raw). Adicionar novos aqui conforme migração.
  const MIGRATED_HISTORICO_KEYS = ['arrobas', 'pesoMedio', 'gmd', 'uaHa', 'kgHa', 'areaProdutivaPec', 'custeioPec', 'custoArr', 'custoCab', 'margemArr', 'precoArr', 'receitaPec'] as const;
  const modalUsaHistoricoOficial =
    !!modalIndicador &&
    (MIGRATED_HISTORICO_KEYS as readonly string[]).includes(modalIndicador);

  // ── Histórico multi-ano (auxiliar legado, só dispara com modal aberto p/ indicador permitido) ──
  // Desfrute usa fonte oficial separada (lancamentos), via useHistoricoIndicador branch específico.
  // uaHa/kgHa: branch específico que cruza fechamento_area_snapshot + zoot_mensal_cache.
  const HIST_KEYS_PERMITIDAS: HistoricoIndicadorKey[] = ['cabecas', 'pesoMedio', 'arrobas', 'gmd', 'desfrute', 'valorRebanho', 'uaHa', 'kgHa', 'receitaPec', 'precoArr', 'custeioPec', 'custoArr', 'custoCab', 'margemArr'];
  const histAtivo = modalIndicador != null
    && (HIST_KEYS_PERMITIDAS as string[]).includes(modalIndicador);
  // Valor oficial do anoAtual e da meta — vêm do hook principal e são repassados
  // ao histórico p/ que a barra do anoAtual bata 100% com o topo do modal.
  /* O ponto do ano para UMA leitura. `valor` do indicador ja vem
     colapsado por viewMode; `series[modo].ano[mesNum]` e a MESMA
     expressao sem o colapso — em todos os indicadores
     `valor = safe(serie[mesIdx])` com `serie = isPeriodo ? periodo13 :
     mes13`. Nao e calculo paralelo: e a mesma leitura, sem escolher. */
  type IndicadorComSeries = {
    series?: {
      mes:     { ano: number[]; anoAnt?: number[]; meta?: number[] };
      periodo: { ano: number[]; anoAnt?: number[]; meta?: number[] };
    };
  };
  const pontoHist = (ind: IndicadorComSeries | null | undefined, modo: 'mes' | 'periodo'): number | null => {
    const v = ind?.series?.[modo]?.ano?.[mesNum];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  /* O ponto do ano anterior para UMA leitura. Mesma relacao que
     `pontoHist` tem com `?.valor`: e `safeSerieAnoAnt(serieAnoAnt,
     mesNum)` sem o colapso por viewMode. Nao e calculo novo.
     So os SEIS financeiros usam — os cinco zootecnicos leem o ano-1 de
     `dadosAnoAnt`, que ja e uma instancia propria do hook. */
  const antHist = (ind: IndicadorComSeries | null | undefined, modo: 'mes' | 'periodo'): number | null => {
    const v = ind?.series?.[modo]?.anoAnt?.[mesNum];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  /* A meta do ano corrente, mesma regra — sem o colapso do `serieMeta`. */
  const metaHist = (ind: IndicadorComSeries | null | undefined, modo: 'mes' | 'periodo'): number | null => {
    const v = ind?.series?.[modo]?.meta?.[mesNum];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  /* A barra de meta do historico e uma so: "Meta {anoAtual}". O
     `montaBarras` do modal a procura por `find(h => h.ano === anoAtual)`,
     entao um item por leitura basta. Valor nulo = sem barra, que e o
     correto quando o indicador nao tem meta. */
  const metaPar = (ind: IndicadorComSeries | null | undefined): HistoricoPorModo => ({
    mes:     [{ ano: anoNum, valor: metaHist(ind, 'mes') }],
    periodo: [{ ano: anoNum, valor: metaHist(ind, 'periodo') }],
  });

  type HistoricoPorModo = {
    mes:     Array<{ ano: number; valor: number | null }>;
    periodo: Array<{ ano: number; valor: number | null }>;
  };

  /* As duas leituras do ano corrente, para o hook legado. A cadeia e a
     MESMA de antes — so troca `?.valor` por `pontoHist(..., modo)` e
     `serieMeta?.[mesNum]` por `metaHist(..., modo)`, que sao as mesmas
     expressoes sem o colapso por viewMode. */
  const valorOficialPorModo = (modo: 'mes' | 'periodo'): number | null => histAtivo
    ? (modalIndicador === 'cabecas'      ? pontoHist(cabecasIndicador, modo)
     : modalIndicador === 'pesoMedio'    ? pontoHist(pesoMedioIndicador, modo)
     : modalIndicador === 'gmd'          ? pontoHist(gmdIndicador, modo)
     : modalIndicador === 'arrobas'      ? pontoHist(arrobasIndicador, modo)
     : modalIndicador === 'desfrute'     ? pontoHist(desfruteIndicador, modo)
     : modalIndicador === 'valorRebanho' ? pontoHist(valorRebanhoIndicador, modo)
     : modalIndicador === 'uaHa'         ? pontoHist(uaHaIndicador, modo)
     : modalIndicador === 'kgHa'         ? pontoHist(kgHaIndicador, modo)
     : modalIndicador === 'receitaPec'   ? pontoHist(receitaPecIndicador, modo)
     : modalIndicador === 'precoArr'     ? pontoHist(precoArrIndicador, modo)
     : modalIndicador === 'custeioPec'   ? pontoHist(custeioPecIndicador, modo)
     : modalIndicador === 'custoArr'     ? pontoHist(custoArrIndicador, modo)
     : modalIndicador === 'custoCab'     ? pontoHist(custoCabIndicador, modo)
     : modalIndicador === 'margemArr'    ? pontoHist(margemArrIndicador, modo)
     : null)
    : null;
  const valorOficialMetaPorModo = (modo: 'mes' | 'periodo'): number | null => histAtivo
    ? (modalIndicador === 'cabecas'    ? metaHist(cabecasIndicador, modo)
     : modalIndicador === 'pesoMedio'  ? metaHist(pesoMedioIndicador, modo)
     : modalIndicador === 'gmd'        ? metaHist(gmdIndicador, modo)
     : modalIndicador === 'arrobas'    ? metaHist(arrobasIndicador, modo)
     : modalIndicador === 'receitaPec' ? metaHist(receitaPecIndicador, modo)
     : modalIndicador === 'precoArr'   ? metaHist(precoArrIndicador, modo)
     : modalIndicador === 'custeioPec' ? metaHist(custeioPecIndicador, modo)
     : modalIndicador === 'custoArr'   ? metaHist(custoArrIndicador, modo)
     : modalIndicador === 'custoCab'   ? metaHist(custoCabIndicador, modo)
     : modalIndicador === 'margemArr'  ? metaHist(margemArrIndicador, modo)
     : null)
    : null;

  /* Duas instancias do hook legado, uma por modo. Ele recebe `viewMode` e
     devolve UMA leitura; serve `cabecas`, `desfrute` e `valorRebanho`.
     `enabled: histAtivo` continua — so disparam com o modal aberto nessas
     tres chaves. Custo aceito: uma rodada de query a mais nesses casos. */
  const histLegadoParams = {
    enabled: histAtivo,
    clienteId: clienteAtual?.id,
    fazendaId: isGlobal ? null : fazendaAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    indicadorKey: (histAtivo ? modalIndicador : 'cabecas') as HistoricoIndicadorKey,
    mesAtual: mesNum,
    anoAtual: anoNum,
    anoInicio: anoNum - 5,
  };
  const histLegadoMes = useHistoricoIndicador({
    ...histLegadoParams,
    viewMode: 'mes',
    valorOficialAnoAtual:     valorOficialPorModo('mes'),
    valorOficialMetaAnoAtual: valorOficialMetaPorModo('mes'),
  });
  const histLegadoPeriodo = useHistoricoIndicador({
    ...histLegadoParams,
    viewMode: 'periodo',
    valorOficialAnoAtual:     valorOficialPorModo('periodo'),
    valorOficialMetaAnoAtual: valorOficialMetaPorModo('periodo'),
  });
  const historicoAno: HistoricoPorModo = { mes: histLegadoMes.historico, periodo: histLegadoPeriodo.historico };
  const historicoAnoMeta: HistoricoPorModo = { mes: histLegadoMes.historicoMeta, periodo: histLegadoPeriodo.historicoMeta };
  const loadingHistorico = histLegadoMes.loading || histLegadoPeriodo.loading;

  // Comparativos — sempre modo 'mes', nunca 'periodo'
  const mesAntNum = mesNum > 1 ? mesNum - 1 : null;
  const dadosMesAnt = usePainelConsultorData({
    ano: anoNum,
    mes: mesAntNum ?? mesNum,
    viewMode,
    ...sharedLanc,
  });
  const dadosAnoAnt = usePainelConsultorData({
    ano: anoNum - 1,
    mes: mesNum,
    viewMode,
    ...sharedLanc,
  });

  // 5 chamadas históricas lazy — só carregam quando modal de arrobas abre.
  // anoAtual-1 já vem de dadosAnoAnt (acima). anoAtual vem da chamada principal (L188).
  // Não passar sharedLanc — cada ano histórico carrega seus próprios lançamentos via PC-100 interno.
  // carregarMeta=false e incluirComparativos=false (lean) para minimizar queries.
  const histArr2 = usePainelConsultorData({ ano: anoNum - 2, mes: mesNum, viewMode, enabled: modalUsaHistoricoOficial });
  const histArr3 = usePainelConsultorData({ ano: anoNum - 3, mes: mesNum, viewMode, enabled: modalUsaHistoricoOficial });
  const histArr4 = usePainelConsultorData({ ano: anoNum - 4, mes: mesNum, viewMode, enabled: modalUsaHistoricoOficial });
  const histArr5 = usePainelConsultorData({ ano: anoNum - 5, mes: mesNum, viewMode, enabled: modalUsaHistoricoOficial });

  /* Historico zootecnico direto do zoot_mensal_cache: UMA consulta paginada
     cobrindo a faixa inteira, em vez de quatro copias do painel. As quatro
     instancias histArr2..histArr5 continuam vivas para os sete financeiros e
     para uaHa/kgHa, que cruzam com fechamento_area_snapshot. */
  const histZoot = useHistoricoZootCache({
    enabled: modalUsaHistoricoOficial,
    clienteId: clienteAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    anoInicio: anoNum - 5,
    anoFim: anoNum,
    mesAtual: mesNum,
  });

  /* Series por fazenda — base da aba "Por Fazenda" do modal. Uma query, do
     mesmo cache. So os QUATRO indicadores que o hook cobre recebem a prop;
     nos catorze restantes a aba nao e renderizada. */
  const seriePorFaz = useSeriePorFazenda({
    enabled: !!modalIndicador,
    clienteId: clienteAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    ano: anoNum,
    mesAtual: mesNum,
  });

  /* ── PR-ATIVIDADE-01 · as fontes do modal por assunto ───────────────
     Instancias PROPRIAS em vez de reaproveitar as de cima: as existentes
     sao governadas por `modalIndicador`, e mudar o `enabled` delas seria
     REMOVER linha do V2Home — o PR e aditivo por contrato. Ligam so quando
     o modal de atividade abre, entao nao ha custo com ele fechado.
     `useHistoricoZootCache` e a consulta barata do PR-23 (uma paginada), e
     `useSeriePorFazenda` ja aplica o overlay de fechamento (dcaa1f11). */
  const histZootAtiv = useHistoricoZootCache({
    enabled: assuntoAtivo === 'zootecnico',
    clienteId: clienteAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    anoInicio: anoNum - 5,
    anoFim: anoNum,
    mesAtual: mesNum,
  });
  const seriePorFazAtiv = useSeriePorFazenda({
    /* `snapshotsFazenda` ja esta desestruturado acima e ja e consumido em
       outro bloco desta pagina: passa por prop, sem requisicao nova. */
    areaPorFazendaMes: snapshotsFazenda,
    enabled: assuntoAtivo === 'zootecnico',
    clienteId: clienteAtual?.id,
    fazendaIds: fazendaIdsPecuaria,
    ano: anoNum,
    mesAtual: mesNum,
  });

  /* Os DOZE indicadores do assunto Zootecnico, prontos para o modal, TODOS
     com dado desde o PR-ATIVIDADE-09: `areaProdutivaPecIndicador` nasceu no
     hook e o card em construcao saiu. O nome resolveu a ambiguidade que
     parou o PR-08 — ha tres series de area e duas se chamam "produtiva";
     esta declara no rotulo que e' a pecuaria, a mesma que divide o @/ha.
     `porFazenda` e `historico` ficam UNDEFINED quando nao ha fonte, e o card
     mostra "em construção" naquela aba: mostrar o Global disfarcado de
     por-fazenda seria dado errado com rotulo certo, e esconder o card faria o
     buraco na grade sumir sem explicar.
     Dos cinco que entraram no PR-ATIVIDADE-08, NENHUM tem serie por fazenda
     nem historico multi-ano (`useHistoricoZootCache` cobre tres). Serie por
     fazenda: NOVE dos doze cards tem, desde o PR-RAZAO-ESTOQUE-01; faltam os
     tres de VALOR. */
  const indicadoresAtividade = useMemo<IndicadorAtividade[]>(() => {
    const serie = (ind: { series?: SeriesPorModo; serieAno?: number[] } | null | undefined,
                   modo: 'mes' | 'periodo', campo: 'ano' | 'anoAnt' | 'meta') => {
      const s = ind?.series?.[modo]?.[campo];
      if (s) return s;
      return campo === 'ano' ? (ind?.serieAno ?? []) : undefined;
    };
    const ponto = (s: number[] | undefined) => {
      if (!s || s.length === 0) return null;
      const v = s.length >= 13 ? s[mesNum] : s[mesNum - 1];
      return v != null && !isNaN(v) ? v : null;
    };
    /* Forma MINIMA comum aos indicadores do PC-100 — evita `any` num
       PR novo (regra zero-cast). Nao e o tipo deles: e o subconjunto que
       este bloco le. */
    type IndicadorPC = {
      titulo?: string;
      subtitulo?: string;
      titulos?: { mes?: { titulo?: string }; periodo?: { titulo?: string } };
      deltaMes?: number | null;
      deltaAno?: number | null;
      deltaMeta?: number | null;
      serieAno?: number[];
      series?: SeriesPorModo;
    } | null | undefined;
    const monta = (
      chave: string,
      ind: IndicadorPC,
      formatoValor: IndicadorAtividade['formatoValor'],
      unidade: string | undefined,
      porFazenda?: Array<{ fazendaId: string; nome: string; codigo: string; mes: Array<number | null>; periodo: Array<number | null> }>,
      historico?: { mes: Array<{ ano: number; valor: number | null }>; periodo: Array<{ ano: number; valor: number | null }> },
    ): IndicadorAtividade => {
      const sMes = serie(ind, 'mes', 'ano') as number[];
      const sPer = serie(ind, 'periodo', 'ano') as number[];
      const temHist = !!historico && (historico.mes.some(p => p.valor != null));
      return {
        chave,
        titulo: ind?.titulo ?? '',
        subtitulo: ind?.subtitulo ?? '',
        tituloMes: ind?.titulos?.mes?.titulo,
        tituloPeriodo: ind?.titulos?.periodo?.titulo,
        unidade,
        formatoValor,
        serieMes: sMes,
        seriePeriodo: sPer,
        serieAnoAntMes: serie(ind, 'mes', 'anoAnt'),
        serieAnoAntPeriodo: serie(ind, 'periodo', 'anoAnt'),
        serieMetaMes: serie(ind, 'mes', 'meta'),
        serieMetaPeriodo: serie(ind, 'periodo', 'meta'),
        valorMes: ponto(sMes),
        valorPeriodo: ponto(sPer),
        deltaMes: ind?.deltaMes ?? null,
        deltaAno: ind?.deltaAno ?? null,
        deltaMeta: ind?.deltaMeta ?? null,
        porFazenda: porFazenda && porFazenda.length > 0 ? porFazenda : undefined,
        historico: temHist ? historico : undefined,
      };
    };
    return [
      monta('cabecas',      cabecasIndicador,      'inteiro',  'cab',  seriePorFazAtiv.cabecas),
      monta('arrobas',      arrobasIndicador,      'decimal1', '@',    seriePorFazAtiv.arrobas,   histZootAtiv.arrobas),
      monta('uaHa',         uaHaIndicador,         'decimal2', 'UA/ha', seriePorFazAtiv.uaHa),
      monta('gmd',          gmdIndicador,          'decimal3', 'kg',   seriePorFazAtiv.gmd,       histZootAtiv.gmd),
      monta('pesoMedio',    pesoMedioIndicador,    'decimal1', 'kg',   seriePorFazAtiv.pesoMedio, histZootAtiv.pesoMedio),
      monta('valorRebanho', valorRebanhoIndicador, 'moedaAbreviada', undefined, seriePorFazAtiv.valorRebanho),
      /* ── PR-ATIVIDADE-08 · os cinco ligados ──
         Sem `porFazenda` e sem `historico` em nenhum dos cinco: as fontes nao
         cobrem estas chaves, e o card declara a falta em vez de mostrar o
         Global com rotulo de fazenda. */
      monta('arrobasEstoque', arrobasEstoqueIndicador, 'decimal1', '@', seriePorFazAtiv.arrobasEstoque),
      monta('kgHa', kgHaIndicador, 'decimal1', 'kg/ha', seriePorFazAtiv.kgHa),
      monta('arrobasHa', arrobasHaIndicador, 'decimal2', '@/ha', seriePorFazAtiv.arrobasHa),
      monta('precoArrEstoque', precoArrEstoqueIndicador, 'moeda', 'R$/@', seriePorFazAtiv.precoArrEstoque),
      monta('valorRebanhoSemEfeito', valorRebanhoSemEfeitoIndicador, 'moedaAbreviada', undefined, seriePorFazAtiv.valorRebanhoSemEfeito),
      /* O decimo segundo, agora com dado. O rotulo diz QUAL das tres series
         de area do hook e' esta — a mesma que divide o @/ha. */
      monta('areaProdutiva', areaProdutivaPecIndicador, 'decimal1', 'ha', seriePorFazAtiv.areaProdutivaPec),
    ];
  }, [cabecasIndicador, arrobasIndicador, uaHaIndicador, gmdIndicador, pesoMedioIndicador,
      valorRebanhoIndicador, arrobasEstoqueIndicador, kgHaIndicador, arrobasHaIndicador,
      precoArrEstoqueIndicador, valorRebanhoSemEfeitoIndicador, areaProdutivaPecIndicador,
      seriePorFazAtiv, histZootAtiv, mesNum]);

  /* ── PR-MOVIMENTACOES-01 · os 28 cards do assunto Movimentacoes ──────────
     FONTE UNICA: `useMovimentacoesAgregadas`, que ja entrega os treze tipos e
     as lentes com serie mensal, acumulada, ano anterior e meta — e cujas
     arrobas saem de `calcArrobasSafe` (carcaca/15 no abate, peso/30 no resto).
     NENHUMA divisao de arroba e escrita aqui.

     ⚠ NAO usar `rebanho.movimentacoes` do PC-100: ele nao tem arrobas, e soma
     `l.pesoTotal`, que esta nulo em 77% das compras. Derivar R$/@ dali
     significaria reimplementar a regra da arroba sobre um peso furado.

     Sete tipos x quatro lentes. A unidade segue a decisao de Gabriel: @ para
     abate e desfrute, QUILO para o resto. Card sem dado nao some da grade —
     mostra travessao, e a ausencia fica legivel. */
  const movAgg = useMovimentacoesAgregadas({
    ano: anoNum, mes: mesNum, viewMode, isGlobal,
    /* Tres `useLancamentos`. Sem guarda eles rodavam SEMPRE, inclusive com o
       modal fechado, no caminho de carga da Home.
       O GERAL tambem liga: tres das suas oito linhas sao de movimentacao, e
       sem isto o resumo executivo nasceria com travessao justo na metade que
       responde "o que entrou e saiu". Como o Geral e a PRIMEIRA aba, o custo
       volta a cada abertura do modal — mas so do modal, nunca da Home. */
    enabled: assuntoAtivo === 'movimentacoes' || assuntoAtivo === 'geral',
  });

  /* Delta contra a META do MESMO recorte, como o bloco Zootecnico. O hook
     agrega `mesAtual` e `meta` sobre os MESMOS meses (`mesesPeriodo`), entao
     os dois seguem o `viewMode` da tela juntos: em "No período" a comparacao
     ja e acumulada, e a irregularidade do planejamento mensal se dilui sem
     precisar de teto nem supressao.
     ⚠ Meta ZERO devolve `null`, nunca `+∞` nem `0%`: sem meta no recorte nao
     ha o que comparar, e o travessao ali passa a ser VERDADEIRO em vez de
     acidental — que era o defeito, quatro `delta: null` escritos a mao. */
  const deltaMetaMov = (tipo: TipoMov): number | null => {
    const cd = movAgg.porTipo[tipo];
    const real = cd?.mesAtual?.cab;
    const meta = cd?.meta?.cab;
    if (real == null || meta == null) return null;
    if (!Number.isFinite(real) || !Number.isFinite(meta) || meta === 0) return null;
    return ((real - meta) / meta) * 100;
  };

  const indicadoresMovimentacoes = useMemo<IndicadorAtividade[]>(() => {
    const ponto = (s: number[] | undefined) => {
      if (!s || s.length === 0) return null;
      const v = s.length >= 13 ? s[mesNum] : s[mesNum - 1];
      return v != null && !isNaN(v) ? v : null;
    };
    const card = (
      chave: string, tipo: TipoMov, lente: Lente,
      titulo: string, subtitulo: string,
      formatoValor: IndicadorAtividade['formatoValor'], unidade?: string,
    ): IndicadorAtividade => {
      const cd = movAgg.porTipo[tipo];
      const mes = cd?.seriesJanDez?.[lente];
      const per = cd?.seriesAcumulada?.[lente];
      return {
        chave, titulo, subtitulo,
        tituloMes: titulo, tituloPeriodo: titulo,
        unidade, formatoValor,
        serieMes:     mes?.real   ?? [],
        seriePeriodo: per?.real   ?? [],
        serieAnoAntMes:     mes?.anoAnt,
        serieAnoAntPeriodo: per?.anoAnt,
        serieMetaMes:       mes?.meta,
        serieMetaPeriodo:   per?.meta,
        valorMes:     ponto(mes?.real),
        valorPeriodo: ponto(per?.real),
        /* INERTES, como no Zootecnico: o modal calcula o delta por leitura a
           partir das series. Ficam no contrato porque a prop os exige. */
        deltaMes: null, deltaAno: null, deltaMeta: null,
      };
    };
    /* Uma LINHA por tipo. `pesoLente`/`precoLente` mudam com a unidade do tipo:
       abate e desfrute em @, os demais em quilo. */
    const linha = (
      pref: string, tipo: TipoMov, rotulo: string, emArroba: boolean,
    ): IndicadorAtividade[] => [
      card(`${pref}_cab`, tipo, 'cab', `${rotulo} — cabeças`, 'Quantidade no recorte', 'inteiro', 'cab'),
      emArroba
        ? card(`${pref}_peso`, tipo, 'arroba_media', `${rotulo} — peso médio`, 'Arrobas por cabeça', 'decimal2', '@')
        : card(`${pref}_peso`, tipo, 'peso_medio_kg', `${rotulo} — peso médio`, 'Quilos por cabeça', 'decimal1', 'kg'),
      emArroba
        ? card(`${pref}_preco`, tipo, 'preco_arroba', `${rotulo} — preço`, 'Valor ÷ arrobas', 'moeda', 'R$/@')
        : card(`${pref}_preco`, tipo, 'preco_kg', `${rotulo} — preço`, 'Valor ÷ quilos', 'moeda', 'R$/kg'),
      card(`${pref}_valor`, tipo, 'valor_total', `${rotulo} — valor total`, 'Soma no recorte', 'moedaAbreviada'),
    ];
    return [
      /* E3 — NASCIMENTOS fica so com cabecas. Peso, preco e valor saem, e
         nao viram travessao: valor de nascimento nao e preco de mercado, e
         CUSTO DE PRODUCAO, e provavelmente nunca vai acender. Diferente de
         consumo e morte, que acendem quando o campo voltar ao formulario —
         mostrar travessao ali seria prometer dado que nao vem.
         As tres chaves seguem em `ORDEM_CARDS_MOV` e, sem indicador, viram
         celula VAZIA: e o que impede o grid de puxar Compras para esta
         linha e quebrar a leitura horizontal. */
      card('nasc_cab', 'nascimentos', 'cab', 'Nascimentos — cabeças', 'Quantidade no recorte', 'inteiro', 'cab'),
      ...linha('compra',   'compras',     'Compras',            false),
      ...linha('venda',    'vendas',      'Vendas em pé',       false),
      /* SO PARA A TABELA do resumo, fora de `ORDEM_CARDS_MOV` — a grade
         percorre a ordem e ignora chave que nao esta la, entao este card nao
         aparece entre os 25.
         O CARD de Vendas em Pe continua em R$/kg: venda em pe se negocia por
         quilo. No resumo executivo o mercado fala em ARROBA, e sao publicos
         diferentes lendo o mesmo fato. */
      card('venda_preco_arroba', 'vendas', 'preco_arroba', 'Preço médio venda', 'Valor ÷ arrobas', 'moeda', 'R$/@'),
      ...linha('abate',    'abates',      'Abates',             true),
      ...linha('consumo',  'consumos',    'Consumo / Doações',  false),
      /* E3 — a linha de Mortes deixa de ser cabecas/peso/preco/valor. Valor de
         morte nao existe hoje (o campo saiu do formulario), e mortalidade e o
         indicador que importa.
         DENOMINADOR: `saldoInicialAnual` do proprio hook — o rebanho de
         JANEIRO, nao o do mes nem a media. E' o MESMO denominador do
         `desfrute_pct`, pela mesma funcao (`calcDesfrute`), entao as duas
         taxas da tela sao comparaveis entre si. Sendo fixo no ano, o
         acumulado cresce e o numero se compara mes a mes. */
      card('morte_cab',   'mortes',          'cab', 'Mortes Global — cabeças',      'Quantidade no recorte', 'inteiro', 'cab'),
      card('morte_pct',   'mortalidade_pct', 'cab', 'Mortes Global — mortalidade',  'Mortes ÷ rebanho inicial do ano', 'decimal2', '%'),
      /* MAMOTES — `useMovimentacoesAgregadas` agrega por (mes, tipo), sem
         dimensao de CATEGORIA. Abrir por categoria e frente do PC-100, ja
         registrada. Os dois cards ocupam o lugar deles na grade em vez de
         deixar a quarta linha com dois vaos mudos. */
      { chave: 'morte_mamote_cab', titulo: 'Mortes Mamotes — cabeças', subtitulo: 'Quantidade no recorte',
        unidade: 'cab', formatoValor: 'inteiro' as const,
        serieMes: [], seriePeriodo: [], valorMes: null, valorPeriodo: null,
        deltaMes: null, deltaAno: null, deltaMeta: null,
        emConstrucao: 'o hook agrega por tipo, sem categoria' },
      { chave: 'morte_mamote_pct', titulo: 'Mortes Mamotes — mortalidade', subtitulo: 'Mortes ÷ rebanho inicial do ano',
        unidade: '%', formatoValor: 'decimal2' as const,
        serieMes: [], seriePeriodo: [], valorMes: null, valorPeriodo: null,
        deltaMes: null, deltaAno: null, deltaMeta: null,
        emConstrucao: 'o hook agrega por tipo, sem categoria' },
      ...linha('desfrute', 'desfrute',    'Desfrute',           true),
    ];
  }, [movAgg, mesNum]);

  /* Le do MESMO array que o modal consome, entao bloco e tabela nunca
     divergem: um numero, uma fonte. Segue o `viewMode` como os outros dois. */
  const valorFin = (chave: string): string => {
    const i = indicadoresFinanceiro.find(x => x.chave === chave);
    const v = isPeriodo ? i?.valorPeriodo : i?.valorMes;
    return fmtRAbreviado(v ?? null) ?? '—';
  };

  const arrobasHistoricoOficial: HistoricoPorModo =
    modalIndicador === 'arrobas' ? histZoot.arrobas : { mes: [], periodo: [] };

  const loadingArrobasHistorico = modalIndicador === 'arrobas' && histZoot.loading;

  // ── pesoMedio histórico oficial PC-100 (Opção B) ──
  const pesoMedioHistoricoOficial: HistoricoPorModo =
    modalIndicador === 'pesoMedio' ? histZoot.pesoMedio : { mes: [], periodo: [] };

  const loadingPesoMedioHistorico = modalIndicador === 'pesoMedio' && histZoot.loading;

  // ── gmd histórico oficial PC-100 (Opção B 3º indicador) ──
  const gmdHistoricoOficial: HistoricoPorModo =
    modalIndicador === 'gmd' ? histZoot.gmd : { mes: [], periodo: [] };

  const loadingGmdHistorico = modalIndicador === 'gmd' && histZoot.loading;

  // ── uaHa histórico oficial PC-100 (Opção B 4º indicador) ──
  const uaHaHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'uaHa') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.uaHaIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.uaHaIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.uaHaIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.uaHaIndicador, modo) },
        { ano: anoNum - 1, valor: pontoHist(dadosAnoAnt.uaHaIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(uaHaIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum,
    histArr5.uaHaIndicador, histArr4.uaHaIndicador, histArr3.uaHaIndicador,
    histArr2.uaHaIndicador, dadosAnoAnt.uaHaIndicador,
    uaHaIndicador,
  ]);

  const loadingUaHaHistorico = modalIndicador === 'uaHa' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // ── kgHa histórico oficial PC-100 (Opção B 5º indicador) ──
  const kgHaHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'kgHa') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.kgHaIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.kgHaIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.kgHaIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.kgHaIndicador, modo) },
        { ano: anoNum - 1, valor: pontoHist(dadosAnoAnt.kgHaIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(kgHaIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum,
    histArr5.kgHaIndicador, histArr4.kgHaIndicador, histArr3.kgHaIndicador,
    histArr2.kgHaIndicador, dadosAnoAnt.kgHaIndicador,
    kgHaIndicador,
  ]);

  const loadingKgHaHistorico = modalIndicador === 'kgHa' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // Helper: lê o ano-1 financeiro pela série oficial da chamada principal,
  // a mesma fonte usada pela linha cinza do gráfico superior.
  // Evita usar dadosAnoAnt para financeiros, pois essa chamada recebe sharedLanc
  // do ano atual e pode zerar indicadores financeiros do ano anterior.
  const safeSerieAnoAnt = (serie: number[] | undefined, idx: number): number | null => {
    const v = serie?.[idx];
    return v != null && !isNaN(v) ? v : null;
  };

  // ── custeioPec histórico oficial PC-100 (Opção B 7º indicador) ──
  const custeioPecHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'custeioPec') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.custeioPecIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.custeioPecIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.custeioPecIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.custeioPecIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(custeioPecIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(custeioPecIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.custeioPecIndicador, histArr4.custeioPecIndicador, histArr3.custeioPecIndicador,
    histArr2.custeioPecIndicador,
    custeioPecIndicador,
  ]);

  const loadingCusteioPecHistorico = modalIndicador === 'custeioPec' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // ── custoArr histórico oficial PC-100 (Opção B 8º indicador) ──
  const custoArrHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'custoArr') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.custoArrIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.custoArrIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.custoArrIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.custoArrIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(custoArrIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(custoArrIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.custoArrIndicador, histArr4.custoArrIndicador, histArr3.custoArrIndicador,
    histArr2.custoArrIndicador,
    custoArrIndicador,
  ]);

  const loadingCustoArrHistorico = modalIndicador === 'custoArr' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // ── custoCab histórico oficial PC-100 (Opção B 9º indicador) ──
  const custoCabHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'custoCab') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.custoCabIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.custoCabIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.custoCabIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.custoCabIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(custoCabIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(custoCabIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.custoCabIndicador, histArr4.custoCabIndicador, histArr3.custoCabIndicador,
    histArr2.custoCabIndicador,
    custoCabIndicador,
  ]);

  const loadingCustoCabHistorico = modalIndicador === 'custoCab' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // ── margemArr histórico oficial PC-100 (Opção B 10º indicador) ──
  const margemArrHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'margemArr') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.margemArrIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.margemArrIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.margemArrIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.margemArrIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(margemArrIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(margemArrIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.margemArrIndicador, histArr4.margemArrIndicador, histArr3.margemArrIndicador,
    histArr2.margemArrIndicador,
    margemArrIndicador,
  ]);

  const loadingMargemArrHistorico = modalIndicador === 'margemArr' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // precoArr migrado do hook legado useHistoricoIndicador para o histórico oficial PC-100.
  // Motivo: divergência matemática no histórico multi-ano causada por fórmula paralela
  // baseada em peso_vivo/30 para abates.

  // ── precoArr histórico oficial PC-100 (Opção B — 11º indicador) ──
  const precoArrHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'precoArr') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.precoArrIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.precoArrIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.precoArrIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.precoArrIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(precoArrIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(precoArrIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.precoArrIndicador, histArr4.precoArrIndicador, histArr3.precoArrIndicador,
    histArr2.precoArrIndicador,
    precoArrIndicador,
  ]);

  const loadingPrecoArrHistorico = modalIndicador === 'precoArr' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  // receitaPec migrado do hook legado useHistoricoIndicador para o historico oficial PC-100.
  // Motivo: divergencia matematica no historico multi-ano causada por formula paralela
  // que soma SUM(valor_total) direto de lancamentos (inclui consumo) em vez de
  // recPecComp classificado via financeiro_lancamentos_v2.

  // --- receitaPec historico oficial PC-100 (Opcao B - 12 indicador) ---
  const receitaPecHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'receitaPec') return { mes: [], periodo: [] };
    const linha = (modo: 'mes' | 'periodo') => [
        { ano: anoNum - 5, valor: pontoHist(histArr5.receitaPecIndicador, modo) },
        { ano: anoNum - 4, valor: pontoHist(histArr4.receitaPecIndicador, modo) },
        { ano: anoNum - 3, valor: pontoHist(histArr3.receitaPecIndicador, modo) },
        { ano: anoNum - 2, valor: pontoHist(histArr2.receitaPecIndicador, modo) },
        { ano: anoNum - 1, valor: antHist(receitaPecIndicador, modo) },
        { ano: anoNum,     valor: pontoHist(receitaPecIndicador, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.receitaPecIndicador, histArr4.receitaPecIndicador, histArr3.receitaPecIndicador,
    histArr2.receitaPecIndicador,
    receitaPecIndicador,
  ]);

  const loadingReceitaPecHistorico = modalIndicador === 'receitaPec' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  /* Media acumulada Jan->mes (1-based) da area, pela funcao unica da
     `eficienciaArea`. Ate 24/08 este corpo era escrito a mao e ignorava null e
     NaN mas NAO ZERO — o mesmo defeito corrigido no `mediaIgnorandoNulos` do
     Executivo no PR-FIX-MEDIA-ZERO. Area zero e' mes sem fechamento, nao area
     pequena: contando-a, o card da Home daria 4.253,74 ha em agosto contra
     4.861,42 do card do modal, dois numeros para a mesma area na mesma sessao.
     Os oito chamadores abaixo passam a ler a MESMA regra do modal e do PC-100. */
  const mediaAcumuladaArea = (porMes: ReadonlyArray<number | null> | null | undefined, ateMes: number): number | null => {
    if (!porMes || ateMes < 1 || ateMes > 12) return null;
    const v = mediaIgnorandoZero(porMes as (number | null)[], ateMes)[ateMes - 1];
    return Number.isFinite(v) ? v : null;
  };

  // ── Área Produtiva Pecuária — semântica estoque com média acumulada no período ──
  // Mesmo padrão de Cabeças/UA-ha/KG-ha: no mês usa valor pontual; no período usa
  // média Jan→mesAtual. Card e modal mostram labels/subtítulos dinâmicos.
  const isPeriodoArea = viewMode === 'periodo';

  // Valor do card e do topo do modal
  const areaProdutivaPecValor = useMemo<number | null>(() => {
    if (isPeriodoArea) return mediaAcumuladaArea(areaPecuariaRealPorMes, mesNum);
    return areaPecuariaRealMes ?? null;
  }, [isPeriodoArea, areaPecuariaRealPorMes, areaPecuariaRealMes, mesNum]);

  // Valor do mês anterior (para deltaMes) — média Jan→mes-1 no período, ou valor mes-1 no mês
  const areaProdutivaPecValorMesAnt = useMemo<number | null>(() => {
    if (mesNum <= 1) return null;
    if (isPeriodoArea) return mediaAcumuladaArea(areaPecuariaRealPorMes, mesNum - 1);
    return dadosMesAnt.areaPecuariaRealMes ?? null;
  }, [isPeriodoArea, areaPecuariaRealPorMes, dadosMesAnt.areaPecuariaRealMes, mesNum]);

  // Valor do ano anterior no mesmo mês/período
  const areaProdutivaPecValorAnoAnt = useMemo<number | null>(() => {
    if (isPeriodoArea) return mediaAcumuladaArea(dadosAnoAnt.areaPecuariaRealPorMes, mesNum);
    return dadosAnoAnt.areaPecuariaRealMes ?? null;
  }, [isPeriodoArea, dadosAnoAnt.areaPecuariaRealPorMes, dadosAnoAnt.areaPecuariaRealMes, mesNum]);

  // Valor da META no mesmo mês/período
  const areaProdutivaPecValorMeta = useMemo<number | null>(() => {
    if (isPeriodoArea) return mediaAcumuladaArea(areaPecuariaMetaPorMes, mesNum);
    return areaPecuariaMetaPorMes?.[mesNum - 1] ?? null;
  }, [isPeriodoArea, areaPecuariaMetaPorMes, mesNum]);

  // Séries para o gráfico superior do modal — 13 elementos, idx 0 = NaN, idx 1..12 = Jan..Dez
  // No período: cada idx m contém média Jan→m (curva monotônica suavizada).
  // No mês: cada idx m contém o valor pontual do mês m (mesmo que o histórico atual).
  const areaProdutivaPecSerieAno = useMemo<number[]>(() => {
    return Array.from({ length: 13 }, (_, i) => {
      if (i === 0) return NaN;
      const v = isPeriodoArea
        ? mediaAcumuladaArea(areaPecuariaRealPorMes, i)
        : (areaPecuariaRealPorMes?.[i - 1] ?? null);
      return v == null ? NaN : v;
    });
  }, [isPeriodoArea, areaPecuariaRealPorMes]);

  const areaProdutivaPecSerieAnoAnt = useMemo<number[] | undefined>(() => {
    const arr = dadosAnoAnt.areaPecuariaRealPorMes;
    if (!arr) return undefined;
    return Array.from({ length: 13 }, (_, i) => {
      if (i === 0) return NaN;
      const v = isPeriodoArea
        ? mediaAcumuladaArea(arr, i)
        : (arr[i - 1] ?? null);
      return v == null ? NaN : v;
    });
  }, [isPeriodoArea, dadosAnoAnt.areaPecuariaRealPorMes]);

  const areaProdutivaPecSerieMeta = useMemo<number[] | undefined>(() => {
    if (!areaPecuariaMetaPorMes) return undefined;
    return Array.from({ length: 13 }, (_, i) => {
      if (i === 0) return NaN;
      const v = isPeriodoArea
        ? mediaAcumuladaArea(areaPecuariaMetaPorMes, i)
        : (areaPecuariaMetaPorMes[i - 1] ?? null);
      return v == null ? NaN : v;
    });
  }, [isPeriodoArea, areaPecuariaMetaPorMes]);

  // Deltas — recomputados sobre o novo areaProdutivaPecValor (não mais lendo serieAno[mesNum] direto)
  const areaProdutivaPecDeltaMes = useMemo<number | null>(() => {
    const curr = areaProdutivaPecValor;
    const prev = areaProdutivaPecValorMesAnt;
    if (curr == null || prev == null || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }, [areaProdutivaPecValor, areaProdutivaPecValorMesAnt]);

  const areaProdutivaPecDeltaAno = useMemo<number | null>(() => {
    const curr = areaProdutivaPecValor;
    const ant = areaProdutivaPecValorAnoAnt;
    if (curr == null || ant == null || ant === 0) return null;
    return ((curr - ant) / ant) * 100;
  }, [areaProdutivaPecValor, areaProdutivaPecValorAnoAnt]);

  const areaProdutivaPecDeltaMeta = useMemo<number | null>(() => {
    const curr = areaProdutivaPecValor;
    const meta = areaProdutivaPecValorMeta;
    if (curr == null || meta == null || meta === 0) return null;
    return ((curr - meta) / meta) * 100;
  }, [areaProdutivaPecValor, areaProdutivaPecValorMeta]);

  // Histórico inferior — barras por ano: no período = média Jan→mes; no mês = valor do mes em cada ano
  const areaProdutivaPecHistoricoOficial = useMemo<HistoricoPorModo>(() => {
    if (modalIndicador !== 'areaProdutivaPec') return { mes: [], periodo: [] };
    /* A excecao: este memo nao le indicador, e sim `areaPecuariaRealPorMes`
       cru. `computar` passa a receber o MODO em vez de ler `isPeriodoArea`
       — mesma formula, sem o colapso. O ano corrente tambem: usava
       `areaProdutivaPecValor`, um useMemo ja colapsado, o que deixaria a
       ultima barra numa leitura e as anteriores na outra. */
    const computar = (porMes: ReadonlyArray<number | null> | null | undefined, valorMes: number | null | undefined, modo: 'mes' | 'periodo'): number | null => {
      if (modo === 'periodo') return mediaAcumuladaArea(porMes, mesNum);
      return valorMes ?? null;
    };
    const linha = (modo: 'mes' | 'periodo') => [
      { ano: anoNum - 5, valor: computar(histArr5.areaPecuariaRealPorMes, histArr5.areaPecuariaRealMes, modo) },
      { ano: anoNum - 4, valor: computar(histArr4.areaPecuariaRealPorMes, histArr4.areaPecuariaRealMes, modo) },
      { ano: anoNum - 3, valor: computar(histArr3.areaPecuariaRealPorMes, histArr3.areaPecuariaRealMes, modo) },
      { ano: anoNum - 2, valor: computar(histArr2.areaPecuariaRealPorMes, histArr2.areaPecuariaRealMes, modo) },
      { ano: anoNum - 1, valor: computar(dadosAnoAnt.areaPecuariaRealPorMes, dadosAnoAnt.areaPecuariaRealMes, modo) },
      { ano: anoNum,     valor: computar(areaPecuariaRealPorMes, areaPecuariaRealMes, modo) },
    ];
    return { mes: linha('mes'), periodo: linha('periodo') };
  }, [
    modalIndicador, anoNum, mesNum,
    histArr5.areaPecuariaRealPorMes, histArr5.areaPecuariaRealMes,
    histArr4.areaPecuariaRealPorMes, histArr4.areaPecuariaRealMes,
    histArr3.areaPecuariaRealPorMes, histArr3.areaPecuariaRealMes,
    histArr2.areaPecuariaRealPorMes, histArr2.areaPecuariaRealMes,
    dadosAnoAnt.areaPecuariaRealPorMes, dadosAnoAnt.areaPecuariaRealMes,
    areaPecuariaRealPorMes, areaPecuariaRealMes,
  ]);

  const loadingAreaProdutivaPecHistorico = modalIndicador === 'areaProdutivaPec' && (
    histArr5.loading || histArr4.loading ||
    histArr3.loading || histArr2.loading
  );

  const calcVar = (atual: number | null, base: number | null): number | null => {
    if (atual == null || base == null || base === 0) return null;
    return ((atual - base) / base) * 100;
  };

  const calcDeltaV = (atual: number | null | undefined, base: number | null | undefined): number | null => {
    if (atual == null || base == null || isNaN(atual) || isNaN(base) || base === 0) return null;
    return ((atual - base) / base) * 100;
  };

  // Só usar comparativo de mês anterior se existir mês anterior real
  // E só exibir comparativos zootécnicos se dados atuais estiverem completos
  const dadosZootCompletos = !loadingPainel && cabecas != null && cabecas > 0;

  const vsMes = (campo: number | null, baseCampo: number | null) =>
    dadosZootCompletos && mesAntNum != null ? calcVar(campo, baseCampo) : null;

  const vsAno = (campo: number | null, baseCampo: number | null) =>
    dadosZootCompletos ? calcVar(campo, baseCampo) : null;

  /* PR-HOME-AVISOS-LINGUAGEM-01 — o operador nao sabe o que e um "P1" nem um
     "snapshot": e vocabulario interno de governanca vazando para a tela, o mesmo
     defeito que PR-AREA-ERROS-MAPA-01 corrigiu do lado do banco.
     Os SETE estados de StatusValidacaoArea continuam distintos no tipo e na logica —
     so o TEXTO muda.
     'p1_fechado_sem_snap' e 'sem_snapshot' passam a dizer a MESMA coisa de proposito:
     a diferenca entre eles e de causa interna (o mes fechou mas a area nao foi
     materializada x nunca houve materializacao). Para quem le a tela o fato e um so —
     a area daquele mes nao existe — e a acao e a mesma. Os ramos ficam separados. */
  const msgArea = (s: StatusValidacaoArea): string | null => {
    if (s === 'ok' || s === 'carregando') return null;
    if (s === 'incompleto')          return `⚠ ${faltandoCount} fazenda${faltandoCount !== 1 ? 's' : ''} sem área do mês`;
    if (s === 'p1_aberto')           return '⚠ Mapa de pastos não fechado';
    if (s === 'p1_fechado_sem_snap') return '⚠ Área do mês não gerada';
    if (s === 'sem_snapshot')        return '⚠ Área do mês não gerada';
    if (s === 'sem_area')            return '⚠ Área não cadastrada';
    return null;
  };

  const mesAte = isPeriodo ? 12 : mesNum;
  const { meses: mesesFluxo, loading: loadingFluxo } = useFluxoCaixa(lancFinShared, rateioADM, anoNum, mesAte);
  const caixaValor = useMemo(() => {
    if (loadingFluxo || !mesesFluxo.length) return null;
    const sorted = [...mesesFluxo].sort((a, b) => a.mes - b.mes);
    return isPeriodo
      ? sorted[sorted.length - 1]?.saldoFinal ?? null
      : sorted.find(m => m.mes === mesNum)?.saldoFinal ?? null;
  }, [mesesFluxo, mesNum, isPeriodo, loadingFluxo]);

  // Comparativos do Caixa: vs mês anterior + vs mesmo mês ano anterior.
  // Em modo "período" não aplica delta (compara saldo acumulado Jan→mes; vs mês não é coerente).
  const { lancamentos: lancFinAnoAnt, rateioADM: rateioADMAnoAnt } = useFinanceiro({ ano: anoNum - 1 });
  const { meses: mesesFluxoAnoAnt, loading: loadingFluxoAnoAnt } = useFluxoCaixa(lancFinAnoAnt, rateioADMAnoAnt, anoNum - 1, 12);
  const caixaMesAnt = useMemo(() => {
    if (isPeriodo) return null;
    if (mesNum === 1) {
      if (loadingFluxoAnoAnt || !mesesFluxoAnoAnt.length) return null;
      return mesesFluxoAnoAnt.find(m => m.mes === 12)?.saldoFinal ?? null;
    }
    if (loadingFluxo || !mesesFluxo.length) return null;
    return mesesFluxo.find(m => m.mes === mesNum - 1)?.saldoFinal ?? null;
  }, [isPeriodo, mesNum, mesesFluxo, mesesFluxoAnoAnt, loadingFluxo, loadingFluxoAnoAnt]);
  const caixaAnoAnt = useMemo(() => {
    if (isPeriodo) return null;
    if (loadingFluxoAnoAnt || !mesesFluxoAnoAnt.length) return null;
    return mesesFluxoAnoAnt.find(m => m.mes === mesNum)?.saldoFinal ?? null;
  }, [isPeriodo, mesNum, mesesFluxoAnoAnt, loadingFluxoAnoAnt]);
  const deltaMesCaixa = useMemo(() => {
    if (caixaValor == null || caixaMesAnt == null || caixaMesAnt === 0) return null;
    return ((caixaValor - caixaMesAnt) / Math.abs(caixaMesAnt)) * 100;
  }, [caixaValor, caixaMesAnt]);
  const deltaAnoCaixa = useMemo(() => {
    if (caixaValor == null || caixaAnoAnt == null || caixaAnoAnt === 0) return null;
    return ((caixaValor - caixaAnoAnt) / Math.abs(caixaAnoAnt)) * 100;
  }, [caixaValor, caixaAnoAnt]);

  const {
    total: endividamentoTotal,
    alavancagem: finAlavancagem,
    pizzaVencimentos: finPizza,
    deltaMes: finEndDeltaMes,
    deltaAno: finEndDeltaAno,
    serieAno: finSerieAno,
    serieAnoAnt: finSerieAnoAnt,
    serieAlavancagemAno: finSerieAlavAno,
    serieAlavancagemAnoAnt: finSerieAlavAnoAnt,
    loading: loadingDivida,
  } = useEndividamentoAtual(anoNum);


  /* ── PR-FINANCEIRO-01 · o DRE de caixa ─────────────────────────────────
     FIACAO, nao construcao: os indicadores financeiros do PC-100 tem a MESMA
     forma dos zootecnicos, entao o mesmo `monta()` serve.
     `soma` existe porque a estrutura de Gabriel pede totais que o PC-100 nao
     expoe agregados — Receitas e a soma dos quatro escopos, Custeio a dos
     tres. Ela soma SERIE a serie e nao inventa meta: onde uma parcela nao
     tem meta, o total tambem nao tem. */
  const indicadoresFinanceiro = useMemo<IndicadorAtividade[]>(() => {
    type IndFin = { valor?: number | null; series?: SeriesPorModo; serieAno?: number[];
                    titulo?: string; subtitulo?: string } | null | undefined;
    const serie = (i: IndFin, modo: 'mes' | 'periodo', campo: 'ano' | 'meta') =>
      i?.series?.[modo]?.[campo] ?? (campo === 'ano' ? i?.serieAno : undefined);
    const ponto = (s: number[] | undefined) => {
      if (!s || s.length === 0) return null;
      const v = s.length >= 13 ? s[mesNum] : s[mesNum - 1];
      return v != null && !isNaN(v) ? v : null;
    };
    const somaSeries = (ss: Array<number[] | undefined>): number[] | undefined => {
      const vivas = ss.filter((x): x is number[] => !!x && x.length > 0);
      if (vivas.length === 0) return undefined;
      const n = Math.max(...vivas.map(v => v.length));
      return Array.from({ length: n }, (_, i) =>
        vivas.reduce((acc, v) => acc + (Number.isFinite(v[i]) ? v[i] : 0), 0));
    };
    const card = (chave: string, rotulo: string, partes: IndFin[]): IndicadorAtividade => {
      const sMes = somaSeries(partes.map(i => serie(i, 'mes', 'ano'))) ?? [];
      const sPer = somaSeries(partes.map(i => serie(i, 'periodo', 'ano'))) ?? [];
      /* ⚠ Meta so quando TODAS as parcelas tem, e "ter" e' TER VALOR — nao
         basta o array existir. A primeira versao checava `m.length > 0`, e
         uma parcela com meta de doze zeros passava: `Receitas` mostrava
         R$ 1,8 mi contra meta de R$ 14,0 mil (so a de "Outras") e a
         diferenca dava +12.937,2%.
         Um total com meta parcial compara o realizado INTEIRO contra a meta
         de um pedaco — e o numero grande parece precisao, nao ausencia. */
      // temValor nao distingue meta-zero-declarada de meta-ausente:
      // testa v !== 0 porque metasMes chega denso, com 0 no lugar de
      // mes sem meta. A distincao NULL vs zero teria de ser preservada
      // no builder da serie — o conserto real e la, nao aqui.
      const temValor = (m: number[] | undefined) =>
        !!m && m.some(v => Number.isFinite(v) && v !== 0);
      const metasMes = partes.map(i => serie(i, 'mes', 'meta'));
      const metasPer = partes.map(i => serie(i, 'periodo', 'meta'));
      /* `every([])` e' true: sem a guarda, um total sem filhos visiveis
         somaria meta 0 e a linha 737 dividiria por zero. Inalcancavel hoje;
         alcancavel assim que linhas zeradas passarem a ser escondidas. */
      const temTodas = metasMes.length > 0 && metasMes.every(temValor);
      return {
        chave, titulo: rotulo, subtitulo: '',
        formatoValor: 'moedaAbreviada',
        serieMes: sMes, seriePeriodo: sPer,
        serieMetaMes:     temTodas ? somaSeries(metasMes) : undefined,
        serieMetaPeriodo: temTodas ? somaSeries(metasPer) : undefined,
        valorMes: ponto(sMes), valorPeriodo: ponto(sPer),
        deltaMes: null, deltaAno: null, deltaMeta: null,
      };
    };
    const recPec = receitaPecCaixaIndicador, recAgri = receitaAgriIndicador;
    const recSilvi = receitaSilvicolaIndicador, recOutras = receitaOutrasIndicador;
    const cFixo = [custoFixoPecIndicador, custoFixoAgriIndicador, custoFixoSilviIndicador];
    const cVar  = [custoVariavelPecIndicador, custoVariavelAgriIndicador, custoVariavelSilviIndicador];
    const juros = [jurosPecIndicador, jurosAgriIndicador, jurosSilviIndicador];
    const invFaz = [investPecIndicador, investAgriIndicador, investSilviIndicador];
    return [
      card('fin_receitas',   'Receitas',      [recPec, recAgri, recSilvi, recOutras]),
      card('fin_rec_pec',    'Pecuária',      [recPec]),
      card('fin_rec_agri',   'Agrícola',      [recAgri]),
      card('fin_rec_silvi',  'Silvícola',     [recSilvi]),
      card('fin_rec_outras', 'Outras',        [recOutras]),
      card('fin_captacao',   'Captação',      [captacaoIndicador]),
      card('fin_desembolso', 'Desembolso operacional', [...cFixo, ...cVar, ...juros, ...invFaz, investBovinosIndicador]),
      card('fin_custeio',    'Custeio',       [...cFixo, ...cVar, ...juros]),
      card('fin_custo_fixo', 'Custo fixo',    cFixo),
      card('fin_custo_var',  'Custo variável', cVar),
      card('fin_juros',      'Juros de financiamento', juros),
      card('fin_investimento', 'Investimento', [...invFaz, investBovinosIndicador]),
      card('fin_inv_fazenda', 'Na fazenda',   invFaz),
      card('fin_inv_bovinos', 'Em bovinos',   [investBovinosIndicador]),
      card('fin_amortizacoes', 'Amortizações', [amortizacoesIndicador]),
      /* O INDICE VEM DO `useEndividamentoAtual`, ja montado nesta pagina — a
         formula (divida pecuaria / valor do rebanho) NAO e reescrita aqui.
         Serie propria em vez de soma: e uma razao, nao um agregado. */
      {
        chave: 'fin_indice', titulo: 'Índice de endividamento', subtitulo: '',
        unidade: '%', formatoValor: 'decimal1',
        serieMes: [], seriePeriodo: [],
        valorMes: finAlavancagem?.percentual ?? null,
        valorPeriodo: finAlavancagem?.percentual ?? null,
        deltaMes: null, deltaAno: null, deltaMeta: null,
      },
    ];
  }, [receitaPecCaixaIndicador, receitaAgriIndicador, receitaSilvicolaIndicador,
      receitaOutrasIndicador, captacaoIndicador,
      custoFixoPecIndicador, custoFixoAgriIndicador, custoFixoSilviIndicador,
      custoVariavelPecIndicador, custoVariavelAgriIndicador, custoVariavelSilviIndicador,
      jurosPecIndicador, jurosAgriIndicador, jurosSilviIndicador,
      investPecIndicador, investAgriIndicador, investSilviIndicador,
      investBovinosIndicador, amortizacoesIndicador, finAlavancagem, mesNum]);
  const endividamentoValor = loadingDivida ? null : endividamentoTotal;

  // Séries mensais para o modal histórico do Caixa (saldoFinal Jan→Dez).
  const caixaSerieAno = useMemo(() => {
    const arr = new Array(12).fill(null) as (number | null)[];
    if (!loadingFluxo && mesesFluxo.length) {
      for (const m of mesesFluxo) {
        if (m.mes >= 1 && m.mes <= 12) arr[m.mes - 1] = m.saldoFinal;
      }
    }
    return arr;
  }, [mesesFluxo, loadingFluxo]);
  const caixaSerieAnoAnt = useMemo(() => {
    const arr = new Array(12).fill(null) as (number | null)[];
    if (!loadingFluxoAnoAnt && mesesFluxoAnoAnt.length) {
      for (const m of mesesFluxoAnoAnt) {
        if (m.mes >= 1 && m.mes <= 12) arr[m.mes - 1] = m.saldoFinal;
      }
    }
    return arr;
  }, [mesesFluxoAnoAnt, loadingFluxoAnoAnt]);

  const resultadoTone = resultado == null ? 'default' : resultado >= 0 ? 'positive' : 'negative';

  return (
    <div className="px-4 pb-5 max-w-7xl">
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/40 shadow-sm mb-2">
        <h2 className="text-sm font-semibold text-foreground">
          {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isGlobal ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
        </p>
        <StatusFechamentoBanda
          status={statusFechamento}
          isGlobal={isGlobal}
          loading={loadingStatusFechamento}
          mesLabel={ml}
          onIrPara={onIrPara}
        />
        <ReguaMeses
          celulas={gradeEscopo}
          mesSelecionado={mesNum}
          ano={anoNum}
          loading={loadingGradeAno}
          erro={erroGradeAno}
          onMesChange={onMesChange}
          meses={MES_ABREV}
        />
        {onViewModeChange && (
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => onViewModeChange('mes')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                !isPeriodo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              No mês
            </button>
            <button
              onClick={() => onViewModeChange('periodo')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                isPeriodo
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
              }`}
            >
              No período
            </button>
          </div>
        )}
      </div>
      <div className="space-y-4">


      {/* PRIMEIRA LINHA: Area e Caixa sao filhos DIRETOS do grid, entao a linha
          alinha a altura dos dois. Decisao explicita (Gabriel, 21/08), ciente de
          que o card mais baixo ganha espaco vazio embaixo — e o oposto do que
          motivou e948a653. Com as duas tabelas dentro do card de Area, ele tende
          a ser o mais alto e o branco cai no Caixa.
          Os DEMAIS blocos seguem em duas colunas empilhadas, logo abaixo. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">

        <div className="lg:col-span-3">
        {/* col-span-2 porque o miolo do SectionBlock e uma grade de DUAS colunas,
            feita para MetricTile. Sem isso a barra ocupava meia largura e o rodape
            subia para a coluna da direita, ao lado dos numeros em vez de abaixo. */}
        <SectionBlock
          title={isPeriodo ? 'Área média no período' : 'Área no mês'}
          subtitle="como a terra está dividida e onde a operação está"
        >
          <div className="col-span-2 space-y-3">
            {(() => {
              /* Duas classes por parte: `cor` (bg-*) para o ponto da legenda e
                 `stroke` (stroke-*) para a fatia do donut. Tailwind v3 gera
                 stroke-* a partir das mesmas cores do tema, entao os quatro
                 tokens do design system valem nas duas formas. */
              /* Legenda mostra as QUATRO familias sempre, mesmo zeradas: o operador
                 compara clientes e fazendas entre si, e linha que some muda a posicao
                 das outras. Zero e informacao. */
              const partesLegenda = [
                { label: 'Pecuária',    valor: areaPec   ?? 0, cor: 'bg-success', stroke: 'stroke-success' },
                { label: 'Agricultura', valor: areaAgri  ?? 0, cor: 'bg-cta', stroke: 'stroke-cta' },
                { label: 'Silvicultura',valor: areaSilvi ?? 0, cor: 'bg-primary', stroke: 'stroke-primary' },
                { label: 'Reserva, APP, benf.',
                  valor: (areaReserva ?? 0) + (areaApp ?? 0) + (areaBenf ?? 0) + (areaOutras ?? 0),
                  cor: 'bg-muted-foreground/40', stroke: 'stroke-muted-foreground/40' },
              ];
              const soma = partesLegenda.reduce((s, p) => s + p.valor, 0);
              if (soma <= 0) return <p className="text-[11px] text-muted-foreground">—</p>;

              /* Donut em SVG puro: sem dependencia nova, sem recharts. Circunferencia
                 do raio 34 = 213.63; cada fatia usa stroke-dasharray + offset. */
              const R = 34, C = 2 * Math.PI * R;
              let acc = 0;
              /* Donut so desenha fatia com valor: arco de comprimento zero nao
                 renderiza e ainda consome offset. */
              const fatias = partesLegenda.filter(p => p.valor > 0).map(p => {
                const frac = p.valor / soma;
                const el = { ...p, dash: frac * C, offset: -acc * C };
                acc += frac;
                return el;
              });

              return (
                <div className="flex items-start gap-4">
                  {/* Donut maior: coluna propria a esquerda. O viewBox e a
                      espessura sao os mesmos — so a caixa renderizada cresce,
                      entao a proporcao do anel nao muda. */}
                  <svg viewBox="0 0 80 80" className="h-28 w-28 shrink-0 -rotate-90">
                    {fatias.map(f => (
                      <circle key={f.label} cx="40" cy="40" r={R} fill="none"
                        strokeWidth="12" className={`${f.stroke} cursor-default`}
                        strokeDasharray={`${f.dash} ${C - f.dash}`}
                        strokeDashoffset={f.offset}
                        onMouseEnter={() => setFatiaHover(f.label)}
                        onMouseLeave={() => setFatiaHover(null)} />
                    ))}
                    {/* Miolo do donut. O <svg> tem -rotate-90: sem o <g> que
                        desfaz, o texto sairia deitado. Sem hover o miolo fica
                        VAZIO — nao mostrar total fixo. */}
                    {fatiaHover && (() => {
                      const f = fatias.find(x => x.label === fatiaHover);
                      if (!f) return null;
                      /* Rotulo curto: o miolo comporta ~12 caracteres por linha.
                         "Reserva, APP, benf." nao cabe — so essa precisa abreviar. */
                      const curto = f.label.startsWith('Reserva') ? 'Reserva' : f.label;
                      return (
                        <g transform="rotate(90 40 40)">
                          <text x="40" y="38" textAnchor="middle"
                                className="fill-foreground text-[7px] font-medium">
                            {curto}
                          </text>
                          <text x="40" y="47" textAnchor="middle"
                                className="fill-muted-foreground text-[8px] tabular-nums">
                            {((f.valor / soma) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
                          </text>
                        </g>
                      );
                    })()}
                  </svg>
                  <div className="min-w-0">
                    {/* Grid de 3 colunas com largura de conteudo: rotulo, valor e
                        percentual alinham entre si, e o rotulo NAO e esticado —
                        e o que aproxima "Pecuaria" do numero. Valor e % em
                        <span> separados: juntos, a largura variavel do %
                        deslocava o numero. */}
                    {/* text-[10px]: os rotulos de familia competiam em peso com os
                        numeros da propria legenda. O bloco inteiro desce um degrau —
                        rotulo, valor e % juntos, para nao desalinhar a grade. */}
                    <div className="grid grid-cols-[auto_auto_auto] justify-start gap-x-3 gap-y-0.5 text-[9px]">
                      {partesLegenda.map(f => (
                        <div key={f.label} className="contents">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${f.cor}`} />
                            {f.label}
                          </span>
                          {/* Formatacao direta, NAO fmtHaInt: ele devolve "—" para zero,
                              e aqui zero e familia sem area, nao ausencia de fechamento.
                              fmtHaInt fica intacto — outros blocos dependem dele. */}
                          <span className="tabular-nums text-right text-foreground">
                            {f.valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} <span className="text-muted-foreground font-normal">ha</span>
                          </span>
                          <span className="tabular-nums text-right text-muted-foreground">
                            {((f.valor / soma) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
                          </span>
                        </div>
                      ))}
                      {/* Total e a MATRICULA (areaTotal), nao `soma`: quando ha area alem
                          da matricula, `soma` e maior — e a linha de excedente abaixo
                          explica a diferenca. Duas formas de dizer a mesma coisa. */}
                      <div className="contents">
                        <span className="flex items-center gap-1.5 pt-1 font-medium text-foreground border-t border-border">
                          <span className="inline-block h-2 w-2 shrink-0" />
                          Área Total
                        </span>
                        <span className="tabular-nums text-right pt-1 font-medium text-foreground border-t border-border">
                          {/* Sem sufixo quando o valor nao existe: fmtHaInt devolve "—" para
                              null E para zero, e "— ha" nao quer dizer nada. */}
                          {areaTotal == null || areaTotal === 0
                            ? '—'
                            : <>{fmtHaInt(areaTotal)} <span className="text-muted-foreground font-normal">ha</span></>}
                        </span>
                        <span className="tabular-nums text-right pt-1 font-medium text-muted-foreground border-t border-border">
                          {areaTotal == null ? '—' : '100%'}
                        </span>
                      </div>
                      {/* Produtiva NAO e familia: e o subconjunto pec+agri+silvi. Vem depois
                          do Total de proposito — primeiro quanto a fazenda tem, depois quanto
                          disso produz. Fora do donut e de partesLegenda.

                          Base do percentual e areaTotal (matricula), NAO `soma`. Com `soma`,
                          Produtiva seria subconjunto de si mesma e nunca passaria de 100% —
                          escondendo o caso de terra arrendada de terceiro. Mesma base da
                          linha "% da area" da tabela por fazenda. PODE ultrapassar 100%:
                          nao truncar. */}
                      {/* Cinza leve, ao contrario do Total: o numero grande a direita
                          passou a ser o destaque de Area Produtiva, e dois destaques
                          para o mesmo dado competiriam. Aqui ela vira conferencia. */}
                      <div className="contents">
                        <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
                          <span className="inline-block h-2 w-2 shrink-0" />
                          Área Produtiva
                        </span>
                        <span className="tabular-nums text-right font-normal text-muted-foreground">
                          {areaProdutiva == null || areaProdutiva === 0
                            ? '—'
                            : <>{fmtHaInt(areaProdutiva)} <span className="text-muted-foreground font-normal">ha</span></>}
                        </span>
                        <span className="tabular-nums text-right font-normal text-muted-foreground">
                          {(areaProdutiva == null || areaTotal == null || areaTotal <= 0)
                            ? '—'
                            : `${((areaProdutiva / areaTotal) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                        </span>
                      </div>
                    </div>
                    {/* Excecao acompanha a legenda, no MESMO tamanho de fonte dela, e
                        em fmtHa (2 casas): valor de excecao — a precisao importa. */}
                    {areaExcedente != null && (
                      <p className="text-[10px] text-warning pt-1">
                        Área além da matrícula: {fmtHa(areaExcedente)}
                      </p>
                    )}
                  </div>
                  {/* AJUSTE 3 — o espaco a direita da legenda estava vazio: o grid
                      e' `justify-start` e a coluna nao usava a largura toda. O
                      destaque ocupa esse vao e da a Area Produtiva a leitura de um
                      olhar, que era o que a linha da legenda nao entregava.
                      ⚠ A expressao do percentual e' COPIA LITERAL da linha de Area
                      Produtiva acima — mesma base (`areaTotal`, a matricula, nao
                      `soma`) e mesmo arredondamento. Nao extrair para variavel: o
                      valor de manter as duas identicas esta em serem visivelmente a
                      mesma conta, e um helper esconderia uma divergencia futura. */}
                  <div className="flex-1 self-center flex flex-col items-center gap-0.5">
                    <span className="text-2xl font-semibold tabular-nums text-foreground leading-none">
                      {areaProdutiva == null || areaProdutiva === 0
                        ? '—'
                        : <>{fmtHaInt(areaProdutiva)} <span className="text-sm font-normal text-muted-foreground">ha</span></>}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70">Área Produtiva</span>
                    <span className="text-base font-semibold tabular-nums text-foreground leading-none">
                      {(areaProdutiva == null || areaTotal == null || areaTotal <= 0)
                        ? '—'
                        : `${((areaProdutiva / areaTotal) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Metade 2: a mesma fonte, o mesmo mes, o mesmo viewMode — aberta por
                fazenda. Era card proprio; a divisao entre os dois nao correspondia a
                nada. So no Global: em fazenda especifica seria uma linha repetindo a
                legenda acima. */}
            {isGlobal && areaPorFazendaMes.length > 0 && (
              <div className="pt-1 border-t border-border">
                <p className="text-[10px] font-medium text-muted-foreground pb-1">
                  Distribuição de áreas por fazenda
                </p>
                {/* col-span-2 pelo mesmo motivo do bloco acima: a tabela precisa da
                    largura inteira do miolo, que e uma grade de duas colunas. */}
                <div className="col-span-2">
                  {/* `leading-tight` e o que baixa a altura da linha; `py-0.5` ja
                      e o minimo, e reduzir a zero colaria o texto na borda. */}
                  <table className="w-full text-[10px] leading-tight tabular-nums">
                    <thead>
                      {/* PADRAO DE TABELA DO SISTEMA: cabecalho e Total em bg-primary
                          com texto primary-foreground, mesmos TOKENS de
                          .financeiro-table-head. Nao usar aquela classe: ela traz
                          position:sticky e z-index, que aqui nao fazem sentido.
                          Unidade nas CELULAS; a linha "% da area" nao ganha sufixo. */}
                      <tr className="bg-primary text-primary-foreground">
                        <th className="text-left font-normal px-1.5 py-1">Fazenda</th>
                        <th className="text-right px-1.5 py-1 font-medium">Total</th>
                        <th className="text-right px-1.5 py-1 font-medium">Produtiva</th>
                        <th className="text-right font-normal px-1.5 py-1">Pec.</th>
                        <th className="text-right font-normal px-1.5 py-1">Agri.</th>
                        <th className="text-right font-normal px-1.5 py-1">Silvi.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {areaPorFazendaMes.map(f => {
                        const excede = f.area_produtiva_ha > f.area_total_ha;
                        /* AJUSTE 5 — zebra mais forte que o A10 (`muted/30`) por
                           decisao explicita de Gabriel: com `leading-tight` as linhas
                           ficaram juntas e a alternancia sumia. DIVERGE do padrao —
                           ver o relatorio do PR sobre a outra tabela desta tela. */
                        return (
                          <tr key={f.fazenda_id} className="odd:bg-muted/60 even:bg-card">
                            <td className="text-left px-1.5 py-0.5 truncate max-w-[140px]">{nomeFazendaPorId[f.fazenda_id] ?? 'Fazenda'}</td>
                            <td className="text-right px-1.5 py-0.5 font-medium text-foreground">
                              {f.area_total_ha == null || f.area_total_ha === 0
                                ? '—'
                                : <>{fmtHaInt(f.area_total_ha)} <span className="text-muted-foreground font-normal">ha</span></>}
                            </td>
                            <td
                              className={`text-right px-1.5 py-0.5 font-medium${excede ? ' text-warning' : ' text-foreground'}`}
                              title={excede ? `Área além da matrícula: ${fmtHa(f.area_produtiva_ha - f.area_total_ha)}` : undefined}
                            >
                              {f.area_produtiva_ha == null || f.area_produtiva_ha === 0
                                ? '—'
                                : <>{fmtHaInt(f.area_produtiva_ha)} <span className="text-muted-foreground font-normal">ha</span></>}
                            </td>
                            <td className="text-right px-1.5 py-0.5 text-muted-foreground">
                              {f.area_pecuaria_ha == null || f.area_pecuaria_ha === 0
                                ? '—'
                                : <>{fmtHaInt(f.area_pecuaria_ha)} <span className="text-muted-foreground font-normal">ha</span></>}
                            </td>
                            <td className="text-right px-1.5 py-0.5 text-muted-foreground">
                              {f.area_agricultura_ha == null || f.area_agricultura_ha === 0
                                ? '—'
                                : <>{fmtHaInt(f.area_agricultura_ha)} <span className="text-muted-foreground font-normal">ha</span></>}
                            </td>
                            <td className="text-right px-1.5 py-0.5 text-muted-foreground">
                              {f.area_silvicultura_ha == null || f.area_silvicultura_ha === 0
                                ? '—'
                                : <>{fmtHaInt(f.area_silvicultura_ha)} <span className="text-muted-foreground font-normal">ha</span></>}
                            </td>
                          </tr>
                        );
                      })}
                      {/* A linha Total sai dos agregados do bloco acima, NAO da soma das
                          linhas: se as duas fontes divergirem, isso precisa APARECER — uma
                          soma das proprias linhas fecharia sempre e esconderia a divergencia. */}
                      <tr className="bg-primary text-primary-foreground font-medium">
                        <td className="text-left px-1.5 py-0.5">Total</td>
                        <td className="text-right px-1.5 py-0.5">
                          {areaTotal == null || areaTotal === 0
                            ? '—'
                            : <>{fmtHaInt(areaTotal)} <span className="text-primary-foreground/70 font-normal">ha</span></>}
                        </td>
                        <td className="text-right px-1.5 py-0.5">
                          {areaProdutiva == null || areaProdutiva === 0
                            ? '—'
                            : <>{fmtHaInt(areaProdutiva)} <span className="text-primary-foreground/70 font-normal">ha</span></>}
                        </td>
                        <td className="text-right px-1.5 py-0.5">
                          {areaPec == null || areaPec === 0
                            ? '—'
                            : <>{fmtHaInt(areaPec)} <span className="text-primary-foreground/70 font-normal">ha</span></>}
                        </td>
                        <td className="text-right px-1.5 py-0.5">
                          {areaAgri == null || areaAgri === 0
                            ? '—'
                            : <>{fmtHaInt(areaAgri)} <span className="text-primary-foreground/70 font-normal">ha</span></>}
                        </td>
                        <td className="text-right px-1.5 py-0.5">
                          {areaSilvi == null || areaSilvi === 0
                            ? '—'
                            : <>{fmtHaInt(areaSilvi)} <span className="text-primary-foreground/70 font-normal">ha</span></>}
                        </td>
                      </tr>
                      {/* Bases DIFERENTES por coluna: Produtiva sobre o total da matricula,
                          as tres familias sobre a produtiva. Por isso Produtiva pode passar
                          de 100% e as familias somam ~100% entre si. */}
                      <tr className="text-[9px] text-muted-foreground">
                        <td className="text-left px-1.5 pb-1">% da área</td>
                        <td className="text-right px-1.5">100%</td>
                        <td className="text-right px-1.5">{pctDe(areaProdutiva, areaTotal)}</td>
                        <td className="text-right px-1.5">{pctDe(areaPec,   areaProdutiva)}</td>
                        <td className="text-right px-1.5">{pctDe(areaAgri,  areaProdutiva)}</td>
                        <td className="text-right px-1.5">{pctDe(areaSilvi, areaProdutiva)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </SectionBlock>
        </div>

        <div className="lg:col-span-2">
        {/* NAO recebe naoFechado: caixa nao depende de fechamento de rebanho.
            O conteudo vai num col-span-2 porque o miolo do SectionBlock e uma grade de
            DUAS colunas, feita para MetricTile — e aqui e uma LISTA de linhas. */}
        <SectionBlock
          title={isPeriodo ? 'Caixa no período' : 'Caixa no mês'}
          subtitle="entradas e saídas"
        >
          {/* -mt-1 puxa a primeira linha para cima, encostando no titulo. Aplicado
             SO aqui: o respiro vem do SectionBlock, que e usado por todos os blocos
             e nao pode ser alterado por causa de um. */}
          <div className="col-span-2 -mt-1 space-y-0.5">
            {/* Alternancia Resumido/Macro. Estado NAO persiste — trocar de mes ou de
                viewMode remonta o card em 'resumido'. */}
            <div className="flex justify-end gap-1 pb-1">
              {(['resumido', 'macro'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModoCaixa(m)}
                  className={`rounded px-1.5 py-0.5 text-[9px] capitalize transition-colors ${
                    modoCaixa === m
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <LinhaCaixa label={rotuloSaldoInicial} valor={saldoInicial} tipo="subtotal" />

            <div className="pt-1 space-y-0.5">
              <LinhaCaixa label="Entradas" valor={totalEntradas} tipo="total"
                corValor="text-emerald-600" />
              {resumido
                ? entradasResumo.map(l => (
                    <LinhaCaixaClicavel key={l.label} label={l.label} valor={l.valor}
                      onClick={() => setLinhaCaixaModal(l.label)} />
                  ))
                : entradasVisiveis.map(l => (
                    <LinhaCaixa key={l.label} label={l.label} valor={l.valor} />
                  ))}
              {(() => {
                /* SEIS parcelas, nao quatro: `classificacao.ts:653` documenta que
                   `isEntradaFinanceira` e' particionada por pec + agri + silvi +
                   aporte + retorno + semEscopo. A soma antiga ignorava as duas do
                   meio e o aviso amarelo acusava divergencia de R$ 904.898 que era
                   da PROPRIA verificacao, nao do dado. */
                const somaCaptacao =
                  (captacaoPecIndicador?.valor ?? 0) +
                  (captacaoAgriIndicador?.valor ?? 0) +
                  (captacaoSilviIndicador?.valor ?? 0) +
                  (aportePessoalIndicador?.valor ?? 0) +
                  (retornoEmprestimosIndicador?.valor ?? 0) +
                  (captacaoSemEscopoIndicador?.valor ?? 0);
                const total = captacaoIndicador?.valor ?? 0;
                /* Os quatro predicates PARTICIONAM isEntradaFinanceira: a soma tem que
                   bater com o total. Se nao bater, subcentro novo escapou do mapa e o
                   dinheiro esta sendo contado a menos ou a mais. MOSTRAR, nao forcar. */
                return Math.abs(somaCaptacao - total) > 1 ? (
                  <div className="text-[9px] text-warning pt-1">
                    Captação: divergência de {fmtR(somaCaptacao - total)} entre as partes e o total
                  </div>
                ) : null;
              })()}
            </div>

            <div className="pt-1 space-y-0.5">
              <LinhaCaixa label="Saídas" valor={totalSaidas} tipo="total"
                corValor="text-red-500" />
              {resumido
                ? saidasResumo.map(l => (
                    <LinhaCaixaClicavel key={l.label} label={l.label} valor={l.valor}
                      onClick={() => setLinhaCaixaModal(l.label)} />
                  ))
                : saidasGruposVisiveis.map((g, i) => (
                    <div key={g.familia} className="space-y-0.5">
                      {i > 0 && <div className="h-px bg-border/50 my-1" />}
                      {g.linhas.map(l => (
                        <LinhaCaixa key={l.label} label={l.label} valor={l.valor} />
                      ))}
                    </div>
                  ))}
            </div>

            <div className="pt-1 border-t border-border/40">
              <LinhaCaixa label={rotuloSaldoFinal} valor={saldoFinal} tipo="total" />
            </div>

            {mostrarDifCaixa && (
              <p className="text-[10px] text-amber-700">
                {/* O aviso nunca falou de conciliacao BANCARIA: ele diz que
                    saldoInicial + entradas − saidas ≠ saldoFinal. O rotulo antigo
                    mandava o operador procurar defeito no extrato. */}
                Diferença de {fmtR(difCaixa)} — entradas e saídas não explicam a variação do saldo
              </p>
            )}

            <p className="text-[9px] text-muted-foreground pt-1">
              Regime de caixa, ano civil. Transferências entre contas não entram.
            </p>
          </div>
        </SectionBlock>
        </div>

        <div className="lg:col-span-5">
          <p className="text-xs font-medium text-foreground pb-1.5">
            Fechamento Pecuária
          </p>
          <div className="space-y-1.5">
      {/* ── PR-ATIVIDADE-01 ─────────────────────────────────────────────
          O bloco NASCEU abaixo de tudo que existe, empilhado. Desde
          PR-VG-FECHAMENTO-PEC-01 os tres vivem DENTRO do grid, agrupados
          sob o titulo "Fechamento Pecuaria" logo depois de Area e Caixa:
          respondem pela mesma pecuaria que aquelas duas acabaram de
          descrever, e alcanca-los exigia rolar a Home inteira.
          NADA foi removido da Home: Gabriel decidiu comparar os dois
          desenhos lado a lado e so depois apagar os dezoito tiles. A
          divida de ter dois caminhos para a mesma informacao e deliberada
          e TEMPORARIA — o PR que remove os tiles e parte do plano, nao
          esquecimento.
          Os valores seguem o `viewMode` da tela, como os tiles ao lado: um
          segundo controle para a mesma pergunta faria a Visao Geral falar
          com duas vozes. */}
      <div>
        <BlocoAtividade
          titulo="Zootécnico"
          subtitulo="o que a fazenda tem e produz"
          icone={BarChart3}
          loading={loadingPainel}
          onClick={() => setModalAtividade('zootecnico')}
          metricas={[
            { rotulo: 'Rebanho',      valor: (fmtN(cabecasIndicador?.valor ?? null) ?? '—') + ' cab',
              delta: cabecasIndicador?.deltaMeta ?? null, deltaRotulo: 'vs meta' },
            { rotulo: '@ produzidas', valor: (fmtN(arrobasIndicador?.valor ?? null, 1) ?? '—') + ' @',
              delta: arrobasIndicador?.deltaMeta ?? null, deltaRotulo: 'vs meta' },
            { rotulo: 'GMD',          valor: (fmtN(gmdIndicador?.valor ?? null, 3) ?? '—') + ' kg',
              delta: gmdIndicador?.deltaMeta ?? null, deltaRotulo: 'vs meta' },
            { rotulo: 'Lotação',      valor: (fmtN(uaHaIndicador?.valor ?? null, 2) ?? '—') + ' UA/ha',
              delta: uaHaIndicador?.deltaMeta ?? null, deltaRotulo: 'vs meta' },
          ]}
        />
      </div>

      {/* E6 — Movimentacoes. Mesma casca do Zootecnico: `BlocoAtividade` nao
          calcula nada, recebe metrica pronta. As quatro sao em CABECAS, a
          unidade que responde "o que entrou e saiu" sem exigir conversao. */}
      <div>
        <BlocoAtividade
          titulo="Movimentações"
          subtitulo="o que entrou e saiu do rebanho"
          icone={ArrowLeftRight}
          loading={movAgg.loading}
          onClick={() => setModalAtividade('movimentacoes')}
          metricas={[
            { rotulo: 'Nascimentos', valor: (fmtN(movAgg.porTipo.nascimentos?.mesAtual?.cab ?? null) ?? '—') + ' cab',
              delta: deltaMetaMov('nascimentos'), deltaRotulo: 'vs meta' },
            { rotulo: 'Compras',     valor: (fmtN(movAgg.porTipo.compras?.mesAtual?.cab ?? null) ?? '—') + ' cab',
              delta: deltaMetaMov('compras'), deltaRotulo: 'vs meta' },
            { rotulo: 'Desfrute',    valor: (fmtN(movAgg.porTipo.desfrute?.mesAtual?.cab ?? null) ?? '—') + ' cab',
              delta: deltaMetaMov('desfrute'), deltaRotulo: 'vs meta' },
            /* Morte e o unico onde subir e RUIM. */
            { rotulo: 'Mortes',      valor: (fmtN(movAgg.porTipo.mortes?.mesAtual?.cab ?? null) ?? '—') + ' cab',
              delta: deltaMetaMov('mortes'), deltaRotulo: 'vs meta', inverseDelta: true },
          ]}
        />
      </div>

      {/* E6 — Financeiro. Terceiro bloco, mesma casca dos dois anteriores.
          ⚠ NAO confundir com o chip "Financeiro (em construção)" da faixa de
          status: aquele e o P3 dos pilares de fechamento, declarado
          nao_implementado, e continua onde esta. */}
      <div>
        <BlocoAtividade
          titulo="Financeiro"
          subtitulo="o dinheiro que entrou e saiu"
          icone={Wallet}
          loading={loadingPainel}
          onClick={() => setModalAtividade('financeiro')}
          metricas={[
            { rotulo: 'Receitas',     valor: valorFin('fin_receitas'),    delta: null },
            { rotulo: 'Desembolso',   valor: valorFin('fin_desembolso'),  delta: null, inverseDelta: true },
            { rotulo: 'Captação',     valor: valorFin('fin_captacao'),    delta: null },
            { rotulo: 'Amortizações', valor: valorFin('fin_amortizacoes'), delta: null },
          ]}
        />
      </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
        {/* Bloco proprio, PRIMEIRO item do wrapper da esquerda — nao filho direto
            do grid: Area e Caixa sao os unicos diretos, para alinharem a altura.
            Saiu do card de Area porque responde outra pergunta: la e como a terra
            se divide, aqui e o que o rebanho produziu nela.
            O TITULO diz o MODO: as colunas mudam de significado entre um e outro
            (rebanho no periodo e media de medias mensais; no mes, saldo final),
            e "Pecuária" sozinho nao dizia qual leitura estava na tela. */}
        {isGlobal && linhasProdutivas.length > 0 && (
          <SectionBlock title={isPeriodo ? 'Pecuária no período' : 'Pecuária no mês'} subtitle="produção por fazenda">
            <div className="col-span-2">
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                {/* Mesmo PADRAO da tabela de area: bg-primary + primary-foreground. */}
                <tr className="bg-primary text-primary-foreground">
                  <th className="text-left font-normal px-1.5 py-1">Fazenda</th>
                  <th className="text-right px-1.5 py-1 font-medium">Área pec. (ha)</th>
                  <th className="text-right px-1.5 py-1 font-medium">Rebanho (cab)</th>
                  <th className="text-right font-normal px-1.5 py-1 w-[64px]">Lot. (UA/ha)</th>
                  <th className="text-right font-normal px-1.5 py-1">GMD</th>
                  <th className="text-right font-normal px-1.5 py-1">@ prod.</th>
                  {/* "(@)" no cabecalho: havia DOIS desfrutes com o mesmo nome na
                      tela — esta coluna em arrobas e o tile em cabecas. */}
                  <th className="text-right font-normal px-1.5 py-1">Desfrute (@)</th>
                </tr>
              </thead>
              <tbody>
                {linhasProdutivas.map(l => (
                  <tr key={l.fazenda_id} className="odd:bg-muted/30 even:bg-card">
                    <td className="text-left px-1.5 py-0.5 truncate max-w-[140px]">{nomeFazendaPorId[l.fazenda_id] ?? 'Fazenda'}</td>
                    {/* Sufixo no idioma da legenda de area (:1763): unidade em
                        text-muted-foreground font-normal, ao lado do numero. O
                        travessao NAO leva sufixo — "— ha" afirmaria unidade sobre
                        dado ausente. Dai o ternario em vez de sufixo solto. */}
                    <td className="text-right px-1.5 py-0.5 font-medium text-foreground">
                      {fmtHaInt(l.areaPec) === '—'
                        ? '—'
                        : <>{fmtHaInt(l.areaPec)} <span className="text-muted-foreground font-normal">ha</span></>}
                    </td>
                    <td className="text-right px-1.5 py-0.5 font-medium text-foreground">
                      {fmtN(l.cabecas) == null
                        ? '—'
                        : <>{fmtN(l.cabecas)} <span className="text-muted-foreground font-normal">cab</span></>}
                    </td>
                    <td className="text-right px-1.5 py-0.5 text-muted-foreground w-[64px]">{fmtN(l.lotacao, 2) ?? '—'}</td>
                    <td className="text-right px-1.5 py-0.5 text-muted-foreground">{fmtN(l.gmd, 3) ?? '—'}</td>
                    <td className="text-right px-1.5 py-0.5 text-muted-foreground">{fmtN(l.arrobas, 1) ?? '—'}</td>
                    {/* Razao de SOMAS, a MESMA regra do desfrutePctArrIndicador:
                        Σ @ vendidas / Σ @ iniciais. Antes dividia a SOMA das
                        vendidas pela MEDIA das iniciais — no mes dava o mesmo, no
                        periodo dava um numero que nao era nem um nem outro.
                        Denominador zero exibe "—", nunca divisao por zero. */}
                    <td className="text-right px-1.5 py-0.5 text-muted-foreground">
                      {l.arrIniciaisSoma > 0 ? `${fmtN((l.arrVendidas / l.arrIniciaisSoma) * 100, 1)}%` : '—'}
                    </td>
                  </tr>
                ))}
                {/* Total: os MESMOS objetos que alimentam os tiles do bloco
                    Eficiencia — bate por construcao. Area soma as linhas
                    (e area, nao indicador); Desfrute divide SOMAS. */}
                <tr className="bg-primary text-primary-foreground font-medium">
                  <td className="text-left px-1.5 py-0.5">Total</td>
                  {/* A10: sobre azul o sufixo NAO leva text-muted-foreground —
                      herda primary-foreground como o resto da linha. Fica so o
                      font-normal, que e o degrau de peso contra o numero. */}
                  <td className="text-right px-1.5 py-0.5">
                    {fmtHaInt(totProdutivo.areaPec) === '—'
                      ? '—'
                      : <>{fmtHaInt(totProdutivo.areaPec)} <span className="font-normal">ha</span></>}
                  </td>
                  <td className="text-right px-1.5 py-0.5">
                    {fmtN(cabecasIndicador?.valor ?? null) == null
                      ? '—'
                      : <>{fmtN(cabecasIndicador?.valor ?? null)} <span className="font-normal">cab</span></>}
                  </td>
                  <td className="text-right px-1.5 py-0.5 w-[64px]">{fmtN(uaHaIndicador?.valor ?? null, 2) ?? '—'}</td>
                  <td className="text-right px-1.5 py-0.5">{fmtN(gmdIndicador?.valor ?? null, 3) ?? '—'}</td>
                  <td className="text-right px-1.5 py-0.5">{fmtN(arrobasIndicador?.valor ?? null, 1) ?? '—'}</td>
                  {/* Total consome o INDICADOR, como as outras quatro colunas —
                      nao um total recalculado na tela. Bate por construcao. */}
                  <td className="text-right px-1.5 py-0.5">
                    {desfrutePctArrIndicador?.valor != null ? `${fmtN(desfrutePctArrIndicador.valor, 1)}%` : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
            </div>
          </SectionBlock>
        )}

        <SectionBlock title="Produção" subtitle="o que a fazenda entregou" naoFechado={mesSemFechamento} avisoNaoFechado={avisoMes}>
          <MetricTile label={cabecasIndicador?.label ?? 'CABEÇAS'} value={fmtN(cabecasIndicador?.valor ?? null)} unit="cab" loading={loadingPainel}
            deltaMes={cabecasIndicador?.deltaMes ?? null}
            deltaAno={cabecasIndicador?.deltaAno ?? null}
            deltaMeta={cabecasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('cabecas')} />
          <MetricTile label={pesoMedioIndicador?.label ?? 'PESO MÉDIO FINAL'} value={fmtN(pesoMedioIndicador?.valor ?? null, 1)} unit="kg" loading={loadingPainel}
            deltaMes={pesoMedioIndicador?.deltaMes ?? null}
            deltaAno={pesoMedioIndicador?.deltaAno ?? null}
            deltaMeta={pesoMedioIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('pesoMedio')} />
          <MetricTile label={arrobasIndicador?.label ?? '@ PRODUZIDAS NO MÊS'} value={fmtN(arrobasIndicador?.valor ?? null, 1)} unit="@" loading={loadingPainel}
            deltaMes={arrobasIndicador?.deltaMes ?? null}
            deltaAno={arrobasIndicador?.deltaAno ?? null}
            deltaMeta={arrobasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('arrobas')} />
          <MetricTile label={desfruteIndicador?.label ?? 'DESFRUTE (CAB.) NO MÊS'} value={fmtN(desfruteIndicador?.valor ?? null)} unit="cab" loading={loadingPainel}
            deltaMes={desfruteIndicador?.deltaMes ?? null}
            deltaAno={desfruteIndicador?.deltaAno ?? null}
            deltaMeta={desfruteIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('desfrute')} />
          {/* Desfrute (@) LOGO ABAIXO do de cabecas — os dois lado a lado e com
              rotulos distintos e o que impede a confusao que existia. Sem
              onClick: o modal de historico so conhece os indicadores do mapa de
              `modalIndicador`, e acrescentar um id novo la e outro escopo. */}
          <MetricTile label={desfrutePctArrIndicador?.label ?? 'DESFRUTE (@) NO MÊS'} value={fmtN(desfrutePctArrIndicador?.valor ?? null, 1)} unit="%" loading={loadingPainel}
            deltaMes={desfrutePctArrIndicador?.deltaMes ?? null}
            deltaAno={desfrutePctArrIndicador?.deltaAno ?? null}
            deltaMeta={desfrutePctArrIndicador?.deltaMeta ?? null} />
          <MetricTile label={gmdIndicador?.label ?? 'GMD'} value={fmtN(gmdIndicador?.valor ?? null, 3)} unit="kg/dia" loading={loadingPainel}
            deltaMes={gmdIndicador?.deltaMes ?? null}
            deltaAno={gmdIndicador?.deltaAno ?? null}
            deltaMeta={gmdIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('gmd')} />
          <MetricTile label={valorRebanhoIndicador?.label ?? 'VALOR DO REBANHO NO MÊS'} value={fmtRAbreviado(valorRebanhoIndicador?.valor ?? null)} loading={loadingPainel}
            deltaMes={valorRebanhoIndicador?.deltaMes ?? null}
            deltaAno={valorRebanhoIndicador?.deltaAno ?? null}
            deltaMeta={valorRebanhoIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('valorRebanho')} />
        </SectionBlock>

        {/* Os quatro tiles sao os MESMOS indicadores ja consumidos no bloco Producao
            (cabecas, GMD, @) e no proprio Eficiencia (UA/ha) — copiados verbatim, sem
            reescrever formatacao. A repeticao entre os dois blocos e deliberada.
            Os rotulos mudam sozinhos no viewMode 'periodo' porque vem do indicador;
            a semantica difere por natureza: cabecas, UA/ha e GMD sao MEDIA no periodo,
            @ produzidas e SOMA — arroba acumula, lotacao e ganho de peso nao. */}
        <SectionBlock title="Eficiência" subtitle="rebanho e uso da área" naoFechado={mesSemFechamento} avisoNaoFechado={avisoMes}>
          <MetricTile label={cabecasIndicador?.label ?? 'CABEÇAS'} value={fmtN(cabecasIndicador?.valor ?? null)} unit="cab" loading={loadingPainel}
            deltaMes={cabecasIndicador?.deltaMes ?? null}
            deltaAno={cabecasIndicador?.deltaAno ?? null}
            deltaMeta={cabecasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('cabecas')} />
          <MetricTile label={uaHaIndicador?.label ?? 'UA/HA NO MÊS'} value={fmtN(uaHaIndicador?.valor ?? null, 2)} loading={statusArea === 'carregando'} status={statusArea !== 'ok' ? msgArea(statusArea) : null}
            deltaMes={uaHaIndicador?.deltaMes ?? null}
            deltaAno={uaHaIndicador?.deltaAno ?? null}
            deltaMeta={uaHaIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('uaHa')} />
          <MetricTile label={gmdIndicador?.label ?? 'GMD'} value={fmtN(gmdIndicador?.valor ?? null, 3)} unit="kg/dia" loading={loadingPainel}
            deltaMes={gmdIndicador?.deltaMes ?? null}
            deltaAno={gmdIndicador?.deltaAno ?? null}
            deltaMeta={gmdIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('gmd')} />
          <MetricTile label={arrobasIndicador?.label ?? '@ PRODUZIDAS NO MÊS'} value={fmtN(arrobasIndicador?.valor ?? null, 1)} unit="@" loading={loadingPainel}
            deltaMes={arrobasIndicador?.deltaMes ?? null}
            deltaAno={arrobasIndicador?.deltaAno ?? null}
            deltaMeta={arrobasIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('arrobas')} />
          <MetricTile label={kgHaIndicador?.label ?? 'KG VIVO/HA NO MÊS'} value={fmtN(kgHaIndicador?.valor ?? null, 1)} unit="kg/ha" loading={statusArea === 'carregando'} status={statusArea !== 'ok' ? msgArea(statusArea) : null}
            deltaMes={kgHaIndicador?.deltaMes ?? null}
            deltaAno={kgHaIndicador?.deltaAno ?? null}
            deltaMeta={kgHaIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('kgHa')} />
        </SectionBlock>
        </div>

        <div className="lg:col-span-2 space-y-4">
        <SectionBlock title="Financeiro Produtivo" subtitle="receita × custo por @">
          <MetricTile
            label={receitaPecIndicador?.label ?? 'RECEITAS PECUÁRIAS COMPETÊNCIA NO MÊS'}
            value={fmtR(receitaPecIndicador?.valor ?? null)}
            loading={loadingPainel}
            tone="blue"
            deltaMes={receitaPecIndicador?.deltaMes ?? null}
            deltaAno={receitaPecIndicador?.deltaAno ?? null}
            deltaMeta={receitaPecIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('receitaPec')} />
          <MetricTile
            label={custeioPecIndicador?.label ?? 'CUSTEIO PRODUÇÃO PECUÁRIA NO MÊS'}
            value={fmtR(custeioPecIndicador?.valor ?? null)}
            loading={loadingPainel}
            tone="negative"
            deltaMes={custeioPecIndicador?.deltaMes ?? null}
            deltaAno={custeioPecIndicador?.deltaAno ?? null}
            deltaMeta={custeioPecIndicador?.deltaMeta ?? null}
            inverseDelta
            onClick={() => setModalIndicador('custeioPec')} />
          <MetricTile
            label={custoArrIndicador?.label ?? 'CUSTO PRODUTIVO R$/@'}
            value={fmtR(custoArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone="negative"
            deltaMes={custoArrIndicador?.deltaMes ?? null}
            deltaAno={custoArrIndicador?.deltaAno ?? null}
            deltaMeta={custoArrIndicador?.deltaMeta ?? null}
            inverseDelta
            onClick={() => setModalIndicador('custoArr')} />
          <MetricTile
            label={precoArrIndicador?.label ?? 'PREÇO DE VENDA R$/@'}
            value={fmtR(precoArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone="blue"
            deltaMes={precoArrIndicador?.deltaMes ?? null}
            deltaAno={precoArrIndicador?.deltaAno ?? null}
            deltaMeta={precoArrIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('precoArr')} />
          <MetricTile
            label={custoCabIndicador?.label ?? 'CUSTO CAB. MÊS R$/CAB.'}
            value={fmtR(custoCabIndicador?.valor ?? null)}
            unit="R$/cab."
            loading={loadingPainel}
            tone="negative"
            deltaMes={custoCabIndicador?.deltaMes ?? null}
            deltaAno={custoCabIndicador?.deltaAno ?? null}
            deltaMeta={custoCabIndicador?.deltaMeta ?? null}
            inverseDelta
            onClick={() => setModalIndicador('custoCab')} />
          <MetricTile
            label={margemArrIndicador?.label ?? 'MARGEM POR @'}
            value={fmtR(margemArrIndicador?.valor ?? null)}
            unit="R$/@"
            loading={loadingPainel}
            tone={margemArrIndicador?.valor == null ? 'default' : margemArrIndicador.valor >= 0 ? 'blue' : 'negative'}
            deltaMes={margemArrIndicador?.deltaMes ?? null}
            deltaAno={margemArrIndicador?.deltaAno ?? null}
            deltaMeta={margemArrIndicador?.deltaMeta ?? null}
            onClick={() => setModalIndicador('margemArr')} />
        </SectionBlock>

        <SectionBlock title="Estrutura Financeira" subtitle="posição patrimonial">
          <MetricTile
            label="Caixa disponível"
            value={fmtR(caixaValor)}
            loading={loadingFluxo}
            tone="blue"
            deltaMes={deltaMesCaixa}
            deltaAno={deltaAnoCaixa}
            deltaMeta={null}
            onClick={() => setModalIndicador('caixaDisponivel')}
          />
          <MetricTile
            label="Endividamento"
            value={fmtR(endividamentoValor)}
            loading={loadingDivida}
            tone={endividamentoValor != null && endividamentoValor > 0 ? 'negative' : 'default'}
            deltaMes={finEndDeltaMes}
            deltaAno={finEndDeltaAno}
            deltaMeta={null}
            inverseDelta
            onClick={() => setModalIndicador('endividamento')}
          />
          <MetricTile
            label="Dívida / rebanho"
            value={loadingDivida ? null : fmtN(finAlavancagem?.percentual ?? null, 1)}
            unit="%"
            loading={loadingDivida}
            tone={
              finAlavancagem?.status === 'critico' ? 'negative'
              : finAlavancagem?.status === 'atencao' ? 'negative'
              : 'default'
            }
            deltaMes={finAlavancagem?.deltaMes ?? null}
            deltaAno={finAlavancagem?.deltaAno ?? null}
            deltaMeta={null}
            inverseDelta
            onClick={() => setModalIndicador('alavancagem')}
          />
          {(() => {
            const pizza = finPizza ?? [];
            const curto = pizza.find(p => p.nome?.toLowerCase().includes('curto'));
            const longo = pizza.find(p => p.nome?.toLowerCase().includes('longo'));
            const total = (curto?.valor ?? 0) + (longo?.valor ?? 0);
            const pctCurto = total > 0 ? (curto?.valor ?? 0) / total * 100 : null;
            return (
              <MetricTile
                label="Curto vs longo prazo"
                value={pctCurto != null
                  ? `${fmtN(pctCurto, 0)}% Curto Prazo / ${fmtN(100 - pctCurto, 0)}% Longo Prazo`
                  : null}
                loading={loadingDivida}
                hideDelta
              />
            );
          })()}
        </SectionBlock>

        {/* Ultimo bloco da COLUNA DA DIREITA — dentro da coluna, nunca como irmao
            do grid (regra do PR das duas colunas). Sem conta com saldo, o bloco
            nao renderiza nem o titulo: mes sem saldo lancado nao vira card vazio. */}
        {gruposConta.length > 0 && (
          <SectionBlock title="Disponível em conta" subtitle="onde o saldo está">
            <div className="col-span-2 space-y-0.5">
              {gruposConta.map(g => (
                <div key={g.tipo} className="space-y-0.5">
                  <LinhaCaixa label={g.rotulo} valor={g.subtotal} tipo="total" />
                  {g.contas.map(c => (
                    <LinhaCaixa key={c.conta_id} label={c.nome} valor={c.saldo} />
                  ))}
                </div>
              ))}

              <div className="pt-1 mt-1 border-t border-border">
                <LinhaCaixa label="Total em conta" valor={totalEmConta} tipo="total" />
              </div>

              {mostrarDifEmConta && (
                <div className="text-[10px] text-warning pt-1">
                  Diferença de {fmtR(difEmConta)} contra o saldo do Caixa
                </div>
              )}
            </div>
          </SectionBlock>
        )}
        </div>

      </div>
      </div>

      {/* Modal da linha do Resumido. A quebra sai das MESMAS parcelas que compoem
          a linha — total do modal e valor da linha sao o mesmo numero, por
          construcao. Nenhuma consulta: por atividade vem dos indicadores, por
          subcentro vem de lancFinShared, ja carregado. */}
      {linhaCaixaModal && (() => {
        const itens = quebraDaLinha(linhaCaixaModal);
        const total = somaInd(...itens.map(i => i.valor));

        /* PALETA — seis tokens do design system, nesta ordem. `destructive`
           fica de fora de proposito: vermelho numa fatia de receita le como
           erro, nao como categoria. A ultima e' tambem a de 'Outros'. */
        const PALETA = [
          { stroke: 'stroke-primary',                bola: 'bg-primary' },
          { stroke: 'stroke-success',                bola: 'bg-success' },
          { stroke: 'stroke-cta',                    bola: 'bg-cta' },
          /* `cta` e `warning` renderizam com a MESMA cor neste tema (43 87% 63%,
             ver A11 do PADROES-UI), entao a 3a e a 4a fatia ficavam
             indistinguiveis — verificado na tela em Receitas e Dividendos.
             `/70` tira do vermelho cheio a leitura de "erro": aqui ele e'
             categoria, nao alerta. */
          { stroke: 'stroke-destructive/70',         bola: 'bg-destructive/70' },
          { stroke: 'stroke-muted-foreground/60',    bola: 'bg-muted-foreground/60' },
          { stroke: 'stroke-muted-foreground/30',    bola: 'bg-muted-foreground/30' },
        ];

        /* O donut RESUME, a tabela MOSTRA TUDO. Seis fatias e o limite do que
           se distingue a olho num anel de 128px; do setimo item em diante o
           valor entra em 'Outros' — mas a linha continua na tabela, com
           espacador no lugar da bolinha. Medido: Dividendos chega a NOVE
           subcentros na base, entao este ramo e' exercitado, nao defesa. */
        const MAX_FATIAS = 6;
        const cabem = itens.slice(0, MAX_FATIAS);
        const resto = itens.slice(MAX_FATIAS);
        const restoSoma = resto.reduce((acc, i) => acc + (i.valor ?? 0), 0);
        const paraDonut = resto.length > 0
          ? [...cabem.slice(0, MAX_FATIAS - 1), { label: 'Outros', valor: restoSoma }]
          : cabem;

        /* `valor` e' sempre >= 0 no banco — o sentido entrada/saida vive no
           campo `sinal`, nao no valor —, entao nao ha tratamento de fatia
           negativa. O filtro `> 0` existe pelo motivo do bloco Area: arco de
           comprimento zero nao renderiza e ainda consome offset. */
        const somaDonut = paraDonut.reduce((acc, i) => acc + (i.valor ?? 0), 0);
        const R = 34, C = 2 * Math.PI * R;
        let acc = 0;
        const fatias = somaDonut > 0
          ? paraDonut.filter(i => (i.valor ?? 0) > 0).map((i, idx) => {
              const frac = (i.valor ?? 0) / somaDonut;
              const el = { ...i, ...PALETA[Math.min(idx, PALETA.length - 1)],
                           dash: frac * C, offset: -acc * C };
              acc += frac;
              return el;
            })
          : [];
        /* Cor da bolinha por ROTULO: a tabela lista mais itens que o donut,
           e casar por indice pintaria o setimo com a cor do primeiro. */
        const corDe = (label: string) => fatias.find(f => f.label === label)?.bola ?? null;

        const pct = (v: number | null) =>
          (total == null || total === 0 || v == null)
            ? '—'
            : `${((v / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
        /* Media MENSAL do periodo: divide por `mesNum`, nao pelo numero de
           meses em que o item teve movimento. O recorte do bloco e' sempre
           Jan→mes selecionado, entao `mesNum` E' o numero de meses. */
        const media = (v: number | null) => (v == null ? null : v / mesNum);
        const recorte = isPeriodo
          ? `Jan–${MES_ABREV[mesNum - 1]} ${anoNum}`
          : `${MES_ABREV[mesNum - 1]} ${anoNum}`;

        return (
          <Dialog open onOpenChange={(v) => { if (!v) setLinhaCaixaModal(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-baseline justify-between gap-4 text-sm">
                  <span>{linhaCaixaModal}</span>
                  <span className="tabular-nums text-base">{fmtR(total)}</span>
                </DialogTitle>
                <p className="text-[10px] text-muted-foreground">{recorte}</p>
              </DialogHeader>
              {itens.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem composição no período.</p>
              ) : (
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  {/* `flex-col` no estreito: lado a lado, o donut espremeria a
                      tabela e os valores quebrariam. */}
                  <svg viewBox="0 0 80 80" className="h-32 w-32 shrink-0 -rotate-90">
                    {fatias.map(f => (
                      <circle key={f.label} cx="40" cy="40" r={R} fill="none"
                        strokeWidth="12" className={f.stroke}
                        strokeDasharray={`${f.dash} ${C - f.dash}`}
                        strokeDashoffset={f.offset} />
                    ))}
                    {/* Miolo VAZIO: sem hover nao ha o que mostrar, e um total
                        fixo no centro repetiria o do cabecalho. */}
                  </svg>
                  <table className="flex-1 w-full text-xs tabular-nums">
                    <thead>
                      <tr className="text-[9px] text-muted-foreground">
                        <th />
                        <th className="text-right font-normal px-1.5 pb-1">Valor</th>
                        <th className="text-right font-normal px-1.5 pb-1">%</th>
                        {isPeriodo && <th className="text-right font-normal px-1.5 pb-1">Média</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(i => {
                        const bola = corDe(i.label);
                        return (
                          <tr key={i.label}>
                            <td className="py-0.5 pr-2">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                {/* Item agrupado em 'Outros' nao tem cor propria no
                                    donut: espacador do mesmo tamanho, como o bloco
                                    Area faz nas linhas sem fatia. */}
                                <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${bola ?? ''}`} />
                                <span className="truncate">{i.label}</span>
                              </span>
                            </td>
                            <td className="text-right px-1.5 py-0.5 text-foreground">{fmtR(i.valor)}</td>
                            <td className="text-right px-1.5 py-0.5 text-muted-foreground">{pct(i.valor)}</td>
                            {isPeriodo && (
                              <td className="text-right px-1.5 py-0.5 text-muted-foreground">{fmtR(media(i.valor))}</td>
                            )}
                          </tr>
                        );
                      })}
                      <tr className="border-t border-border font-medium">
                        <td className="py-1 pr-2">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 shrink-0" />
                            Total
                          </span>
                        </td>
                        <td className="text-right px-1.5 py-1 text-foreground">{fmtR(total)}</td>
                        <td className="text-right px-1.5 py-1 text-muted-foreground">
                          {total == null || total === 0 ? '—' : '100,0%'}
                        </td>
                        {isPeriodo && (
                          <td className="text-right px-1.5 py-1 text-muted-foreground">{fmtR(media(total))}</td>
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {modalIndicador === 'cabecas' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={cabecasIndicador?.titulo ?? ''}
          unidade="cab" formatoValor="inteiro"
          subtitulo={cabecasIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={cabecasIndicador?.serieAno ?? []}
          serieAnoAnt={cabecasIndicador?.serieAnoAnt}
          serieMeta={cabecasIndicador?.serieMetaIndicador}
          series={cabecasIndicador?.series}
          titulos={cabecasIndicador?.titulos}
          tipoAcumulado="posicao"
          indicadorKey="cabecas"
          seriesPorFazenda={seriePorFaz.cabecas}
          globalPorFazenda="soma"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={cabecasIndicador?.deltaMes ?? null}
          deltaAno={cabecasIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'pesoMedio' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={pesoMedioIndicador?.titulo ?? ''}
          unidade="kg" formatoValor="decimal1"
          subtitulo={pesoMedioIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={pesoMedioIndicador?.serieAno ?? []}
          serieAnoAnt={pesoMedioIndicador?.serieAnoAnt}
          serieMeta={pesoMedioIndicador?.serieMeta}
          series={pesoMedioIndicador?.series}
          titulos={pesoMedioIndicador?.titulos}
          tipoAcumulado="posicao"
          indicadorKey="pesoMedio"
          seriesPorFazenda={seriePorFaz.pesoMedio}
          globalPorFazenda="ponderada"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={pesoMedioIndicador?.deltaMes ?? null}
          deltaAno={pesoMedioIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={pesoMedioHistoricoOficial}
          historicoMeta={metaPar(pesoMedioIndicador)}
          loadingHistorico={loadingPesoMedioHistorico}
        />
      )}
      {modalIndicador === 'arrobas' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={arrobasIndicador?.titulo ?? ''}
          unidade="@" formatoValor="decimal1"
          subtitulo={arrobasIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={arrobasIndicador?.serieAno ?? []}
          serieAnoAnt={arrobasIndicador?.serieAnoAnt}
          serieMeta={arrobasIndicador?.serieMeta}
          series={arrobasIndicador?.series}
          titulos={arrobasIndicador?.titulos}
          tipoAcumulado="soma"
          indicadorKey="arrobas"
          seriesPorFazenda={seriePorFaz.arrobas}
          globalPorFazenda="soma"
          tipoGraficoMes="coluna"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={arrobasIndicador?.deltaMes ?? null}
          deltaAno={arrobasIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={arrobasHistoricoOficial}
          historicoMeta={metaPar(arrobasIndicador)}
          loadingHistorico={loadingArrobasHistorico}
        />
      )}
      {modalIndicador === 'gmd' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={gmdIndicador?.titulo ?? ''}
          unidade="kg/dia" formatoValor="decimal3"
          subtitulo={gmdIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={gmdIndicador?.serieAno ?? []}
          serieAnoAnt={gmdIndicador?.serieAnoAnt}
          serieMeta={gmdIndicador?.serieMeta}
          series={gmdIndicador?.series}
          titulos={gmdIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="gmd"
          seriesPorFazenda={seriePorFaz.gmd}
          globalPorFazenda="ponderada"
          tipoGraficoMes="coluna"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={gmdIndicador?.deltaMes ?? null}
          deltaAno={gmdIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={gmdHistoricoOficial}
          historicoMeta={metaPar(gmdIndicador)}
          loadingHistorico={loadingGmdHistorico}
        />
      )}
      {modalIndicador === 'uaHa' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={uaHaIndicador?.titulo ?? ''}
          unidade="UA/ha" formatoValor="decimal2"
          subtitulo={uaHaIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={uaHaIndicador?.serieAno ?? []}
          serieAnoAnt={uaHaIndicador?.serieAnoAnt}
          serieMeta={uaHaIndicador?.serieMeta}
          series={uaHaIndicador?.series}
          titulos={uaHaIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="uaHa"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={uaHaIndicador?.deltaMes ?? null}
          deltaAno={uaHaIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={uaHaHistoricoOficial}
          historicoMeta={metaPar(uaHaIndicador)}
          loadingHistorico={loadingUaHaHistorico}
        />
      )}
      {modalIndicador === 'kgHa' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={kgHaIndicador?.titulo ?? ''}
          unidade="kg/ha" formatoValor="decimal1"
          subtitulo={kgHaIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={kgHaIndicador?.serieAno ?? []}
          serieAnoAnt={kgHaIndicador?.serieAnoAnt}
          serieMeta={kgHaIndicador?.serieMeta}
          series={kgHaIndicador?.series}
          titulos={kgHaIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="kgHa"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={kgHaIndicador?.deltaMes ?? null}
          deltaAno={kgHaIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={kgHaHistoricoOficial}
          historicoMeta={metaPar(kgHaIndicador)}
          loadingHistorico={loadingKgHaHistorico}
        />
      )}
      {modalIndicador === 'areaProdutivaPec' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Área Produtiva Pecuária"
          unidade="ha" formatoValor="inteiro"
          subtitulo={isPeriodoArea ? 'Área pecuária produtiva média no período' : 'Área pecuária produtiva no mês'}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={areaProdutivaPecSerieAno}
          serieAnoAnt={areaProdutivaPecSerieAnoAnt}
          serieMeta={areaProdutivaPecSerieMeta}
          tipoAcumulado="posicao"
          indicadorKey="areaProdutivaPec"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={areaProdutivaPecDeltaMes}
          deltaAno={areaProdutivaPecDeltaAno}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={areaProdutivaPecHistoricoOficial}
          historicoMeta={{ mes: [], periodo: [] }}
          loadingHistorico={loadingAreaProdutivaPecHistorico}
        />
      )}
      {modalIndicador === 'desfrute' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={desfruteIndicador?.titulo ?? ''}
          unidade="cab" formatoValor="inteiro"
          subtitulo={desfruteIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={desfruteIndicador?.serieAno ?? []}
          serieAnoAnt={desfruteIndicador?.serieAnoAnt}
          serieMeta={desfruteIndicador?.serieMeta}
          series={desfruteIndicador?.series}
          titulos={desfruteIndicador?.titulos}
          tipoAcumulado="soma"
          indicadorKey="desfrute"
          tipoGraficoMes="coluna"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={desfruteIndicador?.deltaMes ?? null}
          deltaAno={desfruteIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'valorRebanho' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={valorRebanhoIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={valorRebanhoIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={valorRebanhoIndicador?.serieAno ?? []}
          serieAnoAnt={valorRebanhoIndicador?.serieAnoAnt}
          serieMeta={valorRebanhoIndicador?.serieMeta}
          series={valorRebanhoIndicador?.series}
          titulos={valorRebanhoIndicador?.titulos}
          tipoAcumulado="posicao"
          indicadorKey="valorRebanho"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={valorRebanhoIndicador?.deltaMes ?? null}
          deltaAno={valorRebanhoIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={historicoAno}
          historicoMeta={historicoAnoMeta}
          loadingHistorico={loadingHistorico}
        />
      )}
      {modalIndicador === 'receitaPec' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={receitaPecIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={receitaPecIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={receitaPecIndicador?.serieAno ?? []}
          serieAnoAnt={receitaPecIndicador?.serieAnoAnt}
          serieMeta={receitaPecIndicador?.serieMeta}
          series={receitaPecIndicador?.series}
          titulos={receitaPecIndicador?.titulos}
          tipoAcumulado={isPeriodo ? 'soma' : 'posicao'}
          indicadorKey="receitaPec"
          tipoGraficoMes="coluna"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={receitaPecIndicador?.deltaMes ?? null}
          deltaAno={receitaPecIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={receitaPecHistoricoOficial}
          historicoMeta={metaPar(receitaPecIndicador)}
          loadingHistorico={loadingReceitaPecHistorico}
          corPrincipal="azul"
        />
      )}
      {modalIndicador === 'custeioPec' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custeioPecIndicador?.titulo ?? ''}
          formatoValor="moedaAbreviada"
          subtitulo={custeioPecIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custeioPecIndicador?.serieAno ?? []}
          serieAnoAnt={custeioPecIndicador?.serieAnoAnt}
          serieMeta={custeioPecIndicador?.serieMeta}
          series={custeioPecIndicador?.series}
          titulos={custeioPecIndicador?.titulos}
          tipoAcumulado={isPeriodo ? 'soma' : 'posicao'}
          indicadorKey="custeioPec"
          tipoGraficoMes="coluna"
          polaridade="positivoRuim"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={custeioPecIndicador?.deltaMes ?? null}
          deltaAno={custeioPecIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={custeioPecHistoricoOficial}
          historicoMeta={metaPar(custeioPecIndicador)}
          loadingHistorico={loadingCusteioPecHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'custoArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custoArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={custoArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custoArrIndicador?.serieAno ?? []}
          serieAnoAnt={custoArrIndicador?.serieAnoAnt}
          serieMeta={custoArrIndicador?.serieMeta}
          series={custoArrIndicador?.series}
          titulos={custoArrIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="custoArr"
          tipoGraficoMes="coluna"
          polaridade="positivoRuim"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={custoArrIndicador?.deltaMes ?? null}
          deltaAno={custoArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={custoArrHistoricoOficial}
          historicoMeta={metaPar(custoArrIndicador)}
          loadingHistorico={loadingCustoArrHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'precoArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={precoArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={precoArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={precoArrIndicador?.serieAno ?? []}
          serieAnoAnt={precoArrIndicador?.serieAnoAnt}
          serieMeta={precoArrIndicador?.serieMeta}
          series={precoArrIndicador?.series}
          titulos={precoArrIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="precoArr"
          tipoGraficoMes="coluna"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={precoArrIndicador?.deltaMes ?? null}
          deltaAno={precoArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={precoArrHistoricoOficial}
          historicoMeta={metaPar(precoArrIndicador)}
          loadingHistorico={loadingPrecoArrHistorico}
          corPrincipal="azul"
        />
      )}
      {modalIndicador === 'custoCab' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={custoCabIndicador?.titulo ?? ''}
          unidade="R$/cab" formatoValor="decimal2"
          subtitulo={custoCabIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={custoCabIndicador?.serieAno ?? []}
          serieAnoAnt={custoCabIndicador?.serieAnoAnt}
          serieMeta={custoCabIndicador?.serieMeta}
          series={custoCabIndicador?.series}
          titulos={custoCabIndicador?.titulos}
          tipoAcumulado="media"
          indicadorKey="custoCab"
          polaridade="positivoRuim"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={custoCabIndicador?.deltaMes ?? null}
          deltaAno={custoCabIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={custoCabHistoricoOficial}
          historicoMeta={metaPar(custoCabIndicador)}
          loadingHistorico={loadingCustoCabHistorico}
          corPrincipal="vermelho"
        />
      )}
      {modalIndicador === 'margemArr' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo={margemArrIndicador?.titulo ?? ''}
          unidade="R$/@" formatoValor="decimal2"
          subtitulo={margemArrIndicador?.subtitulo ?? ''}
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={margemArrIndicador?.serieAno ?? []}
          serieAnoAnt={margemArrIndicador?.serieAnoAnt}
          serieMeta={margemArrIndicador?.serieMeta}
          tipoAcumulado="media"
          indicadorKey="margemArr"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={margemArrIndicador?.deltaMes ?? null}
          deltaAno={margemArrIndicador?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          historicoAno={margemArrHistoricoOficial}
          historicoMeta={metaPar(margemArrIndicador)}
          loadingHistorico={loadingMargemArrHistorico}
          corPrincipal={(margemArrIndicador?.valor ?? 0) >= 0 ? 'azul' : 'vermelho'}
        />
      )}
      {modalIndicador === 'caixaDisponivel' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Caixa disponível"
          unidade="" formatoValor="moedaAbreviada"
          subtitulo="Saldo final de caixa por mês"
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={caixaSerieAno as number[]}
          serieAnoAnt={caixaSerieAnoAnt as number[]}
          tipoAcumulado="posicao"
          indicadorKey="caixaDisponivel"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={deltaMesCaixa}
          deltaAno={deltaAnoCaixa}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      )}
      {modalIndicador === 'endividamento' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Endividamento"
          unidade="" formatoValor="moedaAbreviada"
          subtitulo="Saldo devedor em aberto por mês"
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={finSerieAno}
          serieAnoAnt={finSerieAnoAnt}
          tipoAcumulado="posicao"
          indicadorKey="endividamento"
          polaridade="positivoRuim"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={finEndDeltaMes}
          deltaAno={finEndDeltaAno}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          corPrincipal="vermelho"
        />
      )}
      {/* SEM `series`: alavancagem, endividamento, caixaDisponivel e
          areaProdutivaPec NAO existem em usePainelConsultorData — sao os
          mesmos quatro que aparecem na baseline TSC por nao estarem no tipo
          de `modalIndicador`. Sem as duas leituras, o modal cai em
          `serieAno` e os dois graficos ficam iguais. Dar `series` a eles
          exige antes cria-los no hook: frente propria. */}
      {modalIndicador === 'alavancagem' && (
        <IndicadorHistoricoModal
          open onClose={() => setModalIndicador(null)}
          titulo="Dívida / rebanho"
          unidade="%" formatoValor="decimal1"
          subtitulo="Alavancagem pecuária = dívida pecuária / valor do rebanho"
          mesAtual={mesNum} anoAtual={anoNum}
          serieAno={finSerieAlavAno as number[]}
          serieAnoAnt={finSerieAlavAnoAnt as number[]}
          tipoAcumulado="posicao"
          indicadorKey="alavancagem"
          polaridade="positivoRuim"
          clienteId={clienteAtual?.id}
          fazendaId={isGlobal ? null : fazendaAtual?.id}
          fazendaIds={fazendaIdsPecuaria}
          anoInicio={anoNum - 5}
          deltaMes={finAlavancagem?.deltaMes ?? null}
          deltaAno={finAlavancagem?.deltaAno ?? null}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          corPrincipal="vermelho"
        />
      )}

      {/* UM ponto de montagem. Eram dois, um por assunto, e so o de
          Movimentacoes recebia `indicadoresMovimentacoes` — entao trocar de
          assunto dentro do modal aberto pelo Zootecnico dava `?? []`, grade
          com zero filhos, TELA EM BRANCO. Sem nem "em construção", porque o
          `EmConstrucao` vive DENTRO do card e nao havia card nenhum.
          Com um ponto so, os dois prop-bags chegam sempre e nenhum assunto
          pode cair em array vazio — o defeito morre por construcao, nao por
          guarda. */}
      {modalAtividade && (
        <ModalAtividade
          open
          onClose={() => { setModalAtividade(null); setAssuntoAtivo(null); }}
          mesAtual={mesNum}
          anoAtual={anoNum}
          clienteNome={clienteAtual?.nome ?? ''}
          assuntoInicial={modalAtividade}
          onAssuntoChange={setAssuntoAtivo}
          indicadores={indicadoresAtividade}
          indicadoresMovimentacoes={indicadoresMovimentacoes}
          indicadoresFinanceiro={indicadoresFinanceiro}
          codigosFazendas={seriePorFazAtiv.cabecas.map(f => f.codigo)}
          loadingHistorico={histZootAtiv.loading}
        />
      )}
    </div>
  );
}
