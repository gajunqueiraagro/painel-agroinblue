/**
 * MATERIALIZAR / ESTORNAR O BARTER + O EXTRATO DA PERMUTA — PR-AGRI-BARTER-TELA-D.
 *
 * ⚠ GRAVAÇÃO COM CONFERÊNCIA. Materializar escreve N lançamentos no resultado de uma safra
 * inteira, e estornar apaga todos: os dois passam por um diálogo que DIZ o que vai acontecer,
 * com o número e a conta. Um clique só, sem confirmação, num botão que move o DRE é o tipo de
 * gesto que ninguém lembra de ter feito.
 *
 * ⚠ O BOTÃO DIZ POR QUE ESTÁ DESABILITADO, ao lado, em 10px — regra da OC. "Materializar"
 * cinza sem explicação faz o operador procurar o defeito no lugar errado.
 *
 * ⚠ O EXTRATO É PRÓPRIO, E ISSO FOI MEDIDO ANTES. Os componentes chamados "Extrato" no
 * financeiro leem `extrato_bancario_v2` (movimentos importados de OFX); a conta de permuta não
 * tem OFX e viveria como lista vazia neles. A casa não tem lista de LANÇAMENTOS com saldo
 * acumulado — ver a nota em `useBarterMaterializacao`. O que se reusa aqui é o chassi das duas
 * colunas do próprio contrato: cabeçalho e total fixos, só o corpo rolando.
 */
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Undo2, PlayCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatMoeda } from '@/lib/calculos/formatters';
import type { LinhaExtrato } from '@/hooks/useBarterMaterializacao';

const TH = 'sticky top-0 z-10 bg-primary px-1.5 py-1 text-[9px] font-semibold'
  + ' text-primary-foreground';

