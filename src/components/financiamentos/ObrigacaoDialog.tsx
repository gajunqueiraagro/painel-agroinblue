import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, brl, parseMoeda } from '@/components/ui/campo-moeda';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { CredorAutocomplete } from '@/components/financiamentos/CredorAutocomplete';
import { DestinacoesForm, DestinacaoItem } from '@/components/financiamentos/DestinacoesForm';
import { useFinanciamentoCadastro, FinanciamentoForm, NaturezaContrato } from '@/hooks/useFinanciamentoCadastro';

/* ══ NOVA OBRIGACAO — a casca do CompraModalShell aplicada ao contrato ═══════════
   PR-PARC-04. Substitui a PAGINA `src/pages/FinanciamentoCadastro.tsx` como porta de
   entrada do "+ Nova obrigacao": mesma gravacao (o hook `useFinanciamentoCadastro`
   continua a fonte unica — form, parcelas, salvar), outra apresentacao.
   ⚠ A PAGINA NAO FOI APAGADA e continua sendo o caminho de outros pontos; quando a
   EDICAO tambem migrar para ca, ela sai num PR de limpeza. */

/* ── Constantes de medida — a casca inteira sai daqui ─────────────────────────── */
/* ⚠ ALTURA FIXA E' O QUE IMPEDE A CASCA DE PULAR ENTRE ABAS. Sem ela, Contrato
   (curta) e Classificacao (com Destinacoes) dariam dois modais de tamanhos
   diferentes, e o rodape mudaria de lugar debaixo do cursor. */
/* ⚠ 69vh, E NAO 62: espelha o CODIGO do CompraModalShell:408, nao o comentario
   dele (que ficou dizendo 62vh depois que o valor subiu). Encolher cabecalho e
   rodape libera pixel FIXO enquanto a area de conteudo cresce em PROPORCAO — os
   dois nunca se anulam em toda altura de janela, e o caso que importa e' a janela
   BAIXA, onde o modal quase nao cabe. */
const ALTURA_CORPO = 'h-[69vh]';
const ALTURA_PREVIA = 'max-h-[190px]';
const CAMPO = 'h-8';                       // A16 — todo campo do formulario na mesma altura
const CAMPO_CELULA = 'h-6';                // A16 — dentro da grade densa, todos na dela
/* Idioma canonico de campo travado (AbaLiquidacaoOC / CompraModalShell). */
const CAMPO_TRAVADO = 'bg-muted border-border/60 text-muted-foreground';
const ROTULO = 'text-[10px] font-normal text-muted-foreground';
const APOIO = 'mt-0.5 text-[10px] text-muted-foreground';
const NUM = 'font-mono tabular-nums';
const MIN_PARCELAS = 1;
const MAX_PARCELAS = 360;

type Escopo = 'pecuaria' | 'agricultura';
type Aba = 'contrato' | 'parcelas' | 'classificacao';
type Frequencia = FinanciamentoForm['frequencia_parcela'];

/* ⚠ GUARDAS, NAO CASTS (regra zero-cast). O `onValueChange` do Select entrega `string`;
   `as` calaria o compilador SEM olhar o valor, e um dia um `value` errado entraria no
   form como se fosse valido. O predicado confere de verdade e simplesmente ignora o que
   nao pertence ao conjunto. */
const ehEscopo = (v: string): v is Escopo => v === 'pecuaria' || v === 'agricultura';
const ehAba = (v: string): v is Aba => v === 'contrato' || v === 'parcelas' || v === 'classificacao';
const FREQUENCIAS: Frequencia[] = ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'];
const ehFrequencia = (v: string): v is Frequencia => FREQUENCIAS.some(f => f === v);

const APOIO_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'Crédito com bem vinculado',
  parcelamento: 'Compra ou despesa dividida em N vezes, sem juros',
  emprestimo: 'Crédito sem bem vinculado',
};

const NOME_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'Financiamento',
  parcelamento: 'Parcelamento',
  emprestimo: 'Empréstimo',
};

const PILULA_NATUREZA: Record<NaturezaContrato, string> = {
  financiamento: 'FIN',
  parcelamento: 'PARC',
  emprestimo: 'EMP',
};

const ORDEM_NATUREZA: NaturezaContrato[] = ['parcelamento', 'financiamento', 'emprestimo'];

