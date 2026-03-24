/**
 * Conferência do Rateio ADM v1
 * Critério: área produtiva (ha)
 *
 * Mostra por mês:
 * - Total ADM conciliado (apenas Saídas conciliadas por data_pagamento)
 * - Tabela de auditoria com todos os lançamentos usados
 * - Critério de rateio
 * - Percentual e valor por fazenda
 * - Aviso de fazendas sem área
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
  fazendasSemArea: string[];
}

export function RateioADMConferenciaView({ conferencia, fazendasSemArea }: Props) {
  const meses = useMemo(() => conferencia.map(c => c.anoMes), [conferencia]);
  const [mesSelecionado, setMesSelecionado] = useState(meses[0] || '');
  const [showAudit, setShowAudit] = useState(false);

  const dados = useMemo(
    () => conferencia.find(c => c.anoMes === mesSelecionado),
    [conferencia, mesSelecionado],
  );

  if (conferencia.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-bold">Nenhum rateio ADM disponível</p>
        <p className="text-sm">Certifique-se de que existe uma fazenda com código ADM e lançamentos conciliados com data de pagamento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2.5 py-1.5">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-bold">Rateio ADM v1</span>
          <span className="text-muted-foreground">— critério: área produtiva (ha)</span>
        </div>
      </div>

      {/* Aviso fazendas sem área */}
      {fazendasSemArea.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-destructive">Fazendas sem área produtiva</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Estas fazendas não participam do rateio e seus custos estão subestimados:
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {fazendasSemArea.map(nome => (
                    <span key={nome} className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                      {nome}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Preencha a Área Produtiva em Cadastros → Fazenda para corrigir.
                </p>
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
          {/* Total ADM conciliado */}
          <Card>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">Total ADM Conciliado (Saídas)</div>
              <p className="text-xl font-bold">{formatMoeda(dados.totalADMConciliado)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Fazenda ADM · Tipo Operação = 2-Saídas · Status = Conciliado · Data Pagamento em {dados.anoMes}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {dados.lancamentosUsados.length} lançamento(s) no total
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
                        <TableHead className="text-[10px] px-2 py-1.5">Data Pgto</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Produto</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5 text-right">Valor</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Status</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Fazenda</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Tipo Op.</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Conta Origem</TableHead>
                        <TableHead className="text-[10px] px-2 py-1.5">Conta Destino</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dados.lancamentosUsados.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] px-2 py-1">{l.dataPagamento || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 max-w-[120px] truncate">{l.produto || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 text-right font-mono">{formatMoeda(l.valor)}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.statusTransacao || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.fazenda}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1">{l.tipoOperacao || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.contaOrigem || '-'}</TableCell>
                          <TableCell className="text-[10px] px-2 py-1 max-w-[100px] truncate">{l.contaDestino || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between text-xs">
                  <span className="font-bold">{dados.lancamentosUsados.length} lançamentos</span>
                  <span className="font-bold">{formatMoeda(dados.totalADMConciliado)}</span>
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
                        {formatNum(f.areaProdutiva, 0)} ha
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
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
            {dados.fazendasSemArea.length > 0 && (
              <p className="text-destructive">
                ⚠ {dados.fazendasSemArea.length} fazenda(s) excluída(s) do rateio por falta de área
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
