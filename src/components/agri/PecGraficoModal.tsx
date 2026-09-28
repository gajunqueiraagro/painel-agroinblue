/**
 * O MODAL DO GRÁFICO DO DRE DA PECUÁRIA — DRE-CASCATA-MODAL-01 (mock `docs/mocks/dre_cascata_modal_leitura_mock_v5.html`).
 *
 * ⚠ O BOTÃO "Gráfico" DEIXOU DE TROCAR A GRADE PELA CASCATA: ele abre este modal por cima da grade, com
 * duas abas — "Cascata do ano" (a `PecCascataView`, a mesma de antes, com as correções de cor e fonte) e
 * "Leitura dos anos" (uma coluna por ano do seletor do DRE). O estado continua na URL (`f_vista=grafico`):
 * o link que abria a cascata abre o modal.
 *
 * ⚠ A LARGURA É A DO CONTEÚDO (988 = 960 + 2 × 14), sem sobra lateral — decisão do Gabriel no mock v5.
 *
 * ⚠ NENHUM INDICADOR É CALCULADO NA TELA QUANDO HÁ CHAVE: tudo sai de `fn_dre_pecuaria` (a coluna da
 * grade), de `fn_dre_pecuaria_patrimonio` (a ponte do rebanho) e do cache só para o GMD. As razões moram
 * em `indicadoresDoAno` (`pecLeituraAnos.ts`), a mesma função que a cascata lê.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Segmentado } from '@/components/ui/segmentado';
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import type { ColunaPec } from '@/components/agri/drePecRegua';
import { PecCascataView, LARGURA_CASCATA } from '@/components/agri/PecCascataView';
import {
  indicadoresDoAno, variacaoNoAno, ehParcial, passosDaPonte, posicionarPonte, rsDoCentroDeVenda,
  razao, SUBCENTROS_SO_RS, COR_PONTE, type IndicadoresAno, type PassoPonte, type UnidadePonte,
} from '@/components/agri/pecLeituraAnos';
import { useDrePecuariaPatrimonioLista, type MovimentosPec } from '@/hooks/useDrePecuaria';
import { useGmdPeriodos, useVendaGeralPorSubcentro, mesesDoPeriodo } from '@/hooks/useLeituraAnosPec';

const NAVY = '#1D3A5D';
const VERDE_HEX = '#15803d';
const VERMELHO_HEX = '#b91c1c';
const ZEBRA_A = '#F5F4F0';
const ZEBRA_B = '#FFFFFF';
const SECAO = '#E8E6DF';
const traco = '—';

const LARG_MODAL = LARGURA_CASCATA + 28;
/** A coluna dos rótulos da tabela e a margem esquerda do gráfico do movimento — a MESMA régua. */
const L_ROTULO = 222;

type Aba = 'cascata' | 'leitura';
type AbaMov = 'global' | 'nascimentos' | 'compras' | 'desfrute' | 'mortes';

