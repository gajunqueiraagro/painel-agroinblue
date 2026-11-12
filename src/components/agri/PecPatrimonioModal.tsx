/**
 * A VARIAÇÃO DO VALOR DO REBANHO — DRE-VARIACAO-SIMPLES-01 (Gabriel 10/11 16:54; mock
 * ui-validar/variacao-simples.html). Eram 6 abas (Explicação · Resumo · Produção · Mercado ·
 * Movimentos · Gráfico); agora são 2, para o dono da fazenda entender em 10 segundos:
 *   Resumo — a frase, os 3 cards (@, preço médio, valor), o extrato das @, onde aparece no DRE e um
 *   gráfico grande de cada vez.
 *   Por categoria — gado jovem × adulto, com subtotais.
 *
 * ⚠ MESMO PONTO DE ABERTURA E MESMA FONTE: as três linhas do DRE abrem este modal, e os números
 * vêm da `fn_dre_pecuaria_patrimonio` (o `vpb`/`efeito` de cada categoria = as linhas do DRE, ao
 * centavo — FASE 0 de 10/11). Nada é recalculado aqui; ver `variacaoSimples.ts`.
 *
 * ⚠ A ARROBA É A DA CASA: `kgToArrobas` (`src/types/cattle.ts`), peso vivo ÷ 30.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { kgToArrobas, CATEGORIAS } from '@/types/cattle';
import type { PatrimonioPec, CategoriaPatrimonio } from '@/hooks/useDrePecuaria';
import type { InsumosDidaticos } from '@/pages/PecDrePanel';
import { ResumoDaVariacao, PorCategoriaDaVariacao } from '@/components/agri/PecVariacaoSimples';
import { datasDasPontas, type CatDaVariacao } from '@/components/agri/variacaoSimples';

/** ⚠ O NOME DE EXIBIÇÃO DA CASA, NUNCA O CÓDIGO: `CATEGORIAS` é a mesma lista dos lançamentos. */
const NOME_CAT = new Map(CATEGORIAS.map(c => [c.value as string, c.label]));
const nomeDe = (cod: string) => NOME_CAT.get(cod) ?? cod;

/**
 * Jovens = mamotes e desmama; adultos = o resto.
 * ⚠ EXPORTADO PARA NÃO SER REDEFINIDO — COMPACTO-03b. A Evolução Patrimonial desenha a composição
 * jovens × adultos com esta mesma lista: a pergunta "este bicho é jovem?" tem uma resposta só.
 */
export const JOVENS = new Set(['mamotes_m', 'mamotes_f', 'desmama_m', 'desmama_f']);
export const ehJovem = (codigo: string) => JOVENS.has(codigo);

/**
 * A LARGURA DO MODAL — a da tabela Por categoria (830px, `COLS_P8`) + o cromo (padding 12+12 do
 * card, 8+8 do corpo, borda) + folga. Abaixo dela o `DialogContent` fica a 95% da janela.
 */
const LARGURA_MODAL = 900;
const NAVY = '#0C447C';

type Aba = 'resumo' | 'categoria';
const ABAS: readonly (readonly [Aba, string])[] = [['resumo', 'Resumo'], ['categoria', 'Por categoria']];

/**
 * @ de uma ponta: cabeças × peso médio, em arrobas da casa.
 * ⚠ ZERO CABEÇAS É ZERO ARROBA, NÃO AUSÊNCIA: a categoria que não existia no início tem estoque
 * zero, e isso se sabe (medido no NJ jul/22-jun/23, categoria `bois`).
 */
const arrobas = (q: number, pm: number | null) => (q === 0 ? 0 : pm == null ? 0 : kgToArrobas(q * pm));

/** O payload nas unidades da tela. Produção e Mercado são o `vpb` e o `efeito` da RPC. */
function montar(cats: readonly CategoriaPatrimonio[]): CatDaVariacao[] {
  return cats.map(c => ({
    cod: c.categoria, nome: nomeDe(c.categoria), jovem: JOVENS.has(c.categoria),
    at0: arrobas(c.q0, c.pm0), at1: arrobas(c.q1, c.pm1),
    v0: c.v0, v1p0: c.v1_p0, v1p1: c.v1_p1,
    producao: c.vpb, mercado: c.efeito,
  /* ⚠ CATEGORIA ZERADA NAS DUAS PONTAS SOME — menos a que só passou por troca de categoria: a
     produção dela (o ágio, que está dentro do `vpb`) é real. */
  })).filter((c, i) => cats[i].q0 !== 0 || cats[i].q1 !== 0 || c.producao !== 0 || c.mercado !== 0);
}

