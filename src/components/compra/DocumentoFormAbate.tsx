import { useState } from 'react';
import { ArrowLeft, Check, ChevronsUpDown, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { Segmentado } from '@/components/ui/segmentado';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import type { FornecedorLido } from '@/lib/fornecedores/leitorDeFornecedores';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { motivoArquivoInvalido, REGRA_ARQUIVO_DA_OC } from '@/lib/oc/caminhoDocumento';
import { extractPdfText } from '@/lib/financeiro/parser/extractPdfText';
import { extrairDanfe } from '@/lib/oc/extrairDanfe';
import { candidatosPorNome, raizCnpj, soDigitosDoc, type CandidatoFornecedor } from '@/lib/oc/similaridadeFornecedor';
import { brl, formatCasas, parseMoeda } from '@/lib/calculos/numeroBR';
import { cn } from '@/lib/utils';
import type { DocumentosApi, EspecieDoc, LoteOpcao } from '@/hooks/useOperacaoDocumentos';
import {
  camposDaEspecie, especiesDaOC, ROTULO_SEGMENTO, arrobasDoPeso, retencoesDaNF, retencoesDoAcerto, mediaDoRomaneio, pctDoBruto,
  type CampoDef, type ChaveCampo,
} from '@/lib/oc/camposDaEspecie';
import { payloadDoFormAbate, pendenciasDoFormAbate, type FormAbate } from '@/lib/oc/formDocumentoAbate';
import { ESPECIE_LABEL, ehNotaFiscal, numeroDigitando, numeroEmRepouso } from './DocumentoFormOC';

/* OC-DOC-ESPECIE-ABATE-01 passo 2 — O FORMULARIO DE DOCUMENTO DO ABATE.
   ⚠ TAMANHO FIXO (regra do Gabriel): trocar a especie NUNCA muda a largura nem a altura do formulario. So' os campos DENTRO da
     area de 250px mudam; o seletor, a area de arquivo, a faixa de conferencia e o rodape ficam onde estao. Nada rola.
   ⚠ A TELA SO' DESENHA: os campos de cada especie sao de `camposDaEspecie`; o payload, as pendencias e o que se preserva sao de
     `formDocumentoAbate`. Os calculados (@, retencoes, liquido, media) sao so' exibicao — o valor que soma e' do banco.
   Compra e venda nao passam por aqui (seguem com `DocumentoFormOC`). */

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
};
const FRASE_OUTRO = 'Outro · informativo · não soma';
export const FRASE_ESPECIE_FIXA = 'espécie não muda depois de registrado';

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
  const rotulo = valor.length === 0 ? '—'
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

