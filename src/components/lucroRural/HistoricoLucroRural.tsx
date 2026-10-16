/**
 * FIN-LR-SYNC-01 passo b — tela 2, "Atualizações do Lucro Rural" (mock-lr-sync): as aplicações do cliente (quando, quem, arquivos,
 * contagens) e o DESFAZER, só na ÚLTIMA não desfeita (a regra é do banco, `fn_lr_sync_desfazer`; a tela só oferece onde vale).
 * O desfazer SIMULA antes e mostra o que não pode ser desfeito e por quê; só então grava.
 */
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { desfazerLr } from '@/v2/hooks/useLrSyncAplicar';
import { fraseDoMotivo, itensDoRetorno, type ItemDoRetorno } from '@/v2/lib/lucroRural/telaLr';

export interface AplicacaoLr {
  id: string; aplicadaEm: string; aplicadaPor: string | null; quem: string | null; desfeitaEm: string | null; arquivos: string;
  novas: number; atualizadas: number; vinculos: number; aguardam: number;
}

const ehObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const n = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'number' ? Number(o[k]) : 0);

/** A linha da tabela, lida sem cast do que o banco devolveu. */
export function lerAplicacao(x: unknown, nomes: ReadonlyMap<string, string>): AplicacaoLr | null {
  if (!ehObj(x) || typeof x.id !== 'string' || typeof x.aplicada_em !== 'string') return null;
  const resumo = ehObj(x.resumo) ? x.resumo : {};
  const por = ehObj(resumo.por_acao) ? resumo.por_acao : {};
  const sessao = ehObj(x.lr_sync_sessoes) ? x.lr_sync_sessoes : {};
  const arqs = Array.isArray(sessao.arquivos) ? sessao.arquivos.filter(ehObj).map(a => String(a.tipo ?? '')).filter(Boolean) : [];
  const por_ = typeof x.aplicada_por === 'string' ? x.aplicada_por : null;
  return {
    id: x.id, aplicadaEm: x.aplicada_em, aplicadaPor: por_, quem: por_ ? nomes.get(por_) ?? null : null,
    desfeitaEm: typeof x.desfeita_em === 'string' ? x.desfeita_em : null,
    arquivos: arqs.length ? arqs.join(' + ') : '—',
    novas: n(por, 'criar_programada'), atualizadas: n(por, 'atualizar'), vinculos: n(por, 'vincular') + n(por, 'manter'), aguardam: n(por, 'aguardar_extrato'),
  };
}

/** Só a ÚLTIMA não desfeita se desfaz (a lista vem da mais nova para a mais antiga). */
export const desfazivel = (lista: readonly AplicacaoLr[], id: string): boolean => lista.find(a => !a.desfeitaEm)?.id === id;

