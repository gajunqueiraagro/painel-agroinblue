import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Plus, Edit, Lock, ShoppingCart, X } from 'lucide-react';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';
import { CompraResumoPanel } from './CompraResumoPanel';
import { CompraDetalhesDialog, EMPTY_COMPRA_DETALHES, type CompraDetalhes } from './CompraDetalhesDialog';

// Controlador de input mascarado (retorno de useIntegerInput/useDecimalInput no monólito).
interface MaskedInput {
  displayValue: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: () => void;
}

// formApi — REFERÊNCIAS aos estados/setters/handlers já existentes no monólito. A casca é
// apresentação pura: recebe tudo pronto e apenas re-apresenta. Zero fetch/insert/RPC aqui.
export interface CompraModalShellProps {
  // status / cenário
  statusOp: StatusOperacional | 'meta';
  setStatusOp: (v: StatusOperacional | 'meta') => void;
  statusDescription: string;
  cenariosPermitidos: string[] | null;
  canEditMeta: boolean;
  // núcleo do formulário
  data: string;
  setData: (v: string) => void;
  qtdInput: MaskedInput;
  pesoInput: MaskedInput;
  categoria: string;
  setCategoria: (v: string) => void;
  categoriasDisponiveis: { value: string; label: string }[];
  observacao: string;
  setObservacao: (v: string) => void;
  fazendaOrigem: string;
  setFazendaOrigem: (v: string) => void;
  fazendaAtualNome: string;
  // fornecedor
  compraFornecedorId: string;
  setCompraFornecedorId: (v: string) => void;
  fornecedores: { id: string; nome: string }[];
  setNovoFornecedorCompraOpen: (v: boolean) => void;
  // financeiro (compra)
  compraDetalhes: CompraDetalhes | null;
  setCompraDetalhes: (v: CompraDetalhes | null) => void;
  setNotaFiscal: (v: string) => void;
  compraDialogOpen: boolean;
  setCompraDialogOpen: (v: boolean) => void;
  // valores derivados para o resumo/gate (parse já feito no monólito)
  quantidadeNum: number;
  pesoKgNum: number;
  // ações
  handleRequestRegister: () => void;
  handleCancelEdit: () => void;
  submitting: boolean;
  editingId: string | null;
  // apresentação do gate P1 já computado (bloqueio real permanece no handleRequestRegister)
  mesFechadoMsg: string | null;
  onClose: () => void;
}

const ABAS = [
  { key: 'compra', label: 'Compra', enabled: true },
  { key: 'recebimento', label: 'Recebimento', enabled: false },
  { key: 'financeiro', label: 'Financeiro', enabled: false },
  { key: 'documentos', label: 'Documentos', enabled: false },
  { key: 'auditoria', label: 'Auditoria', enabled: false },
] as const;

