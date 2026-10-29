/**
 * "NOVO A PARTIR DA NOTA" — a lista das notas lidas (FIN-NFE-XML-01d, tela A do mock; FIN-NOTA-PDF-01: XML OU PDF).
 *
 * FIN-NOTA-PDF-01 — o arquivo e' lido por `lerNota` (XML -> `lerNFe`, intocado; PDF -> o DANFE pela posicao), e a nota segue o
 * MESMO caminho (`resolverEmitente`, `proporLancamento`). A linha do XML abre o "Novo lançamento" como sempre; a do PDF abre o
 * `NotaFiscalDialog` (o PDF com o lido em amarelo, criar as N parcelas). Um PDF so', lido, abre direto.
 *
 * O operador solta um ou varios XML de NF-e; cada arquivo vira UMA linha. "Abrir lançamento" entrega a nota ao MESMO
 * `LancamentoV2Dialog` de sempre, ja' preenchido (`prefillDaNota`). NADA E' GRAVADO NESTA TELA.
 *
 * ⚠ QUEM LE O ARQUIVO E' `lerNota` (no XML, `lerNFe`), E SO' ELE; quem decide o que o lancamento propoe e' `proporLancamento`; quem acha o
 *   fornecedor e' `resolverEmitente`. Aqui so' se orquestra e se desenha.
 * ⚠ O PADRAO DA TABELA E' O A31: cabecalho navy 9,5px, linha de 18px a 10px, uma linha por nota; numero, valor e data nunca
 *   cortam, texto longo corta com o inteiro no `title`.
 */
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import type { RegraDeAceite } from '@/lib/arquivo/aceitarArquivo';
import { lerNota } from '@/lib/financeiro/nfe/lerNota';
import { itensDoPdf } from '@/lib/financeiro/nfe/lerNotaPdf';
import { lidoDaChave, notaDaChaveDigitada, podeDigitarAChave } from '@/lib/financeiro/nfe/chaveDigitada';
import type { AvisoNFe, NotaLida } from '@/lib/financeiro/nfe/tipos';
import { proporLancamento, type FazendaComIE, type PropostaDeLancamento } from '@/lib/financeiro/nfe/proporLancamento';
import { resolverEmitente, type FornecedorParaResolver, type ResolucaoEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { dataCurta, diaMes, documentoFormatado, numeroDaNota, reais } from '@/lib/financeiro/nfe/formatos';
import {
  aliasesDasFazendas, fornecedorPeloNome, iePorFazenda, notaJaLancada, notaJaRegistrada, ultimaClassificacaoDoFornecedor, type OcorrenciaDaNota,
} from '@/lib/financeiro/nfeConsultas';
import { arquivoXmlDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import { parcelasParaCasar } from '@/lib/financeiro/nfe/jaLancada';
import { dataInteira, type NotaLidaOk, type NotaParaLancar } from './NotaFiscalDialog';
import { ItensDasNotasGuardadasDialog } from './ItensDasNotasGuardadasDialog';

export interface LinhaDeNota {
  id: string;
  arquivoNome: string;
  /** P95 — o tamanho do arquivo: o mesmo arquivo (nome + tamanho) solto de novo nao entra outra vez */
  arquivoTamanho?: number;
  /** P95 — a linha recusada que deixa DIGITAR A CHAVE (nota sem chave, PDF sem texto): o arquivo e os bytes para seguir com ela */
  paraDigitar?: { arquivo: File; bytes: ArrayBuffer } | null;
  /** Preenchido quando a nota foi lida E pode virar lancamento. */
  doXml: DoXml | null;
  nota: NotaLida | null;
  avisos: AvisoNFe[];
  fazenda: FazendaComIE | null;
  /** A frase da recusa (do leitor, ou "Nota de venda…"); `null` = nota aceita. */
  recusa: string | null;
  lancada: boolean;
  /** FIN-NOTA-PDF-01 — a nota do PDF: o arquivo, os bytes e o lido (marcas, conferencia da chave) para o `NotaFiscalDialog`. */
  paraLancar?: NotaParaLancar | null;
  /** NOTA-JA-LANCADA-01 — quantos lancamentos do cliente ja' parecem ser esta nota (0 = nenhum). */
  jaLancados?: number;
  /** P146 — a frase do que NAO se conseguiu verificar (fornecedor pelo nome, nota registrada, nota ja' lancada): a linha nao abre ate'
   *  "Tentar de novo" responder; `null` = tudo verificado. `paraRefazer` guarda o lido para refazer as consultas. */
  naoVerificada?: string | null;
  paraRefazer?: { arquivo: File; bytes: ArrayBuffer; lido: NotaLidaOk } | null;
}

/** "2 × 8.119,00 · 05/11 e 05/12" | "sem duplicatas" | "3 · parcelas livres" | "1 × 16.238,00 · 30/10". */
export function resumoDasDuplicatas(p: PropostaDeLancamento): string {
  const d = p.duplicatas;
  if (d.length === 0) return 'sem duplicatas';
  if (p.parcelamento.tipo === 'livres') return `${d.length} · parcelas livres`;
  const datas = d.length <= 2 ? d.map((x) => diaMes(x.vencimento)).join(' e ') : `${diaMes(d[0].vencimento)} a ${diaMes(d[d.length - 1].vencimento)}`;
  return `${d.length} × ${reais(d[0].valorCent)} · ${datas}`;
}

export type SituacaoDaNota = 'recusada' | 'lancada' | 'nao_verificada' | 'ja_registrada' | 'ja_lancada' | 'sem_protocolo' | 'nova';
export function situacaoDaNota(l: LinhaDeNota): SituacaoDaNota {
  if (l.recusa) return 'recusada';
  if (l.lancada) return 'lancada';
  if (l.naoVerificada) return 'nao_verificada';
  /* P128a (decisao b) — so' a nota registrada numa OC barra; a ja' anexada a um lancamento e' "parece já lançada" (abre a previa) */
  if (l.doXml?.ocorrencias.some((o) => o.origem === 'oc')) return 'ja_registrada';
  if ((l.jaLancados ?? 0) > 0 || l.doXml?.ocorrencias.some((o) => o.origem === 'lancamento')) return 'ja_lancada';
  if (l.avisos.includes('sem_protocolo')) return 'sem_protocolo';
  return 'nova';
}
const TEXTO_DA_SITUACAO: Record<Exclude<SituacaoDaNota, 'recusada'>, { texto: string; cor: string }> = {
  nova: { texto: 'autorizada · nova', cor: 'text-[#15803d]' },
  ja_registrada: { texto: 'já registrada', cor: 'text-amber-700' },
  ja_lancada: { texto: 'parece já lançada', cor: 'text-amber-700' },
  nao_verificada: { texto: 'não verificada', cor: 'text-destructive' },
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
const REGRA_DOS_XML: RegraDeAceite = { tipos: ['xml', 'pdf'], varios: true };

/**
 * NOTA-FORNECEDOR-DUPLICA-01 — a nota reaberta da lista RELE^ o fornecedor com a lista de agora: o cadastro criado (ou completado)
 * depois da leitura passa a ser o proposto, e a previa nao oferece criar de novo (o segundo clique dava conflito de CNPJ).
 */
export function comFornecedoresDeAgora(d: DoXml, fornecedores: readonly FornecedorParaResolver[]): DoXml {
  const emitente = d.emitente ?? { documento: d.emitenteDocumento, nome: d.emitenteNome, fantasia: null, ie: null };
  const r = resolverEmitente(emitente, fornecedores, null);
  if (r.achadoPor !== 'documento' || r.propostoId === d.proposta.favorecidoId) return d;
  return { ...d, resolucao: r, proposta: { ...d.proposta, favorecidoId: r.propostoId, documento: { ...d.proposta.documento, emitenteId: r.propostoId } } };
}

/** FIN-NOTA-PDF-01 — o PDF da nota como documento: nome terminado em `.pdf` e tipo `application/pdf` explicitos (o conteudo decidiu). */
export function arquivoPdfDaNota(bytes: ArrayBuffer, nomeOriginal: string): File {
  const base = nomeOriginal.replace(/\.pdf$/i, '').trim() || 'nota';
  return new File([bytes], `${base}.pdf`, { type: 'application/pdf' });
}

/** P95 — "46.994.pdf já está na lista." */
export const fraseJaNaLista = (nome: string) => `${nome} já está na lista.`;
/** P95 — o MESMO arquivo (nome e tamanho) ou a MESMA nota (a chave, de uma linha aceita) ja' esta' na lista: a segunda vez nao entra. */
export function jaEstaNaLista(linhas: readonly LinhaDeNota[], arquivo: { name: string; size: number }, chave?: string | null): boolean {
  return linhas.some((l) => (l.arquivoNome === arquivo.name && l.arquivoTamanho === arquivo.size) || (!!chave && !l.recusa && l.nota?.chave === chave));
}

/* A nota LIDA (do arquivo, ou da chave digitada — P95) vira a linha pelo MESMO caminho: o fornecedor, a proposta, "ja' registrada",
   "parece ja' lancada".
   P128a — exportada (a porta 2, o Documentos do Editar lancamento, monta a MESMA previa pelo MESMO caminho). */
export async function fazendasComIEDoCliente(cli: string, fazendas: ReadonlyArray<{ id: string; nome: string }>): Promise<FazendaComIE[]> {
  const [ies, apelidos] = await Promise.all([iePorFazenda(cli), aliasesDasFazendas(cli)]);
  /* NOTA-FAZENDA-PELA-IE-01 — com os apelidos: sem a IE gravada, a fazenda pelo nome no endereco do destinatario */
  return fazendas.map((f) => ({ id: f.id, nome: f.nome, ie: ies[f.id] ?? null, aliases: apelidos[f.id] ?? null }));
}

/** P128a (porta 2) — o Documentos do Editar lancamento: o arquivo da NF vira a MESMA previa do "+ Da nota" (o mesmo leitor, as mesmas
 *  consultas, `montarLinhaDaNota`). Sempre abre a previa quando a nota foi lida e conferida; senao, a frase pronta do que impediu. */
export async function notaParaAPrevia(cli: string, arquivo: File, fornecedores: readonly FornecedorParaResolver[],
  fazendas: ReadonlyArray<{ id: string; nome: string }>): Promise<{ ok: true; nota: NotaParaLancar } | { ok: false; frase: string }> {
  const bytes = await arquivo.arrayBuffer();
  const lido = await lerNota(bytes);
  if (lido.ok === false) return { ok: false, frase: lido.frase };
  const base = { id: 'porta-2', arquivoNome: arquivo.name, arquivoTamanho: arquivo.size, doXml: null, nota: null, avisos: [], fazenda: null, lancada: false };
  const linha = await montarLinhaDaNota(cli, base, arquivo, bytes, lido, await fazendasComIEDoCliente(cli, fazendas), fornecedores);
  if (linha.recusa) return { ok: false, frase: linha.recusa };
  if (linha.naoVerificada) return { ok: false, frase: linha.naoVerificada };
  if (!linha.doXml) return { ok: false, frase: 'Não consegui ler esta nota.' };
  return { ok: true, nota: linha.paraLancar ?? { arquivo: linha.doXml.arquivo, bytes, lido, doXml: linha.doXml } };
}

export async function montarLinhaDaNota(cli: string, base: Omit<LinhaDeNota, 'recusa'>, arquivo: File, bytes: ArrayBuffer, lido: NotaLidaOk,
  fazendasComIE: FazendaComIE[], fornecedores: readonly FornecedorParaResolver[]): Promise<LinhaDeNota> {
  const { nota, avisos } = lido;
  /* O fornecedor: pelo documento; so' vai ao banco pelo nome quando o documento nao achou ninguem (e ha' nome: a chave digitada nao traz). */
  /* P146 — a consulta que FALHA entra em `falhas` (nunca vira "nao achei"): a linha fica "não verificada" e nao abre */
  const falhas: string[] = [];
  let resolucao: ResolucaoEmitente = resolverEmitente(nota.emitente, fornecedores, null);
  if (!resolucao.achadoPor && nota.emitente.nome) {
    const pelo = await fornecedorPeloNome(cli, nota.emitente.nome);
    if (pelo.ok === false) falhas.push(`o fornecedor pelo nome (${pelo.motivo})`);
    resolucao = resolverEmitente(nota.emitente, fornecedores, pelo.ok === false ? null : pelo.valor);
  }
  const [registrada, ultima] = await Promise.all([
    notaJaRegistrada(cli, nota.chave),
    resolucao.propostoId ? ultimaClassificacaoDoFornecedor(cli, resolucao.propostoId) : Promise.resolve(null),
  ]);
  if (registrada.ok === false) falhas.push(`se a nota já está registrada (${registrada.motivo})`);
  const ocorrencias = registrada.ok === false ? [] : registrada.valor;
  const proposta = proporLancamento({ nota, avisosDoLeitor: avisos, fazendas: fazendasComIE, emitente: resolucao, favorecidoId: resolucao.propostoId, ultima });
  if (proposta.ok === false) return { ...base, nota, avisos, recusa: proposta.frase };
  const ehPdf = lido.origem === 'pdf';
  const doXml: DoXml = {
    proposta: proposta.proposta, emitenteNome: nota.emitente.nome, emitenteDocumento: nota.emitente.documento, emitente: nota.emitente, resolucao,
    ocorrencias, arquivo: ehPdf ? arquivoPdfDaNota(bytes, arquivo.name) : arquivoXmlDaNota(bytes, arquivo.name),
  };
  /* NOTA-JA-LANCADA-01 — a nota ja' lancada (qualquer status, cadastro parecido): a linha avisa e abre a previa da nota
     (que oferece anexar), nunca o Novo lancamento direto. P95 — pela chave, sem valor nem data: so' o numero, o CNPJ e a chave. */
  const pr = proposta.proposta;
  let jaLancados = 0;
  const naOc = ocorrencias.some((o) => o.origem === 'oc');
  const noLancamento = ocorrencias.some((o) => o.origem === 'lancamento');
  if (registrada.ok === true && !naOc) {
    const ja = await notaJaLancada(cli, {
      parcelas: lido.pelaChave ? [] : parcelasParaCasar(pr.duplicatas, nota.totais.notaCent, pr.duplicatas[0]?.vencimento ?? nota.emissao),
      numero: pr.numeroDocumento || nota.numero, chave: nota.chave, emitenteDocumento: nota.emitente.documento,
      nomes: [nota.emitente.nome, nota.emitente.fantasia],
    });
    if (ja.ok === false) falhas.push(`se a nota já foi lançada (${ja.motivo})`); else jaLancados = ja.valor.length;
  }
  const naoVerificada = falhas.length ? `Não consegui verificar ${falhas.join('; ')}. Nada será lançado até verificar.` : null;
  return {
    ...base, nota, avisos, recusa: null,
    fazenda: fazendasComIE.find((f) => f.id === proposta.proposta.fazendaId) ?? null,
    doXml, jaLancados, naoVerificada, paraRefazer: naoVerificada ? { arquivo, bytes, lido } : null,
    paraLancar: naoVerificada ? null : ehPdf || jaLancados > 0 || noLancamento ? { arquivo: doXml.arquivo, bytes, lido, doXml } : null,
  };
}

export function NovoDeXmlDialog({ open, onClose, clienteId, fazendas, fornecedores, onAbrirLancamento, onAbrirNota, lancadas, linhasIniciais, avisoInicial }: {
  open: boolean;
  onClose: () => void;
  clienteId: string | null;
  fazendas: ReadonlyArray<{ id: string; nome: string }>;
  fornecedores: readonly FornecedorParaResolver[];
  /** Abre o "Novo lançamento" com a nota. Quem abre devolve a nota a esta lista pelo `id` da linha quando ela for lancada. */
  onAbrirLancamento: (doXml: DoXml, linhaId: string) => void;
  /** FIN-NOTA-PDF-01 — abre a nota do PDF no `NotaFiscalDialog`. */
  onAbrirNota?: (nota: NotaParaLancar, linhaId: string) => void;
  /** Os ids das linhas ja' lancadas nesta sessao do modal. */
  lancadas: ReadonlySet<string>;
  /** So' para a bancada da tela: a lista ja' montada (o pior caso de texto) e o aviso do arquivo repetido. */
  linhasIniciais?: LinhaDeNota[];
  avisoInicial?: string | null;
}) {
  const [linhas, setLinhas] = useState<LinhaDeNota[]>(() => linhasIniciais ?? []);
  const [lendo, setLendo] = useState(false);
  /* P101 — abaixo de 1000px a tabela passava da janela (155px a 750): sem a coluna CNPJ (vai no `title` do Emitente) e colunas mais estreitas */
  const estreito = useLarguraDaJanela() < 1000;
  const [guardadas, setGuardadas] = useState(false);
  /* P95 — a lista de agora (a leitura em lote compara com ela), o aviso do arquivo repetido e a chave digitada de cada linha recusada */
  const linhasRef = useRef(linhas);
  linhasRef.current = linhas;
  const [aviso, setAviso] = useState<string | null>(() => avisoInicial ?? null);
  const [chaves, setChaves] = useState<Record<string, string>>({});
  const [errosDaChave, setErrosDaChave] = useState<Record<string, string>>({});

  const fazendasDoCliente = useCallback((cli: string) => fazendasComIEDoCliente(cli, fazendas), [fazendas]);

  const montarLinha = useCallback((cli: string, base: Omit<LinhaDeNota, 'recusa'>, arquivo: File, bytes: ArrayBuffer, lido: NotaLidaOk,
    fazendasComIE: FazendaComIE[]) => montarLinhaDaNota(cli, base, arquivo, bytes, lido, fazendasComIE, fornecedores), [fornecedores]);

  const lerArquivos = useCallback(async (arquivos: File[]) => {
    if (!clienteId || arquivos.length === 0) return;
    setLendo(true);
    try {
      const fazendasComIE = await fazendasDoCliente(clienteId);
      const novas: LinhaDeNota[] = [];
      const repetidos: string[] = [];
      for (const arquivo of arquivos) {
        /* P95 — o MESMO arquivo solto de novo (nome e tamanho) nao entra outra vez */
        if (jaEstaNaLista([...linhasRef.current, ...novas], arquivo)) { repetidos.push(arquivo.name); continue; }
        seq += 1;
        const base = { id: `nota-${Date.now()}-${seq}`, arquivoNome: arquivo.name, arquivoTamanho: arquivo.size, doXml: null, nota: null, avisos: [], fazenda: null, lancada: false };
        const bytes = await arquivo.arrayBuffer();
        const lido = await lerNota(bytes);
        if (lido.ok === false) {
          novas.push({ ...base, recusa: lido.frase, paraDigitar: lido.origem === 'pdf' && podeDigitarAChave(lido.frase) ? { arquivo, bytes } : null });
          continue;
        }
        /* A mesma nota (a chave) ja' na lista: a segunda nao entra */
        if (jaEstaNaLista([...linhasRef.current, ...novas], { name: '', size: -1 }, lido.nota.chave)) { repetidos.push(arquivo.name); continue; }
        novas.push(await montarLinha(clienteId, base, arquivo, bytes, lido, fazendasComIE));
      }
      setAviso(repetidos.length ? repetidos.map(fraseJaNaLista).join(' ') : null);
      /* FIN-NOTA-PDF-01 — um PDF so', lido e aceito: abre direto a nota (o mock), sem passar pela lista. */
      const unica = arquivos.length === 1 && novas.length === 1 ? novas[0] : null;
      if (unica?.paraLancar && !unica.recusa && onAbrirNota) onAbrirNota(unica.paraLancar, unica.id);
      /* A mesma nota solta duas vezes entra uma so' (pela chave). */
      setLinhas((antes) => {
        const chavesDaLista = new Set(antes.map((l) => l.nota?.chave).filter(Boolean));
        const saida = [...antes];
        for (const n of novas) {
          if (n.nota && !n.recusa && chavesDaLista.has(n.nota.chave)) continue;
          if (n.nota) chavesDaLista.add(n.nota.chave);
          saida.push(n);
        }
        return saida;
      });
    } finally {
      setLendo(false);
    }
  }, [clienteId, onAbrirNota, fazendasDoCliente, montarLinha]);

  /* P146 — "Tentar de novo" na linha não verificada: refaz as consultas com o MESMO lido (nada se relê do arquivo) e troca a linha */
  const refazer = useCallback(async (l: LinhaDeNota) => {
    if (!clienteId || !l.paraRefazer) return;
    setLendo(true);
    try {
      const fazendasComIE = await fazendasDoCliente(clienteId);
      const base = { id: l.id, arquivoNome: l.arquivoNome, arquivoTamanho: l.arquivoTamanho, doXml: null, nota: null, avisos: [], fazenda: null, lancada: false };
      const nova = await montarLinha(clienteId, base, l.paraRefazer.arquivo, l.paraRefazer.bytes, l.paraRefazer.lido, fazendasComIE);
      setLinhas((antes) => antes.map((x) => (x.id === l.id ? nova : x)));
    } finally {
      setLendo(false);
    }
  }, [clienteId, fazendasDoCliente, montarLinha]);

  /* P95 — DIGITAR A CHAVE na linha recusada (nota sem chave, PDF foto/escaneado): conferida (DV), a linha segue como nota lida — o resto
     em branco, para o operador preencher na previa. O PDF (mesmo escaneado) segue anexado como a NF. */
  const usarChave = useCallback(async (l: LinhaDeNota) => {
    if (!clienteId || !l.paraDigitar) return;
    const r = notaDaChaveDigitada(chaves[l.id] ?? '');
    if (r.ok === false) { setErrosDaChave((e) => ({ ...e, [l.id]: r.frase })); return; }
    if (jaEstaNaLista(linhasRef.current.filter((x) => x.id !== l.id), { name: '', size: -1 }, r.nota.chave)) {
      setErrosDaChave((e) => ({ ...e, [l.id]: fraseJaNaLista(l.arquivoNome) })); return;
    }
    setLendo(true);
    try {
      const { arquivo, bytes } = l.paraDigitar;
      const tamanhos = await itensDoPdf(bytes).then((x) => x.tamanhos, () => []);
      const base = { id: l.id, arquivoNome: l.arquivoNome, arquivoTamanho: l.arquivoTamanho, doXml: null, nota: null, avisos: [], fazenda: null, lancada: false };
      const nova = await montarLinha(clienteId, base, arquivo, bytes, lidoDaChave(r.nota, tamanhos), await fazendasDoCliente(clienteId));
      setLinhas((ls) => ls.map((x) => (x.id === l.id ? nova : x)));
      setErrosDaChave((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== l.id)));
    } finally {
      setLendo(false);
    }
  }, [clienteId, chaves, montarLinha, fazendasDoCliente]);

  const fechar = () => { setLinhas([]); setAviso(null); setChaves({}); setErrosDaChave({}); onClose(); };
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
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Novo a partir da nota</DialogTitle>
          <DialogDescription className="sr-only">Solte os XML ou PDF das notas fiscais para abrir o lançamento já preenchido.</DialogDescription>
        </div>

        <div className="space-y-2 px-4 py-3">
          <AreaDeArquivo modo="lote" regra={REGRA_DOS_XML} testId="xml-area-de-soltar" inputTestId="xml-input" className="h-12"
            convite="Clique ou arraste as notas (XML ou PDF)" detalhe="NF-e ou NFS-e · um arquivo por nota · vários de uma vez"
            rotuloDoBotao={lendo ? 'Lendo…' : 'Escolher arquivos'}
            desabilitado={!clienteId} motivoDesabilitado="Selecione um cliente para ler as notas."
            onArquivos={(arquivos) => { void lerArquivos(arquivos); }} />

          <div className="max-h-[52vh] overflow-y-auto rounded border">
            <table className="w-full table-fixed border-collapse" data-testid="xml-tabela">
              <colgroup>
                {/* Medido a 1.135 (tabela de 1.044): numero, data, CNPJ, valor e duplicatas nunca cortam; Emitente fica com o resto
                    e corta com o nome inteiro no `title`; Fazenda corta com `title`. */}
                {estreito ? (<>
                  <col style={{ width: 84 }} /><col style={{ width: 78 }} /><col />
                  <col style={{ width: 90 }} /><col style={{ width: 82 }} /><col style={{ width: 118 }} />
                  <col style={{ width: 92 }} /><col style={{ width: 104 }} />
                </>) : (<>
                <col style={{ width: 92 }} /><col style={{ width: 74 }} /><col /><col style={{ width: 124 }} />
                <col style={{ width: 118 }} /><col style={{ width: 88 }} /><col style={{ width: 160 }} />
                <col style={{ width: 104 }} /><col style={{ width: 110 }} />
                </>)}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-primary">
                <tr>
                  <th className={`${TH} text-left`}>Nota</th>
                  <th className={`${TH} text-center`}>Emissão</th>
                  <th className={`${TH} text-left`}>Emitente</th>
                  {!estreito && <th className={`${TH} text-left`}>CNPJ</th>}
                  <th className={`${TH} text-left border-l border-primary-foreground/30`}>Fazenda (pela IE)</th>
                  <th className={`${TH} text-right`}>Valor R$</th>
                  <th className={`${TH} text-left`}>Duplicatas</th>
                  <th className={`${TH} text-left border-l border-primary-foreground/30`}>Situação</th>
                  <th className={`${TH} text-center border-l border-primary-foreground/30`}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr><td colSpan={estreito ? 8 : 9} className="h-[18px] px-[7px] text-[10px] text-muted-foreground">Nenhuma nota lida.</td></tr>
                )}
                {linhas.map((l) => {
                  const lancada = l.lancada || lancadas.has(l.id);
                  const linha: LinhaDeNota = lancada ? { ...l, lancada: true } : l;
                  const sit = situacaoDaNota(linha);
                  if (sit === 'recusada') {
                    const quem = l.nota ? `NF ${numeroDaNota(l.nota.numero)}` : l.arquivoNome;
                    const frase = errosDaChave[l.id] ?? l.recusa ?? '';
                    return (
                      <tr key={l.id} className="border-t bg-destructive/5" data-testid="xml-linha" data-situacao="recusada">
                        <td className={`${TD} tabular-nums`} title={quem}>{quem}</td>
                        {l.paraDigitar ? (
                          /* P95 — DIGITAR A CHAVE: a frase (ou o erro da chave) no lugar dela e o campo de largura fixa a' direita (nada se desloca; a frase
                             `w-0` nao entra na largura do modal: trocar pelo erro nao o estreita) */
                          <td colSpan={estreito ? 6 : 7} className="h-[18px] px-[7px]" data-testid="xml-recusa-digitar">
                            <div className="flex h-full min-w-0 items-center gap-1.5">
                              <span className="w-0 min-w-0 flex-1 truncate text-[10px] leading-none text-destructive" title={frase} data-testid="xml-recusa">{frase}</span>
                              <Input value={chaves[l.id] ?? ''} placeholder="Digitar a chave (44 ou 50 dígitos)" aria-label="Digitar a chave (44 ou 50 dígitos)"
                                onChange={(e) => { const v = e.target.value; setChaves((c) => ({ ...c, [l.id]: v })); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void usarChave(l); } }}
                                className="h-4 w-[300px] flex-none px-1 text-[10px] tabular-nums" data-testid="xml-digitar-chave" />
                              <Button type="button" size="sm" variant="outline" className="h-4 w-[38px] flex-none px-1 text-[9.5px]" disabled={lendo}
                                onClick={() => { void usarChave(l); }} data-testid="xml-usar-chave">Usar</Button>
                            </div>
                          </td>
                        ) : (
                          <td colSpan={estreito ? 6 : 7} className={`${TD} text-destructive`} title={l.recusa ?? ''} data-testid="xml-recusa">{l.recusa}</td>
                        )}
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
                  const onde = d.ocorrencias.find((o) => o.origem === 'oc');
                  /* P95 — a nota da chave digitada: o emitente e' o do cadastro (a chave so' traz o CNPJ); emissao e valor sao do operador ("—") */
                  const pelaChave = l.paraLancar?.lido.pelaChave === true;
                  const emitenteNome = n.emitente.nome || fornecedores.find((f) => f.id === d.proposta.favorecidoId)?.nome || '—';
                  return (
                    <tr key={l.id} className="border-t" data-testid="xml-linha" data-situacao={sit}>
                      <td className={`${TD} tabular-nums`}>{numeroDaNota(n.numero)}</td>
                      <td className={`${TD} text-center tabular-nums`}>{pelaChave ? '—' : dataInteira(n.emissao)}</td>
                      <td className={TD} title={`${pelaChave ? `${emitenteNome} · pela chave digitada` : n.emitente.nome}${estreito ? ` · ${documentoFormatado(n.emitente.documento)}` : ''}`}>{emitenteNome}</td>
                      {!estreito && <td className={`${TD} tabular-nums`}>{documentoFormatado(n.emitente.documento)}</td>}
                      <td className={`${TD} ${DIVISOR} ${l.fazenda ? '' : 'text-muted-foreground'}`} title={l.fazenda?.nome ?? 'Fazenda não identificada pela inscrição estadual.'}>{l.fazenda?.nome ?? '—'}</td>
                      <td className={`${TD} text-right tabular-nums`}>{pelaChave ? '—' : reais(n.totais.notaCent)}</td>
                      <td className={TD} title={resumoDasDuplicatas(d.proposta)}>{resumoDasDuplicatas(d.proposta)}</td>
                      <td className={`${TD} ${DIVISOR} ${s.cor}`} data-testid="xml-situacao"
                        title={sit === 'nao_verificada' ? l.naoVerificada ?? s.texto
                          : sit === 'ja_registrada' && onde ? `Nota já registrada · ${onde.descricao ?? ''} · ${dataCurta(onde.data)}` : s.texto}>
                        {sit === 'ja_registrada' && onde
                          ? <button type="button" className="underline underline-offset-2" onClick={() => abrirRegistrada(onde)}>{s.texto}</button>
                          : s.texto}
                      </td>
                      <td className={`${TD_ACAO} ${DIVISOR}`}>
                        {sit === 'nao_verificada' ? (
                          /* P146 — sem verificar, a nota nao abre (nem a previa, nem o Novo lancamento): so' "Tentar de novo" */
                          <Button type="button" size="sm" variant="outline" className="h-4 px-1.5 text-[9.5px]" disabled={lendo}
                            title={l.naoVerificada ?? ''} data-testid="xml-tentar-de-novo" onClick={() => { void refazer(l); }}>
                            Tentar de novo
                          </Button>
                        ) : (
                        <Button type="button" size="sm" variant={lancada ? 'outline' : 'default'} className="h-4 px-1.5 text-[9.5px]"
                          data-testid="xml-abrir-lancamento" onClick={() => {
                            const atual = comFornecedoresDeAgora(d, fornecedores);
                            if (l.paraLancar && onAbrirNota) onAbrirNota({ ...l.paraLancar, doXml: comFornecedoresDeAgora(l.paraLancar.doXml, fornecedores) }, l.id);
                            else onAbrirLancamento(atual, l.id);
                          }}>
                          {lancada ? 'abrir de novo' : 'Abrir lançamento'}
                        </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex h-5 items-center justify-between gap-3 text-[10px]" data-testid="xml-rodape">
            <span className="flex-none text-muted-foreground">
              {lidas.length} {lidas.length === 1 ? 'nota lida' : 'notas lidas'} · {recusadas} {recusadas === 1 ? 'recusada' : 'recusadas'}
            </span>
            {/* P95 — o arquivo repetido: o aviso no meio, em lugar sempre presente (nada se desloca); `w-0` = so' o que sobra (o aviso
                comprido nao alarga o modal, rola no lugar) */}
            <span className="w-0 min-w-0 flex-1 uma-linha-que-rola text-center text-amber-800" title={aviso ?? ''} data-testid="xml-aviso">{aviso ?? ''}</span>
            <span className="flex-none font-semibold tabular-nums">{reais(somaCent)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Dados lidos do arquivo; a autenticidade da assinatura não é verificada.</p>
        </div>

        <div className="flex h-8 items-center justify-end gap-2 border-t bg-muted/30 px-4">
          <Button type="button" size="sm" variant="ghost" className="mr-auto h-[22px] px-[9px] text-[10px]" disabled={!clienteId}
            onClick={() => setGuardadas(true)} data-testid="xml-itens-guardadas">Itens das notas já guardadas</Button>
          <Button type="button" size="sm" variant="outline" className="h-[22px] px-[9px] text-[10px]" onClick={fechar}>Fechar</Button>
        </div>
      </DialogContent>
      {guardadas && clienteId && <ItensDasNotasGuardadasDialog clienteId={clienteId} onClose={() => setGuardadas(false)} />}
    </Dialog>
  );
}
