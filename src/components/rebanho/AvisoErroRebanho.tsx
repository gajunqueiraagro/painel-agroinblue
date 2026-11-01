/**
 * REBANHO-LEITURA-01 D4 (Gabriel 01/11/2026) — a falha da leitura do rebanho: a frase (vermelha, inteira) e "Tentar de novo".
 * Nunca um mês vazio que pareça dado (P146: "falhou" não vira lista vazia). Mora na faixa de 24px do cabeçalho da tabela, no lugar do
 * subtítulo — a mesma altura, nada se desloca. Usado pela Evolução no Ano e pelo nível 2 (o mês por categoria).
 */
export function AvisoErroRebanho({ texto, onTentar }: { texto: string; onTentar: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-2" role="alert" data-testid="evolucao-erro-rebanho">
      <span className="whitespace-nowrap font-semibold text-destructive">{texto}</span>
      <button type="button" className="h-[18px] flex-none rounded border border-border bg-card px-1.5 font-semibold text-[#1e2d47]"
        onClick={onTentar}>Tentar de novo</button>
    </span>
  );
}
