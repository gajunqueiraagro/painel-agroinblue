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
 * BOLETO D1d (Gabriel 17/11 14:23, mock-boleto-d1d-v1): com `naCaixa` (as parcelas JÁ GRAVADAS), a coluna "Na caixa" mostra a PRÉVIA
 * do banco (nada grava antes do "Anexar"); depois que os documentos foram anexados, o boleto entra na caixa e se liga à parcela.
 * D2: parcela com OUTRO boleto ligado = anexa só o documento; a troca é na caixa ("Substituir"), nunca calada. Falha na caixa não
 * desfaz o documento: a frase fica no rodapé e o botão vira "Fechar".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X } from 'lucide-react';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import type { RegraDeAceite, VereditoDoArquivo } from '@/lib/arquivo/aceitarArquivo';
import { REGRA_ARQUIVO_DO_BOLETO } from '@/hooks/useLancamentoDocumentos';
import { extractPdfText } from '@/lib/financeiro/parser/extractPdfText';
import { lerLinhaDigitavel, type LeituraBoleto } from '@/lib/financeiro/linhaDigitavel';
import {
  casarBoletos, diasDeDiferenca, LIMITE_DIAS_AVISO, type CasouPor,
} from '@/lib/financeiro/casarBoletos';
import { NomeDoArquivo } from '@/components/financeiro-v2/NomeDoArquivo';
import {
  fraseDoOutroBoleto, gravarNaCaixa, leituraParaACaixa, parcelaApiDoBanco, prever, seloNaCaixa,
  type CorDoSelo, type NaCaixa, type ParcelaApi,
} from '@/lib/financeiro/boleto/boletoDaParcela';
import type { LeituraDoArquivo } from '@/lib/financeiro/boleto/lerBoleto';

export interface ParcelaDoBoleto {
  numero: number;
  vencimento: string | null;
  valor: number | null;
  /** Já tem boleto: não é opção (substituir = tirar na grade e anexar de novo). */
  temBoleto: boolean;
}

export interface BoletoAtribuido { arquivo: File; parcela: number; leitura: LeituraBoleto | null }

/** As parcelas GRAVADAS (número → lançamento) e o cliente: liga a coluna "Na caixa". Sem isto (parcelas da prévia), nada muda. */
export interface NaCaixaDoAnexar {
  clienteId: string;
  lancamentos: ReadonlyMap<number, string>;
  api?: ParcelaApi;
  ler?: (bytes: ArrayBuffer) => Promise<LeituraDoArquivo>;
}

const COR_DO_SELO: Record<CorDoSelo, string> = {
  azul: 'bg-blue-100 text-blue-800', verde: 'bg-green-100 text-green-800', ambar: 'bg-amber-100 text-amber-900',
  cinza: 'bg-gray-200 text-gray-700', vermelho: 'bg-red-100 text-red-800',
};

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
/** A regra do BOLETO (PDF, JPG ou PNG — sem XML), em LOTE: cada arquivo é julgado sozinho e a recusa aparece na linha dele. */
const REGRA_DOS_BOLETOS: RegraDeAceite = { ...REGRA_ARQUIVO_DO_BOLETO, varios: true };

