/**
 * BoitelBlocosModais — a ENTRADA de dado do boitel, na aba de Negociação da venda.
 *
 * PR-OC-VENDA-BOITEL-01B. O 01A entregou a leitura; este entrega a escrita.
 *
 * ⚠ UI PURA. Nenhuma regra nasce aqui. A lista dos cinco campos obrigatórios vive na
 * RPC `oc_salvar_boitel` (aa4f2630); esta tela repete o AVISO para o operador não
 * descobrir o impedimento só no fim — a lição do peso da morte, em 45a7352b.
 *
 * ⚠ NÃO GRAVA. Os quatro modais editam o objeto em memória e devolvem ao pai. Quem
 * persiste é o botão da venda, numa chamada só — o padrão de `oc_salvar_lotes`, e a
 * mesma forma que o simulador antigo já tem (`handleSave` devolve ao pai, não ao banco).
 *
 * ⚠ NÃO COPIEI AS MEDIDAS DO SIMULADOR ANTIGO. Lá os campos são 7–9px, abaixo do piso
 * de 10px de docs/PADROES-UI.md. As formas aqui são as do repositório: A16 (mesma
 * altura de campo), A17 (par rótulo-valor), A18 (linha densa de duas alturas), A19
 * (dinheiro sempre formatado), A20 (DatePicker, nunca `input type=date`).
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { ChevronRight, X } from 'lucide-react';
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

/** O payload de `oc_salvar_boitel`. Uma função só, e é o único lugar que traduz nomes. */
export function payloadBoitel(d: BoitelEdicao): Record<string, unknown> {
  return {
    nome_boitel: d.nomeBoitel || null,
    lote_codigo: d.lote || null,
    numero_contrato: d.numeroContrato || null,
    data_envio: d.dataEnvio || null,
    peso_saida_fazenda_kg: d.pesoInicial || null,
    dias: d.dias || null,
    gmd: d.gmd || null,
    quebra_viagem_pct: d.quebraViagem || null,
    rendimento_entrada_pct: d.rendimentoEntrada || null,
    rendimento_saida_pct: d.rendimento || null,
    /* ⚠ SEMPRE 'diaria'. O CHECK do banco recusa as outras duas, e o seletor desta tela
       não as oferece — mandar outra coisa seria pedir um erro que a tela já sabe. */
    modalidade_custo: 'diaria',
    custo_diaria: d.custoDiaria || null,
    custo_nutricao: d.custoNutricao || null,
    custo_sanidade: d.custoSanidade || null,
    custo_frete: d.custoFrete || null,
    outros_custos: d.outrosCustos || null,
    custo_oportunidade: d.custoOportunidade || null,
    preco_venda_arroba: d.precoVendaArroba || null,
    /* ⚠ UM CAMPO SÓ — a unificação com `custoNfAbate` saiu no 01A. */
    despesas_abate: d.despesasAbate || null,
    possui_adiantamento: !!d.possuiAdiantamento,
    data_adiantamento: d.dataAdiantamento || null,
    valor_adiantamento_diarias: d.valorAdiantamentoDiarias || null,
    valor_adiantamento_sanitario: d.valorAdiantamentoSanitario || null,
    valor_adiantamento_outros: d.valorAdiantamentoOutros || null,
    adiantamento_observacao: d.adiantamentoObservacao || null,
    morte_quantidade: d.morteQuantidade ?? null,
    morte_valor_indenizacao: d.morteValorIndenizacao ?? null,
  };
}

