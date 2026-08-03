import { useState, useEffect, useMemo, useRef } from 'react';
import type { OcCompromissosApi, CompromissoResumo, ParcelaMaterializacao, CriarCompromissoPayload, ProgramarParcelaInput } from '@/hooks/useOcCompromissos';
import { classificarLotesCompra, type LoteOC } from '@/hooks/useOperacaoLiquidacao';
import { usePlanoContasOC } from '@/hooks/usePlanoContasOC';
import { useComponentesFinanceiros } from '@/hooks/useComponentesFinanceiros';
import { useContasBancariasLeves, rotuloContaLeve } from '@/hooks/useContasBancariasLeves';
import { produtoOCCompromisso } from '@/lib/financeiro/produtoOC';
import { CATEGORIAS } from '@/types/cattle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { Plus, AlertTriangle, Trash2, Pencil } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// PR-OC-UI-FIN-VIEW / FIX-01 / FIX-01b — aba Financeiro do modelo de compromissos (Blocos A/B/C).
//   Consome APENAS useOcCompromissos (totais/flags/modo soberanos da view; React nunca soma). Escrita
//   via os 3 writers homologados, com oc.versao SEMPRE explícita. Sem estorno/renegociação/lote.

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// FIX-01b — parser monetário NATURAL: não força centavos durante a digitação. Retorna null p/ vazio/inválido
//   (nunca NaN). Regra de separadores: último separador = decimal quando há '.' e ','; só ',' = decimal;
//   só '.' = decimal se 1-2 dígitos após, senão milhar (ex.: 10.000). Arredonda só na normalização final.
function parseMoeda(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.replace(/[^\d.,]/g, '');           // remove R$, espaços, letras — mantém dígitos . ,
  if (s === '') return null;
  const hasDot = s.includes('.'), hasComma = s.includes(',');
  let intRaw = '', decRaw = '';
  if (hasDot && hasComma) {
    const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    intRaw = s.slice(0, last).replace(/[.,]/g, '');
    decRaw = s.slice(last + 1).replace(/[.,]/g, '');
  } else if (hasComma) {
    const i = s.lastIndexOf(',');
    intRaw = s.slice(0, i).replace(/,/g, '');
    decRaw = s.slice(i + 1).replace(/,/g, '');
  } else if (hasDot) {
    const i = s.lastIndexOf('.');
    const dec = s.slice(i + 1);
    if (dec.length === 1 || dec.length === 2) { intRaw = s.slice(0, i).replace(/\./g, ''); decRaw = dec; }
    else { intRaw = s.replace(/\./g, ''); decRaw = ''; }
  } else {
    intRaw = s;
  }
  if (intRaw === '' && decRaw === '') return null;
  const n = Number(`${intRaw === '' ? '0' : intRaw}.${decRaw === '' ? '0' : decRaw}`);
  return Number.isFinite(n) ? n : null;
}

// Campo monetário: texto de edição livre enquanto foca; normaliza p/ BRL (2 casas) no blur; emite o número.
function CampoMoeda({ valor, onChange, placeholder, className }: {
  valor: number | null; onChange: (n: number | null) => void; placeholder?: string; className?: string;
}) {
  const [texto, setTexto] = useState(valor != null ? brl(valor) : '');
  const [editando, setEditando] = useState(false);
  useEffect(() => { if (!editando) setTexto(valor != null ? brl(valor) : ''); }, [valor, editando]);
  return (
    <Input
      inputMode="decimal" value={texto} placeholder={placeholder} className={className}
      onFocus={() => setEditando(true)}
      onChange={(e) => { setTexto(e.target.value); onChange(parseMoeda(e.target.value)); }}
      onBlur={() => {
        setEditando(false);
        const n = parseMoeda(texto);
        const r = n != null ? round2(n) : null;
        onChange(r);
        setTexto(r != null ? brl(r) : '');
      }}
    />
  );
}

