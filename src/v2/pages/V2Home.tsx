import { useMemo, useState } from 'react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { usePainelConsultorData } from '@/hooks/usePainelConsultorData';
import { useLancamentos } from '@/hooks/useLancamentos';
import { useFinanceiro } from '@/hooks/useFinanceiro';
import { useStatusPilaresLote, type StatusFazenda } from '@/hooks/useStatusPilaresLote';
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
import { SeletorPeriodo } from '@/v2/components/SeletorPeriodo';
import { anoInteiro } from '@/v2/lib/periodo';
/* VISAO-GERAL-02 — as peças da Visão Geral nova (mock aprovado, 03/11/2026) */
import { CartoesDoTopo, type CartaoVG } from '@/v2/pages/visaoGeral/CartoesDoTopo';
import { TabelaFazendasVG } from '@/v2/pages/visaoGeral/TabelaFazendasVG';
import { PrecisaDeAtencao, type ItemAtencao } from '@/v2/pages/visaoGeral/AtencaoEAtalhos';
import { fraseARevalidar, useValorRebanhoARevalidar } from '@/lib/fechamento/travaDoP2';
import { BlocosPorAtividade } from '@/v2/pages/visaoGeral/BlocosPorAtividade';
import { diferencaEmReais, indicadoresPecuaria, variacao } from '@/v2/pages/visaoGeral/indicadoresDaAtividade';
import { useAtividadesDoCliente, blocosDaVisao, type GrupoAtividade } from '@/v2/pages/visaoGeral/atividadesDaVisao';
import { useConciliacaoSemCasar } from '@/v2/pages/visaoGeral/conciliacaoSemCasar';
import { atividadesDaArea, rotuloDaFazenda, situacaoDoFechamento, type LinhaFazendaVG } from '@/v2/pages/visaoGeral/fazendasDaVisao';
import { useRebanhoOficial, buildFazendaRowsFromCategories } from '@/hooks/useRebanhoOficial';
import { useChuvas } from '@/hooks/useChuvas';
import { useDrePecuaria } from '@/hooks/useDrePecuaria';
import { usePodeVerMeta } from '@/v2/hooks/usePodeAbrir';
/* VISAO-GERAL-03 — a régua da Geo pastos › Global: o card, a miniatura das fazendas e o seletor de duas opções de lá */
import { Card, LegendaDasSituacoes, MiniaturaDaFazenda } from '@/components/mapa-geo/GeoPastosGlobal';
import { Segmentado } from '@/components/ui/segmentado';
import { useMapaDasFazendas } from '@/v2/pages/visaoGeral/mapaDasFazendas';

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



