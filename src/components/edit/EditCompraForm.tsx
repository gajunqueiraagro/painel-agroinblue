/**
 * EditCompraForm — form ZOO standalone para edição de Compra.
 *
 * F3a (zoo-edit): extração pura do BLOCO 1 inline em LancamentoDetalhe.tsx
 * L702-804. Comportamento idêntico ao original — só muda o local da
 * implementação.
 *
 * Componente FULLY CONTROLLED:
 *   Todo o state (form, statusMode, saving, zooSaved, zooDirty) vive no
 *   caller. Aqui só renderiza e dispara callbacks. Zero state interno de
 *   negócio.
 *
 * REGRAS INVIOLÁVEIS (Gabriel):
 *   - PROIBIDO importar useLancamentos, useStatusPilares, useEditPermissions,
 *     useQuery, qualquer fetch, qualquer import de financeiro.
 *   - PROIBIDO importar CompraFinanceiroPanel — ele permanece no caller.
 *   - PROIBIDO depender de FazendaContext, ClienteContext ou qualquer
 *     contexto de ambiente. Tudo via props.
 *   - PROIBIDO sincronização financeira aqui dentro.
 *
 * O componente é agnóstico ao caller: funciona idêntico em LancamentoDetalhe,
 * FinanceiroTab, LancamentosTab, V2 ou qualquer outra tela futura.
 *
 * `readOnly` e `blockReason` declarados na API mas NÃO acionados nesta versão
 * — F4 (LancamentoZooEditModal) ativará via useEditPermissions.
 */
import type { Lancamento, Categoria } from '@/types/cattle';
import { CATEGORIAS } from '@/types/cattle';
import { STATUS_OPTIONS_ZOOTECNICO_COM_META } from '@/lib/statusOperacional';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

type CompraStatusMode = 'realizado' | 'programado' | 'meta';
export type EditBlockReason = 'mes_fechado' | 'cancelado' | 'sem_permissao' | null;

interface EditCompraFormProps {
  /** Lançamento original — usado apenas para `compareTo`-style checks de
   *  divergência (warning de impacto financeiro). NÃO é editado diretamente. */
  lancamento: Lancamento;

  /** Form controlado pelo caller. */
  form: Lancamento;
  onFormChange: Dispatch<SetStateAction<Lancamento>>;

  /** Status mode (realizado/programado/meta) — afeta cor + cenário. */
  statusMode: CompraStatusMode;
  onStatusModeChange: Dispatch<SetStateAction<CompraStatusMode>>;

  /** Estado de save (caller orquestra a chamada async). */
  saving: boolean;
  zooSaved: boolean;
  zooDirty: boolean;
  onSubmitZoo: () => void;

  /** Permissões + contexto. */
  canEditMeta: boolean;
  /** Quantidade de lançamentos financeiros já vinculados — usado para warning
   *  de impacto. Caller calcula (CompraFinanceiroPanel quer isso à parte). */
  finRecordsCount: number;
  /** Nome da fazenda destino (readonly no form). */
  nomeFazendaDestino: string;

  /** Z4 — fornecedor soberano do zoo (controlado pelo caller). */
  fornecedorId: string | null;
  onFornecedorChange: (id: string | null, nome: string | null) => void;
  /** Texto histórico sem UUID (para estado legado do FornecedorSelect). */
  textoLegado?: string;
  /** Snapshot persistido (display readonly auxiliar). */
  snapshotNome?: string;
  /** Cliente do lançamento — necessário para a query interna do FornecedorSelect. */
  clienteId: string;

  /** Reservados para F4 — não acionados aqui. */
  readOnly?: boolean;
  blockReason?: EditBlockReason;
}

