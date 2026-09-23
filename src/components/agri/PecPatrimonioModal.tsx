/**
 * O MODAL DIDÁTICO DAS DUAS VARIAÇÕES — PR-DRE-PECUARIA-02 §6.
 *
 * ⚠ ELE EXISTE PARA SEPARAR DUAS COISAS QUE SOMAM IGUAL E QUEREM DIZER O OPOSTO. "Variação por
 * produção" é o rebanho que mudou com o PREÇO CONGELADO do fechamento anterior; "Efeito de
 * mercado" é o preço que mudou com o REBANHO congelado. Fundi-las numa "variação de patrimônio"
 * esconderia qual das duas respondeu pelo resultado — que é exatamente a pergunta que o produtor
 * faz quando o número sobe sem ele ter vendido nada.
 * ⚠ O VALOR DO MEIO É A CHAVE. São três valores para duas datas: `v0` (início a preço do início),
 * `v1_p0` (fim a preço do INÍCIO) e `v1_p1` (fim a preço do fim). VPB = `v1_p0 − v0`; Efeito =
 * `v1_p1 − v1_p0`. Sem o valor do meio as duas variações seriam indistinguíveis.
 *
 * ⚠ NÃO HÁ ABA "LANÇAMENTOS", e isso é dado, não omissão: patrimônio não tem lançamento. Ele sai
 * de `valor_rebanho_fechamento_itens` — a foto do rebanho no fim de cada mês. Oferecer a aba e
 * mostrá-la vazia faria parecer que falta cadastro.
 */
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNum, formatMoeda } from '@/lib/calculos/formatters';
import { Segmentado } from '@/components/ui/segmentado';
import { corDoSinal } from '@/components/agri/dreGrade';
import type { PatrimonioPec } from '@/hooks/useDrePecuaria';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-07" → "jul/26" — o mesmo idioma do seletor de período. */
const rotuloMes = (am: string) => {
  const [a, m] = (am || '').split('-');
  const i = Number(m) - 1;
  return i >= 0 && i < 12 ? `${MESES[i]}/${a.slice(2)}` : (am || '—');
};

const TH = 'px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground';
const TD = 'truncate px-1.5 py-0.5 text-[10px] tabular-nums';

const traco = (v: number | null | undefined, casas = 2) =>
  (v == null ? '—' : formatNum(v, casas));

