/**
 * COMPARAR ANTES DE ATUALIZAR O CADASTRO — NOTA-FORNECEDOR-COMPARAR-01 (Gabriel 22/10/2026 08h10). Reutilizavel: a nota (+ Da nota) e a
 * Receita (P31) chamam o MESMO componente; quem chama diz a origem e grava (`onConfirmar`).
 *   · topo: QUAL cadastro vai mudar (nome, CNPJ, cidade, lancamentos, ultimo uso); se ele nao parece o certo (outro CNPJ, nome sem
 *     palavra em comum), a frase e "Escolher outro cadastro" / "Cadastrar novo";
 *   · a tabela (regua): Campo · Hoje · Da nota · [marcar] — vazio hoje vem marcado; diferente vem DESMARCADO e destacado; igual apagado;
 *   · "Atualizar N campos" pede confirmacao no proprio botao (mesmo lugar, mesma largura); nada e' gravado antes.
 * Modal fixo; so' o corpo da tabela rola.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { QUADRO_REGUA, TD_REGUA_TEXTO, TH_REGUA } from '@/components/ui/regua-tabela';
import {
  cadastroPareceErrado, camposMarcados, linhasDaComparacao, type CadastroParaComparar,
} from '@/lib/fornecedores/compararCadastro';
import { cn } from '@/lib/utils';

const dataBr = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');

export function CompararCadastroDialog({
  hoje, proposta, rotuloOrigem, emitente, uso, onConfirmar, onEscolherOutro, onCadastrarNovo, onClose,
}: {
  hoje: CadastroParaComparar;
  proposta: CadastroParaComparar;
  /** "Da nota" | "Da Receita" */
  rotuloOrigem: string;
  emitente: { documento: string | null; nomes: readonly (string | null | undefined)[] };
  uso?: { lancamentos: number; ultimo: string | null } | null;
  /** grava os campos marcados; devolve a frase da recusa, ou `null` */
  onConfirmar: (campos: Record<string, string>) => Promise<string | null>;
  onEscolherOutro?: () => void;
  onCadastrarNovo?: () => void;
  onClose: () => void;
}) {
  const linhas = useMemo(() => linhasDaComparacao(hoje, proposta), [hoje, proposta]);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(linhas.filter((l) => l.marcadoPadrao).map((l) => l.grupo.chave)));
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const errado = useMemo(() => cadastroPareceErrado(hoje, emitente), [hoje, emitente]);
  const n = linhas.filter((l) => l.estado !== 'igual' && marcados.has(l.grupo.chave)).length;
  const alternar = (k: string, v: boolean) => { setConfirmando(false); setMarcados((m) => { const x = new Set(m); if (v) x.add(k); else x.delete(k); return x; }); };
  const confirmar = async () => {
    if (!confirmando) { setConfirmando(true); return; }
    setGravando(true); setErro(null);
    try {
      const e = await onConfirmar(camposMarcados(proposta, new Set([...marcados].filter((k) => linhas.some((l) => l.grupo.chave === k && l.estado !== 'igual')))));
      if (e) { setErro(e); setConfirmando(false); return; }
      onClose();
    } finally { setGravando(false); }
  };
  const cidade = [hoje.municipio, hoje.uf].filter(Boolean).join('/') || '—';

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !gravando) onClose(); }}>
      <DialogContent className="flex h-[min(440px,95vh)] w-[min(760px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="comparar-cadastro">
        <div className="flex h-9 shrink-0 items-center bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Atualizar o cadastro do fornecedor</DialogTitle>
          <DialogDescription className="sr-only">Como está o cadastro hoje e o que muda; só o marcado é gravado.</DialogDescription>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2 text-[10.5px]">
          <div className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5" data-testid="comparar-qual">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-muted-foreground">Vai mudar:</span>
              <b className="min-w-0 uma-linha-que-rola" title={hoje.nome ?? ''}>{hoje.nome ?? '—'}</b>
            </div>
            <div className="flex min-w-0 gap-3 whitespace-nowrap text-muted-foreground">
              <span>CNPJ/CPF <b className="tabular-nums text-foreground">{hoje.cpf_cnpj || 'sem'}</b></span>
              <span className="min-w-0 uma-linha-que-rola">Cidade <b className="text-foreground">{cidade}</b></span>
              <span className="tabular-nums">{uso ? `${uso.lancamentos} lanç. · último ${dataBr(uso.ultimo)}` : ''}</span>
            </div>
          </div>
          <div className={cn('flex h-[26px] shrink-0 items-center gap-2 rounded-md px-2', errado ? 'bg-amber-50 text-amber-900' : 'text-muted-foreground')} data-testid="comparar-aviso">
            <span className="min-w-0 uma-linha-que-rola" title={errado ?? undefined}>
              {errado ? `⚠ ${errado}` : 'Vazio hoje vem marcado; diferente vem desmarcado — marque só o que deve mudar.'}
            </span>
            <span className="ml-auto" />
            {errado && onEscolherOutro && <Button type="button" size="sm" variant="outline" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={onEscolherOutro} data-testid="comparar-escolher-outro">Escolher outro cadastro</Button>}
            {errado && onCadastrarNovo && <Button type="button" size="sm" variant="outline" className="h-[20px] shrink-0 px-2 text-[10px]" onClick={onCadastrarNovo} data-testid="comparar-cadastrar-novo">Cadastrar novo</Button>}
          </div>
          <div className={cn(QUADRO_REGUA, 'min-h-0 flex-1')}>
            <table className="w-full shrink-0 table-fixed border-collapse bg-primary">
              <colgroup><col style={{ width: 92 }} /><col /><col /><col style={{ width: 54 }} /></colgroup>
              <thead><tr>{['Campo', 'Hoje', rotuloOrigem, 'Mudar'].map((h) => <th key={h} className={cn(TH_REGUA, 'text-left')} title={h}>{h}</th>)}</tr></thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="comparar-corpo">
              <table className="w-full table-fixed border-collapse">
                <colgroup><col style={{ width: 92 }} /><col /><col /><col style={{ width: 54 }} /></colgroup>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.grupo.chave} className={cn('border-b border-border/50', l.estado === 'igual' && 'text-muted-foreground/70')} data-testid="comparar-linha" data-estado={l.estado}>
                      <td className={TD_REGUA_TEXTO}>{l.grupo.rotulo}</td>
                      <td className={TD_REGUA_TEXTO} title={l.hoje || 'vazio'}>{l.hoje || <span className="italic text-muted-foreground">vazio</span>}</td>
                      <td className={cn(TD_REGUA_TEXTO, l.estado === 'diferente' && 'bg-amber-50 font-medium text-amber-900')} title={l.proposto}>{l.proposto}</td>
                      <td className={TD_REGUA_TEXTO}>
                        {l.estado === 'igual' ? 'igual' : (
                          <Checkbox checked={marcados.has(l.grupo.chave)} onCheckedChange={(v) => alternar(l.grupo.chave, v === true)} className="h-3 w-3"
                            aria-label={`Mudar ${l.grupo.rotulo}`} data-testid={`comparar-marcar-${l.grupo.chave}`} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center gap-2 border-t bg-card px-3 text-[10.5px]">
          <span className={cn('min-w-0 uma-linha-que-rola', erro ? 'text-destructive' : 'text-muted-foreground')} data-testid="comparar-frase" title={erro ?? undefined}>
            {erro ? `⚠ ${erro}` : confirmando ? `Confirme: ${n} campo${n === 1 ? '' : 's'} de "${hoje.nome ?? ''}" mudam (com trilha e desfazer).` : ''}
          </span>
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={gravando} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[24px] w-[170px] shrink-0 px-2.5 text-[10.5px]" disabled={n === 0 || gravando} onClick={() => { void confirmar(); }} data-testid="comparar-atualizar">
            {gravando ? 'Gravando…' : confirmando ? 'Confirmar' : `Atualizar ${n} campo${n === 1 ? '' : 's'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
