/**
 * BoitelBlocosModais — a ENTRADA de dado do boitel, na aba de Negociação da venda.
 *
 * PR-OC-VENDA-BOITEL-01B. O 01A entregou a leitura; este entrega a escrita.
 *
 * ⚠ UI PURA. Nenhuma regra nasce aqui. A lista dos cinco campos obrigatórios vive na
 * RPC `oc_salvar_boitel` (aa4f2630); esta tela repete o AVISO para o operador não
 * descobrir o impedimento só no fim — a lição do peso da morte, em 45a7352b.
 *
 * ⚠ ACORDEAO, E NAO MODAIS — PR-BOITEL-ACORDEAO-01. Os quatro blocos nasceram como
 * botões que abriam um Dialog cada, com um estado `aberto` de valor único: um por vez,
 * por construção. O defeito não era de código, era de desenho. O boitel é SIMULAÇÃO — o
 * operador mexe na diária olhando a margem, mexe no GMD olhando o custo —, e o modal
 * escondia três blocos enquanto se editava um. Agora os campos abrem NA PRÓPRIA SEÇÃO, e
 * o estado é um `Set`: quantos blocos o operador quiser, ao mesmo tempo.
 *
 * ⚠ NÃO GRAVA. As quatro seções editam o objeto em memória e devolvem ao pai. Quem
 * persiste é o botão da venda, numa chamada só — o padrão de `oc_salvar_lotes`, e a
 * mesma forma que o simulador antigo já tem (`handleSave` devolve ao pai, não ao banco).
 *
 * ⚠ NÃO COPIEI AS MEDIDAS DO SIMULADOR ANTIGO. Lá os campos são 7–9px, abaixo do piso
 * de 10px de docs/PADROES-UI.md. As formas aqui são as do repositório: A16 (mesma
 * altura de campo), A17 (par rótulo-valor), A18 (linha densa de duas alturas), A19
 * (dinheiro sempre formatado), A20 (DatePicker, nunca `input type=date`).
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatMoeda, formatKg, formatArroba } from '@/lib/calculos/formatters';
import type { BoitelData } from '@/components/BoitelPlanningDialog';
import { derivadosBoitel, cabecasQueSairam, type BoitelEdicao } from '@/components/venda/BoitelNegociacaoDerivado';

/* `BoitelEdicao` e `cabecasQueSairam` DESCERAM para `BoitelNegociacaoDerivado` em
   PR-OC-VENDA-BOITEL-FIX-ARROBAS-MORTE-01: as contas de lá passaram a precisar da morte, e
   este arquivo importa daquele — manter aqui criaria ciclo. Reexportados porque o
   `VendaModalShell` e o `LancamentosTab` os pedem por este caminho. */
export type { BoitelEdicao };
export { cabecasQueSairam };

/* ⚠ ESPELHO DA RPC, e assumido como espelho. A lista canônica é a de
   `oc_salvar_boitel`; esta existe para o botão poder desabilitar ANTES da chamada, e
   não para decidir nada. Se as duas divergirem, quem manda é a RPC — e o texto que o
   operador veria seria o dela, não o daqui. */
const CINCO_OBRIGATORIOS: { rotulo: string; tem: (d: BoitelEdicao) => boolean }[] = [
  { rotulo: 'dias de confinamento', tem: d => d.dias > 0 },
  { rotulo: 'GMD',                  tem: d => d.gmd > 0 },
  { rotulo: 'rendimento de saída',  tem: d => d.rendimento > 0 },
  { rotulo: 'custo da diária',      tem: d => d.custoDiaria > 0 },
  { rotulo: 'preço de venda da @',  tem: d => d.precoVendaArroba > 0 },
];

/** O que falta dos cinco. Vazio = a RPC aceitaria. */
export function faltamDosCinco(d: BoitelEdicao | null): string[] {
  if (!d) return CINCO_OBRIGATORIOS.map(c => c.rotulo);
  return CINCO_OBRIGATORIOS.filter(c => !c.tem(d)).map(c => c.rotulo);
}

