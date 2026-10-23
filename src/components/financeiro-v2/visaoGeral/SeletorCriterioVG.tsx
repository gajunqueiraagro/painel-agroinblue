/**
 * P90 (Gabriel 23/10/2026) — o seletor "Mês · Média · Acumulado" da Visão Geral: vale para o card, a grade e os modais de ampliar
 * (não para o gráfico de colunas). Rótulos fixos (a largura não muda com o mês) e lugar fixo: trocar o critério não desloca nada.
 * Média = média do início do período até o mês escolhido; acumulado = a soma do mesmo intervalo (SPEC §4) — a série vem do banco.
 */
import { Segmentado } from '@/components/ui/segmentado';
import type { CriterioTelaVG } from '@/lib/financeiro/visaoGeral';

export function SeletorCriterioVG({ valor, onEscolher, testid = 'vg-criterio' }: { valor: CriterioTelaVG; onEscolher: (c: CriterioTelaVG) => void; testid?: string }) {
  return (
    <div data-testid={testid} className="shrink-0">
      <Segmentado<CriterioTelaVG> altura={20} fonte={9.5} valor={valor} onEscolher={onEscolher} opcoes={[
        { valor: 'mes', rotulo: 'Mês', title: 'O valor do mês escolhido' },
        { valor: 'media', rotulo: 'Média', title: 'A média do início do período até o mês escolhido' },
        { valor: 'acumulado', rotulo: 'Acumulado', title: 'A soma do início do período até o mês escolhido' }]} />
    </div>
  );
}
