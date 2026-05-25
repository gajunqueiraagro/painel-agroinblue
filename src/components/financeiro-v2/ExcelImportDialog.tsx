/**
 * ExcelImportDialog — importador Excel para excel_linhas_aux.
 *
 * 3 passos internos (mesmo Dialog, sem rotas):
 *   1. Setup: conta bancária obrigatória + sinal padrão (saída/entrada/excel define)
 *   2. Upload + mapeamento de colunas (auto-detect por regex + preview)
 *   3. Validação + confirmação (resumo válidas/inválidas + Importar)
 *
 * NÃO resolve fornecedor, NÃO matching com OFX, NÃO cria lançamento.
 * Headers Excel não mapeados vão pra `payload_extra` (JSONB).
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { useFinanceiroV2 } from '@/hooks/useFinanceiroV2';
import { useExcelLinhasAux, type ExcelLinhaCru } from '@/hooks/useExcelLinhasAux';

interface Props {
  open: boolean;
  onClose: () => void;
  onImportado: () => void;
  defaultContaBancariaId?: string;
}

type SinalPadrao = 'saida' | 'entrada' | 'excel_define';

type CampoDestino =
  | 'data_referencia'
  | 'valor'
  | 'valor_debito'
  | 'valor_credito'
  | 'fornecedor_texto'
  | 'fazenda_texto'
  | 'plano_texto'
  | 'centro_texto'
  | 'produto_texto'
  | 'observacao';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const REGEX_DETECT: Record<CampoDestino, RegExp> = {
  data_referencia: /\bdata\b|^dt\b|vencimento|pagamento/,
  valor: /\bvalor\b|r\$|preco/,
  valor_debito: /debito|saida|pagto/,
  valor_credito: /credito|entrada|recebimento/,
  fornecedor_texto: /fornecedor|favorecid|benefici|nome|cliente/,
  fazenda_texto: /fazenda|propriedade|loc(al)?/,
  plano_texto: /plano|categoria|conta cont|subcentro/,
  centro_texto: /centro|cc|setor/,
  produto_texto: /produto|descric|item|histor/,
  observacao: /obs|nota|comentar/,
};

function normalizar(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function parseDataExcel(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw).trim();
  // dd/mm/yyyy
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const [, d, m, y] = br;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // yyyy-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  return null;
}

/**
 * Parser de valor tolerante a formato BR ('1.234,56') e US ('1,234.56').
 * Decide o separador decimal pela posição do último '.' vs último ','.
 * Caso edge: "8.600" sem decimal — heurística: 1 ponto + 3 dígitos depois + sem
 * vírgula = milhar BR sem decimal → 8600. "8.6" / "8.60" → US → 8.6.
 *
 * IMPORTANTE: o caminho principal espera typeof === 'number' (Excel raw:true).
 * O caminho string é residual para células que vêm como texto literal.
 */