/* ─── O MAPA ENTRE `BoitelEdicao` E `zoo_operacao_boitel` ──────────────────────
   UM mapa, e as DUAS direções derivam dele — PR-OC-VENDA-REABRIR-01.
   ⚠ ESCREVER A VOLTA COMO SEGUNDA LISTA seria o defeito do `TRANSLATE` de ontem em
   outra roupa: duas listas paralelas que ninguém percebe desalinhadas. Aqui, esquecer
   um campo o faz sumir da ida E da volta ao mesmo tempo — o que é visível.
   ⚠ `custo_nutricao` SAIU DO MAPA — PR-OC-VENDA-NUTRICAO-DUPLICADA-01: a diária já é a
   nutrição, e o campo era o mesmo conceito duas vezes. A COLUNA FICA NO BANCO, zerada em
   todas as linhas (medido: 1 linha, zero com valor), como legado — sem migration. Fora do
   mapa, ela deixa de ser enviada, e a RPC preserva o que lá estiver: zero.
   ⚠ `zeroEValor` MARCA OS CAMPOS EM QUE ZERO E RESPOSTA, e não ausência. Nos demais,
   zero e vazio são a mesma coisa (não informado) e viram NULL; nos de morte, zero
   significa "informado como nenhuma morte" — está no comentário da própria coluna. */
type TipoCampoBoitel = 'texto' | 'num' | 'int' | 'bool';
interface CampoBoitel { col: string; campo: keyof BoitelEdicao; tipo: TipoCampoBoitel; zeroEValor?: boolean }

const MAPA_BOITEL: CampoBoitel[] = [
  { col: 'nome_boitel',                  campo: 'nomeBoitel',                  tipo: 'texto' },
  { col: 'lote_codigo',                  campo: 'lote',                        tipo: 'texto' },
  { col: 'numero_contrato',              campo: 'numeroContrato',              tipo: 'texto' },
  { col: 'data_envio',                   campo: 'dataEnvio',                   tipo: 'texto' },
  { col: 'peso_saida_fazenda_kg',        campo: 'pesoInicial',                 tipo: 'num' },
  { col: 'dias',                         campo: 'dias',                        tipo: 'int' },
  { col: 'gmd',                          campo: 'gmd',                         tipo: 'num' },
  { col: 'quebra_viagem_pct',            campo: 'quebraViagem',                tipo: 'num' },
  { col: 'rendimento_entrada_pct',       campo: 'rendimentoEntrada',           tipo: 'num' },
  { col: 'rendimento_saida_pct',         campo: 'rendimento',                  tipo: 'num' },
  { col: 'custo_diaria',                 campo: 'custoDiaria',                 tipo: 'num' },
  { col: 'custo_sanidade',               campo: 'custoSanidade',               tipo: 'num' },
  { col: 'custo_frete',                  campo: 'custoFrete',                  tipo: 'num' },
  { col: 'outros_custos',                campo: 'outrosCustos',                tipo: 'num' },
  { col: 'custo_oportunidade',           campo: 'custoOportunidade',           tipo: 'num' },
  { col: 'preco_venda_arroba',           campo: 'precoVendaArroba',            tipo: 'num' },
  /* ⚠ UM CAMPO SO — a unificação com `custoNfAbate` saiu no 01A. */
  { col: 'despesas_abate',               campo: 'despesasAbate',               tipo: 'num' },
  { col: 'possui_adiantamento',          campo: 'possuiAdiantamento',          tipo: 'bool' },
  { col: 'data_adiantamento',            campo: 'dataAdiantamento',            tipo: 'texto' },
  { col: 'valor_adiantamento_diarias',   campo: 'valorAdiantamentoDiarias',    tipo: 'num' },
  { col: 'valor_adiantamento_sanitario', campo: 'valorAdiantamentoSanitario',  tipo: 'num' },
  { col: 'valor_adiantamento_outros',    campo: 'valorAdiantamentoOutros',     tipo: 'num' },
  { col: 'adiantamento_observacao',      campo: 'adiantamentoObservacao',      tipo: 'texto' },
  { col: 'morte_quantidade',             campo: 'morteQuantidade',             tipo: 'int', zeroEValor: true },
  { col: 'morte_valor_indenizacao',      campo: 'morteValorIndenizacao',       tipo: 'num', zeroEValor: true },
];

