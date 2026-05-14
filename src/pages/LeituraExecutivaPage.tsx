/**
 * LeituraExecutivaPage — Leitura Executiva (capítulos)
 *
 * Acesso direto via URL /v2/leitura-executiva (não está no menu).
 *
 * Convenções:
 * - ano/mes: vêm dos query params da URL (?ano=2026&mes=3). Fallback
 *   para o mês anterior ao corrente (mesma convenção de outras telas V2).
 * - viewMode: sempre 'periodo' (fechamento de trimestre/período).
 * - Fazenda/cliente: vêm dos contextos globais já estabelecidos
 *   (useCliente, useFazenda) — mesmo padrão das outras rotas V2.
 *
 * O wrapper é minimalista: só faz parsing dos params e renderiza
 * o capítulo. Nada de chrome, menu ou filtros aqui — a Leitura
 * Executiva tem identidade visual própria (carta executiva, não dashboard).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Capitulo1Abertura from '@/components/leitura-executiva/Capitulo1Abertura';

function defaultAnoMes(): { ano: number; mes: number } {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1..12
  const mes = currentMonth === 1 ? 12 : currentMonth - 1;
  const ano = currentMonth === 1 ? now.getFullYear() - 1 : now.getFullYear();
  return { ano, mes };
}

function parseInt1to12(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return fallback;
  return n;
}

function parseAno(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) return fallback;
  return n;
}

export default function LeituraExecutivaPage() {
  const [searchParams] = useSearchParams();
  const { ano, mes } = useMemo(() => {
    const def = defaultAnoMes();
    return {
      ano: parseAno(searchParams.get('ano'), def.ano),
      mes: parseInt1to12(searchParams.get('mes'), def.mes),
    };
  }, [searchParams]);

  return <Capitulo1Abertura ano={ano} mes={mes} />;
}
