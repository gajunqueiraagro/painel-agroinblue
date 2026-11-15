/**
 * NOTA-PAGTO-PARCELADO-01 P1 (Gabriel 11/11, NF do trator Iguaçu: paga em 110.000 + 4 × 25.000 por PIX, lançamentos SOLTOS que a busca da
 * nota não juntava — ela casa cada duplicata com UM lançamento) — "Outros lançamentos do fornecedor": os lançamentos de saída do MESMO
 * FORNECEDOR (o CNPJ raiz: todas as filiais) num período editável, qualquer status; o operador MARCA os que pagam a nota e o rodapé diz
 * "Selecionados N · soma · nota · diferença" (`resumoDaSelecao`, o mesmo dono das Sugestões para casar). "Juntar à nota" só os põe na lista
 * da prévia (como achados 'escolhido'): a ação de cada linha e o Aplicar são os de sempre — VINCULAR SÓ LIGA (nunca muda valor, data,
 * status). Diferença ≠ 0 só avisa; nada trava.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { resumoDaSelecao } from '@/lib/conciliacao/selecaoParaCasar';
import { lancamentosDoFornecedorNoPeriodo, LIMITE_DE_OUTROS_LANCAMENTOS } from '@/lib/financeiro/nfeConsultas';
import type { LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { cn } from '@/lib/utils';

const reais = (cent: number) => (cent / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const TH = 'sticky top-0 z-10 h-[20px] bg-primary px-1.5 text-left text-[9.5px] font-medium text-primary-foreground whitespace-nowrap';
const TD = 'h-[19px] px-1.5 text-[10px] leading-none whitespace-nowrap';
const ROTULO_DO_STATUS: Record<string, string> = {
  realizado: 'pago', conciliado: 'conciliado', programado: 'programado', agendado: 'agendado', previsto: 'previsto', meta: 'meta',
};

/** O período padrão: a emissão − 120 dias até a última duplicata (ou a emissão) + 180 dias — a compra a prazo longo cabe. */
export function periodoPadrao(emissao: string, ultimoVencimento: string | null): { de: string; ate: string } {
  const soma = (iso: string, dias: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) return { de: '', ate: '' };
  const fim = ultimoVencimento && ultimoVencimento > emissao ? ultimoVencimento : emissao;
  return { de: soma(emissao, -120), ate: soma(fim, 180) };
}

