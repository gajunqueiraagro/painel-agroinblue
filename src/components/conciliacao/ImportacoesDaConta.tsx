/**
 * AS IMPORTAÇÕES DESTA CONTA, E O DESFAZER DE ARQUIVO — PR-IMPORT-DESFAZER-01.
 *
 * ⚠ FECHA UMA PROMESSA QUE A TELA JÁ FAZIA. Os rodapés do minimodal de origem mandam o
 * operador para "Conciliação › Desfazer por arquivo" desde o PR-CONC-B-2, e o caminho não
 * existia: a RPC estava versionada (20260909112741) e ninguém a chamava.
 *
 * ⚠ SÓ APARECE O QUE TEM VÍNCULO COM ARQUIVO. `extrato_bancario_v2.importacao_id` só passou
 * a ser preenchido em 25/08/2026: das 75 importações do proto, 22 têm extratos ligados, e
 * 3.638 extratos não têm arquivo nenhum. Listar uma importação sem extratos ofereceria um
 * "desfazer" que não desfaz nada.
 *
 * ⚠ O RELATÓRIO É DA RPC, NUNCA DA TELA. `p_simular = true` devolve as contagens; a tela só
 * as escreve em português. Recalcular aqui daria dois números para a mesma pergunta — e o
 * que confirma o gesto irreversível seria o do front, não o do banco.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const brData = (iso: string | null | undefined) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
const ddmm = (iso: string | null | undefined) =>
  (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const num = (v: number) => v.toLocaleString('pt-BR');

interface ImportacaoLinha {
  id: string;
  nome_arquivo: string | null;
  data_importacao: string | null;
  cancelado_em: string | null;
  extratos: number;
  crus: number;
  substituidos: number;
  manuais: number;
  semPar: number;
}

/** O relatório que a RPC devolve em modo simulação. */
interface Relatorio {
  ok: boolean;
  motivo?: string;
  meses?: string;
  arquivo?: string;
  extratos?: number;
  sem_par?: number;
  crus_cancelados?: number;
  crus_enriquecidos?: number;
  substituidos_restaurados?: number;
  substituidos_com_audit?: number;
  vinculos_manuais_desfeitos?: number;
}

