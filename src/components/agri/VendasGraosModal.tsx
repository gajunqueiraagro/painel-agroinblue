/**
 * VENDAS E ENTREGAS — a tabela do que saiu do estoque com contrapartida (F3.3).
 *
 * ⚠ ERA UMA LISTA DE DUAS ALTURAS COM TEXTO CORRIDO, e virou tabela porque a pergunta mudou. O
 * A18 vale quando cada registro tem identidade, contexto e um valor; aqui cada venda tem SEIS
 * números que se comparam entre linhas — sacas, preço médio, bruto, deduções, líquido — e comparar
 * coluna com coluna é exatamente o que uma tabela faz e um parágrafo não.
 * ⚠ O TOTAL ATIVO FECHA O BLOCO das ativas, e as canceladas vêm DEPOIS dele: somar uma cancelada
 * ao total seria contar grão que voltou ao saldo.
 *
 * ⚠ NENHUMA CÉLULA QUEBRA LINHA. Todo número é `whitespace-nowrap` + `tabular-nums`; o que pode
 * ser longo (comprador, composição) trunca com `title`. Um "1.174.697,05" partido em duas linhas
 * desalinha a coluna inteira e faz o olho somar errado.
 *
 * ⚠ CLICAR NA LINHA ABRE A VENDA no `VendaGraosModal` — o mesmo modal de criar, em modo leitura.
 * Um segundo modal de detalhe seria a terceira forma de mostrar a mesma venda.
 */
