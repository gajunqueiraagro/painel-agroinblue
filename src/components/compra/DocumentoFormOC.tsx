import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowLeft, FileText, Paperclip } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { NovoFornecedorDialog } from '@/components/financeiro-v2/NovoFornecedorDialog';
import { motivoArquivoInvalido } from '@/lib/oc/caminhoDocumento';
import { extractPdfText } from '@/lib/financeiro/parser/extractPdfText';
import { extrairDanfe, type DanfeExtraido } from '@/lib/oc/extrairDanfe';
import { toast } from 'sonner';
import { parseNumericValue } from '@/lib/calculos/abate';
import type {
  DocumentosApi, EspecieDoc, NaturezaComp, DocumentoPayload, ComponentePayload,
} from '@/hooks/useOperacaoDocumentos';

// Form de documento (PR-OC-RECEBIMENTO-UX-01). EXTRAÍDO verbatim da AbaDocumentosOC para ser
//   REUTILIZADO tanto pela aba Documentos (tela oficial) quanto pelo dialog compacto de registro
//   rápido na aba Recebimento. Persistência e validação ÚNICAS: sempre api.registrar/api.editar da
//   instância única DocumentosApi. Não duplica regras, validações nem persistência.

/* 'recibo' entrou em 20260903120000: compra de animais vem com NF OU recibo, e deixa-lo
   em "outro" faria o balde do desconhecido virar maioria. */
export const ESPECIE_LABEL: Record<EspecieDoc, string> = { nf_principal: 'NF principal', nf_complementar: 'NF complementar', recibo: 'Recibo', outro: 'Outro documento' };
const ESPECIES: EspecieDoc[] = ['nf_principal', 'nf_complementar', 'recibo', 'outro'];
const NATUREZA_LABEL: Record<NaturezaComp, string> = {
  acrescimo: 'Acréscimo', desconto_comercial: 'Desconto comercial', retencao_sem_caixa: 'Retenção (sem caixa)',
  despesa_desembolso: 'Despesa (desembolso)', informativo: 'Informativo',
};
const NATUREZAS: NaturezaComp[] = ['acrescimo', 'desconto_comercial', 'retencao_sem_caixa', 'despesa_desembolso', 'informativo'];
const TIPOS: { value: string; label: string }[] = [
  { value: 'valor_bruto', label: 'Valor bruto' }, { value: 'bonificacao', label: 'Bonificação' }, { value: 'premio', label: 'Prêmio' },
  { value: 'funrural', label: 'Funrural' }, { value: 'senar', label: 'SENAR' }, { value: 'inss', label: 'INSS' },
  { value: 'frete', label: 'Frete' }, { value: 'comissao', label: 'Comissão' }, { value: 'outros', label: 'Outros' },
];
export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface CompRow { tipo: string; natureza: NaturezaComp; valor: string; descricao: string; }
export interface FormState {
  documentoId: string | null; versao: number;
  especie: EspecieDoc; numero: string; serie: string; chaveAcesso: string; dataEmissao: string;
  observacao: string; url: string; documentoOrigemId: string;
  emitenteId: string; emitenteNome: string; emitenteDocumento: string;
  componentes: CompRow[]; loteIds: string[];
}
export const FORM_VAZIO: FormState = {
  documentoId: null, versao: 0, especie: 'nf_principal', numero: '', serie: '', chaveAcesso: '', dataEmissao: '',
  observacao: '', url: '', documentoOrigemId: '',
  emitenteId: '', emitenteNome: '', emitenteDocumento: '',
  componentes: [{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: '', descricao: '' }], loteIds: [],
};

interface Props {
  api: DocumentosApi;
  somenteLeitura?: boolean;
  /* EMITENTE — a lista de fornecedores e a contraparte da operacao, que e' o default.
     `onCriarFornecedor` habilita o "+", como no modal de compromisso. */
  fornecedores?: { id: string; nome: string; cpfCnpj?: string | null }[];
  contraparteId?: string | null;
  onCriarFornecedor?: (nome: string, cpfCnpj: string) => Promise<{ id: string; nome: string } | null>;
  initialForm: FormState;
  hideHeader?: boolean;         // dialog fornece seu próprio título
  onSaved: () => void;          // salvar OK: aba → volta à lista; dialog → fecha e permanece no Recebimento
  onCancel: () => void;
}

