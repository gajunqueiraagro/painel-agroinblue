import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Trash2, Loader2, History, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function HistoricoImportacoesZootTab() {
  const { clienteAtual } = useCliente();
  const queryClient = useQueryClient();
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedImport, setSelectedImport] = useState<any>(null);

  const { data: importacoes, isLoading } = useQuery({
    queryKey: ['zoot-importacoes', clienteAtual?.id],
    enabled: !!clienteAtual?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('zoot_importacoes')
        .select('*')
        .eq('cliente_id', clienteAtual!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleOpenExcluir = (imp: any) => {
    setSelectedImport(imp);
    setConfirmText('');
    setDialogOpen(true);
  };

  const handleExcluir = async () => {
    if (!selectedImport || confirmText !== 'CONFIRMAR') return;
    setExcluindo(selectedImport.id);
    try {
      const { data, error } = await supabase.rpc('cancel_zoot_importacao', {
        _importacao_id: selectedImport.id,
      });
      if (error) throw error;
      const result = data as any;
      if (result?.ok) {
        toast.success(`Importação excluída: ${result.cancelled_rows} lançamentos cancelados.`);
        queryClient.invalidateQueries({ queryKey: ['zoot-importacoes'] });
        queryClient.invalidateQueries({ queryKey: ['lancamentos'] });
        queryClient.invalidateQueries({ queryKey: ['anos-disponiveis'] });
      }
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + (err.message || err));
    } finally {
      setExcluindo(null);
      setDialogOpen(false);
      setSelectedImport(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'processado': return <Badge className="bg-green-100 text-green-800">Processado</Badge>;
      case 'excluido': return <Badge variant="destructive">Excluído</Badge>;
      case 'erro': return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Importações Zootécnicas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !importacoes?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhuma importação registrada.</p>
              <p className="text-xs mt-1">As importações realizadas antes da governança não possuem rastreio.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Linhas</TableHead>
                  <TableHead>Válidas</TableHead>
                  <TableHead>Erros</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importacoes.map((imp) => (
                  <TableRow key={imp.id} className={imp.status === 'excluido' ? 'opacity-50' : ''}>
                    <TableCell className="text-xs">
                      {new Date(imp.created_at).toLocaleDateString('pt-BR')}{' '}
                      {new Date(imp.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs font-medium max-w-[200px] truncate">
                      {imp.nome_arquivo || '—'}
                    </TableCell>
                    <TableCell className="text-xs">{imp.total_linhas}</TableCell>
                    <TableCell className="text-xs text-green-700">{imp.linhas_validas}</TableCell>
                    <TableCell className="text-xs text-destructive">{imp.linhas_erro}</TableCell>
                    <TableCell>{statusBadge(imp.status)}</TableCell>
                    <TableCell>
                      {imp.status === 'processado' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleOpenExcluir(imp)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir importação
            </DialogTitle>
            <DialogDescription>
              Todos os lançamentos vinculados a esta importação serão cancelados logicamente.
              {selectedImport && (
                <span className="block mt-2 font-medium">
                  Arquivo: {selectedImport.nome_arquivo || 'sem nome'} — {selectedImport.linhas_validas} registros
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">Digite <strong>CONFIRMAR</strong> para prosseguir:</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="CONFIRMAR"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== 'CONFIRMAR' || !!excluindo}
              onClick={handleExcluir}
            >
              {excluindo ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Excluir importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
