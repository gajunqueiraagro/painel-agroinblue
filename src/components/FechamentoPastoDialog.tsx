import { useQueryClient } from '@tanstack/react-query';
import { CHAVE_DA_FAIXA } from '@/hooks/useFaixaDoFechamento';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { type Pasto, type CategoriaRebanho } from '@/hooks/usePastos';
import { type FechamentoPasto, useFechamento } from '@/hooks/useFechamento';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TIPOS_USO_OPTIONS_AGRUPADAS, TIPOS_USO_EXIGEM_REBANHO, labelDoTipoUso, grupoDoTipoUso } from '@/lib/pastos/tiposUso';
import { AreaPlantadaPanel } from '@/components/agri/AreaPlantadaPanel';
import { useCliente } from '@/contexts/ClienteContext';
import { Label } from '@/components/ui/label';
import { Lock, Copy, Save, LockOpen } from 'lucide-react';
import { calcUA } from '@/lib/calculos/zootecnicos';
import { formatNum } from '@/lib/calculos/formatters';
import { useMasterLock } from '@/hooks/useMasterLock';
import { MasterLockBanner } from '@/components/MasterLockBanner';
import { toast } from 'sonner';
import { OndeOLoteEsteve, escolhaInicial, type ContextoDoLote } from '@/components/fechamento/OndeOLoteEsteve';
import { pastosParaGravar, uaDosItens } from '@/lib/fechamento/loteNoGrupo';
import { ehRecusaDaTravaDoP2, fraseDaTravaDoPasto, fraseValorRebanhoReaberto, lerEstadoDoP2, motivoReaberturaDoPasto, reabrirValorRebanhoJunto } from '@/lib/fechamento/travaDoP2';
import { CampoLoteDoPasto } from '@/components/fechamento/CampoLoteDoPasto';
import { AssistenteDoLote } from '@/components/lotes/AssistenteDoLote';
import { useLotesDaFazenda } from '@/hooks/useLotesDaFazenda';
import { comLoteEmTodos, comLoteNaCategoria, lotesQueSeguem, semLoteNoZerado, textoDoLoteNoCaderno } from '@/lib/lotes/loteDoPasto';
import { AbasDosPiquetes, ABA_TOTAL } from '@/components/fechamento/AbasDosPiquetes';
import { MesAnteriorDoPasto } from '@/components/fechamento/MesAnteriorDoPasto';
import {
  abasDoCard, cabecasDe, gradeDasLinhas, gradeVazia, juntarAbas, linhasParaGravar, modoDasLinhas, separarPorPiquete, usarNaGrade, SEM_PIQUETE,
  type ItemDaGrade, type LinhaDoCard, type ModoDoCard,
} from '@/lib/fechamento/porPiquetes';
import { lerMesAnteriorDoPasto, lerPiquetesDoPasto, pastoInteiroNoBanco, type Lido, type MesAnteriorDoPasto as MesAnteriorLido, type PiqueteDoPasto } from '@/lib/fechamento/piquetesDoPasto';

/** FECH-PASTO-UNIDADE-01 F2 — a prévia do "voltar a pasto inteiro" (a frase do banco vem antes) */
export const FRASE_PASTO_INTEIRO = 'As abas viram uma grade só: cabeças somadas por categoria e peso médio ponderado. Nenhuma cabeça se perde.';
export const FRASE_SALVE_ANTES = 'Salve as mudanças dos piquetes antes de voltar a pasto inteiro.';

/* FECH-MAPA-PASTO-MODAL-01 — ALTURA FIXA (o corpo nao rola): topo + grade das 9 categorias + rodape. So' o painel da
   lavoura rola dentro do proprio quadro. */
export const ALTURA_DO_MODAL_DO_PASTO = 'h-[524px]';
/** o motivo gravado em `fechamento_reaberturas_log` (a RPC acrescenta o nome do pasto) */
export const MOTIVO_REABRIR_PASTO = 'Reabertura individual via modal de pasto';

const QUALIDADE_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

// ── Regra definitiva de separação MACHOS x FÊMEAS ──
const MACHOS_CODIGOS = ['mamotes_m', 'desmama_m', 'garrotes', 'bois', 'touros'];
const FEMEAS_CODIGOS = ['mamotes_f', 'desmama_f', 'novilhas', 'vacas'];

function isMacho(codigo: string): boolean {
  return MACHOS_CODIGOS.includes(codigo);
}

interface FechamentoItem {
  categoria_id: string;
  quantidade: number;
  peso_medio_kg: number | null;
  lote: string | null;
  observacoes: string | null;
  origem_dado: string;
  /** LOTES-03 F1 — o lote cadastrado desta categoria (opcional; sem a chave o gravador mantém o que estava) */
  lote_id?: string | null;
}

// ── CategoriaCard extracted outside to prevent re-mount on parent re-render ──
interface CategoriaCardProps {
  c: CategoriaRebanho;
  idx: number;
  tabBase: number;
  quantidade: number;
  pesoMedioKg: number | null;
  origemDado: string;
  disabled: boolean;
  onUpdateQtd: (catId: string, val: number) => void;
  onUpdatePeso: (catId: string, val: number | null) => void;
}

