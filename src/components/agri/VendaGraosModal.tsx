/**
 * VENDER DO ESTOQUE — o documento inteiro, de bruto a parcela (F3.1).
 *
 * ⚠ O FLUXO É VERTICAL, UMA COLUNA — regra do roadmap, e o molde é o `AbateDetalhesDialog`:
 * BASE → DEDUÇÕES → LÍQUIDO → PAGAMENTO, nessa ordem, descendo. Um split de duas colunas põe o
 * líquido ao lado da base e o operador perde a única coisa que a tela precisa ensinar: que um
 * número VEM do outro. É a mesma razão pela qual o funrural do abate mora abaixo do valor base,
 * e não ao lado.
 *
 * ⚠ ELE CRESCEU DO `VendaAvulsaModal`, que era só o bloco 1. O nome mudou junto: "avulsa" era o
 * que ela era enquanto não tinha dedução nem parcela — hoje é uma operação comercial completa,
 * como o barter e a OC, e o arquivo diz isso.
 *
 * ⚠⚠ NENHUMA CONTA AQUI É SOBERANA. `agri_venda_graos_registrar` calcula bruto, líquido e o rateio
 * das parcelas; o front repete a MESMA conta (round2 por linha, soma depois) só para PREVER e para
 * travar o botão quando as parcelas não fecham. Onde os dois discordarem, quem vale é a RPC — e é
 * por isso que a prévia usa exatamente o arredondamento dela, item a item.
 */
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { FornecedorSelect } from '@/components/shared/FornecedorSelect';
import { ContaBancariaSelect, type ContaSelecionavel } from '@/components/shared/ContaBancariaSelect';
import { CINZA_CABECALHO, TH_CINZA as TH } from '@/lib/idiomaVisual';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { CampoMoeda, CampoNumero } from '@/components/ui/campo-moeda';
import { parseMoeda, round2, formatCasas } from '@/lib/calculos/numeroBR';
import { Save, AlertTriangle, X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { rotuloCulturaUnidade, unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse, LancamentoSubstituivel } from '@/hooks/useEstoqueGraos';

/** O que o modal devolve para quem chama `agri_venda_graos_registrar`. */
export interface VendaGraosPayload {
  comprador_id: string;
  data: string;
  itens: Array<{ classe: string; sacas: number; preco: number | null }>;
  /** `null` = critério PREÇO (a RPC soma os itens). Informado = critério VALOR TOTAL. */
  valor_bruto: number | null;
  senar: number;
  descontos: Array<{ descricao: string; valor: number }>;
  parcelas: Array<{
    vencimento: string; valor: number; pago: boolean;
    data_pagamento: string | null; conta_id: string | null;
  }>;
  observacoes: string | null;
  substituir: string[] | null;
}

/** O Senar da agricultura — 0,2% sobre o bruto. Editável, e pode ser zero. */
const SENAR_PCT_PADRAO = 0.2;

interface ParcelaForm {
  vencimento: string; valor: string; pago: boolean;
  dataPagamento: string; contaId: string;
}

const novaParcela = (): ParcelaForm =>
  ({ vencimento: '', valor: '', pago: false, dataPagamento: '', contaId: '' });

export function VendaGraosModal({
  aberto, onFechar, onRegistrar, salvando, estoque, cultura, safraRotulo,
  clienteId, contas, substituiveis,
}: {
  aberto: boolean;
  onFechar: () => void;
  onRegistrar: (p: VendaGraosPayload) => void;
  salvando: boolean;
  estoque: readonly EstoqueClasse[];
  cultura: string;
  safraRotulo: string;
  clienteId: string;
  contas: ContaSelecionavel[];
  /** Lançamentos manuais que esta venda pode substituir. Vazio = o bloco nem aparece. */
  substituiveis: readonly LancamentoSubstituivel[];
}) {
  const [criterio, setCriterio] = useState<'preco' | 'valor'>('preco');
  const [valorTotal, setValorTotal] = useState('');
  const [itens, setItens] = useState<Record<string, { sacas: string; preco: number | null }>>({});
  const [senarPct, setSenarPct] = useState(String(SENAR_PCT_PADRAO).replace('.', ','));
  const [senarReais, setSenarReais] = useState('');
  const [senarTocado, setSenarTocado] = useState(false);
  const [descontos, setDescontos] = useState<Array<{ descricao: string; valor: string }>>([]);
  const [condicao, setCondicao] = useState<'avista' | 'aprazo'>('avista');
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([novaParcela()]);
  const [compradorId, setCompradorId] = useState('');
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');
  const [substituir, setSubstituir] = useState<Set<string>>(new Set());
  const [abreSubstituir, setAbreSubstituir] = useState(false);

  const unidade = unidadeCurtaDaCultura(cultura);

  /* ⚠ RECOMEÇA A CADA ABERTURA — sem isto, reabrir traz a venda anterior e um Registrar distraído
     vende o mesmo grão duas vezes. O preço nasce no `preco_ref` da classe: é um palpite honesto,
     porque é o que já se praticou naquela classe. */
  useEffect(() => {
    if (!aberto) return;
    const inicial: Record<string, { sacas: string; preco: number | null }> = {};
    for (const c of estoque) inicial[c.classe] = { sacas: '', preco: c.preco_ref > 0 ? c.preco_ref : null };
    setItens(inicial);
    setCriterio('preco'); setValorTotal('');
    setSenarPct(String(SENAR_PCT_PADRAO).replace('.', ',')); setSenarReais(''); setSenarTocado(false);
    setDescontos([]); setCondicao('avista'); setParcelas([novaParcela()]);
    setCompradorId(''); setObs(''); setSubstituir(new Set()); setAbreSubstituir(false);
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto, estoque]);

  /**
   * AS LINHAS, COM O PREÇO QUE VALE EM CADA CRITÉRIO.
   *
   * ⚠ NO CRITÉRIO "VALOR TOTAL" O PREÇO É DERIVADO, e a conta é a da RPC: se o operador informou
   * preços, eles viram PESO — `fator = valor / soma(sacas × preço)` — e cada classe fica com
   * `preço × fator`. Se não informou nenhum, o rateio é por saca: `valor / total de sacas`.
   * ⚠ POR QUE PESO E NÃO MÉDIA: um documento de duas classes raramente as paga igual, e o operador
   * sabe a proporção mesmo quando não sabe o preço exato. Ratear tudo por saca achataria grão bom
   * e roça no mesmo valor.
   */
  const linhas = useMemo(() => {
    const brutos = estoque.map(c => {
      const sacas = parseMoeda(itens[c.classe]?.sacas ?? '') ?? 0;
      const preco = itens[c.classe]?.preco ?? 0;
      return { classe: c.classe, sacas, preco };
    });
    const somaAoPreco = brutos.reduce((a, b) => a + round2(b.sacas * b.preco), 0);
    const somaSacas = brutos.reduce((a, b) => a + b.sacas, 0);
    const alvo = criterio === 'valor' ? (parseMoeda(valorTotal) ?? 0) : 0;
    const fator = criterio === 'valor' && somaAoPreco > 0 ? alvo / somaAoPreco : 0;

    return estoque.map(c => {
      const b = brutos.find(x => x.classe === c.classe)!;
      const precoEfetivo = criterio === 'preco' ? b.preco
        : somaAoPreco > 0 ? b.preco * fator
          : somaSacas > 0 ? alvo / somaSacas : 0;
      return {
        ...c,
        sacas: b.sacas,
        precoDigitado: b.preco,
        precoEfetivo,
        total: round2(b.sacas * precoEfetivo),
        excede: b.sacas > c.saldo + 0.005,
        travada: c.saldo <= 0,
        sobra: Math.max(c.saldo - b.sacas, 0),
      };
    });
  }, [estoque, itens, criterio, valorTotal]);

  const vendidas = linhas.reduce((a, l) => a + l.sacas, 0);
  const sobraTotal = linhas.reduce((a, l) => a + l.sobra, 0);
  const saldoAtual = linhas.reduce((a, l) => a + l.saldo, 0);
  const excede = linhas.some(l => l.excede);

  /* ⚠ O BRUTO É O CRITÉRIO, não a soma sempre: no "valor total" quem manda é o documento, e a
     soma das linhas apenas o distribui. Trocar isso faria a tela mostrar um bruto e a RPC gravar
     outro, por centavos de rateio. */
  const bruto = criterio === 'valor'
    ? (parseMoeda(valorTotal) ?? 0)
    : linhas.reduce((a, l) => a + l.total, 0);

  /**
   * SENAR: O % E O R$ SE PERSEGUEM, como o funrural do abate.
   *
   * ⚠ ENQUANTO NINGUÉM TOCA, o R$ segue o bruto — mudar a quantidade vendida recalcula a dedução
   * sozinha, que é o que o operador espera. Depois do primeiro toque, o que ele escreveu manda:
   * um documento pode trazer um Senar que não é exatamente 0,2%, e sobrescrevê-lo seria apagar o
   * dado do papel.
   */
  const senar = useMemo(() => {
    if (senarTocado) return parseMoeda(senarReais) ?? 0;
    return round2(bruto * (parseMoeda(senarPct) ?? 0) / 100);
  }, [senarTocado, senarReais, senarPct, bruto]);

  const mudarSenarPct = (v: string) => {
    setSenarPct(v);
    setSenarTocado(true);
    setSenarReais(formatCasas(round2(bruto * (parseMoeda(v) ?? 0) / 100), 2));
  };
  const mudarSenarReais = (v: string) => {
    setSenarReais(v);
    setSenarTocado(true);
    const n = parseMoeda(v) ?? 0;
    setSenarPct(bruto > 0 ? formatCasas(round2(n / bruto * 100), 2) : '0,00');
  };

  const totalDescontos = descontos.reduce((a, d) => a + (parseMoeda(d.valor) ?? 0), 0);
  const liquido = round2(bruto - senar - totalDescontos);

  /* ⚠ À VISTA É UMA PARCELA, e ela não é um caso especial no banco: a RPC recebe `p_parcelas`
     sempre. Aqui o toggle só monta a parcela única com a data da venda e já paga — o operador não
     digita duas vezes o que já disse. */
  const parcelasEfetivas: ParcelaForm[] = condicao === 'avista'
    ? [{ vencimento: data, valor: formatCasas(liquido, 2), pago: true, dataPagamento: data,
         contaId: parcelas[0]?.contaId ?? '' }]
    : parcelas;

  const somaParcelas = parcelasEfetivas.reduce((a, p) => a + (parseMoeda(p.valor) ?? 0), 0);
  const diferenca = round2(liquido - somaParcelas);
  const fecha = Math.abs(diferenca) <= 0.01;

  const dividirIgual = () => {
    const n = parcelas.length;
    if (n === 0 || liquido <= 0) return;
    /* ⚠ O RESÍDUO VAI NA ÚLTIMA — dividir 10.000 em 3 dá 3.333,33 duas vezes e 3.333,34 uma. Sem
       isso a soma fecha um centavo abaixo e a RPC recusa com `PARCELAS_NAO_FECHAM_LIQUIDO`. */
    const base = round2(liquido / n);
    setParcelas(parcelas.map((p, i) => ({
      ...p,
      valor: formatCasas(i === n - 1 ? round2(liquido - base * (n - 1)) : base, 2),
    })));
  };

  const impedimento = vendidas <= 0 ? `Informe quantas ${unidade === 't' ? 'toneladas' : 'sacas'} vender.`
    : excede ? 'Há classe acima do saldo em estoque.'
      : bruto <= 0 ? (criterio === 'valor' ? 'Informe o valor total do documento.' : 'Informe o preço das classes que está vendendo.')
        : liquido <= 0 ? 'As deduções não podem consumir o valor da venda.'
          : !compradorId ? 'Escolha o comprador.'
            : !data ? 'Informe a data da venda.'
              : parcelasEfetivas.some(p => !p.vencimento) ? 'Informe o vencimento de cada parcela.'
                : parcelasEfetivas.some(p => !p.contaId) ? 'Escolha a conta de cada parcela.'
                  : !fecha ? `As parcelas não fecham o líquido — diferença de ${formatMoeda(Math.abs(diferenca))}.`
                    : null;

  const registrar = () => {
    if (impedimento) return;
    onRegistrar({
      comprador_id: compradorId,
      data,
      /* ⚠ MANDA O PREÇO DIGITADO, não o derivado: no critério "valor total" quem deriva é a RPC, e
         mandar o derivado faria a conta acontecer duas vezes, com dois arredondamentos. */
      itens: linhas.filter(l => l.sacas > 0)
        .map(l => ({ classe: l.classe, sacas: l.sacas, preco: l.precoDigitado > 0 ? l.precoDigitado : null })),
      valor_bruto: criterio === 'valor' ? bruto : null,
      senar,
      descontos: descontos
        .filter(d => (parseMoeda(d.valor) ?? 0) > 0)
        .map(d => ({ descricao: d.descricao.trim() || 'Desconto', valor: parseMoeda(d.valor) ?? 0 })),
      parcelas: parcelasEfetivas.map(p => ({
        vencimento: p.vencimento,
        valor: parseMoeda(p.valor) ?? 0,
        pago: p.pago,
        data_pagamento: p.pago ? (p.dataPagamento || p.vencimento) : null,
        conta_id: p.contaId || null,
      })),
      observacoes: obs.trim() || null,
      substituir: substituir.size > 0 ? [...substituir] : null,
    });
  };

  /** Uma linha do bloco de deduções — rótulo à esquerda, R$ à direita (A17). */
  const LinhaConta = ({ rotulo, children, destaque }: {
    rotulo: React.ReactNode; children: React.ReactNode; destaque?: boolean;
  }) => (
    <div className={cn('flex items-center gap-2 py-0.5', destaque && 'border-t pt-1.5')}>
      <div className={cn('min-w-0 flex-1 truncate text-[11px]',
        destaque ? 'font-semibold' : 'text-muted-foreground')}>{rotulo}</div>
      <div className={cn('shrink-0 tabular-nums', destaque ? 'text-[13px] font-bold' : 'text-[11px]')}>
        {children}
      </div>
    </div>
  );

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Vender do estoque · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {formatNum(saldoAtual, 2)} {unidade} disponíveis. A venda baixa o estoque e gera os
              lançamentos no Financeiro, parcela a parcela.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* ⚠ `min-w-0` — `DialogContent` é grid; sem isto o conteúdo largo clipa (df1b32a0).
            ⚠ E A ROLAGEM É DESTE BLOCO, não do diálogo: são cinco blocos empilhados, e o cabeçalho
            azul e o rodapé têm de ficar. */}
        <div className="max-h-[70vh] min-w-0 space-y-3 overflow-y-auto px-3 py-2">

          {/* ── BLOCO 1 — COMPOSIÇÃO ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{rotuloCulturaUnidade(cultura)}</p>
              {/* ⚠ O CRITÉRIO É UM TOGGLE, como o À vista/A prazo: são dois jeitos de dizer o mesmo
                  documento, e ver os dois lado a lado explica a diferença sem abrir nada. */}
              <div className="flex h-8 w-fit overflow-hidden rounded-md border">
                {([['preco', 'Preço por saca'], ['valor', 'Valor total']] as const).map(([v, r]) => (
                  <button key={v} type="button" onClick={() => setCriterio(v)}
                    className={cn('px-3 text-[11px] font-medium transition-colors',
                      criterio === v ? 'bg-primary text-primary-foreground'
                        : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {criterio === 'valor' && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                <div className="w-[190px]">
                  <Label className="text-[10px]">Valor total do documento (R$) <span className="text-destructive">*</span></Label>
                  <CampoNumero valor={valorTotal} onChange={setValorTotal} casas={2}
                    className="mt-0.5 h-8 text-right text-[12px]" />
                </div>
                {/* ⚠ O TEXTO EXPLICA O QUE O PREÇO VIRA, porque a coluna fica travada e ninguém
                    adivinha por quê: com preços informados eles são PESO do rateio; sem nenhum, o
                    rateio é por saca. */}
                <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">
                  O R$/{unidade} de cada classe é derivado do total. Com preços informados eles
                  entram como <strong>peso</strong> do rateio; em branco, rateia por saca.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-md border">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  {['22%', '14%', '17%', '17%', '15%', '15%'].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th className={cn(TH, 'text-left')}>Classe</th>
                    <th className={cn(TH, 'text-right')}>Em estoque</th>
                    <th className={cn(TH, 'text-right')}>Vender ({unidade})</th>
                    <th className={cn(TH, 'text-right')}>R$ / {unidade}</th>
                    <th className={cn(TH, 'text-right')}>Total</th>
                    <th className={cn(TH, 'text-right')}>Saldo final</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(l => (
                    <tr key={l.classe} className={cn('border-t border-slate-100', l.travada && 'opacity-45')}>
                      <td className="truncate px-2 py-1 text-[11px]">
                        <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                          corDaClasse(l.classe))} />
                        {labelDaClasse(l.classe)}
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] tabular-nums">{formatNum(l.saldo, 2)}</td>
                      <td className="px-1 py-1">
                        <CampoNumero valor={itens[l.classe]?.sacas ?? ''} disabled={l.travada}
                          casas={4} title={itens[l.classe]?.sacas ?? ''}
                          onChange={v => setItens(o => ({
                            ...o, [l.classe]: { ...(o[l.classe] ?? { preco: null }), sacas: v },
                          }))}
                          className={cn('h-7 text-right text-[11px]',
                            l.excede && 'border-destructive focus-visible:ring-destructive')} />
                        {l.excede && (
                          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-destructive">
                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                            acima do saldo ({formatNum(l.saldo, 2)} {unidade})
                          </div>
                        )}
                      </td>
                      <td className="px-1 py-1">
                        {criterio === 'valor' ? (
                          /* ⚠ TRAVADO E MUDO no critério do valor — mostrar o derivado num campo
                             editável convidaria a corrigi-lo, e a correção seria desfeita no
                             próximo rateio. */
                          <div className="truncate px-1 text-right text-[11px] tabular-nums text-muted-foreground"
                            title={l.precoEfetivo ? formatCasas(l.precoEfetivo, 4) : undefined}>
                            {l.precoEfetivo > 0 ? formatCasas(l.precoEfetivo, 4) : '—'}
                          </div>
                        ) : (
                          <CampoMoeda valor={itens[l.classe]?.preco ?? null} disabled={l.travada}
                            casas={4}
                            onChange={v => setItens(o => ({
                              ...o, [l.classe]: { ...(o[l.classe] ?? { sacas: '' }), preco: v },
                            }))}
                            className="h-7 text-right text-[11px]" />
                        )}
                      </td>
                      <td className="px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                        {l.total > 0 ? formatMoeda(l.total) : '—'}
                      </td>
                      <td className={cn('px-2 py-1 text-right text-[11px] font-medium tabular-nums',
                        l.sacas > 0 && 'text-success')}>
                        {formatNum(l.sobra, 2)}
                      </td>
                    </tr>
                  ))}
                  <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                    <td className="px-2 py-1 text-[11px] font-bold">Total</td>
                    <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">{formatNum(saldoAtual, 2)}</td>
                    <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                      {vendidas > 0 ? formatNum(vendidas, 2) : '—'}
                    </td>
                    {/* ⚠ R$/sc NÃO TEM TOTAL: média de preços de classes diferentes não é um preço. */}
                    <td className="px-2 py-1" />
                    <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                      {bruto > 0 ? formatMoeda(bruto) : '—'}
                    </td>
                    <td className="px-2 py-1 text-right text-[11px] font-bold tabular-nums">{formatNum(sobraTotal, 2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── BLOCO 2 — DEDUÇÕES ───────────────────────────────────────────────────────── */}
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <LinhaConta rotulo="= Bruto">{bruto > 0 ? formatMoeda(bruto) : '—'}</LinhaConta>
            <div className="flex items-center gap-2 py-0.5">
              <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">(−) Senar</div>
              {/* ⚠ OS DOIS CAMPOS SÃO O MESMO NÚMERO — mexer num escreve o outro, como o funrural
                  do abate. O operador tem o % na cabeça e o R$ no documento; obrigá-lo a converter
                  seria pedir uma conta que a tela sabe fazer. */}
              <div className="flex shrink-0 items-center gap-1">
                <CampoNumero valor={senarPct} onChange={mudarSenarPct} casas={2}
                  className="h-7 w-[64px] text-right text-[11px]" />
                <span className="text-[10px] text-muted-foreground">%</span>
                <CampoNumero valor={senarTocado ? senarReais : formatCasas(senar, 2)}
                  onChange={mudarSenarReais} casas={2}
                  className="h-7 w-[104px] text-right text-[11px]" />
              </div>
            </div>
            {descontos.map((d, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <Input value={d.descricao} placeholder="Secagem, armazenagem…"
                  onChange={e => setDescontos(o => o.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
                  className="h-7 min-w-0 flex-1 text-[11px]" />
                <CampoNumero valor={d.valor} casas={2}
                  onChange={v => setDescontos(o => o.map((x, j) => j === i ? { ...x, valor: v } : x))}
                  className="h-7 w-[104px] shrink-0 text-right text-[11px]" />
                <button type="button" title="Remover desconto" aria-label="Remover desconto"
                  onClick={() => setDescontos(o => o.filter((_, j) => j !== i))}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setDescontos(o => [...o, { descricao: '', valor: '' }])}
              className="mt-0.5 inline-flex items-center gap-1 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus className="h-3 w-3" /> outro desconto
            </button>
            <LinhaConta rotulo="= Líquido a receber" destaque>
              {liquido > 0 ? formatMoeda(liquido) : '—'}
            </LinhaConta>
          </div>

          {/* ── BLOCO 3 — RECEBIMENTO ────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label className="text-[10px]">Recebimento</Label>
                <div className="mt-0.5 flex h-8 w-fit overflow-hidden rounded-md border">
                  {(['avista', 'aprazo'] as const).map(c => (
                    <button key={c} type="button" onClick={() => setCondicao(c)}
                      className={cn('px-3 text-[11px] font-medium transition-colors',
                        condicao === c ? 'bg-primary text-primary-foreground'
                          : 'bg-transparent text-muted-foreground hover:bg-muted')}>
                      {c === 'avista' ? 'À vista' : 'A prazo'}
                    </button>
                  ))}
                </div>
              </div>
              {condicao === 'aprazo' && (
                <div className="flex items-end gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                    onClick={dividirIgual} disabled={liquido <= 0}
                    title="Preenche os valores dividindo o líquido; o resíduo vai na última">
                    Dividir igual
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                    onClick={() => setParcelas(o => [...o, novaParcela()])}>
                    <Plus className="h-3.5 w-3.5" /> parcela
                  </Button>
                </div>
              )}
            </div>

            {condicao === 'avista' ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Conta que recebe <span className="text-destructive">*</span></Label>
                  <ContaBancariaSelect value={parcelas[0]?.contaId ?? ''} contas={contas}
                    onValueChange={v => setParcelas(o => [{ ...(o[0] ?? novaParcela()), contaId: v }])}
                    placeholder="Escolha" className="mt-0.5 h-8 text-[12px]" />
                </div>
                {/* ⚠ À VISTA NÃO PEDE VENCIMENTO NEM VALOR: são a data da venda e o líquido. Pedir
                    de novo é convidar a divergirem. */}
                <div className="flex items-end">
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Uma parcela de <strong className="tabular-nums">{formatMoeda(liquido)}</strong>,
                    paga em {data ? formatIsoToBr(data) : '—'}.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {parcelas.map((p, i) => (
                  <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_auto_1fr_1.4fr_auto]">
                    <div>
                      <Label className="text-[10px]">Vencimento <span className="text-destructive">*</span></Label>
                      <DatePicker value={p.vencimento} className="mt-0.5"
                        onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, vencimento: v } : x))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Valor <span className="text-destructive">*</span></Label>
                      <CampoNumero valor={p.valor} casas={2} className="mt-0.5 h-8 text-right text-[12px]"
                        onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Pago?</Label>
                      <div className="mt-0.5 flex h-8 items-center">
                        <Checkbox checked={p.pago}
                          onCheckedChange={c => setParcelas(o => o.map((x, j) => j === i
                            ? { ...x, pago: c === true, dataPagamento: c === true ? (x.dataPagamento || x.vencimento) : '' }
                            : x))} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px]">Pagamento</Label>
                      <DatePicker value={p.dataPagamento} className="mt-0.5"
                        onChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, dataPagamento: v } : x))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">Conta <span className="text-destructive">*</span></Label>
                      <ContaBancariaSelect value={p.contaId} contas={contas} placeholder="Escolha"
                        className="mt-0.5 h-8 text-[12px]"
                        onValueChange={v => setParcelas(o => o.map((x, j) => j === i ? { ...x, contaId: v } : x))} />
                    </div>
                    <div className="flex items-end">
                      {parcelas.length > 1 && (
                        <button type="button" title="Remover parcela" aria-label="Remover parcela"
                          onClick={() => setParcelas(o => o.filter((_, j) => j !== i))}
                          className="mb-1 rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {/* ⚠ O RODAPÉ DO BLOCO É O JUIZ: a RPC recusa com `PARCELAS_NAO_FECHAM_LIQUIDO`, e
                    descobrir isso depois de apertar Registrar é o pior momento. Verde quando fecha,
                    vermelho com a diferença quando não. */}
                <div className={cn('rounded-md px-2 py-1 text-[11px]',
                  fecha ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                  Parcelas <strong className="tabular-nums">{formatMoeda(somaParcelas)}</strong> ·
                  Líquido <strong className="tabular-nums">{formatMoeda(liquido)}</strong> ·{' '}
                  {fecha ? 'confere' : `diferença ${formatMoeda(Math.abs(diferenca))}`}
                </div>
              </div>
            )}
          </div>

          {/* ── BLOCO 4 — COMPRADOR, DATA, OBSERVAÇÕES ───────────────────────────────────── */}
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <Label className="text-[10px]">Comprador <span className="text-destructive">*</span></Label>
              <div className="mt-0.5">
                <FornecedorSelect fornecedorId={compradorId || null}
                  onFornecedorChange={id => setCompradorId(id ?? '')}
                  clienteId={clienteId} label="" placeholder="Escolha" />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
              <DatePicker value={data} onChange={setData} className="mt-0.5" />
            </div>
          </div>
          <div>
            <Label className="text-[10px]">Observações</Label>
            <Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional"
              className="mt-0.5 h-8 text-[12px]" />
          </div>

          {/* ── BLOCO 5 — SUBSTITUIR LANÇAMENTOS ─────────────────────────────────────────── */}
          {/* ⚠ O BLOCO NEM EXISTE SEM CANDIDATO: uma seção vazia perguntando se a venda substitui
              algo ensinaria que há uma decisão a tomar onde não há. */}
          {substituiveis.length > 0 && (
            <div className="rounded-md border">
              <button type="button" onClick={() => setAbreSubstituir(v => !v)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-[11px] font-medium hover:bg-muted/50">
                {abreSubstituir ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Esta venda substitui lançamentos já feitos à mão?
                <span className="ml-1 font-normal text-muted-foreground">
                  {substituir.size > 0 ? `${substituir.size} marcado${substituir.size > 1 ? 's' : ''}`
                    : `${substituiveis.length} candidato${substituiveis.length > 1 ? 's' : ''}`}
                </span>
              </button>
              {abreSubstituir && (
                <div className="border-t">
                  {/* ⚠ SÓ APARECEM OS QUE A RPC ACEITA — receita manual, não cancelada e NÃO
                      conciliada. Um conciliado aqui terminaria em
                      `SUBSTITUIR_LANCAMENTO_CANCELADO_OU_CONCILIADO`. */}
                  {substituiveis.map(l => (
                    <label key={l.id}
                      className="flex cursor-pointer items-start gap-2 border-t border-slate-100 px-2 py-1.5 first:border-t-0 hover:bg-muted/30">
                      <Checkbox className="mt-0.5 shrink-0" checked={substituir.has(l.id)}
                        onCheckedChange={c => setSubstituir(o => {
                          const n = new Set(o);
                          if (c === true) n.add(l.id); else n.delete(l.id);
                          return n;
                        })} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium" title={l.descricao ?? ''}>
                          {l.descricao || 'Lançamento sem descrição'} · {formatMoeda(l.valor)}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {l.data_competencia ? formatIsoToBr(l.data_competencia.slice(0, 10)) : '—'}
                          {' · '}{l.favorecido || '—'}{' · '}{l.status || '—'}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
          <span className="text-[11px]">
            Vende <strong className="tabular-nums">{formatNum(vendidas, 2)}</strong> {unidade} ·
            sobra <strong className="tabular-nums">{formatNum(sobraTotal, 2)}</strong> {unidade}
          </span>
          <div className="flex-1" />
          <span className="text-[11px]">
            Líquido <strong className="tabular-nums">{formatMoeda(liquido)}</strong> em{' '}
            {parcelasEfetivas.length} parcela{parcelasEfetivas.length > 1 ? 's' : ''}
          </span>
          {impedimento && (
            <span className="w-full text-[10px] text-primary-foreground/80 md:w-auto">{impedimento}</span>
          )}
          <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
            disabled={!!impedimento || salvando} title={impedimento ?? 'Registrar a venda'}
            onClick={registrar}>
            <Save className="h-3.5 w-3.5" /> Registrar venda
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