export function ImportacoesDaConta({ clienteId, contaId, onDesfeito }: {
  clienteId: string | null;
  contaId: string | null;
  onDesfeito?: () => void;
}) {
  const [alvo, setAlvo] = useState<ImportacaoLinha | null>(null);

  const { data: linhas = [], refetch } = useQuery({
    queryKey: ['importacoes-da-conta', clienteId, contaId],
    enabled: !!clienteId && !!contaId,
    queryFn: async (): Promise<ImportacaoLinha[]> => {
      /* ⚠ UMA CONSULTA POR CONTA, e o agrupamento acontece aqui: são 499 extratos com
         arquivo no proto inteiro e no máximo 4 importações por conta — trazer as linhas e
         contar em memória custa menos que uma view nova. */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado
      const { data: exts, error } = await (supabase as any)
        .from('extrato_bancario_v2')
        .select('id, importacao_id, cancelado_em')
        .eq('cliente_id', clienteId)
        .eq('conta_bancaria_id', contaId)
        .not('importacao_id', 'is', null);
      if (error) throw error;
      const rows = (exts ?? []) as { id: string; importacao_id: string; cancelado_em: string | null }[];
      const ids = [...new Set(rows.map((r) => r.importacao_id))];
      if (ids.length === 0) return [];

      /* eslint-disable @typescript-eslint/no-explicit-any -- idioma documentado do repo */
      const [rImp, rVinc] = await Promise.all([
        (supabase as any).from('financeiro_importacoes_v2')
          .select('id, nome_arquivo, data_importacao, cancelado_em').in('id', ids),
        (supabase as any).from('conciliacao_bancaria_itens')
          .select('extrato_id, tipo_aprovacao').is('desfeito_em', null)
          .in('extrato_id', rows.map((r) => r.id)),
      ]);
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const vincPorExtrato = new Map<string, string[]>();
      for (const v of ((rVinc.data ?? []) as { extrato_id: string; tipo_aprovacao: string | null }[])) {
        const l = vincPorExtrato.get(v.extrato_id);
        if (l) l.push(v.tipo_aprovacao ?? ''); else vincPorExtrato.set(v.extrato_id, [v.tipo_aprovacao ?? '']);
      }

      const porImp = new Map<string, ImportacaoLinha>();
      for (const imp of ((rImp.data ?? []) as { id: string; nome_arquivo: string | null; data_importacao: string | null; cancelado_em: string | null }[])) {
        porImp.set(imp.id, {
          id: imp.id, nome_arquivo: imp.nome_arquivo, data_importacao: imp.data_importacao,
          cancelado_em: imp.cancelado_em, extratos: 0, crus: 0, substituidos: 0, manuais: 0, semPar: 0,
        });
      }
      for (const r of rows) {
        const linha = porImp.get(r.importacao_id);
        if (!linha) continue;
        linha.extratos += 1;
        const tipos = vincPorExtrato.get(r.id) ?? [];
        if (tipos.length === 0) { linha.semPar += 1; continue; }
        for (const t of tipos) {
          if (t === 'ofx_cru') linha.crus += 1;
          else if (t === 'ofx_substituiu') linha.substituidos += 1;
          else linha.manuais += 1;
        }
      }
      return [...porImp.values()].sort((a, b) =>
        (b.data_importacao ?? '') < (a.data_importacao ?? '') ? -1 : 1);
    },
  });

  if (!contaId) return null;
  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/10 px-3 py-3 text-center text-[10px] text-muted-foreground">
        Nenhuma importação desta conta tem vínculo com arquivo.
        {' '}Os extratos anteriores a 25/08/2026 foram gravados sem essa marca e não podem ser desfeitos por arquivo.
      </div>
    );
  }

  const CEL = 'px-1.5 py-[3px] whitespace-nowrap';

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b bg-muted/40 px-3 py-1 text-[11px] font-medium">Importações desta conta</div>
      {/* A régua vive no `<table>`: célula sem tamanho herda dela, não do documento. */}
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-muted text-[10px] text-muted-foreground">
            <th className={cn(CEL, 'text-left font-normal')}>Importado em</th>
            <th className={cn(CEL, 'text-left font-normal')}>Arquivo</th>
            <th className={cn(CEL, 'text-right font-normal')}>Linhas</th>
            <th className={cn(CEL, 'text-right font-normal')}>Crus</th>
            <th className={cn(CEL, 'text-right font-normal')}>Substituídos</th>
            <th className={cn(CEL, 'text-right font-normal')}>Manuais</th>
            <th className={cn(CEL, 'text-right font-normal')}>Sem par</th>
            <th className={cn(CEL, 'text-right font-normal')} />
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const desfeita = !!l.cancelado_em;
            return (
              <tr key={l.id} className={cn('h-[21px] border-b last:border-b-0', desfeita && 'text-muted-foreground')}>
                <td className={cn(CEL, 'text-[10px] text-muted-foreground')}>{brData(l.data_importacao?.slice(0, 10))}</td>
                <td className={cn(CEL, 'max-w-[220px] truncate')} title={l.nome_arquivo ?? ''}>{l.nome_arquivo ?? '—'}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.extratos)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.crus)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.substituidos)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.manuais)}</td>
                <td className={cn(CEL, 'text-right tabular-nums')}>{num(l.semPar)}</td>
                <td className={cn(CEL, 'text-right')}>
                  {desfeita
                    ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">desfeita {ddmm(l.cancelado_em?.slice(0, 10))}</span>
                    : <button type="button" onClick={() => setAlvo(l)}
                        className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-destructive">
                        desfazer
                      </button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <DesfazerArquivoModal
        alvo={alvo}
        onClose={() => setAlvo(null)}
        onDesfeito={() => { void refetch(); onDesfeito?.(); }}
      />
    </div>
  );
}

