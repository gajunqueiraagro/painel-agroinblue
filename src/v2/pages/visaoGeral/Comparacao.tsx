/**
 * VISAO-GERAL-05 — a linha da comparação embaixo do rótulo de um número: "▲ x% meta · ▼ y% ano ant." (verde quando é bom, vermelho quando
 * não; com custo, subir é ruim). Só os pedaços que existem; sem nenhum, a linha fica reservada e vazia (nada pula).
 */
import { comparacoes, type IndicadorAtividade } from './indicadoresDaAtividade';

/* as cores das faixas da Geo pastos (ideal / carga alta) */
const VERDE = 'text-[#2F9E5B]';
const VERMELHO = 'text-[#D0453A]';

export function Comparacao({ i }: { i: Pick<IndicadorAtividade, 'meta' | 'anoAnt' | 'menorMelhor'> }) {
  const cs = comparacoes(i);
  if (cs.length === 0) return null;
  return (
    <span data-testid="vg-comparacao">
      {cs.map((c, k) => (
        <span key={c.texto}>{k > 0 && <span className="text-muted-foreground"> · </span>}<span className={c.bom ? VERDE : VERMELHO}>{c.texto}</span></span>
      ))}
    </span>
  );
}
