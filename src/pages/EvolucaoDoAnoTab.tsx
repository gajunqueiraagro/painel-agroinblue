/**
 * PROD-EVOLUCAO-01a — Produção › Evolução no Ano, nível 1 (mock aprovado pelo Gabriel 30/10 17:13, `docs/mocks/mock-evolucao-v4.html`).
 *
 * Abre em CABEÇAS, no acumulado até o último mês fechado. Cards: o realizado do período × a META DO ANO (cenário Meta, mesmo em rascunho, com a
 * etiqueta) × % já feito. Tabela do ano em três blocos, cada um com o seu total — Entradas externas · Saídas externas · Internas (não mudam o total
 * do Global) — e as colunas Acum. · Meta · Δ % fixas à direita. Todo número leva à origem: Lanç. (lançamentos do mês e do tipo), OC (operações
 * comerciais do tipo e do período), Fech. (Fechamento Área do mês). Embaixo, a conferência aponta o GMD que salta.
 *
 * ⚠ REGRA DO ITEM (Gabriel 30/10 17:16): NENHUM número cortado ou com "…" — as colunas têm a largura do maior valor possível (`LARGURA`); o texto
 *   (rótulo) pode cortar, o número nunca. Fonte e altura de linha: a régua da casa (`regua-tabela.tsx`), não os 8,5/9px do mock.
 * ⚠ Os números saem de `montarEvolucao` (pura, testada): o que já estava certo não muda; lotação e GMD do acumulado mudaram com o OK (18:45).
 * Reservados, SEM construir (decisão pendente do Gabriel): Faturamento, Preço médio de venda, Estoque para vender. Comparar anos, Ponte e
 * Apresentar são o 01c; o nível 2 (o clique no mês) é o 01b.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useEvolucaoDoAno } from '@/hooks/useEvolucaoDoAno';
import {
  avisosDaEvolucao, deltaSobreMeta, montarEvolucao, type Destino, type LinhaDaEvolucao, type Periodo, type Unidade,
} from '@/lib/producao/evolucaoAno';
import type { FluxoTipo } from '@/lib/calculos/zootecnicos';
import { MESES_COLS } from '@/lib/calculos/labels';
import { Segmentado } from '@/components/ui/segmentado';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QUADRO_REGUA, TD_REGUA, TH_REGUA } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';

/* As larguras (px) pelo MAIOR valor possível, a 10px negrito com algarismos tabulares (~6px por caractere + 8px de respiro):
   mês "9.999,9" / "−9.999" (7) → 50; Acum. e Meta "−99.999" / "99.999,9" (8) → 58; Δ "+9.999%" / "+99,9 pp" (8) → 58.
   O rótulo fica com o resto (corta com "…" e o texto inteiro no `title`). 12 × 50 + 58 + 58 + 58 = 774px de número. */
const LARGURA = { mes: 50, acum: 58, meta: 58, delta: 58 } as const;

const MESES_CURTOS = MESES_COLS.map((m) => m.label);
/* fix1 (item 7): o secundário da Evolução — Meta, Δ % e a meta do card */
const SECUNDARIO = 'text-[8.5px] font-normal';
const fmtNum = (v: number, casas: number) => {
  const s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return v < 0 && Number(s.replace(/\./g, '').replace(',', '.')) !== 0 ? `−${s}` : s;
};

export interface OrigemDaEvolucao {
  destino: Destino;
  tipo?: FluxoTipo;
  ano: number;
  /** null = o período inteiro do acumulado (de `meses[0]` a `meses[n−1]`) */
  mes: number | null;
  meses: number[];
}

interface Props {
  /** abre a origem do número (o shell decide a tela: Lançamentos, OC ou Fechamento) */
  onAbrirOrigem?: (o: OrigemDaEvolucao) => void;
  /** o clique no mês: o nível 2 (Evolução por Categoria) */
  onAbrirMes?: (ano: number, mes: number) => void;
}