export function CompraModalShell(api: CompraModalShellProps) {
  // Navegação visual de aba — apresentação local (nesta entrega só a aba Compra é ativa).
  const [abaAtiva, setAbaAtiva] = useState<string>('compra');

  const cenarioOptions: { value: StatusOperacional | 'meta'; label: string }[] = [
    { value: 'realizado', label: STATUS_LABEL.realizado },
    { value: 'programado', label: STATUS_LABEL.programado },
    { value: 'meta', label: META_VISUAL.label },
  ];
  const fornecedorNome = api.fornecedores.find(f => f.id === api.compraFornecedorId)?.nome || '';
  const canOpenModal = !!(api.data && api.quantidadeNum > 0 && api.pesoKgNum > 0 && api.categoria);

  return (
    <div className="flex flex-col w-full min-w-0">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl leading-none">🛒</span>
            <h2 className="text-xl font-bold text-foreground leading-tight">Compra de Animais</h2>
            {api.editingId && (
              <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-[11px] font-bold text-primary">
                Editando #{api.editingId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {api.mesFechadoMsg && (
            <span className="rounded-md border border-amber-400 text-amber-600 dark:text-amber-400 px-2 py-1 text-[11px] font-medium flex items-center gap-1" title={api.mesFechadoMsg}>
              <Lock className="h-3 w-3" /> Mês fechado
            </span>
          )}
          {/* Cenário como dropdown (mesmo estado das pílulas legadas) */}
          <div className="w-40">
            <Select value={api.statusOp} onValueChange={(v) => api.setStatusOp(v as StatusOperacional | 'meta')}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {cenarioOptions.map(o => {
                  const disabled = (api.cenariosPermitidos ? !api.cenariosPermitidos.includes(o.value) : false)
                    || (o.value === 'meta' && !api.canEditMeta);
                  return <SelectItem key={o.value} value={o.value} disabled={disabled} className="text-[12px]">{o.label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <button onClick={api.onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* Frase explicativa do cenário (texto atual de cada status) */}
      <div className={`rounded-md border-2 px-3 py-2 text-xs leading-relaxed ${
        api.statusOp === 'realizado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
        : api.statusOp === 'meta' ? 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
        : 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-300'
      }`}>
        {api.statusDescription}
      </div>

      {/* ABAS */}
      <div className="mt-2 flex items-center gap-1 border-b overflow-x-auto">
        {ABAS.map(a => {
          const active = a.key === abaAtiva && a.enabled;
          return (
            <button
              key={a.key}
              type="button"
              disabled={!a.enabled}
              onClick={() => a.enabled && setAbaAtiva(a.key)}
              title={a.enabled ? undefined : 'em breve'}
              className={`shrink-0 px-3 py-1.5 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary'
                : a.enabled ? 'border-transparent text-muted-foreground hover:text-foreground'
                : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
              }`}
            >
              {a.label}{!a.enabled && <span className="ml-1 text-[9px] uppercase tracking-wide">em breve</span>}
            </button>
          );
        })}
      </div>

      {/* CORPO: aba Compra */}
      <div className="pt-1.5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem] gap-3 items-start">
        {/* Card: Dados da Compra */}
        <div className="rounded-md border bg-card p-3.5 shadow-sm space-y-2.5 min-w-0">
          <div className="text-[12px] font-semibold text-muted-foreground">Dados da Compra</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <Label className="font-bold text-[11px]">Data</Label>
              <Input type="date" value={api.data} onChange={e => api.setData(e.target.value)} className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="font-bold text-[11px]">Fazenda destino</Label>
              <Input value={api.fazendaAtualNome} readOnly className="mt-0.5 h-8 text-[12px] bg-muted cursor-not-allowed" />
            </div>
            <div>
              <Label className="font-bold text-[11px]">Qtd. Cab.</Label>
              <Input type="text" inputMode="numeric" value={api.qtdInput.displayValue} onChange={api.qtdInput.onChange} onBlur={api.qtdInput.onBlur} onFocus={api.qtdInput.onFocus} placeholder="0" className="mt-0.5 h-8 text-[12px] text-right font-bold tabular-nums" />
            </div>
            <div>
              <Label className="font-bold text-[11px]">Peso (kg)</Label>
              <Input type="text" inputMode="decimal" value={api.pesoInput.displayValue} onChange={api.pesoInput.onChange} onBlur={api.pesoInput.onBlur} onFocus={api.pesoInput.onFocus} placeholder="0,00" className="mt-0.5 h-8 text-[12px] text-right tabular-nums" />
            </div>
          </div>

          {/* Fornecedor (combobox canônico) + novo */}
          <div className="min-w-0">
            <Label className="font-bold text-[11px]">Fornecedor <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="min-w-0 flex-1">
                <SearchableSelect
                  value={api.compraFornecedorId || '__all__'}
                  onValueChange={(v) => api.setCompraFornecedorId(v === '__all__' ? '' : v)}
                  options={api.fornecedores.map(f => ({ value: f.id, label: f.nome }))}
                  placeholder="Selecione ou cadastre o fornecedor"
                  allLabel="Nenhum selecionado"
                  allValue="__all__"
                  className="[&_button]:h-8 [&_button]:text-[12px] [&_button]:px-2"
                />
              </div>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" aria-label="Novo fornecedor" onClick={() => api.setNovoFornecedorCompraOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div>
              <Label className="font-bold text-[11px]">Propriedade de origem</Label>
              <Input value={api.fazendaOrigem} onChange={e => api.setFazendaOrigem(e.target.value)} placeholder="Ex: Faz. Boa Vista" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="font-bold text-[11px]">Categoria oficial</Label>
              <Select value={api.categoria} onValueChange={v => api.setCategoria(v)}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className="max-h-52 overflow-y-auto">
                  {api.categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px] py-1.5">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="lg:col-span-2">
              <Label className="font-bold text-[11px]">Observações</Label>
              <Input value={api.observacao} onChange={e => api.setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
            </div>
          </div>

          {/* RODAPÉ — Registrar Compra (mesmo handler/gate do legado) */}
          <div className="flex items-center gap-2 pt-2.5 border-t">
            {api.editingId && (
              <Button type="button" variant="outline" onClick={api.handleCancelEdit} disabled={api.submitting}>Cancelar</Button>
            )}
            {api.compraDetalhes && (
              <Button type="button" variant="outline" onClick={() => api.setCompraDialogOpen(true)} disabled={api.submitting}>
                <Edit className="h-4 w-4 mr-1" /> Editar Financeiro
              </Button>
            )}
            <Button type="button" size="lg" className="font-bold gap-1.5" onClick={api.handleRequestRegister} disabled={api.submitting || !api.compraDetalhes}>
              <ShoppingCart className="h-4 w-4" />
              {api.submitting ? 'Registrando...' : api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
            </Button>
          </div>
        </div>

        {/* RESUMO LATERAL — §3: Situação + Fazenda (novo) + painel financeiro intocável reutilizado */}
        <div className="space-y-2 self-start">
          <div className="bg-card rounded-md border shadow-sm p-2 space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Situação</span><strong>{cenarioOptions.find(o => o.value === api.statusOp)?.label}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fazenda</span><strong className="truncate max-w-[120px]">{api.fazendaAtualNome || '—'}</strong></div>
          </div>
          <CompraResumoPanel
            quantidade={api.quantidadeNum}
            pesoKg={api.pesoKgNum}
            categoria={api.categoria}
            fornecedorNome={fornecedorNome}
            detalhes={api.compraDetalhes}
            detalhesPreenchidos={!!api.compraDetalhes}
            canOpenModal={canOpenModal}
            onOpenModal={() => api.setCompraDialogOpen(true)}
            onRequestRegister={api.handleRequestRegister}
            submitting={api.submitting}
            registerLabel={api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
            onCancelEdit={api.editingId ? api.handleCancelEdit : undefined}
          />
        </div>
      </div>

      {/* Diálogo financeiro intocável (Completar Compra) — wiring byte a byte via setters */}
      <CompraDetalhesDialog
        open={api.compraDialogOpen}
        onClose={() => api.setCompraDialogOpen(false)}
        onSave={(det) => {
          api.setCompraDetalhes(det);
          api.setNotaFiscal(det.notaFiscal);
          api.setCompraDialogOpen(false);
        }}
        initialData={api.compraDetalhes || EMPTY_COMPRA_DETALHES}
        quantidade={api.quantidadeNum}
        pesoKg={api.pesoKgNum}
        dataCompra={api.data}
      />
    </div>
  );
}
