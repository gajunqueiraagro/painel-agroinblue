/**
 * FIN-FINANC-28 · P3-GRAFICO — "O que falta pagar": o cronograma do que está em aberto, aberto pelo card da lista (mock
 * `docs/mocks/mock-financiamentos-v1_2.html`, seção 6). Esta peça SÓ DESENHA: os números são de `cronogramaEmAberto.ts` (o dono,
 * em centavos, sobre o mesmo lote da lista) e o gráfico é o `BarrasCompactas` da casa — barras estreitas e coladas, num bloco
 * contido. Nenhuma soma aqui.
 * · 'mensal' (Compras parceladas): coluna vermelha "venc." (as vencidas) e uma por mês, do atual até a última parcela.
 * · 'anual' (Financiamentos): coluna vermelha "venc." e uma por ano, empilhada — principal embaixo, juros previstos em cima.
 * Tamanho fixo, sem rolagem, cabeçalho preso. Fechar não mexe na lista.
 */
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BarrasCompactas, type BarraCompacta } from '@/components/ui/barras-compactas';
import {
  aindaAPagarEmJaneiro, mesAbreviado, reais, rotuloCompacto, rotuloDoPeriodo, type Cronograma,
} from '@/lib/financiamentos/cronogramaEmAberto';

export const COR_PRINCIPAL = 'bg-[#2563a8]';
export const COR_JUROS = 'bg-[#d08a2c]';
export const COR_VENCIDAS = 'bg-[#b91c1c]';

/** A largura do bloco do gráfico e a da barra: 26px até caber; com muitas colunas a barra encolhe (piso 10), nunca a tela. */
const LARGURA_GRAFICO = 620;
const GAP = 6;
export function larguraDaBarra(n: number): number {
  if (n <= 0) return 26;
  return Math.max(10, Math.min(26, Math.floor((LARGURA_GRAFICO - 20 - GAP * (n - 1)) / n)));
}

/** As barras do gráfico — a regra do eixo e do tooltip mora aqui, testável sem montar o diálogo. */
export function barrasDoCronograma(c: Cronograma, modo: 'mensal' | 'anual'): BarraCompacta[] {
  let anoAnterior = '';
  return c.colunas.map((col) => {
    const total = col.totalCent;
    if (col.tipo !== 'periodo') {
      const nome = col.tipo === 'vencidas' ? 'Vencidas' : 'Sem vencimento';
      const title = modo === 'mensal'
        ? `${nome}: vence ${reais(total)} · depois restam ${reais(col.depoisCent)}`
        : `${nome}: principal ${reais(col.principalCent)} · juros ${reais(col.jurosCent)} · total ${reais(total)}`;
      return { rotulo: col.tipo === 'vencidas' ? 'venc.' : 's/ data', valor: total, texto: rotuloCompacto(total), cor: col.tipo === 'vencidas' ? COR_VENCIDAS : 'bg-muted-foreground/50', title, nota: '', corNota: 'text-muted-foreground' };
    }
    if (modo === 'mensal') {
      const ano = col.chave.slice(0, 4);
      const nota = ano !== anoAnterior ? ano : '';
      anoAnterior = ano;
      return {
        rotulo: mesAbreviado(col.chave), rotuloLongo: rotuloDoPeriodo(col.chave), valor: total, texto: total > 0 ? rotuloCompacto(total) : '',
        cor: COR_PRINCIPAL, nota, corNota: 'text-muted-foreground',
        title: `${rotuloDoPeriodo(col.chave)}: vence ${reais(total)} · depois restam ${reais(col.depoisCent)}`,
      };
    }
    return {
      rotulo: col.chave.slice(2), rotuloLongo: col.chave, valor: total, texto: total > 0 ? rotuloCompacto(total) : '',
      segmentos: [{ valor: col.principalCent, cor: COR_PRINCIPAL }, { valor: col.jurosCent, cor: COR_JUROS }],
      nota: '', corNota: 'text-muted-foreground',
      title: `${col.chave}: principal ${reais(col.principalCent)} · juros ${reais(col.jurosCent)} · total ${reais(total)}`,
    };
  });
}