const n0 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 0));
const n2 = (v: number | null | undefined) => (v == null ? traco : formatNum(v, 2));
const s0 = (v: number | null | undefined) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 0)}`);
const s2 = (v: number | null | undefined) => (v == null ? traco : `${v > 0 ? '+' : ''}${formatNum(v, 2)}`);
const pct1 = (f: number | null | undefined) => (f == null ? traco : `${formatNum(f * 100, 1)}%`);
const spct1 = (f: number | null | undefined) => (f == null ? traco : `${f > 0 ? '+' : ''}${formatNum(f * 100, 1)}%`);
/** Cor pelo sinal: sobe verde, desce vermelho. `inverte` para custo e ágio, onde subir é ruim. */
const corDe = (v: number | null | undefined, inverte = false) =>
  (v == null || v === 0 ? '' : (v > 0) !== inverte ? 'text-emerald-700' : 'text-destructive');
const abrevMil = (v: number, un: string) =>
  (Math.abs(v) >= 1000 ? `${formatNum(v / 1000, 0)} mil ${un}` : `${formatNum(v, 0)} ${un}`);

/** O passo "bonito" da grade de um eixo: 1, 2, 2,5 ou 5 × potência de 10, com ~5 linhas.
    ⚠ O 2,5 EXISTE POR MEDIÇÃO: sem ele o rebanho do NJ (~106 mil @) ganhava passo de 50 mil e topo em 150 mil
    — um terço do gráfico vazio em cima. */
function passoDoEixo(amplitude: number) {
  if (!(amplitude > 0)) return 1;
  const bruto = amplitude / 5;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** O piso negativo do eixo: a margem negativa com folga, sem arredondar para um passo inteiro — com −10 de
    margem e passo de 200, o eixo descia a −200 e metade do gráfico ficava vazia (medido no NJ jan–ago/24). */
const pisoDoEixo = (chaoBruto: number) => (chaoBruto < 0 ? chaoBruto * 1.35 - 4 : 0);

export function PecGraficoModal({ aberto, onFechar, colunas, clienteId, clienteNome }: {
  aberto: boolean;
  onFechar: () => void;
  colunas: readonly ColunaPec[];
  clienteId: string | null | undefined;
  clienteNome?: string | null;
}) {
  const [aba, setAba] = useState<Aba>('cascata');
  const [anoCascata, setAnoCascata] = useState<string | null>(null);

  /* ⚠ OS ANOS DA LEITURA SÃO AS COLUNAS DE VALOR DO REALIZADO, DO CLIENTE INTEIRO, na ordem da grade (a
     mais antiga à esquerda). Meta e Δ não são ano; na visão "Por fazenda" sobra o Total — um ano só. */
  const anos = useMemo(
    () => colunas.filter(c => c.tipo === 'valor' && c.cenario === 'realizado' && c.fazendaId == null),
    [colunas]);
  const primeiro = anos[0]?.nome, ultimo = anos[anos.length - 1]?.nome;

  const abrirAno = (chave: string) => { setAnoCascata(chave); setAba('cascata'); };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent style={{ maxWidth: LARG_MODAL, width: LARG_MODAL }}
        className="flex max-h-[calc(100vh-32px)] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex shrink-0 items-center gap-2.5 px-3.5 text-white" style={{ backgroundColor: NAVY, height: 36 }}>
          <h2 className="text-[13px] font-semibold leading-none">Gráficos do DRE pecuária</h2>
          <span className="whitespace-nowrap text-[11px] leading-none text-white/80">
            {[clienteNome, 'Todas as fazendas',
              primeiro && ultimo ? (primeiro === ultimo ? primeiro : `${primeiro} → ${ultimo}`) : null]
              .filter(Boolean).join(' · ')}
          </span>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="ml-auto text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 border-b px-3.5" style={{ height: 36 }}>
          <Segmentado altura={22} valor={aba} onEscolher={setAba}
            opcoes={[{ valor: 'cascata', rotulo: 'Cascata do ano' }, { valor: 'leitura', rotulo: 'Leitura dos anos' }]} />
          {aba === 'leitura' && (
            <span className="ml-auto text-[11px] text-muted-foreground">clique num ano para abrir a cascata dele</span>
          )}
        </div>
        {/* ⚠ UM SCROLLPORT SÓ: o corpo inteiro rola, o cabeçalho e as abas ficam. */}
        {/* `key` pela aba: trocar de aba remonta o corpo e ele volta ao topo — a cascata não abre rolada no meio. */}
        <div key={aba} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3.5 py-2.5">
          {aba === 'cascata' ? (
            <PecCascataView colunas={colunas} clienteId={clienteId}
              escolhido={anoCascata} onEscolher={setAnoCascata} />
          ) : (
            <LeituraDosAnos anos={anos} clienteId={clienteId} onAbrirAno={abrirAno} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════════════════════ A LEITURA DOS ANOS ═══════════════════════════ */

export function LeituraDosAnos({ anos, clienteId, onAbrirAno }: {
  anos: readonly ColunaPec[];
  clienteId: string | null | undefined;
  onAbrirAno: (chave: string) => void;
}) {
  const [abaMov, setAbaMov] = useState<AbaMov>('global');
  const [unidade, setUnidade] = useState<UnidadePonte>('at');

  const periodos = useMemo(() => anos.map(c => ({ de: c.de, ate: c.ate })), [anos]);
  const pats = useDrePecuariaPatrimonioLista(clienteId, periodos, true);
  const { gmds } = useGmdPeriodos(clienteId, periodos, true);
  const vendaGeral = useVendaGeralPorSubcentro(clienteId, periodos, abaMov === 'desfrute');

  /* ⚠ ANO SEM DADO É COLUNA DE "—", não coluna escondida — a regra da grade (`semDado`). */
  const ind = useMemo(() => anos.map(c => indicadoresDoAno(c.semDado ? null : c.linhas)), [anos]);
  const movs: (MovimentosPec | null)[] = anos.map((c, i) => (c.semDado ? null : pats[i]?.patrimonio?.movimentos ?? null));
  const carregandoPat = pats.some(p => p.carregando);
  const parcial = anos.map(c => ehParcial(c.meses));
  const algumParcial = parcial.some(Boolean);
  const rotuloAno = (c: ColunaPec, i: number) => `${c.nome}${parcial[i] ? '*' : ''}`;
  const recorteParcial = anos.find((c, i) => parcial[i]);

  return (
    <div className="flex flex-col gap-2.5" style={{ width: LARGURA_CASCATA }}>
      <div className="grid gap-5" style={{ gridTemplateColumns: '470px 470px' }}>
        <GraficoPrecoCusto anos={anos} ind={ind} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
        <GraficoRebanhoDesfrute anos={anos} ind={ind} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
      </div>

      <div className="rounded-md border pt-1.5">
        <div className="flex items-center gap-2.5 px-2 text-[11.5px] font-semibold">
          Movimento do rebanho
          <Segmentado altura={22} valor={abaMov} onEscolher={setAbaMov} opcoes={[
            { valor: 'global', rotulo: 'Global' }, { valor: 'nascimentos', rotulo: 'Nascimentos' },
            { valor: 'compras', rotulo: 'Compras' }, { valor: 'desfrute', rotulo: 'Desfrute' },
            { valor: 'mortes', rotulo: 'Mortes' },
          ]} />
          {carregandoPat && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Segmentado className="ml-auto" altura={22} valor={unidade} onEscolher={setUnidade}
            opcoes={[{ valor: 'at', rotulo: '@' }, { valor: 'cab', rotulo: 'cab' }]} />
        </div>
        {abaMov === 'global' ? (
          <GraficoPonte anos={anos} movs={movs} ind={ind} unidade={unidade} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />
        ) : (
          <DetalheMovimento aba={abaMov} anos={anos} movs={movs} ind={ind} unidade={unidade}
            rotulo={rotuloAno} parcial={parcial} vendaGeral={vendaGeral} onAbrirAno={onAbrirAno} />
        )}
      </div>

      <TabelaIndicadores anos={anos} ind={ind} movs={movs} gmds={gmds} unidade={unidade}
        parcial={parcial} rotulo={rotuloAno} onAbrirAno={onAbrirAno} />

      {algumParcial && recorteParcial && (
        <div className="text-center text-[10px] text-muted-foreground">
          * recorte {rotuloMesesDe(recorteParcial)} ({recorteParcial.meses} meses). Valores do período marcados
          “{recorteParcial.meses}m”; estoques, preços, custo e margem por @ comparam direto.
        </div>
      )}
    </div>
  );
}

/* ─────────────── os dois gráficos de cima ─────────────── */

const G_W = 470, G_H = 162, G_ESQ = 40, G_DIR = 8, G_TOPO = 14, G_BASE = 26;

function cabecalhoGrafico(titulo: string, legenda: ReactNode) {
  return (
    <div className="flex items-center gap-2 px-2 text-[11.5px] font-semibold">
      {titulo}
      <span className="ml-auto flex items-center gap-2 text-[10px] font-normal text-foreground/80">{legenda}</span>
    </div>
  );
}
const itemLegenda = (cor: string, txt: string, linha = false) => (
  <span className="flex items-center">
    <i className="mr-1 inline-block" style={{ width: 9, height: linha ? 3 : 9, backgroundColor: cor }} />{txt}
  </span>
);

/** O rótulo do ano embaixo do gráfico — clicável: abre a cascata daquele ano. */
function RotuloAnoSvg({ x, y, texto, onClick }: { x: number; y: number; texto: string; onClick: () => void }) {
  return (
    <text x={x} y={y} fontSize={10.5} fill="#374151" textAnchor="middle" className="cursor-pointer hover:underline"
      onClick={onClick}>{texto}</text>
  );
}

export function GraficoPrecoCusto({ anos, ind, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const n = anos.length;
  const faixa = (G_W - G_ESQ - G_DIR) / Math.max(n, 1);
  const valores = ind.flatMap(x => [x.pkDesf, x.custoAt, x.margemAt]).filter((v): v is number => v != null);
  const topoBruto = Math.max(0, ...valores), chaoBruto = Math.min(0, ...valores);
  const passo = passoDoEixo(topoBruto - chaoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo, chao = pisoDoEixo(chaoBruto);
  const y = (v: number) => G_TOPO + (topo - v) / (topo - chao) * (G_H - G_TOPO - G_BASE);
  const grade: number[] = [];
  /* `+ 0` normaliza o −0 do `Math.ceil` de um piso negativo pequeno — o eixo escrevia "−0". */
  for (let v = Math.ceil(chao / passo) * passo + 0; v <= topo + 1e-9; v += passo) grade.push(v + 0);
  const cx = (i: number) => G_ESQ + faixa * i + faixa / 2;
  const larg = Math.min(15, faixa / 2 - 4);
  /* ⚠ A MARGEM É UMA LINHA CURVA SOBRE A MESMA ESCALA DAS BARRAS: ela é a distância entre as duas, e
     numa escala diferente o olho leria outra coisa. Ano sem margem QUEBRA a curva — ligar os vizinhos
     por cima do buraco afirmaria uma margem naquele ano. */
  const pontos = ind.map((x, i) => (x.margemAt == null ? null : { x: cx(i), y: y(x.margemAt), v: x.margemAt }));
  const trechos: string[] = [];
  let atual = '';
  pontos.forEach((p, i) => {
    const ant = i > 0 ? pontos[i - 1] : null;
    if (!p) { if (atual) trechos.push(atual); atual = ''; return; }
    if (!ant || !atual) { atual = `M${p.x},${p.y}`; return; }
    const d = (p.x - ant.x) * 0.42;
    atual += ` C${ant.x + d},${ant.y} ${p.x - d},${p.y} ${p.x},${p.y}`;
  });
  if (atual) trechos.push(atual);
  return (
    <div className="rounded-md border pb-0.5 pt-1">
      {cabecalhoGrafico('Preço de venda × custo (R$/@)', <>
        {itemLegenda(NAVY, 'venda')}{itemLegenda(VERMELHO_HEX, 'custo')}{itemLegenda(VERDE_HEX, 'margem', true)}
      </>)}
      <svg width={G_W} height={G_H} viewBox={`0 0 ${G_W} ${G_H}`}>
        {grade.map(v => (
          <g key={v}>
            <line x1={G_ESQ} x2={G_W - G_DIR} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#6B7280' : '#f0efe9'} />
            <text x={G_ESQ - 4} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{formatNum(v, 0)}</text>
          </g>
        ))}
        {anos.map((c, i) => {
          const x = ind[i];
          return (
            <g key={c.chave}>
              {x.pkDesf != null && <>
                <rect x={cx(i) - larg - 1} y={Math.min(y(x.pkDesf), y(0))} width={larg}
                  height={Math.abs(y(0) - y(x.pkDesf))} fill={NAVY}>
                  <title>{`Preço médio de venda: R$ ${formatNum(x.pkDesf, 2)}/@`}</title>
                </rect>
                <text x={cx(i) - larg / 2 - 1} y={y(Math.max(x.pkDesf, 0)) - 3} fontSize={9.5} fontWeight={600}
                  fill={NAVY} textAnchor="middle">{formatNum(x.pkDesf, 0)}</text>
              </>}
              {x.custoAt != null && <>
                <rect x={cx(i) + 1} y={Math.min(y(x.custoAt), y(0))} width={larg}
                  height={Math.abs(y(0) - y(x.custoAt))} fill={VERMELHO_HEX} opacity={0.85}>
                  <title>{`Custo por @ produzida: R$ ${formatNum(x.custoAt, 2)}/@`}</title>
                </rect>
                <text x={cx(i) + larg / 2 + 1} y={y(Math.max(x.custoAt, 0)) - 3} fontSize={9.5} fontWeight={600}
                  fill={VERMELHO_HEX} textAnchor="middle">{formatNum(x.custoAt, 0)}</text>
              </>}
              {x.pkDesf == null && x.custoAt == null && (
                <text x={cx(i)} y={y(0) - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>
              )}
              <RotuloAnoSvg x={cx(i)} y={G_H - 7} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
            </g>
          );
        })}
        {trechos.map((d, k) => (
          <g key={k}>
            <path d={d} fill="none" stroke="#fff" strokeWidth={6} />
            <path d={d} fill="none" stroke={VERDE_HEX} strokeWidth={2.6} />
          </g>
        ))}
        {pontos.map((p, i) => {
          if (!p) return null;
          const cor = p.v >= 0 ? VERDE_HEX : VERMELHO_HEX;
          const txt = `${p.v > 0 ? '+' : p.v < 0 ? '−' : ''}${formatNum(Math.abs(p.v), 0)}`;
          const w = Math.max(24, txt.length * 6 + 8);
          /* Embaixo, salvo quando não cabe acima dos nomes dos anos — aí volta para cima do ponto. */
          const dy = p.y + 22 > G_H - G_BASE + 4 ? -19 : 6;
          return (
            <g key={i}>
              {/* ⚠ O RÓTULO DA MARGEM VAI EMBAIXO DO PONTO — medido na tela: em cima ele batia no número do
                  topo da barra de custo (NJ jan–ago/21, "+125" sobre "196"). Embaixo ele cai dentro das barras,
                  com fundo branco, onde não há texto nenhum. */}
              <circle cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={cor} strokeWidth={2.2} />
              <rect x={p.x - w / 2} y={p.y + dy} width={w} height={13} rx={3} fill="#fff" stroke={cor} />
              <text x={p.x} y={p.y + dy + 9.5} fontSize={9.5} fontWeight={700} fill={cor} textAnchor="middle">{txt}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraficoRebanhoDesfrute({ anos, ind, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const n = anos.length;
  const faixa = (G_W - G_ESQ - G_DIR) / Math.max(n, 1);
  const topoBruto = Math.max(0, ...ind.flatMap(x => [x.cabIni ?? 0, x.cabDesf ?? 0]));
  const passo = passoDoEixo(topoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo;
  const base = G_H - G_BASE + 4;
  const y = (v: number) => G_TOPO + (topo - v) / topo * (base - G_TOPO);
  const grade: number[] = [];
  for (let v = passo; v <= topo + 1e-9; v += passo) grade.push(v);
  const cx = (i: number) => G_ESQ + faixa * i + faixa / 2;
  const larg = Math.min(15, faixa / 2 - 4);
  return (
    <div className="rounded-md border pb-0.5 pt-1">
      {cabecalhoGrafico('Rebanho inicial × desfrute (cab)', <>
        {itemLegenda('#cbd5e1', 'inicial')}{itemLegenda(VERDE_HEX, 'desfrute % do inicial')}
      </>)}
      <svg width={G_W} height={G_H} viewBox={`0 0 ${G_W} ${G_H}`}>
        {grade.map(v => (
          <g key={v}>
            <line x1={G_ESQ} x2={G_W - G_DIR} y1={y(v)} y2={y(v)} stroke="#f0efe9" />
            <text x={G_ESQ - 4} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{formatNum(v, 0)}</text>
          </g>
        ))}
        <line x1={G_ESQ} x2={G_W - G_DIR} y1={base} y2={base} stroke="#6B7280" />
        {anos.map((c, i) => {
          const x = ind[i];
          return (
            <g key={c.chave}>
              {x.cabIni != null && <>
                <rect x={cx(i) - larg - 1} y={y(x.cabIni)} width={larg} height={base - y(x.cabIni)} fill="#cbd5e1" />
                <text x={cx(i) - larg / 2 - 1} y={y(x.cabIni) - 3} fontSize={9.5} fontWeight={600} fill="#475569"
                  textAnchor="middle">{formatNum(x.cabIni, 0)}</text>
              </>}
              {x.cabDesf != null && <>
                <rect x={cx(i) + 1} y={y(x.cabDesf)} width={larg} height={base - y(x.cabDesf)} fill={VERDE_HEX}>
                  <title>{`Desfrute: ${formatNum(x.cabDesf, 0)} cab`}</title>
                </rect>
                {/* ⚠ O % MORA DENTRO DA BARRA VERDE, EM PÉ, quando ela tem altura — medido no RRCC 2020: com as
                    duas barras quase da mesma altura, "89,1%" em cima caía sobre o "928" da barra do inicial.
                    Barra baixa demais para o texto: o % volta para cima dela. */}
                {base - y(x.cabDesf) >= 34 ? (
                  <text x={cx(i) + larg / 2 + 1} y={y(x.cabDesf) + 5} fontSize={9.5} fontWeight={700} fill="#fff"
                    textAnchor="end" transform={`rotate(-90 ${cx(i) + larg / 2 + 1} ${y(x.cabDesf) + 5})`}
                    dominantBaseline="central">{x.pctDesf == null ? traco : pct1(x.pctDesf)}</text>
                ) : (
                  <text x={cx(i) + larg / 2 + 1} y={y(x.cabDesf) - 3} fontSize={9.5} fontWeight={700} fill={VERDE_HEX}
                    textAnchor="middle">{x.pctDesf == null ? traco : pct1(x.pctDesf)}</text>
                )}
              </>}
              <RotuloAnoSvg x={cx(i)} y={G_H - 7} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─────────────── o movimento do rebanho ─────────────── */

const M_W = LARGURA_CASCATA - 2, M_H = 218, M_TOPO = 42, M_BASE = 26;

export function GraficoPonte({ anos, movs, ind, unidade, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; movs: readonly (MovimentosPec | null)[]; ind: readonly IndicadoresAno[];
  unidade: UnidadePonte; rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const colW = (M_W - L_ROTULO) / Math.max(anos.length, 1);
  const pontes = movs.map((m, i) => posicionarPonte(passosDaPonte(m, unidade, ind[i].atProd != null)));
  const topoBruto = Math.max(0, ...pontes.flatMap(p => p.barras.map(b => b.ate)));
  const chaoBruto = Math.min(0, ...pontes.flatMap(p => p.barras.map(b => b.de)));
  const passo = passoDoEixo(topoBruto - chaoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo, chao = Math.floor(chaoBruto / passo) * passo;
  const y = (v: number) => M_TOPO + (topo - v) / (topo - chao) * (M_H - M_TOPO - M_BASE);
  const grade: number[] = [];
  for (let v = chao; v <= topo + 1e-9; v += passo) if (v !== 0) grade.push(v);
  const un = unidade === 'at' ? '@' : 'cab';
  /* ⚠ CABEÇA VAI POR EXTENSO: "8 mil" para 7.659 cabeças arredondava 341 bois. Arroba abrevia (é o eixo dela). */
  const ponta = (v: number) => (unidade === 'cab' ? formatNum(v, 0) : abrevMil(v, '').trim());
  return (
    <svg width={M_W} height={M_H} viewBox={`0 0 ${M_W} ${M_H}`}>
      {grade.map(v => (
        <g key={v}>
          <line x1={L_ROTULO} x2={M_W - 2} y1={y(v)} y2={y(v)} stroke="#f0efe9" />
          <text x={L_ROTULO - 6} y={y(v) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{abrevMil(v, un)}</text>
        </g>
      ))}
      <line x1={L_ROTULO} x2={M_W - 2} y1={y(0)} y2={y(0)} stroke="#6B7280" />
      {anos.map((c, i) => {
        const { barras } = pontes[i];
        const x0 = L_ROTULO + colW * i;
        const k = Math.max(barras.length, 1);
        const larg = Math.max(5, Math.min(15, (colW - 16) / k - 3.4));
        const passoB = (colW - 16) / k;
        const ini = barras.find(b => b.chave === 'inicio')?.valor ?? null;
        const fim = barras.find(b => b.chave === 'fim')?.valor ?? null;
        const dVar = ini == null || fim == null ? null : fim - ini;
        const meio = x0 + colW / 2;
        return (
          <g key={c.chave}>
            {movs[i] && <>
              <text x={meio} y={11} fontSize={9.5} fill="#6B7280" textAnchor="middle">
                início <tspan fill="#0F1729" fontWeight={600}>{ini == null ? traco : ponta(ini)}</tspan>
              </text>
              <text x={meio} y={22} fontSize={9.5} fill="#6B7280" textAnchor="middle">
                fim <tspan fill="#0F1729" fontWeight={600}>{fim == null ? traco : ponta(fim)}</tspan>
              </text>
              <text x={meio} y={35} fontSize={10} fontWeight={700} fill={dVar != null && dVar < 0 ? VERMELHO_HEX : VERDE_HEX}
                textAnchor="middle">{dVar == null ? traco : `${dVar > 0 ? '+' : dVar < 0 ? '−' : ''}${formatNum(Math.abs(dVar), 0)} ${un}`}</text>
            </>}
            {!movs[i] && <text x={meio} y={y(0) - 6} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>}
            {barras.map((b, j) => {
              const bx = x0 + 8 + passoB * j + (passoB - larg) / 2;
              const alt = Math.max(y(b.de) - y(b.ate), b.valor == null ? 0 : 1.5);
              return (
                <g key={b.chave}>
                  {/* ⚠ O CONECTOR ANDA NO ACUMULADO DEPOIS DO PASSO ANTERIOR — é o que liga uma barra à seguinte. */}
                  {j > 0 && (
                    <line x1={bx - (passoB - larg)} x2={bx} y1={y(barras[j - 1].acc)} y2={y(barras[j - 1].acc)}
                      stroke="#9ca3af" strokeWidth={0.8} />
                  )}
                  <rect x={bx} y={y(b.ate)} width={larg} height={alt} fill={b.cor}>
                    <title>{`${rotulo(c, i)} · ${b.rotulo}: ${b.valor == null ? traco : formatNum(b.valor, 0)} ${un}`}</title>
                  </rect>
                </g>
              );
            })}
            <RotuloAnoSvg x={meio} y={M_H - 8} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * AS ABAS DE UM MOVIMENTO SÓ — Nascimentos, Compras, Desfrute, Mortes.
 *
 * ⚠ O DESFRUTE ABRE EM ABATE × VENDA × CONSUMO pela chave nova da RPC (`desfrute_por_tipo`, cabeças e
 * @ VIVA); o R$ vem dos grupos de centros do DRE — Abates (1010, 1020) e Venda Peso Vivo (1110-1155) —,
 * com R$/@ = R$ ÷ @ do tipo. Venda de tropa, consumo e hedge aparecem SÓ em R$ (decisão 7): a Venda
 * Geral não tem arroba própria.
 */
export function DetalheMovimento({ aba, anos, movs, ind, unidade, rotulo, parcial, vendaGeral, onAbrirAno }: {
  aba: Exclude<AbaMov, 'global'>;
  anos: readonly ColunaPec[]; movs: readonly (MovimentosPec | null)[]; ind: readonly IndicadoresAno[];
  unidade: UnidadePonte; rotulo: (c: ColunaPec, i: number) => string; parcial: readonly boolean[];
  vendaGeral: readonly { porSubcentro: Map<string, number> | null; carregando: boolean }[];
  onAbrirAno: (chave: string) => void;
}) {
  const v = (p: { cabecas: number; arrobas: number } | null | undefined) =>
    (p == null ? null : unidade === 'at' ? p.arrobas : p.cabecas);
  const un = unidade === 'at' ? '@' : 'cab';
  type Serie = { rotulo: string; cor: string; valores: (number | null)[] };
  const series: Serie[] = aba === 'nascimentos'
    ? [{ rotulo: 'Nascimentos', cor: COR_PONTE.nascimentos, valores: movs.map(m => v(m?.nascimentos)) }]
    : aba === 'compras'
      ? [{ rotulo: 'Compras', cor: COR_PONTE.compras, valores: movs.map(m => v(m?.compradas)) }]
      : aba === 'mortes'
        ? [{ rotulo: 'Mortes', cor: COR_PONTE.mortes, valores: movs.map(m => v(m?.mortes)) }]
        : [
          { rotulo: 'Abate', cor: '#9a3412', valores: movs.map(m => v(m?.desfrute_por_tipo?.abate)) },
          { rotulo: 'Venda', cor: '#ea580c', valores: movs.map(m => v(m?.desfrute_por_tipo?.venda)) },
          { rotulo: 'Consumo', cor: '#fdba74', valores: movs.map(m => v(m?.desfrute_por_tipo?.consumo)) },
        ];

  const colW = (M_W - L_ROTULO) / Math.max(anos.length, 1);
  const H = 150, TOPO = 16, BASE = 24;
  const topoBruto = Math.max(0, ...series.flatMap(s => s.valores.map(x => x ?? 0)));
  const passo = passoDoEixo(topoBruto);
  const topo = Math.ceil(topoBruto / passo) * passo || passo;
  const y = (x: number) => TOPO + (topo - x) / topo * (H - TOPO - BASE);
  const grade: number[] = [];
  for (let g = passo; g <= topo + 1e-9; g += passo) grade.push(g);
  const larg = Math.min(18, (colW - 24) / series.length - 4);

  /* As linhas da tabela do detalhe — cabeças e @ sempre; R$ e R$/@ onde houver. */
  type Linha = { rotulo: string; valores: (string | null)[]; cor?: (number | null)[]; periodo?: boolean; so?: boolean };
  const linhas: Linha[] = [];
  if (aba === 'nascimentos' || aba === 'mortes') {
    const k = aba === 'nascimentos' ? 'nascimentos' : 'mortes';
    linhas.push(
      { rotulo: `${series[0].rotulo} (cab)`, valores: movs.map(m => (m ? n0(m[k].cabecas) : null)), periodo: true },
      { rotulo: `${series[0].rotulo} (@)`, valores: movs.map(m => (m ? n0(m[k].arrobas) : null)), periodo: true },
    );
  } else if (aba === 'compras') {
    linhas.push(
      { rotulo: 'Compras (cab)', valores: movs.map(m => (m ? n0(m.compradas.cabecas) : null)), periodo: true },
      { rotulo: 'Compras (@)', valores: movs.map(m => (m ? n0(m.compradas.arrobas) : null)), periodo: true },
      { rotulo: 'Reposição (R$)', valores: ind.map(x => (x.rsComp == null ? null : n2(-x.rsComp))), periodo: true,
        cor: ind.map(x => (x.rsComp == null ? null : -x.rsComp)) },
      { rotulo: 'Preço médio de reposição (R$/@)', valores: ind.map(x => n2(x.pkComp)) },
    );
  } else {
    const tipos: Array<{ k: 'abate' | 'venda' | 'consumo'; rot: string; centro: string | null }> = [
      { k: 'abate', rot: 'Abate', centro: 'Abates' },
      { k: 'venda', rot: 'Venda (peso vivo)', centro: 'Venda Peso Vivo' },
      { k: 'consumo', rot: 'Consumo', centro: null },
    ];
    for (const t of tipos) {
      linhas.push({ rotulo: `${t.rot} (cab · @)`, periodo: true, valores: movs.map(m => {
        const p = m?.desfrute_por_tipo?.[t.k];
        return p ? `${n0(p.cabecas)} · ${n0(p.arrobas)}` : null;
      }) });
      if (t.centro) {
        const centro = t.centro;
        const rs = anos.map(c => (c.semDado ? null : rsDoCentroDeVenda(c.linhas, centro)));
        linhas.push({ rotulo: `${t.rot} (R$)`, periodo: true, valores: rs.map(x => (x == null ? null : n2(x))), cor: rs },
          { rotulo: `${t.rot} (R$/@)`, valores: rs.map((x, i) => n2(razao(x, movs[i]?.desfrute_por_tipo?.[t.k].arrobas || null))) });
      }
    }
    for (const s of SUBCENTROS_SO_RS) {
      const vals = vendaGeral.map(g => (g.porSubcentro ? g.porSubcentro.get(s.subcentro) ?? 0 : null));
      /* ⚠ CARREGANDO É "…", NÃO "—": o traço diria que o dado não existe. */
      linhas.push({ rotulo: `${s.rotulo} (só R$)`, so: true, periodo: true, cor: vals,
        valores: vals.map((x, i) => (x == null ? (vendaGeral[i]?.carregando ? '…' : null) : n2(x))) });
    }
    const conhecidos = new Set<string>(SUBCENTROS_SO_RS.map(s => s.subcentro));
    const outros = vendaGeral.map(g => (g.porSubcentro
      ? [...g.porSubcentro].filter(([k]) => !conhecidos.has(k)).reduce((a, [, x]) => a + x, 0) : null));
    if (outros.some(x => x != null && x !== 0)) {
      linhas.push({ rotulo: 'Outros da Venda Geral (só R$)', so: true, periodo: true,
        valores: outros.map(x => (x == null ? null : n2(x))), cor: outros });
    }
  }

  return (
    <div>
      <svg width={M_W} height={H} viewBox={`0 0 ${M_W} ${H}`}>
        {grade.map(g => (
          <g key={g}>
            <line x1={L_ROTULO} x2={M_W - 2} y1={y(g)} y2={y(g)} stroke="#f0efe9" />
            <text x={L_ROTULO - 6} y={y(g) + 3.5} fontSize={9.5} fill="#9ca3af" textAnchor="end">{abrevMil(g, un)}</text>
          </g>
        ))}
        <line x1={L_ROTULO} x2={M_W - 2} y1={y(0)} y2={y(0)} stroke="#6B7280" />
        <g>
          {series.map((s, k) => (
            <text key={s.rotulo} x={10} y={TOPO + 12 + k * 13} fontSize={10.5} fontWeight={600} fill={s.cor}>{s.rotulo}</text>
          ))}
        </g>
        {anos.map((c, i) => {
          const x0 = L_ROTULO + colW * i;
          const meio = x0 + colW / 2;
          const totalL = series.length * (larg + 4) - 4;
          return (
            <g key={c.chave}>
              {series.map((s, k) => {
                const val = s.valores[i];
                const bx = meio - totalL / 2 + k * (larg + 4);
                if (val == null) {
                  return <text key={s.rotulo} x={bx + larg / 2} y={y(0) - 4} fontSize={10} fill="#9ca3af" textAnchor="middle">{traco}</text>;
                }
                return (
                  <g key={s.rotulo}>
                    <rect x={bx} y={y(val)} width={larg} height={Math.max(y(0) - y(val), val > 0 ? 1.5 : 0)} fill={s.cor}>
                      <title>{`${rotulo(c, i)} · ${s.rotulo}: ${formatNum(val, 0)} ${un}`}</title>
                    </rect>
                    <text x={bx + larg / 2} y={y(val) - 3} fontSize={9.5} fontWeight={600} fill="#374151" textAnchor="middle">
                      {abrevMil(val, '').trim()}
                    </text>
                  </g>
                );
              })}
              <RotuloAnoSvg x={meio} y={H - 8} texto={rotulo(c, i)} onClick={() => onAbrirAno(c.chave)} />
            </g>
          );
        })}
      </svg>
      <table className="w-full border-collapse border-t tabular-nums" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: L_ROTULO }} />{anos.map(c => <col key={c.chave} />)}</colgroup>
        <tbody>
          {linhas.map((l, li) => (
            <tr key={l.rotulo} style={{ height: 16, backgroundColor: li % 2 === 0 ? ZEBRA_A : ZEBRA_B }}>
              <td className={cn('whitespace-nowrap px-2 text-left text-[11px]', l.so && 'text-muted-foreground')}>{l.rotulo}</td>
              {anos.map((c, i) => (
                <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right text-[11px]',
                  l.cor ? corDe(l.cor[i]) : '')}>
                  {celPeriodo(l.valores[i], l.periodo && parcial[i] ? c.meses : null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A célula de um valor do período num ano parcial: o número com a marca "8m" antes. */
function celPeriodo(txt: string | null, meses: number | null) {
  const t = txt ?? traco;
  /* ⚠ AUSÊNCIA NÃO LEVA MARCA: "8m —" diria que há um valor de oito meses. */
  if (meses == null || txt == null || txt === traco || txt === '…') return t;
  return <><span className="mr-1 text-[9.5px] text-muted-foreground">{meses}m</span>{t}</>;
}

/* ─────────────── a tabela de indicadores ─────────────── */

interface LinhaTab {
  rotulo: ReactNode;
  cels: (string | null)[];
  cores?: string[];
  k?: boolean;
  sub?: boolean;
  periodo?: boolean;
  /** A sublinha herda o fundo da linha de cima — "sublinhas no mesmo fundo". */
  zebra?: 'a' | 'b';
  swatch?: string;
  cinza?: boolean;
}

export function TabelaIndicadores({ anos, ind, movs, gmds, unidade, parcial, rotulo, onAbrirAno }: {
  anos: readonly ColunaPec[]; ind: readonly IndicadoresAno[]; movs: readonly (MovimentosPec | null)[];
  gmds: readonly (number | null)[]; unidade: UnidadePonte; parcial: readonly boolean[];
  rotulo: (c: ColunaPec, i: number) => string; onAbrirAno: (chave: string) => void;
}) {
  const un = unidade === 'at' ? '@' : 'cab';
  const variacao = (xs: (number | null)[]) => xs.map((x, i) => (i === 0 ? null : variacaoNoAno(x, xs[i - 1])));

  /* A seção do movimento: a união dos passos dos anos, na ordem da ponte. */
  const passosPorAno = movs.map((m, i) => passosDaPonte(m, unidade, ind[i].atProd != null));
  const ordem = ['inicio', 'producao', 'nascimentos', 'compras', 'transf', 'desfrute', 'mortes', 'dif', 'fim'];
  const presentes = ordem.filter(k => passosPorAno.some(ps => ps.some(p => p.chave === k)));
  const modelo = (k: string): PassoPonte | undefined => passosPorAno.flatMap(ps => ps).find(p => p.chave === k);

  let z = 0;
  const prox = (): 'a' | 'b' => (z++ % 2 === 0 ? 'a' : 'b');
  const secoes: Array<{ titulo: string; linhas: LinhaTab[] }> = [];

  secoes.push({
    titulo: `Movimento do rebanho (${un}) · legenda do gráfico acima`,
    linhas: presentes.map(k => {
      const mod = modelo(k);
      const cels = passosPorAno.map((ps, i) => {
        if (!movs[i]) return null;
        const p = ps.find(x => x.chave === k);
        /* ⚠ PASSO QUE NÃO APARECEU NESTE ANO VALE ZERO (a diferença zerada, a transferência que se anula);
           a PRODUÇÃO SEM CACHE é traço — ver `passosDaPonte`. */
        if (!p) return k === 'producao' && unidade === 'at' ? traco : '0';
        if (p.valor == null) return traco;
        return p.tipo === 'ponta' ? n0(p.valor) : s0(p.valor);
      });
      const cores = passosPorAno.map(ps => {
        const p = ps.find(x => x.chave === k);
        if (!p || p.valor == null) return '';
        if (k === 'producao') return corDe(p.valor);
        if (k === 'mortes') return corDe(p.valor);
        return '';
      });
      return {
        rotulo: mod?.rotulo ?? k, cels, cores, swatch: mod?.cor, k: k === 'fim', zebra: prox(),
        periodo: k !== 'inicio' && k !== 'fim', cinza: k === 'dif',
      };
    }),
  });

  z = 0;
  secoes.push({
    titulo: 'Rebanho (cab e valor)',
    linhas: [
      { rotulo: 'Rebanho inicial (cab)', cels: ind.map(x => n0(x.cabIni)), zebra: prox() },
      { rotulo: 'Rebanho final (cab)', cels: ind.map(x => n0(x.cabFim)), zebra: prox() },
      { rotulo: 'Variação do rebanho (cab)', cels: ind.map(x => s0(x.varCab)), cores: ind.map(x => corDe(x.varCab)),
        k: true, periodo: true, zebra: prox() },
      { rotulo: 'Valorização por produção (R$)', cels: ind.map(x => n2(x.vpb)), cores: ind.map(x => corDe(x.vpb)),
        periodo: true, zebra: prox() },
      { rotulo: 'Valorização por mercado (R$)', cels: ind.map(x => n2(x.efeito)), cores: ind.map(x => corDe(x.efeito)),
        periodo: true, zebra: prox() },
    ],
  });

  const varPreco = variacao(ind.map(x => x.pkDesf));
  secoes.push({
    titulo: 'Desfrute (entra dinheiro)',
    linhas: [
      { rotulo: 'Desfrute (cab)', cels: ind.map(x => n0(x.cabDesf)), periodo: true, zebra: 'a' },
      { rotulo: 'Desfrute % do rebanho inicial', cels: ind.map(x => pct1(x.pctDesf)), k: true, periodo: true, zebra: 'b' },
      { rotulo: 'Preço médio de venda (R$/@)', cels: ind.map(x => n2(x.pkDesf)),
        cores: ind.map(x => (x.pkDesf == null ? '' : 'text-emerald-700')), k: true, zebra: 'a' },
      { rotulo: 'variação no ano', cels: varPreco.map(v => spct1(v)), cores: varPreco.map(v => corDe(v)), sub: true, zebra: 'a' },
      { rotulo: 'Receita do desfrute (R$)', cels: ind.map(x => n2(x.receitaDesf)),
        cores: ind.map(x => corDe(x.receitaDesf)), periodo: true, zebra: 'b' },
    ],
  });

  secoes.push({
    titulo: 'Reposição (sai dinheiro)',
    linhas: [
      { rotulo: 'Reposição (cab)', cels: ind.map(x => n0(x.cabComp)), periodo: true, zebra: 'a' },
      /* ⚠ REPOSIÇÃO ZERO COM COMPRA DÁ TRAÇO — REPOSICAO-SEM-CUSTO-01, a regra que a cascata já seguia: a
         compra existe no zootécnico e o lançamento falta; zero afirmaria gado de graça. */
      { rotulo: 'Reposição (R$)', cels: ind.map(x => (x.rsComp == null || (x.rsComp === 0 && (x.cabComp ?? 0) > 0)
        ? traco : n2(x.rsComp === 0 ? 0 : -x.rsComp))),
        cores: ind.map(x => corDe(x.rsComp == null ? null : -x.rsComp)), periodo: true, zebra: 'b' },
      { rotulo: 'Preço médio de reposição (R$/@)', cels: ind.map(x => n2(x.pkComp)), k: true, zebra: 'a' },
      { rotulo: 'ágio sobre o R$/@ do desfrute', cels: ind.map(x => spct1(x.agio)),
        cores: ind.map(x => corDe(x.agio, true)), sub: true, zebra: 'a' },
    ],
  });

  const varCusto = variacao(ind.map(x => x.custoAt));
  /* ⚠ O AVISO DO GMD MORA NO PRÓPRIO INDICADOR — decisão 4: jan–ago não compara com ano cheio (a seca
     pesa diferente das águas), e o número sozinho convidaria à comparação. */
  const avisoGmd: LinhaTab = {
    rotulo: 'período parcial: não compara com ano cheio', sub: true, zebra: 'a',
    cels: anos.map((c, i) => (parcial[i] ? rotuloMesesDe(c) : '')),
  };
  secoes.push({
    titulo: 'Produção e custo',
    linhas: [
      { rotulo: 'GMD (kg/cab/dia)', cels: gmds.map((g, i) => (anos[i].semDado ? null : g == null ? traco : formatNum(g, 3))), zebra: 'a' },
      ...(parcial.some(Boolean) ? [avisoGmd] : []),
      { rotulo: 'Custeio de produção (R$)', cels: ind.map(x => (x.custeio == null ? null : n2(-x.custeio))),
        cores: ind.map(x => corDe(x.custeio == null ? null : -x.custeio)), periodo: true, zebra: 'b' },
      { rotulo: 'Custo por @ produzida (R$/@)', cels: ind.map(x => n2(x.custoAt)),
        cores: ind.map(x => (x.custoAt == null ? '' : 'text-destructive')), k: true, zebra: 'a' },
      { rotulo: 'variação no ano', cels: varCusto.map(v => spct1(v)), cores: varCusto.map(v => corDe(v, true)), sub: true, zebra: 'a' },
    ],
  });

  secoes.push({
    titulo: 'Margem (preço de venda − custo por @)',
    linhas: [
      { rotulo: 'Margem por @ (R$/@)', cels: ind.map(x => s2(x.margemAt)), cores: ind.map(x => corDe(x.margemAt)), k: true, zebra: 'a' },
      { rotulo: 'Margem % do preço', cels: ind.map(x => pct1(x.margemPct)), cores: ind.map(x => corDe(x.margemPct)), zebra: 'b' },
    ],
  });

  return (
    /* ⚠ SEM `overflow-hidden` AQUI, de propósito: ele faria desta caixa o scrollport do `sticky` e o cabeçalho
       rolaria junto com a tabela. Quem rola é o corpo do modal; o cabeçalho gruda no topo dele (−10px = o
       `py-2.5` do corpo), com fundo opaco e `z` acima das linhas — a regra da casa para lista com rolagem. */
    <div className="rounded-md border">
      <table className="w-full border-collapse tabular-nums" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: L_ROTULO }} />{anos.map(c => <col key={c.chave} />)}</colgroup>
        <thead className="sticky z-10" style={{ top: -10 }}>
          <tr style={{ height: 22, backgroundColor: NAVY }}>
            <th className="rounded-tl-md px-2 text-left text-[11px] font-semibold text-white" style={{ backgroundColor: NAVY }}>Indicador</th>
            {anos.map((c, i) => (
              <th key={c.chave} style={{ backgroundColor: NAVY }}
                className="cursor-pointer text-center text-[11px] font-semibold text-white hover:underline"
                title={`Abrir a cascata de ${c.nome}`} onClick={() => onAbrirAno(c.chave)}>
                {rotulo(c, i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {secoes.map(s => [
            <tr key={s.titulo} style={{ height: 17, backgroundColor: SECAO }}>
              <td colSpan={anos.length + 1} className="border-t px-2 text-[10.5px] font-semibold text-foreground/80"
                style={{ borderColor: '#d6d4cc' }}>{s.titulo}</td>
            </tr>,
            ...s.linhas.map((l, li) => (
              <tr key={`${s.titulo}-${li}`}
                style={{ height: l.sub ? 13 : 16, backgroundColor: l.zebra === 'b' ? ZEBRA_B : ZEBRA_A }}>
                <td className={cn('whitespace-nowrap px-2 text-left', l.sub ? 'pl-[18px] text-[9.5px] text-muted-foreground' : 'text-[11px]',
                  l.k && 'font-semibold', l.cinza && 'text-muted-foreground')}>
                  {l.swatch && <i className="mr-1.5 inline-block rounded-[2px] align-[-1px]"
                    style={{ width: 9, height: 9, backgroundColor: l.swatch }} />}
                  {l.rotulo}
                </td>
                {anos.map((c, i) => (
                  <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right',
                    l.sub ? 'text-[9.5px]' : 'text-[11px]', l.k && 'font-semibold', l.cinza && 'text-muted-foreground',
                    l.cores?.[i])}>
                    {c.linhas == null && !c.semDado
                      ? <span className="text-muted-foreground">…</span>
                      : celPeriodo(c.semDado ? null : l.cels[i], l.periodo && parcial[i] ? c.meses : null)}
                  </td>
                ))}
              </tr>
            )),
          ])}
          <tr style={{ height: 19, backgroundColor: NAVY }}>
            <td className="px-2 text-left text-[11px] font-semibold text-white">= Lucro operacional (R$)</td>
            {anos.map((c, i) => {
              const v = ind[i].lucroOp;
              return (
                <td key={c.chave} className={cn('whitespace-nowrap px-2 text-right text-[11px] font-semibold',
                  v == null || v === 0 ? 'text-white' : v > 0 ? 'text-green-300' : 'text-red-300')}>
                  {c.semDado || v == null ? traco : (
                    <>{parcial[i] && <span className="mr-1 text-[9.5px] font-normal text-white/70">{c.meses}m</span>}
                      {v > 0 ? '▲ ' : v < 0 ? '▼ ' : ''}{formatNum(v, 2)}</>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "jan–ago" — o recorte de meses de uma coluna parcial, para o aviso do GMD. */
function rotuloMesesDe(c: ColunaPec) {
  const ms = mesesDoPeriodo(c.de, c.ate);
  if (ms.length === 0) return '';
  const m = (am: string) => MES3[Number(am.slice(5, 7)) - 1] ?? '?';
  return `${m(ms[0])}–${m(ms[ms.length - 1])}`;
}
