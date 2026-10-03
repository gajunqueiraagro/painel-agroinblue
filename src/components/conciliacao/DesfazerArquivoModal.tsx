/**
 * O DESFAZER DE ARQUIVO — PR-IMPORT-DESFAZER-01, religado no PR-CONC-DESFAZER-ARQUIVO-01.
 *
 * ⚠ SAIU DE `ImportacoesDaConta.tsx` VERBATIM: o componente que o montava deixou de ser montado
 * (PR-IMPORTAR-CORPO-01) e o modal ficou órfão enquanto a tela usava um UPDATE direto que não
 * cancelava cru nenhum. Agora é o único caminho de desfazer importação: quem o abre é o
 * "Ver importações" (`ImportacoesDialog`).
 *
 * ⚠ O RELATÓRIO É DA RPC, NUNCA DA TELA. `fn_extrato_desfazer_arquivo` com `p_simular = true`
 * devolve as contagens; a tela só as escreve em português.
 * ⚠ PR-CONC-IMPORT-BANCO-01B: o resumo diz o período REAL, os movimentos por mês, as conciliações, os lançamentos
 *   CLASSIFICADOS que serão cancelados, os que voltam a programado e as liquidações de OC estornadas
 *   (`partesDoResumoDoDesfazer`); e a RPC RECUSA quando um lançamento a cancelar está ligado a uma OC viva — a frase dela
 *   aparece aqui em vermelho, com onde resolver, e o botão fica apagado.
 */
