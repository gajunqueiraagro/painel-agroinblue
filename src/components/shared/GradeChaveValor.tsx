/**
 * FIN-FINANC-28-P3-FIX2 — GRADE CHAVE–VALOR: rótulos e valores alinhados numa grade só (não linhas soltas que desalinham).
 * Não havia componente para isso (a FASE 0 achou só `<dl>` montados à mão em diálogos e no Barter, e o `LinhaResumo` do resumo
 * lateral, que é uma coluna só); este é o primeiro, e quem precisar de "rótulo · valor" em grade usa ele.
 *
 * A régua é a de Lançamentos Financeiros: rótulo 8px/600 maiúsculo cinza; valor 9px/500; data 8px; dinheiro 9px/600
 * com dígitos de largura fixa (sem mono desde o FIX3). Pares em colunas de `auto | resto`: 2 pares por linha abaixo de 1.280px, 4 a partir dele
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
  data: 'whitespace-nowrap text-[8px] tabular-nums text-foreground',
  dinheiro: 'whitespace-nowrap text-[9px] font-semibold tabular-nums text-foreground',
};
/* FIN-FINANC-28-P3-FIX3 — a régua do FORMULÁRIO (cabeçalho da compra parcelada): rótulo 10px cinza em minúsculas (nunca
   maiúsculo), valor 11px/500; data e dinheiro em Inter com dígitos de largura fixa (sem mono). Linha de 20px. */
const ROTULO_FORM = 'flex h-[20px] items-center whitespace-nowrap text-[10px] font-normal text-muted-foreground';
const VALOR_FORM: Record<NonNullable<ItemChaveValor['tipo']>, string> = {
  texto: 'min-w-0 truncate text-[11px] font-medium text-foreground',
  data: 'whitespace-nowrap text-[11px] font-medium tabular-nums text-foreground',
  dinheiro: 'whitespace-nowrap text-[11px] font-semibold tabular-nums text-foreground',
};

const GRADE = 'grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2.5 xl:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]';
/* ⚠ NA RÉGUA DO FORMULÁRIO A 2ª COLUNA DE VALOR NUNCA ENCOLHE ABAIXO DO CONTEÚDO (`minmax(max-content,1fr)`): é onde cai o
   Credor, que vai pelo NOME INTEIRO (FIN-FINANC-28-P3-FIX3, medido: "Casa do Criador Campo Grande LTDA" pede ~210px a 11px).
   As outras colunas de valor dividem o resto e cortam com o inteiro no `title`. */
const GRADE_FORM = 'grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(max-content,1fr)] gap-x-2.5 xl:grid-cols-[auto_minmax(0,1fr)_auto_minmax(max-content,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]';

const vazio = (v: ReactNode) => v === null || v === undefined || v === '';

export function GradeChaveValor({ itens, testId, regua = 'lancamentos' }: {
  itens: readonly ItemChaveValor[]; testId?: string;
  /** 'lancamentos' (padrão) = a régua da lista; 'formulario' = rótulo 10px em minúsculas e valor 11px */
  regua?: 'lancamentos' | 'formulario';
}) {
  const rotuloCls = regua === 'formulario' ? ROTULO_FORM : ROTULO;
  const valorCls = regua === 'formulario' ? VALOR_FORM : VALOR;
  const altura = regua === 'formulario' ? 'h-[20px]' : 'h-[18px]';
  return (
    <dl data-testid={testId}
      className={regua === 'formulario' ? GRADE_FORM : GRADE}>
      {itens.map((it) => {
        const tipo = it.tipo ?? 'texto';
        const titulo = it.title ?? (typeof it.valor === 'string' ? it.valor : undefined);
        return [
          <dt key={`r-${it.rotulo}`} className={rotuloCls}>{it.rotulo}</dt>,
          <dd key={`v-${it.rotulo}`} className={`flex ${altura} min-w-0 items-center ${valorCls[tipo]}`} title={titulo} data-testid={`dado-${it.rotulo}`}>
            {vazio(it.valor) ? <span className="text-muted-foreground">—</span> : <span className="min-w-0 truncate">{it.valor}</span>}
          </dd>,
        ];
      })}
    </dl>
  );
}
