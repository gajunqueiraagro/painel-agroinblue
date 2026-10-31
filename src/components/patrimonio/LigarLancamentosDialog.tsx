/**
 * PATR-01 · PR B — "+ ligar lançamento": a busca entre os INVESTIMENTOS SEM BEM do cliente (`fn_investimentos_sem_bem`, por parte).
 * ⚠ PRÉVIA ANTES DE LIGAR (`fn_patrimonio_bem_ligar` com `p_simular`): a recusa vem pronta do banco, item a item (RH, cancelado,
 * captação, já ligado a outro bem). COMPRA PARCELADA/CONSÓRCIO: a prévia propõe as parcelas que faltam do contrato e o banco só grava
 * o contrato inteiro — "Incluir as N parcelas" põe todas na escolha. REPETIDA? (D8): só liga com a caixa de confirmação marcada.
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { casaNaBusca } from '@/lib/texto/busca';
import { cn } from '@/lib/utils';
import { useItensSemBem, usePatrimonioApi, useRelerPatrimonio } from '@/hooks/usePatrimonio';
import { brl, dataBR, n2 } from '@/lib/patrimonio/patrimonio';
import type { ItemDoVinculo, PreviaLigar } from '@/lib/patrimonio/patrimonioApi';
import { QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TH_MODAL, TH_MODAL_NUM } from './pecas';

const chave = (i: ItemDoVinculo) => `${i.lancamento_id}#${i.parte_ordem}`;

export function LigarLancamentosDialog({ bemId, clienteId, aoFechar }: { bemId: string; clienteId: string; aoFechar: () => void }) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const { data: itens = [], isLoading } = useItensSemBem(clienteId, true);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Map<string, ItemDoVinculo>>(new Map());
  const [previa, setPrevia] = useState<PreviaLigar | null>(null);
  const [confirmaRepetidas, setConfirmaRepetidas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  const visiveis = useMemo(() => itens.filter(i => !busca.trim()
    || [i.descricao, i.fornecedor, i.subcentro, i.fazenda_codigo, n2(i.valor)].some(t => casaNaBusca(t, busca))).slice(0, 500), [itens, busca]);
  const somaMarcada = [...marcados.keys()].reduce((t, k) => t + (itens.find(i => chave(i) === k)?.valor ?? 0), 0);

  const alternar = (i: ItemDoVinculo) => {
    setMarcados(m => { const n = new Map(m); if (n.has(chave(i))) n.delete(chave(i)); else n.set(chave(i), { lancamento_id: i.lancamento_id, parte_ordem: i.parte_ordem }); return n; });
    setPrevia(null); setErro(null);
  };
  const conferir = async () => {
    setIndo(true); setErro(null);
    const r = await api.ligar(bemId, [...marcados.values()], confirmaRepetidas, true);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    setPrevia(r.dados);
  };
  const incluirContrato = () => {
    if (!previa) return;
    setMarcados(m => { const n = new Map(m); for (const c of previa.contratos) for (const f of c.faltam) n.set(chave(f), f); return n; });
    setPrevia(null);
  };
  const ligar = async () => {
    setIndo(true); setErro(null);
    const r = await api.ligar(bemId, [...marcados.values()], confirmaRepetidas, false);
    setIndo(false);
    if (!r.ok) { setErro(r.erro); return; }
    toast.success(`${r.dados.n_ligar} ${r.dados.n_ligar === 1 ? 'lançamento ligado' : 'lançamentos ligados'} ao bem.`);
    await reler();
    aoFechar();
  };

  const faltamContrato = previa?.contratos.reduce((t, c) => t + c.n_faltam, 0) ?? 0;
  const podeLigar = !!previa && previa.n_recusas === 0 && faltamContrato === 0 && (previa.n_repetidas === 0 || confirmaRepetidas) && marcados.size > 0;

  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(480px,calc(100vh-16px))] w-[min(860px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:text-primary-foreground [&>button]:top-2.5"
        data-testid="ligar-lancamentos">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Ligar lançamentos ao bem</DialogTitle>
          <DialogDescription className="sr-only">Escolha entre os investimentos sem bem</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="flex h-[24px] shrink-0 items-center gap-2">
            <div className="relative w-[260px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, subcentro, valor…" className="h-[24px] pl-6 text-[10px]" autoFocus />
            </div>
            <span className="text-[10px] text-muted-foreground">investimentos sem bem do cliente · ligar só liga, o lançamento não muda</span>
          </div>
          <div className={QUADRO_MODAL}>
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 24 }} /><col style={{ width: 70 }} /><col /><col style={{ width: 160 }} /><col style={{ width: 190 }} /><col style={{ width: 40 }} /><col style={{ width: 90 }} /></colgroup>
              <thead className="text-primary-foreground">
                <tr className="h-[22px]">
                  <th className={TH_MODAL} /><th className={TH_MODAL}>Data</th><th className={TH_MODAL}>Descrição</th><th className={TH_MODAL}>Fornecedor</th>
                  <th className={TH_MODAL}>Subcentro</th><th className={TH_MODAL}>Faz.</th><th className={TH_MODAL_NUM}>Valor R$</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(i => {
                  const k = chave(i); const ligado = marcados.has(k);
                  const recusa = previa?.itens.find(x => chave(x) === k && x.situacao === 'recusa');
                  return (
                    <tr key={k} className={cn('h-[19px] cursor-pointer border-b border-border/40 hover:bg-muted/40', ligado && 'bg-primary/5', recusa && 'bg-red-50')}
                      onClick={() => alternar(i)} data-testid="ligar-item">
                      <td className={cn(TD_MODAL, 'px-1')}><Checkbox checked={ligado} className="h-3 w-3" aria-label="escolher" /></td>
                      <td className={cn(TD_MODAL_NUM, 'text-left text-[9.5px]')}>{dataBR(i.data)}</td>
                      <td className={TD_MODAL_TEXTO} title={recusa?.motivo ?? i.descricao ?? undefined}>
                        {i.repetida && <span className="mr-1 text-amber-700" title="possível repetição">repetida?</span>}
                        {i.de_contrato && <span className="mr-1 text-sky-800" title="parcela de compra parcelada: entra pelo total do contrato">parcela</span>}
                        {recusa ? <span className="text-destructive">{recusa.motivo}</span> : i.descricao ?? '—'}
                      </td>
                      <td className={TD_MODAL_TEXTO} title={i.fornecedor ?? undefined}>{i.fornecedor ?? '—'}</td>
                      <td className={TD_MODAL_TEXTO} title={i.subcentro ?? undefined}>{i.subcentro ?? '—'}</td>
                      <td className={cn(TD_MODAL, 'whitespace-nowrap')}>{i.fazenda_codigo ?? '—'}</td>
                      <td className={TD_MODAL_NUM}>{n2(i.valor)}</td>
                    </tr>
                  );
                })}
                {visiveis.length === 0 && (
                  <tr className="h-[19px]"><td colSpan={7} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>
                    {isLoading ? 'Carregando…' : busca.trim() ? `Nada para “${busca.trim()}”.` : 'Nenhum investimento sem bem.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* A PRÉVIA — linha fixa: o que o banco disse */}
          <div className="flex h-[24px] shrink-0 items-center gap-2 text-[10px]" data-testid="ligar-previa">
            {previa && faltamContrato > 0 ? (
              <>
                <span className="text-amber-800">{previa.contratos.map(c => `“${c.descricao ?? 'compra'}”: ${c.n_parcelas} parcelas, ${brl(c.valor_total)}`).join(' · ')} — o bem entra pelo total da compra.</span>
                <Button size="sm" variant="outline" className="h-[22px] text-[10px]" onClick={incluirContrato}>Incluir as {faltamContrato} parcelas que faltam</Button>
              </>
            ) : previa && previa.n_repetidas > 0 ? (
              <label className="flex items-center gap-1.5 text-amber-800">
                <Checkbox checked={confirmaRepetidas} onCheckedChange={v => setConfirmaRepetidas(v === true)} className="h-3 w-3" />
                {previa.n_repetidas} marcado(s) como possível repetição — confirmo que é custo deste bem
              </label>
            ) : previa ? (
              <span className={previa.n_recusas ? 'text-destructive' : 'text-muted-foreground'}>
                {previa.n_recusas ? `${previa.n_recusas} não se ligam (em vermelho na lista).` : `Soma na aquisição: ${brl(previa.soma)}.`}
              </span>
            ) : <span className="text-destructive">{erro ?? ''}</span>}
          </div>
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
            {marcados.size} escolhido(s) · {brl(somaMarcada)}{erro && previa ? ` · ${erro}` : ''}
          </span>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Fechar</Button>
          <Button variant="outline" size="sm" className="h-[26px] w-[72px] text-[11px]" disabled={indo || marcados.size === 0} onClick={() => void conferir()} data-testid="ligar-conferir">Conferir</Button>
          <Button size="sm" className="h-[26px] w-[72px] text-[11px]" disabled={indo || !podeLigar} onClick={() => void ligar()}
            title={podeLigar ? undefined : 'confira antes (a prévia do banco)'} data-testid="ligar-confirmar">Ligar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