import { useState, useMemo } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConfirmarComMotivo } from '@/components/ui/confirmar-com-motivo';
import { X, Pencil, Ban, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { labelDaCultura } from '@/lib/agri/areaPlantada';
import { unidadeCurtaDaCultura } from '@/lib/agri/colheita';
import { labelDaClasse } from '@/lib/agri/barterVenda';
import { TH_CINZA as TH, CINZA_CABECALHO } from '@/lib/idiomaVisual';
import type { VendaGrao } from '@/hooks/useEstoqueGraos';

/** dd/mm/aa — a régua de data desta tabela, curta porque a coluna é estreita. */
const dataCurta = (iso: string | null) => {
  if (!iso || iso.length < 10) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
};

/** Cabeçalho de duas linhas: nome em cima, unidade embaixo. */
const Th = ({ nome, unidade, esq }: { nome: string; unidade?: string; esq?: boolean }) => (
  <th className={cn(TH, 'whitespace-nowrap align-bottom', esq ? 'text-left' : 'text-right')}>
    <div className="text-[11px] font-medium normal-case tracking-normal">{nome}</div>
    {/* ⚠ A UNIDADE MORA NO CABEÇALHO, não em cada célula: repeti-la 20 vezes gasta a largura que
        os números precisam, e o A22 já proíbe número quebrado. */}
    <div className="text-[10px] font-normal normal-case tracking-normal opacity-70">{unidade || ' '}</div>
  </th>
);

export function VendasGraosModal({
  aberto, onFechar, vendas, carregando, erro, cultura, safraRotulo,
  onCancelar, onAbrirVenda, salvando,
}: {
  aberto: boolean;
  onFechar: () => void;
  vendas: readonly VendaGrao[];
  carregando: boolean;
  erro: Error | null;
  cultura: string;
  safraRotulo: string;
  onCancelar: (id: string, motivo: string) => void;
  /** Abre a venda no `VendaGraosModal`. `editar` quando veio do ✎. */
  onAbrirVenda: (venda: VendaGrao, modo: 'visualizar' | 'editar') => void;
  salvando: boolean;
}) {
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');

  const unidade = unidadeCurtaDaCultura(cultura);
  const ativas = useMemo(() => vendas.filter(v => v.ativo), [vendas]);
  const canceladas = useMemo(() => vendas.filter(v => !v.ativo), [vendas]);

  const topo = useMemo(() => ({
    entregue: ativas.reduce((a, v) => a + v.sacas, 0),
    bruto: ativas.reduce((a, v) => a + v.bruto, 0),
    deducoes: ativas.reduce((a, v) => a + v.deducoes, 0),
    liquido: ativas.reduce((a, v) => a + v.liquido, 0),
  }), [ativas]);

  /** "classe qtd · classe qtd" — a composição em uma linha, truncada com o inteiro no `title`. */
  const composicao = (v: VendaGrao) =>
    v.itens.map(i => `${labelDaClasse(i.classe)} ${formatNum(i.sacas, 2)}`).join(' · ');

  /**
   * A PÍLULA DE SITUAÇÃO — e ela conta parcela, não status de operação.
   *
   * ⚠ "Pago 2/2" DIZ MAIS QUE "Realizado": numa venda a prazo o que o operador precisa saber é
   * quanto já entrou, e o status da operação é um só para N parcelas.
   */
  const situacao = (v: VendaGrao) => {
    if (!v.ativo) return { texto: 'Cancelada', cor: 'bg-muted text-muted-foreground' };
    if (v.tipo === 'barter') return { texto: 'Barter', cor: 'bg-primary/10 text-primary' };
    const recibos = v.lancamentos.filter(l => l.natureza === 'receita_venda' && !l.cancelado);
    const pagos = recibos.filter(l => l.data_pagamento || l.conciliado).length;
    const n = recibos.length;
    return pagos === n && n > 0
      ? { texto: `Pago ${pagos}/${n}`, cor: 'bg-success/15 text-success' }
      : { texto: `Programado ${pagos}/${n}`, cor: 'bg-warning/15 text-warning' };
  };

  const Linha = ({ v }: { v: VendaGrao }) => {
    const st = situacao(v);
    const avulsa = v.tipo === 'venda_avulsa';
    const comp = composicao(v);
    /* ⚠ PREÇO MÉDIO É DERIVADO, e por isso não vem da RPC: é `bruto / sacas`, a conta que o
       operador faria de cabeça para comparar duas vendas. Guardá-lo seria um número a manter. */
    const precoMedio = v.sacas > 0 ? v.bruto / v.sacas : 0;
    const compCompleta = v.ativo ? comp
      : `${comp}${v.motivo_cancelamento ? ` · cancelada: ${v.motivo_cancelamento}` : ' · cancelada'}`;
    return (
      <>
        <tr className={cn('cursor-pointer border-t border-slate-100 hover:bg-[#1e3a5f]/[0.06]',
          !v.ativo && 'bg-muted/20 text-muted-foreground line-through')}
          onClick={() => onAbrirVenda(v, 'visualizar')}
          tabIndex={0} role="button" aria-label={`Abrir venda de ${dataCurta(v.data)}`}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrirVenda(v, 'visualizar'); }
          }}>
          <td className="whitespace-nowrap px-2 py-1 text-[11px] tabular-nums">{dataCurta(v.data)}</td>
          <td className="whitespace-nowrap px-2 py-1 text-[11px]">{avulsa ? 'Venda' : 'Barter'}</td>
          <td className="truncate px-2 py-1 text-[11px]" title={v.comprador ?? ''}>{v.comprador || '—'}</td>
          <td className="truncate px-2 py-1 text-[10px] text-muted-foreground"
            title={v.ativo ? comp : `${compCompleta} — ${dataCurta(v.cancelado_em)} ${v.cancelado_por || ''}`}>
            {compCompleta}
          </td>
          <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] tabular-nums">{formatNum(v.sacas, 2)}</td>
          <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] tabular-nums">
            {precoMedio > 0 ? formatNum(precoMedio, 2) : '—'}
          </td>
          <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium tabular-nums">{formatMoeda(v.bruto)}</td>
          <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] tabular-nums">
            {v.deducoes > 0 ? formatMoeda(v.deducoes) : '—'}
          </td>
          <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium tabular-nums">{formatMoeda(v.liquido)}</td>
          <td className="whitespace-nowrap px-2 py-1">
            <div className="flex items-center justify-end gap-[11px] no-underline">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium no-underline', st.cor)}>
                {st.texto}
              </span>
              {v.ativo && avulsa && (
                <>
                  {/* ⚠ `stopPropagation` NOS DOIS: a linha inteira abre a venda, e sem isto o ✎
                      abriria em editar E a linha abriria em leitura por cima. */}
                  <button type="button" title="Editar comprador, data e observações" aria-label="Editar venda"
                    onClick={e => { e.stopPropagation(); onAbrirVenda(v, 'editar'); }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Cancelar esta venda" aria-label="Cancelar venda"
                    onClick={e => { e.stopPropagation(); setCancelandoId(v.id); setMotivoCancel(''); }}
                    className="rounded p-0.5 text-muted-foreground hover:bg-rose-100 hover:text-rose-700">
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </td>
        </tr>
        {cancelandoId === v.id && (
          <tr className="border-t border-slate-100">
            <td colSpan={10} className="px-2 py-1.5">
              <ConfirmarComMotivo
                titulo="Cancelar esta venda (lógico — cancela os lançamentos junto)"
                motivo={motivoCancel} onMotivoChange={setMotivoCancel}
                onVoltar={() => setCancelandoId(null)}
                confirmando={salvando}
                onConfirmar={() => { onCancelar(v.id, motivoCancel.trim()); setCancelandoId(null); }} />
            </td>
          </tr>
        )}
      </>
    );
  };

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-6xl gap-0 overflow-hidden p-0 [&>button.absolute]:hidden">
        <div className="flex items-start gap-2 bg-primary px-4 py-2.5 text-primary-foreground">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight">
              Vendas e entregas · {labelDaCultura(cultura)}
              {safraRotulo && ` · Safra ${safraRotulo}`}
            </h2>
            <p className="mt-0.5 text-[11px] text-primary-foreground/80">
              Tudo que saiu do estoque com dinheiro ou permuta, incluindo o que foi cancelado.
            </p>
          </div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon"
            className="h-7 w-7 shrink-0 text-primary-foreground/90 hover:bg-white/10 hover:text-white"
            title="Fechar" onClick={onFechar}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-w-0 space-y-2 px-3 py-2">
          <div className="grid grid-cols-4 gap-3 rounded-md border bg-muted/20 px-3.5 py-[11px]">
            {([
              ['Entregue ativo', `${formatNum(topo.entregue, 2)} ${unidade}`],
              ['Bruto recebido', formatMoeda(topo.bruto)],
              ['Deduções', formatMoeda(topo.deducoes)],
              ['Vendas', `${ativas.length} ativa${ativas.length === 1 ? '' : 's'} · ${canceladas.length} cancelada${canceladas.length === 1 ? '' : 's'}`],
            ] as const).map(([rot, val]) => (
              <div key={rot} className="min-w-0">
                <div className="text-[11px] font-normal leading-none text-muted-foreground">{rot}</div>
                <div className="mt-1 truncate whitespace-nowrap text-[20px] font-medium leading-none tabular-nums">
                  {val}
                </div>
              </div>
            ))}
          </div>

          {/* ⚠ ROLA SÓ A LISTA (A28), e o cabeçalho fica: `sticky top-0` dentro do scroller. */}
          <div className="max-h-[56vh] min-w-0 overflow-y-auto rounded-md border">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                {['7%', '8%', '16%', '19%', '9%', '9%', '11%', '9%', '11%', '11%'].map((w, i) => (
                  <col key={i} style={{ width: w }} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <Th nome="Data" esq />
                  <Th nome="Tipo" esq />
                  <Th nome="Comprador" esq />
                  <Th nome="Composição" esq />
                  <Th nome="Sacas" unidade={unidade} />
                  <Th nome="Preço médio" unidade={`R$/${unidade}`} />
                  <Th nome="Bruto" unidade="R$" />
                  <Th nome="Deduções" unidade="R$" />
                  <Th nome="Líquido" unidade="R$" />
                  <Th nome="Situação" />
                </tr>
              </thead>
              <tbody>
                {erro ? (
                  <tr><td colSpan={10} className="px-2 py-6 text-center">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> Não foi possível carregar o histórico.
                    </span>
                    <div className="mt-1 text-[10px] text-muted-foreground" title={erro.message}>
                      A lista não foi lida — o dado continua no banco.
                    </div>
                  </td></tr>
                ) : carregando ? (
                  <tr><td colSpan={10} className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
                    </span>
                  </td></tr>
                ) : vendas.length === 0 ? (
                  <tr><td colSpan={10} className="px-2 py-6 text-center text-[10px] text-muted-foreground">
                    Nenhuma venda ou entrega nesta safra.
                  </td></tr>
                ) : (
                  <>
                    {ativas.map(v => <Linha key={v.id} v={v} />)}
                    {ativas.length > 0 && (
                      <tr className={cn(CINZA_CABECALHO, 'text-white')}>
                        <td className="whitespace-nowrap px-2 py-1 text-[11px] font-bold" colSpan={4}>Total ativo</td>
                        <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatNum(topo.entregue, 2)}
                        </td>
                        {/* ⚠ PREÇO MÉDIO NÃO TEM TOTAL: média de médias não é preço — a mesma regra
                            das colunas de R$/sc da tabela de estoque. */}
                        <td className="px-2 py-1" />
                        <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatMoeda(topo.bruto)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatMoeda(topo.deducoes)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                          {formatMoeda(topo.liquido)}
                        </td>
                        <td className="px-2 py-1" />
                      </tr>
                    )}
                    {canceladas.map(v => <Linha key={v.id} v={v} />)}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
