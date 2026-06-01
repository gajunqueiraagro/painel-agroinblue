// src/v2/pages/CusteioTxtImportTab.tsx
// PR-RAUL-01 — Tela de preview do Importador de Custeio TXT (Raul / Faz. Monterrey).
// PR-RAUL-02A — Cada linha do preview abre o LancamentoV2Dialog OFICIAL com prefill,
//               para o usuário salvar manualmente. NADA grava sem clicar Salvar no modal.
//
// ESCOPO:
//   - Reaproveita LancamentoV2Dialog + useFinanceiroV2 (sem formulário paralelo).
//   - SEM tabela nova, SEM migration, SEM de-para, SEM importação em lote.
//   - Preview continua client-side; gravação é via hookFin.criarLancamento (fluxo oficial).
//   - Conta, fornecedor e subcentro/plano NÃO são pré-preenchidos — usuário escolhe no modal.
//     macro/grupo/centro/subcentro continuam derivados pelo fluxo oficial.

import { useEffect, useMemo, useState } from 'react';
import {
  parseCusteioTxtFile,
  type CusteioParseResult,
  type CusteioItem,
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
import { AlertTriangle, CheckCircle2, Circle, FilePlus2, FileText, Upload } from 'lucide-react';
import { useCliente } from '@/contexts/ClienteContext';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { LancamentoV2Dialog } from '@/components/financeiro-v2/LancamentoV2Dialog';

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Normaliza nome para match exato (trim, lower, sem acento). */
function normNome(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Último dia do mês de um 'YYYY-MM' → 'YYYY-MM-DD'. Ex.: '2026-04' → '2026-04-30'. */
function ultimoDiaDoMes(anoMes: string | null | undefined): string | undefined {
  if (!anoMes) return undefined;
  const m = anoMes.match(/^(\d{4})-(\d{2})$/);
  if (!m) return undefined;
  const last = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
}

export default function CusteioTxtImportTab() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CusteioParseResult | null>(null);

  // PR-RAUL-02A — linha selecionada que abre o modal oficial.
  const [dialogRow, setDialogRow] = useState<CusteioItem | null>(null);

  // PR-RAUL-02B — linhas já gravadas (id estável = linha_num do parser).
  // Previne duplicidade: após sucesso, a linha vira "Lançado" e perde o botão.
  const [linhasLancadas, setLinhasLancadas] = useState<Set<number>>(new Set());

  const { clienteAtual } = useCliente();
  const { fazendas } = useFazenda();
  const hookFin = useFinanceiroV2();

  // useFinanceiroV2 é lazy (PR-Mesa-A1): disparar loads de contas/fornecedores/
  // classificações quando o cliente estiver resolvido. Sem isso o modal abre vazio.
  useEffect(() => {
    if (!clienteAtual?.id) return;
    hookFin.loadContas();
    hookFin.loadFornecedores();
    hookFin.loadClassificacoes();
  }, [
    clienteAtual?.id,
    hookFin.loadContas,
    hookFin.loadFornecedores,
    hookFin.loadClassificacoes,
  ]);

  const fazendasReais = useMemo(
    () => fazendas.filter((f) => f.id !== '__global__'),
    [fazendas],
  );

  // Botão "Criar lançamento" só habilita quando os auxiliares chegaram.
  const auxLoaded = hookFin.contasBancarias.length > 0 && fazendasReais.length > 0;

  // Resolve FAZENDA MONTERREY por match exato de nome; se não achar, undefined
  // (usuário escolhe no modal — não inventamos fazenda).
  const fazendaResolvidaId = useMemo(() => {
    if (!resultado?.fazenda_raw) return undefined;
    const alvo = normNome(resultado.fazenda_raw);
    return fazendasReais.find((f) => normNome(f.nome) === alvo)?.id;
  }, [resultado?.fazenda_raw, fazendasReais]);

  const dataMes = ultimoDiaDoMes(resultado?.ano_mes);

  // Prefill ESTÁVEL por linha (memo) — evita re-init do form do modal a cada render do pai.
  const prefill = useMemo(() => {
    if (!dialogRow) return undefined;
    return {
      fazenda_id: fazendaResolvidaId,
      data_competencia: dataMes,
      data_pagamento: dataMes,
      valor: dialogRow.valor,
      tipo_operacao: '2-Saídas',
      status_transacao: 'realizado',
      descricao: dialogRow.produto_raw,
      // conta_bancaria_id / favorecido_id / subcentro / plano_conta_id:
      // NÃO pré-preenchidos — usuário escolhe no modal oficial.
    };
  }, [dialogRow, fazendaResolvidaId, dataMes]);

  // Contexto operacional read-only (NÃO vira classificação).
  const referencia = useMemo(() => {
    if (!dialogRow) return undefined;
    return {
      fornecedor_texto: null,
      fazenda_texto: resultado?.fazenda_raw ?? null,
      plano_texto: null,
      centro_texto: `${dialogRow.familia_raw} › ${dialogRow.subfamilia_raw}`,
      produto_texto: dialogRow.produto_raw,
      observacao: null,
      valor: dialogRow.valor,
      data_referencia: resultado?.ano_mes ?? null,
    };
  }, [dialogRow, resultado?.fazenda_raw, resultado?.ano_mes]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setErro(null);
    setResultado(null);
    setLinhasLancadas(new Set());
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
            Relatório de custeio/compras. O preview apenas lê o arquivo. Cada item pode abrir o
            formulário oficial de lançamento — nada é gravado até você confirmar no modal.
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
              {!auxLoaded && (
                <p className="px-4 pb-2 text-xs text-muted-foreground">
                  Carregando contas e classificações do cliente… o botão de criar lançamento
                  habilita quando terminar.
                </p>
              )}
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead className="w-16">Linha</TableHead>
                      <TableHead>Família</TableHead>
                      <TableHead>Subfamília</TableHead>
                      <TableHead>Produto / Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-44 text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.itens.map((it) => {
                      const lancada = linhasLancadas.has(it.linha_num);
                      return (
                      <TableRow key={`${it.linha_num}`} className={lancada ? 'bg-emerald-50/40' : undefined}>
                        <TableCell className="text-muted-foreground">{it.linha_num}</TableCell>
                        <TableCell>{it.familia_raw}</TableCell>
                        <TableCell>{it.subfamilia_raw}</TableCell>
                        <TableCell>{it.produto_raw}</TableCell>
                        <TableCell className="text-right tabular-nums">{brl(it.valor)}</TableCell>
                        <TableCell>
                          {lancada ? (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Lançado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              <Circle className="mr-1 h-3 w-3" /> Pendente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {lancada ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!auxLoaded}
                              title={auxLoaded ? 'Criar lançamento financeiro' : 'Carregando contas/classificações…'}
                              onClick={() => setDialogRow(it)}
                            >
                              <FilePlus2 className="mr-1 h-3.5 w-3.5" />
                              Criar lançamento
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {resultado.itens.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
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
            <Badge variant="outline">PR-RAUL-02A · cria via modal oficial · grava só ao Salvar</Badge>
            <span className="text-xs text-muted-foreground">
              De-para automático e importação em lote ficam para PR-RAUL-02/03.
            </span>
          </div>
        </>
      )}

      {/* Modal oficial de lançamento financeiro — reaproveitado, não alterado.
          Conta e subcentro vêm vazios; usuário preenche e salva via fluxo oficial. */}
      <LancamentoV2Dialog
        open={!!dialogRow}
        onClose={() => setDialogRow(null)}
        onSave={async (form) => {
          const row = dialogRow;
          const ok = await hookFin.criarLancamento(form);
          if (ok) {
            // marca a linha como lançada (id estável = linha_num do parser).
            // O toast de sucesso é o do próprio hookFin.criarLancamento — não duplicar.
            if (row) {
              setLinhasLancadas((prev) => {
                const next = new Set(prev);
                next.add(row.linha_num);
                return next;
              });
            }
            setDialogRow(null);
          }
          return ok;
        }}
        fazendas={fazendasReais}
        contas={hookFin.contasBancarias}
        classificacoes={hookFin.classificacoes}
        fornecedores={hookFin.fornecedores}
        onCriarFornecedor={hookFin.criarFornecedor}
        defaultFazendaId={fazendaResolvidaId}
        prefill={prefill}
        referenciaOperacionalInfo={referencia}
      />
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
