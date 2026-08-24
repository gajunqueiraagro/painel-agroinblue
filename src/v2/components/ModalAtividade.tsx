/**
 * Modal de ATIVIDADE — varios indicadores, uma leitura por vez.
 *
 * POR QUE NAO E O IndicadorHistoricoModal. Aquele resolve o problema
 * inverso: UM indicador com DUAS leituras lado a lado. Forcar os dois usos
 * num componente so produziria o pior dos dois. O idioma visual e copiado
 * dele — grade 0.15, eixos 0.22, ticks de 8px, DOT_V1, COR_FAZENDA — mas a
 * casca e propria.
 *
 * ⚠ DUAS ARMADILHAS JA PAGAS, ambas no A13 de docs/PADROES-UI.md:
 *  1. `flex-1 min-h-0` cede ate ZERO quando o irmao nao cede. O miolo leva
 *     piso INLINE (`minHeight`), nao so `min-h-0` — foi o colapso a 20px do
 *     PR-26/27.
 *  2. Radix Tabs NAO desmonta o painel inativo e ele divide o espaco ao
 *     meio. Por isso os tres niveis aqui sao BOTOES com estado local: mais
 *     simples e sem a armadilha. Nao trocar por <Tabs> sem `data-[state=
 *     inactive]:hidden`.
 *
 * FONTE UNICA. Este componente NAO chama `usePainelConsultorData`. Sao seis
 * indicadores; se cada card montasse a propria fonte, abrir o modal montaria
 * o painel seis vezes. Tudo chega por prop, da instancia principal do
 * V2Home. A proibicao e do briefing e vale para qualquer indicador novo.
 *
 * As constantes visuais estao duplicadas do IndicadorHistoricoModal porque
 * la elas nao sao exportadas e este PR tem escopo de tres arquivos.
 * Unificar num modulo de idioma e frente propria.
 */
