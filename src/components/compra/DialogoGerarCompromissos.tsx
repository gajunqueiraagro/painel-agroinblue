/**
 * "Gerar compromissos" — a PROPOSTA conferida, nunca a gravação automática.
 *
 * ⚠ NADA NASCE SEM CONFERÊNCIA. O sistema não gerava compromisso sozinho em lugar nenhum
 * (medido: 47 na compra, 34 na venda, 6 no abate — todos por `oc_criar_compromisso`, um a
 * um). Gerar em silêncio ao concluir criaria títulos que ninguém viu nascer; aqui o
 * operador vê a lista, o total e se ele fecha com o acordado ANTES de confirmar.
 *
 * ⚠ CADA LINHA É UMA CHAMADA, e o parcial é preservado: se a terceira falhar, as duas
 * primeiras ficam e o diálogo diz o que restou. O contrário — desfazer o que deu certo —
 * exigiria uma transação que a RPC não oferece, e deixaria o operador sem nada.
 *
 * ⚠ VENCIMENTO E FORMA VALEM PARA TODAS AS LINHAS: são do acordo, não do lote. Cada
 * compromisso nasce e é programado com uma parcela — é o mesmo par de chamadas que o
 * diálogo manual faz hoje (por isso os eventos vêm aos pares no banco).
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { X } from 'lucide-react';
import { FORMAS_PAGAMENTO as FORMAS } from '@/lib/financeiro/formasPagamento';
import { formatMoeda } from '@/lib/calculos/formatters';

/** Uma linha proposta — já resolvida por quem tem os dados do tipo de operação. */
export interface PropostaCompromisso {
  /** Chave estável da linha na tela (lote + natureza). */
  chave: string;
  natureza: 'principal' | 'obrigacao';
  descricao: string;
  /** Caminho legível do plano de contas, para o operador conferir onde vai cair. */
  caminho: string;
  subcentro: string;
  valor: number;
  loteId: string | null;
  componente: string;
}



/** Data da operação + 30 dias, em ISO — o default do acordo, editável. */
export function vencimentoPadrao(dataOperacao: string | null): string {
  const base = dataOperacao ? new Date(`${dataOperacao}T12:00:00`) : new Date();
  base.setDate(base.getDate() + 30);
  return base.toISOString().slice(0, 10);
}

export function DialogoGerarCompromissos({
  tipoOperacao, propostas, valorAcordado, contraparteNome, dataOperacao, saving, onGerar, onFechar,
}: {
  tipoOperacao: 'compra' | 'venda' | 'abate' | string;
  propostas: PropostaCompromisso[];
  valorAcordado: number | null;
  contraparteNome: string | null;
  dataOperacao: string | null;
  saving?: boolean;
  onGerar: (linhas: PropostaCompromisso[], vencimento: string, forma: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(propostas.map(p => p.chave)));
  const [vencimento, setVencimento] = useState(() => vencimentoPadrao(dataOperacao));
  const [forma, setForma] = useState(FORMAS[0]);

  const selecionadas = useMemo(() => propostas.filter(p => marcadas.has(p.chave)), [propostas, marcadas]);
  /* ⚠ SÓ O PRINCIPAL ENTRA NO CONFRONTO. As obrigações (Funrural, frete) são o que se paga
     por fora; somá-las ao total faria a comparação com o acordado nunca fechar. */
  const totalPrincipal = selecionadas.filter(p => p.natureza === 'principal')
    .reduce((s, p) => s + p.valor, 0);
  const diferenca = valorAcordado == null ? null : totalPrincipal - valorAcordado;
  const confere = diferenca != null && Math.abs(diferenca) <= 0.01;

  const rotuloTipo = tipoOperacao === 'venda' ? 'Venda' : tipoOperacao === 'abate' ? 'Abate' : 'Compra';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col p-0 gap-0 overflow-hidden">
        <div className="shrink-0 bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between">
          <DialogTitle className="text-[14px] font-semibold">Gerar compromissos · {rotuloTipo}</DialogTitle>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
            className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">
          Confira as linhas propostas e gere os compromissos financeiros desta operação.
        </DialogDescription>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          <div className="grid grid-cols-[170px_200px_1fr] items-end gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Vencimento</Label>
              <DatePicker value={vencimento} onChange={setVencimento} className="mt-[3px] h-8 px-2.5 text-[12px]" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Forma de pagamento</Label>
              <Select value={forma} onValueChange={setForma}>
                <SelectTrigger className="mt-[3px] h-8 text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMAS.map(f => <SelectItem key={f} value={f} className="text-[12px]">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0">
              {/* Travado: quem paga (ou recebe) é a contraparte da operação, não uma escolha. */}
              <Label className="text-[10px] text-muted-foreground">
                {tipoOperacao === 'compra' ? 'Favorecido' : 'Pagador'}
              </Label>
              <div className="mt-[3px] flex h-8 items-center truncate rounded-md border border-dashed border-border/60 bg-muted px-2.5 text-[12px] text-muted-foreground">
                {contraparteNome ?? '—'}
              </div>
            </div>
          </div>

          {/* ── O confronto, antes de confirmar ── */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
            <div>
              <div className="text-[11px] text-muted-foreground leading-none">Total proposto</div>
              <div className="mt-1 text-[20px] font-medium leading-none tabular-nums">{formatMoeda(totalPrincipal)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground leading-none">Acordado (NF)</div>
              <div className="mt-1 text-[20px] font-medium leading-none tabular-nums">
                {valorAcordado == null ? '—' : formatMoeda(valorAcordado)}
              </div>
            </div>
            {diferenca != null && (
              confere
                ? <div className="text-[11px] font-medium text-emerald-600">confere</div>
                : <div className="text-[11px] font-medium text-amber-700">
                    {formatMoeda(Math.abs(diferenca))} {diferenca > 0 ? 'a mais' : 'a menos'}
                  </div>
            )}
          </div>

          {propostas.length === 0 ? (
            <p className="rounded-md border bg-muted/20 px-3.5 py-3 text-[11px] text-muted-foreground">
              Não há o que propor: os lotes desta operação já têm compromisso principal, ou falta
              negociação para calcular o valor.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {propostas.map(p => (
                <label key={p.chave} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-[7px] leading-[1.35]">
                  <Checkbox checked={marcadas.has(p.chave)}
                    onCheckedChange={(v) => setMarcadas(prev => {
                      const s = new Set(prev);
                      if (v) s.add(p.chave); else s.delete(p.chave);
                      return s;
                    })} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium text-foreground">{p.descricao}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{p.caminho}</div>
                  </div>
                  <div className={`shrink-0 whitespace-nowrap text-[12px] font-medium tabular-nums ${
                    p.natureza === 'obrigacao' ? 'text-destructive' : ''}`}>
                    {p.natureza === 'obrigacao' ? `− ${formatMoeda(p.valor)}` : formatMoeda(p.valor)}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 border-t bg-card px-4 py-2.5">
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="button" disabled={saving || selecionadas.length === 0}
            title={selecionadas.length === 0 ? 'Marque ao menos uma linha' : undefined}
            onClick={async () => {
              if (!vencimento) { toast.error('Informe o vencimento.'); return; }
              await onGerar(selecionadas, vencimento, forma);
            }}>
            Gerar {selecionadas.length} {selecionadas.length === 1 ? 'compromisso' : 'compromissos'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
