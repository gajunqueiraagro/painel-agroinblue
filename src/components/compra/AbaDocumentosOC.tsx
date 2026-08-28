import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Ban, Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DocumentosApi } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO, ESPECIE_LABEL, brl, type FormState } from './DocumentoFormOC';

// Aba Documentos (PR-OC-DOC-UI-01). Tela OFICIAL de consulta e manutenção completa. O cadastro/edição
//   é o form REUTILIZÁVEL DocumentoFormOC (mesma persistência/validação usada pelo registro rápido na
//   aba Recebimento). Rótulos amigáveis; totalização pela fórmula da view. Sem upload.
interface Props {
  api: DocumentosApi; operacaoPronta: boolean; somenteLeitura?: boolean;
  /* Emitente: lista, default e cadastro rapido — repassados ao formulario. */
  fornecedores?: { id: string; nome: string; cpfCnpj?: string | null }[];
  contraparteId?: string | null;
  clienteId?: string | null;
  recarregarFornecedores?: () => void | Promise<void>;
}

const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

export function AbaDocumentosOC({ api, operacaoPronta, somenteLeitura, fornecedores, contraparteId, clienteId, recarregarFornecedores }: Props) {
  /* Cadastro rapido do emitente — MESMO mecanismo de AbaCompromissosOC:1 insert direto e
     `recarregar` da lista que o alimenta. Nao ha segundo cadastro nem segunda lista; a
     fonte e a mesma `liquidacaoApi`.
     ⚠ `ativo` fora do insert de proposito (DEFAULT true) e `fazenda_id` nulo, que o banco
     aceita — a lista filtra so por cliente e ativo. */
  const criarFornecedor = async (nome: string, cpfCnpj: string): Promise<{ id: string; nome: string } | null> => {
    if (!clienteId) { toast.error('Cliente não identificado.'); return null; }
    const { data, error } = await supabase
      .from('financeiro_fornecedores')
      .insert({ cliente_id: clienteId, nome, cpf_cnpj: cpfCnpj || null })
      .select('id, nome').single();
    if (error || !data) { toast.error('Erro ao salvar emitente'); return null; }
    try { await recarregarFornecedores?.(); } catch { /* o registro existe; a lista volta no proximo refresh */ }
    toast.success(`Emitente "${data.nome}" criado e selecionado`);
    return data;
  };
  const [modo, setModo] = useState<'lista' | 'form'>('lista');
  const [formInicial, setFormInicial] = useState<FormState>(FORM_VAZIO);
  const [formKey, setFormKey] = useState(0);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');

  if (!operacaoPronta) {
    return (
      <div className="rounded-md border border-dashed bg-muted/10 px-3 py-5 text-center text-[11px] text-muted-foreground">
        Salve a operação na aba Compra para registrar documentos.
      </div>
    );
  }

  /* ABRIR o arquivo: o bucket e PRIVADO, entao link direto nao funciona — a url guardada
     e o CAMINHO, nao um endereco. Assina na hora e abre em aba nova. */
  const abrirArquivo = async (caminho: string) => {
    const url = await api.urlAssinada(caminho);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const abrirNovo = () => { setFormInicial(FORM_VAZIO); setFormKey(k => k + 1); setModo('form'); };
  const abrirEdicao = async (docId: string) => {
    const d = await api.carregarDetalhe(docId);
    if (!d) return;
    setFormInicial({
      documentoId: d.documentoId, versao: d.versao, especie: d.especie, numero: d.numero, serie: d.serie,
      chaveAcesso: d.chaveAcesso, dataEmissao: d.dataEmissao, observacao: d.observacao, url: d.url,
      documentoOrigemId: d.documentoOrigemId ?? '',
      emitenteId: d.emitenteId ?? '', emitenteNome: d.emitenteNome, emitenteDocumento: d.emitenteDocumento,
      componentes: d.componentes.length
        ? d.componentes.map(c => ({ tipo: c.tipo, natureza: c.natureza, valor: String(c.valor), descricao: c.descricao ?? '' }))
        : [{ tipo: 'valor_bruto', natureza: 'acrescimo', valor: '', descricao: '' }],
      loteIds: d.loteIds,
    });
    setFormKey(k => k + 1);
    setModo('form');
  };

  const confirmarCancelamento = async () => {
    if (somenteLeitura) return;   // guarda defensiva (além da UI)
    if (!cancelId || !cancelMotivo.trim()) return;
    const ok = await api.cancelar(cancelId, cancelMotivo.trim());
    if (ok) { setCancelId(null); setCancelMotivo(''); }
  };

  // ── FORM (reutiliza o componente extraído) ──
  if (modo === 'form') {
    return (
      <DocumentoFormOC
        key={formKey}
        api={api}
        somenteLeitura={somenteLeitura}
        fornecedores={fornecedores}
        contraparteId={contraparteId}
        onCriarFornecedor={clienteId ? criarFornecedor : undefined}
        initialForm={formInicial}
        onSaved={() => setModo('lista')}
        onCancel={() => setModo('lista')}
      />
    );
  }

  // ── LISTA ──
  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold text-foreground">Documentos da operação</div>
        {!somenteLeitura && (
          <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={abrirNovo}><Plus className="h-3 w-3" /> Novo documento</Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="[&>th]:px-2 [&>th]:py-1 [&>th]:font-medium [&>th]:text-left [&>th]:whitespace-nowrap">
              <th>Espécie</th><th>Número</th><th>Série</th><th>Emissão</th><th className="!text-right">Líquido</th>
              <th>Emitente</th>
              <th className="!text-right">Comp.</th><th className="!text-right">Lotes</th><th>Arquivo</th><th>Situação</th><th className="!text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {api.documentos.length === 0 && (
              <tr><td colSpan={11} className="px-2 py-4 text-center text-muted-foreground">{api.loading ? 'Carregando…' : 'Nenhum documento.'}</td></tr>
            )}
            {api.documentos.map(d => (
              <tr key={d.documentoId} className={`border-t [&>td]:px-2 [&>td]:py-1 ${d.cancelado ? 'opacity-60' : ''}`}>
                <td className="whitespace-nowrap">
                  {ESPECIE_LABEL[d.especie]}
                  {d.especie === 'nf_complementar' && d.documentoOrigemId && (
                    <span className="ml-1 rounded bg-amber-100 text-amber-700 px-1 text-[9px]">complementa {d.documentoOrigemId.slice(0, 8)}</span>
                  )}
                </td>
                <td>{d.numero ?? '—'}</td>
                <td>{d.serie ?? '—'}</td>
                <td className="whitespace-nowrap">{fmtData(d.dataEmissao)}</td>
                <td className="text-right tabular-nums font-semibold">{brl(d.valorLiquido)}</td>
                {/* ⚠ SEM emitente proprio NAO e' ausencia: significa que quem emitiu foi a
                    propria contraparte. Imprimir "—" faria o operador procurar um dado
                    que esta ali, so que no cabecalho da operacao. */}
                <td className="max-w-[160px] truncate" title={d.emitenteNome ?? 'Mesmo da operação'}>
                  {d.emitenteNome ?? <span className="text-muted-foreground">Mesmo da operação</span>}
                </td>
                <td className="text-right tabular-nums">{d.qtdComponentes}</td>
                <td className="text-right tabular-nums">{d.qtdLotes}</td>
                {/* ⚠ DOCUMENTO SEM ARQUIVO E' UM ESTADO REAL, nao um erro escondido: o fluxo
                    registra primeiro e sobe depois, entao uma falha no upload deixa a
                    linha sem anexo. Dizer isso na tela — e oferecer o conserto — e' o
                    que impede o operador de achar que deu tudo certo. */}
                <td className="whitespace-nowrap">
                  {d.url ? (
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1"
                      onClick={() => void abrirArquivo(d.url!)}>
                      <Paperclip className="h-3 w-3" /> Abrir
                    </Button>
                  ) : d.cancelado ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="text-[10px] text-amber-700 dark:text-amber-500">sem arquivo</span>
                  )}
                </td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.cancelado ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {d.situacao === 'cancelado' ? 'Cancelado' : 'Ativo'}
                  </span>
                </td>
                <td className="text-right whitespace-nowrap">
                  {!somenteLeitura && !d.cancelado && (
                    <span className="inline-flex gap-1">
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1" onClick={() => void abrirEdicao(d.documentoId)}><Pencil className="h-3 w-3" /> Editar</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] gap-1 text-muted-foreground hover:text-destructive" onClick={() => { setCancelId(d.documentoId); setCancelMotivo(''); }}><Ban className="h-3 w-3" /> Cancelar</Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cancelamento com motivo obrigatório */}
      {cancelId && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-rose-700">Cancelar documento (lógico — permanece visível)</div>
          <Input value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-7 text-[11px]" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => { setCancelId(null); setCancelMotivo(''); }}>Voltar</Button>
            <Button type="button" variant="destructive" size="sm" className="h-6 text-[11px]" disabled={api.saving || !cancelMotivo.trim() || somenteLeitura} onClick={() => void confirmarCancelamento()}>Confirmar cancelamento</Button>
          </div>
        </div>
      )}
    </div>
  );
}
