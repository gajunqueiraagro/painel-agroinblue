/**
 * V2AuditoriaAnual — Visão Anual de Auditoria
 * Ambiente /v2 · Fase 2
 *
 * Hook: useRebanhoOficial (somente leitura, zero modificação)
 * Itera getFazendaMes(m) para m = 1..12.
 * Zero cálculo no componente. Zero outros hooks.
 *
 * Total exibido APENAS para: Entradas, Saídas.
 * getArrobasRebanho = estoque mensal, não fluxo — sem Total.
 *
 * Linhas com "—" nesta fase:
 *   - Rebanho médio (cab): sem campo oficial direto
 *   - Produção biológica: disponível por categoria no Painel Mensal
 *   - Arrobas/ha: getUAHa != arrobas/ha
 *   - Peso médio inicial: só por categoria, não por fazenda
 */
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import { cn } from '@/lib/utils';

const MESES_LABEL = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ── helpers ────────────────────────────────────────────────────────────────

function N({ v, dec = 0 }: { v: number | null | undefined; dec?: number }) {
  if (v == null || isNaN(v as number)) {
    return <span className="text-muted-foreground/30">—</span>;
  }
  return (
    <>{(v as number).toLocaleString('pt-BR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })}</>
  );
}

function Nd() {
  return <span className="text-muted-foreground/30">—</span>;
}

// ── sub-componentes ────────────────────────────────────────────────────────

function BlockHeader({ label }: { label: string }) {
  return (
    <tr className="bg-muted/40">
      <td
        colSpan={14}
        className="py-1 px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </td>
    </tr>
  );
}

function Row({
  label,
  values,
  showTotal = false,
  total,
  dec = 0,
  unavailable = false,
  highlight = false,
}: {
  label: string;
  values: (number | null)[];
  showTotal?: boolean;
  total?: number | null;
  dec?: number;
  unavailable?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={cn('border-b border-border/30 hover:bg-muted/20', highlight && 'font-semibold bg-muted/10')}>
      <td className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap pl-4">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-1 px-1 text-right text-xs tabular-nums">
          {unavailable ? <Nd /> : <N v={v} dec={dec} />}
        </td>
      ))}
      <td className="py-1 px-2 text-right text-xs tabular-nums font-medium border-l border-border/40">
        {unavailable || !showTotal || total == null ? <Nd /> : <N v={total} dec={dec} />}
      </td>
    </tr>
  );
}

function FonteRow({ values }: { values: (string | null)[] }) {
  const FONTE_CLS: Record<string, string> = {
    fechamento_pasto: 'text-emerald-700',
    calculado: 'text-amber-700',
  };
  return (
    <tr className="border-b border-border/30 hover:bg-muted/20">
      <td className="py-1 px-2 text-xs text-muted-foreground whitespace-nowrap pl-4">Fonte oficial</td>
      {values.map((v, i) => (
        <td key={i} className={cn('py-1 px-1 text-right text-[10px]', v ? FONTE_CLS[v] ?? '' : '')}>
          {v
            ? v === 'fechamento_pasto' ? 'Fech.'
              : v === 'calculado' ? 'Calc.'
              : v
            : <Nd />}
        </td>
      ))}
      <td className="py-1 px-2 border-l border-border/40"><Nd /></td>
    </tr>
  );
}

// ── componente principal ───────────────────────────────────────────────────

