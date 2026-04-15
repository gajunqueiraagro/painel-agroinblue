/**
 * Conferência do Rateio ADM v2
 * Critério: rebanho médio do período
 *
 * Mostra por mês:
 * - Total ADM realizado (Saídas realizadas por Data_Ref)
 * - Tabela de auditoria com todos os lançamentos usados
 * - Critério de rateio
 * - Percentual e valor por fazenda
 * - Aviso de fazendas sem rebanho
 * - Diagnóstico quando rateio vazio
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Building2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { formatMoeda, formatNum } from '@/lib/calculos/formatters';
import type { RateioADMConferencia } from '@/hooks/useFinanceiro';

interface Props {
  conferencia: RateioADMConferencia[];
  fazendasSemRebanho: string[];
  /** Total de lançamentos ADM carregados (para diagnóstico) */
  totalLancamentosADM?: number;
}

export function RateioADMConferenciaView({ conferencia, fazendasSemRebanho, totalLancamentosADM = 0 }: Props) {
  const meses = useMemo(() => conferencia.map(c => c.anoMes), [conferencia]);
  const [mesSelecionado, setMesSelecionado] = useState(meses[0] || '');
  const [showAudit, setShowAudit] = useState(false);

  const dados = useMemo(
    () => conferencia.find(c => c.anoMes === mesSelecionado),
    [conferencia, mesSelecionado],
  );

  if (conferencia.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-bold">Nenhum rateio ADM disponível</p>
          <p className="text-sm mt-2">
            Certifique-se de que existe uma fazenda com código ADM e lançamentos que atendam aos critérios.
          </p>
        </div>

        {/* Diagnóstico */}
        <Card className="border-border bg-muted/40">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <p className="font-bold">Diagnóstico</p>
                <p>Lançamentos ADM carregados: <strong>{totalLancamentosADM}</strong></p>
                <p className="text-muted-foreground mt-1">Critérios para entrar no rateio:</p>
                <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                  <li>Fazenda = ADM (código de importação)</li>
                  <li>Tipo começando com <code className="bg-muted px-1 rounded">2</code> (saída)</li>
                  <li>Status = <code className="bg-muted px-1 rounded">Realizado</code></li>
                  <li>Data_Ref preenchida</li>
                </ul>
                <p className="text-muted-foreground mt-1">
                  Coluna de data: <strong>Data_Ref</strong> (data_realizacao)
                </p>
                <p className="text-muted-foreground">
                  Critério de rateio: <strong>Rebanho médio</strong> do período
                </p>
                {totalLancamentosADM > 0 && (
                  <p className="text-destructive mt-1">
                    ⚠ Existem {totalLancamentosADM} lançamentos ADM carregados, mas nenhum atendeu todos os critérios acima.
                    Verifique se o campo Status está como "Realizado" e se o Tipo começa com "2".
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com critérios */}
      <Card className="bg-muted/50">
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-bold">Rateio ADM v3</span>
          </div>
          <div className="text-[10px] text-muted-foreground space-y-0.5 pl-5">
            <p>Critério de rateio: <strong>Área produtiva</strong> (hectares) de cada fazenda</p>
            <p>Coluna de data: <strong>Data_Ref</strong> (data_realizacao)</p>
            <p>Filtro: Fazenda=ADM · Tipo=2-Saídas · Status=Realizado · Data_Ref preenchida</p>
            <p>Base: apenas <strong>LANCAMENTO</strong> (SALDO e RESUMO excluídos)</p>
          </div>
        </CardContent>
      </Card>

      {/* Aviso fazendas sem rebanho */}
      {fazendasSemRebanho.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-destructive">Fazendas sem rebanho cadastrado</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estas fazendas não participam do rateio por não possuírem rebanho médio no período:
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {fazendasSemRebanho.map(nome => (
                    <span key={nome} className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                      {nome}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seletor de mês */}
      <Select value={mesSelecionado} onValueChange={setMesSelecionado}>
        <SelectTrigger className="w-full text-base font-bold">
          <SelectValue placeholder="Selecione o mês" />
        </SelectTrigger>
        <SelectContent>
          {meses.map(m => (
            <SelectItem key={m} value={m}>
              {m.substring(0, 4)} — Mês {m.substring(5)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dados && (
        <>
          {/* Totais do rateio no período */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="text-xs text-muted-foreground">Resumo ADM do período ({dados.anoMes})</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">ADM encontrado</p>
                  <p className="font-bold">{formatMoeda(dados.totalADMEncontrado)}</p>
                  <p className="text-[10px] text-muted-foreground">{dados.qtdADMEncontrado} lançamento(s)</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">Elegível no rateio produtivo</p>
                  <p className="font-bold">{formatMoeda(dados.totalADMElegivel)}</p>
                  <p className="text-[10px] text-muted-foreground">{dados.qtdADMElegivel} lançamento(s)</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">Excluído do rateio</p>
                  <p className="font-bold">{formatMoeda(dados.totalADMExcluido)}</p>
                  <p className="text-[10px] text-muted-foreground">{dados.qtdADMExcluido} lançamento(s)</p>
                </div>
              </div>
              {dados.gruposExcluidos.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground mb-1">Grupos excluídos (resumo)</p>
                  <div className="flex flex-wrap gap-1">
                    {dados.gruposExcluidos.slice(0, 6).map(g => (
                      <span key={g.grupo} className="text-[10px] rounded-full bg-muted px-2 py-0.5">
                        {g.grupo}: {formatMoeda(g.valor)} ({g.quantidade})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Filtro base: ADM + Tipo 2-Saídas + Status Conciliado + Data_Ref preenchida · Elegível: Macro_Custo em Custeio Produtivo ou Investimento na Fazenda.
              </p>
            </CardContent>
          </Card>

          {/* Auditoria - lançamentos usados */}
          <Card>
            <CardHeader className="pb-2">
              <button
                onClick={() => setShowAudit(!showAudit)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle className="text-sm">
                  🔍 Auditoria — Lançamentos usados ({dados.lancamentosUsados.length})
                </CardTitle>
                {showAudit ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CardHeader>
            {showAudit && (
              <CardContent className="pt-0">
                <div className="overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] px-2 py-1.5">Data_Ref</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Produto</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5 text-right">Valor</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Status</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Fazenda</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Tipo Op.</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Conta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dados.lancamentosUsados.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] px-2 py-1">{l.dataRef || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 max-w-[120px] truncate">{l.produto || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 text-right font-mono">{formatMoeda(l.valor)}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.statusTransacao || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.fazenda}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.tipoOperacao || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.contaOrigem || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between text-xs">
                  <span className="font-bold">{dados.lancamentosUsados.length} lançamentos elegíveis</span>
                  <span className="font-bold">{formatMoeda(dados.totalADMElegivel)}</span>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Distribuição por fazenda */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribuição por Fazenda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {dados.fazendas.map(f => (
                  <div key={f.fazendaId} className="space-y-1">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold">{f.fazendaNome}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNum(f.rebanhoMedio, 0)} cab méd.
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(f.percentual, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-bold w-12 text-right">
                        {formatNum(f.percentual, 1)}%
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold">{formatMoeda(f.valorRateado)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Totalizador */}
              <div className="border-t mt-3 pt-2 flex justify-between text-xs">
                <span className="font-bold">Total rateado</span>
                <span className="font-bold">
                  {formatMoeda(dados.fazendas.reduce((s, f) => s + f.valorRateado, 0))}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Nota de verificação */}
          <div className="text-[10px] text-muted-foreground text-center space-y-0.5">
            <p>Soma dos percentuais: {formatNum(dados.fazendas.reduce((s, f) => s + f.percentual, 0), 1)}%</p>
            {dados.fazendasSemRebanho.length > 0 && (
              <p className="text-destructive">
                ⚠ {dados.fazendasSemRebanho.length} fazenda(s) excluída(s) do rateio por falta de rebanho
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
