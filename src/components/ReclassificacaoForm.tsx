import { useState, useMemo, useEffect } from 'react';
import { CATEGORIAS, Categoria, Lancamento, kgToArrobas } from '@/types/cattle';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { useIntegerInput, useDecimalInput, parseDecimalInput } from '@/hooks/useFormattedNumber';
import { RefreshCw, ArrowRight, Scale } from 'lucide-react';
import { STATUS_LABEL, META_VISUAL, type StatusOperacional } from '@/lib/statusOperacional';
import { usePermissions } from '@/hooks/usePermissions';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { ReclassificacaoResumoPanel } from './ReclassificacaoResumoPanel';

interface Props {
  onAdicionar: (l: Omit<Lancamento, 'id'>) => Promise<string | undefined> | void;
  dataInicial?: string;
  /**
   * ⚠ FALSE NA EDIÇÃO, E ISSO NÃO É DETALHE. A sugestão existe para preencher um campo VAZIO; num
   * lançamento já gravado ela chegaria depois da hidratação e trocaria o peso salvo pelo do mês —
   * visto na tela em 24/09, um registro de 450,00 kg reabriu com 144,65. Formulário que reabre e
   * reescreve é a mesma armadilha da carga de mandioca.
   */
  autoSugerir?: boolean;
}

type StatusOpcao = 'realizado' | 'meta';

const STATUS_DESCRIPTIONS: Record<StatusOpcao, string> = {
  realizado: 'Operação concluída. Impacta rebanho e financeiro.',
  meta: META_VISUAL.description,
};

const STATUS_BUTTONS: { value: StatusOpcao; label: string; dot: string; activeBorder: string; activeBg: string }[] = [
  { value: 'realizado', label: STATUS_LABEL.realizado, dot: 'bg-green-600', activeBorder: 'border-green-400', activeBg: 'bg-green-50 dark:bg-green-950/30' },
  { value: 'meta', label: META_VISUAL.label, dot: META_VISUAL.dot, activeBorder: META_VISUAL.activeBorder, activeBg: META_VISUAL.activeBg },
];

// ── Form Fields Component ──

interface FormFieldsProps {
  state: ReturnType<typeof useReclassificacaoState>;
  hideStatus?: boolean;
}

