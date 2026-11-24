/**
 * FIN-PRONTO-PAGAR-01 PR B — o ponto antes do status (mock aprovado 23/11 13:38): verde = pronto para pagar, laranja = falta algo.
 * O `title` diz o quê (a frase da lib); o clique abre o lançamento na aba Pagamento (o hospedeiro decide como) e NÃO chega à linha.
 * Sem código (não é saída a pagar) o lugar fica reservado e vazio: o rótulo do status não anda de uma linha para outra.
 */
import type { MouseEvent } from 'react';
import { ehPronto, fraseDoPronto, type CodigoPronto } from '@/lib/financeiro/prontoParaPagar';

export function PontoProntoPagar({ codigo, forma, onAbrir }: { codigo: CodigoPronto | null; forma: string | null; onAbrir?: () => void }) {
  if (!codigo) return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0" data-testid="ponto-pronto-vazio" />;
  const pronto = ehPronto(codigo);
  const frase = fraseDoPronto(codigo, forma);
  const clicar = (e: MouseEvent) => { e.stopPropagation(); onAbrir?.(); };
  return (
    <button type="button" onClick={clicar} onDoubleClick={(e) => e.stopPropagation()} title={frase} aria-label={frase.split('\n').join(' · ')}
      data-testid="ponto-pronto" data-pronto={pronto ? 'sim' : 'nao'} data-codigo={codigo}
      className={`inline-block h-1.5 w-1.5 shrink-0 cursor-pointer rounded-full ${pronto ? 'bg-[#1F7A4D]' : 'bg-[#E08A00]'}`} />
  );
}
