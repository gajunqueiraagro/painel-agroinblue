// src/v2/pages/CusteioTxtImportTab.tsx
// PR-RAUL-01 — Tela de preview do Importador de Custeio TXT (Raul / Faz. Monterrey).
//
// ESCOPO TRAVADO:
//   - Upload de .txt + preview dos itens-folha. NADA é gravado.
//   - SEM Supabase, SEM banco, SEM de-para, SEM plano de contas, SEM Mesa/OFX/conciliação.
//   - Estado vive 100% em React state desta tela.

import { useMemo, useState } from 'react';
import {
  parseCusteioTxtFile,
  type CusteioParseResult,
} from '@/v2/lib/custeio/parseCusteioTxt';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, FileText, Upload } from 'lucide-react';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function CusteioTxtImportTab() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CusteioParseResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setErro(null);
    setResultado(null);
    setFileName(file.name);
    try {
      const res = await parseCusteioTxtFile(file);
      setResultado(res);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao ler o arquivo.');
    } finally {
      setParsing(false);
      // permite reabrir o mesmo arquivo
      e.target.value = '';
    }
  }

  const recOk = resultado?.reconciliacao.ok ?? false;
  const recConferido = resultado?.reconciliacao.conferido ?? false;

  const subtotalGeral = useMemo(
    () => resultado?.total_geral_impresso ?? null,
    [resultado],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Importador de Custeio (TXT) — Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Relatório de custeio/compras. Esta etapa apenas lê o arquivo e mostra os itens —
            nada é gravado, nenhuma classificação é aplicada.
          </p>

          <label className="inline-flex">
            <input
              type="file"
              accept=".txt"
              className="hidden"
              onChange={onFile}
            />
            <Button asChild variant="outline" disabled={parsing}>
              <span className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {parsing ? 'Lendo...' : 'Selecionar arquivo .txt'}
              </span>
            </Button>
          </label>

          {fileName && (
            <span className="ml-3 text-sm text-muted-foreground">{fileName}</span>
          )}

          {erro && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro ao ler o arquivo</AlertTitle>
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {resultado && (
        <>
          {/* Cabeçalho do relatório + totais */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-6 sm:grid-cols-4">
              <Info label="Fazenda" value={resultado.fazenda_raw ?? '—'} />
              <Info
                label="Competência"
                value={
                  resultado.ano_mes ??
                  resultado.periodo_raw ??
                  '—'
                }
              />
              <Info label="Itens" value={String(resultado.total_itens)} />
              <Info label="Soma dos itens" value={brl(resultado.soma_valores)} emphasis />
            </CardContent>
          </Card>

          {/* Reconciliação */}
          {recConferido ? (
            recOk ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Reconciliação OK</AlertTitle>
                <AlertDescription>
                  A soma dos itens-folha bate com os subtotais impressos no TXT.
                  {subtotalGeral !== null && (
                    <> Total geral impresso: <strong>{brl(subtotalGeral)}</strong>.</>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Divergência de reconciliação</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>
                    A soma dos itens não bate com algum subtotal impresso. Verifique se um
                    subtotal foi lido como item (dupla contagem) ou se o parser perdeu linhas.
                  </p>
                  <ul className="ml-4 list-disc text-sm">
                    {resultado.reconciliacao.divergencias.map((d, idx) => (
                      <li key={idx}>
                        {d.escopo}: itens {brl(d.soma_itens)} × impresso{' '}
                        {brl(d.subtotal_impresso)} (dif. {brl(d.diferenca)})
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )
          ) : (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sem subtotais para conferir</AlertTitle>
              <AlertDescription>
                O TXT não trouxe subtotais/total reconhecíveis. A soma dos itens é{' '}
                <strong>{brl(resultado.soma_valores)}</strong> — confira manualmente contra o total do relatório.
              </AlertDescription>
            </Alert>
          )}

          {/* Avisos do parser */}
          {resultado.avisos.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Avisos do parser</AlertTitle>
              <AlertDescription>
                <ul className="ml-4 list-disc text-sm">
                  {resultado.avisos.map((a, idx) => (
                    <li key={idx}>{a}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Tabela de itens-folha */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Itens ({resultado.total_itens})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Família</TableHead>
                      <TableHead>Subfamília</TableHead>
                      <TableHead>Produto / Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.itens.map((it) => (
                      <TableRow key={`${it.linha_num}`}>
                        <TableCell className="text-muted-foreground">{it.linha_num}</TableCell>
                        <TableCell>{it.familia_raw}</TableCell>
                        <TableCell>{it.subfamilia_raw}</TableCell>
                        <TableCell>{it.produto_raw}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(it.valor)}</TableCell>
                      </TableRow>
                    ))}
                    {resultado.itens.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum item-folha reconhecido. Ajuste CUSTEIO_FORMAT no parser.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Badge variant="outline">PR-RAUL-01 · preview · não grava</Badge>
            <span className="text-xs text-muted-foreground">
              De-para e importação chegam nos PR-RAUL-02 / 03.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Info({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={emphasis ? 'text-lg font-semibold tabular-nums' : 'text-sm'}>{value}</div>
    </div>
  );
}
