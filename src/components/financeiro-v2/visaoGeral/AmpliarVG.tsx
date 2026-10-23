/**
 * P83 (Gabriel 23/10/2026) — o "AMPLIAR" da Visão Geral: o MESMO ícone no canto de cada bloco (card, gráfico, grade) abre um modal de
 * tamanho fixo com o bloco inteiro — todas as linhas à vista, sem rolagem —, pronto para print/WhatsApp.
 *   · O botão tem 16px e mora no canto do título do bloco (no lugar reservado): abrir e fechar não desloca nada.
 *   · O conteúdo do modal é o próprio bloco no modo `ampliado` (quem chama entrega), montado só com o modal aberto.
 */
import { useState, type ReactNode } from 'react';
import { Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function AmpliarVG({ titulo, testid, children, largura = 'w-[min(1400px,96vw)]' }: {
  titulo: string; testid: string; children: () => ReactNode;
  /** a largura fixa do modal (o card, estreito, cabe num print de celular) */
  largura?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" aria-label={`Ampliar ${titulo}`} title={`Ampliar · ${titulo}`} data-testid={`ampliar-${testid}`}
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[#5b6878] hover:bg-[#eef1f5] hover:text-[#1b2430]">
        <Maximize2 className="h-3 w-3" />
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className={`flex h-[min(92vh,900px)] ${largura} max-w-none flex-col gap-0 p-0`} data-testid={`modal-ampliado-${testid}`}>
          <DialogHeader className="h-9 shrink-0 justify-center bg-primary px-3">
            <DialogTitle className="text-[13px] font-semibold text-primary-foreground">{titulo}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-white p-3">{aberto ? children() : null}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