export function OutrosLancamentosDaNota({ clienteId, emitenteDocumento, emitenteNome, notaCent, periodo, jaNaLista, onJuntar, onFechar }: {
  clienteId: string; emitenteDocumento: string; emitenteNome: string; notaCent: number;
  periodo: { de: string; ate: string };
  /** os que já estão na prévia (achados ou escolhidos): aparecem marcados e travados, e contam na soma */
  jaNaLista: readonly LancamentoJaLancado[];
  onJuntar: (escolhidos: LancamentoJaLancado[]) => void;
  onFechar: () => void;
}) {
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);
  const [lista, setLista] = useState<LancamentoJaLancado[] | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let vivo = true;
    setLista(null); setFalha(null);
    void lancamentosDoFornecedorNoPeriodo(clienteId, emitenteDocumento, de, ate).then((r) => {
      if (!vivo) return;
      if (r.ok === false) setFalha('Não consegui ler os lançamentos do fornecedor.'); else setLista(r.valor);
    });
    return () => { vivo = false; };
  }, [clienteId, emitenteDocumento, de, ate, tentativa]);
  const naLista = useMemo(() => new Set(jaNaLista.filter((l) => !l.cancelado).map((l) => l.id)), [jaNaLista]);
  /* a soma: os que já estão na prévia + os marcados aqui (nunca duas vezes o mesmo) */
  const valores = useMemo(() => {
    const ids = new Set([...naLista, ...marcados]);
    const porId = new Map([...jaNaLista, ...(lista ?? [])].map((l) => [l.id, l.valorCent]));
    return [...ids].map((id) => (porId.get(id) ?? 0) / 100);
  }, [naLista, marcados, jaNaLista, lista]);
  const resumo = resumoDaSelecao(valores, notaCent / 100);
  const novos = (lista ?? []).filter((l) => marcados.has(l.id) && !naLista.has(l.id));
  const alternar = (id: string) => setMarcados((m) => { const s = new Set(m); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-16px))] w-[min(820px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="outros-lancamentos">
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={emitenteNome}>Outros lançamentos do fornecedor · {emitenteNome}</DialogTitle>
          <DialogDescription className="sr-only">Marque os lançamentos que pagam esta nota</DialogDescription>
        </div>
        <div className="flex h-[34px] shrink-0 items-center gap-2 border-b px-3 text-[10.5px]">
          <span className="shrink-0 text-muted-foreground" title="Todas as filiais do mesmo CNPJ (os 8 primeiros dígitos), saídas não canceladas, qualquer status">Vencimento de</span>
          <div className="w-[118px] shrink-0"><DatePicker value={de} onChange={setDe} size="compact" data-testid="outros-de" /></div>
          <span className="shrink-0 text-muted-foreground">até</span>
          <div className="w-[118px] shrink-0"><DatePicker value={ate} onChange={setAte} size="compact" data-testid="outros-ate" /></div>
          <span className="min-w-0 flex-1 truncate text-right text-muted-foreground" title="mesmo CNPJ raiz: todas as filiais">
            {lista === null ? (falha ? '' : 'Lendo…') : `${lista.length}${lista.length >= LIMITE_DE_OUTROS_LANCAMENTOS ? '+' : ''} no período · todas as filiais`}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-1.5" data-testid="outros-rolagem">
          {falha ? (
            <div className="flex h-[40px] items-center gap-2 text-[11px] text-destructive" data-testid="outros-falha">
              {falha}<Button variant="outline" size="sm" className="h-[22px] px-2 text-[10.5px]" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</Button>
            </div>
          ) : (
            <table className="w-full min-w-[640px] table-fixed border-collapse">
              <colgroup><col style={{ width: 26 }} /><col style={{ width: 76 }} /><col style={{ width: 76 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 84 }} /></colgroup>
              <thead><tr>
                <th className={TH} /><th className={TH}>Venc.</th><th className={TH}>Pgto.</th><th className={TH}>Descrição</th>
                <th className={cn(TH, 'text-right')}>Valor</th><th className={TH}>Status</th>
              </tr></thead>
              <tbody>
                {lista !== null && lista.length === 0 && (
                  <tr><td colSpan={6} className={cn(TD, 'text-muted-foreground')} data-testid="outros-vazio">Nenhum lançamento deste fornecedor no período.</td></tr>
                )}
                {(lista ?? []).map((l) => {
                  const travado = naLista.has(l.id);
                  const marcado = travado || marcados.has(l.id);
                  return (
                    <tr key={l.id} className={cn('border-b border-border/50', marcado && 'bg-primary/5')} data-testid="outros-linha">
                      <td className={TD}>
                        <Checkbox checked={marcado} disabled={travado} onCheckedChange={() => alternar(l.id)} aria-label="Marcar"
                          title={travado ? 'já está na lista da nota' : undefined} data-testid="outros-marcar" />
                      </td>
                      <td className={cn(TD, 'tabular-nums')}>{data(l.vencimento)}</td>
                      <td className={cn(TD, 'tabular-nums')}>{data(l.pagamento)}</td>
                      <td className={TD}><span className="block truncate" title={`${l.descricao ?? '—'}${l.fornecedorNome ? ` · ${l.fornecedorNome}` : ''}`}>{l.descricao ?? '—'}</span></td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{reais(l.valorCent)}</td>
                      <td className={TD}><span className="block truncate" title={l.status ?? undefined}>{l.status ? ROTULO_DO_STATUS[l.status] ?? l.status : '—'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* o rodapé: "Selecionados N · soma · nota · diferença" em colunas (a mesma conta das Sugestões para casar); diferença ≠ 0 só avisa */}
        <div className="grid h-[40px] shrink-0 items-center gap-3 border-t px-3 text-[10.5px]" style={{ gridTemplateColumns: 'auto auto auto auto minmax(0, 1fr) auto auto' }} data-testid="outros-rodape">
          <span className="whitespace-nowrap">Selecionados <b className="tabular-nums" data-testid="outros-n">{resumo.n}</b></span>
          <span className="whitespace-nowrap">soma <b className="tabular-nums" data-testid="outros-soma">{reais(Math.round(resumo.soma * 100))}</b></span>
          <span className="whitespace-nowrap">nota <b className="tabular-nums">{reais(notaCent)}</b></span>
          <span className={cn('whitespace-nowrap', resumo.diferenca !== 0 ? 'text-amber-800' : 'text-emerald-700')} data-testid="outros-diferenca"
            title={resumo.diferenca < 0 ? 'falta para a soma chegar à nota' : resumo.diferenca > 0 ? 'a soma passa da nota' : 'a soma bate com a nota'}>
            {resumo.diferenca === 0 ? 'confere' : `${resumo.diferenca < 0 ? 'faltam' : 'passa'} ${reais(Math.abs(Math.round(resumo.diferenca * 100)))}`}
          </span>
          <span />
          <Button variant="outline" size="sm" className="h-[24px] px-3 text-[11px]" onClick={onFechar}>Voltar</Button>
          <Button size="sm" className="h-[24px] px-3 text-[11px]" disabled={novos.length === 0} onClick={() => onJuntar(novos)} data-testid="outros-juntar"
            title="Põe os marcados na lista da nota; a ação de cada um (Vincular) e o Aplicar são os da prévia">
            Juntar à nota{novos.length ? ` (${novos.length})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