export function DocumentoFormOC({ api, somenteLeitura, fornecedores, contraparteId, onCriarFornecedor, initialForm, hideHeader, onSaved, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(initialForm);
  /* ⚠ O ARQUIVO NAO E' CAMPO DO FORMULARIO, e' um passo DEPOIS. Fica em estado proprio
     porque o upload so acontece quando ja existe `documento_id` — ver o submit. */
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [novoFornecedorOpen, setNovoFornecedorOpen] = useState(false);

  /* ── LEITURA DA NOTA (PR-OC-DOC-EXTRACAO-01) ───────────────────────────────
     ⚠ SUGESTAO, NUNCA GRAVACAO. O que a nota diz entra no formulario MARCADO, e o
     operador confere antes de salvar. Campo sugerido e aceito sem olhar e' pior que
     campo vazio: ninguem revisa o que ja parece pronto.
     ⚠ NAO SOBRESCREVE o que o operador ja digitou — so preenche o que esta vazio.
     Quem digitou tem mais razao que o parser. */
  const [sugeridos, setSugeridos] = useState<Set<string>>(new Set());
  const [lendoNota, setLendoNota] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [avisoLeitura, setAvisoLeitura] = useState<string | null>(null);

  const aplicarSugestao = (d: DanfeExtraido) => {
    const marcados = new Set<string>();
    setForm(f => {
      const novo = { ...f };
      const por = (campo: keyof typeof novo, valor: string | null) => {
        if (!valor || String(novo[campo] ?? '').trim() !== '') return;
        (novo[campo] as string) = valor;
        marcados.add(campo as string);
      };
      por('numero', d.numero);
      por('serie', d.serie);
      por('dataEmissao', d.dataEmissao);
      por('chaveAcesso', d.chaveAcesso);
      /* EMITENTE pelo CNPJ, que a chave garante. Achou no cadastro, seleciona; nao
         achou, deixa nome e documento prontos para o "+" criar sem redigitar. */
      if (d.emitenteCnpj) {
        const achado = (fornecedores ?? []).find(x => (x.cpfCnpj ?? '').replace(/\D/g, '') === d.emitenteCnpj!.replace(/\D/g, ''));
        if (achado && !novo.emitenteId) {
          novo.emitenteId = achado.id; novo.emitenteNome = achado.nome;
          marcados.add('emitenteId');
        } else if (!novo.emitenteId) {
          novo.emitenteNome = d.emitenteNome ?? novo.emitenteNome;
          marcados.add('emitenteNome');
        }
        por('emitenteDocumento', d.emitenteCnpj);
      }
      return novo;
    });
    setSugeridos(marcados);
  };

  const lerNota = async (file: File) => {
    if (file.type !== 'application/pdf') { setAvisoLeitura(null); setSugeridos(new Set()); return; }
    setLendoNota(true); setAvisoLeitura(null);
    try {
      const { text, hasTextLayer } = await extractPdfText(file);
      /* ⚠ O LIMIAR E' `hasTextLayer`, do proprio extrator, e nao um numero de
         caracteres inventado: a NF real deu 2.653 e um scan da ~0, mas qualquer corte
         entre os dois seria arbitrario. "Tem camada de texto ou nao" e' a pergunta
         verdadeira; o resto e' consequencia. */
      if (!hasTextLayer) {
        setAvisoLeitura('Não foi possível ler esta nota automaticamente (arquivo sem texto, provavelmente foto ou digitalização). Preencha os campos manualmente.');
        setSugeridos(new Set());
        return;
      }
      const d = extrairDanfe(text);
      if (!d.chaveAcesso && !d.numero && !d.valorTotal) {
        setAvisoLeitura('O arquivo tem texto, mas não reconheci o formato de DANFE. Preencha os campos manualmente.');
        setSugeridos(new Set());
        return;
      }
      aplicarSugestao(d);
      if (d.valorTotal) setAvisoLeitura(`Nota lida. Valor total na nota: ${brl(d.valorTotal)}${d.destinatarioNome ? ` · destinatário: ${d.destinatarioNome}` : ''}. Confira antes de salvar.`);
    } catch {
      setAvisoLeitura('Falha ao ler o arquivo. Preencha os campos manualmente.');
    } finally {
      setLendoNota(false);
    }
  };

  /* UM caminho so para receber arquivo, venha do seletor ou do arrasto: validar em dois
     lugares seria a segunda copia da regra que ja custou correcoes nesta frente. */
  const receberArquivo = (f: File | null) => {
    if (!f) { setArquivo(null); setAvisoLeitura(null); setSugeridos(new Set()); return; }
    const invalido = motivoArquivoInvalido(f);
    if (invalido) { toast.error(invalido); setArquivo(null); return; }
    setArquivo(f);
    void lerNota(f);
  };

  const marcaSugerido = (campo: string) => (sugeridos.has(campo) ? 'border-primary/60 bg-primary/5' : '');

  /* O emitente E' A CONTRAPARTE por padrao; a divergencia e' que se declara.
     Vazio no formulario significa "a propria contraparte", e a RPC grava NULL. */
  const emitenteSelecionado = form.emitenteId || contraparteId || '';
  const emitenteEhContraparte = !form.emitenteId || form.emitenteId === contraparteId;

  const totais = useMemo(() => {
    let acr = 0, desc = 0, ret = 0, desp = 0;
    for (const c of form.componentes) {
      const v = parseNumericValue(c.valor) || 0;
      if (c.natureza === 'acrescimo') acr += v;
      else if (c.natureza === 'desconto_comercial') desc += v;
      else if (c.natureza === 'retencao_sem_caixa') ret += v;
      else if (c.natureza === 'despesa_desembolso') desp += v;
    }
    return { acr, desc, ret, desp, liquido: acr - desc - ret - desp };
  }, [form.componentes]);

  const setComp = (i: number, patch: Partial<CompRow>) =>
    setForm(f => ({ ...f, componentes: f.componentes.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const addComp = () => setForm(f => ({ ...f, componentes: [...f.componentes, { tipo: 'outros', natureza: 'informativo', valor: '', descricao: '' }] }));
  const rmComp = (i: number) => setForm(f => ({ ...f, componentes: f.componentes.filter((_, j) => j !== i) }));
  const toggleLote = (id: string) =>
    setForm(f => ({ ...f, loteIds: f.loteIds.includes(id) ? f.loteIds.filter(x => x !== id) : [...f.loteIds, id] }));

  const salvar = async () => {
    if (somenteLeitura) return;   // guarda defensiva (além da UI)
    const payload: DocumentoPayload = {
      especie: form.especie,
      numero: form.numero || undefined, serie: form.serie || undefined, chaveAcesso: form.chaveAcesso || undefined,
      dataEmissao: form.dataEmissao || undefined, observacao: form.observacao || undefined, url: form.url || undefined,
      documentoOrigemId: form.especie === 'nf_complementar' ? (form.documentoOrigemId || null) : null,
      /* Sem emitente escolhido, os TRES vao nulos: "e' a propria contraparte" se diz
         com ausencia, nao copiando o id dela para ca. Copiar criaria uma segunda
         verdade que envelheceria sozinha. */
      emitenteId: form.emitenteId || null,
      emitenteNome: form.emitenteId ? (form.emitenteNome || null) : null,
      emitenteDocumento: form.emitenteId ? (form.emitenteDocumento || null) : null,
      componentes: form.componentes
        .filter(c => c.tipo && (parseNumericValue(c.valor) || 0) >= 0 && c.valor.trim() !== '')
        .map((c, i): ComponentePayload => ({ tipo: c.tipo, natureza: c.natureza, valor: parseNumericValue(c.valor) || 0, descricao: c.descricao || undefined, ordem: i + 1 })),
      lotes: form.loteIds,
    };
    /* ⚠ REGISTRAR PRIMEIRO, SUBIR DEPOIS. Subir antes deixaria arquivo ORFAO no bucket
       se o registro falhasse — sem linha, sem dono, sem quem limpe. Nesta ordem, falha no
       upload deixa uma LINHA SEM ARQUIVO: visivel na lista, corrigivel pelo "Anexar".
       Lixo visivel e melhor que lixo invisivel.
       ⚠ O documento fica gravado MESMO se o anexo falhar — por isso `onSaved()` roda nos
       dois casos. Dizer que nao salvou seria mentira, e o usuario tentaria de novo,
       criando um segundo documento. */
    if (form.documentoId) {
      const ok = await api.editar(form.documentoId, form.versao, payload);
      if (!ok) return;
      if (arquivo) await api.anexarArquivo(form.documentoId, form.versao + 1, arquivo);
      onSaved();
      return;
    }
    const novoId = await api.registrar(payload);
    if (!novoId) return;
    // Documento recem-registrado nasce na versao 1.
    if (arquivo) await api.anexarArquivo(novoId, 1, arquivo);
    onSaved();
  };

  const origensPossiveis = api.documentos.filter(d => !d.cancelado && d.documentoId !== form.documentoId);

  /* Criar e' meio trabalho; o contrato e' criar E SELECIONAR — e aqui tambem levar o
     documento, que e' o dado que a nota carrega. */
  const dialogoNovoEmitente = onCriarFornecedor ? (
    <NovoFornecedorDialog
      open={novoFornecedorOpen}
      onClose={() => setNovoFornecedorOpen(false)}
      onSave={async (nome, cpfCnpj) => {
        const rec = await onCriarFornecedor(nome, cpfCnpj);
        if (rec) setForm(f => ({ ...f, emitenteId: rec.id, emitenteNome: rec.nome, emitenteDocumento: cpfCnpj || f.emitenteDocumento }));
        setNovoFornecedorOpen(false);
      }}
    />
  ) : null;

  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      {dialogoNovoEmitente}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-foreground">{form.documentoId ? 'Editar documento' : 'Novo documento'}</div>
          <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px] gap-1" onClick={onCancel}><ArrowLeft className="h-3 w-3" /> Voltar</Button>
        </div>
      )}

      {/* ── O ARQUIVO VEM PRIMEIRO (PR-OC-DOC-EXTRACAO-01 item 0) ────────────────
          Estava na quarta linha, depois de seis campos. Com a leitura automatica isso
          inverte o gesto: o arquivo e' o PONTO DE PARTIDA, e' dele que os campos saem.
          Arrastar-e-soltar porque a nota chega por e-mail ou WhatsApp — arrastar do
          Finder e' menos passos que abrir o seletor.
          ⚠ NAO E' OBSTACULO: sem arquivo o formulario segue manual, e quem nao tem PDF
          digita como sempre digitou. */}
      {!somenteLeitura && (
        <div
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); receberArquivo(e.dataTransfer.files?.[0] ?? null); }}
          className={`rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors ${
            arrastando ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/20'
          }`}>
          <Paperclip className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
          <div className="text-[12px] font-medium text-foreground">
            {arquivo ? arquivo.name : 'Anexe a nota ou recibo'}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {arquivo
              ? `${(arquivo.size / 1024 / 1024).toFixed(1)} MB · arraste outro para substituir`
              : 'Arraste o arquivo aqui, ou escolha abaixo · PDF, JPG ou PNG, até 10 MB'}
          </div>
          <Input type="file" accept="application/pdf,image/jpeg,image/png"
            onChange={e => receberArquivo(e.target.files?.[0] ?? null)}
            className="h-7 text-[11px] file:text-[11px] mt-2 max-w-xs mx-auto" />
          <div className="text-[10px] text-muted-foreground mt-1">
            {lendoNota
              ? 'Lendo a nota…'
              : 'Se for uma NF em PDF, os campos abaixo vêm preenchidos a partir dela — confira antes de salvar.'}
          </div>
          {form.url && !arquivo && (
            <div className="text-[10px] text-muted-foreground mt-1">Já há um arquivo anexado. Enviar outro substitui.</div>
          )}
        </div>
      )}

      {/* O que a leitura conseguiu — ou nao. Nunca silencio: campo errado e silencio
          sao piores que "nao consegui ler". */}
      {avisoLeitura && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] text-foreground">
          {avisoLeitura}
        </div>
      )}

      {/* Cabeçalho do documento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Espécie</label>
          <Select value={form.especie} onValueChange={v => setForm(f => ({ ...f, especie: v as EspecieDoc }))}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>{ESPECIES.map(e => <SelectItem key={e} value={e} className="text-[11px]">{ESPECIE_LABEL[e]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><label className="text-[10px] text-muted-foreground">Número</label><Input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} className={`h-7 text-[11px] ${marcaSugerido('numero')}`} /></div>
        <div><label className="text-[10px] text-muted-foreground">Série</label><Input value={form.serie} onChange={e => setForm(f => ({ ...f, serie: e.target.value }))} className={`h-7 text-[11px] ${marcaSugerido('serie')}`} /></div>
        <div><label className="text-[10px] text-muted-foreground">Emissão</label><Input type="date" value={form.dataEmissao} onChange={e => setForm(f => ({ ...f, dataEmissao: e.target.value }))} className={`h-7 text-[11px] ${marcaSugerido('dataEmissao')}`} /></div>
        <div className="lg:col-span-2"><label className="text-[10px] text-muted-foreground">Chave de acesso</label><Input value={form.chaveAcesso} onChange={e => setForm(f => ({ ...f, chaveAcesso: e.target.value }))} className={`h-7 text-[11px] ${marcaSugerido('chaveAcesso')}`} /></div>
        {/* ── EMITENTE ─────────────────────────────────────────────────────────
            Quem ASSINOU a nota, que nem sempre e quem negociou. Caso real: a
            contraparte intermediou e a nota veio de outra pessoa. Importa alem da
            organizacao — no LCDPR e no Lucro Rural vale o emitente.
            Vazio = a propria contraparte, e a RPC grava NULL. */}
        <div className="lg:col-span-2">
          <Label className="text-[10px] text-muted-foreground">Emitente da nota</Label>
          <div className="flex items-center gap-1">
            <div className="flex-1 min-w-0">
              <Select value={form.emitenteId || '__contraparte__'}
                onValueChange={v => setForm(f => ({
                  ...f,
                  emitenteId: v === '__contraparte__' ? '' : v,
                  emitenteNome: v === '__contraparte__' ? '' : (fornecedores?.find(x => x.id === v)?.nome ?? ''),
                  emitenteDocumento: v === '__contraparte__' ? '' : (fornecedores?.find(x => x.id === v)?.cpfCnpj ?? ''),
                }))}
                disabled={somenteLeitura}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[50vh]">
                  <SelectItem value="__contraparte__" className="text-[11px]">Mesmo da operação</SelectItem>
                  {(fornecedores ?? []).map(f => <SelectItem key={f.id} value={f.id} className="text-[11px]">{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {onCriarFornecedor && !somenteLeitura && (
              <Button type="button" variant="outline" size="icon" className="h-7 w-7 shrink-0"
                aria-label="Novo emitente" title="Cadastrar emitente" onClick={() => setNovoFornecedorOpen(true)}>
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
          {!emitenteEhContraparte && (
            <Input value={form.emitenteDocumento} onChange={e => setForm(f => ({ ...f, emitenteDocumento: e.target.value }))}
              placeholder="CNPJ/CPF impresso na nota" disabled={somenteLeitura} className="h-7 text-[11px] mt-1" />
          )}
        </div>

        {form.especie === 'nf_complementar' && (
          <div className="lg:col-span-2">
            <label className="text-[10px] text-muted-foreground">Documento de origem</label>
            <Select value={form.documentoOrigemId || undefined} onValueChange={v => setForm(f => ({ ...f, documentoOrigemId: v }))}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Selecione o documento original" /></SelectTrigger>
              <SelectContent>
                {origensPossiveis.length === 0 && <div className="px-2 py-1 text-[11px] text-muted-foreground">Nenhum documento ativo</div>}
                {origensPossiveis.map(d => <SelectItem key={d.documentoId} value={d.documentoId} className="text-[11px]">{ESPECIE_LABEL[d.especie]} {d.numero ?? d.documentoId.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="lg:col-span-2"><label className="text-[10px] text-muted-foreground">Observação</label><Input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} className="h-7 text-[11px]" /></div>
      </div>

      {/* Componentes */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-muted-foreground">Componentes</div>
          <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={addComp}><Plus className="h-3 w-3" /> Adicionar</Button>
        </div>
        <div className="grid grid-cols-[1.1fr_1.2fr_0.9fr_1.4fr_auto] gap-1 px-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
          <span>Tipo</span><span>Natureza</span><span className="text-right">Valor</span><span>Descrição</span><span></span>
        </div>
        {form.componentes.map((c, i) => (
          <div key={i} className="grid grid-cols-[1.1fr_1.2fr_0.9fr_1.4fr_auto] gap-1 items-center">
            <Select value={c.tipo} onValueChange={v => setComp(i, { tipo: v })}>
              <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map(t => <SelectItem key={t.value} value={t.value} className="text-[11px]">{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={c.natureza} onValueChange={v => setComp(i, { natureza: v as NaturezaComp })}>
              <SelectTrigger className="h-6 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>{NATUREZAS.map(n => <SelectItem key={n} value={n} className="text-[11px]">{NATUREZA_LABEL[n]}</SelectItem>)}</SelectContent>
            </Select>
            <Input inputMode="decimal" value={c.valor} onChange={e => setComp(i, { valor: e.target.value })} placeholder="0,00" className="h-6 text-[11px] text-right tabular-nums" />
            <Input value={c.descricao} onChange={e => setComp(i, { descricao: e.target.value })} placeholder="opcional" className="h-6 text-[11px]" />
            <button type="button" onClick={() => rmComp(i)} className="text-muted-foreground/60 hover:text-destructive" aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>

      {/* Totais em tempo real (fórmula da view) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-1 rounded-md border bg-muted/20 px-2 py-1 text-[11px]">
        <div><div className="text-[9px] text-muted-foreground">Acréscimos</div><div className="tabular-nums">{brl(totais.acr)}</div></div>
        <div><div className="text-[9px] text-muted-foreground">Descontos com.</div><div className="tabular-nums">− {brl(totais.desc)}</div></div>
        <div><div className="text-[9px] text-muted-foreground">Retenções s/ caixa</div><div className="tabular-nums">− {brl(totais.ret)}</div></div>
        <div><div className="text-[9px] text-muted-foreground">Despesas</div><div className="tabular-nums">− {brl(totais.desp)}</div></div>
        <div><div className="text-[9px] text-muted-foreground">Valor líquido</div><div className="font-bold text-primary tabular-nums">{brl(totais.liquido)}</div></div>
      </div>

      {/* Lotes vinculados (opcional/múltiplo) */}
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-muted-foreground">Lotes vinculados (opcional)</div>
        <div className="flex flex-wrap gap-1">
          {api.lotes.length === 0 && <span className="text-[11px] text-muted-foreground">Nenhum lote na operação.</span>}
          {api.lotes.map(l => {
            const on = form.loteIds.includes(l.loteId);
            return (
              <button key={l.loteId} type="button" onClick={() => toggleLote(l.loteId)}
                className={`rounded border px-2 py-0.5 text-[10px] ${on ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-muted/20 text-muted-foreground'}`}>
                Lote {l.ordem}{l.categoria ? ` · ${l.categoria}` : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={onCancel}>Cancelar</Button>
        <Button type="button" size="sm" className="h-7 text-[11px] gap-1" disabled={api.saving || somenteLeitura} onClick={() => void salvar()}>
          <FileText className="h-3 w-3" /> {api.saving ? 'Salvando…' : (form.documentoId ? 'Salvar alterações' : 'Registrar documento')}
        </Button>
      </div>
    </div>
  );
}
