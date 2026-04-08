import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lancamento, SaldoInicial } from '@/types/cattle';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { toast } from 'sonner';

interface Props {
  lancamentos: Lancamento[];
  saldosIniciais: SaldoInicial[];
}

export function ExportMenu({ lancamentos, saldosIniciais }: Props) {
  const [open, setOpen] = useState(false);
  const [ano, setAno] = useState(String(new Date().getFullYear()));

  const anosOpcoes = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  // Dados oficiais da view para alimentar o export
  const { rawFazenda, rawCategorias } = useRebanhoOficial({
    ano: Number(ano),
    cenario: 'realizado',
  });

  const handleExport = (tipo: 'excel' | 'pdf') => {
    try {
      if (tipo === 'excel') {
        exportToExcel(
          lancamentos,
          saldosIniciais,
          ano,
          rawFazenda.length > 0 ? rawFazenda : undefined,
          rawCategorias.length > 0 ? rawCategorias : undefined,
        );
        toast.success('Excel exportado com sucesso!');
      } else {
        exportToPDF(lancamentos, saldosIniciais, ano, rawFazenda.length > 0 ? rawFazenda : undefined);
        toast.success('PDF exportado com sucesso!');
      }
      setOpen(false);
    } catch (e) {
      toast.error('Erro ao exportar. Tente novamente.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="touch-target">
          <Download className="h-4 w-4 mr-1" /> Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Exportar Relatórios</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Ano</p>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {anosOpcoes.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Button className="w-full justify-start gap-2" variant="outline" onClick={() => handleExport('excel')}>
              <FileSpreadsheet className="h-5 w-5 text-success" />
              Exportar Excel (.xlsx)
            </Button>
            <Button className="w-full justify-start gap-2" variant="outline" onClick={() => handleExport('pdf')}>
              <FileText className="h-5 w-5 text-destructive" />
              Exportar PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Inclui: Resumo, Fluxo Anual, Evolução por Categoria, Categorias/Mês e Lançamentos.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
