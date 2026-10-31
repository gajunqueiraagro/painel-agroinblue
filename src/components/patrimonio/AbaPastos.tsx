/**
 * PATR-01 · PR B — aba PASTOS (só pastagem; decisão 7, D7): os pastos DO CADASTRO DA FAZENDA desta intervenção, com a área DA REFORMA
 * (sugerida pela área produtiva; sem área = vermelho e o Salvar não grava). O custo se divide pela área (`custoPorPasto`, exibição).
 * ⚠ A marcação é do modal e GRAVA NO SALVAR (`fn_patrimonio_bem_pastos_salvar`, o conjunto inteiro). Só pasto ATIVO entra.
 * ⚠ Coluna "Forrageira" do mock: não existe no cadastro de pastos — fica de fora (declarado no relatório do PR B).
 */
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { BlocoFormulario } from '@/components/ui/bloco-formulario';
import { cn } from '@/lib/utils';
import { usePastosDaFazenda } from '@/hooks/usePatrimonio';
import { custoPorPasto, n2 } from '@/lib/patrimonio/patrimonio';
import type { PastoLigado } from '@/lib/patrimonio/patrimonioApi';
import { Barra, Link, QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TFOOT_MODAL, TH_MODAL, TH_MODAL_NUM } from './pecas';

