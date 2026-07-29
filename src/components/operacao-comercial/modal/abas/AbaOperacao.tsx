import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { useFazenda, isFazendaPecuaria } from '@/contexts/FazendaContext';
import type { ModalOCCtx, TipoOperacaoOC } from '../tipos';
import { TIPO_OC_LABEL } from '../tipos';

export function AbaOperacao({ ctx }: { ctx: ModalOCCtx }) {
  const { draft, patch, op } = ctx;
  const bloqueadoTipo = !!op; // tipo não muda após criar (afeta candidatas/direção)
  const { fazendas: fazendasTenant } = useFazenda();

  // PR-NAV-CONTEXTO-FAZENDA-01A — critério ÚNICO do domínio pecuário (isFazendaPecuaria): sem o sentinel
  //   '__global__' e apenas fazendas reais aptas (tem_pecuaria === true). Escolher uma retorna sempre um
  //   UUID válido; a persistência exige fazenda (gate no ModalOperacaoComercial). Independe da sidebar.
  const fazendas = useMemo(
    () => fazendasTenant.filter(isFazendaPecuaria).map(f => ({ id: f.id, nome: f.nome })),
    [fazendasTenant],
  );

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
          <Label className="text-xs">Fazenda <span className="text-destructive">*</span></Label>
          {/* PR-NAV-CONTEXTO-FAZENDA-01A — sem opção sentinela "Todas as fazendas" (Global é contexto de
              sidebar, não valor de registro): o campo inicia vazio e exige a escolha de uma fazenda real.
              fazendaScopeId acompanha fazenda_id (filtro de candidatas em AbaLotes). */}
          <Select value={draft.fazendaScopeId ?? ''}
            onValueChange={(v) => patch({ fazendaScopeId: v, fazenda_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Selecione a fazenda" /></SelectTrigger>
            <SelectContent>
              {fazendas.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          {!draft.fazenda_id && (
            <p className="text-[10px] text-destructive">Selecione a fazenda da operação para salvar.</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Responsável</Label>
          <Input value={ctx.responsavelSnapshot ?? 'Definido pelo sistema (executor)'} disabled className="h-9 bg-muted" title="O responsável é o usuário autenticado, resolvido e registrado no servidor no momento da criação." />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número do documento (NF)</Label>
          <Input value={draft.numero_documento} onChange={e => patch({ numero_documento: e.target.value })} className="h-9" placeholder="NF-000" />
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
