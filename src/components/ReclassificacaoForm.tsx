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
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MSG_FAZENDA_OBRIGATORIA } from '@/lib/zoo/fazendaDoFormulario';
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
  /**
   * O cenario com que a evolucao NASCE — o do caminho de entrada (MODAIS-PADRAO-01f). Sem ele, realizado
   * (Fechamento, edicao antes da hidratacao). Nao ha mais card para troca-lo depois.
   */
  cenarioInicial?: 'realizado' | 'meta';
  /**
   * A fazenda ESCOLHIDA na tela — TRANSF-FAZENDA-ORIGEM-01. Vai no payload (`fazendaId`), e o
   * `adicionarLancamento` a usa no lugar da do contexto. Sem ela (Fechamento), herda o contexto, como sempre.
   */
  fazendaId?: string;
  /** Com `true`, a fazenda e' obrigatoria: sem ela `podeSalvar` e' falso (o Registrar de "Lancar movimentacao"). */
  exigeFazenda?: boolean;
}

type StatusOpcao = 'realizado' | 'meta';

// ── Form Fields Component ──

interface FormFieldsProps {
  state: ReturnType<typeof useReclassificacaoState>;
  /**
   * O campo de fazenda — TRANSF-FAZENDA-ORIGEM-01. O mesmo desenho dos seletores do Nascimento e da Morte:
   * busca sobre as fazendas ativas, vermelho e com a frase quando vazio. `travada` (o nome gravado) na edicao,
   * porque ela nao envia `fazenda_id`. Sem a prop (Fechamento, que ja' e' de uma fazenda), nao ha campo.
   */
  campoFazenda?: {
    opcoes: { value: string; label: string }[];
    valor: string;
    onChange: (id: string) => void;
    travada: string | null;
  };
}

export function ReclassificacaoFormFields(props: FormFieldsProps) {
  const { state, campoFazenda } = props;
  const {
    categoriaOrigem, setCategoriaOrigem,
    categoriaDestino, setCategoriaDestino,
    data, setData,
    qtdInput, pesoInput,
    statusOp,
    origemInfo, setPesoKg, pesoAutoFilled, setPesoAutoFilled,
    motivoBloqueio,
  } = state;

  const isMeta = statusOp === 'meta';
  const borderAccent = isMeta ? 'border-orange-400' : '';

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

      {/* ⚠ O CENARIO NAO SE ESCOLHE AQUI — MODAIS-PADRAO-01f (decisao do Gabriel, 27/09/2026). Os cards
          Realizado/Meta sairam: o cenario nasce do CAMINHO (Lancar movimentacao = realizado, Lancar meta = meta)
          e, na edicao, e' o do proprio lancamento. Antes o estado nascia fixo em 'realizado' e estes cards so'
          checavam a permissao de consultor — em "Lancar meta" a evolucao saia gravada como realizado sem o
          clique, e em "Lancar movimentacao" um consultor gravava meta. Quem mostra o cenario agora e' o selo do
          cabecalho do modal. */}
      {campoFazenda && (
        <div>
          <Label className="text-[10px] font-semibold">
            Fazenda{!campoFazenda.travada && <span className="text-destructive"> *</span>}
          </Label>
          {campoFazenda.travada ? (
            <Input readOnly value={campoFazenda.travada} title="A fazenda do lançamento não muda por aqui"
              className="h-7 text-[11px] bg-muted cursor-not-allowed" />
          ) : (<>
            <SearchableSelect
              value={campoFazenda.valor || '__all__'}
              onValueChange={v => campoFazenda.onChange(v === '__all__' ? '' : v)}
              options={campoFazenda.opcoes}
              placeholder="Buscar fazenda…"
              allLabel="Selecione a fazenda"
              allValue="__all__"
              className={`[&_button]:h-7 [&_button]:text-[11px] ${campoFazenda.valor ? '' : '[&_button]:border-destructive'}`}
            />
            {!campoFazenda.valor && <p className="mt-0.5 text-[10px] text-destructive">{MSG_FAZENDA_OBRIGATORIA}</p>}
          </>)}
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
      {/* A falta de fazenda ja' tem a frase embaixo do proprio campo; repeti-la aqui seria a mesma frase duas vezes. */}
      {motivoBloqueio && motivoBloqueio !== MSG_FAZENDA_OBRIGATORIA && (
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

export function useReclassificacaoState({ onAdicionar, dataInicial, autoSugerir = true, cenarioInicial, fazendaId, exigeFazenda = false }: Props) {
  const [categoriaOrigem, setCategoriaOrigem] = useState<Categoria>('garrotes');
  const [categoriaDestino, setCategoriaDestino] = useState<Categoria>('bois');
  const [data, setData] = useState(dataInicial || format(new Date(), 'yyyy-MM-dd'));
  useEffect(() => {
    if (dataInicial) setData(dataInicial);
  }, [dataInicial]);
  const [quantidade, setQuantidade] = useState('');
  const [pesoKg, setPesoKg] = useState('');
  const [pesoAutoFilled, setPesoAutoFilled] = useState(false);
  const [statusOp, setStatusOp] = useState<StatusOpcao>(cenarioInicial ?? 'realizado');

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
  const motivoBloqueio = exigeFazenda && !fazendaId
    ? MSG_FAZENDA_OBRIGATORIA
    : !Number(quantidade)
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
      /* A ESCOLHIDA na tela; vazio vira `undefined` e o `adicionarLancamento` herda o contexto (Fechamento). */
      fazendaId: fazendaId || undefined,
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