const SELO: Record<Destino, { rotulo: string; classe: string; title: string }> = {
  lanc: { rotulo: 'Lanç.', classe: 'bg-[#e6ecf5] text-[#1e2d47]', title: 'Abre os lançamentos do tipo e do mês' },
  oc: { rotulo: 'OC', classe: 'bg-[#fde8d6] text-[#9a3412]', title: 'Abre as operações comerciais do tipo e do período' },
  fech: { rotulo: 'Fech.', classe: 'bg-[#e1f2e8] text-[#15803d]', title: 'Abre o Fechamento Área do mês' },
};

const FUNDO: Record<LinhaDaEvolucao['nivel'], string> = {
  saldo: 'bg-[#e3e9f1] font-bold',
  'bloco-entrada': 'bg-[#dcf1e4] font-bold',
  entrada: 'bg-[#f0faf4]',
  'bloco-saida': 'bg-[#f8dede] font-bold',
  saida: 'bg-[#fdf3f3]',
  'bloco-interna': 'bg-[#ebe8f6] font-bold text-[#3b2f73]',
  interna: 'bg-[#f6f4fc]',
  final: 'bg-[#d5dfec] font-bold',
  indicador: 'bg-card',
};

export function EvolucaoDoAnoTab({ onAbrirOrigem, onAbrirMes }: Props) {
  const { data: anosDisponiveis = [String(new Date().getFullYear())] } = useAnosDisponiveis();
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  /* fix1 (Gabriel 31/10, item 5): só "Mês | Ano". O "Ano" é o ano ATÉ O ÚLTIMO MÊS FECHADO (o `acum`, os MESMOS números com que a tela abria):
     o `ano` dos 12 meses somava a projeção dos meses abertos e deixava o saldo e o peso final do ano em branco (dez sem Fechamento). */
  const [periodo, setPeriodo] = useState<Periodo>('acum');
  const [unidade, setUnidade] = useState<Unidade>('cab');
  const [comMeta, setComMeta] = useState(true);
  const dados = useEvolucaoDoAno(Number(ano));

  const ev = useMemo(() => montarEvolucao({ real: dados.mesesReal, meta: comMeta ? dados.mesesMeta : [], unidade, periodo, global: dados.isGlobal }),
    [dados.mesesReal, dados.mesesMeta, comMeta, unidade, periodo, dados.isGlobal]);
  /* a META DO ANO dos cards: o cenário Meta nos 12 meses */
  const metaDoAno = useMemo(() => montarEvolucao({ real: dados.mesesMeta, meta: [], unidade: 'cab', periodo: 'ano', global: dados.isGlobal }),
    [dados.mesesMeta, dados.isGlobal]);
  const realCab = useMemo(() => unidade === 'cab' ? ev : montarEvolucao({ real: dados.mesesReal, meta: [], unidade: 'cab', periodo, global: dados.isGlobal }),
    [ev, unidade, dados.mesesReal, periodo, dados.isGlobal]);
  const avisos = useMemo(() => avisosDaEvolucao(dados.mesesReal, fmtNum, (m) => `${MESES_CURTOS[m - 1]}/${ano.slice(2)}`), [dados.mesesReal, ano]);

  const ate = ev.ultimoFechado;
  const valorDe = (e: typeof ev, id: string) => e.linhas.find((l) => l.id === id)?.acum ?? null;

  /* em "t" o peso vivo vai em toneladas com 1 casa (o rebanho passa de 2 milhões de kg: não caberia em coluna nenhuma) */
  /* fix1 (item 8): VAZIO = VAZIO — mês sem dado ou sem movimento fica em branco (nada de "0" nem "—") */
  const exibir = (l: LinhaDaEvolucao, v: number | null): string => {
    if (v == null || v === 0) return '';
    const emToneladas = unidade === 'kg' && l.nivel !== 'indicador';
    const n = emToneladas ? v / 1000 : v;
    const casas = emToneladas ? 1 : l.casas;
    const s = fmtNum(n, casas);
    return l.comSinal && n > 0 ? `+${s}` : s;
  };
  const exibirDelta = (l: LinhaDaEvolucao): string => {
    const d = deltaSobreMeta(l);
    if (d == null) return '';
    const casas = l.deltaEmPontos || Math.abs(d) < 100 ? 1 : 0;
    return `${d > 0 ? '+' : d < 0 ? '' : ''}${fmtNum(d, casas)}${l.deltaEmPontos ? ' pp' : '%'}`;
  };

  const abrir = (l: LinhaDaEvolucao, mes: number | null) => {
    if (!l.destino || !onAbrirOrigem) return;
    onAbrirOrigem({ destino: l.destino, tipo: l.tipo, ano: Number(ano), mes, meses: ev.mesesDoAcum });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 px-4 py-2" data-testid="evolucao-do-ano">
      {/* BARRA — ano, período, unidade e comparar com a meta. Ano anterior e "Apresentar" são o 01c. */}
      <div className="flex h-[34px] shrink-0 items-center gap-3 rounded-md border border-border bg-card px-2 text-[10px] whitespace-nowrap" data-testid="evolucao-barra">
        <span className="text-muted-foreground">Ano</span>
        <Select value={ano} onValueChange={setAno}>
          <SelectTrigger className="h-[24px] w-[76px] text-[11px] font-semibold"><SelectValue /></SelectTrigger>
          <SelectContent>{anosDisponiveis.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-muted-foreground">Período</span>
        {/* o lugar é reservado (largura fixa): "Mês (set)" muda de tamanho com o mês e nada à direita anda */}
        {/* "Ano · até set" (Gabriel 31/10: o rótulo diz até onde o ano vai) — o lugar cabe "Mês (set) | Ano · até set" com o mês mais largo */}
        <span className="inline-flex w-[150px] shrink-0">
          <Segmentado valor={periodo} onEscolher={setPeriodo} altura={24} opcoes={[
            { valor: 'mes', rotulo: ate ? `Mês (${MESES_CURTOS[ate - 1].toLowerCase()})` : 'Mês' },
            { valor: 'acum', rotulo: ate ? `Ano · até ${MESES_CURTOS[ate - 1].toLowerCase()}` : 'Ano', title: ate ? `O ano até ${MESES_CURTOS[ate - 1].toLowerCase()}, o último mês fechado` : 'O ano até o último mês fechado' },
          ]} />
        </span>
        <span className="text-muted-foreground">Unidade</span>
        <Segmentado valor={unidade} onEscolher={setUnidade} altura={24} opcoes={[
          { valor: 'cab', rotulo: 'Cabeças' },
          { valor: 'arroba', rotulo: '@', title: 'arrobas: o abate pela carcaça ÷ 15; o resto pelo peso vivo ÷ 30' },
          { valor: 'kg', rotulo: 't', title: 'peso vivo em toneladas' },
        ]} />
        <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5">
          <Checkbox checked={comMeta} onCheckedChange={(v) => setComMeta(v === true)} data-testid="evolucao-com-meta" />
          <span>Meta</span>
          {/* a etiqueta tem lugar fixo: aparecer/sumir não empurra nada */}
          <span className={cn('rounded-full bg-[#fff4e0] px-1.5 text-[9.5px] text-[#a15c00]', !dados.metaRascunho && 'invisible')}
            title="a meta deste ano ainda não foi aprovada">rascunho</span>
        </label>
      </div>

      {/* CARDS — realizado do período × meta do ano × % feito. Três reservados (decisão pendente do Gabriel). */}
      <div className="grid h-[52px] shrink-0 grid-cols-6 gap-1.5" data-testid="evolucao-cards">
        <CardReservado titulo="Faturamento pecuário" />
        <Card titulo={`Vendidos · abate + venda`} unidade="cab"
          valor={somaDe(realCab, ['abate', 'venda'])} meta={somaDe(metaDoAno, ['abate', 'venda'])} casas={0} ano={ano} />
        <Card titulo="@ produzidas" unidade="@" valor={valorDe(ev, 'arrobas-produzidas')} meta={valorDe(metaDoAno, 'arrobas-produzidas')} casas={0} ano={ano} />
        <Card titulo="Desfrute" unidade="%" valor={valorDe(ev, 'desfrute')} meta={valorDe(metaDoAno, 'desfrute')} casas={1} ano={ano} />
        <CardReservado titulo="Preço médio de venda" />
        <CardReservado titulo="Estoque para vender" />
      </div>

      {/* A TABELA DO ANO — um scrollport, cabeçalho preso, altura até o fim da tela */}
      <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
        <div className="flex h-[24px] shrink-0 items-center gap-3 border-b border-border px-2 text-[10px]">
          <span className="font-semibold">Movimentação do rebanho</span>
          <span className="truncate text-muted-foreground">
            {unidade === 'cab' ? 'cabeças' : unidade === 'arroba' ? 'arrobas' : 'peso vivo em toneladas'} · {ano} · clique no mês para ver por categoria
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto" data-testid="evolucao-tabela">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col />
              {MESES_COLS.map((m) => <col key={m.key} style={{ width: LARGURA.mes }} />)}
              <col style={{ width: LARGURA.acum }} /><col style={{ width: LARGURA.meta }} /><col style={{ width: LARGURA.delta }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-primary">
              <tr>
                <th className={cn(TH_REGUA, 'pl-2 text-left')}>Movimentação</th>
                {MESES_COLS.map((m, i) => {
                  const aberto = ate == null || i + 1 > ate;
                  return (
                    <th key={m.key} className={cn(TH_REGUA, 'cursor-pointer text-right', aberto && 'opacity-60')}
                      title={`${m.label}/${ano} por categoria`} onClick={() => onAbrirMes?.(Number(ano), i + 1)}>{m.label}</th>
                  );
                })}
                <th className={cn(TH_REGUA, 'text-right')}>{periodo === 'mes' ? 'Mês' : 'Ano'}</th>
                <th className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>Meta</th>
                <th className={cn(TH_REGUA, 'text-right font-normal opacity-80')}>Δ %</th>
              </tr>
            </thead>
            <tbody>
              {ev.linhas.map((l) => (
                <tr key={l.id} className={FUNDO[l.nivel]} data-linha={l.id}>
                  <td className={cn(TD_REGUA, 'pl-2')} title={l.title ?? l.rotulo}>
                    <span className="flex min-w-0 items-center gap-1">
                      <span className={cn('min-w-0 truncate', (l.nivel === 'entrada' || l.nivel === 'saida' || l.nivel === 'interna') && 'pl-2')}
                        data-inteiro="" title={l.title ?? l.rotulo}>
                        {l.nivel === 'bloco-entrada' ? '+ ' : l.nivel === 'bloco-saida' ? '− ' : l.nivel === 'bloco-interna' ? '⇄ ' : ''}{l.rotulo}
                      </span>
                      {l.destino && (
                        <button type="button" className={cn('ml-auto shrink-0 rounded px-1 text-[9.5px] font-medium leading-[13px]', SELO[l.destino].classe)}
                          title={SELO[l.destino].title} onClick={() => abrir(l, null)} data-destino={l.destino}>{SELO[l.destino].rotulo}</button>
                      )}
                    </span>
                  </td>
                  {l.meses.map((v, i) => {
                    const aberto = ate == null || i + 1 > ate;
                    const clicavel = !!l.destino && v != null && v !== 0;
                    return (
                      <td key={i} className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap',
                        aberto && 'bg-[repeating-linear-gradient(135deg,rgba(0,0,0,.025)_0_3px,transparent_3px_6px)] text-muted-foreground',
                        v === 0 && 'text-muted-foreground/60 font-normal', v != null && v < 0 && l.nivel !== 'indicador' && 'text-[#c0262d]',
                        clicavel && 'cursor-pointer underline decoration-dotted decoration-[#8aa0bf] underline-offset-2')}
                        onClick={clicavel ? () => abrir(l, i + 1) : undefined} data-mes={i + 1}>
                        {l.nivel === 'bloco-interna' ? '' : exibir(l, v)}
                      </td>
                    );
                  })}
                  <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap font-bold bg-[rgba(30,45,71,.05)]')} data-coluna="acum">
                    {l.nivel === 'bloco-interna' ? '' : exibir(l, l.acum)}
                  </td>
                  {/* fix1 (item 7): Meta e Δ % são SECUNDÁRIOS — fonte bem menor, sem negrito, cor suave */}
                  <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', SECUNDARIO, 'text-[#c2410c]/70')} data-coluna="meta">
                    {l.nivel === 'bloco-interna' || !comMeta ? '' : exibir(l, l.meta)}
                  </td>
                  <td className={cn(TD_REGUA, 'text-right tabular-nums whitespace-nowrap', SECUNDARIO, 'text-[#1d4ed8]/70')} data-coluna="delta">
                    {l.nivel === 'bloco-interna' || !comMeta ? '' : exibirDelta(l)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* A CONFERÊNCIA FALA: o GMD que salta e por quê (o caminho é o Fechamento Área do mês) */}
          {avisos.length > 0 && (
            <div className="grid gap-1 border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground" data-testid="evolucao-avisos">
              {avisos.map((a) => (
                <div key={a.mes} className="flex items-baseline gap-1.5">
                  <span className="shrink-0 rounded-full bg-[#fff4e0] px-1.5 text-[9.5px] font-semibold text-[#a15c00]">conferir</span>
                  <button type="button" className="text-left hover:underline"
                    onClick={() => onAbrirOrigem?.({ destino: 'fech', ano: Number(ano), mes: a.mes, meses: [a.mes] })}>{a.texto}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  function somaDe(e: typeof ev, ids: string[]): number | null {
    const vs = ids.map((id) => e.linhas.find((l) => l.id === id)?.acum ?? null);
    return vs.every((v) => v == null) ? null : vs.reduce<number>((s, v) => s + (v ?? 0), 0);
  }
}

/** Card: o realizado do período e o % da META DO ANO já feito (na mesma linha, à direita); embaixo a meta e a barra. Sem meta, "—".
 *  ⚠ O número nunca corta (regra do item): o % mora ao lado do valor, a barra é a que cede. */
function Card({ titulo, valor, meta, unidade, casas, ano }: { titulo: string; valor: number | null; meta: number | null; unidade: string; casas: number; ano: string }) {
  const pct = valor != null && meta != null && meta !== 0 ? (valor / meta) * 100 : null;
  return (
    <div className="grid min-w-0 grid-rows-[12px_18px_12px] overflow-hidden rounded-md border border-border bg-card px-2 py-0.5" data-card={titulo}>
      <span className="truncate text-[9.5px] text-muted-foreground" title={titulo}>{titulo}</span>
      <span className="flex items-baseline gap-1 whitespace-nowrap tabular-nums">
        <span className="text-[14px] font-bold leading-[18px]">{valor == null ? '—' : fmtNum(valor, casas)}</span>
        <span className="text-[9.5px] font-semibold text-muted-foreground">{unidade}</span>
        <span className={cn('ml-auto text-[#1d4ed8]/70', SECUNDARIO)} title={`${pct == null ? '—' : `${fmtNum(pct, 0)}%`} da meta de ${ano}`}>{pct == null ? '—' : `${fmtNum(pct, 0)}%`}</span>
      </span>
      <span className={cn('flex items-center gap-1 whitespace-nowrap text-muted-foreground/80 tabular-nums', SECUNDARIO)}>
        <span>meta {ano} {meta == null ? '—' : fmtNum(meta, casas)}</span>
        <span className="h-[4px] min-w-0 flex-1 overflow-hidden rounded bg-[#e8ebf0]">
          <span className="block h-full bg-[#1d4ed8]" style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
        </span>
      </span>
    </div>
  );
}

/** Lugar reservado (Gabriel 30/10: Faturamento, Preço médio e Estoque para vender ainda sem decisão — não construir). */
function CardReservado({ titulo }: { titulo: string }): ReactNode {
  return (
    <div className="grid min-w-0 grid-rows-[12px_18px_12px] overflow-hidden rounded-md border border-dashed border-border bg-card/60 px-2 py-0.5" data-card-reservado={titulo}>
      <span className="truncate text-[9.5px] text-muted-foreground" title={titulo}>{titulo}</span>
      <span className="text-[14px] font-bold leading-[18px] text-muted-foreground/60">—</span>
      <span className="truncate text-[9.5px] text-muted-foreground/70" title="aguardando a definição">em definição</span>
    </div>
  );
}