/** O payload de `oc_salvar_boitel` — a IDA, derivada do mapa. */
export function payloadBoitel(d: BoitelEdicao): Record<string, unknown> {
  const out: Record<string, unknown> = {
    /* ⚠ SEMPRE 'diaria'. O CHECK do banco recusa as outras duas, e o seletor desta tela
       não as oferece — mandar outra coisa seria pedir um erro que a tela já sabe. */
    modalidade_custo: 'diaria',
  };
  for (const c of MAPA_BOITEL) {
    const v = d[c.campo];
    if (c.tipo === 'bool') out[c.col] = !!v;
    else if (c.zeroEValor) out[c.col] = v ?? null;
    else out[c.col] = v || null;
  }
  return out;
}

/** A VOLTA: uma linha de `zoo_operacao_boitel` vira `BoitelEdicao`, pelo mesmo mapa.
 *  ⚠ CABECAS E PESO SAO SOBRESCRITOS PELOS LOTES depois disto (ver `boitelDaVenda` em
 *  LancamentosTab). O peso vem no mapa porque a coluna existe e é gravada; lê-lo aqui é
 *  inofensivo, e omiti-lo criaria a assimetria que o mapa existe para impedir. */
export function boitelDeLinha(linha: Record<string, unknown> | null | undefined): BoitelEdicao | null {
  if (!linha) return null;
  /* ⚠ SEM `as`. O patch é acumulado num parcial e aplicado por `Object.assign` sobre o
     objeto vazio, que já é `BoitelEdicao` — o resultado é atribuível ao tipo sem cast,
     e o zero-cast do projeto continua valendo. */
  const patch: Partial<Record<keyof BoitelEdicao, unknown>> = {};
  for (const c of MAPA_BOITEL) {
    const v = linha[c.col];
    if (c.tipo === 'bool')       patch[c.campo] = !!v;
    else if (c.tipo === 'texto') patch[c.campo] = v == null ? '' : String(v);
    else if (c.zeroEValor)       patch[c.campo] = v == null ? undefined : Number(v);
    else                         patch[c.campo] = v == null ? 0 : Number(v);
  }
  return Object.assign(boitelVazio(), patch);
}

/** Um boitel em branco.
 *  ⚠ SEM CABEÇAS E SEM PESO, e não por esquecimento: os dois DERIVAM DOS LOTES a cada
 *  render, em `LancamentosTab`, e não fazem parte do estado editável. Semeá-los aqui
 *  corrigiria só a primeira abertura — na primeira tecla o estado deixa de ser nulo,
 *  esta função nunca mais é chamada, e o valor semeado congelaria. */
export function boitelVazio(): BoitelEdicao {
  return {
    qtdCabecas: 0, pesoInicial: 0, fazendaOrigem: '', nomeBoitel: '', lote: '', numeroContrato: '',
    dataEnvio: '', quebraViagem: 0, custoOportunidade: 0, dias: 0, gmd: 0,
    rendimentoEntrada: 0, rendimento: 0, modalidadeCusto: 'diaria',
    custoDiaria: 0, custoArroba: 0, percentualParceria: 0, custosExtrasParceria: 0,
    custoFrete: 0, outrosCustos: 0, custoNutricao: 0, custoSanidade: 0, custoNfAbate: 0,
    precoVendaArroba: 0, despesasAbate: 0, formaReceb: 'avista', qtdParcelas: 1, parcelas: [],
    possuiAdiantamento: false, dataAdiantamento: '', pctAdiantamentoDiarias: 0,
    valorAdiantamentoDiarias: 0, valorAdiantamentoSanitario: 0, valorAdiantamentoOutros: 0,
    valorTotalAntecipado: 0, adiantamentoObservacao: '',
  };
}