/** Um cartão de uma das pontas. */
function Cartao({ titulo, linhas }: {
  titulo: string; linhas: ReadonlyArray<{ rotulo: string; valor: string; forte?: boolean }>;
}) {
  return (
    <div className="rounded-md border bg-card p-2">
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </div>
      {linhas.map(l => (
        <div key={l.rotulo} className="flex items-baseline justify-between gap-2 py-0.5">
          <span className="text-[10px] text-muted-foreground">{l.rotulo}</span>
          <span className={cn('tabular-nums', l.forte ? 'text-[12px] font-bold' : 'text-[11px]')}>
            {l.valor}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PecPatrimonioModal({
  aberto, fazendaNome, qual, patrimonio, carregando, p0Fonte, p1Fonte, onFechar,
}: {
  aberto: boolean;
  /** A coluna clicada. "Total" quando é a coluna de todas. */
  fazendaNome: string;
  /** Qual das duas linhas abriu — governa o destaque, não o conteúdo. */
  qual: 'vpb' | 'efeito';
  patrimonio: PatrimonioPec | null;
  carregando: boolean;
  /**
   * DE ONDE VEIO CADA PONTA — VPB-REGRA-UNICA-01.
   *
   * ⚠ NENHUMA DAS DUAS ESCONDE A TABELA, e essa é a mudança. O modal tinha um estado "sem P0" que
   * trocava a grade por uma frase — "sem a foto do rebanho na ponta inicial não há variação a
   * calcular". Não há mais esse caso: ausência de fechamento vale ZERO e a conta existe sempre. O
   * que a fonte faz é explicar de onde o número saiu, acima de uma tabela que continua visível.
   */
  p0Fonte: 'fechamento' | 'cadastro' | 'zero' | null;
  p1Fonte: 'fechamento' | 'cadastro' | 'zero' | null;
  onFechar: () => void;
}) {
  const [aba, setAba] = useState<'pontas' | 'categorias'>('pontas');

  const p0 = patrimonio?.p0 ?? '';
  const p1 = patrimonio?.p1 ?? '';
  const t = patrimonio?.total;

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start justify-between gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              {qual === 'vpb' ? 'Variação por produção' : 'Efeito de mercado'}
            </h2>
            <div className="mt-0.5 truncate text-[11px] text-primary-foreground/80">
              {[fazendaNome, p0 && p1 ? `${rotuloMes(p0)} → ${rotuloMes(p1)}` : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="shrink-0 text-primary-foreground/80 hover:text-primary-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 bg-muted/30 p-3">
          {/* ⚠ SEGMENTADO, NÃO `TabsList` — regra permanente do CLAUDE.md para qualquer aba nova. */}
          <Segmentado valor={aba} onEscolher={setAba}
            opcoes={[
              { valor: 'pontas', rotulo: 'Início e fim' },
              { valor: 'categorias', rotulo: 'Por categoria' },
            ]} />

          {/* ⚠ A FRASE EXPLICA UM NÚMERO, não justifica uma ausência: a tabela abaixo está lá nos
              três casos, e é nela que se vê o rebanho partindo de zero ou indo a zero, categoria a
              categoria. */}
          {p0Fonte === 'cadastro' && (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
              Sem fechamento em {rotuloMes(p0)}: a ponta inicial é o <strong className="font-medium">rebanho
              cadastrado</strong> no primeiro mês do período, valorado ao preço do primeiro
              fechamento. Vacas de descarte entram como vacas.
            </div>
          )}
          {p0Fonte === 'zero' && (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
              Sem gado em {rotuloMes(p0)}: o período começa com <strong className="font-medium">estoque
              zero</strong> — a variação é tudo o que entrou.
            </div>
          )}
          {p1Fonte === 'zero' && (
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[10px] text-muted-foreground">
              Sem gado em {rotuloMes(p1)}: o período termina com <strong className="font-medium">estoque
              zero</strong> — a atividade não tinha rebanho no fim.
            </div>
          )}

          {carregando || !patrimonio || !t ? (
            <div className="rounded-md border bg-card px-3 py-6 text-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin align-[-2px]" /> Carregando…
            </div>
          ) : aba === 'pontas' ? (
            <div className="space-y-2">
              <div className="grid gap-2 md:grid-cols-2">
                <Cartao titulo={`Início · fechamento de ${rotuloMes(p0)}`} linhas={[
                  { rotulo: 'Cabeças', valor: `${formatNum(t.q0, 0)} cab` },
                  { rotulo: 'Valor', valor: formatMoeda(t.v0), forte: true },
                ]} />
                <Cartao titulo={`Fim · fechamento de ${rotuloMes(p1)}`} linhas={[
                  { rotulo: 'Cabeças', valor: `${formatNum(t.q1, 0)} cab` },
                  /* ⚠ OS DOIS VALORES DO FIM, lado a lado: é a diferença entre eles que é o
                     efeito de mercado, e vê-los juntos é o que torna a conta óbvia. */
                  { rotulo: `Valor a preço de ${rotuloMes(p0)}`, valor: formatMoeda(t.v1_p0) },
                  { rotulo: `Valor a preço de ${rotuloMes(p1)}`, valor: formatMoeda(t.v1_p1), forte: true },
                ]} />
              </div>
              <div className="rounded-md border bg-card p-2">
                {([
                  { rot: 'Variação por produção', conta: `${rotuloMes(p1)} a preço de ${rotuloMes(p0)} − ${rotuloMes(p0)}`, v: t.vpb, meu: qual === 'vpb' },
                  { rot: 'Efeito de mercado', conta: `${rotuloMes(p1)} a preço de ${rotuloMes(p1)} − a preço de ${rotuloMes(p0)}`, v: t.efeito, meu: qual === 'efeito' },
                ] as const).map(l => (
                  <div key={l.rot}
                    className={cn('flex items-baseline justify-between gap-2 rounded px-1.5 py-1',
                      l.meu && 'bg-muted')}>
                    <span className="min-w-0">
                      <span className="text-[11px] font-medium">{l.rot}</span>
                      <span className="ml-2 text-[9px] text-muted-foreground">{l.conta}</span>
                    </span>
                    <span className={cn('shrink-0 text-[13px] font-medium tabular-nums', corDoSinal(l.v))}>
                      {formatMoeda(l.v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-h-[52vh] overflow-auto rounded-md border bg-card">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgba(0,0,0,.08)]">
                    <th className={cn(TH, 'text-left')}>Categoria</th>
                    <th className={cn(TH, 'text-right')}>cab {rotuloMes(p0)}</th>
                    <th className={cn(TH, 'text-right')}>cab {rotuloMes(p1)}</th>
                    <th className={cn(TH, 'text-right')}>R$/kg {rotuloMes(p0)}</th>
                    <th className={cn(TH, 'text-right')}>R$/kg {rotuloMes(p1)}</th>
                    <th className={cn(TH, 'text-right')}>VPB</th>
                    <th className={cn(TH, 'text-right')}>Efeito</th>
                  </tr>
                </thead>
                <tbody>
                  {patrimonio.categorias.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                      Nenhuma categoria nas duas pontas.
                    </td></tr>
                  )}
                  {patrimonio.categorias.map(c => (
                    <tr key={c.categoria} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                      <td className={cn(TD, 'text-left')} title={c.categoria}>{c.categoria}</td>
                      <td className={cn(TD, 'text-right')}>{formatNum(c.q0, 0)}</td>
                      <td className={cn(TD, 'text-right')}>{formatNum(c.q1, 0)}</td>
                      {/* ⚠ QUATRO CASAS NO R$/kg, como a RPC arredonda: o preço do quilo anda na
                          terceira e na quarta, e duas casas faria duas categorias diferentes
                          parecerem iguais. */}
                      <td className={cn(TD, 'text-right')}>{traco(c.pk0, 4)}</td>
                      <td className={cn(TD, 'text-right')}>{traco(c.pk1, 4)}</td>
                      <td className={cn(TD, 'text-right', corDoSinal(c.vpb))}>{formatNum(c.vpb, 2)}</td>
                      <td className={cn(TD, 'text-right', corDoSinal(c.efeito))}>{formatNum(c.efeito, 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="border-t-2 border-slate-300 bg-card font-semibold">
                    <td className="px-1.5 py-1 text-[10px]">
                      {patrimonio.categorias.length} categoria{patrimonio.categorias.length === 1 ? '' : 's'}
                    </td>
                    <td className={cn(TD, 'text-right')}>{formatNum(t.q0, 0)}</td>
                    <td className={cn(TD, 'text-right')}>{formatNum(t.q1, 0)}</td>
                    <td colSpan={2} />
                    <td className={cn(TD, 'text-right', corDoSinal(t.vpb))}>{formatNum(t.vpb, 2)}</td>
                    <td className={cn(TD, 'text-right', corDoSinal(t.efeito))}>{formatNum(t.efeito, 2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
