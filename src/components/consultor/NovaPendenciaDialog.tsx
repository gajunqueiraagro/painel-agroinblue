/**
 * RESUMO-CLIENTES-01 passo a — "+ nova" pendência. Diálogo de tamanho fixo; o que falta fica escrito ao lado do botão (nunca toast) e o
 * digitado fica. `clienteFixo` = aberto de dentro de um cliente (o modal do ⚑): o cliente não se troca.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ORIGENS, ROTULO_ORIGEM, faltaNaNova, type NovaPendencia, type OrigemPendencia } from '@/lib/consultor/pendencias';

const SEM_ORIGEM = '__sem__';
const ROTULO = 'mb-0.5 block text-[10px] text-muted-foreground';

export function NovaPendenciaDialog({ open, onOpenChange, clientes, clienteFixo, criar }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  clientes: readonly { id: string; nome: string }[];
  clienteFixo?: string | null;
  criar: (n: NovaPendencia) => Promise<string | null>;
}) {
  const vazio = (): NovaPendencia => ({ clienteId: clienteFixo ?? '', prazo: null, cobrarDe: '', oQue: '', origemTipo: null, origemRef: null });
  const [n, setN] = useState<NovaPendencia>(vazio);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fechar = (o: boolean) => { if (!o) { setN(vazio()); setRecado(null); } onOpenChange(o); };
  const gravar = async () => {
    const falta = faltaNaNova(n);
    if (falta) { setRecado(falta); return; }
    setOcupado(true);
    const e = await criar(n);
    setOcupado(false);
    if (e) { setRecado(e); return; }
    fechar(false);
  };
  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="h-[300px] max-w-[460px] gap-2" data-testid="nova-pendencia">
        <DialogHeader>
          <DialogTitle className="text-[13px]">Nova pendência</DialogTitle>
          <DialogDescription className="text-[10px]">Só você vê. O cliente nunca vê as pendências.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <div>
            <span className={ROTULO}>Cliente *</span>
            <Select value={n.clienteId || undefined} onValueChange={v => setN(x => ({ ...x, clienteId: v }))} disabled={!!clienteFixo}>
              <SelectTrigger className="h-7 text-[11px]" data-testid="nova-cliente"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <span className={ROTULO}>Prazo</span>
            <DatePicker size="compact" value={n.prazo ?? ''} onChange={v => setN(x => ({ ...x, prazo: v || null }))} />
          </div>
          <div className="col-span-2 grid grid-cols-[140px_1fr] gap-2">
            <div>
              <span className={ROTULO}>Cobrar de *</span>
              <Input className="h-7 text-[11px]" data-testid="nova-cobrar-de" value={n.cobrarDe} onChange={e => setN(x => ({ ...x, cobrarDe: e.target.value }))} />
            </div>
            <div>
              <span className={ROTULO}>O que *</span>
              <Input className="h-7 text-[11px]" data-testid="nova-o-que" value={n.oQue} onChange={e => setN(x => ({ ...x, oQue: e.target.value }))} />
            </div>
          </div>
          <div className="col-span-2 grid grid-cols-[140px_1fr] gap-2">
            <div>
              <span className={ROTULO}>Origem</span>
              <Select value={n.origemTipo ?? SEM_ORIGEM} onValueChange={v => setN(x => ({ ...x, origemTipo: ORIGENS.find(o => o === v) ?? null }))}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_ORIGEM}>—</SelectItem>
                  {ORIGENS.map((o: OrigemPendencia) => <SelectItem key={o} value={o}>{ROTULO_ORIGEM[o]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className={ROTULO}>Referência (OC, mês AAAA-MM…)</span>
              <Input className="h-7 text-[11px]" disabled={!n.origemTipo} value={n.origemRef ?? ''} onChange={e => setN(x => ({ ...x, origemRef: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="mt-auto flex h-8 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[10px] text-destructive" data-testid="nova-recado" title={recado ?? ''}>{recado ?? ''}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => fechar(false)}>Cancelar</Button>
          <Button size="sm" className="h-7 text-[11px]" disabled={ocupado} data-testid="nova-gravar" onClick={() => void gravar()}>Registrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
