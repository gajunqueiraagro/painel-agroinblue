import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronsUpDown, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import type { FornecedorLido } from '@/lib/fornecedores/leitorDeFornecedores';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { motivoArquivoInvalido, REGRA_ARQUIVO_DA_OC } from '@/lib/oc/caminhoDocumento';
import { extrairDanfe } from '@/lib/oc/extrairDanfe';
import { extrairLinhasPdf } from '@/lib/oc/leitura/linhasDoPdf';
import { lerPdfDoAbate } from '@/lib/oc/leitura/layoutsAbate';
import { aplicarLeitura, fraseDaLeitura } from '@/lib/oc/leitura/aplicarLeitura';
import { candidatosPorNome, raizCnpj, soDigitosDoc, type CandidatoFornecedor } from '@/lib/oc/similaridadeFornecedor';
import { brl, formatCasas, parseMoeda } from '@/lib/calculos/numeroBR';
import { cn } from '@/lib/utils';
import type { DocumentosApi, EspecieDoc, LoteOpcao, NotaRepetida } from '@/hooks/useOperacaoDocumentos';
import {
  camposDaEspecie, ROTULO_SEGMENTO, arrobasDoPeso, retencoesDaNF, retencoesDoAcerto, mediaDoRomaneio, pctDoBruto,
  GRUPOS_DO_SELETOR_ABATE, gruposDoSeletor, TIPOS_DE_GUIA, TIPOS_DE_DECLARACAO,
  type CampoDef, type ChaveCampo, type TipoOperacaoOC,
} from '@/lib/oc/camposDaEspecie';
import {
  nfsProdutorDoTexto, payloadDoFormAbate, pendenciasDoFormAbate, textoDasNfsProdutor, valorDasNfsProdutor,
  lotesPadraoDaEspecie, loteSugeridoPelaQuantidade, totalDosIncentivos, FRASE_LOTE_SUGERIDO, DESCRICAO_INCENTIVO, cabDaGta,
  type FormAbate, type NfProdutor,
} from '@/lib/oc/formDocumentoAbate';
import { conferenciaAoVivo, type DocConferencia } from '@/lib/oc/conferirDocumentosAbate';
import { ESPECIE_LABEL, ehNotaFiscal, numeroDigitando, numeroEmRepouso } from './DocumentoFormOC';

/* OC-DOC-ESPECIE-ABATE-01 passo 2 — O FORMULARIO DE DOCUMENTO DO ABATE.
   ⚠ TAMANHO FIXO (regra do Gabriel): trocar a especie NUNCA muda a largura nem a altura do formulario. So' os campos DENTRO da
     area de 250px mudam; o seletor, a area de arquivo, a faixa de conferencia e o rodape ficam onde estao. Nada rola.
   ⚠ A TELA SO' DESENHA: os campos de cada especie sao de `camposDaEspecie`; o payload, as pendencias e o que se preserva sao de
     `formDocumentoAbate`. Os calculados (@, retencoes, liquido, media) sao so' exibicao — o valor que soma e' do banco.
   OC-DOC-VENDA-01: a VENDA usa ESTE formulario (um dono so', pelo tipo gravado no form): a saida da fazenda igual ao abate e os
   documentos da operacao no lugar do frigorifico. A compra (e o legado da venda: NF principal, complementar, recibo) segue com
   `DocumentoFormOC`. */

/** Alturas da regua (px). A area de campos e' a da NF, a especie com mais campos. */
export const ALTURA_AREA_CAMPOS = 250;
export const ALTURA_LINHA_ESPECIE = 26;
export const ALTURA_FAIXA = 22;
export const ALTURA_CONTROLE = 22;

const CTL = 'h-[22px] px-1.5 text-[11px]';
const NUM = 'text-right tabular-nums';
const COL: Record<CampoDef['colunas'], string> = { 1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 5: 'col-span-5' };

/* Frase da OC na faixa de conferencia (a conferencia entre documentos e' o passo 3). */
const FRASE_DA_ESPECIE: Partial<Record<EspecieDoc, string>> = {
  nf_principal: 'NF · é o valor da operação (soma)',
  nf_complementar: 'NF complementar · soma no valor da operação',
  npr: 'NPR · confere com a NF · não soma no valor',
  acerto: 'Acerto · confere com a NF · não soma no valor',
  romaneio: 'Romaneio · confere cab e peso com a NF · não soma no valor',
  /* 7f — saida da fazenda: nunca soma */
  nf_produtor: 'NF produtor · nota de saída da fazenda · não soma no valor',
  gta: 'GTA · confere as cabeças com a OC · não soma no valor',
  guia: 'Guia · informativo · não soma no valor',
  declaracao: 'Declaração · informativo · não soma no valor',
};
const FRASE_OUTRO = 'Outro · informativo · não soma';
/* OC-DOC-VENDA-01 — as frases da venda: a NF do produtor e' a nota da venda (soma); a operacao e' informativa; o "outro" da venda
   SOMA (regra do banco desde antes: so' GTA, guia, declaracao e os da operacao ficam fora). */
