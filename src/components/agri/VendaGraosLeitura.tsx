/**
 * A VENDA EM LEITURA — os três blocos do `VendaGraosModal` quando não há o que digitar (F3.3).
 *
 * ⚠ ELES SAÍRAM DO MODAL POR TAMANHO, e o briefing autorizou: com os modos visualizar/editar o
 * `VendaGraosModal` passava de mil linhas, e um arquivo desse tamanho esconde o que muda entre os
 * modos. Aqui ficam só as três telas de leitura; o shell, as abas e o resumo continuam lá.
 * ⚠ IRMÃO NO MESMO DIRETÓRIO, não em `ui/`: isto não é peça de casa — é a venda de grão em
 * leitura, e só o modal dela consome.
 *
 * ⚠ AS SACAS APARECEM COM DUAS CASAS E O `title` LEVA AS QUATRO. O banco guarda quatro (o romaneio
 * traz), a régua da casa exibe duas (A19), e o operador que precisa conferir o documento passa o
 * mouse. Cortar sem o `title` seria perder o dado; mostrar quatro na coluna quebraria a régua.
 */
import { cn } from '@/lib/utils';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import { formatCasas } from '@/lib/calculos/numeroBR';
import { formatIsoToBr } from '@/components/ui/date-picker';
import { TH_CINZA as TH, CINZA_CABECALHO } from '@/lib/idiomaVisual';
import { labelDaClasse, corDaClasse } from '@/lib/agri/barterVenda';
import type { VendaGrao } from '@/hooks/useEstoqueGraos';

const dataBR = (iso: string | null) => (iso && iso.length >= 10 ? formatIsoToBr(iso.slice(0, 10)) : '—');

export function ComposicaoLeitura({ venda, unidade }: { venda: VendaGrao; unidade: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 px-3 py-2">
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {['34%', '22%', '22%', '22%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Classe</th>
              <th className={cn(TH, 'text-right')}>Sacas</th>
              <th className={cn(TH, 'text-right')}>R$ / {unidade}</th>
              <th className={cn(TH, 'text-right')}>Valor</th>
            </tr>
          </thead>
          <tbody>
            {venda.itens.map(i => (
              <tr key={i.classe} className="border-t border-slate-100">
                <td className="truncate px-2 py-1 text-[11px]">
                  <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-[-1px]',
                    corDaClasse(i.classe))} />
                  {labelDaClasse(i.classe)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] tabular-nums"
                  title={formatCasas(i.sacas, 4)}>
                  {formatNum(i.sacas, 2)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] tabular-nums"
                  title={formatCasas(i.preco_saca, 4)}>
                  {formatCasas(i.preco_saca, 4)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                  {formatMoeda(i.valor)}
                </td>
              </tr>
            ))}
            <tr className={cn(CINZA_CABECALHO, 'text-white')}>
              <td className="px-2 py-1 text-[11px] font-bold">Total</td>
              <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                {formatNum(venda.sacas, 2)}
              </td>
              <td className="px-2 py-1" />
              <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-bold tabular-nums">
                {formatMoeda(venda.bruto)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* ⚠ A FRASE MUDOU COM O BOTÃO: "cancele e registre de novo" era o caminho de quando não
          havia Corrigir — e continuava mandando o operador fazer à mão o que a RPC agora faz numa
          transação. Nomear o botão é dizer onde ele está. */}
      <p className="shrink-0 text-[10px] text-muted-foreground">
        Para corrigir sacas ou preço, use <strong>Corrigir</strong>.
      </p>
    </div>
  );
}

export function DeducoesLeitura({ venda }: { venda: VendaGrao }) {
  /* ⚠ DESCONTOS É `deducoes − senar`, e este é o conserto de um defeito medido: a lista antiga
     mostrava `deducoes` inteiro no rótulo "descontos", somando o Senar duas vezes aos olhos de
     quem lia. `deducoes` é o TOTAL deduzido; o desconto avulso é o que sobra dele. */
  const descontos = Math.max(venda.deducoes - venda.senar, 0);
  const Linha = ({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: boolean }) => (
    <div className={cn('flex items-center gap-2 py-0.5', destaque && 'border-t pt-1.5')}>
      <div className={cn('min-w-0 flex-1 truncate text-[11px]',
        destaque ? 'font-semibold' : 'text-muted-foreground')}>{rotulo}</div>
      <div className={cn('shrink-0 whitespace-nowrap tabular-nums',
        destaque ? 'text-[13px] font-bold' : 'text-[11px]')}>
        {valor > 0 ? formatMoeda(valor) : '—'}
      </div>
    </div>
  );
  return (
    <div className="px-3 py-2">
      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <Linha rotulo="= Bruto" valor={venda.bruto} />
        <Linha rotulo="(−) Senar" valor={venda.senar} />
        <Linha rotulo="(−) Outros descontos" valor={descontos} />
        <Linha rotulo="= Líquido a receber" valor={venda.liquido} destaque />
      </div>
    </div>
  );
}

export function ParcelasLeitura({ venda }: { venda: VendaGrao }) {
  /* ⚠ AS PARCELAS SÃO OS LANÇAMENTOS DE RECEITA — não um campo próprio. Cada parcela É um
     lançamento, e contar outra coisa aqui seria um segundo número de parcelas. */
  const recibos = venda.lancamentos.filter(l => l.natureza === 'receita_venda');
  /* ⚠ CONCILIADO GANHA DE PAGO: os dois são verdade, mas conciliado diz mais — o dinheiro já casou
     com o extrato, e é o estado que impede o cancelamento por aqui. */
  const situacao = (l: typeof recibos[number]) => (l.cancelado ? 'Cancelado'
    : l.conciliado ? `Conciliado ${dataBR(l.data_pagamento ?? l.data_vencimento)}`
      : l.data_pagamento ? `Pago ${dataBR(l.data_pagamento)}`
        : `Programado ${dataBR(l.data_vencimento)}`);
  return (
    <div className="min-h-0 overflow-auto px-3 py-2">
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            {['16%', '28%', '28%', '28%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>#</th>
              <th className={cn(TH, 'text-right')}>Valor</th>
              <th className={cn(TH, 'text-left')}>Situação</th>
              <th className={cn(TH, 'text-left')}>Descrição</th>
            </tr>
          </thead>
          <tbody>
            {recibos.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                Esta venda não tem parcela registrada.
              </td></tr>
            ) : recibos.map((l, i) => (
              <tr key={l.id} className={cn('border-t border-slate-100', l.cancelado && 'text-muted-foreground line-through')}>
                <td className="px-2 py-1 text-[11px]">{i + 1}</td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-[11px] font-medium tabular-nums">
                  {formatMoeda(l.valor)}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-[11px]">{situacao(l)}</td>
                <td className="truncate px-2 py-1 text-[10px] text-muted-foreground" title={l.descricao ?? ''}>
                  {l.descricao || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
