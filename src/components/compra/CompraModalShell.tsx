import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
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
  // status / cenário (mesmo estado das pílulas legadas)
  statusOp: StatusOperacional | 'meta';
  setStatusOp: (v: StatusOperacional | 'meta') => void;
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
  // fazenda destino (dropdown visual nesta rodada; persistência = filtro principal, intacta)
  fazendaAtualNome: string;
  fazendaAtualId: string | null;
  fazendas: { id: string; nome: string }[];
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
  // derivados para resumo/tabela/gate (parse já feito no monólito)
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

// Indicador de cenário (norma: [✓ Realizado] / [🟡 Programado] / [🔵 Meta], sem texto).
const CENARIO_UI: Record<string, { icon: string; label: string; chip: string }> = {
  realizado: { icon: '✓', label: STATUS_LABEL.realizado, chip: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' },
  programado: { icon: '🟡', label: STATUS_LABEL.programado, chip: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300' },
  meta: { icon: '🔵', label: META_VISUAL.label, chip: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300' },
};

export function CompraModalShell(api: CompraModalShellProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('compra');
  // Seleção visual de fazenda destino (nesta rodada não altera payload/persistência).
  const [fazendaSel, setFazendaSel] = useState<string>(api.fazendaAtualId ?? '__atual__');

  const cenarioOptions: (StatusOperacional | 'meta')[] = ['realizado', 'programado', 'meta'];
  const cenarioAtual = CENARIO_UI[api.statusOp] ?? CENARIO_UI.realizado;
  const fornecedorNome = api.fornecedores.find(f => f.id === api.compraFornecedorId)?.nome || '';
  const canOpenModal = !!(api.data && api.quantidadeNum > 0 && api.pesoKgNum > 0 && api.categoria);
  const pesoMedioDerivado = api.quantidadeNum > 0 && api.pesoKgNum > 0
    ? (api.pesoKgNum / api.quantidadeNum).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

  return (
    <div className="flex flex-col w-full min-w-0">
      {/* HEADER azul (identidade do modal original) */}
      <div className="bg-primary text-primary-foreground px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl leading-none">🛒</span>
          <h2 className="text-lg font-bold leading-tight">Compra de Animais</h2>
          {api.editingId && (
            <span className="rounded border border-white/40 px-2 py-0.5 text-[11px] font-bold">Editando #{api.editingId.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {api.mesFechadoMsg && (
            <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-1 text-[11px] font-medium flex items-center gap-1" title={api.mesFechadoMsg}>
              <Lock className="h-3 w-3" /> Mês fechado
            </span>
          )}
          <button onClick={api.onClose} className="text-white/80 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* ABAS */}
      <div className="bg-card border-b px-5 flex items-center gap-1 overflow-x-auto">
        {ABAS.map(a => {
          const active = a.key === abaAtiva && a.enabled;
          return (
            <button
              key={a.key}
              type="button"
              disabled={!a.enabled}
              onClick={() => a.enabled && setAbaAtiva(a.key)}
              title={a.enabled ? undefined : 'em breve'}
              className={`shrink-0 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
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

      {/* CORPO — conteúdo a 6px da barra de abas */}
      <div className="pt-1.5 px-5 pb-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-3 items-start bg-muted/20">
        <div className="space-y-3 min-w-0">
          {/* CARD 1 — Identificação da Compra */}
          <div className="rounded-md border bg-card p-4 shadow-sm space-y-2.5 min-w-0">
            <div className="text-[12px] font-semibold text-muted-foreground">Identificação da Compra</div>
            {/* Linha 1: Status · Data · Fazenda */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
              <div>
                <Label className="font-bold text-[11px]">Status</Label>
                <Select value={api.statusOp} onValueChange={(v) => api.setStatusOp(v as StatusOperacional | 'meta')}>
                  <SelectTrigger className={`mt-0.5 h-8 text-[12px] font-semibold border-2 gap-1 ${cenarioAtual.chip}`}>
                    <span className="flex items-center gap-1"><span>{cenarioAtual.icon}</span><span>{cenarioAtual.label}</span></span>
                  </SelectTrigger>
                  <SelectContent>
                    {cenarioOptions.map(v => {
                      const ui = CENARIO_UI[v];
                      const disabled = (api.cenariosPermitidos ? !api.cenariosPermitidos.includes(v) : false)
                        || (v === 'meta' && !api.canEditMeta);
                      return <SelectItem key={v} value={v} disabled={disabled} className="text-[12px]">{ui.icon} {ui.label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-bold text-[11px]">Data da Compra</Label>
                <DatePicker value={api.data} onChange={api.setData} className="mt-0.5" />
              </div>
              <div>
                <Label className="font-bold text-[11px]">Fazenda</Label>
                <Select value={fazendaSel} onValueChange={setFazendaSel}>
                  <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder={api.fazendaAtualNome || 'Selecione'} /></SelectTrigger>
                  <SelectContent>
                    {api.fazendaAtualId && <SelectItem value={api.fazendaAtualId} className="text-[12px]">{api.fazendaAtualNome}</SelectItem>}
                    {api.fazendas.filter(f => f.id !== api.fazendaAtualId).map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Linha 2: Fornecedor · Propriedade de origem */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
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
              <div>
                <Label className="font-bold text-[11px]">Propriedade de origem</Label>
                <Input value={api.fazendaOrigem} onChange={e => api.setFazendaOrigem(e.target.value)} placeholder="Ex: Faz. Boa Vista" className="mt-0.5 h-8 text-[12px]" />
              </div>
            </div>
            {/* Linha 3: Observações (fonte menor) */}
            <div>
              <Label className="font-bold text-[11px]">Observações</Label>
              <Input value={api.observacao} onChange={e => api.setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-7 text-[11px]" />
            </div>
          </div>

          {/* CARD 2 — Animais da Compra (estrutura visual; 1ª linha reutiliza estados legados) */}
          <div className="rounded-md border bg-card p-4 shadow-sm space-y-2 min-w-0">
            <div className="text-[12px] font-semibold text-muted-foreground">Animais da Compra</div>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.6fr] gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Categoria</span><span className="text-right">Quantidade</span><span className="text-right">Peso Médio</span><span className="text-right">Peso Total</span><span className="text-center">Ações</span>
                </div>
                <div className="grid grid-cols-[2fr_1fr_1fr_1fr_0.6fr] gap-2 items-center rounded-md border bg-muted/20 px-1 py-1.5">
                  <Select value={api.categoria} onValueChange={v => api.setCategoria(v)}>
                    <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent className="max-h-52 overflow-y-auto">
                      {api.categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[12px] py-1.5">{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="text" inputMode="numeric" value={api.qtdInput.displayValue} onChange={api.qtdInput.onChange} onBlur={api.qtdInput.onBlur} onFocus={api.qtdInput.onFocus} placeholder="0" className="h-8 text-[12px] text-right font-bold tabular-nums" />
                  {/* Peso Médio: derivado somente de exibição (Peso Total ÷ Quantidade) */}
                  <Input value={pesoMedioDerivado} readOnly tabIndex={-1} className="h-8 text-[12px] text-right tabular-nums bg-muted cursor-default" />
                  {/* Peso Total: reutiliza o estado legado de peso (semântica atual = total digitado) */}
                  <Input type="text" inputMode="decimal" value={api.pesoInput.displayValue} onChange={api.pesoInput.onChange} onBlur={api.pesoInput.onBlur} onFocus={api.pesoInput.onFocus} placeholder="0,00" className="h-8 text-[12px] text-right tabular-nums" />
                  <div className="text-center text-muted-foreground/40 text-[11px]">—</div>
                </div>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" disabled className="h-7 text-[11px] gap-1 opacity-60 cursor-not-allowed" title="em breve">
              <Plus className="h-3 w-3" /> Adicionar categoria <span className="text-[9px] uppercase">em breve</span>
            </Button>
          </div>
        </div>

        {/* RESUMO LATERAL — reorganização visual; painel financeiro intocável reutilizado */}
        <div className="space-y-2 self-start">
          <div className="bg-card rounded-md border shadow-sm p-2 space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Situação</span><strong>{cenarioAtual.icon} {cenarioAtual.label}</strong></div>
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

      {/* RODAPÉ azul (identidade do modal original) */}
      <div className="bg-primary px-5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {api.editingId && (
            <Button type="button" variant="ghost" onClick={api.handleCancelEdit} disabled={api.submitting} className="text-white hover:bg-white/10">Cancelar</Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {api.compraDetalhes && (
            <Button type="button" variant="secondary" onClick={() => api.setCompraDialogOpen(true)} disabled={api.submitting} className="gap-1.5">
              <Edit className="h-4 w-4" /> Editar Financeiro
            </Button>
          )}
          <Button type="button" onClick={api.handleRequestRegister} disabled={api.submitting || !api.compraDetalhes} className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            {api.submitting ? 'Registrando...' : api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
          </Button>
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
