/**
 * OC-SALVAR-RODAPE-01 — O RODAPÉ DA OC, um só nas três (Abate é o modelo; Venda e Compra entram nas fatias seguintes). Barra navy de
 * 32px, sempre visível: [Fechar] · o estado ("Alterações não salvas" / "Salvo às hh:mm" / "Sem alterações", em lugar reservado) ·
 * as ações da aba à direita. E a pergunta ao fechar com pendência, a mesma nas três.
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextoReservado } from '@/components/ui/regua-tabela';
import { estadoDoRodape } from '@/lib/oc/fecharOC';

const TOM: Record<'pendente' | 'salvo' | 'neutro', string> = { pendente: 'text-amber-300', salvo: 'text-white/70', neutro: 'text-white/50' };

export function RodapeDaOC({ onFechar, pendente, salvoAs, children }: {
  onFechar: () => void;
  pendente: boolean;
  salvoAs: string | null;
  children?: ReactNode;
}) {
  const estado = estadoDoRodape(pendente, salvoAs);
  return (
    <div className="h-8 shrink-0 bg-primary px-2 flex items-center gap-2" data-testid="rodape-da-oc">
      <Button type="button" variant="ghost" onClick={onFechar}
        className="h-[22px] px-[9px] text-[10px] text-white/90 hover:bg-white/10 hover:text-white shrink-0" title="Fechar" aria-label="Fechar">
        Fechar
      </Button>
      <TextoReservado texto={estado.texto} reserva="Alterações não salvas" testid="rodape-da-oc-estado"
        className={`shrink-0 text-[10px] ${TOM[estado.tom]}`} />
      <div className="ml-auto flex items-center gap-2 min-w-0">{children}</div>
    </div>
  );
}

export function PerguntaAoFecharOC({ aberta, salvando, onSalvarEFechar, onFecharSemSalvar, onVoltar }: {
  aberta: boolean;
  salvando: boolean;
  onSalvarEFechar: () => void;
  onFecharSemSalvar: () => void;
  onVoltar: () => void;
}) {
  return (
    <Dialog open={aberta} onOpenChange={(o) => { if (!o && !salvando) onVoltar(); }}>
      <DialogContent className="max-w-md" data-testid="pergunta-ao-fechar-oc">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Alterações não salvas</DialogTitle>
          <DialogDescription className="text-[12px]">
            Há alterações nesta operação que ainda não foram salvas. Se fechar sem salvar, elas serão perdidas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={salvando} onClick={onVoltar}>Voltar</Button>
          <Button variant="outline" size="sm" disabled={salvando} onClick={onFecharSemSalvar}>Fechar sem salvar</Button>
          <Button size="sm" disabled={salvando} onClick={onSalvarEFechar}>{salvando ? 'Salvando...' : 'Salvar e fechar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
