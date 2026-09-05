/**
 * A aba Documentos de um lançamento financeiro.
 *
 * ⚠ IRMÃ DE `AbaDocumentosOC`, NÃO A MESMA — decisão do Gabriel (97b, opção b). O
 * documento da OC tem componentes (acréscimo, desconto comercial, retenção) e lotes; o do
 * lançamento é uma linha com um valor. Unificar as duas telas obrigaria a tornar opcional
 * metade do que aquele componente é, e Compra/Venda/Abate pagariam por uma tela que não é
 * delas. O que se duplica aqui é APARÊNCIA (padrão A18); a REGRA — o confronto — mora no
 * banco e é lida, nunca recalculada.
 *
 * ⚠ O TOPO NUNCA SOMA. `fin_documento_confronto` devolve documentado, valor do lançamento,
 * diferença e o `confere`; a tela só formata. Somar aqui criaria a segunda resposta para a
 * mesma pergunta.
 *
 * ⚠ DIFERENÇA É INFORMAÇÃO, NÃO ALARME. Nota complementar, adiantamento e frete por fora
 * fazem o documentado divergir do lançado sem que nada esteja errado — por isso âmbar e
 * uma frase, não vermelho e um bloqueio.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { DatePicker } from '@/components/ui/date-picker';
import { Paperclip, Pencil, Ban, Plus, X } from 'lucide-react';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  ESPECIES_LANC_DOC, especieValida, type EspecieLancDoc, type LancDocumento, type LancDocPayload,
  type LancamentoDocumentosApi,
} from '@/hooks/useLancamentoDocumentos';

const rotuloEspecie = (e: EspecieLancDoc) =>
  ESPECIES_LANC_DOC.find(x => x.value === e)?.label ?? 'Outro';

/** A identidade da linha — A18: sem número próprio, o rótulo do tipo SOBE para cá. */
function identidade(d: LancDocumento): string {
  const base = d.especie === 'nf' ? 'NF' : rotuloEspecie(d.especie);
  if (!d.numero) return base;
  return d.serie ? `${base} ${d.numero} · série ${d.serie}` : `${base} ${d.numero}`;
}

const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