import { Fragment, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { partesDoResumoDoDesfazer, type SimulacaoDesfazer } from '@/lib/conciliacao/desfazerArquivoTexto';

const num = (v: number) => v.toLocaleString('pt-BR');

/** O relatório que a RPC devolve em modo simulação. */
interface Relatorio extends SimulacaoDesfazer {
  ok: boolean;
  motivo?: string;
  frase?: string;
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

export function DesfazerArquivoModal({ alvo, onClose, onDesfeito }: {
  /** Só o que o modal lê do arquivo: o id para a RPC e o nome enquanto ela não responde. */
  alvo: { id: string; nome_arquivo: string | null } | null; onClose: () => void; onDesfeito: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const queryClient = useQueryClient();

  /* ⚠ O ESTADO DO GESTO É DE UM ARQUIVO SÓ — PR-CONC-DESFAZER-ARQUIVO-01. Só o `onOpenChange`
     (Esc, clique fora) zerava motivo e confirmação; "Cancelar" e o X chamavam `onClose` direto.
     Clicar "Desfazer arquivo" uma vez em A, cancelar e abrir B trazia B já em "Confirmar", com o
     motivo de A: um clique desfazia o arquivo errado. Zera ao trocar de arquivo E em todo fechar. */
  const zerar = () => { setMotivo(''); setConfirmando(false); setErro(null); };
  useEffect(() => { zerar(); }, [alvo?.id]);
  const fechar = () => { zerar(); onClose(); };

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
  /* A RECUSA DO D5 vem COM as contagens: o operador vê o que o gesto faria E por que não pode. */
  const recusaOC = rel?.ok === false && rel.motivo === 'oc_viva';
  const partesResumo = rel && (rel.ok || recusaOC) ? partesDoResumoDoDesfazer(rel) : [];
  const restauracaoParcial = (rel?.substituidos_restaurados ?? 0) - (rel?.substituidos_com_audit ?? 0);

  const executar = async () => {
    if (!alvo) return;
    setGravando(true); setErro(null);
    /* ⚠ `finally` — PR-CONC-DESFAZER-ARQUIVO-01: se a chamada LANÇAR (rede, timeout), o
       `setGravando(false)` depois do `await` nunca rodava e o botão ficava em "Desfazendo…". */
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_extrato_desfazer_arquivo', {
        p_importacao_id: alvo.id, p_motivo: motivo.trim(), p_simular: false,
      });
      if (error) { setErro(error.message); return; }
      const r = (data ?? {}) as Relatorio & { meses?: string };
      if (r.ok === false) {
        setErro(r.motivo === 'oc_viva' && r.frase ? r.frase
          : r.motivo === 'mes_fechado'
          ? `O mês ${r.meses ?? ''} está fechado; reabra antes de desfazer.`
          : r.motivo === 'importacao_ja_cancelada' ? 'Esta importação já foi desfeita.'
          : r.motivo === 'importacao_nao_encontrada' ? 'Importação não encontrada.'
          : (r.motivo ?? 'Não foi possível desfazer.'));
        return;
      }
      /* A simulação deste arquivo morreu com ele: reabri-lo não pode mostrar o "ok" de antes. */
      queryClient.removeQueries({ queryKey: ['desfazer-arquivo-simular', alvo.id] });
      toast.success(`Arquivo desfeito: ${num(r.extratos ?? 0)} extratos, ${num((r.crus_cancelados ?? 0) + (r.substituidos_restaurados ?? 0) + (r.vinculos_manuais_desfeitos ?? 0))} lançamentos.`);
      fechar();
      onDesfeito();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desfazer.');
    } finally {
      setGravando(false);
      setConfirmando(false);
    }
  };

  const linha = (texto: string, aviso?: string | null) => (
    <div className="text-[11px]">
      {texto}
      {aviso && <div className="text-[10px] text-amber-700 dark:text-amber-400">{aviso}</div>}
    </div>
  );

  return (
    <Dialog open={!!alvo} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="w-[520px] max-w-[95vw] p-0 gap-0 overflow-hidden [&>button.absolute]:hidden text-[11px]">
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 bg-primary px-3 text-primary-foreground">
          <span className="text-[12px] font-medium">Desfazer arquivo</span>
          <button type="button" onClick={fechar} aria-label="Fechar"
            className="rounded p-0.5 opacity-80 hover:opacity-100 hover:bg-primary-foreground/10">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {isLoading && <div className="py-4 text-center text-[10px] text-muted-foreground">Conferindo o que será desfeito…</div>}

          {rel && rel.ok === false && !recusaOC && (
            <div className="text-[11px] text-destructive">
              {rel.motivo === 'mes_fechado'
                ? `O mês ${rel.meses ?? ''} está fechado; reabra antes de desfazer.`
                : rel.motivo === 'importacao_ja_cancelada' ? 'Esta importação já foi desfeita.'
                : (rel.motivo ?? 'Não foi possível simular.')}
            </div>
          )}

          {rel && (rel.ok || recusaOC) && (
            <>
              <div className="rounded-xl bg-muted px-3 py-2 space-y-0.5">
                <div className="text-[11px] font-medium truncate" title={rel.arquivo ?? ''}>{rel.arquivo ?? alvo?.nome_arquivo ?? '—'}</div>
                {/* O RESUMO DA SIMULAÇÃO: cada parte inteira numa linha só (`whitespace-nowrap`); a quebra cai ENTRE partes,
                    nunca no meio de uma, e nada se corta. */}
                <div data-testid="resumo-desfazer" className="text-[10px] leading-snug text-muted-foreground">
                  {/* ⚠ O SEPARADOR FICA FORA do span `nowrap`: é o espaço dele que dá à linha o ponto de quebra. Dentro do span
                      (como nasceu), não havia quebra possível e as partes vazavam do modal numa linha só — medido. */}
                  {[...partesResumo, ...((rel.sem_par ?? 0) > 0 ? [`${num(rel.sem_par ?? 0)} sem par`] : [])].map((p, i) => (
                    <Fragment key={p}>{i > 0 && ' · '}<span className="whitespace-nowrap">{p}</span></Fragment>
                  ))}
                </div>
              </div>

              {(rel.crus_classificados ?? 0) > 0 && (
                <div className="text-[10px] text-amber-700 dark:text-amber-400">a classificação feita nos lançamentos cancelados se perde</div>
              )}

              {recusaOC && (
                <div data-testid="recusa-desfazer" className="text-[11px] text-destructive">{rel.frase ?? 'Há lançamento ligado a uma OC viva: desfaça o vínculo na OC antes.'}</div>
              )}

              <div className="space-y-1">
                {linha(
                  `${num(rel.substituidos_restaurados ?? 0)} substituídos serão restaurados${(rel.substituidos_com_audit ?? 0) > 0 ? ` (${num(rel.substituidos_com_audit ?? 0)} pelo log)` : ''}`,
                  /* ⚠ SEM LOG, A RESTAURAÇÃO É PARCIAL — a RPC cai no snapshot do vínculo, que
                     só guarda data e valor. Dizer "serão restaurados" sem essa ressalva
                     prometeria a volta de um estado que não existe mais. */
                  restauracaoParcial > 0
                    ? `${num(restauracaoParcial)} sem log: voltam só data e valor pelo snapshot`
                    : null,
                )}
                {linha(`${num(rel.vinculos_manuais_desfeitos ?? 0)} vínculos manuais serão desfeitos — o lançamento fica como você deixou (valor/status editados não voltam)`)}
              </div>

              {!recusaOC && <div>
                <label className="text-[10px] text-muted-foreground" htmlFor="motivo-desfazer">
                  Motivo (obrigatório)
                </label>
                <input id="motivo-desfazer" value={motivo} onChange={(e) => { setMotivo(e.target.value); setConfirmando(false); }}
                  placeholder="ex.: arquivo importado na conta errada"
                  className="mt-0.5 h-7 w-full rounded border bg-background px-2 text-[11px] outline-none focus-visible:ring-1" />
              </div>}
            </>
          )}

          {erro && <div className="text-[10px] text-destructive">{erro}</div>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={fechar} className="text-[11px] text-muted-foreground underline underline-offset-2">
              Cancelar
            </button>
            {/* ⚠ DOIS CLIQUES, e o segundo diz o que o primeiro não dizia: não há desfazer do
                desfazer. O gesto cancela lançamentos e reescreve outros numa transação só. */}
            <button type="button"
              disabled={!rel?.ok || !motivoValido || gravando}
              onClick={() => { if (confirmando) { void executar(); } else setConfirmando(true); }}
              title={recusaOC ? (rel?.frase ?? 'Recusado: lançamento ligado a uma OC viva.') : !motivoValido ? 'Escreva o motivo (mínimo 5 caracteres)' : undefined}
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
