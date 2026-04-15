import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoeda, formatKg, formatArroba, formatPercent } from '@/lib/calculos/formatters';
import { CATEGORIAS } from '@/types/cattle';
import { Calendar, Tag, Award, TrendingDown, CreditCard, FileText, Shield, Lock, Clock, CheckCircle2, Upload, Paperclip } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import type { StatusOperacional } from '@/lib/statusOperacional';
import { getStatusBadge } from '@/lib/statusOperacional';
import { buildAbateCalculation, type AbateCalculation } from '@/lib/calculos/abate';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AbateDetalhes {
  dataVenda: string;
  dataEmbarque: string;
  dataAbate: string;
  tipoVenda: string;
  tipoPeso: string;
  rendCarcaca: string;
  precoArroba: string;
  bonusPrecoce: string;
  bonusQualidade: string;
  bonusListaTrace: string;
  descontoQualidade: string;
  funruralPct: string;
  funruralReais: string;
  outrosDescontos: string;
  notaFiscal: string;
  formaReceb: 'avista' | 'prazo';
  qtdParcelas: string;
  parcelas: { data: string; valor: number }[];
  // Bidirectional R$ fields
  bonusPrecoceReais?: string;
  bonusQualidadeReais?: string;
  bonusListaTraceReais?: string;
  descontoQualidadeReais?: string;
  outrosDescontosArroba?: string;
  pesoCarcacaKgManual?: string;
  /** Official calculation snapshot — single source of truth */
  calculation?: AbateCalculation;
  // --- Novos campos Realizado ---
  frigorifico?: string;
  pedido?: string;
  instrucao?: string;
  docAcerto?: string;
  // Peso total NF (Realizado) — overrides pesoKg per cabeça
  pesoTotalKgNF?: string;
  // Override manual do valor bruto base
  valorBrutoOverride?: string;
  // Anexos
  anexoNfUrl?: string;
  anexoAcertoUrl?: string;
  // --- Novos campos Meta ---
  observacoesInternas?: string;
}

// Item 3 fix: BiRow extracted outside component to prevent remount/focus loss
function BiRow({ label, arrobaVal, reaisVal, totalVal, onArrobaChange, onReaisChange, onArrobaBlur, onReaisBlur, hint, stableKey }: {
  label: string;
  arrobaVal: string;
  reaisVal: string;
  totalVal: number;
  onArrobaChange: (v: string) => void;
  onReaisChange: (v: string) => void;
  onArrobaBlur?: () => void;
  onReaisBlur?: () => void;
  hint?: string;
  stableKey: string;
}) {
  return (
    <tr className="border-b border-border/30">
      <td className="py-1 pr-2 text-[10px] text-muted-foreground font-medium whitespace-nowrap">
        {label}
        {hint && <span className="block text-[8px] text-muted-foreground/70 italic">{hint}</span>}
      </td>
      <td className="py-1 px-1">
        <Input
          key={`${stableKey}-arroba`}
          type="number"
          value={arrobaVal}
          onChange={e => onArrobaChange(e.target.value)}
          onBlur={onArrobaBlur}
          placeholder="0,00"
          className="h-7 text-[10px] w-20 text-right tabular-nums"
          step="0.01"
        />
      </td>
      <td className="py-1 px-1">
        <Input
          key={`${stableKey}-reais`}
          type="number"
          value={reaisVal}
          onChange={e => onReaisChange(e.target.value)}
          onBlur={onReaisBlur}
          placeholder="0,00"
          className="h-7 text-[10px] w-24 text-right tabular-nums"
          step="0.01"
        />
      </td>
      <td className="py-1 pl-1 text-[10px] font-bold text-right tabular-nums whitespace-nowrap">
        {totalVal > 0 ? formatMoeda(totalVal) : '-'}
      </td>
    </tr>
  );
}

export const EMPTY_ABATE_DETALHES: AbateDetalhes = {
  dataVenda: '',
  dataEmbarque: '',
  dataAbate: '',
  tipoVenda: '',
  tipoPeso: 'vivo',
  rendCarcaca: '',
  precoArroba: '',
  bonusPrecoce: '',
  bonusQualidade: '',
  bonusListaTrace: '',
  descontoQualidade: '',
  funruralPct: '',
  funruralReais: '',
  outrosDescontos: '',
  notaFiscal: '',
  formaReceb: 'avista',
  qtdParcelas: '1',
  parcelas: [],
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: AbateDetalhes) => void;
  initialData: AbateDetalhes;
  quantidade: number;
  pesoKg: number;
  categoria: string;
  dataAbate: string;
  statusOp: StatusOperacional;
}

/** Format a number for display in R$ format inline */
function fmtR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Map statusOp to tab value */
function statusToTab(s: StatusOperacional): string {
  if ((s as string) === 'meta') return 'meta';
  if (s === 'programado') return 'programado';
  return 'realizado';
}

