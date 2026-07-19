import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import type { ModalOCCtx, TipoOperacaoOC } from '../tipos';
import { TIPO_OC_LABEL } from '../tipos';

export function AbaOperacao({ ctx }: { ctx: ModalOCCtx }) {
  const { draft, patch, op } = ctx;
  const bloqueadoTipo = !!op; // tipo não muda após criar (afeta candidatas/direção)

  const fazendas = useMemo(() => {
    const m = new Map<string, string>();
    ctx.movs.forEach(mv => { if (mv.fazendaId) m.set(mv.fazendaId, mv.fazendaNome ?? mv.fazendaId); });
    return Array.from(m, ([id, nome]) => ({ id, nome }));
  }, [ctx.movs]);

  return (
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-bold text-lg">Dados da Operação</h3>
      <p className="text-sm text-muted-foreground mb-4">Informe os dados principais desta operação comercial.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Tipo da operação <span className="text-destructive">*</span></Label>
          <Select value={draft.tipo_operacao} disabled={bloqueadoTipo}
            onValueChange={(v) => patch({ tipo_operacao: v as TipoOperacaoOC, movimentacoes: [] })}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['compra', 'venda', 'abate'] as TipoOperacaoOC[]).map(t => (
                <SelectItem key={t} value={t}>{TIPO_OC_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Data da operação <span className="text-destructive">*</span></Label>
          <Input type="date" value={draft.data_operacao} onChange={e => patch({ data_operacao: e.target.value })} className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fazenda</Label>
          <Select value={draft.fazendaScopeId ?? '__all__'} onValueChange={(v) => patch({ fazendaScopeId: v === '__all__' ? null : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as fazendas</SelectItem>
              {fazendas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Responsável</Label>
          <Input value="Definido pelo sistema (executor)" disabled className="h-9 bg-muted" title="O responsável é o usuário autenticado, resolvido e registrado no servidor no momento da criação." />
        </div>
      </div>

      <div className="mt-5">
        <h4 className="font-semibold mb-2">Contraparte</h4>
        <FornecedorSelect
          fornecedorId={draft.contraparte_id}
          onFornecedorChange={(id, nome) => patch({ contraparte_id: id, contraparte_nome: nome })}
          clienteId={ctx.clienteId}
          label="Contraparte (fornecedor/comprador)"
          required
        />
      </div>

      <div className="mt-5 space-y-1">
        <Label className="text-xs">Observações</Label>
        <textarea
          value={draft.observacoes}
          onChange={e => patch({ observacoes: e.target.value.slice(0, 300) })}
          placeholder="Observações opcionais sobre esta operação..."
          className="w-full min-h-[90px] rounded-md border bg-background px-3 py-2 text-sm"
        />
        <div className="text-right text-[10px] text-muted-foreground">{draft.observacoes.length}/300</div>
      </div>
    </div>
  );
}
