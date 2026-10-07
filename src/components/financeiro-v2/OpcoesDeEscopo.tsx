import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * AS TRÊS OPÇÕES DE ESCOPO DE UMA PROPAGAÇÃO — "Só os futuros" · "Futuros e passados" · "Não propagar".
 *
 * PARC-CONTRATO-01 item 2: é a peça que o `PropagarRecorrenciaDialog` já desenhava, MOVIDA para cá para o contrato de
 * parcelamento usar a MESMA (não um segundo diálogo parecido). Cada tela passa os seus rótulos e a sua explicação — o que um
 * escopo alcança é regra de cada dono (a recorrência e o contrato não mudam as mesmas coisas nos passados).
 * ⚠ SEM `as`: a lista é a fonte dos valores, então procurar nela estreita o tipo e ainda valida — um valor que não esteja na
 *   lista simplesmente não passa.
 */
export type EscopoDePropagacao = 'futuros' | 'todos' | 'nenhum';

export interface OpcaoDeEscopo { valor: EscopoDePropagacao; rotulo: string; explica: string }

export function OpcoesDeEscopo({ opcoes, valor, aoMudar, prefixo = 'prop' }: {
  opcoes: readonly OpcaoDeEscopo[]; valor: EscopoDePropagacao; aoMudar: (v: EscopoDePropagacao) => void; prefixo?: string;
}) {
  return (
    <RadioGroup className="gap-1.5" value={valor}
      onValueChange={v => { const o = opcoes.find(x => x.valor === v); if (o) aoMudar(o.valor); }}>
      {opcoes.map(o => (
        <div key={o.valor} className="flex items-start gap-2">
          <RadioGroupItem value={o.valor} id={`${prefixo}-${o.valor}`} className="mt-0.5" />
          <Label htmlFor={`${prefixo}-${o.valor}`} className="cursor-pointer font-normal leading-snug">
            <span className="text-[11px] font-medium">{o.rotulo}</span>
            <span className="block text-[10px] text-muted-foreground">{o.explica}</span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
