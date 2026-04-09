import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Pause, Play, XCircle, Trash2, ShieldAlert } from 'lucide-react';
import { useContratos, Contrato, ContratoForm } from '@/hooks/useContratos';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useFazenda } from '@/contexts/FazendaContext';
import { ContratoDialog } from '@/components/financeiro-v2/ContratoDialog';
import { formatMoeda } from '@/lib/calculos/formatters';

function proxVencimento(c: Contrato): string {
  if (c.status !== 'ativo') return '-';
  const today = new Date();
  const day = c.dia_pagamento;
  let m = today.getMonth();
  let y = today.getFullYear();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const payDay = Math.min(day, lastDay);
  let candidate = new Date(y, m, payDay);
  if (candidate < today) {
    m++;
    if (m > 11) { m = 0; y++; }
    const ld2 = new Date(y, m + 1, 0).getDate();
    candidate = new Date(y, m, Math.min(day, ld2));
  }
  return candidate.toLocaleDateString('pt-BR');
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ativo: { label: 'Ativo', variant: 'default' },
  pausado: { label: 'Pausado', variant: 'secondary' },
  encerrado: { label: 'Encerrado', variant: 'destructive' },
};

export function ContratosTab() {
  const { contratos, loading, criarContrato, editarContrato, alterarStatus } = useContratos();
  const { contasBancarias: contas, classificacoes, fornecedores, loadContas, loadFornecedores, loadClassificacoes } = useFinanceiroV2();
  const { fazendas, fazendaAtual, isGlobal } = useFazenda();

  const isAdministrativo = fazendaAtual?.tem_pecuaria === false;
  const fazOperacionais = useMemo(() => fazendas.filter(f => f.id !== '__global__' && f.tem_pecuaria !== false), [fazendas]);
  const clienteTemUmaFazenda = fazOperacionais.length <= 1;
  const acessoPermitido = isGlobal || isAdministrativo || clienteTemUmaFazenda;

  // Load auxiliary data on mount
  useEffect(() => {
    loadContas();
    loadFornecedores();
    loadClassificacoes();
  }, [loadContas, loadFornecedores, loadClassificacoes]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editContrato, setEditContrato] = useState<Contrato | null>(null);

  const handleSave = async (form: ContratoForm, id?: string, atualizarFuturos?: boolean): Promise<boolean> => {
    if (id) {
      return editarContrato(id, form, atualizarFuturos || false);
    }
    return criarContrato(form);
  };

  const handleEdit = (c: Contrato) => {
    setEditContrato(c);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditContrato(null);
    setDialogOpen(true);
  };

  const defaultFazendaId = fazendaAtual?.id !== '__global__' ? fazendaAtual?.id : undefined;

  if (!acessoPermitido) {
    return (
      <div className="w-full px-4 animate-fade-in pb-24">
        <div className="p-4">
          <Card className="border-2 border-amber-300 dark:border-amber-700">
            <CardContent className="p-8 text-center space-y-3">
              <ShieldAlert className="h-10 w-10 mx-auto text-amber-500" />
              <h3 className="text-sm font-bold text-foreground">Acesso restrito ao contexto consolidado</h3>
              <div className="text-xs text-muted-foreground space-y-2 max-w-md mx-auto">
                <p>Contratos e recorrências só podem ser gerenciados em <strong className="text-foreground">Global</strong> ou <strong className="text-foreground">Administrativo</strong>.</p>
                <p>Esse módulo afeta o financeiro consolidado e não deve ser editado dentro de uma fazenda operacional específica.</p>
                <p className="font-semibold text-foreground">Selecione Global ou Administrativo no topo para continuar.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 animate-fade-in pb-24">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">📋 Contratos / Recorrências</h2>
          <Button size="sm" onClick={handleNew} className="gap-1">
            <Plus className="h-4 w-4" /> Novo Contrato
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>}

        {!loading && contratos.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground text-sm">Nenhum contrato cadastrado.</p>
              <Button size="sm" variant="outline" onClick={handleNew} className="mt-3 gap-1">
                <Plus className="h-4 w-4" /> Criar primeiro contrato
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {contratos.map(c => {
            const st = STATUS_MAP[c.status] || STATUS_MAP.ativo;
            const fornecedor = fornecedores.find(f => f.id === c.fornecedor_id);
            return (
              <Card key={c.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{c.produto || 'Sem produto'}</p>
                      <p className="text-xs text-muted-foreground truncate">{fornecedor?.nome || 'Sem fornecedor'}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                        <span className="font-mono font-bold text-foreground">{formatMoeda(c.valor)}</span>
                        <span>{c.frequencia}</span>
                        <span>Próx: {proxVencimento(c)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/30">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => handleEdit(c)}>
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                    {c.status === 'ativo' && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-warning" onClick={() => alterarStatus(c.id, 'pausado')}>
                        <Pause className="h-3 w-3" /> Pausar
                      </Button>
                    )}
                    {c.status === 'pausado' && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-primary" onClick={() => alterarStatus(c.id, 'ativo')}>
                        <Play className="h-3 w-3" /> Reativar
                      </Button>
                    )}
                    {c.status !== 'encerrado' && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-destructive" onClick={() => {
                        if (confirm('Deseja encerrar este contrato?')) alterarStatus(c.id, 'encerrado');
                      }}>
                        <XCircle className="h-3 w-3" /> Encerrar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <ContratoDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditContrato(null); }}
        onSave={handleSave}
        contrato={editContrato}
        fazendas={fazendas}
        contas={contas}
        classificacoes={classificacoes}
        fornecedores={fornecedores}
        defaultFazendaId={defaultFazendaId}
      />
    </div>
  );
}
