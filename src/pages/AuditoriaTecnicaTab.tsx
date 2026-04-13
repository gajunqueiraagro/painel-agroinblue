/**
 * Modo Auditoria Técnica — Conferência mês a mês do motor zootécnico.
 *
 * Exibe para cada mês:
 *   - Saldo inicial oficial
 *   - Entradas externas / Evol cat entrada
 *   - Saídas externas / Evol cat saída
 *   - Saldo final oficial
 *   - Origem da leitura (fonte)
 *   - Status da validação da equação
 *   - Status do encadeamento
 *
 * NÃO corrige, NÃO mascara. Apenas sinaliza.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle, XCircle, AlertTriangle, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAnosDisponiveis } from '@/hooks/useAnosDisponiveis';
import { useRebanhoOficial } from '@/hooks/useRebanhoOficial';
import {
  validarEquacaoTotal,
  validarEquacaoCategoria,
  validarEncadeamentoMensal,
  gerarResumoValidacao,
} from '@/lib/calculos/validacaoZootecnica';

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function AuditoriaTecnicaTab() {
  const { data: anosDisp = [String(new Date().getFullYear())] } = useAnosDisponiveis();
  const [anoFiltro, setAnoFiltro] = useState(String(new Date().getFullYear()));
  const [vista, setVista] = useState<'total' | 'categoria' | 'encadeamento'>('total');

  const { rawCategorias, loading } = useRebanhoOficial({ ano: Number(anoFiltro), cenario: 'realizado' });

  const resumo = useMemo(() => gerarResumoValidacao(rawCategorias), [rawCategorias]);

  const equacaoTotal = resumo.equacaoTotal;
  const equacaoCategoria = resumo.equacaoCategoria;
  const encadeamento = resumo.encadeamento;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground text-sm">
        Carregando dados oficiais…
      </div>
    );
  }

  return (
    <div className="w-full px-4 pb-20 space-y-3 animate-fade-in">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border/50 px-4 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-bold">🔍 Auditoria Técnica</span>
        <Select value={anoFiltro} onValueChange={setAnoFiltro}>
          <SelectTrigger className="h-7 text-xs font-bold w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anosDisp.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Status geral */}
        {resumo.todosOk ? (
          <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
            <ShieldCheck className="h-3 w-3" /> Motor validado
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            {resumo.totalErrosEquacao + resumo.totalErrosEncadeamento} inconsistência(s)
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={vista} onValueChange={v => setVista(v as any)}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="total" className="text-xs">
            Equação Total
            {equacaoTotal.some(e => !e.ok) && <span className="ml-1 text-destructive">⚠</span>}
          </TabsTrigger>
          <TabsTrigger value="categoria" className="text-xs">
            Por Categoria
            {equacaoCategoria.some(e => !e.ok) && <span className="ml-1 text-destructive">⚠</span>}
          </TabsTrigger>
          <TabsTrigger value="encadeamento" className="text-xs">
            Encadeamento
            {encadeamento.some(e => !e.ok) && <span className="ml-1 text-destructive">⚠</span>}
          </TabsTrigger>
        </TabsList>

        {/* Equação Total */}
        <TabsContent value="total">
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">SI + Ent.Ext + Evol.E - Saí.Ext - Evol.S = SF</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead className="w-12">Mês</TableHead>
                      <TableHead className="text-right">SI</TableHead>
                      <TableHead className="text-right">+Ent.Ext</TableHead>
                      <TableHead className="text-right">+Evol.E</TableHead>
                      <TableHead className="text-right">-Saí.Ext</TableHead>
                      <TableHead className="text-right">-Evol.S</TableHead>
                      <TableHead className="text-right">SF Esperado</TableHead>
                      <TableHead className="text-right">SF Real</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead className="w-8">✓</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equacaoTotal.map(r => (
                      <TableRow key={r.mes} className={!r.ok ? 'bg-destructive/10' : ''}>
                        <TableCell className="text-xs font-bold">{r.mesLabel}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{fmt(r.saldoInicial)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-green-700">{fmt(r.entradasExternas)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-blue-600">{fmt(r.evolCatEntrada)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-red-600">{fmt(r.saidasExternas)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-orange-600">{fmt(r.evolCatSaida)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-bold">{fmt(r.saldoFinalEsperado)}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums font-bold">{fmt(r.saldoFinalReal)}</TableCell>
                        <TableCell className={`text-right text-xs tabular-nums font-bold ${r.ok ? '' : 'text-destructive'}`}>
                          {r.diferenca !== 0 ? fmt(r.diferenca) : '–'}
                        </TableCell>
                        <TableCell>
                          {r.ok
                            ? <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            : <XCircle className="h-3.5 w-3.5 text-destructive" />
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Por Categoria */}
        <TabsContent value="categoria">
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">Validação por categoria/mês</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead>Mês</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">SI</TableHead>
                      <TableHead className="text-right">+Ent</TableHead>
                      <TableHead className="text-right">+Evol.E</TableHead>
                      <TableHead className="text-right">-Saí</TableHead>
                      <TableHead className="text-right">-Evol.S</TableHead>
                      <TableHead className="text-right">SF Esp.</TableHead>
                      <TableHead className="text-right">SF Real</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead>✓</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {equacaoCategoria
                      .filter(r => !r.ok)
                      .concat(equacaoCategoria.filter(r => r.ok))
                      .slice(0, 200)
                      .map((r, i) => (
                        <TableRow key={i} className={!r.ok ? 'bg-destructive/10' : ''}>
                          <TableCell className="text-xs">{r.mesLabel}</TableCell>
                          <TableCell className="text-xs font-medium">{r.categoria}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.saldoInicial)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.entradasExternas)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.evolCatEntrada)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.saidasExternas)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.evolCatSaida)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums font-bold">{fmt(r.saldoFinalEsperado)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums font-bold">{fmt(r.saldoFinalReal)}</TableCell>
                          <TableCell className={`text-right text-xs tabular-nums font-bold ${r.ok ? '' : 'text-destructive'}`}>
                            {r.diferenca !== 0 ? fmt(r.diferenca) : '–'}
                          </TableCell>
                          <TableCell>
                            {r.ok
                              ? <CheckCircle className="h-3 w-3 text-green-600" />
                              : <XCircle className="h-3 w-3 text-destructive" />
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              {equacaoCategoria.length > 200 && (
                <p className="text-[10px] text-muted-foreground px-3 py-1">
                  Mostrando 200 de {equacaoCategoria.length} linhas (erros primeiro).
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Encadeamento */}
        <TabsContent value="encadeamento">
          <Card>
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs">SF mês N = SI mês N+1 (por categoria)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead>Categoria</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">SF Origem</TableHead>
                      <TableHead>Destino</TableHead>
                      <TableHead className="text-right">SI Destino</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead>✓</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {encadeamento
                      .filter(r => !r.ok)
                      .concat(encadeamento.filter(r => r.ok).slice(0, 50))
                      .map((r, i) => (
                        <TableRow key={i} className={!r.ok ? 'bg-destructive/10' : ''}>
                          <TableCell className="text-xs font-medium">{r.categoria}</TableCell>
                          <TableCell className="text-xs">{MESES_LABELS[r.mesOrigem - 1]}/{r.anoOrigem}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.saldoFinalOrigem)}</TableCell>
                          <TableCell className="text-xs">{MESES_LABELS[r.mesDestino - 1]}/{r.anoDestino}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(r.saldoInicialDestino)}</TableCell>
                          <TableCell className={`text-right text-xs tabular-nums font-bold ${r.ok ? '' : 'text-destructive'}`}>
                            {r.diferenca !== 0 ? fmt(r.diferenca) : '–'}
                          </TableCell>
                          <TableCell>
                            {r.ok
                              ? <CheckCircle className="h-3 w-3 text-green-600" />
                              : <XCircle className="h-3 w-3 text-destructive" />
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
