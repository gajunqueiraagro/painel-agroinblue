/**
 * "NOVO A PARTIR DE XML" — a lista das notas lidas (FIN-NFE-XML-01d, tela A do mock).
 *
 * O operador solta um ou varios XML de NF-e; cada arquivo vira UMA linha. "Abrir lançamento" entrega a nota ao MESMO
 * `LancamentoV2Dialog` de sempre, ja' preenchido (`prefillDaNota`). NADA E' GRAVADO NESTA TELA.
 *
 * ⚠ QUEM LE O ARQUIVO E' `lerNFe`, E SO' ELE; quem decide o que o lancamento propoe e' `proporLancamento`; quem acha o
 *   fornecedor e' `resolverEmitente`. Aqui so' se orquestra e se desenha.
 * ⚠ O PADRAO DA TABELA E' O A31: cabecalho navy 9,5px, linha de 18px a 10px, uma linha por nota; numero, valor e data nunca
 *   cortam, texto longo corta com o inteiro no `title`.
 */
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { lerNFe } from '@/lib/financeiro/nfe/lerNFe';
import type { AvisoNFe, NotaLida } from '@/lib/financeiro/nfe/tipos';
import { proporLancamento, type FazendaComIE, type PropostaDeLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente, type FornecedorParaResolver, type ResolucaoEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { dataCurta, diaMes, documentoFormatado, numeroDaNota, reais } from '@/lib/financeiro/nfe/formatos';
import {
  fornecedorPeloNome, iePorFazenda, notaJaRegistrada, ultimaClassificacaoDoFornecedor, type OcorrenciaDaNota,
} from '@/lib/financeiro/nfeConsultas';
import { arquivoXmlDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';

export interface LinhaDeNota {
  id: string;
  arquivoNome: string;
  /** Preenchido quando a nota foi lida E pode virar lancamento. */
  doXml: DoXml | null;
  nota: NotaLida | null;
  avisos: AvisoNFe[];
  fazenda: FazendaComIE | null;
  /** A frase da recusa (do leitor, ou "Nota de venda…"); `null` = nota aceita. */
  recusa: string | null;
  lancada: boolean;
}

/** "2 × 8.119,00 · 05/11 e 05/12" | "sem duplicatas" | "3 · fora do padrão" | "1 × 16.238,00 · 30/10". */
export function resumoDasDuplicatas(p: PropostaDeLancamento): string {
  const d = p.duplicatas;
  if (d.length === 0) return 'sem duplicatas';
  if (p.parcelamento.tipo === 'fora_do_padrao') return `${d.length} · fora do padrão`;
  const datas = d.length <= 2 ? d.map((x) => diaMes(x.vencimento)).join(' e ') : `${diaMes(d[0].vencimento)} a ${diaMes(d[d.length - 1].vencimento)}`;
  return `${d.length} × ${reais(d[0].valorCent)} · ${datas}`;
}

export type SituacaoDaNota = 'recusada' | 'lancada' | 'ja_registrada' | 'sem_protocolo' | 'nova';
export function situacaoDaNota(l: LinhaDeNota): SituacaoDaNota {
  if (l.recusa) return 'recusada';
  if (l.lancada) return 'lancada';
  if ((l.doXml?.ocorrencias.length ?? 0) > 0) return 'ja_registrada';
  if (l.avisos.includes('sem_protocolo')) return 'sem_protocolo';
  return 'nova';
}
const TEXTO_DA_SITUACAO: Record<Exclude<SituacaoDaNota, 'recusada'>, { texto: string; cor: string }> = {
  nova: { texto: 'autorizada · nova', cor: 'text-[#15803d]' },
  ja_registrada: { texto: 'já registrada', cor: 'text-amber-700' },
  sem_protocolo: { texto: 'sem protocolo', cor: 'text-amber-700' },
  lancada: { texto: 'lançada', cor: 'text-primary' },
};

const TH = 'h-[18px] px-[7px] text-[9.5px] font-medium leading-none text-primary-foreground whitespace-nowrap';
const TD = 'h-[18px] px-[7px] text-[10px] leading-none whitespace-nowrap overflow-hidden text-ellipsis';
const DIVISOR = 'border-l border-border/60';
/** A celula do botao: sem reticencia (botao nao e' texto que se corta). */
const TD_ACAO = 'h-[18px] px-[7px] text-center whitespace-nowrap';
let seq = 0;
/* UI-ARRASTAR-ARQUIVO-01a — em LOTE: a área entrega TODOS os arquivos e quem julga cada um continua sendo o LEITOR (`lerNFe`),
   com a frase dele na linha — CT-e, evento, PDF, grande demais (o teto de 2 MB mora no leitor, não aqui). */
const REGRA_DOS_XML: RegraDeAceite = { tipos: ['xml'], varios: true };

export function NovoDeXmlDialog({ open, onClose, clienteId, fazendas, fornecedores, onAbrirLancamento, lancadas }: {
  open: boolean;
  onClose: () => void;
  clienteId: string | null;
  fazendas: ReadonlyArray<{ id: string; nome: string }>;
  fornecedores: readonly FornecedorParaResolver[];
  /** Abre o "Novo lançamento" com a nota. Quem abre devolve a nota a esta lista pelo `id` da linha quando ela for lancada. */
  onAbrirLancamento: (doXml: DoXml, linhaId: string) => void;
  /** Os ids das linhas ja' lancadas nesta sessao do modal. */
  lancadas: ReadonlySet<string>;
}) {
  const [linhas, setLinhas] = useState<LinhaDeNota[]>([]);
  const [lendo, setLendo] = useState(false);

  const lerArquivos = useCallback(async (arquivos: File[]) => {
    if (!clienteId || arquivos.length === 0) return;
    setLendo(true);
    try {
      const ies = await iePorFazenda(clienteId);
      const fazendasComIE: FazendaComIE[] = fazendas.map((f) => ({ id: f.id, nome: f.nome, ie: ies[f.id] ?? null }));
      const novas: LinhaDeNota[] = [];
      for (const arquivo of arquivos) {
        seq += 1;
        const base = { id: `nota-${Date.now()}-${seq}`, arquivoNome: arquivo.name, doXml: null, nota: null, avisos: [], fazenda: null, lancada: false };
        const bytes = await arquivo.arrayBuffer();
        const lido = lerNFe(bytes);
        if (lido.ok === false) { novas.push({ ...base, recusa: lido.frase }); continue; }
        const { nota, avisos } = lido;
        /* O fornecedor: pelo documento; so' vai ao banco pelo nome quando o documento nao achou ninguem. */
        let resolucao: ResolucaoEmitente = resolverEmitente(nota.emitente, fornecedores, null);
        if (!resolucao.achadoPor) resolucao = resolverEmitente(nota.emitente, fornecedores, await fornecedorPeloNome(clienteId, nota.emitente.nome));
        const [ocorrencias, ultima] = await Promise.all([
          notaJaRegistrada(clienteId, nota.chave),
          resolucao.propostoId ? ultimaClassificacaoDoFornecedor(clienteId, resolucao.propostoId) : Promise.resolve(null),
        ]);
        const proposta = proporLancamento({ nota, avisosDoLeitor: avisos, fazendas: fazendasComIE, emitente: resolucao, favorecidoId: resolucao.propostoId, ultima });
        if (proposta.ok === false) { novas.push({ ...base, nota, avisos, recusa: proposta.frase }); continue; }
        novas.push({
          ...base, nota, avisos, recusa: null,
          fazenda: fazendasComIE.find((f) => f.id === proposta.proposta.fazendaId) ?? null,
          doXml: {
            proposta: proposta.proposta, emitenteNome: nota.emitente.nome, emitenteDocumento: nota.emitente.documento, resolucao,
            ocorrencias, arquivo: arquivoXmlDaNota(bytes, arquivo.name),
          },
        });
      }
      /* A mesma nota solta duas vezes entra uma so' (pela chave). */
      setLinhas((antes) => {
        const chaves = new Set(antes.map((l) => l.nota?.chave).filter(Boolean));
        const saida = [...antes];
        for (const n of novas) {
          if (n.nota && !n.recusa && chaves.has(n.nota.chave)) continue;
          if (n.nota) chaves.add(n.nota.chave);
          saida.push(n);
        }
        return saida;
      });
    } finally {
      setLendo(false);
    }
  }, [clienteId, fazendas, fornecedores]);

  const fechar = () => { setLinhas([]); onClose(); };
  const lidas = linhas.filter((l) => !l.recusa);
  const recusadas = linhas.length - lidas.length;
  const somaCent = lidas.reduce((s, l) => s + (l.nota?.totais.notaCent ?? 0), 0);
  const abrirRegistrada = (o: OcorrenciaDaNota) => {
    const destino = o.origem === 'lancamento' && o.lancamentoId ? `/?flancId=${encodeURIComponent(o.lancamentoId)}`
      : o.operacaoId ? `/?oc_id=${encodeURIComponent(o.operacaoId)}` : null;
    if (destino) window.open(destino, '_blank', 'noopener');
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-[1080px] p-0 gap-0 overflow-hidden" data-testid="novo-de-xml">
        <div className="flex h-9 items-center bg-primary px-4 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Novo a partir de XML</DialogTitle>
          <DialogDescription className="sr-only">Solte os XML das notas fiscais para abrir o lançamento já preenchido.</DialogDescription>
        </div>

        <div className="space-y-2 px-4 py-3">
          <AreaDeArquivo modo="lote" regra={REGRA_DOS_XML} testId="xml-area-de-soltar" inputTestId="xml-input" className="h-12"
            convite="Clique ou arraste os XML das notas" detalhe="NF-e (modelo 55) · um arquivo por nota · vários de uma vez"
            rotuloDoBotao={lendo ? 'Lendo…' : 'Escolher arquivos'}
            desabilitado={!clienteId} motivoDesabilitado="Selecione um cliente para ler as notas."
            onArquivos={(arquivos) => { void lerArquivos(arquivos); }} />

          <div className="max-h-[52vh] overflow-y-auto rounded border">
            <table className="w-full table-fixed border-collapse" data-testid="xml-tabela">
              <colgroup>
                {/* Medido a 1.135 (tabela de 1.044): numero, data, CNPJ, valor e duplicatas nunca cortam; Emitente fica com o resto
                    e corta com o nome inteiro no `title`; Fazenda corta com `title`. */}
                <col style={{ width: 92 }} /><col style={{ width: 62 }} /><col /><col style={{ width: 124 }} />
                <col style={{ width: 118 }} /><col style={{ width: 88 }} /><col style={{ width: 160 }} />
                <col style={{ width: 104 }} /><col style={{ width: 110 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-primary">
                <tr>
                  <th className={`${TH} text-left`}>Nota</th>
                  <th className={`${TH} text-center`}>Emissão</th>
                  <th className={`${TH} text-left`}>Emitente</th>
                  <th className={`${TH} text-left`}>CNPJ</th>
                  <th className={`${TH} text-left border-l border-primary-foreground/30`}>Fazenda (pela IE)</th>
                  <th className={`${TH} text-right`}>Valor R$</th>
                  <th className={`${TH} text-left`}>Duplicatas</th>
                  <th className={`${TH} text-left border-l border-primary-foreground/30`}>Situação</th>
                  <th className={`${TH} text-center border-l border-primary-foreground/30`}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={9} className="h-[18px] px-[7px] text-[10px] text-muted-foreground">Nenhuma nota lida.</td></tr>
                )}
                {linhas.map((l) => {
                  const lancada = l.lancada || lancadas.has(l.id);
                  const linha: LinhaDeNota = lancada ? { ...l, lancada: true } : l;
                  const sit = situacaoDaNota(linha);
                  if (sit === 'recusada') {
                    const quem = l.nota ? `NF ${numeroDaNota(l.nota.numero)}` : l.arquivoNome;
                    return (
                      <tr key={l.id} className="border-t bg-destructive/5" data-testid="xml-linha" data-situacao="recusada">
                        <td className={`${TD} font-mono`} title={quem}>{quem}</td>
                        <td colSpan={7} className={`${TD} text-destructive`} title={l.recusa ?? ''} data-testid="xml-recusa">{l.recusa}</td>
                        <td className={`${TD_ACAO} ${DIVISOR}`}>
                          <Button type="button" size="sm" variant="outline" className="h-4 px-1.5 text-[9.5px]" disabled title={l.recusa ?? ''}>Abrir lançamento</Button>
                        </td>
                      </tr>
                    );
                  }
                  const n = l.nota;
                  const d = l.doXml;
                  if (!n || !d) return null;
                  const s = TEXTO_DA_SITUACAO[sit];
                  const onde = d.ocorrencias[0];
                  return (
                    <tr key={l.id} className="border-t" data-testid="xml-linha" data-situacao={sit}>
                      <td className={`${TD} font-mono`}>{numeroDaNota(n.numero)}</td>
                      <td className={`${TD} text-center tabular-nums`}>{dataCurta(n.emissao)}</td>
                      <td className={TD} title={n.emitente.nome}>{n.emitente.nome}</td>
                      <td className={`${TD} font-mono`}>{documentoFormatado(n.emitente.documento)}</td>
                      <td className={`${TD} ${DIVISOR} ${l.fazenda ? '' : 'text-muted-foreground'}`} title={l.fazenda?.nome ?? 'Fazenda não identificada pela inscrição estadual.'}>{l.fazenda?.nome ?? '—'}</td>
                      <td className={`${TD} text-right font-mono tabular-nums`}>{reais(n.totais.notaCent)}</td>
                      <td className={TD} title={resumoDasDuplicatas(d.proposta)}>{resumoDasDuplicatas(d.proposta)}</td>
                      <td className={`${TD} ${DIVISOR} ${s.cor}`} data-testid="xml-situacao"
                        title={sit === 'ja_registrada' && onde ? `Nota já registrada · ${onde.descricao ?? ''} · ${dataCurta(onde.data)}` : s.texto}>
                        {sit === 'ja_registrada' && onde
                          ? <button type="button" className="underline underline-offset-2" onClick={() => abrirRegistrada(onde)}>{s.texto}</button>
                          : s.texto}
                      </td>
                      <td className={`${TD_ACAO} ${DIVISOR}`}>
                        <Button type="button" size="sm" variant={lancada ? 'outline' : 'default'} className="h-4 px-1.5 text-[9.5px]"
                          data-testid="xml-abrir-lancamento" onClick={() => onAbrirLancamento(d, l.id)}>
                          {lancada ? 'abrir de novo' : 'Abrir lançamento'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex h-5 items-center justify-between text-[10px]" data-testid="xml-rodape">
            <span className="text-muted-foreground">
              {lidas.length} {lidas.length === 1 ? 'nota lida' : 'notas lidas'} · {recusadas} {recusadas === 1 ? 'recusada' : 'recusadas'}
            </span>
            <span className="font-mono font-semibold tabular-nums">{reais(somaCent)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Dados lidos do arquivo; a autenticidade da assinatura não é verificada.</p>
        </div>

        <div className="flex h-8 items-center justify-end gap-2 border-t bg-muted/30 px-4">
          <Button type="button" size="sm" variant="outline" className="h-[22px] px-[9px] text-[10px]" onClick={fechar}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