function Numero({ rotulo, valor, tom, testid }: { rotulo: string; valor: string; tom?: string; testid: string }) {
  return (
    <div className="flex flex-col" data-testid={testid}>
      <span className="text-[10px] leading-[14px] text-muted-foreground">{rotulo}</span>
      <span className={`whitespace-nowrap text-[14px] font-semibold leading-[18px] tabular-nums ${tom ?? ''}`}>{valor}</span>
    </div>
  );
}

export function CronogramaEmAbertoDialog({ aberto, aoFechar, modo, cronograma, hoje, recorte }: {
  aberto: boolean;
  aoFechar: () => void;
  modo: 'mensal' | 'anual';
  cronograma: Cronograma;
  /** a data local da tela (a mesma que o lote usou) */
  hoje: string;
  /** o que os filtros deixaram, escrito no cabeçalho ("42 compras · filtro Ativo") */
  recorte: string;
}) {
  const c = cronograma;
  const barras = barrasDoCronograma(c, modo);
  const jan = aindaAPagarEmJaneiro(c, hoje);
  const ultima = c.ultima ? (modo === 'mensal' ? rotuloDoPeriodo(c.ultima) : c.ultima) : '—';
  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[400px] w-[680px] max-w-[680px] flex-col gap-0 overflow-hidden p-0" data-testid="cronograma-em-aberto">
        <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[12px] font-semibold">O que falta pagar</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 truncate text-[10px] text-primary-foreground/80" title={recorte}>
            {modo === 'mensal' ? 'mês a mês' : 'ano a ano'} · {recorte}
          </DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3">
          {modo === 'mensal' ? (
            <div className="flex h-[34px] shrink-0 gap-7" data-testid="numeros-do-cronograma">
              <Numero testid="num-a-pagar" rotulo="A pagar hoje" valor={reais(c.totalCent)} />
              {c.vencidasCent > 0 && <Numero testid="num-vencidas" rotulo="Vencidas" valor={reais(c.vencidasCent)} tom="text-[#b91c1c]" />}
              <Numero testid="num-janeiro" rotulo={`Ainda a pagar em ${jan.rotulo}`} valor={reais(jan.cent)} />
              <Numero testid="num-ultima" rotulo="Última parcela" valor={ultima} />
            </div>
          ) : (
            <div className="flex h-[34px] shrink-0 gap-7" data-testid="numeros-do-cronograma">
              <Numero testid="num-principal" rotulo="Principal a pagar" valor={reais(c.principalCent)} />
              <Numero testid="num-juros" rotulo="Juros previstos" valor={reais(c.jurosCent)} />
              <Numero testid="num-ultima" rotulo="Último vencimento" valor={ultima} />
            </div>
          )}
          <div className="min-h-0 flex-1" data-testid="grafico-do-cronograma">
            {barras.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Nada em aberto no recorte.</div>
            ) : (
              <BarrasCompactas barras={barras} titulo={modo === 'mensal' ? 'Parcelas que vencem no mês' : 'Parcelas que vencem no ano'}
                altura={190} larguraMax={LARGURA_GRAFICO} larguraBarra={larguraDaBarra(barras.length)} fonteValor={8} tituloNaColuna
                legenda={modo === 'mensal'
                  ? 'Vermelho = já vencidas e não pagas. O número em cima é o valor em milhares; passe o mouse para ver o valor e o que resta depois.'
                  : undefined} />
            )}
          </div>
          {modo === 'anual' && (
            <div className="flex h-[16px] shrink-0 items-center gap-3 text-[10px] text-muted-foreground" data-testid="legenda-anual">
              <span className="inline-flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${COR_PRINCIPAL}`} />principal</span>
              <span className="inline-flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${COR_JUROS}`} />juros previstos</span>
              <span className="inline-flex items-center gap-1"><span className={`inline-block size-2 rounded-sm ${COR_VENCIDAS}`} />vencidas</span>
              <span className="ml-auto">Juros previstos como estão no cronograma de cada contrato.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
