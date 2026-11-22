/**
 * PainelDaConta — CONC-PAINEL-CONTA-01 (fatia 1; decisão do Gabriel 17/11 09:57, mock v2 `ui-validar/conc-painel-conta-02.html`).
 * O ✎ da conta em "Saldos por conta" abre este painel À DIREITA, por cima (o Resumo do mês não muda): os 4 passos do mês da conta e as
 * importações dela.
 * ⚠ O PAINEL LEVA ÀS PEÇAS QUE JÁ EXISTEM, NÃO AS REFAZ (item 4 da decisão): "Importar banco"/"Buscar do banco" abre a aba Importar
 *   banco nesta conta (onde a importação e o Open Finance moram); "Casar lançamentos (N)" abre o MODAL Conferência de hoje
 *   (Todos/Sem par/Casados/Vencidos) nesta conta e mês; "✎ Informar" abre o `SaldoRealDialog` (o que o ✎ abria). O desfazer de um
 *   arquivo segue no "Ver importações" da aba Importar banco (`fn_extrato_desfazer_arquivo`).
 * ⚠ Os números são do DONO (`passosDaConta`): nada se recalcula aqui.
 */
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import type { LinhaResumo } from '@/lib/conciliacao/resumoDoDono';
import { saldosDaLinha } from '@/lib/conciliacao/resumoDoDono';
import { ddmmaaaa, fonteDaConta, passosDaConta, type EstadoDoPasso, type UltimaImportacao } from '@/lib/conciliacao/painelDaConta';

/** O fundo escuro do SALDOinBLUE (#162931) e o item ativo (#196E96) — as cores medidas no print do Gabriel (09:44). */
export const FUNDO_ESCURO = '#162931';
export const AZUL_ATIVO = '#196E96';

interface Importacao extends UltimaImportacao { id: string; nome_arquivo: string | null; total_validas: number | null; cancelada: boolean }

const BOLA: Record<EstadoDoPasso, string> = { ok: 'bg-[#2f7d4f]', pendente: 'bg-[#c08a1e]', espera: 'bg-[#9aa8b8]' };
type AbaDoPainel = 'passos' | 'importacoes';
const ABAS_DO_PAINEL: readonly [AbaDoPainel, string][] = [['passos', 'Passos do mês'], ['importacoes', 'Importações']];
/** as 3 caixas do passo 4: o rótulo e o campo do DONO (`saldosDaLinha`) */
const CAIXAS_DO_SALDO: readonly [string, 'saldo_extrato' | 'saldo_sistema' | 'diferenca'][] = [
  ['Banco', 'saldo_extrato'], ['Sistema', 'saldo_sistema'], ['Diferença', 'diferenca']];