/* ═══ AS CONTAS DESTA TELA ═══════════════════════════════════════════════════════
   ⚠ AS DIÁRIAS E O FATURAMENTO SAÍRAM DAQUI. No 01B eles eram escritos duas vezes — aqui
   e no `derivadosBoitel` —, e as duas cópias divergiam: o painel cobrava a diária do
   animal morto e mostrava o faturamento sem a indenização, enquanto estes blocos não. Dois
   números diferentes para a mesma coisa, na mesma tela. Agora ambos leem `derivadosBoitel`.
   ⚠ O DENOMINADOR NÃO ENCOLHE: o lote continua sendo o lote inteiro nas métricas por
   cabeça. A indenização soma ao faturamento; ela não reduz o tamanho do lote.

   ⚠ O FRETE NÃO ENTRA NO CUSTO DO BOITEL — decisão do Gabriel, e o simulador antigo já
   dizia o mesmo: lá `custoTotalBoitel = cDT + cs + oc` e o frete aparece só no custo
   OPERACIONAL (`cOp = cDT + cs + oc + cf`). Ele é desembolso do produtor, pago por fora.
   ⚠ MAS EM ALGUNS CASOS O BOITEL PAGA O FRETE e o embute na cobrança. Enquanto não houver
   um marcador de QUEM PAGOU, o frete fica fora — a proposta está reportada e o campo
   segue existindo, porque o custo existe de qualquer forma.
   ⚠ `custoTotalDoBoitel` DEIXOU DE EXISTIR — PR-OC-VENDA-NUTRICAO-DUPLICADA-01. Ela
   somava a nutrição por cima das diárias e divergia do motor; tirada a duplicação, ela
   virava `cDT + cs + oc`, que e' letra por letra o `custoTotalBoitel` do
   `derivadosBoitel`. Em vez de manter duas funções com o mesmo corpo, a tela passou a ler
   a do motor: agora os dois numeros sao o MESMO por construcao, e nao por coincidencia.
   ⚠ E O MOTOR ESTAVA CERTO O TEMPO TODO. Ele nunca somou nutrição — o que parecia
   omissão dele era a tela cobrando duas vezes. */
export function antecipadoTotal(d: BoitelEdicao): number {
  if (!d.possuiAdiantamento) return 0;
  return Math.round(((d.valorAdiantamentoDiarias || 0) + (d.valorAdiantamentoSanitario || 0)
                   + (d.valorAdiantamentoOutros || 0)) * 100) / 100;
}

/* ═══ PEÇAS DE FORMA ═════════════════════════════════════════════════════════════ */

/** Campo numérico: vírgula no foco, pt-BR no blur. Mesma mecânica do `IM` do simulador,
 *  nas medidas do repositório (A16: h-8, 12px). */
function CampoNum({ label, valor, onChange, casas = 2, sufixo, obrigatorio, derivado, desabilitado }: {
  label: string; valor: number; onChange: (v: number) => void; casas?: number;
  sufixo?: string; obrigatorio?: boolean; derivado?: string | null; desabilitado?: boolean;
}) {
  const fmt = (v: number) => v ? v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) : '';
  /* ⚠ `rascunho` E' NULO QUANDO NAO SE ESTA DIGITANDO, e ai o campo mostra o valor
     formatado. Guardar o texto sempre exigiria sincronizar estado com prop — e' o
     caminho que leva a `setState` durante o render. Aqui nao ha o que sincronizar:
     fora do foco, o que aparece e' derivado do valor. */
  const [rascunho, setRascunho] = useState<string | null>(null);
  const parse = (t: string) => {
    let limpo = t.replace(/%/g, '').trim();
    if (limpo.includes(',')) limpo = limpo.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : Math.round(n * Math.pow(10, casas)) / Math.pow(10, casas);
  };
  return (
    <div className="min-w-0">
      <Label className="text-[10px] text-muted-foreground">
        {label}{obrigatorio && <span className="text-destructive"> *</span>}
      </Label>
      <div className="mt-[3px] flex items-center gap-1">
        <Input
          value={rascunho ?? fmt(valor)} disabled={desabilitado} inputMode="decimal"
          onChange={e => { setRascunho(e.target.value); onChange(parse(e.target.value)); }}
          onFocus={() => setRascunho(valor ? String(valor).replace('.', ',') : '')}
          onBlur={() => { if (rascunho !== null) onChange(parse(rascunho)); setRascunho(null); }}
          className="h-8 px-2.5 text-[12px] tabular-nums text-right"
        />
        {sufixo && <span className="text-[10px] text-muted-foreground shrink-0 w-10">{sufixo}</span>}
      </div>
      {/* O derivado por cabeça, ABAIXO do campo. "—" quando não há como derivar. */}
      {derivado !== undefined && (
        <div className="mt-[3px] text-[10px] text-muted-foreground tabular-nums">
          {derivado ?? '—'}
        </div>
      )}
    </div>
  );
}

