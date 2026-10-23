import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FaixaDaReferencia, type ReferenciaOperacionalInfo } from './FaixaDaReferencia';
import { BLOCO_FORMULARIO, BlocoFormulario, REGUA_ROTULO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { tituloOCAjustavel, motivoTituloOCTravado, camposDoAjusteOC, motivoDoCampoOC, type CampoDoTituloOC } from '@/lib/oc/ajusteDoTituloOC';
// PR-FIN-STATUS-UX-03A-1 — domínio financeiro (dono único). normalizeStatusTransacao
//   (v2Transferencia, compartilhado) mapeava 'previsto'→'meta'; o modal passa a usar o
//   normalizador próprio do domínio (normalizeStatusModal), sem tocar o compartilhado.
import {
  STATUS_FINANCEIRO_OPCOES_MODAL,
  STATUS_FINANCEIRO_INICIAL,
  normalizeStatusModal,
  statusTemPagamento,
  pagamentoAoTrocarStatus,
  pagamentoParaGravar,
  pagamentoParaMostrar,
  pagamentoQueSeraRemovido,
  avisoPagamentoLegado,
  STATUS_PALETA,
  STATUS_PILULA_BASE,
} from '@/lib/financeiro/statusFinanceiro';
import { TIPOS_DOCUMENTO, formatNFNumber, extractNFDigits, docDaLinha, topoDoDocumentoTravado, MOTIVO_TOPO_NO_PARCELADO, type TipoDocumento } from '@/lib/financeiro/documentoHelper';
import { useCliente } from '@/contexts/ClienteContext';
import { usePodeAbrir, usePodeAlterarOperacao, TELA_DA_OPERACAO } from '@/v2/hooks/usePodeAbrir';
import { GestoDeOperacao } from '@/components/financeiro-v2/GestoDeOperacao';
import { FinanciamentoDoLancamento } from '@/components/financiamentos/FinanciamentoDoLancamento';
import { useLancamentoDocumentos } from '@/hooks/useLancamentoDocumentos';
import { AbaDocumentosLancamento } from '@/components/financeiro-v2/AbaDocumentosLancamento';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AsideResumo, FaixaTituloResumo, SecaoResumo, LinhaResumo } from '@/components/ui/linha-resumo';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  bloqueiaCancelamentoPeloFinanceiro,
  MOTIVO_SEM_ACESSO_VINCULAR, MOTIVO_SEM_ACESSO_DESVINCULAR, ondeAjustarTituloOC,
} from '@/lib/financeiro/cancelamentoLancamento';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { DatePicker } from '@/components/ui/date-picker';
import { ProdutoAutocomplete } from '@/components/shared/ProdutoAutocomplete';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { FORMAS_PAGAMENTO_V2, FORMA_PAGAMENTO_V2_NENHUMA } from '@/lib/financeiro/formasPagamentoV2';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { ClassificacaoLancamento, CAMPO_BG, atividadeValida } from '@/components/shared/ClassificacaoLancamento';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { computeValidacaoModal, type AbaFinanceira } from './lancamentoDialogTabs';
import { AbaAuditoriaLancamento } from '@/components/financeiro-v2/AbaAuditoriaLancamento';
import { AlertCircle, AlertTriangle, Copy, RefreshCw, DollarSign, Beef, Repeat, Loader2, Link2, Unlink, FilePlus2 } from 'lucide-react';
import { LancamentoZooModal } from '@/v2/components/edicao/LancamentoZooModal';
import { toast } from 'sonner';
import { mensagemDoErro } from '@/lib/supabase/mensagemDoErro';
import { useQueryClient } from '@tanstack/react-query';
/* PAR-02 — a montagem do payload e a previa, compartilhadas com a tela de Parcelamentos. */
import { montarPayloadParcelamento, preverParcelas } from '@/lib/financiamentos/montarPayloadParcelamento';
import type { LancamentoV2, LancamentoV2Form, ContaBancariaV2, ClassificacaoItem, FornecedorV2, Safra } from '@/hooks/useFinanceiroV2';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { useFornecedoresDoCliente } from '@/hooks/useFornecedoresDoCliente';
import type { Fazenda } from '@/contexts/FazendaContext';
import { NovoFornecedorDialog } from './NovoFornecedorDialog';
import { formatMoeda } from '@/lib/calculos/formatters';
import {
  formaEfetiva, linhasDoCadastro, modoDosDados, normalizarFormaDoCadastro, textoDoCadastro,
  type BlocoDoCadastro,
} from '@/lib/financeiro/dadosPagamentoDoCadastro';
import { FornecedorFormDialog } from '@/components/financeiro-v2/FornecedorFormDialog';
import { cn } from '@/lib/utils';
import { CampoValorComConta } from '@/components/financeiro-v2/CampoValorComConta';
import {
  marcaAoSalvar, ocorrenciaAberta, previstoDaOcorrencia, partesDaMarcada, partesDaIntencao, tituloDasPartes,
  MOTIVO_CONTA_PAGA, MOTIVO_SALVAR_PENDENTE, type RegraDaRecorrencia, type OrigemDoValorDoMes, type PedidoDoValorDoMes,
} from '@/lib/financeiro/valorDoMes';
import { pendenteDaNota, type DoXml } from '@/lib/financeiro/nfePrefill';
import {
  atualizarCamposDoCadastro, cadastroParaComparar, camposQueOEmitenteCompleta, completarCadastroPeloXml, desfazerCamposDoCadastro, fornecedorPeloDocumento,
  type CadastroComODocumento, type OcorrenciaDaNota,
} from '@/lib/financeiro/nfeConsultas';
import { CompararCadastroDialog } from './CompararCadastroDialog';
import { ContasDosItens } from './ContasDosItens';
import { PartesDaClassificacao } from './PartesDaClassificacao';
import { DividirClassificacaoDialog, MotivoDaDivisaoDialog } from './DivisaoDialogs';
import {
  classificacaoGravada, contaDaMaiorParte, contasDasPartes, desfazerCriacao, desfazerDivisao, desfazerDivisaoDoCadastro, dividir, dividirNaCriacao, dividirPelosItens, lerDivisao,
  MOTIVO_DA_DIVISAO_NA_CRIACAO, partesPendentes, percentuaisDosItens, porContaDosItens, porQueNaoDivideNaCriacao, voltarUmaConta, voltarUmaContaDoCadastro,
  type DivisaoLida, type ParteNova, type ResultadoDaDivisao,
} from '@/lib/financeiro/divisaoDaClassificacao';
import { aprender, historicoDoEmitente, sugerir } from '@/lib/financeiro/sugestaoDeContaDosItens';
import { propostaDoEmitente, type CadastroParaComparar } from '@/lib/fornecedores/compararCadastro';
import { documentoFormatado, reais } from '@/lib/financeiro/nfe/formatos';
import { fraseParcelasComoNaNota, type CampoDoXml } from '@/lib/financeiro/nfe/proporLancamento';
import { AvisosDoXml, CAMPO_AMBAR, FaixaDoFornecedor, OrigemDoXml, PilulaDoXml } from './LancamentoDoXml';
import { ItensDaNota } from './ItensDaNota';
import { useItensDaNota } from '@/hooks/useItensDaNota';
import { gravarItensSemTravar } from '@/lib/financeiro/itensDaNotaBanco';
import type { ExcelContext } from '@/v2/lib/mesa/buildExcelContext';
import { planoDeTransferencia, ehTipoTransferencia } from '@/v2/lib/mesa/transferenciaPlano';
import { ATIVIDADES, lembrarAtividade, ultimaAtividade, type Atividade } from '@/lib/financeiro/ultimaAtividade';
import { safraSugerida } from '@/lib/agri/safraSugerida';
import { conflitoSafraEscopo, mensagemConflitoSafraEscopo } from '@/lib/financeiro/safraEscopo';
import { erroDeDirecao, tipoDaContaNoPlano } from '@/lib/financeiro/validacaoLancamento';
import { escopoDoSubcentro, fazendaAdministrativa, AVISO_ADMIN_SEM_SAFRA, AVISO_ADMIN_SAFRA_SAI } from '@/lib/financeiro/escopoDoSubcentro';
import {
  CULTURAS_LANCAMENTO, FASES, SEM_CULTURA, avisoCultura, avisoFase,
  culturaParaGravar, faseParaGravar,
} from '@/lib/agri/rateioLancamento';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';
import { VincularOperacaoDialog } from '@/components/financeiro-v2/VincularOperacaoDialog';
import { CriarOCDoLegadoDialog } from '@/components/financeiro-v2/CriarOCDoLegadoDialog';
import { podeCriarOCDoLegado } from '@/lib/oc/criarDoLegado';
import { RodapeCancelamento } from '@/components/financeiro-v2/RodapeCancelamento';
import { CancelarParcelaDialog } from '@/components/financiamentos/CancelarParcelaDialog';
import { consultarParcelaDoLancamento } from '@/lib/financiamentos/cancelarParcelaBanco';
import { CancelarFilhoDeSplitDialog } from '@/components/conciliacao/CancelarFilhoDeSplitDialog';
import { consultarSplitDoLancamento, type SplitDoLancamento } from '@/lib/conciliacao/cancelarFilhoDeSplit';
import type { PreviaCancelarParcela } from '@/lib/financiamentos/cancelarParcela';
import { edicaoDaParcela, podeSerParcelaDeContrato, MOTIVO_PARCELA_PAGA } from '@/lib/financiamentos/parcelaNoModal';
import { gravarParcelaDoModal, lerContratoDaParcela, type ContratoDaParcela } from '@/lib/financiamentos/parcelaNoModalBanco';
import { camposTravadosDoCasado, consultarCasadoComExtrato, saiDoEstadoDoBanco, FRASE_CASADO_COM_EXTRATO } from '@/lib/financeiro/casadoComExtrato';
import { podeOferecerVinculo, subcentrosVinculaveis, lancamentoTemParteOC } from '@/lib/oc/vincularLancamento';
import { podeOferecerDesvinculo } from '@/lib/oc/desvincularLancamento';
import { DesvincularOperacaoDialog } from '@/components/financeiro-v2/DesvincularOperacaoDialog';
import { DocumentosPendentes } from '@/components/financeiro-v2/DocumentosPendentes';
import { ParcelasDaCompra } from '@/components/financeiro-v2/ParcelasDaCompra';
import { GradeDeParcelas, type ModoDasParcelas } from '@/components/financiamentos/GradeDeParcelas';
import {
  centavos, houveEdicao, motivoNaoSalva, parcelasComoPrevistas, parcelasDaNota, parcelasDoMensal, parcelasParaPayload,
  type ParcelaLivre,
} from '@/lib/financiamentos/parcelasLivres';
import { AnexarBoletosDialog, type BoletoAtribuido } from '@/components/financeiro-v2/AnexarBoletosDialog';
import {
  gravarDocumentosPendentes, gravarDocumentosDoParcelamento, lancamentosDoParcelamento, irmasDaParcela, numeroDaNotaDaCompra,
  novoPendente, todosGravados, type DocumentoPendente, type ParcelaGravada, type ParcelaIrma,
} from '@/lib/financeiro/documentosPendentes';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  type OrigemOC, type CampoTravavelDoModal, lancarPeloModal, parcelasParaRpc, classificacoesDaDespesa, fraseAcimaDoSaldo,
  tituloDoModoOC, MOTIVO_ITEM_OBRIGATORIO, MOTIVO_VENCIMENTO_OBRIGATORIO, MOTIVO_STATUS_TRAVADO_OC, MOTIVO_CLASSIFICACAO_DA_OC,
} from '@/lib/oc/lancarPeloModal';