export function AnexarBoletosDialog({ parcelas, subtitulo, onConfirmar, onFechar, naCaixa }: {
  parcelas: readonly ParcelaDoBoleto[];
  naCaixa?: NaCaixaDoAnexar;
  subtitulo?: string;
  /** Grava (ou guarda) os boletos. Devolve a mensagem de erro, ou null quando deu certo. */
  onConfirmar: (itens: BoletoAtribuido[]) => Promise<string | null>;
  onFechar: () => void;
}) {
  const [itens, setItens] = useState<ItemArquivo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** D1d: a prévia da caixa por arquivo, guardada com o lançamento a que ela se refere (trocou a parcela = pergunta de novo). */
  const [caixa, setCaixa] = useState<Record<string, { lancamentoId: string; c: NaCaixa }>>({});
  const [anexados, setAnexados] = useState(false);
  const leituras = useRef(new Map<string, ReturnType<typeof leituraParaACaixa>>());

  const total = parcelas.length;
  const livres = useMemo(() => parcelas.filter(p => !p.temBoleto), [parcelas]);
  const porNumero = useMemo(() => new Map(parcelas.map(p => [p.numero, p])), [parcelas]);

  /* UI-ARRASTAR-ARQUIVO-01a — os arquivos chegam da `AreaDeArquivo` JÁ JULGADOS pelo dono do aceite (um veredito por
     arquivo); o que se faz com cada um é o de sempre. */
  const receber = useCallback((vereditos: readonly VereditoDoArquivo[]) => {
    const novos: ItemArquivo[] = vereditos.map(({ arquivo, motivo }) => {
      seqArquivo += 1;
      return {
        chave: `arq-${Date.now()}-${seqArquivo}`, arquivo, recusa: motivo,
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

  /* D1d — a prévia da caixa de cada arquivo que já tem parcela GRAVADA (lê o PDF uma vez; pergunta de novo se a parcela muda) */
  const alvosDaCaixa = useMemo(() => (naCaixa ? validos.flatMap(i => {
    const n = parcelaDe(i.chave);
    const lanc = n != null ? naCaixa.lancamentos.get(n) : undefined;
    return lanc ? [{ chave: i.chave, arquivo: i.arquivo, lancamentoId: lanc }] : [];
  }) : []), [naCaixa, validos, casamento]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!naCaixa) return;
    const api = naCaixa.api ?? parcelaApiDoBanco;
    for (const a of alvosDaCaixa) {
      if (caixa[a.chave]?.lancamentoId === a.lancamentoId) continue;
      setCaixa(prev => ({ ...prev, [a.chave]: { lancamentoId: a.lancamentoId, c: { estado: 'lendo' } } }));
      let lida = leituras.current.get(a.chave);
      if (!lida) { lida = leituraParaACaixa(a.arquivo, naCaixa.ler); leituras.current.set(a.chave, lida); }
      void lida
        .then(async (l): Promise<NaCaixa> => (l.ok === false
          ? { estado: 'so_documento', frase: l.frase }
          : { estado: 'previa', previa: await prever(api, naCaixa.clienteId, l.leitura, a.lancamentoId) }))
        .catch((): NaCaixa => ({ estado: 'previa', previa: { tipo: 'recusa', frase: 'Não consegui perguntar à caixa.' } }))
        .then(c => setCaixa(prev => (prev[a.chave]?.lancamentoId === a.lancamentoId ? { ...prev, [a.chave]: { lancamentoId: a.lancamentoId, c } } : prev)));
    }
  }, [naCaixa, alvosDaCaixa, caixa]);
  const caixaDe = (chave: string): NaCaixa | null => {
    const a = alvosDaCaixa.find(x => x.chave === chave);
    const e = caixa[chave];
    return a && e && e.lancamentoId === a.lancamentoId ? e.c : null;
  };
  const perguntandoACaixa = alvosDaCaixa.some(a => { const c = caixaDe(a.chave); return !c || c.estado === 'lendo'; });
  const comOutroBoleto = alvosDaCaixa.filter(a => { const c = caixaDe(a.chave); return c?.estado === 'previa' && c.previa.tipo === 'outro_boleto'; }).length;
  const podeAnexarComCaixa = podeAnexar && !perguntandoACaixa && !anexados;

  const confirmar = async () => {
    if (!podeAnexarComCaixa) return;
    setEnviando(true);
    setErro(null);
    try {
      const atribuidos = validos.flatMap(i => {
        const parcela = parcelaDe(i.chave);
        return parcela == null ? [] : [{ arquivo: i.arquivo, parcela, leitura: i.leitura }];
      });
      const falha = await onConfirmar(atribuidos);
      if (falha) { setErro(falha); return; }
      if (naCaixa) {
        /* os documentos já estão anexados (a cadeia de hoje): agora a caixa, só o que a prévia disse; falha não desfaz nada */
        const paraACaixa = alvosDaCaixa.flatMap(a => { const c = caixaDe(a.chave); return c?.estado === 'previa' ? [{ arquivo: a.arquivo, lancamentoId: a.lancamentoId, previa: c.previa }] : []; });
        const falhas = await gravarNaCaixa(naCaixa.api ?? parcelaApiDoBanco, naCaixa.clienteId, paraACaixa);
        if (falhas.length) { setAnexados(true); setErro(`Os documentos foram anexados. ${falhas.join(' · ')}`); return; }
      }
      onFechar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !enviando) onFechar(); }}>
      <DialogContent className={`${naCaixa ? 'max-w-[920px]' : 'max-w-[820px]'} p-0 gap-0 overflow-hidden`}>
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
          <AreaDeArquivo modo="lote" regra={REGRA_DOS_BOLETOS} testId="soltar-boletos" inputTestId="input-boletos" className="h-10"
            convite="Clique ou arraste os boletos"
            rotuloDoBotao="Escolher arquivos" onArquivos={(_arquivos, vereditos) => receber(vereditos)} />

          {itens.length > 0 && (
            <div className="max-h-[320px] overflow-auto rounded border border-[#E0E2E6]">
              <table className="w-full table-fixed border-separate border-spacing-0 tabular-nums">
                <colgroup>
                  {/* D1d — com "Na caixa", o "Vai para" precisa de 172 ("Parcela 1/6 · 10/12/26" + a seta, medido no gate); o Arquivo cede */}
                  <col style={{ width: naCaixa ? 168 : 250 }} /><col style={{ width: naCaixa ? 172 : 150 }} /><col style={{ width: 110 }} />
                  <col style={{ width: naCaixa ? 110 : 130 }} /><col style={{ width: 100 }} />
                  {naCaixa && <col style={{ width: 190 }} />}<col style={{ width: 30 }} />
                </colgroup>
                <thead>
                  <tr>{['Arquivo', 'Vai para', 'Casou por', 'Vencimento', 'Valor R$', ...(naCaixa ? ['Na caixa'] : []), ''].map((h, k) => <th key={k} className={TH}>{h}</th>)}</tr>
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
                              <SelectTrigger className={`h-[16px] px-1 text-[10px] [&>span]:leading-[14px] ${parc == null ? 'border-amber-500 text-amber-800' : ''}`}>
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
                        {naCaixa && <CelulaNaCaixa c={i.recusa ? null : caixaDe(i.chave)} semParcelaGravada={!i.recusa && parc != null && !naCaixa.lancamentos.has(parc)} />}
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
            {!erro && semParcela.length === 0 && repetidas.length === 0 && fraseDoOutroBoleto(comOutroBoleto) && (
              <span className="text-amber-800" data-testid="aviso-outro-boleto">{fraseDoOutroBoleto(comOutroBoleto)}</span>
            )}
          </span>
          {!anexados && <Button type="button" variant="ghost" className="h-[22px] px-[9px] text-[10px]" onClick={onFechar} disabled={enviando}>Cancelar</Button>}
          {anexados ? (
            <Button type="button" className="h-[22px] px-[9px] text-[10px] font-semibold" onClick={onFechar} data-testid="fechar-anexados">Fechar</Button>
          ) : (
            <Button type="button" className="h-[22px] px-[9px] text-[10px] font-semibold" disabled={!podeAnexarComCaixa} onClick={confirmar}
              data-testid="anexar-boletos">
              {enviando ? 'Anexando…' : `Anexar ${validos.length} ${validos.length === 1 ? 'boleto' : 'boletos'}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** D1d — a célula "Na caixa": o selo (nunca corta) e a frase numa linha com "…", inteira no `title`. */
function CelulaNaCaixa({ c, semParcelaGravada }: { c: NaCaixa | null; semParcelaGravada: boolean }) {
  if (!c) {
    return <td className={`${TD} text-center text-muted-foreground`} data-testid="na-caixa" title={semParcelaGravada ? 'parcela ainda não gravada: só o documento' : undefined}>—</td>;
  }
  const s = seloNaCaixa(c);
  return (
    <td className={`${TD} overflow-hidden text-ellipsis whitespace-nowrap`} title={`${s.selo} ${s.frase}`} data-testid="na-caixa">
      <span className={`mr-1 inline-block rounded-[3px] px-1 text-[9.5px] font-semibold leading-[14px] ${COR_DO_SELO[s.cor]}`} data-testid="selo-na-caixa">{s.selo}</span>
      {' '}<span className="text-[9.5px] text-muted-foreground">{s.frase}</span>
    </td>
  );
}
