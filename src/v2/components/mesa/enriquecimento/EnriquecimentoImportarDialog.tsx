// EnriquecimentoImportarDialog — modal de importação (ação pontual).
// Arquivo .xlsx → preview → DE/PARA de conta (obrigatório quando há contas
// distintas) → Popular (fn_classificacao_populate_staging, via hook compartilhado).
// Escrita SOMENTE em staging. NUNCA toca financeiro_lancamentos_v2.
import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { reportarErro } from '@/lib/erroOperacional';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useImportarClassificacao } from '@/v2/hooks/useImportarClassificacao';
import { fmtBRL, fmtData } from './fmt';

export interface EnriquecimentoImportarDialogProps {
  open: boolean;
  onClose: () => void;
  clienteId: string | null;
  onImportado: (sessaoId: string) => void;
}

export function EnriquecimentoImportarDialog({ open, onClose, clienteId, onImportado }: EnriquecimentoImportarDialogProps) {
  const hookFin = useFinanceiroV2();
  const imp = useImportarClassificacao(clienteId);

  // Contas do cliente (lazy) para o DE/PARA — carrega ao abrir.
  useEffect(() => {
    if (open && clienteId) hookFin.loadContas();
  }, [open, clienteId, hookFin.loadContas]);

  const contas = hookFin.contasBancarias;

  // Agrupamento visual do select por tipo_conta (mesmo vocabulário do cadastro:
  // cc/inv/cartao). Só apresentação — IDs e DE/PARA inalterados. Cabeçalhos via
  // <optgroup> (nativamente não-selecionáveis); alfabético dentro do grupo.
  const nomeConta = (cb: (typeof contas)[number]) =>
    `${cb.nome_exibicao ?? cb.nome_conta}${cb.codigo_conta ? ` (${cb.codigo_conta})` : ''}`;
  const GRUPOS_CONTA: Array<{ tipo: string | null; label: string }> = [
    { tipo: 'cc', label: 'CONTAS CORRENTES' },
    { tipo: 'inv', label: 'INVESTIMENTOS' },
    { tipo: 'cartao', label: 'CARTÕES' },
    { tipo: null, label: 'OUTRAS' }, // legado sem tipo_conta
  ];
  const contasDoGrupo = (tipo: string | null) =>
    contas
      .filter((cb) => (cb.tipo_conta ?? null) === tipo)
      .sort((a, b) => nomeConta(a).localeCompare(nomeConta(b), 'pt-BR'));

  const lote = imp.lote;
  const podePopular = !!lote && lote.linhasValidas > 0 && imp.todasResolvidasOuIgnoradas && !imp.isPopulating;

  async function handleSelect(file: File | null) {
    try {
      const parsed = await imp.selecionarArquivo(file);
      if (!parsed) return;
      if (parsed.linhasValidas === 0 && parsed.linhasComErro > 0) toast.error(`Nenhuma linha válida — ${parsed.linhasComErro} rejeitada(s).`);
      else if (parsed.linhasComErro > 0) toast.warning(`${parsed.linhasValidas} válida(s) · ${parsed.linhasComErro} rejeitada(s).`);
      else toast.success(`Excel lido: ${parsed.linhasValidas} linha(s) válida(s).`);
    } catch (e: unknown) {
      // As rejeições de linha do parser continuam visíveis na lista `errosParser`
      // do preview; aqui só a falha global da leitura, já sanitizada.
      reportarErro(e, 'lerExcelClassificacao', toast.error);
    }
  }

  async function handlePopular() {
    try {
      const res = await imp.popular();
      if (!res) return;
      const totais = Object.entries(res.counts).map(([k, v]) => `${k}: ${v}`).join(' · ');
      toast.success(`Staging populada (${res.inseridas} linhas). ${totais}`);
      onImportado(res.sessaoId);
      imp.reset();
    } catch (e: unknown) {
      reportarErro(e, 'popularStagingClassificacao', toast.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Importar Excel de classificação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="file" accept=".xlsx" className="text-xs" onChange={(e) => handleSelect(e.target.files?.[0] ?? null)} />
            {imp.parsing && <span className="text-[11px] text-muted-foreground">Lendo…</span>}
          </div>

          {lote && (
            <div className="rounded border p-2 text-[11px]">
              <b>{lote.linhasValidas}</b> válida(s) · <b>{lote.linhasComErro}</b> rejeitada(s) de {lote.linhasValidas + lote.linhasComErro}.
              {imp.errosParser.length > 0 && (
                <ul className="mt-1 text-red-700 max-h-24 overflow-y-auto list-disc pl-4">
                  {imp.errosParser.slice(0, 8).map((er, i) => <li key={i}>L{er.linha}: {er.motivo}</li>)}
                  {imp.errosParser.length > 8 && <li>… +{imp.errosParser.length - 8}</li>}
                </ul>
              )}
            </div>
          )}

          {imp.contasDistintas.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold">Mapear contas do Excel ({imp.contasDistintas.length}) — obrigatório antes de popular</div>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {imp.contasDistintas.map((c) => {
                  const item = imp.contaMap[c.texto];
                  const ignorar = !!item?.ignorar;
                  return (
                    <div key={c.texto} className="border rounded p-2 space-y-1">
                      <div className="flex items-baseline gap-2 text-[11px]">
                        <span className="font-mono font-semibold">{c.texto}</span>
                        <span className="text-muted-foreground">({c.qtd})</span>
                        <span className="ml-auto text-muted-foreground">{fmtData(c.exemplo.data)} · {fmtBRL(c.exemplo.valor)}</span>
                      </div>
                      <select
                        className="w-full rounded border px-2 py-1 text-xs disabled:opacity-50"
                        value={item?.contaId ?? ''}
                        disabled={ignorar}
                        onChange={(e) => imp.resolverConta(c.texto, { contaId: e.target.value || null })}
                      >
                        <option value="">Selecione a conta…</option>
                        {GRUPOS_CONTA.map((g) => {
                          const cs = contasDoGrupo(g.tipo);
                          if (cs.length === 0) return null;
                          return (
                            <optgroup key={g.label} label={g.label}>
                              {cs.map((cb) => (
                                <option key={cb.id} value={cb.id}>{nomeConta(cb)}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <Checkbox checked={ignorar} onCheckedChange={(v) => imp.resolverConta(c.texto, { ignorar: v === true })} />
                        Ignorar esta conta
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={!podePopular} onClick={handlePopular}>
              {imp.isPopulating ? 'Populando…' : 'Popular staging'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