interface Props {
  ocApi: OcCompromissosApi;
  bloqueado: boolean;                 // gate de escrita do modelo novo (rascunho/cancelada/legado/misto)
  clienteId: string | null;
  tipoOperacao: string | null;        // 'compra'
  fornecedores: { id: string; nome: string }[];
  valorAcordado: number | null;       // default do principal
  lotes: LoteOC[];                     // sugestão de subcentro por categorias
  contraparteId: string | null;       // descrição rica
  dataOperacao: string | null;        // contexto: data da compra
  dataChegada: string | null;         // contexto: data de chegada (recebimento)
  darkSelectClass: string;
  recarregarDados?: () => void;        // refresh da API de negociação antes de abrir "Novo compromisso"
}

const badgeStatusCompromisso = (s: string) => (s === 'programado' ? 'default' : s === 'cancelado' ? 'destructive' : 'secondary');
const badgeStatusParcela = (s: string) => (s === 'materializada' ? 'default' : s === 'paga' ? 'default' : s === 'cancelada' ? 'destructive' : 'secondary');

export function AbaCompromissosOC({ ocApi, bloqueado, clienteId, tipoOperacao, fornecedores, valorAcordado, lotes, contraparteId, dataOperacao, dataChegada, darkSelectClass, recarregarDados }: Props) {
  const { resumoOperacao, compromissos, parcelas, versao, saving } = ocApi;
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recemMaterializada, setRecemMaterializada] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [programarAberto, setProgramarAberto] = useState(false);
  const [confirmarParcela, setConfirmarParcela] = useState<ParcelaMaterializacao | null>(null);

  // Seleção ESTÁVEL por compromisso_id: preserva o selecionado após refetch; senão 1º não-cancelado.
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

  // Abre "Novo compromisso" após refrescar os dados da OC (valor_acordado/lotes/contraparte),
  // garantindo que o dialog herde o snapshot atual e não uma leitura obsoleta da negociação.
  const abrirNovo = () => { recarregarDados?.(); setNovoAberto(true); };

  // Editar o título vinculado à parcela materializada: reutiliza o modal oficial do Financeiro V2
  // via o fluxo existente ?flancId={tituloId} (V2Index consome, troca de seção e abre o modal com a
  // proteção OC — valor/classificação/favorecido/vencimento seguem travados). Sem modal/RPC/writer novo.
  const editarTitulo = (tituloId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('flancId', tituloId);
    next.set('ocfin', '1');   // PR-OC-FIN-EDIT-FIX-02 — contexto OC: libera edição de favorecido no título
    next.delete('oc_compra');
    next.delete('oc_id');
    setSearchParams(next, { replace: true });
  };

  const sugestaoSubcentro = useMemo(() => {
    const c = classificarLotesCompra(lotes);
    if (c.status !== 'ok') return '';
    const subs = new Set(c.itens.map(i => i.subcentro));
    return subs.size === 1 ? Array.from(subs)[0] : '';
  }, [lotes]);

  const descricaoDefault = useMemo(() => {
    const qtd = lotes.reduce((s, l) => s + (l.qtd ?? 0), 0);
    const cats = Array.from(new Set(lotes.map(l => l.categoria).filter(Boolean)));
    const catLabel = cats.map(slug => CATEGORIAS.find(c => c.value === slug)?.label ?? slug).join('/');
    // Formato soberano do compromisso principal (fonte única produtoOC.ts): "Compra 007 Garrotes".
    // O fornecedor NÃO entra na descrição — permanece no campo Favorecido/dados da OC.
    // Sem lotes classificados (qtd 0), mantém o fallback simples p/ não exibir "Compra 000".
    if (qtd <= 0) return 'Compra principal';
    return produtoOCCompromisso(tipoOperacao ?? 'compra', qtd, catLabel);
  }, [lotes, tipoOperacao]);

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
    setConfirmarParcela(null);                       // fecha JÁ (nunca congela)
    try {
      await ocApi.materializarParcela(versao, p.programacaoId, p.parcelaId);
      setRecemMaterializada(p.parcelaId);            // destaque da recém-materializada
    } catch { /* toast pelo hook */ }
  }

  return (
    <div className="space-y-2 min-w-0 text-[12px]">
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

      {/* ===== BLOCO A — COMPROMISSOS (FIX-01b: densidade p/ notebook 13", sem scroll horizontal) ===== */}
      <div className="rounded-md border bg-card p-1.5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold text-muted-foreground">Compromissos</div>
          <Button size="sm" className="h-6 text-[11px] px-2" disabled={!podeEscrever} onClick={abrirNovo}>
            <Plus className="h-3 w-3 mr-1" /> Novo compromisso
          </Button>
        </div>

        {compromissos.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div className="text-[11px] text-muted-foreground">Nenhum compromisso nesta operação.</div>
            <Button size="sm" className="h-7 text-[11px]" disabled={!podeEscrever} onClick={abrirNovo}>
              <Plus className="h-3 w-3 mr-1" /> Novo compromisso
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="text-left text-[9px] text-muted-foreground border-b">
                  <th className="py-0.5 pr-1.5">Nat./Comp.</th>
                  <th className="py-0.5 pr-1.5">Favorecido</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Valor</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Prog.</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">A prog.</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Mat.</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Liq.</th>
                  <th className="py-0.5 pr-1.5 text-right whitespace-nowrap">Saldo</th>
                  <th className="py-0.5 pr-1.5">Status</th>
                  <th className="py-0.5 pr-0.5"></th>
                </tr>
              </thead>
              <tbody>
                {compromissos.map(c => {
                  const favNome = fornecedores.find(f => f.id === c.favorecidoId)?.nome ?? (c.favorecidoId ? '—' : '');
                  return (
                    <tr key={c.compromissoId ?? ''} onClick={() => setSelectedId(c.compromissoId)}
                      className={`border-b cursor-pointer hover:bg-muted/50 ${selectedId === c.compromissoId ? 'bg-muted' : ''}`}>
                      <td className="py-0.5 pr-1.5 whitespace-nowrap">{c.natureza ?? '—'}/{c.componente ?? '—'}</td>
                      <td className="py-0.5 pr-1.5 max-w-[110px] truncate" title={favNome}>{favNome}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.valorCompromisso)}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.totalProgramado)}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.saldoAProgramar)}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.totalMaterializado)}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.totalLiquidado)}</td>
                      <td className="py-0.5 pr-1.5 text-right whitespace-nowrap">{brl(c.saldoFinanceiro)}</td>
                      <td className="py-0.5 pr-1.5"><Badge variant={badgeStatusCompromisso(c.status)} className="text-[9px] px-1">{c.status}</Badge></td>
                      <td className="py-0.5 pr-0.5 text-right">{c.temDivergencia && <AlertTriangle className="h-3 w-3 text-amber-600 inline" aria-label="divergência" />}</td>
                    </tr>
                  );
                })}
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
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="text-left text-[9px] text-muted-foreground border-b">
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
                      <td className="py-0.5 pr-2 text-right whitespace-nowrap">{brl(p.valor)}</td>
                      <td className="py-0.5 pr-2"><Badge variant={badgeStatusParcela(p.status)} className="text-[9px] px-1">{p.status}</Badge></td>
                      <td className="py-0.5 pr-2">
                        {p.tituloId
                          ? <span className="text-[10px] text-muted-foreground" title={p.tituloId}>#{p.tituloId.slice(0, 8)} · {p.tituloStatusTransacao ?? '—'} · {p.tituloValor != null ? brl(p.tituloValor) : '—'}</span>
                          : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="py-0.5 pr-1 text-right">
                        {p.materializada
                          ? (p.tituloId
                              ? <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => { if (p.tituloId) editarTitulo(p.tituloId); }}>
                                  <Pencil className="h-2.5 w-2.5 mr-0.5" /> Editar
                                </Button>
                              : <span className="text-[10px] text-green-600">ok</span>)
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
          contraparteId={contraparteId}
        />
      )}
      {programarAberto && selecionado && (
        <ProgramarDialog
          onClose={() => setProgramarAberto(false)} onSubmit={programar} saving={saving}
          clienteId={clienteId} valorCompromisso={selecionado.valorCompromisso}
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
      <div className="text-[12px] font-semibold tabular-nums whitespace-nowrap">{brl(valor)}</div>
    </div>
  );
}