function DesfazerArquivoModal({ alvo, onClose, onDesfeito }: {
  alvo: ImportacaoLinha | null; onClose: () => void; onDesfeito: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: rel, isLoading } = useQuery({
    queryKey: ['desfazer-arquivo-simular', alvo?.id],
    enabled: !!alvo,
    queryFn: async (): Promise<Relatorio> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_extrato_desfazer_arquivo', {
        p_importacao_id: alvo!.id, p_motivo: 'simulacao', p_simular: true,
      });
      if (error) throw error;
      return (data ?? { ok: false }) as Relatorio;
    },
  });

  const motivoValido = motivo.trim().length >= 5;
  const restauracaoParcial = (rel?.substituidos_restaurados ?? 0) - (rel?.substituidos_com_audit ?? 0);

  const executar = async () => {
    if (!alvo) return;
    setGravando(true); setErro(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    const { data, error } = await (supabase as any).rpc('fn_extrato_desfazer_arquivo', {
      p_importacao_id: alvo.id, p_motivo: motivo.trim(), p_simular: false,
    });
    setGravando(false);
    setConfirmando(false);
    if (error) { setErro(error.message); return; }
    const r = (data ?? {}) as Relatorio & { meses?: string };
    if (r.ok === false) {
      setErro(r.motivo === 'mes_fechado'
        ? `O mês ${r.meses ?? ''} está fechado; reabra antes de desfazer.`
        : r.motivo === 'importacao_ja_cancelada' ? 'Esta importação já foi desfeita.'
        : r.motivo === 'importacao_nao_encontrada' ? 'Importação não encontrada.'
        : (r.motivo ?? 'Não foi possível desfazer.'));
      return;
    }
    toast.success(`Arquivo desfeito: ${num(r.extratos ?? 0)} extratos, ${num((r.crus_cancelados ?? 0) + (r.substituidos_restaurados ?? 0) + (r.vinculos_manuais_desfeitos ?? 0))} lançamentos.`);
    onClose();
    onDesfeito();
  };

  const linha = (texto: string, aviso?: string | null) => (
    <div className="text-[11px]">
      {texto}
      {aviso && <div className="text-[10px] text-amber-700 dark:text-amber-400">{aviso}</div>}
    </div>
  );

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) { setMotivo(''); setConfirmando(false); setErro(null); onClose(); } }}>
      <DialogContent className="w-[520px] max-w-[95vw] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[12px] font-medium">Desfazer arquivo</span>
          <button type="button" onClick={onClose} aria-label="Fechar"
            className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {isLoading && <div className="py-4 text-center text-[10px] text-muted-foreground">Conferindo o que será desfeito…</div>}

          {rel && rel.ok === false && (
            <div className="text-[11px] text-destructive">
              {rel.motivo === 'mes_fechado'
                ? `O mês ${rel.meses ?? ''} está fechado; reabra antes de desfazer.`
                : rel.motivo === 'importacao_ja_cancelada' ? 'Esta importação já foi desfeita.'
                : (rel.motivo ?? 'Não foi possível simular.')}
            </div>
          )}

          {rel?.ok && (
            <>
              <div className="rounded-xl bg-muted px-3 py-2 space-y-0.5">
                <div className="text-[11px] font-medium truncate" title={rel.arquivo ?? ''}>{rel.arquivo ?? alvo?.nome_arquivo ?? '—'}</div>
                <div className="text-[10px] text-muted-foreground">
                  {rel.meses ?? '—'} · {num(rel.extratos ?? 0)} extratos
                  {(rel.sem_par ?? 0) > 0 && ` · ${num(rel.sem_par ?? 0)} sem par`}
                </div>
              </div>

              <div className="space-y-1">
                {linha(
                  `${num(rel.crus_cancelados ?? 0)} lançamentos crus serão cancelados${(rel.crus_enriquecidos ?? 0) > 0 ? ` (${num(rel.crus_enriquecidos ?? 0)} já enriquecidos)` : ''}`,
                  (rel.crus_enriquecidos ?? 0) > 0 ? 'a classificação feita neles se perde' : null,
                )}
                {linha(
                  `${num(rel.substituidos_restaurados ?? 0)} substituídos serão restaurados${(rel.substituidos_com_audit ?? 0) > 0 ? ` (${num(rel.substituidos_com_audit ?? 0)} pelo log)` : ''}`,
                  /* ⚠ SEM LOG, A RESTAURAÇÃO É PARCIAL — a RPC cai no snapshot do vínculo, que
                     só guarda data e valor. Dizer "serão restaurados" sem essa ressalva
                     prometeria a volta de um estado que não existe mais. */
                  restauracaoParcial > 0
                    ? `${num(restauracaoParcial)} sem log: voltam só data e valor pelo snapshot`
                    : null,
                )}
                {linha(`${num(rel.vinculos_manuais_desfeitos ?? 0)} vínculos manuais serão desfeitos (os lançamentos ficam sem par)`)}
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground" htmlFor="motivo-desfazer">
                  Motivo (obrigatório)
                </label>
                <input id="motivo-desfazer" value={motivo} onChange={(e) => { setMotivo(e.target.value); setConfirmando(false); }}
                  placeholder="ex.: arquivo importado na conta errada"
                  className="mt-0.5 h-7 w-full rounded border bg-background px-2 text-[11px] outline-none focus-visible:ring-1" />
              </div>
            </>
          )}

          {erro && <div className="text-[10px] text-destructive">{erro}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground underline underline-offset-2">
              Cancelar
            </button>
            {/* ⚠ DOIS CLIQUES, e o segundo diz o que o primeiro não dizia: não há desfazer do
                desfazer. O gesto cancela lançamentos e reescreve outros numa transação só. */}
            <button type="button"
              disabled={!rel?.ok || !motivoValido || gravando}
              onClick={() => { if (confirmando) { void executar(); } else setConfirmando(true); }}
              title={!motivoValido ? 'Escreva o motivo (mínimo 5 caracteres)' : undefined}
              className={cn('rounded px-2.5 py-0.5 text-[11px] font-medium',
                rel?.ok && motivoValido && !gravando
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed')}>
              {gravando ? 'Desfazendo…' : confirmando ? 'Confirmar — não dá para desfazer o desfazer' : 'Desfazer arquivo'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