function parseValor(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  let s = String(raw).replace(/\s/g, '').replace(/R\$/gi, '').trim();
  if (!s) return null;

  // sinal
  let neg = false;
  if (s.startsWith('-') || s.startsWith('(')) neg = true;
  s = s.replace(/^[-(]/, '').replace(/\)$/, '');
  if (!s) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot === -1 && lastComma === -1) {
    const n = parseFloat(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }

  if (lastComma > lastDot) {
    // BR: vírgula é decimal, ponto é milhar — "1.234.567,89"
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // lastDot >= lastComma. Pode ser US ("1,234.56") ou BR sem decimal ("8.600")
    const aposPonto = s.length - lastDot - 1;
    const totalDots = (s.match(/\./g) || []).length;
    if (totalDots > 1 || (aposPonto === 3 && lastComma === -1 && totalDots === 1)) {
      // múltiplos pontos = milhar BR; ou 1 ponto + 3 dígitos sem vírgula = milhar BR
      s = s.replace(/\./g, '');
    } else {
      // US: vírgula é milhar (remover), ponto é decimal (manter)
      s = s.replace(/,/g, '');
    }
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function ExcelImportDialog({
  open,
  onClose,
  onImportado,
  defaultContaBancariaId,
}: Props) {
  const { clienteAtual } = useCliente();
  const { contasBancarias, loadContas } = useFinanceiroV2();
  const { inserirBatch } = useExcelLinhasAux();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [contaBancariaId, setContaBancariaId] = useState<string>('');
  const [sinalPadrao, setSinalPadrao] = useState<SinalPadrao>('saida');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [linhasBrutas, setLinhasBrutas] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<CampoDestino, number | null>>>({});
  const [linhasValidas, setLinhasValidas] = useState<ExcelLinhaCru[]>([]);
  const [linhasInvalidas, setLinhasInvalidas] = useState<{ linha: number; motivo: string }[]>([]);
  const [importando, setImportando] = useState(false);

  // Reset interno ao abrir/fechar
  useEffect(() => {
    if (open) {
      loadContas();
      setStep(1);
      setContaBancariaId(defaultContaBancariaId ?? '');
      setSinalPadrao('saida');
      setArquivo(null);
      setHeaders([]);
      setLinhasBrutas([]);
      setMapping({});
      setLinhasValidas([]);
      setLinhasInvalidas([]);
      setImportando(false);
    }
  }, [open, defaultContaBancariaId, loadContas]);

  // Lista dos campos que precisam de auto-detect conforme sinalPadrao.
  const camposVisiveis = useMemo<CampoDestino[]>(() => {
    const base: CampoDestino[] = [
      'data_referencia',
      'fornecedor_texto',
      'fazenda_texto',
      'plano_texto',
      'centro_texto',
      'produto_texto',
      'observacao',
    ];
    if (sinalPadrao === 'excel_define') {
      return ['data_referencia', 'valor_debito', 'valor_credito', ...base.slice(1)];
    }
    return ['data_referencia', 'valor', ...base.slice(1)];
  }, [sinalPadrao]);

  // PR2.1 — Preview do passo 1: 3 primeiras linhas + contagem + alerta
  // bloqueante quando maior valor absoluto > R$ 10M (provável bug de parser
  // ou formatação anômala da planilha).
  const previewInfo = useMemo(() => {
    if (!arquivo || mapping.data_referencia == null || mapping.valor == null) {
      return null;
    }
    const idxData = mapping.data_referencia;
    const idxValor = mapping.valor;
    const valoresProcessados: number[] = [];
    for (const row of linhasBrutas) {
      const v = parseValor(row[idxValor]);
      if (v != null) {
        const final = sinalPadrao === 'saida' ? -Math.abs(v) : Math.abs(v);
        valoresProcessados.push(final);
      }
    }
    const positivos = valoresProcessados.filter((v) => v > 0).length;
    const negativos = valoresProcessados.filter((v) => v < 0).length;
    const maxAbs = valoresProcessados.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const temAlerta = maxAbs > 10_000_000;
    const primeiras3 = linhasBrutas.slice(0, 3).map((row) => {
      const dataIso = parseDataExcel(row[idxData]);
      const vRaw = parseValor(row[idxValor]);
      const valorFinal =
        vRaw == null ? null : sinalPadrao === 'saida' ? -Math.abs(vRaw) : Math.abs(vRaw);
      return { data: dataIso, valor: valorFinal };
    });
    return { positivos, negativos, maxAbs, temAlerta, primeiras3 };
  }, [arquivo, linhasBrutas, mapping.data_referencia, mapping.valor, sinalPadrao]);

  async function handleArquivo(file: File): Promise<void> {
    if (file.size > MAX_FILE_BYTES) {
      toast.error('Arquivo grande demais. Limite: 10 MB.');
      return;
    }
    setArquivo(file);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        raw: true, // número nativo do Excel; cellDates:true mantém datas como Date
      });
      if (matrix.length === 0) {
        toast.error('Planilha vazia');
        return;
      }
      const hs = (matrix[0] ?? []).map((h) => String(h ?? '').trim());
      const dados = matrix.slice(1);
      setHeaders(hs);
      setLinhasBrutas(dados);

      // auto-detecção
      const auto: Partial<Record<CampoDestino, number | null>> = {};
      for (const campo of camposVisiveis) {
        const idx = hs.findIndex((h) => REGEX_DETECT[campo].test(normalizar(h)));
        auto[campo] = idx >= 0 ? idx : null;
      }
      setMapping(auto);
    } catch (e) {
      console.error('[ExcelImportDialog] erro ao parsear:', e);
      toast.error('Arquivo inválido ou corrompido');
      setArquivo(null);
    }
  }

  function podeAvancarPasso2(): boolean {
    if (!mapping.data_referencia && mapping.data_referencia !== 0) return false;
    if (sinalPadrao === 'excel_define') {
      const temDeb = mapping.valor_debito != null;
      const temCred = mapping.valor_credito != null;
      return temDeb || temCred;
    }
    return mapping.valor != null;
  }

  function processarLinhas(): void {
    const validas: ExcelLinhaCru[] = [];
    const invalidas: { linha: number; motivo: string }[] = [];

    const idxData = mapping.data_referencia;
    const idxValor = mapping.valor;
    const idxDeb = mapping.valor_debito;
    const idxCred = mapping.valor_credito;
    const idxForn = mapping.fornecedor_texto;
    const idxFaz = mapping.fazenda_texto;
    const idxPlano = mapping.plano_texto;
    const idxCentro = mapping.centro_texto;
    const idxProd = mapping.produto_texto;
    const idxObs = mapping.observacao;

    const mapeados = new Set<number>(
      Object.values(mapping).filter((v): v is number => typeof v === 'number'),
    );

    linhasBrutas.forEach((row, idx) => {
      const linhaNum = idx + 2; // +1 header, +1 0-based
      const dataIso = parseDataExcel(idxData != null ? row[idxData] : null);
      if (!dataIso) {
        invalidas.push({ linha: linhaNum, motivo: 'data inválida ou ausente' });
        return;
      }

      let valor: number | null = null;
      if (sinalPadrao === 'excel_define') {
        const deb = idxDeb != null ? parseValor(row[idxDeb]) : null;
        const cred = idxCred != null ? parseValor(row[idxCred]) : null;
        if ((deb == null || deb === 0) && (cred == null || cred === 0)) {
          invalidas.push({ linha: linhaNum, motivo: 'débito e crédito vazios' });
          return;
        }
        valor = (cred ?? 0) - (deb ?? 0);
      } else {
        const v = idxValor != null ? parseValor(row[idxValor]) : null;
        if (v == null) {
          invalidas.push({ linha: linhaNum, motivo: 'valor não numérico' });
          return;
        }
        valor = sinalPadrao === 'saida' ? -Math.abs(v) : Math.abs(v);
      }

      // payload_extra com headers não mapeados
      const extra: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (mapeados.has(i)) return;
        const v = row[i];
        if (v != null && v !== '') extra[h || `col_${i}`] = v;
      });

      validas.push({
        data_referencia: dataIso,
        valor,
        fornecedor_texto: idxForn != null ? (String(row[idxForn] ?? '').trim() || null) : null,
        fazenda_texto: idxFaz != null ? (String(row[idxFaz] ?? '').trim() || null) : null,
        plano_texto: idxPlano != null ? (String(row[idxPlano] ?? '').trim() || null) : null,
        centro_texto: idxCentro != null ? (String(row[idxCentro] ?? '').trim() || null) : null,
        produto_texto: idxProd != null ? (String(row[idxProd] ?? '').trim() || null) : null,
        observacao: idxObs != null ? (String(row[idxObs] ?? '').trim() || null) : null,
        payload_extra: Object.keys(extra).length > 0 ? extra : null,
      });
    });

    setLinhasValidas(validas);
    setLinhasInvalidas(invalidas);
  }

  async function handleImportar(): Promise<void> {
    if (!clienteAtual?.id) {
      toast.error('Cliente não identificado');
      return;
    }
    if (linhasValidas.length === 0) {
      toast.error('Nenhuma linha válida para importar');
      return;
    }
    setImportando(true);
    try {
      const res = await inserirBatch(linhasValidas, contaBancariaId, clienteAtual.id, 'excel');
      if (res.inseridas > 0) {
        onImportado();
        onClose();
      }
    } finally {
      setImportando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importar Excel — Referências Operacionais (Passo {step}/3)</DialogTitle>
        </DialogHeader>

        {/* Passo 1 — Setup + Upload + Preview (PR2.1) */}
        {step === 1 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <div className="space-y-1">
              <Label className="text-xs">Conta bancária *</Label>
              <Select value={contaBancariaId} onValueChange={setContaBancariaId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {contasBancarias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_exibicao ?? c.nome_conta}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Todo o lote será atribuído a esta conta. Não há texto livre de conta no Excel.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Sinal padrão do lote *</Label>
              <RadioGroup value={sinalPadrao} onValueChange={(v) => setSinalPadrao(v as SinalPadrao)}>
                <div className="space-y-3">
                  <div className="border rounded p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="saida" id="r-saida" />
                      <Label htmlFor="r-saida" className="text-xs font-medium">
                        Todas saídas — valores serão gravados negativos
                      </Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                      Ex.: fornecedores, manutenção, folha, combustível, pagamentos.
                    </p>
                  </div>
                  <div className="border rounded p-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="entrada" id="r-entrada" />
                      <Label htmlFor="r-entrada" className="text-xs font-medium">
                        Todas entradas — valores serão gravados positivos
                      </Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                      Ex.: vendas, recebimentos, aluguel, PIX recebido.
                    </p>
                  </div>
                  {/* PR2.1 — "excel_define" desabilitado até parser ser validado */}
                  <div className="border rounded p-2.5 opacity-50 cursor-not-allowed">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="excel_define" id="r-define" disabled />
                      <Label htmlFor="r-define" className="text-xs font-medium text-muted-foreground">
                        Excel define — colunas débito/crédito separadas
                      </Label>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-6">
                      Desabilitado temporariamente. Disponível em versão futura.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1 pt-2 border-t">
              <Label className="text-xs">Arquivo (.xlsx ou .xls)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                className="h-8 text-xs"
                disabled={!contaBancariaId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleArquivo(f);
                }}
              />
              {!contaBancariaId && (
                <p className="text-[10px] text-muted-foreground">Selecione a conta antes de fazer upload.</p>
              )}
              {arquivo && (
                <p className="text-[10px] text-muted-foreground">
                  {arquivo.name} · {linhasBrutas.length} linha(s) · {headers.length} coluna(s)
                </p>
              )}
            </div>

            {/* Preview 3 linhas + contagem + alerta (PR2.1) */}
            {previewInfo && (
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs">Preview (3 primeiras linhas — valor final)</Label>
                <div className="border rounded p-2 text-[11px] space-y-1 bg-muted/30">
                  {previewInfo.primeiras3.map((p, i) => (
                    <div key={i} className="flex justify-between font-mono">
                      <span>{p.data ?? '-'}</span>
                      <span className={p.valor != null && p.valor < 0 ? 'text-red-700' : 'text-emerald-700'}>
                        {p.valor != null
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(p.valor)
                          : '-'}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-emerald-700"><strong>{previewInfo.positivos}</strong> entrada(s)</span>
                  <span className="text-red-700"><strong>{previewInfo.negativos}</strong> saída(s)</span>
                  <span className="text-muted-foreground ml-auto">
                    Maior valor abs:{' '}
                    <strong className="tabular-nums">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previewInfo.maxAbs)}
                    </strong>
                  </span>
                </div>
                {previewInfo.temAlerta && (
                  <div className="rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-800">
                    <strong>⚠ Alerta:</strong> valor acima de R$ 10 milhões detectado (
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previewInfo.maxAbs)}).
                    <br />
                    Provável erro de parser ou formatação. Não avance — revise o Excel.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Passo 2 — Mapping (PR2.1: upload movido pro passo 1) */}
        {step === 2 && (
          <div className="space-y-3 flex-1 overflow-auto">
            {headers.length === 0 && (
              <div className="text-[11px] text-muted-foreground italic">
                Volte ao passo 1 para selecionar o arquivo.
              </div>
            )}
            {headers.length > 0 && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mapeamento de colunas</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {camposVisiveis.map((campo) => (
                      <div key={campo} className="flex items-center gap-2">
                        <span className="text-[10px] w-24 text-muted-foreground">{campo}</span>
                        <Select
                          value={mapping[campo] != null ? String(mapping[campo]) : '__none__'}
                          onValueChange={(v) => setMapping((prev) => ({
                            ...prev,
                            [campo]: v === '__none__' ? null : Number(v),
                          }))}
                        >
                          <SelectTrigger className="h-7 text-[11px] flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— não mapear</SelectItem>
                            {headers.map((h, i) => (
                              <SelectItem key={i} value={String(i)}>{h || `(col ${i + 1})`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                {linhasBrutas.length > 0 && (
                  <div className="border rounded overflow-auto max-h-[180px]">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          {camposVisiveis.map((c) => (
                            <TableHead key={c} className="text-[9px]">{c}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linhasBrutas.slice(0, 5).map((row, ri) => (
                          <TableRow key={ri}>
                            {camposVisiveis.map((c) => {
                              const idx = mapping[c];
                              return (
                                <TableCell key={c} className="text-[10px]">
                                  {idx != null ? String(row[idx] ?? '') : '—'}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Passo 3 — Validação + confirmação */}
        {step === 3 && (
          <div className="space-y-3 flex-1 overflow-auto">
            <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
              <div><strong>{linhasValidas.length}</strong> linha(s) válida(s) serão importadas.</div>
              <div className={linhasInvalidas.length > 0 ? 'text-amber-700' : 'text-muted-foreground'}>
                <strong>{linhasInvalidas.length}</strong> linha(s) inválida(s) serão puladas.
              </div>
            </div>
            {linhasInvalidas.length > 0 && (
              <div className="border rounded p-2 text-[11px] space-y-0.5 max-h-[150px] overflow-auto">
                <div className="font-semibold text-amber-700 text-[10px]">Inválidas (primeiras 5):</div>
                {linhasInvalidas.slice(0, 5).map((i, k) => (
                  <div key={k} className="text-amber-800">
                    Linha {i.linha}: {i.motivo}
                  </div>
                ))}
                {linhasInvalidas.length > 5 && (
                  <div className="italic text-muted-foreground">… e mais {linhasInvalidas.length - 5}.</div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={importando}>Cancelar</Button>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={importando}>
              Voltar
            </Button>
          )}
          {step === 1 && (
            <Button
              disabled={
                !contaBancariaId
                || !arquivo
                || headers.length === 0
                || (previewInfo?.temAlerta ?? false)
              }
              onClick={() => setStep(2)}
            >
              Avançar
            </Button>
          )}
          {step === 2 && (
            <Button
              disabled={!podeAvancarPasso2()}
              onClick={() => { processarLinhas(); setStep(3); }}
            >
              Avançar
            </Button>
          )}
          {step === 3 && (
            <Button
              disabled={importando || linhasValidas.length === 0}
              onClick={() => void handleImportar()}
            >
              {importando ? 'Importando…' : `Importar ${linhasValidas.length} linha(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