export function AbaPastos({ fazendaId, fazendaCodigo, pastos, setPastos, aquisicao, contabil }: {
  fazendaId: string; fazendaCodigo: string | null; pastos: PastoLigado[]; setPastos: (p: PastoLigado[]) => void; aquisicao: number; contabil: number;
}) {
  const { data: cadastro = [] } = usePastosDaFazenda(fazendaId || null);
  const [marcando, setMarcando] = useState(false);
  const nomeDo = useMemo(() => new Map(cadastro.map(p => [p.id, p.nome])), [cadastro]);
  const conta = custoPorPasto(pastos.map(p => ({ pasto_id: p.pasto_id, nome: nomeDo.get(p.pasto_id) ?? '…', fazenda_codigo: fazendaCodigo, area_ha: p.area_ha > 0 ? p.area_ha : 0 })), aquisicao, contabil);

  return (
    <BlocoFormulario titulo="Pastos desta intervenção" dica="vêm do cadastro de pastos da fazenda; o custo se divide pela área" className="min-h-0 flex-1">
      <div className={QUADRO_MODAL} data-testid="bem-pastos">
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col style={{ width: 44 }} /><col style={{ width: 96 }} /><col style={{ width: 70 }} /><col style={{ width: 110 }} />
            <col style={{ width: 90 }} /><col style={{ width: 120 }} /><col style={{ width: 20 }} /></colgroup>
          <thead className="text-primary-foreground">
            <tr className="h-[22px]">
              <th className={TH_MODAL}>Pasto</th><th className={TH_MODAL}>Faz.</th><th className={TH_MODAL_NUM}>Área ha</th><th className={TH_MODAL_NUM}>% do bem</th>
              <th className={TH_MODAL_NUM}>Custo R$</th><th className={TH_MODAL_NUM}>R$ / ha</th><th className={TH_MODAL_NUM}>Contábil hoje R$</th><th className={TH_MODAL} />
            </tr>
          </thead>
          <tbody>
            {pastos.map((p, i) => {
              const l = conta.linhas[i];
              const semArea = !(p.area_ha > 0);
              return (
                <tr key={p.pasto_id} className="h-[19px] border-b border-border/40" data-testid="bem-pasto">
                  <td className={TD_MODAL_TEXTO} title={nomeDo.get(p.pasto_id)}>{nomeDo.get(p.pasto_id) ?? '…'}</td>
                  <td className={cn(TD_MODAL, 'whitespace-nowrap')}>{fazendaCodigo ?? '—'}</td>
                  <td className={cn(TD_MODAL, 'py-0')}>
                    <CampoNumeroComConta valor={p.area_ha > 0 ? p.area_ha : null} invalido={semArea} soAoSair
                      onChange={v => setPastos(pastos.map(x => (x.pasto_id === p.pasto_id ? { ...x, area_ha: v ?? 0 } : x)))}
                      className="h-[16px] px-1 py-0 text-right text-[10px]" />
                  </td>
                  <td className={TD_MODAL_NUM}>{semArea ? '—' : `${n2(l?.pct ?? 0)} %`}</td>
                  <td className={TD_MODAL_NUM}>{semArea ? '—' : n2(l?.custo ?? 0)}</td>
                  <td className={TD_MODAL_NUM}>{conta.porHa != null && !semArea ? n2(conta.porHa) : '—'}</td>
                  <td className={TD_MODAL_NUM}>{semArea ? '—' : n2(l?.contabil ?? 0)}</td>
                  <td className={cn(TD_MODAL, 'px-0 text-center')}>
                    <button type="button" className="text-muted-foreground hover:text-destructive" title="Desmarcar este pasto"
                      onClick={() => setPastos(pastos.filter(x => x.pasto_id !== p.pasto_id))}><X className="mx-auto h-3 w-3" /></button>
                  </td>
                </tr>
              );
            })}
            {pastos.length === 0 && (
              <tr className="h-[19px]"><td colSpan={8} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>Nenhum pasto marcado — use “+ marcar pastos do cadastro”.</td></tr>
            )}
          </tbody>
          <tfoot className={TFOOT_MODAL}>
            <tr className="h-[22px] text-[10px]">
              <td className="px-1">{pastos.length} {pastos.length === 1 ? 'pasto' : 'pastos'}</td><td />
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(conta.areaTotal)}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{pastos.length ? '100,00 %' : ''}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(aquisicao)}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{conta.porHa != null ? n2(conta.porHa) : '—'}</td>
              <td className="whitespace-nowrap px-1 text-right tabular-nums">{n2(contabil)}</td><td />
            </tr>
          </tfoot>
        </table>
      </div>
      <Barra>
        <Link onClick={() => setMarcando(true)} disabled={!fazendaId} title={fazendaId ? undefined : 'escolha a fazenda do bem'} testId="bem-marcar-pastos">+ marcar pastos do cadastro</Link>
        <span className="flex-1" />
        <span className="text-muted-foreground">a área é a da reforma (não segue mudanças futuras do cadastro) · grava no Salvar</span>
      </Barra>

      {marcando && (
        <Dialog open onOpenChange={v => { if (!v) setMarcando(false); }}>
          <DialogContent className="flex h-[min(420px,calc(100vh-16px))] w-[480px] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:text-primary-foreground [&>button]:top-2.5" data-testid="marcar-pastos">
            <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
              <DialogTitle className="text-[11px] font-semibold">Pastos da fazenda {fazendaCodigo ?? ''}</DialogTitle>
              <DialogDescription className="sr-only">Marque os pastos desta intervenção</DialogDescription>
            </div>
            <div className="flex min-h-0 flex-1 flex-col bg-muted p-2">
              <div className={QUADRO_MODAL}>
                <table className="w-full table-fixed border-collapse">
                  <colgroup><col style={{ width: 24 }} /><col /><col style={{ width: 110 }} /></colgroup>
                  <thead className="text-primary-foreground"><tr className="h-[22px]"><th className={TH_MODAL} /><th className={TH_MODAL}>Pasto</th><th className={TH_MODAL_NUM}>Área produtiva ha</th></tr></thead>
                  <tbody>
                    {cadastro.filter(p => p.ativo).map(p => {
                      const marcado = pastos.some(x => x.pasto_id === p.id);
                      return (
                        <tr key={p.id} className="h-[19px] cursor-pointer border-b border-border/40 hover:bg-muted/40" data-testid="marcar-pasto"
                          onClick={() => setPastos(marcado ? pastos.filter(x => x.pasto_id !== p.id) : [...pastos, { pasto_id: p.id, area_ha: p.area_produtiva_ha ?? 0 }])}>
                          <td className={cn(TD_MODAL, 'px-1')}><Checkbox checked={marcado} className="h-3 w-3" aria-label="marcar" /></td>
                          <td className={TD_MODAL_TEXTO} title={p.nome}>{p.nome}</td>
                          <td className={cn(TD_MODAL_NUM, p.area_produtiva_ha == null && 'text-destructive')}>{p.area_produtiva_ha != null ? n2(p.area_produtiva_ha) : 'sem área'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex h-[40px] shrink-0 items-center justify-end border-t bg-card px-3">
              <Button size="sm" className="h-[26px] text-[11px]" onClick={() => setMarcando(false)}>Pronto</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </BlocoFormulario>
  );
}