import { useEffect, useState } from 'react';
import {
  ComposedChart, Line, Area, Bar, BarChart, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { COR_FAZENDA } from '@/v2/components/IndicadorHistoricoModal';

/* ── Idioma visual V1, copiado ─────────────────────────────────────── */
const DOT_V1      = { r: 2, strokeWidth: 1.5, fill: 'hsl(var(--card))' };
const COR_ATUAL   = '#185FA5';
const COR_ANO_ANT = '#B4B2A9';
const COR_META    = '#F97316';
const BAR_ANO_ANT = '#B4B2A9';
const COR_GLOBAL  = 'hsl(var(--muted-foreground))';
const CHAVE_GLOBAL = '__global';
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export type FormatoValor =
  | 'inteiro' | 'decimal1' | 'decimal2' | 'decimal3' | 'moeda' | 'moedaAbreviada';

export type AnoValor = { ano: number; valor: number | null };

export interface SerieFazendaAtiv {
  fazendaId: string;
  nome: string;
  codigo: string;
  mes: Array<number | null>;
  periodo: Array<number | null>;
}

/** Um card do modal. Tudo pronto: o modal nao calcula nem deriva. */
export interface IndicadorAtividade {
  chave: string;
  titulo: string;
  subtitulo: string;
  tituloMes?: string;
  tituloPeriodo?: string;
  unidade?: string;
  formatoValor: FormatoValor;
  /** Onde subir e RUIM, o delta positivo pinta vermelho (PR-14). */
  polaridade?: 'positivoBom' | 'positivoRuim';
  /** 13 posicoes, 1=Jan. Uma por leitura. */
  serieMes: number[];
  seriePeriodo: number[];
  serieAnoAntMes?: number[];
  serieAnoAntPeriodo?: number[];
  serieMetaMes?: number[];
  serieMetaPeriodo?: number[];
  valorMes: number | null;
  valorPeriodo: number | null;
  deltaMes: number | null;
  deltaAno: number | null;
  deltaMeta: number | null;
  /** `undefined` = sem serie por fazenda; o card mostra "em construção". */
  porFazenda?: SerieFazendaAtiv[];
  /** `undefined` = sem historico; o card mostra "em construção". */
  historico?: { mes: AnoValor[]; periodo: AnoValor[] };
}

interface Props {
  open: boolean;
  onClose: () => void;
  mesAtual: number;
  anoAtual: number;
  clienteNome: string;
  indicadores: IndicadorAtividade[];
  codigosFazendas: string[];
  loadingHistorico?: boolean;
}

type Assunto  = 'zootecnico' | 'movimentacoes' | 'financeiro' | 'operacional';
type Escopo   = 'global' | 'fazenda';
type Leitura  = 'mes' | 'periodo' | 'historico';
type Comparador = 'meta' | 'mes' | 'anoAnt';

const ASSUNTOS: Array<{ id: Assunto; rotulo: string }> = [
  { id: 'zootecnico',    rotulo: 'Zootécnico' },
  { id: 'movimentacoes', rotulo: 'Movimentações' },
  { id: 'financeiro',    rotulo: 'Financeiro' },
  { id: 'operacional',   rotulo: 'Operacional' },
];

const fmtN = (v: number | null | undefined, casas: number) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

const fmtR = (v: number | null | undefined) =>
  v == null || isNaN(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtRAbrev = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const f = (n: number, s: string) => `R$ ${n.toFixed(1).replace('.', ',')}${s}`;
  if (abs >= 1e9) return f(v / 1e9, 'B');
  if (abs >= 1e6) return f(v / 1e6, 'M');
  if (abs >= 1e3) return f(v / 1e3, 'K');
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
};

const fmtValor = (v: number | null | undefined, fmt: FormatoValor, unidade?: string) => {
  const suf = unidade ? ' ' + unidade : '';
  if (fmt === 'inteiro')        return fmtN(v, 0) + suf;
  if (fmt === 'decimal1')       return fmtN(v, 1) + suf;
  if (fmt === 'decimal2')       return fmtN(v, 2) + suf;
  if (fmt === 'decimal3')       return fmtN(v, 3) + suf;
  if (fmt === 'moeda')          return fmtR(v);
  return fmtRAbrev(v);
};

/* Eixo: acima de mil sem decimal — "50.000,0" nao cabe na canaleta. */
const fmtEixo = (v: number | null | undefined, fmt: FormatoValor): string => {
  if (v == null || isNaN(v)) return '';
  if (fmt === 'moedaAbreviada') return fmtRAbrev(v).replace('R$ ', '');
  if (Math.abs(v) >= 1000) return fmtN(v, 0);
  if (fmt === 'decimal3') return fmtN(v, 3);
  if (fmt === 'decimal2') return fmtN(v, 2);
  if (fmt === 'decimal1') return fmtN(v, 1);
  return fmtN(v, 0);
};

/** 13 posicoes, 1=Jan; 12 posicoes, 0=Jan. Decide pelo comprimento. */
const valorDoMes = (serie: number[] | undefined, mes: number): number | null => {
  if (!serie || mes < 1 || mes > 12) return null;
  const v = serie.length >= 13 ? serie[mes] : serie[mes - 1];
  return v != null && !isNaN(v) ? v : null;
};

const btn = (ativo: boolean, tamanho: 'g' | 'p') =>
  [
    tamanho === 'g' ? 'px-3 h-7 text-[11px]' : 'px-2.5 h-6 text-[10px]',
    'rounded-md border transition-colors whitespace-nowrap',
    ativo
      ? 'bg-primary text-primary-foreground border-primary font-medium'
      : 'bg-card text-muted-foreground border-border/50 hover:bg-muted/50',
  ].join(' ');

const EmConstrucao = ({ motivo }: { motivo: string }) => (
  <div className="flex-1 flex items-center justify-center" style={{ minHeight: 150 }}>
    <p className="text-[10px] text-muted-foreground/70 italic text-center px-4">
      em construção<br />
      <span className="text-[9px] not-italic">{motivo}</span>
    </p>
  </div>
);

export function ModalAtividade({
  open, onClose, mesAtual, anoAtual, clienteNome, indicadores, codigosFazendas,
  loadingHistorico,
}: Props) {
  const [assunto, setAssunto] = useState<Assunto>('zootecnico');
  const [escopo,  setEscopo]  = useState<Escopo>('global');
  const [leitura, setLeitura] = useState<Leitura>('mes');
  /* Um comparador por card — o seletor vive no topo direito de cada
     grafico, nao no cabecalho do modal. Abre em `meta`. */
  const [comparador, setComparador] = useState<Record<string, Comparador>>({});

  /* Estado reiniciado a cada abertura: reabrir num nivel que ficou de uma
     sessao anterior desorienta — o modal sempre comeca no mesmo lugar. */
  useEffect(() => {
    if (open) {
      setAssunto('zootecnico');
      setEscopo('global');
      setLeitura('mes');
      setComparador({});
    }
  }, [open]);

  if (!open) return null;

  const yy = String(anoAtual).slice(-2);
  const rotuloMes = `${MESES[mesAtual - 1]}/${yy}`;
  const rotuloPer = `Jan–${MESES[mesAtual - 1]}/${yy}`;

  /* Uma linha por mes, colunas por serie. `atual` para em `mesAtual`; meta e
     ano anterior seguem Jan–Dez, que e o padrao dos modais executivos. */
  const dadosGlobal = (ind: IndicadorAtividade) => {
    const sAtual = leitura === 'periodo' ? ind.seriePeriodo : ind.serieMes;
    const sAnt   = leitura === 'periodo' ? ind.serieAnoAntPeriodo : ind.serieAnoAntMes;
    const sMeta  = leitura === 'periodo' ? ind.serieMetaPeriodo : ind.serieMetaMes;
    return MESES.map((m, idx) => ({
      mes: m,
      atual:       idx + 1 <= mesAtual ? valorDoMes(sAtual, idx + 1) : null,
      anoAnterior: valorDoMes(sAnt, idx + 1),
      meta:        valorDoMes(sMeta, idx + 1),
    }));
  };

  /* Series por fazenda tem 12 posicoes, 0=Jan — leitura por indice DIRETO.
     O Global entra como coluna propria, tracejado por cima. */
  const dadosFazenda = (ind: IndicadorAtividade) => {
    const campo = leitura === 'periodo' ? 'periodo' : 'mes';
    const sGlobal = leitura === 'periodo' ? ind.seriePeriodo : ind.serieMes;
    return MESES.map((m, idx) => {
      const linha: Record<string, string | number | null> = { mes: m };
      for (const f of ind.porFazenda ?? []) {
        const v = f[campo][idx];
        linha[f.codigo] = typeof v === 'number' && Number.isFinite(v) ? v : null;
      }
      linha[CHAVE_GLOBAL] = idx + 1 <= mesAtual ? valorDoMes(sGlobal, idx + 1) : null;
      return linha;
    });
  };

  /* O nivel 3 SUBSTITUI mes/periodo, entao nao ha leitura selecionada aqui.
     As barras usam a serie do MES — "quanto foi julho de cada ano" — que e a
     comparacao que o historico responde. A serie do periodo chega no mesmo
     objeto e fica sem consumidor: se o quarto botao ("Histórico acumulado")
     existir um dia, e so ela. */
  const barrasHistorico = (ind: IndicadorAtividade) => {
    const lista = ind.historico?.mes;
    return (lista ?? [])
      .filter(p => p.valor != null && !isNaN(p.valor))
      .map(p => ({ nome: String(p.ano), valor: p.valor as number, atual: p.ano === anoAtual }));
  };

  const Comparacao = ({ ind }: { ind: IndicadorAtividade }) => {
    const c = comparador[ind.chave] ?? 'meta';
    const d = c === 'meta' ? ind.deltaMeta : c === 'mes' ? ind.deltaMes : ind.deltaAno;
    if (d == null || isNaN(d)) return <span className="text-[9px] text-muted-foreground/60">—</span>;
    const bom = ind.polaridade === 'positivoRuim' ? d < 0 : d > 0;
    return (
      <span className={`text-[10px] font-medium ${bom ? 'text-emerald-600' : 'text-red-600'}`}>
        {d > 0 ? '+' : ''}{d.toFixed(1)}%
      </span>
    );
  };

  const CardIndicador = ({ ind }: { ind: IndicadorAtividade }) => {
    const titulo = leitura === 'periodo'
      ? (ind.tituloPeriodo ?? ind.titulo)
      : (ind.tituloMes ?? ind.titulo);
    /* No historico o recorte de cada barra continua sendo o do nivel
       anterior — mas o nivel 3 substitui mes/periodo, entao o subtitulo
       declara a janela de anos, nao o mes. */
    const sub = leitura === 'historico'
      ? `${anoAtual - 5}–${anoAtual}`
      : leitura === 'periodo' ? rotuloPer : rotuloMes;
    const valor = leitura === 'periodo' ? ind.valorPeriodo : ind.valorMes;
    const c = comparador[ind.chave] ?? 'meta';

    return (
      <Card className="flex flex-col min-h-0">
        <CardContent className="p-3 flex flex-col flex-1 min-h-0">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground leading-tight truncate">{titulo}</p>
              <p className="text-[10px] text-muted-foreground/70 leading-snug">{sub}</p>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-sm font-bold text-foreground leading-none tabular-nums">
                {fmtValor(valor, ind.formatoValor, ind.unidade)}
              </span>
              {/* O seletor de comparacao SO existe no Global: na aba Por
                  fazenda as series sao LUGARES, nao cenarios, e comparar com
                  meta ali seria outra pergunta. */}
              {escopo === 'global' && leitura !== 'historico' && (
                <div className="flex items-center gap-1">
                  <Comparacao ind={ind} />
                  <div className="flex gap-0.5">
                    {(['meta', 'mes', 'anoAnt'] as Comparador[]).map(op => (
                      <button
                        key={op}
                        onClick={() => setComparador(s => ({ ...s, [ind.chave]: op }))}
                        className={`px-1 h-4 rounded text-[8px] border ${
                          c === op
                            ? 'bg-muted text-foreground border-border'
                            : 'bg-transparent text-muted-foreground/60 border-transparent hover:bg-muted/40'
                        }`}
                      >
                        {op === 'meta' ? 'meta' : op === 'mes' ? 'mês' : 'ano ant.'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {escopo === 'fazenda' && !ind.porFazenda ? (
            <EmConstrucao motivo="sem série por fazenda" />
          ) : leitura === 'historico' && !ind.historico ? (
            <EmConstrucao motivo="sem histórico multi-ano" />
          ) : leitura === 'historico' && escopo === 'fazenda' ? (
            <EmConstrucao motivo="histórico por fazenda ainda não existe" />
          ) : (
            <div className="flex-1" style={{ minHeight: 150, maxHeight: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                {leitura === 'historico' ? (
                  <BarChart data={barrasHistorico(ind)}
                            margin={{ top: 16, right: 8, left: 8, bottom: 0 }} barCategoryGap="14%">
                    <XAxis dataKey="nome" tick={{ fontSize: 8, fill: '#888780' }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Bar dataKey="valor" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {barrasHistorico(ind).map((e, i) => (
                        <Cell key={i} fill={e.atual ? COR_ATUAL : BAR_ANO_ANT} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : escopo === 'fazenda' ? (
                  <ComposedChart data={dadosFazenda(ind)} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                    <YAxis tick={{ fontSize: 8, fill: '#888780' }} width={46}
                           tickFormatter={v => fmtEixo(v, ind.formatoValor)}
                           stroke="hsl(var(--muted-foreground) / 0.22)" />
                    <Tooltip formatter={(v: number) => fmtValor(v, ind.formatoValor, ind.unidade)} />
                    {/* Por `map`, NUNCA em fragmento: o recharts inspeciona
                        filhos por tipo e nao acha o que estiver embrulhado. */}
                    {(ind.porFazenda ?? []).map((f, i) => (
                      <Line key={f.fazendaId} type="monotone" dataKey={f.codigo}
                            stroke={COR_FAZENDA[i % COR_FAZENDA.length]} strokeWidth={2}
                            dot={DOT_V1} connectNulls={false} isAnimationActive={false} />
                    ))}
                    {/* Global DEPOIS, para ficar por cima. Tracejado porque e
                        referencia, nao mais um lugar. */}
                    <Line type="monotone" dataKey={CHAVE_GLOBAL} stroke={COR_GLOBAL}
                          strokeWidth={2.5} strokeDasharray="4 2" dot={DOT_V1}
                          connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={dadosGlobal(ind)} margin={{ top: 6, right: 8, left: 4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.15)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#888780' }} stroke="hsl(var(--muted-foreground) / 0.22)" />
                    <YAxis tick={{ fontSize: 8, fill: '#888780' }} width={46}
                           tickFormatter={v => fmtEixo(v, ind.formatoValor)}
                           stroke="hsl(var(--muted-foreground) / 0.22)" />
                    <Tooltip formatter={(v: number) => fmtValor(v, ind.formatoValor, ind.unidade)} />
                    <Area type="monotone" dataKey="anoAnterior" stroke="none"
                          fill={COR_ANO_ANT} fillOpacity={0.12} isAnimationActive={false} />
                    <Line type="monotone" dataKey="anoAnterior" stroke={COR_ANO_ANT}
                          strokeWidth={1.5} strokeDasharray="4 2" dot={false}
                          connectNulls={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="meta" stroke={COR_META}
                          strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                    <Area type="monotone" dataKey="atual" stroke="none"
                          fill={COR_ATUAL} fillOpacity={0.10} isAnimationActive={false} />
                    <Line type="monotone" dataKey="atual" stroke={COR_ATUAL}
                          strokeWidth={2.5} dot={DOT_V1} connectNulls={false} isAnimationActive={false} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-6xl mx-4 rounded-lg border border-border/40 bg-background shadow-xl flex flex-col h-[92vh] max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* CABECALHO congelado. `shrink-0` explicito: sem ele o cabecalho
            cederia altura para o miolo em viewport curto (A13). */}
        <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border/40 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {ASSUNTOS.map(a => (
              <button key={a.id} onClick={() => setAssunto(a.id)} className={btn(assunto === a.id, 'g')}>
                {a.rotulo}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['global', 'fazenda'] as Escopo[]).map(e => (
                <button key={e} onClick={() => setEscopo(e)} className={btn(escopo === e, 'p')}>
                  {e === 'global' ? 'Global' : 'Por fazenda'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['mes', 'periodo', 'historico'] as Leitura[]).map(l => (
                <button key={l} onClick={() => setLeitura(l)} className={btn(leitura === l, 'p')}>
                  {l === 'mes' ? 'No mês' : l === 'periodo' ? 'No período' : 'Histórico'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* MIOLO — o unico que rola. Piso INLINE, nao so `min-h-0`: irmao que
            nao cede empurra este a zero e o conteudo transborda (A13). */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3" style={{ minHeight: 200 }}>
          {assunto !== 'zootecnico' ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-muted-foreground/70 italic">
                em construção — este assunto entra num PR próprio
              </p>
            </div>
          ) : loadingHistorico && leitura === 'historico' ? (
            <p className="text-[10px] text-muted-foreground/70 py-2">Carregando...</p>
          ) : (
            /* Grade IGUAL nas duas abas: muda o conteudo do grafico, nao a
               forma da tela. */
            <div className="grid grid-cols-2 gap-3">
              {indicadores.map(ind => <CardIndicador key={ind.chave} ind={ind} />)}
            </div>
          )}
        </div>

        {/* RODAPE congelado. Os codigos tornam a ausencia legivel: fazenda
            sem linha no cache nao entra na aba Por fazenda, e quem some da
            lista some declaradamente (Art. 19, item 9). */}
        <div className="shrink-0 px-4 pb-2 pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {clienteNome} · {rotuloMes}
            {codigosFazendas.length > 0 && ` · ${codigosFazendas.join(' · ')}`}
          </span>
          <span>Clique fora para fechar</span>
        </div>
      </div>
    </div>
  );
}
