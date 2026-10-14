import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Ban, Paperclip, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DocumentosApi, EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO, ESPECIE_LABEL, brl, fmtNumeroDoc, type FormState } from './DocumentoFormOC';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { DocumentoFormAbate } from './DocumentoFormAbate';
import { formAbateDoDetalhe, formAbateVazio, type FormAbate } from '@/lib/oc/formDocumentoAbate';
import { ROTULO_SEGMENTO } from '@/lib/oc/camposDaEspecie';
import { formatCasas } from '@/lib/calculos/numeroBR';

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
  /* `valor_acordado` da operacao — a ancora contra a qual o documentado se confronta.
     Nulo = operacao ainda sem valor negociado; o confronto nao acontece. */
  valorNegociado?: number | null;
  /** OC-DOC-ESPECIE-ABATE-01 passo 2 — 'abate' troca o formulario pela grade por especie e a lista pela tabela do abate.
   *  Ausente: compra e venda, como sempre. */
  tipoOperacao?: string | null;
}

const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/* Prefixo CURTO na identidade da linha, ao lado do numero: "NF 007.086.649" se le de
   uma vez. O rotulo por extenso (ESPECIE_LABEL) fica para quando NAO ha numero e a
   especie precisa carregar a linha sozinha. */
const PREFIXO_ESPECIE: Record<EspecieDoc, string> = {
  nf_principal: 'NF', nf_complementar: 'NF compl.', recibo: 'Recibo', outro: 'Doc.',
  npr: 'NPR', acerto: 'Acerto', romaneio: 'Romaneio',
};

/* "2 notas · 1 recibo". Conta o que ESTA VALENDO; cancelado vira um termo proprio, e
   nao um documento a menos escondido na contagem. */
const CONTAGEM_ROTULO: Record<EspecieDoc, [string, string]> = {
  nf_principal: ['nota', 'notas'], nf_complementar: ['nota compl.', 'notas compl.'],
  recibo: ['recibo', 'recibos'], outro: ['outro documento', 'outros documentos'],
  npr: ['NPR', 'NPRs'], acerto: ['acerto', 'acertos'], romaneio: ['romaneio', 'romaneios'],
};