const dataBR = (iso: string) => (iso && iso.length >= 10
  ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function BarterMaterializarCard({
  contaPermutaNome, pendentes, materializados, linhas, saldo, ocupado, onMaterializar, onEstornar,
}: {
  contaPermutaNome: string | null;
  /** Partes + insumos com valor que ainda não viraram lançamento. */
  pendentes: number;
  /** Partes + insumos que já viraram lançamento. */
  materializados: number;
  linhas: LinhaExtrato[];
  saldo: number;
  ocupado: boolean;
  onMaterializar: () => void;
  onEstornar: () => void;
}) {
  const [confirmar, setConfirmar] = useState<'materializar' | 'estornar' | null>(null);

  /**
   * ⚠ O MOTIVO É A FONTE ÚNICA de `disabled`, do `title` e da dica ao lado — regra da OC. Três
   * condições escritas em três lugares divergem no primeiro ajuste.
   */
  const motivo = !contaPermutaNome ? 'O contrato está sem conta de permuta.'
    : pendentes === 0 && materializados === 0 ? 'Lance ao menos um insumo ou uma venda.'
      : pendentes === 0 ? 'Tudo que existe já está no DRE.'
        : null;

  return (
    <div className="flex min-h-0 flex-[1] flex-col overflow-hidden rounded-md border">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-2 py-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wide">Materializar</div>
        {/* ⚠ O ESTADO EM PALAVRAS, não só pelo botão que aparece: "28 lançamentos no DRE" é a
            resposta à pergunta que o operador tem — já foi? quanto? */}
        <div className="text-[10px] text-muted-foreground">
          {materializados > 0
            ? `${materializados} ${materializados === 1 ? 'lançamento' : 'lançamentos'} no DRE`
            : 'nada materializado ainda'}
          {pendentes > 0 && materializados > 0 && ` · ${pendentes} a gerar`}
        </div>
        <div className="flex-1" />
        {motivo && <span className="text-[10px] text-muted-foreground">{motivo}</span>}
        {materializados > 0 && (
          <Button size="sm" variant="outline" className="h-6 gap-1 px-1.5 text-[10px]"
            disabled={ocupado} onClick={() => setConfirmar('estornar')}>
            <Undo2 className="h-3 w-3" /> Estornar
          </Button>
        )}
        <Button size="sm" className="h-6 gap-1 px-1.5 text-[10px]"
          disabled={ocupado || !!motivo} title={motivo ?? 'Gerar os lançamentos no DRE'}
          onClick={() => setConfirmar('materializar')}>
          <PlayCircle className="h-3 w-3" />
          {materializados > 0 ? 'Materializar o resto' : 'Materializar'}
        </Button>
      </div>

      {/* ── O EXTRATO DA PERMUTA ── */}
      <div className="min-h-0 flex-1 overflow-auto px-2">
        <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
          <colgroup>
            {['14%', '46%', '20%', '20%'].map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className={cn(TH, 'text-left')}>Data</th>
              <th className={cn(TH, 'text-left')}>Descrição</th>
              <th className={cn(TH, 'text-right')}>Movimento</th>
              <th className={cn(TH, 'text-right')}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                A conta de permuta ainda não tem lançamento. Ela é o deve/tem com o parceiro, e
                só se move ao materializar.
              </td></tr>
            )}
            {linhas.map(l => (
              <tr key={l.id} className="border-t border-slate-100 odd:bg-[#1e3a5f]/[0.03]">
                <td className="whitespace-nowrap px-1.5 py-0.5 tabular-nums">{dataBR(l.data)}</td>
                <td className="truncate px-1.5 py-0.5" title={l.descricao}>{l.descricao}</td>
                {/* ⚠ SINAL POR COR E POR SINAL, não só por coluna: a saída em vermelho com o
                    menos na frente se lê sem contar colunas. */}
                <td className={cn('whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums',
                  l.movimento < 0 ? 'text-destructive' : 'text-success')}>
                  {formatMoeda(l.movimento)}
                </td>
                <td className="whitespace-nowrap px-1.5 py-0.5 text-right tabular-nums">
                  {formatMoeda(l.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-primary px-2 py-1
        text-[10px] font-semibold text-primary-foreground">
        <span className="truncate">{contaPermutaNome ?? 'Sem conta de permuta'}</span>
        <span className="tabular-nums">{formatMoeda(saldo)}</span>
      </div>

      {/* ── A CONFERÊNCIA ── */}
      <Dialog open={confirmar !== null} onOpenChange={o => { if (!o) setConfirmar(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              {confirmar === 'estornar' ? 'Estornar o barter?' : 'Materializar o barter?'}
            </DialogTitle>
            <DialogDescription className="text-[12px] leading-snug">
              {confirmar === 'estornar' ? (
                <>
                  Os <strong>{materializados}</strong> lançamentos deste contrato saem do DRE e a
                  conta de permuta volta a zero. Os insumos e as vendas continuam aqui, e podem
                  ser materializados de novo depois.
                </>
              ) : (
                <>
                  Vão ser gerados <strong>{pendentes}</strong>{' '}
                  {pendentes === 1 ? 'lançamento' : 'lançamentos'}: a receita da venda como
                  entrada, as deduções como saída e cada insumo como custo.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* ⚠ A FRASE DO CAIXA FICA NAS DUAS, e não é detalhe: o operador precisa saber que
              isto NÃO mexe no banco dele. Um lançamento de R$ 400 mil que parecesse caixa faria
              qualquer um abortar a operação — ou, pior, acreditar. */}
          <div className="rounded-md border bg-muted/40 px-2.5 py-2 text-[11px] leading-snug">
            Tudo vai para a conta <strong>{contaPermutaNome ?? '—'}</strong>, que é de permuta:
            entra no resultado e <strong>não toca no caixa</strong>. O saldo dela é o que se deve
            ao parceiro, ou o que ele deve ao produtor.
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
            <Button
              variant={confirmar === 'estornar' ? 'destructive' : 'default'}
              className="gap-1"
              disabled={ocupado}
              onClick={() => {
                const acao = confirmar;
                setConfirmar(null);
                if (acao === 'estornar') onEstornar(); else onMaterializar();
              }}>
              {confirmar === 'estornar'
                ? (<><Undo2 className="h-4 w-4" /> Estornar</>)
                : (<><CheckCircle2 className="h-4 w-4" /> Materializar</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
