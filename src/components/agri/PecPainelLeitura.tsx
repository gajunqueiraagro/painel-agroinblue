/**
 * O PAINEL DA DIREITA DO DRE DA PECUÁRIA — DRE-PAINEL-01 (mock `ui-validar/dre-painel-01-ref/mock-aprovado.html`).
 *
 * Três blocos sobre o MESMO par de colunas da grade (o período da tela × a comparação ativa): "No mês" (Lucro operacional/ha,
 * Resultado econômico/ha, Custo total/ha, cada um com o Δ/ha), a PONTE do lucro operacional (da comparação ao mês, pelos seis Δ) e
 * a LEITURA DO MÊS (as cinco que mais pesaram, com o link que resolve). No cabeçalho, o selo de confiança (P9) e o que falta.
 *
 * ⚠ NENHUMA REGRA AQUI: os números, as frases, a ordem e o selo saem de `src/lib/dre/leitura.ts` (um módulo só para o painel e o
 *   mês a mês). Este arquivo só desenha.
 * ⚠ "—" É AUSÊNCIA: sem comparação não há Δ, nem ponte, nem leitura — o painel diz isso, nunca mostra zero.
 */
import { cn } from '@/lib/utils';
import { formatNum } from '@/lib/calculos/formatters';
import {
  leituraDoMes, noMes, ponteDoLucroOperacional, curto,
  type Comparacao, type DestinoLeitura, type DestinoFalta, type ItemLeitura, type Selo, type GrauConfianca,
} from '@/lib/dre/leitura';
import type { DrePecLinhas } from '@/hooks/useDrePecuaria';
import { NAVY_TOTAL } from '@/components/agri/dreGrade';

export type DestinoDoPainel = DestinoLeitura | { tipo: DestinoFalta };

const MENOS = '−';
const comSinal = (v: number, casas: number) => `${v < 0 ? MENOS : '+'}${formatNum(Math.abs(v), casas)}`;
const rs2 = (v: number | null) => (v == null ? '—' : `R$ ${v < 0 ? MENOS : ''}${formatNum(Math.abs(v), 2)}`);
const corDoNumero = (v: number | null, custo = false) =>
  (v == null || v === 0 ? 'text-muted-foreground' : (custo ? v > 0 : v < 0) ? 'text-red-600' : 'text-green-700');

const ROTULO_DO_SELO: Record<GrauConfianca, string> = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Confiança baixa' };
const COR_DO_SELO: Record<GrauConfianca, string> = {
  alta: 'bg-green-100 text-green-800', media: 'bg-amber-100 text-amber-800', baixa: 'bg-red-100 text-red-700',
};

const TEXTO_DO_LINK: Record<DestinoDoPainel['tipo'], string> = {
  valor_rebanho: 'Ver variação do rebanho →',
  notas_a_lancar: 'Ver notas →',
  abates: 'Ver abates →',
  linha_dre: 'Ver lançamentos →',
  conciliacao: 'Abrir Conciliação →',
  fechamento_pastos: 'Abrir fechamento →',
};