export function AbaDocumentosLancamento({ api, somenteLeitura, fornecedores }: {
  api: LancamentoDocumentosApi;
  somenteLeitura?: boolean;
  fornecedores: { id: string; nome: string }[];
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<LancDocumento | null>(null);
  const [cancelando, setCancelando] = useState<LancDocumento | null>(null);
  const [motivo, setMotivo] = useState('');

  const c = api.confronto;
  const ativos = api.documentos.filter(d => !d.cancelado);

  const abrirArquivo = async (d: LancDocumento) => {
    if (!d.url) return;
    const url = await api.urlAssinada(d.url);
    if (!url) { toast.error('Não foi possível abrir o arquivo.'); return; }
    window.open(url, '_blank', 'noopener');
  };

  const confirmarCancelamento = async () => {
    if (!cancelando) return;
    /* ⚠ MOTIVO OBRIGATÓRIO: cancelar um documento é o que a auditoria vai mostrar daqui a
       um ano, e "cancelado sem motivo" é um registro que não explica nada. */
    if (!motivo.trim()) { toast.error('Informe o motivo do cancelamento.'); return; }
    try {
      await api.cancelar(cancelando.id, motivo.trim());
      toast.success('Documento cancelado.');
      setCancelando(null); setMotivo('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar o documento.');
    }
  };

  return (
    <div className="space-y-2">
      {/* ── TOPO: o confronto, vindo do banco ─────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2 rounded-md border bg-muted/20 px-3.5 py-[11px]">
        <div>
          <div className="text-[11px] text-muted-foreground leading-none">Documentado</div>
          <div className="mt-1 text-[20px] font-medium leading-none tabular-nums">
            {c ? formatMoeda(c.valorDocumentado) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground leading-none">Valor do lançamento</div>
          <div className="mt-1 text-[20px] font-medium leading-none tabular-nums">
            {c ? formatMoeda(c.valorLancamento) : '—'}
          </div>
        </div>
        {c && c.docsComValor > 0 && (
          c.confere
            ? <div className="text-[11px] font-medium text-emerald-600">confere</div>
            : <div className="text-[11px] font-medium text-amber-700">
                {formatMoeda(Math.abs(c.diferenca))} {c.diferenca > 0 ? 'a mais' : 'a menos'}
              </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {ativos.length === 0 ? 'Nenhum documento anexado'
            : `${ativos.length} ${ativos.length === 1 ? 'documento' : 'documentos'}`}
        </span>
        <Button type="button" size="sm" className="h-7 gap-1 px-2.5 text-[11px]"
          disabled={somenteLeitura} onClick={() => { setEditando(null); setFormAberto(true); }}>
          <Plus className="h-3.5 w-3.5" /> Adicionar documento
        </Button>
      </div>

      {/* ── LISTA A18 ─────────────────────────────────────────────────────────── */}
      {api.documentos.length > 0 && (
        <div className="divide-y rounded-md border">
          {api.documentos.map(d => (
            <div key={d.id} className="flex items-center gap-2 px-3.5 py-[7px] leading-[1.35]">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium text-foreground">{identidade(d)}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {/* ⚠ SEM ARQUIVO É AVISO, NÃO ERRO: registrar primeiro e anexar depois é
                      um caminho legítimo, e a linha diz o que falta em vez de esconder. */}
                  {!d.url && !d.cancelado
                    ? <span className="text-amber-700">sem arquivo</span>
                    : [d.emitenteNome, dataBr(d.dataEmissao)].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
              <div className="shrink-0 text-right text-[12px] font-medium tabular-nums">
                {d.valorDocumento == null ? '—' : formatMoeda(d.valorDocumento)}
              </div>
              {d.cancelado ? (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground"
                  title={d.canceladoMotivo ?? undefined}>Cancelado</span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] text-emerald-700">Ativo</span>
              )}
              {/* Documento cancelado não tem ações: é história, não trabalho pendente. */}
              {!d.cancelado && (
                <div className="flex shrink-0 items-center gap-2.5 text-muted-foreground">
                  <button type="button" title={d.url ? 'Abrir arquivo' : 'Sem arquivo anexado'}
                    aria-label="Abrir arquivo" disabled={!d.url}
                    onClick={() => abrirArquivo(d)}
                    className="hover:text-foreground disabled:opacity-30">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Editar documento" aria-label="Editar documento"
                    disabled={somenteLeitura} onClick={() => { setEditando(d); setFormAberto(true); }}
                    className="hover:text-foreground disabled:opacity-30">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" title="Cancelar documento" aria-label="Cancelar documento"
                    disabled={somenteLeitura} onClick={() => { setCancelando(d); setMotivo(''); }}
                    className="hover:text-destructive disabled:opacity-30">
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formAberto && (
        <FormDocumento api={api} documento={editando} fornecedores={fornecedores}
          onFechar={() => { setFormAberto(false); setEditando(null); }} />
      )}

      {cancelando && (
        <Dialog open onOpenChange={(o) => { if (!o) { setCancelando(null); setMotivo(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogTitle className="text-[14px]">Cancelar documento</DialogTitle>
            <DialogDescription className="text-[11px]">
              {identidade(cancelando)} — o documento sai do confronto e fica registrado como cancelado.
            </DialogDescription>
            <Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Motivo do cancelamento" className="text-[12px]" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost"
                onClick={() => { setCancelando(null); setMotivo(''); }}>Voltar</Button>
              <Button type="button" onClick={confirmarCancelamento} disabled={api.saving}>Cancelar documento</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** O formulário — registrar ou editar. O arquivo entra depois que o documento existe. */
function FormDocumento({ api, documento, fornecedores, onFechar }: {
  api: LancamentoDocumentosApi;
  documento: LancDocumento | null;
  fornecedores: { id: string; nome: string }[];
  onFechar: () => void;
}) {
  const [especie, setEspecie] = useState<EspecieLancDoc>(documento?.especie ?? 'nf');
  const [numero, setNumero] = useState(documento?.numero ?? '');
  const [serie, setSerie] = useState(documento?.serie ?? '');
  const [dataEmissao, setDataEmissao] = useState(documento?.dataEmissao ?? '');
  const [valor, setValor] = useState<number | null>(documento?.valorDocumento ?? null);
  const [emitenteId, setEmitenteId] = useState(documento?.emitenteId ?? '');
  const [emitenteNome, setEmitenteNome] = useState(documento?.emitenteNome ?? '');
  const [emitenteDoc, setEmitenteDoc] = useState(documento?.emitenteDocumento ?? '');
  const [chave, setChave] = useState(documento?.chaveAcesso ?? '');
  const [observacao, setObservacao] = useState(documento?.observacao ?? '');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  const OUTRO = '__outro__';
  const emitenteEhOutro = emitenteId === OUTRO;

  const payload = (): LancDocPayload => ({
    especie,
    numero: numero.trim() || null,
    serie: serie.trim() || null,
    /* A chave só existe em nota fiscal — guardá-la noutra espécie seria dado sem dono. */
    chaveAcesso: especie === 'nf' ? (chave.trim() || null) : null,
    dataEmissao: dataEmissao || null,
    valorDocumento: valor,
    observacao: observacao.trim() || null,
    emitenteId: emitenteEhOutro ? null : (emitenteId || null),
    emitenteNome: emitenteEhOutro ? (emitenteNome.trim() || null)
      : (fornecedores.find(f => f.id === emitenteId)?.nome ?? null),
    emitenteDocumento: emitenteEhOutro ? (emitenteDoc.trim() || null) : null,
  });

  const salvar = async () => {
    setEnviando(true);
    try {
      let id = documento?.id ?? null;
      let versao = documento?.versao ?? 1;
      if (documento) {
        await api.editar(documento.id, documento.versao, payload());
        versao = documento.versao + 1;
      } else {
        id = await api.registrar(payload());
        if (!id) { toast.error('Não foi possível registrar o documento.'); return; }
        versao = 1;
      }
      if (arquivo && id) await api.anexar(id, versao, arquivo);
      toast.success(documento ? 'Documento atualizado.' : 'Documento registrado.');
      onFechar();
    } catch (e) {
      /* ⚠ A MENSAGEM DA RPC, INTEIRA: ela nomeia o que recusou (espécie inválida, versão
         em conflito, lançamento cancelado). Trocá-la por "erro ao salvar" apagaria a única
         pista que o operador tem. */
      toast.error(e instanceof Error ? e.message : 'Falha ao salvar o documento.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="bg-primary px-4 py-2.5 text-primary-foreground flex items-center justify-between">
          <DialogTitle className="text-[14px] font-semibold">
            {documento ? 'Editar documento' : 'Novo documento'}
          </DialogTitle>
          <button type="button" onClick={onFechar} title="Fechar" aria-label="Fechar"
            className="text-white/80 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <DialogDescription className="sr-only">
          Informe espécie, número, data, valor e emitente do documento deste lançamento.
        </DialogDescription>

        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div>
            <Label className="text-[10px]">Espécie <span className="text-destructive">*</span></Label>
            <Select value={especie} onValueChange={v => setEspecie(especieValida(v))}>
              <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ESPECIES_LANC_DOC.map(e => (
                  <SelectItem key={e.value} value={e.value} className="text-[12px]">{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Número</Label>
            <Input value={numero} onChange={e => setNumero(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div>
            <Label className="text-[10px]">Série</Label>
            <Input value={serie} onChange={e => setSerie(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div>
            <Label className="text-[10px]">Data de emissão</Label>
            <DatePicker value={dataEmissao} onChange={setDataEmissao} className="h-8 text-[12px] mt-0.5" />
          </div>
          <div>
            <Label className="text-[10px]">Valor do documento</Label>
            <CampoMoeda valor={valor} onChange={setValor} className="h-8 text-[12px] mt-0.5 text-right" />
          </div>
          <div>
            <Label className="text-[10px]">Emitente</Label>
            <Select value={emitenteId || undefined} onValueChange={setEmitenteId}>
              <SelectTrigger className="h-8 text-[12px] mt-0.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {fornecedores.map(f => (
                  <SelectItem key={f.id} value={f.id} className="text-[12px]">{f.nome}</SelectItem>
                ))}
                <SelectItem value={OUTRO} className="text-[12px]">Outro (informar)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {emitenteEhOutro && (<>
            <div>
              <Label className="text-[10px]">Nome do emitente</Label>
              <Input value={emitenteNome} onChange={e => setEmitenteNome(e.target.value)}
                className="h-8 text-[12px] mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">CNPJ / CPF do emitente</Label>
              <Input value={emitenteDoc} onChange={e => setEmitenteDoc(e.target.value)}
                className="h-8 text-[12px] mt-0.5" />
            </div>
          </>)}
          {especie === 'nf' && (
            <div className="col-span-2">
              <Label className="text-[10px]">Chave de acesso</Label>
              <Input value={chave} onChange={e => setChave(e.target.value)}
                className="h-8 text-[12px] mt-0.5 font-mono" placeholder="44 dígitos" />
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-[10px]">Observação</Label>
            <Input value={observacao} onChange={e => setObservacao(e.target.value)}
              className="h-8 text-[12px] mt-0.5" placeholder="Opcional" />
          </div>
          <div className="col-span-2">
            <Label className="text-[10px]">Arquivo</Label>
            <Input type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              className="h-8 text-[11px] mt-0.5 file:text-[11px]" />
            <p className="mt-1 text-[10px] text-muted-foreground">
              PDF, JPG ou PNG, até 10 MB. Pode ficar para depois — o documento aparece na lista dizendo “sem arquivo”.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-card px-4 py-2.5">
          <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button type="button" onClick={salvar} disabled={enviando || api.saving}>
            {documento ? 'Salvar documento' : 'Registrar documento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