function SectionBlock({ title, subtitle, children, naoFechado, avisoNaoFechado, acao, className, testid }: {
  title: string; subtitle?: string; children: React.ReactNode;
  /* VISAO-GERAL-04 — "h-full": Área e Caixa na mesma altura */
  className?: string;
  testid?: string;
  /* VISAO-GERAL-02 — o link à direita do título ("Ver por fazenda ›") */
  acao?: React.ReactNode;
  /* PR-HOME-BLOCOS-PARCIAIS-01 — bloco que DEPENDE de fechamento fica esmaecido com
     aviso por cima quando o mes nao fechou. Sem isto, a regua dizia "vermelho, ninguem
     fechou" e o bloco logo abaixo mostrava "0,0 @ · ↓ 100,0% vs mes" como se a producao
     tivesse desabado — duas afirmacoes contraditorias na mesma tela, e a de baixo era a
     errada. O zero do banco esta certo; o que faltava era CONTEXTO. */
  naoFechado?: boolean;
  avisoNaoFechado?: string;
}) {
  return (
    /* Titulo e subtitulo NAO esmaecem: o operador precisa saber que bloco e aquele.
       VISAO-GERAL-03 — o quadro é o `Card` da Geo pastos › Global (título 11 px em sentence case, subtítulo e ação a 9,5/10 px). */
    <Card titulo={title} className={className} testid={testid}
      extra={<>
        {/* o subtítulo só onde cabe inteiro (de 1280 px para cima); nunca com "…" */}
        {subtitle && <span className="hidden whitespace-nowrap text-[9.5px] text-muted-foreground xl:inline">({subtitle})</span>}
        {acao && <span className="ml-auto flex-none text-[10px]">{acao}</span>}
      </>}>
      <div className="relative px-2.5 pb-2.5">
        {/* pointer-events-none impede clicar num card e abrir o historico de um numero
            parcial. O overlay e ABSOLUTO: nao empurra layout nem muda a altura do bloco. */}
        <div className={`grid grid-cols-2 gap-x-6 gap-y-2${naoFechado ? ' opacity-40 pointer-events-none select-none' : ''}`}>
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
    </Card>
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
    ? 'text-[11px] font-medium text-foreground'
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
/* VISAO-GERAL-03 — a régua compacta: cada mês na medida de um chip pequeno da Geo pastos (20 px de alto, 10 px), largura fixa (não estica
   na tela inteira) */
const CELULA_MES = 'inline-flex h-[20px] w-[34px] flex-none items-center justify-center rounded border text-[10px] font-semibold';

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
      <div className="flex flex-none gap-0.5" data-testid="vg-regua-meses">
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
    <div className="flex flex-none gap-0.5" data-testid="vg-regua-meses">
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
      <div className="flex flex-none gap-1">
        <span className={`${PILL_STATUS} border-border/40 bg-muted text-transparent animate-pulse`}>Rebanho 0/0</span>
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
      <div className="flex flex-none gap-1">
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className={`${classeRebanho} cursor-pointer hover:bg-amber-500/25`}
        >
          {rotuloRebanho}
        </button>
        {/* VG-LEGADO-OCULTO-01 — o chip "Financeiro (em construção)" (o P3, 'nao_implementado') saiu: item em construção
            não aparece na tela (decisão de 03/11). Volta quando o P3 existir. */}
      </div>

      {/* O modal e o lugar do quadro COMPLETO: aqui a fazenda fechada tambem aparece,
          ao contrario da faixa, onde ela so ocuparia espaco. */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[11px] font-semibold">
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

export function V2Home({ ano, mes, viewMode = 'mes', onViewModeChange, onIrPara, onMesChange, onAnoChange }: {
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
  /* ⚠ SÓ O ANO — PR-BARRA-UNICA-01a. A barra global saiu do shell e esta tela precisava
     dela apenas para o ano: o MÊS ela já escolhe na régua de 12 do PR-HOME-REGUA-MESES-01,
     e um segundo seletor de mês seria o filtro duplo que este envelope veio desmontar. */
  onAnoChange?: (ano: string) => void;
}) {
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal, fazendasComPecuaria, fazendas, setFazendaAtual } = useFazenda();
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

  const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const ml = isPeriodo
    ? `Jan–${MES_ABREV[mesNum - 1]} ${ano}`
    : new Date(anoNum, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });


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
  const { lancamentos: lancFinShared } = useFinanceiro({ ano: anoNum });
  /* PR-FIN-COMP-02 — a SEGUNDA carga, por competência, só para as linhas de
     receita e dedução do DRE.
     ⚠ O `lancFinShared` ACIMA NÃO MUDA, e essa é a razão de existir uma segunda
     chamada em vez de um parâmetro a mais na primeira: ele alimenta as três
     instâncias do PC-100 e o bloco Caixa inteiro. Flipar o regime dele moveria
     Visão Geral, Executivo e fluxo de caixa junto — os três que este PR tem de
     deixar idênticos.
     ⚠ NÃO DÁ PARA DERIVAR UM DO OUTRO EM MEMÓRIA: medido no Proto (Vera/2026),
     18 lançamentos estão em caixa-2026 e fora de competência-2026, e os boitel
     estão em competência-2026 e fora de caixa-2026. Nenhum dos conjuntos contém
     o outro, então "carregar o maior e peneirar" não existe aqui.
     O custo é uma query a mais na mesma tabela; o `queryKey` do `useFinanceiro`
     já inclui `regime`, então os dois conjuntos têm cache próprio e não se
     sobrescrevem. */
  const { lancamentos: lancFinCompShared } = useFinanceiro({ ano: anoNum, regime: 'competencia' });
  // Não passar externo enquanto ainda está carregando (length = 0)
  // Undefined = hook interno roda; array com dados = hook interno desligado
  const sharedLanc = {
    lancPecExterno: lancPecShared.length > 0 ? lancPecShared : undefined,
    lancFinExterno: lancFinShared.length > 0 ? lancFinShared : undefined,
    lancFinCompExterno: lancFinCompShared.length > 0 ? lancFinCompShared : undefined,
  };

  const {
    areaPecuariaRealPorMes, 
    // PR-HOME-AREA-COMPOSICAO-01 — composicao da area no mes, do snapshot oficial.
    areaProdutivaRealPorMes, areaAgriculturaRealPorMes,
    areaTotalRealPorMes, areaSilviculturaRealPorMes, areaReservaRealPorMes,
    areaAppRealPorMes, areaBenfeitoriasRealPorMes, areaOutrasRealPorMes,
    areaPorFazendaMes,
    cabecasIndicador, gmdIndicador, uaHaIndicador, 
    custeioPecIndicador, 
    // PR-HOME-CAIXA-CONSOLIDADO-01 — as 15 linhas de fluxo e o saldo.
    receitaPecCaixaIndicador, receitaAgriIndicador, receitaOutrasIndicador, captacaoIndicador, entradasNaoClassificadasIndicador,
    captacaoPecIndicador, captacaoAgriIndicador, captacaoSilviIndicador, captacaoSemEscopoIndicador,
    /* PR-VG-CAIXA-01 — ja existiam no PC-100 desde 22/08; a tela e' que nao os
       consumia. Ver o comentario em `entradasCaixa`. */
    aportePessoalIndicador, retornoEmprestimosIndicador,
    receitaSilvicolaIndicador, custeioSilviIndicador, investSilviIndicador, amortizacaoSilviIndicador,
    investPecIndicador, investBovinosIndicador, amortizacaoPecIndicador,
    /* Existia no PC-100 (usePainelConsultorData:4564) e nunca fora consumido
       aqui — o card montava o desembolso somando parcelas dos tres escopos. */
    /* PR-PC100-POR-HECTARE-01 — financeiro de escopo pecuaria dividido pela area
       produtiva pecuaria. Nasceram sem leitor; a aba Operacional e' o primeiro. */
    /* PR-PC100-DRE-01 e -PARCELAS-01 — o modelo oficial inteiro, sempre em
       COMPETENCIA por construcao. Nasceram sem leitor; esta aba e' o primeiro. */
    custeioAgriIndicador, investAgriIndicador, amortizacaoAgriIndicador,
    dividendosIndicador, deducoesTributosIndicador, tributosIndicador,
    caixaIndicador,
    /* PR-ATIVIDADE-08 — quatro que o PC-100 ja produzia e nenhuma tela lia.
       Saem da MESMA desestruturacao: nenhuma chamada nova ao hook.
       `kgHaIndicador` ja vinha, na linha de cima. */
    /* PR-FINANCEIRO-01 — o DRE de caixa. Quase todos ja existiam no PC-100
       com a MESMA forma dos zootecnicos; so os dois `custoVariavel` de
       agricultura e silvicultura nasceram neste PR, porque o par existia
       apenas na pecuaria e a hierarquia nao fechava. */
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



  /* Conta zerada nao aparece; grupo inteiro zerado nao aparece nem como rotulo
     ('cartao' cai nesse caso em todos os clientes hoje). O hook devolve tudo —
     esconder e decisao da tela. */


  /* MOSTRAR, NAO FORCAR — mesmo principio da diferenca de fechamento do Caixa.
     Tolerancia de R$ 1,00 para nao exibir centavo de arredondamento. */

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

  /* ══ VISAO-GERAL-02 (mock aprovado, Gabriel 03/11/2026) — os números da Visão Geral nova. NENHUM nasce aqui: cada um vem da fonte da
     tela dona e já lida nesta tela (rebanho oficial pelos indicadores do PC-100, área pela foto do bloco "Área no mês", caixa pelo bloco
     "Caixa no mês"), ou de UMA leitura nova da fonte oficial (DRE pecuária, chuvas, conciliação, atividades do Code 6). ══ */
  const anoMesVG = anoMesStatus ?? '';
  const podeVerMeta = usePodeVerMeta();
  const { lidas: atividadesLidas } = useAtividadesDoCliente(clienteAtual?.id);
  const { semCasar, carregando: carregandoConc } = useConciliacaoSemCasar(clienteAtual?.id, anoMesVG);
  const { chuvas } = useChuvas();
  /* o rebanho oficial por fazenda (a mesma consulta do PC-100: o cache é o mesmo) */
  const { rawCategorias: categoriasVG } = useRebanhoOficial({ ano: anoNum, cenario: 'realizado', global: isGlobal });
  /* DRE pecuária do ANO (jan → mês), realizado e meta, pela função da tela DRE. A meta só para quem a vê. */
  const deAnoVG = anoNum ? `${anoNum}-01` : null;
  const { dre: drePecAno } = useDrePecuaria(clienteAtual?.id, deAnoVG, anoMesVG || null, 'realizado');
  const { dre: drePecAnoMeta } = useDrePecuaria(podeVerMeta ? clienteAtual?.id : null, deAnoVG, anoMesVG || null, 'meta');
  const linhasDreVG = (d: typeof drePecAno) =>
    !d ? null : isGlobal ? d.total : (d.fazendas.find(f => f.fazenda_id === fazendaAtual?.id)?.linhas ?? null);
  /* VISAO-GERAL-05 — o ano anterior: os MESMOS meses (jan → mês) do ano anterior, pela mesma função */
  const deAnoAntVG = anoNum ? `${anoNum - 1}-01` : null;
  const ateAnoAntVG = anoNum && mesNum ? `${anoNum - 1}-${String(mesNum).padStart(2, '0')}` : null;
  const { dre: drePecAnoAnt } = useDrePecuaria(clienteAtual?.id, deAnoAntVG, ateAnoAntVG, 'realizado');
  const drePecReal = linhasDreVG(drePecAno);
  const drePecMeta = linhasDreVG(drePecAnoMeta);
  const drePecAnt = linhasDreVG(drePecAnoAnt);

  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesCurtoVG = MES_CURTO[mesNum - 1] ?? '';
  const fmtHa = (v: number | null) => (v == null ? null : `${fmtN(v, 0)} ha`);

  /* a chuva do mês (ou de jan → mês, no ano) por fazenda: a soma da tela Chuvas */
  const chuvaPorFazenda = useMemo(() => {
    const m = new Map<string, number>();
    const de = `${anoNum}-${isPeriodo ? '01' : String(mesNum).padStart(2, '0')}`;
    for (const c of chuvas) {
      const am = c.data.slice(0, 7);
      if (am < de || am > anoMesVG) continue;
      m.set(c.fazendaId, (m.get(c.fazendaId) ?? 0) + c.milimetros);
    }
    return m;
  }, [chuvas, anoNum, mesNum, isPeriodo, anoMesVG]);

  /* a tabela Fazendas: área pela foto do bloco Área; cabeças e UA pelo rebanho oficial da fazenda; chuva; fechamento pela grade do ano */
  const linhasFazendasVG = useMemo((): LinhaFazendaVG[] => {
    const daArea = new Map(areaPorFazendaMes.map(a => [a.fazenda_id, a]));
    const statusDoMes = new Map(gradeAno.filter(c => c.mes === mesNum).map(c => [c.fazendaId, c]));
    const escopo = isGlobal ? fazendas : fazendaAtual ? [fazendaAtual] : [];
    return escopo
      .filter(f => f.id !== '__global__' && f.status_operacional !== 'inativa')
      .map((f): LinhaFazendaVG => {
        const a = daArea.get(f.id);
        const cats = categoriasVG.filter(c => c.fazenda_id === f.id);
        const linhaMes = cats.length ? buildFazendaRowsFromCategories(cats).find(r => r.mes === mesNum) : undefined;
        const st = statusDoMes.get(f.id);
        const areaPec = a ? a.area_pecuaria_ha : null;
        const ua = linhaMes?.ua_media ?? null;
        return {
          id: f.id,
          rotulo: rotuloDaFazenda({ id: f.id, nome: f.nome, codigo: f.codigo ?? null }),
          atividades: atividadesDaArea(a),
          areaTotal: a ? a.area_total_ha : null,
          areaProdutiva: a ? a.area_produtiva_ha : null,
          areaPecuaria: areaPec,
          areaAgricultura: a ? a.area_agricultura_ha : null,
          areaSilvicultura: a ? a.area_silvicultura_ha : null,
          areaReservaAppBenf: a ? a.area_reserva_ha + a.area_app_ha + a.area_benfeitorias_ha + a.area_outras_ha : null,
          cabecas: linhaMes ? linhaMes.cabecas_final : null,
          ua,
          uaHa: ua !== null && areaPec !== null && areaPec > 0 ? ua / areaPec : null,
          chuvaMm: chuvaPorFazenda.get(f.id) ?? null,
          fechamento: situacaoDoFechamento(st?.p1, st?.p2),
        };
      })
      /* a fazenda sem área nem rebanho no mês (o ADM, uma fazenda nova) não ocupa linha */
      .filter(l => l.areaTotal !== null || l.cabecas !== null);
  }, [areaPorFazendaMes, gradeAno, mesNum, isGlobal, fazendas, fazendaAtual, categoriasVG, chuvaPorFazenda]);

  const variacaoCaixa = saldoFinal !== null && saldoInicial !== null ? saldoFinal - saldoInicial : null;
  const resultadoAno = drePecReal?.lucro_liquido ?? null;
  const resultadoMeta = drePecMeta?.lucro_liquido ?? null;
  const irPara = (s: V2Section) => onIrPara?.(s, '');
  /* VISAO-GERAL-03/04 — o "Mapa das fazendas" da coluna da direita (a leitura da Geo pastos › Global, no mês da Visão Geral) */
  const mapaDasFazendas = useMapaDasFazendas(anoMesStatus ?? '');

  /* VISAO-GERAL-05 (07:31) — o número e a unidade separados (a unidade menor ao lado) e, embaixo do rótulo, a variação contra a meta (só
     para quem a vê) e contra o ano anterior, quando a fonte as tem: rebanho e lotação pelo PC-100 (deltaMeta/deltaAno), caixa pelo
     indicador de caixa do PC-100, resultado pela DRE pecuária (meta e os mesmos meses do ano anterior). Área: sem comparação. */
  const soMeta = (v: number | null | undefined) => (podeVerMeta ? v ?? null : null);
  const cartoesVG: CartaoVG[] = [
    { id: 'area', titulo: isPeriodo ? 'Área produtiva média' : 'Área produtiva', valor: areaProdutiva == null ? null : fmtN(areaProdutiva, 0), unidade: 'ha',
      detalhe: areaProdutiva != null && areaTotal != null && areaTotal > 0
        ? `${fmtN((areaProdutiva / areaTotal) * 100, 1)}% de ${fmtN(areaTotal, 0)} ha` : null,
      abrir: 'Abrir mapa', onAbrir: () => irPara('mapa-geo-pastos') },
    { id: 'rebanho', titulo: 'Rebanho', valor: cabecasIndicador?.valor != null ? fmtN(cabecasIndicador.valor, 0) : null, unidade: 'cab',
      meta: soMeta(cabecasIndicador?.deltaMeta), anoAnt: cabecasIndicador?.deltaAno ?? null,
      abrir: 'Abrir fechamento', onAbrir: () => irPara('fechamento') },
    /* VISAO-GERAL-04 (Gabriel 04/11 07:04) — a lotação ganha cartão próprio na faixa (era o detalhe do Rebanho) */
    { id: 'uaha', titulo: 'Lotação', valor: uaHaIndicador?.valor != null ? fmtN(uaHaIndicador.valor, 2) : null, unidade: 'UA/ha',
      meta: soMeta(uaHaIndicador?.deltaMeta), anoAnt: uaHaIndicador?.deltaAno ?? null,
      abrir: 'Abrir fechamento', onAbrir: () => irPara('fechamento') },
    { id: 'caixa', titulo: 'Caixa no fim do mês', valor: fmtRAbreviado(saldoFinal),
      detalhe: variacaoCaixa === null ? null : `${variacaoCaixa >= 0 ? '+' : '−'}${fmtRAbreviado(Math.abs(variacaoCaixa))} no ${isPeriodo ? 'ano' : 'mês'}`,
      meta: soMeta(caixaIndicador?.deltaMeta), anoAnt: caixaIndicador?.deltaAno ?? null,
      abrir: 'Abrir fluxo', onAbrir: () => irPara('fluxo-caixa') },
    /* VISAO-GERAL-04 — a chuva saiu da faixa: fica só na tabela Fazendas (coluna "Chuva") */
    { id: 'resultado', titulo: 'Resultado do ano · pecuária', valor: fmtRAbreviado(resultadoAno),
      meta: soMeta(variacao(resultadoAno, resultadoMeta)), anoAnt: variacao(resultadoAno, drePecAnt?.lucro_liquido),
      /* VG-RESULTADO-RS-01 (Gabriel 05/11): com resultado ou base ≤ 0, a diferença em R$ ("+R$ 645 mil vs meta", "+R$ 200 mil vs ano ant.")
         no lugar do % */
      metaEmReais: soMeta(diferencaEmReais(resultadoAno, resultadoMeta)), anoAntEmReais: diferencaEmReais(resultadoAno, drePecAnt?.lucro_liquido),
      abrir: 'Abrir DRE', onAbrir: () => irPara('dre') },
  ];

  /* Precisa de atenção: só o que tem fonte (fechamento faltando, conciliação sem casar). Pastos sem desenho e contas da semana ficam
     fora até a tela dona expor a conta (o Geo Pastos e a CPR a fazem dentro do componente). */
  /* FECH-REVALIDAR-AVISO-01 — o Valor do Rebanho validado que caiu (o peso mudou depois): UM item por fazenda × mês, até revalidar */
  const idsARevalidar = useMemo(() => (isGlobal ? fazendas.map(f => f.id) : fazendaAtual ? [fazendaAtual.id] : []), [isGlobal, fazendas, fazendaAtual]);
  const aRevalidar = useValorRebanhoARevalidar(idsARevalidar);
  const atencaoVG: ItemAtencao[] = [
    ...gradeAno
      .filter(c => c.mes === mesNum && (isGlobal || c.fazendaId === fazendaAtual?.id) && (c.p1 === 'pendente' || c.p2 === 'pendente'))
      .map((c): ItemAtencao => {
        const f = fazendas.find(x => x.id === c.fazendaId);
        const destino: V2Section = c.p1 === 'pendente' ? 'fechamento' : 'valor-rebanho';
        /* VISAO-GERAL-05 — o item cabe numa linha: a fazenda pelo CÓDIGO; o nome inteiro no title */
        return { id: `fech-${c.fazendaId}`, texto: `Fechamento de ${mesCurtoVG} faltando · ${f?.codigo || f?.nome || c.fazendaNome}`,
          title: `Fechamento de ${mesCurtoVG} faltando — ${f ? rotuloDaFazenda({ id: f.id, nome: f.nome, codigo: f.codigo ?? null }) : c.fazendaNome}`,
          acao: 'Fechar', onIr: () => onIrPara?.(destino, c.fazendaId) };
      }),
    ...(semCasar !== null && semCasar > 0
      ? [{ id: 'conc', texto: `Conciliação de ${mesCurtoVG}: ${fmtN(semCasar, 0)} sem casar`, acao: 'Conciliar', onIr: () => irPara('conciliacao') }]
      : []),
    ...aRevalidar.pendentes.map((r): ItemAtencao => {
      const f = fazendas.find(x => x.id === r.fazendaId);
      return { id: `vr-${r.fazendaId}-${r.anoMes}`, texto: `${fraseARevalidar(r.anoMes)} · ${f?.codigo || f?.nome || ''}`,
        title: `${fraseARevalidar(r.anoMes)} — ${f ? rotuloDaFazenda({ id: f.id, nome: f.nome, codigo: f.codigo ?? null }) : ''} (o peso mudou depois da validação)`,
        acao: 'Revalidar', onIr: () => onIrPara?.('valor-rebanho', r.fazendaId) };
    }),
    ...(aRevalidar.erro ? [{ id: 'vr-erro', texto: aRevalidar.erro, acao: 'Abrir', onIr: () => irPara('valor-rebanho') }] : []),
  ];

  /* os blocos por atividade: as ligadas do cliente (Code 6); sem cadastro ou com falha, as famílias com área */
  const gruposComArea: GrupoAtividade[] = [];
  if ((areaPec ?? 0) > 0) gruposComArea.push('pecuaria');
  if ((areaAgri ?? 0) > 0) gruposComArea.push('agricultura');
  if ((areaSilvi ?? 0) > 0) gruposComArea.push('silvicultura');
  /* numa fazenda só, o bloco da atividade que ela não tem (0 ha) não aparece; no Global, todas as ligadas do cliente */
  const atividadesVG = blocosDaVisao(atividadesLidas, gruposComArea).filter(a => isGlobal || gruposComArea.includes(a.grupo));
  const codigosCom = (atividade: string) => linhasFazendasVG.filter(l => l.atividades.includes(atividade)).map(l => l.rotulo.split(' · ')[0]).join(', ');
  const subVG = (ha: number | null, atividade: string) => [fmtHa(ha), isGlobal ? codigosCom(atividade) : null].filter(Boolean).join(' · ') || undefined;
  /* VISAO-GERAL-05 — os indicadores da Pecuária numa linha (@ no ano · @/ha · GMD · UA/ha · custo/@ · margem/@), cada um com a variação
     contra a meta (só para quem a vê) e contra o ano anterior. A DRE pelos MESMOS meses; o rebanho pelos indicadores do PC-100. */
  const pecuariaVG = indicadoresPecuaria({
    real: drePecReal, meta: drePecMeta, anoAnt: drePecAnt,
    gmd: gmdIndicador ? { valor: gmdIndicador.valor, deltaMeta: gmdIndicador.deltaMeta, deltaAno: gmdIndicador.deltaAno } : null,
    uaHa: uaHaIndicador ? { valor: uaHaIndicador.valor, deltaMeta: uaHaIndicador.deltaMeta, deltaAno: uaHaIndicador.deltaAno } : null,
    podeVerMeta,
  });
  const [verPorFazenda, setVerPorFazenda] = useState(false);

  /* Area e lotacao SEMPRE do snapshot oficial. A view tem area propria e
     lotacao derivada dela — divergentes (Pureza jul/2026: 4.726 ha e 0,73
     contra 3.595 ha e 0,96). Cruzar por fazenda_id e recalcular. */

  /* Total consome os indicadores do PC-100, os MESMOS objetos dos tiles do bloco
     Eficiencia. Bate por construcao, nao por coincidencia. NAO recalcular: o GMD,
     em especial, nao e reproduzivel a partir das colunas da view (medido: 0,355
     contra 0,378 na Pureza — o denominador nao e cabecas finais).
     Area e a excecao: e area, nao indicador, entao soma as linhas.
     Desfrute divide SOMAS, nunca promedia percentuais. */

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

  /**
   * O CAIXA REAL DO PERÍODO, pela régua dos lançamentos — VISAO-GERAL-CAIXA-REGUA-01.
   *
   * ⚠ O CARD NÃO EXCLUÍA NADA: ele somava uma LISTA CURADA de indicadores
   * nomeados (Custeio, Dividendos, Deduções…), e o que não tivesse linha
   * simplesmente sumia. O Adiantamento de Boitel — `Saída Financeira` /
   * `Movimentações Financeiras`, R$ 141.702,00 em 2026 na Vera — é pagamento a
   * TERCEIRO, dinheiro real saindo, e não tinha indicador. Virava "diferença".
   *
   * ⚠ TRANSFERÊNCIA INTRA-UNIVERSO FICA FORA, a mesma lição do `movimentoNaConta`:
   * com as duas pontas em contas do universo o dinheiro não saiu do caixa. Com
   * uma ponta só, saiu de verdade e entra.
   */
  const caixaReal = useMemo(() => {
    /* O ROL DE CONTAS SOMADO — o universo contra o qual "interna" se define.
       Sem ele, "as duas pontas" seria só "as duas preenchidas", e uma
       transferência para conta de outro cliente passaria por interna. */
    const contasDoUniverso = new Set(
      lancFinShared.flatMap(l => [l.conta_bancaria_id, l.conta_destino_id])
        .filter((x): x is string => !!x));
    let ent = 0, sai = 0;
    const porCategoria = new Map<string, number>();
    for (const l of lancFinShared) {
      const d = (l.data_pagamento ?? '').slice(0, 10);
      if (!d || Number(d.slice(0, 4)) !== anoNum) continue;
      const m = Number(d.slice(5, 7));
      if (isPeriodo ? m > mesNum : m !== mesNum) continue;
      if ((l.status_transacao ?? '').toLowerCase() === 'previsto') continue;
      /* ⚠ AS DUAS PONTAS, POR ID, CONTRA O ROL SOMADO — VISAO-GERAL-CAIXA-REGUA-02.
         O filtro anterior lia `conta_origem`/`conta_destino`, que são os campos
         de TEXTO do adapter e valem SEMPRE `null` no V2 (`useFinanceiro:225`):
         a condição nunca era verdadeira, e toda transferência interna entrava
         como saída real. Medido em Vera/jan-26: 7 transferências com as duas
         pontas preenchidas somando R$ 235.457,49 — o valor exato que aparecia
         em "Outras saídas" e no rodapé vermelho.
         ⚠ E A EXCLUSÃO SÓ VALE COM AS DUAS PONTAS DENTRO do universo somado —
         terceira vez que esta lição aparece nesta série. Uma perna só é dinheiro
         que saiu de verdade: transferir para conta de terceiro reduz o caixa. */
      const origemDentro = !!l.conta_bancaria_id && contasDoUniverso.has(l.conta_bancaria_id);
      const destinoDentro = !!l.conta_destino_id && contasDoUniverso.has(l.conta_destino_id);
      if (origemDentro && destinoDentro) continue;
      const v = Math.abs(Number(l.valor) || 0);
      if (v === 0) continue;
      if (l.tipo_operacao === '1-Entradas') ent += v; else sai += v;
      const chave = l.centro_custo || l.macro_custo || 'Sem classificação';
      porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + v);
    }
    return { entradas: ent, saidas: sai, porCategoria };
  }, [lancFinShared, anoNum, mesNum, isPeriodo]);

  const totalEntradasExibidas = somaLinhas((resumido ? entradasResumo : entradasVisiveis).map(l => l.valor));
  const totalSaidasExibidas   = somaLinhas((resumido ? saidasResumo : saidasCaixa).map(l => l.valor));

  /* ⚠ A LINHA DE FECHAMENTO É DIFERENÇA CONTRA OS LANÇAMENTOS, nunca contra o
     SALDO declarado. Preenchê-la com a diferença do saldo faria o card fechar
     sempre — inclusive havendo defeito — e o rodapé vermelho, que deve virar
     alarme raro e grave, nunca mais dispararia. "Outras" explica o que os
     indicadores não cobrem; o rodapé segue conferindo lançamentos contra o
     extrato, que é outra pergunta. */
  const outrasSaidas   = Math.round((caixaReal.saidas   - totalSaidasExibidas) * 100) / 100;
  const outrasEntradas = Math.round((caixaReal.entradas - totalEntradasExibidas) * 100) / 100;

  /**
   * O QUE COMPÕE "OUTRAS", no hover — a linha tem de se explicar, senão troca um
   * rodapé vermelho por um número mudo.
   *
   * ⚠ É PISTA, NÃO DECOMPOSIÇÃO EXATA: mostra as maiores categorias do período,
   * e nem todas estão inteiramente fora dos indicadores. O número de "Outras" é
   * exato; a atribuição por categoria é indicativa, e dizer o contrário
   * prometeria uma precisão que esta conta não tem.
   */
  const detalheOutras = useMemo(() => {
    const top = [...caixaReal.porCategoria.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([c, v]) => `${c}: ${fmtR(v)}`);
    return top.length
      ? `O que os indicadores nomeados não cobrem. Maiores categorias do período — ${top.join(' · ')}`
      : 'O que os indicadores nomeados não cobrem neste período.';
  }, [caixaReal]);

  const totalEntradas = totalEntradasExibidas + Math.max(0, outrasEntradas);
  const totalSaidas   = totalSaidasExibidas   + Math.max(0, outrasSaidas);

  /* MOSTRAR, NAO FORCAR. Se a conta nao fecha, a diferenca aparece — maquiar seria
     inventar. Tolerancia de R$ 1,00 para nao exibir centavo de arredondamento. */
  const difCaixa = (saldoInicial != null && saldoFinal != null)
    ? saldoFinal - (saldoInicial + totalEntradas - totalSaidas)
    : null;
  const mostrarDifCaixa = difCaixa != null && Math.abs(difCaixa) > 1;













  /* Delta contra a META do MESMO recorte, como o bloco Zootecnico. O hook
     agrega `mesAtual` e `meta` sobre os MESMOS meses (`mesesPeriodo`), entao
     os dois seguem o `viewMode` da tela juntos: em "No período" a comparacao
     ja e acumulada, e a irregularidade do planejamento mensal se dilui sem
     precisar de teto nem supressao.
     ⚠ Meta ZERO devolve `null`, nunca `+∞` nem `0%`: sem meta no recorte nao
     ha o que comparar, e o travessao ali passa a ser VERDADEIRO em vez de
     acidental — que era o defeito, quatro `delta: null` escritos a mao. */

  /* Acelerador POR METRICA do card Movimentacoes: quanto das cabecas do ANO ja
     passaram, contra a meta anual, com marca onde o plano previa estar no mes.
     ⚠ ANUAL: nao muda entre "No mes" e "No periodo". As quatro metricas ao lado
     seguem o recorte da tela; os quatro arcos, nao. Por isso o SVG carrega a
     palavra "no ano" — sem ela o card afirmaria as duas coisas sem dizer qual.
     ⚠ `seriesAcumulada.cab` ja vem acumulada Jan→mes do proprio hook
     (useMovimentacoesAgregadas:443-444): nada e' reagregado aqui.
     ⚠ Serie de 13 posicoes, 1-indexada, com ZERO literal no indice 0 — o tipo
     diz isso em SeriesJanDez:52. Difere das series de arrobas, onde o indice 0
     e' NaN; nao afeta estes indices, mas quem varrer a serie inteira precisa
     saber. `at` e' a mesma regra das duas convencoes usada no acelerador do
     Zootecnico e no deltaFin. Local de proposito: a unificacao das copias e'
     o PR-SERIE-INDICE-01.
     ⚠ metaAno ausente ou zero: AQUELE arco nao renderiza e o par vira so a
     metrica, como era antes. Os outros tres seguem. Sem fallback e sem
     mesNum/12 — inventar plano que ninguem escreveu e' pior que nao mostrar. */




  return (
    <>
      {onAnoChange && (
        <div className="mb-2 px-1">
          <SeletorPeriodo
            modo="ano"
            periodo={anoInteiro(Number(ano))}
            onPeriodoChange={(p) => onAnoChange(String(p.de.ano))}
          />
        </div>
      )}

    <div className="px-2 pb-3">
      {/* VISAO-GERAL-03 (Gabriel 04/11 06:28) — o cabeçalho é uma faixa pequena, na escala da barra da Geo pastos: o cumprimento numa linha
          de 11 px, o status e "No mês | No ano" (o `Segmentado` de lá, 22 px) ao lado, e a régua compacta dos meses embaixo.
          Fundo SÓLIDO (o gate recusa cabeçalho preso transparente: o conteúdo aparecia por trás ao rolar). */}
      <div className="sticky top-0 z-30 -mx-2 mb-1.5 flex flex-col gap-1 border-b border-border bg-background px-2.5 py-1.5" data-testid="vg-cabecalho">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="whitespace-nowrap text-[11px] font-semibold text-foreground">
            {g}{clienteAtual ? ', ' + clienteAtual.nome : ''}
          </h2>
          <span className="min-w-0 truncate text-[9.5px] text-muted-foreground">
            {isGlobal ? 'Todas as fazendas' : fazendaAtual?.nome} · {ml}
          </span>
          <StatusFechamentoBanda
            status={statusFechamento}
            isGlobal={isGlobal}
            loading={loadingStatusFechamento}
            mesLabel={ml}
            onIrPara={onIrPara}
          />
          {onViewModeChange && (
            <div className="ml-auto flex-none">
              <Segmentado valor={viewMode} onEscolher={onViewModeChange} altura={22}
                opcoes={[{ valor: 'mes', rotulo: 'No mês' }, { valor: 'periodo', rotulo: 'No ano' }]} />
            </div>
          )}
        </div>
        <ReguaMeses
          celulas={gradeEscopo}
          mesSelecionado={mesNum}
          ano={anoNum}
          loading={loadingGradeAno}
          erro={erroGradeAno}
          onMesChange={onMesChange}
          meses={MES_ABREV}
        />
      </div>
      <div className="flex flex-col gap-1.5" data-testid="vg-pilha">

      {/* VISAO-GERAL-03/04 — os números numa faixa só (o `Kpi` da Geo pastos), todos com número: Área produtiva · Rebanho · Lotação ·
          Caixa no fim do mês · Resultado do ano */}
      <CartoesDoTopo cartoes={cartoesVG} carregando={loadingPainel} />

      {/* VISAO-GERAL-03 — as duas colunas da Geo pastos › Global (de 1280 px para cima): o conteúdo à esquerda e, à direita, 272 px com o
          mapa das fazendas. Abaixo disso a coluna dos mapas sobe para o topo, na largura toda (a 1000 px os 272 apertavam a tabela). */}
      <div className="grid min-w-0 grid-cols-1 gap-1.5 xl:grid-cols-[minmax(0,1fr)_272px]">
      <div className="flex min-w-0 flex-col gap-1.5" data-testid="vg-coluna-esq">

      {/* PRIMEIRA LINHA: Area e Caixa sao filhos DIRETOS do grid, entao a linha
          alinha a altura dos dois. Decisao explicita (Gabriel, 21/08), ciente de
          que o card mais baixo ganha espaco vazio embaixo — e o oposto do que
          motivou e948a653. Com as duas tabelas dentro do card de Area, ele tende
          a ser o mais alto e o branco cai no Caixa.
          Os DEMAIS blocos seguem em duas colunas empilhadas, logo abaixo. */}
      {/* VISAO-GERAL-04 — Área num card ESTREITO (a largura da rosca + legenda) e, ao lado, o Caixa com a sobra, os dois na MESMA altura */}
      <div className="grid grid-cols-1 items-stretch gap-1.5 lg:grid-cols-[auto_minmax(0,1fr)]">

        <div className="min-w-0">
        {/* col-span-2 porque o miolo do SectionBlock e uma grade de DUAS colunas,
            feita para MetricTile. Sem isso a barra ocupava meia largura e o rodape
            subia para a coluna da direita, ao lado dos numeros em vez de abaixo. */}
        <SectionBlock
          title={isPeriodo ? 'Área média no período' : 'Área no mês'}
          className="h-full" testid="vg-area"
          acao={isGlobal && areaPorFazendaMes.length > 0 ? (
            <button type="button" className="text-primary hover:underline" onClick={() => setVerPorFazenda(true)} data-testid="vg-ver-por-fazenda">
              Ver por fazenda ›
            </button>
          ) : undefined}
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
                <div className="flex items-start gap-3">
                  {/* Donut maior: coluna propria a esquerda. O viewBox e a
                      espessura sao os mesmos — so a caixa renderizada cresce,
                      entao a proporcao do anel nao muda. */}
                  <svg viewBox="0 0 80 80" className="h-24 w-24 shrink-0 -rotate-90">
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
                  {/* VISAO-GERAL-02 — o destaque grande da Área Produtiva (24px) saiu: "nada de texto grande" (regra do Gabriel), e o número
                      agora é o do cartão "Área produtiva" no topo — a mesma conta, um lugar só. A linha "Área Produtiva" da legenda fica. */}
                </div>
              );
            })()}

            {/* Metade 2: a mesma fonte, o mesmo mes, o mesmo viewMode — aberta por
                fazenda. Era card proprio; a divisao entre os dois nao correspondia a
                nada. So no Global: em fazenda especifica seria uma linha repetindo a
                legenda acima. */}
            {/* VISAO-GERAL-02 — a distribuição por fazenda abre num DIÁLOGO pelo "Ver por fazenda ›": aberta no bloco, ela empurrava
                a página inteira para baixo (regra "nada pula"). A tabela e a conta são as mesmas. */}
            {isGlobal && areaPorFazendaMes.length > 0 && (
              <Dialog open={verPorFazenda} onOpenChange={setVerPorFazenda}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle className="text-[11px] font-semibold">Distribuição de áreas por fazenda · {ml}</DialogTitle>
                </DialogHeader>
              <div data-testid="vg-area-por-fazenda">
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
              </DialogContent>
              </Dialog>
            )}
          </div>
        </SectionBlock>
        </div>

        <div className="min-w-0">
        {/* NAO recebe naoFechado: caixa nao depende de fechamento de rebanho.
            O conteudo vai num col-span-2 porque o miolo do SectionBlock e uma grade de
            DUAS colunas, feita para MetricTile — e aqui e uma LISTA de linhas. */}
        <SectionBlock
          title={isPeriodo ? 'Caixa no período' : 'Caixa no mês'}
          subtitle="regime de caixa · sem transferências"
          className="h-full" testid="vg-caixa"
          /* VISAO-GERAL-04 — Resumido | Macro no cabeçalho do card (o `Segmentado` da Geo pastos): a linha a menos deixa o Caixa na altura
             da Área. Estado NAO persiste — trocar de mes ou de viewMode remonta o card em 'resumido'. */
          acao={<Segmentado valor={modoCaixa} onEscolher={setModoCaixa} altura={22}
            opcoes={[{ valor: 'resumido', rotulo: 'Resumido' }, { valor: 'macro', rotulo: 'Macro' }]} />}
        >
          {/* -mt-1 puxa a primeira linha para cima, encostando no titulo. Aplicado
             SO aqui: o respiro vem do SectionBlock, que e usado por todos os blocos
             e nao pode ser alterado por causa de um. */}
          <div className="col-span-2 -mt-1 space-y-0.5">

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
              {/* Linha de FECHAMENTO — o resto que os indicadores não cobrem.
                  A classe não tem lado: ninguém via o furo das entradas porque a
                  diferença é líquida. */}
              {outrasEntradas > 1 && (
                <div title={detalheOutras}>
                  <LinhaCaixa label="Outras entradas" valor={outrasEntradas} />
                </div>
              )}
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
                {/* ⚠ LINHA DE FECHAMENTO, não indicador de domínio. Fica FORA dos
                  grupos, no fim e apagada: não é família de custo — é o resto que
                  os indicadores nomeados não cobrem. O hover a explica; sem ele,
                  "Outras" trocaria um rodapé vermelho por um número mudo. */}
                {outrasSaidas > 1 && (
                <div title={detalheOutras}>
                  <LinhaCaixa label="Outras saídas" valor={outrasSaidas} />
                </div>
                )}
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

          </div>
        </SectionBlock>
        </div>

      </div>

      {/* VISAO-GERAL-02 — abaixo de Área e Caixa, na ordem do mock aprovado: Fazendas → atenção e atalhos → um bloco por atividade */}
      {linhasFazendasVG.length > 0 && (
        <TabelaFazendasVG linhas={linhasFazendasVG} mesCurto={mesCurtoVG}
          onEscolher={isGlobal ? (id) => { const f = fazendas.find(x => x.id === id); if (f) setFazendaAtual(f); } : undefined} />
      )}
      {/* VISAO-GERAL-04 — os Atalhos saíram (o menu lateral já faz isso); "Precisa de atenção" foi para a coluna da direita */}
      </div>

      {/* VISAO-GERAL-03/04 — a coluna da direita, preenchida de cima a baixo: o "Mapa das fazendas" (a MESMA peça da Geo pastos: sigla,
          kg/ha na cor da situação, "cab sem mapa"; o clique abre a fazenda na Geo pastos, com "‹ Voltar à Visão Geral") e, embaixo,
          "Precisa de atenção", que estica até o fim da coluna da esquerda (nada de branco embaixo). */}
      {/* `contain: size` (de 1280 px para cima): a coluna da direita NÃO dita a altura da linha — ela tem a altura da esquerda. Com muitas
          fazendas, as miniaturas rolam dentro do card (como na Geo pastos) e "Precisa de atenção" fica inteiro embaixo; com poucas, ela
          estica até o fim. Nos dois casos nenhuma coluna fica com branco no pé. */}
      <div className="order-first flex min-w-0 flex-col gap-1.5 xl:order-none xl:[contain:size]" data-testid="vg-coluna-dir">
        <Card titulo="Mapa das fazendas" className="min-h-[96px] flex-[0_1_auto]" testid="vg-mapa-fazendas"
          extra={<span className="ml-auto whitespace-nowrap text-[9.5px] text-muted-foreground">clique para abrir</span>}>
          <div className="grid max-h-[260px] min-h-0 grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable] xl:grid-cols-2">
            {mapaDasFazendas.fazendas.map(l => (
              <MiniaturaDaFazenda key={l.fazenda.id} linha={l} geometrias={mapaDasFazendas.geometriasPorFazenda.get(l.fazenda.id) ?? []}
                situacaoDoPasto={mapaDasFazendas.situacaoDoPasto} onAbrir={() => onIrPara?.('mapa-geo-pastos', l.fazenda.id)} />
            ))}
            {mapaDasFazendas.fazendas.length === 0 && (
              <span className="col-span-2 text-[9.5px] text-muted-foreground">{mapaDasFazendas.carregando ? 'Lendo o mês…' : 'Nenhuma fazenda com pecuária.'}</span>
            )}
          </div>
          <div className="flex-none px-2.5 pb-2"><LegendaDasSituacoes /></div>
        </Card>
        <PrecisaDeAtencao itens={atencaoVG} carregando={loadingGradeAno || carregandoConc || aRevalidar.carregando} className="xl:flex-[1_0_auto]" />
      </div>
      </div>

      {/* VISAO-GERAL-04 — os blocos por atividade na largura toda, abaixo das duas colunas: a grade fecha nas duas (o bloco é largo; na
          coluna da esquerda ele deixava a da direita com um buraco embaixo) */}
      <BlocosPorAtividade
        atividades={atividadesVG}
        pecuaria={pecuariaVG}
        silviculturaHa={areaSilvi ?? null}
        clienteId={clienteAtual?.id ?? null}
        anoMes={anoMesVG}
        subPorGrupo={{ pecuaria: subVG(areaPec ?? null, 'Pecuária'), agricultura: subVG(areaAgri ?? null, 'Agricultura'), silvicultura: subVG(areaSilvi ?? null, 'Silvicultura') }}
        onAbrir={(g) => irPara(g === 'pecuaria' ? 'fechamento' : g === 'agricultura' ? 'dre' : 'mapa-geo-pastos')}
      />
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
                <DialogTitle className="flex items-baseline justify-between gap-4 text-[11px] font-semibold">
                  <span>{linhaCaixaModal}</span>
                  <span className="tabular-nums text-[14px]">{fmtR(total)}</span>
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

      {/* VISAO-GERAL-02 — os modais de historico por indicador e o modal por assunto sairam junto com os blocos legados que os abriam. */}
    </div>
    </>
  );
}
