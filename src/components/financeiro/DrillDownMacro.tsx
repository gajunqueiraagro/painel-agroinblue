import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { FinanceiroLancamento } from '@/hooks/useFinanceiro';

interface DrillDownMacroProps {
  macro: string;
  lancamentos: FinanceiroLancamento[];
  filtros: { ano: number; meses: number[]; fazendaId?: string };
  onVoltar: () => void;
}

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function DrillDownMacro({
  macro,
  lancamentos,
  filtros,
  onVoltar,
}: DrillDownMacroProps) {
  const isCusteio = macro.toLowerCase().includes('custeio produção') || macro.toLowerCase().includes('custeio produtivo');

  const [tab, setTab] = useState<string>('pecuaria');
  const [grupoSel, setGrupoSel] = useState<string | null>(null);
  const [centroSel, setCentroSel] = useState<string | null>(null);

  // Filter by tab (escopo) only for Custeio Produção
  const lancFiltrados = useMemo(() => {
    if (!isCusteio) return lancamentos;
    const escopo = tab === 'pecuaria' ? 'pecuária' : 'agricultura';
    return lancamentos.filter(
      (l) => (l.escopo_negocio || '').toLowerCase().trim() === escopo,
    );
  }, [lancamentos, isCusteio, tab]);

  // grupo_custo aggregation
  const grupos = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lancFiltrados) {
      const g = l.grupo_custo || '(Sem grupo)';
      map.set(g, (map.get(g) || 0) + Math.abs(l.valor));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total }));
  }, [lancFiltrados]);

  // centro_custo aggregation for selected grupo
  const centros = useMemo(() => {
    if (!grupoSel) return [];
    const map = new Map<string, number>();
    for (const l of lancFiltrados) {
      if ((l.grupo_custo || '(Sem grupo)') !== grupoSel) continue;
      const c = l.centro_custo || '(Sem centro)';
      map.set(c, (map.get(c) || 0) + Math.abs(l.valor));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total }));
  }, [lancFiltrados, grupoSel]);

  // subcentro aggregation for selected centro
  const subcentros = useMemo(() => {
    if (!grupoSel || !centroSel) return [];
    const map = new Map<string, number>();
    for (const l of lancFiltrados) {
      if ((l.grupo_custo || '(Sem grupo)') !== grupoSel) continue;
      if ((l.centro_custo || '(Sem centro)') !== centroSel) continue;
      const s = l.subcentro || '(Sem subcentro)';
      map.set(s, (map.get(s) || 0) + Math.abs(l.valor));
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nome, total]) => ({ nome, total }));
  }, [lancFiltrados, grupoSel, centroSel]);

  const handleGrupoClick = (nome: string) => {
    setGrupoSel(nome === grupoSel ? null : nome);
    setCentroSel(null);
  };

  const handleCentroClick = (nome: string) => {
    setCentroSel(nome === centroSel ? null : nome);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onVoltar}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h2 className="text-base font-semibold text-foreground">{macro}</h2>
      </div>

      {/* Tabs — only Custeio Produção */}
      {isCusteio && (
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setGrupoSel(null); setCentroSel(null); }}>
          <TabsList>
            <TabsTrigger value="pecuaria">Pecuária</TabsTrigger>
            <TabsTrigger value="agricultura">Agricultura</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Grupo cards */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Grupos</p>
        <div className="flex flex-wrap gap-2">
          {grupos.map((g) => (
            <Card
              key={g.nome}
              className={`cursor-pointer transition-colors ${
                grupoSel === g.nome
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/40'
              }`}
              onClick={() => handleGrupoClick(g.nome)}
            >
              <CardContent className="p-2.5">
                <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{g.nome}</p>
                <p className="text-sm font-semibold text-foreground">{fmt(g.total)}</p>
              </CardContent>
            </Card>
          ))}
          {grupos.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Nenhum grupo encontrado.</p>
          )}
        </div>
      </div>

      {/* Centro cards */}
      {grupoSel && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            Centros de Custo — {grupoSel}
          </p>
          <div className="flex flex-wrap gap-2">
            {centros.map((c) => (
              <Card
                key={c.nome}
                className={`cursor-pointer transition-colors ${
                  centroSel === c.nome
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-primary/40'
                }`}
                onClick={() => handleCentroClick(c.nome)}
              >
                <CardContent className="p-2.5">
                  <p className="text-[11px] text-muted-foreground truncate max-w-[140px]">{c.nome}</p>
                  <p className="text-sm font-semibold text-foreground">{fmt(c.total)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Subcentro list */}
      {centroSel && (
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">
            Subcentros — {centroSel}
          </p>
          <div className="rounded-md border border-border divide-y divide-border">
            {subcentros.map((s) => (
              <div
                key={s.nome}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-[12px] text-foreground">{s.nome}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-foreground">{fmt(s.total)}</span>
                  <Button variant="ghost" size="sm" disabled className="text-[10px] opacity-50">
                    Ver lançamentos <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              </div>
            ))}
            {subcentros.length === 0 && (
              <p className="text-[11px] text-muted-foreground p-3">Nenhum subcentro.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
