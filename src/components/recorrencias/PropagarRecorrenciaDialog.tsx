import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { propagarRecorrencia, type EscopoPropagacao, type ResultadoPropagacao } from '@/hooks/useRecorrencias';

/**
 * PropagarRecorrenciaDialog — até onde a edição da regra alcança o que ela gerou.
 * FIN-RECORR-PROPAGA-01.
 *
 * ⚠ A REGRA JÁ ESTÁ SALVA QUANDO ESTE DIÁLOGO ABRE, e isso muda o que "Cancelar" quer
 * dizer: aqui ele é "não propagar", nunca "desfazer a edição". Por isso a terceira opção é
 * explícita na lista em vez de ficar só no botão de fechar — um operador que fecha no X tem
 * de saber que a regra mudou de qualquer jeito.
 *
 * ⚠ AS CONTAGENS VÊM DO BANCO, pela MESMA consulta que o update usa. Contar na tela, sobre
 * a lista carregada, diria um número sobre o recorte em memória e gravaria sobre outro —
 * e o front sequer conhece os lançamentos de uma recorrência (a lista não filtra por ela).
 *
 * ⚠ SINAL TROCADO É RECUSA, NÃO AVISO. Mudar a regra de saída para entrada mudaria o
 * `tipo_operacao` e o `sinal` de lançamentos já existentes — inclusive conciliados. A RPC
 * recusa antes de escrever, e o que se mostra aqui é a mensagem do banco, não uma paráfrase:
 * quem escreveu a regra é quem sabe explicá-la.
 */
interface Props {
  recorrenciaId: string;
  descricao: string;
  /** A prévia (`p_simular = true`). `null` quando a RPC recusou — aí vale `recusa`. */
  previa: ResultadoPropagacao | null;
  /** A mensagem do banco quando a propagação é impossível. */
  recusa: string | null;
  aoFechar: () => void;
}

const OPCOES: readonly { valor: EscopoPropagacao; rotulo: string; explica: string }[] = [
  { valor: 'futuros', rotulo: 'Só os futuros',
    explica: 'ainda não pagos nem conciliados — classificação, identificação e valor' },
  { valor: 'todos', rotulo: 'Futuros e passados',
    explica: 'os realizados também mudam de classificação; datas e valor deles ficam' },
  { valor: 'nenhum', rotulo: 'Não propagar',
    explica: 'só a regra muda; os lançamentos já gerados ficam como estão' },
];

export function PropagarRecorrenciaDialog({ recorrenciaId, descricao, previa, recusa, aoFechar }: Props) {
  const [escopo, setEscopo] = useState<EscopoPropagacao>('futuros');
  const [ocupado, setOcupado] = useState(false);

  const nada = !previa || (previa.futuros === 0 && previa.passados === 0);

  /* ⚠ "Não propagar" NÃO CHAMA A RPC. Ela aceita `'nenhum'` e devolveria as contagens sem
     escrever — mas seria uma ida ao banco para não fazer nada, e o resultado é o mesmo de
     fechar. A opção existe na lista para ser uma ESCOLHA declarada, não uma chamada. */
  const confirmar = async () => {
    if (escopo === 'nenhum') { aoFechar(); return; }
    setOcupado(true);
    try {
      const r = await propagarRecorrencia(recorrenciaId, escopo, false);
      if (!r.ok || !r.dados) { toast.error(r.erro ?? 'O banco recusou a propagação.'); return; }
      const n = r.dados.aplicadosFuturos + r.dados.aplicadosPassados;
      toast.success(n === 1 ? '1 lançamento atualizado.' : `${n} lançamentos atualizados.`);
      aoFechar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && aoFechar()}>
      <DialogContent className="w-[94vw] max-w-md gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b bg-primary/10 px-4 py-2.5 pr-12 text-left">
          <DialogTitle className="text-[14px] font-medium leading-none text-primary">
            Propagar aos lançamentos gerados
          </DialogTitle>
          <DialogDescription className="mt-1 text-[11px] leading-snug">
            {descricao} · a regra já foi salva
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 px-4 py-3">
          {recusa ? (
            /* A mensagem do banco, inteira. Ela nomeia o invariante e diz o que fazer. */
            <div className="flex gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{recusa}</span>
            </div>
          ) : nada ? (
            <div className="rounded border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
              Esta recorrência ainda não gerou lançamentos — não há o que propagar.
            </div>
          ) : (
            <>
              <div className="rounded border bg-muted/40 px-2 py-1.5 text-[11px]">
                <b className="tabular-nums">{previa.futuros}</b> futuro{previa.futuros === 1 ? '' : 's'}
                {' · '}
                <b className="tabular-nums">{previa.passados}</b> passado{previa.passados === 1 ? '' : 's'}
                <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  Propagam: descrição, favorecido, fazenda, conta, classificação e safra.
                  O valor só alcança os futuros; datas, tipo e sinal nunca mudam.
                </div>
              </div>

              {/* ⚠ SEM `as`: a lista é a fonte dos valores, então procurar nela estreita o tipo
                  e ainda valida — um valor que não esteja em OPCOES simplesmente não passa. */}
              <RadioGroup className="gap-1.5" value={escopo}
                onValueChange={v => { const o = OPCOES.find(x => x.valor === v); if (o) setEscopo(o.valor); }}>
                {OPCOES.map(o => (
                  <div key={o.valor} className="flex items-start gap-2">
                    <RadioGroupItem value={o.valor} id={`prop-${o.valor}`} className="mt-0.5" />
                    <Label htmlFor={`prop-${o.valor}`} className="cursor-pointer font-normal leading-snug">
                      <span className="text-[11px] font-medium">{o.rotulo}</span>
                      <span className="block text-[10px] text-muted-foreground">{o.explica}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </>
          )}
        </div>

        <DialogFooter className="items-center gap-2 border-t bg-accent px-4 py-2.5 sm:justify-end">
          {recusa || nada ? (
            <Button size="sm" onClick={aoFechar}>Entendi</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={aoFechar}>Fechar</Button>
              <Button type="button" size="sm" className="gap-1.5" disabled={ocupado}
                onClick={() => { void confirmar(); }}>
                {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {escopo === 'nenhum' ? 'Manter como estão' : 'Propagar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