/* ─── A SECAO DO ACORDEAO ──────────────────────────────────────────────────────
   FECHADA: uma linha — seta, nome e o resumo à direita. O resumo diz o conteúdo sem
   abrir, e é a mesma informação que os botões antigos já mostravam.
   ⚠ PENDENCIA EM AMBAR NA LINHA FECHADA. O operador vê o que falta sem abrir nada, e é
   melhor que o painel dizer: aqui ele está a um clique de resolver. */
function SecaoAcordeao({ titulo, resumo, pendente, aberta, onToggle, children }: {
  titulo: string; resumo: string; pendente?: boolean; aberta: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  const Seta = aberta ? ChevronDown : ChevronRight;
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <button type="button" onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
          aberta ? 'bg-muted/40' : 'hover:bg-muted/25'}`}>
        <Seta className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[12px] font-medium shrink-0">{titulo}</span>
        <span className={`ml-auto text-[11px] tabular-nums text-right truncate ${
          pendente ? 'text-amber-700' : 'text-muted-foreground'}`}>
          {resumo}
        </span>
      </button>
      {aberta && <div className="px-3 py-2.5 border-t">{children}</div>}
    </div>
  );
}

const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n3 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** Derivado por cabeça — usa o LOTE INTEIRO no denominador, mortes incluídas. */
const porCabeca = (total: number, qtd: number) => qtd > 0 && total > 0 ? `${formatMoeda(total / qtd)} por cab. no período` : null;

/* ═══ O COMPONENTE ═══════════════════════════════════════════════════════════════ */

export function BoitelBlocosModais({ valor, onChange, somenteLeitura }: {
  valor: BoitelEdicao; onChange: (proximo: BoitelEdicao) => void; somenteLeitura?: boolean;
}) {
  const d = valor;
  const set = <K extends keyof BoitelEdicao>(k: K, v: BoitelEdicao[K]) => onChange({ ...d, [k]: v });

  const der = useMemo(() => derivadosBoitel(d), [d]);
  const qtd = d.qtdCabecas || 0;
  const sairam = cabecasQueSairam(d);
  const diarias = der.cDT;
  const custoTotal = der.custoTotalBoitel;
  const fatBruto = der.fba;
  const antecipado = antecipadoTotal(d);
  const temDesempenho = d.dias > 0 && d.gmd > 0 && d.rendimento > 0;

  /* O RESUMO DA LINHA FECHADA — o mesmo conteúdo que os botões antigos mostravam.
     `pendente` marca a linha em âmbar e é o que decide qual seção abre sozinha. */
  const secoes = [
    { id: 'desempenho' as const, titulo: 'Desempenho',
      pendente: !temDesempenho,
      resumo: temDesempenho
        ? `GMD ${n3(d.gmd)} · ${d.dias} dias · RC ${n2(d.rendimento)}%`
        : 'GMD, dias e rendimento de saída pendentes' },
    { id: 'custos' as const, titulo: 'Custos',
      pendente: !(d.custoDiaria > 0),
      resumo: d.custoDiaria > 0
        ? `${qtd > 0 && custoTotal > 0 ? formatMoeda(custoTotal / qtd) + '/cab · ' : ''}diária ${formatMoeda(d.custoDiaria)}`
        : 'diária pendente' },
    /* ⚠ O RESUMO MOSTRA O QUE O BLOCO PRODUZ, e não só o que ele consome. Ele exibia
       preço e despesas — os dois insumos — e escondia o faturamento, que é o número que
       sai daqui. As despesas saíram para o faturamento caber: elas não entram no bruto
       (são subtraídas no líquido), então listá-las ao lado dele confundiria as duas contas.
       ⚠ A UNIDADE E R$/@, e não R$/kg: no boitel se vende arroba de carcaça. */
    { id: 'comercializacao' as const, titulo: 'Comercialização',
      pendente: !(d.precoVendaArroba > 0),
      resumo: d.precoVendaArroba > 0
        ? `${formatMoeda(d.precoVendaArroba)}/@${fatBruto > 0 ? ` · fatura ${formatMoeda(fatBruto)}` : ''}`
        : 'preço de venda pendente' },
    /* ⚠ O ADIANTAMENTO NAO TEM OBRIGATORIO, então nunca fica âmbar: "não informado" aqui
       é resposta, e não pendência. */
    { id: 'adiantamento' as const, titulo: 'Adiantamento',
      pendente: false,
      resumo: d.possuiAdiantamento && antecipado > 0 ? formatMoeda(antecipado) : 'não informado' },
  ];

  /* ⚠ UM `Set`, E NAO UM VALOR UNICO. É o ponto do redesenho: Desempenho e Custos abertos
     juntos, para mexer no GMD olhando o custo.
     ⚠ TODOS FECHADOS, exceto o PRIMEIRO pendente — que abre sozinho, porque é onde o
     operador tem de agir. Calculado uma vez, no `useState` inicial: recalcular a cada
     render fecharia a seção no instante em que ele preenchesse o campo. */
  const [abertas, setAbertas] = useState<Set<string>>(() => {
    const primeiroPendente = secoes.find(x => x.pendente);
    return new Set(primeiroPendente ? [primeiroPendente.id] : []);
  });
  const alternar = (id: string) => setAbertas(prev => {
    const proximo = new Set(prev);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });

  const corpos: Record<string, React.ReactNode> = {
    desempenho: (<><div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          <CampoNum label="Dias de confinamento" valor={d.dias} onChange={v => set('dias', v)} casas={0} obrigatorio />
          <CampoNum label="GMD" valor={d.gmd} onChange={v => set('gmd', v)} casas={3} sufixo="kg/dia" obrigatorio />
          <CampoNum label="Quebra de viagem" valor={d.quebraViagem} onChange={v => set('quebraViagem', v)} sufixo="%" />
          <CampoNum label="Rendimento de entrada" valor={d.rendimentoEntrada} onChange={v => set('rendimentoEntrada', v)} sufixo="%" />
          <CampoNum label="Rendimento de saída" valor={d.rendimento} onChange={v => set('rendimento', v)} sufixo="%" obrigatorio />
        </div></>),
    custos: (<><div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 items-start">
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Modalidade <span className="text-destructive">*</span></Label>
            <Select value="diaria" onValueChange={() => { /* só diária — ver os itens desabilitados */ }}>
              <SelectTrigger className="mt-[3px] h-8 px-2.5 text-[12px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="diaria" className="text-[12px]">Diária</SelectItem>
                {/* ⚠ APARECEM E DIZEM QUE NÃO DÁ. Sumir com elas faria o operador achar que
                    o sistema não conhece a modalidade; desabilitadas, ele sabe que existe e
                    que ainda não está pronta. O CHECK do banco recusa as duas de qualquer
                    forma — nenhuma rodou com dado real. */}
                <SelectItem value="arroba" disabled className="text-[12px]">Arroba produzida — ainda não disponível</SelectItem>
                <SelectItem value="parceria" disabled className="text-[12px]">Parceria — ainda não disponível</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CampoNum label="Diária" valor={d.custoDiaria} onChange={v => set('custoDiaria', v)} sufixo="R$/cab/dia" obrigatorio />
          <div className="min-w-0">
            <Label className="text-[10px] text-muted-foreground">Diárias no período</Label>
            <div className="mt-[3px] h-8 px-2.5 flex items-center rounded-md border bg-muted/40 text-[12px] font-medium tabular-nums">
              {diarias > 0 ? formatMoeda(diarias) : <span className="text-muted-foreground font-normal">—</span>}
            </div>
            {/* ⚠ CABEÇAS QUE SAÍRAM, não as que entraram. O boitel não cobra diária de
                animal morto — medido no acerto real: 109 × 104 × 18,93. */}
            <div className="mt-[3px] text-[10px] text-muted-foreground tabular-nums">
              {d.custoDiaria > 0 && d.dias > 0
                ? `${sairam} cab. × ${d.dias} dias × ${formatMoeda(d.custoDiaria)}`
                : '—'}
            </div>
          </div>
          {/* ⚠ NAO HA CAMPO DE NUTRICAO, e a ausencia e' a correcao — PR-OC-VENDA-NUTRICAO-DUPLICADA-01.
              A DIARIA JA E A NUTRICAO: e' o que o boitel cobra para alimentar o gado. Um
              campo "Nutrição (total)" ao lado das Diárias era o mesmo conceito pedido duas
              vezes, e somava em cima. */}
          <CampoNum label="Sanidade (total)" valor={d.custoSanidade} onChange={v => set('custoSanidade', v)} sufixo="R$"
            derivado={porCabeca(d.custoSanidade, qtd)} />
          {/* ⚠ FICA NA TELA E FORA DA SOMA. O frete é custo operacional do produtor, pago
              por fora — o rodapé abaixo não o inclui, e o campo diz isso em vez de deixar
              o operador descobrir subtraindo. */}
          <CampoNum label="Frete (total)" valor={d.custoFrete} onChange={v => set('custoFrete', v)} sufixo="R$"
            derivado={d.custoFrete > 0
              ? `${formatMoeda(d.custoFrete / (qtd || 1))} por cab. — custo do produtor, fora do custo do boitel`
              : 'Custo do produtor, fora do custo do boitel'} />
          <CampoNum label="Outros (total)" valor={d.outrosCustos} onChange={v => set('outrosCustos', v)} sufixo="R$"
            derivado={porCabeca(d.outrosCustos, qtd)} />
        </div>
        {/* ⚠ A LINHA "OUTROS CUSTOS" DO FINANCEIRO SOMA TRES COLUNAS — `outros_custos`,
            `custo_nutricao` e `custos_extras_parceria` (ver useBoitelOperacoes.ts). Das
            tres, so' `Outros` tem campo aqui: a nutrição saiu por ser a própria diária, e
            os extras de parceria são de uma modalidade que ainda não existe. As duas
            colunas ficam zeradas, então a linha do financeiro é o que se digita em Outros. */}
        <p className="text-[10px] text-muted-foreground">
          “Outros” vira uma obrigação chamada “Outros Custos” no financeiro.
        </p></>),
    comercializacao: (<><div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <CampoNum label="Preço de venda" valor={d.precoVendaArroba} onChange={v => set('precoVendaArroba', v)} sufixo="R$/@" obrigatorio />
          {/* ⚠ TOTAL, não por cabeça. Medido no acerto real: DAEMS/GTA de R$ 4.514,57
              contra faturamento de R$ 813 mil. */}
          <CampoNum label="Despesas com notas e docs. no abate" valor={d.despesasAbate} onChange={v => set('despesasAbate', v)} sufixo="R$" />
        </div>

        {/* ⚠ A MORTE FICOU AQUI, e os dois campos juntos. É no acerto que ela se sabe e se
            liquida, e a indenização entra no faturamento bruto — o próprio rodapé deste
            modal. A quantidade também reduz as diárias, no modal de Custos. */}
        <div className="rounded-md border bg-card p-2.5 shadow-sm space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-primary/90">Morte no período</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <CampoNum label="Quantidade de mortes" valor={d.morteQuantidade ?? 0} onChange={v => set('morteQuantidade', v)} casas={0} />
            <CampoNum label="Valor de indenização" valor={d.morteValorIndenizacao ?? 0} onChange={v => set('morteValorIndenizacao', v)} sufixo="R$" />
          </div>
          {/* ⚠ INDENIZAÇÃO EXISTE MAS NEM SEMPRE ACONTECE — medido: 1 morte, indenização
              zero; o boitel só deixou de cobrar a diária dela. E o lote continua sendo o
              lote inteiro nas métricas por cabeça. */}
          <p className="text-[10px] text-muted-foreground">
            A indenização soma ao faturamento. O lote continua sendo de {qtd || '—'} cabeças
            nas métricas por cabeça; o que muda é a diária, cobrada de {sairam} que saíram.
          </p>
        </div></>),
    adiantamento: (<><div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Houve adiantamento:</span>
          <Button type="button" size="sm" variant={d.possuiAdiantamento ? 'default' : 'outline'}
            className="h-8 text-[12px] px-3" onClick={() => set('possuiAdiantamento', true)}>Sim</Button>
          <Button type="button" size="sm" variant={!d.possuiAdiantamento ? 'default' : 'outline'}
            className="h-8 text-[12px] px-3"
            onClick={() => onChange({ ...d, possuiAdiantamento: false, dataAdiantamento: '',
              valorAdiantamentoDiarias: 0, valorAdiantamentoSanitario: 0, valorAdiantamentoOutros: 0,
              adiantamentoObservacao: '' })}>Não</Button>
        </div>

        {/* Com "não", os campos somem — e o estado deles some junto, no clique acima. */}
        {d.possuiAdiantamento && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            <div className="min-w-0">
              <Label className="text-[10px] text-muted-foreground">Data do adiantamento</Label>
              {/* A20 — DatePicker do sistema. */}
              <DatePicker value={d.dataAdiantamento} onChange={v => set('dataAdiantamento', v)}
                className="mt-[3px] h-8 px-2.5 text-[12px]" />
            </div>
            {/* ⚠ VALOR CHEIO DIGITADO, sem dias e sem percentual: o acerto varia por
                contrato e o cálculo é feito fora. O percentual que existia no simulador
                antigo não vem para cá. */}
            <CampoNum label="Valor total adiantado" valor={d.valorAdiantamentoDiarias} onChange={v => set('valorAdiantamentoDiarias', v)} sufixo="R$" />
            <CampoNum label="Sanitário adiantado" valor={d.valorAdiantamentoSanitario} onChange={v => set('valorAdiantamentoSanitario', v)} sufixo="R$" />
            <CampoNum label="Outros adiantados" valor={d.valorAdiantamentoOutros} onChange={v => set('valorAdiantamentoOutros', v)} sufixo="R$" />
            <div className="min-w-0 lg:col-span-2">
              <Label className="text-[10px] text-muted-foreground">Observação</Label>
              <Input value={d.adiantamentoObservacao} onChange={e => set('adiantamentoObservacao', e.target.value)}
                placeholder="Opcional" className="mt-[3px] h-8 px-2.5 text-[12px]" />
            </div>
          </div>
        )}</>),
  };

  return (
    <div className="space-y-2 min-w-0">
      {secoes.map(sec => (
        <SecaoAcordeao key={sec.id} titulo={sec.titulo} resumo={sec.resumo} pendente={sec.pendente}
          aberta={abertas.has(sec.id)} onToggle={() => { if (!somenteLeitura) alternar(sec.id); }}>
          {corpos[sec.id]}
        </SecaoAcordeao>
      ))}

      {/* ⚠ O CUSTO DE OPORTUNIDADE FICA FORA DAS SECOES, na aba — decisão do Gabriel. Não
          é um custo que o boitel cobra: é o que o capital renderia noutro lugar, e somá-lo
          com diária e frete misturaria desembolso com comparação.
          A unidade é R$/kg de peso de saída da fazenda — `coT = co x peso x cabeças`, como
          no simulador antigo ("Custo oport. R$/kg"). */}
      <div className="rounded-md border bg-card px-3 py-2 shadow-sm flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 w-44">
          <CampoNum label="Custo de oportunidade" valor={d.custoOportunidade}
            onChange={v => set('custoOportunidade', v)} sufixo="R$/kg" desabilitado={somenteLeitura} />
        </div>
        <div className="flex items-baseline gap-2 pb-2">
          <span className="text-[10px] text-muted-foreground">No lote</span>
          <span className={`text-[12px] font-medium tabular-nums ${der.coT > 0 ? '' : 'text-muted-foreground font-normal'}`}>
            {der.coT > 0 ? formatMoeda(der.coT) : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
