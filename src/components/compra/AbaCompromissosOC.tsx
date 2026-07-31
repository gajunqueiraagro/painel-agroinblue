import { useState, useEffect, useMemo } from 'react';
import type { OcCompromissosApi, CompromissoResumo, ParcelaMaterializacao, CriarCompromissoPayload, ProgramarParcelaInput } from '@/hooks/useOcCompromissos';
import { classificarLotesCompra, type LoteOC } from '@/hooks/useOperacaoLiquidacao';
import { usePlanoContasOC } from '@/hooks/usePlanoContasOC';
import { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';
import { parseNumericValue, formatCurrencyInput } from '@/lib/calculos/abate';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, AlertTriangle, Trash2 } from 'lucide-react';

// PR-OC-UI-FIN-VIEW / FIX-01 — aba Financeiro do modelo de compromissos (Blocos A/B/C). Consome APENAS
//   useOcCompromissos (totais/flags/modo soberanos da view; React nunca soma). Escrita via os 3 writers
//   homologados, com oc.versao SEMPRE explícita. Sem estorno/renegociação/materialização em lote.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

interface Props {
  ocApi: OcCompromissosApi;
  bloqueado: boolean;                 // gate de escrita do modelo novo (rascunho/cancelada/legado/misto)
  clienteId: string | null;
  tipoOperacao: string | null;        // 'compra'
  fornecedores: { id: string; nome: string }[];
  valorAcordado: number | null;       // FIX item 3 — default do principal
  lotes: LoteOC[];                     // FIX item 4 — sugestão de subcentro por categorias
  contraparteId: string | null;       // descrição rica
  dataOperacao: string | null;        // FIX item 6 — data da compra
  dataChegada: string | null;         // FIX item 6 — data de chegada (recebimento)
  darkSelectClass: string;
}

const badgeStatusCompromisso = (s: string) => (s === 'programado' ? 'default' : s === 'cancelado' ? 'destructive' : 'secondary');
const badgeStatusParcela = (s: string) => (s === 'materializada' ? 'default' : s === 'paga' ? 'default' : s === 'cancelada' ? 'destructive' : 'secondary');