const CategoriaCard = React.memo(function CategoriaCard({
  c, idx, tabBase, quantidade, pesoMedioKg, origemDado, disabled, onUpdateQtd, onUpdatePeso
}: CategoriaCardProps) {
  const [qtdLocal, setQtdLocal] = useState(() => quantidade > 0 ? String(quantidade) : '');
  const [pesoLocal, setPesoLocal] = useState(() =>
    pesoMedioKg != null && pesoMedioKg !== 0 ? pesoMedioKg.toFixed(2).replace('.', ',') : ''
  );
  const [qtdFocused, setQtdFocused] = useState(false);
  const [pesoFocused, setPesoFocused] = useState(false);

  // Sync from external changes (e.g. "Copiar anterior") only when not focused
  useEffect(() => {
    if (!qtdFocused) {
      setQtdLocal(quantidade > 0 ? String(quantidade) : '');
    }
  }, [quantidade, qtdFocused]);

  useEffect(() => {
    if (!pesoFocused) {
      setPesoLocal(pesoMedioKg != null && pesoMedioKg !== 0 ? pesoMedioKg.toFixed(2).replace('.', ',') : '');
    }
  }, [pesoMedioKg, pesoFocused]);

  return (
    <div className="flex flex-col items-center gap-1 min-w-0 w-full sm:w-auto" style={{ minWidth: 0 }}>
      <span className="text-[11px] font-semibold text-foreground whitespace-nowrap mb-0.5">{c.nome}</span>
      <div className="relative">
        <Input
          type="text" inputMode="numeric"
          tabIndex={tabBase + idx * 2}
          value={qtdLocal}
          onChange={e => setQtdLocal(e.target.value)}
          onFocus={() => setQtdFocused(true)}
          onBlur={() => {
            setQtdFocused(false);
            const parsed = parseInt(qtdLocal, 10);
            if (!isNaN(parsed) && parsed > 0) {
              onUpdateQtd(c.id, parsed);
              setQtdLocal(String(parsed));
            } else {
              onUpdateQtd(c.id, 0);
              setQtdLocal('');
            }
          }}
          disabled={disabled}
          className="h-8 text-xs font-bold px-1.5 text-center tabular-nums w-full sm:w-[58px]"
          placeholder="0"
        />
        {origemDado === 'copiado_mes_anterior' && (
          <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 text-[6px] h-3 px-0.5 leading-none">Cop</Badge>
        )}
      </div>
      <Input
        type="text" inputMode="decimal"
        tabIndex={tabBase + idx * 2 + 1}
        value={pesoLocal}
        onChange={e => setPesoLocal(e.target.value)}
        onFocus={() => setPesoFocused(true)}
        onBlur={() => {
          setPesoFocused(false);
          const raw = pesoLocal.replace(',', '.');
          if (raw === '' || raw.trim() === '') {
            onUpdatePeso(c.id, null);
            setPesoLocal('');
          } else {
            const parsed = parseFloat(raw);
            if (!isNaN(parsed)) {
              const valorFinal = Math.round(parsed * 100) / 100;
              onUpdatePeso(c.id, valorFinal);
              setPesoLocal(valorFinal.toFixed(2).replace('.', ','));
            } else {
              onUpdatePeso(c.id, null);
              setPesoLocal('');
            }
          }
        }}
        disabled={disabled}
        className="h-8 text-xs px-1.5 text-center tabular-nums w-full sm:w-[58px]"
        placeholder="kg"
      />
    </div>
  );
});

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pasto: Pasto;
  fechamento: FechamentoPasto;
  categorias: CategoriaRebanho[];
  onFechar: () => Promise<boolean>;
  onCopiar: () => Promise<{ itens: FechamentoItem[]; dadosMes: { lote_mes: string | null; tipo_uso_mes: string | null; qualidade_mes: number | null; observacao_mes: string | null } }>;
  /** FECH-ROTACAO-01 fatia 3 — onde o lote do card esteve (grupo, parte do grupo, também esteve em). Sem ele, o modal salva como sempre. */
  lote?: ContextoDoLote;
  /** LOTES-03 F1 — a fazenda pelo código, no cabeçalho do assistente do "+ Novo lote" */
  fazendaRotulo?: string;
}

