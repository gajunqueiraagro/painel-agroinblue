/**
 * FIN-PRONTO-PAGAR-01 PR B — a célula da coluna Forma (Gabriel 24/11 09:01): o ponto (verde = pronto para pagar, laranja = falta algo) + a
 * sigla da forma (Bol · Pix · DA · TED · Créd · Déb · Din · Out · —). O `title` diz o nome inteiro da forma e o que falta (a frase da lib);
 * o clique abre o lançamento na aba Pagamento (o hospedeiro decide como) e NÃO chega à linha.
 * Sem código (não é saída a pagar: já paga, entrada, sem caixa) não há ponto — o lugar dele fica reservado e a sigla fica no mesmo x.
 */
import type { MouseEvent } from 'react';
import { ehPronto, fraseDoPronto, siglaDaForma, type CodigoPronto } from '@/lib/financeiro/prontoParaPagar';

export function PontoProntoPagar({ codigo, forma, onAbrir }: { codigo: CodigoPronto | null; forma: string | null; onAbrir?: () => void }) {
  const sigla = siglaDaForma(forma);
  if (!codigo) {
    return (
      <span className="flex items-center gap-1" title={forma ?? 'sem forma de pagamento'} data-testid="forma-sem-ponto">
        <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0" data-testid="ponto-pronto-vazio" />
        <span className={sigla === '—' ? 'text-muted-foreground' : ''}>{sigla}</span>
      </span>
    );
  }
  const pronto = ehPronto(codigo);
  const frase = fraseDoPronto(codigo, forma);
  const clicar = (e: MouseEvent) => { e.stopPropagation(); onAbrir?.(); };
  return (
    <button type="button" onClick={clicar} onDoubleClick={(e) => e.stopPropagation()} title={frase} aria-label={frase.split('\n').join(' · ')}
      data-testid="ponto-pronto" data-pronto={pronto ? 'sim' : 'nao'} data-codigo={codigo} className="flex cursor-pointer items-center gap-1">
      <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${pronto ? 'bg-[#1F7A4D]' : 'bg-[#E08A00]'}`} />
      <span className={sigla === '—' ? 'text-muted-foreground' : ''}>{sigla}</span>
    </button>
  );
}