export function ReclassificacaoFormFields(props: FormFieldsProps) {
  const { state, hideStatus } = props;
  const {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    qtdInput, pesoInput,
    statusOp, setStatusOp,
    origemInfo, setPesoKg, pesoAutoFilled, setPesoAutoFilled,
    motivoBloqueio,
  } = state;

  const isMeta = statusOp === 'meta';
  const borderAccent = isMeta ? 'border-orange-400' : '';
  const { canEditMeta } = usePermissions();

  const fmtNum = (v: number | null, dec = 1) =>
    v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

  return (
    <div className="bg-card rounded-md border shadow-sm p-3 space-y-2 self-start">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <div className="flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-[12px] font-bold text-foreground">Evolução de Categoria</span>
        </div>
      </div>

      {/* Status selector – Realizado / META */}
      {!hideStatus && (
      <div className="space-y-1">
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status da Operação</Label>
        <div className="grid grid-cols-2 gap-1">
          {STATUS_BUTTONS.map(s => {
            const selected = statusOp === s.value;
            const disabled = s.value === 'meta' && !canEditMeta;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => !disabled && setStatusOp(s.value)}
                disabled={disabled}
                className={`flex items-center justify-center gap-1 h-6 rounded-md border transition-all ${
                  disabled ? 'opacity-40 cursor-not-allowed border-border bg-muted/10' :
                  selected ? `${s.activeBg} ${s.activeBorder}` : 'border-border bg-muted/10 hover:bg-muted/30'
                }`}
                title={disabled ? 'Somente consultores podem criar registros META' : undefined}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selected ? s.dot : 'border border-muted-foreground/40 bg-transparent'}`} />
                <span className={`text-[10px] font-bold ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
        <div className={`rounded-md border px-2 py-1 text-[9px] leading-snug ${
          statusOp === 'realizado' ? 'bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300'
          : 'bg-orange-50 dark:bg-orange-950/20 border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300'
        }`}>
          {STATUS_DESCRIPTIONS[statusOp]}
        </div>
      </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
        <div>
          <Label className="text-[10px] font-semibold">Origem</Label>
          <Select value={categoriaOrigem} onValueChange={v => setCategoriaOrigem(v as Categoria)}>
            <SelectTrigger className={`h-7 text-[11px] ${borderAccent}`}><SelectValue placeholder="Categoria..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value} className="py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-center pt-4">
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div>
          <Label className="text-[10px] font-semibold">Destino</Label>
          <Select value={categoriaDestino} onValueChange={v => setCategoriaDestino(v as Categoria)}>
            <SelectTrigger className={`h-7 text-[11px] ${borderAccent}`}><SelectValue placeholder="Categoria..." /></SelectTrigger>
            <SelectContent className="max-h-52 overflow-y-auto">
              {CATEGORIAS.filter(c => c.value !== categoriaOrigem).map(c => <SelectItem key={c.value} value={c.value} className="py-1.5">{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-[2fr_1fr_1fr] gap-2 items-end">
        <div>
          <Label className="text-[10px] font-semibold">Data</Label>
          <DatePicker value={data} onChange={setData} className={`h-7 text-[11px] ${borderAccent}`} />
        </div>
        <div>
          <Label className="text-[10px] font-semibold">Qtd. Cab.</Label>
          <Input type="text" inputMode="numeric" value={qtdInput.displayValue} onChange={qtdInput.onChange} onBlur={qtdInput.onBlur} onFocus={qtdInput.onFocus} placeholder="0" className={`h-7 text-[11px] text-right font-bold tabular-nums ${borderAccent}`} />
        </div>
        <div className="relative">
          <Label className="text-[10px] font-semibold">
            Peso médio (kg) <span className="text-destructive">*</span>
          </Label>
          {/* ⚠ SUGERIDO SE DESTACA ATE' O OPERADOR TOCAR: fundo âmbar enquanto `pesoAutoFilled`.
              Sem a marca, um número que a tela escreveu e um que o operador digitou ficam iguais —
              e é justamente essa diferença que ele precisa ver antes de aceitar. */}
          <Input type="text" inputMode="decimal" value={pesoInput.displayValue}
            onChange={(e) => { pesoInput.onChange(e); setPesoAutoFilled(false); }}
            onBlur={pesoInput.onBlur} onFocus={pesoInput.onFocus} placeholder="0,00"
            className={`h-7 text-[11px] text-right tabular-nums ${borderAccent} ${
              pesoAutoFilled && pesoInput.displayValue
                ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                : ''}`} />
          {origemInfo && (
            <button
              type="button"
              onClick={() => { setPesoKg(String(origemInfo.pesoMedioKg)); setPesoAutoFilled(true); }}
              title={`Sugerir o peso do rebanho no mês: ${fmtNum(origemInfo.pesoMedioKg)} kg`}
              className="absolute right-1 top-5 p-0.5 rounded-sm hover:bg-muted transition"
            >
              <Scale className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* ⚠ O MOTIVO FICA ESCRITO AO LADO, nunca só no `disabled`: botão apagado sem explicação faz
          o operador clicar de novo. Fonte única — o mesmo `motivoBloqueio` desabilita o Registrar. */}
      {motivoBloqueio && (
        <p className="text-[10px] text-destructive leading-snug">{motivoBloqueio}</p>
      )}
      {!motivoBloqueio && pesoAutoFilled && pesoInput.displayValue && (
        <p className="text-[10px] text-amber-700 dark:text-amber-500 leading-snug">
          Peso sugerido pelo rebanho do mês — confira antes de registrar.
        </p>
      )}
    </div>
  );
}

// ── Hook ──

export function useReclassificacaoState({ onAdicionar, dataInicial, autoSugerir = true }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('garrotes');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('bois');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  useEffect(() => {
    if (dataInicial) setData(dataInicial);
  }, [dataInicial]);
  const [quantidade, setQuantidade] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [pesoAutoFilled, setPesoAutoFilled] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOpcao>('realizado');

  const qtdInput = useIntegerInput(quantidade, setQuantidade);
  const pesoInput = useDecimalInput(pesoKg, setPesoKg, 2);

  /* O ano sai da DATA escolhida, não de uma prop: é o mês da data que decide o peso sugerido. */
  const anoDaData = Number(data?.slice(0, 4)) || new Date().getFullYear();

  /**
   * O PESO SUGERIDO É O DO REBANHO NO MÊS, não o dos lançamentos — RECLASS-PESO-01.
   *
   * ⚠ A VERSÃO ANTERIOR ERRAVA ATÉ 381 %, e foi medida antes de morrer: ela fazia a média de
   * `pesoMedioKg` sobre os LANÇAMENTOS da categoria (vendas, compras, nascimentos, mortes) e
   * ignorava o mês. Em ago/25 sugeria 147,2 kg para os `mamotes_m` da Pureza, que pesavam 30,6 —
   * cinco vezes o animal. Nos adultos errava menos e por isso passava despercebida: bois do
   * Agnaldo 510,5 contra 365,6 (+40 %), novilhas da Vera 361,5 contra 454,6 (−21 %).
   *
   * ⚠ E ELA NÃO PODIA SOBREVIVER COMO FALLBACK. Enquanto o peso era opcional, uma sugestão ruim
   * era só ruído — o operador apagava. Com o campo OBRIGATÓRIO ela vira afirmação: valor sugerido
   * é valor aceito. E o RECLASS-PESO-BACKFILL-01 provou que o peso da reclassificação entra
   * inteiro em `producao_biologica`, então o erro não pararia na tela.
   *
   * ⚠ SEM DADO NO MÊS, CAMPO VAZIO: não há segunda fonte a tentar. Reclassificar uma categoria
   * que o rebanho não conhece naquele mês é pergunta para o operador, não para a tela.
   */
  const { rawCategorias } = useRebanhoOficial({ ano: anoDaData, cenario: 'realizado' });

  const origemInfo = useMemo(() => {
    const mes = Number(data?.slice(5, 7));
    if (!Number.isFinite(mes)) return null;
    const linhas = (rawCategorias || []).filter(
      (r: { mes: number; categoria_codigo: string }) =>
        r.mes === mes && r.categoria_codigo === categoriaOrigem,
    );
    if (linhas.length === 0) return null;
    /* Várias fazendas no Global: pondera pelo saldo, que é o que "peso médio" quer dizer. */
    let cab = 0; let kg = 0;
    for (const r of linhas as { saldo_inicial: number; peso_medio_inicial: number | null }[]) {
      const q = Number(r.saldo_inicial) || 0;
      const pm = r.peso_medio_inicial == null ? null : Number(r.peso_medio_inicial);
      if (q > 0 && pm != null && pm > 0) { cab += q; kg += q * pm; }
    }
    return cab > 0 ? { pesoMedioKg: Number((kg / cab).toFixed(2)) } : null;
  }, [rawCategorias, categoriaOrigem, data]);

  /* Repõe a sugestão sempre que a ORIGEM ou o MÊS mudam — enquanto o operador não tocar no campo.
     `pesoAutoFilled` é quem sabe se o valor na tela é sugestão ou digitação. */
  useEffect(() => {
    if (!autoSugerir) return;
    if (!origemInfo?.pesoMedioKg) return;
    if (pesoKg && !pesoAutoFilled) return;
    setPesoKg(String(origemInfo.pesoMedioKg));
    setPesoAutoFilled(true);
  }, [autoSugerir, origemInfo, categoriaOrigem, data]);

  /**
   * A TRAVA MORA AQUI, e não em cada host — RECLASS-PESO-01. Eram três expressões diferentes de
   * `canRegister` em três telas, e nenhuma olhava o peso. O motivo sai junto com o booleano para
   * o botão desabilitado poder dizer por quê.
   */
  const pesoValido = (parseDecimalInput(pesoKg) ?? 0) > 0;
  const motivoBloqueio = !Number(quantidade)
    ? 'Informe a quantidade de cabeças'
    : categoriaOrigem === categoriaDestino
      ? 'Origem e destino não podem ser a mesma categoria'
      : !pesoValido
        ? 'Informe o peso médio dos animais reclassificados'
        : null;
  const podeSalvar = motivoBloqueio === null;

  const origemLabel = CATEGORIAS.find(c => c.value === categoriaOrigem)?.label || categoriaOrigem;
  const destinoLabel = CATEGORIAS.find(c => c.value === categoriaDestino)?.label || categoriaDestino;

  const handleSubmit = async () => {
    /* ⚠ A GUARDA DO PESO FICA AQUI TAMBÉM, e não só no botão: o `handleSubmit` é chamado direto
       pelo FechamentoTab, e um botão desabilitado não é trava — é aviso. */
    if (!podeSalvar) return;

    const isMeta = statusOp === 'meta';
    const pesoMedioKg = parseDecimalInput(pesoKg);

    const result = await onAdicionar({
      data,
      tipo: 'reclassificacao',
      quantidade: Number(quantidade),
      categoria: categoriaOrigem,
      categoriaDestino,
      pesoMedioKg,
      pesoMedioArrobas: pesoMedioKg !== undefined ? kgToArrobas(pesoMedioKg) : undefined,
      statusOperacional: isMeta ? null : 'realizado',
    });

    if (result) {
      toast.success('Reclassificação registrada com sucesso.', {
        description: `${origemLabel} → ${destinoLabel} | ${Number(quantidade)} cab. | ${isMeta ? 'Meta' : 'Realizado'}`,
        style: isMeta ? { borderLeft: '4px solid #f97316' } : { borderLeft: '4px solid #16a34a' },
      });
      setQuantidade('');
      setPesoKg('');
      setPesoAutoFilled(false);
    } else {
      toast.error('Não foi possível registrar a reclassificação.', {
        description: 'Verifique os campos e tente novamente.',
      });
    }
  };

  return {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    quantidade, setQuantidade,
    pesoKg, setPesoKg,
    qtdInput, pesoInput,
    statusOp, setStatusOp,
    origemInfo,
    origemLabel, destinoLabel,
    handleSubmit,
    pesoAutoFilled, setPesoAutoFilled,
    podeSalvar, motivoBloqueio,
  };
}
