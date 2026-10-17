/**
 * FIN-FINANC-28-P3-FIX2 — GRADE CHAVE–VALOR: rótulos e valores alinhados numa grade só (não linhas soltas que desalinham).
 * Não havia componente para isso (a FASE 0 achou só `<dl>` montados à mão em diálogos e no Barter, e o `LinhaResumo` do resumo
 * lateral, que é uma coluna só); este é o primeiro, e quem precisar de "rótulo · valor" em grade usa ele.
 *
 * A régua é a de Lançamentos Financeiros: rótulo 8px/600 maiúsculo cinza; valor 9px/500; data em mono 8px; dinheiro 9px/600
 * com dígitos de largura fixa. Pares em colunas de `auto | resto`: 2 pares por linha abaixo de 1.280px, 4 a partir dele
 * (`xl:`). Cada célula tem 18px e uma linha; o texto corta com o inteiro no `title`; data e dinheiro não cortam. Valor vazio
 * mostra "—", nunca zero.
 */
import type { ReactNode } from 'react';

export interface ItemChaveValor {
  rotulo: string;
  /** texto pronto (ou um nó, ex.: o selo da situação); vazio/nulo vira "—" */
  valor: ReactNode;
  tipo?: 'texto' | 'data' | 'dinheiro';
  /** o inteiro, quando o valor mostrado é encurtado */
  title?: string;
}

const ROTULO = 'flex h-[18px] items-center whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.02em] text-muted-foreground';
const VALOR: Record<NonNullable<ItemChaveValor['tipo']>, string> = {
  texto: 'min-w-0 truncate text-[9px] font-medium text-foreground',
  data: 'whitespace-nowrap font-mono text-[8px] tabular-nums text-foreground',
  dinheiro: 'whitespace-nowrap text-[9px] font-semibold tabular-nums text-foreground',
};

const vazio = (v: ReactNode) => v === null || v === undefined || v === '';

export function GradeChaveValor({ itens, testId }: { itens: readonly ItemChaveValor[]; testId?: string }) {
  return (
    <dl data-testid={testId}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2.5 xl:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
      {itens.map((it) => {
        const tipo = it.tipo ?? 'texto';
        const titulo = it.title ?? (typeof it.valor === 'string' ? it.valor : undefined);
        return [
          <dt key={`r-${it.rotulo}`} className={ROTULO}>{it.rotulo}</dt>,
          <dd key={`v-${it.rotulo}`} className={`flex h-[18px] min-w-0 items-center ${VALOR[tipo]}`} title={titulo} data-testid={`dado-${it.rotulo}`}>
            {vazio(it.valor) ? <span className="text-muted-foreground">—</span> : <span className="min-w-0 truncate">{it.valor}</span>}
          </dd>,
        ];
      })}
    </dl>
  );
}
