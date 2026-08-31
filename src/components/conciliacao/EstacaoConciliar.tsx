import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Unlink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatMoeda } from '@/lib/calculos/formatters';
import { useVinculosDoMovimento, TOL, type MovimentoConciliacao } from '@/hooks/useConciliacaoDoMes';

/**
 * EstacaoConciliar — a estação "Conciliar movimento do extrato", rodada 1.
 * FIN-CONCIL-PORTAR-01, portada de `ConciliarMovimento.tsx` do `AllinBlues/financas`.
 *
 * ⚠ O QUE ESTÁ AQUI É O QUE É FATO. A tabela "Vínculos deste movimento" — o
 * ajuste que o Gabriel pediu — com as MESMAS colunas que os candidatos vão ter
 * (Descrição · Favorecido · Data · Valor · Aplicado), a soma ao vivo contra o
 * valor do movimento, e o desfazer por vínculo.
 *
 * ⚠ O PAINEL DE CANDIDATOS NÃO NASCEU AINDA, e a razão é medida: ele depende de
 * `fn_candidatos_conciliacao` (Δ R$, Δ dias, score, pré-marca, ambiguidade),
 * que ainda não existe no Proto — o trio do motor está com o arquiteto.
 * Inventar um score no front seria exatamente o que a doutrina do original
 * proíbe: o contador e a lista têm de sair do MESMO campo, e escrever a régua
 * num segundo lugar é divergência por manutenção manual.
 *
 * ⚠ A SOMA AO VIVO JÁ VALE PARA O QUE EXISTE: com os vínculos na tela, o
 * operador vê quanto do movimento está coberto e quanto falta — que é a metade
 * da pergunta que a estação responde. A outra metade chega com o motor.
 */
interface Props {
  movimento: MovimentoConciliacao;
  aoFechar: () => void;
  aoMudar: () => void | Promise<void>;
}

export function EstacaoConciliar({ movimento, aoFechar, aoMudar }: Props) {
  const { vinculos, loading, recarregar } = useVinculosDoMovimento(movimento.id);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);

  const somaAplicada = vinculos.reduce((s, v) => s + v.valorAplicado, 0);
  const alvo = Math.abs(movimento.valor);
  const resta = alvo - somaAplicada;
  /* ⚠ "fecha" / "passa" / "falta" — os três estados do original, e a tolerância
     é a mesma que o banco usa. A tela antecipa a recusa; quem recusa é o banco. */
  const estado = Math.abs(resta) <= TOL ? 'fecha' : resta < 0 ? 'passa' : 'falta';

  const desfazer = async (vinculoId: string) => {
    setDesfazendo(vinculoId);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: idioma existente do .rpc
      const { error } = await (supabase as any).rpc('fn_desfazer_vinculo_extrato', {
        p_extrato_id: movimento.id,
        p_motivo: 'desfeito_na_estacao',
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Vínculo desfeito.');
      await recarregar();
      await aoMudar();
    } finally {
      setDesfazendo(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="flex max-h-[85vh] w-[94vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium text-primary leading-none">
            Conciliar movimento do extrato
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {movimento.data_movimento.split('-').reverse().join('/')} ·{' '}
            <span className="tabular-nums">{formatMoeda(movimento.valor)}</span>
            {movimento.descricao ? ` · ${movimento.descricao}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* ─── VÍNCULOS DESTE MOVIMENTO ────────────────────────────────────
              ⚠ AS MESMAS COLUNAS DOS CANDIDATOS — pedido do Gabriel. Quando o
              painel de candidatos entrar, as duas tabelas ficam lado a lado com
              a mesma régua: o que já está vinculado e o que pode ser. Colunas
              diferentes obrigariam o olho a reaprender a leitura no meio da
              mesma tela. */}
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-medium text-foreground">Vínculos deste movimento</span>
            <span className="text-[10px] text-muted-foreground">
              {vinculos.length} vínculo{vinculos.length === 1 ? '' : 's'} ativo{vinculos.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">Carregando…</p>
          ) : vinculos.length === 0 ? (
            <p className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
              Nenhum vínculo ainda — este movimento está inteiro em aberto.
            </p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b text-[9px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-1 text-left font-semibold">Descrição</th>
                  <th className="px-2 py-1 text-left font-semibold">Favorecido</th>
                  <th className="px-2 py-1 text-left font-semibold">Data</th>
                  <th className="px-2 py-1 text-right font-semibold">Valor</th>
                  <th className="px-2 py-1 text-right font-semibold">Aplicado</th>
                  <th className="px-2 py-1"> </th>
                </tr>
              </thead>
              <tbody>
                {vinculos.map(v => (
                  <tr key={v.id} className="border-b border-border/60">
                    <td className="max-w-0 truncate px-2 py-1" title={v.lancamentoDescricao ?? ''}>
                      {v.lancamentoDescricao ?? '—'}
                    </td>
                    <td className="max-w-0 truncate px-2 py-1 text-muted-foreground" title={v.favorecido ?? ''}>
                      {v.favorecido ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                      {v.lancamentoData ? v.lancamentoData.split('-').reverse().join('/') : '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {v.lancamentoValor == null ? '—' : formatMoeda(v.lancamentoValor)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-right font-medium tabular-nums">
                      {formatMoeda(v.valorAplicado)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <Button type="button" variant="ghost" size="sm"
                        className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
                        disabled={desfazendo != null}
                        onClick={() => desfazer(v.id)}>
                        {desfazendo === v.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Unlink className="h-3 w-3" />}
                        Desfazer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ⚠ A SOMA AO VIVO CONTRA O VALOR DO MOVIMENTO — o pedido do Gabriel,
              e a mesma leitura do rodapé da estação original: "fecha" em verde,
              "passa" em vermelho, "falta" em âmbar. A cor acompanha a palavra;
              nunca é o único canal. */}
          <div className="mt-2 flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1 border-t pt-2 text-[11px] tabular-nums">
            <span className="text-muted-foreground">Movimento <b className="text-foreground">{formatMoeda(alvo)}</b></span>
            <span className="text-muted-foreground">Aplicado <b className="text-foreground">{formatMoeda(somaAplicada)}</b></span>
            <span className={
              estado === 'fecha' ? 'font-medium text-success'
              : estado === 'passa' ? 'font-medium text-destructive'
              : 'font-medium text-amber-700 dark:text-amber-500'}>
              {estado === 'fecha' ? 'fecha'
                : estado === 'passa' ? `passa ${formatMoeda(Math.abs(resta))}`
                : `falta ${formatMoeda(resta)}`}
            </span>
          </div>

          {/* ⚠ A AUSÊNCIA DECLARADA, e não uma área vazia: quem abre a estação
              esperando escolher candidatos precisa saber por que não há lista —
              senão conclui que a tela quebrou. */}
          <div className="mt-3 rounded-md border border-dashed px-3 py-2 text-[10px] leading-snug text-muted-foreground">
            <b className="text-foreground">Candidatos ainda não disponíveis.</b> A lista com Δ R$, Δ dias,
            multi-seleção e “Vincular (n)” sai do motor de sugestões
            (<span className="font-mono">fn_candidatos_conciliacao</span>), que ainda não existe neste banco.
            Enquanto ele não entra, esta estação mostra e desfaz o que já está vinculado.
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={aoFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