const FRASE_DA_ESPECIE_VENDA: Partial<Record<EspecieDoc, string>> = {
  nf_produtor: 'NF produtor · é a nota da venda · soma no valor da operação',
  gta: FRASE_DA_ESPECIE.gta, guia: FRASE_DA_ESPECIE.guia, declaracao: FRASE_DA_ESPECIE.declaracao,
  contrato: 'Contrato / pedido de venda · informativo · não soma no valor',
  nf_entrada: 'NF de entrada do comprador · informativo · não soma no valor',
  comprovante: 'Comprovante · informativo · não soma no valor',
  outro: 'Outro · soma no valor da venda',
};
/** O endereco que abre a OC na aba Documentos — a convencao de `abrirOperacao` (AbaDocumentosLancamento): o parametro do tipo,
 *  `oc_id` e `oc_aba`. Abre noutra aba, para nao perder o formulario em curso. */
export function enderecoDaOC(n: Pick<NotaRepetida, 'operacaoId' | 'tipoOperacao'>, busca = typeof window !== 'undefined' ? window.location.search : ''): string {
  const p = new URLSearchParams(busca);
  for (const k of ['oc_compra', 'oc_venda', 'oc_abate']) p.delete(k);
  p.set(n.tipoOperacao === 'venda' ? 'oc_venda' : n.tipoOperacao === 'abate' ? 'oc_abate' : 'oc_compra', '1');
  p.set('oc_id', n.operacaoId);
  p.set('oc_aba', 'documentos');
  return `${typeof window !== 'undefined' ? window.location.pathname : ''}?${p.toString()}`;
}
export const FRASE_ESPECIE_FIXA = 'espécie não muda depois de registrado';

/* A frase da leitura pelo DANFE: na NF do frigorifico, que o layout nao foi reconhecido; na NF de entrada do comprador, nada. */
const f2Rotulo = (e: EspecieDoc) => (e === 'nf_entrada' ? '' : ' (frigorífico não reconhecido)');

/** Campo de numero sem "R$" (cab, kg): texto livre focado; no blur, o numero em pt-BR. */
function CampoNumero({ valor, onChange, casas, className, invalido }: {
  valor: number | null; onChange: (n: number | null) => void; casas: number; className?: string; invalido?: boolean;
}) {
  const fmt = (n: number | null) => (n == null ? '' : formatCasas(n, casas));
  const [texto, setTexto] = useState(fmt(valor));
  const [editando, setEditando] = useState(false);
  const mostrado = editando ? texto : fmt(valor);
  return (
    <Input value={mostrado} inputMode="decimal" aria-invalid={invalido || undefined}
      onFocus={() => { setTexto(fmt(valor)); setEditando(true); }}
      onChange={e => setTexto(e.target.value)}
      onBlur={() => { setEditando(false); const n = parseMoeda(texto); onChange(n == null ? null : casas === 0 ? Math.round(n) : n); }}
      className={cn(CTL, NUM, className)} />
  );
}