/** Um boitel em branco, com as cabeças e o peso vindos da própria venda. */
export function boitelVazio(qtdCabecas: number, pesoInicial: number): BoitelEdicao {
  return {
    qtdCabecas, pesoInicial, fazendaOrigem: '', nomeBoitel: '', lote: '', numeroContrato: '',
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

   ⚠ O QUE CONTINUA DUPLICADO, E É DÍVIDA DECLARADA: `custoTotalDoBoitel` soma nutrição e
   frete, e o `custoTotalBoitel` do painel não — lá é `diárias + sanidade + outros`, como no
   simulador antigo, onde o frete só entra no custo OPERACIONAL e a nutrição não entrava em
   conta nenhuma. Um rodapé precisa somar os campos que estão acima dele, então esta soma
   não pode simplesmente adotar a de lá. Qual das duas é "o custo do boitel" é decisão de
   produto, e está reportada. Frete > 0 em 6 dos 10 registros: a divergência é visível hoje. */
export function custoTotalDoBoitel(d: BoitelEdicao): number {
  return derivadosBoitel(d).cDT + (d.custoSanidade || 0) + (d.custoNutricao || 0)
       + (d.custoFrete || 0) + (d.outrosCustos || 0);
}
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

/** A casca dos quatro modais: cabeçalho azul, corpo, e o número que o bloco produz. */
function ModalBloco({ open, onOpenChange, titulo, contexto, children, rodape }: {
  open: boolean; onOpenChange: (v: boolean) => void; titulo: string;
  contexto: React.ReactNode; children: React.ReactNode; rodape: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden [&>button.absolute]:hidden">
        <div className="bg-primary text-primary-foreground px-4 py-2.5 flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight">{titulo}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-white/80 tabular-nums">
              {contexto}
            </div>
          </div>
          <button type="button" onClick={() => onOpenChange(false)}
            className="text-white/80 hover:text-white shrink-0" title="Fechar" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 bg-muted/30">
          {children}
          {/* RODAPÉ DO CORPO — o número que este bloco produz. */}
          <div className="rounded-md border bg-card px-3 py-2 shadow-sm flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            {rodape}
          </div>
        </div>
        <div className="bg-card border-t px-4 py-2 flex justify-end">
          <Button type="button" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-[12px]">
            Concluir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Par rótulo-valor do rodapé — A17. */
function Produz({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <span className={`text-[13px] font-bold tabular-nums ${valor ? '' : 'text-muted-foreground font-normal'}`}>
        {valor ?? '—'}
      </span>
    </div>
  );
}

/** Um dos quatro blocos clicáveis — A18, duas alturas. */
function BlocoClicavel({ identidade, contexto, numero, onClick, desabilitado }: {
  identidade: string; contexto: string; numero: string | null; onClick: () => void; desabilitado?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={desabilitado}
      className="w-full text-left rounded-md border bg-card px-3 py-2 shadow-sm transition-colors hover:bg-muted/50 disabled:opacity-60 disabled:hover:bg-card flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-tight">{identidade}</div>
        <div className="text-[10px] text-muted-foreground leading-tight truncate">{contexto}</div>
      </div>
      <div className={`text-[12px] font-medium tabular-nums shrink-0 ${numero ? '' : 'text-muted-foreground font-normal'}`}>
        {numero ?? '—'}
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
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
  const [aberto, setAberto] = useState<null | 'desempenho' | 'custos' | 'comercializacao' | 'adiantamento'>(null);
  const d = valor;
  const set = <K extends keyof BoitelEdicao>(k: K, v: BoitelEdicao[K]) => onChange({ ...d, [k]: v });

  const der = useMemo(() => derivadosBoitel(d), [d]);
  const qtd = d.qtdCabecas || 0;
  const sairam = cabecasQueSairam(d);
  const diarias = der.cDT;
  const custoTotal = custoTotalDoBoitel(d);
  const fatBruto = der.fba;
  const antecipado = antecipadoTotal(d);

  const temDesempenho = d.dias > 0 && d.gmd > 0 && d.rendimento > 0;
  const abrir = (q: typeof aberto) => () => { if (!somenteLeitura) setAberto(q); };

  return (
    <div className="space-y-1.5 min-w-0">
      <BlocoClicavel
        identidade="Desempenho"
        contexto={temDesempenho
          ? `GMD ${n3(d.gmd)} kg · ${d.dias} dias · rend. saída ${n2(d.rendimento)}%`
          : 'GMD, dias e rendimento de saída — não informados'}
        numero={temDesempenho ? formatArroba(der.aPcab) + '/cab' : null}
        onClick={abrir('desempenho')} desabilitado={somenteLeitura}
      />
      <BlocoClicavel
        identidade="Custos"
        contexto={diarias > 0 || custoTotal > 0
          ? `Diárias ${formatMoeda(diarias)} · nutrição ${formatMoeda(d.custoNutricao)} · sanidade ${formatMoeda(d.custoSanidade)} · frete ${formatMoeda(d.custoFrete)} · outros ${formatMoeda(d.outrosCustos)}`
          : 'Diária, nutrição, sanidade, frete e outros — não informados'}
        numero={custoTotal > 0 ? formatMoeda(custoTotal) : null}
        onClick={abrir('custos')} desabilitado={somenteLeitura}
      />
      <BlocoClicavel
        identidade="Comercialização"
        contexto={d.precoVendaArroba > 0
          ? `${formatMoeda(d.precoVendaArroba)}/@ · despesas de abate ${formatMoeda(d.despesasAbate)}`
          : 'Preço da @ e despesas de abate — não informados'}
        numero={fatBruto > 0 ? formatMoeda(fatBruto) : null}
        onClick={abrir('comercializacao')} desabilitado={somenteLeitura}
      />
      <BlocoClicavel
        identidade="Adiantamento"
        contexto={d.possuiAdiantamento
          ? (d.dataAdiantamento ? `Adiantado em ${d.dataAdiantamento.split('-').reverse().join('/')}` : 'Adiantamento sem data informada')
          : 'Não informado'}
        numero={d.possuiAdiantamento && antecipado > 0 ? formatMoeda(antecipado) : null}
        onClick={abrir('adiantamento')} desabilitado={somenteLeitura}
      />

      {/* ⚠ O CUSTO DE OPORTUNIDADE SAIU DO MODAL DE CUSTOS e ficou aqui, na aba, como
          campo opcional — decisao do Gabriel. E o unico campo de entrada que NAO esta'
          dentro de um modal, e por uma razao de natureza: ele nao e' um custo que o
          boitel cobra, e' o que o capital renderia noutro lugar. Somar com diaria e frete
          misturaria desembolso com comparacao.
          A unidade e' R$/kg de peso de saida da fazenda — `coT = co x peso x cabecas`,
          como no simulador antigo ("Custo oport. R$/kg"). */}
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

      {/* ── DESEMPENHO ───────────────────────────────────────────────────────── */}
      <ModalBloco open={aberto === 'desempenho'} onOpenChange={v => setAberto(v ? 'desempenho' : null)}
        titulo="Desempenho"
        contexto={<>
          <span>{qtd > 0 ? `${qtd} cabeças` : 'cabeças —'}</span>
          <span>{d.pesoInicial > 0 ? `saída da fazenda ${formatKg(d.pesoInicial)}` : 'peso de saída —'}</span>
        </>}
        rodape={<>
          <Produz rotulo="GMC (ganho médio de carcaça)" valor={temDesempenho ? `${n3(der.gmc)} kg/dia` : null} />
          <Produz rotulo="Arrobas produzidas por cabeça" valor={temDesempenho ? formatArroba(der.aPcab) : null} />
        </>}
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
          <CampoNum label="Dias de confinamento" valor={d.dias} onChange={v => set('dias', v)} casas={0} obrigatorio />
          <CampoNum label="GMD" valor={d.gmd} onChange={v => set('gmd', v)} casas={3} sufixo="kg/dia" obrigatorio />
          <CampoNum label="Quebra de viagem" valor={d.quebraViagem} onChange={v => set('quebraViagem', v)} sufixo="%" />
          <CampoNum label="Rendimento de entrada" valor={d.rendimentoEntrada} onChange={v => set('rendimentoEntrada', v)} sufixo="%" />
          <CampoNum label="Rendimento de saída" valor={d.rendimento} onChange={v => set('rendimento', v)} sufixo="%" obrigatorio />
        </div>
      </ModalBloco>

      {/* ── CUSTOS ───────────────────────────────────────────────────────────── */}
      <ModalBloco open={aberto === 'custos'} onOpenChange={v => setAberto(v ? 'custos' : null)}
        titulo="Custos"
        contexto={<>
          <span>{d.dias > 0 ? `${d.dias} dias` : 'dias —'}</span>
          <span>{qtd > 0 ? `${qtd} cabeças` : 'cabeças —'}</span>
        </>}
        rodape={<Produz rotulo="Custo total do boitel" valor={custoTotal > 0 ? formatMoeda(custoTotal) : null} />}
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3 items-start">
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
          <CampoNum label="Nutrição (total)" valor={d.custoNutricao} onChange={v => set('custoNutricao', v)} sufixo="R$"
            derivado={porCabeca(d.custoNutricao, qtd)} />
          <CampoNum label="Sanidade (total)" valor={d.custoSanidade} onChange={v => set('custoSanidade', v)} sufixo="R$"
            derivado={porCabeca(d.custoSanidade, qtd)} />
          <CampoNum label="Frete (total)" valor={d.custoFrete} onChange={v => set('custoFrete', v)} sufixo="R$"
            derivado={porCabeca(d.custoFrete, qtd)} />
          <CampoNum label="Outros (total)" valor={d.outrosCustos} onChange={v => set('outrosCustos', v)} sufixo="R$"
            derivado={porCabeca(d.outrosCustos, qtd)} />
        </div>
        {/* ⚠ TRÊS CAMPOS VIRAM UMA LINHA SÓ NO FINANCEIRO: nutrição, outros e os extras de
            parceria somam numa obrigação chamada "Outros Custos". Ver useBoitelOperacoes.ts. */}
        <p className="text-[10px] text-muted-foreground">
          Nutrição e Outros são somados numa única obrigação, “Outros Custos”, no financeiro.
        </p>
      </ModalBloco>

      {/* ── COMERCIALIZAÇÃO ──────────────────────────────────────────────────── */}
      <ModalBloco open={aberto === 'comercializacao'} onOpenChange={v => setAberto(v ? 'comercializacao' : null)}
        titulo="Comercialização"
        contexto={<span>{temDesempenho && qtd > 0 ? `${formatArroba(der.aTS)} de carcaça na saída` : 'arrobas de carcaça —'}</span>}
        rodape={<Produz rotulo="Faturamento bruto" valor={fatBruto > 0 ? formatMoeda(fatBruto) : null} />}
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
        </div>
      </ModalBloco>

      {/* ── ADIANTAMENTO ─────────────────────────────────────────────────────── */}
      <ModalBloco open={aberto === 'adiantamento'} onOpenChange={v => setAberto(v ? 'adiantamento' : null)}
        titulo="Adiantamento"
        contexto={<span>{custoTotal > 0 ? `custo total ${formatMoeda(custoTotal)}` : 'custo total —'}</span>}
        rodape={<>
          <Produz rotulo="Antecipado" valor={d.possuiAdiantamento && antecipado > 0 ? formatMoeda(antecipado) : null} />
          <span className="text-[10px] text-muted-foreground">Valor será reembolsado no acerto final.</span>
        </>}
      >
        <div className="flex items-center gap-2">
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
        )}
      </ModalBloco>
    </div>
  );
}