export function PecPatrimonioModal({
  aberto, fazendaNome, clienteNome, patrimonio, carregando, insumos,
  onFechar, onCorrigirPrecos,
}: {
  aberto: boolean;
  fazendaNome: string;
  clienteNome: string;
  /** Qual linha do DRE abriu. As três abrem no Resumo (DRE-VARIACAO-SIMPLES-01). */
  qual: 'vpb' | 'efeito' | 'ponte';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /** O período DA COLUNA clicada — ver `onAbrirDidatico` em `PecDrePanel`. */
  periodo: { de: string; ate: string };
  /**
   * OS NÚMEROS DO DRE DA COLUNA CLICADA — a P6 ("Onde aparece no DRE") os mostra.
   * ⚠ ELES VIAJAM COM O CLIQUE em vez de serem lidos de novo: têm de bater com o que AQUELA
   * coluna mostra.
   */
  insumos: InsumosDidaticos;
  onFechar: () => void;
  /**
   * "CORRIGIR PREÇOS DE {ano}" — fecha o modal e vai para a tela Valor do Rebanho naquele ano.
   * ⚠ O ANO É O DE P1 (o preço que move o efeito de mercado é o do fim). Opcional: sem o callback
   * o link não aparece.
   */
  onCorrigirPrecos?: (ano: number) => void;
}) {
  const [aba, setAba] = useState<Aba>('resumo');
  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  const anoP1 = /^\d{4}-\d{2}$/.test(p1) ? Number(p1.slice(0, 4)) : null;
  const cats = useMemo(() => montar(patrimonio?.categorias ?? []), [patrimonio]);
  const datas = useMemo(() => datasDasPontas(p0, p1), [p0, p1]);

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent style={{ maxWidth: LARGURA_MODAL }}
        className="flex h-[calc(100vh-16px)] max-h-[760px] flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start justify-between gap-3 px-3 py-[5px] text-white" style={{ backgroundColor: NAVY }}>
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold leading-[17px]">Variação do valor do rebanho</h2>
            <div className="truncate text-[11px] leading-[15px] text-white/80">
              {[clienteNome, fazendaNome].filter(Boolean).join(' · ')}
              {patrimonio ? ` · ${datas.inicio} a ${datas.fim}` : ''}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {/* ⚠ À ESQUERDA DAS ABAS: é uma saída da tela, não uma terceira aba. */}
            {onCorrigirPrecos && anoP1 != null && (
              <button type="button" onClick={() => { onFechar(); onCorrigirPrecos(anoP1); }}
                className="mr-1 shrink-0 text-[10px] underline underline-offset-2 hover:opacity-80"
                style={{ color: '#B5D4F4' }}>
                Corrigir preços de {anoP1}
              </button>
            )}
            {ABAS.map(([v, r]) => (
              <button key={v} type="button" onClick={() => setAba(v)} data-aba={v}
                className={cn('rounded px-2 py-0.5 text-[11px] font-medium leading-[18px] transition-colors',
                  aba === v ? 'bg-white text-[#0C447C]' : 'text-white/80 hover:bg-white/10')}>
                {r}
              </button>
            ))}
            <button type="button" onClick={onFechar} aria-label="Fechar"
              className="ml-0.5 text-white/80 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ⚠ O MODAL NÃO ROLA (regra soberana; ajuste do Chat 11/11 05:52): altura da janela − 24px (teto 760) e o corpo SEM
            scroll — o gráfico do Resumo é que fica com a altura que sobra. As duas abas ficam MONTADAS, sobrepostas na mesma
            célula de grid: trocar de aba não move o modal. */}
        <div className="min-h-0 flex-1 overflow-hidden bg-muted/30 p-1.5">
          {carregando || !patrimonio ? (
            <div className="flex h-full min-h-[280px] items-center justify-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] [&>*]:col-start-1 [&>*]:row-start-1">
              <div className={cn('min-h-0', aba !== 'resumo' && 'invisible pointer-events-none')}>
                <ResumoDaVariacao patrimonio={patrimonio} cats={cats} insumos={insumos} datas={datas} />
              </div>
              <div className={cn('min-h-0', aba !== 'categoria' && 'invisible pointer-events-none')}>
                <PorCategoriaDaVariacao cats={cats} />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 truncate px-3 text-[9.5px] leading-[22px] text-white/80" style={{ backgroundColor: NAVY }}>
          Valores estimados · preços do valor do rebanho de cada mês · arrobas = kg vivo ÷ 30
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A CAMINHADA DO VALOR — valia · + produção · + mercado · vale (mock v16b, fix5).
 * ⚠ O PREÇO DE CADA LINHA É O DELA: `valor / arrobas`, nunca emprestado de outra linha.
 * (A tela de 2 abas não a desenha mais; segue exportada com o teste dela.)
 */
export interface PassoValor {
  rot: string;
  arrobas: number | null;
  preco: number | null;
  valor: number;
  /** `null` na primeira linha: não há variação antes de começar. */
  variacao: number | null;
}

export function caminhadaDoValor(t: {
  at0: number; at1: number; v0: number; v1p0: number; v1p1: number;
  dProd: number; dMerc: number; dTotal: number;
}): PassoValor[] {
  const preco = (valor: number, at: number) => (at === 0 ? null : valor / at);
  return [
    { rot: 'Valia', arrobas: t.at0 === 0 ? null : t.at0, preco: preco(t.v0, t.at0),
      valor: t.v0, variacao: null },
    { rot: '+ Produção', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p0, t.at1),
      valor: t.v1p0, variacao: t.dProd },
    { rot: '+ Mercado', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dMerc },
    { rot: 'Vale', arrobas: t.at1 === 0 ? null : t.at1, preco: preco(t.v1p1, t.at1),
      valor: t.v1p1, variacao: t.dTotal },
  ];
}