/** Lote: UM seletor de 22px com escolha multipla; a lista abre por cima, sem empurrar a grade. */
function SeletorLotes({ lotes, valor, onChange, invalido }: {
  lotes: LoteOpcao[]; valor: string[]; onChange: (ids: string[]) => void; invalido?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const escolhidos = lotes.filter(l => valor.includes(l.loteId));
  /* passo 7e: com TODOS os lotes da OC (2+) escolhidos, "Todos os lotes · N cab". */
  const todos = lotes.length > 1 && lotes.every(l => valor.includes(l.loteId));
  const cabDeTodos = lotes.every(l => l.qtd != null) ? lotes.reduce((s, l) => s + (l.qtd ?? 0), 0) : null;
  const rotulo = valor.length === 0 ? '—'
    : todos ? `Todos os lotes${cabDeTodos != null ? ` · ${cabDeTodos} cab` : ''}`
    : valor.length === 1 && escolhidos[0]
      ? `Lote ${escolhidos[0].ordem}${escolhidos[0].qtd != null ? ` · ${escolhidos[0].qtd} cab` : ''}`
      : `${valor.length} lotes`;
  const alternar = (id: string) => onChange(valor.includes(id) ? valor.filter(x => x !== id) : [...valor, id]);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" data-testid="seletor-lotes" aria-invalid={invalido || undefined}
          className={cn(CTL, 'w-full justify-between font-normal')} title={rotulo}>
          <span className="min-w-0 truncate">{rotulo}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1">
        {lotes.length === 0 && <div className="px-2 py-1 text-[10px]">Nenhum lote na operação.</div>}
        {lotes.map(l => (
          <button key={l.loteId} type="button" onClick={() => alternar(l.loteId)}
            className="flex h-5 w-full items-center gap-1.5 rounded-sm px-1.5 text-[10px] hover:bg-zinc-700">
            <Check className={cn('h-3 w-3 shrink-0', valor.includes(l.loteId) ? 'opacity-100' : 'opacity-0')} />
            <span className="truncate">Lote {l.ordem}{l.qtd != null ? ` · ${l.qtd} cab` : ''}{l.categoria ? ` · ${l.categoria}` : ''}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** NF produtor (passo 4): a LISTA de `dados.nfs_produtor`. Em repouso, os numeros com " · " (a lista inteira no `title`);
 *  focado, separados por virgula, e e' assim que se edita. Data e valor de quem ja' existia ficam. */
function CampoNfsProdutor({ lista, onChange, disabled, className }: {
  lista: NfProdutor[]; onChange: (l: NfProdutor[]) => void; disabled?: boolean; className?: string;
}) {
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const titulo = lista.map(n => [n.numero, n.data ? `de ${n.data.split('-').reverse().join('/')}` : null, n.valor != null ? brl(n.valor) : null]
    .filter(Boolean).join(' ')).join(' · ');
  return (
    <Input data-testid="nfs-produtor" value={editando ? texto : textoDasNfsProdutor(lista)} disabled={disabled} title={titulo || undefined}
      onFocus={() => { setTexto(lista.map(n => n.numero).filter(Boolean).join(', ')); setEditando(true); }}
      onChange={e => setTexto(e.target.value)}
      onBlur={() => { setEditando(false); onChange(nfsProdutorDoTexto(texto, lista)); }}
      className={cn(CTL, className)} />
  );
}

function Calculado({ texto, titulo }: { texto: string; titulo?: string }) {
  return (
    <div data-calculado="" title={titulo ?? texto}
      className={cn('flex h-[22px] items-center justify-end truncate rounded-md border border-dashed border-muted-foreground/40 bg-muted/50 px-1.5 text-[11px] text-muted-foreground', NUM)}>
      {texto}
    </div>
  );
}

interface Props {
  api: DocumentosApi;
  somenteLeitura?: boolean;
  fornecedores?: { id: string; nome: string; cpfCnpj?: string | null }[];
  clienteId?: string | null;
  contraparteId?: string | null;
  onCriarFornecedor?: (nome: string, cpfCnpj: string) => Promise<{ id: string; nome: string } | null>;
  /* Grava o CNPJ da nota num fornecedor que ja' existe — so' com o aval do operador ("usar este"). */
  onGravarDocumentoFornecedor?: (fornecedorId: string, cpfCnpj: string) => Promise<boolean>;
  initialForm: FormAbate;
  onSaved: () => void;
  onCancel: () => void;
}

export function DocumentoFormAbate({ api, somenteLeitura, fornecedores, clienteId, contraparteId, onCriarFornecedor, onGravarDocumentoFornecedor, initialForm, onSaved, onCancel }: Props) {
  /* passo 7e: o documento NOVO nasce com o lote padrao da especie; a edicao vale o gravado. */
  const [form, setForm] = useState<FormAbate>(() => (initialForm.documentoId == null && initialForm.loteIds.length === 0
    ? { ...initialForm, loteIds: lotesPadraoDaEspecie(initialForm.especie, api.lotes) } : initialForm));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /* o tom do aviso da leitura: 'atencao' (ambar) quando o PDF nao foi lido; neutro quando foi. */
  const [avisoAtencao, setAvisoAtencao] = useState(false);
  const [tentou, setTentou] = useState(false);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);
  /* ── O EMITENTE DA NOTA QUE NAO SE ACHA PELO CNPJ (as situacoes do formulario antigo, PR-OC-DOC-ENRIQUECER-FORNECEDOR-01) ──
     ⚠ DENTRO DA FAIXA DE 22px, nunca num bloco a mais: o formulario do abate nao muda de altura.
     Nome parecido NAO e' prova ("Joao Silva" pode ser dois): a faixa pergunta, e so' o "usar este" grava o CNPJ no cadastro.
     Escolhido ja' com OUTRO documento: nao sobrescreve — a faixa avisa (filial da mesma raiz, ou fornecedor trocado). */
  const [candidatos, setCandidatos] = useState<CandidatoFornecedor[]>([]);
  const [cnpjDaNota, setCnpjDaNota] = useState<string | null>(null);
  const [conflitoCnpj, setConflitoCnpj] = useState<string | null>(null);

  const editando = form.documentoId != null;
  const contraparte = (fornecedores ?? []).find(f => f.id === contraparteId) ?? null;
  const tipo: TipoOperacaoOC = form.tipo;
  const linhas = camposDaEspecie(tipo, form.especie) ?? [];
  /* OC-DOC-VENDA-01 — a nota repetida (chave de 44 digitos viva noutro documento do cliente): a faixa avisa com o link e o
     Registrar nao grava. O banco barra igual (23505); aqui e' para o operador saber ANTES, e onde ela esta'. */
  const [repetida, setRepetida] = useState<NotaRepetida | null>(null);
  const digitosDaChave = form.chaveAcesso.replace(/\D/g, '');
  useEffect(() => {
    let vivo = true;
    if (digitosDaChave.length !== 44 || !api.notaRepetida) { setRepetida(null); return; }
    void api.notaRepetida(digitosDaChave, form.documentoId).then(r => { if (vivo) setRepetida(r); });
    return () => { vivo = false; };
  }, [digitosDaChave, form.documentoId, api]);
  const pendencias = pendenciasDoFormAbate(form, contraparteId ?? null);
  const pendente = new Set<ChaveCampo>(tentou ? pendencias.map(p => p.chave) : []);
  const set = <K extends keyof FormAbate>(k: K, v: FormAbate[K]) => setForm(f => ({ ...f, [k]: v }));

  /* Os calculados — so' exibicao. */
  const outrasRetencoes = form.preservados.filter(c => c.natureza === 'retencao_sem_caixa').reduce((s, c) => s + Number(c.valor), 0);
  const outrosAcrescimos = form.preservados.filter(c => c.natureza === 'acrescimo').reduce((s, c) => s + Number(c.valor), 0);
  const outrasDeducoes = form.preservados.filter(c => c.natureza === 'desconto_comercial' || c.natureza === 'despesa_desembolso')
    .reduce((s, c) => s + Number(c.valor), 0);
  const retNF = retencoesDaNF(form.funrural, form.senar, form.seguro, outrasRetencoes, form.rat);
  const incentivo = totalDosIncentivos(form.incentivos);
  const liquidoNF = form.bruto == null ? null : Math.round((form.bruto + incentivo + outrosAcrescimos - retNF - outrasDeducoes) * 100) / 100;
  const calculado = (k: ChaveCampo): string => {
    const f2 = (n: number | null) => (n == null ? '—' : formatCasas(n, 2));
    switch (k) {
      case 'arrobas': return f2(arrobasDoPeso(form.pesoKg));
      case 'mediaKg': return f2(mediaDoRomaneio(form.cab, form.pesoKg));
      case 'cabGta': { const n = cabDaGta(form); return n == null ? '—' : formatCasas(n, 0); }
      case 'retencoes':
        if (form.especie === 'acerto') { const r = retencoesDoAcerto(form.bruto, form.liquido, incentivo); return r == null ? '—' : brl(r); }
        return brl(retNF);
      case 'liquido': return liquidoNF == null ? '—' : brl(liquidoNF);
      default: return '—';
    }
  };
  const rotuloDe = (c: CampoDef) => {
    if (c.chave === 'funrural' || c.chave === 'senar' || c.chave === 'seguro' || c.chave === 'rat') {
      const p = pctDoBruto(form[c.chave], form.bruto);
      return p == null ? c.rotulo : `${c.rotulo} · ${formatCasas(p, 2)}%`;
    }
    return c.rotulo;
  };

  /* O emitente da nota pelo CNPJ: exato escolhe; sem ele, a faixa sugere o parecido (as situacoes de sempre). */
  const emitenteDaNota = (cnpj: string | null, nome: string | null) => {
    const exato = cnpj ? (fornecedores ?? []).find(x => soDigitosDoc(x.cpfCnpj) === soDigitosDoc(cnpj)) : null;
    setCnpjDaNota(cnpj); setConflitoCnpj(null);
    setCandidatos(!exato && cnpj && nome ? candidatosPorNome(nome, fornecedores ?? []) : []);
    if (exato) setForm(f => (f.emitenteId ? f : { ...f, emitenteId: exato.id, emitenteNome: exato.nome, emitenteDocumento: cnpj ?? '' }));
    else if (cnpj) setForm(f => (f.emitenteId ? f : { ...f, emitenteNome: nome ?? f.emitenteNome, emitenteDocumento: cnpj }));
    return exato;
  };

  /* A LEITURA DO PDF (passo 4): o layout do frigorifico, tudo ou nada, SO' nos campos vazios — no documento novo e na edicao.
     O que nao foi lido fica escrito na faixa, e o arquivo segue anexado. NF sem layout conhecido: o DANFE de sempre. */
  const lerArquivo = async (file: File) => {
    if (file.type !== 'application/pdf') { setAviso(null); return; }
    setLendo(true); setAviso(null); setAvisoAtencao(false);
    try {
      const pdf = await extrairLinhasPdf(file);
      const r = lerPdfDoAbate(pdf, { especie: form.especie, cnpjContraparte: contraparte?.cpfCnpj ?? null });
      if (r.tipo === 'lido') {
        /* 7f: o numero so' ganha a mascara de NF nas notas (frigorifico e produtor); GTA e declaracao ficam como o PDF escreve. */
        const mascara = ehNotaFiscal(form.especie) || form.especie === 'nf_produtor' || form.especie === 'nf_entrada' ? numeroEmRepouso : undefined;
        const n = aplicarLeitura(form, r.campos, r.dados, mascara).preenchidos.length;
        /* passo 7e: o Romaneio sem lote ganha o lote cuja quantidade de cabecas e' a do romaneio, se for UM so'. */
        const sugerido = r.grupo === 'romaneio' && form.loteIds.length === 0 ? loteSugeridoPelaQuantidade(api.lotes, r.campos.cab) : null;
        setForm(f => {
          const g = aplicarLeitura(f, r.campos, r.dados, mascara).form;
          return sugerido && g.loteIds.length === 0 ? { ...g, loteIds: [sugerido] } : g;
        });
        const exato = r.grupo === 'nf' ? emitenteDaNota(r.campos.emitenteCnpj ?? null, r.campos.emitenteNome ?? null) : null;
        const avisos = [...r.avisos, ...(sugerido ? [FRASE_LOTE_SUGERIDO] : [])];
        setAviso([fraseDaLeitura(r.rotulo, n), ...avisos].join(' · ')
          + (r.grupo === 'nf' && r.campos.emitenteCnpj && !exato ? ` · emitente ${r.campos.emitenteCnpj} fora do cadastro` : ''));
        setAvisoAtencao(avisos.length > 0);
        return;
      }
      if (r.motivo === 'desconhecido' && (ehNotaFiscal(form.especie) || form.especie === 'nf_entrada')) {
        const d = extrairDanfe(pdf.linhas.join('\n'));
        if (!d.chaveAcesso && !d.numero && !d.valorTotal) { setAviso('Não reconheci o formato de DANFE: preencha os campos.'); setAvisoAtencao(true); return; }
        const exato = emitenteDaNota(d.emitenteCnpj, d.emitenteNome);
        setForm(f => ({
          ...f,
          numero: f.numero.trim() || !d.numero ? f.numero : numeroEmRepouso(d.numero),
          serie: f.serie.trim() || !d.serie ? f.serie : d.serie,
          dataEmissao: f.dataEmissao || !d.dataEmissao ? f.dataEmissao : d.dataEmissao,
          chaveAcesso: f.chaveAcesso.trim() || !d.chaveAcesso ? f.chaveAcesso : d.chaveAcesso,
          /* OC-DOC-VENDA-01: a NF de entrada do comprador guarda o total no Valor (informativo); a NF do frigorifico, no Bruto. */
          ...(f.especie === 'nf_entrada'
            ? { valorInformativo: f.valorInformativo != null || !d.valorTotal ? f.valorInformativo : d.valorTotal }
            : { bruto: f.bruto != null || !d.valorTotal ? f.bruto : d.valorTotal }),
        }));
        setAviso(`Nota lida pelo DANFE${f2Rotulo(form.especie)}${d.valorTotal ? ` · total ${brl(d.valorTotal)}` : ''}`
          + (d.emitenteCnpj && !exato ? ` · emitente ${d.emitenteNome ?? ''} ${d.emitenteCnpj} fora do cadastro` : '') + ' · confira antes de registrar');
        return;
      }
      setAviso(r.frase); setAvisoAtencao(true);
    } catch {
      setAviso('Falha ao ler o arquivo: preencha os campos.'); setAvisoAtencao(true);
    } finally { setLendo(false); }
  };
  const receberArquivo = (f: File | null) => {
    if (!f || motivoArquivoInvalido(f)) { setArquivo(null); return; }
    setArquivo(f);
    void lerArquivo(f);
  };

  /* "usar este": o mesmo gesto do formulario antigo (`escolherCandidato`). */
  const usarCandidato = async (c: CandidatoFornecedor) => {
    if (!cnpjDaNota) return;
    const jaTem = soDigitosDoc(c.cpfCnpj);
    if (jaTem && jaTem !== soDigitosDoc(cnpjDaNota)) {
      const mesmaRaiz = raizCnpj(c.cpfCnpj) === raizCnpj(cnpjDaNota);
      setConflitoCnpj(`${c.nome} já tem o CNPJ ${c.cpfCnpj}, a nota traz ${cnpjDaNota}`
        + (mesmaRaiz ? ' · mesma raiz: outra filial?' : ' · empresas diferentes: confira o fornecedor') + ' · nada foi alterado');
      setForm(f => ({ ...f, emitenteId: c.id, emitenteNome: c.nome, emitenteDocumento: c.cpfCnpj ?? '' }));
      setCandidatos([]);
      return;
    }
    if (!jaTem) { const ok = await onGravarDocumentoFornecedor?.(c.id, cnpjDaNota); if (!ok) return; }
    setForm(f => ({ ...f, emitenteId: c.id, emitenteNome: c.nome, emitenteDocumento: cnpjDaNota }));
    setCandidatos([]);
  };

  const registrar = async () => {
    if (somenteLeitura) return;
    setTentou(true);
    if (pendencias.length > 0 || repetida) return;
    const payload = payloadDoFormAbate(form);
    if (form.documentoId) {
      const ok = await api.editar(form.documentoId, form.versao, payload);
      if (!ok) return;
      if (arquivo) await api.anexarArquivo(form.documentoId, form.versao + 1, arquivo);
      onSaved(); return;
    }
    const id = await api.registrar(payload);
    if (!id) return;
    if (arquivo) await api.anexarArquivo(id, 1, arquivo);
    onSaved();
  };

  /* 7f: o seletor em DOIS grupos (ABATE · SAÍDA), numa linha; a especie que nao esta' em grupo nenhum (legado) entra no segundo.
     OC-DOC-VENDA-01: na venda, OPERAÇÃO · SAÍDA (`gruposDoSeletor`). */
  const gruposDoTipo = gruposDoSeletor(tipo) ?? GRUPOS_DO_SELETOR_ABATE;
  const grupos = gruposDoTipo.map((g, i) => {
    const especies = i === gruposDoTipo.length - 1 && !gruposDoTipo.some(x => x.especies.includes(form.especie))
      ? [...g.especies, form.especie] : g.especies;
    return { rotulo: g.rotulo, opcoes: especies.map(e => ({ valor: e, rotulo: ROTULO_SEGMENTO[e] ?? ESPECIE_LABEL[e], desabilitada: editando && e !== form.especie })) };
  });
  const escolherEspecie = (e: EspecieDoc) => {
    if (!editando) { setForm(f => ({ ...f, especie: e, loteIds: lotesPadraoDaEspecie(e, api.lotes) })); setTentou(false); }
  };

  const rotuloContraparte = contraparte?.nome ? `Mesmo da operação — ${contraparte.nome}` : 'Mesmo da operação';

  const controle = (c: CampoDef) => {
    const inv = pendente.has(c.chave);
    const borda = inv ? 'border-destructive' : '';
    if (c.calculado) return <Calculado texto={calculado(c.chave)} />;
    const k = c.chave;
    switch (k) {
      case 'numero':
        return <Input value={form.numero} disabled={somenteLeitura} aria-invalid={inv || undefined}
          inputMode={ehNotaFiscal(form.especie) || form.especie === 'nf_produtor' || form.especie === 'nf_entrada' ? 'numeric' : undefined}
          onChange={e => set('numero', ehNotaFiscal(form.especie) || form.especie === 'nf_produtor' || form.especie === 'nf_entrada' ? numeroDigitando(e.target.value) : e.target.value)}
          onBlur={() => setForm(f => ((ehNotaFiscal(f.especie) || f.especie === 'nf_produtor' || f.especie === 'nf_entrada') && f.numero ? { ...f, numero: numeroEmRepouso(f.numero) } : f))}
          className={cn(CTL, borda)} />;
      case 'serie': case 'chaveAcesso': case 'observacao': case 'ordemCompra': case 'loteFrigorifico': case 'op': case 'nfRefNumero':
      case 'destinatario': case 'gtaCitada': case 'finalidade': case 'destino':
        return <Input value={form[k]} disabled={somenteLeitura} aria-invalid={inv || undefined}
          onChange={e => set(k, e.target.value)} className={cn(CTL, borda)} title={form[k] || undefined} />;
      case 'dataEmissao': case 'dataAbate': case 'vencimento': case 'dataSaida': case 'validade': case 'embarque': case 'pagoEm':
        return <DatePicker value={form[k]} onChange={v => set(k, v)} size="compact" disabled={somenteLeitura}
          className={cn('h-[22px] text-[11px]', borda)} />;
      case 'cab':
        return <CampoNumero valor={form.cab} onChange={n => set('cab', n)} casas={0} invalido={inv} className={borda} />;
      case 'pesoKg':
        return <CampoNumero valor={form.pesoKg} onChange={n => set('pesoKg', n)} casas={2} invalido={inv} className={borda} />;
      case 'femeas': case 'machos':
        return <CampoNumero valor={form[k]} onChange={n => set(k, n)} casas={0} invalido={inv} className={borda} />;
      case 'valorInformativo':
        return <CampoMoeda valor={form.valorInformativo} onChange={n => set('valorInformativo', n)} disabled={somenteLeitura}
          className={cn(CTL, NUM, borda)} />;
      case 'tipoGuia': case 'tipoDeclaracao': {
        const opcoesTipo = k === 'tipoGuia' ? TIPOS_DE_GUIA : TIPOS_DE_DECLARACAO;
        return (
          <Select value={form[k] || undefined} onValueChange={v => set(k, v)} disabled={somenteLeitura}>
            <SelectTrigger data-testid={`select-${k}`} aria-invalid={inv || undefined} className={cn('h-[22px] px-1.5 text-[11px]', borda)}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>{opcoesTipo.map(o => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}</SelectContent>
          </Select>
        );
      }
      case 'precoArroba': case 'bruto': case 'funrural': case 'senar': case 'seguro': case 'rat': case 'liquido': case 'valor': case 'nfRefValor':
        return <CampoMoeda valor={form[k]} onChange={n => set(k, n)} disabled={somenteLeitura}
          className={cn(CTL, NUM, borda)} />;
      case 'nfsProdutor':
        return <CampoNfsProdutor lista={form.nfsProdutor} onChange={l => set('nfsProdutor', l)} disabled={somenteLeitura} className={borda} />;
      case 'incentivo': {
        /* passo 7e: com 2+ linhas de incentivo o campo e' a SOMA (so' exibicao); com 0 ou 1, digita-se. */
        const l = form.incentivos;
        if (l.length > 1)
          return <Calculado texto={brl(incentivo)} titulo={l.map(i => `${i.descricao} ${brl(i.valor)}`).join(' · ')} />;
        return <CampoMoeda valor={l[0]?.valor ?? null} disabled={somenteLeitura} className={cn(CTL, NUM, borda)}
          onChange={n => set('incentivos', n == null ? [] : [{ descricao: l[0]?.descricao ?? DESCRICAO_INCENTIVO, valor: n }])} />;
      }
      case 'nfsProdutorValor': {
        /* Com 2+ NFs do produtor o valor e' a SOMA dos informados (so' exibicao); com 0 ou 1, digita-se o valor dela.
           passo 7e: a NF que cita varias NFs do produtor com UM "VR" guarda o VR em `dados.nfs_produtor_valor` (sem repartir). */
        const l = form.nfsProdutor;
        if (l.length > 1) {
          const vr = form.dadosLidos.nfs_produtor_valor;
          const soma = valorDasNfsProdutor(l) ?? (typeof vr === 'number' ? vr : null);
          return <Calculado texto={soma == null ? '—' : brl(soma)} titulo="soma dos valores informados das NFs do produtor" />;
        }
        return <CampoMoeda valor={l[0]?.valor ?? null} disabled={somenteLeitura} className={cn(CTL, NUM, borda)}
          onChange={n => set('nfsProdutor', l.length ? [{ ...l[0], valor: n }] : n == null ? [] : [{ numero: '', data: null, valor: n }])} />;
      }
      case 'emitente':
        return <FavorecidoSelect<FornecedorLido>
          value={form.emitenteId} clienteId={clienteId ?? null}
          onChange={id => setForm(f => (id ? { ...f, emitenteId: id } : { ...f, emitenteId: '', emitenteNome: '', emitenteDocumento: '' }))}
          onSelected={x => setForm(f => ({ ...f, emitenteId: x.id, emitenteNome: x.nome, emitenteDocumento: x.cpf_cnpj ?? '' }))}
          limpavel rotuloDoVazio={rotuloContraparte} placeholder={rotuloContraparte}
          disabled={somenteLeitura} linhaDoDocumento={false}
          triggerClassName={cn('h-[22px] text-[11px]', borda)}
          onCriarNovo={onCriarFornecedor && !somenteLeitura ? () => setNovoFornecedorOpen(true) : undefined}
          novoButtonClassName="h-[22px] w-[22px] [&_svg]:h-3 [&_svg]:w-3" novoRotulo="Cadastrar emitente" />;
      case 'lote':
        return <SeletorLotes lotes={api.lotes} valor={form.loteIds} onChange={ids => set('loteIds', ids)} invalido={inv} />;
      default: return null;
    }
  };

  /* A CONFERENCIA AO VIVO (passo 3): o que esta' sendo digitado como um documento virtual, contra os ja' registrados da OC. O
     documento virtual tem o que o banco calcularia ao gravar (bruto = acrescimos; liquido = o da especie); sem valor = vazio. */
  const virtual: DocConferencia = (() => {
    const e = form.especie;
    const nf = e === 'nf_principal' || e === 'nf_complementar';
    const bruto = nf || e === 'acerto' ? form.bruto : e === 'npr' ? form.valor : null;
    const liquido = nf ? liquidoNF : e === 'acerto' ? (form.liquido ?? (form.bruto == null ? null : form.bruto + incentivo)) : e === 'npr' ? form.valor : null;
    const comValor = bruto != null;
    return {
      documentoId: form.documentoId ?? '__novo__', especie: e, cancelado: false,
      qtdComponentes: comValor ? 1 : 0,
      totalAcrescimos: comValor ? (bruto ?? 0) + (nf || e === 'acerto' ? incentivo : 0) + (nf ? outrosAcrescimos : 0) : 0,
      totalRetencoesSemCaixa: nf ? retNF : e === 'acerto' && comValor ? (bruto ?? 0) + incentivo - (liquido ?? 0) : 0,
      liquidoProprio: comValor ? (liquido ?? 0) : 0, valorLiquido: 0,
      cab: form.cab, pesoKg: form.pesoKg,
    };
  })();
  const aoVivo = conferenciaAoVivo(api.documentos, virtual);

  /* A faixa, por prioridade: o que falta (vermelho) > o emitente da nota (ambar) > o que a leitura disse > a conferencia ao vivo
     > a frase da especie. */
  const faltaTexto = tentou && pendencias.length > 0 ? `falta: ${pendencias.map(p => p.rotulo).join(', ')}` : null;
  const repetidaTexto = repetida ? `Esta nota já está registrada: ${repetida.rotulo} · não grava de novo` : null;
  const candidato = candidatos[0] ?? null;
  const emitenteTexto = conflitoCnpj
    ?? (candidato ? `Emitente não achado pelo CNPJ · parecido: ${candidato.nome}${candidatos.length > 1 ? ` (+${candidatos.length - 1})` : ''}` : null);
  const fraseDaEspecie = (tipo === 'venda' ? FRASE_DA_ESPECIE_VENDA : FRASE_DA_ESPECIE)[form.especie] ?? FRASE_OUTRO;
  const fraseFaixa = repetidaTexto ?? faltaTexto ?? emitenteTexto ?? aviso ?? aoVivo?.texto ?? fraseDaEspecie;
  const tomFaixa = repetidaTexto || faltaTexto ? 'erro' : emitenteTexto ? 'emitente' : aviso ? (avisoAtencao ? 'atencao' : 'neutro')
    : aoVivo?.tom === 'vermelho' ? 'diverge' : aoVivo?.tom === 'verde' ? 'confere' : 'neutro';
  const tituloFaixa = candidatos.length > 1 && !faltaTexto && !conflitoCnpj
    ? `${fraseFaixa} — parecidos: ${candidatos.map(c => c.nome).join(', ')}` : fraseFaixa;

  return (
    <div data-testid="form-abate" className="flex min-w-0 flex-col gap-1 rounded-md border bg-card p-2 shadow-sm">
      {onCriarFornecedor && (
        <NovoFornecedorDialog open={novoFornecedorOpen} onClose={() => setNovoFornecedorOpen(false)} clienteId={clienteId ?? null}
          onSelecionar={(f) => setForm(x => ({ ...x, emitenteId: f.id, emitenteNome: f.nome, emitenteDocumento: f.cpf_cnpj || x.emitenteDocumento }))}
          onSave={async (nome, cpfCnpj) => {
            const rec = await onCriarFornecedor(nome, cpfCnpj);
            if (rec) setForm(f => ({ ...f, emitenteId: rec.id, emitenteNome: rec.nome, emitenteDocumento: cpfCnpj || f.emitenteDocumento }));
            setNovoFornecedorOpen(false);
          }} />
      )}
      <div className="flex h-5 shrink-0 items-center justify-between">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[12px] font-semibold text-foreground">{editando ? 'Editar documento' : 'Novo documento'}</span>
          {/* 7f-fix1: a frase da edicao mora no cabecalho (lugar reservado, vazio no novo); a linha da especie ficou toda para o
              arquivo, cujo nome nao cabia nos 122px que sobravam. */}
          <span data-testid="especie-fixa" className="min-w-0 truncate text-[9.5px] text-muted-foreground" title={editando ? FRASE_ESPECIE_FIXA : undefined}>
            {editando ? FRASE_ESPECIE_FIXA : ''}
          </span>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px]" onClick={onCancel}>
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Button>
      </div>

      <div data-testid="linha-especie" className="flex shrink-0 items-center gap-2" style={{ height: ALTURA_LINHA_ESPECIE }}>
        {grupos.map(g => (
          <span key={g.rotulo} className="flex shrink-0 items-center gap-1" data-testid={`grupo-especie-${g.rotulo}`}>
            <span className="text-[9.5px] font-semibold text-muted-foreground">{g.rotulo}</span>
            <Segmentado<EspecieDoc> valor={form.especie} altura={26} fonte={9.5} opcoes={g.opcoes} onEscolher={escolherEspecie} />
          </span>
        ))}
        {!somenteLeitura && (
          <AreaDeArquivo regra={REGRA_ARQUIVO_DA_OC} className="h-[26px] min-w-0 flex-1" inputTestId="arquivo-abate"
            convite="Clique ou arraste o PDF / XML" detalhe="preenche os campos"
            conteudo={arquivo ? arquivo.name : form.url ? 'arquivo anexado · enviar outro substitui' : undefined}
            tituloDoConteudo={arquivo ? arquivo.name : form.url ? 'arquivo anexado · enviar outro substitui' : undefined}
            fixo={lendo ? 'lendo…' : undefined} rotuloDoBotao={arquivo ? 'Trocar' : 'Escolher'}
            onArquivos={([f]) => receberArquivo(f ?? null)} />
        )}
      </div>

      <div data-testid="area-campos" className="shrink-0 space-y-[6px] overflow-hidden" style={{ height: ALTURA_AREA_CAMPOS }}>
        {linhas.map((linha, i) => (
          <div key={i} className="grid grid-cols-5 gap-x-[10px]">
            {linha.map(c => (
              <div key={c.chave} className={cn('min-w-0', COL[c.colunas])} data-campo={c.chave}>
                <div className={cn('h-3 truncate text-[10px] leading-3', pendente.has(c.chave) ? 'text-destructive' : 'text-muted-foreground')}
                  title={rotuloDe(c)}>
                  {rotuloDe(c)}{c.obrigatorio ? ' *' : ''}
                </div>
                <div className="mt-px h-[22px]">{controle(c)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div data-testid="faixa-conferencia" data-tom={tomFaixa} title={tituloFaixa}
        className={cn('flex shrink-0 items-center gap-2 overflow-hidden rounded-md border px-2 text-[10px]',
          tomFaixa === 'erro' ? 'border-destructive/50 bg-destructive/5 text-destructive'
            : tomFaixa === 'emitente' || tomFaixa === 'atencao' ? 'border-amber-400 bg-amber-50 text-amber-800'
              : tomFaixa === 'diverge' ? 'border-destructive/50 bg-destructive/5 text-destructive'
                : tomFaixa === 'confere' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'bg-muted/30 text-muted-foreground')}
        style={{ height: ALTURA_FAIXA }}>
        <span className="min-w-0 flex-1 truncate">{fraseFaixa}</span>
        {repetida && (
          <a data-testid="abrir-nota-repetida" href={enderecoDaOC(repetida)} target="_blank" rel="noopener noreferrer"
            className="shrink-0 underline underline-offset-2">abrir</a>
        )}
        {tomFaixa === 'emitente' && candidato && !conflitoCnpj && (
          <span className="flex shrink-0 gap-1">
            <button type="button" data-testid="usar-candidato" onClick={() => void usarCandidato(candidato)}
              className="h-4 rounded border border-amber-500 px-1.5 text-[9.5px] leading-none hover:bg-amber-100">usar este</button>
            <button type="button" onClick={() => setCandidatos([])}
              className="h-4 rounded px-1.5 text-[9.5px] leading-none hover:bg-amber-100">nenhum</button>
          </span>
        )}
      </div>

      <div data-testid="rodape-form" className="flex h-[22px] shrink-0 items-center justify-between">
        <span className="text-[9.5px] text-muted-foreground">* obrigatório · tracejado = calculado</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-[22px] px-2 text-[11px]" onClick={onCancel}>Cancelar</Button>
          <Button type="button" size="sm" className="h-[22px] gap-1 px-2 text-[11px]" disabled={api.saving || somenteLeitura}
            onClick={() => void registrar()} data-testid="registrar-documento">
            <FileText className="h-3 w-3" /> {api.saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Registrar documento'}
          </Button>
        </div>
      </div>
    </div>
  );
}
