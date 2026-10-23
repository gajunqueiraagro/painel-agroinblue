/**
 * "Todas · Limpar" no TOPO de uma lista de seleção múltipla — P83 (Gabriel 23/10/2026: "padrão dos seletores múltiplos da casa; se não
 * existir, crie no componente compartilhado"). Não havia: nasce aqui, para toda lista de marcar várias usar o MESMO par.
 *   · Altura fixa (20px) e sempre presente: marcar/desmarcar não move a lista. O gesto que não vale fica APAGADO (todas já marcadas →
 *     "Todas" apagado; nenhuma → "Limpar" apagado), nunca some.
 */
import { cn } from '@/lib/utils';

export function AcoesDaListaMultipla({ onTodas, onLimpar, todasMarcadas, nenhumaMarcada, testid = 'lista-multipla', className }: {
  onTodas: () => void;
  onLimpar: () => void;
  todasMarcadas: boolean;
  nenhumaMarcada: boolean;
  testid?: string;
  className?: string;
}) {
  const botao = 'font-medium text-[#1f5fa8] hover:underline disabled:cursor-default disabled:text-muted-foreground disabled:no-underline';
  return (
    <div className={cn('flex h-5 shrink-0 items-center gap-1.5 border-b border-[#eef1f5] px-1.5 text-[9.5px]', className)} data-testid={testid}>
      <button type="button" className={botao} disabled={todasMarcadas} onClick={onTodas} data-testid={`${testid}-todas`}>Todas</button>
      <span className="text-muted-foreground">·</span>
      <button type="button" className={botao} disabled={nenhumaMarcada} onClick={onLimpar} data-testid={`${testid}-limpar`}>Limpar</button>
    </div>
  );
}
