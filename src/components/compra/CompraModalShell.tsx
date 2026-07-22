import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, Edit, Lock, ShoppingCart, X, Trash2, Calendar, Building2 } from 'lucide-react';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';
import { AbaNegociacaoLotes } from './AbaNegociacaoLotes';
import type { CompraLotesApi } from '@/hooks/useCompraLotes';
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
  // ponte Compra→OC (modo OC isolado; opt-in). Off por padrão → comportamento legado.
  modoOC?: boolean;
  ocOperacaoId?: string | null;
  lotesApi?: CompraLotesApi;   // COM-3: estado/handlers dos lotes (só em modo OC)
  onClose: () => void;
}

// Padrão ESCURO único dos dropdowns dos modais da casca (Compra + Negociação). Corrige o
// contraste do item selecionado/hover: o SelectItem do shadcn traz focus:bg-accent (tema
// claro) — aqui sobrescrevemos com !important (branco translúcido + texto branco) para o
// selecionado/hover ficarem legíveis e nunca herdarem o accent claro. Container = mesmo look
// glass do FinV2 (não editamos o DARK_GLASS compartilhado; esta é a regra da casca).
export const DARK_SELECT_CONTENT =
  'bg-zinc-950/80 backdrop-blur-xl border-zinc-700/50 text-zinc-100 ' +
  '[&_[role=option]]:text-zinc-100 ' +
  '[&_[role=option]:focus]:!bg-white/10 [&_[role=option]:focus]:!text-white ' +
  '[&_[role=option][data-state=checked]]:!bg-white/20 [&_[role=option][data-state=checked]]:!text-white [&_[role=option][data-state=checked]]:font-semibold';

const ABAS = [
  { key: 'compra', label: 'Compra', enabled: true },
  { key: 'negociacao', label: 'Negociação', enabled: true },
  { key: 'recebimento', label: 'Recebimento', enabled: false },
  { key: 'financeiro', label: 'Financeiro', enabled: false },
  { key: 'documentos', label: 'Documentos', enabled: false },
  { key: 'auditoria', label: 'Auditoria', enabled: false },
] as const;