export function PecPainelLeitura({
  atual, base, comparacao, rotuloAtual, rotuloBase, rotuloBaseFrase, carregandoBase, notasALancar, selo, altura, onDestino,
}: {
  /** O total do período da tela (a coluna "Total"/"Atual" da grade). */
  atual: DrePecLinhas;
  /** O total da comparação ativa — o ano anterior, a Meta ou a Média 12m. `null` = sem comparação. */
  base: DrePecLinhas | null;
  comparacao: Comparacao;
  /** "out/26" — o cabeçalho e a ponte. */
  rotuloAtual: string;
  /** "out/25" · "Meta" · "Média 12m" — o cabeçalho e a ponte. */
  rotuloBase: string;
  /** "out/25" · "a Meta" · "a média de 12 meses" — dentro das frases. */
  rotuloBaseFrase: string;
  carregandoBase: boolean;
  /** As Notas da Receita em "A lançar" emitidas no período (D5) — `null` enquanto não carregou ou se falhou. */
  notasALancar: number | null;
  selo: Selo;
  /** A altura do cartão da grade: o painel termina no mesmo y e rola por dentro. */
  altura: number | null;
  onDestino: (d: DestinoDoPainel) => void;
}) {
  const indicadores = noMes(base, atual);
  const ponte = base ? ponteDoLucroOperacional(base, atual) : null;
  const itens = base
    ? leituraDoMes({ base, atual, comparacao, rotuloBase: rotuloBaseFrase, notasALancar })
    : [];
  const semBase = carregandoBase ? 'Carregando a comparação…' : 'Sem comparação: escolha "Comparar com" para ler o mês.';

  return (
    <aside data-testid="dre-painel-leitura" data-desloca-livre=""
      className="flex min-w-0 flex-col gap-2 overflow-auto rounded-lg border border-border/60 bg-card px-3 py-2"
      style={altura ? { height: altura } : undefined}>

      {/* ── cabeçalho: o horizonte e o selo (P9) ── */}
      <div className="flex h-[22px] shrink-0 items-center gap-2">
        <span className="text-[11px] font-semibold">No mês</span>
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" title={`contra ${rotuloBase}`}>contra {rotuloBase}</span>
        <span data-testid="dre-selo-confianca"
          className={cn('shrink-0 rounded px-1.5 py-[1px] text-[10px] font-medium',
            selo.grau ? COR_DO_SELO[selo.grau] : 'bg-muted text-muted-foreground')}
          title={selo.falta.length > 0 ? `Para subir de grau:\n${selo.falta.map(f => `• ${f.motivo}`).join('\n')}` : 'Nada a resolver neste mês'}>
          {selo.grau ? ROTULO_DO_SELO[selo.grau] : 'Confiança —'}
        </span>
      </div>
      {selo.falta.length > 0 && (
        <ul className="-mt-1 flex shrink-0 flex-col gap-[2px]" data-testid="dre-selo-falta">
          {selo.falta.map(f => (
            <li key={f.motivo} className="flex items-baseline gap-1 text-[10px] leading-[13px] text-muted-foreground">
              <span className="min-w-0 flex-1">{f.motivo}</span>
              <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => onDestino({ tipo: f.destino })}>
                {TEXTO_DO_LINK[f.destino]}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ── No mês: por hectare, com o Δ/ha contra a comparação ── */}
      <table className="w-full shrink-0 border-collapse text-[10px]" style={{ tableLayout: 'fixed' }}>
        <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 96 }} /></colgroup>
        <thead>
          <tr className="h-[16px] text-[9.5px] text-muted-foreground">
            <th className="text-left font-normal">por hectare</th>
            <th className="text-right font-normal">{rotuloAtual}</th>
            <th className="text-right font-normal">Δ contra {rotuloBase}</th>
          </tr>
        </thead>
        <tbody>
          {[
            { rotulo: 'Lucro operacional/ha', ind: indicadores.lucroOpHa, custo: false },
            { rotulo: 'Resultado econômico/ha', ind: indicadores.resEconHa, custo: false },
            { rotulo: 'Custo total/ha', ind: indicadores.custoTotalHa, custo: true },
          ].map(({ rotulo, ind, custo }) => (
            <tr key={rotulo} className="h-[18px] border-t border-border/40">
              <td className="truncate" title={custo ? 'Custo variável + fixo + rateio administrativo, sem juros, ÷ ha da coluna' : `${rotulo} ÷ ha da coluna`}>{rotulo}</td>
              <td className={cn('text-right tabular-nums', corDoNumero(ind.valor, custo))}>{rs2(ind.valor)}</td>
              <td className={cn('text-right tabular-nums', corDoNumero(ind.delta, custo))}>
                {ind.delta == null ? '—' : `${comSinal(ind.delta, 2)}/ha`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── a ponte do lucro operacional ── */}
      <div className="shrink-0">
        <div className="flex h-[16px] items-baseline justify-between text-[10px]">
          <span className="font-medium">Do lucro operacional de {rotuloBase} ao de {rotuloAtual}</span>
          <span className="text-muted-foreground">R$ mil</span>
        </div>
        {ponte ? <Ponte ponte={ponte} rotuloInicio={rotuloBase} rotuloFim={rotuloAtual} /> : (
          <div className="flex h-[118px] items-center justify-center text-[10px] text-muted-foreground">
            {base ? 'Sem lucro operacional numa das pontas: não há ponte.' : semBase}
          </div>
        )}
      </div>

      {/* ── a leitura do mês ── */}
      <div className="flex min-h-0 flex-col">
        <div className="flex h-[16px] shrink-0 items-baseline gap-2 text-[10px]">
          <span className="font-medium">Leitura do mês</span>
          <span className="text-muted-foreground">o que mais pesou no lucro operacional</span>
        </div>
        {!base ? (
          <p className="py-2 text-[10px] text-muted-foreground">{semBase}</p>
        ) : itens.length === 0 ? (
          <p className="py-2 text-[10px] text-muted-foreground">Nenhuma linha com desvio (≥ 20% e ≥ R$ 10 mil) contra {rotuloBaseFrase}.</p>
        ) : (
          <ol className="flex flex-col" data-testid="dre-leitura-mes">
            {itens.map((it, i) => <ItemDaLeitura key={it.id} item={it} n={i + 1} onDestino={onDestino} />)}
          </ol>
        )}
      </div>
    </aside>
  );
}

function ItemDaLeitura({ item, n, onDestino }: { item: ItemLeitura; n: number; onDestino: (d: DestinoDoPainel) => void }) {
  return (
    <li className="grid gap-x-2 border-t border-border/40 py-1" style={{ gridTemplateColumns: '16px minmax(0,1fr) 84px' }}>
      <span className={cn('mt-[1px] flex h-[14px] w-[14px] items-center justify-center rounded-full text-[9.5px] font-semibold',
        item.anomalia ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground')}
        title={item.anomalia ? 'Sinal trocado ou zerado contra a comparação' : undefined}>
        {item.anomalia ? '!' : n}
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-medium leading-[14px]">{item.titulo}</div>
        <div className="text-[10px] leading-[13px] text-muted-foreground">{item.frase}</div>
        <button type="button" className="text-[10px] leading-[14px] text-primary hover:underline" onClick={() => onDestino(item.destino)}>
          {TEXTO_DO_LINK[item.destino.tipo]}
        </button>
      </div>
      <span className={cn('text-right text-[10px] tabular-nums leading-[14px]', corDoNumero(item.efeito))}
        title="Efeito no lucro operacional (R$)">
        {item.efeito === 0 ? '0' : comSinal(item.efeito, 0)}
      </span>
    </li>
  );
}

/**
 * A PONTE EM COLUNAS: início (a comparação), os seis degraus e o fim (o mês). Cada degrau flutua do acumulado anterior; o "—"
 * (a Meta sem Variação por produção, D2) é uma barra tracejada "sem meta" com o valor só no `title` (D-A2).
 * ⚠ HTML E NÃO SVG: o texto fica em px fixos (piso 9,5) em qualquer largura do painel.
 */
function Ponte({ ponte, rotuloInicio, rotuloFim }: {
  ponte: NonNullable<ReturnType<typeof ponteDoLucroOperacional>>; rotuloInicio: string; rotuloFim: string;
}) {
  type Barra = { chave: string; rotulo: string; de: number; ate: number; valor: number | null; tipo: 'total' | 'mais' | 'menos' | 'sem' };
  const barras: Barra[] = [{ chave: 'inicio', rotulo: rotuloInicio, de: 0, ate: ponte.inicio, valor: ponte.inicio, tipo: 'total' }];
  let acc = ponte.inicio;
  for (const d of ponte.degraus) {
    const passo = d.efeito ?? ponte.semExplicacao;
    barras.push({
      chave: d.chave, rotulo: d.efeito == null ? 'sem meta' : d.rotulo, de: acc, ate: acc + passo, valor: d.efeito,
      tipo: d.efeito == null ? 'sem' : passo >= 0 ? 'mais' : 'menos',
    });
    acc += passo;
  }
  barras.push({ chave: 'fim', rotulo: rotuloFim, de: 0, ate: ponte.fim, valor: ponte.fim, tipo: 'total' });
  const pontos = barras.flatMap(b => [b.de, b.ate]).concat(0);
  const max = Math.max(...pontos);
  const min = Math.min(...pontos);
  const faixa = max - min || 1;
  const y = (v: number) => ((max - v) / faixa) * 100;
  const COR = { total: '', mais: 'bg-green-600', menos: 'bg-red-500', sem: 'border border-dashed border-muted-foreground bg-muted' };
  return (
    <div data-testid="dre-ponte" className="flex h-[118px] items-stretch gap-[3px]"
      title={ponte.fecha ? 'Os degraus somam a diferença ao centavo' : 'Sem a Variação por produção da Meta, os degraus não explicam tudo: a diferença é o degrau "sem meta"'}>
      {barras.map(b => {
        const topo = Math.min(y(b.de), y(b.ate));
        const alt = Math.max(Math.abs(y(b.de) - y(b.ate)), 0.8);
        const texto = b.valor == null ? '—' : b.tipo === 'total' ? (b.valor < 0 ? MENOS : '') + formatNum(Math.abs(b.valor) / 1000, 0)
          : comSinal(b.valor / 1000, 0);
        return (
          <div key={b.chave} className="flex min-w-0 flex-1 flex-col items-stretch">
            <div className="relative h-[88px]">
              <div className={cn('absolute inset-x-[2px] rounded-[1px]', COR[b.tipo])}
                style={{ top: `${topo}%`, height: `${alt}%`, ...(b.tipo === 'total' ? { backgroundColor: NAVY_TOTAL } : {}) }}
                title={b.valor == null ? `sem meta: R$ ${curto(ponte.semExplicacao)} que os degraus conhecidos não explicam` : `R$ ${formatNum(b.valor, 2)}`} />
              <span className="absolute inset-x-0 text-center text-[9.5px] tabular-nums leading-[11px]"
                style={{ top: `calc(${topo}% - 12px)` }}>{texto}</span>
            </div>
            <span className="mt-[2px] h-[26px] text-center text-[9.5px] leading-[12px] text-muted-foreground">{b.rotulo}</span>
          </div>
        );
      })}
    </div>
  );
}