function Calculado({ texto }: { texto: string }) {
  return (
    <div data-calculado="" title={texto}
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
  const [form, setForm] = useState<FormAbate>(initialForm);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
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
  const linhas = camposDaEspecie('abate', form.especie) ?? [];
  const pendencias = pendenciasDoFormAbate(form, contraparteId ?? null);
  const pendente = new Set<ChaveCampo>(tentou ? pendencias.map(p => p.chave) : []);
  const set = <K extends keyof FormAbate>(k: K, v: FormAbate[K]) => setForm(f => ({ ...f, [k]: v }));

  /* Os calculados — so' exibicao. */
  const outrasRetencoes = form.preservados.filter(c => c.natureza === 'retencao_sem_caixa').reduce((s, c) => s + Number(c.valor), 0);
  const outrosAcrescimos = form.preservados.filter(c => c.natureza === 'acrescimo').reduce((s, c) => s + Number(c.valor), 0);
  const outrasDeducoes = form.preservados.filter(c => c.natureza === 'desconto_comercial' || c.natureza === 'despesa_desembolso')
    .reduce((s, c) => s + Number(c.valor), 0);
  const retNF = retencoesDaNF(form.funrural, form.senar, form.seguro, outrasRetencoes);
  const liquidoNF = form.bruto == null ? null : Math.round((form.bruto + outrosAcrescimos - retNF - outrasDeducoes) * 100) / 100;
  const calculado = (k: ChaveCampo): string => {
    const f2 = (n: number | null) => (n == null ? '—' : formatCasas(n, 2));
    switch (k) {
      case 'arrobas': return f2(arrobasDoPeso(form.pesoKg));
      case 'mediaKg': return f2(mediaDoRomaneio(form.cab, form.pesoKg));
      case 'retencoes':
        if (form.especie === 'acerto') { const r = retencoesDoAcerto(form.bruto, form.liquido); return r == null ? '—' : brl(r); }
        return brl(retNF);
      case 'liquido': return liquidoNF == null ? '—' : brl(liquidoNF);
      default: return '—';
    }
  };
  const rotuloDe = (c: CampoDef) => {
    if (c.chave === 'funrural' || c.chave === 'senar' || c.chave === 'seguro') {
      const p = pctDoBruto(form[c.chave], form.bruto);
      return p == null ? c.rotulo : `${c.rotulo} · ${formatCasas(p, 2)}%`;
    }
    return c.rotulo;
  };

  const lerNota = async (file: File) => {
    if (file.type !== 'application/pdf' || !ehNotaFiscal(form.especie)) { setAviso(null); return; }
    setLendo(true); setAviso(null);
    try {
      const { text, hasTextLayer } = await extractPdfText(file);
      if (!hasTextLayer) { setAviso('Nota sem texto (foto ou digitalização): preencha os campos.'); return; }
      const d = extrairDanfe(text);
      if (!d.chaveAcesso && !d.numero && !d.valorTotal) { setAviso('Não reconheci o formato de DANFE: preencha os campos.'); return; }
      const exato = d.emitenteCnpj ? (fornecedores ?? []).find(x => soDigitosDoc(x.cpfCnpj) === soDigitosDoc(d.emitenteCnpj)) : null;
      setCnpjDaNota(d.emitenteCnpj); setConflitoCnpj(null);
      setCandidatos(!exato && d.emitenteCnpj && d.emitenteNome ? candidatosPorNome(d.emitenteNome, fornecedores ?? []) : []);
      setForm(f => ({
        ...f,
        numero: f.numero.trim() || !d.numero ? f.numero : numeroEmRepouso(d.numero),
        serie: f.serie.trim() || !d.serie ? f.serie : d.serie,
        dataEmissao: f.dataEmissao || !d.dataEmissao ? f.dataEmissao : d.dataEmissao,
        chaveAcesso: f.chaveAcesso.trim() || !d.chaveAcesso ? f.chaveAcesso : d.chaveAcesso,
        bruto: f.bruto != null || !d.valorTotal ? f.bruto : d.valorTotal,
        ...(exato && !f.emitenteId ? { emitenteId: exato.id, emitenteNome: exato.nome, emitenteDocumento: d.emitenteCnpj ?? '' } : {}),
      }));
      setAviso(`Nota lida${d.valorTotal ? ` · total ${brl(d.valorTotal)}` : ''}`
        + (d.emitenteCnpj && !exato ? ` · emitente ${d.emitenteNome ?? ''} ${d.emitenteCnpj} fora do cadastro` : '') + ' · confira antes de registrar');
      if (d.emitenteCnpj && !exato) setForm(f => (f.emitenteId ? f : { ...f, emitenteNome: d.emitenteNome ?? f.emitenteNome, emitenteDocumento: d.emitenteCnpj ?? '' }));
    } catch {
      setAviso('Falha ao ler o arquivo: preencha os campos.');
    } finally { setLendo(false); }
  };
  const receberArquivo = (f: File | null) => {
    if (!f || motivoArquivoInvalido(f)) { setArquivo(null); return; }
    setArquivo(f);
    void lerNota(f);
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
    if (pendencias.length > 0) return;
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

  const opcoes = especiesDaOC('abate').map(e => ({ valor: e, rotulo: ROTULO_SEGMENTO[e] ?? ESPECIE_LABEL[e], desabilitada: editando && e !== form.especie }));
  if (!opcoes.some(o => o.valor === form.especie)) opcoes.push({ valor: form.especie, rotulo: ESPECIE_LABEL[form.especie], desabilitada: false });

  const contraparte = (fornecedores ?? []).find(f => f.id === contraparteId) ?? null;
  const rotuloContraparte = contraparte?.nome ? `Mesmo da operação — ${contraparte.nome}` : 'Mesmo da operação';

  const controle = (c: CampoDef) => {
    const inv = pendente.has(c.chave);
    const borda = inv ? 'border-destructive' : '';
    if (c.calculado) return <Calculado texto={calculado(c.chave)} />;
    const k = c.chave;
    switch (k) {
      case 'numero':
        return <Input value={form.numero} disabled={somenteLeitura} aria-invalid={inv || undefined}
          inputMode={ehNotaFiscal(form.especie) ? 'numeric' : undefined}
          onChange={e => set('numero', ehNotaFiscal(form.especie) ? numeroDigitando(e.target.value) : e.target.value)}
          onBlur={() => setForm(f => (ehNotaFiscal(f.especie) && f.numero ? { ...f, numero: numeroEmRepouso(f.numero) } : f))}
          className={cn(CTL, borda)} />;
      case 'serie': case 'chaveAcesso': case 'observacao': case 'ordemCompra': case 'loteFrigorifico': case 'op': case 'nfRefNumero':
        return <Input value={form[k]} disabled={somenteLeitura} aria-invalid={inv || undefined}
          onChange={e => set(k, e.target.value)} className={cn(CTL, borda)} title={form[k] || undefined} />;
      case 'dataEmissao': case 'dataAbate': case 'vencimento':
        return <DatePicker value={form[k]} onChange={v => set(k, v)} size="compact" disabled={somenteLeitura}
          className={cn('h-[22px] text-[11px]', borda)} />;
      case 'cab':
        return <CampoNumero valor={form.cab} onChange={n => set('cab', n)} casas={0} invalido={inv} className={borda} />;
      case 'pesoKg':
        return <CampoNumero valor={form.pesoKg} onChange={n => set('pesoKg', n)} casas={2} invalido={inv} className={borda} />;
      case 'precoArroba': case 'bruto': case 'funrural': case 'senar': case 'seguro': case 'liquido': case 'valor': case 'nfRefValor':
        return <CampoMoeda valor={form[k]} onChange={n => set(k, n)} disabled={somenteLeitura}
          className={cn(CTL, NUM, borda)} />;
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

  /* A faixa, por prioridade: o que falta (vermelho) > o emitente da nota (ambar) > o que a leitura disse > a frase da especie. */
  const faltaTexto = tentou && pendencias.length > 0 ? `falta: ${pendencias.map(p => p.rotulo).join(', ')}` : null;
  const candidato = candidatos[0] ?? null;
  const emitenteTexto = conflitoCnpj
    ?? (candidato ? `Emitente não achado pelo CNPJ · parecido: ${candidato.nome}${candidatos.length > 1 ? ` (+${candidatos.length - 1})` : ''}` : null);
  const fraseFaixa = faltaTexto ?? emitenteTexto ?? aviso ?? FRASE_DA_ESPECIE[form.especie] ?? FRASE_OUTRO;
  const tomFaixa = faltaTexto ? 'erro' : emitenteTexto ? 'emitente' : 'neutro';
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
        <div className="text-[12px] font-semibold text-foreground">{editando ? 'Editar documento' : 'Novo documento'}</div>
        <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px]" onClick={onCancel}>
          <ArrowLeft className="h-3 w-3" /> Voltar
        </Button>
      </div>

      <div data-testid="linha-especie" className="flex shrink-0 items-center gap-2" style={{ height: ALTURA_LINHA_ESPECIE }}>
        <Segmentado<EspecieDoc> valor={form.especie} altura={26} opcoes={opcoes}
          onEscolher={e => { if (!editando) { set('especie', e); setTentou(false); } }} />
        {/* LUGAR RESERVADO da frase da edicao: existe sempre (vazio no documento novo). */}
        <span data-testid="especie-fixa" className="w-[150px] shrink-0 truncate text-[9.5px] text-muted-foreground" title={editando ? FRASE_ESPECIE_FIXA : undefined}>
          {editando ? FRASE_ESPECIE_FIXA : ''}
        </span>
        {!somenteLeitura && (
          <AreaDeArquivo regra={REGRA_ARQUIVO_DA_OC} className="h-[26px] min-w-0 flex-1" inputTestId="arquivo-abate"
            convite="Clique ou arraste o PDF / XML" detalhe="preenche os campos"
            conteudo={arquivo ? arquivo.name : form.url ? 'arquivo anexado · enviar outro substitui' : undefined}
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
            : tomFaixa === 'emitente' ? 'border-amber-400 bg-amber-50 text-amber-800'
              : 'bg-muted/30 text-muted-foreground')}
        style={{ height: ALTURA_FAIXA }}>
        <span className="min-w-0 flex-1 truncate">{fraseFaixa}</span>
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
            onClick={() => void registrar()}>
            <FileText className="h-3 w-3" /> {api.saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Registrar documento'}
          </Button>
        </div>
      </div>
    </div>
  );
}
