import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Ban, Paperclip } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { DocumentosApi, EspecieDoc } from '@/hooks/useOperacaoDocumentos';
import { DocumentoFormOC, FORM_VAZIO, ESPECIE_LABEL, brl, fmtNumeroDoc, type FormState } from './DocumentoFormOC';

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
}

const fmtData = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');

/* Prefixo CURTO na identidade da linha, ao lado do numero: "NF 007.086.649" se le de
   uma vez. O rotulo por extenso (ESPECIE_LABEL) fica para quando NAO ha numero e a
   especie precisa carregar a linha sozinha. */
const PREFIXO_ESPECIE: Record<EspecieDoc, string> = {
  nf_principal: 'NF', nf_complementar: 'NF compl.', recibo: 'Recibo', outro: 'Doc.',
};

/* "2 notas · 1 recibo". Conta o que ESTA VALENDO; cancelado vira um termo proprio, e
   nao um documento a menos escondido na contagem. */
const CONTAGEM_ROTULO: Record<EspecieDoc, [string, string]> = {
  nf_principal: ['nota', 'notas'], nf_complementar: ['nota compl.', 'notas compl.'],
  recibo: ['recibo', 'recibos'], outro: ['outro documento', 'outros documentos'],
};

export function AbaDocumentosOC({ api, operacaoPronta, somenteLeitura, fornecedores, contraparteId, clienteId, recarregarFornecedores, valorNegociado }: Props) {
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
    try { await recarregarFornecedores?.(); } catch { /* gravou; a lista volta no proximo refresh */ }
    toast.success('Documento gravado no cadastro do fornecedor.');
    return true;
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
        onGravarDocumentoFornecedor={clienteId ? gravarDocumentoFornecedor : undefined}
        initialForm={formInicial}
        onSaved={() => setModo('lista')}
        onCancel={() => setModo('lista')}
      />
    );
  }

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
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-foreground min-w-0 truncate">Documentos da operação</span>
        <div className="flex items-center gap-2 shrink-0">
          {contagem.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{contagem.join(' · ')}</span>
          )}
          {!somenteLeitura && (
            <Button type="button" variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={abrirNovo}><Plus className="h-3 w-3" /> Novo documento</Button>
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
          <div className="text-[10px] text-muted-foreground leading-none">Total documentado</div>
          <div className="mt-1 text-[13px] font-medium tabular-nums leading-none">{brl(totalDocumentado)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground leading-none">Negociado</div>
          <div className="mt-1 text-[13px] font-medium tabular-nums leading-none">
            {valorNegociado == null ? <span className="text-muted-foreground">—</span> : brl(valorNegociado)}
            {confronto && (
              <span className={`ml-2 text-[11px] font-normal ${confronto.ok
                ? 'text-emerald-700 dark:text-emerald-500'
                : 'text-amber-700 dark:text-amber-500'}`}>{confronto.texto}</span>
            )}
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
      <div className="rounded-md border divide-y">
        {api.documentos.length === 0 && (
          <div className="px-3.5 py-4 text-center text-[11px] text-muted-foreground">
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
             propria contraparte. Imprimir "—" faria o operador procurar um dado que
             esta ali, so que no cabecalho da operacao. */
          const contexto = [d.emitenteNome ?? 'Mesmo da operação', fmtData(d.dataEmissao)]
            .filter(x => x && x !== '—').join(' · ');
          /* ⚠ DOCUMENTO SEM ARQUIVO E' UM ESTADO REAL, nao um erro escondido: o fluxo
             registra primeiro e sobe depois, entao uma falha no upload deixa a linha
             sem anexo. A ausencia do clipe nao se le como aviso — a linha DIZ, em
             palavras, no lugar do contexto. */
          const semArquivo = !d.url && !d.cancelado;
          return (
            <div key={d.documentoId}
              className={`flex items-center gap-3 px-3.5 py-[7px] ${d.cancelado ? 'opacity-60' : ''}`}>
              <div className="min-w-0 flex-1 leading-[1.35]">
                <div className="text-[13px] font-medium text-foreground truncate">{identidade}</div>
                <div className={`text-[11px] truncate ${semArquivo
                  ? 'text-amber-700 dark:text-amber-500'
                  : 'text-muted-foreground'}`} title={semArquivo ? undefined : contexto}>
                  {semArquivo ? 'Sem arquivo anexado' : contexto}
                </div>
              </div>
              <div className="text-[13px] font-medium tabular-nums shrink-0">{brl(d.valorLiquido)}</div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${d.cancelado
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
