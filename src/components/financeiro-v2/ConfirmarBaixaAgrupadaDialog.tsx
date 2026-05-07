/**
 * ConfirmarBaixaAgrupadaDialog — confirma baixa de múltiplos lançamentos via OFX.
 *
 * Recebe:
 *   - movimento (id e valor do extrato — para vincular)
 *   - itens (lançamentos detalhados, vindos do match agrupado)
 *
 * Usuário marca quais lançamentos foram efetivamente pagos. Ao confirmar:
 *   - chama useBaixaViaExtrato.baixarLancamentoViaExtrato para cada selecionado
 *   - lançamentos com status='realizado' já não são convertidos (apenas vinculados)
 *   - lançamentos cancelados/META são bloqueados upstream pelo hook
 *
 * NÃO altera categoria, valor original, classificação. Apenas status e vínculo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBaixaViaExtrato } from '@/hooks/useBaixaViaExtrato';
import type { LancamentoAgrupadoInfo } from '@/hooks/useImportacaoExtrato';
import { formatMoeda } from '@/lib/calculos/formatters';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  extratoId: string;
  dataMovimentoExtrato: string;
  documentoExtrato: string | null;
  itens: LancamentoAgrupadoInfo[];
  onConcluido?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  realizado:  'bg-emerald-100 text-emerald-700',
  agendado:   'bg-amber-100 text-amber-800',
  programado: 'bg-blue-100 text-blue-700',
};

function fmtData(s: string | null): string {
  if (!s) return '-';
  try { return format(parseISO(s), 'dd/MM/yy'); } catch { return s; }
}

export function ConfirmarBaixaAgrupadaDialog({
  open, onClose, extratoId, dataMovimentoExtrato, documentoExtrato, itens, onConcluido,
}: Props) {
  const { baixarLancamentoViaExtrato } = useBaixaViaExtrato();
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Default: marcar TODOS os itens elegíveis (agendado/programado/realizado).
  // Realizados criam apenas vínculo (sem mexer no status do lançamento).
  useEffect(() => {
    if (!open) return;
    const elegiveis = itens
      .filter((it) => {
        const s = (it.statusTransacao || '').toLowerCase();
        return s === 'agendado' || s === 'programado' || s === 'realizado';
      })
      .map((it) => it.id);
    setMarcados(new Set(elegiveis));
  }, [open, itens]);

  const totais = useMemo(() => {
    const conversiveis = itens.filter((it) => {
      const s = (it.statusTransacao || '').toLowerCase();
      return s === 'agendado' || s === 'programado';
    }).length;
    const jaRealizados = itens.filter((it) => (it.statusTransacao || '').toLowerCase() === 'realizado').length;
    return { conversiveis, jaRealizados };
  }, [itens]);

  // "Confirmar agrupamento" — todos os itens já realizados, apenas cria vínculo.
  // "Confirmar baixa via OFX (agrupado)" — há agendado/programado a converter.
  const apenasVinculo = totais.conversiveis === 0 && totais.jaRealizados > 0;
  const tituloDialog = apenasVinculo
    ? 'Confirmar agrupamento'
    : 'Confirmar baixa via OFX (agrupado)';

  const toggle = (id: string) => {
    setMarcados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmar = async () => {
    if (marcados.size === 0) { toast.error('Selecione ao menos um lançamento'); return; }
    setSalvando(true);
    let convertidos = 0;
    let vinculados = 0;
    let erros = 0;
    try {
      for (const id of marcados) {
        try {
          const r = await baixarLancamentoViaExtrato({
            lancamentoId: id,
            extratoId,
            dataPagamentoReal: dataMovimentoExtrato,
            documentoBanco: documentoExtrato ?? undefined,
          });
          if (r.convertido) convertidos++;
          if (r.vinculado) vinculados++;
        } catch (e: any) {
          erros++;
          console.error('[baixa-agrupada] erro id=', id, e);
        }
      }
      if (convertidos > 0 || vinculados > 0) {
        toast.success(`${convertidos} convertido(s) · ${vinculados} vinculado(s)${erros > 0 ? ` · ${erros} erro(s)` : ''}`);
      } else if (erros > 0) {
        toast.error(`${erros} erro(s) ao baixar`);
      }
      onConcluido?.();
      onClose();
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{tituloDialog}</DialogTitle>
          <DialogDescription>
            {apenasVinculo
              ? 'Todos os lançamentos já estão realizados — apenas o vínculo de conciliação será criado. Status financeiro NÃO é alterado.'
              : <>Marque quais lançamentos realmente foram pagos. <strong>Agendado/programado</strong> são convertidos em <strong>realizado</strong>; <strong>realizado</strong> apenas recebe vínculo. META e cancelados são bloqueados.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs flex gap-3 flex-wrap">
          <span><strong>Data extrato:</strong> {fmtData(dataMovimentoExtrato)}</span>
          {documentoExtrato && <span><strong>Doc:</strong> <code className="font-mono">{documentoExtrato}</code></span>}
          <span><strong>Conversíveis:</strong> {totais.conversiveis}</span>
          {totais.jaRealizados > 0 && (
            <span className="text-muted-foreground">{totais.jaRealizados} já realizado(s) (apenas vínculo)</span>
          )}
        </div>

        <div className="flex-1 overflow-auto border rounded">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-[10px]">Data</TableHead>
                <TableHead className="text-[10px]">Fornecedor</TableHead>
                <TableHead className="text-[10px]">Descrição</TableHead>
                <TableHead className="text-[10px]">NF</TableHead>
                <TableHead className="text-[10px]">Fazenda</TableHead>
                <TableHead className="text-[10px]">Conta</TableHead>
                <TableHead className="text-[10px]">Classificação</TableHead>
                <TableHead className="text-[10px] text-right">Valor</TableHead>
                <TableHead className="text-[10px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((it) => {
                const status = (it.statusTransacao || '').toLowerCase();
                const elegivel = status === 'agendado' || status === 'programado' || status === 'realizado';
                const cls = STATUS_BADGE[status] ?? 'bg-muted text-muted-foreground';
                const classif = [it.macroCusto, it.grupoCusto, it.centroCusto, it.subcentro]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TableRow key={it.id} className={!elegivel ? 'opacity-60' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={marcados.has(it.id)}
                        disabled={!elegivel}
                        onCheckedChange={() => toggle(it.id)}
                      />
                    </TableCell>
                    <TableCell className="text-[11px] font-mono">{fmtData(it.data)}</TableCell>
                    <TableCell className="text-[11px] max-w-[180px] truncate" title={it.fornecedor ?? undefined}>
                      {it.fornecedor || '—'}
                    </TableCell>
                    <TableCell className="text-[11px] max-w-[200px] truncate" title={it.descricao ?? undefined}>
                      {it.descricao || '—'}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {it.numeroDocumento || '—'}
                    </TableCell>
                    <TableCell className="text-[10px] max-w-[120px] truncate" title={it.fazenda ?? undefined}>
                      {it.fazenda || '—'}
                    </TableCell>
                    <TableCell className="text-[10px] max-w-[120px] truncate" title={it.contaBancaria ?? undefined}>
                      {it.contaBancaria || '—'}
                    </TableCell>
                    <TableCell className="text-[10px] italic max-w-[180px] truncate" title={classif || undefined}>
                      {classif || '—'}
                    </TableCell>
                    <TableCell className={`text-[11px] text-right font-semibold tabular-nums ${it.valor < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {formatMoeda(it.valor)}
                    </TableCell>
                    <TableCell className="text-[10px]">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full font-semibold ${cls}`}>
                        {status || '—'}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={handleConfirmar} disabled={salvando || marcados.size === 0}>
            {salvando
              ? 'Processando...'
              : (apenasVinculo
                ? `Confirmar agrupamento (${marcados.size})`
                : `Confirmar ${marcados.size} realizado(s)`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