export function AbateDetalhesDialog({ open, onClose, onSave, initialData, quantidade, pesoKg, categoria, dataAbate, statusOp }: Props) {
  const [dataVenda, setDataVenda] = useState(initialData.dataVenda);
  const [dataEmbarque, setDataEmbarque] = useState(initialData.dataEmbarque);
  const [dataAbateLocal, setDataAbateLocal] = useState(initialData.dataAbate);
  const [tipoVenda, setTipoVenda] = useState(initialData.tipoVenda);
  const [tipoPeso, setTipoPeso] = useState(initialData.tipoPeso);
  const [rendCarcaca, setRendCarcaca] = useState(initialData.rendCarcaca);
  const [precoArroba, setPrecoArroba] = useState(initialData.precoArroba);

  // Bonus bidirectional: store arroba-based and reais-based
  const [bonusPrecoce, setBonusPrecoce] = useState(initialData.bonusPrecoce);
  const [bonusPrecoceReais, setBonusPrecoceReais] = useState(initialData.bonusPrecoceReais || '');
  const [bonusQualidade, setBonusQualidade] = useState(initialData.bonusQualidade);
  const [bonusQualidadeReais, setBonusQualidadeReais] = useState(initialData.bonusQualidadeReais || '');
  const [bonusListaTrace, setBonusListaTrace] = useState(initialData.bonusListaTrace);
  const [bonusListaTraceReais, setBonusListaTraceReais] = useState(initialData.bonusListaTraceReais || '');

  // Discount bidirectional
  const [descontoQualidade, setDescontoQualidade] = useState(initialData.descontoQualidade);
  const [descontoQualidadeReais, setDescontoQualidadeReais] = useState(initialData.descontoQualidadeReais || '');
  const [outrosDescontos, setOutrosDescontos] = useState(initialData.outrosDescontos);
  const [outrosDescontosArroba, setOutrosDescontosArroba] = useState(initialData.outrosDescontosArroba || '');

  // Funrural
  const [funruralPct, setFunruralPct] = useState(initialData.funruralPct);
  const [funruralReais, setFunruralReais] = useState(initialData.funruralReais);

  const [notaFiscal, setNotaFiscal] = useState(initialData.notaFiscal);
  const [formaReceb, setFormaReceb] = useState<'avista' | 'prazo'>(initialData.formaReceb);
  const [qtdParcelas, setQtdParcelas] = useState(initialData.qtdParcelas);
  const [parcelas, setParcelas] = useState(initialData.parcelas);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  // Novos campos Realizado
  const [frigorifico, setFrigorifico] = useState(initialData.frigorifico || '');
  const [pedido, setPedido] = useState(initialData.pedido || '');
  const [instrucao, setInstrucao] = useState(initialData.instrucao || '');
  const [docAcerto, setDocAcerto] = useState(initialData.docAcerto || '');
  const [pesoTotalKgNF, setPesoTotalKgNF] = useState(initialData.pesoTotalKgNF || '');
  const [valorBrutoOverride, setValorBrutoOverride] = useState(initialData.valorBrutoOverride || '');
  const [anexoNfUrl, setAnexoNfUrl] = useState(initialData.anexoNfUrl || '');
  const [anexoAcertoUrl, setAnexoAcertoUrl] = useState(initialData.anexoAcertoUrl || '');
  const [uploadingNf, setUploadingNf] = useState(false);
  const [uploadingAcerto, setUploadingAcerto] = useState(false);

  // Novos campos Meta
  const [observacoesInternas, setObservacoesInternas] = useState(initialData.observacoesInternas || '');

  // Active tab — driven by statusOp
  const [activeTab, setActiveTab] = useState(statusToTab(statusOp));

  const isPrevisto = (statusOp as string) === 'meta';
  const isProgramado = statusOp === 'programado';
  const isRealizado = statusOp === 'realizado';
  const usePrev = isPrevisto || isProgramado;

  useEffect(() => {
    if (open) {
      setDataVenda(initialData.dataVenda);
      setDataEmbarque(initialData.dataEmbarque);
      setDataAbateLocal(initialData.dataAbate);
      setTipoVenda(initialData.tipoVenda);
      setTipoPeso(initialData.tipoPeso);
      setRendCarcaca(initialData.rendCarcaca);
      setPrecoArroba(initialData.precoArroba);
      setBonusPrecoce(initialData.bonusPrecoce);
      setBonusPrecoceReais(initialData.bonusPrecoceReais || '');
      setBonusQualidade(initialData.bonusQualidade);
      setBonusQualidadeReais(initialData.bonusQualidadeReais || '');
      setBonusListaTrace(initialData.bonusListaTrace);
      setBonusListaTraceReais(initialData.bonusListaTraceReais || '');
      setDescontoQualidade(initialData.descontoQualidade);
      setDescontoQualidadeReais(initialData.descontoQualidadeReais || '');
      setOutrosDescontos(initialData.outrosDescontos);
      setOutrosDescontosArroba(initialData.outrosDescontosArroba || '');
      setFunruralPct(initialData.funruralPct);
      setFunruralReais(initialData.funruralReais);
      setNotaFiscal(initialData.notaFiscal);
      setFormaReceb(initialData.formaReceb);
      setQtdParcelas(initialData.qtdParcelas);
      setParcelas(initialData.parcelas);
      setFrigorifico(initialData.frigorifico || '');
      setPedido(initialData.pedido || '');
      setInstrucao(initialData.instrucao || '');
      setDocAcerto(initialData.docAcerto || '');
      setPesoTotalKgNF(initialData.pesoTotalKgNF || '');
      setValorBrutoOverride(initialData.valorBrutoOverride || '');
      setAnexoNfUrl(initialData.anexoNfUrl || '');
      setAnexoAcertoUrl(initialData.anexoAcertoUrl || '');
      setObservacoesInternas(initialData.observacoesInternas || '');
      setActiveTab(statusToTab(statusOp));
      setDirty(false);
      setConfirmClose(false);
    }
  }, [open, initialData, statusOp]);

  const markDirty = () => setDirty(true);
  const tryClose = () => { if (dirty) setConfirmClose(true); else onClose(); };

  const qtd = quantidade || 0;
  const peso = pesoKg || 0;

  // Peso carcaça kg/cab state for bidirectional (Realizado: 4-field grid)
  const [pesoCarcacaKgCab, setPesoCarcacaKgCab] = useState('');
  const [pesoCarcacaKgTotal, setPesoCarcacaKgTotal] = useState('');
  const [pesoCarcacaArrobaCab, setPesoCarcacaArrobaCab] = useState('');
  const [pesoCarcacaArrobaTotal, setPesoCarcacaArrobaTotal] = useState('');

  // Legacy single field for Programado/Meta tabs
  const [pesoCarcacaKg, setPesoCarcacaKg] = useState('');

  // Sync Realizado carcaça fields bidirectionally
  // Track which field the user is editing to avoid feedback loops
  const [carcacaEditSource, setCarcacaEditSource] = useState<'kgCab' | 'kgTotal' | 'arrobaCab' | 'arrobaTotal' | null>(null);

  useEffect(() => {
    if (!carcacaEditSource) return;
    const q = qtd || 1;
    if (carcacaEditSource === 'kgCab') {
      const v = Number(pesoCarcacaKgCab) || 0;
      setPesoCarcacaKgTotal(v > 0 ? String(Math.round(v * q * 100) / 100) : '');
      setPesoCarcacaArrobaCab(v > 0 ? String(Math.round((v / 15) * 10000) / 10000) : '');
      setPesoCarcacaArrobaTotal(v > 0 ? String(Math.round((v / 15) * q * 10000) / 10000) : '');
    } else if (carcacaEditSource === 'kgTotal') {
      const v = Number(pesoCarcacaKgTotal) || 0;
      const cab = v > 0 ? v / q : 0;
      setPesoCarcacaKgCab(cab > 0 ? String(Math.round(cab * 100) / 100) : '');
      setPesoCarcacaArrobaCab(cab > 0 ? String(Math.round((cab / 15) * 10000) / 10000) : '');
      setPesoCarcacaArrobaTotal(v > 0 ? String(Math.round((v / 15) * 10000) / 10000) : '');
    } else if (carcacaEditSource === 'arrobaCab') {
      const v = Number(pesoCarcacaArrobaCab) || 0;
      const kgCab = v * 15;
      setPesoCarcacaKgCab(kgCab > 0 ? String(Math.round(kgCab * 100) / 100) : '');
      setPesoCarcacaKgTotal(kgCab > 0 ? String(Math.round(kgCab * q * 100) / 100) : '');
      setPesoCarcacaArrobaTotal(v > 0 ? String(Math.round(v * q * 10000) / 10000) : '');
    } else if (carcacaEditSource === 'arrobaTotal') {
      const v = Number(pesoCarcacaArrobaTotal) || 0;
      const arrobaCab = v > 0 ? v / q : 0;
      setPesoCarcacaArrobaCab(arrobaCab > 0 ? String(Math.round(arrobaCab * 10000) / 10000) : '');
      const kgCab = arrobaCab * 15;
      setPesoCarcacaKgCab(kgCab > 0 ? String(Math.round(kgCab * 100) / 100) : '');
      setPesoCarcacaKgTotal(v > 0 ? String(Math.round(v * 15 * 100) / 100) : '');
    }
    setCarcacaEditSource(null);
  }, [carcacaEditSource, pesoCarcacaKgCab, pesoCarcacaKgTotal, pesoCarcacaArrobaCab, pesoCarcacaArrobaTotal, qtd]);

  // The effective pesoCarcacaKg per cab for calc
  const effectivePesoCarcacaKg = isRealizado ? pesoCarcacaKgCab : pesoCarcacaKg;

  // Rend. Carcaça auto-calculated (item 3)
  const rendCarcacaAuto = useMemo(() => {
    const carcKg = Number(effectivePesoCarcacaKg) || 0;
    if (carcKg > 0 && peso > 0) return Math.round((carcKg / peso) * 10000) / 100;
    return 0;
  }, [effectivePesoCarcacaKg, peso]);

  // Core calculations — single source of truth via buildAbateCalculation
  const calc = useMemo(() => {
    return buildAbateCalculation({
      quantidade: qtd,
      pesoKg: peso,
      pesoCarcacaKg: effectivePesoCarcacaKg || undefined,
      rendCarcaca: isRealizado ? (rendCarcacaAuto > 0 ? String(rendCarcacaAuto) : undefined) : (rendCarcaca || undefined),
      precoArroba: precoArroba || undefined,
      funruralPct: funruralPct || undefined,
      funruralReais: funruralReais || undefined,
      bonusPrecoce: bonusPrecoce || undefined,
      bonusPrecoceReais: bonusPrecoceReais || undefined,
      bonusQualidade: bonusQualidade || undefined,
      bonusQualidadeReais: bonusQualidadeReais || undefined,
      bonusListaTrace: bonusListaTrace || undefined,
      bonusListaTraceReais: bonusListaTraceReais || undefined,
      descontoQualidade: descontoQualidade || undefined,
      descontoQualidadeReais: descontoQualidadeReais || undefined,
      outrosDescontos: outrosDescontos || undefined,
      outrosDescontosArroba: outrosDescontosArroba || undefined,
      formaReceb,
      qtdParcelas: qtdParcelas || undefined,
      parcelas,
    });
  }, [peso, qtd, rendCarcaca, rendCarcacaAuto, effectivePesoCarcacaKg, isRealizado, precoArroba, bonusPrecoce, bonusPrecoceReais, bonusQualidade, bonusQualidadeReais, bonusListaTrace, bonusListaTraceReais, descontoQualidade, descontoQualidadeReais, outrosDescontos, outrosDescontosArroba, funruralPct, funruralReais, formaReceb, qtdParcelas, parcelas]);

  // Item 5: when valorBrutoOverride is set, recalculate precoArroba
  const valorBrutoOverrideRef = useRef(valorBrutoOverride);
  useEffect(() => {
    if (valorBrutoOverride !== valorBrutoOverrideRef.current) {
      valorBrutoOverrideRef.current = valorBrutoOverride;
      const vb = Number(valorBrutoOverride) || 0;
      if (vb > 0 && calc.totalArrobas > 0) {
        const newPreco = Math.round((vb / calc.totalArrobas) * 100) / 100;
        setPrecoArroba(String(newPreco));
      }
    }
  }, [valorBrutoOverride, calc.totalArrobas]);

  // Auto-sync parcelas when valor líquido changes and formaReceb === 'prazo'
  const prevValorLiquido = useRef(calc.valorLiquido);
  useEffect(() => {
    if (formaReceb === 'prazo' && calc.valorLiquido > 0 && calc.valorLiquido !== prevValorLiquido.current) {
      const n = Math.max(1, Number(qtdParcelas) || 1);
      setParcelas(current => {
        const newParcelas = current.map((p, i) => {
          const parcelaVal = Math.round((calc.valorLiquido / n) * 100) / 100;
          return { data: p.data, valor: parcelaVal };
        });
        if (newParcelas.length > 0) {
          const sumOthers = newParcelas.slice(0, -1).reduce((s, p) => s + p.valor, 0);
          newParcelas[newParcelas.length - 1].valor = Math.round((calc.valorLiquido - sumOthers) * 100) / 100;
        }
        return newParcelas;
      });
    }
    prevValorLiquido.current = calc.valorLiquido;
  }, [calc.valorLiquido, formaReceb, qtdParcelas]);

  // Auto-compute dates
  const dataVendaAuto = dataVenda || format(new Date(), 'yyyy-MM-dd');
  const dataEmbarqueAuto = dataAbate ? format(addDays(parseISO(dataAbate), -1), 'yyyy-MM-dd') : '';
  const dataAbateAuto = dataAbate;

  const gerarParcelas = useCallback((n: number, base: number) => {
    const p: { data: string; valor: number }[] = [];
    const vp = base / n;
    const baseDate = dataAbate || format(new Date(), 'yyyy-MM-dd');
    for (let i = 0; i < n; i++) {
      const d = addDays(parseISO(baseDate), 30 * (i + 1));
      p.push({ data: format(d, 'yyyy-MM-dd'), valor: Math.round(vp * 100) / 100 });
    }
    if (p.length > 0) {
      const rest = p.slice(0, -1).reduce((s, x) => s + x.valor, 0);
      p[p.length - 1].valor = Math.round((base - rest) * 100) / 100;
    }
    return p;
  }, [dataAbate]);

  const handleQtdParcChange = (v: string) => {
    setQtdParcelas(v); markDirty();
    const n = Number(v);
    if (n > 0 && calc.valorLiquido > 0) {
      setParcelas(gerarParcelas(n, calc.valorLiquido));
    }
  };

  const handleSave = () => {
    onSave({
      dataVenda: dataVendaAuto,
      dataEmbarque: dataEmbarqueAuto,
      dataAbate: dataAbateAuto,
      tipoVenda, tipoPeso,
      rendCarcaca: isRealizado ? String(rendCarcacaAuto) : rendCarcaca,
      precoArroba,
      bonusPrecoce, bonusQualidade, bonusListaTrace,
      descontoQualidade, funruralPct, funruralReais, outrosDescontos,
      notaFiscal, formaReceb, qtdParcelas, parcelas,
      bonusPrecoceReais, bonusQualidadeReais, bonusListaTraceReais,
      descontoQualidadeReais, outrosDescontosArroba,
      pesoCarcacaKgManual: effectivePesoCarcacaKg || undefined,
      calculation: calc,
      frigorifico, pedido, instrucao, docAcerto,
      pesoTotalKgNF: pesoTotalKgNF || undefined,
      valorBrutoOverride: valorBrutoOverride || undefined,
      anexoNfUrl: anexoNfUrl || undefined,
      anexoAcertoUrl: anexoAcertoUrl || undefined,
      observacoesInternas,
    });
  };

  // Upload handler for attachments
  const handleUploadAnexo = useCallback(async (file: File, tipo: 'nf' | 'acerto') => {
    const setUploading = tipo === 'nf' ? setUploadingNf : setUploadingAcerto;
    const setUrl = tipo === 'nf' ? setAnexoNfUrl : setAnexoAcertoUrl;
    const fileName = tipo === 'nf' ? 'nf.pdf' : 'acerto.pdf';
    const storagePath = `${Date.now()}_${fileName}`;

    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('abate-anexos')
        .upload(storagePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('abate-anexos')
        .getPublicUrl(storagePath);

      setUrl(urlData.publicUrl);
      markDirty();
      toast.success(`${tipo === 'nf' ? 'Nota Fiscal' : 'Acerto'} enviado com sucesso`);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Erro ao enviar ${tipo === 'nf' ? 'NF' : 'Acerto'}: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }, [markDirty]);

  const catLabel = CATEGORIAS.find(c => c.value === categoria)?.label || categoria || '-';

  const sectionTitle = (icon: React.ReactNode, title: string) => (
    <div className="flex items-center gap-1.5 pt-0.5">
      {icon}
      <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
    </div>
  );

  const prevLabel = (base: string) => usePrev ? `${base} Prev.` : base;

  // Item 6 fix: Use refs to prevent re-render focus loss on bidirectional fields
  // Store local string values and only propagate on blur or with stable keys
  const handleBonusArrobaChange = (
    setArr: (v: string) => void,
    setReais: (v: string) => void,
    value: string,
  ) => {
    setArr(value); markDirty();
    if (value === '' || value === '0') setReais('');
  };

  const handleBonusReaisChange = (
    setArr: (v: string) => void,
    setReais: (v: string) => void,
    value: string,
  ) => {
    setReais(value); markDirty();
    if (value === '' || value === '0') setArr('');
  };

  // Item 6 fix: Only clear the OTHER field on blur, not on every keystroke
  const handleBonusArrobaBlur = (
    arrobaVal: string,
    setReais: (v: string) => void,
  ) => {
    const v = Number(arrobaVal) || 0;
    if (v > 0) setReais('');
  };

  const handleBonusReaisBlur = (
    reaisVal: string,
    setArr: (v: string) => void,
  ) => {
    const v = Number(reaisVal) || 0;
    if (v > 0) setArr('');
  };

  // Funrural bidirectional
  const handleFunruralPctChange = (value: string) => {
    setFunruralPct(value); markDirty();
    const v = Number(value) || 0;
    if (v > 0 && calc.valorBase > 0) {
      setFunruralReais(String(Math.round(calc.valorBase * v / 100 * 100) / 100));
    } else {
      setFunruralReais('');
    }
  };

  const handleFunruralReaisChange = (value: string) => {
    setFunruralReais(value); markDirty();
    const v = Number(value) || 0;
    if (v > 0 && calc.valorBase > 0) {
      setFunruralPct(String(Math.round((v / calc.valorBase) * 10000) / 100));
    } else {
      setFunruralPct('');
    }
  };

  // Table row component for bonus/discount — Item 6: use defaultValue pattern to prevent focus loss
  const BiRow = ({ label, arrobaVal, reaisVal, totalVal, onArrobaChange, onReaisChange, onArrobaBlur, onReaisBlur, hint, stableKey }: {
    label: string;
    arrobaVal: string;
    reaisVal: string;
    totalVal: number;
    onArrobaChange: (v: string) => void;
    onReaisChange: (v: string) => void;
    onArrobaBlur?: () => void;
    onReaisBlur?: () => void;
    hint?: string;
    stableKey: string;
  }) => (
    <tr className="border-b border-border/30">
      <td className="py-1 pr-2 text-[10px] text-muted-foreground font-medium whitespace-nowrap">
        {label}
        {hint && <span className="block text-[8px] text-muted-foreground/70 italic">{hint}</span>}
      </td>
      <td className="py-1 px-1">
        <Input
          key={`${stableKey}-arroba`}
          type="number"
          value={arrobaVal}
          onChange={e => onArrobaChange(e.target.value)}
          onBlur={onArrobaBlur}
          placeholder="0,00"
          className="h-7 text-[10px] w-20 text-right tabular-nums"
          step="0.01"
        />
      </td>
      <td className="py-1 px-1">
        <Input
          key={`${stableKey}-reais`}
          type="number"
          value={reaisVal}
          onChange={e => onReaisChange(e.target.value)}
          onBlur={onReaisBlur}
          placeholder="0,00"
          className="h-7 text-[10px] w-24 text-right tabular-nums"
          step="0.01"
        />
      </td>
      <td className="py-1 pl-1 text-[10px] font-bold text-right tabular-nums whitespace-nowrap">
        {totalVal > 0 ? formatMoeda(totalVal) : '-'}
      </td>
    </tr>
  );

  // ── Hint helper for Programado tab ──
  const hintText = (text: string) => (
    <span className="text-[8px] text-muted-foreground/70 italic ml-1">{text}</span>
  );

  // ── Tab color classes ──
  const tabColors = {
    meta: 'data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800 dark:data-[state=active]:bg-purple-900/40 dark:data-[state=active]:text-purple-300',
    programado: 'data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 dark:data-[state=active]:bg-amber-900/40 dark:data-[state=active]:text-amber-300',
    realizado: 'data-[state=active]:bg-green-100 data-[state=active]:text-green-800 dark:data-[state=active]:bg-green-900/40 dark:data-[state=active]:text-green-300',
  };

  // ─────────────────────────────────────
  // Shared sections (Bônus, Descontos, Funrural, Resultado, Pagamento)
  // ─────────────────────────────────────

  const renderComercializacao = () => (
    <>
      {sectionTitle(<Tag className="h-4 w-4 text-muted-foreground" />, 'Comercialização')}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">
            {isProgramado ? 'Preço @ base (R$)' : 'R$/@ (Preço Base)'}
            {isProgramado && hintText('acordado — não alterar')}
          </Label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
            <Input type="number" value={precoArroba} onChange={e => { setPrecoArroba(e.target.value); setValorBrutoOverride(''); markDirty(); }} placeholder="0,00" className="h-7 text-[10px] text-right tabular-nums pl-7" step="0.01" />
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Tipo de Abate</Label>
          <Select value={tipoPeso} onValueChange={(v) => { setTipoPeso(v); markDirty(); }}>
            <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vivo">Peso vivo</SelectItem>
              <SelectItem value="morto">Peso morto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px]">Comercialização</Label>
          <Select value={tipoVenda} onValueChange={(v) => { setTipoVenda(v); markDirty(); }}>
            <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="escala">Escala</SelectItem>
              <SelectItem value="a_termo">A termo</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );

  const renderDesempenho = () => (
    <>
      <h4 className="text-[10px] font-semibold text-muted-foreground pt-1">Desempenho do Abate</h4>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">
            {isProgramado ? 'Rend. Carcaça (%)' : usePrev ? 'Rend. Carcaça Prev. (%)' : 'Rend. Carcaça (%)'}
            {isProgramado && hintText('estimado')}
          </Label>
          <div className="relative">
            <Input type="number" value={rendCarcaca} onChange={e => { setRendCarcaca(e.target.value); setPesoCarcacaKg(''); markDirty(); }} placeholder="0,00" step="0.01" className="h-7 text-[10px] text-right tabular-nums pr-6" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Peso Carcaça (kg)</Label>
          <div className="relative">
            <Input type="number" value={pesoCarcacaKg || (calc.carcacaCalc > 0 ? String(Math.round(calc.carcacaCalc * 100) / 100) : '')} onChange={e => { setPesoCarcacaKg(e.target.value); const v = Number(e.target.value) || 0; if (v > 0 && peso > 0) setRendCarcaca(String(Math.round((v / peso) * 10000) / 100)); markDirty(); }} placeholder="0,00" step="0.01" className="h-7 text-[10px] text-right tabular-nums pr-6" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">kg</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Peso Carcaça (@)</Label>
          <Input type="text" readOnly value={calc.pesoArrobaCab > 0 ? formatArroba(calc.pesoArrobaCab) : '-'} className="h-7 text-[10px] text-right tabular-nums bg-muted cursor-not-allowed" />
        </div>
      </div>

      {calc.valorBase > 0 && (
        <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-x-3 text-[10px]">
          <div><span className="text-muted-foreground">@/cab</span><p className="font-bold">{formatArroba(calc.pesoArrobaCab)}</p></div>
          <div><span className="text-muted-foreground">Total Arrobas</span><p className="font-bold">{formatArroba(calc.totalArrobas)}</p></div>
          <div><span className="text-muted-foreground">Valor Base</span><p className="font-bold text-primary">{formatMoeda(calc.valorBase)}</p></div>
        </div>
      )}
    </>
  );

  // Realizado-specific desempenho with 4-field carcaça grid (Item 4)
  const renderDesempenhoRealizado = () => (
    <>
      <h4 className="text-[10px] font-semibold text-muted-foreground pt-1">Peso Carcaça</h4>
      {/* Line 1: kg/cab | kg Total */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Peso Carcaça kg/cab</Label>
          <div className="relative">
            <Input
              type="number"
              value={pesoCarcacaKgCab}
              onChange={e => { setPesoCarcacaKgCab(e.target.value); setCarcacaEditSource('kgCab'); markDirty(); }}
              placeholder="0,00"
              step="0.01"
              className="h-7 text-[10px] text-right tabular-nums pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">kg</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Peso Carcaça kg Total</Label>
          <div className="relative">
            <Input
              type="number"
              value={pesoCarcacaKgTotal}
              onChange={e => { setPesoCarcacaKgTotal(e.target.value); setCarcacaEditSource('kgTotal'); markDirty(); }}
              placeholder="0,00"
              step="0.01"
              className="h-7 text-[10px] text-right tabular-nums pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">kg</span>
          </div>
        </div>
      </div>
      {/* Line 2: @/cab | @ Total */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px]">Peso Carcaça @/cab</Label>
          <div className="relative">
            <Input
              type="number"
              value={pesoCarcacaArrobaCab}
              onChange={e => { setPesoCarcacaArrobaCab(e.target.value); setCarcacaEditSource('arrobaCab'); markDirty(); }}
              placeholder="0,00"
              step="0.0001"
              className="h-7 text-[10px] text-right tabular-nums pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">@</span>
          </div>
        </div>
        <div>
          <Label className="text-[10px]">Peso Carcaça @ Total</Label>
          <div className="relative">
            <Input
              type="number"
              value={pesoCarcacaArrobaTotal}
              onChange={e => { setPesoCarcacaArrobaTotal(e.target.value); setCarcacaEditSource('arrobaTotal'); markDirty(); }}
              placeholder="0,00"
              step="0.0001"
              className="h-7 text-[10px] text-right tabular-nums pr-6"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">@</span>
          </div>
        </div>
      </div>
      {/* Rend. Carcaça auto (Item 3) */}
      <div>
        <Label className="text-[10px]">Rend. Carcaça (%)</Label>
        <div className="relative">
          <Input
            type="text"
            readOnly
            disabled
            value={rendCarcacaAuto > 0 ? `${fmtR(rendCarcacaAuto)}` : '-'}
            className="h-7 text-[10px] text-right tabular-nums pr-6 bg-muted cursor-not-allowed"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
        </div>
      </div>
    </>
  );

  const renderImpostos = () => (
    <>
      {sectionTitle(<Shield className="h-4 w-4 text-muted-foreground" />, 'IMPOSTOS')}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Tipo</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">%</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="py-1 pr-2 text-muted-foreground font-medium">Funrural</td>
            <td className="py-1 px-1">
              <div className="relative">
                <Input type="number" value={funruralPct} onChange={e => handleFunruralPctChange(e.target.value)} placeholder="0,00" step="0.01" className="h-7 text-[10px] w-20 text-right tabular-nums pr-6 mx-auto" />
                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
              </div>
            </td>
            <td className="py-1 px-1">
              <div className="relative">
                <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                <Input type="number" value={funruralReais} onChange={e => handleFunruralReaisChange(e.target.value)} placeholder="0,00" step="0.01" className="h-7 text-[10px] w-28 text-right tabular-nums pl-7 mx-auto" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      {calc.valorBruto > 0 && calc.funruralTotal > 0 && (
        <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
          <span className="font-bold">Valor Bruto (desconto - Funrural)</span>
          <span className="font-bold text-primary tabular-nums">{formatMoeda(calc.valorBruto)}</span>
        </div>
      )}
    </>
  );

  const bonusHint = isProgramado ? 'a confirmar no acerto' : undefined;

  const renderBonus = () => (
    <>
      {sectionTitle(<Award className="h-4 w-4 text-muted-foreground" />, usePrev ? 'BÔNUS Prev. (R$/@)' : 'BÔNUS (R$/@)')}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Tipo Bônus</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">R$/@</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
            <th className="text-center py-1 text-muted-foreground font-medium pl-1">R$ Total</th>
          </tr>
        </thead>
        <tbody>
          <BiRow
            stableKey="bonus-precoce"
            label={prevLabel('Precoce')}
            arrobaVal={bonusPrecoce}
            reaisVal={bonusPrecoceReais}
            totalVal={calc.bonusPrecoceTotal}
            onArrobaChange={v => handleBonusArrobaChange(setBonusPrecoce, setBonusPrecoceReais, v)}
            onReaisChange={v => handleBonusReaisChange(setBonusPrecoce, setBonusPrecoceReais, v)}
            onArrobaBlur={() => handleBonusArrobaBlur(bonusPrecoce, setBonusPrecoceReais)}
            onReaisBlur={() => handleBonusReaisBlur(bonusPrecoceReais, setBonusPrecoce)}
            hint={bonusHint}
          />
          <BiRow
            stableKey="bonus-qualidade"
            label={prevLabel('Qualidade')}
            arrobaVal={bonusQualidade}
            reaisVal={bonusQualidadeReais}
            totalVal={calc.bonusQualidadeTotal}
            onArrobaChange={v => handleBonusArrobaChange(setBonusQualidade, setBonusQualidadeReais, v)}
            onReaisChange={v => handleBonusReaisChange(setBonusQualidade, setBonusQualidadeReais, v)}
            onArrobaBlur={() => handleBonusArrobaBlur(bonusQualidade, setBonusQualidadeReais)}
            onReaisBlur={() => handleBonusReaisBlur(bonusQualidadeReais, setBonusQualidade)}
            hint={bonusHint}
          />
          <BiRow
            stableKey="bonus-trace"
            label={prevLabel('Lista Trace')}
            arrobaVal={bonusListaTrace}
            reaisVal={bonusListaTraceReais}
            totalVal={calc.bonusListaTraceTotal}
            onArrobaChange={v => handleBonusArrobaChange(setBonusListaTrace, setBonusListaTraceReais, v)}
            onReaisChange={v => handleBonusReaisChange(setBonusListaTrace, setBonusListaTraceReais, v)}
            onArrobaBlur={() => handleBonusArrobaBlur(bonusListaTrace, setBonusListaTraceReais)}
            onReaisBlur={() => handleBonusReaisBlur(bonusListaTraceReais, setBonusListaTrace)}
            hint={bonusHint}
          />
        </tbody>
      </table>
      {calc.totalBonus > 0 && (
        <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
          <span className="font-bold">Total Bônus</span>
          <span className="font-bold tabular-nums">+{formatMoeda(calc.totalBonus)}</span>
        </div>
      )}
    </>
  );

  const renderDescontos = () => (
    <>
      {sectionTitle(<TrendingDown className="h-4 w-4 text-muted-foreground" />, usePrev ? 'DESCONTOS Prev. (R$/@)' : 'DESCONTOS (R$/@)')}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Tipo Desconto</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">R$/@</th>
            <th className="text-center py-1 text-muted-foreground font-medium px-1">R$</th>
            <th className="text-center py-1 text-muted-foreground font-medium pl-1">R$ Total</th>
          </tr>
        </thead>
        <tbody>
          <BiRow
            stableKey="desc-qualidade"
            label={prevLabel('Qualidade')}
            arrobaVal={descontoQualidade}
            reaisVal={descontoQualidadeReais}
            totalVal={calc.descQualidadeTotal}
            onArrobaChange={v => handleBonusArrobaChange(setDescontoQualidade, setDescontoQualidadeReais, v)}
            onReaisChange={v => handleBonusReaisChange(setDescontoQualidade, setDescontoQualidadeReais, v)}
            onArrobaBlur={() => handleBonusArrobaBlur(descontoQualidade, setDescontoQualidadeReais)}
            onReaisBlur={() => handleBonusReaisBlur(descontoQualidadeReais, setDescontoQualidade)}
          />
          <BiRow
            stableKey="desc-outros"
            label={prevLabel('Outros')}
            arrobaVal={outrosDescontosArroba}
            reaisVal={outrosDescontos}
            totalVal={calc.descOutrosTotal}
            onArrobaChange={v => handleBonusArrobaChange(setOutrosDescontosArroba, setOutrosDescontos, v)}
            onReaisChange={v => handleBonusReaisChange(setOutrosDescontosArroba, setOutrosDescontos, v)}
            onArrobaBlur={() => handleBonusArrobaBlur(outrosDescontosArroba, setOutrosDescontos)}
            onReaisBlur={() => handleBonusReaisBlur(outrosDescontos, setOutrosDescontosArroba)}
          />
        </tbody>
      </table>
      {calc.totalDescontos > 0 && (
        <div className="bg-muted/40 border border-border/50 rounded px-2 py-1 flex justify-between text-[10px]">
          <span className="font-bold">Total Descontos</span>
          <span className="font-bold text-destructive tabular-nums">-{formatMoeda(calc.totalDescontos)}</span>
        </div>
      )}
    </>
  );

  // Item 7 & 8: Resumo Abate table for Realizado
  const renderResumoAbateTable = () => {
    const perCab = (total: number) => qtd > 0 ? total / qtd : 0;
    return (
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Indicador</th>
            <th className="text-right py-1 text-muted-foreground font-medium px-1">Por cab.</th>
            <th className="text-right py-1 text-muted-foreground font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="py-1 text-muted-foreground font-medium">Quantidade</td>
            <td className="py-1 px-1 text-right tabular-nums">—</td>
            <td className="py-1 text-right font-bold tabular-nums">{qtd} cab.</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-1 text-muted-foreground font-medium">Peso Carcaça kg</td>
            <td className="py-1 px-1 text-right tabular-nums">{formatKg(calc.carcacaCalc)}</td>
            <td className="py-1 text-right font-bold tabular-nums">{formatKg(calc.carcacaCalc * qtd)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-1 text-muted-foreground font-medium">Peso @</td>
            <td className="py-1 px-1 text-right tabular-nums">{formatArroba(calc.pesoArrobaCab)}</td>
            <td className="py-1 text-right font-bold tabular-nums">{formatArroba(calc.totalArrobas)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-1 text-muted-foreground font-medium">Preço R$</td>
            <td className="py-1 px-1 text-right tabular-nums">{formatMoeda(perCab(calc.valorBase))}</td>
            <td className="py-1 text-right font-bold tabular-nums">{formatMoeda(calc.valorBase)}</td>
          </tr>
          <tr className="border-b border-border/30">
            <td className="py-1 text-muted-foreground font-medium">Preço @</td>
            <td className="py-1 px-1 text-right tabular-nums">{formatMoeda(calc.precoArroba)}</td>
            <td className="py-1 text-right tabular-nums">—</td>
          </tr>
        </tbody>
      </table>
    );
  };

  // Item 8: Funrural/Bonus/Descontos summary tables for Realizado
  const renderFunruralResumo = () => {
    if (calc.funruralTotal <= 0) return null;
    const perCab = qtd > 0 ? calc.funruralTotal / qtd : 0;
    return (
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Funrural</th>
            <th className="text-right py-1 text-muted-foreground font-medium px-1">Por cab.</th>
            <th className="text-right py-1 text-muted-foreground font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/30">
            <td className="py-1 text-amber-700 dark:text-amber-400 font-medium">Funrural</td>
            <td className="py-1 px-1 text-right text-amber-700 dark:text-amber-400 tabular-nums">-{formatMoeda(perCab)}</td>
            <td className="py-1 text-right font-bold text-amber-700 dark:text-amber-400 tabular-nums">-{formatMoeda(calc.funruralTotal)}</td>
          </tr>
        </tbody>
      </table>
    );
  };

  const renderBonusResumo = () => {
    if (calc.totalBonus <= 0) return null;
    const items: { label: string; total: number }[] = [];
    if (calc.bonusPrecoceTotal > 0) items.push({ label: 'Precoce', total: calc.bonusPrecoceTotal });
    if (calc.bonusQualidadeTotal > 0) items.push({ label: 'Qualidade', total: calc.bonusQualidadeTotal });
    if (calc.bonusListaTraceTotal > 0) items.push({ label: 'Lista Trace', total: calc.bonusListaTraceTotal });
    return (
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Bônus</th>
            <th className="text-right py-1 text-muted-foreground font-medium px-1">Por cab.</th>
            <th className="text-right py-1 text-muted-foreground font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.label} className="border-b border-border/30">
              <td className="py-1 text-green-700 dark:text-green-400 font-medium">{it.label}</td>
              <td className="py-1 px-1 text-right text-green-700 dark:text-green-400 tabular-nums">+{formatMoeda(qtd > 0 ? it.total / qtd : 0)}</td>
              <td className="py-1 text-right font-bold text-green-700 dark:text-green-400 tabular-nums">+{formatMoeda(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderDescontosResumo = () => {
    if (calc.totalDescontos <= 0) return null;
    const items: { label: string; total: number }[] = [];
    if (calc.descQualidadeTotal > 0) items.push({ label: 'Qualidade', total: calc.descQualidadeTotal });
    if (calc.descOutrosTotal > 0) items.push({ label: 'Outros', total: calc.descOutrosTotal });
    return (
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-1 text-muted-foreground font-medium">Descontos</th>
            <th className="text-right py-1 text-muted-foreground font-medium px-1">Por cab.</th>
            <th className="text-right py-1 text-muted-foreground font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map(it => (
            <tr key={it.label} className="border-b border-border/30">
              <td className="py-1 text-red-700 dark:text-red-400 font-medium">{it.label}</td>
              <td className="py-1 px-1 text-right text-red-700 dark:text-red-400 tabular-nums">-{formatMoeda(qtd > 0 ? it.total / qtd : 0)}</td>
              <td className="py-1 text-right font-bold text-red-700 dark:text-red-400 tabular-nums">-{formatMoeda(it.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const renderResultado = () => {
    if (calc.valorBase <= 0) return null;

    // Aba Realizado: tabelas 3 colunas (Items 7 & 8)
    if (isRealizado) {
      return (
        <div className="space-y-1.5">
          {/* Item 7: Resumo Abate */}
          {sectionTitle(<Tag className="h-4 w-4 text-muted-foreground" />, 'Resumo Abate')}
          {renderResumoAbateTable()}

          {/* Item 8: Funrural, Bônus, Descontos */}
          {renderFunruralResumo()}
          {renderBonusResumo()}
          {renderDescontosResumo()}

          {/* ── VALOR LÍQUIDO (azul) ── */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded p-2 space-y-0.5">
            <h4 className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">Valor Líquido</h4>
            <div className="flex justify-between text-[12px] font-bold text-blue-700 dark:text-blue-400">
              <span>= Valor Líquido</span>
              <span className="tabular-nums">{formatMoeda(calc.somaLiquida > 0 ? calc.somaLiquida : calc.valorLiquido)}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 text-[10px] pt-1">
              <div><span className="text-muted-foreground">R$/@ líq.</span><p className="font-bold">{formatMoeda(calc.liqArroba)}</p></div>
              <div><span className="text-muted-foreground">R$/cab líq.</span><p className="font-bold">{formatMoeda(calc.liqCabeca)}</p></div>
              <div><span className="text-muted-foreground">R$/kg líq.</span><p className="font-bold">{formatMoeda(calc.liqKg)}</p></div>
            </div>
          </div>
        </div>
      );
    }

    // Abas Meta e Programado: layout consolidado original
    return (
      <div className="bg-primary/5 border border-primary/20 rounded p-2 space-y-0.5">
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase">
          {usePrev ? 'Resultado Esperado' : 'Resultado Final'}
        </h4>
        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Valor Base</span><strong className="tabular-nums">{formatMoeda(calc.valorBase)}</strong></div>
          {calc.funruralTotal > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">(–) Funrural</span><strong className="text-destructive tabular-nums">-{formatMoeda(calc.funruralTotal)}</strong></div>
          )}
          <Separator className="my-0.5" />
          <div className="flex justify-between font-bold"><span>= Valor Bruto</span><span className="tabular-nums">{formatMoeda(calc.valorBruto)}</span></div>

          <div className="flex justify-between"><span className="text-muted-foreground">(+) Bônus</span><strong className="tabular-nums">{calc.totalBonus > 0 ? `+${formatMoeda(calc.totalBonus)}` : '-'}</strong></div>
          {calc.totalBonus > 0 && (
            <div className="pl-3 space-y-0 text-muted-foreground">
              {calc.bonusPrecoceTotal > 0 && <div className="flex justify-between"><span>Precoce</span><span className="tabular-nums">{formatMoeda(calc.bonusPrecoceTotal)}</span></div>}
              {calc.bonusQualidadeTotal > 0 && <div className="flex justify-between"><span>Qualidade</span><span className="tabular-nums">{formatMoeda(calc.bonusQualidadeTotal)}</span></div>}
              {calc.bonusListaTraceTotal > 0 && <div className="flex justify-between"><span>Lista Trace</span><span className="tabular-nums">{formatMoeda(calc.bonusListaTraceTotal)}</span></div>}
            </div>
          )}

          <div className="flex justify-between"><span className="text-muted-foreground">(–) Descontos</span><strong className="text-destructive tabular-nums">{calc.totalDescontos > 0 ? `-${formatMoeda(calc.totalDescontos)}` : '-'}</strong></div>
          {calc.totalDescontos > 0 && (
            <div className="pl-3 space-y-0 text-muted-foreground">
              {calc.descQualidadeTotal > 0 && <div className="flex justify-between"><span>Qualidade</span><span className="tabular-nums">{formatMoeda(calc.descQualidadeTotal)}</span></div>}
              {calc.descOutrosTotal > 0 && <div className="flex justify-between"><span>Outros</span><span className="tabular-nums">{formatMoeda(calc.descOutrosTotal)}</span></div>}
            </div>
          )}

          <Separator className="my-0.5" />
          <div className="flex justify-between text-[12px] font-bold">
            <span>= Valor Líquido</span>
            <span className="text-primary tabular-nums">{formatMoeda(calc.valorLiquido)}</span>
          </div>
        </div>

        <div className="bg-muted/30 rounded p-1.5 mt-1 grid grid-cols-4 gap-x-2 gap-y-0.5 text-[10px]">
          <div><span className="text-muted-foreground">Qtde</span><p className="font-bold">{qtd} cab.</p></div>
          <div><span className="text-muted-foreground">Peso médio</span><p className="font-bold">{formatKg(peso)}</p></div>
          <div><span className="text-muted-foreground">Rendimento</span><p className="font-bold">{calc.rendCalc > 0 ? `${fmtR(calc.rendCalc)}%` : '-'}</p></div>
          <div><span className="text-muted-foreground">@/cab</span><p className="font-bold">{formatArroba(calc.pesoArrobaCab)}</p></div>
          <div><span className="text-muted-foreground">Total @</span><p className="font-bold">{formatArroba(calc.totalArrobas)}</p></div>
          <div><span className="text-muted-foreground">R$/@ líq.</span><p className="font-bold">{formatMoeda(calc.liqArroba)}</p></div>
          <div><span className="text-muted-foreground">R$/cab líq.</span><p className="font-bold">{formatMoeda(calc.liqCabeca)}</p></div>
          <div><span className="text-muted-foreground">R$/kg líq.</span><p className="font-bold">{formatMoeda(calc.liqKg)}</p></div>
        </div>
      </div>
    );
  };

  const renderPagamento = () => (
    <>
      {sectionTitle(<CreditCard className="h-4 w-4 text-muted-foreground" />, 'Informações de Pagamento')}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">Nota Fiscal</Label>
          <Input value={notaFiscal} onChange={e => { setNotaFiscal(e.target.value); markDirty(); }} placeholder="Nº NF" className="h-7 text-[10px]" />
        </div>
        <button type="button" onClick={() => { setFormaReceb('avista'); setParcelas([]); markDirty(); }}
          className={`h-7 rounded text-[10px] font-bold border-2 transition-all self-end ${formaReceb === 'avista' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
          À vista
        </button>
        <button type="button" onClick={() => { setFormaReceb('prazo'); markDirty(); if (calc.valorLiquido > 0) setParcelas(gerarParcelas(Number(qtdParcelas) || 1, calc.valorLiquido)); }}
          className={`h-7 rounded text-[10px] font-bold border-2 transition-all self-end ${formaReceb === 'prazo' ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground'}`}>
          A prazo
        </button>
      </div>
      {formaReceb === 'prazo' && (
        <div className="space-y-1">
          <div className="w-24">
            <Label className="text-[10px]">Nº de parcelas</Label>
            <Input type="number" min="1" max="48" value={qtdParcelas} onChange={e => handleQtdParcChange(e.target.value)} className="h-7 text-[10px]" />
          </div>
          {parcelas.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 bg-muted/30 rounded p-1.5">
              <div>
                <Label className="text-[9px]">Parcela {i + 1}</Label>
                <Input type="date" value={p.data} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], data: e.target.value }; setParcelas(np); markDirty(); }} className="h-7 text-[10px]" />
              </div>
              <div>
                <Label className="text-[9px]">Valor</Label>
                <Input type="number" value={String(p.valor)} onChange={e => { const np = [...parcelas]; np[i] = { ...np[i], valor: Number(e.target.value) || 0 }; setParcelas(np); markDirty(); }} className="h-7 text-[10px] text-right tabular-nums" />
              </div>
            </div>
          ))}
          {parcelas.length > 0 && (
            <div className="text-[10px] text-muted-foreground text-right tabular-nums">
              Soma Liq.: {formatMoeda(parcelas.reduce((s, p) => s + p.valor, 0))}
            </div>
          )}
        </div>
      )}
    </>
  );

  const renderDatas = () => (
    <>
      {sectionTitle(<Calendar className="h-4 w-4 text-muted-foreground" />, 'Datas da Operação')}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-[10px]">Data da Venda</Label>
          <Input type="date" value={dataVendaAuto} onChange={e => { setDataVenda(e.target.value); markDirty(); }} className="h-7 text-[10px]" />
        </div>
        <div>
          <Label className="text-[10px]">
            {isProgramado ? 'Data embarque' : 'Data Embarque'}
          </Label>
          <Input type="date" value={dataEmbarqueAuto} readOnly className="h-7 text-[10px] bg-muted cursor-not-allowed" />
        </div>
        <div>
          <Label className="text-[10px]">Data Abate</Label>
          <Input type="date" value={dataAbateAuto} readOnly className="h-7 text-[10px] bg-muted cursor-not-allowed" />
        </div>
      </div>
    </>
  );

  // ────────────────────────────────────
  // RENDER
  // ────────────────────────────────────

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader className="pb-0">
         <DialogTitle className="text-[13px] font-bold flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Detalhes do Abate
            </DialogTitle>
        </DialogHeader>

        {/* ── Tabs Meta / Programado / Realizado ── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-9">
            <TabsTrigger value="meta" className={`gap-1 text-[11px] ${tabColors.meta}`}>
              <Lock className="h-3 w-3" />
              Meta
            </TabsTrigger>
            <TabsTrigger value="programado" className={`gap-1 text-[11px] ${tabColors.programado}`}>
              <Clock className="h-3 w-3" />
              Programado
            </TabsTrigger>
            <TabsTrigger value="realizado" className={`gap-1 text-[11px] ${tabColors.realizado}`}>
              <CheckCircle2 className="h-3 w-3" />
              Realizado
            </TabsTrigger>
          </TabsList>

          {/* ══════ ABA META ══════ */}
          <TabsContent value="meta" className="space-y-2">
            {/* Aviso de visibilidade restrita */}
            <div className="flex items-center gap-1.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded p-2 text-[10px] text-purple-700 dark:text-purple-300">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Visibilidade restrita — somente o proprietário vê este card</span>
            </div>

            {/* Resumo operacional */}
            <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
              <div><span className="text-muted-foreground">Peso médio est.</span><p className="font-bold">{formatKg(peso)}</p></div>
              <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Rend. carcaça estimado (%)</Label>
                <div className="relative">
                  <Input type="number" value={rendCarcaca} onChange={e => { setRendCarcaca(e.target.value); setPesoCarcacaKg(''); markDirty(); }} placeholder="0,00" step="0.01" className="h-7 text-[10px] text-right tabular-nums pr-6" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Peso médio @ calculado</Label>
                <Input type="text" readOnly value={calc.pesoArrobaCab > 0 ? formatArroba(calc.pesoArrobaCab) : '-'} className="h-7 text-[10px] text-right tabular-nums bg-muted cursor-not-allowed" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Preço @ referência (R$)</Label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                  <Input type="number" value={precoArroba} onChange={e => { setPrecoArroba(e.target.value); markDirty(); }} placeholder="0,00" className="h-7 text-[10px] text-right tabular-nums pl-7" step="0.01" />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">Receita bruta esperada</Label>
                <Input type="text" readOnly value={calc.valorBase > 0 ? formatMoeda(calc.valorBase) : '-'} className="h-7 text-[10px] text-right tabular-nums bg-muted cursor-not-allowed" />
              </div>
            </div>

            <div>
              <Label className="text-[10px]">Receita líquida esperada</Label>
              <Input type="text" readOnly value={calc.valorLiquido > 0 ? formatMoeda(calc.valorLiquido) : '-'} className="h-7 text-[10px] text-right tabular-nums bg-muted cursor-not-allowed" />
            </div>

            <div>
              <Label className="text-[10px]">Observações internas</Label>
              <textarea
                value={observacoesInternas}
                onChange={e => { setObservacoesInternas(e.target.value); markDirty(); }}
                placeholder="Notas internas (visíveis apenas para o proprietário)"
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] ring-offset-background placeholder:text-muted-foreground/60 placeholder:italic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </TabsContent>

          {/* ══════ ABA PROGRAMADO ══════ */}
          <TabsContent value="programado" className="space-y-2">
            {/* Resumo operacional */}
            <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Cabeças</span>{hintText('escalado')}<p className="font-bold">{qtd} cab.</p></div>
              <div><span className="text-muted-foreground">Peso médio (kg)</span>{hintText('estimado')}<p className="font-bold">{formatKg(peso)}</p></div>
              <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
            </div>

            <Separator />
            {renderDatas()}
            <Separator />
            {renderComercializacao()}
            {renderDesempenho()}
            <Separator />
            {renderImpostos()}
            <Separator />
            {renderBonus()}
            <Separator />
            {renderDescontos()}
            <Separator />
            {renderResultado()}
            <Separator />
            {renderPagamento()}
          </TabsContent>

          {/* ══════ ABA REALIZADO ══════ */}
          <TabsContent value="realizado" className="space-y-2">
            {/* Resumo operacional — Item 1: removed pesoTotalKgNF field */}
            <div className="bg-muted/30 rounded p-2 grid grid-cols-3 gap-2 text-[11px]">
              <div><span className="text-muted-foreground">Quantidade</span><p className="font-bold">{qtd} cab.</p></div>
              <div><span className="text-muted-foreground">Peso vivo (kg/cab)</span><p className="font-bold">{formatKg(peso)}</p></div>
              <div><span className="text-muted-foreground">Categoria</span><p className="font-bold">{catLabel}</p></div>
            </div>

            {/* Campos de identificação Realizado — Item 2: Frigorífico disabled */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Frigorífico</Label>
                <Input
                  value={frigorifico}
                  disabled
                  className="h-7 text-[10px] bg-muted cursor-not-allowed"
                />
              </div>
              <div>
                <Label className="text-[10px]">Pedido</Label>
                <Input value={pedido} onChange={e => { setPedido(e.target.value); markDirty(); }} placeholder="Nº do pedido" className="h-7 text-[10px]" />
              </div>
              <div>
                <Label className="text-[10px]">Instrução</Label>
                <Input value={instrucao} onChange={e => { setInstrucao(e.target.value); markDirty(); }} placeholder="Instrução" className="h-7 text-[10px]" />
              </div>
              <div>
                <Label className="text-[10px]">Doc. Acerto</Label>
                <Input value={docAcerto} onChange={e => { setDocAcerto(e.target.value); markDirty(); }} placeholder="Documento de acerto" className="h-7 text-[10px]" />
              </div>
            </div>

            <Separator />
            {renderDatas()}
            <Separator />
            {renderComercializacao()}

            {/* Item 4: Realizado-specific carcaça grid */}
            {renderDesempenhoRealizado()}

            {/* Item 5: Override manual do valor bruto — recalcula preço @ */}
            <div className="bg-muted/20 border border-border/50 rounded p-2 space-y-1">
              <Label className="text-[10px] font-semibold">Valor bruto base (R$){hintText('ao digitar, recalcula R$/@')}</Label>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">R$</span>
                  <Input type="number" value={valorBrutoOverride} onChange={e => { setValorBrutoOverride(e.target.value); markDirty(); }} placeholder={calc.valorBase > 0 ? fmtR(calc.valorBase) : '0,00'} step="0.01" className="h-7 text-[10px] text-right tabular-nums pl-7" />
                </div>
                <div className="text-[10px] text-muted-foreground tabular-nums">
                  Calculado: {formatMoeda(calc.valorBase)}
                </div>
              </div>
            </div>

            <Separator />
            {renderImpostos()}
            <Separator />
            {renderBonus()}
            <Separator />
            {renderDescontos()}
            <Separator />
            {renderResultado()}
            <Separator />
            {renderPagamento()}

            {/* ── Seção de Anexos ── */}
            <Separator />
            {sectionTitle(<Paperclip className="h-4 w-4 text-muted-foreground" />, 'Anexos')}
            <div className="grid grid-cols-2 gap-3">
              {/* NF Upload */}
              <div className="space-y-1">
                <Label className="text-[10px]">Nota Fiscal (PDF)</Label>
                {anexoNfUrl ? (
                  <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <a href={anexoNfUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-700 dark:text-green-300 underline truncate flex-1">
                      NF anexada
                    </a>
                    <label className="cursor-pointer text-[9px] text-muted-foreground hover:text-foreground">
                      <span>Substituir</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'nf'); }} />
                    </label>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-1.5 h-8 rounded border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors ${uploadingNf ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{uploadingNf ? 'Enviando...' : 'Enviar NF'}</span>
                    <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'nf'); }} />
                  </label>
                )}
              </div>

              {/* Acerto Upload */}
              <div className="space-y-1">
                <Label className="text-[10px]">Acerto de Compra (PDF)</Label>
                {anexoAcertoUrl ? (
                  <div className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <a href={anexoAcertoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-700 dark:text-green-300 underline truncate flex-1">
                      Acerto anexado
                    </a>
                    <label className="cursor-pointer text-[9px] text-muted-foreground hover:text-foreground">
                      <span>Substituir</span>
                      <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'acerto'); }} />
                    </label>
                  </div>
                ) : (
                  <label className={`flex items-center justify-center gap-1.5 h-8 rounded border-2 border-dashed border-border hover:border-primary/50 cursor-pointer transition-colors ${uploadingAcerto ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{uploadingAcerto ? 'Enviando...' : 'Enviar Acerto'}</span>
                    <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadAnexo(f, 'acerto'); }} />
                  </label>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2 border-t mt-1">
          <Button variant="outline" size="sm" onClick={tryClose} className="h-7 text-[11px]">Cancelar</Button>
          <Button size="sm" onClick={handleSave} className="h-7 text-[11px]">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deseja sair sem salvar?</AlertDialogTitle>
          <AlertDialogDescription>
            As alterações feitas nos detalhes do abate serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setConfirmClose(false); onClose(); }}>
            Sair sem salvar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