const fmt = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PainelDaConta({ aberto, aoFechar, clienteId, conta, linha, anoMes, aoImportar, aoCasar, aoInformarSaldo }: {
  aberto: boolean;
  aoFechar: () => void;
  clienteId: string | null;
  conta: { id: string; nome: string } | null;
  /** a linha da conta no DONO (`fn_conciliacao_resumo_mes`) */
  linha: LinhaResumo | null;
  anoMes: string;
  aoImportar: (contaId: string) => void;
  aoCasar: (contaId: string) => void;
  aoInformarSaldo: (contaId: string) => void;
}) {
  const [aba, setAba] = useState<AbaDoPainel>('passos');
  const [ligadaOF, setLigadaOF] = useState(false);
  const [importacoes, setImportacoes] = useState<Importacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { if (aberto) setAba('passos'); }, [aberto, conta?.id]);
  useEffect(() => {
    if (!aberto || !conta || !clienteId) return;
    let vivo = true;
    setImportacoes(null); setErro(null);
    void Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela do Open Finance fora dos tipos gerados
      (supabase as any).from('openfinance_contas_permitidas').select('id').eq('cliente_id', clienteId).eq('conta_bancaria_id', conta.id).eq('ativo', true).limit(1),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem (colunas novas)
      (supabase as any).from('financeiro_importacoes_v2')
        .select('id, nome_arquivo, tipo_arquivo, data_importacao, total_validas, saldo_declarado_data, cancelado_em, cancelada_em')
        .eq('cliente_id', clienteId).eq('conta_bancaria_id', conta.id).order('data_importacao', { ascending: false }).limit(8),
    ]).then(([of, imp]) => {
      if (!vivo) return;
      if (of.error || imp.error) { setErro('Não consegui ler as importações desta conta.'); setImportacoes([]); return; }
      setLigadaOF((of.data ?? []).length > 0);
      const linhas: Record<string, unknown>[] = imp.data ?? [];
      setImportacoes(linhas.map((r) => ({
        id: String(r.id), nome_arquivo: typeof r.nome_arquivo === 'string' ? r.nome_arquivo : null,
        tipo_arquivo: typeof r.tipo_arquivo === 'string' ? r.tipo_arquivo : null,
        data_importacao: typeof r.data_importacao === 'string' ? r.data_importacao : null,
        saldo_declarado_data: typeof r.saldo_declarado_data === 'string' ? r.saldo_declarado_data : null,
        total_validas: typeof r.total_validas === 'number' ? r.total_validas : null,
        cancelada: !!r.cancelado_em || !!r.cancelada_em,
      })));
    });
    return () => { vivo = false; };
  }, [aberto, conta, clienteId]);

  if (!conta) return null;
  const vivas = (importacoes ?? []).filter((i) => !i.cancelada);
  const fonte = fonteDaConta(ligadaOF, vivas[0] ?? null);
  const saldos = saldosDaLinha(linha);
  const passos = passosDaConta(linha, saldos, fonte);

  return (
    <Sheet open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <SheetContent side="right" className="flex w-[460px] max-w-[96vw] flex-col gap-0 p-0 sm:max-w-[460px] [&>button.absolute]:text-white"
        data-testid="painel-da-conta" data-painel-por-cima>
        <div className="shrink-0 px-3 py-2 text-white" style={{ background: FUNDO_ESCURO }}>
          <SheetTitle className="truncate pr-6 text-[12px] font-semibold text-white" title={conta.nome}>{conta.nome}</SheetTitle>
          <SheetDescription className="truncate text-[10px] text-[#b9c6cc]" title={`${fonte.detalhe} · ${anoMes.slice(5)}/${anoMes.slice(0, 4)}`}
            data-testid="painel-fonte">{fonte.detalhe} · {anoMes.slice(5)}/{anoMes.slice(0, 4)}</SheetDescription>
        </div>
        <div className="flex shrink-0 border-b border-border text-[10.5px]">
          {ABAS_DO_PAINEL.map(([k, rotulo]) => (
            <button key={k} type="button" onClick={() => setAba(k)} data-testid={`painel-aba-${k}`}
              className={cn('whitespace-nowrap px-3 py-1.5', aba === k ? 'font-semibold shadow-[inset_0_-2px_0_#196E96]' : 'text-muted-foreground')}>
              {rotulo}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {aba === 'passos' && (
            <>
              {passos.map((p) => (
                <div key={p.n} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-1.5 border-b border-border px-3 py-2" data-testid={`painel-passo-${p.n}`}
                  data-estado={p.estado}>
                  <span className={cn('flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white', BOLA[p.estado])}>
                    {p.estado === 'ok' ? '✓' : p.n}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold">{p.n} · {p.titulo}</div>
                    <div className="text-[10px] text-muted-foreground">{p.frase}</div>
                  </div>
                  {p.n === 1 && (
                    <button type="button" className="whitespace-nowrap rounded border px-2 py-0.5 text-[10.5px]" style={{ borderColor: AZUL_ATIVO, color: AZUL_ATIVO }}
                      onClick={() => aoImportar(conta.id)} data-testid="painel-importar">
                      {fonte.tipo === 'open_finance' ? 'Buscar do banco' : 'Importar banco'}
                    </button>
                  )}
                  {p.n === 3 && p.estado === 'pendente' && (
                    <button type="button" className="whitespace-nowrap rounded px-2 py-0.5 text-[10.5px] text-white" style={{ background: AZUL_ATIVO }}
                      onClick={() => aoCasar(conta.id)} data-testid="painel-casar">
                      {p.titulo}
                    </button>
                  )}
                  {p.n === 4 && (
                    <button type="button" className="whitespace-nowrap rounded border px-2 py-0.5 text-[10.5px]" style={{ borderColor: AZUL_ATIVO, color: AZUL_ATIVO }}
                      onClick={() => aoInformarSaldo(conta.id)} data-testid="painel-informar-saldo">
                      ✎ Informar
                    </button>
                  )}
                  {p.n === 4 && (
                    <div className="col-span-2 col-start-2 mt-1 grid grid-cols-3 gap-1 tabular-nums">
                      {CAIXAS_DO_SALDO.map(([r, campo]) => { const v = saldos[campo]; return (
                        <div key={r} className="min-w-0 rounded border border-border px-1.5 py-0.5">
                          <div className="text-[9.5px] text-muted-foreground">{r}</div>
                          <div className={cn('whitespace-nowrap text-[11px] font-semibold', r === 'Diferença' && v != null && v !== 0 && 'text-destructive')}
                            data-testid={`painel-saldo-${r}`}>{fmt(v)}</div>
                        </div>
                      ); })}
                    </div>
                  )}
                </div>
              ))}
              <p className="px-3 py-2 text-[10px] text-muted-foreground">O mês desta conta fecha quando os 4 passos ficam verdes.</p>
            </>
          )}
          {aba === 'importacoes' && (
            <div className="px-3 py-2" data-testid="painel-importacoes">
              {erro && <p className="text-[10px] text-destructive">{erro}</p>}
              {importacoes === null ? <p className="text-[10px] text-muted-foreground">Lendo…</p>
                : vivas.length === 0 ? <p className="text-[10px] text-muted-foreground">Nenhum arquivo importado nesta conta.</p>
                : (
                  <table className="w-full table-fixed border-collapse text-[10px] tabular-nums">
                    <colgroup><col style={{ width: 70 }} /><col style={{ width: 64 }} /><col /><col style={{ width: 40 }} /></colgroup>
                    <thead><tr className="text-left text-white" style={{ background: FUNDO_ESCURO }}>
                      <th className="h-[22px] px-1 text-[9.5px] font-medium">Importado</th><th className="px-1 text-[9.5px] font-medium">Até</th>
                      <th className="px-1 text-[9.5px] font-medium">Arquivo</th><th className="px-1 text-right text-[9.5px] font-medium">Mov.</th></tr></thead>
                    <tbody>
                      {vivas.map((i) => (
                        <tr key={i.id} className="h-[20px] border-t border-border" data-testid="painel-importacao">
                          <td className="whitespace-nowrap px-1">{ddmmaaaa(i.data_importacao)}</td>
                          <td className="whitespace-nowrap px-1">{ddmmaaaa(i.saldo_declarado_data)}</td>
                          <td className="truncate whitespace-nowrap px-1" title={i.nome_arquivo ?? '—'}>{i.nome_arquivo ?? '—'}</td>
                          <td className="whitespace-nowrap px-1 text-right">{i.total_validas ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              <button type="button" className="mt-2 text-[10.5px] hover:underline" style={{ color: AZUL_ATIVO }} onClick={() => aoImportar(conta.id)}
                data-testid="painel-ver-importacoes">Ver e desfazer na aba Importar banco ›</button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