/* ⚠ LITERAIS MEDIDOS NO BANCO PROTO, nao supostos — `financeiro_plano_contas`, 08/09/2026.
   Sao os MESMOS subcentros que `fn_reconciliar_parcela_financiamento` fixa por
   `tipo_financiamento` (pecuaria -> 0d42d354/5d4a5c70; agricultura -> 576eb57d/0c489373),
   e por isso a tela os mostra travados: quem decide e' o escopo, nao o operador.
   ⚠ A ASSIMETRIA DO NOME E' DO BANCO: "Amortização Financiamento X" mas "Juros de
   Financiamento X". Nao uniformizar aqui — o nome exibido tem de ser o nome real. */
const SUBCENTRO_AMORTIZACAO: Record<Escopo, string> = {
  pecuaria: 'Amortização Financiamento Pecuária',
  agricultura: 'Amortização Financiamento Agricultura',
};
const SUBCENTRO_JUROS: Record<Escopo, string> = {
  pecuaria: 'Juros de Financiamento Pecuária',
  agricultura: 'Juros de Financiamento Agricultura',
};

const dataBR = (iso: string): string | null =>
  iso ? iso.split('-').reverse().join('/') : null;

/* ── Resumo lateral: faixa de secao e par rotulo-valor (A17) ──────────────────── */
function BlocoHead({ titulo }: { titulo: string }) {
  return (
    <div className="bg-muted/40 border-y border-border/60 px-3 py-0.5 mt-0.5 first:mt-0 mb-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-primary/90 leading-none">{titulo}</span>
    </div>
  );
}
function Linha({ rotulo, valor, valorClassName }: { rotulo: string; valor: string | null; valorClassName?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className={`font-medium text-right truncate ${valorClassName ?? ''}`} title={valor ?? undefined}>
        {valor || '—'}
      </span>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado APOS a gravacao bem-sucedida — quem fecha, invalida e avisa e' o caller. */
  onSalvo?: () => void;
}

export function ObrigacaoDialog({ open, onOpenChange, onSalvo }: Props) {
  const {
    form, setForm,
    parcelas,
    gerarParcelas,
    updateParcela,
    totalParcelas,
    salvar, saving,
    contas,
    planosEntrada, planosSaida, planosParcelamento,
    clienteId,
  } = useFinanciamentoCadastro();

  const [aba, setAba] = useState<Aba>('contrato');
  const [destinacoes, setDestinacoes] = useState<DestinacaoItem[]>([]);

  const ehParcelamento = form.natureza === 'parcelamento';

  const set = useCallback(
    <K extends keyof FinanciamentoForm>(k: K, v: FinanciamentoForm[K]) =>
      setForm(prev => ({ ...prev, [k]: v })),
    [setForm],
  );

  /* ── Campos numericos: TEXTO enquanto digita, min/max e reformatacao no blur/Enter.
     ⚠ O idioma do repo (133i-b, `fecharNumParcelas` do LancamentoV2Dialog). Ligar o
     campo direto ao numero com `Number(e.target.value)` — como a pagina fazia — quebra
     a digitacao: apagar tudo vira 0, e "400" nunca chega a virar 360 porque nao ha'
     momento em que o valor se fecha. Dinheiro nao entra aqui: usa `CampoMoeda` (A19). */
  const [parcelasTexto, setParcelasTexto] = useState(String(form.total_parcelas));
  const fecharParcelas = () => {
    const n = Math.max(MIN_PARCELAS, Math.min(MAX_PARCELAS, parseInt(parcelasTexto, 10) || MIN_PARCELAS));
    set('total_parcelas', n);
    setParcelasTexto(String(n));
  };

  const [jurosTexto, setJurosTexto] = useState(form.taxa_juros_anual ? String(form.taxa_juros_anual) : '');
  const fecharJuros = () => {
    const n = Math.max(0, parseMoeda(jurosTexto) ?? 0);
    set('taxa_juros_anual', n);
    setJurosTexto(n ? n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '');
  };

  /* Auto-gerar parcelas — mesma cadeia de dependencias da pagina. */
  useEffect(() => {
    if (form.valor_total > 0 && form.total_parcelas > 0 && form.data_primeira_parcela) {
      gerarParcelas();
    }
  }, [form.valor_total, form.valor_entrada, form.total_parcelas, form.taxa_juros_anual, form.data_primeira_parcela, form.frequencia_parcela]);

  /* ── O plano de amortizacao do escopo ─────────────────────────────────────────
     ⚠ A TELA MOSTRA TRAVADO, MAS A COLUNA CONTINUA SENDO GRAVADA. `plano_conta_parcela_id`
     nao e' lido pelo motor no caminho de financiamento (ele fixa o plano por
     `tipo_financiamento` antes, e so' o ramo de parcelamento relê a coluna) — mas E'
     lido por `usePlanejamentoFinanceiro` (L486-489), que joga o PRINCIPAL no subcentro
     desta coluna para TODAS as naturezas. Deixa-la nula tiraria a amortizacao do
     Planejamento Financeiro, calada. Por isso o campo travado nao e' so' enfeite: ele
     preenche com o MESMO id que o motor usaria. */
  const idAmortizacaoEscopo = useMemo(
    () => planosSaida.find(p => p.subcentro === SUBCENTRO_AMORTIZACAO[form.tipo_financiamento])?.id ?? '',
    [planosSaida, form.tipo_financiamento],
  );

  useEffect(() => {
    if (ehParcelamento) {
      /* Virou parcelamento: o id de amortizacao herdado nao serve — a lista e' outra
         (saidas operacionais) e quem escolhe e' o operador. */
      if (form.plano_conta_parcela_id && form.plano_conta_parcela_id === idAmortizacaoEscopo) {
        set('plano_conta_parcela_id', '');
      }
      return;
    }
    if (idAmortizacaoEscopo && form.plano_conta_parcela_id !== idAmortizacaoEscopo) {
      set('plano_conta_parcela_id', idAmortizacaoEscopo);
    }
  }, [ehParcelamento, idAmortizacaoEscopo, form.plano_conta_parcela_id, set]);

  /* ── PENDENCIAS — a MESMA cadeia que ja desabilitava o botao, agora como lista ──
     ⚠ MESMAS REGRAS, MESMAS FRASES, MESMA ORDEM da pagina: o que muda e' que cada uma
     sabe em que aba mora, para a aba poder contar as suas. Nenhuma regra nova — o
     `salvar()` continua sendo a segunda barreira. */
  const pendencias = useMemo(() => {
    const lista: Array<{ aba: Aba; texto: string }> = [];
    if (!form.descricao?.trim()) lista.push({ aba: 'contrato', texto: 'Informe a descrição do contrato.' });
    if (!Number(form.valor_total)) lista.push({ aba: 'parcelas', texto: 'Informe o valor total.' });
    if (!form.data_contrato) lista.push({ aba: 'contrato', texto: 'Informe a data do contrato.' });
    if (!form.data_primeira_parcela) lista.push({ aba: 'parcelas', texto: 'Informe a data da 1ª parcela.' });
    if (!Number(form.total_parcelas)) lista.push({ aba: 'parcelas', texto: 'Informe o número de parcelas.' });
    if (ehParcelamento && !form.plano_conta_parcela_id) lista.push({ aba: 'classificacao', texto: 'Escolha a classificação da parcela' });
    return lista;
  }, [form.descricao, form.valor_total, form.data_contrato, form.data_primeira_parcela,
      form.total_parcelas, form.plano_conta_parcela_id, ehParcelamento]);

  const primeiraPendencia = pendencias[0]?.texto ?? null;
  const contarPendencias = (a: Aba) => pendencias.filter(p => p.aba === a).length;

  /* ── Nomes para o resumo ──────────────────────────────────────────────────────
     O credor vem da MESMA query por id do CredorAutocomplete (mesma queryKey — o
     react-query serve as duas da mesma entrada de cache, sem segunda ida ao banco). */
  const { data: credor } = useQuery({
    queryKey: ['credor-por-id', clienteId, form.credor_id],
    enabled: !!clienteId && !!form.credor_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('financeiro_fornecedores')
        .select('id, nome')
        .eq('cliente_id', clienteId)
        .eq('id', form.credor_id)
        .maybeSingle();
      return data ?? null;
    },
  });

  const nomeConta = useMemo(() => {
    const c = contas.find(x => x.id === form.conta_bancaria_id);
    return c ? (c.nome_exibicao || c.nome_conta) : null;
  }, [contas, form.conta_bancaria_id]);

  const nomePlano = (lista: Array<{ id: string; subcentro: string | null; centro_custo: string | null }>, id: string) => {
    const p = lista.find(x => x.id === id);
    return p ? (p.subcentro || p.centro_custo) : null;
  };

  const nomeCaptacao = nomePlano(planosEntrada, form.plano_conta_captacao_id);
  const nomeParcela = nomePlano(planosParcelamento, form.plano_conta_parcela_id);

  const valorParcela = parcelas.length > 0 ? parcelas[0].valor_principal + parcelas[0].valor_juros : null;
  const ultimaParcela = parcelas.length > 0 ? parcelas[parcelas.length - 1].data_vencimento : '';

  const handleSalvar = async () => {
    const ok = await salvar(destinacoes);
    if (ok) onSalvo?.();
  };

  const subtitulo = ehParcelamento
    ? 'Uma despesa paga em N vezes. Ela gera as parcelas, e as parcelas geram os lançamentos.'
    : 'Um crédito contratado. Ele gera as parcelas, e cada parcela gera amortização e juros.';

  const abas: Array<{ key: Aba; label: string }> = [
    { key: 'contrato', label: 'Contrato' },
    { key: 'parcelas', label: 'Parcelas' },
    { key: 'classificacao', label: 'Classificação' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ⚠ ENVELOPE CANONICO DAS CASCAS PROPRIAS (LancamentosTab:5741, o mesmo que o
          CompraModalShell recebe): `p-0 gap-0 overflow-hidden` e o X nativo escondido.
          Sem `gap-0` o DialogContent injeta `gap-4` entre cabecalho, abas, corpo e
          rodape; sem esconder o X nativo ficam DOIS botoes de fechar sobrepostos. */}
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
        <div className="flex flex-col">
          {/* ── CABECALHO ───────────────────────────────────────────────────────── */}
          <div className="bg-primary text-primary-foreground px-6 py-2.5 flex items-start justify-between">
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight">Nova obrigação</DialogTitle>
              {/* A frase muda com a natureza porque a CADEIA muda: no parcelamento nao
                  existe captacao nem juros, e prometer "crédito contratado" ali ensina
                  errado o operador. */}
              <DialogDescription className="mt-1 text-xs text-white/80">{subtitulo}</DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-white/80 hover:text-white shrink-0"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>

          <Tabs value={aba} onValueChange={(v) => { if (ehAba(v)) setAba(v); }} className="flex flex-col">
            {/* ── BARRA DE ABAS ──────────────────────────────────────────────────
                A contagem de pendencias por aba e' MARCADOR, nao parede: navegar
                nunca e' bloqueado — o operador so' precisa saber onde falta algo,
                inclusive olhando de outra aba. */}
            <div className="bg-card border-b px-6 py-1.5">
              <TabsList className="h-auto bg-transparent p-0 gap-1">
                {abas.map(a => {
                  const n = contarPendencias(a.key);
                  return (
                    <TabsTrigger
                      key={a.key}
                      value={a.key}
                      className="px-3 py-1 text-[12px] font-semibold data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-primary rounded-none -mb-px"
                    >
                      {a.label}
                      {n > 0 && (
                        <span className="ml-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-500">
                          ● {n} {n === 1 ? 'pendência' : 'pendências'}
                        </span>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* ── CORPO ──────────────────────────────────────────────────────────
                ⚠ A ROLAGEM MORA NAS COLUNAS, NAO NO CORPO (A21). Se o corpo rolasse,
                o resumo lateral subiria junto e sumiria — foi o defeito que o
                CompraModalShell ja pagou. `grid-rows-[minmax(0,1fr)]` e `min-h-0`
                nao sao decorativos: item de grid nasce `min-height:auto` e se recusa
                a encolher abaixo do conteudo, o que DESLIGA a rolagem da coluna e
                deixa o conteudo ser cortado pelo `overflow-hidden`.
                ⚠ SO A PARTIR DE `lg`: abaixo disso as colunas viram linhas empilhadas
                e altura fixa por coluna cortaria o resumo — ali o corpo rola inteiro. */}
            <div className={`grid grid-cols-1 lg:grid-cols-[1fr_280px] lg:grid-rows-[minmax(0,1fr)] gap-3 p-4 ${ALTURA_CORPO} overflow-y-auto lg:overflow-hidden bg-muted/30`}>
              <div className="space-y-2 min-w-0 lg:min-h-0 lg:overflow-y-auto">

                {/* ══ ABA CONTRATO ══════════════════════════════════════════════ */}
                <TabsContent value="contrato" className="mt-0 space-y-2.5">
                  {/* ⚠ PRIMEIRO CAMPO DA TELA. A natureza governa o resto (esconde
                      juros e captacao, troca a lista da classificacao); um campo que
                      muda os outros nao pode vir depois deles. */}
                  <div>
                    <Label className={ROTULO}>Natureza *</Label>
                    <div className="mt-0.5 grid grid-cols-3 gap-2">
                      {ORDEM_NATUREZA.map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => set('natureza', n)}
                          className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                            form.natureza === n ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <div className="text-[12px] font-semibold leading-tight">{NOME_NATUREZA[n]}</div>
                          <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{APOIO_NATUREZA[n]}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
                    <div>
                      <Label className={ROTULO}>Descrição *</Label>
                      <Input className={CAMPO} value={form.descricao}
                        onChange={e => set('descricao', e.target.value)}
                        placeholder="Ex: Custeio safra 2025" />
                    </div>
                    <div>
                      <Label className={ROTULO}>Nº do contrato</Label>
                      <Input className={CAMPO} value={form.numero_contrato}
                        onChange={e => set('numero_contrato', e.target.value)}
                        placeholder="opcional" />
                    </div>
                    <div>
                      {/* "Escopo", nao "Tipo": desde que a natureza existe, "tipo"
                          ficou ambiguo. Coluna e valores continuam os mesmos. */}
                      <Label className={ROTULO}>Escopo *</Label>
                      <Select value={form.tipo_financiamento} onValueChange={v => { if (ehEscopo(v)) set('tipo_financiamento', v); }}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pecuaria">Pecuária</SelectItem>
                          <SelectItem value="agricultura">Agricultura</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className={ROTULO}>Credor</Label>
                      {clienteId && (
                        <CredorAutocomplete
                          value={form.credor_id || ''}
                          onChange={(id) => set('credor_id', id)}
                          clienteId={clienteId}
                        />
                      )}
                    </div>
                    <div>
                      <Label className={ROTULO}>Conta bancária *</Label>
                      <ContaBancariaSelect
                        value={form.conta_bancaria_id}
                        onValueChange={(v) => set('conta_bancaria_id', v)}
                        contas={contas}
                        placeholder="Selecione"
                        showBankDetails="banco"
                        className={CAMPO}
                      />
                      <p className={APOIO}>De onde saem as parcelas</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className={ROTULO}>Data do contrato *</Label>
                      <DatePicker value={form.data_contrato} onChange={v => set('data_contrato', v)} />
                    </div>
                    <div>
                      <Label className={ROTULO}>Observação</Label>
                      <Input className={CAMPO} value={form.observacao}
                        onChange={e => set('observacao', e.target.value)}
                        placeholder="opcional" />
                    </div>
                  </div>
                </TabsContent>

                {/* ══ ABA PARCELAS ══════════════════════════════════════════════ */}
                <TabsContent value="parcelas" className="mt-0 space-y-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className={ROTULO}>Valor total *</Label>
                      <CampoMoeda valor={form.valor_total || null}
                        onChange={n => set('valor_total', n ?? 0)}
                        placeholder="R$ 0,00"
                        className={`${CAMPO} text-right ${NUM}`} />
                    </div>
                    <div>
                      <Label className={ROTULO}>Valor de entrada</Label>
                      <CampoMoeda valor={form.valor_entrada || null}
                        onChange={n => set('valor_entrada', n ?? 0)}
                        placeholder="R$ 0,00"
                        className={`${CAMPO} text-right ${NUM}`} />
                      <p className={APOIO}>Pago à vista, fora das parcelas</p>
                    </div>
                    <div>
                      <Label className={ROTULO}>Nº de parcelas *</Label>
                      <Input
                        type="number" min={MIN_PARCELAS} max={MAX_PARCELAS}
                        className={`${CAMPO} text-right ${NUM}`}
                        value={parcelasTexto}
                        onChange={e => setParcelasTexto(e.target.value)}
                        onBlur={fecharParcelas}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharParcelas(); } }}
                      />
                      <p className={APOIO}>Mínimo {MIN_PARCELAS}, máximo {MAX_PARCELAS}</p>
                    </div>
                  </div>

                  {/* ⚠ A GRADE ENCOLHE DE 3 PARA 2 COLUNAS quando os juros somem.
                      Esconder a terceira celula mantendo `grid-cols-3` deixaria um
                      terco vazio a' direita, e buraco em grade le-se como campo que
                      faltou carregar. */}
                  <div className={`grid gap-2 ${ehParcelamento ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    <div>
                      <Label className={ROTULO}>1ª parcela *</Label>
                      <DatePicker value={form.data_primeira_parcela} onChange={v => set('data_primeira_parcela', v)} />
                    </div>
                    <div>
                      <Label className={ROTULO}>Frequência</Label>
                      <Select value={form.frequencia_parcela} onValueChange={v => { if (ehFrequencia(v)) set('frequencia_parcela', v); }}>
                        <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="mensal">Mensal</SelectItem>
                          <SelectItem value="bimestral">Bimestral</SelectItem>
                          <SelectItem value="trimestral">Trimestral</SelectItem>
                          <SelectItem value="semestral">Semestral</SelectItem>
                          <SelectItem value="anual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!ehParcelamento && (
                      <div>
                        <Label className={ROTULO}>Juros ao ano (%) *</Label>
                        <Input
                          className={`${CAMPO} text-right ${NUM}`}
                          inputMode="decimal"
                          value={jurosTexto}
                          onChange={e => setJurosTexto(e.target.value)}
                          onBlur={fecharJuros}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharJuros(); } }}
                          placeholder="0"
                        />
                        <p className={APOIO}>
                          {form.taxa_juros_anual > 0
                            ? `≈ ${((Math.pow(1 + form.taxa_juros_anual / 100, 1 / 12) - 1) * 100).toFixed(4)}% a.m.`
                            : ' '}
                        </p>
                      </div>
                    )}
                  </div>

                  {ehParcelamento && (
                    /* ⚠ A FRASE DO ARREDONDAMENTO. Sem ela o operador soma as parcelas
                       na mao, acha centavos de diferenca e duvida do sistema. */
                    <p className="text-[10px] text-muted-foreground">
                      Sem juros. O valor de cada parcela é o total dividido por N; a última absorve o arredondamento.
                    </p>
                  )}

                  <div>
                    <Label className={ROTULO}>Prévia das parcelas</Label>
                    {parcelas.length === 0 ? (
                      <p className="mt-0.5 rounded-md border border-dashed px-2 py-3 text-center text-[10px] text-muted-foreground">
                        Preencha valor total, nº de parcelas e data da 1ª parcela.
                      </p>
                    ) : (
                      <Table
                        density="dense"
                        wrapperClassName={`mt-0.5 ${ALTURA_PREVIA} overflow-y-auto rounded-md border`}
                      >
                        {/* ⚠ CABECALHO PRESO (A21): o scrollport e' o wrapper acima, e
                            e' nele que o `sticky` ancora. Fundo OPACO e `z` acima das
                            linhas — transparente e' pior que nao fixar. */}
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="w-8">N</TableHead>
                            <TableHead className="w-28">Vencimento</TableHead>
                            {!ehParcelamento && <TableHead className="text-right">Amortização</TableHead>}
                            {!ehParcelamento && <TableHead className="text-right">Juros</TableHead>}
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parcelas.map((p, idx) => (
                            <TableRow key={idx}>
                              <TableCell className={`${NUM} text-[10px]`}>{p.numero}</TableCell>
                              <TableCell>
                                <DatePicker
                                  size="compact"
                                  value={p.data_vencimento}
                                  onChange={v => updateParcela(idx, 'data_vencimento', v)}
                                />
                              </TableCell>
                              {!ehParcelamento && (
                                <TableCell>
                                  <CampoMoeda valor={p.valor_principal}
                                    onChange={n => updateParcela(idx, 'valor_principal', n ?? 0)}
                                    className={`${CAMPO_CELULA} text-right text-[11px] ${NUM}`} />
                                </TableCell>
                              )}
                              {!ehParcelamento && (
                                <TableCell>
                                  <CampoMoeda valor={p.valor_juros}
                                    onChange={n => updateParcela(idx, 'valor_juros', n ?? 0)}
                                    className={`${CAMPO_CELULA} text-right text-[11px] ${NUM}`} />
                                </TableCell>
                              )}
                              <TableCell className={`text-right text-[11px] font-semibold ${NUM}`}>
                                {brl(p.valor_principal + p.valor_juros)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </TabsContent>

                {/* ══ ABA CLASSIFICACAO ═════════════════════════════════════════ */}
                <TabsContent value="classificacao" className="mt-0 space-y-2.5">
                  {ehParcelamento ? (
                    <>
                      <div>
                        <Label className={ROTULO}>Classificação da parcela *</Label>
                        <Select value={form.plano_conta_parcela_id} onValueChange={v => set('plano_conta_parcela_id', v)}>
                          <SelectTrigger className={CAMPO}><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {planosParcelamento.map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.subcentro || p.centro_custo}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className={APOIO}>Cada parcela vira um lançamento nesta classificação</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Parcelamento não tem captação: o dinheiro não entra, a despesa é que sai em N vezes.
                      </p>
                    </>
                  ) : (
                    <>
                      {/* ⚠ TRAVADOS PORQUE QUEM DECIDE E' O ESCOPO. Sao os mesmos
                          subcentros que o motor fixa no banco por `tipo_financiamento`;
                          oferecer um Select aqui prometeria uma escolha que a
                          reconciliacao ignora. */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className={ROTULO}>Conta de amortização</Label>
                          <Input readOnly tabIndex={-1}
                            className={`${CAMPO} ${CAMPO_TRAVADO}`}
                            value={SUBCENTRO_AMORTIZACAO[form.tipo_financiamento]} />
                          <p className={APOIO}>Definida pelo escopo</p>
                        </div>
                        <div>
                          <Label className={ROTULO}>Conta de juros</Label>
                          <Input readOnly tabIndex={-1}
                            className={`${CAMPO} ${CAMPO_TRAVADO}`}
                            value={SUBCENTRO_JUROS[form.tipo_financiamento]} />
                          <p className={APOIO}>Definida pelo escopo</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className={ROTULO}>Conta de captação</Label>
                          <Select value={form.plano_conta_captacao_id} onValueChange={v => set('plano_conta_captacao_id', v)}>
                            <SelectTrigger className={CAMPO}><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              {planosEntrada.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.subcentro || p.centro_custo}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className={APOIO}>Macro › Grupo › Centro</p>
                        </div>
                        <div>
                          {/* ⚠ ESTE CAMPO DECIDE SE O DINHEIRO ENTRA NO CAIXA. Passar
                              despercebido custa caro: houve contrato com parcelas
                              nascidas e a entrada da captacao nunca aparecendo no
                              fluxo. A consequencia de cada estado fica escrita ao lado. */}
                          <Label className={ROTULO}>Registrar entrada da captação no caixa</Label>
                          <Select
                            value={form.gerar_lancamento_captacao ? 'sim' : 'nao'}
                            onValueChange={v => set('gerar_lancamento_captacao', v === 'sim')}
                          >
                            <SelectTrigger className={CAMPO}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sim">Sim, na data do contrato</SelectItem>
                              <SelectItem value="nao">Não</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className={APOIO}>
                            {form.gerar_lancamento_captacao
                              ? 'O valor contratado entra como recebimento na data do contrato.'
                              : 'O contrato e as parcelas nascem, mas a entrada NÃO aparece no caixa.'}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-md border bg-card p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary/90">Destinação do contrato</p>
                        <p className="mb-1.5 text-[10px] text-muted-foreground">
                          Como o valor contratado será distribuído (opcional — pode ser preenchido depois)
                        </p>
                        <DestinacoesForm
                          clienteId={clienteId}
                          valorContrato={form.valor_total}
                          destinacoes={destinacoes}
                          onChange={setDestinacoes}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>
              </div>

              {/* ── RESUMO LATERAL (280px) ─────────────────────────────────────
                  ⚠ FORA do scrollport da coluna de conteudo, por construcao: e' o
                  numero que se confere enquanto se preenche, e nao pode subir junto
                  com o formulario. Ausencia e' "—", nunca zero (A19/sentinelas). */}
              <aside className="lg:min-h-0 lg:overflow-y-auto">
                <div className="bg-card rounded-md border shadow-sm overflow-hidden text-[10px]">
                  <div className="h-8 border-b border-border bg-accent/40 flex items-center px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
                    Resumo da obrigação
                  </div>
                  <div className="pb-1">
                    <BlocoHead titulo="Contrato" />
                    <div className="px-3 space-y-0.5">
                      <div className="flex items-baseline justify-between gap-1.5 leading-tight">
                        <span className="text-muted-foreground shrink-0">Natureza</span>
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="rounded border border-primary/40 bg-primary/10 px-1 text-[9px] font-bold text-primary">
                            {PILULA_NATUREZA[form.natureza]}
                          </span>
                          <span className="font-medium truncate">{NOME_NATUREZA[form.natureza]}</span>
                        </span>
                      </div>
                      <Linha rotulo="Escopo" valor={form.tipo_financiamento === 'pecuaria' ? 'Pecuária' : 'Agricultura'} />
                      <Linha rotulo="Credor" valor={credor?.nome ?? null} />
                      <Linha rotulo="Conta" valor={nomeConta} />
                      <Linha rotulo="Contrato em" valor={dataBR(form.data_contrato)} />
                    </div>

                    <BlocoHead titulo="Cronograma" />
                    <div className="px-3 space-y-0.5">
                      <div className="flex items-baseline justify-between gap-1.5 leading-tight">
                        <span className="text-muted-foreground shrink-0">Valor total</span>
                        <span className={`text-[14px] font-semibold ${NUM}`}>
                          {form.valor_total > 0 ? brl(form.valor_total) : '—'}
                        </span>
                      </div>
                      <Linha rotulo="Entrada" valor={form.valor_entrada > 0 ? brl(form.valor_entrada) : null} />
                      <Linha rotulo="Parcelas"
                        valor={parcelas.length > 0 && valorParcela != null ? `${parcelas.length} × ${brl(valorParcela)}` : null} />
                      <Linha rotulo="1ª" valor={dataBR(form.data_primeira_parcela)} />
                      <Linha rotulo="Última" valor={dataBR(ultimaParcela)} />
                      {!ehParcelamento && (
                        <Linha rotulo="Juros ao ano"
                          valor={form.taxa_juros_anual > 0 ? `${form.taxa_juros_anual.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%` : null} />
                      )}
                      {!ehParcelamento && (
                        <Linha rotulo="Total com juros" valor={totalParcelas > 0 ? brl(totalParcelas) : null} />
                      )}
                    </div>

                    <BlocoHead titulo="Classificação" />
                    <div className="px-3 space-y-0.5">
                      {ehParcelamento ? (
                        <Linha rotulo="Parcela" valor={nomeParcela} />
                      ) : (
                        <>
                          <Linha rotulo="Amortização" valor={SUBCENTRO_AMORTIZACAO[form.tipo_financiamento]} />
                          <Linha rotulo="Juros" valor={SUBCENTRO_JUROS[form.tipo_financiamento]} />
                          <Linha rotulo="Captação" valor={nomeCaptacao} />
                        </>
                      )}
                    </div>

                    {pendencias.length > 0 && (
                      <div className="mx-3 mt-2 border-l-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30 px-2 py-1">
                        <span className="font-semibold text-amber-700 dark:text-amber-500">Falta: </span>
                        <span className="text-amber-800 dark:text-amber-400">
                          {pendencias.map(p => p.texto.replace(/\.$/, '')).join(' · ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </Tabs>

          {/* ── RODAPE ─────────────────────────────────────────────────────────
              ⚠ UMA FRASE, TRES USOS: a mesma pendencia governa o `disabled`, o
              `title` e a dica escrita. Botao desabilitado sem motivo transfere ao
              operador o trabalho de adivinhar. */}
          <div className="border-t px-4 py-2.5 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground min-w-0 truncate">
              {primeiraPendencia && (
                <>
                  <span className="font-medium text-amber-600 dark:text-amber-500">Pendência:</span> {primeiraPendencia}
                </>
              )}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="h-8" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 bg-cta text-cta-foreground hover:bg-cta-hover font-semibold"
                onClick={handleSalvar}
                disabled={saving || pendencias.length > 0}
                title={primeiraPendencia ?? undefined}
              >
                {saving ? 'Salvando...' : 'Ver prévia e salvar'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
