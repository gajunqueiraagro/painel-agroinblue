/**
 * "Anexar vários boletos" — tela B do mock `docs/mocks/fin_nfe_parcelas_pr2_mock_v2.html`
 * (FIN-NFE-PARCELAS-01 PR 2b).
 *
 * O operador solta os PDFs de uma vez e cada arquivo vai para UMA parcela sem boleto, pela regra de
 * `casarBoletos` (vencimento lido pela ordem -> número no nome -> escolher). O operador sempre pode
 * trocar no seletor. Quem grava é quem abriu: antes de salvar, vira pendente; depois, vai direto para
 * as parcelas — este diálogo não sabe e não precisa saber qual dos dois.
 *
 * ⚠ O BOLETO NUNCA MUDA O VENCIMENTO DA PARCELA. A diferença só aparece, em âmbar, acima de 7 dias.
 * ⚠ A31: 10px nas linhas, 9,5px no cabeçalho navy, linha de 18px, larguras fixas, sem reticência.
 * Recusa por arquivo e pendência ao lado do botão, sem toast.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Paperclip, X } from 'lucide-react';
import { extractPdfText } from '@/lib/financeiro/parser/extractPdfText';
import { lerLinhaDigitavel, type LeituraBoleto } from '@/lib/financeiro/linhaDigitavel';
import {
  casarBoletos, diasDeDiferenca, LIMITE_DIAS_AVISO, type CasouPor,
} from '@/lib/financeiro/casarBoletos';
import { motivoArquivoRecusado } from '@/lib/financeiro/documentosPendentes';
import { NomeDoArquivo } from '@/components/financeiro-v2/NomeDoArquivo';

export interface ParcelaDoBoleto {
  numero: number;
  vencimento: string | null;
  valor: number | null;
  /** Já tem boleto: não é opção (substituir = tirar na grade e anexar de novo). */
  temBoleto: boolean;
}

export interface BoletoAtribuido { arquivo: File; parcela: number; leitura: LeituraBoleto | null }

interface ItemArquivo {
  chave: string;
  arquivo: File;
  recusa: string | null;
  lendo: boolean;
  leitura: LeituraBoleto | null;
  parcelaManual: number | null;
}

