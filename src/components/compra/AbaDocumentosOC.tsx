import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, Ban, ArrowLeft, FileText } from 'lucide-react';
import { parseNumericValue } from '@/lib/calculos/abate';
import type {
  DocumentosApi, EspecieDoc, NaturezaComp, DocumentoPayload, ComponentePayload,
} from '@/hooks/useOperacaoDocumentos';

// Aba Documentos (PR-OC-DOC-UI-01). Rótulos amigáveis; totalização usa a fórmula da view
//   (líquido = acréscimos − descontos − retenções − despesas; informativo não altera). Sem upload.
interface Props { api: DocumentosApi; operacaoPronta: boolean; somenteLeitura?: boolean; }

const ESPECIE_LABEL: Record<EspecieDoc, string> = { nf_principal: 'NF principal', nf_complementar: 'NF complementar', outro: 'Outro documento' };
const ESPECIES: EspecieDoc[] = ['nf_principal', 'nf_complementar', 'outro'];
const NATUREZA_LABEL: Record<NaturezaComp, string> = {
  acrescimo: 'Acréscimo', desconto_comercial: 'Desconto comercial', retencao_sem_caixa: 'Retenção (sem caixa)',
  despesa_desembolso: 'Despesa (desembolso)', informativo: 'Informativo',
};
const NATUREZAS: NaturezaComp[] = ['acrescimo', 'desconto_comercial', 'retencao_sem_caixa', 'despesa_desembolso', 'informativo'];
const TIPOS: { value: string; label: string }[] = [
  { value: 'valor_bruto', label: 'Valor bruto' }, { value: 'bonificacao', label: 'Bonificação' }, { value: 'premio', label: 'Prêmio' },
  { value: 'funrural', label: 'Funrural' }, { value: 'senar', label: 'SENAR' }, { value: 'inss', label: 'INSS' },
  { value: 'frete', label: 'Frete' }, { value: 'comissao', label: 'Comissão' }, { value: 'outros', label: 'Outros' },
];
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const tipoLabel = (t: string) => TIPOS.find(x => x.value === t)?.label ?? t;

interface CompRow { tipo: string; natureza: NaturezaComp; valor: string; descricao: string; }
interface FormState {
  documentoId: string | null; versao: number;
  especie: EspecieDoc; numero: string; serie: string; chaveAcesso: string; dataEmissao: string;
  observacao: string; url: string; documentoOrigemId: string;
  componentes: CompRow[]; loteIds: string[];
}
const FORM_VAZIO: FormState = {
  documentoId: null, versao: 0, especie: 'nf_principal', numero: '', serie: '', chaveAcesso: '', dataEmissao: '',
  observacao: '', url: '', documentoOrigemId: '', componentes: [{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: '', descricao: '' }], loteIds: [],
};