export function FechamentoPastoDialog({
  open, onOpenChange, pasto, fechamento,
  categorias, onCopiar, lote, fazendaRotulo,
}: Props) {
  const { clienteAtual } = useCliente();
  /* LOTES-03 F1 — os lotes da fazenda (o MESMO leitor da tela de Lotes) e o assistente do "+ Novo lote" (null = fechado; categoria null =
     o lote novo vai no pasto inteiro) */
  const lotesDaFazenda = useLotesDaFazenda(open ? fechamento.fazenda_id : null, fechamento.ano_mes);
  const [novoLotePara, setNovoLotePara] = useState<{ categoriaId: string | null } | null>(null);
  const [itens, setItens] = useState<FechamentoItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(fechamento.status);

  const [loteMes, setLoteMes] = useState(fechamento.lote_mes || '');
  /* LOTES-05 — o texto do campeiro antes do "Usar o lote" (null = o botão não foi usado): "Voltar o texto" o devolve até salvar;
     depois de salvar, o antigo fica na trilha do banco (gatilho da 113220) */
  const [cadernoAntes, setCadernoAntes] = useState<string | null>(null);
  const [tipoUsoMes, setTipoUsoMes] = useState(fechamento.tipo_uso_mes || pasto.tipo_uso || '');
  const [qualidadeMes, setQualidadeMes] = useState<number | null>(fechamento.qualidade_mes);
  const [observacaoMes, setObservacaoMes] = useState(fechamento.observacao_mes || '');
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  /* FECH-P2-TRAVA-AVISO-01: o mês trava pelo Valor do Rebanho validado (ou P2 fechado). Lido ao abrir, para avisar ANTES de
     digitar; a recusa do banco com a mesma regra também liga. */
  const [travadoPeloP2, setTravadoPeloP2] = useState(false);
  /* REABRIR-AUTOMATICO-01: o gesto em curso (reabrir o Valor do Rebanho e o pasto numa ação) */
  const [reabrindoJunto, setReabrindoJunto] = useState(false);
  const qc = useQueryClient();
  /* FECH-ROTACAO-01 fatia 3 — os pastos onde o lote do card fica (o próprio sempre); começa no gravado ou no grupo inteiro (F3-2) */
  const [escolhidos, setEscolhidos] = useState<string[]>(() => (lote ? escolhaInicial(pasto.id, lote) : [pasto.id]));
  const [escolhidosIniciais, setEscolhidosIniciais] = useState('');
  /* FECH-PASTO-UNIDADE-01 F2 — pasto COM piquetes: "Pasto inteiro" (a grade de sempre, em `itens`) ou "Por piquetes" (uma grade por
     piquete em `abas`; a aba Total soma e só lê). `noBancoPorPiquetes`: o card gravado tem linha com piquete (voltar = pela RPC). */
  const [piquetes, setPiquetes] = useState<Lido<{ doMes: PiqueteDoPasto[]; nomes: Map<string, string> }> | null>(null);
  const [modo, setModo] = useState<ModoDoCard>('inteiro');
  const [abas, setAbas] = useState<Map<string, ItemDaGrade[]>>(new Map());
  const [abaAtiva, setAbaAtiva] = useState<string>(ABA_TOTAL);
  const [noBancoPorPiquetes, setNoBancoPorPiquetes] = useState(false);
  const [abasIniciais, setAbasIniciais] = useState('');
  const [mesAnterior, setMesAnterior] = useState<Lido<MesAnteriorLido> | null>(null);
  const [usadas, setUsadas] = useState<Set<number>>(new Set());
  const [previaInteiro, setPreviaInteiro] = useState<string | null>(null);
  const [voltando, setVoltando] = useState(false);
  const modoRef = useRef(modo); modoRef.current = modo;
  const abaRef = useRef(abaAtiva); abaRef.current = abaAtiva;

  const isFechado = status === 'fechado';
  /* FECH-PASTO-SALVAR-TRANSACAO-01: o modal grava e reabre so' pelas duas RPCs do card (uma transacao cada) */
  const { loadItens, salvarCardDoPasto, salvarCardComAlocacao, reabrirCardDoPasto } = useFechamento();
  const { isReadOnly: isMesReadOnly } = useMasterLock(fechamento.ano_mes);
  const masterReadOnly = isMesReadOnly(fechamento.ano_mes);
  // Inputs ficam disabled se já fechado OU se mês está bloqueado pelo master lock
  const inputsDisabled = isFechado || masterReadOnly;

  useEffect(() => {
    setStatus(fechamento.status);
  }, [fechamento]);

  // Load items + meta when modal opens
  useEffect(() => {
    if (!open || !fechamento) return;
    setErroSalvar(null); setTravadoPeloP2(false);
    const inicio = lote ? escolhaInicial(pasto.id, lote) : [pasto.id];
    setEscolhidos(inicio); setEscolhidosIniciais(inicio.join(','));
    let vivo = true;
    lerEstadoDoP2(fechamento.fazenda_id, fechamento.ano_mes).then(r => { if (vivo && r.ok) setTravadoPeloP2(r.valor.travado); });
    const blank = gradeVazia(categorias);
    setItens(blank);
    setModo('inteiro'); setAbas(new Map()); setAbaAtiva(ABA_TOTAL); setNoBancoPorPiquetes(false); setAbasIniciais('');
    setPiquetes(null); setMesAnterior(null); setUsadas(new Set()); setPreviaInteiro(null);

    /* FECH-PASTO-UNIDADE-01 F2: as linhas do card (TODAS — por piquete inclusive), os piquetes do pasto e o mês anterior saem juntos */
    Promise.all([loadItens(fechamento.id), lerPiquetesDoPasto(pasto.id, fechamento.ano_mes), lerMesAnteriorDoPasto(pasto.id, fechamento.ano_mes)]).then(async ([existing, piq, ant]) => {
      if (!vivo) return;
      let lidos = piq;
      const citados = existing.map(e => e.piquete_id).filter((x): x is string => !!x);
      if (lidos.ok && citados.some(id => !lidos.ok || !lidos.valor.nomes.has(id))) {
        lidos = await lerPiquetesDoPasto(pasto.id, fechamento.ano_mes, citados);
        if (!vivo) return;
      }
      setPiquetes(lidos); setMesAnterior(ant);
      aplicarLinhas(existing, lidos.ok ? lidos.valor.doMes.map(p => p.id) : []);
      if (existing.length > 0) {
        // Has saved data — load items + meta from DB record
        setLoteMes(fechamento.lote_mes || '');
        setCadernoAntes(null);
        setTipoUsoMes(fechamento.tipo_uso_mes || pasto.tipo_uso || '');
        setQualidadeMes(fechamento.qualidade_mes);
        setObservacaoMes(fechamento.observacao_mes || '');
      } else {
        // No saved items — pasto não iniciado → everything blank
        setLoteMes('');
        setCadernoAntes(null);
        setTipoUsoMes(fechamento.tipo_uso_mes || pasto.tipo_uso || '');
        setQualidadeMes(null);
        setObservacaoMes('');
      }
    });
    return () => { vivo = false; };
  }, [open, fechamento, categorias, loadItens]);

  /* FECH-PASTO-UNIDADE-01 F2 — as linhas lidas viram o estado: sem piquete = a grade de sempre; com piquete = uma grade por aba */
  function aplicarLinhas(linhas: readonly LinhaDoCard[], piquetesDoMes: readonly string[]) {
    const m = modoDasLinhas(linhas);
    setModo(m); setNoBancoPorPiquetes(m === 'piquetes');
    if (m === 'inteiro') {
      setItens(gradeDasLinhas(categorias, linhas)); setAbas(new Map()); setAbasIniciais(''); setAbaAtiva(ABA_TOTAL);
      return;
    }
    const lista = abasDoCard(piquetesDoMes, linhas);
    const mapa = separarPorPiquete(categorias, lista, linhas);
    setAbas(mapa); setAbasIniciais(JSON.stringify([...mapa]));
    setItens(juntarAbas(categorias, mapa.values()));
    setAbaAtiva(lista[0] ?? ABA_TOTAL);
  }

  /* a grade que se edita agora: pasto inteiro = `itens`; por piquetes = a aba aberta (a aba Total não se edita) */
  const editarGrade = useCallback((fn: (g: ItemDaGrade[]) => ItemDaGrade[]) => {
    if (modoRef.current === 'inteiro') { setItens(prev => fn(prev)); return; }
    const aba = abaRef.current;
    if (aba === ABA_TOTAL) return;
    setAbas(prev => new Map(prev).set(aba, fn(prev.get(aba) ?? gradeVazia(categorias))));
  }, [categorias]);

  const updateItem = useCallback((catId: string, field: string, value: any) => {
    editarGrade(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, [field]: value, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  }, [editarGrade]);

  const onUpdateQtd = useCallback((catId: string, val: number) => {
    editarGrade(prev => semLoteNoZerado(prev.map(item => item.categoria_id === catId
      ? { ...item, quantidade: val, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    )));
  }, [editarGrade]);

  const onUpdatePeso = useCallback((catId: string, val: number | null) => {
    editarGrade(prev => prev.map(item => item.categoria_id === catId
      ? { ...item, peso_medio_kg: val, origem_dado: item.origem_dado === 'copiado_mes_anterior' ? 'ajustado' : item.origem_dado }
      : item
    ));
  }, [editarGrade]);

  /* o card inteiro (a soma das abas, por piquetes) — totais, avisos, UA e lote do card saem daqui */
  const itensDoCard: ItemDaGrade[] = modo === 'inteiro' ? itens : juntarAbas(categorias, abas.values());
  const listaDeAbas = [...abas.keys()];
  const naAbaTotal = modo === 'piquetes' && abaAtiva === ABA_TOTAL;
  const gradeVisivel: ItemDaGrade[] = modo === 'inteiro' ? itens : naAbaTotal ? itensDoCard : (abas.get(abaAtiva) ?? gradeVazia(categorias));
  const getItem = (catId: string) => gradeVisivel.find(i => i.categoria_id === catId);
  const getDoCard = (catId: string) => itensDoCard.find(i => i.categoria_id === catId);
  const piquetesDoMes = piquetes?.ok ? piquetes.valor.doMes : [];
  const temPiquetes = piquetesDoMes.length > 0 || modo === 'piquetes' || noBancoPorPiquetes;
  const nomeDoPiquete = (id: string | null | undefined) =>
    !id ? 'Sem piquete' : (piquetes?.ok ? piquetes.valor.nomes.get(id) : undefined) ?? piquetesDoMes.find(p => p.id === id)?.nome ?? 'piquete';
  const abasMudaram = modo === 'piquetes' && noBancoPorPiquetes && JSON.stringify([...abas]) !== abasIniciais;

  /* Pasto inteiro → Por piquetes: o que está na grade vai para a 1ª aba (nada se perde; a pessoa redistribui). Por piquetes → Pasto
     inteiro: gravado por piquetes = a prévia e a gravação da `fn_fechamento_pasto_inteiro` (trilha no banco); só na tela = soma aqui. */
  const escolherModo = async (m: ModoDoCard) => {
    if (m === modo) return;
    setErroSalvar(null);
    if (m === 'piquetes') {
      const lista = abasDoCard(piquetesDoMes.map(p => p.id), []);
      const mapa = new Map<string, ItemDaGrade[]>(lista.map((id, i) => [id, i === 0 ? itens.map(x => ({ ...x })) : gradeVazia(categorias)]));
      setAbas(mapa); setAbaAtiva(lista[0] ?? ABA_TOTAL); setModo('piquetes');
      return;
    }
    if (!noBancoPorPiquetes) {
      setItens(juntarAbas(categorias, abas.values())); setAbas(new Map()); setAbaAtiva(ABA_TOTAL); setModo('inteiro');
      return;
    }
    if (abasMudaram) { setErroSalvar(FRASE_SALVE_ANTES); return; }
    const r = await pastoInteiroNoBanco(fechamento.id, true);
    if (r.ok === false) { setErroSalvar(r.motivo); return; }
    setPreviaInteiro(r.valor.frase);
  };

  const confirmarPastoInteiro = async () => {
    setVoltando(true);
    try {
      const r = await pastoInteiroNoBanco(fechamento.id, false);
      if (r.ok === false) { setErroSalvar(r.motivo); return; }
      const linhas = await loadItens(fechamento.id);
      aplicarLinhas(linhas, piquetesDoMes.map(p => p.id));
      setPreviaInteiro(null);
      toast.success('Voltou a pasto inteiro');
    } finally {
      setVoltando(false);
    }
  };

  /* o mês anterior: "Usar" uma linha (no modo de agora; por piquetes, na aba do piquete dela quando ele existe) e "Usar tudo" */
  const lotesAtivos = new Set(lotesDaFazenda.lotes.filter(l => l.situacao === 'ativo').map(l => l.id));
  /* a tabela mostra o lote que cada piquete teve; a cópia leva só o lote que segue ativo (LOTES-03, `lotesQueSeguem`) */
  const linhasDoAnterior: LinhaDoCard[] = mesAnterior?.ok ? mesAnterior.valor.linhas.map(l => ({ ...l, origem_dado: 'copiado_mes_anterior' })) : [];
  const paraCopiar = lotesQueSeguem(linhasDoAnterior, lotesAtivos);
  const abaDaLinha = (l: LinhaDoCard) => (l.piquete_id && abas.has(l.piquete_id) ? l.piquete_id : abaAtiva !== ABA_TOTAL ? abaAtiva : (listaDeAbas[0] ?? SEM_PIQUETE));
  const usarLinha = (i: number) => {
    const l = paraCopiar[i];
    if (!l) return;
    if (modo === 'inteiro') setItens(prev => usarNaGrade(prev, l));
    else { const aba = abaDaLinha(l); setAbas(prev => new Map(prev).set(aba, usarNaGrade(prev.get(aba) ?? gradeVazia(categorias), l))); }
    setUsadas(prev => new Set(prev).add(i));
  };
  const usarTudo = () => {
    if (modo === 'inteiro') setItens(juntarAbas(categorias, [paraCopiar]).map(i => (i.quantidade > 0 ? { ...i, origem_dado: 'copiado_mes_anterior' } : i)));
    else {
      const mapa = new Map<string, ItemDaGrade[]>(listaDeAbas.map(id => [id, gradeVazia(categorias)]));
      for (const l of paraCopiar) { const aba = abaDaLinha(l); mapa.set(aba, usarNaGrade(mapa.get(aba) ?? gradeVazia(categorias), l)); }
      setAbas(mapa);
    }
    setUsadas(new Set(linhasDoAnterior.map((_, i) => i)));
  };
  const rotuloDoLoteDaLinha = (l: LinhaDoCard) =>
    (l.lote_id ? lotesDaFazenda.lotes.find(x => x.id === l.lote_id)?.codigo : undefined) ?? l.lote ?? '—';

  // Snapshot of initial data for dirty-checking
  const [initialItens, setInitialItens] = useState<string>('');
  const [initialMeta, setInitialMeta] = useState<string>('');

  useEffect(() => {
    if (open) {
      // Set snapshot after items load (slight delay)
      const t = setTimeout(() => {
        setInitialItens(JSON.stringify(itens));
        setInitialMeta(JSON.stringify({ loteMes, tipoUsoMes, qualidadeMes, observacaoMes }));
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, fechamento]);

  const isDirty = () => {
    return JSON.stringify(itens) !== initialItens ||
      JSON.stringify({ loteMes, tipoUsoMes, qualidadeMes, observacaoMes }) !== initialMeta ||
      escolhidos.join(',') !== escolhidosIniciais ||
      (modo === 'piquetes' ? JSON.stringify([...abas]) !== abasIniciais : noBancoPorPiquetes);
  };

  /* FECH-MAPA-PASTO-MODAL-01 — a ordem: campos do mes -> itens. Recusa em qualquer passo PARA ali e fica escrita no modal; o toast
     "Fechamento salvo" (dos itens) so' sai se tudo gravou. MODAL-PASTO-NOME-FIXO-01 (Gabriel 07/11): o nome do pasto é cadastro e
     não se muda no lançamento do mês — renomear é só em Cadastros > Pastos. */
  const handleSave = async (jaReabriuOValor = false) => {
    setErroSalvar(null);
    try {
      setSaving(true);
      /* REABRIR-AUTOMATICO-01: card num mês com o Valor do Rebanho validado — o Salvar reabre o Valor do Rebanho na mesma ação */
      if (travadoPeloP2 && !jaReabriuOValor) {
        if (!(await reabrirValorRebanhoDoMes())) return;
        jaReabriuOValor = true;
      }
      const campos = {
        lote_mes: loteMes || null,
        tipo_uso_mes: tipoUsoMes || null,
        qualidade_mes: qualidadeMes,
        observacao_mes: observacaoMes || null,
      };
      /* FECH-PASTO-UNIDADE-01 F2: por piquetes, cada aba vai com o piquete dela; pasto inteiro, as linhas sem piquete */
      const linhas = linhasParaGravar(modo, itens, abas);
      /* FECH-ROTACAO-01 fatia 3 (F3-3): com o contexto do lote, o card e onde o lote esteve vão numa transação só */
      const r = lote
        ? await salvarCardComAlocacao(fechamento.id, campos, linhas, pastosParaGravar({
            pastoId: pasto.id, escolhidos, temCabeca: itensDoCard.some(i => i.quantidade > 0), temGrupo: lote.membros.length > 1, gravada: lote.gravada,
          }))
        : await salvarCardDoPasto(fechamento.id, campos, linhas);
      if (!r.ok) {
        if (ehRecusaDaTravaDoP2(r.erro) && !jaReabriuOValor) {
          setSaving(false);
          if (await reabrirValorRebanhoDoMes()) await handleSave(true);
          else setTravadoPeloP2(true);
          return;
        }
        setErroSalvar(r.erro); return;
      }
      toast.success('Fechamento salvo');
      /* ROTACAO-LISTA-01 — o que o salvar mudou nos pastos de "Também esteve em" (vedado que passou à atividade, fechado que reabriu): 1 linha */
      const aviso = 'aviso' in r && typeof r.aviso === 'string' ? r.aviso : null;
      if (aviso) toast.info(aviso);
      /* FECH-REVALIDAR-AVISO-01 (Gabriel 04/11): o "revalide o Valor do Rebanho" NÃO é aviso a cada Salvar (empilhava dezenas). A pendência
         é UM estado: o item da Visão Geral (`useValorRebanhoARevalidar`) e a faixa da tela do Valor do Rebanho; some ao revalidar. */
      // Não fechar o pasto aqui. O fechamento oficial ocorre via "Fechar Mês".
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCopiar = async () => {
    const { itens: copied, dadosMes } = await onCopiar();
    /* LOTES-03: o lote do mês anterior segue só se ele ainda está ativo na fazenda */
    setItens(lotesQueSeguem(copied, new Set(lotesDaFazenda.lotes.filter(l => l.situacao === 'ativo').map(l => l.id))));
    if (dadosMes.lote_mes) setLoteMes(dadosMes.lote_mes);
    if (dadosMes.tipo_uso_mes) setTipoUsoMes(dadosMes.tipo_uso_mes);
    if (dadosMes.qualidade_mes !== null) setQualidadeMes(dadosMes.qualidade_mes);
    if (dadosMes.observacao_mes) setObservacaoMes(dadosMes.observacao_mes);
  };

  const handleReabrir = async (jaReabriuOValor = false) => {
    setErroSalvar(null);
    const r = await reabrirCardDoPasto(fechamento.id, MOTIVO_REABRIR_PASTO);
    if (!r.ok) {
      /* REABRIR-AUTOMATICO-01: a trava que a abertura não leu (validaram no meio) reabre o Valor do Rebanho e tenta UMA vez de novo */
      if (ehRecusaDaTravaDoP2(r.erro) && !jaReabriuOValor) {
        if (await reabrirValorRebanhoDoMes()) await handleReabrir(true);
        else setTravadoPeloP2(true);
        return;
      }
      setErroSalvar(r.erro); return;
    }
    /* REABRIR-AUTOMATICO-01: com o Valor do Rebanho reaberto na mesma ação, o aviso é UMA linha (a dele) */
    if (!jaReabriuOValor) toast.success('Pasto reaberto');
    setStatus('rascunho');
  };

  /* REABRIR-AUTOMATICO-01 (Gabriel 08/11 08:15) — o "Reabrir pasto" (e o Salvar de um card num mês travado) reabre o Valor do Rebanho do
     mês NA MESMA AÇÃO: motivo automático, sem pergunta. O que o banco devolve manda: recusou, ou o mês SEGUE travado (ex.: outro P2
     fechado) → a frase no rodapé e nada se libera. Devolve se o mês ficou livre. */
  const reabrirValorRebanhoDoMes = async (): Promise<boolean> => {
    const r = await reabrirValorRebanhoJunto(fechamento.fazenda_id, fechamento.ano_mes, motivoReaberturaDoPasto(pasto.nome));
    if (r.ok === false) { setErroSalvar(r.motivo); return false; }
    const p2 = await lerEstadoDoP2(fechamento.fazenda_id, fechamento.ano_mes);
    if (p2.ok === false) { setErroSalvar(p2.motivo); return false; }
    if (p2.valor.travado) { setErroSalvar(fraseDaTravaDoPasto(fechamento.ano_mes)); return false; }
    setTravadoPeloP2(false);
    toast.success(fraseValorRebanhoReaberto(fechamento.ano_mes));
    /* FECH-FAIXA-01: a faixa do mês relê na hora (o ② passa a "aberto") */
    void qc.invalidateQueries({ queryKey: [CHAVE_DA_FAIXA] });
    return true;
  };

  const handleReabrirPasto = async () => {
    setErroSalvar(null);
    setReabrindoJunto(true);
    try {
      const comOValor = travadoPeloP2;
      if (comOValor && !(await reabrirValorRebanhoDoMes())) return;
      await handleReabrir(comOValor);
    } finally {
      setReabrindoJunto(false);
    }
  };

  const [cancelAlertOpen, setCancelAlertOpen] = useState(false);

  const handleCancel = () => {
    if (isDirty()) {
      setCancelAlertOpen(true);
    } else {
      onOpenChange(false);
    }
  };

  // ── Cálculos ──
  const total = itensDoCard.reduce((s, i) => s + (i.quantidade || 0), 0);
  const pesoTotalEstoque = itensDoCard.reduce((s, i) => s + (i.quantidade || 0) * (i.peso_medio_kg || 0), 0);
  const pesoMedioPonderado = total > 0 ? pesoTotalEstoque / total : 0;
  const uaTotal = itensDoCard.reduce((s, i) => s + calcUA(i.quantidade, i.peso_medio_kg), 0);
  const uaHa = pasto.area_produtiva_ha && uaTotal > 0 ? uaTotal / pasto.area_produtiva_ha : null;
  /* FECH-PASTO-UNIDADE-01 F2 — o subtotal da aba (área do piquete · cab) e o do pasto (a aba Total: área, cab e lotação do PASTO) */
  const piqueteAberto = piquetesDoMes.find(p => p.id === abaAtiva);
  const subtotalDaAba = `${nomeDoPiquete(abaAtiva)} · ${piqueteAberto?.area_ha ? `${formatNum(piqueteAberto.area_ha, 1)} ha · ` : ''}${formatNum(cabecasDe(gradeVisivel), 0)} cab`;
  const subtotalDoPasto = `${pasto.nome} · ${pasto.area_produtiva_ha ? `${formatNum(pasto.area_produtiva_ha, 1)} ha · ` : ''}${formatNum(total, 0)} cab${uaHa ? ` · ${formatNum(uaHa, 2)} UA/ha` : ''}`;

  // ── Separação por grupo ──
  const catsMachos = categorias.filter(c => isMacho(c.codigo));
  const catsFemeas = categorias.filter(c => !isMacho(c.codigo));

  const totalMachos = catsMachos.reduce((s, c) => s + (getDoCard(c.id)?.quantidade || 0), 0);
  const totalFemeas = catsFemeas.reduce((s, c) => s + (getDoCard(c.id)?.quantidade || 0), 0);

  const exigeRebanho = (TIPOS_USO_EXIGEM_REBANHO as readonly string[]).includes(tipoUsoMes);
  /**
   * O PASTO DE LAVOURA NÃO RESPONDE PERGUNTA DE GADO — AGRI-AREA-PLANTADA-01.
   *
   * ⚠ A PERGUNTA É PELO GRUPO, não pelo texto: `grupoDoTipoUso` é a fonte única, e é ela que
   * sabe que `agricultura` é lavoura e que `eucalipto` é SILVICULTURA — família própria desde
   * 19/08/2026, que terá a porta dela e não entra por esta.
   * ⚠ E O QUE MANDA É O `tipo_uso_mes`, o mesmo que o resto do modal usa: reclassificar o mês
   * para Agricultura troca o painel na hora, sem precisar salvar antes.
   */
  const ehLavoura = grupoDoTipoUso(tipoUsoMes) === 'agricultura';
  const isDivergencia = pasto.tipo_uso === 'divergencia' || tipoUsoMes === 'divergencia';
  const itensComQtd = itensDoCard.filter(i => i.quantidade > 0).map(item => ({ ...item, cat: categorias.find(c => c.id === item.categoria_id) }));

  const avisos: string[] = [];
  if (total === 0 && exigeRebanho) avisos.push('Nenhum animal informado');
  if (total === 0 && !exigeRebanho && !isDivergencia) avisos.push('Pasto sem rebanho (conforme tipo de uso selecionado)');
  if (itensComQtd.length > 0 && itensComQtd.some(i => !i.peso_medio_kg)) avisos.push('Peso médio não informado em alguma categoria');
  if (!qualidadeMes && !isDivergencia) avisos.push('Qualidade do pasto não preenchida');

  const podeFechar = isDivergencia
    ? true
    : exigeRebanho
    ? total > 0 && itensComQtd.some(i => i.peso_medio_kg)
    : true;
  const tipoUsoLabel = labelDoTipoUso(tipoUsoMes);

  // CategoriaCard is defined outside the component to avoid re-mount on parent re-render

  // ── Render de um grupo (machos ou fêmeas) ──
  const textoDoLote = textoDoLoteNoCaderno(itens, lotesDaFazenda.lotes);

  const renderGrupo = (label: string, cats: CategoriaRebanho[], colorAccent: string, tabBase: number) => (
    <div>
      <div className={`text-xs font-bold mb-2 ${colorAccent}`}>{label}</div>
      <div className="flex items-start gap-2 sm:gap-4 pl-2 sm:pl-8">
        <div className="flex flex-col pt-[22px] gap-1 shrink-0 w-[34px] sm:w-[40px]">
          <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground h-8 flex items-center">Qtde</span>
          <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground h-8 flex items-center">Peso</span>
        </div>
        <div className="grid grid-cols-3 gap-x-2 gap-y-2 sm:flex sm:gap-4 sm:flex-wrap flex-1 min-w-0">
          {cats.map((c, idx) => {
            const item = getItem(c.id);
            return (
              <CategoriaCard
                key={c.id}
                c={c}
                idx={idx}
                tabBase={tabBase}
                quantidade={item?.quantidade || 0}
                pesoMedioKg={item?.peso_medio_kg ?? null}
                origemDado={item?.origem_dado || 'manual'}
                disabled={inputsDisabled || naAbaTotal}
                onUpdateQtd={onUpdateQtd}
                onUpdatePeso={onUpdatePeso}
              />
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ALTURA_DO_MODAL_DO_PASTO} flex flex-col max-w-3xl p-0 gap-0 overflow-hidden`} data-testid="modal-do-pasto">
        {/* ── HEADER ESCURO ── */}
        <div className="shrink-0 bg-[hsl(215,30%,18%)] text-white px-5 pt-4 pb-3 space-y-2">
          {/* Row 1: Name + status + copy — `pr-7` é o lugar do X de fechar (MODAL-PASTO-NOME-FIXO-01: sem a nota do nome a linha baixou e o "Copiar anterior" ia para baixo dele) */}
          <div className="flex items-center gap-2 pr-7">
            {/* MODAL-PASTO-NOME-FIXO-01: o nome é do cadastro — só texto, sem campo (renomear: Cadastros > Pastos) */}
            <h2 className="min-w-0 break-words text-lg font-extrabold leading-8 tracking-tight" data-testid="nome-do-pasto">{pasto.nome}</h2>
            {pasto.area_produtiva_ha ? <span className="flex-none whitespace-nowrap text-base font-medium tabular-nums text-white/70" data-testid="area-do-pasto">{formatNum(pasto.area_produtiva_ha, 1)} ha</span> : null}
            {isFechado && <Badge className="h-5 text-[10px] px-1.5 bg-white/15 text-white border-white/20"><Lock className="h-3 w-3 mr-0.5" />Fechado</Badge>}
            <div className="flex-1" />
            {/* FECH-PASTO-UNIDADE-01 F2: no pasto com piquetes, o mês anterior somado (com o lote de cada piquete) no lugar do "Copiar anterior" */}
            {!isFechado && !masterReadOnly && temPiquetes && !ehLavoura ? (
              <MesAnteriorDoPasto anoMes={mesAnterior?.ok ? mesAnterior.valor.anoMes : fechamento.ano_mes} linhas={linhasDoAnterior}
                erro={mesAnterior && mesAnterior.ok === false ? mesAnterior.motivo : null} nomeDoPasto={pasto.nome}
                nomeDoPiquete={nomeDoPiquete} nomeDaCategoria={id => categorias.find(c => c.id === id)?.nome ?? '—'} rotuloDoLote={rotuloDoLoteDaLinha}
                usadas={usadas} onUsar={usarLinha} onUsarTudo={usarTudo} disabled={inputsDisabled || naAbaTotal} />
            ) : !isFechado && !masterReadOnly && (
              <Button variant="ghost" size="sm" onClick={handleCopiar} className="h-6 text-[10px] text-white/70 hover:text-white hover:bg-white/10 px-2 gap-1">
                <Copy className="h-3 w-3" />Copiar anterior
              </Button>
            )}
          </div>

          {/* Row 2: Lote + Qual + Tipo Uso + Obs */}
          <div className="flex gap-2 items-end">
            <div className="flex-1 min-w-0 max-w-[150px]">
              <div className="flex items-baseline justify-between gap-1">
                <Label className="whitespace-nowrap text-[10px] text-white/50 leading-none">Nome no caderno</Label>
                {cadernoAntes !== null ? (
                  <button type="button" disabled={inputsDisabled} data-testid="caderno-voltar-texto" title={cadernoAntes ? `Voltar para "${cadernoAntes}"` : 'Voltar para o campo vazio'}
                    onClick={() => { setLoteMes(cadernoAntes); setCadernoAntes(null); }}
                    className="whitespace-nowrap text-[10px] leading-none text-white/70 underline-offset-2 hover:text-white hover:underline disabled:opacity-50">Voltar o texto</button>
                ) : textoDoLote && textoDoLote !== loteMes.trim() ? (
                  <button type="button" disabled={inputsDisabled} data-testid="caderno-usar-o-lote" title={`Troca o texto do campeiro por "${textoDoLote}". O texto antigo fica na trilha.`}
                    onClick={() => { setCadernoAntes(loteMes); setLoteMes(textoDoLote); }}
                    className="whitespace-nowrap text-[10px] leading-none text-white/70 underline-offset-2 hover:text-white hover:underline disabled:opacity-50">Usar o lote</button>
                ) : null}
              </div>
              <Input value={loteMes} onChange={e => { setLoteMes(e.target.value); setCadernoAntes(null); }} disabled={inputsDisabled} placeholder="Lote..." className="h-7 text-xs px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30" />
            </div>
            {/* LOTES-03 F1 — o lote cadastrado (por categoria); fora da lavoura e da conta de divergência */}
            {!ehLavoura && !isDivergencia && (
              <div className="w-[150px] shrink-0">
                <Label className="text-[10px] text-white/50 leading-none">Lote</Label>
                <CampoLoteDoPasto itens={gradeVisivel} lotes={lotesDaFazenda.lotes} disabled={inputsDisabled || naAbaTotal}
                  nomeDaCategoria={id => categorias.find(c => c.id === id)?.nome ?? '—'}
                  onChange={novos => {
                    editarGrade(() => novos);
                    const ids = new Set(novos.flatMap(i => (i.quantidade > 0 && i.lote_id ? [i.lote_id] : [])));
                    const unico = ids.size === 1 ? lotesDaFazenda.lotes.find(l => ids.has(l.id)) : undefined;
                    if (!loteMes && unico?.nomeCampeiro) setLoteMes(unico.nomeCampeiro);
                  }}
                  onNovoLote={categoriaId => setNovoLotePara({ categoriaId })} />
              </div>
            )}
            <div className="w-12 shrink-0">
              <Label className="text-[10px] text-white/50 leading-none">Qual.</Label>
              <Select value={qualidadeMes?.toString() || 'none'} onValueChange={v => setQualidadeMes(v === 'none' ? null : Number(v))} disabled={inputsDisabled}>
                <SelectTrigger className="h-7 text-xs px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {QUALIDADE_OPTIONS.map(q => <SelectItem key={q} value={q.toString()}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-[130px] shrink-0">
              <Label className="text-[10px] text-white/50 leading-none">Tipo Uso</Label>
              <Select value={tipoUsoMes} onValueChange={setTipoUsoMes} disabled={inputsDisabled}>
                <SelectTrigger className="h-7 text-xs px-1.5 bg-white/10 border-white/15 text-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_USO_OPTIONS_AGRUPADAS.map(g => (
                    <SelectGroup key={g.grupo}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.options.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Label className="text-[10px] text-white/50 leading-none">
                {isDivergencia ? 'Obs. da divergência' : 'Obs.'}
              </Label>
              {/* Observação permanece editável mesmo em mês locked (regra: exceto observacao_mes) */}
              <Input
                value={observacaoMes}
                onChange={e => setObservacaoMes(e.target.value)}
                disabled={isFechado}
                placeholder={isDivergencia ? 'Observação (opcional)' : 'Observação...'}
                className={`h-7 text-xs px-2 bg-white/10 border-white/15 text-white placeholder:text-white/30 ${
                  ''
                }`}
              />
            </div>
          </div>

          {/* Row 3: Resumo
              ⚠ NA LAVOURA O RESUMO DE GADO SOME INTEIRO — AGRI-AREA-PLANTADA-01. "Machos: 0 ·
              Fêmeas: 0 · Total: 0 cab" num talhão de amendoim não é um zero informativo: é uma
              pergunta errada respondida com um número que parece dado. A área plantada, que é
              o que importa ali, o painel de baixo mostra ao lado da área do pasto. */}
          {ehLavoura ? (
            <div className="flex items-center gap-3 rounded bg-white/8 px-3 py-2 text-xs">
              <span className="text-white/50 font-medium">Lavoura</span>
              <div className="h-3 w-px bg-white/15" />
              <span className="text-white/70">Área e culturas da safra abaixo</span>
            </div>
          ) : (
          <div className="flex items-center gap-3 rounded bg-white/8 px-3 py-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Machos:</span>
              <span className="font-bold tabular-nums">{totalMachos}</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Fêmeas:</span>
              <span className="font-bold tabular-nums">{totalFemeas}</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Total:</span>
              <span className="font-extrabold tabular-nums text-[12px]">{total} cab</span>
            </div>
            <div className="h-3 w-px bg-white/15" />
            <div className="flex items-center gap-1">
              <span className="text-white/50 font-medium">Peso médio:</span>
              <span className="font-bold tabular-nums">{pesoMedioPonderado > 0 ? `${formatNum(pesoMedioPonderado, 1)} kg` : '—'}</span>
            </div>
            {pesoTotalEstoque > 0 && (
              <>
                <div className="h-3 w-px bg-white/15" />
                <div className="flex items-center gap-1">
                  <span className="text-white/50 font-medium">Peso total:</span>
                  <span className="font-bold tabular-nums">{formatNum(pesoTotalEstoque, 0)} kg</span>
                </div>
              </>
            )}
          </div>
          )}
        </div>

        {/* ── GRADE PRINCIPAL ── */}
        <div className="flex-1 min-h-0 overflow-hidden px-5 py-3 space-y-4 bg-background" data-testid="corpo-do-pasto">
          {/* lugar FIXO de 22px para o aviso da trava master (vazio quando nao ha'): nada muda de altura */}
          {/* REABRIR-AUTOMATICO-01: a linha da trava do P2 acima do rodapé saiu, então este lugar fica SEMPRE (antes ele sumia com a trava
              para compensar a linha; sem ela, o corpo pulava 38px ao reabrir) */}
          {/* FECH-PASTO-UNIDADE-01 F2: no pasto com piquetes, "Pasto inteiro | Por piquetes" e as abas moram NESTE lugar fixo (a grade não perde
              altura); a trava master, quando há, fica à direita na mesma linha */}
          <div className="flex h-[22px] items-center gap-2" data-testid="lugar-trava-master">
            {temPiquetes && !ehLavoura && (
              <AbasDosPiquetes modo={modo} onModo={escolherModo} ativa={abaAtiva} onAba={setAbaAtiva}
                abas={listaDeAbas.map(id => ({ id, nome: nomeDoPiquete(id) }))}
                subtotal={naAbaTotal ? subtotalDoPasto : subtotalDaAba}
                disabled={inputsDisabled || voltando} tituloDoModo={abasMudaram ? FRASE_SALVE_ANTES : undefined} />
            )}
            <MasterLockBanner anoMes={fechamento.ano_mes} compacto />
          </div>
          {ehLavoura ? (
            /* ⚠ O PAINEL SUBSTITUI A GRADE, não convive com ela: as categorias de gado não são
               "opcionais" num talhão de amendoim — são a pergunta errada. Deixá-las abaixo
               ensinaria que existe rebanho a informar. */
            <div className="h-full overflow-y-auto" data-testid="quadro-lavoura">
            <AreaPlantadaPanel
              clienteId={clienteAtual?.id ?? null}
              pastoId={pasto.id}
              pastoNome={pasto.nome}
              areaProdutivaHa={pasto.area_produtiva_ha ?? null}
              /* ⚠ O MÊS ENTRA SÓ PARA ACHAR A SAFRA — AGRI-AREA-POR-SAFRA-01. A área plantada
                 continua sem mês nenhum no banco; o que a competência responde é "qual safra
                 cobre este mês", e é por isso que abrir novembro mostra o que foi cadastrado
                 em outubro: é a mesma safra, o mesmo dado. */
              anoMes={fechamento.ano_mes}
              somenteLeitura={inputsDisabled}
            />
            </div>
          ) : (
            <>
              {renderGrupo('Machos', catsMachos, 'text-blue-600 dark:text-blue-400', 100)}
              {renderGrupo('Fêmeas', catsFemeas, 'text-pink-600 dark:text-pink-400', 200)}
            </>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div className="shrink-0 border-t bg-muted/30 px-4 py-1.5 flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {/* Na lavoura o rodapé não conta cabeças — o painel tem o Salvar dele, e o total
                que interessa (hectares) fica ao lado da área do pasto, onde se confere. */}
            <span className="font-medium">{ehLavoura ? 'Lavoura' : 'Total:'}</span>
            {!ehLavoura && <span className="font-extrabold text-foreground tabular-nums text-sm">{total} cab</span>}
            {pesoMedioPonderado > 0 && (
              <>
                <span>·</span>
                <span className="font-semibold tabular-nums">{formatNum(pesoMedioPonderado, 1)} kg</span>
              </>
            )}
          </div>
          {lote && !ehLavoura && total > 0 && (
            <OndeOLoteEsteve pasto={lote.proprio} contexto={lote} escolhidos={escolhidos} onChange={setEscolhidos}
              uaDoCard={uaDosItens(itensDoCard)} disabled={inputsDisabled} atividadeDoMes={labelDoTipoUso(tipoUsoMes)} />
          )}
          <div className="flex-1" />
          {/* a recusa do banco (ex.: P2 validado) fica escrita aqui, nunca so' em toast */}
          <span className="min-w-0 max-w-[360px] truncate text-[11px] font-medium text-red-600" title={erroSalvar ?? undefined} data-testid="erro-do-pasto">
            {erroSalvar}
          </span>
          {!isFechado ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[11px] px-4" onClick={handleCancel}>
                Cancelar
              </Button>
              {/* REABRIR-AUTOMATICO-01: com o mês travado o Salvar reabre o Valor do Rebanho junto (o title diz) */}
              <Button onClick={() => { void handleSave(); }} disabled={saving || reabrindoJunto || masterReadOnly} size="sm" className="h-7 text-[11px] px-4"
                title={travadoPeloP2 ? fraseValorRebanhoReaberto(fechamento.ano_mes) : undefined}>
                <Save className="h-3 w-3 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => { void handleReabrirPasto(); }} disabled={masterReadOnly || reabrindoJunto} size="sm" className="h-7 text-[11px] px-4"
              title={travadoPeloP2 ? fraseValorRebanhoReaberto(fechamento.ano_mes) : undefined} data-testid="reabrir-pasto">
              <LockOpen className="h-3 w-3 mr-1" />{reabrindoJunto ? 'Reabrindo…' : 'Reabrir pasto'}
            </Button>
          )}
        </div>

        {/* FECH-PASTO-UNIDADE-01 F2 — voltar a pasto inteiro: a prévia do banco antes de gravar (trilha na `fn_fechamento_pasto_inteiro`) */}
        <AlertDialog open={previaInteiro !== null} onOpenChange={o => { if (!o && !voltando) setPreviaInteiro(null); }}>
          <AlertDialogContent className="max-w-sm" data-testid="previa-pasto-inteiro">
            <AlertDialogHeader>
              <AlertDialogTitle>Voltar a pasto inteiro?</AlertDialogTitle>
              <AlertDialogDescription>{previaInteiro} {FRASE_PASTO_INTEIRO}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={voltando}>Voltar</AlertDialogCancel>
              <AlertDialogAction disabled={voltando} onClick={e => { e.preventDefault(); void confirmarPastoInteiro(); }} data-testid="confirmar-pasto-inteiro">
                {voltando ? 'Gravando...' : 'Confirmar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Cancel with unsaved changes alert ── */}
        <AlertDialog open={cancelAlertOpen} onOpenChange={setCancelAlertOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar sem salvar?</AlertDialogTitle>
              <AlertDialogDescription>Existem alterações não salvas. Deseja fechar e perder as alterações?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={() => onOpenChange(false)} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Fechar sem salvar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {/* LOTES-03 F1 — "+ Novo lote" do campo Lote: o MESMO assistente da tela de Lotes; volta com o lote escolhido no item */}
        {novoLotePara && clienteAtual && (
          <AssistenteDoLote open clienteId={clienteAtual.id} fazendaId={fechamento.fazenda_id}
            fazendaRotulo={fazendaRotulo ?? ''}
            lotesDaFazenda={lotesDaFazenda.lotes} editar={null}
            onFechar={() => setNovoLotePara(null)}
            onPronto={r => {
              const para = novoLotePara.categoriaId;
              editarGrade(prev => (para ? comLoteNaCategoria(prev, para, r.id) : comLoteEmTodos(prev, r.id)));
              setNovoLotePara(null);
              lotesDaFazenda.recarregar();
            }} />
        )}
      </DialogContent>
    </Dialog>
  );
}