// Indicador de cenário (norma: [✓ Realizado] / [🔵 Meta], sem texto). Programado removido no PR-0C.
const CENARIO_UI: Record<string, { icon: string; label: string; chip: string }> = {
  realizado: { icon: '✓', label: STATUS_LABEL.realizado, chip: 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300' },
  meta: { icon: '🔵', label: META_VISUAL.label, chip: 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300' },
};

export function CompraModalShell(api: CompraModalShellProps) {
  const [abaAtiva, setAbaAtiva] = useState<string>('compra');
  // Modo OC: ao CRIAR a operação (ocOperacaoId passa de vazio→preenchido), navega
  // automaticamente para a aba Negociação (informar os lotes).
  const prevOcRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (api.modoOC && api.ocOperacaoId && !prevOcRef.current) {
      setAbaAtiva('negociacao');
    }
    prevOcRef.current = api.ocOperacaoId ?? null;
  }, [api.modoOC, api.ocOperacaoId]);
  // Seleção visual de fazenda destino (nesta rodada não altera payload/persistência).
  const [fazendaSel, setFazendaSel] = useState<string>(api.fazendaAtualId ?? '__atual__');

  const cenarioOptions: (StatusOperacional | 'meta')[] = ['realizado', 'meta'];
  const cenarioAtual = CENARIO_UI[api.statusOp] ?? CENARIO_UI.realizado;
  const fornecedorNome = api.fornecedores.find(f => f.id === api.compraFornecedorId)?.nome || '';
  const canOpenModal = !!(api.data && api.quantidadeNum > 0 && api.pesoKgNum > 0 && api.categoria);
  // Peso Total = derivado de exibição (Peso Médio × Quantidade). O estado legado `pesoKg`
  // JÁ é o peso médio (vira pesoMedioKg no payload); portanto nada é escrito de volta.
  const pesoTotalDerivado = api.quantidadeNum > 0 && api.pesoKgNum > 0
    ? (api.pesoKgNum * api.quantidadeNum).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const dataLabel = api.data ? api.data.split('-').reverse().join('/') : '—';

  return (
    <div className="flex flex-col">
      {/* HEADER — template do modal aprovado (bg-primary, px-6 py-4, duas linhas) */}
      <div className="bg-primary text-primary-foreground px-6 py-4 flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">🛒</span>
            <h2 className="text-lg font-bold leading-tight">Compra de Animais</h2>
            {api.editingId && (
              <span className="rounded-md border border-white/40 px-2 py-0.5 text-xs">Editando #{api.editingId.slice(0, 8)}</span>
            )}
            {api.modoOC && (
              <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-0.5 text-xs" title="Modo OC (isolado) — não cria lançamento nem financeiro">
                OC{api.ocOperacaoId ? ` #${api.ocOperacaoId.slice(0, 8)}` : ' (novo)'}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-white/80">
            <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {dataLabel}</span>
            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {api.fazendaAtualNome || '—'}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {api.mesFechadoMsg && (
            <span className="rounded-md border border-yellow-400 text-yellow-400 px-2 py-1 text-xs flex items-center gap-1" title={api.mesFechadoMsg}>
              <Lock className="h-3 w-3" /> Mês fechado
            </span>
          )}
          <button onClick={api.onClose} className="text-white/80 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
      </div>

      {/* BARRA DE ABAS — template (bg-card, border-b, px-6 py-3) */}
      <div className="bg-card border-b px-6 py-3 flex items-center gap-1 overflow-x-auto">
        {ABAS.map(a => {
          const active = a.key === abaAtiva && a.enabled;
          return (
            <button
              key={a.key}
              type="button"
              disabled={!a.enabled}
              onClick={() => a.enabled && setAbaAtiva(a.key)}
              title={a.enabled ? undefined : 'em breve'}
              className={`shrink-0 px-3 py-1 text-[12px] font-semibold border-b-2 -mb-px transition-colors ${
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

      {/* CORPO — altura FIXA (h-[62vh]) para a casca não mudar de tamanho entre abas; só o
          corpo rola (header/barra de abas/rodapé permanecem fixos fora do scroll). */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 p-6 h-[62vh] overflow-y-auto bg-muted/30">
        <div className="space-y-3 min-w-0">
          {abaAtiva === 'negociacao' ? (
            <AbaNegociacaoLotes
              categoria={api.categoria}
              categoriasDisponiveis={api.categoriasDisponiveis}
              quantidadeNum={api.quantidadeNum}
              pesoKgNum={api.pesoKgNum}
              darkSelectClass={DARK_SELECT_CONTENT}
              modoOC={api.modoOC}
              operacaoPronta={!!api.ocOperacaoId}
              lotesApi={api.lotesApi}
              onVoltarCompra={() => setAbaAtiva('compra')}
            />
          ) : (
          <>
          {/* CARD 1 — Identificação da Compra */}
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
            <div className="text-[12px] font-semibold text-muted-foreground">Identificação da Compra</div>
            {/* Linha 1: Status · Data · Fazenda · Observações (larguras justas; Obs ocupa o resto) */}
            <div className="grid grid-cols-1 lg:grid-cols-[170px_150px_180px_minmax(0,1fr)] gap-2">
              <div>
                <Label className="font-bold text-[11px]">Status</Label>
                <Select value={api.statusOp} onValueChange={(v) => api.setStatusOp(v as StatusOperacional | 'meta')}>
                  <SelectTrigger className={`mt-0.5 h-8 text-[12px] font-semibold border-2 gap-1 ${cenarioAtual.chip}`}>
                    <span className="flex items-center gap-1"><span>{cenarioAtual.icon}</span><span>{cenarioAtual.label}</span></span>
                  </SelectTrigger>
                  <SelectContent className={DARK_SELECT_CONTENT}>
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
                  <SelectContent className={DARK_SELECT_CONTENT}>
                    {api.fazendaAtualId && <SelectItem value={api.fazendaAtualId} className="text-[12px]">{api.fazendaAtualNome}</SelectItem>}
                    {api.fazendas.filter(f => f.id !== api.fazendaAtualId).map(f => <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="font-bold text-[11px]">Observações/Lote</Label>
                <Input value={api.observacao} onChange={e => api.setObservacao(e.target.value)} placeholder="Opcional" className="mt-0.5 h-8 text-[12px]" />
              </div>
            </div>
            {/* Linha 2: Fornecedor · Propriedade de origem */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
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
                      dense
                      className="[&>button]:h-8 [&>button]:text-[12px] [&>button]:px-2"
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
          </div>

          {/* CARD 2 — Animais da Compra. Em modo OC os animais/lotes vivem na aba Negociação;
              aqui o card só existe no fluxo legado (PR-COMPRA-01). */}
          {!api.modoOC && (
          <div className="rounded-md border bg-card p-2 shadow-sm space-y-1 min-w-0">
            {/* Header do card: título + botão à direita (norma: topo, não abaixo da tabela) */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-muted-foreground">Animais da Compra</div>
              <Button type="button" variant="outline" size="sm" disabled className="h-7 text-[11px] gap-1 opacity-60 cursor-not-allowed" title="em breve">
                <Plus className="h-3 w-3" /> Adicionar categoria <span className="text-[9px] uppercase">em breve</span>
              </Button>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_1.3fr_1fr] gap-2 px-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Categoria</span><span className="text-right">Quantidade</span><span className="text-right">Peso Médio</span><span className="text-right">Peso Total</span><span className="text-center">Ações</span>
                </div>
                <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_1.3fr_1fr] gap-2 items-center rounded-md border bg-muted/20 px-1 py-0.5">
                  <Select value={api.categoria} onValueChange={v => api.setCategoria(v)}>
                    <SelectTrigger className="h-6 text-[11px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent className={`${DARK_SELECT_CONTENT} max-h-[70vh] overflow-y-auto`}>
                      {api.categoriasDisponiveis.map(c => <SelectItem key={c.value} value={c.value} className="text-[11px] py-1">{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="text" inputMode="numeric" value={api.qtdInput.displayValue} onChange={api.qtdInput.onChange} onBlur={api.qtdInput.onBlur} onFocus={api.qtdInput.onFocus} placeholder="0" className="h-6 text-[11px] text-right font-bold tabular-nums" />
                  {/* Peso Médio: input legado (o estado pesoKg É o peso médio → pesoMedioKg no payload) */}
                  <Input type="text" inputMode="decimal" value={api.pesoInput.displayValue} onChange={api.pesoInput.onChange} onBlur={api.pesoInput.onBlur} onFocus={api.pesoInput.onFocus} placeholder="0,00" className="h-6 text-[11px] text-right tabular-nums" />
                  {/* Peso Total: derivado somente de exibição (Peso Médio × Quantidade) — read-only */}
                  <Input value={pesoTotalDerivado} readOnly tabIndex={-1} className="h-6 text-[11px] text-right tabular-nums bg-muted cursor-default" />
                  <div className="text-center text-muted-foreground/40 text-[10px]">—</div>
                </div>
              </div>
            </div>
          </div>
          )}
          </>
          )}
        </div>

        {/* RESUMO LATERAL — coluna de 320px do template; painel financeiro intocável reutilizado */}
        <div className="space-y-2 self-start">
          <div className="bg-card rounded-md border shadow-sm p-2 space-y-0.5 text-[10px] leading-tight">
            <div className="flex justify-between"><span className="text-muted-foreground">Situação</span><strong>{cenarioAtual.icon} {cenarioAtual.label}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fazenda</span><strong className="truncate max-w-[150px]">{api.fazendaAtualNome || '—'}</strong></div>
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

      {/* RODAPÉ — template do modal aprovado (bg-primary, px-6 py-3), FIXO (fora do scroll do corpo) */}
      <div className="bg-primary px-6 py-3 flex items-center justify-between gap-3">
        <div>
          {api.editingId && (
            <Button variant="outline" onClick={api.handleCancelEdit} disabled={api.submitting}
              className="border-destructive text-destructive hover:bg-destructive/10 gap-1.5 bg-transparent">
              <Trash2 className="h-4 w-4" /> Cancelar operação
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={api.onClose} className="text-white hover:bg-white/10">Fechar</Button>
          {/* Editar Financeiro: só em edição e quando aplicável (composição aprovada do rodapé) */}
          {api.editingId && api.compraDetalhes && (
            <Button variant="secondary" onClick={() => api.setCompraDialogOpen(true)} disabled={api.submitting} className="gap-1.5">
              <Edit className="h-4 w-4" /> Editar Financeiro
            </Button>
          )}
          {abaAtiva === 'negociacao' ? (
            // Ação da aba Negociação: apenas visual nesta rodada (sem handler). O fluxo de
            // Registrar Compra da aba Compra permanece inalterado.
            <Button type="button"
              disabled={!api.modoOC || !api.ocOperacaoId || !!api.lotesApi?.saving}
              onClick={() => api.lotesApi?.salvar()}
              className={`bg-white text-primary font-bold gap-1.5 ${(!api.modoOC || !api.ocOperacaoId) ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/90'}`}
              title={api.modoOC ? (api.ocOperacaoId ? undefined : 'Salve a operação na aba Compra primeiro') : 'em breve'}>
              <ShoppingCart className="h-4 w-4" /> {api.lotesApi?.saving ? 'Salvando...' : 'Salvar Negociação'}
            </Button>
          ) : (
            <Button onClick={api.handleRequestRegister} disabled={api.submitting || (!api.modoOC && !api.compraDetalhes)} className="bg-white text-primary hover:bg-white/90 font-bold gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              {api.submitting ? 'Salvando...'
                : api.modoOC ? (api.ocOperacaoId ? 'Salvar alterações' : 'Salvar e continuar para Negociação')
                : api.editingId ? 'Salvar Alterações' : 'Registrar Compra'}
            </Button>
          )}
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