// ===== Dialog: Novo compromisso =====
function NovoCompromissoDialog({ onClose, onSubmit, saving, clienteId, tipoOperacao, fornecedores, darkSelectClass, valorAcordado, sugestaoSubcentro, descricaoDefault, contraparteId }: {
  onClose: () => void; onSubmit: (p: CriarCompromissoPayload) => void; saving: boolean;
  clienteId: string | null; tipoOperacao: string | null; fornecedores: { id: string; nome: string }[]; darkSelectClass: string;
  valorAcordado: number | null; sugestaoSubcentro: string; descricaoDefault: string; contraparteId: string | null;
}) {
  const plano = usePlanoContasOC(clienteId ?? undefined);
  const comps = useComponentesFinanceiros();
  const [natureza, setNatureza] = useState<'principal' | 'obrigacao'>('principal');
  const [componente, setComponente] = useState('');
  const [valor, setValor] = useState<number | null>(null);
  const [subcentro, setSubcentro] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  const [descricao, setDescricao] = useState('');
  const ultimoDefaultRef = useRef('');   // último default de descrição aplicado automaticamente (ajuste vinculante 3)

  // Defaults por natureza: principal pré-carrega valor acordado, subcentro sugerido e favorecido = contraparte
  // da OC; obrigacao zera. Campos seguem editáveis (mesma semântica de valor/subcentro).
  useEffect(() => {
    setComponente('');
    if (natureza === 'principal') { setValor(valorAcordado); setSubcentro(sugestaoSubcentro); setFavorecidoId(contraparteId ?? ''); }
    else { setValor(null); setSubcentro(''); setFavorecidoId(''); }
  }, [natureza, valorAcordado, sugestaoSubcentro, contraparteId]);

  // Descrição = DEFAULT EDITÁVEL: principal → descricaoDefault; obrigacao → ''. Só atualiza se o campo está
  // vazio OU ainda contém o último default gerado. Após edição manual do usuário, NUNCA sobrescreve.
  useEffect(() => {
    const alvo = natureza === 'principal' ? descricaoDefault : '';
    setDescricao(prev => (prev === '' || prev === ultimoDefaultRef.current ? alvo : prev));
    ultimoDefaultRef.current = alvo;
  }, [natureza, descricaoDefault]);

  const planoTipo = tipoOperacao === 'compra' ? '2-Saídas' : '1-Entradas';
  const componenteOptions = useMemo(() => comps.porNatureza(natureza), [comps, natureza]);
  const subcentroOptions = useMemo(() => {
    const set = new Set<string>();
    plano.rows.forEach(r => { if (r.tipo_operacao === planoTipo && r.subcentro) set.add(r.subcentro); });
    return Array.from(set).sort().map(s => ({ value: s, label: s }));
  }, [plano.rows, planoTipo]);

  const podeSubmeter = !!componente && valor != null && valor > 0 && !!subcentro && !saving;

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
              <CampoMoeda valor={valor} onChange={setValor} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
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
            onClick={() => { if (componente && valor != null && valor > 0 && subcentro) onSubmit({ natureza, componente, valor_total: valor, subcentro, favorecido_id: favorecidoId || null, descricao: descricao || null }); }}>
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== Dialog: Programar (parcelas; conta OPCIONAL por parcela; identidade estável por idLocal) =====
type LinhaParcela = { idLocal: string; valor: number | null; vencimento: string; contaId: string };

function ProgramarDialog({ onClose, onSubmit, saving, clienteId, valorCompromisso, valorAcordado, totalComprometido }: {
  onClose: () => void; onSubmit: (p: ProgramarParcelaInput[]) => void; saving: boolean;
  clienteId: string | null; valorCompromisso: number; valorAcordado: number | null; totalComprometido: number;
}) {
  const { contas } = useContasBancariasLeves(clienteId);
  const idRef = useRef(0);
  // idLocal ESTÁVEL por linha (ajuste vinculante 2): React key E identidade do estado. Add/remove só recalcula
  // a sequência 1..N na submissão — nunca desloca valor/vencimento/conta entre linhas.
  const novaLinha = (): LinhaParcela => ({ idLocal: `p${idRef.current++}`, valor: null, vencimento: '', contaId: '' });
  const [linhas, setLinhas] = useState<LinhaParcela[]>(() => [novaLinha()]);
  const [confirmarParcial, setConfirmarParcial] = useState(false);

  const soma = useMemo(() => round2(linhas.reduce((s, l) => s + (l.valor ?? 0), 0)), [linhas]);
  const todasComValor = linhas.length > 0 && linhas.every(l => l.valor != null && l.valor > 0);
  const tetoCompromisso = round2(valorCompromisso);
  const podeSubmeter = todasComValor && soma <= tetoCompromisso && !saving;
  const restanteOC = (valorAcordado ?? 0) - totalComprometido;
  const restanteCompromisso = round2(tetoCompromisso - soma);

  const setLinha = (idLocal: string, patch: Partial<Omit<LinhaParcela, 'idLocal'>>) =>
    setLinhas(prev => prev.map(l => (l.idLocal === idLocal ? { ...l, ...patch } : l)));
  const removerLinha = (idLocal: string) => setLinhas(prev => prev.filter(l => l.idLocal !== idLocal));

  const contaOptions = useMemo(() => contas.map(c => ({ value: c.id, label: rotuloContaLeve(c) })), [contas]);

  // Sequência é derivada 1..N na ordem visual, na hora de emitir (nunca guardada por linha).
  const emitir = () => {
    if (!podeSubmeter) return;
    onSubmit(linhas.map((l, i) => ({ sequencia: i + 1, valor: l.valor ?? 0, vencimento: l.vencimento || null, conta_bancaria_id: l.contaId || null })));
  };
  // item 3: Σ = teto segue direto; Σ > teto fica bloqueado (writer); Σ < teto exige confirmação de parcial.
  const aoProgramar = () => {
    if (!podeSubmeter) return;
    if (soma < tetoCompromisso) { setConfirmarParcial(true); return; }
    emitir();
  };

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Programar parcelas</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">OC (acordado): </span><b>{valorAcordado != null ? brl(valorAcordado) : '—'}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Comprometido: </span><b>{brl(totalComprometido)}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Restante OC: </span><b>{brl(restanteOC)}</b></div>
              <div className="rounded border bg-muted/30 px-1.5 py-0.5"><span className="text-muted-foreground">Compromisso: </span><b>{brl(valorCompromisso)}</b> · Σ {brl(soma)}</div>
            </div>
            {linhas.map((l, i) => (
              <div key={l.idLocal} className="grid grid-cols-[16px_1fr_1fr_1fr_24px] items-end gap-1.5">
                <div className="text-[11px] text-muted-foreground pb-2">{i + 1}</div>
                <div>
                  <Label className="text-[10px]">Valor</Label>
                  <CampoMoeda valor={l.valor} onChange={(n) => setLinha(l.idLocal, { valor: n })} placeholder="R$ 0,00" className="mt-0.5 h-8 text-[12px]" />
                </div>
                <div>
                  <Label className="text-[10px]">Vencimento</Label>
                  <DatePicker value={l.vencimento} onChange={(v) => setLinha(l.idLocal, { vencimento: v })} size="compact" />
                </div>
                <div>
                  <Label className="text-[10px]">Conta</Label>
                  <SearchableSelect
                    value={l.contaId || '__none__'} onValueChange={(v) => setLinha(l.idLocal, { contaId: v === '__none__' ? '' : v })}
                    options={contaOptions} placeholder="Definir depois"
                    allLabel="— definir depois —" allValue="__none__" dense className="[&>button]:h-8 [&>button]:text-[11px]"
                  />
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={linhas.length === 1}
                  onClick={() => removerLinha(l.idLocal)} aria-label="remover parcela">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setLinhas(prev => [...prev, novaLinha()])}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar parcela
            </Button>
            {soma > tetoCompromisso && (
              <div className="text-[11px] text-destructive">A soma das parcelas excede o valor do compromisso.</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" disabled={!podeSubmeter} onClick={aoProgramar}>Programar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* item 3 — confirmação de programação PARCIAL (Σ < valor do compromisso). Contrato do writer intacto. */}
      {confirmarParcial && (
        <Dialog open onOpenChange={(o) => { if (!o) setConfirmarParcial(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Programação parcial</DialogTitle></DialogHeader>
            <div className="text-[13px]">
              As parcelas somam <b>{brl(soma)}</b> de <b>{brl(tetoCompromisso)}</b>. Restarão <b>{brl(restanteCompromisso)}</b> a programar. Confirmar programação parcial?
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmarParcial(false)}>Voltar</Button>
              <Button size="sm" disabled={saving} onClick={() => { setConfirmarParcial(false); emitir(); }}>Confirmar parcial</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