export function AbaCompromissosOC({ ocApi, bloqueado, clienteId, tipoOperacao, fornecedores, valorAcordado, lotes, contraparteId, dataOperacao, dataChegada, darkSelectClass }: Props) {
  const { resumoOperacao, compromissos, parcelas, versao, saving } = ocApi;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recemMaterializada, setRecemMaterializada] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [programarAberto, setProgramarAberto] = useState(false);
  const [confirmarParcela, setConfirmarParcela] = useState<ParcelaMaterializacao | null>(null);

  // Seleção ESTÁVEL por compromisso_id (item 9): preserva o selecionado após refetch; senão 1º não-cancelado.
  useEffect(() => {
    if (compromissos.length === 0) { if (selectedId !== null) setSelectedId(null); return; }
    if (!compromissos.some(c => c.compromissoId === selectedId)) {
      const alvo = compromissos.find(c => c.status !== 'cancelado') ?? compromissos[0];
      setSelectedId(alvo?.compromissoId ?? null);
    }
  }, [compromissos, selectedId]);

  const selecionado = useMemo(() => compromissos.find(c => c.compromissoId === selectedId) ?? null, [compromissos, selectedId]);
  const parcelasDoComp = useMemo(
    () => parcelas.filter(p => p.compromissoId === selectedId).sort((a, b) => a.sequencia - b.sequencia),
    [parcelas, selectedId],
  );
  const podeEscrever = !bloqueado && versao != null && !saving;

  // Sugestão de subcentro do principal (item 4): derivada das categorias dos lotes (1 sexo → subcentro; misto → nenhum).
  const sugestaoSubcentro = useMemo(() => {
    const c = classificarLotesCompra(lotes);
    if (c.status !== 'ok') return '';
    const subs = new Set(c.itens.map(i => i.subcentro));
    return subs.size === 1 ? Array.from(subs)[0] : '';
  }, [lotes]);

  // Descrição rica default (bônus): "Compra <qtd> <categorias> — <contraparte>".
  const descricaoDefault = useMemo(() => {
    const qtd = lotes.reduce((s, l) => s + (l.qtd ?? 0), 0);
    const cats = Array.from(new Set(lotes.map(l => l.categoria).filter(Boolean)));
    const contraparte = fornecedores.find(f => f.id === contraparteId)?.nome ?? '';
    const base = qtd > 0 ? `Compra ${qtd} ${cats.join('/')}`.trim() : 'Compra principal';
    return contraparte ? `${base} — ${contraparte}` : base;
  }, [lotes, fornecedores, contraparteId]);

  async function criar(payload: CriarCompromissoPayload) {
    if (versao == null) return;
    try {
      const r = await ocApi.criarCompromisso(versao, payload);   // versão explícita
      setSelectedId(r.compromissoId);
      setNovoAberto(false);
    } catch { /* o hook já exibiu o toast (OcCompromissoError) */ }
  }
  async function programar(lista: ProgramarParcelaInput[]) {
    if (versao == null || !selecionado?.compromissoId) return;
    try {
      await ocApi.programarCompromisso(versao, selecionado.compromissoId, { parcelas: lista });
      setProgramarAberto(false);
    } catch { /* toast pelo hook */ }
  }
  async function materializar(p: ParcelaMaterializacao) {
    if (versao == null || !p.programacaoId || !p.parcelaId) return;
    setConfirmarParcela(null);                       // item 1 — fecha JÁ (nunca congela)
    try {
      await ocApi.materializarParcela(versao, p.programacaoId, p.parcelaId);
      setRecemMaterializada(p.parcelaId);            // item 9 — destaque da recém-materializada
    } catch { /* toast pelo hook */ }
  }

  return (
    <div className="space-y-2 min-w-0 text-[12px]">
      {/* Contexto (item 6) + Resumo soberano da view (zero soma em React) */}
      {resumoOperacao && (
        <div className="rounded-md border bg-card p-1.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-semibold">Resumo financeiro</span>
              <span>· Compra {fmtData(dataOperacao)}</span>
              <span>· Chegada {fmtData(dataChegada)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[10px]">{resumoOperacao.modo}</Badge>
              {resumoOperacao.temDivergencia && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600" title="Divergência detectada">
                  <AlertTriangle className="h-3 w-3" /> divergência
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            <ResumoCard rotulo="Obrigação" valor={resumoOperacao.obrigacaoTotal} />
            <ResumoCard rotulo="Programado" valor={resumoOperacao.totalProgramado} />
            <ResumoCard rotulo="Materializado" valor={resumoOperacao.totalMaterializado} />
            <ResumoCard rotulo="Liquidado" valor={resumoOperacao.totalLiquidado} />
            <ResumoCard rotulo="Saldo fin." valor={resumoOperacao.saldoFinanceiro} />
          </div>
        </div>
      )}

      {/* ===== BLOCO A — COMPROMISSOS ===== */}
      <div className="rounded-md border bg-card p-1.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold text-muted-foreground">Compromissos</div>
          <Button size="sm" className="h-6 text-[11px] px-2" disabled={!podeEscrever} onClick={() => setNovoAberto(true)}>
            <Plus className="h-3 w-3 mr-1" /> Novo compromisso
          </Button>
        </div>

        {compromissos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="text-[11px] text-muted-foreground">Nenhum compromisso nesta operação.</div>
            <Button size="sm" className="h-7 text-[11px]" disabled={!podeEscrever} onClick={() => setNovoAberto(true)}>
              <Plus className="h-3 w-3 mr-1" /> Novo compromisso
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground border-b">
                  <th className="py-0.5 pr-2">Natureza/Comp.</th>
                  <th className="py-0.5 pr-2">Favorecido</th>
                  <th className="py-0.5 pr-2 text-right">Valor</th>
                  <th className="py-0.5 pr-2 text-right">Program.</th>
                  <th className="py-0.5 pr-2 text-right">A prog.</th>
                  <th className="py-0.5 pr-2 text-right">Materializ.</th>
                  <th className="py-0.5 pr-2 text-right">Liquid.</th>
                  <th className="py-0.5 pr-2 text-right">Saldo fin.</th>
                  <th className="py-0.5 pr-2">Status</th>
                  <th className="py-0.5 pr-1"></th>
                </tr>
              </thead>
              <tbody>
                {compromissos.map(c => (
                  <tr key={c.compromissoId ?? ''} onClick={() => setSelectedId(c.compromissoId)}
                    className={`border-b cursor-pointer hover:bg-muted/50 ${selectedId === c.compromissoId ? 'bg-muted' : ''}`}>
                    <td className="py-0.5 pr-2">{c.natureza ?? '—'}/{c.componente ?? '—'}</td>
                    <td className="py-0.5 pr-2">{fornecedores.find(f => f.id === c.favorecidoId)?.nome ?? (c.favorecidoId ? '—' : '')}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.valorCompromisso)}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.totalProgramado)}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.saldoAProgramar)}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.totalMaterializado)}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.totalLiquidado)}</td>
                    <td className="py-0.5 pr-2 text-right">{brl(c.saldoFinanceiro)}</td>
                    <td className="py-0.5 pr-2"><Badge variant={badgeStatusCompromisso(c.status)} className="text-[9px] px-1">{c.status}</Badge></td>
                    <td className="py-0.5 pr-1 text-right">{c.temDivergencia && <AlertTriangle className="h-3 w-3 text-amber-600 inline" aria-label="divergência" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== BLOCO B/C — PROGRAMAÇÃO + MATERIALIZAÇÃO ===== */}
      {selecionado && (
        <div className="rounded-md border bg-card p-1.5 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold text-muted-foreground">
              Programação — {selecionado.natureza}/{selecionado.componente} ({brl(selecionado.valorCompromisso)})
            </div>
            {!selecionado.temProgramacaoAtiva && selecionado.status === 'aberto' && (
              <Button size="sm" className="h-6 text-[11px] px-2" disabled={!podeEscrever} onClick={() => setProgramarAberto(true)}>Programar</Button>
            )}
          </div>

          {parcelasDoComp.length === 0 ? (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              {selecionado.status === 'aberto' ? 'Compromisso aberto — clique em "Programar".' : 'Sem programação ativa.'}
            </div>
          ) : (
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-left text-[10px] text-muted-foreground border-b">
                  <th className="py-0.5 pr-2">Seq</th>
                  <th className="py-0.5 pr-2">Vencimento</th>
                  <th className="py-0.5 pr-2 text-right">Valor</th>
                  <th className="py-0.5 pr-2">Status</th>
                  <th className="py-0.5 pr-2">Título</th>
                  <th className="py-0.5 pr-1"></th>
                </tr>
              </thead>
              <tbody>
                {parcelasDoComp.map(p => {
                  const podeMaterializar = podeEscrever && p.status === 'prevista' && selecionado.status === 'programado';
                  return (
                    <tr key={p.parcelaId ?? ''} className={`border-b ${recemMaterializada === p.parcelaId ? 'bg-green-50 dark:bg-green-950/30' : ''}`}>
                      <td className="py-0.5 pr-2">{p.sequencia}</td>
                      <td className="py-0.5 pr-2">{fmtData(p.vencimento)}</td>
                      <td className="py-0.5 pr-2 text-right">{brl(p.valor)}</td>
                      <td className="py-0.5 pr-2"><Badge variant={badgeStatusParcela(p.status)} className="text-[9px] px-1">{p.status}</Badge></td>
                      <td className="py-0.5 pr-2">
                        {p.tituloId
                          ? <span className="text-[10px] text-muted-foreground" title={p.tituloId}>#{p.tituloId.slice(0, 8)} · {p.tituloStatusTransacao ?? '—'} · {p.tituloValor != null ? brl(p.tituloValor) : '—'}</span>
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="py-0.5 pr-1 text-right">
                        {p.materializada
                          ? <span className="text-[10px] text-green-600">ok</span>
                          : <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" disabled={!podeMaterializar} onClick={() => setConfirmarParcela(p)}>Materializar</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {novoAberto && (
        <NovoCompromissoDialog
          onClose={() => setNovoAberto(false)} onSubmit={criar} saving={saving}
          clienteId={clienteId} tipoOperacao={tipoOperacao} fornecedores={fornecedores} darkSelectClass={darkSelectClass}
          valorAcordado={valorAcordado} sugestaoSubcentro={sugestaoSubcentro} descricaoDefault={descricaoDefault}
        />
      )}
      {programarAberto && selecionado && (
        <ProgramarDialog
          onClose={() => setProgramarAberto(false)} onSubmit={programar} saving={saving}
          valorCompromisso={selecionado.valorCompromisso}
          valorAcordado={valorAcordado} totalComprometido={resumoOperacao?.obrigacaoTotal ?? 0}
        />
      )}
      {confirmarParcela && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmarParcela(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Materializar parcela</DialogTitle></DialogHeader>
            <div className="text-[13px]">Gerar título de <b>{brl(confirmarParcela.valor)}</b> com vencimento <b>{fmtData(confirmarParcela.vencimento)}</b>?</div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmarParcela(null)}>Cancelar</Button>
              <Button size="sm" disabled={saving} onClick={() => materializar(confirmarParcela)}>Materializar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ResumoCard({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded border bg-muted/30 px-1.5 py-0.5">
      <div className="text-[9px] text-muted-foreground">{rotulo}</div>
      <div className="text-[12px] font-semibold tabular-nums">{brl(valor)}</div>
    </div>
  );
}

// ===== Dialog: Novo compromisso =====
function NovoCompromissoDialog({ onClose, onSubmit, saving, clienteId, tipoOperacao, fornecedores, darkSelectClass, valorAcordado, sugestaoSubcentro, descricaoDefault }: {
  onClose: () => void; onSubmit: (p: CriarCompromissoPayload) => void; saving: boolean;
  clienteId: string | null; tipoOperacao: string | null; fornecedores: { id: string; nome: string }[]; darkSelectClass: string;
  valorAcordado: number | null; sugestaoSubcentro: string; descricaoDefault: string;
}) {
  const plano = usePlanoContasOC(clienteId ?? undefined);
  const comps = useComponentesFinanceiros();
  const [natureza, setNatureza] = useState<'principal' | 'obrigacao'>('principal');
  const [componente, setComponente] = useState('');
  const [valor, setValor] = useState('');
  const [subcentro, setSubcentro] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [descricao, setDescricao] = useState('');

  // Defaults por natureza: principal pré-carrega valor acordado (item 3), subcentro sugerido (item 4) e descrição rica.
  useEffect(() => {
    setComponente('');
    if (natureza === 'principal') {
      setValor(valorAcordado != null ? formatCurrencyInput(valorAcordado) : '');
      setSubcentro(sugestaoSubcentro);
      setDescricao(descricaoDefault);
    } else {
      setValor(''); setSubcentro(''); setDescricao('');
    }
  }, [natureza, valorAcordado, sugestaoSubcentro, descricaoDefault]);

  const planoTipo = tipoOperacao === 'compra' ? '2-Saídas' : '1-Entradas';
  const componenteOptions = useMemo(() => comps.porNatureza(natureza), [comps, natureza]);
  const subcentroOptions = useMemo(() => {
    const set = new Set<string>();
    plano.rows.forEach(r => { if (r.tipo_operacao === planoTipo && r.subcentro) set.add(r.subcentro); });
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [plano.rows, planoTipo]);

  const valorNum = parseNumericValue(valor);
  const podeSubmeter = !!componente && valorNum > 0 && !!subcentro && !saving;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo compromisso</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Natureza</Label>
              <Select value={natureza} onValueChange={(v) => setNatureza(v === 'principal' ? 'principal' : 'obrigacao')}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  <SelectItem value="principal">principal</SelectItem>
                  <SelectItem value="obrigacao">obrigacao</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Componente</Label>
              <Select value={componente || '__none__'} onValueChange={(v) => setComponente(v === '__none__' ? '' : v)}>
                <SelectTrigger className="mt-0.5 h-8 text-[12px]"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className={darkSelectClass}>
                  {componenteOptions.map(c => <SelectItem key={c.codigo} value={c.codigo}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Classificação (subcentro) *{natureza === 'principal' && sugestaoSubcentro ? ' · sugerido dos lotes (editável)' : ''}</Label>
            <SearchableSelect
              value={subcentro || '__none__'} onValueChange={(v) => setSubcentro(v === '__none__' ? '' : v)}
              options={subcentroOptions} placeholder="Selecione o subcentro"
              allLabel="— selecione —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Valor total *</Label>
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(formatCurrencyInput(e.target.value))} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
            </div>
            <div>
              <Label className="text-[11px]">Favorecido</Label>
              <SearchableSelect
                value={favorecidoId || '__none__'} onValueChange={(v) => setFavorecidoId(v === '__none__' ? '' : v)}
                options={fornecedores.map(f => ({ value: f.id, label: f.nome }))} placeholder="Opcional"
                allLabel="— nenhum —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[12px]"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} className="mt-0.5 text-[12px]" placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!podeSubmeter}
            onClick={() => onSubmit({ natureza, componente, valor_total: valorNum, subcentro, favorecido_id: favorecidoId || null, descricao: descricao || null })}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Dialog: Programar (parcelas; sem conta nesta V1) =====
function ProgramarDialog({ onClose, onSubmit, saving, valorCompromisso, valorAcordado, totalComprometido }: {
  onClose: () => void; onSubmit: (p: ProgramarParcelaInput[]) => void; saving: boolean;
  valorCompromisso: number; valorAcordado: number | null; totalComprometido: number;
}) {
  const [linhas, setLinhas] = useState<{ valor: string; vencimento: string }[]>([{ valor: '', vencimento: '' }]);

  const soma = useMemo(() => Math.round(linhas.reduce((s, l) => s + (parseNumericValue(l.valor) || 0), 0) * 100) / 100, [linhas]);
  const todasComValor = linhas.length > 0 && linhas.every(l => parseNumericValue(l.valor) > 0);
  const podeSubmeter = todasComValor && soma <= Math.round(valorCompromisso * 100) / 100 && !saving;
  const restanteOC = (valorAcordado ?? 0) - totalComprometido;   // item 5

  const setLinha = (i: number, campo: 'valor' | 'vencimento', v: string) =>
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, [campo]: v } : l)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Programar parcelas</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {/* item 5 — resumo OC × comprometido × restante, além do Σ parcelas × compromisso */}
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">OC (acordado): </span><b>{valorAcordado != null ? brl(valorAcordado) : '—'}</b></div>
            <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Comprometido: </span><b>{brl(totalComprometido)}</b></div>
            <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Restante OC: </span><b>{brl(restanteOC)}</b></div>
            <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Compromisso: </span><b>{brl(valorCompromisso)}</b> · Σ {brl(soma)}</div>
          </div>
          {linhas.map((l, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_1fr_28px] items-end gap-2">
              <div className="text-[11px] text-muted-foreground pb-2">{i + 1}</div>
              <div>
                <Label className="text-[10px]">Valor</Label>
                <Input inputMode="decimal" value={l.valor} onChange={(e) => setLinha(i, 'valor', formatCurrencyInput(e.target.value))} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
              </div>
              <div>
                <Label className="text-[10px]">Vencimento</Label>
                <DatePicker value={l.vencimento} onChange={(v) => setLinha(i, 'vencimento', v)} size="compact" />
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={linhas.length === 1}
                onClick={() => setLinhas(prev => prev.filter((_, idx) => idx !== i))} aria-label="remover parcela">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setLinhas(prev => [...prev, { valor: '', vencimento: '' }])}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar parcela
          </Button>
          {soma > Math.round(valorCompromisso * 100) / 100 && (
            <div className="text-[11px] text-destructive">A soma das parcelas excede o valor do compromisso.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" disabled={!podeSubmeter}
            onClick={() => onSubmit(linhas.map((l, i) => ({ sequencia: i + 1, valor: parseNumericValue(l.valor), vencimento: l.vencimento || null })))}>
            Programar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