const fmt = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function HistoricoLucroRural({ clienteId, clienteNome, onVoltar, carregar }: {
  clienteId: string; clienteNome: string; onVoltar: () => void;
  /** Para teste: a fonte das aplicações (o padrão lê o banco). */
  carregar?: (clienteId: string) => Promise<AplicacaoLr[]>;
}) {
  const [lista, setLista] = useState<AplicacaoLr[] | null>(null);
  const [previa, setPrevia] = useState<{ id: string; itens: ItemDoRetorno[]; desfeitas: number } | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ler = useCallback(async () => {
    setLista(await (carregar ?? lerDoBanco)(clienteId));
  }, [carregar, clienteId]);
  useEffect(() => { void ler(); }, [ler]);

  const desfazer = async (id: string, simular: boolean) => {
    setOcupado(true); setRecado(null);
    try {
      const r = await desfazerLr(clienteId, id, simular);
      if (r.ok === false) { setRecado(r.frase); return; }
      const lido = itensDoRetorno(r.envelope);
      const desfeitas = lido && typeof lido.resumo.desfeitas === 'number' ? lido.resumo.desfeitas : 0;
      if (simular) { setPrevia({ id, itens: lido?.itens ?? [], desfeitas }); return; }
      setPrevia(null); setRecado(`Desfeita: ${desfeitas} itens voltaram.`);
      notificarLancamentosMudaram(clienteId);
      await ler();
    } finally { setOcupado(false); }
  };

  return (
    <div className="flex h-full flex-col" data-testid="historico-lr">
      <div className="flex h-9 shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
        <button type="button" onClick={onVoltar} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></button>
        <span className="text-[13px] font-semibold">Atualizações do Lucro Rural</span>
        <span className="rounded-full bg-white/15 px-2 text-[10px]">{clienteNome}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <table className="w-full table-fixed text-[10px]">
          <colgroup><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 60 }} /><col style={{ width: 80 }} />
            <col style={{ width: 70 }} /><col style={{ width: 80 }} /><col style={{ width: 170 }} /></colgroup>
          <thead className="sticky top-0 bg-primary text-[9.5px] uppercase text-primary-foreground">
            <tr className="h-[22px]"><th className="px-1 text-left">Quando</th><th className="px-1 text-left">Quem</th><th className="px-1 text-left">Arquivos</th>
              <th className="px-1 text-right">Novas</th><th className="px-1 text-right">Atualizadas</th><th className="px-1 text-right">Vínculos</th>
              <th className="px-1 text-right">Aguardam</th><th className="px-1 text-left">Ação</th></tr>
          </thead>
          <tbody>
            {(lista ?? []).map(a => (
              <tr key={a.id} className="h-[22px] border-b" data-testid="aplicacao-lr">
                <td className="px-1 tabular-nums">{fmt(a.aplicadaEm)}</td>
                <td className="truncate px-1" title={a.quem ?? a.aplicadaPor ?? ''}>{a.quem ?? '—'}</td>
                <td className="truncate px-1">{a.arquivos}</td>
                <td className="px-1 text-right tabular-nums">{a.novas}</td><td className="px-1 text-right tabular-nums">{a.atualizadas}</td>
                <td className="px-1 text-right tabular-nums">{a.vinculos}</td><td className="px-1 text-right tabular-nums">{a.aguardam}</td>
                <td className="px-1">
                  {a.desfeitaEm ? <span className="text-muted-foreground">desfeita em {fmt(a.desfeitaEm)}</span>
                    : desfazivel(lista ?? [], a.id)
                      ? <Button variant="outline" size="sm" className="h-[18px] px-2 text-[10px]" data-testid="desfazer-lr" disabled={ocupado}
                          onClick={() => void desfazer(a.id, true)}>Desfazer (simula antes)</Button>
                      : <span className="text-muted-foreground" data-testid="so-a-ultima">só a última pode ser desfeita</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista && lista.length === 0 && <p className="p-3 text-[11px] text-muted-foreground">Nenhuma atualização do Lucro Rural ainda.</p>}
        {previa && (
          <div className="mt-3 rounded border p-2" data-testid="previa-desfazer">
            <p className="text-[11px]">Desfazer volta {previa.desfeitas} itens. {previa.itens.filter(i => i.status === 'nao_desfeito').length} não voltam:</p>
            <ul className="text-[10px]">
              {previa.itens.filter(i => i.status === 'nao_desfeito').map((i, k) => <li key={k} className="text-destructive">{i.chave} — {fraseDoMotivo(i.motivo)}</li>)}
            </ul>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPrevia(null)}>Voltar</Button>
              <Button size="sm" className="h-7 text-[11px]" data-testid="confirmar-desfazer" disabled={ocupado} onClick={() => void desfazer(previa.id, false)}>Desfazer</Button>
            </div>
          </div>
        )}
        <p className="h-4 text-[11px]" data-testid="recado-historico">{recado ?? ''}</p>
      </div>
    </div>
  );
}

async function lerDoBanco(clienteId: string): Promise<AplicacaoLr[]> {
  const { data } = await (supabase as any).from('lr_sync_aplicacoes')
    .select('id, aplicada_em, aplicada_por, desfeita_em, resumo, lr_sync_sessoes(arquivos)')
    .eq('cliente_id', clienteId).order('aplicada_em', { ascending: false }).limit(50);
  const linhas: unknown[] = Array.isArray(data) ? data : [];
  const ids = [...new Set(linhas.map(x => (ehObj(x) && typeof x.aplicada_por === 'string' ? x.aplicada_por : null)).filter((v): v is string => !!v))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await supabase.from('profiles').select('user_id, nome').in('user_id', ids);
    for (const p of ps ?? []) if (p.user_id && p.nome) nomes.set(p.user_id, p.nome);
  }
  return linhas.map(x => lerAplicacao(x, nomes)).filter((a): a is AplicacaoLr => a !== null);
}
