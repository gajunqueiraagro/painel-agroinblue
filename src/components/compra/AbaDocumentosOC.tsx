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
import { ROTULO_SEGMENTO, ESPECIES_DA_SAIDA, tipoDoDocumento } from '@/lib/oc/camposDaEspecie';
import { formatCasas } from '@/lib/calculos/numeroBR';
import { conferirDocumentosAbate, conferenciaDoDocumento, faixaDaConferencia, type ResultadoConferencia } from '@/lib/oc/conferirDocumentosAbate';

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
  nf_produtor: 'NF prod.', gta: 'GTA', guia: 'Guia', declaracao: 'Decl.',
};

/* "2 notas · 1 recibo". Conta o que ESTA VALENDO; cancelado vira um termo proprio, e
   nao um documento a menos escondido na contagem. */
const CONTAGEM_ROTULO: Record<EspecieDoc, [string, string]> = {
  nf_principal: ['nota', 'notas'], nf_complementar: ['nota compl.', 'notas compl.'],
  recibo: ['recibo', 'recibos'], outro: ['outro documento', 'outros documentos'],
  npr: ['NPR', 'NPRs'], acerto: ['acerto', 'acertos'], romaneio: ['romaneio', 'romaneios'],
  nf_produtor: ['NF produtor', 'NFs produtor'], gta: ['GTA', 'GTAs'], guia: ['guia', 'guias'], declaracao: ['declaração', 'declarações'],
};

/* 7f-fix1b: no ABATE a contagem mora na faixa de cada bloco (18px, 9,5px): rotulos curtos ("1 NF · 1 acerto", "2 NF prod. · 2 GTA"). */
const CONTAGEM_DA_FAIXA: Record<EspecieDoc, [string, string]> = {   // na ordem de leitura do bloco; "outro" por ultimo
  nf_principal: ['NF', 'NF'], nf_complementar: ['NF compl.', 'NF compl.'], npr: ['NPR', 'NPR'], acerto: ['acerto', 'acertos'],
  romaneio: ['romaneio', 'romaneios'], nf_produtor: ['NF prod.', 'NF prod.'], gta: ['GTA', 'GTA'], guia: ['guia', 'guias'],
  declaracao: ['declaração', 'declarações'], recibo: ['recibo', 'recibos'], outro: ['outro', 'outros'],
};

/** A contagem dos documentos. 7f-fix1: guia e declaracao COM tipo gravado contam pelo tipo (`tipoDoDocumento`: "1 Modelo B ·
    1 carta garantia"); sem tipo, pela especie. Ordem: a das especies, e dentro delas a de entrada. Cancelado vira termo proprio. */
