/**
 * OS ITENS DAS NOTAS JA' GUARDADAS — ITENS-NOTA-01 (o backfill). Roda na sessao de quem esta' logado (o arquivo mora no storage):
 *   1. Simular — le^ cada nota guardada sem itens (o XML antes do PDF), pelos MESMOS leitores, e diz o que gravaria: itens e se a soma
 *      fecha com a nota; nada e' gravado;
 *   2. Aplicar — abre a operacao de trilha e grava as que leram; o resultado mostra a operacao;
 *   3. Desfazer — tira as notas da operacao (com motivo).
 * Tabela na regua (o corpo rola dentro do quadro); modal fixo.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { QUADRO_REGUA, TD_REGUA_NUM, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import {
  abrirOperacaoDoBackfill, baixarArquivo, candidatasDoBackfill, desfazerOperacaoDoBackfill, gravarItensDoArquivo, type CandidataDoBackfill,
} from '@/lib/financeiro/itensDaNotaBanco';
import { numeroDaNota } from '@/lib/financeiro/nfe/formatos';
import { cn } from '@/lib/utils';

const origemDaLinha = (c: CandidataDoBackfill) => `${/\.xml$/i.test(c.caminho) ? 'XML' : 'PDF'} · ${c.origem === 'oc' ? 'OC' : 'lanç.'}`;
interface Linha { c: CandidataDoBackfill; itens: number | null; confere: boolean | null; frase: string | null; gravada: boolean }

export function ItensDasNotasGuardadasDialog({ clienteId, onClose }: { clienteId: string; onClose: () => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [fase, setFase] = useState<'pronto' | 'simulando' | 'aplicando'>('pronto');
  const [operacao, setOperacao] = useState<string | null>(null);
  const [frase, setFrase] = useState<string | null>(null);

  const ler = async (simular: boolean, op: string | null, base: Linha[] | null) => {
    const cands = base ? base.filter((l) => l.frase == null).map((l) => l.c) : await candidatasDoBackfill(clienteId);
    const saida: Linha[] = [];
    for (const c of cands) {
      const bytes = await baixarArquivo(c.bucket, c.caminho);
      if (!bytes) { saida.push({ c, itens: null, confere: null, frase: 'arquivo não encontrado no armazenamento', gravada: false }); continue; }
      const r = await gravarItensDoArquivo(clienteId, bytes, { simular, operacao: op });
      saida.push(r.ok === true ? { c, itens: r.itens, confere: r.confere, frase: null, gravada: !simular } : { c, itens: null, confere: null, frase: r.frase, gravada: false });
      setLinhas([...saida]);
    }
    setLinhas(saida);
    return saida;
  };
  const simular = async () => { setFase('simulando'); setFrase(null); try { await ler(true, null, null); } finally { setFase('pronto'); } };
  const aplicar = async () => {
    if (!linhas) return;
    setFase('aplicando'); setFrase(null);
    try {
      const boas = linhas.filter((l) => l.frase == null);
      const op = await abrirOperacaoDoBackfill(clienteId, { notas: boas.length, itens: boas.reduce((s, l) => s + (l.itens ?? 0), 0) });
      if (!op) { setFrase('A operação de trilha não abriu. Nada foi gravado.'); return; }
      setOperacao(op);
      await ler(false, op, linhas);
    } finally { setFase('pronto'); }
  };
  const desfazer = async () => {
    if (!operacao) return;
    const e = await desfazerOperacaoDoBackfill(operacao, 'desfeito pela tela dos itens das notas guardadas');
    setFrase(e ?? 'Desfeito: os itens gravados por esta operação saíram.');
    if (!e) { setOperacao(null); setLinhas(null); }
  };
  const lidas = linhas?.filter((l) => l.frase == null).length ?? 0;
  const confere = linhas?.filter((l) => l.confere).length ?? 0;
  const falhas = (linhas?.length ?? 0) - lidas;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && fase === 'pronto') onClose(); }}>
      <DialogContent className="flex h-[min(520px,95vh)] w-[min(820px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="itens-guardadas">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Itens das notas já guardadas</DialogTitle>
          <DialogDescription className="sr-only">Lê os itens das notas guardadas sem itens: simular, aplicar com trilha e desfazer.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="flex h-5 shrink-0 items-center gap-3 tabular-nums" data-testid="itens-guardadas-contagem">
            {linhas ? <>
              <span>{linhas.length} notas</span><span>{lidas} lidas</span><span className="text-[#1f7a45]">{confere} com a soma = nota</span>
              <span className={falhas ? 'text-amber-800' : 'text-muted-foreground'}>{falhas} sem leitura</span>
              {operacao && <span className="uma-linha-que-rola text-muted-foreground" title={operacao}>operação {operacao}</span>}
            </> : <span className="text-muted-foreground">Simular lê os arquivos e mostra o que seria gravado; nada é gravado.</span>}
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              <colgroup><col style={{ width: 88 }} /><col style={{ width: 296 }} /><col style={{ width: 82 }} /><col style={{ width: 40 }} /><col style={{ width: 60 }} /><col /></colgroup>
              <thead><tr>{['Nota', 'Chave', 'Origem', 'Itens', 'Soma', 'Situação'].map((h) => <th key={h} className={cn(TH_REGUA, 'text-left')}>{h}</th>)}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed border-collapse">
                <colgroup><col style={{ width: 88 }} /><col style={{ width: 296 }} /><col style={{ width: 82 }} /><col style={{ width: 40 }} /><col style={{ width: 60 }} /><col /></colgroup>
                <tbody>
                  {(linhas ?? []).map((l) => (
                    <tr key={l.c.chave} className="border-b border-border/50" data-testid="itens-guardadas-linha">
                      <td className={TD_REGUA_NUM}>{l.c.numero ? numeroDaNota(l.c.numero) : '—'}</td>
                      <td className={cn(TD_REGUA_NUM, 'text-left')}>{l.c.chave}</td>
                      <td className={TD_REGUA_TEXTO} title={origemDaLinha(l.c)}>{origemDaLinha(l.c)}</td>
                      <td className={TD_REGUA_NUM}>{l.itens ?? '—'}</td>
                      <td className={TD_REGUA_TEXTO}>{l.confere == null ? '—' : l.confere ? 'confere' : 'difere'}</td>
                      <td className={TD_REGUA_TEXTO} title={l.frase ?? undefined}>{l.frase ?? (l.gravada ? 'gravada' : 'lida (simulação)')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className="min-w-0 uma-linha-que-rola text-muted-foreground" data-testid="itens-guardadas-frase">{frase ?? ''}</span>
          <span className="ml-auto" />
          {operacao && <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto'} onClick={() => { void desfazer(); }}>Desfazer</Button>}
          <Button type="button" size="sm" variant="outline" className="h-[24px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto'} onClick={onClose}>Fechar</Button>
          <Button type="button" size="sm" variant="outline" className="h-[24px] w-[90px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto'} onClick={() => { void simular(); }} data-testid="itens-guardadas-simular">
            {fase === 'simulando' ? 'Lendo…' : 'Simular'}
          </Button>
          <Button type="button" size="sm" className="h-[24px] w-[90px] px-2.5 text-[10.5px]" disabled={fase !== 'pronto' || !linhas || lidas === 0 || !!operacao} onClick={() => { void aplicar(); }} data-testid="itens-guardadas-aplicar">
            {fase === 'aplicando' ? 'Gravando…' : 'Aplicar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
