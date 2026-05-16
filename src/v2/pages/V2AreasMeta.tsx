import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Globe, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import {
  useAreaPlanejamento,
  type UpsertLinhaArea,
} from '@/hooks/useAreaPlanejamento';

// API real dos contexts (auditada em C3 Passo 1):
//   useCliente()  → { clienteAtual, ... }   (NÃO `cliente`)
//   useFazenda()  → { fazendaAtual, isGlobal, ... }
//   fazendaAtual?.id pode ser '__global__' (sentinel) — usar `isGlobal` do contexto
//   como verdade. Em modo Global, passar fazendaId=null ao hook.
//
// V2Index passa ano como string (mesmo padrão de V2AuditoriaAnual). Convertemos
// internamente para number (que é o que useAreaPlanejamento espera).

interface Props {
  ano: string;
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

interface LinhaLocal {
  mes: number;
  pec: string;       // string para permitir input vazio
  agric: string;
}

function parseNumOrZero(v: string): number {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function media(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((s, n) => s + n, 0) / v.length;
}

export function V2AreasMeta({ ano: anoInicial }: Props) {
  // Contexts (API real — ver comentário acima)
  const { clienteAtual } = useCliente();
  const { fazendaAtual, isGlobal } = useFazenda();
  const clienteId = clienteAtual?.id ?? null;
  const fazendaId = isGlobal ? null : (fazendaAtual?.id ?? null);

  const { toast } = useToast();

  // Ano local da tela: prop é string (V2Index), hook espera number.
  const anoInicialNum = useMemo(() => {
    const n = Number(anoInicial);
    return Number.isFinite(n) && n > 0 ? n : new Date().getFullYear();
  }, [anoInicial]);
  const [anoLocal, setAnoLocal] = useState<number>(anoInicialNum);
  useEffect(() => { setAnoLocal(anoInicialNum); }, [anoInicialNum]);

  const { loading, saving, error, data, upsertAno } = useAreaPlanejamento(
    clienteId, fazendaId, anoLocal, isGlobal
  );

  // Estado local editável (12 linhas)
  const [linhas, setLinhas] = useState<LinhaLocal[]>(() =>
    Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, pec: '', agric: '' }))
  );

  // Sincronizar linhas locais com data quando carrega ou troca contexto.
  // Comportamento V1: descarta alterações não-salvas silenciosamente, com aviso visual via dirty.
  const lastSyncKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${clienteId ?? ''}|${fazendaId ?? ''}|${anoLocal}|${isGlobal ? 'g' : 'i'}`;
    if (key === lastSyncKeyRef.current && data == null) return;
    lastSyncKeyRef.current = key;
    if (!data) {
      setLinhas(Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, pec: '', agric: '' })));
      return;
    }
    setLinhas(data.porMes.map(m => ({
      mes: m.mes,
      pec:   m.area_pecuaria_ha   == null ? '' : String(m.area_pecuaria_ha),
      agric: m.area_agricultura_ha == null ? '' : String(m.area_agricultura_ha),
    })));
  }, [data, clienteId, fazendaId, anoLocal, isGlobal]);

  // Detectar dirty (apenas modo individual)
  const dirty = useMemo(() => {
    if (isGlobal || !data) return false;
    return data.porMes.some((m, idx) => {
      const ll = linhas[idx];
      const pecDb = m.area_pecuaria_ha;
      const agrDb = m.area_agricultura_ha;
      const pecLocal = ll.pec === '' ? null : parseNumOrZero(ll.pec);
      const agrLocal = ll.agric === '' ? null : parseNumOrZero(ll.agric);
      return pecLocal !== pecDb || agrLocal !== agrDb;
    });
  }, [linhas, data, isGlobal]);

  // Total mensal:
  // - Global: usar data.porMes[idx].area_total_ha (banco — inclui ambiental + infra futuros)
  // - Individual: pec + agric do estado local (ambiental e infra ficam zero na V1)
  const totalsLocal = useMemo(() => linhas.map((l, idx) => {
    if (isGlobal) return data?.porMes[idx]?.area_total_ha ?? null;
    const pec = l.pec === '' ? null : parseNumOrZero(l.pec);
    const agr = l.agric === '' ? null : parseNumOrZero(l.agric);
    if (pec === null && agr === null) return null;
    return (pec ?? 0) + (agr ?? 0);
  }), [linhas, data, isGlobal]);

  const mediaPec = useMemo(() => media(linhas.map(l => l.pec === '' ? null : parseNumOrZero(l.pec))), [linhas]);
  const mediaAgr = useMemo(() => media(linhas.map(l => l.agric === '' ? null : parseNumOrZero(l.agric))), [linhas]);
  // Média Total:
  // - Global: usa data.mediaTotal (já calculada pelo hook)
  // - Individual: média de totalsLocal (que é pec+agric)
  const mediaTot = useMemo(() => {
    if (isGlobal) return data?.mediaTotal ?? null;
    return media(totalsLocal);
  }, [isGlobal, data, totalsLocal]);

  // Lista de anos no dropdown (ano corrente +/- 5)
  const anoCorrente = new Date().getFullYear();
  const anosOpts = Array.from({ length: 11 }, (_, i) => anoCorrente - 5 + i);

  function onChangeCelula(idx: number, campo: 'pec' | 'agric', valor: string) {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  }

  async function handleSalvar() {
    if (isGlobal) return;
    if (!clienteId || !fazendaId) {
      toast({ title: 'Selecione cliente e fazenda', variant: 'destructive' });
      return;
    }
    // Construir payload — só os meses preenchidos com pec OU agric
    const payload: UpsertLinhaArea[] = [];
    for (const l of linhas) {
      const pec = l.pec === '' ? null : parseNumOrZero(l.pec);
      const agr = l.agric === '' ? null : parseNumOrZero(l.agric);
      // Mês sem nada → não envia (preserva ausência no banco)
      if (pec === null && agr === null) continue;
      payload.push({
        mes: l.mes,
        area_pecuaria_ha: pec ?? 0,
        area_agricultura_ha: agr ?? 0,
        // ambiental e infra V1 = 0 (default no hook)
      });
    }
    try {
      await upsertAno(payload);
      toast({ title: 'Áreas META salvas', description: `${payload.length} mês(es) atualizado(s).` });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao salvar';
      toast({ title: 'Erro ao salvar', description: msg, variant: 'destructive' });
    }
  }

  // === RENDER ===

  if (!clienteId) {
    return <div className="p-6 text-sm text-muted-foreground">Selecione um cliente para continuar.</div>;
  }

  return (
    <div className="p-3 md:p-4 space-y-3">
      {/* Header */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Áreas META — Planejamento
                {isGlobal && (
                  <Badge variant="secondary" className="gap-1 h-5 text-[10px] px-1.5 bg-orange-100 text-orange-800 border-orange-200">
                    <Globe className="h-3 w-3" /> Global • soma das fazendas
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {isGlobal
                  ? 'Leitura agregada de todas as fazendas do cliente. Para editar, selecione uma fazenda.'
                  : `Edite a área pecuária e agrícola META mês a mês para ${fazendaAtual?.nome ?? 'esta fazenda'}.`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(anoLocal)} onValueChange={(v) => setAnoLocal(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anosOpts.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
              {!isGlobal && (
                <Button
                  size="sm"
                  onClick={handleSalvar}
                  disabled={!dirty || saving || loading}
                  className="h-8"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Salvar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Banner dirty (alterações não salvas) — só individual */}
        {dirty && (
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Há alterações não salvas. Trocar de fazenda ou ano sem salvar descarta as edições.</span>
            </div>
          </CardContent>
        )}

        {/* Banner status cadastro — só individual, sem dirty (não duplicar) */}
        {!isGlobal && !dirty && data && data.mesesCadastrados > 0 && data.mesesCadastrados < 12 && (
          <CardContent className="pt-0 pb-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Áreas META cadastradas em {data.mesesCadastrados}/12 meses.</span>
            </div>
          </CardContent>
        )}

        {error && (
          <CardContent className="pt-0 pb-3">
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-1.5">
              Erro ao carregar áreas: {error.message}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tabela — compacta, paleta META (laranja muito leve), sem scroll horizontal em notebook padrão */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : (
            <table className="w-full text-xs tabular-nums">
              <thead className="bg-orange-50 dark:bg-orange-950/20 border-b border-orange-200/60 dark:border-orange-900/40">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold sticky left-0 bg-orange-50 dark:bg-orange-950/20 min-w-[100px] text-orange-900 dark:text-orange-200">Linha (ha)</th>
                  {MESES.map(m => (
                    <th key={m} className="px-1 py-1.5 font-semibold text-center min-w-[56px] text-orange-900 dark:text-orange-200">{m}</th>
                  ))}
                  <th className="px-2 py-1.5 font-semibold text-center bg-orange-100/60 dark:bg-orange-900/30 min-w-[68px] text-orange-900 dark:text-orange-200">Média</th>
                </tr>
              </thead>
              <tbody>
                {/* Pecuária */}
                <tr className="border-b border-border/60 hover:bg-orange-50/40 dark:hover:bg-orange-950/10 transition-colors">
                  <td className="px-2 py-1 font-medium sticky left-0 bg-background">Pecuária</td>
                  {linhas.map((l, idx) => (
                    <td key={l.mes} className="px-0.5 py-0.5 text-center">
                      {isGlobal ? (
                        <span className="text-muted-foreground">
                          {fmt(data?.porMes[idx]?.area_pecuaria_ha ?? null)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          className="h-6 w-full text-xs text-right px-1 tabular-nums"
                          value={l.pec}
                          onChange={(e) => onChangeCelula(idx, 'pec', e.target.value)}
                          disabled={saving}
                          placeholder="—"
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center font-medium bg-orange-50/60 dark:bg-orange-950/15">{fmt(mediaPec)}</td>
                </tr>

                {/* Agricultura */}
                <tr className="border-b border-border/60 hover:bg-orange-50/40 dark:hover:bg-orange-950/10 transition-colors">
                  <td className="px-2 py-1 font-medium sticky left-0 bg-background">Agricultura</td>
                  {linhas.map((l, idx) => (
                    <td key={l.mes} className="px-0.5 py-0.5 text-center">
                      {isGlobal ? (
                        <span className="text-muted-foreground">
                          {fmt(data?.porMes[idx]?.area_agricultura_ha ?? null)}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          className="h-6 w-full text-xs text-right px-1 tabular-nums"
                          value={l.agric}
                          onChange={(e) => onChangeCelula(idx, 'agric', e.target.value)}
                          disabled={saving}
                          placeholder="—"
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center font-medium bg-orange-50/60 dark:bg-orange-950/15">{fmt(mediaAgr)}</td>
                </tr>

                {/* Total — sempre read-only, paleta META destaque */}
                <tr className="bg-orange-100/50 dark:bg-orange-900/25 border-t-2 border-orange-200/70 dark:border-orange-900/50">
                  <td className="px-2 py-1.5 font-semibold sticky left-0 bg-orange-100/50 dark:bg-orange-900/25 text-orange-900 dark:text-orange-200">Total</td>
                  {linhas.map((_, idx) => (
                    <td key={idx} className="px-1 py-1.5 text-center font-semibold text-orange-900 dark:text-orange-200">
                      {fmt(totalsLocal[idx])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center font-semibold bg-orange-200/40 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200">{fmt(mediaTot)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Rodapé informativo */}
      <p className="text-[11px] text-muted-foreground">
        {isGlobal
          ? 'Global: Total = soma completa cadastrada no banco, incluindo campos futuros Ambiental e Infraestrutura.'
          : 'Individual: Total = Pecuária + Agricultura. V1 não edita áreas Ambiental e Infraestrutura (gravadas como 0 no banco; estrutura preparada para fases futuras).'}
        {isGlobal && ' Em modo Global, mês é considerado cadastrado se ao menos uma fazenda tiver linha.'}
      </p>
    </div>
  );
}
