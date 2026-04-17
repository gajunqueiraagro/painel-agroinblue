import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { CATEGORIAS, Lancamento, kgToArrobas } from '@/types/cattle';
import { format } from 'date-fns';
import { toast } from 'sonner';

const MOTIVOS_MORTE = [
  'Raio', 'Picada de cobra', 'Doença respiratória', 'Tristeza parasitária',
  'Clostridiose', 'Intoxicação por planta', 'Acidente', 'Desidratação',
  'Parto distócico', 'Ataque de animal', 'Causa desconhecida',
];

interface LinhaLote {
  id: string;
  data: string;
  quantidade: string;
  categoria: string;
  pesoKg: string;
  motivo: string;
  motivoCustom: string;
  precoKg: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdicionar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  dataInicial?: string;
}

const novaLinha = (dataInicial?: string): LinhaLote => ({
  id: crypto.randomUUID(),
  data: dataInicial || format(new Date(), 'yyyy-MM-dd'),
  quantidade: '',
  categoria: '',
  pesoKg: '',
  motivo: '',
  motivoCustom: '',
  precoKg: '',
});

export function MorteLoteMetaDialog({ open, onClose, onAdicionar, dataInicial }: Props) {
  const [linhas, setLinhas] = useState<LinhaLote[]>([novaLinha(dataInicial)]);
  const [salvando, setSalvando] = useState(false);

  const adicionarLinha = () => setLinhas(prev => [...prev, novaLinha(dataInicial)]);
  const removerLinha = (id: string) => setLinhas(prev => prev.filter(l => l.id !== id));
  const atualizarLinha = (id: string, campo: keyof LinhaLote, valor: string) =>
    setLinhas(prev => prev.map(l => l.id === id ? { ...l, [campo]: valor } : l));

  const handleSalvar = async () => {
    const linhasValidas = linhas.filter(l =>
      l.data && l.categoria && Number(l.quantidade) > 0 && (l.motivo || l.motivoCustom)
    );
    if (linhasValidas.length === 0) {
      toast.error('Preencha pelo menos uma linha completa (Data, Qtd, Categoria, Motivo).');
      return;
    }

    setSalvando(true);
    let okCount = 0;
    let errCount = 0;

    for (const linha of linhasValidas) {
      const pesoKg = Number(linha.pesoKg.replace(',', '.')) || 0;
      const precoKg = Number(linha.precoKg.replace(',', '.')) || 0;
      const motivoFinal = linha.motivo === '__custom__' ? linha.motivoCustom : linha.motivo;

      const payload: Omit<Lancamento, 'id'> = {
        data: linha.data,
        tipo: 'morte',
        quantidade: Number(linha.quantidade),
        categoria: linha.categoria as any,
        pesoMedioKg: pesoKg || undefined,
        pesoMedioArrobas: pesoKg ? kgToArrobas(pesoKg) : undefined,
        precoMedioCabeca: precoKg && pesoKg ? Number((precoKg * pesoKg).toFixed(2)) : undefined,
        fazendaDestino: motivoFinal || undefined,
        statusOperacional: null, // null → cenário 'meta' no hook
      };

      try {
        const result = await onAdicionar(payload);
        if (result) okCount++; else errCount++;
      } catch {
        errCount++;
      }
    }

    setSalvando(false);
    if (okCount > 0) {
      toast.success(`${okCount} morte(s) META registrada(s) com sucesso.`, {
        description: errCount > 0 ? `${errCount} linha(s) com erro.` : undefined,
        style: { borderLeft: '4px solid #f97316' },
      });
      setLinhas([novaLinha(dataInicial)]);
      onClose();
    } else {
      toast.error('Não foi possível registrar as mortes.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-orange-500" />
            Lançamento em Lote de Mortes — META
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            Cadastre múltiplas mortes planejadas (cenário META) de uma só vez. Não impacta rebanho realizado.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left font-semibold w-[120px]">Data</th>
                <th className="px-2 py-1.5 text-right font-semibold w-[80px]">Qtd. Cab.</th>
                <th className="px-2 py-1.5 text-left font-semibold w-[160px]">Categoria</th>
                <th className="px-2 py-1.5 text-right font-semibold w-[90px]">Peso (kg)</th>
                <th className="px-2 py-1.5 text-left font-semibold w-[200px]">Motivo da Morte</th>
                <th className="px-2 py-1.5 text-right font-semibold w-[90px]">R$/kg</th>
                <th className="px-2 py-1.5 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.id} className="border-b hover:bg-muted/20">
                  <td className="px-1 py-1">
                    <Input
                      type="date"
                      value={linha.data}
                      onChange={(e) => atualizarLinha(linha.id, 'data', e.target.value)}
                      className="h-7 text-[11px]"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="number"
                      min="0"
                      value={linha.quantidade}
                      onChange={(e) => atualizarLinha(linha.id, 'quantidade', e.target.value)}
                      className="h-7 text-[11px] text-right tabular-nums"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Select value={linha.categoria} onValueChange={(v) => atualizarLinha(linha.id, 'categoria', v)}>
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIAS.map(c => (
                          <SelectItem key={c.value} value={c.value} className="text-[11px]">{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={linha.pesoKg}
                      onChange={(e) => atualizarLinha(linha.id, 'pesoKg', e.target.value)}
                      className="h-7 text-[11px] text-right tabular-nums"
                      placeholder="0,00"
                    />
                  </td>
                  <td className="px-1 py-1">
                    <div className="space-y-1">
                      <Select value={linha.motivo} onValueChange={(v) => atualizarLinha(linha.id, 'motivo', v)}>
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue placeholder="Motivo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {MOTIVOS_MORTE.map(m => (
                            <SelectItem key={m} value={m} className="text-[11px]">{m}</SelectItem>
                          ))}
                          <SelectItem value="__custom__" className="text-[11px]">Outro (digitar)</SelectItem>
                        </SelectContent>
                      </Select>
                      {linha.motivo === '__custom__' && (
                        <Input
                          type="text"
                          value={linha.motivoCustom}
                          onChange={(e) => atualizarLinha(linha.id, 'motivoCustom', e.target.value)}
                          placeholder="Especifique..."
                          className="h-7 text-[11px]"
                        />
                      )}
                    </div>
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={linha.precoKg}
                      onChange={(e) => atualizarLinha(linha.id, 'precoKg', e.target.value)}
                      className="h-7 text-[11px] text-right tabular-nums"
                      placeholder="0,00"
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removerLinha(linha.id)}
                      disabled={linhas.length === 1}
                      className="h-6 w-6 text-destructive hover:bg-destructive/10"
                      title="Excluir linha"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" size="sm" onClick={adicionarLinha} className="h-8 text-[11px]">
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha
          </Button>
          <div className="text-[10px] text-muted-foreground">
            {linhas.length} linha(s) · R$/kg × Peso = R$/cab. (calculado)
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Save className="h-4 w-4 mr-1" /> {salvando ? 'Salvando...' : 'Salvar todos'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
