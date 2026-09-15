/**
 * VENDER DO ESTOQUE — o documento inteiro, de bruto a parcela (F3.1).
 *
 * ⚠⚠ ABAS + RESUMO LATERAL FIXO — e o shell é o do `LancamentoV2Dialog`, não um desenho novo.
 * A primeira versão empilhou os cinco blocos numa coluna só, seguindo a ordem do abate: BASE →
 * DEDUÇÕES → LÍQUIDO → PAGAMENTO. A ordem estava certa e o MEIO estava errado — cinco blocos numa
 * coluna viram uma página que rola, e o A21 diz que o resumo nunca sai da tela. Aqui a ordem
 * sobrevive nas ABAS (a numeração delas É o fluxo), e o que era "ver o líquido nascer do bruto"
 * passa a ser o resumo da direita, que mostra os quatro números ao mesmo tempo, sempre.
 * ⚠ O GRID É O DE LÁ, copiado: `grid-cols-[1fr_300px] grid-rows-[auto_minmax(0,1fr)_auto]` com
 * altura FIXA `h-[92vh]`. É a altura fixa que garante o A23 — trocar de aba não muda o tamanho do
 * modal, porque só o miolo da coluna esquerda rola.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Save, AlertTriangle, X, Plus, Trash2, Ban, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { rotuloCulturaUnidade, unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { EstoqueClasse, LancamentoSubstituivel, VendaGrao } from '@/hooks/useEstoqueGraos';
import { ComposicaoLeitura, DeducoesLeitura, ParcelasLeitura } from '@/components/agri/VendaGraosLeitura';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';

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
  modo = 'criar', venda = null, onEditar, onCancelar,
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
  /**
   * ⚠ UM MODAL, TRÊS MODOS — não três componentes. Criar, ver e editar uma venda são a MESMA
   * coisa vista em momentos diferentes, e é assim que a OC já faz: quem aprendeu onde fica o
   * líquido ao vender encontra o líquido no mesmo lugar ao conferir.
   */
  modo?: 'criar' | 'visualizar' | 'editar';
  /** A venda sendo vista ou editada. `null` no modo criar. */
  venda?: VendaGrao | null;
  onEditar?: (p: { id: string; data: string; comprador_id: string | null; observacoes: string | null }) => void;
  onCancelar?: (id: string, motivo: string) => void;
}) {
  /** A aba aberta. A ordem delas É o fluxo: compor → deduzir → receber. */
  const [aba, setAba] = useState<'composicao' | 'deducoes' | 'recebimento' | 'substituir'>('composicao');
  /* ⚠ O MODO PODE MUDAR DENTRO DO MODAL (ver → editar), e por isso ele é estado, não só prop: o
     botão "Editar" troca de modo sem fechar e reabrir, que é o que faria o operador perder de vista
     o que estava conferindo. */
  const [modoAtual, setModoAtual] = useState<'criar' | 'visualizar' | 'editar'>(modo);
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState('');
  const leitura = modoAtual === 'visualizar';
  const criando = modoAtual === 'criar';
  /* ⚠ SÓ A VENDA AVULSA ATIVA SE MEXE. O barter se governa no Barter e a cancelada não se
     reescreve — a RPC recusa os dois, e esconder o botão diz isso antes da tentativa. */
  const editavel = !!venda && venda.ativo && venda.tipo === 'venda_avulsa';
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
    setAba('composicao');
    setModoAtual(modo);
    setCancelando(false); setMotivoCancel('');
    setCriterio('preco'); setValorTotal('');
    /* ⚠ VER E EDITAR PREENCHEM O QUE A RPC DE EDIÇÃO ACEITA — comprador, data e observações. O
       resto do formulário nem é montado nesses modos: são as telas de leitura. */
    if (venda) {
      setCompradorId(venda.comprador_id ?? '');
      setData(venda.data.slice(0, 10));
      setObs(venda.observacoes ?? '');
      return;
    }
    setSenarPct(String(SENAR_PCT_PADRAO).replace('.', ',')); setSenarReais(''); setSenarTocado(false);
    setDescontos([]); setCondicao('avista'); setParcelas([novaParcela()]);
    setCompradorId(''); setObs(''); setSubstituir(new Set()); setAbreSubstituir(false);
    setData(new Date().toISOString().slice(0, 10));
  }, [aberto, estoque, modo, venda]);

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


  /* ⚠ AS DUAS PEÇAS DO RESUMO SÃO CÓPIA do `LancamentoV2Dialog` (`ResumoBlocoHead`/`ResumoRow`,
     linhas 234-253), onde nasceram privadas. A régua tem de ser a MESMA — o briefing pede que as
     duas telas se leiam como irmãs —, e importar de lá arrastaria um arquivo de 2.300 linhas do
     Financeiro para dentro do estoque.
     ⚠ SÃO DOIS CONSUMIDORES AGORA. No terceiro, elas sobem para `ui/` — é a mesma conta que fez o
     `Cartao` e o cinza do cabeçalho subirem, e a que ainda não foi feita pelo `ConfirmarComMotivo`. */
  const BlocoHead = ({ titulo }: { titulo: string }) => (
    <div className="mb-0.5 mt-0.5 border-y border-primary/15 bg-primary/10 px-3 py-0.5 first:mt-0">
      <span className="text-[9px] font-bold uppercase leading-none tracking-wide text-primary/90">{titulo}</span>
    </div>
  );
  const Row = ({ label, value, valueClassName }: {
    label: string; value: string | null; valueClassName?: string;
  }) => (
    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn('truncate text-right font-medium', valueClassName)}>{value || '—'}</span>
    </div>
  );

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

  /* ⚠ O RECEBIMENTO EM UMA FRASE, para o resumo: "A vista em 15/09/26" ou a lista dos vencimentos.
     Ele é o único item do resumo que não é um número — e é o que o operador confere por último. */
  const resumoRecebimento = condicao === 'avista'
    ? (data ? `À vista em ${formatIsoToBr(data)}` : null)
    : parcelas.some(p => p.vencimento)
      ? parcelas.filter(p => p.vencimento)
          .map(p => `${formatIsoToBr(p.vencimento)} ${formatMoeda(parseMoeda(p.valor) ?? 0)}`).join(' · ')
      : null;

  const abas = [
    { id: 'composicao' as const, label: 'Composição' },
    { id: 'deducoes' as const, label: 'Deduções' },
    { id: 'recebimento' as const, label: 'Recebimento' },
    /* ⚠ A ABA DE SUBSTITUIÇÃO SÓ EXISTE COM CANDIDATO, e leva a contagem no título: uma aba vazia
       ensinaria que há uma decisão a tomar onde não há. */
    /* ⚠ SÓ NO MODO CRIAR: substituir um lançamento manual é decisão de quem está REGISTRANDO a
       venda. Depois de gravada, a substituição já aconteceu (ou não) e a aba viraria um botão que
       não faz nada. */
    ...(criando && substituiveis.length > 0
      ? [{ id: 'substituir' as const, label: `Substituir (${substituiveis.length})` }]
      : []),
  ];

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      {/* ⚠ ALTURA FIXA `h-[92vh]` E GRID DE 2×3 — o shell do `LancamentoV2Dialog`. A altura fixa é
          o que faz o A23 valer: trocar de aba não muda o tamanho do modal, porque quem rola é só o
          miolo da coluna esquerda. O resumo faz `row-span-2` e ocupa a coluna direita inteira,
          inclusive ao lado do rodapé. */}
      <DialogContent className={cn(
        'flex flex-col overflow-hidden border border-border bg-card p-0 shadow-2xl',
        'h-[92vh] max-h-[92vh] max-w-5xl [&>button.absolute]:hidden',
        'grid grid-cols-[1fr_300px] grid-rows-[auto_minmax(0,1fr)_auto]',
      )}>
        <div className="col-span-2 col-start-1 row-start-1 flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              {criando ? 'Vender do estoque' : 'Venda'} · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
              {venda && ` · ${formatIsoToBr(venda.data.slice(0, 10))}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              {criando
                ? `${formatNum(saldoAtual, 2)} ${unidade} disponíveis. A venda baixa o estoque e gera os lançamentos no Financeiro, parcela a parcela.`
                : venda && !venda.ativo
                  /* ⚠ A FAIXA DA CANCELADA É MUDA, não alarmante: o estorno já aconteceu e foi
                     deliberado. Vermelho aqui trataria uma decisão do operador como acidente. */
                  ? `Cancelada em ${formatIsoToBr((venda.cancelado_em ?? '').slice(0, 10) || venda.data.slice(0, 10))} por ${venda.cancelado_por || '—'}${venda.motivo_cancelamento ? `: ${venda.motivo_cancelamento}` : ''}`
                  : venda?.tipo === 'barter'
                    ? 'Entrega de barter — o contrato e as entregas se editam no próprio Barter.'
                    : 'Composição, deduções e recebimento desta venda.'}
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Tabs value={aba} onValueChange={v => setAba(v as typeof aba)}
          className="col-start-1 row-start-2 flex min-h-0 flex-col">
          {/* ⚠ A RÉGUA DAS ABAS É A DO FINANCEIRO, copiada: inativa discreta, ativa com fundo
              `background`, borda fininha SEM a de baixo e um `after:` de 1px no primário. Duas
              bordas somadas dariam a linha grossa que o briefing chama de "pasta evidente". */}
          <TabsList className="h-8 w-full shrink-0 justify-start gap-0.5 rounded-none border-b border-border bg-accent/40 px-2">
            {abas.map(a => (
              <TabsTrigger key={a.id} value={a.id} className={cn(
                'relative h-6 rounded-b-none rounded-t-md px-3 text-[12px] font-medium text-muted-foreground',
                'hover:bg-background/60 hover:text-foreground',
                'data-[state=active]:bg-background data-[state=active]:font-semibold data-[state=active]:text-foreground',
                'data-[state=active]:border data-[state=active]:border-border data-[state=active]:border-b-transparent data-[state=active]:shadow-sm',
                'data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-px data-[state=active]:after:h-px data-[state=active]:after:bg-primary',
              )}>
                {a.label}
                {/* ⚠ O PONTO VERMELHO NA ABA QUE TRAVA O BOTÃO — o mesmo recurso do Financeiro. Sem
                    ele, o operador lê "as parcelas não fecham" no rodapé e não sabe onde ir. */}
                {a.id === 'recebimento' && !fecha && vendidas > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
                    aria-label="pendência" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── ABA 1 — COMPOSIÇÃO ─────────────────────────────────────────────────────────── */}
          <TabsContent value="composicao" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
            {venda ? <ComposicaoLeitura venda={venda} unidade={unidade} /> : (
            <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{rotuloCulturaUnidade(cultura)}</p>
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
                  <p className="min-w-0 flex-1 text-[10px] leading-snug text-muted-foreground">
                    O R$/{unidade} de cada classe é derivado do total. Com preços informados eles
                    entram como <strong>peso</strong> do rateio; em branco, rateia por saca.
                  </p>
                </div>
              )}

              {/* ⚠ QUEM ROLA É A LISTA, NÃO O MODAL (A28): o `overflow-auto` mora aqui, e o
                  cabeçalho e o Total da tabela ficam dentro dele — com três classes nunca rola,
                  e numa cultura de muitas classes rola só esta caixa. */}
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
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
            )}
          </TabsContent>

          {/* ── ABA 2 — DEDUÇÕES ───────────────────────────────────────────────────────────── */}
          <TabsContent value="deducoes" className="min-h-0 flex-1 overflow-auto p-0 data-[state=inactive]:hidden">
            {venda ? <DeducoesLeitura venda={venda} /> : (
            <div className="px-3 py-2">
              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <LinhaConta rotulo="= Bruto">{bruto > 0 ? formatMoeda(bruto) : '—'}</LinhaConta>
                <div className="flex items-center gap-2 py-0.5">
                  <div className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">(−) Senar</div>
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
            </div>
            )}
          </TabsContent>

          {/* ── ABA 3 — RECEBIMENTO ────────────────────────────────────────────────────────── */}
          <TabsContent value="recebimento" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
            <div className="flex h-full min-h-0 flex-col gap-2 px-3 py-2">
              <div className={cn('flex flex-wrap items-end justify-between gap-2', venda && 'hidden')}>
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

              {/* ⚠ EM VER/EDITAR AS PARCELAS SÃO LEITURA e os três campos de baixo continuam
                  editáveis — são exatamente os que `agri_venda_avulsa_editar` aceita. Mostrar um
                  campo de valor que a RPC ignora seria prometer uma edição que não acontece. */}
              {venda ? <ParcelasLeitura venda={venda} /> : condicao === 'avista' ? (
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <Label className="text-[10px]">Conta que recebe <span className="text-destructive">*</span></Label>
                    <ContaBancariaSelect value={parcelas[0]?.contaId ?? ''} contas={contas}
                      onValueChange={v => setParcelas(o => [{ ...(o[0] ?? novaParcela()), contaId: v }])}
                      placeholder="Escolha" className="mt-0.5 h-8 text-[12px]" />
                  </div>
                  <div className="flex items-end">
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Uma parcela de <strong className="tabular-nums">{formatMoeda(liquido)}</strong>,
                      paga em {data ? formatIsoToBr(data) : '—'}.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* ⚠ A LISTA DE PARCELAS ROLA SOZINHA (A28) — doze parcelas não empurram o rodapé
                      nem o resumo; o juiz abaixo fica sempre visível. */}
                  <div className="min-h-0 flex-1 space-y-1.5 overflow-auto pr-1">
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
                  </div>
                  <div className={cn('shrink-0 rounded-md px-2 py-1 text-[11px]',
                    fecha ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                    Parcelas <strong className="tabular-nums">{formatMoeda(somaParcelas)}</strong> ·
                    Líquido <strong className="tabular-nums">{formatMoeda(liquido)}</strong> ·{' '}
                    {fecha ? 'confere' : `diferença ${formatMoeda(Math.abs(diferenca))}`}
                  </div>
                </>
              )}

              {/* ⚠ COMPRADOR, DATA E OBSERVAÇÕES MORAM AQUI, não numa quarta aba: eles descrevem o
                  RECEBIMENTO (de quem, quando) e uma aba só para três campos seria uma parada a
                  mais no caminho de quem já sabe o que está fazendo. */}
              <div className="grid shrink-0 gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-[10px]">Comprador <span className="text-destructive">*</span></Label>
                  <div className="mt-0.5">
                    <FornecedorSelect fornecedorId={compradorId || null}
                      onFornecedorChange={id => setCompradorId(id ?? '')}
                      clienteId={clienteId} label="" placeholder="Escolha"
                      disabled={leitura || (!!venda && !editavel)} />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]">Data da venda <span className="text-destructive">*</span></Label>
                  <DatePicker value={data} onChange={setData} className="mt-0.5"
                    disabled={leitura || (!!venda && !editavel)} />
                </div>
              </div>
              <div className="shrink-0">
                <Label className="text-[10px]">Observações</Label>
                <Input value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional"
                  disabled={leitura || (!!venda && !editavel)}
                  className="mt-0.5 h-8 text-[12px]" />
              </div>
            </div>
          </TabsContent>

          {/* ── ABA 4 — SUBSTITUIR ─────────────────────────────────────────────────────────── */}
          {substituiveis.length > 0 && (
            <TabsContent value="substituir" className="min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden">
              <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-2">
                <p className="shrink-0 text-[11px] text-muted-foreground">
                  Esta venda substitui lançamentos já feitos à mão? Os marcados são cancelados com
                  motivo na mesma gravação.
                </p>
                <div className="min-h-0 flex-1 overflow-auto rounded-md border">
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
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* ── RESUMO LATERAL ─────────────────────────────────────────────────────────────── */}
        <aside className="col-start-2 row-span-2 row-start-2 flex flex-col overflow-hidden border-l border-border bg-muted/20">
          {/* Faixa de título com a MESMA altura e fundo da TabsList — alinha com as abas. */}
          <div className="flex h-8 shrink-0 items-center border-b border-border bg-accent/40 px-3 text-[11px] font-bold uppercase tracking-wide text-primary">
            Resumo da venda
          </div>
          <div className="flex-1 overflow-y-auto pb-1 text-[10px]">
            <BlocoHead titulo="Identificação" />
            <div className="space-y-0.5 px-3">
              <Row label="Cultura" value={labelDaCultura(cultura)} />
              <Row label="Safra" value={safraRotulo || null} />
              <Row label="Comprador" value={compradorId ? 'Selecionado' : null} />
              <Row label="Data" value={data ? formatIsoToBr(data) : null} />
            </div>

            <BlocoHead titulo="Composição" />
            <div className="space-y-0.5 px-3">
              {/* ⚠ SÓ AS CLASSES COM QUANTIDADE: listar as três com "—" gastaria o espaço do
                  resumo com o que o operador não está vendendo. */}
              {(venda ? venda.itens.map(i => ({ classe: i.classe, sacas: i.sacas }))
                      : linhas.filter(l => l.sacas > 0)).map(l => (
                <Row key={l.classe} label={labelDaClasse(l.classe)}
                  value={`${formatNum(l.sacas, 2)} ${unidade}`} />
              ))}
              <Row label="Total" value={(venda ? venda.sacas : vendidas) > 0
                ? `${formatNum(venda ? venda.sacas : vendidas, 2)} ${unidade}` : null} />
              {/* ⚠ "SOBRA" SÓ FAZ SENTIDO AO CRIAR: numa venda gravada o saldo atual já a reflete,
                  e repeti-la aqui contaria a mesma baixa duas vezes na cabeça de quem lê. */}
              {criando && <Row label="Sobra" value={`${formatNum(sobraTotal, 2)} ${unidade}`} />}
            </div>

            <BlocoHead titulo="Financeiro" />
            <div className="space-y-0.5 px-3">
              {/* ⚠ COM VENDA, O RESUMO LÊ O GRAVADO, não o formulário: em ver/editar o formulário
                  de composição nem é montado, e recalcular daria zero num documento que existe. */}
              <Row label="Bruto" value={(venda ? venda.bruto : bruto) > 0 ? formatMoeda(venda ? venda.bruto : bruto) : null} />
              <Row label="(−) Senar" value={(venda ? venda.senar : senar) > 0 ? formatMoeda(venda ? venda.senar : senar) : null} />
              <Row label="(−) Descontos"
                value={(venda ? Math.max(venda.deducoes - venda.senar, 0) : totalDescontos) > 0
                  ? formatMoeda(venda ? Math.max(venda.deducoes - venda.senar, 0) : totalDescontos) : null} />
              <Row label="= Líquido" value={(venda ? venda.liquido : liquido) > 0 ? formatMoeda(venda ? venda.liquido : liquido) : null}
                valueClassName="text-[12px] font-bold text-primary" />
              <Row label="Recebimento" value={venda
                ? `${venda.lancamentos.filter(l => l.natureza === 'receita_venda').length} parcela(s)`
                : resumoRecebimento} />
            </div>

            {criando && (
              <>
                <BlocoHead titulo="Substituição" />
                <div className="space-y-0.5 px-3">
                  <Row label="Lançamentos"
                    value={substituir.size > 0
                      ? `${substituir.size} marcado${substituir.size > 1 ? 's' : ''}`
                      : null} />
                </div>
              </>
            )}
          </div>
        </aside>

        <div className="col-start-1 row-start-3 flex flex-col gap-1.5 border-t border-border bg-accent px-4 py-2.5">
          {/* ⚠ O PAINEL DE CANCELAMENTO ABRE AQUI DENTRO, acima do rodapé: o operador está olhando
              a venda, e mandá-lo fechar o modal para cancelar em outra tela seria pedir que ele
              confie na memória do que acabou de ver. */}
          {cancelando && venda && (
            <ConfirmarComMotivo
              titulo="Cancelar esta venda (lógico — cancela os lançamentos junto)"
              motivo={motivoCancel} onMotivoChange={setMotivoCancel}
              onVoltar={() => setCancelando(false)}
              confirmando={salvando}
              onConfirmar={() => { onCancelar?.(venda.id, motivoCancel.trim()); setCancelando(false); }} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {criando ? (
              <span className="text-[11px]">
                Vende <strong className="tabular-nums">{formatNum(vendidas, 2)}</strong> {unidade} ·
                sobra <strong className="tabular-nums">{formatNum(sobraTotal, 2)}</strong> {unidade}
              </span>
            ) : venda && venda.tipo === 'barter' ? (
              /* ⚠ O BARTER DIZ ONDE SE EDITA, em vez de só não ter botão: "sem ação" sem explicação
                 faz o operador procurar o que não existe. */
              <span className="text-[11px] text-muted-foreground">
                Este barter se edita no próprio Barter.
              </span>
            ) : (
              <span className="text-[11px]">
                <strong className="tabular-nums">{formatNum(venda?.sacas ?? 0, 2)}</strong> {unidade} ·
                bruto <strong className="tabular-nums">{formatMoeda(venda?.bruto ?? 0)}</strong>
              </span>
            )}
            <div className="flex-1" />
            <span className="text-[11px]">
              Líquido <strong className="tabular-nums">{formatMoeda(venda ? venda.liquido : liquido)}</strong>
              {criando && <> em {parcelasEfetivas.length} parcela{parcelasEfetivas.length > 1 ? 's' : ''}</>}
            </span>

            {criando ? (
              <>
                {impedimento && (
                  <span className="w-full text-[10px] text-muted-foreground md:w-auto">{impedimento}</span>
                )}
                <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                  disabled={!!impedimento || salvando} title={impedimento ?? 'Registrar a venda'}
                  onClick={registrar}>
                  <Save className="h-3.5 w-3.5" /> Registrar venda
                </Button>
              </>
            ) : leitura ? (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-[11px]" onClick={onFechar}>
                  Fechar
                </Button>
                {editavel && (
                  <>
                    <Button size="sm" variant="outline" className="h-8 gap-1 px-2 text-[11px]"
                      onClick={() => setCancelando(true)} disabled={salvando}
                      title="Cancelar esta venda">
                      <Ban className="h-3.5 w-3.5" /> Cancelar venda
                    </Button>
                    <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                      onClick={() => setModoAtual('editar')} title="Editar comprador, data e observações">
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <Button size="sm" variant="ghost" className="h-8 px-3 text-[11px]"
                  onClick={() => setModoAtual('visualizar')}>
                  Voltar
                </Button>
                <Button size="sm" variant="acao" className="h-8 gap-1 px-3 text-[11px]"
                  disabled={!data || salvando}
                  title={!data ? 'Informe a data da venda.' : 'Salvar as alterações'}
                  onClick={() => venda && onEditar?.({
                    id: venda.id, data,
                    comprador_id: compradorId || null,
                    observacoes: obs.trim() || null,
                  })}>
                  <Save className="h-3.5 w-3.5" /> Salvar alterações
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
