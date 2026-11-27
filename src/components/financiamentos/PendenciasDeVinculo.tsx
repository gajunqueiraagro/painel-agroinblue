/**
 * FINANC-VINCULO-OBRIGATORIO-01 FASE 1 · V2 (Gabriel 27/11) — TODAS as pendências de vínculo do cliente (lançamento de financiamento sem
 * contrato), com o filtro por ano. Só leitura: a lista é a do banco (`fn_financiamento_vinculos_pendentes`, a mesma regra do aviso do modal).
 * ⚠ TAMANHO FIXO (920 × 560), um scrollport (a lista), régua da casa, total no rodapé.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Segmentado } from '@/components/ui/segmentado';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { QUADRO_REGUA, RODAPE_REGUA, TD_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import { consultarPendenciasDeVinculo, ROTULO_DO_TIPO, type AnoDasPendencias, type PendenciaDeVinculo } from '@/lib/financiamentos/vinculoPendente';
import { cn } from '@/lib/utils';

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const COLS = <colgroup><col style={{ width: 84 }} /><col style={{ width: 120 }} /><col style={{ width: 200 }} /><col style={{ width: 190 }} /><col /><col style={{ width: 110 }} /></colgroup>;

export function PendenciasDeVinculo({ clienteId, aoFechar }: { clienteId: string; aoFechar: () => void }) {
  const [ano, setAno] = useState('todos');
  const [anos, setAnos] = useState<AnoDasPendencias[]>([]);
  const [itens, setItens] = useState<PendenciaDeVinculo[] | string | null>(null);

  useEffect(() => {
    let vivo = true;
    setItens(null);
    void consultarPendenciasDeVinculo(clienteId, ano === 'todos' ? null : Number(ano)).then((r) => {
      if (!vivo) return;
      if (typeof r === 'string') { setItens(r); return; }
      setAnos(r.anos); setItens(r.itens);
    });
    return () => { vivo = false; };
  }, [clienteId, ano]);

  const lista = Array.isArray(itens) ? itens : [];
  const total = lista.reduce((s, i) => s + Math.round(i.valor * 100), 0) / 100;
  const todos = anos.reduce((s, a) => s + a.n, 0);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(920px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="pendencias-de-vinculo">
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 text-[11px] font-semibold">Lançamentos de financiamento sem contrato</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 whitespace-nowrap text-[10px] text-primary-foreground/80">a pendência fica até vincular</DialogDescription>
        </div>
        <div className="flex h-[38px] shrink-0 items-center gap-2 px-3 text-[10px]">
          <span className="text-muted-foreground">Ano</span>
          <Segmentado altura={22} valor={ano} onEscolher={setAno}
            opcoes={[{ valor: 'todos', rotulo: `Todos (${todos})` }, ...anos.map((a) => ({ valor: String(a.ano), rotulo: `${a.ano} (${a.n})` }))]} />
        </div>
        <div className="min-h-0 flex-1 px-3 pb-2">
          <div className={QUADRO_REGUA}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              {COLS}
              <thead><tr>
                <th className={cn(TH_REGUA, 'text-left')}>Data</th><th className={cn(TH_REGUA, 'text-left')}>Tipo</th><th className={cn(TH_REGUA, 'text-left')}>Conta</th>
                <th className={cn(TH_REGUA, 'text-left')}>Fornecedor</th><th className={cn(TH_REGUA, 'text-left')}>Descrição</th><th className={cn(TH_REGUA, 'text-right')}>Valor</th>
              </tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="pendencias-lista">
              <table className="w-full table-fixed border-collapse">
                {COLS}
                <tbody>
                  {itens === null && <tr><td colSpan={6} className={cn(TD_REGUA, 'text-muted-foreground')}>Lendo…</td></tr>}
                  {typeof itens === 'string' && <tr><td colSpan={6} className={cn(TD_REGUA, 'text-destructive')}>{itens}</td></tr>}
                  {Array.isArray(itens) && !lista.length && <tr><td colSpan={6} className={cn(TD_REGUA, 'text-muted-foreground')}>Nenhuma pendência neste recorte.</td></tr>}
                  {lista.map((i) => (
                    <tr key={i.lancamentoId} className="border-b border-border/50 even:bg-muted/30" data-testid="pendencia-linha">
                      <td className={cn(TD_REGUA, 'tabular-nums')}>{br(i.data)}</td>
                      <td className={TD_REGUA_TEXTO}>{ROTULO_DO_TIPO[i.tipo]}</td>
                      <td className={TD_REGUA_TEXTO} title={i.subcentro ?? undefined}>{i.subcentro ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO} title={i.fornecedor ?? undefined}>{i.fornecedor ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO} title={i.descricao ?? undefined}>{i.descricao ?? '—'}</td>
                      <td className={TD_REGUA_NUM}>{num2(i.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <table className={cn('w-full table-fixed border-collapse', RODAPE_REGUA)}>
              {COLS}
              <tbody><tr className="h-[23px]">
                <td className="px-1 font-semibold" colSpan={5} data-testid="pendencias-total-n">{lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'}</td>
                <td className="px-1 text-right font-semibold tabular-nums" data-testid="pendencias-total">{num2(total)}</td>
              </tr></tbody>
            </table>
          </div>
        </div>
        <div className="flex h-[40px] shrink-0 items-center justify-end border-t px-3">
          <Button variant="outline" size="sm" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
