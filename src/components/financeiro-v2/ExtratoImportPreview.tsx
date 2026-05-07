/**
 * ExtratoImportPreview — modal de importação de extrato OFX/CSV.
 *
 * Fluxo:
 *   1. Selecionar arquivo (.ofx / .csv) e conta bancária.
 *   2. Gerar preview (parser + checagem de duplicatas via hash).
 *   3. Confirmar → insere em extrato_bancario_v2 (status='nao_conciliado').
 *
 * NÃO cria lançamento financeiro automaticamente.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { useImportacaoExtrato } from '@/hooks/useImportacaoExtrato';
import { formatMoeda } from '@/lib/calculos/formatters';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';

interface Conta {
  id: string;
  nome_conta: string;
  nome_exibicao: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contaBancariaIdInicial?: string;
  onImported?: (resultado: { inseridos: number; importacaoId: string }) => void;
}

function fmtData(s: string): string {
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ExtratoImportPreview({ open, onClose, contaBancariaIdInicial, onImported }: Props) {
  const { clienteAtual } = useCliente();
  const clienteId = clienteAtual?.id;
  const { preview, loading, error, gerarPreview, confirmarImportacao, reset } = useImportacaoExtrato();

  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState<string>(contaBancariaIdInicial ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);

  // Carregar contas do cliente
  useEffect(() => {
    if (!open || !clienteId) return;
    supabase
      .from('financeiro_contas_bancarias')
      .select('id, nome_conta, nome_exibicao')
      .eq('cliente_id', clienteId)
      .eq('ativa', true)
      .order('ordem_exibicao')
      .then(({ data }) => setContas((data ?? []) as Conta[]));
  }, [open, clienteId]);

  // Sincroniza conta inicial quando muda
  useEffect(() => {
    if (contaBancariaIdInicial) setContaId(contaBancariaIdInicial);
  }, [contaBancariaIdInicial]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      reset();
      setArquivo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleGerar = async () => {
    if (!arquivo) { toast.error('Selecione um arquivo .ofx ou .csv'); return; }
    if (!contaId) { toast.error('Selecione a conta bancária'); return; }
    try {
      await gerarPreview({ arquivo, contaBancariaId: contaId });
    } catch (e: any) {
      toast.error('Erro ao gerar preview: ' + (e?.message ?? e));
    }
  };

  const handleConfirmar = async () => {
    if (!arquivo || !preview) return;
    try {
      const r = await confirmarImportacao({
        contaBancariaId: contaId,
        nomeArquivo: arquivo.name,
        formato: preview.formato,
      });
      toast.success(`${r.inseridos} movimento(s) importado(s)`);
      onImported?.(r);
      onClose();
    } catch (e: any) {
      toast.error('Erro ao confirmar: ' + (e?.message ?? e));
    }
  };

  const totalValor = useMemo(() => {
    if (!preview) return 0;
    return preview.movimentos
      .filter(m => !m.duplicado)
      .reduce((s, m) => s + Math.abs(m.valor), 0);
  }, [preview]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar extrato bancário (OFX/CSV)</DialogTitle>
          <DialogDescription>
            Selecione o arquivo e a conta. O sistema detecta duplicatas por hash do movimento.
            Movimentos importados ficam com status <strong>não conciliado</strong> — sem criar lançamento.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Arquivo (.ofx ou .csv)</Label>
            <Input
              type="file"
              accept=".ofx,.csv,.txt"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">Conta bancária *</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome_exibicao || c.nome_conta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleGerar} disabled={loading || !arquivo || !contaId}>
            {loading ? 'Processando...' : 'Gerar preview'}
          </Button>
          {preview && (
            <Button variant="outline" onClick={() => reset()} disabled={loading}>
              Limpar preview
            </Button>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {preview && (
          <>
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <span className="px-2 py-1 rounded bg-blue-50 text-blue-800 font-semibold">
                Formato: {preview.formato}
              </span>
              <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-800 font-semibold">
                {preview.novos} novo{preview.novos !== 1 ? 's' : ''}
              </span>
              <span className="px-2 py-1 rounded bg-amber-50 text-amber-800 font-semibold">
                {preview.duplicados} duplicado{preview.duplicados !== 1 ? 's' : ''}
              </span>
              <span className="text-muted-foreground">
                Total {formatMoeda(totalValor)} (apenas novos)
              </span>
            </div>

            <div className="overflow-auto flex-1 min-h-[200px] max-h-[40vh] border rounded">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-[10px]">Data</TableHead>
                    <TableHead className="text-[10px]">Descrição</TableHead>
                    <TableHead className="text-[10px]">Documento</TableHead>
                    <TableHead className="text-[10px] text-right">Valor</TableHead>
                    <TableHead className="text-[10px]">Tipo</TableHead>
                    <TableHead className="text-[10px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.movimentos.map((m, i) => (
                    <TableRow key={i} className={m.duplicado ? 'opacity-50' : ''}>
                      <TableCell className="text-[11px] font-mono">{fmtData(m.data)}</TableCell>
                      <TableCell className="text-[11px] max-w-[260px] truncate" title={m.descricao}>
                        {m.descricao || '-'}
                      </TableCell>
                      <TableCell className="text-[11px] font-mono text-muted-foreground">
                        {m.documento || '-'}
                      </TableCell>
                      <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${m.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatMoeda(m.valor)}
                      </TableCell>
                      <TableCell className="text-[11px]">{m.tipo === 'credito' ? '↑ Cred' : '↓ Déb'}</TableCell>
                      <TableCell className="text-[11px]">
                        {m.duplicado
                          ? <span className="text-amber-700 font-semibold">duplicado</span>
                          : <span className="text-emerald-700 font-semibold">novo</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Fechar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={loading || !preview || preview.novos === 0}
          >
            {loading ? 'Salvando...' : `Confirmar (${preview?.novos ?? 0})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