export function AbaDocumentosOC({ api, operacaoPronta, somenteLeitura }: Props) {
  const [modo, setModo] = useState<'lista' | 'form'>('lista');
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');

  const totais = useMemo(() => {
    let acr = 0, desc = 0, ret = 0, desp = 0;
    for (const c of form.componentes) {
      const v = parseNumericValue(c.valor) || 0;
      if (c.natureza === 'acrescimo') acr += v;
      else if (c.natureza === 'desconto_comercial') desc += v;
      else if (c.natureza === 'retencao_sem_caixa') ret += v;
      else if (c.natureza === 'despesa_desembolso') desp += v;
    }
    return { acr, desc, ret, desp, liquido: acr - desc - ret - desp };
  }, [form.componentes]);

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center text-[11px] text-muted-foreground">
        Salve a operação na aba Compra para registrar documentos.
      </div>
    );
  }

  const abrirNovo = () => { setForm(FORM_VAZIO); setModo('form'); };
  const abrirEdicao = async (docId: string) => {
    const d = await api.carregarDetalhe(docId);
    if (!d) return;
    setForm({
      documentoId: d.documentoId, versao: d.versao, especie: d.especie, numero: d.numero, serie: d.serie,
      chaveAcesso: d.chaveAcesso, dataEmissao: d.dataEmissao, observacao: d.observacao, url: d.url,
      documentoOrigemId: d.documentoOrigemId ?? '',
      componentes: d.componentes.length
        ? d.componentes.map(c => ({ tipo: c.tipo, natureza: c.natureza, valor: String(c.valor), descricao: c.descricao ?? '' }))
        : [{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: '', descricao: '' }],
      loteIds: d.loteIds,
    });
    setModo('form');
  };

  const setComp = (i: number, patch: Partial<CompRow>) =>
    setForm(f => ({ ...f, componentes: f.componentes.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addComp = () => setForm(f => ({ ...f, componentes: [...f.componentes, { tipo: 'outros', natureza: 'informativo', valor: '', descricao: '' }] }));
  const rmComp = (i: number) => setForm(f => ({ ...f, componentes: f.componentes.filter((_, j) => j !== i) }));
  const toggleLote = (id: string) =>
    setForm(f => ({ ...f, loteIds: f.loteIds.includes(id) ? f.loteIds.filter(x => x !== id) : [...f.loteIds, id] }));

  const salvar = async () => {
    if (somenteLeitura) return;   // guarda defensiva (além da UI)
    const payload: DocumentoPayload = {
      especie: form.especie,
      numero: form.numero || undefined, serie: form.serie || undefined, chaveAcesso: form.chaveAcesso || undefined,
      dataEmissao: form.dataEmissao || undefined, observacao: form.observacao || undefined, url: form.url || undefined,
      documentoOrigemId: form.especie === 'nf_complementar' ? (form.documentoOrigemId || null) : null,
      componentes: form.componentes
        .filter(c => c.tipo && (parseNumericValue(c.valor) || 0) >= 0 && c.valor.trim() !== '')
        .map((c, i): ComponentePayload => ({ tipo: c.tipo, natureza: c.natureza, valor: parseNumericValue(c.valor) || 0, descricao: c.descricao || undefined, ordem: i + 1 })),
      lotes: form.loteIds,
    };
    const ok = form.documentoId
      ? await api.editar(form.documentoId, form.versao, payload)
      : await api.registrar(payload);
    if (ok) setModo('lista');
  };

  const confirmarCancelamento = async () => {
    if (somenteLeitura) return;   // guarda defensiva (além da UI)
    if (!cancelId || !cancelMotivo.trim()) return;
    const ok = await api.cancelar(cancelId, cancelMotivo.trim());
    if (ok) { setCancelId(null); setCancelMotivo(''); }
  };

  const origensPossiveis = api.documentos.filter(d => !d.cancelado && d.documentoId !== form.documentoId);

  // ── FORM ──
  if (modo === 'form') {
    return (
      <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-foreground">{form.documentoId ? 'Editar documento' : 'Novo documento'}</div>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={() => setModo('lista')}><ArrowLeft className="h-3 w-3" /> Voltar</Button>
        </div>

        {/* Cabeçalho do documento */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Espécie</label>
            <Select value={form.especie} onValueChange={v => setForm(f => ({ ...f, especie: v as EspecieDoc }))}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>{ESPECIES.map(e => <SelectItem key={e} value={e} className="text-[11px]">{ESPECIE_LABEL[e]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><label className="text-[10px] text-muted-foreground">Número</label><Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} className="h-7 text-[11px]" /></div>
          <div><label className="text-[10px] text-muted-foreground">Série</label><Input value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} className="h-7 text-[11px]" /></div>
          <div><label className="text-[10px] text-muted-foreground">Emissão</label><Input type="date" value={form.dataEmissao} onChange={e => setForm(f => ({ ...f, dataEmissao: e.target.value }))} className="h-7 text-[11px]" /></div>
          <div className="lg:col-span-2"><label className="text-[10px] text-muted-foreground">Chave de acesso</label><Input value={form.chaveAcesso} onChange={e => setForm(f => ({ ...f, chaveAcesso: e.target.value }))} className="h-7 text-[11px]" /></div>
          <div className="lg:col-span-2"><label className="text-[10px] text-muted-foreground">URL (opcional, sem upload)</label><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" className="h-7 text-[11px]" /></div>
          {form.especie === 'nf_complementar' && (
            <div className="lg:col-span-2">
              <label className="text-[10px] text-muted-foreground">Documento de origem</label>
              <Select value={form.documentoOrigemId || undefined} onValueChange={v => setForm(f => ({ ...f, documentoOrigemId: v }))}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecione o documento original" /></SelectTrigger>
                <SelectContent>
                  {origensPossiveis.length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">Nenhum documento ativo</div>}
                  {origensPossiveis.map(d => <SelectItem key={d.documentoId} value={d.documentoId} className="text-[11px]">{ESPECIE_LABEL[d.especie]} {d.numero ?? d.documentoId.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="lg:col-span-2"><label className="text-[10px] text-muted-foreground">Observação</label><Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="h-7 text-[11px]" /></div>
        </div>

        {/* Componentes */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold text-muted-foreground">Componentes</div>
            <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addComp}><Plus className="h-3 w-3" /> Adicionar</Button>
          </div>
          <div className="grid grid-cols-[1.1fr_1.2fr_0.9fr_1.4fr_auto] gap-1 px-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Tipo</span><span>Natureza</span><span className="text-right">Valor</span><span>Descrição</span><span></span>
          </div>
          {form.componentes.map((c, i) => (
            <div key={i} className="grid grid-cols-[1.1fr_1.2fr_0.9fr_1.4fr_auto] gap-1 items-center">
              <Select value={c.tipo} onValueChange={v => setComp(i, { tipo: v })}>
                <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value} className="text-[11px]">{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={c.natureza} onValueChange={v => setComp(i, { natureza: v as NaturezaComp })}>
                <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>{NATUREZAS.map(n => <SelectItem key={n} value={n} className="text-[11px]">{NATUREZA_LABEL[n]}</SelectItem>)}</SelectContent>
              </Select>
              <Input inputMode="decimal" value={c.valor} onChange={e => setComp(i, { valor: e.target.value })} placeholder="0,00" className="h-6 text-[11px] text-right tabular-nums" />
              <Input value={c.descricao} onChange={e => setComp(i, { descricao: e.target.value })} placeholder="opcional" className="h-6 text-[11px]" />
              <button type="button" onClick={() => rmComp(i)} className="text-muted-foreground/60 hover:text-destructive" aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>

        {/* Totais em tempo real (fórmula da view) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-1 rounded-md border bg-muted/20 px-2 py-1 text-[11px]">
          <div><div className="text-[9px] text-muted-foreground">Acréscimos</div><div className="tabular-nums">{brl(totais.acr)}</div></div>
          <div><div className="text-[9px] text-muted-foreground">Descontos com.</div><div className="tabular-nums">− {brl(totais.desc)}</div></div>
          <div><div className="text-[9px] text-muted-foreground">Retenções s/ caixa</div><div className="tabular-nums">− {brl(totais.ret)}</div></div>
          <div><div className="text-[9px] text-muted-foreground">Despesas</div><div className="tabular-nums">− {brl(totais.desp)}</div></div>
          <div><div className="text-[9px] text-muted-foreground">Valor líquido</div><div className="font-bold text-primary tabular-nums">{brl(totais.liquido)}</div></div>
        </div>

        {/* Lotes vinculados (opcional/múltiplo) */}
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-muted-foreground">Lotes vinculados (opcional)</div>
          <div className="flex flex-wrap gap-1">
            {api.lotes.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum lote na operação.</span>}
            {api.lotes.map(l => {
              const on = form.loteIds.includes(l.loteId);
              return (
                <button key={l.loteId} type="button" onClick={() => toggleLote(l.loteId)}
                  className={`rounded border px-2 py-0.5 text-[10px] ${on ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-muted/20 text-muted-foreground'}`}>
                  Lote {l.ordem}{l.categoria ? ` · ${l.categoria}` : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setModo('lista')}>Cancelar</Button>
          <Button type="button" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving || somenteLeitura} onClick={() => void salvar()}>
            <FileText className="h-3 w-3" /> {api.saving ? 'Salvando…' : (form.documentoId ? 'Salvar alterações' : 'Registrar documento')}
          </Button>
        </div>
      </div>
    );
  }

  // ── LISTA ──
  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-foreground">Documentos da operação</div>
        {!somenteLeitura && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={abrirNovo}><Plus className="h-3 w-3" /> Novo documento</Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
              <th>Espécie</th><th>Número</th><th>Série</th><th>Emissão</th><th className="!text-right">Líquido</th>
              <th className="!text-right">Comp.</th><th className="!text-right">Lotes</th><th>Situação</th><th className="!text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {api.documentos.length === 0 && (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">{api.loading ? 'Carregando…' : 'Nenhum documento.'}</td></tr>
            )}
            {api.documentos.map(d => (
              <tr key={d.documentoId} className={`border-t [&>td]:px-2 [&>td]:py-1 ${d.cancelado ? 'opacity-60' : ''}`}>
                <td className="whitespace-nowrap">
                  {ESPECIE_LABEL[d.especie]}
                  {d.especie === 'nf_complementar' && d.documentoOrigemId && (
                    <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1 text-[9px]">complementa {d.documentoOrigemId.slice(0, 8)}</span>
                  )}
                </td>
                <td>{d.numero ?? '—'}</td>
                <td>{d.serie ?? '—'}</td>
                <td className="whitespace-nowrap">{fmtData(d.dataEmissao)}</td>
                <td className="text-right tabular-nums font-semibold">{brl(d.valorLiquido)}</td>
                <td className="text-right tabular-nums">{d.qtdComponentes}</td>
                <td className="text-right tabular-nums">{d.qtdLotes}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.cancelado ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {d.situacao === 'cancelado' ? 'Cancelado' : 'Ativo'}
                  </span>
                </td>
                <td className="text-right whitespace-nowrap">
                  {!somenteLeitura && !d.cancelado && (
                    <span className="inline-flex gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1" onClick={() => void abrirEdicao(d.documentoId)}><Pencil className="h-3 w-3" /> Editar</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive" onClick={() => { setCancelId(d.documentoId); setCancelMotivo(''); }}><Ban className="h-3 w-3" /> Cancelar</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancelamento com motivo obrigatório */}
      {cancelId && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-rose-700">Cancelar documento (lógico — permanece visível)</div>
          <Input value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-7 text-[11px]" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => { setCancelId(null); setCancelMotivo(''); }}>Voltar</Button>
            <Button type="button" variant="destructive" size="sm" className="h-6 text-[11px]" disabled={api.saving || !cancelMotivo.trim() || somenteLeitura} onClick={() => void confirmarCancelamento()}>Confirmar cancelamento</Button>
          </div>
        </div>
      )}
    </div>
  );
}