const TH = 'sticky top-0 z-10 h-[17px] whitespace-nowrap bg-primary px-[4px] text-center text-[9.5px] font-semibold text-white';
/* `py-0 leading-none`: como a grade de parcelas — sem isto a linha mede 19 (medido no PR 2b-fix2). */
const TD = 'h-[18px] border-b border-[#eceae4] px-[4px] py-0 text-[10px] leading-none align-middle';
const dataCurta = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a.slice(2)}`;
};
const valorBR = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROTULO_CASOU: Record<CasouPor, string> = {
  vencimento: 'vencimento', nome: 'nome do arquivo', escolha: 'escolha', nao_leu: 'não leu',
};

let seqArquivo = 0;

export function AnexarBoletosDialog({ parcelas, subtitulo, onConfirmar, onFechar }: {
  parcelas: readonly ParcelaDoBoleto[];
  subtitulo?: string;
  /** Grava (ou guarda) os boletos. Devolve a mensagem de erro, ou null quando deu certo. */
  onConfirmar: (itens: BoletoAtribuido[]) => Promise<string | null>;
  onFechar: () => void;
}) {
  const [itens, setItens] = useState<ItemArquivo[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const total = parcelas.length;
  const livres = useMemo(() => parcelas.filter(p => !p.temBoleto), [parcelas]);
  const porNumero = useMemo(() => new Map(parcelas.map(p => [p.numero, p])), [parcelas]);

  const receber = useCallback((lista: FileList | File[] | null) => {
    if (!lista) return;
    const novos: ItemArquivo[] = Array.from(lista).map(arquivo => {
      seqArquivo += 1;
      return {
        chave: `arq-${Date.now()}-${seqArquivo}`, arquivo, recusa: motivoArquivoRecusado(arquivo),
        lendo: false, leitura: null, parcelaManual: null,
      };
    });
    setErro(null);
    setItens(prev => [...prev, ...novos]);
    for (const it of novos) {
      if (it.recusa || it.arquivo.type !== 'application/pdf') continue;
      setItens(prev => prev.map(x => (x.chave === it.chave ? { ...x, lendo: true } : x)));
      void extractPdfText(it.arquivo)
        .then(r => (r.hasTextLayer ? lerLinhaDigitavel(r.text) : null))
        .catch(() => null)
        .then(leitura => setItens(prev => prev.map(x => (x.chave === it.chave ? { ...x, lendo: false, leitura } : x))));
    }
  }, []);

  const validos = useMemo(() => itens.filter(i => !i.recusa), [itens]);
  const casamento = useMemo(() => casarBoletos(
    validos.map(i => ({ chave: i.chave, nome: i.arquivo.name, vencimentoLido: i.leitura?.vencimento ?? null, parcelaManual: i.parcelaManual })),
    livres.map(p => ({ numero: p.numero, vencimento: p.vencimento })),
  ), [validos, livres]);

  const parcelaDe = (chave: string) => casamento.get(chave)?.parcela ?? null;
  const semParcela = validos.filter(i => parcelaDe(i.chave) == null);
  const escolhidas = validos.map(i => parcelaDe(i.chave)).filter((n): n is number => n != null);
  const repetidas = [...new Set(escolhidas.filter((n, k) => escolhidas.indexOf(n) !== k))];
  const lendoAlgum = itens.some(i => i.lendo);
  const livresDepois = livres.filter(p => !escolhidas.includes(p.numero));
  const podeAnexar = validos.length > 0 && semParcela.length === 0 && repetidas.length === 0 && !lendoAlgum && !enviando;

  const confirmar = async () => {
    if (!podeAnexar) return;
    setEnviando(true);
    setErro(null);
    try {
      const atribuidos = validos.flatMap(i => {
        const parcela = parcelaDe(i.chave);
        return parcela == null ? [] : [{ arquivo: i.arquivo, parcela, leitura: i.leitura }];
      });
      const falha = await onConfirmar(atribuidos);
      if (falha) { setErro(falha); return; }
      onFechar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onFechar(); }}>
      <DialogContent className="max-w-[820px] p-0 gap-0 overflow-hidden">
        <div className="bg-primary px-4 py-2 text-primary-foreground flex items-center justify-between">
          <DialogTitle className="text-[13px] font-semibold">
            Anexar vários boletos{subtitulo ? <span className="ml-2 font-normal opacity-80">{subtitulo}</span> : null}
          </DialogTitle>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar" className="text-white/80 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <DialogDescription className="sr-only">
          Solte os boletos; cada arquivo vai para uma parcela sem boleto.
        </DialogDescription>

        <div className="space-y-2 px-4 py-3">
          <div
            data-testid="soltar-boletos"
            onDragOver={e => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={e => { e.preventDefault(); setArrastando(false); receber(e.dataTransfer.files); }}
            className={`flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 ${arrastando ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/20'}`}>
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 leading-tight">
              <div className="text-[11px] font-medium">Solte os boletos aqui</div>
              <div className="text-[10px] text-muted-foreground">PDF, JPG ou PNG, até 10 MB cada · vários de uma vez</div>
            </div>
            <Button type="button" variant="outline" className="h-[22px] px-[9px] text-[10px]" onClick={() => inputRef.current?.click()}>
              Escolher arquivos
            </Button>
            <input ref={inputRef} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden"
              data-testid="input-boletos"
              onChange={e => { receber(e.target.files); e.target.value = ''; }} />
          </div>

          {itens.length > 0 && (
            <div className="max-h-[320px] overflow-auto rounded border border-[#E0E2E6]">
              <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
                <colgroup>
                  <col style={{ width: 250 }} /><col style={{ width: 150 }} /><col style={{ width: 110 }} />
                  <col style={{ width: 130 }} /><col style={{ width: 100 }} /><col style={{ width: 30 }} />
                </colgroup>
                <thead>
                  <tr>{['Arquivo', 'Vai para', 'Casou por', 'Vencimento', 'Valor R$', ''].map((h, k) => <th key={k} className={TH}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {itens.map((i, k) => {
                    const c = casamento.get(i.chave);
                    const parc = c?.parcela ?? null;
                    const alvo = parc != null ? porNumero.get(parc) : undefined;
                    const dif = diasDeDiferenca(i.leitura?.vencimento ?? null, alvo?.vencimento ?? null);
                    const longe = dif != null && Math.abs(dif) > LIMITE_DIAS_AVISO;
                    const amarelo = !i.recusa && (parc == null || longe);
                    const opcoes = livres.filter(p => p.numero === parc || !escolhidas.includes(p.numero));
                    return (
                      <tr key={i.chave} data-testid="linha-boleto"
                        className={i.recusa ? 'bg-red-50' : amarelo ? 'bg-amber-50' : k % 2 ? 'bg-[#FAFAF8]' : 'bg-white'}>
                        {/* PR 2b-fix2 — uma linha só, com a célula de nome de arquivo do fix1; o nome inteiro no `title`. */}
                        <td className={`${TD} overflow-hidden whitespace-nowrap`} title={i.arquivo.name} data-testid="arquivo-do-boleto">
                          <NomeDoArquivo nome={i.arquivo.name} />
                        </td>
                        <td className={TD}>
                          {i.recusa ? <span className="text-destructive">{i.recusa}</span> : (
                            <Select value={parc != null ? String(parc) : undefined}
                              onValueChange={v => setItens(prev => prev.map(x => (x.chave === i.chave ? { ...x, parcelaManual: Number(v) } : x)))}>
                              <SelectTrigger className={`h-[16px] px-1 text-[10px] ${parc == null ? 'border-amber-500 text-amber-800' : ''}`}>
                                <SelectValue placeholder="escolher" />
                              </SelectTrigger>
                              <SelectContent>
                                {opcoes.map(p => (
                                  <SelectItem key={p.numero} value={String(p.numero)}>
                                    Parcela {p.numero}/{total}{p.vencimento ? ` · ${dataCurta(p.vencimento)}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                        <td className={`${TD} text-center`}>
                          {i.recusa ? '—' : i.lendo ? 'lendo…' : c ? ROTULO_CASOU[parc == null && c.casouPor !== 'escolha' ? 'nao_leu' : c.casouPor] : '—'}
                        </td>
                        <td className={`${TD} text-center`}>
                          {dataCurta(i.leitura?.vencimento)}
                          {longe && dif != null && <span className="ml-1 font-semibold text-amber-700" data-testid="diferenca-dias">{dif > 0 ? `+${dif}` : dif} dias</span>}
                        </td>
                        <td className={`${TD} text-right`}>{valorBR(i.leitura?.valor)}</td>
                        <td className={`${TD} text-center`}>
                          <button type="button" aria-label="Tirar arquivo" title="Tirar arquivo"
                            onClick={() => setItens(prev => prev.filter(x => x.chave !== i.chave))}
                            className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground" data-testid="resumo-boletos">
            {validos.length} {validos.length === 1 ? 'arquivo' : 'arquivos'} · {validos.length - semParcela.length} ligados · {semParcela.length} a escolher
            {livresDepois.length > 0 && <> · parcela ainda sem boleto: {livresDepois.map(p => `${p.numero}/${total}`).join(', ')}</>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-card px-4 py-1.5">
          <span className="mr-auto text-[10px] leading-tight text-destructive" data-testid="pendencia-boletos">
            {erro
              ?? (semParcela.length > 0 ? `Falta escolher a parcela de ${semParcela.length} ${semParcela.length === 1 ? 'arquivo' : 'arquivos'}.`
                : repetidas.length > 0 ? `Dois arquivos na mesma parcela: ${repetidas.map(n => `${n}/${total}`).join(', ')}.`
                  : '')}
          </span>
          <Button type="button" variant="ghost" className="h-[22px] px-[9px] text-[10px]" onClick={onFechar} disabled={enviando}>Cancelar</Button>
          <Button type="button" className="h-[22px] px-[9px] text-[10px] font-semibold" disabled={!podeAnexar} onClick={confirmar}
            data-testid="anexar-boletos">
            {enviando ? 'Anexando…' : `Anexar ${validos.length} ${validos.length === 1 ? 'boleto' : 'boletos'}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
