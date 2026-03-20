import { useState } from 'react';
import {
  Lancamento,
  CATEGORIAS,
  TODOS_TIPOS,
  Categoria,
  TipoMovimentacao,
  isEntrada,
  isReclassificacao,
  kgToArrobas,
} from '@/types/cattle';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Pencil, Trash2 } from 'lucide-react';

interface Props {
  lancamento: Lancamento;
  open: boolean;
  onClose: () => void;
  onEditar: (id: string, dados: Partial<Omit<Lancamento, 'id'>>) => void;
  onRemover: (id: string) => void;
}

export function LancamentoDetalhe({ lancamento, open, onClose, onEditar, onRemover }: Props) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ ...lancamento });

  const tipoInfo = TODOS_TIPOS.find(t => t.value === lancamento.tipo);
  const catInfo = CATEGORIAS.find(c => c.value === lancamento.categoria);

  // Transferências de entrada são somente leitura (criadas automaticamente)
  const isTransferenciaEntrada = lancamento.tipo === 'transferencia_entrada';

  const handleSalvar = () => {
    onEditar(lancamento.id, {
      data: form.data,
      tipo: form.tipo,
      quantidade: Number(form.quantidade),
      categoria: form.categoria,
      categoriaDestino: form.categoriaDestino,
      fazendaOrigem: form.fazendaOrigem || undefined,
      fazendaDestino: form.fazendaDestino || undefined,
      pesoMedioKg: form.pesoMedioKg ? Number(form.pesoMedioKg) : undefined,
      pesoMedioArrobas: form.pesoMedioKg ? kgToArrobas(Number(form.pesoMedioKg)) : undefined,
      precoMedioCabeca: form.precoMedioCabeca ? Number(form.precoMedioCabeca) : undefined,
    });
    setEditando(false);
    onClose();
  };

  const handleRemover = () => {
    onRemover(lancamento.id);
    onClose();
  };

  if (!editando) {
    const entrada = isEntrada(lancamento.tipo);
    const reclass = isReclassificacao(lancamento.tipo);
    const catDestinoInfo = lancamento.categoriaDestino
      ? CATEGORIAS.find(c => c.value === lancamento.categoriaDestino)
      : null;

    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{tipoInfo?.icon}</span>
              {tipoInfo?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Data</p>
                <p className="font-bold text-foreground">
                  {format(parseISO(lancamento.data), 'dd/MM/yyyy', { locale: ptBR })}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Quantidade</p>
                <p className={`font-bold ${entrada ? 'text-success' : reclass ? 'text-foreground' : 'text-destructive'}`}>
                  {entrada ? '+' : reclass ? '' : '-'}{lancamento.quantidade} cab.
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Categoria</p>
                <p className="font-bold text-foreground">{catInfo?.label}</p>
              </div>
              {catDestinoInfo && (
                <div>
                  <p className="text-muted-foreground">Categoria Destino</p>
                  <p className="font-bold text-foreground">{catDestinoInfo.label}</p>
                </div>
              )}
              {lancamento.pesoMedioKg && (
                <div>
                  <p className="text-muted-foreground">Peso Médio</p>
                  <p className="font-bold text-foreground">{lancamento.pesoMedioKg} kg ({lancamento.pesoMedioArrobas} @)</p>
                </div>
              )}
              {lancamento.precoMedioCabeca && (
                <div>
                  <p className="text-muted-foreground">Preço/Cabeça</p>
                  <p className="font-bold text-foreground">R$ {lancamento.precoMedioCabeca.toLocaleString('pt-BR')}</p>
                </div>
              )}
              {lancamento.fazendaOrigem && (
                <div>
                  <p className="text-muted-foreground">Fazenda Origem</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaOrigem}</p>
                </div>
              )}
              {lancamento.fazendaDestino && (
                <div>
                  <p className="text-muted-foreground">Fazenda Destino</p>
                  <p className="font-bold text-foreground">{lancamento.fazendaDestino}</p>
                </div>
              )}
              {lancamento.precoMedioCabeca && lancamento.quantidade && (
                <div className="col-span-2 bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground text-xs">Valor Total</p>
                  <p className="font-extrabold text-foreground text-lg">
                    R$ {(lancamento.precoMedioCabeca * lancamento.quantidade).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 touch-target" onClick={() => { setForm({ ...lancamento }); setEditando(true); }}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
              <Button variant="destructive" className="flex-1 touch-target" onClick={handleRemover}>
                <Trash2 className="h-4 w-4 mr-1" /> Apagar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lançamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Data</Label>
              <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="font-bold text-foreground">Quantidade</Label>
              <Input type="number" value={form.quantidade} onChange={e => setForm(f => ({ ...f, quantidade: Number(e.target.value) }))} className="mt-1" min="1" />
            </div>
          </div>
          <div>
            <Label className="font-bold text-foreground">Categoria</Label>
            <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v as Categoria }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.tipo === 'reclassificacao' && (
            <div>
              <Label className="font-bold text-foreground">Categoria Destino</Label>
              <Select value={form.categoriaDestino || ''} onValueChange={v => setForm(f => ({ ...f, categoriaDestino: v as Categoria }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.filter(c => c.value !== form.categoria).map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Peso (kg)</Label>
              <Input type="number" value={form.pesoMedioKg || ''} onChange={e => setForm(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
            </div>
            <div>
              <Label className="font-bold text-foreground">Preço/Cab (R$)</Label>
              <Input type="number" value={form.precoMedioCabeca || ''} onChange={e => setForm(f => ({ ...f, precoMedioCabeca: e.target.value ? Number(e.target.value) : undefined }))} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="font-bold text-foreground">Faz. Origem</Label>
              <Input value={form.fazendaOrigem || ''} onChange={e => setForm(f => ({ ...f, fazendaOrigem: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="font-bold text-foreground">Faz. Destino</Label>
              <Input value={form.fazendaDestino || ''} onChange={e => setForm(f => ({ ...f, fazendaDestino: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 touch-target" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button className="flex-1 touch-target" onClick={handleSalvar}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