export function EditCompraForm({
  lancamento,
  form,
  onFormChange,
  statusMode,
  onStatusModeChange,
  saving,
  zooSaved,
  zooDirty,
  onSubmitZoo,
  canEditMeta,
  finRecordsCount,
  nomeFazendaDestino,
  fornecedorId,
  onFornecedorChange,
  textoLegado,
  snapshotNome,
  clienteId,
  // readOnly e blockReason são declarados mas não acionados em F3a (F4 ativa).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  readOnly: _readOnly,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  blockReason: _blockReason,
}: EditCompraFormProps) {
  const impactaFinanceiro =
    finRecordsCount > 0 &&
    (form.quantidade !== lancamento.quantidade ||
      form.pesoMedioKg !== lancamento.pesoMedioKg ||
      form.categoria !== lancamento.categoria);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase text-muted-foreground tracking-wide">
        📋 Dados Zootécnicos
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] font-bold text-foreground">Data</Label>
          <Input
            type="date"
            value={form.data}
            onChange={e => onFormChange(f => ({ ...f, data: e.target.value }))}
            className="mt-0.5 h-7 text-[11px]"
          />
        </div>
        <div>
          <Label className="text-[10px] font-bold text-foreground">Quantidade</Label>
          <Input
            type="number"
            value={form.quantidade}
            onChange={e => onFormChange(f => ({ ...f, quantidade: Number(e.target.value) }))}
            className="mt-0.5 h-7 text-[11px]"
            min="1"
          />
        </div>
        <div>
          <Label className="text-[10px] font-bold text-foreground">Peso (kg)</Label>
          <Input
            type="number"
            value={form.pesoMedioKg || ''}
            onChange={e => onFormChange(f => ({ ...f, pesoMedioKg: e.target.value ? Number(e.target.value) : undefined }))}
            className="mt-0.5 h-7 text-[11px]"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] font-bold text-foreground">Categoria</Label>
          <Select
            value={form.categoria}
            onValueChange={v => onFormChange(f => ({ ...f, categoria: v as Categoria }))}
          >
            <SelectTrigger className="mt-0.5 h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          {/* Z4 — Fornecedor soberano do zoo (separado da Origem física). */}
          <FornecedorSelect
            fornecedorId={fornecedorId}
            onFornecedorChange={onFornecedorChange}
            clienteId={clienteId}
            textoLegado={textoLegado}
            snapshotNome={snapshotNome}
            modoResolucaoLegado="permitir"
            label="Fornecedor"
            placeholder="Selecione ou cadastre fornecedor"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px] font-bold text-foreground">Origem</Label>
          <Input
            value={form.fazendaOrigem || ''}
            onChange={e => onFormChange(f => ({ ...f, fazendaOrigem: e.target.value }))}
            className="mt-0.5 h-7 text-[11px]"
            placeholder="Faz. Boa Vista"
          />
        </div>
        <div>
          <Label className="text-[10px] font-bold text-foreground">Destino</Label>
          <Input
            value={nomeFazendaDestino}
            readOnly
            className="mt-0.5 h-7 text-[11px] bg-muted cursor-not-allowed"
          />
        </div>
      </div>
      {/* Status — Bug 2: filtra opções pelo cenário do lançamento.
          - lancamento.cenario='meta' (canEditMeta=true): mostra APENAS Meta.
          - lancamento.cenario='realizado'|'programado' (canEditMeta=false):
            mostra APENAS Realizado/Programado.
          Meta NÃO é opção na edição operacional zoo — é estado do registro. */}
      <div>
        <Label className="text-[10px] font-bold text-foreground">Status</Label>
        <div className="flex gap-1 mt-0.5">
          {STATUS_OPTIONS_ZOOTECNICO_COM_META
            .filter(s => canEditMeta ? s.value === 'meta' : s.value !== 'meta')
            .map(s => {
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  onStatusModeChange(s.value as CompraStatusMode);
                  onFormChange(f => ({
                    ...f,
                    statusOperacional: s.value === 'meta' ? null : (s.value as Lancamento['statusOperacional']),
                    cenario: s.value === 'meta' ? 'meta' : 'realizado',
                  }));
                }}
                className={`flex-1 py-1 rounded text-[10px] font-bold border-2 transition-all ${
                  statusMode === s.value
                    ? `${s.bg} text-white border-transparent shadow-md`
                    : 'border-border text-muted-foreground bg-muted/30'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Warning: zootécnico changes impact financeiro */}
      {impactaFinanceiro && (
        <div className="flex items-center gap-1 text-[10px] p-1.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Alterações nos dados zootécnicos impactam o financeiro.</span>
        </div>
      )}
      {/* Save zootécnico button — só aparece se há alteração não salva */}
      {!zooDirty ? (
        <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/30 rounded px-2 py-1 border border-border/40">
          Sem alterações zootécnicas — financeiro disponível abaixo.
        </div>
      ) : !zooSaved ? (
        <Button
          className="w-full h-7 text-[10px] font-bold"
          size="sm"
          onClick={onSubmitZoo}
          disabled={saving}
        >
          {saving ? 'Salvando...' : '1. Salvar dados zootécnicos'}
        </Button>
      ) : (
        <div className="flex items-center gap-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded px-2 py-1 border border-green-200 dark:border-green-800">
          ✅ Dados zootécnicos salvos
        </div>
      )}
    </div>
  );
}