interface Props {
  open: boolean;
  /**
   * OS CATÁLOGOS AINDA NÃO CHEGARAM — esqueleto no corpo e Salvar travado.
   *
   * ⚠ ELA NASCEU DE DADO PERDIDO, não de estética. `contas`, `fornecedores` e `safras` chegam
   * VAZIOS enquanto os `load*` do `useFinanceiroV2` não rodam, e lista vazia é lista válida:
   * nenhum tipo acusa. O formulário abria com "Selecione fornecedor…", Conta em branco e
   * "Nenhuma safra cadastrada" num lançamento que tinha os três — e Salvar gravava nulo por
   * cima. Ver o caso no `AgriDreLavouraTab` (PR-DRE-LAVOURA-05).
   * ⚠ OPCIONAL E `false` POR OMISSÃO: nenhum chamador existente muda de comportamento.
   */
  carregando?: boolean;
  onClose: () => void;
  /**
   * ⚠ PODE DEVOLVER O ID DO LANÇAMENTO CRIADO — FIN-NFE-PARCELAS-01. `true` continua valendo "salvou"
   * para os chamadores de sempre; quem devolve o id (a `string`) é quem liga `documentosAntesDeSalvar`,
   * porque sem o id os documentos pendentes não teriam onde nascer.
   */
  onSave: (form: LancamentoV2Form, id?: string) => Promise<boolean | string>;
  /**
   * Liga a aba Documentos no "Novo lançamento" — FIN-NFE-PARCELAS-01, PR 1. Os documentos ficam
   * pendentes em memória e são gravados depois do salvar. ⚠ SÓ PARA QUEM DEVOLVE O ID NO `onSave`:
   * com `true` puro, o à vista não saberia em que lançamento gravar. Opcional e `false`: os outros
   * chamadores seguem com "Salve o lançamento para anexar documentos".
   */
  documentosAntesDeSalvar?: boolean;
  /**
   * ⚠ O SEGUNDO ARGUMENTO É ADITIVO — PR-CPR-2A.4. O diálogo passou a PEDIR um motivo na
   * confirmação, e quem sabe o que fazer com ele é o chamador: a CPR manda para o `p_motivo`
   * da `fn_cancelar_lancamento_auditoria`; os chamadores antigos recebem `(id)` como sempre e
   * ignoram o resto. Nenhum deles mudou de comportamento.
   */
  onDelete?: (id: string, motivo?: string) => Promise<boolean>;
  lancamento?: LancamentoV2 | null;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: FornecedorV2[];
  safras?: Safra[];
  defaultFazendaId?: string;
  onCriarFornecedor: (nome: string, fazendaId: string, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  // PR-OC-FIN-EDIT-FIX-02 — favorecido de título OC só é editável quando a edição vem da aba Financeiro
  //   da OC (ação Editar da Programação). Default false = bloqueado no Financeiro V2 direto.
  permiteEditarFavorecidoOC?: boolean;
  // navegação SPA para abrir a OC vinculada na aba Financeiro (preserva contexto; substitui o reload).
  onAbrirOperacaoOC?: (operacaoId: string, tipo?: string | null) => void;
  /** PARC-CADEIA-01 — "Abrir o contrato" do aviso de parcela de compra parcelada. Ausente = a tela não navega até o contrato
   *  (ou a pessoa não o acessa): o atalho não é oferecido. */
  onAbrirContrato?: (financiamentoId: string) => void;
  prefill?: {
    fazenda_id?: string;
    conta_bancaria_id?: string;
    conta_destino_id?: string;
    data_pagamento?: string;
    data_competencia?: string;
    valor?: number;
    tipo_operacao?: string;
    status_transacao?: string;
    descricao?: string;
    numero_documento?: string;
    // PR-Mesa-CreateFromExcel-A: classificação canônica vinda da Mesa
    // de Classificação Excel. Todos opcionais — modal continua funcionando
    // idêntico nos usos atuais (OFX órfão etc.).
    favorecido_id?: string;
    subcentro?: string;
    macro_custo?: string;
    grupo_custo?: string;
    centro_custo?: string;
    plano_conta_id?: string;
    /**
     * Safra e vencimento sugeridos — CUSTEIO-TXT (121e).
     *
     * ⚠ O VENCIMENTO VAZIO CONTINUA SENDO O PADRÃO. O PR-FIN-MODAL-VENCIMENTO-02B decidiu
     * que o prefill NÃO auto-preenche vencimento, e essa decisão vale para todos os
     * chamadores que não pedem: sem a chave, o campo abre vazio como antes. Quem passa o
     * valor é quem SABE a regra do seu fluxo — no custeio, competência para Realizado e
     * competência + 30 para Previsto. Trocar o default machucaria o extrato e a mesa.
     */
    safra_id?: string;
    data_vencimento?: string;
    /**
     * O RESTO DO LANÇAMENTO, PARA O DUPLICAR — PR-FIN-DUPLICAR-ABRE-MODAL-01. Quem não passa estas chaves
     * (extrato, Mesa, custeio) abre exatamente como antes: cada uma cai no valor de hoje (`?? ...`).
     * ⚠ `cultura`, `fase` e `escopo_negocio` PASSADOS (inclusive vazios) VENCEM o que ficou da sessão: o ramo do
     * prefill herdava a cultura/fase/atividade do último lançamento aberto, e a cópia de um lançamento de pecuária
     * saía com a cultura de outro. Sem a chave, a herança continua (defeito anterior, frente própria).
     */
    cultura?: string;
    fase?: string;
    escopo_negocio?: string;
    tipo_documento?: string;
    observacao?: string;
    forma_pagamento?: string;
    dados_pagamento?: string;
    /**
     * FIN-NFE-XML-01d — o lancamento nasce de uma NF-e: a proposta, de onde cada campo veio, o fornecedor resolvido, onde a
     * nota ja' esta' registrada e o proprio XML (que vira o documento NF pendente). Sem a chave, o modal e' o de sempre.
     */
    doXml?: DoXml;
  };
  /** FIN-NFE-XML-01d — chamado quando o LANCAMENTO (ou o parcelamento) nasceu; os documentos vem depois. */
  onLancamentoCriado?: () => void;
  /**
   * Esconde o bloco de Frequência/Modalidade/Parcelas.
   *
   * ⚠ NASCE DE UM FATO, NÃO DE ESTÉTICA: um lançamento criado a partir de um
   * movimento do extrato é UM pagamento que JÁ ACONTECEU. Gerar parcelas futuras
   * ou recorrência a partir dele criaria títulos que ninguém pagou e que nenhum
   * movimento cobre. Sem a prop, o bloco aparece como sempre.
   */
  ocultarParcelamento?: boolean;
  /**
   * CONC-CRIAR-TRANSFERENCIA-01 — os tipos que o select oferece. O Criar a partir do extrato restringe ao par do sinal
   * (saída do banco: Saídas ou Transferências; entrada: Entradas ou Transferências) — nunca o tipo contrário. Sem a prop,
   * os três, como sempre.
   */
  tiposOperacaoPermitidos?: readonly string[];
  /* OC-CC-MODAL-FINANCEIRO-01 — a uniao ganhou fazenda, favorecido, classificacao e status (dono: `lancarPeloModal.ts`).
     E' a UNICA trava por campo do modal: quem precisa travar um campo o poe aqui, nunca numa prop paralela. */
  lockedFields?: CampoTravavelDoModal[];
  /**
   * MODO OC — OC-CC-MODAL-FINANCEIRO-01. "Programar recebimento/pagamento" e "Nova despesa" da OC em conta corrente abrem
   * ESTE modal: faixa de origem no topo, o que nao se aplica some (competencia, pagamento, safra, cultura/fase, a dica de
   * recorrencia), a despesa ganha o "Item da operação", e o Salvar vai a `oc_lancar_pelo_modal` — NUNCA ao `onSave` nem ao
   * parcelamento do Financeiro. So' vale no lancamento NOVO. Sem a prop, o modal e' o de sempre.
   */
  origemOC?: OrigemOC | null;
  // PR2.2 — Box informativo (read-only) com dados da referência operacional
  // que originou esta criação. Puramente visual: NÃO resolve UUIDs por nome.
  // Operador continua escolhendo fornecedor/fazenda/plano oficial manualmente.
  // Sem essa prop, o componente se comporta idêntico ao atual.
  referenciaOperacionalInfo?: ReferenciaOperacionalInfo;
  // PR-Mesa-ExcelContext — contexto read-only "Contexto Excel / Sugestão"
  // exibido em painel lateral quando o dialog é aberto a partir da Mesa
  // Classificação Excel. Ausente nos demais usos → layout idêntico ao atual.
  excelContext?: ExcelContext | null;
}

const TIPOS_OPERACAO = [
  { value: '1-Entradas', label: 'Entradas' },
  { value: '2-Saídas', label: 'Saídas' },
  { value: '3-Transferências', label: 'Transferências' },
];

// PR-FIN-MODAL-02B — abas do modal (labels compactos para a TabsList).
// PR-FIN-MODAL-02E — a aba visual "Classificação" foi INCORPORADA à aba "Geral"
// (Linha 4). A validação por aba (helper puro) segue com 'classificacao' como
// dimensão lógica; aqui ela apenas não é mais uma aba visível. Evolução futura:
// Geral | Pagamento | Documentos | Auditoria.
// PR-FIN-AUDIT-01 — a aba Auditoria deixou de ser promessa: o conteúdo real chegou e o
// `<span>` inerte saiu. `'auditoria'` NÃO entra em `AbaFinanceira` de propósito — aquele
// tipo é o da VALIDAÇÃO, e uma aba de leitura não tem campo para validar; incluí-la
// obrigaria `validaPorAba` a inventar um `true` que não significa nada.
type AbaVisual = AbaFinanceira | 'auditoria' | 'itens';
/* ITENS-NOTA-01 — "Itens da nota (N)" entre Documentos e Auditoria, SO' quando o lancamento tem nota lida (o rotulo leva o N) */
const ABAS_TAB: { value: AbaVisual; label: string }[] = [
  { value: 'geral', label: 'Geral' },
  { value: 'pagamento', label: 'Pagamento' },
  { value: 'documentos', label: 'Documentos' },
  { value: 'itens', label: 'Itens da nota' },
  { value: 'auditoria', label: 'Auditoria' },
];

// PR-FIN-STATUS-UX-03A-1 — opções do modal vêm do domínio único (statusFinanceiro.ts):
//   previsto/programado/agendado/realizado (ordem do PR-FIN-V2-STATUS-PGTO-01); sem Meta, sem Conciliado.
const STATUS_OPTIONS = STATUS_FINANCEIRO_OPCOES_MODAL;

/**
 * "DADOS PARA PAGAMENTO" — FIN-PIX-CADASTRO-MODAL-01. Só desenha: as linhas vêm de `linhasDoCadastro` e o modo de `modoDosDados`.
 *
 *   · CADASTRO com dado: o bloco — cabeçalho "PIX · do cadastro do fornecedor", uma linha por informação com o seu "Copiar",
 *     rodapé com a observação do cadastro e os dois links.
 *   · CADASTRO sem dado para a forma: o aviso âmbar com "+ Cadastrar Pix do fornecedor" — nunca o campo vazio em silêncio.
 *   · CADASTRO sem fornecedor ou forma sem dado de cadastro (Boleto, Cartão…): só o link para informar à mão.
 *   · ENTRADA ou TRANSFERÊNCIA: quem monta passa o bloco 'nada' — só o link, ou o campo próprio se já houver texto.
 *   · PRÓPRIO: o texto do lançamento, com TODAS as linhas visíveis (era um campo de uma linha que escondia a chave).
 * ⚠ COPIAR NUNCA TRAVA: `bloqueado` apaga só o que EDITA (os links e o campo).
 * ⚠ NENHUMA RETICÊNCIA: valor longo quebra de linha (`overflow-wrap`), e a linha só tem altura MÍNIMA.
 */
export function DadosParaPagamento({
  modo, bloco, forma, fornecedorNome, realizado, temCadastro = true, texto, bloqueado, campoClassName,
  onTexto, onUsarProprio, onVoltarAoCadastro, onEditarCadastro,
}: {
  modo: 'cadastro' | 'proprio';
  bloco: BlocoDoCadastro;
  forma: string;
  fornecedorNome: string | null;
  /** O lançamento JÁ está pago: o texto gravado é histórico e o cadastro, quando aparece, é o "cadastro atual". */
  realizado: boolean;
  /** `false` em Entradas e Transferências: não há cadastro para onde voltar, e o link "voltar a usar o cadastro" não aparece. */
  temCadastro?: boolean;
  texto: string;
  bloqueado?: boolean;
  campoClassName?: string;
  onTexto: (t: string) => void;
  onUsarProprio: () => void;
  onVoltarAoCadastro: () => void;
  onEditarCadastro: () => void;
}) {
  const copiar = (valor: string, aviso: string) => { void navigator.clipboard.writeText(valor); toast.success(aviso); };
  const LINK = 'underline underline-offset-2 hover:text-foreground disabled:opacity-40 disabled:no-underline';
  const BOTAO_COPIAR = 'inline-flex h-[18px] shrink-0 items-center gap-1 rounded px-1.5 text-[9.5px] leading-none';
  /* a altura acompanha o texto: uma linha de campo por linha de texto, e o que quebrar por largura cresce pelo scrollHeight */
  const areaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = areaRef.current;
    if (!el || modo !== 'proprio') return;
    el.style.height = 'auto';
    if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight + 2}px`;
  }, [texto, modo]);

  if (modo === 'proprio') {
    return (
      <div data-testid="pgto-proprio">
        <div className="mb-0.5 flex items-center justify-between gap-2 text-[9.5px] text-muted-foreground">
          <span className="font-semibold text-primary">{realizado ? 'Dados gravados neste lançamento' : 'Dados próprios deste lançamento'}</span>
          <span className="flex items-center gap-2">
            {texto && (
              <button type="button" className={cn(BOTAO_COPIAR, 'border text-foreground hover:bg-muted')} onClick={() => copiar(texto, 'Dados copiados')}>
                <Copy className="h-2.5 w-2.5" /> Copiar
              </button>
            )}
            {!realizado && temCadastro && (
              <button type="button" className={LINK} disabled={bloqueado} onClick={onVoltarAoCadastro}>voltar a usar o cadastro</button>
            )}
          </span>
        </div>
        <Textarea ref={areaRef} tabIndex={14} value={texto} onChange={e => onTexto(e.target.value)} disabled={bloqueado}
          rows={Math.max(2, texto.split('\n').length)} placeholder="Chave PIX, dados bancários..."
          className={cn('min-h-[40px] resize-none overflow-hidden text-xs', campoClassName)} />
      </div>
    );
  }

  const linkProprio = (rotulo: string) => (
    <button type="button" className={LINK} disabled={bloqueado} onClick={onUsarProprio}>{rotulo}</button>
  );

  if (bloco.tipo === 'falta') {
    const nome = fornecedorNome ?? 'O fornecedor';
    return (
      <div data-testid="pgto-falta">
        <div className="flex items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {bloco.falta === 'pix' ? `${nome} não tem Pix cadastrado.` : `${nome} não tem dados bancários cadastrados.`}
          </span>
          <button type="button" disabled={bloqueado} onClick={onEditarCadastro}
            className="inline-flex h-[20px] shrink-0 items-center rounded bg-primary px-2 text-[9.5px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {bloco.falta === 'pix' ? '+ Cadastrar Pix do fornecedor' : '+ Cadastrar dados bancários do fornecedor'}
          </button>
        </div>
        <div className="mt-0.5 text-right text-[9.5px] text-muted-foreground">{linkProprio('informar dados só neste lançamento')}</div>
      </div>
    );
  }

  if (bloco.tipo === 'nada') {
    return (
      <div className="flex min-h-[32px] items-center text-[9.5px] text-muted-foreground" data-testid="pgto-nada">
        {linkProprio('informar dados só neste lançamento')}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border" data-testid="pgto-bloco" data-forma={forma}>
      <div className="flex items-center justify-between gap-2 bg-muted px-2 py-[3px] text-[9.5px] leading-[12px]">
        <span className="font-semibold text-primary" data-testid="pgto-cabecalho">
          {bloco.titulo} · {realizado ? 'cadastro atual' : 'do cadastro do fornecedor'}
        </span>
        <span className="min-w-0 text-right text-muted-foreground [overflow-wrap:anywhere]">{fornecedorNome}</span>
      </div>
      {bloco.linhas.map(l => (
        <div key={l.rotulo} data-testid="pgto-linha"
          className="grid min-h-[22px] grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-x-2 border-t px-2 text-[10px] leading-[12px]">
          <span className="text-muted-foreground">{l.rotulo}</span>
          <span className={cn('min-w-0 py-[2px] [overflow-wrap:anywhere]', l.principal && 'font-semibold')}>{l.valor}</span>
          {l.copia ? (
            <button type="button" onClick={() => copiar(l.copia ?? '', l.aviso ?? 'Copiado')}
              className={cn(BOTAO_COPIAR, l.principal ? 'bg-primary font-medium text-primary-foreground hover:bg-primary/90' : 'border text-foreground hover:bg-muted')}>
              <Copy className="h-2.5 w-2.5" /> {l.principal ? 'Copiar chave' : 'Copiar'}
            </button>
          ) : <span />}
        </div>
      ))}
      <div className="flex items-start justify-between gap-3 border-t px-2 py-[3px] text-[9.5px] leading-[12px] text-muted-foreground">
        <span className="min-w-0 [overflow-wrap:anywhere]">Observação do cadastro: {bloco.observacao ?? '—'}</span>
        <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          <button type="button" className={LINK} disabled={bloqueado} onClick={onEditarCadastro}>editar cadastro</button>
          <span>·</span>
          {linkProprio('usar outros dados só neste lançamento')}
        </span>
      </div>
    </div>
  );
}

/**
 * GRAVA O PARCELAMENTO E AVISA QUEM MOSTRA LANCAMENTOS — FIN-V2-REFRESH-02.
 *
 * ⚠ SAIU DO CORPO DO `handleSubmit` SO' PARA SER TESTAVEL: e' o mesmo trecho, na mesma ordem
 * (RPC, recusa, invalidacao, notificacao). O teste chama ESTA funcao, e o componente tambem —
 * nao ha segunda copia do caminho.
 */
export async function gravarParcelamento(
  payload: ReturnType<typeof montarPayloadParcelamento>, clienteId: string, invalidar: () => Promise<unknown>,
  divisao?: { partes: ParteNova[]; motivo: string },
): Promise<string | null> {
  /* NOTA-CONTAS-NA-CRIACAO-01 A — com a divisao pelos itens escolhida antes de salvar: o cadastro E a divisao numa chamada so'
     (`fn_parcelamento_cadastrar_dividido`, uma transacao: a divisao recusada desfaz o cadastro inteiro). Sem ela, o de sempre. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = divisao ? await (supabase as any).rpc('fn_parcelamento_cadastrar_dividido', { p_payload: payload, p_partes: divisao.partes, p_motivo: divisao.motivo })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
    : await (supabase as any).rpc('fn_parcelamento_cadastrar', { p_payload: payload });
  if (error) throw error;
  /* ⚠ INVALIDAÇÃO AMPLA, e é deliberado: este modal é montado por DEZ telas diferentes,
     cada uma com o seu `onSave` e a sua forma de recarregar, e o parcelamento não passa
     por nenhum deles — quem grava agora é a RPC. Escolher chaves aqui exigiria este
     componente conhecer as dez. */
  await invalidar();
  /* ⚠ E A LISTA DO FINANCEIRO V2 NAO E' REACT-QUERY — FIN-V2-REFRESH-02. O `invalidateQueries`
     acima nao a alcanca (e' `useState` dentro do `useFinanceiroV2`): as N parcelas nasciam
     no banco e so' apareciam no F5. A notificacao do hook e' o canal que ja existe para
     escrita feita POR FORA dele — cada instancia inscrita relê com os filtros que esta'
     mostrando. So' no sucesso: quem chegou aqui passou pelo `if (error) throw`. */
  notificarLancamentosMudaram(clienteId);
  /* FIN-NFE-PARCELAS-01 — o uuid do financiamento (a RPC devolve `uuid`): e' por ele que os documentos
     pendentes acham a parcela 1. */
  return typeof data === 'string' ? data : null;
}

function formatNotaFiscal(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  const padded = digits.padStart(9, '0');
  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
}

/** Format number to BRL string with 2 decimals */
function toBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse BRL string back to number */
function parseBRL(s: string): number {
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

// ─── PR-Mesa-ExcelContext: subcomponentes read-only do painel lateral ───
function ExcelCtxRow({ label, value, block }: { label: string; value: string | null; block?: boolean }) {
  if (block) {
    return (
      <div>
        <div className="text-muted-foreground">{label}:</div>
        <div className="font-medium break-words">{value ?? '—'}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="font-medium text-right break-words">{value ?? '—'}</span>
    </div>
  );
}

function ExcelCtxConta({
  label,
  conta,
}: {
  label: string;
  conta: { sistemaNome: string | null; excelTexto: string | null };
}) {
  const vazio = !conta.sistemaNome && !conta.excelTexto;
  return (
    <div>
      <div className="text-muted-foreground">{label}:</div>
      {vazio ? (
        <div className="font-medium">—</div>
      ) : (
        <>
          <div className="font-medium break-words">{conta.sistemaNome ?? conta.excelTexto}</div>
          {conta.sistemaNome && conta.excelTexto && (
            <div className="text-[10px] text-muted-foreground break-words">
              origem Excel: {conta.excelTexto}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PR-FIN-MODAL-02D — Painel lateral de RESUMO (SOMENTE LEITURA; ESPELHA o LancamentoV2Form) ───
//   Camada EXCLUSIVAMENTE de apresentação: apenas reflete os valores atuais do formulário.
//   NÃO infere status/completude (sem semáforo/bolinhas) — indicador de pendência só quando existir
//   fonte oficial e única de validação (frente futura). Títulos de bloco neutros; vazio → "—".
// MODAIS-PADRAO-01e — `ResumoBlocoHead` e `ResumoRow` SAIRAM: a faixa de secao e o par rotulo-valor sao
// `SecaoResumo` e `LinhaResumo` de `ui/linha-resumo`, as mesmas pecas do Abate, da Venda, da Compra e do envelope.

/** Add N days to a date string (YYYY-MM-DD) */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Add N months to a date string, clamping to valid day */
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  const targetMonth = d.getMonth() + months;
  const day = d.getDate();
  d.setMonth(targetMonth, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Get month label in pt-BR */
function getMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

/* ⚠ `ParcelaRow` E `generateParcelas` MORRERAM AQUI — PAR-02, e eram o WRITER, não uma prévia.
   A grade que o operador editava virava, linha a linha, N lançamentos soltos pelo laço do
   salvar. Quem calcula as parcelas agora é a RPC, e quem as MOSTRA é `preverParcelas`
   (`lib/financiamentos/montarPayloadParcelamento`), que espelha a aritmética dela.
   ⚠ AS TRÊS DIVERGÊNCIAS QUE A FUNÇÃO ANTIGA TINHA, e que faziam a tela prometer o que o banco
   não gravava: `addDays(i * 30)` em vez de mês de verdade (num plano de 8x o dia derivava de 6
   para 2), `Math.floor` onde a RPC usa `round`, e a data escalonada indo para o PAGAMENTO sob
   um cabeçalho escrito "Vencimento".
   ⚠ NÃO CONFUNDIR COM AS QUATRO `gerarParcelas` HOMÔNIMAS do repo (AbateFinanceiroPanel,
   VendaFinanceiroPanel, BoitelPlanningDialog e useFinanciamentoCadastro): são funções próprias,
   de outras telas, e nenhuma foi tocada. */

export function LancamentoV2Dialog({
  open, carregando, onClose, onSave, onDelete, lancamento, fazendas, contas, classificacoes,
  fornecedores, safras, defaultFazendaId, onCriarFornecedor, prefill, lockedFields, onLancamentoCriado,
  ocultarParcelamento, tiposOperacaoPermitidos, origemOC,
  referenciaOperacionalInfo, excelContext, permiteEditarFavorecidoOC, onAbrirOperacaoOC, onAbrirContrato,
  documentosAntesDeSalvar,
}: Props) {
  const { clienteAtual } = useCliente();
  /* ACESSOS-02b — os atalhos deste modal para a OC ("Abrir →", "corrigir na operação", "Abrir OC →", criar OC do legado) so' se
     oferecem a quem acessa a tela da OC; os avisos que dizem que o lancamento e' de uma operacao continuam. */
  const podeAbrirOC = usePodeAbrir(TELA_DA_OPERACAO);
  /* ACESSOS-02c — gesto que ALTERA a operacao (vincular, desvincular) fica apagado com o motivo para quem nao a edita. */
  const podeAlterarOperacao = usePodeAlterarOperacao();
  const qc = useQueryClient();
  /* ⚠ OS DOCUMENTOS SÓ EXISTEM DEPOIS QUE O LANÇAMENTO EXISTE: as RPCs recebem
     `p_lancamento_id`, e num lançamento novo não há id para anexar nada. Por isso o hook
     nasce desligado (`null`) e a aba diz o que fazer, em vez de oferecer um botão que
     recusaria no servidor. */
  const documentosApi = useLancamentoDocumentos(lancamento?.id ?? null, clienteAtual?.id ?? null);
  /* ITENS-NOTA-01 — os itens da nota: os guardados pela chave dos documentos; no novo que nasce de uma nota, os do proprio arquivo */
  const itensDaNota = useItensDaNota({
    clienteId: clienteAtual?.id ?? null,
    chaves: (documentosApi.documentos ?? []).map((d) => d.chaveAcesso ?? '').filter(Boolean),
    arquivo: !lancamento ? prefill?.doXml?.arquivo ?? null : null,
  });
  /* FIN-CLASSIF-DIVIDIDA-01b — a classificacao dividida do lancamento SALVO: as partes gravadas e a ultima operacao que se desfaz (relidas
     a cada dividir/voltar/desfazer: `divisaoSeq`). O que se grava e' so' pelas RPCs da divisao, com motivo. */
  const [divisao, setDivisao] = useState<DivisaoLida | null>(null);
  const [divisaoSeq, setDivisaoSeq] = useState(0);
  const [dividirAberto, setDividirAberto] = useState(false);
  const [motivoDaDivisao, setMotivoDaDivisao] = useState<{ tipo: 'itens'; mapa: ReadonlyMap<number, string> } | { tipo: 'voltar' } | { tipo: 'desfazer' } | null>(null);
  const [contasAprendidas, setContasAprendidas] = useState<ReadonlyMap<number, string>>(new Map());
  /* NOTA-CONTAS-NA-CRIACAO-01 A — a divisao pelos itens escolhida no NOVO lancamento: PENDENTE na tela (nada vai ao banco antes do Salvar);
     o Salvar cria e divide (o parcelado numa transacao so'; o a' vista cancela o recem-criado se a divisao recusar) */
  const [divisaoNaCriacao, setDivisaoNaCriacao] = useState<ReadonlyMap<number, string> | null>(null);
  useEffect(() => {
    let vivo = true;
    setDivisao(null);
    if (!open || !lancamento?.id) return;
    void lerDivisao(lancamento.id).then((d) => { if (vivo) setDivisao(d); }, () => undefined);
    return () => { vivo = false; };
  }, [open, lancamento?.id, divisaoSeq]);
  /* FIN-NFE-PARCELAS-01 — os documentos do lançamento NOVO, em memória até o salvar. `posSalvar`
     existe quando o lançamento já foi gravado e algum documento não: a partir dali o botão principal
     some (salvar de novo criaria OUTRO lançamento) e sobra o "Tentar de novo". */
  const [pendentes, setPendentes] = useState<DocumentoPendente[]>([]);
  /* FIN-NFE-XML-01d — o que o operador decidiu sobre o que veio do XML. Tudo e' ESTADO DE TELA: nada e' gravado antes do Salvar. */
  const [xmlFaixaFechada, setXmlFaixaFechada] = useState(false);
  const [xmlRegistradaDispensada, setXmlRegistradaDispensada] = useState(false);
  /* NOTA-FORNECEDOR-COMPARAR-01 — o cadastro so' muda pela COMPARACAO (campo · hoje · da nota, confirmada no modal), nunca ao salvar:
     `xmlComparar` = o cadastro de hoje (modal aberto); `xmlNotaCompleta` = a nota traz algo que o cadastro achado pelo CNPJ nao tem */
  const [xmlComparar, setXmlComparar] = useState<CadastroParaComparar | null>(null);
  const [xmlAbrindoComparar, setXmlAbrindoComparar] = useState(false);
  const [xmlCadastroAtualizado, setXmlCadastroAtualizado] = useState(false);
  const [xmlNotaCompleta, setXmlNotaCompleta] = useState(false);
  const [xmlFornecedorProposto, setXmlFornecedorProposto] = useState<string | null>(null);
  const [xmlCriandoFornecedor, setXmlCriandoFornecedor] = useState(false);
  /* NOTA-FORNECEDOR-DUPLICA-01 — o CNPJ da nota ja' e' de um cadastro (conferido no banco ANTES de criar): a faixa diz de quem e oferece usar */
  const [xmlConflito, setXmlConflito] = useState<CadastroComODocumento | null>(null);
  /* O alvo da nova tentativa: o lançamento à vista, ou as parcelas do parcelamento (PR 2b). `null` = não
     há como tentar de novo daqui (a frase diz o caminho). */
  const [posSalvar, setPosSalvar] = useState<{
    alvo: { tipo: 'avista'; lancamentoId: string } | { tipo: 'parcelado'; parcelas: ParcelaGravada[] } | null;
    erro: string;
  } | null>(null);
  const [gravandoDocs, setGravandoDocs] = useState(false);
  /* PR 2b — "Anexar vários boletos": aberto da grade do novo parcelado ('previa') ou da parcela aberta ('irmas'). */
  const [anexarBoletos, setAnexarBoletos] = useState<'previa' | 'irmas' | null>(null);
  const [irmas, setIrmas] = useState<ParcelaIrma[] | null>(null);
  const [erroAntesDeSalvar, setErroAntesDeSalvar] = useState<string | null>(null);
  /* As irmãs de uma parcela aberta (a consulta do M6 da FASE 0). Só no editar; `null` = não é parcela. */
  useEffect(() => {
    let cancelado = false;
    setIrmas(null);
    if (!open || !lancamento?.id || !clienteAtual?.id) return;
    irmasDaParcela(lancamento.id, clienteAtual.id)
      .then(r => { if (!cancelado) setIrmas(r); })
      .catch(() => { if (!cancelado) setIrmas(null); });
    return () => { cancelado = true; };
  }, [open, lancamento?.id, clienteAtual?.id]);
  const navigate = useNavigate();
  const isEdit = !!lancamento;
  // PR-SAFE-0 — título originado da Operação Comercial: valor/favorecido/classificação/tipo
  //   são somente leitura (edição estrutural pertence à OC). Detecção ESTRUTURAL pelo marcador
  //   de proveniência persistido (origem_lancamento), nunca por texto de UI. O writer
  //   (useFinanceiroV2.editarLancamento) aplica a mesma proteção de forma independente.
  const isOCTitulo = isEdit && lancamento?.origem_lancamento === 'operacao_comercial';
  /* OC-CC-MODAL-FINANCEIRO-01 — o modo OC so' existe no lancamento NOVO; `travado` e' a leitura unica de `lockedFields`
     para os quatro campos novos (fazenda, favorecido, classificacao, status). */
  const modoOC = !isEdit && origemOC ? origemOC : null;
  const travado = (campo: CampoTravavelDoModal) => lockedFields?.includes(campo) ?? false;
  const [itemOC, setItemOC] = useState('');
  const [tentouOC, setTentouOC] = useState(false);
  const [simOC, setSimOC] = useState<{ aviso: string | null; erro: string | null } | null>(null);
  /* ⚠ `permiteEditarFavorecidoOC` DEIXOU DE SER CONDICAO — FIN-FORNECEDOR-OC-EDIT (B-19).
     O favorecido passou a ser editavel nos DOIS caminhos; a prop continua no contrato
     porque e' por ela que a aba Financeiro da OC declara a sua abertura, e remove-la
     mexeria no `FinanceiroV2Tab` por um motivo que nao e' deste PR. Ver a nota inteira no
     campo Fornecedor. */
  void permiteEditarFavorecidoOC;
  // Store the editing ID in a ref so it can't become stale during async save
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = lancamento?.id ?? null;
  }, [lancamento]);
  const [saving, setSaving] = useState(false);
  /* A confirmação do cancelamento e o motivo que ela coleta — PR-CPR-2A.4. */
  const [confirmandoCancelamento, setConfirmandoCancelamento] = useState(false);
  /* PARC-CADEIA-01 — o lançamento é parcela viva de compra parcelada (quem diz é o BANCO, pela simulação): em vez da
     confirmação de sempre abre o aviso, que cancela a parcela e ajusta o contrato juntos. */
  const [parcelaACancelar, setParcelaACancelar] = useState<PreviaCancelarParcela | null>(null);
  /* CONC-SPLIT-FILHO-CANCELADO-01 — o lançamento é filho de um desmembramento vivo (quem diz é o BANCO): em vez da
     confirmação de sempre abre o aviso, que mostra o desmembramento e oferece desfazê-lo inteiro. */
  const [splitACancelar, setSplitACancelar] = useState<SplitDoLancamento | null>(null);
  /* PARC-CADEIA-01 passo 3 — o contrato de que este lançamento é parcela viva (lido do dono da situação, só na edição de quem
     PODE ser parcela). Com ele, valor e vencimento da parcela mudam JUNTO com o lançamento; sem ele, o modal é o de sempre. */
  const [contratoDaParcela, setContratoDaParcela] = useState<ContratoDaParcela | null>(null);
  const idDaPossivelParcela = open && lancamento?.id && podeSerParcelaDeContrato(lancamento) ? lancamento.id : null;
  useEffect(() => {
    setContratoDaParcela(null);
    if (!idDaPossivelParcela) return;
    let vivo = true;
    void lerContratoDaParcela(idDaPossivelParcela).then(c => { if (vivo) setContratoDaParcela(c); });
    return () => { vivo = false; };
  }, [idDaPossivelParcela]);
  /* FIN-CONCILIADO-NAO-REBAIXA-01 — o lançamento está CASADO COM O EXTRATO? Quem diz é o banco, UMA leitura por abertura da
     edição. Casado: status, pagamento, valor e a conta da direção ficam em leitura, com a frase no rodapé; não casado (ou
     sem resposta): o modal é o de sempre, e a trava do banco continua valendo. */
  const [casadoComExtrato, setCasadoComExtrato] = useState(false);
  const idParaLerCasado = open && lancamento?.id ? lancamento.id : null;
  useEffect(() => {
    setCasadoComExtrato(false);
    if (!idParaLerCasado) return;
    let vivo = true;
    void consultarCasadoComExtrato(idParaLerCasado).then(c => { if (vivo && c) setCasadoComExtrato(true); });
    return () => { vivo = false; };
  }, [idParaLerCasado]);
  const travaCasado = camposTravadosDoCasado(casadoComExtrato, lancamento);
  /* OC-TITULO-AJUSTAR-01 — em aberto e sem conciliacao, o titulo de OC tem vencimento, conta e classificacao editaveis aqui. */
  const ocAjustavel = tituloOCAjustavel(lancamento?.status_transacao, casadoComExtrato);
  const motivoOCTravado = motivoTituloOCTravado(lancamento?.status_transacao, casadoComExtrato);
  /* P3: o porque no proprio campo (title), so' no titulo de OC */
  const porqueOC = (campo: CampoDoTituloOC) => (isOCTitulo ? motivoDoCampoOC(campo, ocAjustavel, motivoOCTravado, ondeAjustarTituloOC(podeAbrirOC)) ?? undefined : undefined);
  const [consultandoParcela, setConsultandoParcela] = useState(false);
  const abrirCancelamento = async () => {
    if (consultandoParcela) return;
    setMotivoCancelamento('');
    const id = lancamento?.id;
    setConsultandoParcela(true);
    const previa = id ? await consultarParcelaDoLancamento(id) : null;
    /* A ORDEM: parcela de compra parcelada -> filho de desmembramento -> a confirmação de sempre. */
    const split = !previa && id ? await consultarSplitDoLancamento(id) : null;
    setConsultandoParcela(false);
    if (previa) setParcelaACancelar(previa);
    else if (split) setSplitACancelar(split);
    else setConfirmandoCancelamento(true);
  };
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);
  // PR-FIN-MODAL-02B — aba ativa (Tabs controlado). Vive no pai; nenhum estado de campo é
  // duplicado por aba. Redefinida para 'geral' na hidratação (abrir/trocar de registro).
  const [abaAtiva, setAbaAtiva] = useState<AbaVisual>('geral');

  /* Os catálogos da trilha saem das props que o modal já recebe — nenhuma consulta a mais
     para trocar um UUID por um nome. */
  const catalogosAuditoria = useMemo(() => ({
    fornecedor: (id: string) => fornecedores.find((f) => f.id === id)?.nome,
    /* `nome_exibicao` é o rótulo que o operador vê nos seletores; `nome_conta` é o
       cadastro. A frase usa o mesmo nome que a tela mostra em todo lugar. */
    conta: (id: string) => { const c = contas.find((x) => x.id === id); return c?.nome_exibicao ?? c?.nome_conta; },
    fazenda: (id: string) => fazendas.find((f) => f.id === id)?.nome,
  }), [fornecedores, contas, fazendas]);
  const [fornecedorDialogOpen, setFornecedorDialogOpen] = useState(false);
  // FASE 1 zoo-fin: aviso de origem zootécnica + navegação para LancamentoZooModal.
  // zooModalId é capturado ao clicar no link âmbar; abre só após o V2Dialog
  // desmontar (setTimeout pequeno) para evitar stacking de dois modais editáveis.
  const [zooModalId, setZooModalId] = useState<string | null>(null);
  const handleAbrirZoo = () => {
    if (!lancamento?.movimentacao_rebanho_id) return;
    const idZoo = lancamento.movimentacao_rebanho_id;
    onClose();
    setTimeout(() => setZooModalId(idZoo), 100);
  };

  // Fornecedor search state
  // PR-U2c-1C: seletor de Fornecedor migrou p/ <FavorecidoSelect />. `fornecedorSearch`
  // permanece controlado aqui pois o SAVE reaproveita o texto p/ auto-criar fornecedor.
  const [fornecedorSearch, setFornecedorSearch] = useState('');

  // Installment state
  const [formaPagamentoParc, setFormaPagamentoParc] = useState<'avista' | 'parcelada'>('avista');
  /**
   * Nº de parcelas — 133i-b item 5.
   *
   * ⚠ DOIS ESTADOS, E É O QUE PERMITE DIGITAR "10". O campo guardava só o número e o
   * `onChange` clampava a CADA TECLA: para chegar a 10 o operador digita "1", que é menor
   * que o mínimo 2, e o clamp o transformava em 2 antes do "0" existir. O 10 era
   * inalcançável pelo teclado — só pelas setinhas, uma a uma.
   * ⚠ O TEXTO É O QUE O CAMPO MOSTRA; o número é o que a grade usa, e ele só muda no
   * blur/Enter. Assim a grade não se refaz a cada tecla sobre um valor intermediário.
   * ⚠ O IDIOMA JÁ EXISTE NO REPO, em quatro telas (`AbateFinanceiroPanel`,
   * `VendaFinanceiroPanel`, `CompraFinanceiroPanel`, `AbateDetalhesDialog`): elas guardam a
   * string e derivam o número. Aqui é a mesma coisa, com o clamp adiado.
   */
  const [numParcelas, setNumParcelas] = useState(2);
  const [numParcelasTexto, setNumParcelasTexto] = useState('2');
  /* PARC-LIVRES-01 — "Igual todo mês" (a prévia da RPC, como sempre) × "Parcelas livres" (valor e vencimento por parcela).
     `baseLivres` é o ponto de partida das livres (as duplicatas da nota, ou a prévia mensal): é o que o "voltar" restaura. */
  const [modoParcelas, setModoParcelas] = useState<ModoDasParcelas>('mensal');
  const [parcelasLivres, setParcelasLivres] = useState<ParcelaLivre[]>([]);
  const [baseLivres, setBaseLivres] = useState<ParcelaLivre[] | null>(null);
  /** Aplica o mínimo/máximo — só no blur/Enter, nunca a cada tecla. */
  const fecharNumParcelas = () => {
    const n = Math.max(2, Math.min(24, parseInt(numParcelasTexto, 10) || 2));
    setNumParcelas(n);
    setNumParcelasTexto(String(n));
  };
  /* ⚠ DERIVADO, NÃO ESTADO — PAR-02. Era `useState` porque a grade era editável e o que
     estivesse nela ia para o banco. Agora ela só mostra o que a RPC vai gravar, então manter
     uma cópia em estado seria abrir espaço para a tela e o banco discordarem de novo. */

  // Frequency state

  const [fazendaId, setFazendaId] = useState('');
  /* ⚠ SÓ PARA A `key` DO CLUSTER — ver o comentário na montagem dele. Incrementa a cada
     abertura, que é o gesto em que os estados de interação da classificação precisam zerar. */
  const [aberturaSeq, setAberturaSeq] = useState(0);

  /**
   * A CLASSIFICAÇÃO INTEIRA, NUM OBJETO SÓ — PAR-01a-i, passo 1 de 2 do extract.
   *
   * ⚠ ERAM DEZ `useState` SOLTOS, e a soltura era o problema: a regra que os governa é
   * CRUZADA — trocar a atividade limpa o subcentro de outro escopo e a safra cruzada; escolher
   * um subcentro sobrescreve a atividade; administrativo limpa a safra e trava a fazenda. Dez
   * estados independentes para um dado que se move junto é o convite para o próximo PR mexer em
   * nove e esquecer o décimo.
   * ⚠ OS NOMES SÃO OS DO SAVE (`safra_id`, `macro_custo`, …), não os das variáveis antigas: é
   * este objeto que vai virar o `value` do `ClassificacaoLancamento` no PAR-01a-ii, e renomear
   * na passagem seria trocar duas coisas de uma vez.
   * ⚠ E OS TRÊS ESTADOS DE INTERAÇÃO FICARAM DE FORA — `safraSugeridaId`, `safraEditadaAMao` e
   * `subcentroLimpoPelaAtividade`. Eles não são dado gravado: são memória de quem está
   * digitando, e é ela que coordena a sugestão de safra com a hidratação. Misturá-los ao dado
   * faria o `value` do componente carregar estado de interação.
   */
  const [classificacao, setClassificacao] = useState<{
    atividade: Atividade | null;
    safra_id: string;
    cultura: string;
    fase: string;
    subcentro: string;
    macro_custo: string;
    grupo_custo: string;
    centro_custo: string;
    escopo_negocio: string;
    plano_conta_id: string | null;
  }>({
    atividade: null, safra_id: '', cultura: '', fase: '',
    subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
    escopo_negocio: '', plano_conta_id: null,
  });

  /* ⚠ AS LEITURAS CONTINUAM PELOS MESMOS NOMES, e é de propósito: são mais de noventa pontos
     que apenas LEEM esses campos (no JSX, no payload do save, nas validações). Trocar os
     noventa junto com os trinta que escrevem misturaria a mudança de forma com a chance de
     errar um. Aqui muda o ESTADO; os nomes de leitura ficam onde estavam. */
  const {
    atividade, safra_id: safraId, cultura, fase, subcentro,
    macro_custo: macroCusto, grupo_custo: grupoCusto, centro_custo: centroCusto,
    escopo_negocio: escopoNegocio, plano_conta_id: planoContaId,
  } = classificacao;
  /**
   * O CARD "ATIVIDADE" É PRÉ-FILTRO, NÃO DADO — PR-FIN-ATIVIDADE-01 (decisão D13).
   *
   * ⚠ NÃO GRAVA NADA. O `escopo_negocio` do lançamento continua vindo do plano, pelo
   * trigger `resolve_classificacao_from_plano`. Este estado só encolhe a lista do subcentro.
   * ⚠ ESTE É O PONTO EM QUE O ESCOPO PASSA A TER DUAS ORIGENS, e a precedência é fixa: o
   * card FILTRA, o plano MANDA. Quem escolhe um subcentro leva o escopo dele — e o card se
   * ajusta ao que veio. Nunca o contrário. Acontece com a lista completa (sem card) e ao
   * editar um lançamento cujo plano mudou de escopo depois de gravado; nos dois casos o
   * dado gravado vence a preferência de quem está olhando.
   */
  /* CULTURA (lavoura) e FASE (pecuária) — AGRI-MODAL-CULTURA-01. Vazio é escolha: significa
     compartilhado, e a frase abaixo do campo diz isso. */
  /**
   * A SAFRA SE SUGERE, MAS NÃO SE IMPÕE — PR-FIN-ATIVIDADE-01b.
   *
   * ⚠ DOIS ESTADOS PARA UMA COISA SÓ, e cada um responde uma pergunta diferente:
   * `safraSugeridaId` é "este valor foi posto por mim ou escolhido por ele?" — é o que
   * permite substituir a sugestão quando a data muda sem apagar uma escolha; e
   * `safraEditadaAMao` é "ele já disse o que quer?" — a partir daí a sugestão cala até o
   * modal fechar. Sem o segundo, escolher a safra e depois corrigir a data desfaria a
   * escolha, e o operador teria de escolher de novo sem entender por quê.
   */
  /**
   * O subcentro com que o modal ABRIU — PR-FIN-DRE-BADGE-01.
   *
   * ⚠ NÃO É REDUNDANTE COM `lancamento.subcentro`: o valor de abertura pode vir do plano da
   * transferência (que o modal resolve ao abrir) e não do que está gravado. O badge precisa
   * saber se o operador MEXEU, e mexer é diferente de divergir do banco.
   */
  const [subcentroDeAbertura, setSubcentroDeAbertura] = useState('');
  /**
   * A RECUSA DE DIRECAO, AO LADO DO SUBCENTRO — BOITEL-ABATE-PRODUTOR-01d (UX-TOAST-01).
   * ⚠ GUARDA O PAR (subcentro, tipo) EM QUE FOI DADA: trocar qualquer um dos dois apaga a frase sem
   *   efeito nenhum — ela so' aparece enquanto descreve o que esta' na tela.
   */
  const [erroDirecao, setErroDirecao] = useState<{ texto: string; subcentro: string; tipo: string } | null>(null);

  /* O plano tem escopos que o card não oferece (vazio, e os legados). Marcar uma pílula que
     não existe deixaria o card em branco filtrando por algo — pior que não filtrar. */
  const [dataCompetencia, setDataCompetencia] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');   // PR-FIN-MODAL-VENCIMENTO-02B
  const [dataPagamento, setDataPagamento] = useState('');
  const [descricao, setDescricao] = useState('');
  const [favorecidoId, setFavorecidoId] = useState('');
  /* FORN-SELETOR-PADRAO-01 passo 1b — o seletor de fornecedor lê do LEITOR ÚNICO (mesmo cache: nenhuma ida a mais). O modal
     pergunta "quem é este id?" a UM lugar (`fornecedorPorId`): a lista do hospedeiro e, na falta, a do leitor — um fornecedor
     criado em outra tela depois de o hospedeiro carregar existe no leitor e não pode virar "Favorecido inválido" no Salvar. */
  const fornecedoresDoLeitor = useFornecedoresDoCliente(clienteAtual?.id ?? null, favorecidoId || null);
  const fornecedorPorId = useCallback((id: string | null | undefined) => {
    if (!id) return null;
    return fornecedores.find((f) => f.id === id)
      ?? fornecedoresDoLeitor.fornecedores.find((f) => f.id === id)
      ?? (fornecedoresDoLeitor.gravado?.id === id ? fornecedoresDoLeitor.gravado : null);
  }, [fornecedores, fornecedoresDoLeitor.fornecedores, fornecedoresDoLeitor.gravado]);

  /**
   * A chave da linha do plano escolhida — PR-FIN-PLANO-CHAVE-02 (front).
   *
   * ⚠ ANDA COLADO NO `subcentro`: todo ponto que mexe num mexe no outro (escolher no
   * seletor, trocar o tipo, trocar a atividade, abrir para editar, prefill, reset). Mandar
   * a chave de uma conta com o texto de outra é o único jeito de este PR fazer estrago —
   * o trigger obedece à chave quando ela muda, e reescreveria o texto por cima.
   * ⚠ `null` É VÁLIDO E ACONTECE: subcentro legado (sem linha no plano) e dividendo (cuja
   * entrada é sintetizada por cliente) não têm chave. O trigger resolve os dois pelo texto.
   */
  // FIN-MODAL-FECHO-01 item 2 — operacao_id + tipo resolvidos pelo vínculo zoo_operacao_partes
  // (somente leitura). O link "Abrir operação" só é exibido para tipos que possuem fluxo soberano
  // de abertura implementado (hoje: compra — CompraModalShell/PR-OC-COMPRA-OPEN-01). Venda/abate
  // ainda não têm abridor de operação OC → botão NÃO é exibido (evita botão morto).
  const [operacaoId, setOperacaoId] = useState<string | null>(null);
  /* OC-TITULO-AJUSTAR-01 — o lancamento e' titulo de OC (parte VIVA), qualquer que seja a origem: o "Receb. 2/2" adotado do
     legado (origem movimentacao_rebanho) tambem e'. E' ele que manda o ajuste pela OC. */
  const [tituloDaOC, setTituloDaOC] = useState(false);
  const [operacaoTipo, setOperacaoTipo] = useState<string | null>(null);
  /* ⚠ ERA `operacaoTipo === 'compra'` — OC-BOITEL-VALOR-01 · B3. A restricao existia porque
     `abrirOperacaoOC` assume COMPRA por omissao (V2Index: `tipo: string = 'compra'`), e abrir uma
     venda por ali devolvia `oc_compra=1`, que a hidratacao recusa. O conserto foi passar o TIPO
     que este modal ja resolve, em vez de esconder o link: numa venda de boitel — justamente a que
     motivou esta frente — o operador via "classificacao pertence a OC" e nao tinha como chegar la. */
  const operacaoAbrivel = !!operacaoId && !!operacaoTipo && podeAbrirOC;
  const [tipoOperacao, setTipoOperacao] = useState('2-Saídas');
  const [statusTransacao, setStatusTransacao] = useState<string>(STATUS_FINANCEIRO_INICIAL);   // PR-FIN-STATUS-UX-03A-1 — inicial 'previsto' (era 'meta')
  // PR-FIN-STATUS-UX-03A-1 — anti-reclassificação silenciosa do legado 'meta':
  //   statusOriginalRef = valor de status_transacao REALMENTE persistido no registro carregado (null p/ novo);
  //   statusTouchedRef  = o usuário escolheu explicitamente outro valor no Select nesta abertura?
  //   Ambos resetados a cada abertura no effect de init; statusTouchedRef só é ligado no onValueChange do Select.
  const statusOriginalRef = useRef<string | null>(null);
  const statusTouchedRef = useRef(false);
  const [valorDisplay, setValorDisplay] = useState('0,00');
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento | ''>('');
  const [notaFiscal, setNotaFiscal] = useState('');
  const [observacao, setObservacao] = useState('');

  // Payment method fields
  const [formaPgto, setFormaPgto] = useState('');
  const [dadosPagamento, setDadosPagamento] = useState('');
  /* FIN-PIX-CADASTRO-MODAL-01 — `dadosPagamento` é o texto PRÓPRIO do lançamento (a exceção). O modo (`cadastro` | `proprio`)
     é calculado do que veio gravado até o operador decidir; daí em diante vale a decisão dele (`modoPgto`). */
  const [modoPgto, setModoPgto] = useState<'cadastro' | 'proprio' | null>(null);
  const [cadastroPgtoAberto, setCadastroPgtoAberto] = useState(false);
  /* O fornecedor RELIDO do banco depois de salvar o cadastro por aqui: vale por cima da prop só enquanto o modal está aberto. */
  const [fornecedorRelido, setFornecedorRelido] = useState<Record<string, FornecedorV2>>({});

  // Product suggestions state
  // PR-U2c-1A: sugestões de Produto migraram para <ProdutoAutocomplete />.

  // PR-U2c-1D: seletor de Subcentro migrou p/ <PlanoSubcentroSelect />. `subcentroSearch`
  // permanece controlado aqui pois o reset ao trocar tipo_operacao o usa.

  const isTransferencia = tipoOperacao === '3-Transferências';
  const isEntrada = tipoOperacao === '1-Entradas';

  /**
   * A conta do plano de uma transferência é uma só — PR-MESA-TRANSF-01 item 3.
   *
   * ⚠ O MESMO CONTRATO DA MESA, E ESSA É A RAZÃO DE EXISTIR. Aqui o campo era livre: dava
   * para gravar uma transferência entre contas classificada em "Manutenção de Máquinas", e
   * o movimento entrava na DRE como despesa — dinheiro que só mudou de conta virando
   * resultado. A Mesa passou a forçar a 18010; se este modal continuasse livre, o mesmo
   * lançamento teria duas regras conforme a porta por onde entrou.
   * ⚠ SE O CATÁLOGO AINDA NÃO CHEGOU, NÃO FORÇA NADA (`null`): travar um campo sobre um
   * valor que não se sabe qual é seria pior que deixá-lo livre.
   */
  const planoTransferencia = useMemo(
    () => planoDeTransferencia(classificacoes), [classificacoes]);
  const subcentroTravado = isTransferencia && !!planoTransferencia;

  /**
   * A classificação que VAI NO PAYLOAD — PR-FIN-TRANSF-SUBCENTRO-01.
   *
   * ⚠ CINTO E SUSPENSÓRIO, e de propósito. O estado já é normalizado ao abrir e ao trocar o
   * tipo, mas as duas dependem de `classificacoes` estar carregada — e ela chega assíncrona.
   * Abrir o modal antes do plano terminar de carregar deixaria o estado com o valor velho e
   * nenhum dos dois caminhos o corrigiria. Aqui é o último ponto antes de gravar, e a
   * verdade da transferência é uma só.
   * ⚠ RESOLVIDA POR `ordem_exibicao` (18010), nunca pelo texto: o nome tem acentos e um dia
   * alguém os corrige.
   */
  const classificacaoParaGravar = () => {
    if (!isTransferencia || !planoTransferencia) {
      return {
        subcentro, macro_custo: macroCusto, grupo_custo: grupoCusto,
        centro_custo: centroCusto, escopo_negocio: escopoNegocio || undefined,
        /* ⚠ A CHAVE SAI DAQUI, e só daqui — PR-FIN-PLANO-CHAVE-02 (front). Os DOIS saves
           deste modal (o à vista/edição e o laço das parcelas) montam o form com
           `...classificacaoParaGravar()`, então a chave e o texto nascem do mesmo lugar e
           não há como um caminho mandar um par que não combina. */
        plano_conta_id: planoContaId,
      };
    }
    return {
      subcentro: planoTransferencia.subcentro,
      macro_custo: planoTransferencia.macro_custo,
      grupo_custo: planoTransferencia.grupo_custo || '',
      centro_custo: planoTransferencia.centro_custo,
      escopo_negocio: planoTransferencia.escopo_negocio || undefined,
      /* A chave da 18010, pela mesma razão que o texto dela: a transferência tem uma
         resposta só, e ela é a linha do plano — não o que estava gravado. */
      plano_conta_id: planoTransferencia.id ?? null,
    };
  };

  /**
   * Trocar o tipo de operação — e o que isso arrasta.
   *
   * ⚠ ERA UMA LINHA DE CINCO `set` NO JSX, e ela zerava a classificação de propósito: cada
   * tipo tem a sua subárvore no plano, e o subcentro do tipo anterior não vale no novo.
   * O que mudou é que "Transferência" não zera — ela FIXA, porque só existe uma resposta.
   * ⚠ ESCOPO SÓ NO RAMO DA TRANSFERÊNCIA: no ramo antigo ele nunca foi tocado, e mexer
   * nele aqui seria mudar comportamento por fora do que este PR pede.
   */
  /**
   * ⚠ TROCAR A ATIVIDADE LIMPA O SUBCENTRO DE OUTRO ESCOPO, e não escolhe outro no lugar.
   * Escolher por conta própria seria classificar o lançamento por dedução — e uma
   * classificação que ninguém conferiu é pior que um campo vazio, porque não pede
   * conferência. O campo fica destacado dizendo o que aconteceu.
   */

  /**
   * As culturas que existem em campo naquela safra — AGRI-MODAL-CULTURA-01/02.
   *
   * ⚠ ELAS ORDENAM, NUNCA FILTRAM — e o 01 errou nisso. Filtrar pela área cadastrada escondeu
   * "Mandioca" de um lançamento de "Catação de Raiz - Mandioca" na 25/26, porque a única área
   * plantada da safra era de amendoim: o operador ficou sem como classificar um custo que
   * existe. O custo chega ANTES do talhão — o adubo é comprado em agosto e a área se cadastra
   * em outubro —, então a lista de escolha é sempre a completa.
   * ⚠ O QUE SOBRA DO ESTREITAMENTO É O ATALHO: quem já tem área na safra vem primeiro, com a
   * marca de plantada. A informação era útil; o que não podia era virar filtro.
   * ⚠ E A FRASE DO RATEIO CONTINUA NOMEANDO SÓ AS PLANTADAS, porque ali o recorte é correto:
   * o rateio distribui entre as culturas que têm área, não entre as que se pode escolher.
   */
  /**
   * AS SAFRAS DA ATIVIDADE ESCOLHIDA — AGRI-MODAL-CULTURA-02 item 1.
   *
   * ⚠ O DROPDOWN MOSTRAVA AS 46, MISTURADAS: um lançamento de Lavoura oferecia "21/22
   * Pecuária" ao lado de "23/24 Lavoura". Não era só ruído — o save RECUSA a combinação
   * (PR-FIN-SAFRA-ESCOPO-01 valida safra × escopo), então a lista oferecia opções que o
   * sistema depois rejeitava. Mostrar o impossível é convidar a testá-lo, e é a mesma regra
   * que o filtro da lista já aplica.
   * ⚠ SEM ATIVIDADE ESCOLHIDA, A LISTA É INTEIRA: o card vazio não é um recorte, é a ausência
   * dele.
   * ⚠ A SAFRA JÁ SELECIONADA NUNCA SOME, ainda que seja de outro escopo. Abrir um lançamento
   * antigo com a combinação cruzada e ver o campo em branco faria parecer que o dado se
   * perdeu — e o que se quer ali é justamente VER o que está gravado para poder corrigir.
   * (Medido: hoje nenhuma safra tem escopo nulo; 37 são de pecuária e 9 de lavoura.)
   */
  const culturasDaSafra = useCulturasDaSafra(safraId || null);

  /* ⚠ AS CANDIDATAS SAÍRAM DAQUI — FIN-SAFRA-ORDEM-02. Elas existiam só para serem
     empilhadas no topo do dropdown; a SUGESTÃO nunca dependeu desta lista: `safraSugerida`
     chama `safrasCandidatas` por dentro, e continua. */

  /**
   * ⚠ NUNCA DEVOLVE O UUID — FIN-AUDITORIA-CULTURA-01 item 2. Ele devolvia: `?? id`. E o
   * caminho não era teórico — ficou provável HOJE: `loadSafras` só traz `ativa = true`, e a
   * consolidação de 12/09 inativou cinco safras por cultura. Qualquer lançamento que ainda
   * aponte para uma delas não acha o nome, e o `title` do campo passava a exibir
   * "5df2fb02-d2df-…" para o operador — regra da casa: UUID não vai à tela.
   * ⚠ E O RÓTULO DIZ O QUE HOUVE, em vez de um traço mudo: "safra inativa" explica por que o
   * campo parece vazio num lançamento que tem safra gravada.
   */

  /**
   * O escopo que o PLANO diz sobre o subcentro escolhido — PR-FIN-SAFRA-ADM-01.
   *
   * ⚠ O PLANO, NÃO O ESTADO `escopoNegocio`. O estado é cópia do que veio na abertura, e
   * cópia pode estar velha se o plano mudou desde então — é a mesma razão pela qual a
   * validação do save já resolvia o escopo assim. Aqui a resolução vira uma só, e a tela
   * passa a decidir pela mesma fonte que o save.
   * ⚠ O FALLBACK PARA O ESTADO É PARA O SUBCENTRO LEGADO, que não tem linha no plano: ali o
   * que está gravado é tudo que se sabe.
   */
  /* ⚠ A CONTA SAIU DAQUI para `escopoDoSubcentro` — MESA-SAFRA-ADM-01. Ela era um `useMemo`
     local, e por isso a Mesa de Enriquecimento não a tinha: a mesma regra valia numa tela e
     não na outra. O comportamento aqui não mudou em nada. */
  const escopoDoPlano = useMemo(
    () => escopoDoSubcentro(classificacoes, subcentro, escopoNegocio),
    [subcentro, classificacoes, escopoNegocio]);

  /**
   * ADMINISTRATIVO NÃO TEM SAFRA — PR-FIN-SAFRA-ADM-01 (decisão do Gabriel, 11/09/2026).
   *
   * ⚠ AS DUAS PORTAS CONTAM, e por isso o `||`: o card sozinho basta (marcar Administrativo
   * antes de escolher a conta já desabilita o campo), e o plano sozinho também (escolher uma
   * conta administrativa com a lista completa move o card e desabilita junto — a precedência
   * do plano sobre o card, que já valia para o escopo).
   * ⚠ MEDIDO NO PROTO: 2.143 dos 21.368 lançamentos administrativos ainda têm safra. São
   * eles que abrem com o campo riscado, e a limpeza em massa é frente do banco.
   */
  const ehAdministrativo = escopoDoPlano === 'administrativo' || atividade === 'administrativo';

  /**
   * A safra que VAI NO PAYLOAD — e é o mesmo par do `classificacaoParaGravar`.
   *
   * ⚠ OS DOIS SAVES PASSAM POR AQUI (o à vista/edição e o laço das parcelas), e a VALIDAÇÃO
   * confere ESTE valor, não o estado. A diferença importa no caso 3 do briefing: um
   * lançamento administrativo gravado COM safra abre mostrando a safra riscada — o estado
   * continua preenchido de propósito, para o operador ver o que vai sair —, e validar o
   * estado recusaria justamente a gravação que corrige o dado.
   */
  const safraParaGravar = (): string | null => (ehAdministrativo ? null : (safraId || null));

  /**
   * ADMINISTRATIVO NÃO TEM FAZENDA ESPECÍFICA — FIN-FAZENDA-ADM-01 (Gabriel, 11/09/2026).
   *
   * ⚠ MESMO CRITÉRIO DA SAFRA, uma linha abaixo dela de propósito: quem serve a empresa toda
   * não se aloca numa fazenda. O que muda entre os dois campos é o destino — a safra vai a
   * NULO e a fazenda vai à fazenda "Administrativo" do cliente, porque é o que o dado diz
   * (zero administrativos com fazenda nula, medido) e porque o save EXIGE fazenda.
   * ⚠ DIVIDENDOS CONTINUA ENTRANDO, agora pela porta de cima: o `macroCusto === 'Dividendos'`
   * que estava aqui sozinho vira a segunda porta, para o dividendo cujo subcentro é por
   * cliente e não tem linha no plano.
   */
  const fazendaTravadaAdm = ehAdministrativo || macroCusto === 'Dividendos';

  /**
   * ⚠ SUGERE AO MUDAR ATIVIDADE OU COMPETÊNCIA, e só quando o campo está livre: vazio, ou
   * ainda com a sugestão anterior. Um campo escolhido à mão é decisão tomada.
   * ⚠ ADMINISTRATIVO NUNCA SUGERE (OC_013): safra em administrativo é regra do backfill,
   * pelo que o plano aponta — não do modal.
   * ⚠ E COM EMPATE NÃO ESCOLHE (`desempatar: false`). No import em lote a política é outra,
   * e é por isso que ela é opção da função e não regra dela: lá campo vazio vira lançamento
   * sem safra que ninguém revisa; aqui o operador está olhando o campo.
   */

  const aplicarTipoOperacao = (v: string) => {
    setTipoOperacao(v);
    const plano = ehTipoTransferencia(v) ? planoDeTransferencia(classificacoes) : null;
    if (plano) {
      setClassificacao((c) => ({
        ...c,
        subcentro: plano.subcentro,
        macro_custo: plano.macro_custo,
        grupo_custo: plano.grupo_custo || '',
        centro_custo: plano.centro_custo,
        escopo_negocio: plano.escopo_negocio || '',
        plano_conta_id: plano.id ?? null,
      }));
      return;
    }
    setClassificacao((c) => ({
      ...c, subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
      plano_conta_id: null,
    }));
  };

  // PR-U2c-1D: classMap + filteredSubcentros migraram para <PlanoSubcentroSelect />.

  useEffect(() => {
    // PR-FIN-STATUS-UX-03A-1 — reset por abertura: guarda o status original persistido e zera o marcador
    //   de interação ANTES de hidratar o formulário (a hidratação usa setStatusTransacao direto, nunca o
    //   onValueChange do Select, então não é contada como escolha do usuário).
    /* ⚠ A ABERTURA CONTA, e é ela que remonta o cluster de classificação — PAR-01a-ii. O
       incremento entra no MESMO efeito que já existe por abertura, porque é exatamente o
       momento em que os estados de interação daquele bloco precisam voltar ao zero. */
    setAberturaSeq((n) => n + 1);
    statusOriginalRef.current = lancamento?.status_transacao ?? null;
    statusTouchedRef.current = false;
    if (lancamento) {
      setFazendaId(lancamento.fazenda_id);
      setDataCompetencia(lancamento.data_competencia);
      setDataVencimento(lancamento.data_vencimento || '');   // PR-FIN-MODAL-VENCIMENTO-02B — carrega o vencimento real
      setDataPagamento(lancamento.data_pagamento || '');
      setDescricao(lancamento.descricao || '');
      setFavorecidoId(lancamento.favorecido_id || '');
      /* ⚠ TRANSFERÊNCIA NÃO CARREGA O QUE ESTÁ GRAVADO — PR-FIN-TRANSF-SUBCENTRO-01. Seis
         lançamentos de fatura de cartão (NJ e Santa Rita) tinham tipo `3-Transferências` e
         subcentro "Outras Desp. Administrativas" no banco. O campo aparecia TRAVADO na
         conta certa — a lista dele, filtrada por `3-`, só tem a 18010 — e o estado ficava
         com o valor errado. Salvar mandava o estado, o trigger via que nada mudou e o banco
         não corrigia: a tela dizia uma coisa e o banco outra, e salvar não resolvia.
         ⚠ `aplicarTipoOperacao` JÁ FAZIA ISSO ao TROCAR o tipo. Faltava o caminho de abrir —
         a assimetria era o defeito inteiro. */
      const planoTransfAoAbrir = ehTipoTransferencia(lancamento.tipo_operacao)
        ? planoDeTransferencia(classificacoes) : null;
      /* ⚠ UM `set` PARA A CLASSIFICAÇÃO INTEIRA — PAR-01a-i. Os dez campos vinham em oito
         setters espalhados por trinta linhas, com a safra e a cultura lá em cima e o plano aqui
         embaixo; abrir um lançamento escrevia o mesmo objeto em dois lugares distantes. A
         precedência da transferência e os `??` são os mesmos, byte a byte. */
      setClassificacao({
        safra_id: lancamento.safra_id ?? '',
        cultura: lancamento.cultura ?? '',
        fase: lancamento.fase ?? '',
        subcentro: planoTransfAoAbrir?.subcentro ?? (lancamento.subcentro || ''),
        macro_custo: planoTransfAoAbrir?.macro_custo ?? (lancamento.macro_custo || ''),
        grupo_custo: planoTransfAoAbrir?.grupo_custo ?? (lancamento.grupo_custo || ''),
        centro_custo: planoTransfAoAbrir?.centro_custo ?? (lancamento.centro_custo || ''),
        escopo_negocio: planoTransfAoAbrir?.escopo_negocio ?? (lancamento.escopo_negocio || ''),
        plano_conta_id: planoTransfAoAbrir?.id ?? lancamento.plano_conta_id ?? null,
        atividade: atividadeValida(planoTransfAoAbrir?.escopo_negocio ?? lancamento.escopo_negocio),
      });
      /* ⚠ A CHAVE GRAVADA ABRE COM O LANÇAMENTO, e a da transferência tem precedência pela
         mesma razão que o texto dela (os seis lançamentos de fatura de cartão do
         PR-FIN-TRANSF-SUBCENTRO-01): o que vale é a 18010, não o que ficou no banco. */

      /* O card segue o lançamento — e o lançamento segue o plano. */
      setSubcentroDeAbertura(planoTransfAoAbrir?.subcentro ?? (lancamento.subcentro || ''));

      /* ⚠ LANÇAMENTO GRAVADO COM SAFRA NÃO RECEBE SUGESTÃO. O que está no banco é decisão
         de alguém, ainda que de outro dia; sobrescrevê-la ao abrir seria reclassificar sem
         pedir licença.
         ⚠ ESTE `set` SAIU DAQUI — PAR-01a-ii, e quem garante a mesma coisa é a guarda DENTRO DO
         UPDATER do efeito de sugestão, no cluster (PR-FIN-SAFRA-MODAL-01): ela lê o `safra_id`
         VIVO, e com safra que não foi a sugestão daquele bloco devolve o estado intacto.
         ⚠ A GUARDA DO CLOSURE NÃO BASTAVA (o que este comentário dizia antes): o bloco montado
         pelo RESET roda o efeito com a foto do reset (safra vazia) e o updater dele chegava
         depois desta hidratação, apagando a safra gravada — o bloco novo montava vazio e
         sugeria pela data. Foi assim que a mandioca do NJ foi para 26/27-Lav. */
      setTipoOperacao(lancamento.tipo_operacao);
      setStatusTransacao(normalizeStatusModal(lancamento.status_transacao));   // PR-FIN-STATUS-UX-03A-1 — legado 'meta' exibe como 'previsto' (sem gravar)
      setValorDisplay(toBRL(Math.abs(lancamento.valor)));
      // For transfers: origin = conta_bancaria_id, destination = conta_destino_id
      // For entries: destination = conta_bancaria_id
      // For exits: origin = conta_bancaria_id
      if (lancamento.tipo_operacao === '3-Transferências') {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        const destId = lancamento.conta_destino_id || '';
        console.log('[FinV2] DIALOG INIT transfer destino =', destId, 'from lancamento.conta_destino_id =', lancamento.conta_destino_id);
        setContaDestinoId(destId);
      } else if (lancamento.tipo_operacao === '1-Entradas') {
        setContaOrigemId('');
        setContaDestinoId(lancamento.conta_destino_id || lancamento.conta_bancaria_id || '');
      } else {
        setContaOrigemId(lancamento.conta_bancaria_id || '');
        setContaDestinoId('');
      }
      setTipoDocumento((lancamento as any).tipo_documento || '');
      setNotaFiscal(lancamento.numero_documento || '');
      setObservacao(lancamento.observacao || '');
      setFormaPgto(lancamento.forma_pagamento || '');
      setDadosPagamento(lancamento.dados_pagamento || '');
      // CRITICAL: reset parcela/recorrência when editing — prevents stale state from previous "new" dialog
      setFormaPagamentoParc('avista');
      setNumParcelas(2); setNumParcelasTexto('2');
      setModoParcelas('mensal'); setParcelasLivres([]); setBaseLivres(null);
    } else if (prefill) {
      // Modo "criar a partir de fonte externa" (OFX órfão, p.ex.) — campos
      // chave vêm pré-preenchidos do prefill; demais ficam vazios igual ao
      // modo criação. Conta segue o mesmo padrão do branch `lancamento`:
      // Entradas → destino; demais → origem.
      const today = hojeLocal();
      setFazendaId(prefill.fazenda_id ?? defaultFazendaId ?? '');
      setDataCompetencia(prefill.data_competencia ?? prefill.data_pagamento ?? today);
      /* PR-FIN-MODAL-VENCIMENTO-02B — o default segue vazio; só preenche quem passou a
         chave, porque só esse chamador conhece a regra de vencimento do seu fluxo. */
      setDataVencimento(prefill.data_vencimento ?? '');
      setDataPagamento(prefill.data_pagamento ?? '');   // PR-FIN-V2-STATUS-01 — sem fallback para hoje
      setStatusTransacao(prefill.status_transacao ?? 'realizado');
      setTipoOperacao(prefill.tipo_operacao ?? '2-Saídas');
      setValorDisplay(prefill.valor !== undefined ? toBRL(Math.abs(prefill.valor)) : '0,00');
      setDescricao(prefill.descricao ?? '');
      setNotaFiscal(prefill.numero_documento ?? '');
      if (prefill.tipo_operacao === '1-Entradas') {
        setContaOrigemId('');
        setContaDestinoId(prefill.conta_bancaria_id ?? prefill.conta_destino_id ?? '');
      } else {
        setContaOrigemId(prefill.conta_bancaria_id ?? '');
        setContaDestinoId(prefill.conta_destino_id ?? '');
      }
      // PR-Mesa-CreateFromExcel-A: prefill estendido pode trazer favorecido +
      // hierarquia de classificação canônicos da Mesa de Classificação Excel.
      // Operador edita livremente. Campos opcionais — fallback '' preserva
      // comportamento atual quando vêm undefined (OFX órfão etc.).
      setFavorecidoId(prefill.favorecido_id ?? '');
      /* ⚠ A CLASSIFICAÇÃO DO PREFILL NUM `set` SÓ — PAR-01a-i. `cultura`, `fase` e `atividade`
         não vêm do prefill e por isso nascem vazios, exatamente como nasciam quando eram
         `useState` que ninguém tocava neste ramo. */
      /* ⚠ A PROP `prefill.plano_conta_id` EXISTIA E NINGUÉM A LIA NEM A PASSAVA — declarada
         no PR-Mesa-CreateFromExcel-A junto da hierarquia, e esquecida. Ler aqui não muda
         nada hoje (medido: zero chamadores a passam) e fecha o par: quem um dia mandar a
         hierarquia manda a chave junto, da MESMA fonte, e não um par que não combina. */
      /* ⚠ SPREAD, E NÃO OBJETO NOVO — e isto é FIDELIDADE, não preferência. O ramo do prefill
         nunca tocou `cultura`, `fase` nem `atividade`: eles ficavam com o valor que estivesse
         no estado. Zerá-los aqui seria CORRIGIR um comportamento, e este PR não corrige nada —
         ele muda a forma do estado e mais nada.
         ⚠ E O QUE ISSO ESCONDE FICA REPORTADO: abrir o modal com prefill logo depois de um
         lançamento de lavoura herda a cultura daquele lançamento, porque este ramo não limpa e
         o `else` (reset) limpa. É defeito anterior a este PR, e some junto quando o cluster
         virar componente com `value` próprio. */
      setClassificacao((c) => ({
        ...c,
        subcentro: prefill.subcentro ?? '',
        macro_custo: prefill.macro_custo ?? '',
        grupo_custo: prefill.grupo_custo ?? '',
        centro_custo: prefill.centro_custo ?? '',
        plano_conta_id: prefill.plano_conta_id ?? null,
        escopo_negocio: prefill.escopo_negocio ?? '',
        safra_id: prefill.safra_id ?? '',
        /* PR-FIN-DUPLICAR-ABRE-MODAL-01 — com a chave, o valor do original; sem ela, o de sempre (o da sessão). */
        cultura: prefill.cultura ?? c.cultura,
        fase: prefill.fase ?? c.fase,
        atividade: prefill.escopo_negocio !== undefined ? atividadeValida(prefill.escopo_negocio) : c.atividade,
      }));
      /* O tipo do documento é uma lista fechada: valor fora dela (ou ausente) abre vazio, sem cast. */
      setTipoDocumento(TIPOS_DOCUMENTO.find((td) => td === prefill.tipo_documento) ?? '');
      setObservacao(prefill.observacao ?? '');
      /* FIN-NFE-XML-01d — duplicatas que CABEM no parcelamento de hoje abrem como "Parcelada · Nx"; o resto, a' vista. */
      const propostaDoXml = prefill.doXml?.proposta ?? null;
      const parcelasDoXml = propostaDoXml && propostaDoXml.parcelamento.tipo !== 'unico' ? propostaDoXml.parcelamento.parcelas : null;
      setFormaPagamentoParc(parcelasDoXml ? 'parcelada' : 'avista');
      setNumParcelas(parcelasDoXml ?? 2); setNumParcelasTexto(String(parcelasDoXml ?? 2));
      /* PARC-LIVRES-01 — duplicatas com valor ou data próprios entram DIRETO em "Parcelas livres", como estão na nota. */
      if (propostaDoXml && propostaDoXml.parcelamento.tipo === 'livres') {
        const daNota = parcelasDaNota(propostaDoXml.duplicatas);
        setModoParcelas('livres'); setParcelasLivres(daNota); setBaseLivres(daNota);
      } else { setModoParcelas('mensal'); setParcelasLivres([]); setBaseLivres(null); }
      setFormaPgto(prefill.forma_pagamento ?? '');
      setDadosPagamento(prefill.dados_pagamento ?? '');
    } else {
      const today = hojeLocal();
      setFazendaId(defaultFazendaId || '');
      setDataCompetencia(today);
      setDataVencimento('');   // PR-FIN-MODAL-VENCIMENTO-02B — novo lançamento abre com vencimento vazio
      setDataPagamento('');   // PR-FIN-V2-STATUS-01 — novo lançamento NÃO recebe pagamento=hoje automático (só realizado exige)
      /* O status inicial é STATUS_FINANCEIRO_INICIAL ('previsto'), mais abaixo. O `deriveStatus(today)` que
         morava aqui dava 'programado' e era sobrescrito na mesma passada — saiu com a derivação (PR-FIN-V2-STATUS-PGTO-01). */
      setDescricao('');
      setFavorecidoId('');

      /* ⚠ LANÇAMENTO NOVO HERDA A ÚLTIMA ATIVIDADE DA SESSÃO — quem classifica quatrocentos
         lançamentos de lavoura não quer marcar "Lavoura" quatrocentas vezes. No primeiro uso
         é `null`, e aí a lista é a completa, como sempre foi. */
      setSubcentroDeAbertura('');
      /* ⚠ O RESET INTEIRO NUM `set` — PAR-01a-i, e a última atividade continua sendo a única
         coisa que sobrevive à troca de lançamento (memória de sessão, não dado gravado). */
      setClassificacao({
        atividade: ultimaAtividade(),
        safra_id: '', cultura: '', fase: '',
        subcentro: '', macro_custo: '', grupo_custo: '', centro_custo: '',
        escopo_negocio: '', plano_conta_id: null,
      });
      setTipoOperacao('2-Saídas');
      setStatusTransacao(STATUS_FINANCEIRO_INICIAL);   // PR-FIN-STATUS-UX-03A-1 — era 'meta'
      setValorDisplay('0,00');
      setContaOrigemId('');
      setContaDestinoId('');
      setTipoDocumento('');
      setNotaFiscal('');
      setObservacao('');
      setFormaPagamentoParc('avista');
      setNumParcelas(2); setNumParcelasTexto('2');
      setModoParcelas('mensal'); setParcelasLivres([]); setBaseLivres(null);
      setFormaPgto('');
      setDadosPagamento('');
    }
    setFornecedorSearch('');
    setAbaAtiva('geral');
    /* FIN-NFE-XML-01d — o XML da nota ja' nasce como o documento NF pendente do lancamento novo. */
    const doXml = !lancamento ? prefill?.doXml ?? null : null;
    setPendentes(doXml ? [pendenteDaNota(doXml, doXml.proposta.favorecidoId)] : []);
    setDivisaoNaCriacao(null);
    setXmlFaixaFechada(false);
    setXmlRegistradaDispensada(false);
    setXmlComparar(null);
    setXmlCadastroAtualizado(false);
    setXmlFornecedorProposto(doXml?.proposta.favorecidoId ?? null);
    setPosSalvar(null);
    setAnexarBoletos(null);
    setErroAntesDeSalvar(null);
    setItemOC(''); setTentouOC(false); setSimOC(null);
  }, [open, lancamento, defaultFazendaId, prefill, lockedFields]);
  useEffect(() => {
    const d = open && !lancamento ? prefill?.doXml ?? null : null;
    const cli = clienteAtual?.id;
    setXmlNotaCompleta(false);
    if (!d?.emitente || !cli || !xmlFornecedorProposto || d.resolucao.achadoPor !== 'documento') return;
    let vivo = true;
    void camposQueOEmitenteCompleta(cli, xmlFornecedorProposto, d.emitente).then((l) => { if (vivo) setXmlNotaCompleta(l.length > 0); }, () => undefined);
    return () => { vivo = false; };
  }, [open, lancamento, prefill, clienteAtual?.id, xmlFornecedorProposto]);

  // FIN-MODAL-FECHO-01 item 2 — resolve o operacao_id do título OC pelo vínculo
  // zoo_operacao_partes.financeiro_lancamento_id (leitura). Só quando o modal está
  // aberto sobre um título de origem OC. Não altera o título nem permite edição estrutural.
  useEffect(() => {
    let cancelled = false;
    setOperacaoId(null);
    setOperacaoTipo(null);
    if (!open || !isOCTitulo || !lancamento?.id) return;
    (async () => {
      // 1) resolve a operação pelo vínculo soberano (parte → operacao_id)
      const { data: parte } = await (supabase as any)
        .from('zoo_operacao_partes')
        .select('operacao_id')
        .eq('financeiro_lancamento_id', lancamento.id)
        .limit(1)
        .maybeSingle();
      const opId: string | null = parte?.operacao_id ?? null;
      if (cancelled || !opId) return;
      // 2) resolve o tipo da operação (define se há fluxo soberano de abertura)
      const { data: op } = await (supabase as any)
        .from('zoo_operacoes_comerciais')
        .select('tipo_operacao')
        .eq('id', opId)
        .maybeSingle();
      if (cancelled) return;
      setOperacaoId(opId);
      setOperacaoTipo(op?.tipo_operacao ?? null);
    })();
    return () => { cancelled = true; };
  }, [open, isOCTitulo, lancamento?.id]);

  useEffect(() => {
    let cancelled = false;
    setTituloDaOC(false);
    if (!open || !isEdit || !lancamento?.id) return;
    (async () => {
      const { data: parte } = await (supabase as any)
        .from('zoo_operacao_partes').select('id').eq('financeiro_lancamento_id', lancamento.id).eq('cancelada', false).limit(1).maybeSingle();
      if (!cancelled) setTituloDaOC(!!parte);
    })();
    return () => { cancelled = true; };
  }, [open, isEdit, lancamento?.id]);

  /* VINCULAR-LANC-OC-01 — "Vincular à operação" so' onde o banco aceitaria: subcentro no mapa
     (`_oc_vinculo_mapa`), lancamento salvo, nao cancelado e sem parte de OC. E' espelho para
     esconder o botao; a RPC recusa de novo se algo mudar no meio. */
  /* FIN-V2-CANCEL-MOTIVO-01 — TITULO COM PARTE VIVA DE OC NAO SE CANCELA PELO FINANCEIRO. Pela
     PARTE, nao pela `origem_lancamento`: um lancamento manual vinculado a OC tem parte viva e
     origem 'manual'. Guarda a OC e o tipo para o "Abrir OC" no lugar do botao. */
  const [parteOCViva, setParteOCViva] = useState<{ operacaoId: string; tipo: string | null } | null>(null);
  /* FIN-V2-HOMOLOG-FIX-01: so' depois de LIDA a parte o "Criar OC" pode aparecer — antes disso "sem parte" e' so' "ainda nao sei". */
  const [parteOCLida, setParteOCLida] = useState(false);
  const [criarOCAberto, setCriarOCAberto] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setParteOCViva(null);
    setParteOCLida(false);
    if (!open || !isEdit || !lancamento?.id) return;
    const id = lancamento.id;
    (async () => {
      const { data: parte } = await supabase
        .from('zoo_operacao_partes')
        .select('operacao_id')
        .eq('financeiro_lancamento_id', id)
        .eq('cancelada', false)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (!parte?.operacao_id) { setParteOCLida(true); return; }
      const { data: op } = await supabase
        .from('zoo_operacoes_comerciais')
        .select('tipo_operacao')
        .eq('id', parte.operacao_id)
        .maybeSingle();
      if (cancelled) return;
      setParteOCViva({ operacaoId: parte.operacao_id, tipo: op?.tipo_operacao ?? null });
      setParteOCLida(true);
    })();
    return () => { cancelled = true; };
  }, [open, isEdit, lancamento?.id]);

  const [vinculoDisponivel, setVinculoDisponivel] = useState(false);
  const [vincularAberto, setVincularAberto] = useState(false);
  const [desvincularAberto, setDesvincularAberto] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setVinculoDisponivel(false);
    if (!open || !isEdit || isOCTitulo || !lancamento?.id) return;
    const id = lancamento.id;
    Promise.all([subcentrosVinculaveis(), lancamentoTemParteOC(id)])
      .then(([subcentros, temParte]) => {
        if (cancelled) return;
        setVinculoDisponivel(podeOferecerVinculo({
          lancamentoId: id, subcentro: lancamento.subcentro, cancelado: lancamento.cancelado, temParte, subcentros,
        }));
      })
      .catch(() => { /* sem o mapa, sem o botao: nao ha' o que oferecer */ });
    return () => { cancelled = true; };
  }, [open, isEdit, isOCTitulo, lancamento?.id, lancamento?.subcentro, lancamento?.cancelado]);

  // Regenerate parcela rows when key inputs change
  const valorNum = parseBRL(valorDisplay);

  /**
   * A PRÉVIA — o que a RPC vai gravar, calculado pela mesma função. PAR-02.
   * ⚠ A SEMENTE É O VENCIMENTO: a RPC escalona `data_vencimento`. O pagamento só entra quando
   * não há vencimento nenhum, para a prévia não ficar muda enquanto o operador preenche.
   */
  const parcelasMensais = useMemo(
    () => (formaPagamentoParc === 'parcelada' && numParcelas >= 2
      ? preverParcelas(valorNum, numParcelas, dataVencimento || dataPagamento, 1)
      : []),
    [formaPagamentoParc, numParcelas, valorNum, dataVencimento, dataPagamento],
  );
  /* PARC-LIVRES-01 — nas livres, a lista é a do operador; no mensal, a prévia de sempre. Quem lê `parcelaRows` (a grade de
     boletos, o resumo) recebe a lista do modo aberto. */
  const livresAbertas = formaPagamentoParc === 'parcelada' && modoParcelas === 'livres';
  const parcelaRows = useMemo(
    () => (livresAbertas ? parcelasComoPrevistas(parcelasLivres) : parcelasMensais),
    [livresAbertas, parcelasLivres, parcelasMensais],
  );
  /* nas livres o número de parcelas É o tamanho da lista (o campo fica em leitura) */
  /* …e o Vencimento do lançamento é o da parcela 1 (o que o contrato grava como "1ª parcela") */
  const primeiroVencimentoLivre = parcelasLivres[0]?.vencimento ?? '';
  useEffect(() => {
    if (!livresAbertas) return;
    setNumParcelas(parcelasLivres.length); setNumParcelasTexto(String(parcelasLivres.length));
    setDataVencimento(primeiroVencimentoLivre);
  }, [livresAbertas, parcelasLivres.length, primeiroVencimentoLivre]);
  /** Por que o parcelado livre não pode ser salvo (escrito ao lado do Salvar) — a MESMA função que a grade lê. */
  const motivoDasParcelas = !livresAbertas ? null
    : parcelasLivres.length < 2 ? 'O parcelado pede ao menos duas parcelas.'
      : motivoNaoSalva(parcelasLivres, centavos(Math.abs(valorNum)));
  const trocarModoDasParcelas = (m: ModoDasParcelas) => {
    if (m === 'livres') {
      /* o ponto de partida: as duplicatas da nota (quando a tela ainda as descreve) ou a prévia mensal */
      const partida = duplicatasNaGrade ? parcelasDaNota(duplicatasNaGrade) : parcelasDoMensal(parcelasMensais);
      setParcelasLivres(partida); setBaseLivres(partida);
    } else { setParcelasLivres([]); setBaseLivres(null); }
    setModoParcelas(m);
  };

  /* ── DADOS PARA PAGAMENTO: o cadastro do fornecedor manda enquanto não está pago — FIN-PIX-CADASTRO-MODAL-01 ──────────
     ⚠ O `buildDadosPagamento` que morava aqui virou `textoDoCadastro` (a lib), byte a byte. Ele só rodava quando a forma ou o
       fornecedor MUDAVAM, e gravava a cópia: lançamento que já nascia com PIX (recorrência, parcelamento, OC) abria vazio, e a
       cópia envelhecia. Agora o bloco é LIDO do cadastro a cada render e nada é copiado. */
  const fornecedorDoPgto = favorecidoId
    ? (fornecedorRelido[favorecidoId] ?? fornecedorPorId(favorecidoId)) : null;
  /* R6 — "realizado" é o do REGISTRO, não o do select: o que foi usado para pagar é o que está gravado. */
  const pgtoJaRealizado = !!lancamento && (lancamento.status_transacao === 'realizado' || lancamento.status_transacao === 'conciliado');
  const formaEfetivaPgto = formaEfetiva(formaPgto, fornecedorDoPgto);
  const textoCadastroPgto = fornecedorDoPgto ? textoDoCadastro(fornecedorDoPgto, formaEfetivaPgto) : '';
  /* ⚠ O BLOCO DO CADASTRO É SÓ PARA SAÍDAS (ajuste do Gabriel, 04/10): o Pix do fornecedor serve para PAGAR. Numa entrada ou
     numa transferência ele não diz nada — a tela chegou a avisar "Boitel Sta. Clara não tem Pix cadastrado." num RECEBIMENTO.
     Fora de Saídas: havendo texto, o campo próprio; não havendo, só o link. Nada é gravado nem apagado por causa do tipo. */
  const pgtoEhSaida = tipoOperacao === '2-Saídas';
  const modoPgtoEfetivo = pgtoEhSaida
    ? (modoPgto ?? modoDosDados({ realizado: pgtoJaRealizado, textoGravado: dadosPagamento, textoDoCadastro: textoCadastroPgto }))
    : (modoPgto === 'proprio' || dadosPagamento.trim() ? 'proprio' : 'cadastro');
  const blocoPgto: BlocoDoCadastro = pgtoEhSaida
    ? linhasDoCadastro(fornecedorDoPgto, formaEfetivaPgto, valorNum, formatMoeda(Math.abs(valorNum)))
    : { tipo: 'nada' };
  /** O que vai para `dados_pagamento`: seguindo o cadastro, NULO — o campo é o da exceção. */
  const dadosPagamentoParaGravar = modoPgtoEfetivo === 'proprio' && dadosPagamento.trim() ? dadosPagamento : null;

  /* ⚠ R4 — TROCAR A FORMA OU O FORNECEDOR NÃO ESCREVE NEM APAGA TEXTO. O modo em que a tela está é CONGELADO antes da troca:
     sem isso, um texto gravado "igual ao cadastro" viraria "diferente" (e apareceria como próprio) só porque o cadastro
     comparado mudou. */
  const handleFormaPgtoChange = useCallback((metodo: string) => {
    setModoPgto(modoPgtoEfetivo);
    setFormaPgto(metodo === FORMA_PAGAMENTO_V2_NENHUMA ? '' : metodo);
  }, [modoPgtoEfetivo]);

  /** Relê AQUELE fornecedor depois de o cadastro salvar (as mesmas colunas de `loadFornecedores`) — releitura do dono logo após
   *  a escrita, não segunda fonte. Vale nas treze telas que montam este modal, sem prop nova. */
  const relerFornecedorDoPgto = useCallback(async (id: string) => {
    const { data } = await supabase
      .from('financeiro_fornecedores')
      .select('id, nome, cpf_cnpj, fazenda_id, ativo, tipo_recebimento, pix_tipo_chave, pix_chave, banco, agencia, conta, tipo_conta, cpf_cnpj_pagamento, nome_favorecido, observacao_pagamento')
      .eq('id', id)
      .maybeSingle();
    if (data) setFornecedorRelido(m => ({ ...m, [id]: { ...data, ativo: data.ativo !== false } }));
  }, []);

  /* O que foi decidido e relido vale só para o modal ABERTO naquele lançamento. */
  useEffect(() => {
    setModoPgto(null);
    setCadastroPgtoAberto(false);
    setFornecedorRelido({});
  }, [open, lancamento?.id]);

  /* ⚠ A DATA DE PAGAMENTO NÃO ESCOLHE MAIS O STATUS — PR-FIN-V2-STATUS-PGTO-01. Ela derivava
     agendado (data futura) e programado (data passada), e com isso previsto/programado/agendado
     nasciam com pagamento. A regra agora é do Gabriel: SÓ REALIZADO TEM PAGAMENTO; o status é
     escolhido, e a data de quando sai do banco mora no vencimento. */
  const handleDataPagamentoChange = (val: string) => {
    setDataPagamento(val);
  };

  /* O pagamento travado pelo fluxo de extrato (`lockedFields`) é o do banco: nada aqui o apaga. */
  const pagamentoTravado = lockedFields?.includes('data_pagamento') ?? false;
  const pagamentoPermitido = statusTemPagamento(statusTransacao);
  /* FIN-PGTO-FANTASMA-01 — A TELA MOSTRA O QUE VAI GRAVAR: o campo e o resumo leem `pagamentoParaMostrar` (o dono da regra do
     salvar), não a data hidratada. E o legado — data de pagamento no banco sem estar realizado — é avisado antes de sumir. */
  const pagamentoMostrado = pagamentoParaMostrar(statusTransacao, dataPagamento, pagamentoTravado);
  const pagamentoLegadoARemover = isEdit
    ? pagamentoQueSeraRemovido(lancamento?.data_pagamento, statusTransacao, dataPagamento, pagamentoTravado)
    : null;

  /* ⚠ SAIR DO REALIZADO ZERA O PAGAMENTO — PR-FIN-V2-STATUS-PGTO-01. Os 7 do NJ voltaram de
     realizado para previsto pelo modal e ficaram com o pagamento de 04/09 gravado. Voltar para
     realizado reabre o campo VAZIO, e a validação existente cobra a data. */
  const handleStatusChange = (v: string) => {
    statusTouchedRef.current = true;
    setStatusTransacao(v);
    setDataPagamento(atual => pagamentoAoTrocarStatus(v, atual, pagamentoTravado));
  };

  /* ⚠ A MÁSCARA DO VALOR MUDOU DE ARQUIVO — FIN-VALOR-CALC-01a: ela e a conta no campo moram em `CampoValorComConta`.
     Aqui fica só a marca de "há conta aberta", que o Esc do diálogo consulta (com conta aberta, Esc cancela a conta). */
  const contaAbertaRef = useRef(false);

  const handleNotaFiscalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (tipoDocumento === 'Nota Fiscal') {
      const raw = extractNFDigits(e.target.value);
      setNotaFiscal(raw);
    } else {
      setNotaFiscal(e.target.value);
    }
  };

  /* ⚠ OS DOIS HANDLERS DA GRADE EDITÁVEL SAÍRAM — PAR-02. Editar uma linha ali mudava o que
     seria GRAVADO; agora quem calcula é a RPC, e uma célula editável prometeria um controle que
     o banco não tem. Valor e datas se mudam nos campos do lançamento, que são a entrada real
     do cálculo. */

  const notaFiscalDisplay = notaFiscal
    ? (tipoDocumento === 'Nota Fiscal' ? formatNFNumber(notaFiscal) : notaFiscal)
    : '';

  /* PARC-LIVRES-01 passo 3 — a parcela de uma compra parcelada não tem `numero_documento` próprio: a nota mora no DOCUMENTO
     ligado a ela. O dono (`docDaLinha`, o mesmo da coluna Doc. da lista) diz o que mostrar; aqui só se LÊ — os dois campos
     continuam sendo as colunas do lançamento, e nada é escrito neles. */
  const docDoLancamento = docDaLinha({ tipo_documento: tipoDocumento, numero_documento: notaFiscal }, documentosApi.documentos);
  const docVemDeDocumento = docDoLancamento.origem === 'nota' || docDoLancamento.origem === 'documento';
  /* PARC-FECHA-02 item 1 — NO PARCELADO O DOCUMENTO DA COMPRA TEM UM DONO (o registro ligado às N parcelas, logo abaixo): o
     "Tipo / Nº Documento" do topo fica em LEITURA, com o motivo escrito. No Novo parcelado ele nunca viajou para
     `fn_parcelamento_cadastrar` (o operador digitava e perdia); o que já estiver digitado ali é OFERECIDO à lista da compra. */
  const topoTravado = topoDoDocumentoTravado({ novo: !isEdit, modalidadeParcelada: !modoOC && formaPagamentoParc === 'parcelada', lancamento });
  /* PARC-CADEIA-01 passo 3 — o que o Salvar faz com valor e vencimento desta parcela (dono puro). Nulo = não é parcela. */
  const edicaoParcela = contratoDaParcela && lancamento?.id
    ? edicaoDaParcela(contratoDaParcela.situacao, lancamento.id, valorNum, dataVencimento || null)
    : null;
  const parcelaPaga = edicaoParcela?.paga === true;
  /* UI-TEXTO-LONGO-01 — a posição desta parcela entre as vivas da compra (do dono da situação): o rodapé diz "Parcela 3/5 · Compra …" */
  const parcelasDaCompra = contratoDaParcela?.situacao.parcelas ?? null;
  const posicaoNaCompra = parcelasDaCompra && lancamento?.id ? parcelasDaCompra.findIndex(p => p.lancamentoId === lancamento.id) : -1;
  const parcelaDaCompra = parcelasDaCompra && posicaoNaCompra >= 0
    ? { numero: parcelasDaCompra[posicaoNaCompra].numero ?? posicaoNaCompra + 1, total: parcelasDaCompra.length } : null;
  const digitadoNoTopo = !!(notaFiscal || tipoDocumento);
  const haNotaNaCompra = pendentes.some(p => p.parcela == null && p.payload.especie === 'nf');
  const levarOTopoParaACompra = () => {
    setPendentes(l => [...l, novoPendente({ especie: tipoDocumento === 'Recibo' ? 'recibo' : tipoDocumento === 'Nota Fiscal' || !tipoDocumento ? 'nf' : 'outro', numero: notaFiscal || null }, null, null)]);
    setNotaFiscal(''); setTipoDocumento('');
  };

  /* O documento novo nasce com o que o lançamento já diz — Nº Documento, competência, valor e favorecido.
     Só semeia o formulário: mudar o número no documento NÃO muda o Nº Documento do lançamento. */
  const sugestaoDoDocumento = {
    numero: notaFiscal.trim() || null,
    dataEmissao: dataCompetencia || null,
    valor: valorNum ? Math.abs(valorNum) : null,
    emitenteId: favorecidoId || null,
    /* FIN-DOCUMENTO-FORM-01 — o comprovante sugere a data do PAGAMENTO, não a competência */
    dataPagamento: dataPagamento || null,
  };

  const contasDisponiveis = contas;

  // PR-FIN-MODAL-02D — valores espelhados no painel de resumo (só apresentação; sem estado novo).
  const resumoFmtData = (d: string) => (d ? d.split('-').reverse().join('/') : null);
  const resumoFavorecido = fornecedorPorId(favorecidoId)?.nome ?? null;
  const resumoFazenda = fazendas.find(f => f.id === fazendaId)?.nome ?? null;
  const resumoContaOrigem = (() => { const c = contas.find(x => x.id === contaOrigemId); return c ? (c.nome_exibicao ?? c.nome_conta) : null; })();
  const resumoContaDestino = (() => { const c = contas.find(x => x.id === contaDestinoId); return c ? (c.nome_exibicao ?? c.nome_conta) : null; })();
  const resumoSafra = (safras ?? []).find(s => s.id === safraId)?.nome ?? null;
  const resumoTipoLabel = TIPOS_OPERACAO.find(t => t.value === tipoOperacao)?.label ?? tipoOperacao;
  // Cor semântica SÓ do valor do Tipo (categorias reais do form): saída=vermelho, entrada=azul, transferência=cinza.
  const resumoTipoCor = isTransferencia ? 'text-zinc-400' : isEntrada ? 'text-blue-500' : 'text-red-500';
  const resumoStatusOpcao = STATUS_OPTIONS.find(s => s.value === statusTransacao);
  const resumoStatusLabel = resumoStatusOpcao?.label ?? statusTransacao;
  /* FIN-RESUMO-PAGAMENTO-01 — a cor do status é a da paleta dona (`STATUS_PALETA`), nunca escrita aqui: previsto, programado e
     agendado só texto em semibold; realizado na pílula com caixa. Status fora da lista do modal (legado) fica sem cor. */
  const resumoStatusCor = (() => {
    if (!resumoStatusOpcao) return undefined;
    const paleta = STATUS_PALETA[resumoStatusOpcao.value];
    return paleta.comCaixa ? `${STATUS_PILULA_BASE} ${paleta.pilula}` : `${paleta.texto} font-semibold`;
  })();

  // PR-U2c-1C: fornecedoresList/normalizeSearch/filteredFornecedores/effects/keyDown/
  // selectedFornecedorNome migraram para <FavorecidoSelect />.

  // PR-U2c-1B: Select de Fazenda + regra Dividendos migraram para <FazendaSelect />.
  // fazendaAdm permanece aqui pois o SAVE (fazendaIdEfetivo) também o usa.
  const fazendaAdm = useMemo(() => fazendaAdministrativa(fazendas), [fazendas]);

  // Validation — FONTE ÚNICA via helper puro (PR-FIN-MODAL-02B). Reproduz EXATAMENTE as
  // fórmulas anteriores (contaSimpleValid/parceladaValid/recorrenteValid/canSave) e expõe
  // as pendências por aba para os badges e o "Ver pendência". canSave permanece idêntico.
  const validacao = computeValidacaoModal({
    fazendaId, dataCompetencia, dataPagamento, descricao, tipoOperacao, statusTransacao,
    valorNum, contaOrigemId, contaDestinoId, subcentro,
    formaPagamentoParc, numParcelas, parcelaRowsLength: parcelaRows.length,
  });
  /* ⚠ `carregando` VENCE A VALIDAÇÃO: com os catálogos vazios o formulário até pode parecer
     válido — os campos estão "preenchidos" com nada —, e é justamente esse o caso perigoso. */
  const canSave = validacao.canSave && !carregando && motivoDasParcelas === null;

  /* ── MODO OC — OC-CC-MODAL-FINANCEIRO-01 ───────────────────────────────────────────────────────────────────────────────
     As parcelas que vao ao banco sao as da PROPRIA OC: a lista da grade (mensal ou livres) ou, a' vista, uma so'. A conta e'
     a da direcao (entrada -> destino; saida -> origem). As duas pendencias proprias do modo (item e vencimento) NAO apagam
     o Salvar: o clique as acende em vermelho e nao grava (UX-OBRIGATORIOS-01). */
  const contaDoModoOC = isEntrada ? contaDestinoId : contaOrigemId;
  const linhasDoModoOC = useMemo(
    () => (formaPagamentoParc === 'parcelada'
      ? parcelaRows.map(r => ({ valor: r.valor, vencimento: r.dataVencimento }))
      : [{ valor: valorNum, vencimento: dataVencimento }]),
    [formaPagamentoParc, parcelaRows, valorNum, dataVencimento],
  );
  const faltaItemOC = !!modoOC && modoOC.natureza === 'obrigacao' && !itemOC;
  const faltaVencimentoOC = !!modoOC && linhasDoModoOC.some(l => !l.vencimento);
  /* CRIAR-DO-EXTRATO-01 — o vencimento do lançamento comum (o modo OC e o parcelado têm a regra deles; o campo travado não se cobra). */
  const [tentouVencimento, setTentouVencimento] = useState(false);
  const faltaVencimento = !modoOC && formaPagamentoParc !== 'parcelada' && !isOCTitulo && !parcelaPaga && !dataVencimento;
  const vencimentoEmErro = tentouVencimento && faltaVencimento;
  const favorecidoDoModoOC = favorecidoId && favorecidoId !== '__none_forn__' ? favorecidoId : null;
  const classificacoesDoModal = useMemo(
    () => (modoOC?.natureza === 'obrigacao' ? [...classificacoesDaDespesa(classificacoes, modoOC.tipoOperacao)] : classificacoes),
    [modoOC?.natureza, modoOC?.tipoOperacao, classificacoes],
  );
  /* A PREVIA E' A PROPRIA RPC COM `p_simular`, e so' refaz com o que muda a resposta (valores primitivos numa chave). Dela
     vem o aviso AMBAR de "acima do saldo" (nao bloqueia) e, se houver, a recusa do banco, antes do Salvar. */
  const chaveDaSimulacaoOC = modoOC && open && canSave && !faltaItemOC && !faltaVencimentoOC
    ? JSON.stringify([modoOC.operacaoId, modoOC.versao, modoOC.natureza, linhasDoModoOC, contaDoModoOC, itemOC, planoContaId ?? null,
        modoOC.natureza === 'obrigacao' ? favorecidoDoModoOC : null])
    : null;
  const pedidoDoModoOCRef = useRef<Parameters<typeof lancarPeloModal>[0] | null>(null);
  pedidoDoModoOCRef.current = modoOC ? {
    operacaoId: modoOC.operacaoId, versao: modoOC.versao, natureza: modoOC.natureza,
    componente: itemOC || null, planoContaId: planoContaId ?? null, favorecidoId: favorecidoDoModoOC,
    parcelas: parcelasParaRpc(linhasDoModoOC, contaDoModoOC && contaDoModoOC !== '__none__' ? contaDoModoOC : null),
    forma: formaPgto || null, dadosPagamento: dadosPagamentoParaGravar, documento: notaFiscal.trim() || null,
    observacao: observacao.trim() || null, descricao: descricao.trim() || null, simular: true,
  } : null;
  const tipoDaOCDoModo = modoOC?.tipoOperacao ?? null;
  useEffect(() => {
    if (!chaveDaSimulacaoOC || !tipoDaOCDoModo) { setSimOC(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      const pedido = pedidoDoModoOCRef.current;
      if (!pedido) return;
      const r = await lancarPeloModal({ ...pedido, simular: true });
      if (!vivo) return;
      /* `r.ok === true`: com `strict: false` o `if (!r.ok)` nao estreita a uniao */
      if (r.ok === true) setSimOC({ aviso: r.retorno.acimaDoSaldo ? fraseAcimaDoSaldo(r.retorno.acimaDoSaldo, tipoDaOCDoModo) : null, erro: null });
      else setSimOC({ aviso: null, erro: r.erro });
    }, 400);
    return () => { vivo = false; clearTimeout(t); };
  }, [chaveDaSimulacaoOC, tipoDaOCDoModo]);
  // PR-FIN-V2-STATUS-01-AJUSTE item 2 — mensagem clara da pendência principal (regra/campo).
  const pendenciaMsg = statusTransacao === 'realizado' && !dataPagamento
    ? 'Data de pagamento obrigatória quando status = Realizado.'
    : null;
  // PR-FIN-MODAL-02E — a aba Classificação foi INCORPORADA à aba Geral. A validação
  // (helper puro/computeValidacaoModal) permanece IDÊNTICA — mesmas regras, mensagens e
  // critérios; muda apenas o DESTINO VISUAL: pendência de 'classificacao' aponta para
  // 'geral'. Colapso exclusivamente de apresentação (nenhuma regra nova).
  const abaVisual = (aba: AbaFinanceira): AbaFinanceira => (aba === 'classificacao' ? 'geral' : aba);
  const abaComErro = (aba: AbaVisual) => validacao.abasInvalidas.some(a => abaVisual(a) === aba);
  const handleVerPendencia = () => {
    if (validacao.primeiraAbaInvalida) setAbaAtiva(abaVisual(validacao.primeiraAbaInvalida));
  };

  /* `voltar` = o gesto "Voltar ao previsto" (REC-VALOR-DO-MES-MODAL-01): o MESMO salvar, com o valor e o vencimento da regra
     no lugar dos da tela e a marca do valor do mês limpa. Sem ele, o salvar de sempre. */
  /* ── REC-VALOR-DO-MES-MODAL-01 — a ocorrência de recorrência e o valor do mês ─────────────────────────────────────────
     O modal sabe que é ocorrência pelo `recorrencia_id` da linha (todo hospedeiro entrega a linha de `select('*')`), e lê da
     REGRA só o que precisa para dizer o "previsto": UMA consulta por id, só na edição de ocorrência. Lançamento comum não
     consulta nada e não desenha nada. */
  const ehOcorrencia = isEdit && !!lancamento?.recorrencia_id;
  const marcaGravada: OrigemDoValorDoMes | null = ehOcorrencia && lancamento?.valor_do_mes_em
    ? (lancamento.valor_do_mes_origem === 'planilha' ? 'planilha' : 'manual')
    : null;
  const [regraRec, setRegraRec] = useState<RegraDaRecorrencia | null>(null);
  const [confirmandoVoltar, setConfirmandoVoltar] = useState(false);
  const recorrenciaIdAberta = open && isEdit ? (lancamento?.recorrencia_id ?? null) : null;
  useEffect(() => {
    let cancelled = false;
    setRegraRec(null);
    setConfirmandoVoltar(false);
    if (!recorrenciaIdAberta) return;
    (async () => {
      const { data } = await supabase
        .from('financeiro_recorrencias')
        .select('valor_base, dia_vencimento, data_inicio, primeiro_vencimento')
        .eq('id', recorrenciaIdAberta)
        .maybeSingle();
      if (cancelled || !data || !data.data_inicio || !data.primeiro_vencimento) return;
      setRegraRec({
        valor_base: Number(data.valor_base), dia_vencimento: Number(data.dia_vencimento),
        data_inicio: data.data_inicio, primeiro_vencimento: data.primeiro_vencimento,
      });
    })();
    return () => { cancelled = true; };
  }, [recorrenciaIdAberta]);
  const previstoRec = regraRec && dataCompetencia ? previstoDaOcorrencia(regraRec, dataCompetencia) : null;
  const previstoRecTexto = previstoRec ? formatMoeda(previstoRec.valor) : '…';
  /** O GRAVADO está aberto? (o gesto de voltar olha o que o banco tem, não o que a tela está mudando) */
  const ocorrenciaGravadaAberta = ocorrenciaAberta({ status: lancamento?.status_transacao, dataPagamento: lancamento?.data_pagamento, conciliadoEm: lancamento?.conciliado_em });
  /** Não marcada, e o salvar de agora marcaria: a tela diz ANTES. */
  const intencaoDeMarcar = ehOcorrencia && !marcaGravada && marcaAoSalvar({
    ehRecorrencia: true,
    aberta: ocorrenciaAberta({ status: statusTransacao, dataPagamento: pagamentoMostrado, conciliadoEm: lancamento?.conciliado_em }),
    antes: { valor: lancamento?.valor, vencimento: lancamento?.data_vencimento, marca: null },
    depois: { valor: Math.abs(valorNum), vencimento: dataVencimento || null },
  }) === 'marcar_manual';
  const partesValorDoMes = marcaGravada
    ? partesDaMarcada(previstoRecTexto, marcaGravada)
    : intencaoDeMarcar ? partesDaIntencao(previstoRecTexto) : null;
  /** Por que o "Voltar ao previsto" está apagado; nulo = aceso. */
  const motivoVoltarAoPrevisto = !ocorrenciaGravadaAberta ? MOTIVO_CONTA_PAGA
    : !previstoRec ? 'Lendo a recorrência…'
    : !canSave ? MOTIVO_SALVAR_PENDENTE
    : null;

  const handleSubmit = async (voltar?: { valor: number; vencimento: string }) => {
    if (!canSave) return;
    /* CRIAR-DO-EXTRATO-01 — vencimento obrigatório em todo Novo/Editar (fora do modo OC, que tem a regra dele, do parcelado,
       cujos vencimentos são os da lista, e do campo travado). O rótulo e a borda acendem em vermelho e a frase sai ao lado do
       Salvar (no rótulo ela não cabe na coluna de 115px: o gate media "…"); nada é gravado. */
    if (faltaVencimento && !voltar) {
      setTentouVencimento(true);
      setErroAntesDeSalvar(MOTIVO_VENCIMENTO_OBRIGATORIO);
      setAbaAtiva('geral');
      return;
    }
    /* MODO OC — as duas pendencias proprias: acende em vermelho, diz ao lado do botao e NAO grava. */
    if (modoOC && (faltaItemOC || faltaVencimentoOC)) {
      setTentouOC(true);
      setErroAntesDeSalvar(faltaItemOC ? MOTIVO_ITEM_OBRIGATORIO : MOTIVO_VENCIMENTO_OBRIGATORIO);
      setAbaAtiva(faltaItemOC || formaPagamentoParc !== 'parcelada' ? 'geral' : 'pagamento');
      return;
    }
    // PR-FIN-V2-STATUS-01 — 'Realizado' exige data de pagamento; previsto/agendado/programado podem salvar null.
    if (statusTransacao === 'realizado' && !dataPagamento) {
      toast.error('Status "Realizado" exige data de pagamento.');
      return;
    }
    /* Administrativo sempre na fazenda Administrativo (defesa caso o useEffect do
       `FazendaSelect` não tenha disparado) — FIN-FAZENDA-ADM-01 ampliou de Dividendos para
       todo escopo administrativo, pelo mesmo par tela+payload da safra. */
    const fazendaIdEfetivo = (fazendaTravadaAdm && fazendaAdm) ? fazendaAdm.id : fazendaId;
    /* FIN-FAZENDA-PADRAO-01 — fazenda vazia nao grava, no simples E no parcelado, e antes do banco. O campo ja' esta'
       em vermelho com a frase; aqui so' se leva o foco a ele, sem toast (UX-TOAST-01). O `canSave` ja' exigia a
       fazenda (`computeValidacaoModal`), entao esta linha e' a trava do proprio gravar, nao a unica. */
    if (!fazendaIdEfetivo) {
      document.getElementById('campo-fazenda-financeiro')?.querySelector('button')?.focus();
      return;
    }
    // Extra validation for transfers
    if (isTransferencia) {
      if (!contaOrigemId || contaOrigemId === '__none__' || !contaDestinoId || contaDestinoId === '__none__') {
        toast.error('Transferência exige conta de origem e conta de destino.');
        return;
      }
      if (contaOrigemId === contaDestinoId) {
        toast.error('Conta de origem e destino devem ser diferentes.');
        return;
      }
    }

    // ─── PR-Mesa-Submit-Validations ─────────────────────────────────
    // Regras invioláveis #15/#18: campos classificatórios SÓ podem
    // salvar se baterem com cadastros oficiais. Bloco A roda ANTES
    // de setSaving — sem efeito colateral, retorno limpo no toast.
    // Bloco B (validação 5 do favorecido) roda APÓS resolução inline
    // de fornecedor (mais abaixo), por isso aparece em outro ponto.
    const eq = (a?: string | null, b?: string | null) =>
      (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

    // 1. Subcentro precisa casar com cadastro oficial (case-insensitive trim)
    const subcentroTrim = (subcentro || '').trim();
    const classifEncontrada = classificacoes.find(c => eq(c.subcentro, subcentroTrim));
    if (subcentroTrim && !classifEncontrada) {
      toast.error('Selecione um subcentro oficial do plano de contas antes de salvar.');
      return;
    }

    /* 1a. A direcao do lancamento e' a da CONTA DO PLANO — BOITEL-ABATE-PRODUTOR-01d. Antes do
       gravar, sem toast: a frase vai para baixo do Subcentro e nada e' desfeito. */
    const direcao = erroDeDirecao({
      tipo_operacao: tipoOperacao,
      macro_custo: classifEncontrada?.macro_custo ?? macroCusto,
      subcentro: subcentroTrim,
      tipo_plano: tipoDaContaNoPlano(classificacoes, planoContaId, subcentroTrim),
    });
    if (direcao) {
      setErroDirecao({ texto: direcao, subcentro, tipo: tipoOperacao });
      return;
    }
    setErroDirecao(null);

    /* 1b. Safra e subcentro têm de falar da mesma atividade — PR-FIN-SAFRA-ESCOPO-01.
       ⚠ AQUI, E NÃO SÓ NA TELA: a tela limpa a safra quando a ATIVIDADE muda, mas o
       conflito também nasce pelo outro lado — trocar o subcentro sem tocar no card, ou
       abrir um lançamento antigo já gravado torto. Este é o ponto por onde passam os DOIS
       caminhos de save, o normal e o das parcelas, e é o último antes de gravar.
       ⚠ O ESCOPO VEM DO PLANO, não do estado `escopoNegocio`: o estado é cópia, e cópia
       pode estar velha se o plano mudou desde que o lançamento foi aberto. */
    const safraEscolhida = (safras ?? []).find(sf => sf.id === safraParaGravar());
    const conflito = conflitoSafraEscopo(
      classifEncontrada?.escopo_negocio ?? escopoNegocio, safraEscolhida?.escopo_negocio);
    if (conflito) {
      toast.error(mensagemConflitoSafraEscopo(conflito));
      return;
    }

    // 2. Fazenda precisa existir em fazendas[]
    if (fazendaIdEfetivo && !fazendas.some(f => f.id === fazendaIdEfetivo)) {
      toast.error('Fazenda inválida — selecione uma fazenda cadastrada.');
      return;
    }

    // 3. Conta de origem precisa existir em contas[] quando preenchida
    if (contaOrigemId && contaOrigemId !== '__none__'
        && !contas.some(c => c.id === contaOrigemId)) {
      toast.error('Conta de origem inválida — selecione uma conta cadastrada.');
      return;
    }

    // 4. Conta de destino precisa existir em contas[] quando preenchida
    if (contaDestinoId && contaDestinoId !== '__none__'
        && !contas.some(c => c.id === contaDestinoId)) {
      toast.error('Conta de destino inválida — selecione uma conta cadastrada.');
      return;
    }

    // 6. tipo_operacao enum válido (defesa em profundidade)
    const TIPOS_VALIDOS: readonly string[] = ['1-Entradas', '2-Saídas', '3-Transferências'];
    if (!TIPOS_VALIDOS.includes(tipoOperacao)) {
      toast.error('Tipo de operação inválido.');
      return;
    }

    setSaving(true);

    // Capture the editing ID from the stable ref — prevents stale closure issues
    const currentEditId = editingIdRef.current;
    const currentIsEdit = !!currentEditId;

    // Auto-create fornecedor quando o usuário digita um nome que não está
    // em financeiro_fornecedores. Preserva o id recém-criado ao salvar.
    let effectiveFavorecidoId = favorecidoId;
    const searchText = fornecedorSearch.trim();
    if (!effectiveFavorecidoId && searchText && fazendaId) {
      const mesmoNome = (f: { nome: string }) => f.nome.trim().toLowerCase() === searchText.toLowerCase();
      const existente = fornecedores.find(mesmoNome) ?? fornecedoresDoLeitor.fornecedores.find(mesmoNome);
      if (existente) {
        effectiveFavorecidoId = existente.id;
        setFavorecidoId(existente.id);
      } else {
        const novo = await onCriarFornecedor(searchText, fazendaId);
        if (novo) {
          effectiveFavorecidoId = novo.id;
          setFavorecidoId(novo.id);
        }
      }
      setFornecedorSearch('');
    }
    const favorecidoForForm = (effectiveFavorecidoId && effectiveFavorecidoId !== '__none_forn__') ? effectiveFavorecidoId : null;

    // PR-Mesa-Submit-Validations bloco B: favorecido precisa existir em
    // fornecedores[]. Roda APÓS resolução inline porque favorecidoForForm
    // pode ser id recém-criado por onCriarFornecedor. setSaving(false)
    // antes do return — botão volta a "Salvar".
    if (favorecidoForForm && !fornecedorPorId(favorecidoForForm)) {
      toast.error('Favorecido inválido — selecione um fornecedor cadastrado.');
      setSaving(false);
      return;
    }

    let contaBancariaId: string | null = null;
    let contaDestinoFinal: string | null = null;
    if (isTransferencia) {
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
      contaDestinoFinal = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else if (isEntrada) {
      // Entries: money flows IN → account goes to conta_destino_id
      contaBancariaId = null;
      contaDestinoFinal = contaDestinoId && contaDestinoId !== '__none__' ? contaDestinoId : null;
    } else {
      // Exits: money flows OUT → account goes to conta_bancaria_id (origin)
      contaBancariaId = contaOrigemId && contaOrigemId !== '__none__' ? contaOrigemId : null;
      contaDestinoFinal = null;
    }

    /* ═══ MODO OC: QUEM GRAVA E' A OPERACAO — OC-CC-MODAL-FINANCEIRO-01 ═══════════════════════════════════════════════
       ⚠ ANTES DO PARCELADO E DO `onSave`, E SAI AQUI: no modo OC as parcelas sao as da PROPRIA OC
       (`oc_lancar_pelo_modal`: compromisso -> programacao -> um titulo por parcela, uma transacao). Nunca
       `fn_parcelamento_cadastrar`, nunca o gravador do Financeiro. Recusa do banco: escrita ao lado do botao, nada gravado. */
    if (modoOC) {
      const contaOC = isEntrada ? contaDestinoFinal : contaBancariaId;
      const r = await lancarPeloModal({
        operacaoId: modoOC.operacaoId, versao: modoOC.versao, natureza: modoOC.natureza,
        componente: itemOC || null, planoContaId: planoContaId ?? null, favorecidoId: favorecidoForForm,
        parcelas: parcelasParaRpc(linhasDoModoOC, contaOC),
        forma: formaPgto || null, dadosPagamento: dadosPagamentoParaGravar, documento: notaFiscal.trim() || null,
        observacao: observacao.trim() || null, descricao: descricao.trim() || null, simular: false,
      });
      if (r.ok !== true) { setErroAntesDeSalvar(r.ok === false ? r.erro : null); setSaving(false); return; }
      if (clienteAtual?.id) notificarLancamentosMudaram(clienteAtual.id);
      await modoOC.aoLancar(r.retorno);
      setSaving(false);
      onClose();
      return;
    }

    /* ═══ PARCELADA: O BANCO É QUEM ESCREVE — PAR-02 ══════════════════════════════════════
       ⚠ AQUI MORRIA O PARCELAMENTO. Este ramo era um LAÇO de `await onSave(form)` — N inserts
       separados, sem transação — e o que ele produzia foi medido no proto: das 21 famílias de
       parcela multi-linha, 20 SEM PAI (`financiamento_id` nulo), 8 com contagem diferente da
       que a própria descrição declara ("Energisa" diz 36 e tem 32), 8 com o MESMO vencimento
       nas N. O `break` do laço deixava no banco as parcelas já gravadas: quem clicava de novo
       somava um segundo lote ao primeiro, e foi assim que as "Farmácia Pessoal" viraram 5 para
       um plano de 3.
       ⚠ AGORA É UMA CHAMADA SÓ, transacional no banco: ou nasce o parcelamento inteiro — pai,
       N parcelas e os N lançamentos ligados a elas — ou não nasce nada. Acabou o meio-caminho.
       ⚠ É O MESMO WRITER DA TELA DE PARCELAMENTOS, pelo MESMO montador
       (`montarPayloadParcelamento`). Um parcelamento criado aqui e um criado lá ficam idênticos
       no banco — que é o item 4 da homologação. */
    if (!currentIsEdit && formaPagamentoParc === 'parcelada' && numParcelas >= 2) {
      if (!clienteAtual?.id) { toast.error('Sessão inválida'); setSaving(false); return; }
      /* PR 2b — boleto de parcela que saiu do plano não tem onde nascer: pára ANTES de gravar, e diz. */
      if (pendentes.some(p => p.parcela != null && p.parcela > numParcelas)) {
        setErroAntesDeSalvar(`Há boleto de parcela acima de ${numParcelas} — tire-o na aba Documentos ou volte o número de parcelas.`);
        setAbaAtiva('documentos');
        setSaving(false);
        return;
      }
      /* PARC-FECHA-02 item 1 — o que foi digitado no topo NÃO viaja no parcelado: pára ANTES de gravar e diz, em vez de perder. */
      if (digitadoNoTopo && !haNotaNaCompra) {
        setErroAntesDeSalvar('O tipo e o número digitados no topo de Documentos não valem no parcelado — leve-os para Documentos da compra (o link ao lado) ou apague-os.');
        setAbaAtiva('documentos');
        setSaving(false);
        return;
      }
      /* A fazenda vazia ja' foi recusada no inicio do `handleSubmit`, com o foco no campo — o toast "Escolha a
         fazenda" que morava aqui saiu (FIN-FAZENDA-PADRAO-01). */
      /* ⚠ A 1ª PARCELA É O VENCIMENTO, NÃO O PAGAMENTO — e essa inversão era metade do defeito.
         A grade de prévia tinha cabeçalho "Vencimento" sobre um campo que gravava
         `data_pagamento`, e o vencimento real ia igual nas N. A RPC escalona o VENCIMENTO e
         deixa o pagamento NULO, que é o que 'programado' significa. O pagamento só entra como
         semente quando não há vencimento nenhum — não inventar data é melhor que recusar. */
      const primeira = livresAbertas ? (parcelasLivres[0]?.vencimento ?? '') : (dataVencimento || dataPagamento);
      if (!primeira) { toast.error('Informe a data de vencimento da 1ª parcela'); setSaving(false); return; }
      try {
        const payload = montarPayloadParcelamento(
          clienteAtual.id,
          {
            fazendaId: fazendaIdEfetivo,
            descricao,
            valorTotal: Math.abs(valorNum),
            totalParcelas: numParcelas,
            dataPrimeiraParcela: primeira,
            /* PARC-LIVRES-01 — nas livres a RPC grava EXATAMENTE a lista; no mensal a chave não viaja. */
            parcelas: livresAbertas ? parcelasParaPayload(parcelasLivres) : null,
            dataCompetencia,
            /* ⚠ MENSAL FIXO, e não é campo novo: o `addDays(i * 30)` que morreu aqui já TENTAVA
               ser mensal. A RPC faz `make_interval(months => …)`, que é mensal de verdade. */
            intervaloMeses: 1,
            favorecidoId: favorecidoForForm,
            formaPagamento: formaPgto || null,
            contaBancariaId,
            /* ⚠ O ESCOPO VEM DO PLANO, pelo cluster. A tela de Parcelamentos indexa por ele, e
               sem escopo o parcelamento nasceria mudo lá. */
            tipoFinanciamento: classificacao.escopo_negocio || null,
            /* ⚠ NULO, E NÃO A NOTA FISCAL: o modal tem `numero_documento` (a NF do lançamento),
               que não é o número do CONTRATO. Enfiar um no outro encheria a coluna errada com
               um dado certo — pior que deixá-la vazia. */
            numeroContrato: null,
            observacao: observacao || null,
          },
          {
            plano_conta_id: classificacao.plano_conta_id,
            safra_id: safraParaGravar(),
            cultura: culturaParaGravar(atividade, cultura),
            fase: faseParaGravar(atividade, fase),
          },
        );
        /* NOTA-CONTAS-NA-CRIACAO-01 A — a divisao pendente vai NA MESMA chamada (percentual dos itens: todas as parcelas na mesma proporcao) */
        const divisaoDoParcelado = divisaoNaCriacao && itensDaNota
          ? { partes: percentuaisDosItens(porContaDosItens(itensDaNota.lidos.itens, divisaoNaCriacao)), motivo: MOTIVO_DA_DIVISAO_NA_CRIACAO } : undefined;
        const financiamentoId = await gravarParcelamento(payload, clienteAtual.id, () => qc.invalidateQueries(), divisaoDoParcelado);
        await aposCriarDoXml();
        toast.success(`Parcelamento criado: ${numParcelas} parcelas`);
        /* FIN-NFE-PARCELAS-01 PR 2b — a NF da compra vai para a parcela 1 e é LIGADA às N; cada boleto,
           para a sua parcela (pelo número). */
        if (pendentes.length > 0) {
          const parcelasGravadas = financiamentoId ? await lancamentosDoParcelamento(financiamentoId) : [];
          if (parcelasGravadas.length === 0) {
            setPosSalvar({ alvo: null, erro: 'Parcelamento gravado, mas as parcelas não foram encontradas — anexe os documentos pelo Editar de cada parcela.' });
            return;
          }
          if (!(await gravarPendentesDepoisDoSalvar({ tipo: 'parcelado', parcelas: parcelasGravadas }))) return;
        }
        onClose();
      } catch (e) {
        /* ⚠ A MENSAGEM CRUA DA RPC — e agora ela de fato chega. O teste anterior era
           `e instanceof Error ? e.message : …`, e ele dava FALSO sempre: no destructuring
           (`const { error } = await …`) o `error` do PostgREST é um objeto plano, não um `Error`
           — a biblioteca só constrói `PostgrestError` quando se pede `.throwOnError()`.
           Resultado: de 18 a 21/09 o botão recusava com o genérico enquanto o banco dizia
           `42809: op ANY/ALL (array) requires array on right side`, e ninguém viu. */
        /* com a divisao: a recusa do banco desfez TUDO (uma transacao) — a frase fica ao lado do botao e a tela continua como estava */
        if (divisaoNaCriacao) setErroAntesDeSalvar(`Nada foi criado: ${mensagemDoErro(e, 'a divisão pelos itens foi recusada')}`);
        else toast.error(mensagemDoErro(e, 'Falha ao criar o parcelamento'));
      } finally {
        setSaving(false);
      }
      return;
    }

    // --- Single save (à vista) or EDIT ---
    // PR-FIN-STATUS-UX-03A-1 — anti-reclassificação: se o registro carregado era legado 'meta' e o usuário
    //   NÃO escolheu explicitamente outro valor no Select (a normalização visual meta→Previsto e mudanças
    //   implícitas por outros campos NÃO contam), preserva 'meta' no payload. Escolha explícita de
    //   Agendado/Programado/Realizado persiste o valor oficial (conversão permitida). Reescolher "Previsto"
    //   (mesmo valor exibido) não dispara onValueChange no Select → mantém 'meta' (conversão dedicada futura).
    const statusPersistido = (statusOriginalRef.current === 'meta' && !statusTouchedRef.current)
      ? 'meta'
      : statusTransacao;
    const form: LancamentoV2Form = {
      fazenda_id: fazendaIdEfetivo,
      conta_bancaria_id: contaBancariaId,
      conta_destino_id: contaDestinoFinal,
      data_competencia: dataCompetencia,
      data_vencimento: voltar ? voltar.vencimento : (dataVencimento || null),   // PR-FIN-MODAL-VENCIMENTO-02B
      /* ⚠ DEFESA NO PAYLOAD — PR-FIN-V2-STATUS-PGTO-01: fora de realizado/conciliado o pagamento vai
         NULO mesmo que o estado tenha valor (hidratação de registro antigo, prefill). A exceção é o
         pagamento travado pelo extrato, que é o do banco. */
      data_pagamento: pagamentoParaGravar(statusPersistido, dataPagamento, pagamentoTravado),
      valor: voltar ? voltar.valor : Math.abs(valorNum),
      tipo_operacao: tipoOperacao,
      status_transacao: statusPersistido,
      descricao,
      // PR-OC-FIN-EDIT-FIX-01 — enviar grupo_custo evita falso-positivo de "classificação" na proteção OC
      ...classificacaoParaGravar(),
      observacao,
      numero_documento: notaFiscal || null,
      tipo_documento: tipoDocumento || null,
      favorecido_id: favorecidoForForm,
      forma_pagamento: formaPgto || null,
      dados_pagamento: dadosPagamentoParaGravar,
      safra_id: safraParaGravar(),
      cultura: culturaParaGravar(atividade, cultura),
      fase: faseParaGravar(atividade, fase),
    };
    /* REC-VALOR-DO-MES-MODAL-01 — a marca do valor do mês vai NO MESMO UPDATE. Quem decide é `marcaAoSalvar` (dono puro);
       lançamento comum não recebe a chave, e o payload dele é o de sempre. */
    const pedidoValorDoMes: PedidoDoValorDoMes | undefined = voltar
      ? 'limpar'
      : marcaAoSalvar({
          ehRecorrencia: ehOcorrencia,
          aberta: ocorrenciaAberta({ status: statusPersistido, dataPagamento: form.data_pagamento, conciliadoEm: lancamento?.conciliado_em }),
          antes: { valor: lancamento?.valor, vencimento: lancamento?.data_vencimento, marca: marcaGravada },
          depois: { valor: form.valor, vencimento: form.data_vencimento },
        }) === 'marcar_manual' ? 'marcar_manual' : undefined;
    if (pedidoValorDoMes) form.valor_do_mes = pedidoValorDoMes;

      console.log('[FinV2] SUBMIT STATE', {
        mode: currentIsEdit ? 'UPDATE' : 'INSERT',
        id: currentEditId,
        isTransferencia,
        contaDestinoId,
        contaOrigemId,
        'form.conta_destino_id': form.conta_destino_id,
        'form.conta_bancaria_id': form.conta_bancaria_id,
        tipoOperacao,
      });

    /* PARC-CADEIA-01 passo 3 — parcela NÃO paga de compra parcelada com valor ou vencimento mudado: os dois campos vão
       PRIMEIRO pela gravação do contrato (parcela + lançamento + contrato, numa transação). Recusou: a frase fica ao lado do
       botão e NADA é gravado. Passou: o gravador de sempre leva o resto (e os mesmos dois valores). */
    /* FIN-CONCILIADO-NAO-REBAIXA-01 — o salvar tiraria o lançamento do estado do banco (status, pagamento, valor ou conta)?
       Pergunta-se ao banco ANTES de gravar (outra aba pode ter casado depois da abertura): casado, a frase fica ESCRITA ao
       lado do botão e nada é gravado — o P0001 do gatilho viraria a frase genérica do `normalizarErro`. */
    if (currentIsEdit && lancamento && lancamento.id === currentEditId && saiDoEstadoDoBanco(lancamento, form)
      && (casadoComExtrato || await consultarCasadoComExtrato(lancamento.id))) {
      setCasadoComExtrato(true);
      setErroAntesDeSalvar(FRASE_CASADO_COM_EXTRATO);
      setSaving(false);
      return;
    }
    /* OC-TITULO-AJUSTAR-01 — titulo de OC em aberto com vencimento, conta ou classificacao mudados: os tres vao PRIMEIRO pela OC
       (`oc_titulo_ajustar`: lancamento + parte + parcela + compromisso de parcela unica, com trilha). Recusou: a frase fica ao lado
       do botao e nada e' gravado. Passou: o gravador de sempre leva o resto (e os mesmos valores). */
    if (currentIsEdit && lancamento && lancamento.id === currentEditId && tituloDaOC && ocAjustavel) {
      const campos = camposDoAjusteOC(lancamento, form);
      if (Object.keys(campos).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { error } = await (supabase as any).rpc('oc_titulo_ajustar', { p_lancamento_id: lancamento.id, p_campos: campos, p_motivo: null });
        if (error) { setErroAntesDeSalvar(error.message); setSaving(false); return; }
      }
    }
    if (currentIsEdit && contratoDaParcela && edicaoParcela && edicaoParcela.mudou) {
      const recusa = await gravarParcelaDoModal(contratoDaParcela.financiamentoId, edicaoParcela.lista, edicaoParcela.totalDepoisCent);
      if (recusa) { setErroAntesDeSalvar(recusa); setSaving(false); return; }
    }

    // CRITICAL: pass the stable ID for edits — ensures UPDATE, never INSERT
    const ok = await onSave(form, currentEditId || undefined);
    if (!ok) { setSaving(false); return; }
    /* NOTA-CONTAS-NA-CRIACAO-01 A — a' vista com a divisao pendente: os itens, a nota e a divisao, nessa ordem (a RPC divide pela nota
       ANEXADA); qualquer um que falhe cancela o recem-criado (`desfazerCriacao`) e a frase fica ao lado do botao — nada fica pela metade */
    if (!currentIsEdit && divisaoNaCriacao) {
      const frase = await criarDividido(typeof ok === 'string' ? ok : null, divisaoNaCriacao);
      setSaving(false);
      if (frase) { setErroAntesDeSalvar(frase); return; }
      onClose();
      return;
    }
    if (!currentIsEdit) await aposCriarDoXml();
    /* FIN-NFE-PARCELAS-01 — lançamento novo com documentos pendentes: o `onSave` devolveu o id (quem
       liga `documentosAntesDeSalvar` devolve), e a cadeia de sempre roda nele antes de fechar. */
    if (!currentIsEdit && pendentes.length > 0) {
      const idCriado = typeof ok === 'string' ? ok : null;
      if (!idCriado) {
        setSaving(false);
        setPosSalvar({ alvo: null, erro: 'Lançamento gravado, mas sem o id para anexar — anexe os documentos pelo Editar.' });
        return;
      }
      const tudo = await gravarPendentesDepoisDoSalvar({ tipo: 'avista', lancamentoId: idCriado });
      setSaving(false);
      if (tudo) onClose();
      return;
    }
    setSaving(false);
    onClose();
  };

  /**
   * Roda a cadeia dos documentos pendentes num lançamento que JÁ existe. Devolve `true` quando todos
   * foram gravados. ⚠ FALHA NÃO DESFAZ O LANÇAMENTO: ele fica gravado, a lista mostra o que não foi, e
   * o erro aparece ao lado do botão com "Tentar de novo" — sem toast (UX-TOAST-01).
   */
  const gravarPendentesDepoisDoSalvar = async (
    alvo: { tipo: 'avista'; lancamentoId: string } | { tipo: 'parcelado'; parcelas: ParcelaGravada[] },
  ): Promise<boolean> => {
    if (!clienteAtual?.id) return false;
    setGravandoDocs(true);
    try {
      const lista = alvo.tipo === 'avista'
        ? await gravarDocumentosPendentes(clienteAtual.id, alvo.lancamentoId, pendentes)
        : await gravarDocumentosDoParcelamento(clienteAtual.id, alvo.parcelas, pendentes);
      setPendentes(lista);
      if (todosGravados(lista)) { setPosSalvar(null); return true; }
      const falhas = lista.filter(p => !p.gravado);
      setPosSalvar({
        alvo,
        erro: `${alvo.tipo === 'avista' ? 'Lançamento gravado' : 'Parcelamento gravado'}. ${falhas.length} ${falhas.length === 1 ? 'documento não foi gravado' : 'documentos não foram gravados'}: ${falhas[0].erro ?? 'falha'}`,
      });
      setAbaAtiva('documentos');
      return false;
    } finally {
      setGravandoDocs(false);
    }
  };

  const tentarDeNovo = async () => {
    if (!posSalvar?.alvo) return;
    if (await gravarPendentesDepoisDoSalvar(posSalvar.alvo)) onClose();
  };

  /* PR 2b — "Anexar vários boletos" antes de salvar: vira pendente de cada parcela. */
  const guardarBoletosDaPrevia = async (itens: BoletoAtribuido[]): Promise<string | null> => {
    setPendentes(l => [...l, ...itens.map(i => novoPendente({ especie: 'boleto' }, i.arquivo, i.parcela))]);
    return null;
  };

  /* PR 2b — "Anexar boletos das parcelas" numa parcela já gravada: grava direto em cada irmã. A cadeia é a
     mesma (registrar -> subir -> anexar); a primeira falha volta para o diálogo, ao lado do botão. */
  const gravarBoletosNasIrmas = async (itens: BoletoAtribuido[]): Promise<string | null> => {
    if (!clienteAtual?.id || !irmas) return 'Sessão inválida.';
    const falhas: string[] = [];
    for (const i of itens) {
      const irma = irmas.find(x => x.numero === i.parcela);
      if (!irma) { falhas.push(`parcela ${i.parcela}: não encontrada`); continue; }
      const [r] = await gravarDocumentosPendentes(clienteAtual.id, irma.lancamentoId, [novoPendente({ especie: 'boleto' }, i.arquivo, i.parcela)]);
      if (!r.gravado) falhas.push(`parcela ${i.parcela}: ${r.erro ?? 'falha'}`);
    }
    await documentosApi.recarregar();
    if (lancamento?.id) setIrmas(await irmasDaParcela(lancamento.id, clienteAtual.id).catch(() => null));
    return falhas.length ? `Não gravados — ${falhas.join('; ')}` : null;
  };

  const handleFornecedorCriado = (f: FornecedorV2) => {
    setFavorecidoId(f.id);
    setFornecedorDialogOpen(false);
  };

  // Sum of parcelas for display
  const parcelasTotal = parcelaRows.reduce((acc, r) => acc + r.valor, 0);

  // Determine button label
  const getSubmitLabel = () => {
    if (saving) return 'Salvando...';
    if (isEdit) return 'Salvar Alterações';
    if (modoOC) return formaPagamentoParc === 'parcelada' ? `Programar ${numParcelas} parcelas` : modoOC.natureza === 'obrigacao' ? 'Lançar despesa' : 'Programar';
    if (formaPagamentoParc === 'parcelada') return `Criar ${numParcelas} Parcelas`;
    return 'Criar Lançamento';
  };

  const firstFieldRef = useRef<HTMLButtonElement>(null);

  // Auto-focus first field on open
  useEffect(() => {
    if (open) {
      setTimeout(() => firstFieldRef.current?.focus(), 100);
    }
  }, [open]);

  // PR-FIN-MODAL-02C #10 — densidade dos blocos: padding/espaçamento reduzidos (~20% menos altura).
  /* UI-MODAL-BLOCOS-01 — os blocos do modal são o bloco da casa (branco, borda fina, título 11px/600 sentence case). */
  const sectionClass = cn(BLOCO_FORMULARIO, "gap-1");
  /* ⚠ A MESMA STRING, AGORA DE UM DONO SÓ — PAR-01a-ii: ela é usada pelos campos deste
     diálogo e pelos do cluster, e duas cópias divergiriam no dia em que alguém ajustasse o
     foco de um lado. */
  const fieldBg = CAMPO_BG;
  // PR-FIN-STATUS-UX-03A-1 — fonte reduzida SÓ nos 3 DatePickers da Linha 1 (Competência/Vencimento/
  //   Pagamento) para o ano caber (dd/MM/yyyy). text-[10px] vence o text-[12px] padrão do DatePicker
  //   via twMerge (11px ainda encostava o ano no ícone); largura/grid/padding/altura/ícone inalterados;
  //   componente compartilhado intocado.
  const dateFieldCls = cn(fieldBg, "h-7 text-[11px]");

  /* ── FIN-NFE-XML-01d — O QUE VEIO DO XML FICA EM AMBAR ATE' O OPERADOR MEXER ──────────────────────────────────────────
     ⚠ DERIVADO, NAO GUARDADO: um campo esta' em ambar enquanto o valor dele E' o que a nota propos. Editar tira o ambar
       sem estado nenhum para esquecer de limpar; voltar ao valor proposto o devolve.
     ⚠ SO' NO LANCAMENTO NOVO QUE NASCEU DE UMA NOTA. Sem `doXml`, `xml` e' nulo e tudo abaixo devolve o de sempre. */
  const xml: DoXml | null = !isEdit ? prefill?.doXml ?? null : null;
  const xmlAmbar = (campo: CampoDoXml): boolean => {
    if (!xml || !xml.proposta.origens[campo]) return false;
    const p = xml.proposta;
    switch (campo) {
      case 'tipo': return tipoOperacao === p.tipoOperacao;
      case 'competencia': return dataCompetencia === p.competencia;
      case 'fornecedor': return !!xmlFornecedorProposto && favorecidoId === xmlFornecedorProposto;
      case 'valor': return Math.round(Math.abs(valorNum) * 100) === p.valorCent;
      case 'subcentro': return !!p.classificacao && classificacao.plano_conta_id === p.classificacao.plano_conta_id;
      case 'fazenda': return !!p.fazendaId && fazendaId === p.fazendaId;
      case 'parcelamento':
        /* PARC-LIVRES-01 — nas livres o âmbar vale enquanto a lista é a da nota, sem edição */
        if (p.parcelamento.tipo === 'livres') return livresAbertas && !!baseLivres && !houveEdicao(parcelasLivres, baseLivres);
        return p.parcelamento.tipo === 'parcelado' && formaPagamentoParc === 'parcelada' && modoParcelas === 'mensal'
          && numParcelas === p.parcelamento.parcelas && dataVencimento === p.parcelamento.primeiroVencimento;
      case 'forma': return !!p.formaPagamento && formaPgto === p.formaPagamento;
      case 'documento': return notaFiscal === p.numeroDocumento;
      case 'descricao': return descricao === p.descricao;
      case 'vencimento': return p.parcelamento.tipo === 'unico' && dataVencimento === p.parcelamento.vencimento;
      default: return false;
    }
  };
  /** O rotulo do campo com a origem escrita ao lado (so' enquanto em ambar). */
  const xmlRot = (rotulo: string, campo: CampoDoXml) => (xmlAmbar(campo)
    ? <>{rotulo}<OrigemDoXml campo={campo} origem={xml?.proposta.origens[campo] ?? ''} /></>
    : rotulo);
  /** Idem, para os campos cujo rotulo e' texto puro (os seletores compartilhados). */
  const xmlRotTexto = (rotulo: string, campo: CampoDoXml) => (xmlAmbar(campo) ? `${rotulo} · ${xml?.proposta.origens[campo] ?? ''}` : rotulo);
  const xmlCls = (campo: CampoDoXml) => (xmlAmbar(campo) ? CAMPO_AMBAR : undefined);
  /** As duplicatas do XML, enquanto o parcelamento da tela ainda e' o que elas descrevem. */
  const duplicatasNaGrade = xml && !livresAbertas && xmlAmbar('parcelamento') ? xml.proposta.duplicatas : null;
  /* PARC-LIVRES-01 — o recado da grade (a faixa de 18px, quando a soma fecha): de onde a lista veio e as parcelas × a NOTA. */
  const recadoDasParcelas = ((): string | null => {
    if (!xml || formaPagamentoParc !== 'parcelada') return null;
    if (livresAbertas && xml.proposta.parcelamento.tipo === 'livres' && xmlAmbar('parcelamento')) return fraseParcelasComoNaNota(xml.proposta.parcelamento.parcelas);
    const dif = Math.round(parcelasTotal * 100) - xml.proposta.documento.valorCent;
    return dif === 0 ? '= valor da nota' : `nota ${reais(xml.proposta.documento.valorCent)} · diferença ${reais(dif)}`;
  })();
  const abrirOcorrenciaDaNota = (o: OcorrenciaDaNota) => {
    /* Em OUTRA aba: o lancamento em preenchimento nao se perde. */
    const destino = o.origem === 'lancamento' && o.lancamentoId ? `/?flancId=${encodeURIComponent(o.lancamentoId)}`
      : o.operacaoId ? `/?oc_id=${encodeURIComponent(o.operacaoId)}` : null;
    if (destino) window.open(destino, '_blank', 'noopener');
  };
  const criarFornecedorDoXml = async () => {
    if (!xml) return;
    setXmlCriandoFornecedor(true);
    try {
      if (clienteAtual?.id) {
        const ja = await fornecedorPeloDocumento(clienteAtual.id, xml.emitenteDocumento);
        if (ja) { setXmlConflito(ja); return; }
      }
      const novo = await onCriarFornecedor(xml.emitenteNome, fazendaId, documentoFormatado(xml.emitenteDocumento));
      if (novo) {
        setFavorecidoId(novo.id); setXmlFaixaFechada(true);
        /* FORN-CADASTRO-02 — o fornecedor novo nasce com a fantasia, a IE e o endereço do emitente (só campo vazio) */
        if (xml.emitente && clienteAtual?.id) {
          const erro = await completarCadastroPeloXml(clienteAtual.id, novo.id, xml.emitente);
          if (erro) toast.error(`Fornecedor criado, mas os dados do emitente não foram gravados: ${erro}`);
        }
      }
    } finally {
      setXmlCriandoFornecedor(false);
    }
  };
  /* FIN-CLASSIF-DIVIDIDA-01b — quem pode dividir: o lancamento SALVO, fora da OC (a classificacao e' da operacao), fora da transferencia
     e com a classificacao livre. Parcela de financiamento/compra parcelada divide no CADASTRO (todas as parcelas, a mesma proporcao). */
  const lancDividido = !!divisao && divisao.partes.length > 1;
  /* P72 — quantas parcelas vivas a compra tem (as irmas da parcela aberta) */
  const nParcelasDaCompra = irmas ? irmas.filter((x) => !x.cancelada).length : null;
  const asParcelasDaCompra = nParcelasDaCompra ? `as ${nParcelasDaCompra} parcelas` : 'as parcelas';
  const financiamentoDoLanc = lancamento && typeof Reflect.get(lancamento, 'financiamento_id') === 'string' ? String(Reflect.get(lancamento, 'financiamento_id')) : null;
  const podeDividir = isEdit && !!lancamento && !isOCTitulo && !isTransferencia && !subcentroTravado && !travado('classificacao')
    && Reflect.get(lancamento, 'cenario') !== 'meta';
  /* NOTA-CONTAS-NA-CRIACAO-01 A — o NOVO que nasce da nota (com os documentos antes de salvar: e' por eles que o id volta e a nota e'
     anexada antes de dividir), fora da OC e da transferencia */
  const podeDividirNaCriacao = !isEdit && !lancamento && !!itensDaNota && !!xml && !modoOC && !isTransferencia && !subcentroTravado
    && !travado('classificacao') && !!documentosAntesDeSalvar;
  /** "Dividir em N contas ao salvar": confere o que o banco recusaria, guarda o mapa e poe a MAIOR parte na conta do lancamento (a regra
   *  do banco: o lancamento dividido fica com a maior parte) — o Salvar valida o subcentro como sempre. */
  const aplicarDivisaoNaCriacao = (mapa: ReadonlyMap<number, string>) => {
    if (!itensDaNota) return;
    const recusa = porQueNaoDivideNaCriacao(itensDaNota.lidos.itens, mapa, classificacoesDoModal, tipoOperacao);
    if (recusa) { setErroAntesDeSalvar(recusa); return; }
    setErroAntesDeSalvar(null);
    setDivisaoNaCriacao(new Map(mapa));
    const c = classificacoesDoModal.find((x) => x.id === contaDaMaiorParte(itensDaNota.lidos.itens, mapa));
    if (c) {
      /* a safra so' fica se a maior parte e' da MESMA atividade (a regra de trocar a atividade na Geral; o campo esta' oculto enquanto pendente,
         e a safra de outra atividade seria recusada no Salvar — PR-FIN-SAFRA-ESCOPO-01) */
      const escopo = (c.escopo_negocio || '').trim();
      setClassificacao((atual) => ({ ...atual, plano_conta_id: c.id ?? null, subcentro: c.subcentro, macro_custo: c.macro_custo, grupo_custo: c.grupo_custo || '',
        centro_custo: c.centro_custo, escopo_negocio: c.escopo_negocio || '', atividade: atividadeValida(c.escopo_negocio),
        safra_id: escopo === 'administrativo' || escopo !== (atual.escopo_negocio || '').trim() ? '' : atual.safra_id }));
    }
  };
  /* a sugestao aprendida dos itens (as divisoes ja' feitas pelos itens, do mesmo emitente) */
  const chaveDaNotaDosItens = itensDaNota?.cabecalho.chave ?? null;
  const emitenteDosItens = itensDaNota?.cabecalho.emitenteDocumento ?? null;
  useEffect(() => {
    let vivo = true;
    setContasAprendidas(new Map());
    const cli = clienteAtual?.id;
    if ((!podeDividir && !podeDividirNaCriacao) || !cli || !itensDaNota) return;
    void historicoDoEmitente(cli, emitenteDosItens, chaveDaNotaDosItens).then((h) => {
      if (!vivo || !h.length) return;
      const validas = new Set(classificacoesDoModal.filter((c) => c.tipo_operacao === tipoOperacao).map((c) => c.id));
      setContasAprendidas(sugerir(itensDaNota.lidos.itens, aprender(h), (id) => validas.has(id)));
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a nota e o emitente bastam: a lista do plano so' valida
  }, [podeDividir, podeDividirNaCriacao, clienteAtual?.id, chaveDaNotaDosItens, emitenteDosItens]);
  const contasIniciaisDosItens = useMemo(() => {
    const gravadas = divisao ? contasDasPartes(divisao.partes) : new Map<number, string>();
    return gravadas.size ? gravadas : contasAprendidas;
  }, [divisao, contasAprendidas]);
  /** Depois de dividir/voltar/desfazer: rele^ as partes e a classificacao gravada (o Salvar seguinte manda o que o banco deixou — a trava
   *  do banco recusa reclassificar direto um lancamento dividido) e avisa, com "Desfazer". A lista de tras ja' foi avisada pela RPC. */
  const aposDividir = async (frase: string, desfazivel: boolean) => {
    setDivisaoSeq((n) => n + 1);
    if (lancamento?.id) {
      const c = await classificacaoGravada(lancamento.id);
      if (c) setClassificacao((atual) => ({
        ...atual, plano_conta_id: c.plano_conta_id, subcentro: c.subcentro ?? '', macro_custo: c.macro_custo ?? '', grupo_custo: c.grupo_custo ?? '',
        centro_custo: c.centro_custo ?? '', escopo_negocio: c.escopo_negocio ?? '', safra_id: c.safra_id ?? '', cultura: c.cultura ?? '', fase: c.fase ?? '',
        atividade: atividadeValida(c.escopo_negocio),
      }));
    }
    toast.success(frase, desfazivel ? { action: { label: 'Desfazer', onClick: () => setMotivoDaDivisao({ tipo: 'desfazer' }) } } : undefined);
  };
  const simularDivisao = useMemo(() => {
    const cli = clienteAtual?.id;
    const id = lancamento?.id;
    const m = motivoDaDivisao;
    if (!cli || !id || !m) return undefined;
    /* P72 — a parcela: o banco simula nas N parcelas (a frase diz quantas, ou QUAL parcela recusa) */
    if (m.tipo === 'desfazer') return financiamentoDoLanc ? () => desfazerDivisaoDoCadastro(cli, financiamentoDoLanc, 'prévia', true) : undefined;
    if (m.tipo === 'voltar') return financiamentoDoLanc ? () => voltarUmaContaDoCadastro(cli, financiamentoDoLanc, null, 'prévia', true)
      : () => voltarUmaConta(cli, id, null, 'prévia', true);
    if (financiamentoDoLanc && itensDaNota) {
      const ps = percentuaisDosItens(porContaDosItens(itensDaNota.lidos.itens, m.mapa));
      return () => dividir(cli, { lancamentoId: id, financiamentoId: financiamentoDoLanc }, ps, 'prévia', true);
    }
    return () => dividirPelosItens(cli, id, m.mapa, 'prévia', true);
  }, [clienteAtual?.id, lancamento?.id, motivoDaDivisao, financiamentoDoLanc, itensDaNota]);
  const confirmarDivisao = async (motivo: string): Promise<ResultadoDaDivisao> => {
    const cli = clienteAtual?.id;
    const id = lancamento?.id;
    const m = motivoDaDivisao;
    if (!cli || !id || !m) return { ok: false, frase: 'Lançamento não salvo.' };
    if (m.tipo === 'desfazer') {
      if (financiamentoDoLanc) {
        const r = await desfazerDivisaoDoCadastro(cli, financiamentoDoLanc, motivo, false);
        if (r.ok) await aposDividir(`Desfeito em ${asParcelasDaCompra} desta compra.`, false);
        return r;
      }
      if (!divisao?.ultimaOperacaoId) return { ok: false, frase: 'Não há o que desfazer.' };
      const r = await desfazerDivisao(cli, divisao.ultimaOperacaoId, motivo);
      if (r.ok) await aposDividir('Desfeito: a classificação voltou ao que era.', false);
      return r;
    }
    if (m.tipo === 'voltar') {
      const r = financiamentoDoLanc ? await voltarUmaContaDoCadastro(cli, financiamentoDoLanc, null, motivo, false) : await voltarUmaConta(cli, id, null, motivo, false);
      if (r.ok) await aposDividir(financiamentoDoLanc ? `${asParcelasDaCompra.replace(/^a/, 'A')} desta compra voltaram para 1 conta.` : 'A classificação voltou para 1 conta.', true);
      return r;
    }
    const r = financiamentoDoLanc && itensDaNota
      ? await dividir(cli, { lancamentoId: id, financiamentoId: financiamentoDoLanc }, percentuaisDosItens(porContaDosItens(itensDaNota.lidos.itens, m.mapa)), motivo, false)
      : await dividirPelosItens(cli, id, m.mapa, motivo, false);
    if (r.ok) await aposDividir(financiamentoDoLanc ? 'Dividido: todas as parcelas receberam a mesma proporção.' : `Dividido em ${new Set(m.mapa.values()).size} contas pelos itens da nota.`, !financiamentoDoLanc);
    return r;
  };

  /* NOTA-FORNECEDOR-COMPARAR-01 — "comparar e atualizar o cadastro" da faixa: o CNPJ de OUTRO cadastro nao entra (a faixa do conflito
     oferece "usar este"); depois, o MESMO modal da previa ("+ Da nota"), que so' grava o marcado (trilha por campo, desfazer) */
  const abrirComparacaoDoXml = async () => {
    const cli = clienteAtual?.id;
    if (!xml || !xmlFornecedorProposto || !cli) return;
    setXmlAbrindoComparar(true);
    try {
      if (xml.resolucao.cadastroSemDocumento) {
        const ja = await fornecedorPeloDocumento(cli, xml.emitenteDocumento);
        if (ja && ja.id !== xmlFornecedorProposto) { setXmlConflito(ja); return; }
      }
      const hoje = await cadastroParaComparar(cli, xmlFornecedorProposto);
      if (!hoje) { toast.error('O cadastro não foi lido. Nada foi gravado.'); return; }
      setXmlComparar(hoje);
    } finally { setXmlAbrindoComparar(false); }
  };
  const gravarComparacaoDoXml = async (campos: Record<string, string>): Promise<string | null> => {
    const cli = clienteAtual?.id;
    if (!xml || !xmlFornecedorProposto || !cli) return 'Sem cadastro escolhido.';
    const r = await atualizarCamposDoCadastro(xmlFornecedorProposto, campos, 'nota', xml.proposta.rotuloNota, cli);
    if (r.ok === false) return r.frase;
    setXmlCadastroAtualizado(true);
    const alt = r.alteracaoId;
    const nCampos = Object.keys(campos).length;
    toast.success(`Cadastro atualizado (${nCampos} ${nCampos === 1 ? 'coluna' : 'colunas'})`, alt ? {
      action: { label: 'Desfazer', onClick: () => { void desfazerCamposDoCadastro(alt, cli).then((e) => (e ? toast.error(e) : toast.success('Desfeito'))); } },
    } : undefined);
    return null;
  };
  /**
   * Depois que o LANCAMENTO nasceu (nunca antes): guarda os itens da nota e avisa quem abriu o modal. O cadastro do fornecedor NAO e'
   * tocado aqui (NOTA-FORNECEDOR-COMPARAR-01: so' pela comparacao confirmada). ⚠ Falha aqui NAO desfaz o lancamento.
   */
  /**
   * NOTA-CONTAS-NA-CRIACAO-01 A — o a' vista recem-criado COM a divisao pendente: guarda os itens (a RPC le^ os itens guardados), anexa a
   * nota (a RPC divide pela nota ANEXADA) e divide pela `fn_lancamento_dividir_pelos_itens`. O primeiro passo que falhar cancela o
   * recem-criado (`desfazerCriacao`) e devolve a frase; `null` = criado e dividido. ⚠ Os pendentes NAO sao marcados gravados aqui: depois
   * de cancelar, o proximo Salvar anexa a nota de novo no lancamento novo.
   */
  const criarDividido = async (idCriado: string | null, mapa: ReadonlyMap<number, string>): Promise<string | null> => {
    const cli = clienteAtual?.id;
    if (!idCriado || !cli) return 'Lançamento gravado, mas sem o id para dividir — divida pela aba Itens no Editar.';
    const erroItens = xml ? await gravarItensSemTravar(cli, xml.arquivo) : 'o lançamento não veio de uma nota';
    if (erroItens) return desfazerCriacao(cli, idCriado, `os itens da nota não foram guardados: ${erroItens}`);
    if (pendentes.length > 0) {
      const lista = await gravarDocumentosPendentes(cli, idCriado, pendentes);
      const falha = lista.find((x) => !x.gravado);
      if (falha) return desfazerCriacao(cli, idCriado, `a nota não foi anexada: ${falha.erro ?? 'falha'}`);
    }
    const frase = await dividirNaCriacao(cli, idCriado, mapa);
    if (!frase) onLancamentoCriado?.();
    return frase;
  };
  const aposCriarDoXml = async () => {
    if (!xml) return;
    /* ITENS-NOTA-01 — os itens da nota ficam guardados pela chave (o documento), sem travar o salvar */
    if (clienteAtual?.id) {
      const erroItens = await gravarItensSemTravar(clienteAtual.id, xml.arquivo);
      if (erroItens) toast.error(`Lançamento gravado, mas os itens da nota não foram guardados: ${erroItens}`);
    }
    onLancamentoCriado?.();
  };

  /* CRIAR-DO-EXTRATO-01 — a referência de onde o lançamento nasceu (extrato, planilha, referência) mora na LINHA DAS ABAS, à direita
     delas, quando a Geral está aberta: uma linha de 22px que não soma altura nenhuma ao corpo (a 750x520 o corpo já não tinha
     2px de folga — uma faixa dentro dele fazia o modal rolar). Sem referência, a barra é a de sempre, nó por nó. */
  const faixaNaBarra = !!referenciaOperacionalInfo;
  const barraDeAbas = (
    <TabsList className={cn("w-full justify-start gap-1 rounded-none border-b border-border bg-card px-2 py-1 h-auto shrink-0",
      faixaNaBarra && "w-auto border-b-0")}>
      {ABAS_TAB.filter(({ value }) => value !== 'itens' || !!itensDaNota).map(({ value, label }) => (
        // PR-FIN-MODAL-02J — restyle das abas (ERP moderno): inativa discreta
        // (font-medium/muted, hover suave), ativa evidente sem borda grossa —
        // fundo background, cantos sup. arredondados, borda fininha, sombra leve e
        // UNDERLINE primário de 1px via `after:` (pseudo-elemento), evitando somar duas
        // bordas inferiores (linha de 2px). `relative` sustenta o badge no canto.
        <TabsTrigger
          key={value}
          value={value}
          className={cn(
            "relative h-5 px-[7px] py-0 text-[10px] font-medium text-muted-foreground rounded-md",
            "hover:bg-muted/50",
            "data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none",
          )}
        >
          {value === 'itens' && itensDaNota ? `${label} (${itensDaNota.lidos.itens.length})` : label}
          {abaComErro(value) && (
            <span
              className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-destructive"
              aria-label="pendência"
            />
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className={cn(
          // PR-FIN-MODAL-02C #1 — ALTURA FIXA (h-[92vh]) além do max: o modal não muda de
          // altura ao trocar de aba; só a região central (TabsContent) rola. Padrão aprovado
          // (MesaPareamentoModal). Header/TabsList/footer permanecem estáveis.
          "flex flex-col p-0 bg-card dark:bg-card rounded-xl shadow-2xl border border-border overflow-hidden",
          // ⚠ MODAIS-PADRAO-01e — no fluxo normal, a ALTURA DO ABATE (`100vh-32`, sem o teto do tema): o modal
          // nao muda de altura ao trocar de aba e so' o corpo rola. O fluxo Excel (Mesa) fica nos 92vh de sempre.
          // `gap-0`: o `gap-4` do tema abria 16px entre cabecalho, corpo e rodape da grade — 32px que o resumo perdia.
          excelContext ? "h-[92vh] max-h-[92vh]" : "h-[calc(100vh-32px)] max-h-none gap-0",
          // O X nativo sobe para o meio da faixa de 36px (era `top-4`, centrado em 24px).
          "[&>button.absolute]:top-2.5 [&>button.absolute]:right-3",
          // PR-FIN-MODAL-02D — modal 2-colunas (form + painel de resumo à direita) também no fluxo
          // normal; largura acomoda a coluna de ~300px sem aumentar a altura (h-[92vh] fixo).
          "max-w-5xl",
          // PR-FIN-MODAL-02H — no fluxo normal (sem Excel), o modal vira GRID 2 colunas × 3 linhas:
          //   linha1: [header] ocupa as 2 colunas;
          //   linha2: [Tabs + formulário | RESUMO];
          //   linha3: [rodapé          | RESUMO].
          // O painel de resumo (col 2) faz SPAN das linhas 2-3 → ocupa TODA a coluna direita,
          // inclusive ao lado do rodapé, devolvendo ~1 altura de rodapé ao corpo do resumo
          // (fim da compactação forçada). `grid` sobrepõe `flex` (mesmo grupo display no twMerge);
          // o fluxo Excel permanece flex-col idêntico.
          // ⚠ MODAIS-PADRAO-01e — a GRADE DO ABATE: resumo de 240px (era 300) SO' na linha do corpo, e o rodape
          //   de volta a' largura inteira, embaixo das duas colunas. No 02H o resumo descia ao lado do rodape
          //   para ganhar altura; com a altura pela janela ele ja' tem os 479px do Abate, e as cinco cascas
          //   passam a ter a mesma forma.
          // ⚠ `minmax(0,1fr)`, NUNCA `1fr` — FORN-MESCLAR-02a / faixa do XML (Gabriel 19/10/2026): `1fr` tem o MINIMO automatico, e o
          //   minimo de uma linha `whitespace-nowrap` (o aviso "Fornecedor achado pelo nome · <razao social> …") e' o texto INTEIRO: a
          //   coluna crescia ate' ele, o resumo saia pela direita e o rodape cortava. Com minimo zero, quem encolhe e' o texto.
          !excelContext && "grid grid-cols-[minmax(0,1fr)_240px] grid-rows-[auto_minmax(0,1fr)_auto]",
          // CRIAR-DO-EXTRATO-01 — abaixo de 900px o resumo (que repete o formulário) sai: com ele, a 750/814 os cinco campos de data
          //   da primeira linha ficavam com 67–80px e cortavam o rótulo com "…". O formulário fica com a largura toda.
          !excelContext && "max-[899px]:grid-cols-[minmax(0,1fr)]",
        )}
          /* FIN-VALOR-CALC-01a — com conta aberta no campo Valor, Esc cancela a CONTA (o campo trata) e o modal fica. */
          onEscapeKeyDown={(e) => { if (contaAbertaRef.current) e.preventDefault(); }}
        >
          {/* ⚠ UM `fieldset` DESABILITADO COBRE O FORMULÁRIO INTEIRO (§1c), e é de propósito que
              seja o elemento nativo: ele desliga TODO controle que estiver dentro — inclusive os
              que ainda não existem —, sem uma lista de campos para alguém esquecer de atualizar.
              `display: contents` o apaga do layout, então a grade de duas colunas do modal segue
              igual.
              ⚠ E O X DE FECHAR FICA DE FORA: no `ui/dialog.tsx` ele é IRMÃO de `{children}`, não
              filho. Se estivesse dentro, o operador ficaria preso num modal que não pode editar
              nem fechar. */}
          <fieldset disabled={carregando} className="contents">
          {carregando && (
            <div className="col-span-2 row-start-2 row-end-4 flex items-center justify-center gap-2
              bg-card px-5 py-8 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando o cadastro do lançamento…
            </div>
          )}
          {/* Header */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o header ocupa as 2 colunas na linha 1;
              no fluxo Excel (flex-col) as classes de grid são inertes.
              PR-FIN-MODAL-02J — padding vertical simétrico (py-2.5) p/ centrar o título em relação
              ao X, e pr-10 de folga p/ o título/subtítulo nunca correrem sob o botão X (que é fixo
              no ui/dialog.tsx compartilhado — não movido nesta frente). Identidade (barra azul) mantida. */}
          {/* MODAIS-PADRAO-01e — faixa de 36px, uma linha, titulo 13px (era `px-5 py-2.5`, ~46px). No fluxo
              Excel o subtitulo vem na MESMA linha, depois do titulo. */}
          <DialogHeader className={cn("h-9 shrink-0 px-4 pr-10 flex-row items-center gap-2 space-y-0 border-b border-primary/20 bg-primary", !excelContext && "col-span-2 row-start-1")}>
            <DialogTitle className="shrink-0 text-[13px] font-semibold leading-none tracking-tight text-primary-foreground">{modoOC ? tituloDoModoOC(modoOC.natureza, modoOC.tipoOperacao) : isEdit ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
            {xml && <PilulaDoXml rotuloNota={xml.proposta.rotuloNota} />}
            {excelContext && (
              <div className="min-w-0 truncate text-[10px] font-normal leading-none text-primary-foreground/80">
                {isEdit
                  ? `Editando lançamento existente · ID ${lancamento?.id?.slice(0, 8)}`
                  : 'Criando a partir do Excel'}
              </div>
            )}
          </DialogHeader>

          {/* PR-FIN-MODAL-02B — Tabs CONTROLADO. Header e footer ficam FORA do Tabs (estáveis);
              a TabsList fica logo abaixo do header e o corpo rolável abriga o TabsContent ativo.
              Todo o estado dos campos permanece no componente pai (sem cópia por aba). */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o Tabs+form fica na col 1 / linha 2;
              no fluxo Excel mantém flex-1 (flex-col). O título do resumo saiu daqui e passou
              a ser a faixa de topo do próprio painel (col 2), alinhada a esta TabsList. */}
          <Tabs value={abaAtiva} onValueChange={v => setAbaAtiva(v as AbaFinanceira)} className={cn("flex min-w-0 flex-col min-h-0", excelContext ? "flex-1" : "col-start-1 row-start-2")}>
            {/* MODAIS-PADRAO-01e — a barra do Abate: botao 20px/10px, barra ~29px, aba ativa em navy claro
                (bg-primary/10), como as outras cascas. Era h-8 com botao de 24px/12px e a ativa sublinhada. */}
            {faixaNaBarra ? (
              <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border bg-card pr-2" data-testid="barra-de-abas-com-faixa">
                {barraDeAbas}
                {abaAtiva === 'geral' && <FaixaDaReferencia referencia={referenciaOperacionalInfo!} className="flex-1" />}
              </div>
            ) : barraDeAbas}
          {/* PR-Mesa-ExcelContext: com contexto Excel, corpo vira 2 colunas
              (form + painel). Sem contexto, wrapper usa `contents` (não gera
              caixa) → body volta a ser filho direto, layout 100% idêntico. */}
          <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
          {/* Scrollable body */}
          {/* UI-MODAL-BLOCOS-01 · LANCAMENTO COMPACTO — o corpo declara a régua de texto (11px / 13px de linha): os rótulos dos seletores
              da casa (fornecedor, produto, fazenda, subcentro, valor) são `<label>` INLINE e herdavam a caixa de linha de 24px do
              `body` — 8px de vão em cima de cada rótulo, medidos no DOM. 6px entre os blocos. */}
          {/* CRIAR-DO-EXTRATO-01 — 6px em cima (era 8): a 750x520 a Geral pedia 391px e tinha 389 — rolava 2px. */}
          <div className="min-w-0 flex-1 overflow-y-auto px-4 pt-1.5 pb-2 space-y-1.5 bg-muted text-[11px] leading-[13px]" data-testid="corpo-do-lancamento">

            {/* OC-CC-MODAL-FINANCEIRO-01 — a faixa de origem (o molde do "Do XML"): de qual operacao este lancamento e', com o
                caminho de volta. Uma linha de 24px, em todas as abas; so' o texto corta (inteiro no `title`). */}
            {modoOC && (
              <div className="flex h-6 items-center gap-2 rounded border border-sky-200 bg-sky-50/60 px-2 text-[10px] text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300" data-testid="faixa-origem-oc">
                <span className="min-w-0 truncate" title={`Origem: ${modoOC.rotulo}`}><span className="font-semibold">Origem:</span> {modoOC.rotulo}</span>
                {modoOC.onVoltar && (
                  <button type="button" className="ml-auto shrink-0 font-medium underline" onClick={modoOC.onVoltar} data-testid="voltar-para-oc">voltar à operação</button>
                )}
              </div>
            )}

            {/* ═══ ABA GERAL ═══ */}
            <TabsContent value="geral" className="mt-0 space-y-1.5 focus-visible:outline-none">
            {/* FIN-NFE-XML-01d — o que a nota pede que o operador decida: o fornecedor (uma faixa) e os avisos. */}
            {xml && (
              <div className="space-y-1" data-testid="xml-faixas">
                <FaixaDoFornecedor xml={xml} fechada={xmlFaixaFechada}
                  cadastro={xmlFornecedorProposto && favorecidoId === xmlFornecedorProposto && (xml.resolucao.cadastroSemDocumento || xml.resolucao.achadoPor === 'documento')
                    ? { oferece: xml.resolucao.cadastroSemDocumento || xmlNotaCompleta, atualizado: xmlCadastroAtualizado, abrindo: xmlAbrindoComparar,
                        onComparar: () => { void abrirComparacaoDoXml(); } }
                    : null}
                  onTrocar={() => {
                    setXmlFaixaFechada(true);
                    document.getElementById('campo-fornecedor-financeiro')?.querySelector('button')?.focus();
                  }}
                  onEscolher={(id) => { setFavorecidoId(id); setXmlFornecedorProposto(id); setXmlFaixaFechada(true); }}
                  onCriar={() => { void criarFornecedorDoXml(); }} criando={xmlCriandoFornecedor}
                  conflito={xmlConflito}
                  onUsarConflito={(id) => { setFavorecidoId(id); setXmlFornecedorProposto(id); setXmlConflito(null); setXmlFaixaFechada(true); }} />
                <AvisosDoXml xml={xml} registradaDispensada={xmlRegistradaDispensada}
                  onDispensarRegistrada={() => setXmlRegistradaDispensada(true)} onAbrirOcorrencia={abrirOcorrenciaDaNota} />
                {xmlAmbar('subcentro') && (
                  <div className="flex h-6 min-w-0 items-center overflow-hidden rounded border border-amber-300 bg-amber-50 px-2 text-[10px] text-amber-900" data-testid="origem-xml-subcentro"
                    title={`Classificação sugerida: ${xml.proposta.classificacao?.subcentro ?? ''} · ${xml.proposta.origens.subcentro ?? ''}`}>
                    <span className="min-w-0 truncate">Classificação sugerida: {xml.proposta.classificacao?.subcentro} · {xml.proposta.origens.subcentro} deste fornecedor</span>
                  </div>
                )}
              </div>
            )}

            {/* FASE 1 zoo-fin: aviso de origem zootécnica + link para LancamentoZooModal. */}
            {lancamento?.movimentacao_rebanho_id && (
              <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 p-3 mb-2">
                <div className="flex items-start gap-2">
                  <Beef className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                      Origem zootécnica vinculada
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                      Este lançamento financeiro foi gerado a partir de uma movimentação
                      do rebanho. Edite dados bancários aqui. Edite quantidade, peso,
                      categoria ou operação no módulo zootécnico.
                    </p>
                    <button
                      type="button"
                      onClick={handleAbrirZoo}
                      className="text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 underline underline-offset-2 mt-1"
                    >
                      Abrir lançamento zootécnico →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* PR-SAFE-0 — aviso de origem Operação Comercial: campos estruturais são somente leitura. */}
            {isOCTitulo && (
              <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 px-2 py-1 mb-2 flex items-start gap-2">
                <p className="text-[10px] text-sky-700 dark:text-sky-400 leading-tight flex-1">
                  <span className="font-semibold text-sky-800 dark:text-sky-300">Origem: Operação Comercial.</span>{' '}
                  {/* OC-TITULO-AJUSTAR-01: vencimento, conta e classificacao se ajustam aqui com o titulo em aberto (a OC acompanha);
                      travados, a frase diz por que e onde. */}
                  Valor, favorecido, tipo e competência são somente leitura ({ondeAjustarTituloOC(podeAbrirOC)});{' '}
                  {ocAjustavel
                    ? 'vencimento, conta e classificação se ajustam aqui (a operação acompanha, com trilha); descrição, observação e documento também.'
                    : <span data-testid="motivo-titulo-oc-travado">{motivoOCTravado}</span>}
                </p>
                {/* link só aparece quando o vínculo resolve E o tipo tem fluxo soberano de abertura (compra). */}
                {operacaoAbrivel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[10px] font-medium text-sky-800 dark:text-sky-300 shrink-0"
                    onClick={() => {
                      if (!operacaoId) return;
                      // PR-OC-FIN-EDIT-FIX-02 — navegação SPA na aba Financeiro (preserva contexto/filtros);
                      //   fallback para o reload legado quando o caller não fornece o handler.
                      if (onAbrirOperacaoOC) onAbrirOperacaoOC(operacaoId, operacaoTipo);
                      else window.location.assign(`/v2?oc_id=${encodeURIComponent(operacaoId)}`);
                    }}
                  >
                    Abrir →
                  </Button>
                )}
              </div>
            )}

            {/* PR-FIN-MODAL-02E — aba Geral reorganizada em LINHAS operacionais densas
                (sem card por grupo). A antiga aba Classificação foi INCORPORADA aqui
                (Linha 4). Todos os campos/estados/ids/handlers/validações preservados —
                apenas reposicionamento visual. O espaçamento vertical entre as linhas vem
                do `space-y-2` do próprio TabsContent. */}

            {/* UI-MODAL-BLOCOS-01 · LANCAMENTO COMPACTO (Gabriel 18/10/2026 15:45) — "Datas e status" e "Valor e contas" viraram UM
                bloco, "Valores e datas", com duas linhas de grade: (Tipo · Competência · Vencimento · Pagamento · Status) e (Valor ·
                Fazenda · Conta). So' a moldura mudou: os campos, a ordem de tabulação (tabIndex), handlers e validações são os de antes. */}
            <BlocoFormulario titulo="Valores e datas" testId="bloco-valores-datas" className="gap-1">
            {/* ── LINHA 1 — Tipo | Competência | Vencimento | Pagamento | Status (grid 3/2/2/2/3 = 12) ──
                PR-FIN-MODAL-VENCIMENTO-02B: Vencimento agora é um DatePicker FUNCIONAL (mesmo componente
                compartilhado de Competência/Pagamento), read-only para título OC. Grava em data_vencimento,
                nunca em data_pagamento; o contrato de Data Pagamento do lançamento manual permanece inalterado. */}
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-3" title={porqueOC('tipo')}>
                <Label className={REGUA_ROTULO}>{xmlRot('Tipo operação *', 'tipo')}</Label>
                <Select value={tipoOperacao} onValueChange={aplicarTipoOperacao} disabled={lockedFields?.includes('tipo_operacao') || isOCTitulo}>
                  <SelectTrigger ref={firstFieldRef} tabIndex={1} className={cn("h-7 text-[11px]", fieldBg, xmlCls('tipo'))}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_OPERACAO.filter(t => !tiposOperacaoPermitidos || tiposOperacaoPermitidos.includes(t.value))
                      .map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!modoOC && (
              <div className="col-span-2" title={porqueOC('competencia')}>
                <Label className={REGUA_ROTULO}>{/* em ambar o rotulo encurta: "Data Competência *" + a origem nao cabem na coluna (medido a 1.135) e quebravam a linha */}
                  {xmlAmbar('competencia') ? xmlRot('Competência *', 'competencia') : 'Data competência *'}</Label>
                <DatePicker value={dataCompetencia} onChange={setDataCompetencia} disabled={isOCTitulo} tabIndex={2} className={cn(dateFieldCls, xmlCls('competencia'))} />
              </div>
              )}
              {/* Data Vencimento — PR-FIN-MODAL-VENCIMENTO-02B: campo funcional (mesmo DatePicker de
                  Competência/Pagamento). Editável em lançamento manual; read-only para título OC
                  (governado pela Operação Comercial). Grava SEMPRE em data_vencimento, nunca em
                  data_pagamento. Contrato de Data Pagamento do manual permanece inalterado. */}
              <div className={modoOC ? 'col-span-3' : 'col-span-2'} title={porqueOC('vencimento')}>
                <Label className={cn(REGUA_ROTULO, ((modoOC && tentouOC && faltaVencimentoOC) || vencimentoEmErro) && 'text-destructive')}
                  data-testid={modoOC ? 'rotulo-vencimento-oc' : 'rotulo-vencimento'}>
                  {modoOC ? (tentouOC && faltaVencimentoOC ? `Vencimento * · ${MOTIVO_VENCIMENTO_OBRIGATORIO}` : 'Vencimento *')
                    : xmlAmbar('vencimento') ? xmlRot('Vencimento *', 'vencimento') : 'Data vencimento *'}</Label>
                {/* parcela paga: em leitura; o motivo está escrito no rodapé (`parcela-do-contrato`) — sem invólucro aqui, o HTML do lançamento comum não muda */}
                <DatePicker value={dataVencimento} onChange={setDataVencimento} disabled={(isOCTitulo && !ocAjustavel) || parcelaPaga} className={cn(dateFieldCls, xmlCls('vencimento'), ((modoOC && tentouOC && faltaVencimentoOC) || vencimentoEmErro) && 'border-destructive')} />
              </div>
              {!modoOC && (
              <div className="col-span-2"
                title={!pagamentoPermitido && !pagamentoTravado ? 'Só realizado tem data de pagamento' : undefined}>
                <Label className={REGUA_ROTULO}>Data pagamento *</Label>
                <DatePicker value={pagamentoMostrado} onChange={handleDataPagamentoChange}
                  disabled={pagamentoTravado || !pagamentoPermitido || travaCasado.pagamento} tabIndex={3} className={dateFieldCls} />
              </div>
              )}
              <div className="col-span-3" title={modoOC ? MOTIVO_STATUS_TRAVADO_OC : undefined}>
                <Label className={REGUA_ROTULO}>Status *</Label>
                <Select value={statusTransacao} onValueChange={handleStatusChange} disabled={travaCasado.status || travado('status_transacao') || undefined}>
                  <SelectTrigger tabIndex={4} className={cn("h-7 text-[11px]", fieldBg)}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* MODO OC, despesa — o ITEM DA OPERACAO (frete, comissao, taxas…): o mesmo catalogo do "Nova despesa", no lugar
                  que competencia e pagamento liberam. Obrigatorio; a pendencia fica escrita no rotulo, em vermelho. */}
              {modoOC?.natureza === 'obrigacao' && (
                <div className="col-span-3" data-testid="campo-item-oc">
                  <Label className={cn(REGUA_ROTULO, tentouOC && faltaItemOC && 'text-destructive')} data-testid="rotulo-item-oc">
                    {tentouOC && faltaItemOC ? `Item * · ${MOTIVO_ITEM_OBRIGATORIO}` : 'Item da operação *'}</Label>
                  <SearchableSelect value={itemOC} onValueChange={v => { setItemOC(v); if (erroAntesDeSalvar === MOTIVO_ITEM_OBRIGATORIO) setErroAntesDeSalvar(null); }}
                    options={modoOC.itens.map(i => ({ value: i.codigo, label: i.nome }))} allValue="" allLabel="Selecione o item" placeholder="Selecione o item" semTodos
                    className={cn("h-7 text-[11px]", fieldBg, tentouOC && faltaItemOC && 'border-destructive')} />
                </div>
              )}
            </div>
            {/* FIN-PGTO-FANTASMA-01 — só no caso legado (data de pagamento no banco sem estar realizado): o salvar remove a
                data, e é a única vez em que ele apaga algo que o usuário não tocou — a tela diz antes. */}
            {pagamentoLegadoARemover && (
              <p className="-mt-1 text-[10px] leading-tight text-amber-700 dark:text-amber-400" data-testid="aviso-pagamento-legado">
                {avisoPagamentoLegado(pagamentoLegadoARemover)}
              </p>
            )}
            {/* ── LINHA 3 — Valor, Fazenda e Conta(s) ──
                Valor COMPACTO (col-span-2); na Transferência os 4 campos ficam na MESMA
                linha (Valor 2 · Fazenda 4 · Origem 3 · Destino 3), sem quebra. Saída/Entrada
                usam a conta aplicável em col-span-6 (contrato de contas inalterado). */}
            <div className="grid grid-cols-12 gap-2">
              {/* Valor — mesmo state/tabIndex/disabled; a máscara mora em `CampoValorComConta`. */}
              <div className="col-span-2" title={porqueOC('valor')}>
                {/* ⚠ A CONTA DIRETO NO CAMPO — FIN-VALOR-CALC-01a. Sem operador é o campo de sempre (mesma máscara, mesmo HTML);
                    com operador ("16.238,00/2") o resultado aparece na linha do rótulo e Enter/blur o aplica. O modal segue com
                    UM valor: `valorDisplay` só muda por tecla da máscara ou por conta APLICADA — nunca pelo texto parcial. */}
                <CampoValorComConta
                  rotulo={xmlRot('Valor (R$) *', 'valor')}
                  valor={valorDisplay}
                  onValor={setValorDisplay}
                  className={cn("h-7 text-right tabular-nums text-[11px]", fieldBg, xmlCls('valor'))}
                  disabled={lockedFields?.includes('valor') || isOCTitulo || parcelaPaga || travaCasado.valor}
                  contaAbertaRef={contaAbertaRef}
                />
              </div>
              {/* Fazenda — PR-U2c-1B: <FazendaSelect /> (fonte única) */}
              <FazendaSelect
                value={fazendaId}
                onChange={setFazendaId}
                fazendas={fazendas}
                forcaAdministrativo={fazendaTravadaAdm}
                label={xmlRotTexto('Fazenda *', 'fazenda')}
                /* FIN-FAZENDA-PADRAO-01 — com o filtro Global o campo nasce VAZIO (nunca a primeira da lista), e o
                   vazio aparece aqui, em vermelho, antes de qualquer clique. */
                disabled={travado('fazenda_id') || undefined}
                obrigatorio
                id="campo-fazenda-financeiro"
                className="col-span-4"
                triggerClassName={cn(fieldBg, 'h-7 text-[11px]', xmlCls('fazenda'))}
                tabIndex={7}
              />
              {/* Conta Bancária — PR-H2: ContaBancariaSelect compartilhado (agrupado por
                  tipo_conta + dark/glass). Sentinela '__none__' preservada na semântica interna. */}
              {isTransferencia ? (
                <>
                  <div className="col-span-3">
                    <Label className={REGUA_ROTULO}>Conta origem *</Label>
                    <ContaBancariaSelect
                      value={contaOrigemId}
                      onValueChange={setContaOrigemId}
                      contas={contas}
                      placeholder="Selecione"
                      disabled={lockedFields?.includes('conta_bancaria_id') || travaCasado.contaOrigem}
                      prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                      excluirIds={contaDestinoId && contaDestinoId !== '__none__' ? [contaDestinoId] : undefined}
                      className={cn("h-7 text-[11px]", fieldBg)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Label className={REGUA_ROTULO}>Conta destino *</Label>
                    <ContaBancariaSelect
                      value={contaDestinoId}
                      onValueChange={setContaDestinoId}
                      contas={contas}
                      placeholder="Selecione"
                      disabled={lockedFields?.includes('conta_destino_id') || travaCasado.contaDestino}
                      prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                      excluirIds={contaOrigemId && contaOrigemId !== '__none__' ? [contaOrigemId] : undefined}
                      className={cn("h-7 text-[11px]", fieldBg)}
                    />
                  </div>
                </>
              ) : isEntrada ? (
                <div className="col-span-6">
                  <Label className={REGUA_ROTULO}>Conta destino *</Label>
                  <ContaBancariaSelect
                    value={contaDestinoId}
                    onValueChange={setContaDestinoId}
                    contas={contas}
                    placeholder="Selecione"
                    disabled={lockedFields?.includes('conta_destino_id') || travaCasado.contaDestino}
                    prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className={cn("h-7 text-[11px]", fieldBg)}
                  />
                </div>
              ) : (
                <div className="col-span-6">
                  <Label className={REGUA_ROTULO}>Conta origem *</Label>
                  <ContaBancariaSelect
                    value={contaOrigemId}
                    onValueChange={setContaOrigemId}
                    contas={contas}
                    placeholder="Selecione"
                    disabled={lockedFields?.includes('conta_bancaria_id') || travaCasado.contaOrigem}
                    prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className={cn("h-7 text-[11px]", fieldBg)}
                  />
                </div>
              )}
            </div>

            </BlocoFormulario>
            <BlocoFormulario titulo="Identificação" testId="bloco-identificacao" className="gap-1">
            {/* ── LINHA 2 — Produto e Favorecido ── */}
            <div className="grid grid-cols-12 gap-2">
              {/* Produto — PR-U2c-1A: <ProdutoAutocomplete /> (fonte única) */}
              <ProdutoAutocomplete
                value={descricao}
                onChange={setDescricao}
                clienteId={clienteAtual?.id}
                label={xmlRotTexto('Produto / descrição *', 'descricao')}
                className="col-span-7"
                inputClassName={cn(fieldBg, 'h-7 text-[11px]', xmlCls('descricao'))}
                tabIndex={5}
                placeholder="Descrição do produto"
              />
              {/* Fornecedor — PR-U2c-1C: <FavorecidoSelect /> (fonte única) */}
              <div className="col-span-5" id={xml ? 'campo-fornecedor-financeiro' : undefined}>
                <FavorecidoSelect
                  value={favorecidoId}
                  onChange={setFavorecidoId}
                  onSelected={f => {
                    /* O fornecedor SUGERE a forma (já no nome que o lançamento usa); os dados não são mais copiados. */
                    if (f.tipo_recebimento) {
                      setModoPgto(modoPgtoEfetivo);
                      setFormaPgto(normalizarFormaDoCadastro(f.tipo_recebimento));
                    }
                  }}
                  /* FORN-SELETOR-PADRAO-01 passo 1b — a lista é a do LEITOR ÚNICO (ativos com documento, paginado até o fim);
                     o hospedeiro não passa mais a lista. O valor gravado inativo vem por id e aparece marcado "inativo". */
                  clienteId={clienteAtual?.id ?? null}
                  search={fornecedorSearch}
                  onSearchChange={setFornecedorSearch}
                  onCriarNovo={() => setFornecedorDialogOpen(true)}
                  disabled={travado('favorecido_id') || undefined}
                  novoDesabilitado={travado('favorecido_id') || undefined}
                  label={xmlRotTexto('Fornecedor *', 'fornecedor')}
                  triggerClassName={cn(fieldBg, 'h-7 text-[11px]', xmlCls('fornecedor'))}
                  novoButtonClassName="h-7 w-7"
                  tabIndex={6}
                  /* ⚠ O FORNECEDOR NAO E SOBERANIA DA OC — FIN-FORNECEDOR-OC-EDIT (B-19),
                     decisao do Gabriel. A OC manda em VALOR, CLASSIFICACAO, TIPO e
                     COMPETENCIA: sao os campos que compoem a OBRIGACAO, e muda-los aqui
                     contradiria a operacao. O FORNECEDOR nao compoe obrigacao nenhuma —
                     e' o favorecido do TITULO, atributo do financeiro, e e' distinto da
                     contraparte comercial (o vinculo da OC e' por PARTE, nunca por
                     favorecido).
                     ⚠ O CASO QUE FECHOU A DECISAO (maio): compromissos nascendo com
                     favorecido errado — frete em nome do boitel em vez da transportadora.
                     Sem poder corrigir aqui, a unica saida era cancelar e recriar, e foi
                     assim que nasceram duplicatas.
                     ⚠ A TRAVA ERA SO' DE TELA, E MAIS APERTADA QUE A DO GRAVADOR —
                     medido: `protecaoTituloOC.ts:48` ja nao trata favorecido como
                     estrutural (PR-OC-FIN-EDIT-FIX-01) e o payload restrito de
                     `editarLancamento` JA inclui `favorecido_id`. A tela impedia o que o
                     writer aceitava; a mesma edicao passava por uma porta e falhava por
                     outra, e isso ensina que o sistema e' arbitrario.
                     ⚠ O QUE CONTINUA TRAVADO, e por que: valor, tipo de operacao,
                     classificacao (subcentro/macro/grupo/centro) e as duas datas de
                     competencia/vencimento — os cinco compoem a obrigacao da OC e o writer
                     tambem os recusa, entao tela e gravador dizem a mesma coisa. */
                />
              </div>
            </div>

            </BlocoFormulario>
            <BlocoFormulario titulo="Classificação" testId="bloco-classificacao" className="gap-1"
              dica={lancDividido && divisao ? `dividida em ${divisao.partes.length} contas`
                : divisaoNaCriacao ? `dividida em ${new Set(divisaoNaCriacao.values()).size} contas ao salvar` : undefined}
              acao={podeDividir ? (
                /* FIN-CLASSIF-DIVIDIDA-01b — as acoes da divisao no titulo do bloco (nao somam altura) */
                <span className="flex items-center gap-2 text-[10px]" data-testid="acoes-da-divisao">
                  <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setDividirAberto(true)} data-testid="divisao-dividir">Dividir…</button>
                  {/* P72 — na parcela de compra parcelada / financiamento os dois tambem aparecem: valem pelo CADASTRO (as N parcelas) */}
                  {lancDividido && (
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMotivoDaDivisao({ tipo: 'voltar' })} data-testid="divisao-voltar">Voltar para 1 conta</button>
                  )}
                  {divisao?.ultimaOperacaoId && (
                    <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setMotivoDaDivisao({ tipo: 'desfazer' })} data-testid="divisao-desfazer">Desfazer</button>
                  )}
                </span>
              ) : divisaoNaCriacao ? (
                /* A — a divisao pendente se desfaz na tela (nada foi gravado): volta a 1 conta, a maior parte */
                <span className="flex items-center gap-2 text-[10px]" data-testid="acoes-da-divisao-na-criacao">
                  <button type="button" className="underline-offset-2 hover:underline" onClick={() => setDivisaoNaCriacao(null)} data-testid="divisao-na-criacao-voltar">Voltar para 1 conta</button>
                </span>
              ) : undefined}>
            {/* ⚠ O CLUSTER DE CLASSIFICAÇÃO SAIU DAQUI — PAR-01a-ii. Atividade, Subcentro, Safra,
                Cultura e Fase, mais as regras que os cruzam, viraram `ClassificacaoLancamento`
                em `@/components/shared`, para o parcelamento montar a MESMA classificação sem
                copiar a regra.
                ⚠ O DADO FICOU AQUI: os quatro fluxos que o escrevem de fora — hidratar ao
                editar, transferência, prefill e reset — são do ciclo de vida DESTE diálogo. O
                componente é controlado: recebe `value` e devolve o próximo.
                ⚠ A `key` REMONTA O CLUSTER A CADA ABERTURA, e ela não é enfeite: os três estados
                de interação (`safraSugeridaId`, `safraEditadaAMao`, `subcentroLimpoPelaAtividade`)
                moraram aqui e eram ZERADOS pela hidratação e pelo reset. Agora que moram no
                filho, sem remontar eles atravessariam a troca de lançamento — abrir um com safra
                e depois um novo deixaria a sugestão calada no segundo, porque `safraEditadaAMao`
                teria ficado `true`.
                ⚠ `culturasDaSafra` VAI POR PROP: o hook não tem cache e esta tela também a usa,
                no aviso de rateio logo abaixo — chamar dos dois lados seria duas consultas. */}
            {lancDividido && divisao ? (
              <PartesDaClassificacao partes={divisao.partes} total={Math.abs(Number(lancamento?.valor ?? 0))} />
            ) : divisaoNaCriacao && itensDaNota ? (
              /* A — a divisao PENDENTE: as partes como vao ficar (o % dos itens sobre o valor do lancamento) */
              <PartesDaClassificacao partes={partesPendentes(itensDaNota.lidos.itens, divisaoNaCriacao, classificacoesDoModal, Math.abs(valorNum))} total={Math.abs(valorNum)} />
            ) : (
            <ClassificacaoLancamento
              regua="linha"
              key={`cls-${lancamento?.id ?? 'novo'}-${aberturaSeq}`}
              value={classificacao}
              /* ⚠ O SETTER DO `useState` VAI DIRETO, e é ele que resolve o updater funcional
                  sobre o estado vivo — PAR-01a-ii-fix1. Não envolver num lambda que chame
                  `next(classificacao)`: seria recriar, do lado do pai, exatamente o bug do
                  closure que este fix tirou do filho. */
              onChange={setClassificacao}
              classificacoes={classificacoesDoModal}
              safras={safras}
              dataCompetencia={dataCompetencia}
              culturasDaSafra={culturasDaSafra}
              tipoOperacao={tipoOperacao}
              travado={subcentroTravado || travado('classificacao')}
              motivoTravado={travado('classificacao') ? MOTIVO_CLASSIFICACAO_DA_OC : undefined}
              motivoSubcentroDesabilitado={porqueOC('classificacao')}
              subcentroDesabilitado={(isOCTitulo && !ocAjustavel) || subcentroTravado || travado('classificacao')}
              ocultarCulturaFase={!!modoOC || undefined}
              ocultarLinhaDaSafra={!!modoOC || undefined}
              erroSubcentro={erroDirecao && erroDirecao.subcentro === subcentro && erroDirecao.tipo === tipoOperacao
                ? erroDirecao.texto : null}
            />
            )}

            {/* ⚠ O MOTIVO MORA AO LADO DO CAMPO, nao so' no aviso do topo — OC-BOITEL-VALOR-01 · B3.
                O banner de origem ja' dizia "classificacao ... somente leitura (ajuste na OC)", a
                trinta linhas dali; quem chegava ao campo achava um Select cinza e nenhuma razao. O
                caso que originou a regra: a venda de boitel do NJ, classificada em 1140, foi
                corrigida CANCELANDO a parte e recriando — porque o campo nao explicava nem
                oferecia caminho.
                ⚠ E O CAMINHO E' A OC, NAO O FINANCEIRO. A classificacao do titulo espelha
                `zoo_operacao_partes`; deixar edita-la aqui criaria duas verdades sobre o mesmo
                lancamento — a parte diria 1140 e o titulo 1150, calados. E' a mesma familia do
                "duas telas, dois numeros, nenhum erro visivel". */}
            {isOCTitulo && !ocAjustavel && (
              <p className="text-[10px] text-muted-foreground -mt-1 flex items-center gap-1">
                Classificação pertence à operação.
                {operacaoAbrivel && (
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => {
                      if (!operacaoId) return;
                      if (onAbrirOperacaoOC) onAbrirOperacaoOC(operacaoId, operacaoTipo);
                      else window.location.assign(`/v2?oc_id=${encodeURIComponent(operacaoId)}`);
                    }}
                  >
                    corrigir na operação
                  </button>
                )}
              </p>
            )}

            {/* "Compõe DRE" (SOMENTE LEITURA) — PR-FIN-MODAL-02C #6, corrigido em PR-FIN-DRE-BADGE-01.
                ⚠ ELE MOSTRAVA O PASSADO ENQUANTO O OPERADOR MUDAVA O PRESENTE. Lia só
                `lancamento.compoe_dre`, a flag gravada; trocar o subcentro no modal não o
                movia. O caso medido: um lançamento de custeio (DRE sim) teve o subcentro
                trocado para "Adiantamento a Parceiro - Lavoura" (DRE não) e o badge seguiu
                dizendo Sim até salvar — afirmando sobre uma conta que já não era a escolhida.
                ⚠ NENHUMA REGRA NOVA, NENHUMA MATRIZ: só a escolha de QUAL fonte mostrar.
                Enquanto o subcentro é o da abertura, vale o que está gravado; assim que ele
                muda — e sempre, num lançamento novo — vale o que o plano diz, com o sufixo
                "ao salvar", porque é o que a trigger vai gravar e ainda não gravou.
                ⚠ AUSENTE É TRAÇO, nunca "Não". A view da lista do Financeiro não traz
                `compoe_dre` (medido), então o lançamento chega sem a flag; dizer "Não" ali
                seria afirmar o que ninguém sabe. */}
            {/* ── A FAIXA DE LEITURA — AGRI-MODAL-CULTURA-02/03.
                 ⚠ AS DUAS INFORMAÇÕES SÃO A MESMA COISA: consequências do que foi escolhido
                 acima. O rateio sai da cultura/fase e o DRE sai da conta — nenhuma das duas
                 se preenche, as duas se leem. Separá-las em blocos (o card do DRE, depois uma
                 linha solta) dava a cada uma um peso de seção e empurrava o rodapé.
                 ⚠ NA MESMA LINHA QUANDO CABEM, empilhadas quando não — `flex-wrap` sem
                 espaçamento vertical extra. O ponto do meio é o que diz que são irmãs.
                 ⚠ 10px E COR SECUNDÁRIA NOS DOIS, com a cor viva reservada ao que ela informa:
                 verde/âmbar no rateio (direto × compartilhado) e verde no "Sim" do DRE. */}
            {(() => {
              const doPlano = classificacoes.find(
                (c) => (c.subcentro || '').trim().toLowerCase() === (subcentro || '').trim().toLowerCase(),
              )?.compoe_dre;
              const usaPlano = !isEdit || subcentro !== subcentroDeAbertura;
              /* MODO OC — o PRINCIPAL da conta corrente fica FORA do DRE (quem compoe e' a entrega do gado), qualquer que seja a
                 conta; a despesa segue a linha do plano. E cultura/fase nao se aplicam: o aviso de rateio nao aparece. */
              const principalDaOC = modoOC?.natureza === 'principal';
              const cd = principalDaOC ? false : usaPlano ? doPlano : lancamento?.compoe_dre;
              const mostraDre = isEdit || !!subcentro;
              const aviso = modoOC ? null : atividade === 'agricultura' ? avisoCultura(cultura, culturasDaSafra)
                : atividade === 'pecuaria' ? avisoFase(fase)
                : null;
              if (!mostraDre && !aviso) return null;
              const label = cd === true ? '✔ Sim' : cd === false ? 'Não' : '—';
              return (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
                  {aviso && <span className={aviso.classe}>{aviso.texto}</span>}
                  {aviso && mostraDre && <span className="text-muted-foreground/50">·</span>}
                  {mostraDre && (
                    <span className="text-muted-foreground">
                      Compõe DRE:{' '}
                      <span className={cn('font-medium', cd === true ? 'text-success' : 'text-muted-foreground')}>{label}</span>
                      {principalDaOC ? <span className="ml-1" data-testid="dre-do-principal-oc">· quem compõe o DRE é a entrega do gado</span>
                        : usaPlano && cd != null && <span className="ml-1">ao salvar</span>}
                    </span>
                  )}
                </div>
              );
            })()}

            </BlocoFormulario>
            </TabsContent>
            {/* ═══ fim ABA GERAL ═══ */}

            {/* ═══ ABA PAGAMENTO ═══ */}
            <TabsContent value="pagamento" className="mt-0 space-y-1.5 focus-visible:outline-none">
            <section className={sectionClass}>
              <TituloDoBloco nome="Pagamento" />

              {/* Forma / Dados de Pagamento — realocados do antigo bloco "Complementares"
                  (PR-FIN-MODAL-02B). Campos e handlers idênticos; só mudou a aba. */}
              <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2 gap-y-1.5">
                <div>
                  <Label className={REGUA_ROTULO}>{xmlRot('Forma de pagamento', 'forma')}</Label>
                  <Select value={formaPgto || FORMA_PAGAMENTO_V2_NENHUMA} onValueChange={handleFormaPgtoChange}>
                    <SelectTrigger tabIndex={13} className={cn("h-7 text-[11px]", fieldBg, xmlCls('forma'))}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    {/* ⚠ A LISTA SAIU DAQUI — PAR-01c. Os oito itens eram escritos à mão neste
                        ponto; a tela de Parcelamentos passou a gravar a MESMA coluna
                        (`financeiro_lancamentos_v2.forma_pagamento`, via a parcela que nasce
                        lançamento) e duas cópias divergiriam na primeira forma nova. Os valores
                        são os mesmos, byte a byte, na mesma ordem.
                        ⚠ NÃO É O MÓDULO DA OC: `formasPagamento.ts` serve outra coluna e tem
                        Cheque. Este é o do v2 — ver o cabeçalho de `formasPagamentoV2.ts`. */}
                    <SelectContent>
                      <SelectItem value={FORMA_PAGAMENTO_V2_NENHUMA}>Nenhuma</SelectItem>
                      {FORMAS_PAGAMENTO_V2.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label className={REGUA_ROTULO}>Dados para pagamento</Label>
                  <DadosParaPagamento
                    modo={modoPgtoEfetivo}
                    bloco={blocoPgto}
                    forma={formaEfetivaPgto}
                    fornecedorNome={fornecedorDoPgto?.nome ?? null}
                    realizado={pgtoJaRealizado}
                    temCadastro={pgtoEhSaida}
                    texto={dadosPagamento}
                    bloqueado={saving}
                    campoClassName={fieldBg}
                    onTexto={(t) => { setModoPgto('proprio'); setDadosPagamento(t); }}
                    onUsarProprio={() => { if (modoPgtoEfetivo !== 'proprio') setDadosPagamento(''); setModoPgto('proprio'); }}
                    onVoltarAoCadastro={() => { setDadosPagamento(''); setModoPgto('cadastro'); }}
                    onEditarCadastro={() => setCadastroPgtoAberto(true)}
                  />
                </div>
              </div>

              {/* Frequency + Installment — only for new, e nunca no modo extrato */}
              {!isEdit && !ocultarParcelamento && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="grid grid-cols-3 gap-2">
                    {/* ⚠ O MODO "RECORRENTE" MORREU AQUI — FIN-RECORRENCIA-01.
                        Ele criava N lançamentos soltos num laço do front: sem regra
                        persistida não havia o que editar, encerrar ou continuar no
                        mês seguinte, e gerar de novo duplicava. A recorrência agora
                        é uma REGRA, na tela própria, com âncora de competência e
                        geração idempotente. O que fica aqui é o caminho para lá. */}
                    {!modoOC && (
                    <div className="col-span-3 flex items-baseline gap-2 rounded border border-dashed px-2 py-1">
                      <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        Conta que repete todo mês? Cadastre uma <b>recorrência</b> em Financeiro ›
                        Recorrências — a regra fica salva e gera os lançamentos do período de uma vez.
                      </span>
                    </div>
                    )}
                    {(
                      <div>
                        <Label className={REGUA_ROTULO}>{xmlRot('Modalidade', 'parcelamento')}</Label>
                        <Select value={formaPagamentoParc} onValueChange={(v: 'avista' | 'parcelada') => setFormaPagamentoParc(v)}>
                          <SelectTrigger className={cn("h-7 text-[11px]", fieldBg, xmlCls('parcelamento'))}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="avista">À vista</SelectItem>
                            <SelectItem value="parcelada">Parcelada</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {formaPagamentoParc === 'parcelada' && (
                      <div>
                        <Label className={REGUA_ROTULO}>Nº de parcelas *</Label>
                        <Input
                          type="number"
                          min={2}
                          max={24}
                          value={numParcelasTexto}
                          onChange={e => setNumParcelasTexto(e.target.value)}
                          onBlur={fecharNumParcelas}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fecharNumParcelas(); } }}
                          disabled={livresAbertas}
                          title={livresAbertas ? 'Nas parcelas livres o número é o da lista: use "+ Parcela" e o ✕.' : undefined}
                          className={cn("h-7 text-[11px]", fieldBg)}
                        />
                      </div>
                    )}
                  </div>

                  {/* PARC-LIVRES-01 — A GRADE DE PARCELAS: "Igual todo mês" (a prévia do que a RPC grava, só leitura) ×
                      "Parcelas livres" (vencimento e valor por parcela). N, soma, compra e diferença vêm de `resumoDasParcelas`;
                      o que apaga o Salvar é `motivoDasParcelas`, a MESMA função. Altura fixa: só a lista rola. */}
                  {formaPagamentoParc === 'parcelada' && (
                    <GradeDeParcelas
                      modo={modoParcelas}
                      onModo={trocarModoDasParcelas}
                      parcelas={livresAbertas ? parcelasLivres : (duplicatasNaGrade ? parcelasDaNota(duplicatasNaGrade) : parcelasDoMensal(parcelasMensais))}
                      onParcelas={setParcelasLivres}
                      compraCent={centavos(Math.abs(valorNum))}
                      onCompraVale={(somaCent) => setValorDisplay(toBRL(somaCent / 100))}
                      base={baseLivres}
                      rotuloVoltar={xml && xml.proposta.duplicatas.length > 0 ? 'Voltar às duplicatas da nota' : 'Desfazer edições'}
                      recado={recadoDasParcelas}
                      /* a altura segue a JANELA (nunca o conteúdo): medido, o corpo do modal tem 100vh − 131 e a grade começa a 207
                         com 15 de respiro embaixo — assim o modal não rola e só a lista rola */
                      altura="clamp(140px, calc(100vh - 355px), 236px)"
                    />
                  )}

                  {/* Recurrence grid */}
                </div>
              )}
            </section>

            </TabsContent>
            {/* ═══ fim ABA PAGAMENTO ═══ */}

            {/* ═══ ABA DOCUMENTOS ═══ */}
            <TabsContent value="documentos" className="mt-0 space-y-1.5 focus-visible:outline-none">
            {/* ⚠ OS ANEXOS VÊM ANTES DOS CAMPOS ANTIGOS, e os dois convivem por decisão
                (97b item 4). `Tipo Documento` e `Nº Documento` são COLUNAS DO LANÇAMENTO,
                lidas por Enriquecer, importações e legados; derivá-las do documento
                anexado agora alargaria o escopo para telas congeladas. Registrado como
                [FIN-DOC-CAMPOS-LEGADOS]. ⚠ QUANDO OS DOIS DIVERGIREM, VALE O DOCUMENTO —
                é o confronto que responde, não o campo digitado. */}
            {/* PR 2b-fix1/fix2 — em TODO uso da aba (decisão do Gabriel, 29/09), Tipo e Nº Documento vêm PRIMEIRO e ficam
                presos no topo da área que rola (o `overflow-y-auto` do corpo, abaixo das abas; `-top-2` cobre os 8px do
                `py-2` do corpo, senão as linhas passavam visíveis nessa faixa acima do bloco. O sticky não
                cobre o cabeçalho das abas nem o rodapé). Mesmos campos; só a régua (rótulo 10, campo 11, h-8
                como os outros campos do modal) e a posição. */}
            <section className={cn(sectionClass, "sticky -top-2 z-20")} data-testid="bloco-documentos-topo">
              <TituloDoBloco nome="Documentos" dica="do lançamento"
                acao={docVemDeDocumento ? (
                  <span className="block max-w-[420px] truncate tabular-nums text-[10px] font-normal text-muted-foreground" data-testid="doc-da-compra"
                    title={`${docDoLancamento.resumo} · ${docDoLancamento.origem === 'nota' ? 'nota da compra, ligada a este lançamento' : 'documento ligado a este lançamento'}`}>
                    {docDoLancamento.origem === 'nota' ? 'nota da compra' : 'documento ligado'}: <span className="text-foreground">{docDoLancamento.rotulo}</span>
                  </span>
                ) : undefined} />
              {topoTravado && !docVemDeDocumento && (
              <p className="flex items-baseline gap-1 whitespace-nowrap">
                  <span className="min-w-0 truncate text-[10px] font-normal text-amber-700" data-testid="motivo-topo-parcelado" title={MOTIVO_TOPO_NO_PARCELADO}>
                    {MOTIVO_TOPO_NO_PARCELADO}
                    {!isEdit && digitadoNoTopo && !haNotaNaCompra && (
                      <button type="button" className="ml-1 font-semibold text-primary underline" data-testid="levar-topo-para-compra" onClick={levarOTopoParaACompra}>
                        levar o que foi digitado para Documentos da compra
                      </button>
                    )}
                  </span>
              </p>
              )}
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                <div>
                  <Label className={REGUA_ROTULO}>Tipo documento</Label>
                  <Select disabled={topoTravado || !!modoOC} value={tipoDocumento || '__none_td__'} onValueChange={v => { setTipoDocumento(v === '__none_td__' ? '' : v as TipoDocumento); if (v !== 'Nota Fiscal') { /* keep raw */ } }}>
                    <SelectTrigger tabIndex={12} className={cn("h-7 text-[11px]", fieldBg)}><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none_td__">Nenhum</SelectItem>
                      {TIPOS_DOCUMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className={REGUA_ROTULO}>{xmlRot('Nº documento', 'documento')}</Label>
                  <Input
                    tabIndex={13}
                    disabled={topoTravado}
                    title={topoTravado ? MOTIVO_TOPO_NO_PARCELADO : undefined}
                    value={notaFiscalDisplay}
                    onChange={handleNotaFiscalChange}
                    inputMode={tipoDocumento === 'Nota Fiscal' ? 'numeric' : 'text'}
                    className={cn("h-7 tabular-nums text-[11px]", fieldBg, xmlCls('documento'))}
                    placeholder={tipoDocumento === 'Nota Fiscal' ? '000.000.000' : 'Número'}
                  />
                </div>
              </div>
            </section>
            {lancamento?.id ? (
              <AbaDocumentosLancamento api={documentosApi}
                clienteId={clienteAtual?.id ?? null}
                sugestao={sugestaoDoDocumento}
                onAnexarBoletosDasParcelas={irmas ? () => setAnexarBoletos('irmas') : undefined} />
            ) : documentosAntesDeSalvar && formaPagamentoParc === 'parcelada' && numParcelas >= 2 ? (
              /* PR 2b — PARCELADO: os documentos da COMPRA (ligados às N) e a grade de parcelas com o boleto
                 de cada uma. Os dois lados da mesma lista de pendentes, separados por `parcela`. */
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold">Documentos da compra <span className="font-normal text-muted-foreground">· valem para todas as parcelas</span></p>
                  <DocumentosPendentes pendentes={pendentes.filter(p => p.parcela == null)}
                    onMudar={f => setPendentes(l => [...f(l.filter(p => p.parcela == null)), ...l.filter(p => p.parcela != null)])}
                    clienteId={clienteAtual?.id ?? null}
                    ligadoA={numParcelas} travado={!!posSalvar} sugestao={sugestaoDoDocumento} />
                </div>
                <ParcelasDaCompra parcelas={parcelaRows}
                  notaFiscal={numeroDaNotaDaCompra(pendentes, notaFiscal)}
                  qtdNotas={pendentes.filter(p => p.parcela == null && p.payload.especie === 'nf').length}
                  boletos={pendentes.filter(p => p.parcela != null && p.parcela <= numParcelas)}
                  foraDoPlano={pendentes.filter(p => p.parcela != null && p.parcela > numParcelas)}
                  onBoleto={(parcela, arquivo) => { setErroAntesDeSalvar(null); setPendentes(l => [...l, novoPendente({ especie: 'boleto' }, arquivo, parcela)]); }}
                  onTirarBoleto={chave => { setErroAntesDeSalvar(null); setPendentes(l => l.filter(p => p.chave !== chave)); }}
                  onAnexarVarios={() => setAnexarBoletos('previa')}
                  travado={!!posSalvar} />
              </div>
            ) : documentosAntesDeSalvar ? (
              <DocumentosPendentes pendentes={pendentes} onMudar={setPendentes}
                clienteId={clienteAtual?.id ?? null}
                travado={!!posSalvar} sugestao={sugestaoDoDocumento} />
            ) : (
              <p className="rounded-md border bg-muted/20 px-3.5 py-3 text-[11px] text-muted-foreground">
                Salve o lançamento para anexar documentos.
              </p>
            )}

            {/* PR 2b-fix2 — a Observação fica embaixo e rola; o bloco "Documentos" (Tipo/Nº) está no topo em todos os usos. */}
            <section className={sectionClass}>
              <TituloDoBloco nome="Observação" />
              <Textarea tabIndex={15} aria-label="Observação" value={observacao} onChange={e => setObservacao(e.target.value)} rows={2} placeholder="Observações adicionais" className={cn("text-[11px] min-h-[48px]", fieldBg)} />
            </section>
            </TabsContent>
            {/* ═══ fim ABA DOCUMENTOS ═══ */}

            {/* ═══ ABA AUDITORIA (PR-FIN-AUDIT-01) — só leitura ═══
                ⚠ `mountOnly` pela montagem do próprio Tabs: o Radix só renderiza o
                TabsContent ativo, então a consulta da trilha nasce no primeiro clique na
                aba e não na abertura do modal. */}
            {/* ═══ ABA ITENS DA NOTA (ITENS-NOTA-01) — so' leitura; o quadro ocupa a altura do corpo e a tabela rola dentro ═══ */}
            {itensDaNota && (
              <TabsContent value="itens" className="mt-0 h-full focus-visible:outline-none" data-testid="aba-itens-da-nota">
                <ItensDaNota cabecalho={itensDaNota.cabecalho} lidos={itensDaNota.lidos} contaDoLancamento={subcentro || null}
                  vistaContas={podeDividir ? (
                    <ContasDosItens itens={itensDaNota.lidos.itens} classificacoes={classificacoesDoModal} tipoOperacao={tipoOperacao}
                      contaDeHoje={lancDividido ? null : (classificacao.plano_conta_id ?? null)} sugeridas={contasIniciaisDosItens} atividadeSugerida={classificacao.atividade}
                      gravando={!!motivoDaDivisao} onDividir={(mapa) => setMotivoDaDivisao({ tipo: 'itens', mapa })} />
                  ) : podeDividirNaCriacao ? (
                    /* NOTA-CONTAS-NA-CRIACAO-01 A — no NOVO: a mesma vista; "Dividir … ao salvar" deixa a divisao PENDENTE (o Salvar grava) */
                    <ContasDosItens itens={itensDaNota.lidos.itens} classificacoes={classificacoesDoModal} tipoOperacao={tipoOperacao} aoSalvar
                      contaDeHoje={classificacao.plano_conta_id ?? null} sugeridas={divisaoNaCriacao ?? contasAprendidas} atividadeSugerida={classificacao.atividade}
                      gravando={saving} onDividir={aplicarDivisaoNaCriacao} />
                  ) : undefined} />
              </TabsContent>
            )}
            <TabsContent value="auditoria" className="mt-0 focus-visible:outline-none">
              <AbaAuditoriaLancamento
                lancamentoId={lancamento?.id ?? null}
                criadoPor={lancamento?.created_by ?? null}
                criadoEm={lancamento?.created_at ?? null}
                descricao={lancamento?.descricao ?? null}
                catalogos={catalogosAuditoria}
              />
            </TabsContent>
          </div>
          {/* PR-Mesa-ExcelContext: painel lateral read-only "Contexto Excel /
              Sugestão". Scroll próprio, não some ao rolar o formulário. */}
          {excelContext && (
            <aside className="w-[300px] shrink-0 border-l border-border bg-muted/30 overflow-y-auto p-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Contexto Excel / sugestão
                </span>
                {excelContext.match_status && (
                  <span className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium bg-card">
                    {excelContext.match_status}
                  </span>
                )}
              </div>

              <ExcelCtxRow label="Data" value={excelContext.data} />
              <ExcelCtxRow
                label="Valor"
                value={excelContext.valor != null ? toBRL(excelContext.valor) : null}
              />
              <ExcelCtxRow label="Tipo" value={excelContext.tipo_operacao} />
              <ExcelCtxRow label="Fazenda" value={excelContext.fazenda_codigo} />

              <ExcelCtxConta label="Conta origem" conta={excelContext.conta_origem} />
              <ExcelCtxConta label="Conta destino" conta={excelContext.conta_destino} />

              <ExcelCtxRow label="Subcentro" value={excelContext.subcentro} block />
              <ExcelCtxRow label="Fornecedor" value={excelContext.fornecedor} block />
              <ExcelCtxRow label="Produto" value={excelContext.produto} block />

              {excelContext.mensagemDivergencia && (
                <div className="rounded-md border border-red-300 bg-red-50 text-red-800 px-2 py-1.5 text-[10px] mt-1">
                  {excelContext.mensagemDivergencia}
                </div>
              )}
            </aside>
          )}

          </div>
          </Tabs>

          {/* Sticky footer */}
          {/* PR-FIN-MODAL-02H — no grid (fluxo normal) o rodapé fica na col 1 / linha 3 (sob o
              formulário); o painel de resumo o ladeia. No fluxo Excel permanece full-width. */}
          {/* MODAIS-PADRAO-01e — 32px com botoes 22px/10px (era `px-5 py-2.5`, ~52px), na largura inteira
              como no Abate. Mesmos botoes, mesma ordem, mesmos textos. */}
          <div className={cn("h-8 shrink-0 px-2 border-t border-border bg-accent flex items-center gap-2", !excelContext && "col-span-2 row-start-3")}>
            <Button variant="outline" onClick={onClose} className="h-[22px] px-[9px] text-[10px]" tabIndex={16}>Cancelar</Button>
            {/* PR-FIN-MODAL-02B — indicação compacta de pendência + navegação p/ a 1ª aba inválida.
                Só aparece quando canSave=false E há aba identificável (o clique no Salvar
                desabilitado não ocorre, então a navegação é oferecida aqui). */}
            {!canSave && validacao.primeiraAbaInvalida && (
              <button
                type="button"
                onClick={handleVerPendencia}
                title={pendenciaMsg ?? undefined}
                className="flex items-center gap-1 text-[10px] font-medium text-destructive hover:underline"
              >
                <AlertCircle className="h-3 w-3" />
                {pendenciaMsg ?? 'Ver pendência'}
              </button>
            )}
            {/* REC-VALOR-DO-MES-MODAL-01 — a ocorrência de recorrência fala AQUI, no rodapé de 32px (altura fixa): UMA linha,
                o texto corta com o inteiro no `title` e o NÚMERO nunca corta. Marcada: a linha + "Voltar ao previsto" (apagado
                com o motivo quando não vale). Não marcada: só a intenção, e só enquanto há diferença. Lançamento comum: nada. */}
            {/* PARC-CADEIA-01 passo 3 — a parcela de compra parcelada fala AQUI (rodapé de altura fixa, uma linha): paga = o
                motivo de valor e vencimento estarem em leitura; valor mudado = o total novo da compra, ANTES de salvar. */}
            {/* FIN-CONCILIADO-NAO-REBAIXA-01 — o lançamento casado com o extrato diz AQUI por que status, pagamento, valor e
                conta estão em leitura (uma linha, altura do rodapé; os campos não mudam de tamanho nem de lugar). */}
            {casadoComExtrato && (
              <span className="min-w-0 truncate whitespace-nowrap text-[10px] leading-tight text-amber-700 dark:text-amber-400"
                title={FRASE_CASADO_COM_EXTRATO} data-testid="casado-com-extrato">
                {FRASE_CASADO_COM_EXTRATO}
              </span>
            )}
            {edicaoParcela && (edicaoParcela.paga || edicaoParcela.frase) && (
              <span className="min-w-0 truncate whitespace-nowrap text-[10px] leading-tight text-amber-700 dark:text-amber-400"
                title={edicaoParcela.paga ? MOTIVO_PARCELA_PAGA : (edicaoParcela.frase ?? undefined)} data-testid="parcela-do-contrato"
                data-estado={edicaoParcela.paga ? 'paga' : 'total-novo'}>
                {edicaoParcela.paga ? MOTIVO_PARCELA_PAGA : edicaoParcela.frase}
              </span>
            )}
            {partesValorDoMes && (
              <span className="flex min-w-0 items-baseline gap-1 whitespace-nowrap text-[10px] leading-tight text-amber-700 dark:text-amber-400"
                title={tituloDasPartes(partesValorDoMes)} data-testid="valor-do-mes" data-estado={marcaGravada ? 'marcada' : 'intencao'}>
                <span className="min-w-0 truncate">{partesValorDoMes.antes}</span>
                <span className="shrink-0 tabular-nums">{partesValorDoMes.numero}</span>
                {partesValorDoMes.depois && <span className="min-w-0 truncate">{partesValorDoMes.depois}</span>}
              </span>
            )}
            {marcaGravada && (
              <GestoDeOperacao podeAlterar={!motivoVoltarAoPrevisto && !saving} motivo={motivoVoltarAoPrevisto ?? 'Salvando…'}
                onClick={() => setConfirmandoVoltar(true)} testId="acao-voltar-ao-previsto">
                Voltar ao previsto
              </GestoDeOperacao>
            )}
            <div className="flex-1" />
            {/* ⚠ O BOTÃO SOME QUANDO O BANCO RECUSARIA — PR-CPR-2A.4. Lançamento de origem
                zootécnica já realizado, agendado ou conciliado é barrado pelo trigger
                `guard_zoo_financeiro_cancelamento_realizado` com P0001. Oferecer o botão para
                depois mostrar um erro é fazer o operador descobrir a regra errando; no lugar
                dele vai a frase que diz por onde se faz.
                ⚠ E O ESPELHO NÃO É O CONTROLE: a RPC continua sendo a autoridade, e se a
                corrida acontecer o erro dela aparece no toast do chamador. */}
            {isEdit && vinculoDisponivel && lancamento && clienteAtual?.id && (
              <GestoDeOperacao podeAlterar={podeAlterarOperacao} motivo={MOTIVO_SEM_ACESSO_VINCULAR}
                onClick={() => setVincularAberto(true)} testId="acao-vincular-oc">
                <Link2 className="h-3 w-3" /> Vincular à operação
              </GestoDeOperacao>
            )}
            {/* FIN-FINANC-28 passo 6 — o lançamento e o financiamento: onde ele está (abre o contrato; o contrário quando se desfaz
                por aqui) ou "Financiamento" (vincular como parcela, liberação ou encargo). Título de OC fica fora (é da operação). */}
            {isEdit && lancamento && clienteAtual?.id && !lancamento.cancelado && parteOCLida && !parteOCViva && (
              <FinanciamentoDoLancamento lancamentoId={lancamento.id} clienteId={clienteAtual.id} parcelaDaCompra={parcelaDaCompra}
                onAbrirContrato={onAbrirContrato ? (finId) => { onClose(); onAbrirContrato(finId); } : undefined} />
            )}
            {/* FIN-V2-HOMOLOG-FIX-01 (item 2): "Criar OC a partir deste lançamento" tambem aqui, ao lado do Vincular — a MESMA
                regra da lista (`podeCriarOCDoLegado`) e o MESMO dialogo. */}
            {isEdit && lancamento && clienteAtual?.id && parteOCLida && podeAbrirOC && podeCriarOCDoLegado(lancamento, !!parteOCViva) && (
              <Button
                variant="outline"
                size="sm"
                className="h-[22px] px-[9px] text-[10px] gap-1"
                onClick={() => setCriarOCAberto(true)}
                data-testid="acao-criar-oc-legado"
              >
                <FilePlus2 className="h-3 w-3" /> Criar OC a partir deste lançamento
              </Button>
            )}
            {/* OC-DESVINCULAR-01 — o inverso, SO' com parte VIVA de OC (a mesma leitura do rodape
                de cancelamento). O lancamento fica; sai a ligacao. */}
            {isEdit && lancamento && clienteAtual?.id && parteOCViva
              && podeOferecerDesvinculo({ lancamentoId: lancamento.id, cancelado: lancamento.cancelado, temParteViva: true }) && (
              <GestoDeOperacao podeAlterar={podeAlterarOperacao} motivo={MOTIVO_SEM_ACESSO_DESVINCULAR}
                onClick={() => setDesvincularAberto(true)} testId="acao-desvincular-oc">
                <Unlink className="h-3 w-3" /> Desvincular da operação
              </GestoDeOperacao>
            )}
            {isEdit && onDelete && lancamento && (
              <RodapeCancelamento
                tituloOC={parteOCViva}
                bloqueioRebanho={bloqueiaCancelamentoPeloFinanceiro(lancamento)}
                onCancelar={() => { void abrirCancelamento(); }}
                onAbrirOC={podeAbrirOC ? (opId, tipo) => {
                  if (onAbrirOperacaoOC) onAbrirOperacaoOC(opId, tipo);
                  else window.location.assign(`/v2?oc_id=${encodeURIComponent(opId)}`);
                } : undefined}
              />
            )}
            {/* FIN-NFE-PARCELAS-01 — depois do salvar, com documento que nao gravou: a frase ao lado do botao
                (UX-TOAST-01) e o "Tentar de novo" no lugar do salvar, que criaria OUTRO lancamento. */}
            {/* PARC-LIVRES-01 — por que o Salvar está apagado nas parcelas livres: o motivo escrito ao lado dele. */}
            {/* MODO OC — o que a simulacao do banco disse: acima do saldo AVISA em ambar (nao bloqueia); recusa, em vermelho. */}
            {modoOC && !posSalvar && !erroAntesDeSalvar && !motivoDasParcelas && simOC?.aviso && (
              <span className="max-w-[520px] truncate text-[10px] leading-tight text-amber-700 dark:text-amber-400" title={simOC.aviso} data-testid="aviso-acima-do-saldo">
                {simOC.aviso}
              </span>
            )}
            {modoOC && !posSalvar && !erroAntesDeSalvar && !motivoDasParcelas && simOC?.erro && (
              <span className="max-w-[520px] truncate text-[10px] leading-tight text-destructive" title={simOC.erro} data-testid="recusa-da-simulacao">
                {simOC.erro}
              </span>
            )}
            {!posSalvar && !erroAntesDeSalvar && motivoDasParcelas && (
              <span className="max-w-[520px] truncate text-[10px] leading-tight text-destructive" title={motivoDasParcelas} data-testid="motivo-das-parcelas">
                {motivoDasParcelas}
              </span>
            )}
            {!posSalvar && erroAntesDeSalvar && (
              <span className="max-w-[520px] text-[10px] leading-tight text-destructive" data-testid="erro-antes-de-salvar">
                {erroAntesDeSalvar}
              </span>
            )}
            {posSalvar ? (
              <>
                <span className="max-w-[520px] text-[10px] leading-tight text-destructive" data-testid="erro-documentos">
                  {posSalvar.erro}
                </span>
                {posSalvar.alvo && (
                  <Button onClick={tentarDeNovo} disabled={gravandoDocs} data-testid="tentar-de-novo"
                    className="h-[22px] px-[9px] text-[10px] font-semibold">
                    {gravandoDocs ? 'Gravando…' : 'Tentar de novo'}
                  </Button>
                )}
                <Button variant="outline" onClick={onClose} className="h-[22px] px-[9px] text-[10px]">Fechar</Button>
              </>
            ) : (
              <Button tabIndex={17} onClick={() => handleSubmit()} disabled={saving || gravandoDocs || !canSave} className="h-[22px] px-[9px] text-[10px] font-semibold shadow-md shadow-primary/25 ring-1 ring-primary/20">
                {gravandoDocs ? 'Gravando documentos…' : getSubmitLabel()}
              </Button>
            )}
          </div>

          {/* PR-FIN-MODAL-02H — Painel lateral de RESUMO (fluxo normal, sem Contexto Excel).
              Coluna DIREITA do grid (col 2), fazendo SPAN das linhas 2-3 → ocupa toda a altura
              da coluna, do topo (faixa de título alinhada às tabs) até o rodapé. Read-only,
              espelha o formulário em tempo real. Sem rolagem própria, sem acordeão, sem "ver mais".
              Nenhuma lógica/estado/validação — só apresentação. */}
          {!excelContext && (
            /* MODAIS-PADRAO-01e — as pecas do Abate (`ui/linha-resumo`): 240px, so' a linha do corpo (o
               rodape voltou a' largura inteira), pares pelo `LinhaResumo`. Mesmo texto, mesmos valores.
               UI-MODAL-BLOCOS-01 · LANCAMENTO COMPACTO — `formato="pares"`: titulos em sentence case 11px/600, faixa de 18px,
               linhas de 16px, rotulo na largura do maior e o valor colado (sem caixa alta). */
            <div className="col-start-2 row-start-2 min-h-0 max-[899px]:hidden">
              <AsideResumo formato="pares" faixa={<FaixaTituloResumo titulo="Resumo do lançamento" />}>
                <SecaoResumo titulo="Identificação" />
                <div className="contents">
                  <LinhaResumo rotulo="Tipo" valor={resumoTipoLabel} cor={resumoTipoCor} />
                  {/* UI-TEXTO-LONGO-01 — a descrição NÃO se repete no resumo (ela já está no campo Produto / descrição): uma
                      descrição de 300 caracteres crescia 15 linhas e empurrava a Classificação para fora. Só dados curtos. */}
                  <LinhaResumo rotulo="Data competência" valor={resumoFmtData(dataCompetencia)} />
                  <LinhaResumo rotulo="Favorecido" valor={resumoFavorecido} quebra />
                  <LinhaResumo rotulo="Fazenda" valor={resumoFazenda} quebra />
                </div>

                <SecaoResumo titulo="Financeiro" />
                <div className="contents">
                  <LinhaResumo rotulo="Valor" valor={valorNum > 0 ? formatMoeda(valorNum) : null} />
                  {!isEntrada && <LinhaResumo rotulo="Conta origem" valor={resumoContaOrigem} quebra />}
                  {(isEntrada || isTransferencia) && <LinhaResumo rotulo="Conta destino" valor={resumoContaDestino} quebra />}
                </div>

                <SecaoResumo titulo="Classificação" />
                <div className="contents">
                  <LinhaResumo rotulo="Safra" valor={resumoSafra} quebra />
                  <LinhaResumo rotulo="Centro" valor={centroCusto} quebra />
                  <LinhaResumo rotulo="Subcentro" valor={subcentro} quebra />
                </div>

                {/* FIN-RESUMO-PAGAMENTO-01 — o status mora AQUI (saiu de "Financeiro": uma informação, um lugar), com a cor da
                    paleta, e o vencimento aparece: previsto/programado/agendado não têm data de pagamento, e o resumo não dizia
                    quando o lançamento sai do banco. */}
                <SecaoResumo titulo="Pagamento" />
                <div className="contents" data-testid="resumo-pagamento">
                  <LinhaResumo rotulo="Status" valor={resumoStatusLabel} cor={resumoStatusCor} />
                  <LinhaResumo rotulo="Vencimento" valor={resumoFmtData(dataVencimento)} />
                  <LinhaResumo rotulo="Pagamento" valor={resumoFmtData(pagamentoMostrado)} />
                  <LinhaResumo rotulo="Forma" valor={formaPgto} quebra />
                  <LinhaResumo rotulo="Modalidade" valor={!isEdit ? (formaPagamentoParc === 'parcelada' ? 'Parcelada' : 'À vista') : null} />
                  <LinhaResumo rotulo="Nº de parcelas" valor={!isEdit && formaPagamentoParc === 'parcelada' ? `${numParcelas}` : null} />
                </div>

                <SecaoResumo titulo="Documento" />
                <div className="contents">
                  <LinhaResumo rotulo="Tipo" valor={tipoDocumento || (docDoLancamento.origem === 'nota' ? 'Nota Fiscal · da compra' : docDoLancamento.origem === 'documento' ? 'Documento ligado' : null)} quebra />
                  <LinhaResumo rotulo="Número" valor={notaFiscalDisplay || (docVemDeDocumento ? docDoLancamento.rotulo : null)} quebra />
                </div>
              </AsideResumo>
            </div>
          )}
          </fieldset>
        </DialogContent>
      </Dialog>

      {/* PR 2b — "Anexar vários boletos" (tela B do mock). Antes de salvar, as parcelas são a prévia e os
          boletos viram pendentes; depois, as irmãs gravadas e os boletos vão direto. */}
      {anexarBoletos === 'previa' && (
        <AnexarBoletosDialog
          subtitulo={`${numParcelas} parcelas`}
          parcelas={parcelaRows.map(r => ({
            numero: r.numero, vencimento: r.dataVencimento, valor: r.valor,
            temBoleto: pendentes.some(p => p.parcela === r.numero),
          }))}
          onConfirmar={guardarBoletosDaPrevia}
          onFechar={() => setAnexarBoletos(null)} />
      )}
      {anexarBoletos === 'irmas' && irmas && (
        <AnexarBoletosDialog
          subtitulo={`${irmas.length} parcelas`}
          parcelas={irmas.filter(i => !i.cancelada).map(i => ({ numero: i.numero, vencimento: i.vencimento, valor: i.valor, temBoleto: i.temBoleto }))}
          onConfirmar={gravarBoletosNasIrmas}
          onFechar={() => setAnexarBoletos(null)} />
      )}

      {/* REC-VALOR-DO-MES-MODAL-01 — o gesto contrário da marca. Diz os dois valores e o que acontece; quem grava é o salvar
          de sempre (`handleSubmit`), com o previsto no lugar do valor e do vencimento e a marca limpa. */}
      <AlertDialog open={confirmandoVoltar && !!previstoRec} onOpenChange={(o) => { if (!o) setConfirmandoVoltar(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar ao previsto?</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-snug" data-testid="confirmar-voltar-ao-previsto">
              {previstoRec && (
                <>
                  O valor volta de <strong>{formatMoeda(Math.abs(lancamento?.valor ?? 0))}</strong> para{' '}
                  <strong>{formatMoeda(previstoRec.valor)}</strong> e o vencimento de{' '}
                  <strong>{resumoFmtData(lancamento?.data_vencimento ?? '') ?? '—'}</strong> para{' '}
                  <strong>{resumoFmtData(previstoRec.vencimento)}</strong>, o que a recorrência prevê. A marca de valor do mês
                  sai, o Propagar volta a alterar esta conta, e o lançamento é salvo com o que está na tela.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (previstoRec) { setConfirmandoVoltar(false); void handleSubmit(previstoRec); } }}
              data-testid="confirmar-voltar-ao-previsto-ok">
              Voltar ao previsto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── CONFIRMAÇÃO DO CANCELAMENTO — PR-CPR-2A.4 ──
          ⚠ `AlertDialog`, E NÃO O `confirm()` NATIVO que estava aqui. O nativo abre o modal do
          SISTEMA OPERACIONAL — outro idioma visual, outra fonte em cada máquina —, não cabe um
          campo de motivo dentro dele e é a mesma família do `<select>` cru que o
          `check:ui-nativo` persegue. O `AlertDialog` é o padrão da casa: 37 arquivos o usam
          contra 9 que ainda chamam `confirm()`, e este era um dos nove.
          ⚠ O TEXTO RESPONDE À DÚVIDA DO CLIQUE: "cancelar" sugere apagar, e o operador precisa
          saber que o registro continua existindo — senão hesita, ou pior, cancela achando que
          limpa. É a mesma redação do cancelamento de recorrência. */}
      <AlertDialog
        open={confirmandoCancelamento}
        onOpenChange={(o) => { if (!o && !cancelando) setConfirmandoCancelamento(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este lançamento?</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px] leading-snug">
              Ele <b>sai da lista</b> mas <b>fica na auditoria</b>, com quem cancelou, quando e
              por quê. Se estiver conciliado, a conciliação daquele mês <b>reabre</b>.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* ⚠ O MOTIVO É PEDIDO, NÃO DEDUZIDO. A RPC tem `p_motivo` com default
              `'duplicado_auditoria'` — mandar vazio grava esse motivo em TODO cancelamento,
              inclusive nos que não são duplicidade nenhuma, e a auditoria passa a mentir com
              cara de preenchida. O campo nasce vazio e o botão só libera com texto. */}
          <div className="space-y-1">
            <Label htmlFor="motivo-cancelamento" className="text-[11px]">
              Motivo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="motivo-cancelamento"
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
              placeholder="Ex.: lançado em duplicidade; valor errado; não vai acontecer"
              className="h-8 text-[11px]"
              autoFocus
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando || !motivoCancelamento.trim()}
              /* O motivo em branco desabilita, e o porquê fica escrito ao lado — regra da casa:
                 botão desabilitado diz por quê. */
              title={motivoCancelamento.trim() ? undefined : 'Escreva o motivo para continuar'}
              onClick={async (e) => {
                /* ⚠ `preventDefault`: o `AlertDialogAction` fecha o diálogo por padrão ao
                   clicar, e fechá-lo antes da RPC responder faria o erro voltar para uma tela
                   que já não existe. Quem fecha é o resultado. */
                e.preventDefault();
                if (!onDelete || !lancamento) return;
                setCancelando(true);
                try {
                  const ok = await onDelete(lancamento.id, motivoCancelamento.trim());
                  if (ok) { setConfirmandoCancelamento(false); onClose(); }
                } finally {
                  setCancelando(false);
                }
              }}
            >
              {cancelando ? 'Cancelando…' : 'Cancelar lançamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PARC-CADEIA-01 — parcela de compra parcelada: o cancelamento é o do contrato (uma gravação, no banco). */}
      {parcelaACancelar && lancamento?.id && clienteAtual?.id && (
        <CancelarParcelaDialog
          clienteId={clienteAtual.id}
          alvo={{ lancamentoId: lancamento.id }}
          previa={parcelaACancelar}
          aoVoltar={() => setParcelaACancelar(null)}
          aoGravar={() => { setParcelaACancelar(null); onClose(); }}
          aoAbrirContrato={onAbrirContrato ? (finId) => { setParcelaACancelar(null); onClose(); onAbrirContrato(finId); } : undefined}
        />
      )}

      {/* CONC-SPLIT-FILHO-CANCELADO-01 — filho de desmembramento: não se cancela sozinho; desfaz-se o desmembramento inteiro. */}
      {splitACancelar && lancamento?.id && clienteAtual?.id && (
        <CancelarFilhoDeSplitDialog
          clienteId={clienteAtual.id}
          split={splitACancelar}
          aoVoltar={() => setSplitACancelar(null)}
          aoDesfazer={() => { setSplitACancelar(null); onClose(); }}
        />
      )}

      {/* VINCULAR-LANC-OC-01 — por cima do detalhe; vinculado, fecha os dois (a lista ja' foi avisada). */}
      {vincularAberto && lancamento?.id && clienteAtual?.id && (
        <VincularOperacaoDialog
          open
          lancamentoId={lancamento.id}
          clienteId={clienteAtual.id}
          onClose={() => setVincularAberto(false)}
          onVinculado={onClose}
        />
      )}
      {/* FIN-V2-HOMOLOG-FIX-01 — por cima do detalhe; criada, avisa a lista, fecha os dois e abre a OC (como a lista faz). */}
      {criarOCAberto && lancamento?.id && clienteAtual?.id && (
        <CriarOCDoLegadoDialog
          clienteId={clienteAtual.id}
          lancamentoId={lancamento.id}
          fornecedores={fornecedores}
          onFechar={() => setCriarOCAberto(false)}
          onCriada={(operacaoId, tipo) => {
            setCriarOCAberto(false);
            notificarLancamentosMudaram(clienteAtual.id);
            onClose();
            onAbrirOperacaoOC?.(operacaoId, tipo);
          }}
        />
      )}
      {/* OC-DESVINCULAR-01 — por cima do detalhe; desvinculado, fecha os dois (a lista ja' foi avisada). */}
      {desvincularAberto && lancamento?.id && clienteAtual?.id && parteOCViva && (
        <DesvincularOperacaoDialog
          open
          lancamentoId={lancamento.id}
          operacaoId={parteOCViva.operacaoId}
          clienteId={clienteAtual.id}
          onClose={() => setDesvincularAberto(false)}
          onDesvinculado={onClose}
        />
      )}

      {/* FASE 1 zoo-fin: modal soberano zoo aberto após V2Dialog fechar. */}
      {zooModalId && (
        <LancamentoZooModal
          open
          onOpenChange={(o) => { if (!o) setZooModalId(null); }}
          lancamentoId={zooModalId}
          /* A porta do aviso de operacao comercial — B-17 item 2. Os QUATRO mounts do
             modal precisam dela: o B-16 ligou um so', e quem chegasse pelos outros via o
             aviso sem saida. Botao ausente e' pior que aviso ausente — ele diz "va la'" e
             nao diz por onde. */
          onAbrirOperacao={!podeAbrirOC ? undefined : (ocId, tipo) => {
            setZooModalId(null);
            /* ⚠ `oc_return` LEVA A ORIGEM — B-17 adendo. `window.location.assign` RECARREGA a
               pagina, e a `section` do /v2 e' estado interno que NAO vive na URL: sem este
               parametro o fechar da OC cairia na Central, largando o operador no resumo em
               vez da lista de onde saiu. O V2Index espelha a section em
               `sessionStorage['v2:section']` justamente para atravessar o reload. Vazio
               (aba nova, storage bloqueado) = sem parametro = Central, como hoje. */
            const origem = (() => { try { return sessionStorage.getItem('v2:section') ?? ''; } catch { return ''; } })();
            window.location.assign(`/v2?${tipo === 'venda' ? 'oc_venda' : tipo === 'abate' ? 'oc_abate' : 'oc_compra'}=1&oc_id=${ocId}&oc_aba=negociacao${origem ? `&oc_return=${origem}` : ''}`);
          }}
          onAbrirNoFormPrincipal={(lanc) => {
            // PR-E — redirect tático: navega ao V2Index com edit=<id>&tipo=<venda|abate>
            // para abrir o form principal da aba "Lançamentos" com o registro carregado.
            setZooModalId(null);
            navigate(`/v2?section=lancamentos-zoot&edit=${lanc.id}&tipo=${lanc.tipo}`);
          }}
          onAbrirFinanceiroVinculado={(ano: string, mes: number) => {
            // PR-VENDA-V2-2C-NAVEGAR-FIX-BUG1: navega ao Financeiro filtrado por
            // ano/mês do lançamento vinculado. Read-only. V2Index lê fano/fmes.
            setZooModalId(null);
            navigate(`/v2?section=financeiro-lanc&fano=${ano}&fmes=${mes}`);
          }}
        />
      )}

      {/* O cadastro do fornecedor, aberto pelo bloco "Dados para pagamento" (editar cadastro / + Cadastrar Pix). */}
      {clienteAtual && fornecedorDoPgto && (
        <FornecedorFormDialog
          open={cadastroPgtoAberto}
          onClose={() => setCadastroPgtoAberto(false)}
          editing={fornecedorDoPgto}
          allFornecedores={fornecedores}
          fazendas={fazendas}
          clienteId={clienteAtual.id}
          onSaved={() => { void relerFornecedorDoPgto(fornecedorDoPgto.id); }}
        />
      )}

      <NovoFornecedorDialog
        open={fornecedorDialogOpen}
        onClose={() => setFornecedorDialogOpen(false)}
        clienteId={clienteAtual?.id ?? null}
        onSelecionar={(f) => setFavorecidoId(f.id)}
        onSave={async (nome, cpfCnpj) => {
          if (!fazendaId) {
            toast.error('Selecione uma fazenda antes de cadastrar o fornecedor.');
            return;
          }
          const f = await onCriarFornecedor(nome, fazendaId, cpfCnpj);
          if (f) handleFornecedorCriado(f);
        }}
      />
      {/* FIN-CLASSIF-DIVIDIDA-01b — dividir a mao; o motivo de dividir pelos itens, voltar para 1 conta e desfazer */}
      {dividirAberto && lancamento && clienteAtual?.id && (
        <DividirClassificacaoDialog clienteId={clienteAtual.id} classificacoes={classificacoesDoModal}
          lancamento={{ id: lancamento.id, valor: Number(lancamento.valor), tipo_operacao: tipoOperacao, financiamento_id: financiamentoDoLanc, plano_conta_id: classificacao.plano_conta_id ?? null }}
          partesDeHoje={lancDividido && divisao ? divisao.partes : []}
          onDividido={() => { void aposDividir(financiamentoDoLanc ? 'Dividido: todas as parcelas receberam a mesma proporção.' : 'Classificação dividida.', !financiamentoDoLanc); }}
          onClose={() => setDividirAberto(false)} />
      )}
      {motivoDaDivisao && (
        <MotivoDaDivisaoDialog
          titulo={motivoDaDivisao.tipo === 'itens' ? 'Dividir pelos itens da nota' : motivoDaDivisao.tipo === 'voltar' ? 'Voltar para 1 conta' : 'Desfazer a última divisão'}
          explicacao={motivoDaDivisao.tipo === 'itens'
            ? (financiamentoDoLanc ? 'Compra parcelada: a divisão é do cadastro — todas as parcelas recebem a mesma proporção dos itens.' : 'Cada conta recebe a soma dos seus itens. Continua um lançamento só: um pagamento, uma conciliação.')
            : financiamentoDoLanc
              /* P72 — a parcela: o aviso diz que vale para as N parcelas da compra */
              ? `Vale para ${asParcelasDaCompra} desta compra (o cadastro): ${motivoDaDivisao.tipo === 'voltar'
                ? 'todas voltam inteiras para a maior parte.' : 'todas voltam ao que eram antes da última operação do cadastro.'}`
              : motivoDaDivisao.tipo === 'voltar' ? 'O lançamento volta inteiro para a maior parte; depois a conta pode ser trocada no campo.'
                : 'Volta a classificação ao que era antes da última operação.'}
          botao={motivoDaDivisao.tipo === 'itens' ? 'Dividir' : motivoDaDivisao.tipo === 'voltar' ? 'Voltar para 1 conta' : 'Desfazer'}
          simular={simularDivisao} confirmar={confirmarDivisao} onClose={() => setMotivoDaDivisao(null)} />
      )}
      {xml && xmlComparar && (
        <CompararCadastroDialog hoje={xmlComparar} rotuloOrigem="Da nota"
          proposta={propostaDoEmitente(xml.emitente ?? { documento: xml.emitenteDocumento, nome: xml.emitenteNome, fantasia: null, ie: null })}
          emitente={{ documento: xml.emitenteDocumento, nomes: [xml.emitenteNome, xml.emitente?.fantasia] }}
          onConfirmar={gravarComparacaoDoXml} onClose={() => setXmlComparar(null)}
          onEscolherOutro={() => {
            setXmlComparar(null); setXmlFaixaFechada(true);
            document.getElementById('campo-fornecedor-financeiro')?.querySelector('button')?.focus();
          }} />
      )}
    </>
  );
}