export function V2AuditoriaAnual({ ano }: { ano: string }) {
  const anoNum = parseInt(ano);
  const rebanho = useRebanhoOficial({ ano: anoNum, cenario: 'realizado' });

  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const fazMes = meses.map(m => rebanho.getFazendaMes?.(m) ?? null);

  // Leitura direta — zero cálculo
  const si       = fazMes.map(f => f?.cabecasInicio     ?? null);
  const entradas = fazMes.map(f => f?.entradas           ?? null);
  const saidas   = fazMes.map(f => f?.saidas             ?? null);
  const sf       = fazMes.map(f => f?.cabecasFinal       ?? null);
  const uaMedia  = fazMes.map(f => f?.uaMedia            ?? null);
  const arrobas  = meses.map(m  => rebanho.getArrobasRebanho?.(m) ?? null);
  const gmd      = fazMes.map(f => f?.gmdKgCabDia        ?? null);
  const pmFinal  = fazMes.map(f => f?.pesoMedioFinalKg   ?? null);
  const ptFinal  = fazMes.map(f => f?.pesoTotalFinalKg   ?? null);
  const fontes   = fazMes.map(f => f?.fonteOficial       ?? null);

  // Total — apenas para Entradas e Saídas (fluxo anual real)
  function soma(arr: (number | null)[]): number | null {
    const nums = arr.filter((v): v is number => v != null);
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
  }
  const totalEntradas = soma(entradas);
  const totalSaidas   = soma(saidas);

  return (
    <div className="space-y-4 px-4 py-4">

      <div>
        <h2 className="text-base font-semibold text-foreground">Visão Anual — Auditoria</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {ano} · Fonte: useRebanhoOficial · cenario=realizado
        </p>
        <p className="text-[10px] text-muted-foreground/60 italic mt-0.5">
          Leitura da fonte oficial. Esta versão não recalcula saldos nem valida divergências automaticamente.
        </p>
      </div>

      {rebanho.loading ? (
        <p className="text-xs text-muted-foreground">Carregando...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="text-left py-1.5 px-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold w-40">
                  Indicador
                </th>
                {MESES_LABEL.map(m => (
                  <th key={m} className="text-right py-1.5 px-1 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold min-w-[48px]">
                    {m}
                  </th>
                ))}
                <th className="text-right py-1.5 px-2 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold border-l border-border/40 min-w-[60px]">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {/* ── REBANHO ─────────────────────────────────────────── */}
              <BlockHeader label="Rebanho (cab)" />
              <Row label="Saldo Inicial"    values={si}       />
              <Row label="Entradas"         values={entradas} showTotal total={totalEntradas} />
              <Row label="Saídas"           values={saidas}   showTotal total={totalSaidas} />
              <Row label="Saldo Final"      values={sf}       highlight />
              <Row label="Rebanho médio"    values={si}       unavailable />
              <Row label="UA Média"         values={uaMedia}  dec={1} />

              {/* ── PRODUÇÃO ────────────────────────────────────────── */}
              <BlockHeader label="Produção" />
              <Row label="Prod. biológica (kg)"    values={si}      unavailable />
              <Row label="Arrobas do rebanho (@)"  values={arrobas} dec={1} />
              <Row label="Arrobas/ha"              values={si}      unavailable />
              <Row label="GMD (kg/cab/dia)"        values={gmd}     dec={3} />

              {/* ── PESO ────────────────────────────────────────────── */}
              <BlockHeader label="Peso" />
              <Row label="Peso médio inicial (kg)" values={si}      unavailable />
              <Row label="Peso médio final (kg)"   values={pmFinal} dec={1} />
              <Row label="Peso total final (kg)"   values={ptFinal} dec={0} />

              {/* ── FONTE ───────────────────────────────────────────── */}
              <BlockHeader label="Fonte" />
              <FonteRow values={fontes} />
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-0.5 text-[10px] text-muted-foreground/60 italic">
        <p>— Rebanho médio: sem campo oficial direto (exige cálculo)</p>
        <p>— Produção biológica: disponível por categoria no Painel Consultor mensal</p>
        <p>— Arrobas/ha: getUAHa retorna UA/ha (métrica distinta de arrobas/ha)</p>
        <p>— Peso médio inicial: disponível por categoria, não por fazenda</p>
        <p>Total exibido apenas para: Entradas, Saídas</p>
      </div>

      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg text-xs text-primary">
        <strong>/v2 · Visão Anual — Auditoria.</strong>{' '}
        Hook único: useRebanhoOficial. App original em <code>/</code> intacto.
      </div>
    </div>
  );
}