export function partesDaContagem(docs: Pick<DocumentosApi['documentos'][number], 'especie' | 'dados' | 'cancelado'>[],
  rotulos: Record<EspecieDoc, [string, string]> = CONTAGEM_ROTULO): string[] {
  const ativos = docs.filter(d => !d.cancelado);
  const termos = new Map<string, { n: number; r: [string, string] }>();
  for (const e of Object.keys(rotulos) as EspecieDoc[]) {
    for (const d of ativos.filter(x => x.especie === e)) {
      const t = tipoDoDocumento(e, d.dados);
      const chave = t ? `${e}:${t.valor}` : e;
      const atual = termos.get(chave) ?? { n: 0, r: t ? t.contagem : rotulos[e] };
      termos.set(chave, { ...atual, n: atual.n + 1 });
    }
  }
  const partes = [...termos.values()].map(x => `${x.n} ${x.n === 1 ? x.r[0] : x.r[1]}`);
  const cancelados = docs.length - ativos.length;
  if (cancelados > 0) partes.push(`${cancelados} cancelado${cancelados > 1 ? 's' : ''}`);
  return partes;
}

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
  /* OC-DOC-ESPECIE-ABATE-01 passo 3 — a conferencia entre os documentos (so' leitura; o dono e' `conferirDocumentosAbate`). */
  /* 7f: as cabecas da OC (soma dos lotes) — a GTA confere contra elas; sem a quantidade de algum lote, nulo (nao conferido). */
  const cabDaOC = api.lotes.length && api.lotes.every(l => l.qtd != null) ? api.lotes.reduce((s, l) => s + (l.qtd ?? 0), 0) : null;
  const conferencia = conferirDocumentosAbate(api.documentos, { cabDaOC });
  const totalDocumentado = ativos.reduce((s, d) => s + d.valorLiquido, 0);

  /* ⚠ TOLERANCIA DE R$ 0,01, a mesma regra canonica de saldo da OC (PR-OC2-SALDO):
     centavo de arredondamento entre a soma dos componentes e o valor acordado nao e'
     divergencia, e apontar um por um treinaria o operador a ignorar o aviso. */
  const diferenca = valorNegociado == null ? null : valorNegociado - totalDocumentado;
  const confronto = diferenca == null || ativos.length === 0 ? null
    : Math.abs(diferenca) <= 0.01
      ? { ok: true, texto: 'confere' }
      : { ok: false, texto: diferenca > 0 ? `faltam ${brl(diferenca)}` : `sobram ${brl(-diferenca)}` };

  /* 7f-fix1b: no abate a contagem vai para as faixas dos blocos; o topo fica so' com o titulo e o botao. */
  const contagem = ehAbate ? [] : partesDaContagem(api.documentos);

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
          <span className="text-[12px] font-semibold text-foreground shrink-0">Documentos da operação</span>
          <div className="flex min-w-0 items-center gap-2">
            {contagem.length > 0 && (
              <span data-testid="contagem-docs" className="min-w-0 truncate text-[10px] text-muted-foreground" title={contagem.join(' · ')}>{contagem.join(' · ')}</span>
            )}
            {!somenteLeitura && (
              <Button type="button" variant="outline" size="sm" className="h-[22px] shrink-0 px-[9px] text-[10px] font-medium gap-1" onClick={abrirNovo}><Plus className="h-3 w-3" /> Novo documento</Button>
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
            operacao sem valor_acordado ainda nao tem com o que confrontar.
            ⚠ 7f (Gabriel 15/10): UMA LINHA, na altura da faixa de conferencia (24px) — o corpo do modal nunca rola, e o quadro
            de duas alturas tirava o espaco de 2 linhas da lista. Um dado por coluna, numeros a' direita, nada empilhado. */}
        <div data-testid="quadro-documentado" className="grid h-6 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_120px] items-center gap-2 rounded-md border bg-muted/20 px-2 text-[10px] leading-none">
          <span className="text-muted-foreground">Total documentado</span>
          <span data-testid="total-documentado" className="text-right text-[12px] font-medium tabular-nums whitespace-nowrap">{brl(totalDocumentado)}</span>
          <span className="text-muted-foreground">Negociado</span>
          <span data-testid="total-negociado" className="text-right text-[12px] font-medium tabular-nums whitespace-nowrap">
            {valorNegociado == null ? <span className="text-muted-foreground">—</span> : brl(valorNegociado)}
          </span>
          <span data-testid="confronto-documentado" title={confronto?.texto}
            className={`truncate text-right ${confronto?.ok ? 'text-emerald-700 dark:text-emerald-500' : 'text-amber-700 dark:text-amber-500'}`}>{confronto?.texto ?? ''}</span>
        </div>
        {ehAbate && <FaixaConferenciaAbate r={conferencia} />}
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
        <TabelaDocumentosAbate documentos={api.documentos} loading={api.loading} somenteLeitura={somenteLeitura} conferencia={conferencia}
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
   Uma coluna por informacao, uma linha por registro (16px desde o 7f, Gabriel 15/10; eram 18): Tipo | Numero | Data | Venc. | Cab | Peso kg | Valor R$ |
   Conferencia (reservada: passo 3) | anexo | ⋯. O Valor e' o LIQUIDO PROPRIO do documento, da view; o que nao soma no valor da
   operacao (NPR, Acerto, Romaneio, Outro) fica em cinza, e o "Outro" diz "informativo · não soma". */
const PILULA: Partial<Record<EspecieDoc, string>> = {
  nf_principal: 'bg-primary text-primary-foreground', nf_complementar: 'bg-primary/80 text-primary-foreground',
  npr: 'bg-amber-100 text-amber-800', acerto: 'bg-emerald-100 text-emerald-800', romaneio: 'bg-sky-100 text-sky-800',
};
const TH = 'h-[18px] px-1 text-[9.5px] font-medium text-primary-foreground whitespace-nowrap';
const TD = 'h-[16px] px-1 py-0 align-middle text-[10px] leading-[15px] whitespace-nowrap overflow-hidden text-ellipsis';
const TD_ICONE = 'h-[16px] px-0 py-0 align-middle text-center leading-none';
/* dd/mm/aa — o padrao de tabela da casa (data nunca corta). */
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');
const textoDe = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/* 7f — o rotulo da pilula na coluna Tipo (64px): os longos encurtam (o nome inteiro vai no `title` da linha). */
const PILULA_CURTA: Partial<Record<EspecieDoc, string>> = { nf_produtor: 'NF prod.', declaracao: 'Decl.' };
/* 7f — os dois blocos da lista do abate. */
const BLOCOS: { chave: 'abate' | 'saida'; rotulo: string }[] = [
  { chave: 'abate', rotulo: 'ABATE · FRIGORÍFICO' }, { chave: 'saida', rotulo: 'SAÍDA DA FAZENDA' },
];
const TOM_CONFERENCIA = { verde: 'text-emerald-700', vermelho: 'text-destructive', neutro: 'text-muted-foreground' };

/* A faixa de 24px do topo: verde (comparado e bate), vermelha (diverge, com a diferenca) ou cinza (nada a conferir); "falta" em
   cinza no fim. Uma linha so', altura fixa; o texto inteiro no `title`. */
function FaixaConferenciaAbate({ r }: { r: ResultadoConferencia }) {
  const f = faixaDaConferencia(r);
  return (
    <div data-testid="faixa-conferencia-abate" data-estado={f.estado} title={f.titulo}
      className={`flex h-6 items-center gap-2 overflow-hidden rounded-md border px-2 text-[10px] ${
        f.estado === 'verde' ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : f.estado === 'vermelho' ? 'border-destructive/50 bg-destructive/5 text-destructive'
            : 'bg-muted/30 text-muted-foreground'}`}>
      <span className="min-w-0 flex-1 truncate">{f.texto}</span>
      {f.falta && <span className="shrink-0 text-muted-foreground">{f.falta}</span>}
    </div>
  );
}

function TabelaDocumentosAbate({ documentos, loading, somenteLeitura, conferencia, onAbrir, onEditar, onCancelar }: {
  documentos: DocumentosApi['documentos']; loading: boolean; somenteLeitura?: boolean; conferencia: ResultadoConferencia;
  onAbrir: (caminho: string) => void; onEditar: (id: string) => void; onCancelar: (id: string) => void;
}) {
  const linha = (d: DocumentosApi['documentos'][number], daSaida: boolean) => {
            const soma = d.somaNoValor !== false;
            const numero = (d.especie === 'gta' && d.serie && d.numero ? `${d.serie}-${d.numero}` : null)
              ?? fmtNumeroDoc(d.numero, d.especie) ?? textoDe(d.dados?.ordem_compra) ?? textoDe(d.dados?.op) ?? '—';
            const data = d.dataEmissao ?? d.dataAbate;
            /* 7f: na saida da fazenda o valor e' o do componente INFORMATIVO (guia, NFP-e), em cinza; sem valor, "—" — nunca 0,00
               so' porque o liquido proprio e' 0. */
            const valor: number | null = daSaida
              ? (d.totalInformativo ?? (d.qtdComponentes > 0 ? (d.liquidoProprio ?? d.valorLiquido) : null))
              : (d.liquidoProprio ?? d.valorLiquido);
            const url = d.url;
            const conf = conferenciaDoDocumento(conferencia, d.especie, d.cancelado, d);
            /* 7f-fix1: a declaracao mostra o TIPO gravado ("Modelo B", "Carta garantia"); a guia segue "Guia" (o nome dela ja' vai
               no Numero). */
            const tipoNaLista = d.especie === 'declaracao' ? tipoDoDocumento(d.especie, d.dados) : null;
            return (
              <tr key={d.documentoId} data-testid="linha-doc-abate"
                className={`h-[16px] [&>td]:shadow-[inset_0_-1px_0_hsl(var(--border)/0.6)] ${d.cancelado ? 'line-through opacity-50' : ''} ${soma ? '' : 'text-muted-foreground'}`}
                title={d.cancelado ? 'cancelado' : soma ? undefined : 'não soma no valor da operação'}>
                <td className={TD}>
                  <span title={tipoNaLista ? `${ESPECIE_LABEL[d.especie]} · ${tipoNaLista.rotulo}` : ESPECIE_LABEL[d.especie]} className={`inline-block rounded px-1 align-middle text-[9.5px] leading-[14px] ${PILULA[d.especie] ?? 'bg-muted text-muted-foreground'}`}>
                    {tipoNaLista?.curto ?? PILULA_CURTA[d.especie] ?? ROTULO_SEGMENTO[d.especie] ?? ESPECIE_LABEL[d.especie]}
                  </span>
                </td>
                <td className={TD} title={numero}>
                  {numero}
                </td>
                <td className={`${TD} tabular-nums`}>{dataCurta(data)}</td>
                <td className={`${TD} tabular-nums`}>{dataCurta(d.vencimento ?? null)}</td>
                <td className={`${TD} text-right tabular-nums`}>{d.cab ?? '—'}</td>
                <td className={`${TD} text-right tabular-nums`}>{d.pesoKg == null ? '—' : formatCasas(d.pesoKg, 1)}</td>
                <td className={`${TD} text-right tabular-nums`} data-testid="valor-doc">{valor == null ? '—' : formatCasas(valor, 2)}</td>
                <td className={`${TD} ${TOM_CONFERENCIA[conf.tom]}`} data-testid="celula-conferencia" data-tom={conf.tom} title={conf.titulo ?? (conf.texto || undefined)}>
                  {conf.texto}
                </td>
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
          };
  return (
    <div className="rounded-md border overflow-hidden">
      <table data-testid="tabela-docs-abate" className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: 80 }} /><col /><col style={{ width: 58 }} /><col style={{ width: 58 }} /><col style={{ width: 36 }} />
          <col style={{ width: 66 }} /><col style={{ width: 86 }} /><col style={{ width: 140 }} /><col style={{ width: 20 }} /><col style={{ width: 22 }} />
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
          {/* 7f — DOIS BLOCOS, cada um aberto por uma faixa de LARGURA INTEIRA (18px); bloco vazio nao mostra a faixa. */}
          {BLOCOS.map(b => {
            const docs = documentos.filter(d => (ESPECIES_DA_SAIDA.includes(d.especie) ? 'saida' : 'abate') === b.chave);
            if (!docs.length) return null;
            return [
              <tr key={`faixa-${b.chave}`} data-testid={`faixa-bloco-${b.chave}`} className="h-[18px]">
                <td colSpan={10} className="h-[18px] bg-[#cbd5e1] px-1.5 py-0 align-middle text-[9.5px] font-semibold leading-[18px] text-slate-800">
                  {/* 7f-fix1b: o nome num lugar de LARGURA FIXA, para a contagem comecar na mesma coluna nos dois blocos */}
                  <div className="flex items-center whitespace-nowrap">
                    <span className="w-[128px] shrink-0">{b.rotulo}</span>
                    <span data-testid={`contagem-bloco-${b.chave}`} className="min-w-0 truncate font-normal text-slate-700"
                      title={partesDaContagem(docs, CONTAGEM_DA_FAIXA).join(' · ')}>{partesDaContagem(docs, CONTAGEM_DA_FAIXA).join(' · ')}</span>
                  </div>
                </td>
              </tr>,
              ...docs.map(d => linha(d, b.chave === 'saida')),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