export function AbaDocumentosOC({ api, operacaoPronta, somenteLeitura, fornecedores, contraparteId, clienteId, recarregarFornecedores, valorNegociado, tipoOperacao }: Props) {
  const ehAbate = tipoOperacao === 'abate';
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
    notificarFornecedoresMudaram(clienteId);
    try { await recarregarFornecedores?.(); } catch { /* o registro existe; a lista volta no proximo refresh */ }
    toast.success(`Emitente "${data.nome}" criado e selecionado`);
    return data;
  };

  /* GRAVA o CNPJ da nota num fornecedor QUE JA EXISTE — o que completa o cadastro pelo
     uso. Mesmo caminho de escrita do "+": update direto na tabela, sem RPC nova.
     ⚠ SO E' CHAMADA COM AVAL EXPLICITO do operador. Nome parecido nao e' prova — "Joao
     Silva" pode ser dois — entao a tela pergunta e so aqui grava. */
  const gravarDocumentoFornecedor = async (fornecedorId: string, cpfCnpj: string): Promise<boolean> => {
    if (!clienteId) { toast.error('Cliente não identificado.'); return false; }
    const { error } = await supabase
      .from('financeiro_fornecedores')
      .update({ cpf_cnpj: cpfCnpj })
      .eq('id', fornecedorId).eq('cliente_id', clienteId);
    if (error) { toast.error('Não foi possível gravar o documento no cadastro.'); return false; }
    notificarFornecedoresMudaram(clienteId);
    try { await recarregarFornecedores?.(); } catch { /* gravou; a lista volta no proximo refresh */ }
    toast.success('Documento gravado no cadastro do fornecedor.');
    return true;
  };
  const [modo, setModo] = useState<'lista' | 'form'>('lista');
  const [formInicial, setFormInicial] = useState<FormState>(FORM_VAZIO);
  const [formAbateInicial, setFormAbateInicial] = useState<FormAbate>(() => formAbateVazio());
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

  const abrirNovo = () => { setFormInicial(FORM_VAZIO); setFormAbateInicial(formAbateVazio()); setFormKey(k => k + 1); setModo('form'); };
  const abrirEdicao = async (docId: string) => {
    const d = await api.carregarDetalhe(docId);
    if (!d) return;
    if (ehAbate) { setFormAbateInicial(formAbateDoDetalhe(d)); setFormKey(k => k + 1); setModo('form'); return; }
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
  if (modo === 'form' && ehAbate) {
    return (
      <DocumentoFormAbate
        key={formKey}
        api={api}
        somenteLeitura={somenteLeitura}
        fornecedores={fornecedores}
        clienteId={clienteId ?? null}
        contraparteId={contraparteId}
        onCriarFornecedor={clienteId ? criarFornecedor : undefined}
        onGravarDocumentoFornecedor={clienteId ? gravarDocumentoFornecedor : undefined}
        initialForm={formAbateInicial}
        onSaved={() => setModo('lista')}
        onCancel={() => setModo('lista')}
      />
    );
  }
  if (modo === 'form') {
    return (
      <DocumentoFormOC
        key={formKey}
        api={api}
        somenteLeitura={somenteLeitura}
        fornecedores={fornecedores}
        clienteId={clienteId ?? null}
        contraparteId={contraparteId}
        onCriarFornecedor={clienteId ? criarFornecedor : undefined}
        onGravarDocumentoFornecedor={clienteId ? gravarDocumentoFornecedor : undefined}
        initialForm={formInicial}
        onSaved={() => setModo('lista')}
        onCancel={() => setModo('lista')}
      />
    );
  }

  /* A contraparte SEMPRE esta em `fornecedores`: `useOperacaoLiquidacao` poe o
     `contraparte_id` em `idsEmUso` e a busca mesmo quando o filtro `ativo` a deixaria de
     fora. Mesma origem que o formulario usa — nao ha segunda lista nem prop nova. */
  const contraparte = (fornecedores ?? []).find(f => f.id === contraparteId) ?? null;

  const ativos = api.documentos.filter(d => !d.cancelado);
  const totalDocumentado = ativos.reduce((s, d) => s + d.valorLiquido, 0);

  /* ⚠ TOLERANCIA DE R$ 0,01, a mesma regra canonica de saldo da OC (PR-OC2-SALDO):
     centavo de arredondamento entre a soma dos componentes e o valor acordado nao e'
     divergencia, e apontar um por um treinaria o operador a ignorar o aviso. */
  const diferenca = valorNegociado == null ? null : valorNegociado - totalDocumentado;
  const confronto = diferenca == null || ativos.length === 0 ? null
    : Math.abs(diferenca) <= 0.01
      ? { ok: true, texto: 'confere' }
      : { ok: false, texto: diferenca > 0 ? `faltam ${brl(diferenca)}` : `sobram ${brl(-diferenca)}` };

  const contagem = (Object.keys(CONTAGEM_ROTULO) as EspecieDoc[])
    .map(e => ({ n: ativos.filter(d => d.especie === e).length, r: CONTAGEM_ROTULO[e] }))
    .filter(x => x.n > 0)
    .map(x => `${x.n} ${x.n === 1 ? x.r[0] : x.r[1]}`);
  const cancelados = api.documentos.length - ativos.length;
  if (cancelados > 0) contagem.push(`${cancelados} cancelado${cancelados > 1 ? 's' : ''}`);

  // ── LISTA ──
  return (
    <div className="rounded-md border bg-card p-2 shadow-sm space-y-2 min-w-0">
      {/* ── A21 — O CABECALHO NAO ROLA ────────────────────────────────────────────
          ⚠ NAO BASTA O `sticky`. Na primeira versao ele grudava no CORPO DO MODAL, que
          era justamente o que rolava: o cabecalho ficava, e o Resumo da operacao subia e
          sumia junto com o resto. O conserto foi mover a ROLAGEM para a coluna de
          conteudo (CompraModalShell:348) — aqui o `sticky` continua igual, mas agora se
          ancora numa coluna que nao arrasta o resumo consigo.
          ⚠ FUNDO OPACO OBRIGATORIO (`bg-card`, o mesmo do cartao): transparente deixaria
          as linhas passarem por baixo do titulo e do confronto.
          ⚠ `-mt-2 pt-2` cobre o padding superior do cartao. Sem isso sobra uma faixa de
          8px acima do bloco fixo por onde as linhas apareceriam ao rolar. So no eixo
          vertical: margem negativa lateral comeria as bordas do cartao. */}
      <div className="sticky top-0 z-10 -mt-2 space-y-2 border-b bg-card pt-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-foreground min-w-0 truncate">Documentos da operação</span>
          <div className="flex items-center gap-2 shrink-0">
            {contagem.length > 0 && (
              <span className="text-[10px] text-muted-foreground">{contagem.join(' · ')}</span>
            )}
            {!somenteLeitura && (
              <Button type="button" variant="outline" size="sm" className="h-[22px] px-[9px] text-[10px] font-medium gap-1" onClick={abrirNovo}><Plus className="h-3 w-3" /> Novo documento</Button>
            )}
          </div>
        </div>
        {/* ── CONFRONTO: DOCUMENTADO x NEGOCIADO ───────────────────────────────────
            A lista dizia quais documentos existem; nao dizia se eles COBREM a operacao.
            ⚠ INFORMACAO, NAO ERRO. Nao bloqueia e nao alarma: nota complementar, nota
            parcial e entrega em remessas fazem a diferenca ser legitima. Por isso a
            divergencia e' um numero em ambar, nao um aviso vermelho.
            ⚠ SEM DOCUMENTO ATIVO NAO HA CONFRONTO. Os dois numeros continuam a vista —
            o negociado e' justamente a referencia de quanto falta documentar —, mas
            "falta R$ 495.000,00" antes de existir qualquer documento nao compara coisa
            alguma: anuncia que a operacao acabou de comecar.
            ⚠ `valorNegociado` nulo e' AUSENCIA e imprime "—" (sentinela do CLAUDE.md):
            operacao sem valor_acordado ainda nao tem com o que confrontar. */}
        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/20 px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground leading-none">Total documentado</div>
            <div className="mt-0.5 text-[15px] font-medium tabular-nums leading-none">{brl(totalDocumentado)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-muted-foreground leading-none">Negociado</div>
            <div className="mt-0.5 text-[15px] font-medium tabular-nums leading-none">
              {valorNegociado == null ? <span className="text-muted-foreground">—</span> : brl(valorNegociado)}
              {confronto && (
                <span className={`ml-2 text-[11px] font-normal ${confronto.ok
                  ? 'text-emerald-700 dark:text-emerald-500'
                  : 'text-amber-700 dark:text-amber-500'}`}>{confronto.texto}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── LISTA DENSA DE REGISTROS (PR-OC-DOC-TABELA-02 · padrao A18) ───────────
          SEM TABELA E SEM CABECALHO DE COLUNA. A versao em colunas somava ~996px
          contra os 812px reais da coluna de conteudo (1152 do max-w-6xl, menos p-4,
          gap-3, os 280px da lateral e o p-2 do card), e a barra horizontal que sobrava
          ficava POR CIMA da ultima linha, cobrindo "Ativo", "Editar" e "Cancelar".
          Coluna alguma resolve isso em tela estreita: em duas alturas, a linha cabe
          sempre, porque o contexto desce em vez de disputar largura.
          Linha 1 IDENTIDADE (13px/500): o numero da nota — e' por ele que se procura.
          Linha 2 CONTEXTO (11px cinza): emitente e data.
          ⚠ NAO SAIR APLICANDO NAS OUTRAS TELAS: e' referencia, cada tela sera avaliada
          uma a uma. Registrado como A18 em docs/PADROES-UI.md. */}
      {ehAbate ? (
        <TabelaDocumentosAbate documentos={api.documentos} loading={api.loading} somenteLeitura={somenteLeitura}
          onAbrir={c => void abrirArquivo(c)} onEditar={id => void abrirEdicao(id)}
          onCancelar={id => { setCancelId(id); setCancelMotivo(''); }} />
      ) : (
      <div className="rounded-md border divide-y">
        {api.documentos.length === 0 && (
          <div className="px-3.5 py-4 text-center text-[10px] text-muted-foreground">
            {api.loading ? 'Carregando…' : 'Nenhum documento.'}
          </div>
        )}
        {api.documentos.map(d => {
          const numero = fmtNumeroDoc(d.numero, d.especie);
          /* ⚠ Sem numero (recibo, "outro documento") a ESPECIE sobe para a identidade:
             imprimir "—" na linha 1 esconderia o que o registro e'. Mesmo fallback do
             PR-OC-UX-LOTE-B-01 (`ident ? … : rotuloCompromisso`). Com numero, a especie
             vira prefixo curto: "NF 007.086.649" se le de uma vez. */
          const identidade = numero ? `${PREFIXO_ESPECIE[d.especie]} ${numero}`.trim() : ESPECIE_LABEL[d.especie];
          /* ⚠ SEM emitente proprio NAO e' ausencia: significa que quem emitiu foi a
             propria contraparte — entao a linha diz O NOME DELA. "Mesmo da operação"
             nao informa nada numa lista onde todas as linhas dizem o mesmo, e o nome
             ja estava na mao (mesma origem que o formulario usa).
             ⚠ Sem documento cadastrado nao entra traco nem espaco: ausencia de CPF/CNPJ
             nao e' informacao. So 4% dos fornecedores tem — vai aparecer pouco, e esta
             certo. Cabe na MESMA linha: o pior caso medido (nome de 40 caracteres +
             documento + data) da ~437px contra os ~553px do bloco, e o `truncate`
             continua de rede. Terceira linha engordaria a lista que acabou de encolher. */
          const emitenteNome = d.emitenteNome ?? contraparte?.nome ?? 'Mesmo da operação';
          const emitenteDoc = d.emitenteNome ? d.emitenteDocumento : (contraparte?.cpfCnpj ?? null);
          const contexto = [emitenteNome, emitenteDoc, fmtData(d.dataEmissao)]
            .filter(x => x && x !== '—').join(' · ');
          /* ⚠ DOCUMENTO SEM ARQUIVO E' UM ESTADO REAL, nao um erro escondido: o fluxo
             registra primeiro e sobe depois, entao uma falha no upload deixa a linha
             sem anexo. A ausencia do clipe nao se le como aviso — a linha DIZ, em
             palavras, no lugar do contexto. */
          const semArquivo = !d.url && !d.cancelado;
          return (
            <div key={d.documentoId}
              className={`flex items-center gap-2 border-b border-border/60 px-2 py-0.5 last:border-b-0 ${d.cancelado ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1 leading-[1.25]">
                <div className="text-[11px] font-medium text-foreground truncate">{identidade}</div>
                <div className={`text-[10px] truncate ${semArquivo
                  ? 'text-amber-700 dark:text-amber-500'
                  : 'text-muted-foreground'}`} title={semArquivo ? undefined : contexto}>
                  {semArquivo ? 'Sem arquivo anexado' : contexto}
                </div>
              </div>
              <div className="text-[11px] font-medium tabular-nums shrink-0">{brl(d.valorLiquido)}</div>
              <span className={`shrink-0 rounded px-[5px] py-0 text-[10px] leading-[12px] ${d.cancelado
                ? 'bg-rose-100 text-rose-700'
                : 'bg-emerald-100 text-emerald-700'}`}>
                {d.situacao === 'cancelado' ? 'Cancelado' : 'Ativo'}
              </span>
              {/* Icones com `title` e `aria-label`: o texto dos tres botoes custava
                  ~153px, e o custo do erro aqui nao era estetico — era a barra por cima
                  do que se precisa clicar. */}
              <span className="inline-flex shrink-0 gap-0.5">
                {d.url && (
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    title="Abrir arquivo" aria-label="Abrir arquivo"
                    onClick={() => void abrirArquivo(d.url!)}><Paperclip className="h-3.5 w-3.5" /></Button>
                )}
                {!somenteLeitura && !d.cancelado && (
                  <>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                      title="Editar documento" aria-label="Editar documento"
                      onClick={() => void abrirEdicao(d.documentoId)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      title="Cancelar documento" aria-label="Cancelar documento"
                      onClick={() => { setCancelId(d.documentoId); setCancelMotivo(''); }}><Ban className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
      )}

      {/* Cancelamento com motivo obrigatório */}
      {cancelId && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-2 space-y-1">
          <div className="text-[11px] font-semibold text-rose-700">Cancelar documento (lógico — permanece visível)</div>
          <Input value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} placeholder="Motivo do cancelamento (obrigatório)" className="h-6 text-[11px]" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-6 text-[11px]" onClick={() => { setCancelId(null); setCancelMotivo(''); }}>Voltar</Button>
            <Button type="button" variant="destructive" size="sm" className="h-6 text-[11px]" disabled={api.saving || !cancelMotivo.trim() || somenteLeitura} onClick={() => void confirmarCancelamento()}>Confirmar cancelamento</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── LISTA DO ABATE (OC-DOC-ESPECIE-ABATE-01 passo 2) ─────────────────────────────────────────────────────────────────
   Uma coluna por informacao, uma linha por registro (18px): Tipo | Numero | Data | Venc. | Cab | Peso kg | Valor R$ |
   Conferencia (reservada: passo 3) | anexo | ⋯. O Valor e' o LIQUIDO PROPRIO do documento, da view; o que nao soma no valor da
   operacao (NPR, Acerto, Romaneio, Outro) fica em cinza, e o "Outro" diz "informativo · não soma". */
const PILULA: Partial<Record<EspecieDoc, string>> = {
  nf_principal: 'bg-primary text-primary-foreground', nf_complementar: 'bg-primary/80 text-primary-foreground',
  npr: 'bg-amber-100 text-amber-800', acerto: 'bg-emerald-100 text-emerald-800', romaneio: 'bg-sky-100 text-sky-800',
};
const TH = 'h-[18px] px-1 text-[9.5px] font-medium text-primary-foreground whitespace-nowrap';
const TD = 'h-[18px] px-1 py-0 align-middle text-[10px] leading-[17px] whitespace-nowrap overflow-hidden text-ellipsis';
const TD_ICONE = 'h-[18px] px-0 py-0 align-middle text-center leading-none';
/* dd/mm/aa — o padrao de tabela da casa (data nunca corta). */
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const textoDe = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function TabelaDocumentosAbate({ documentos, loading, somenteLeitura, onAbrir, onEditar, onCancelar }: {
  documentos: DocumentosApi['documentos']; loading: boolean; somenteLeitura?: boolean;
  onAbrir: (caminho: string) => void; onEditar: (id: string) => void; onCancelar: (id: string) => void;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      <table data-testid="tabela-docs-abate" className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: 64 }} /><col /><col style={{ width: 58 }} /><col style={{ width: 58 }} /><col style={{ width: 36 }} />
          <col style={{ width: 66 }} /><col style={{ width: 86 }} /><col style={{ width: 84 }} /><col style={{ width: 20 }} /><col style={{ width: 22 }} />
        </colgroup>
        <thead className="bg-primary">
          <tr className="h-[18px]">
            <th className={`${TH} text-left`}>Tipo</th><th className={`${TH} text-left`}>Número</th>
            <th className={`${TH} text-left`}>Data</th><th className={`${TH} text-left`}>Venc.</th>
            <th className={`${TH} text-right`}>Cab</th><th className={`${TH} text-right`}>Peso kg</th>
            <th className={`${TH} text-right`}>Valor R$</th><th className={`${TH} text-left`}>Conferência</th>
            <th className={TH} /><th className={TH} />
          </tr>
        </thead>
        <tbody>
          {documentos.length === 0 && (
            <tr><td colSpan={10} className="px-2 py-3 text-center text-[10px] text-muted-foreground">{loading ? 'Carregando…' : 'Nenhum documento.'}</td></tr>
          )}
          {documentos.map(d => {
            const soma = d.somaNoValor !== false;
            const numero = fmtNumeroDoc(d.numero, d.especie) ?? textoDe(d.dados?.ordem_compra) ?? textoDe(d.dados?.op) ?? '—';
            const outro = d.especie === 'outro' || d.especie === 'recibo';
            const data = d.dataEmissao ?? d.dataAbate;
            const valor = d.liquidoProprio ?? d.valorLiquido;
            const url = d.url;
            return (
              <tr key={d.documentoId} data-testid="linha-doc-abate"
                className={`h-[18px] border-b border-border/60 last:border-b-0 ${d.cancelado ? 'line-through opacity-50' : ''} ${soma ? '' : 'text-muted-foreground'}`}
                title={d.cancelado ? 'cancelado' : soma ? undefined : 'não soma no valor da operação'}>
                <td className={TD}>
                  <span className={`inline-block rounded px-1 align-middle text-[9.5px] leading-[14px] ${PILULA[d.especie] ?? 'bg-muted text-muted-foreground'}`}>
                    {ROTULO_SEGMENTO[d.especie] ?? ESPECIE_LABEL[d.especie]}
                  </span>
                </td>
                <td className={TD} title={numero}>
                  {numero}{outro && <span className="ml-1 text-[9.5px] text-muted-foreground">informativo · não soma</span>}
                </td>
                <td className={`${TD} tabular-nums`}>{dataCurta(data)}</td>
                <td className={`${TD} tabular-nums`}>{dataCurta(d.vencimento ?? null)}</td>
                <td className={`${TD} text-right tabular-nums`}>{d.cab ?? '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{d.pesoKg == null ? '—' : formatCasas(d.pesoKg, 1)}</td>
                <td className={`${TD} text-right tabular-nums`}>{formatCasas(valor, 2)}</td>
                <td className={TD} data-testid="celula-conferencia" />
                <td className={TD_ICONE}>
                  {url && (
                    <button type="button" title="Abrir arquivo" aria-label="Abrir arquivo" onClick={() => onAbrir(url)}
                      className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground">
                      <Paperclip className="h-3 w-3" />
                    </button>
                  )}
                </td>
                <td className={TD_ICONE}>
                  {!somenteLeitura && !d.cancelado && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Ações do documento" className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-3 w-3" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => onEditar(d.documentoId)}><Pencil className="mr-2 h-3 w-3" /> Editar</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => onCancelar(d.documentoId)}><Ban className="mr-2 h-3 w-3" /> Cancelar documento</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
