/**
 * "NOVO LANCAMENTO · DA NOTA FISCAL" — FIN-NOTA-PDF-01, o mock aprovado pelo Gabriel (claude.ai/artifact/ANnN6PwtPMZEgfkm5kphNq).
 * O PDF a' esquerda, com o que foi lido em amarelo; a' direita, em blocos, Nota · Fornecedor · Parcelas · Itens · Lancamento; o
 * rodape FIXO diz o que falta e cria as N parcelas com o PDF anexado a todas como a NF. MODAL FIXO, SEM ROLAGEM.
 *
 * ⚠ NADA E' LIDO AQUI: a nota chega pronta (`lerNota` -> `proporLancamento` -> `resolverEmitente`, o caminho do XML). Aqui so' se
 *   escolhe o que a nota nao diz (subcentro, conta) e se grava pelo gravador de sempre (`criarDaNota.ts`).
 * ⚠ NUNCA ADIVINHA: subcentro e' escolha do operador ou a sugestao de sempre (o ultimo lancamento classificado do fornecedor).
 * ⚠ BARRA, NAO AVISA: chave que nao confere com o lido (campo vermelho) e nota ja' registrada no cliente (com o link) nao criam nada.
 * FIN-NOTA-PDF-01b — o que ficou fora do 01, NO MESMO MODAL: subcentro de lavoura pede Safra e Cultura (a sugestao de sempre do
 *   fornecedor, ou a safra pela data como no Novo lancamento; Cultura sem resposta ate' o operador escolher — "Todas (rateia)" e' uma
 *   resposta); nota de uma parcela (ou sem duplicata) cria UM lancamento ("Criar lancamento", vencimento editavel; sem duplicata =
 *   emissao, em ambar); lancamento a' vista existente + nota parcelada = "Atualizar e parcelar" (o existente vira 1/N, o pago nunca muda
 *   de valor: a diferenca aparece em R$ e o operador decide). NADA ESCOLHIDO AQUI SE PERDE: "Abrir no Novo lancamento" leva tudo
 *   (`prefillDoModal`).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BLOCO_FORMULARIO, REGUA_ROTULO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { EscolherConta } from '@/components/shared/EscolherConta';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { PreviaDaNota } from './PreviaDaNota';
import {
  anexarAosJaLancados, atualizarComANota, atualizarEParcelar, criarLancamentoDaNota, criarParcelasDaNota, decisaoDoExistente, formDaNota, GRAVADORES, parcelasDaNota,
  prefillDoModal, type EscolhasDaNota, type Gravadores,
} from './criarDaNota';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { ROTULO_PELA_CHAVE, comDadosDigitados } from '@/lib/financeiro/nfe/chaveDigitada';
import { CULTURAS_LANCAMENTO, SEM_CULTURA } from '@/lib/agri/rateioLancamento';
import { useSafraDaCompetencia } from '@/hooks/useSafraDaCompetencia';
import { ATIVIDADES } from '@/lib/financeiro/ultimaAtividade';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { useLarguraDaJanela } from '@/hooks/useLarguraDaJanela';
import { GradeDeParcelas, type ModoDasParcelas } from '@/components/financiamentos/GradeDeParcelas';
import { motivoNaoSalva, parcelasDoMensal, type ParcelaLivre } from '@/lib/financiamentos/parcelasLivres';
import {
  FRASE_NOTA_SEM_DUPLICATAS, MAX_PARCELAS_DO_CARTAO, MIN_PARCELAS_DO_CARTAO, comPagamento, comoAbre, diaMaisFrequente, fraseDoRodapeDoCartao,
  parcelasDoCartao, primeiraFatura, rotuloDaSugestao, type ComoFoiPago,
} from '@/lib/financeiro/pagamentoNoCartao';
import { diasDoCartao } from '@/lib/financeiro/diasDoCartao';
import type { ParcelaDoPayload } from '@/lib/financiamentos/montarPayloadParcelamento';
import { gravarParcelamento } from './LancamentoV2Dialog';
import { ondeEsta } from './LancamentoDoXml';
import type { DoXml } from '@/lib/financeiro/nfePrefill';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { gravarItensSemTravar } from '@/lib/financeiro/itensDaNotaBanco';
import { canceladosDaNota, casarJaLancados, contaUnicaDasIrmas, fracaoDaDescricao, fraseDoAchado, linhasSistemaNota, nDasParcelas, parcelasParaCasar,
  parcelasQueFaltamNoCartao, posicoesNoCartao, TEXTO_DA_SITUACAO, type LancamentoJaLancado,
  type LinhaSistemaNota, type SituacaoNaTabela } from '@/lib/financeiro/nfe/jaLancada';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Lock } from 'lucide-react';
import { ItensDaNota } from './ItensDaNota';
import { ContasDosItens } from './ContasDosItens';
import { VisualizadorDeDocumento } from './VisualizadorDeDocumento';
import { useItensDaNotaDaTela } from '@/hooks/useItensDaNota';
import { dividir, dividirPelosItens, percentuaisDosItens, porContaDosItens } from '@/lib/financeiro/divisaoDaClassificacao';
import type { EstadoDaPrevia } from './PreviaCompletar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CompararCadastroDialog } from './CompararCadastroDialog';
import { PreviaCompletar } from './PreviaCompletar';
import { baseDaDescricao, descricaoSemInformacao, type AlvoDaPrevia } from '@/lib/financeiro/nfe/notaCompletar';
import { GravarIeDaFazendaDialog } from './GravarIeDaFazendaDialog';
import { propostaDoEmitente, type CadastroParaComparar } from '@/lib/fornecedores/compararCadastro';
import { lerNota, type NotaDoArquivo } from '@/lib/financeiro/nfe/lerNota';
import { ehSerieAvulsa, type CampoConferido, type CampoDaMarca } from '@/lib/financeiro/nfe/danfe';
import { fraseDaRemessa } from '@/lib/financeiro/nfe/remessaEntregaFutura';
import { ORIGEM_FAZENDA_PELO_ENDERECO } from '@/lib/financeiro/nfe/proporLancamento';
import type { EmitenteNFe, NotaLida } from '@/lib/financeiro/nfe/tipos';
import { dataCurta, documentoFormatado, numeroDaNota, numeroFalado, reais, soDigitos } from '@/lib/financeiro/nfe/formatos';
import { formatNFNumber } from '@/lib/financeiro/documentoHelper';
import {
  camposQueOEmitenteCompleta, completarCadastroPeloXml, desfazerIeDaFazenda, fornecedorPeloDocumento, iePorFazenda, inscreverEmFazendas, lancamentosAbertosComValor,
  atualizarCamposDoCadastro, cadastroParaComparar, desfazerCamposDoCadastro, notaJaLancada, usoDoFornecedor, type CadastroComODocumento,
  type LancamentoAbertoDaNota, type OcorrenciaDaNota, completarComANota, registrarNaOperacao, desfazerCompletar, cancelarCriados, comoEstaoHoje, type ComoEstaHoje, type Consulta } from '@/lib/financeiro/nfeConsultas';
import { caixaDeTitulo, consultarCnpj, type DadosDoCnpj } from '@/lib/fornecedores/consultaCnpj';
import type { CampoDoEmitente } from '@/lib/fornecedores/cadastroDoFornecedor';
import type { ClassificacaoItem, ContaBancariaV2, FornecedorV2, LancamentoV2Form, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import {
  fraseDaNfDigitada, GRAVADORES_DA_JUNCAO, juncaoDaNota, nfDigitadaDivergente, usarANotaLida,
  type DocumentoDaParcela, type GravadoresDaJuncao,
} from '@/lib/financeiro/juntarParcelas';

export type NotaLidaOk = Extract<NotaDoArquivo, { ok: true }>;

/** 'YYYY-MM-DD' -> 'dd/mm/aaaa' (a data sempre inteira). */
export const dataInteira = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
/** "2.0000" -> "2"; "1.5000" -> "1,5". */
export const quantidadeCurta = (q: string) => (q.includes('.') ? q.replace(/\.?0+$/, '').replace('.', ',') : q);

/** O que a chave contradiz -> as marcas do PDF que ficam vermelhas e os campos da direita. */
const MARCA_DO_CONFERIDO: Record<CampoConferido, CampoDaMarca[]> = {
  cnpj: ['emitente_cnpj'], numero: ['numero'], serie: ['serie'], mes: ['emissao'], modelo: ['chave'], digito: ['chave'],
};
const NOME_DO_CONFERIDO: Record<CampoConferido, string> = { cnpj: 'CNPJ', numero: 'nº', serie: 'série', mes: 'mês', modelo: 'modelo', digito: 'dígito da chave' };
/* NOTA-AVULSA-890-01 — a avulsa (serie 890–899) tem na chave o CNPJ do orgao emissor: o selo diz que o CNPJ nao foi comparado */
export const fraseDaChave = (d: readonly CampoConferido[], avulsa = false) => (d.length === 0
  ? (avulsa ? 'chave confere: nº, série e mês · nota avulsa' : 'chave confere: CNPJ, nº, série e mês')
  : `chave não confere: ${d.map((x) => NOME_DO_CONFERIDO[x]).join(', ')}`);

const ROTULO_DO_CAMPO: Partial<Record<CampoDoEmitente, string>> = {
  inscricao_estadual: 'IE', logradouro: 'endereço', numero: 'endereço', bairro: 'endereço', cep: 'endereço', municipio: 'cidade', uf: 'cidade',
  telefone: 'telefone', nome_fantasia: 'fantasia',
};
/** "IE, endereço e cidade" — os campos que a nota completa no cadastro (sem repetir; `tipo_pessoa` nao se fala). */
export function fraseDoCompletar(campos: readonly CampoDoEmitente[]): string {
  const nomes = [...new Set(campos.map((c) => ROTULO_DO_CAMPO[c]).filter((x): x is string => !!x))];
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? '');
}

/** O emitente da nota com o endereco da Receita quando ela respondeu (o DANFE escreve em caixa alta e abrevia). */
export function emitenteComReceita(e: EmitenteNFe, r: DadosDoCnpj | null): EmitenteNFe {
  if (!r) return e;
  const end = e.endereco;
  return {
    ...e,
    fantasia: e.fantasia || r.fantasia || null,
    endereco: {
      logradouro: r.logradouro || end?.logradouro || null, numero: r.numero || end?.numero || null, complemento: r.complemento || end?.complemento || null,
      bairro: r.bairro || end?.bairro || null, municipio: r.municipio || end?.municipio || null, uf: r.uf || end?.uf || null,
      cep: soDigitos(r.cep) || end?.cep || null, telefone: end?.telefone ?? null,
    },
  };
}

const CHIP = 'inline-flex h-[15px] items-center whitespace-nowrap rounded-full px-1.5 text-[9.5px] font-medium leading-none';
const CHIP_OK = `${CHIP} bg-[#e5f4ea] text-[#1f7a45]`;
const CHIP_AVISO = `${CHIP} bg-amber-50 text-amber-800`;
const CHIP_ERRO = `${CHIP} bg-red-50 text-red-700`;
/* NOTA-CONTAS-NA-CRIACAO-01 D — o cancelado: cinza, sem cor de aviso (nao conta) */
const CHIP_CANCELADO = `${CHIP} bg-muted text-muted-foreground`;
/* P128a — a situacao de cada linha da tabela sistema x nota */
/** P128a — um dos três caminhos da nota que já está no sistema (o que faz e o que NÃO muda, como no mock) */
interface CaminhoDaNota { id: 'completar' | 'atualizar' | 'criar'; titulo: string; recomendado: boolean; perigo: boolean; faz: string; naoMuda: string }
const CHIP_DA_SITUACAO: Record<SituacaoNaTabela, string> = {
  conciliada: CHIP_OK, realizada: CHIP_OK, programada: `${CHIP} bg-blue-50 text-blue-800`, so_na_nota: CHIP_AVISO, so_no_sistema: CHIP_ERRO,
};
const TH = 'h-[19px] px-1.5 text-left text-[9.5px] font-medium text-primary-foreground truncate';
const TD = 'h-[19px] px-1.5 text-[10px] leading-none truncate';
const TDN = 'h-[19px] px-1.5 text-right text-[10px] leading-none whitespace-nowrap tabular-nums';
/* Ajuste 29/10 14:02 (itens 3 e 4) — as tabelas "No sistema hoje" e "Parcelas × sistema": fonte 9 px, linha 17 px (cabeçalho 9 px / 20 px) */
const TH9 = 'h-[20px] px-1 text-left text-[9px] font-medium text-primary-foreground truncate';
const TD9 = 'h-[17px] px-1 text-[9px] leading-none truncate';
const TDN9 = 'h-[17px] px-1 text-right text-[9px] leading-none whitespace-nowrap tabular-nums';
const BLOCO = cn(BLOCO_FORMULARIO, 'gap-0');

/** Rotulo + valor numa linha. Texto que nao cabe ROLA no lugar dele (fora de tabela, nada de "…"); numero, data e documento
 *  (`num`) nunca encolhem — a grade (`GRADE_KV`, colunas de 150px no minimo) e' que garante o lugar deles. */
function Kv({ k, v, titulo, erro, className, testid, num }: { k: string; v: ReactNode; titulo?: string; erro?: boolean; className?: string; testid?: string; num?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-baseline gap-1.5 whitespace-nowrap', className)} title={titulo} data-testid={testid}>
      <span className="shrink-0 text-[10px] text-muted-foreground">{k}</span>
      <span className={cn(num ? 'shrink-0 tabular-nums' : 'min-w-0 uma-linha-que-rola', 'text-[11px] font-medium', erro && 'rounded-sm bg-red-50 px-0.5 text-red-700')}>{v}</span>
    </div>
  );
}
const GRADE_KV = 'grid gap-x-3 gap-y-0.5 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]';

type AbaDaNota = 'arquivo' | 'nota' | 'lancamento';
/** P163-2 — a nota JÁ LANÇADA em abas (o mock aprovado 28/10 11:51): 1 Nota e fornecedor · 2 No sistema hoje · 3 Como vai ficar · 4 Itens; o
 *  "Arquivo" (ver a nota) entra como aba só abaixo de 1000px — acima dele a nota fica à esquerda */
type AbaDaNotaJa = 'arquivo' | 'hoje' | 'sistema' | 'ficar' | 'itens' | 'lancamento';
/** Mock da nota já lançada (29/10) — a ação de cada linha da "Parcelas × sistema" */
type AcaoDaLinha = 'vincular' | 'deixar' | 'criar';

export interface NotaParaLancar { arquivo: File; bytes: ArrayBuffer; lido: NotaLidaOk; doXml: DoXml }

export function NotaFiscalDialog({
  open, onClose, clienteId, clienteNome, nota, fazendas, contas, classificacoes, safras = [], fornecedores, onCriarFornecedor, onCriarLancamento,
  onAbrirNoLancamento, onAbrirRegistrada, onCriado, gravadores, consultarReceita = consultarCnpj, gravarItens = gravarItensSemTravar,
  gravadoresDaJuncao = GRAVADORES_DA_JUNCAO, partindoDe = null,
}: {
  open: boolean;
  /** P128a (porta 2) — a previa aberta pelo Documentos do Editar lancamento: o id dele (a linha "este lançamento" na tabela; sem ele
   *  entre os achados, nada se cria daqui — criaria a compra em dobro). `null` = o "+ Da nota" de sempre. */
  partindoDe?: string | null;
  onClose: () => void;
  clienteId: string;
  clienteNome: string | null;
  nota: NotaParaLancar;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  safras?: Safra[];
  fornecedores: readonly FornecedorV2[];
  onCriarFornecedor: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  /** FIN-NOTA-PDF-01b — o gravador do lancamento UNICO: o da tela (`handleSave`), que devolve o id criado. */
  onCriarLancamento?: (form: LancamentoV2Form) => Promise<string | null>;
  /** O Novo lancamento de sempre, com TUDO o que foi lido e escolhido aqui (`prefillDoModal`). */
  onAbrirNoLancamento: (prefill: ReturnType<typeof prefillDoModal>) => void;
  onAbrirRegistrada: (o: OcorrenciaDaNota) => void;
  onCriado: () => void;
  /** So' para teste: os gravadores (padrao: os do banco). */
  gravadores?: Gravadores;
  /** P96a — so' para teste: juntar as soltas, ler e editar os documentos delas (padrao: os do banco). */
  gravadoresDaJuncao?: GravadoresDaJuncao;
  /** So' para teste: a consulta da Receita (padrao: `consultarCnpj`). */
  consultarReceita?: typeof consultarCnpj;
  /** ITENS-NOTA-01 — guarda os itens da nota depois de criar (padrao: `gravarItensSemTravar`; o teste troca). */
  gravarItens?: (clienteId: string, arquivo: ArrayBuffer) => Promise<string | null>;
}) {
  const qc = useQueryClient();
  /* P95 — a nota da CHAVE DIGITADA: o que a chave nao traz (emissao, valor) o operador preenche aqui; a nota e a proposta usadas daqui
     para baixo (busca, criar, anexar, abrir no Novo lancamento) ja' levam o que foi digitado */
  const [digitado, setDigitado] = useState<{ emissao: string; valorCent: number | null }>({ emissao: '', valorCent: null });
  const pelaChave = nota.lido.pelaChave === true;
  const efetiva = useMemo(() => (pelaChave ? comDadosDigitados(nota, digitado) : nota), [pelaChave, nota, digitado]);
  const { lido, doXml: doXmlLido, bytes, arquivo } = efetiva;
  /* P101 — abaixo de 1000px: as abas (Arquivo | Nota e fornecedor | Parcelas e lançamento) no lugar das duas colunas */
  const estreito = useLarguraDaJanela() < 1000;
  const [aba, setAba] = useState<AbaDaNota>('nota');
  /* P163-2 — a aba da nota já lançada (abre em "No sistema hoje": é o que a pessoa confere primeiro) e as que já foram vistas (ganham ✓) */
  /* Gabriel 29/10 10:38 — abre em "No sistema hoje": o que foi achado, COMO ESTÁ (nada escondido) */
  const [abaJa, setAbaJa] = useState<AbaDaNotaJa>('hoje');
  const [vistas, setVistas] = useState<ReadonlySet<AbaDaNotaJa>>(new Set<AbaDaNotaJa>(['hoje']));
  const irParaAba = (a: AbaDaNotaJa) => { setAbaJa(a); setVistas((v) => new Set(v).add(a)); };
  /* P163-2 (b) — a nota sem itens legíveis (o PDF escaneado; a NF 31776 da Vera): o XML anexado aqui traz os itens (o XML manda sobre o PDF) */
  const [itensDoXml, setItensDoXml] = useState<NotaLida['itens'] | null>(null);
  const [erroDoXml, setErroDoXml] = useState<string | null>(null);
  const [lendoXml, setLendoXml] = useState(false);
  const n = lido.nota;
  /* ── P74 — "COMO FOI PAGO?" (NOTA-CARTAO-PARCELADO-01): Duplicatas da nota | À vista | Cartão em N×. A escolha vira a PROPOSTA da nota
     (`comPagamento`) e daí para baixo é o caminho de sempre: criar, o PDF nas N, a busca de "já lançada" (procura as parcelas do cartão), o
     "No Novo lançamento" e o "Atualizar e parcelar". Abre em Duplicatas quando a nota as traz, senão À vista; só o operador muda. */
  const nDuplicatasDaNota = doXmlLido.proposta.duplicatas.length;
  const [como, setComo] = useState<ComoFoiPago>(() => comoAbre(nDuplicatasDaNota));
  const [cartaoId, setCartaoId] = useState('');
  const [nCartaoTexto, setNCartaoTexto] = useState('');
  const [primeira, setPrimeira] = useState('');
  const [primeiraEditada, setPrimeiraEditada] = useState(false);
  const [diaSugerido, setDiaSugerido] = useState<number | null>(null);
  const [modoCartao, setModoCartao] = useState<ModoDasParcelas>('mensal');
  const [livresCartao, setLivresCartao] = useState<ParcelaLivre[]>([]);
  const [baseLivresCartao, setBaseLivresCartao] = useState<ParcelaLivre[] | null>(null);
  /* só as contas do tipo cartão (as ativas: a lista da tela já é a das ativas) */
  const cartoes = useMemo(() => contas.filter((c) => c.tipo_conta === 'cartao'), [contas]);
  const cartao = cartoes.find((c) => c.id === cartaoId) ?? null;
  const nomeDoCartao = cartao ? (cartao.nome_exibicao || cartao.nome_conta) : '';
  const nCartao = /^\d+$/.test(nCartaoTexto.trim()) ? Number(nCartaoTexto.trim()) : 0;
  const nCartaoValido = nCartao >= MIN_PARCELAS_DO_CARTAO && nCartao <= MAX_PARCELAS_DO_CARTAO;
  /* a 1ª fatura SUGERIDA: o dia mais frequente do cartão nos últimos 12 meses, no mês seguinte à emissão (sem histórico: vazio) */
  useEffect(() => {
    let vivo = true;
    if (!cartaoId) { setDiaSugerido(null); return; }
    void diasDoCartao(cartaoId).then((d) => { if (vivo) setDiaSugerido(diaMaisFrequente(d)); }, () => { if (vivo) setDiaSugerido(null); });
    return () => { vivo = false; };
  }, [cartaoId]);
  const primeiraSugerida = diaSugerido ? primeiraFatura(n.emissao, diaSugerido) : '';
  useEffect(() => { if (!primeiraEditada) setPrimeira(primeiraSugerida); }, [primeiraSugerida, primeiraEditada]);
  const sugeridaAtiva = !!primeiraSugerida && !primeiraEditada && primeira === primeiraSugerida;
  const mensalDoCartao = useMemo(() => (nCartaoValido && primeira
    ? parcelasDoMensal(parcelasDoCartao(n.totais.notaCent, nCartao, primeira).map((x) => ({ numero: Number(x.numero), dataVencimento: x.vencimento, valor: x.valorCent / 100 })))
    : []), [nCartaoValido, primeira, n.totais.notaCent, nCartao]);
  const gradeDoCartao = modoCartao === 'livres' ? livresCartao : mensalDoCartao;
  const parcelasEscolhidas = useMemo(() => gradeDoCartao.map((x, i) => ({ numero: String(i + 1), vencimento: x.vencimento, valorCent: x.valorCent })), [gradeDoCartao]);
  const doXml = useMemo(() => comPagamento(doXmlLido, como, como === 'cartao' ? parcelasEscolhidas : []), [doXmlLido, como, parcelasEscolhidas]);
  const trocarModoDoCartao = (m: ModoDasParcelas) => {
    if (m === 'livres') { setLivresCartao(mensalDoCartao); setBaseLivresCartao(mensalDoCartao); } else { setLivresCartao([]); setBaseLivresCartao(null); }
    setModoCartao(m);
  };
  const motivoDoCartao = como !== 'cartao' || modoCartao !== 'livres' ? null
    : livresCartao.length < MIN_PARCELAS_DO_CARTAO ? 'o parcelado pede ao menos duas parcelas' : motivoNaoSalva(livresCartao, n.totais.notaCent, 'a nota');
  const p = doXml.proposta;
  /* NOTA-FORNECEDOR-DUPLICA-01 — a resolucao e' refeita com a lista DE AGORA (a da leitura pode estar velha: o cadastro criado depois
     de ler a nota, a nota reaberta da lista). Pelo documento manda a de agora; senao, a da leitura (o resolvedor do banco); senao, a
     busca do cadastro entre os SEM documento (o nome, sem o prefixo de CNPJ do MEI, a fantasia, a razao social da Receita). */
  const [receitaNome, setReceitaNome] = useState<string | null>(null);
  const res = useMemo(() => {
    const deAgora = resolverEmitente(n.emitente, fornecedores, null, [receitaNome]);
    if (deAgora.achadoPor === 'documento') return deAgora;
    return doXml.resolucao.achadoPor ? doXml.resolucao : deAgora;
  }, [n.emitente, fornecedores, receitaNome, doXml.resolucao]);

  const [favorecidoId, setFavorecidoId] = useState<string | null>(() => resolverEmitente(n.emitente, fornecedores, null).propostoId ?? p.favorecidoId);
  /* "Cadastrar outro": criar e' escolha do operador, nunca o padrao quando ha' cadastro sem CNPJ com o mesmo nome */
  const [novoPorEscolha, setNovoPorEscolha] = useState(false);
  const [conflito, setConflito] = useState<CadastroComODocumento | null>(null);
  const [cnpjGravado, setCnpjGravado] = useState(false);
  const [uso, setUso] = useState<{ lancamentos: number; ultimo: string | null } | null>(null);
  const [fazendaId, setFazendaId] = useState<string>(p.fazendaId ?? '');
  /* NOTA-FAZENDA-PELA-IE-01 — a IE das fazendas (relida quando muda): a fazenda escolhida sem IE e a nota com a IE do destinatario =
     oferecer gravar; a fazenda com OUTRA IE = so' avisar (nunca sobrescrever) */
  const [iesDasFazendas, setIesDasFazendas] = useState<Record<string, string> | null>(null);
  const [gravarIeAberto, setGravarIeAberto] = useState(false);
  useEffect(() => {
    let vivo = true;
    const ler = () => { void iePorFazenda(clienteId).then((m) => { if (vivo) setIesDasFazendas(m); }, () => undefined); };
    ler();
    const sair = inscreverEmFazendas((c) => { if (c === clienteId) ler(); });
    return () => { vivo = false; sair(); };
  }, [clienteId]);
  const [contaId, setContaId] = useState<string>('__none__');
  const [planoId, setPlanoId] = useState<string>(p.classificacao?.plano_conta_id ?? '');
  const [receita, setReceita] = useState<DadosDoCnpj | null>(null);
  const [receitaFrase, setReceitaFrase] = useState<string | null>(null);
  const [completar, setCompletar] = useState<CampoDoEmitente[]>([]);
  const [abertos, setAbertos] = useState<LancamentoAbertoDaNota[]>([]);
  const [confirmarAtualizar, setConfirmarAtualizar] = useState<{ alvo: LancamentoAbertoDaNota; parcelar: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<null | 'cadastrar' | 'completar' | 'criar' | 'atualizar' | 'juntar' | 'nota-lida'>(null);
  /* FIN-NOTA-PDF-01b — lavoura: a safra e a cultura ('' = "Todas (rateia)"; `null` = ainda sem resposta) */
  const [safraId, setSafraId] = useState('');
  const [cultura, setCultura] = useState<string | null>(null);
  const [safraEditada, setSafraEditada] = useState(false);
  /* nota de UMA parcela: o vencimento da duplicata; sem duplicata, a emissao (em ambar, para conferir) */
  const [vencimento, setVencimento] = useState(p.duplicatas[0]?.vencimento ?? n.emissao);
  const [erro, setErro] = useState<string | null>(null);
  /* NOTA-JA-LANCADA-01 — os lancamentos que ja' parecem ser esta nota (qualquer status; cadastro parecido; numero; chave) */
  const [achados, setAchados] = useState<LancamentoJaLancado[] | null>(null);
  /* P146 — a consulta que FALHA nao vira "nada achado": o motivo fica aqui, a previa diz "Não consegui verificar…" e trava o Criar ate'
     "Tentar de novo" (`tentativa` refaz as consultas) responder. `abertosPendente`: a busca dos abertos ainda nao respondeu. */
  const [falhaJaLancada, setFalhaJaLancada] = useState<string | null>(null);
  /* Ajuste 11 — o esqueleto só na PRIMEIRA busca do modal; as seguintes (a emissão/valor digitados pela chave) não trocam a tela, só travam o botão */
  const [buscaRespondeu, setBuscaRespondeu] = useState(false);
  const [falhaAbertos, setFalhaAbertos] = useState<string | null>(null);
  const [abertosPendente, setAbertosPendente] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  /* P128a — o caminho "Completar com a nota" sempre cria as que faltam (o mock: "completa as 6 e cria as 4 que faltam") */
  const criarFaltam = true;
  /* P128a — os TRES CAMINHOS da nota que ja' esta' no sistema (o recomendado vem marcado) */
  const [caminho, setCaminho] = useState<CaminhoDaNota['id']>('completar');
  const [mesmoAssim, setMesmoAssim] = useState<string | null>(null);
  /* NOTA-FORNECEDOR-COMPARAR-01 — o cadastro de HOJE, para mostrar o que a nota muda antes de gravar */
  const [comparar, setComparar] = useState<CadastroParaComparar | null>(null);

  /* a Receita: o nome inteiro (o DANFE corta) e o endereco escrito direito; nunca trava */
  useEffect(() => {
    let vivo = true;
    if (soDigitos(n.emitente.documento).length !== 14) return;
    void consultarReceita(n.emitente.documento).then((r) => {
      if (!vivo) return;
      if (r.ok === true) { setReceita(r.dados); setReceitaNome(r.dados.razaoSocial || null); } else setReceitaFrase(r.frase);
    });
    return () => { vivo = false; };
  }, [n.emitente.documento, consultarReceita]);

  const emitente = useMemo(() => emitenteComReceita(n.emitente, receita), [n.emitente, receita]);
  const razaoSocial = receita?.razaoSocial || n.emitente.nome;

  /* fornecedor achado: o que a nota completa nele; e os lancamentos abertos dele com o valor da nota ou de uma parcela */
  useEffect(() => {
    let vivo = true;
    if (!favorecidoId) { setCompletar([]); setAbertos([]); setFalhaAbertos(null); setAbertosPendente(false); return; }
    void camposQueOEmitenteCompleta(clienteId, favorecidoId, emitente).then((c) => { if (vivo) setCompletar(c.filter((x) => x !== 'tipo_pessoa')); });
    /* P128a (decisao b) — so' a nota de OC para aqui; a anexada a um lancamento segue (os abertos sao conferidos igual) */
    if (!doXml.ocorrencias.some((o) => o.origem === 'oc')) {
      setAbertosPendente(true); setFalhaAbertos(null);
      void lancamentosAbertosComValor(clienteId, favorecidoId, [n.totais.notaCent, ...p.duplicatas.map((d) => d.valorCent)])
        .then((r) => {
          if (!vivo) return;
          setAbertosPendente(false);
          if (r.ok === false) { setAbertos([]); setFalhaAbertos(r.motivo); } else setAbertos(r.valor);
        });
    }
    return () => { vivo = false; };
  }, [clienteId, favorecidoId, emitente, doXml.ocorrencias.length, n.totais.notaCent, p.duplicatas, tentativa]);

  /* NOTA-JA-LANCADA-01 — antes de oferecer criar: a nota ja' esta' lancada? (refeito quando a Receita traz a razao social inteira) */
  /* P95 — pela chave, sem a emissao digitada nao ha' parcela para casar pelo valor: busca so' pelo numero e pela chave */
  const parcelasDaBusca = useMemo(() => (p.duplicatas.length || n.emissao ? parcelasParaCasar(p.duplicatas, n.totais.notaCent, p.duplicatas[0]?.vencimento ?? n.emissao) : []),
    [p.duplicatas, n.totais.notaCent, n.emissao]);
  useEffect(() => {
    let vivo = true;
    /* P128a (decisao b) — a nota ja' anexada a um LANCAMENTO nao bloqueia: e' o ponto de partida, a busca roda igual. Na OC, para aqui. */
    if (doXml.ocorrencias.some((o) => o.origem === 'oc')) { setAchados([]); setFalhaJaLancada(null); setBuscaRespondeu(true); return; }
    /* P146 — enquanto a busca nao responde, `achados` = null (o Criar espera); falhou = o motivo, NUNCA lista vazia */
    setAchados(null); setFalhaJaLancada(null);
    void notaJaLancada(clienteId, {
      parcelas: parcelasDaBusca, numero: p.numeroDocumento || n.numero, chave: n.chave, emitenteDocumento: n.emitente.documento,
      nomes: [n.emitente.nome, n.emitente.fantasia, receitaNome],
      /* P128c — pela porta 2, o lançamento aberto é a âncora (ele + os irmãos do parcelamento dele, do mesmo fornecedor) */
      lancamento: partindoDe,
    }).then((r) => {
      if (!vivo) return;
      setBuscaRespondeu(true);
      if (r.ok === false) setFalhaJaLancada(r.motivo); else setAchados(r.valor);
    });
    return () => { vivo = false; };
  }, [clienteId, doXml.ocorrencias.length, parcelasDaBusca, p.numeroDocumento, n.numero, n.chave, n.emitente.documento, n.emitente.nome, n.emitente.fantasia, receitaNome, tentativa, partindoDe]);
  /* D — a nota que so' tem lancamento CANCELADO nao esta' lancada: o rodape so' diz quantos */
  const canceladosSo = useMemo(() => (achados && !achados.some((l) => !l.cancelado) ? canceladosDaNota(achados) : []), [achados]);
  const jaLancada = useMemo(() => (achados ? casarJaLancados(parcelasDaBusca, achados, n.totais.notaCent) : null), [achados, parcelasDaBusca, n.totais.notaCent]);
  /* Caso 3 (Gabriel 29/10 11:33, a M2 NF 14.222) — a nota À VISTA no CARTÃO em N (1 duplicata; as achadas valem nota ÷ N): N é o da divisão
     (nunca o número achado); a POSIÇÃO de cada uma pela descrição ou pela ordem das faturas — discordam, a tela PERGUNTA (`leituraDoCartao`) e
     nada se grava antes; as que faltam nascem nas faturas (o mesmo dia, mês a mês). */
  const noCartao = useMemo(() => {
    if (!jaLancada?.emParcelas || jaLancada.pelaNota.some((l) => l.por.includes('soma'))) return null;
    const nC = nDasParcelas(jaLancada);
    const dasN = jaLancada.pelaNota.filter((l) => !l.cancelado && jaLancada.fracoes.get(l.id) === nC);
    /* só com a evidência do CARTÃO: uma achada numa conta de cartão, ou a condição de pagamento da nota diz cartão */
    const doCartao = dasN.some((l) => contas.find((k) => k.id === l.contaBancariaId)?.tipo_conta === 'cartao')
      || /cart[aã]o/i.test(n.informacoesComplementares ?? '');
    return nC >= 2 && dasN.length && doCartao ? { n: nC, achadas: dasN, parteCent: Math.round(n.totais.notaCent / nC), leituras: posicoesNoCartao(dasN, nC) } : null;
  }, [jaLancada, n.totais.notaCent, n.informacoesComplementares, contas]);
  const [leituraDoCartao, setLeituraDoCartao] = useState<'descricao' | 'ordem' | null>(null);
  useEffect(() => { setLeituraDoCartao(null); }, [noCartao]);
  const posicoesDoCartao = !noCartao ? null : noCartao.leituras.concordam ? noCartao.leituras.pelaOrdem
    : leituraDoCartao === 'descricao' ? noCartao.leituras.pelaDescricao : leituraDoCartao === 'ordem' ? noCartao.leituras.pelaOrdem : null;
  /* as que faltam: as do cartão (posições sem achada), ou as de sempre */
  const faltamDaNota = useMemo(() => (noCartao && posicoesDoCartao
    ? parcelasQueFaltamNoCartao(noCartao.achadas, posicoesDoCartao, noCartao.n, noCartao.parteCent, n.totais.notaCent) : jaLancada?.faltam ?? []),
  [noCartao, posicoesDoCartao, jaLancada, n.totais.notaCent]);
  /* o N da nota (a descrição "k/N", a junção): o do cartão, ou o das parcelas da nota */
  const nDaNota = noCartao ? noCartao.n : parcelasDaBusca.length;
  /* P128b-N1 — a parcela que falta nasce com a conta das irmãs quando todas têm a mesma: a Conta da prévia COMEÇA nela (à vista, troca-se);
     sem conta única (divergem ou alguma sem conta), "conta" entra no "Falta:" e o Criar fica apagado até escolher */
  /* Caso 3 — no cartão, a que nasce vai no CARTÃO das irmãs (a única conta de cartão entre as achadas), mesmo com uma delas na c/c */
  const cartaoDasIrmas = noCartao ? (() => {
    const ids = [...new Set(noCartao.achadas.map((l) => l.contaBancariaId).filter((c): c is string => !!c))].filter((c) => contas.find((k) => k.id === c)?.tipo_conta === 'cartao');
    return ids.length === 1 ? ids[0] : null;
  })() : null;
  const contaDasIrmas = cartaoDasIrmas ?? (jaLancada && faltamDaNota.length > 0 ? contaUnicaDasIrmas(jaLancada.alvos) : null);
  /* Mock da nota já lançada (Gabriel 29/10): a AÇÃO de cada linha da "Parcelas × sistema" — a achada "Vincular a nota" (a parecida: "É esta:
     vincular") ou "Deixar como está"; a que falta "Criar" ou "Não criar". O padrão é vincular/criar; a escolha vale para a prévia, a junção, a
     gravação e o anexar. (Substituir e "Não é esta: criar nova" são item próprio.) */
  const [acoes, setAcoes] = useState<ReadonlyMap<string, AcaoDaLinha>>(new Map());
  useEffect(() => { setAcoes(new Map()); }, [jaLancada]);
  const acaoDoLancamento = (id: string): AcaoDaLinha => acoes.get(id) ?? 'vincular';
  const acaoDaFalta = (numero: number): AcaoDaLinha => acoes.get(`falta:${numero}`) ?? 'criar';
  const alvosEscolhidos = (jaLancada?.alvos ?? []).filter((l) => acaoDoLancamento(l.id) !== 'deixar');
  const faltamEscolhidas = faltamDaNota.filter((x) => acaoDaFalta(x.n) === 'criar');
  /* "No sistema hoje" — a fazenda, o subcentro e o fornecedor de cada achado como estão no banco (só leitura; falhou = a aba diz) */
  const [comoHoje, setComoHoje] = useState<Consulta<ComoEstaHoje[]> | null>(null);
  const idsDosAchados = (jaLancada?.alvos ?? []).map((l) => l.id).join(',');
  useEffect(() => {
    if (!idsDosAchados) { setComoHoje(null); return; }
    let vivo = true;
    void comoEstaoHoje(clienteId, idsDosAchados.split(',')).then((r) => { if (vivo) setComoHoje(r); });
    return () => { vivo = false; };
  }, [clienteId, idsDosAchados]);
  /* "Como vai ficar" fica montada (escondida fora da aba): o botão único "Aplicar: …" grava por ela de qualquer aba */
  const [estadoDaPrevia, setEstadoDaPrevia] = useState<EstadoDaPrevia | null>(null);
  /* "Itens (N)" — a MESMA vista do cadastro (ItensDaNota + ContasDosItens): os itens fiscais pela chave (os guardados) ou do XML; a conta por item
     fica PENDENTE e o Aplicar a grava pela divisão de hoje (1 lançamento: pelos itens; a compra juntada: a mesma proporção nas N) */
  /* Ajuste 12 — uma vez, já na versão final: os guardados pela chave ou os do próprio arquivo; `itensCarregando` = o esqueleto da versão final */
  const [xmlDosItens, setXmlDosItens] = useState<File | null>(null);
  const itensDaTela = useItensDaNotaDaTela({ clienteId, chave: n.chave || null, arquivo: xmlDosItens ?? arquivo });
  const itensFiscais = itensDaTela.nota;
  const itensCarregando = itensDaTela.carregando;
  const [contasDosItens, setContasDosItens] = useState<ReadonlyMap<number, string> | null>(null);
  /* P163-2 — a aba 2 diz o que DIFERE entre as achadas (a descrição, a competência, a conta); a aba 3 escolhe o que padronizar */
  const diferencasDasAchadas = useMemo(() => {
    const a = jaLancada?.alvos ?? [];
    if (a.length < 2) return null;
    const partes: string[] = [];
    const nDesc = new Set(a.map((l) => (l.descricao ?? '').trim())).size;
    if (nDesc > 1) partes.push(`descrição (${nDesc} jeitos)`);
    const comps = [...new Set(a.flatMap((l) => (l.competencia ? [l.competencia] : [])))].sort();
    if (comps.length > 1) partes.push(`competência (${comps.map((c) => dataInteira(c)).join(', ')})`);
    /* Caso 3 — a conta e a safra ditas pelo NOME e por quantas ("1 em Sicredi Lavoura, 2 em Cartão Sicredi Lavoura"; "25/26 × 26/27") */
    const quantasPor = (chaves: (string | null)[], nome: (c: string | null) => string) => {
      const m = new Map<string, number>();
      for (const c of chaves) m.set(nome(c), (m.get(nome(c)) ?? 0) + 1);
      return [...m].map(([k, q]) => `${q} em ${k}`).join(', ');
    };
    const contasDe = a.map((l) => l.contaBancariaId ?? null);
    if (new Set(contasDe).size > 1) partes.push(`conta (${quantasPor(contasDe, (c) => { const k = c ? contas.find((x) => x.id === c) : undefined; return k ? (k.nome_exibicao || k.nome_conta) : c ? 'outra conta' : 'sem conta'; })})`);
    const safrasDe = a.map((l) => (comoHoje?.ok ? comoHoje.valor.find((x) => x.id === l.id)?.safraId ?? null : null));
    if (comoHoje?.ok && new Set(safrasDe).size > 1) partes.push(`safra (${quantasPor(safrasDe, (c) => { const k = c ? safras.find((x) => x.id === c) : undefined; return k ? (k.codigo || k.nome) : 'sem safra'; })})`);
    return partes.length ? `Diferente entre elas: ${partes.join(', ')}. Acerte marcando a coluna em "Como vai ficar".` : null;
  }, [jaLancada, contas, safras, comoHoje]);
  const contaDasIrmasPosta = useRef<string | null>(null);
  useEffect(() => {
    if (!contaDasIrmas || contaDasIrmasPosta.current === contaDasIrmas) return;
    contaDasIrmasPosta.current = contaDasIrmas;
    setContaId((c) => (c === '__none__' ? contaDasIrmas : c));
  }, [contaDasIrmas]);
  /* P128a — a TABELA SISTEMA × NOTA e a frase do que foi achado (a mesma lista, as mesmas contas) */
  const linhasBase = useMemo(() => (jaLancada ? linhasSistemaNota(jaLancada, n.totais.notaCent) : []), [jaLancada, n.totais.notaCent]);
  /* Caso 3 — no cartão com a posição decidida: as N posições da nota, cada achada no lugar dela e as que faltam (só na nota → criar) */
  const linhasDaTabela = useMemo((): LinhaSistemaNota[] => {
    if (!noCartao || !posicoesDoCartao) return linhasBase;
    const porK = new Map<number, LinhaSistemaNota>();
    for (const x of linhasBase) {
      const k = x.sistema ? posicoesDoCartao.get(x.sistema.id) : undefined;
      if (k && x.sistema) porK.set(k, { ...x, rotulo: `${k}/${noCartao.n}`, notaVencimento: x.sistema.vencimento, notaValorCent: noCartao.parteCent, difData: false });
    }
    for (const f of faltamDaNota) porK.set(f.n, { chave: `p${f.n}`, rotulo: `${f.n}/${noCartao.n}`, sistema: null, notaVencimento: f.vencimento,
      notaValorCent: f.valorCent, situacao: 'so_na_nota', difValor: false, difData: false });
    const fora = linhasBase.filter((x) => !x.sistema || !posicoesDoCartao.has(x.sistema.id));
    return [...[...porK].sort((a, b) => a[0] - b[0]).map(([, x]) => x), ...fora];
  }, [noCartao, posicoesDoCartao, linhasBase, faltamDaNota]);
  /* P128a (porta 2) — o lancamento aberto no Editar que a busca NAO achou: nada se cria daqui (a ancora pelo lancamento e' o P128c) */
  const naoAchouOAberto = !!partindoDe && achados !== null && !achados.some((l) => l.id === partindoDe && !l.cancelado);
  const fraseAchado = jaLancada ? `${fraseDoAchado(jaLancada, linhasDaTabela, n.totais.notaCent)}${naoAchouOAberto ? ' · o lançamento aberto não foi achado por esta nota' : ''}` : '';
  /* P128b — os lançamentos da prévia campo a campo: os do sistema que RECEBEM a nota (o "só no sistema" fica fora), na ordem da tabela,
     com o rótulo da parcela e o que a nota diz (o caminho 2 leva valor e vencimento da nota às programadas) */
  /* Caso 3 — a posição na nota ("6/10") de cada linha do cartão (o rótulo da linha já é ela) */
  const posicaoDaLinha = (x: LinhaSistemaNota): { k: number; n: number } | null => {
    if (!noCartao || !posicoesDoCartao || !x.sistema) return null;
    const k = posicoesDoCartao.get(x.sistema.id);
    return k ? { k, n: noCartao.n } : null;
  };
  /* Caso 3 — sem a posição decidida, nada se grava */
  const posicaoPendente = !!noCartao && !posicoesDoCartao;
  /* a pergunta da posição: as leituras que existem, com as posições de cada uma */
  const lista = (m: ReadonlyMap<string, number>) => [...m.values()].sort((a, b) => a - b).join(', ');
  const opcoesDaLeitura: { valor: 'descricao' | 'ordem'; rotulo: string }[] = [];
  if (noCartao?.leituras.pelaDescricao) opcoesDaLeitura.push({ valor: 'descricao', rotulo: `pela descrição: ${lista(noCartao.leituras.pelaDescricao)}` });
  if (noCartao?.leituras.pelaOrdem) opcoesDaLeitura.push({ valor: 'ordem', rotulo: `pela ordem das faturas: ${lista(noCartao.leituras.pelaOrdem)}` });
  /* Caso 3 — a frase: "a nota tem 10 parcelas e achei 3 (R$ 4.420,50 de R$ 14.735,00) — faltam 7" */
  const fraseDoCartao = noCartao && (noCartao.achadas.length < noCartao.n || !noCartao.leituras.concordam) ? (() => {
    const somaCent = noCartao.achadas.reduce((t, l) => t + l.valorCent, 0);
    const faltamN = noCartao.n - noCartao.achadas.length;
    return `A nota é à vista no cartão em ${noCartao.n} parcelas e achei ${noCartao.achadas.length} (R$ ${reais(somaCent)} de R$ ${reais(n.totais.notaCent)})${faltamN ? ` — faltam ${faltamN}` : ''}`
      + (noCartao.leituras.concordam || posicoesDoCartao ? '.' : ': diga a posição delas no cartão para seguir.');
  })() : null;
  const alvosDaPrevia = useMemo((): AlvoDaPrevia[] => {
    const alvos = new Set((jaLancada?.alvos ?? []).filter((l) => (acoes.get(l.id) ?? 'vincular') !== 'deixar').map((l) => l.id));
    return linhasDaTabela.flatMap((x) => (x.sistema && alvos.has(x.sistema.id)
      ? [{ id: x.sistema.id, programada: x.situacao === 'programada', notaValorCent: x.notaValorCent, notaVencimento: x.notaVencimento, pagamento: x.sistema.pagamento,
        descricaoHoje: x.sistema.descricao, ...(posicaoDaLinha(x) ? { posicao: posicaoDaLinha(x) ?? undefined } : {}) }] : []));
  }, [jaLancada, linhasDaTabela, acoes]);
  const rotulosDaPrevia = useMemo(() => Object.fromEntries(linhasDaTabela.flatMap((x) => (x.sistema ? [[x.sistema.id, x.rotulo]] : []))), [linhasDaTabela]);
  /* P128a (decisao c) — as PROGRAMADAS que diferem da nota (valor ou vencimento): so' elas o caminho 2 atualiza */
  const programadasQueDiferem = linhasDaTabela.filter((x) => x.situacao === 'programada' && (x.difValor || x.difData)).length;
  /* P96a — as N soltas desta nota (todas as N frações, nenhuma já parcela): o gesto principal vira "Juntar as N e anexar" */
  /* URGENTE 29/10 + Gabriel 08:26 — JUNTAR É O PADRÃO: sem o "k/N", as achadas da nota que são exatamente as N duplicatas também se juntam;
     quando não junta, a frase diz por quê (nunca calado). A caixinha na aba "Parcelas × sistema" vem marcada; desmarcar = só completar. */
  const nACriar = faltamEscolhidas.length;
  const nDeixadas = (jaLancada?.alvos.length ?? 0) - alvosEscolhidos.length;
  const juncao = useMemo(() => juncaoDaNota(jaLancada, noCartao ? noCartao.n : p.duplicatas.length, { aCriar: nACriar, deixadas: nDeixadas }),
    [jaLancada, noCartao, p.duplicatas.length, nACriar, nDeixadas]);
  const soltas = juncao.soltas;
  const [juntarMarcado, setJuntarMarcado] = useState(true);
  const juntarAgora = !!soltas && juntarMarcado;
  /* Mock da nota já lançada (29/10) — o EFEITO de cada linha da "Parcelas × sistema", pela ação escolhida (paga/conciliada: o 🔒 — valor, data e
     conta não mudam). A descrição: a sem informação ("Parcela 3 - None") leva a da nota; a escrita fica e ganha só o "k/N". */
  const numeroDaFalta = (x: LinhaSistemaNota): number | null =>
    faltamDaNota.find((f) => f.vencimento === x.notaVencimento && f.valorCent === x.notaValorCent)?.n ?? null;
  const efeitoDaLinha = (x: LinhaSistemaNota): { texto: string; curto: string; cadeado: boolean } => {
    const l = x.sistema;
    const naCompra = juntarAgora ? ` · entra na compra como ${x.rotulo}` : '';
    if (x.situacao === 'so_na_nota') {
      const nF = numeroDaFalta(x);
      if (nF !== null && acaoDaFalta(nF) === 'deixar') return { texto: 'não é criada', curto: 'não é criada', cadeado: false };
      const c = contaEscolhida ? contas.find((k) => k.id === contaEscolhida) : undefined;
      return { texto: `nasce programada${c ? ` · conta ${c.nome_exibicao || c.nome_conta}` : ''}${naCompra}`, curto: juntarAgora ? `nasce como ${x.rotulo}` : 'nasce programada', cadeado: false };
    }
    if (x.situacao === 'so_no_sistema' || !l) return { texto: 'fica de fora (não é desta nota)', curto: 'fica de fora', cadeado: false };
    if (acaoDoLancamento(l.id) === 'deixar') return { texto: 'fica como está (não recebe a nota)', curto: 'fica como está', cadeado: false };
    const paga = x.situacao === 'conciliada' || x.situacao === 'realizada';
    const descricao = descricaoSemInformacao(l.descricao) ? ' · descrição da nota' : ` · "… ${x.rotulo}"`;
    const daNota = !paga && caminho === 'atualizar' && (x.difData || x.difValor)
      ? ` · ${x.difData && x.notaVencimento ? `venc. ${dataInteira(l.vencimento).slice(0, 5)} → ${dataInteira(x.notaVencimento).slice(0, 5)}` : ''}${x.difData && x.difValor ? ', ' : ''}${x.difValor && x.notaValorCent !== null ? `valor → ${reais(x.notaValorCent)}` : ''} (da nota)` : '';
    return { texto: `ganha nº e nota${descricao}${naCompra}${daNota}`, curto: juntarAgora ? `entra como ${x.rotulo}` : 'recebe a nota', cadeado: paga };
  };
  /* a AÇÃO na linha (o menu da casa): a achada — "Vincular a nota" (a parecida: "É esta: vincular") ou "Deixar como está"; a que falta — "Criar"
     ou "Não criar"; a só no sistema não tem ação */
  const acaoDaLinhaUI = (x: LinhaSistemaNota, parecida: boolean): ReactNode => {
    const l = x.sistema;
    const nF = x.situacao === 'so_na_nota' ? numeroDaFalta(x) : null;
    if (x.situacao === 'so_no_sistema' || (!l && nF === null)) return <span className="text-muted-foreground">—</span>;
    const chave = l ? l.id : `falta:${nF ?? 0}`;
    const atual = l ? acaoDoLancamento(l.id) : acaoDaFalta(nF ?? 0);
    const opcoes: { valor: AcaoDaLinha; rotulo: string; curto: string }[] = l
      ? [{ valor: 'vincular', rotulo: parecida ? 'É esta: vincular' : 'Vincular a nota', curto: parecida ? 'É esta' : 'Vincular' },
        { valor: 'deixar', rotulo: 'Deixar como está', curto: 'Deixar' }]
      : [{ valor: 'criar', rotulo: 'Criar', curto: 'Criar' }, { valor: 'deixar', rotulo: 'Não criar', curto: 'Não criar' }];
    const escolhida = opcoes.find((o) => o.valor === atual);
    const rotulo = escolhida?.rotulo ?? '';
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" disabled={!!ocupado} data-testid="nota-acao" data-acao={atual}
            className={cn('inline-flex h-[15px] max-w-full items-center gap-1 rounded border px-1.5 text-[9.5px] font-semibold',
              atual === 'deixar' ? 'border-border bg-muted text-muted-foreground' : parecida ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-700')}>
            <span className="min-w-0 truncate" title={rotulo}>{escolhida?.curto ?? ''}</span><span className="shrink-0 font-normal">▾</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {opcoes.map((o) => (
            <DropdownMenuItem key={o.valor} data-testid={`nota-acao-${o.valor}`}
              onSelect={() => setAcoes((m) => new Map(m).set(chave, o.valor))}>{o.rotulo}</DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  /* P128a — os TRES CAMINHOS, cada um dizendo o que muda e o que NAO muda (o mock); o 2 so' grava no P128b */
  const caminhosDaNota = useMemo((): CaminhoDaNota[] => {
    if (!jaLancada) return [];
    const nDup = p.duplicatas.length;
    const nAlvos = jaLancada.alvos.length;
    const nFaltam = jaLancada.faltam.length;
    const completa = soltas ? `Junta os ${soltas.n} numa compra parcelada e anexa a nota a todos.`
      : `Anexa a nota ${nAlvos === 1 ? 'ao lançamento achado' : `aos ${nAlvos} achados`}${nFaltam ? ` e cria ${nFaltam === 1 ? 'a parcela que falta' : `as ${nFaltam} que faltam`}` : ''}.`;
    return [
      { id: 'completar', titulo: 'Completar com a nota', recomendado: true, perigo: false, faz: completa,
        naoMuda: 'Valor, data, status e conciliação não mudam.' },
      { id: 'atualizar', titulo: 'Completar e atualizar as não pagas', recomendado: false, perigo: false,
        faz: programadasQueDiferem ? `Como o anterior, e ${programadasQueDiferem === 1 ? 'a programada que difere leva' : `as ${programadasQueDiferem} programadas que diferem levam`} valor e vencimento da nota.`
          : 'Como o anterior; nenhuma programada difere da nota.',
        naoMuda: 'Realizadas e conciliadas não mudam.' },
      { id: 'criar', titulo: 'Criar um lançamento novo', recomendado: false, perigo: true,
        faz: `Cria ${nDup >= 2 ? `${nDup} parcelas novas` : 'um lançamento novo'} com a nota (pede o motivo). Os achados ficam como estão.`,
        naoMuda: '⚠ duplica: a compra fica em dobro.' },
    ];
  }, [jaLancada, soltas, programadasQueDiferem, p.duplicatas.length]);
  /* P96a — a NF já anexada à mão numa das N, com valor/emissão diferentes da nota lida: NUNCA se troca sozinha */
  const [docsDasSoltas, setDocsDasSoltas] = useState<DocumentoDaParcela[]>([]);
  useEffect(() => {
    if (!soltas) { setDocsDasSoltas([]); return; }
    let vivo = true;
    void gravadoresDaJuncao.documentos(clienteId, soltas.ids).then((d) => { if (vivo) setDocsDasSoltas(d); }, () => { if (vivo) setDocsDasSoltas([]); });
    return () => { vivo = false; };
  }, [soltas, clienteId, gravadoresDaJuncao]);
  const notaLida = useMemo(() => ({ chave: n.chave || null, numero: p.numeroDocumento || n.numero, totalCent: n.totais.notaCent, emissao: n.emissao || null }),
    [n.chave, n.numero, p.numeroDocumento, n.totais.notaCent, n.emissao]);
  const nfDigitada = useMemo(() => nfDigitadaDivergente(docsDasSoltas, (id) => {
    const l = jaLancada?.pelaNota.find((x) => x.id === id);
    const f = fracaoDaDescricao(l?.descricao);
    return f ? `${f.k}/${f.n}` : 'parcela';
  }, notaLida), [docsDasSoltas, jaLancada, notaLida]);
  const [confirmarNotaLida, setConfirmarNotaLida] = useState(false);

  /* o proposto que aparece depois (a lista de agora, a Receita) entra sozinho — salvo se o operador escolheu cadastrar outro */
  useEffect(() => {
    if (!favorecidoId && !novoPorEscolha && res.propostoId && !res.inativo) setFavorecidoId(res.propostoId);
  }, [favorecidoId, novoPorEscolha, res.propostoId, res.inativo]);
  const fornecedor = favorecidoId ? fornecedores.find((f) => f.id === favorecidoId) ?? null : null;
  /* o cadastro escolhido NAO tem documento (achado pelo nome): a previa oferece completar com o CNPJ da nota */
  const semDocumento = !!fornecedor && soDigitos(fornecedor.cpf_cnpj) === '' && !cnpjGravado;
  useEffect(() => {
    let vivo = true;
    if (!semDocumento || !favorecidoId) { setUso(null); return; }
    void usoDoFornecedor(favorecidoId).then((u) => { if (vivo) setUso(u); });
    return () => { vivo = false; };
  }, [semDocumento, favorecidoId]);
  const precisaCadastrar = !favorecidoId && !conflito && (novoPorEscolha || !res.achadoPor || res.filialDiferente);
  const escolherEntre = !favorecidoId && !novoPorEscolha && res.candidatos.length > 1 ? res.candidatos : [];
  const saidas = useMemo(() => classificacoes.filter((c) => !!c.id && c.tipo_operacao.startsWith('2')), [classificacoes]);
  /* P163 v4 — as listas dos seletores da grade (a célula de fornecedor, fazenda, conta, subcentro, safra) */
  const opcoesDaPrevia = useMemo(() => ({ fornecedores: [...fornecedores], fazendas, contas, classificacoes: saidas, safras }), [fornecedores, fazendas, contas, saidas, safras]);
  const plano = saidas.find((c) => c.id === planoId) ?? null;
  const lavoura = plano?.escopo_negocio === 'agricultura';
  /* NOTA-PREVIA-ATIVIDADE-01 — a ATIVIDADE vem do subcentro (so' leitura); fora da lavoura a safra e' a da atividade PELA DATA (a mesma regra
     do Novo lancamento, `ClassificacaoLancamento`: administrativo nao tem safra) — e e' ela que se grava */
  const atividadeDoPlano = plano?.escopo_negocio || null;
  const rotuloDaAtividade = ATIVIDADES.find((a) => a.valor === atividadeDoPlano)?.rotulo ?? (atividadeDoPlano ?? '—');
  /* P138 — a safra pela data e' a do BANCO (`_fn_safra_da_competencia`, a regra unica): aqui so' se mostra; quem grava e' o banco, na
     criacao (`trg_safra_da_competencia`) — o payload vai sem safra fora da lavoura */
  const safraPelaData = useSafraDaCompetencia(clienteId, atividadeDoPlano, p.competencia, !lavoura && atividadeDoPlano !== 'administrativo');
  const safraDaLavouraPelaData = useSafraDaCompetencia(clienteId, 'agricultura', p.competencia, lavoura);
  const nParcelas = p.duplicatas.length;
  const cabeAqui = nParcelas >= 2;
  const semDuplicata = nDuplicatasDaNota === 0;
  const culturasDaSafra = useCulturasDaSafra(lavoura && safraId ? safraId : null);
  const safrasDaLavoura = useMemo(() => safras.filter((sf) => (sf.escopo_negocio ?? '') === 'agricultura' || sf.id === safraId), [safras, safraId]);

  /* a SUGESTAO DE SEMPRE: o ultimo lancamento do fornecedor com este subcentro (safra e cultura dele); sem ele, a safra pela data,
     como no Novo lancamento (sem desempate: o operador decide). Cultura nunca se adivinha fora da sugestao do fornecedor. */
  useEffect(() => {
    if (!lavoura) { setSafraId(''); setCultura(null); setSafraEditada(false); return; }
    if (safraEditada) return;
    const ult = p.classificacao;
    if (ult && ult.plano_conta_id === planoId && ult.safra_id) { setSafraId(ult.safra_id); setCultura(ult.cultura ?? ''); return; }
    setSafraId(safraDaLavouraPelaData ?? '');
    setCultura(null);
  }, [lavoura, planoId, safraEditada, p.classificacao, safraDaLavouraPelaData]);
  /* P128a (decisao b) — so' a nota registrada numa OC barra; a de lancamento vira um dos irmaos (a busca a acha pela chave) */
  const registrada = doXml.ocorrencias.find((o) => o.origem === 'oc') ?? null;
  const divergencias = lido.divergencias;
  const avulsa = ehSerieAvulsa(n.serie) || ehSerieAvulsa(n.chave.slice(22, 25));
  const fazendaPeloEndereco = p.origens.fazenda === ORIGEM_FAZENDA_PELO_ENDERECO && !!p.fazendaId && fazendaId === p.fazendaId;
  const ieDaNota = soDigitos(n.destinatario.ie ?? '');
  const ieDaFazenda = fazendaId && iesDasFazendas ? soDigitos(iesDasFazendas[fazendaId] ?? '') : null;
  const acaoDaIe: 'gravar' | 'diverge' | null = !fazendaId || !ieDaNota || ieDaFazenda === null ? null
    : ieDaFazenda === '' ? 'gravar' : ieDaFazenda !== ieDaNota ? 'diverge' : null;
  const nomeDaFazenda = fazendas.find((f) => f.id === fazendaId)?.nome ?? 'A fazenda';
  const remessa = fraseDaRemessa(n);
  const somaItens = (itensDoXml ?? n.itens).reduce((s, i) => s + i.valorCent, 0);

  const faltas: string[] = [];
  if (!favorecidoId) faltas.push('fornecedor');
  else if (res.inativo && favorecidoId === p.favorecidoId) faltas.push('fornecedor ativo');
  if (!fazendaId) faltas.push('fazenda');
  if (!planoId) faltas.push('subcentro');
  if (jaLancada && caminho !== 'criar' && criarFaltam && faltamEscolhidas.length > 0 && como !== 'cartao' && (!contaId || contaId === '__none__')) faltas.push('conta');
  if (lavoura && !safraId) faltas.push('safra');
  if (lavoura && cultura === null) faltas.push('cultura');
  if (como !== 'cartao' && !cabeAqui && !vencimento) faltas.push('vencimento');
  if (como === 'cartao') {
    if (!cartaoId) faltas.push('cartão');
    if (modoCartao === 'mensal' && !nCartaoValido) faltas.push(`nº de parcelas (${MIN_PARCELAS_DO_CARTAO} a ${MAX_PARCELAS_DO_CARTAO})`);
    if (modoCartao === 'mensal' && !primeira) faltas.push('1ª fatura');
    if (motivoDoCartao) faltas.push(motivoDoCartao);
  }
  if (pelaChave && !digitado.emissao) faltas.push('emissão');
  if (pelaChave && !(digitado.valorCent && digitado.valorCent > 0)) faltas.push('valor');
  /* P146 — o que a previa NAO conseguiu verificar trava como bloqueio (com "Tentar de novo"); o que ainda nao respondeu, espera */
  const naoVerificado = falhaJaLancada ? `Não consegui verificar se esta nota já foi lançada (${falhaJaLancada}). Nada será criado até verificar.`
    : falhaAbertos ? `Não consegui verificar os lançamentos abertos deste fornecedor (${falhaAbertos}). Nada será criado até verificar.` : null;
  const verificando = !naoVerificado && ((!registrada && achados === null) || abertosPendente);
  const bloqueio = divergencias.length ? `A chave não confere com o lido (${divergencias.map((x) => NOME_DO_CONFERIDO[x]).join(', ')}). Nada será criado.`
    : registrada ? `Nota já registrada neste cliente · ${ondeEsta(registrada)}` : naoVerificado;
  /* P162 — completar o que JÁ EXISTE não pede o que é de lançamento novo (fazenda, subcentro…): as faltas só contam quando algo nasce
     (o caminho criar, ou a parcela que falta) */
  const faltasQueContam = jaLancada && !bloqueio && caminho !== 'criar' && faltamEscolhidas.length === 0 ? [] : faltas;
  const podeCriar = !bloqueio && !verificando && faltas.length === 0 && !ocupado && !naoAchouOAberto;
  /* P167 (NOTA-COMPRA-ERRADA-01) — completar/anexar o que JÁ EXISTE: (1) duas compras com a mesma evidência = nada se grava (abrir pela parcela
     da compra certa); (2) a soma das parcelas que recebem a nota (as achadas + as que nascem) nunca passa da nota (meio centavo de folga) —
     "falta R$ X" não é estado final de um registro. O quadro continua à vista; a frase fica no rodapé e o "Revisar e completar" apaga. */
  const somaDosLigadosCent = jaLancada ? alvosEscolhidos.reduce((t, l) => t + l.valorCent, 0) + faltamEscolhidas.reduce((t, f) => t + f.valorCent, 0) : 0;
  const recusaDaCompra = !jaLancada || bloqueio || caminho === 'criar' ? null
    : jaLancada.compraAmbigua ? 'Duas compras deste fornecedor parecem esta nota: abra a nota pela parcela da compra certa. Nada será gravado.'
    : somaDosLigadosCent > n.totais.notaCent + 1
      ? `As parcelas que receberiam a nota somam R$ ${reais(somaDosLigadosCent)}, mais que a nota (R$ ${reais(n.totais.notaCent)}). Nada será gravado — confira se todas são desta compra.`
      : null;
  /* P163-2 — o MODO DA NOTA JÁ LANÇADA: as abas no lugar dos blocos; "Criar um lançamento novo (duplica)" sai dele (pelo ⋯ do rodapé) */
  const modoJa = !!jaLancada && !bloqueio && caminho !== 'criar';
  /* Ajuste 11 (Gabriel 29/10 14:12) — NADA PISCA: enquanto a busca "nota já lançada" roda, o modal já é o esqueleto da tela NOVA (o mesmo tamanho,
     abas desabilitadas, "procurando no sistema…"), nunca a antiga; achou nada = a nota nova entra depois; achou = a tela se completa no lugar */
  const procurandoNoSistema = !buscaRespondeu && !registrada && achados === null && !naoVerificado && divergencias.length === 0;
  const telaJa = modoJa || procurandoNoSistema;
  /* o esqueleto troca pela tela final: o foco que estava num elemento que sumiu volta ao MODAL (o teclado nunca fica no corpo da página) */
  const conteudoDoModal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (procurandoNoSistema) return;
    const el = conteudoDoModal.current;
    if (el && !el.contains(document.activeElement)) el.focus();
  }, [procurandoNoSistema]);
  const itensVistos = itensDoXml ?? n.itens;
  const abaArquivo: AbaDaNotaJa = 'arquivo';
  /* mock da nota já lançada (29/10): Parcelas × sistema · Como vai ficar · Itens · Lançamento (a Nota e o Fornecedor ficam fixos em cima) */
  /* Gabriel 29/10 10:38 — as abas, nesta ordem: No sistema hoje (N) · Parcelas × sistema · Itens (N) · Como vai ficar · Lançamento */
  const nomesJa: { valor: AbaDaNotaJa; nome: string }[] = [
    { valor: 'hoje', nome: `No sistema hoje (${jaLancada?.alvos.length ?? 0})` }, { valor: 'sistema', nome: 'Parcelas × sistema' },
    { valor: 'itens', nome: `Itens (${itensVistos.length})` }, { valor: 'ficar', nome: 'Como vai ficar' },
    { valor: 'lancamento', nome: 'Lançamento' }];
  /* o ✓ da aba vista mora num lugar reservado (10px): nada se desloca ao marcar */
  const opcoesJa: { valor: AbaDaNotaJa; rotulo: ReactNode }[] = [
    ...(estreito ? [{ valor: abaArquivo, rotulo: 'Arquivo' }] : []),
    ...nomesJa.map((o) => ({ valor: o.valor, rotulo: <span className="whitespace-nowrap"><span className="inline-block w-[10px]">{vistas.has(o.valor) && abaJa !== o.valor ? '✓' : ''}</span>{o.nome}</span> })),
  ];
  /* P74 — com o cartão, a conta origem das N é o cartão escolhido */
  const contaEscolhida = como === 'cartao' ? (cartaoId || null) : contaId && contaId !== '__none__' ? contaId : null;
  const escolhas = (): EscolhasDaNota | null => (favorecidoId && plano?.id ? {
    fazendaId, favorecidoId, contaBancariaId: contaEscolhida, planoContaId: plano.id, escopoNegocio: plano.escopo_negocio || null,
    safraId: lavoura ? safraId || null : null, cultura: lavoura ? cultura || null : null,
  } : null);
  /* NADA ESCOLHIDO AQUI SE PERDE: o Novo lancamento recebe a nota E as escolhas */
  const abrirNoLancamento = () => onAbrirNoLancamento(prefillDoModal(doXml, {
    fazendaId, contaBancariaId: contaEscolhida, favorecidoId, favorecidoNome: fornecedores.find((f) => f.id === favorecidoId)?.nome ?? null,
    plano: plano?.id ? { id: plano.id, subcentro: plano.subcentro, macro_custo: plano.macro_custo, grupo_custo: plano.grupo_custo, centro_custo: plano.centro_custo, escopo_negocio: plano.escopo_negocio } : null,
    safraId: lavoura ? safraId || null : null, cultura: lavoura ? cultura : null, vencimento: cabeAqui ? null : vencimento || null,
  }));

  const cadastrar = async () => {
    setOcupado('cadastrar'); setErro(null);
    try {
      /* o CNPJ ja' cadastrado (a lista pode estar velha): conferido no BANCO antes de criar — conflito vira frase e "Usar este".
         P146: a conferencia que FALHA para aqui (criar poderia duplicar o CNPJ) e diz por que */
      const ja = await fornecedorPeloDocumento(clienteId, n.emitente.documento);
      if (ja.ok === false) { setErro(`Não consegui conferir o CNPJ no cadastro (${ja.motivo}). Nada foi gravado — tente de novo.`); return; }
      if (ja.valor) { setConflito(ja.valor); return; }
      const novo = await onCriarFornecedor(razaoSocial, fazendaId || null, documentoFormatado(n.emitente.documento));
      if (!novo) {
        const depois = await fornecedorPeloDocumento(clienteId, n.emitente.documento);
        if (depois.ok === false) setErro(`Não consegui conferir o CNPJ no cadastro (${depois.motivo}).`); else setConflito(depois.valor);
        return;
      }
      setNovoPorEscolha(false); setConflito(null);
      setFavorecidoId(novo.id);
      const e = await completarCadastroPeloXml(clienteId, novo.id, emitente);
      if (e) toast.error(`Fornecedor criado, mas os dados da nota não foram gravados nele: ${e}`);
    } finally { setOcupado(null); }
  };
  /* NOTA-FORNECEDOR-COMPARAR-01 — "Completar …" NAO grava direto: abre a comparacao (como esta' hoje x o que a nota traz; so' o
     marcado e' gravado, com trilha e desfazer) */
  const completarCadastro = async () => {
    if (!favorecidoId) return;
    setOcupado('completar'); setErro(null);
    try {
      if (semDocumento) {
        /* o CNPJ de outro cadastro nao entra aqui: conferido antes (a trava do banco recusaria com a frase) */
        const ja = await fornecedorPeloDocumento(clienteId, n.emitente.documento);
        if (ja.ok === false) { setErro(`Não consegui conferir o CNPJ no cadastro (${ja.motivo}). Nada foi gravado — tente de novo.`); return; }
        if (ja.valor && ja.valor.id !== favorecidoId) { setConflito(ja.valor); return; }
      }
      const hoje = await cadastroParaComparar(clienteId, favorecidoId);
      if (!hoje) { setErro('O cadastro não foi lido. Nada foi gravado.'); return; }
      setComparar(hoje);
    } finally { setOcupado(null); }
  };
  const propostaDaNota: CadastroParaComparar = propostaDoEmitente(emitente, razaoSocial);
  const gravarComparacao = async (campos: Record<string, string>): Promise<string | null> => {
    if (!favorecidoId) return 'Sem cadastro escolhido.';
    const r = await atualizarCamposDoCadastro(favorecidoId, campos, receita ? 'receita' : 'nota', `${p.rotuloNota}`, clienteId);
    if (r.ok === false) return r.frase;
    if (campos.cpf_cnpj) setCnpjGravado(true);
    setCompletar([]);
    const alt = r.alteracaoId;
    const nCampos = Object.keys(campos).length;
    toast.success(`Cadastro atualizado (${nCampos} ${nCampos === 1 ? 'coluna' : 'colunas'})`, alt ? {
      action: { label: 'Desfazer', onClick: () => { void desfazerCamposDoCadastro(alt, clienteId).then((e) => (e ? toast.error(e) : toast.success('Desfeito'))); } },
    } : undefined);
    return null;
  };
  const g: Gravadores = gravadores ?? { ...GRAVADORES, gravar: (payload, cli) => gravarParcelamento(payload, cli, () => qc.invalidateQueries()) };
  const criar = async (motivo?: string) => {
    const base = escolhas();
    const e = base && motivo ? { ...base, observacao: `Criado mesmo com a nota parecendo já lançada: ${motivo}` } : base;
    if (!podeCriar || !e || !plano) return;
    setOcupado('criar'); setErro(null);
    try {
      const r = cabeAqui
        ? await criarParcelasDaNota(clienteId, doXml, e, g)
        : await criarLancamentoDaNota(clienteId, doXml, formDaNota(doXml, e, vencimento, plano), e.favorecidoId, { ...g, lancamento: g.lancamento ?? onCriarLancamento });
      if (r.ok === false) { setErro(r.erro); return; }
      if (r.erroDoDocumento) toast.error(r.erroDoDocumento);
      else toast.success(`${cabeAqui ? `${r.parcelas} parcelas criadas` : 'Lançamento criado'} · ${p.rotuloNota} anexada`);
      /* ITENS-NOTA-01 — os itens ficam guardados pela chave (o documento), sem travar */
      const erroItens = await gravarItens(clienteId, bytes);
      if (erroItens) toast.error(`Os itens da nota não foram guardados: ${erroItens}`);
      onCriado(); onClose();
    } finally { setOcupado(null); }
  };
  /**
   * P128b (decisões (a)–(d) de 28/10) — COMPLETAR COM A NOTA, numa sequência só (o pedido vem da prévia campo a campo):
   * 1. as parcelas que FALTAM nascem antes, pelo gravador de sempre (o valor e o vencimento da nota);
   * 2. `fn_nota_completar` com TODAS (as achadas + as novas): os campos, a JUNÇÃO das soltas (P96a) e o ANTES, numa transação; recusou =
   *    as recém-criadas são CANCELADAS (o padrão do P75: nada fica valendo pela metade) e a frase volta à prévia;
   * 3. a nota anexada a todas (o caminho de sempre); 4. o que nasceu fica REGISTRADO na operação (o desfazer cancela); 5. os itens.
   * Nada muda em valor, data de pagamento, status nem conciliação de conciliada/paga (o banco recusa).
   */
  const completarComNota = async (pedido: Record<string, unknown>[]): Promise<string | null> => {
    if (!jaLancada) return 'Nada para completar.';
    if (recusaDaCompra) return recusaDaCompra;
    const donoDaNota = favorecidoId ?? jaLancada.alvos[0]?.fornecedorId ?? null;
    if (!donoDaNota) return 'Escolha o fornecedor da nota.';
    const e = escolhas();
    const comFaltam = criarFaltam && faltamEscolhidas.length > 0;
    if (comFaltam && (!e || !plano || faltas.length)) return `Para criar as que faltam, falta: ${faltas.join(', ')}.`;
    setOcupado('atualizar'); setErro(null);
    try {
      /* 1 */
      const criados: { id: string; numero: number }[] = [];
      const gravarLancamento = g.lancamento ?? onCriarLancamento;
      for (const f of comFaltam && e && plano ? faltamEscolhidas : []) {
        if (!gravarLancamento || !e || !plano) return 'Gravador do lançamento indisponível. Nada foi gravado.';
        const id = await gravarLancamento({ ...formDaNota(doXml, e, f.vencimento, plano), valor: f.valorCent / 100, data_vencimento: f.vencimento,
          descricao: `${baseDaDescricao(p.descricao)} ${f.n}/${nDaNota}` });
        if (!id) { await cancelarCriados(criados.map((x) => x.id), `a parcela ${f.n} não foi criada`); return `A parcela ${f.n} não foi criada. Nada ficou valendo.`; }
        criados.push({ id, numero: f.n });
      }
      /* 2 */
      const r = await completarComANota(clienteId, [...pedido, ...criados.map((x) => ({ id: x.id }))], { juntar: juntarAgora, chave: n.chave || null, simular: false, valorNotaCent: n.totais.notaCent });
      const recusa = r.ok === false ? r.motivo : !r.valor.ok ? (r.valor.recusas[0] ?? 'O banco recusou.') : null;
      if (recusa || r.ok === false) {
        const nao = await cancelarCriados(criados.map((x) => x.id), recusa ?? 'recusa');
        return nao ? `${recusa} E ${nao} parcela(s) criada(s) NÃO puderam ser canceladas: cancele-as na lista.` : recusa;
      }
      const operacao = r.valor.operacao;
      /* 3 */
      const numeroDe = (id: string) => jaLancada.porParcela.find((x) => x.lancamento?.id === id)?.parcela.n ?? 0;
      /* P167 — a compra que JÁ TEM esta nota (o documento de antes) só recebe o vínculo: nunca um segundo documento da mesma nota */
      const notaExistente = alvosEscolhidos.find((l) => l.notaDocumentoId)?.notaDocumentoId ?? null;
      const a = await anexarAosJaLancados(clienteId, doXml, [...alvosEscolhidos.map((l) => ({ id: l.id, numero: numeroDe(l.id) })), ...criados], donoDaNota, { notaExistente },
        { ...g, lancamento: g.lancamento ?? onCriarLancamento });
      if (a.ok === false) {
        toast.error(`Os campos foram gravados, mas a nota não foi anexada: ${a.erro}`);
      } else for (const x of a.avisos) toast.error(x);
      /* 4 */
      if (operacao) {
        const eReg = await registrarNaOperacao(operacao, criados.map((x) => x.id), a.ok === true ? a.documentoIds : []);
        if (eReg) toast.error(`O desfazer não vai cancelar o que nasceu agora: ${eReg}`);
      }
      /* 5 */
      const erroItens = await gravarItens(clienteId, bytes);
      if (erroItens) toast.error(`Os itens da nota não foram guardados: ${erroItens}`);
      /* 6 — "Itens (N)": a conta por item, pela divisão de hoje (a mesma do Editar): a compra juntada — a mesma proporção nas N; um lançamento só —
         pelos itens da nota anexada. Recusou: o resto já está gravado e a frase diz que a divisão não foi (como o "Salvar e dividir", P165) */
      const alvoDaDivisao = alvosEscolhidos[0]?.id ?? criados[0]?.id ?? null;
      if (contasDosItens && divideNoAplicar && itensFiscais && alvoDaDivisao) {
        const motivo = `Contas pelos itens da NF ${numeroDaNota(n.numero)} (nota já lançada)`;
        const fin = r.valor.financiamentoId;
        const d = fin
          ? await dividir(clienteId, { lancamentoId: alvoDaDivisao, financiamentoId: fin }, percentuaisDosItens(porContaDosItens(itensFiscais.lidos.itens, contasDosItens)), motivo, false)
          : await dividirPelosItens(clienteId, alvoDaDivisao, contasDosItens, motivo, false);
        if (d.ok === false) toast.error(`A nota foi aplicada; a divisão pelos itens não: ${d.frase}`);
      }
      const total = alvosEscolhidos.length + criados.length;
      toast.success(`${p.rotuloNota} completou ${total} lançamento${total === 1 ? '' : 's'}${r.valor.financiamentoId ? ' · juntados numa compra parcelada' : ''}`, operacao ? {
        action: { label: 'Desfazer', onClick: () => { void desfazerCompletar(operacao).then((x) => { if (x) toast.error(x); else { toast.success('Desfeito: tudo voltou como estava.'); onCriado(); } }); } },
      } : undefined);
      onCriado(); onClose();
      return null;
    } finally { setOcupado(null); }
  };
  /** P96a — "Usar a nota lida": só com a confirmação; troca valor e emissão da NF digitada (o digitado fica na Auditoria). */
  const trocarPelaNotaLida = async () => {
    if (!nfDigitada || !soltas) return;
    setOcupado('nota-lida'); setErro(null);
    const e = await usarANotaLida(clienteId, nfDigitada, notaLida, gravadoresDaJuncao);
    setOcupado(null); setConfirmarNotaLida(false);
    if (e) { setErro(e); return; }
    toast.success(`NF da ${nfDigitada.rotulo} trocada pela nota lida (o digitado fica na Auditoria)`);
    void gravadoresDaJuncao.documentos(clienteId, soltas.ids).then(setDocsDasSoltas, () => {});
  };
  /** "Atualizar este" (anexar) ou "Atualizar e parcelar" (o a' vista vira 1/N; `parcelas` = a lista que vai ao banco). */
  const atualizar = async (alvo: LancamentoAbertoDaNota, parcelas: ParcelaDoPayload[] | null) => {
    if (!favorecidoId) return;
    setOcupado('atualizar'); setErro(null);
    try {
      const e = escolhas();
      const r = parcelas && e
        ? await atualizarEParcelar(clienteId, alvo.id, doXml, e, parcelas, g)
        : await atualizarComANota(clienteId, { id: alvo.id, financiamentoId: alvo.financiamentoId }, doXml, favorecidoId, g);
      if (r.ok === false) { setErro(r.erro); return; }
      const falhaDoDocumento = 'erroDoDocumento' in r && typeof r.erroDoDocumento === 'string' ? r.erroDoDocumento : null;
      if (falhaDoDocumento) toast.error(falhaDoDocumento);
      else toast.success(parcelas ? `Lançamento parcelado em ${parcelas.length} · ${p.rotuloNota} anexada` : `Lançamento atualizado · ${p.rotuloNota} anexada`);
      /* ITENS-NOTA-01 — os itens ficam guardados pela chave (o documento), sem travar */
      const erroItens = await gravarItens(clienteId, bytes);
      if (erroItens) toast.error(`Os itens da nota não foram guardados: ${erroItens}`);
      onCriado(); onClose();
    } finally { setOcupado(null); setConfirmarAtualizar(null); }
  };

  const marcasVermelhas = divergencias.flatMap((d) => MARCA_DO_CONFERIDO[d]);
  const erroEm = (c: CampoConferido) => divergencias.includes(c);
  const chipFornecedor = favorecidoId
    ? (res.inativo && favorecidoId === res.propostoId ? <span className={CHIP_AVISO}>inativo no cadastro</span>
      : semDocumento ? <span className={CHIP_AVISO} data-testid="nota-chip-fornecedor">achado pelo nome · sem CNPJ</span>
        /* NOTA-FORNECEDOR-CNPJ-ACHADO-01 — o documento do cadastro casa com o da nota (digitos dos dois lados; o cadastro guarda com mascara) */
        : <span className={CHIP_OK} data-testid="nota-chip-fornecedor">{fornecedor && soDigitos(fornecedor.cpf_cnpj) !== '' && soDigitos(fornecedor.cpf_cnpj) === soDigitos(n.emitente.documento)
          ? `achado pelo ${soDigitos(n.emitente.documento).length === 11 ? 'CPF' : 'CNPJ'}` : 'cadastrado'}</span>)
    : conflito ? <span className={CHIP_ERRO} data-testid="nota-chip-fornecedor">CNPJ já cadastrado</span>
    : escolherEntre.length ? <span className={CHIP_AVISO}>{res.achadoPor === 'nome' ? 'achado pelo nome: escolha' : 'dois cadastros com este CNPJ'}</span>
      : res.filialDiferente ? <span className={CHIP_AVISO}>outra filial no cadastro</span>
        : <span className={CHIP_AVISO}>não cadastrado neste cliente</span>;
  const end = emitente.endereco;
  const enderecoTexto = [[end?.logradouro, end?.numero].filter(Boolean).join(', '), end?.bairro, end?.cep ? `${end.cep.slice(0, 5)}-${end.cep.slice(5)}` : null].filter(Boolean).join(' · ');
  const cidade = end?.municipio ? `${receita ? end.municipio : caixaDeTitulo(end.municipio)}/${end.uf ?? ''}` : '—';
  const aberto = abertos[0] ?? null;
  /* a' vista existente + nota parcelada: o gesto e' "Atualizar e parcelar" */
  const parcelarAberto = !!aberto && !aberto.financiamentoId && cabeAqui;
  const decisao = confirmarAtualizar?.parcelar ? decisaoDoExistente(confirmarAtualizar.alvo, doXml) : null;
  const origemPlano = p.classificacao && planoId === p.classificacao.plano_conta_id ? `último · ${dataCurta(p.classificacao.data)}` : null;

  /* P163-2 (b) — "Anexar o XML desta nota" (a nota sem itens legíveis): só o XML da MESMA nota (a chave confere); os itens se guardam pela chave
     (`gravarItens` → `fn_nota_fiscal_gravar`, o XML manda sobre o PDF) e aparecem na aba. Outra chave ou outro arquivo: a frase, nada guardado. */
  const anexarXmlDosItens = async (f: File) => {
    setErroDoXml(null); setLendoXml(true);
    try {
      const bytes = await f.arrayBuffer();
      const r = await lerNota(bytes);
      if (r.ok === false || r.origem !== 'xml') { setErroDoXml('Este arquivo não é o XML de uma nota. Nada foi guardado.'); return; }
      if (soDigitos(r.nota.chave) !== soDigitos(n.chave)) { setErroDoXml('Este XML é de outra nota (a chave não confere). Nada foi guardado.'); return; }
      if (!r.nota.itens.length) { setErroDoXml('O XML também não traz itens. Nada foi guardado.'); return; }
      const e = await gravarItens(clienteId, bytes);
      if (e) { setErroDoXml(`Os itens não foram guardados: ${e}`); return; }
      setItensDoXml(r.nota.itens);
      /* ajuste 12 — o XML anexado é a fonte dos itens da aba (a versão final, nunca a simples) */
      setXmlDosItens(f);
    } catch (x) {
      console.error('anexar o XML dos itens', x);
      setErroDoXml('Não consegui ler o XML. Nada foi guardado.');
    } finally { setLendoXml(false); }
  };
  /* os ITENS da nota: o bloco do lançamento novo e a aba 4 da nota já lançada (P163-2) — o XML anexado na aba 4 entra no lugar dos do PDF */
  /* "Itens (N)": a conta por item grava no Aplicar com UM lançamento (pelos itens) ou com as parcelas juntadas (a mesma proporção nas N) */
  const divideNoAplicar = alvosEscolhidos.length + nACriar === 1 || juntarAgora;
  const hojeDe = (id: string) => (comoHoje?.ok ? comoHoje.valor.find((x) => x.id === id) ?? null : null);
  const contaDeHojeDosItens = (alvosEscolhidos[0] ? hojeDe(alvosEscolhidos[0].id)?.planoContaId : null) ?? planoId ?? null;
  /* Gabriel 29/10 10:38 — "No sistema hoje (N)": cada lançamento achado numa linha, COMO ESTÁ (nada escondido). A fazenda, o subcentro e o
     fornecedor vêm da leitura dos ids (`comoEstaoHoje`); falhou = a frase, nunca "—" calado. O quadro rola por dentro (de lado, estreito). */
  const ordemDosAchados = linhasDaTabela.flatMap((x) => (x.sistema && (jaLancada?.alvos ?? []).some((l) => l.id === x.sistema?.id) ? [x] : []));
  const quadroDeHoje = jaLancada ? (
    <section className={cn(BLOCO, 'min-h-0 flex-1')} data-testid="nota-aba-hoje">
      <TituloDoBloco nome="No sistema hoje" dica="como está cada lançamento achado" />
      {/* a frase do achado: 2 linhas reservadas (nada se desloca, nada corta), o texto inteiro no title */}
      <p className="h-[26px] shrink-0 overflow-hidden whitespace-normal text-[10px] leading-[13px] text-foreground" title={fraseAchado} data-testid="nota-hoje-resumo">{fraseAchado}</p>
      {comoHoje && comoHoje.ok === false && (
        <p className="h-[14px] shrink-0 text-[10px] text-destructive" data-testid="nota-hoje-falhou">Não consegui ler fazenda, subcentro e fornecedor ({comoHoje.motivo}).</p>
      )}
      <div className="min-h-0 flex-1 overflow-auto" data-testid="nota-hoje-rolagem">
        <table className="w-full min-w-[780px] table-fixed border-collapse">
          <colgroup><col style={{ width: 36 }} /><col style={{ width: 66 }} /><col style={{ width: 66 }} /><col /><col style={{ width: 92 }} /><col style={{ width: 78 }} />
            <col style={{ width: 76 }} /><col style={{ width: 86 }} /><col style={{ width: 64 }} /><col style={{ width: 66 }} /><col style={{ width: 82 }} /></colgroup>
          <thead className="sticky top-0 z-10 bg-primary"><tr>
            {[['Parc.', ''], ['Venc.', ''], ['Pgto.', ''], ['Descrição', ''], ['Fornecedor', ''], ['Fazenda', ''], ['Conta', ''], ['Subcentro', ''], ['Safra', ''], ['Valor', 'n'], ['Status', '']].map(([h, a]) => (
              <th key={h} className={cn(TH9, a === 'n' && 'text-right')} title={h}>{h}</th>))}
          </tr></thead>
          <tbody>
            {ordemDosAchados.map((x) => {
              const l = x.sistema;
              if (!l) return null;
              const h = hojeDe(l.id);
              const lido = !!comoHoje?.ok;
              const forn = h?.favorecidoId ? fornecedores.find((f) => f.id === h.favorecidoId)?.nome ?? l.fornecedorNome : l.fornecedorNome;
              /* acerto 1 (29/10) — a fazenda pelo CÓDIGO (PUR, RET), nunca o nome (a regra soberana); o nome só no title */
              const fazObj = h?.fazendaId ? fazendas.find((f) => f.id === h.fazendaId) : undefined;
              const faz = fazObj ? (fazObj.codigo || null) : null;
              const conta = l.contaBancariaId ? contas.find((c) => c.id === l.contaBancariaId) : undefined;
              const nomeDaConta = conta ? (conta.nome_exibicao || conta.nome_conta) : '—';
              const semLer = comoHoje === null ? '…' : '—';
              const sf = h?.safraId ? safras.find((x) => x.id === h.safraId) : undefined;
              const nomeDaSafra = sf ? (sf.nome || sf.codigo) : null;
              return (
                <tr key={l.id} className={cn('border-b border-border/50', l.id === partindoDe && 'font-semibold')} data-testid="nota-hoje-linha">
                  <td className={cn(TDN9, 'text-left')}>{x.rotulo}</td>
                  <td className={cn(TDN9, 'text-left')}>{dataInteira(l.vencimento ?? l.competencia)}</td>
                  <td className={cn(TDN9, 'text-left text-muted-foreground')}>{l.pagamento ? dataInteira(l.pagamento) : '—'}</td>
                  <td className={TD9} title={l.descricao ?? undefined} data-testid="nota-hoje-descricao">{l.descricao || '—'}</td>
                  <td className={TD9} title={forn ?? undefined} data-testid="nota-hoje-fornecedor">{forn || '—'}</td>
                  <td className={TD9} title={fazObj?.nome ?? undefined} data-testid="nota-hoje-fazenda">{lido ? faz ?? '—' : semLer}</td>
                  <td className={TD9} title={nomeDaConta} data-testid="nota-hoje-conta">{nomeDaConta}</td>
                  <td className={TD9} title={h?.subcentro ?? undefined} data-testid="nota-hoje-subcentro">{lido ? h?.subcentro ?? '—' : semLer}</td>
                  <td className={TD9} title={nomeDaSafra ?? undefined} data-testid="nota-hoje-safra">{lido ? nomeDaSafra ?? '—' : semLer}</td>
                  <td className={TDN9} data-testid="nota-hoje-valor">{reais(l.valorCent)}</td>
                  <td className={TD9} title={l.conciliado ? 'conciliada com o extrato' : TEXTO_DA_SITUACAO[x.situacao]}>
                    <span className={CHIP_DA_SITUACAO[x.situacao]} data-testid="nota-hoje-status">{TEXTO_DA_SITUACAO[x.situacao]}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  ) : null;
  /* item 7 (29/10 14:02) — ver a nota: o visualizador em tela cheia, ou o arquivo numa aba nova do navegador (o mesmo arquivo, sem gravar nada) */
  const [vendoNota, setVendoNota] = useState(false);
  const abrirEmNovaAba = () => {
    const url = URL.createObjectURL(new Blob([bytes], { type: lido.origem === 'pdf' ? 'application/pdf' : 'text/xml' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  /* o quadro do ARQUIVO: a coluna da esquerda; na nota já lançada estreita, a aba "Arquivo" */
  const quadroDoArquivo = (
          <section className={cn(BLOCO, 'min-h-0')} data-testid="nota-bloco-arquivo">
      {/* Ajuste 29/10 14:02 (item 1) — na nota já lançada a coluna é estreita: o selo é CURTO ("PDF lido"), o longo no title; o cabeçalho do bloco
          nunca quebra nem corta (o gate `titulo-do-bloco`) */}
      <TituloDoBloco nome="Arquivo" acao={<span className={pelaChave ? CHIP_AVISO : CHIP_OK} data-testid="nota-selo-arquivo"
        title={pelaChave ? 'PDF · pela chave digitada' : lido.origem === 'pdf' ? 'PDF com texto · leitura direta' : 'XML da nota'}>
        {telaJa ? (pelaChave ? 'pela chave' : lido.origem === 'pdf' ? 'PDF lido' : 'XML lido')
          : pelaChave ? 'PDF · pela chave digitada' : lido.origem === 'pdf' ? 'PDF com texto · leitura direta' : 'XML da nota'}</span>} />
      {lido.origem === 'pdf' ? (telaJa ? (
        /* item 7 — clicar na miniatura abre o visualizador */
        <button type="button" className="flex min-h-0 flex-1 cursor-zoom-in flex-col" onClick={() => setVendoNota(true)} title="Abrir a nota" data-testid="nota-miniatura">
          <PreviaDaNota bytes={bytes} marcas={lido.marcas} tamanho={lido.tamanhos[0] ?? null} divergentes={marcasVermelhas} />
        </button>
      ) : <PreviaDaNota bytes={bytes} marcas={lido.marcas} tamanho={lido.tamanhos[0] ?? null} divergentes={marcasVermelhas} />)
        : <div className="flex flex-1 items-center justify-center rounded border bg-[#f7f7f5] text-[10px] text-muted-foreground">XML: os dados vêm direto do arquivo.</div>}
      {telaJa ? (
        /* item 7 — ver a nota: "Abrir" (o visualizador, tela cheia) e "Nova aba"; o nome do arquivo no title */
        <div className="mt-1 flex h-[22px] shrink-0 items-center gap-1" title={`${arquivo.name} · ${Math.max(1, Math.round(arquivo.size / 1024))} KB`}>
          <Button type="button" size="sm" variant="outline" className="h-[20px] flex-1 px-1.5 text-[10px]" onClick={() => setVendoNota(true)} disabled={lido.origem !== 'pdf'}
            data-testid="nota-abrir-visualizador">Abrir</Button>
          <Button type="button" size="sm" variant="outline" className="h-[20px] flex-1 px-1.5 text-[10px]" onClick={abrirEmNovaAba} data-testid="nota-nova-aba">Nova aba</Button>
        </div>
      ) : (
      <div className="mt-1 flex h-4 shrink-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="min-w-0 uma-linha-que-rola" title={arquivo.name}>{arquivo.name} · {Math.max(1, Math.round(arquivo.size / 1024))} KB</span>
        {lido.origem === 'pdf' && !pelaChave && <span className="shrink-0">amarelo = lido</span>}
      </div>
      )}
    </section>
  );
  const quadroDosItens = (
    <section className={cn(BLOCO, 'min-h-0')} data-testid="nota-bloco-itens">
                    <TituloDoBloco nome="Itens" dica="vão para Produto / descrição" />
                    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="nota-itens-rolagem">
                      <table className="w-full table-fixed border-collapse">
                        <colgroup><col /><col style={{ width: 56 }} /><col style={{ width: 62 }} /><col style={{ width: 90 }} /></colgroup>
                        <thead className="sticky top-0 z-10 bg-primary"><tr><th className={TH} title="Produto">Produto</th><th className={cn(TH, 'text-right')}>Qtd</th><th className={cn(TH, 'text-right')}>Unit.</th><th className={cn(TH, 'text-right')}>Total</th></tr></thead>
                        <tbody>
                          {itensVistos.map((it, i) => {
                            const q = quantidadeCurta(it.quantidade);
                            const unit = it.unitarioCent ?? (Number(it.quantidade) > 0 ? Math.round(it.valorCent / Number(it.quantidade)) : null);
                            const titulo = [it.descricao, it.detalhe].filter(Boolean).join(' · ');
                            return (
                              <tr key={i} className="border-b border-border/50" data-testid="nota-item">
                                <td className={TD} title={titulo}>{it.descricao}</td>
                                <td className={TDN}>{q} {it.unidade}</td>
                                <td className={TDN}>{unit != null ? reais(unit) : '—'}</td>
                                <td className={TDN}>{reais(it.valorCent)}</td>
                              </tr>
                            );
                          })}
                          <tr className="bg-muted/60 font-semibold">
                            <td className={TD} title={`Produtos − desconto · ${reais(somaItens)} − ${reais(n.totais.descontoCent)}`}>Produtos − desconto</td><td className={TD} /><td className={TD} />
                            <td className={TDN}>{reais(somaItens - n.totais.descontoCent)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      {/* P163-2 — largura = janela − 22px (11px de cada lado, inteiro): com 97vw o modal ficava em meio pixel (750 → 727,5) e a aba Itens o
          fazia saltar 1px */}
      <DialogContent ref={conteudoDoModal} className="flex h-[min(600px,95vh)] w-[min(1094px,calc(100vw-22px))] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="nota-fiscal">
        <div className="flex h-9 shrink-0 items-center gap-2.5 bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Novo lançamento · da nota fiscal</DialogTitle>
          {!estreito && !telaJa && <span className="text-[11px] text-primary-foreground/80">{lido.origem === 'pdf' ? 'PDF lido' : 'XML lido'} · confira antes de criar</span>}
          <DialogDescription className="sr-only">O que foi lido da nota fiscal, para criar o lançamento parcelado.</DialogDescription>
          {/* P101 — abaixo de 1000px a prévia não cabe em duas colunas sem rolar (a 750×483 sobravam 21px às parcelas): três abas, na barra do
              título (não gastam altura) */}
          {/* mock da nota já lançada (29/10): as abas descem para o corpo, embaixo da Nota e do Fornecedor; aqui só a frase */}
          {telaJa ? (!estreito && (
            <span className="text-[11px] text-primary-foreground/80" data-testid="nota-cabecalho-ja">{lido.origem === 'pdf' ? 'PDF lido' : 'XML lido'} · {procurandoNoSistema ? 'procurando no sistema…' : 'esta nota já está no sistema · confira antes de aplicar'}</span>
          )) : estreito && (
            <span className="ml-auto rounded-md bg-card" data-testid="nota-abas">
              <Segmentado<AbaDaNota> altura={22} valor={aba} onEscolher={setAba}
                opcoes={[{ valor: 'arquivo', rotulo: 'Arquivo' }, { valor: 'nota', rotulo: 'Nota e fornecedor' }, { valor: 'lancamento', rotulo: 'Parcelas e lançamento' }]} />
            </span>
          )}
        </div>

        {/* P163-2 — na nota já lançada as abas trocam o corpo inteiro (de propósito): o gate de deslocamento mede a barra e o rodapé */}
        <div className="grid min-h-0 flex-1 gap-2 bg-muted p-2" data-desloca-livre={telaJa ? '' : undefined} style={{ gridTemplateColumns: estreito ? 'minmax(0, 1fr)' : telaJa ? 'minmax(150px, 16%) minmax(0, 1fr)' : 'minmax(160px, 28%) minmax(0, 1fr)' }}>
          {/* ── ARQUIVO ─── (na nota já lançada estreita, ele é a aba "Arquivo") */}
          {(telaJa ? !estreito : (!estreito || aba === 'arquivo')) && quadroDoArquivo}

          {(telaJa || !estreito || aba !== 'arquivo') && (
          <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
            {/* Ajuste 29/10 14:02 (item 2) — Nota (40%) e Fornecedor (60%) LADO A LADO, numa faixa de altura FIXA, cada um com 2 linhas no máximo e o
                rótulo colado ao valor; a razão social inteira ou "…" + title (nunca empurra as abas) */}
            {telaJa && (<>
            <div className="grid h-[66px] shrink-0 gap-1.5" style={{ gridTemplateColumns: estreito ? 'minmax(0, 7fr) minmax(0, 13fr)' : 'minmax(0, 2fr) minmax(0, 3fr)' }} data-testid="nota-faixa-nota-fornecedor">
            {/* a conferência de regressão (29/10): o que a Nota da tela antiga mostrava e não cabe nas 2 linhas — natureza, desconto, destinatário e
                dados adicionais — fica no title do bloco; o aviso da REMESSA (NOTA-AVULSA-890) é um selo âmbar; pela chave, emissão e valor são CAMPOS */}
            <section className={cn(BLOCO, 'min-h-0 overflow-hidden')} data-testid="nota-bloco-nota"
              title={[`Natureza: ${n.naturezaOperacao || '—'}`, `Desconto: ${pelaChave ? '—' : `R$ ${reais(n.totais.descontoCent)}`}`,
                `Destinatário: ${n.destinatario.nome ? caixaDeTitulo(n.destinatario.nome) : '—'}${clienteNome ? ` · ${clienteNome}` : ''}`,
                `Dados adicionais: ${n.informacoesComplementares || '—'}`].join('\n')}>
              <TituloDoBloco nome="Nota" acao={<span className="flex items-center gap-1">
                {remessa && <span className={CHIP_AVISO} title={remessa} data-testid="nota-aviso-remessa">remessa</span>}
                <span className={pelaChave ? CHIP_AVISO : divergencias.length ? CHIP_ERRO : CHIP_OK} data-testid="nota-chave"
                  title={pelaChave ? ROTULO_PELA_CHAVE : fraseDaChave(divergencias, avulsa)}>{pelaChave ? 'pela chave' : divergencias.length ? 'chave diverge' : 'chave confere'}</span>
              </span>} />
              <div className="grid grid-cols-2 gap-x-3 text-[10.5px] leading-4">
                <Kv num k="NF" v={numeroDaNota(n.numero)} erro={erroEm('numero')} testid="nota-numero" />
                <Kv num k="Série" v={p.duplicatas.length > 1 ? `${n.serie} · ${p.duplicatas.length} dup.` : n.serie} erro={erroEm('serie')} />
                {pelaChave ? (<>
                  <Kv num k="Emissão" v={<DatePicker value={digitado.emissao} onChange={(v) => { setVencimento((x) => (!x || x === digitado.emissao ? v : x)); setDigitado((d) => ({ ...d, emissao: v })); }} data-testid="nota-emissao-campo" size="compact"
                    className={cn('h-4 w-[96px] text-[10px] border-amber-400 bg-amber-50', !digitado.emissao && 'border-destructive')} />} />
                  <Kv num k="Valor" v={<span data-testid="nota-valor-campo"><CampoMoeda valor={digitado.valorCent == null ? null : digitado.valorCent / 100}
                    onChange={(v) => setDigitado((d) => ({ ...d, valorCent: v == null ? null : Math.round(v * 100) }))}
                    className={cn('h-4 w-[104px] text-[10px] border-amber-400 bg-amber-50', !digitado.valorCent && 'border-destructive')} /></span>} />
                </>) : (<>
                  <Kv num k="Emissão" v={dataInteira(n.emissao)} erro={erroEm('mes')} />
                  <Kv num k="Valor" v={`R$ ${reais(n.totais.notaCent)}`} />
                </>)}
              </div>
            </section>
            <section className={cn(BLOCO, 'min-h-0 overflow-hidden')} data-testid="nota-bloco-fornecedor">
              <TituloDoBloco nome="Fornecedor" acao={chipFornecedor} />
              {/* Ajuste 10 (29/10 14:12) — a atualização do cadastro VOLTA como era (os mesmos campos, `Kv`, funções e botões da tela antiga: Cadastrar,
                  Escolha o cadastro, Usar este, Completar cadastro / com o CNPJ, Cadastrar outro); só o arranjo é o do ajuste 2 (2 linhas; o endereço no
                  title da Cidade) */}
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex h-4 min-w-0 items-baseline gap-3 whitespace-nowrap">
                    {/* ajuste 2 — a razão social inteira ou "…" + title (a exceção declarada `data-reticencias-com-title`, como a do P71) */}
                    <div className="flex min-w-0 flex-1 items-baseline gap-1.5" data-testid="nota-razao-social" data-reticencias-com-title=""
                      title={fornecedor ? fornecedor.nome : `${caixaDeTitulo(razaoSocial)}${receita ? ' (Receita)' : ''} — no DANFE: ${n.emitente.nome}`}>
                      <span className="shrink-0 text-[10px] text-muted-foreground">Razão social</span>
                      <span className="min-w-0 truncate text-[11px] font-medium">{fornecedor ? fornecedor.nome : caixaDeTitulo(razaoSocial)}</span>
                    </div>
                    {conflito ? (
                      <Kv k="Já é de" v={`${conflito.nome}${conflito.ativo ? '' : ' (inativo)'}`} erro testid="nota-conflito" className="max-w-[45%] shrink-0"
                        titulo={`Este CNPJ já é de ${conflito.nome}${conflito.ativo ? ' (ativo)' : ' (inativo)'}. Use este cadastro.`} />
                    ) : semDocumento ? (
                      <Kv k="Cadastro" v={`sem CNPJ${uso ? ` · ${uso.lancamentos} lanç. · último ${uso.ultimo ? dataInteira(uso.ultimo) : '—'}` : ''}`} testid="nota-sem-cnpj" className="max-w-[45%] shrink-0"
                        titulo={`${fornecedor?.nome ?? ''} — cadastro achado pelo nome, sem CNPJ. Completar este cadastro com o CNPJ da nota em vez de criar outro.`} />
                    ) : (
                      <Kv k="Nome" v={receita ? <span className="text-[#1f7a45]">completo pela Receita</span> : <span className="text-amber-800">como no DANFE</span>} className="shrink-0"
                        titulo={receita ? 'Razão social inteira da consulta pública do CNPJ.' : (receitaFrase ?? 'Consultando a Receita…')} />
                    )}
                  </div>
                  <div className="flex h-4 min-w-0 items-baseline gap-3 whitespace-nowrap">
                    <Kv num k={soDigitos(n.emitente.documento).length === 11 ? 'CPF' : 'CNPJ'} v={documentoFormatado(n.emitente.documento)} erro={erroEm('cnpj')} testid="nota-documento-emitente" className="shrink-0" />
                    <Kv num k="IE" v={n.emitente.ie ?? '—'} className="shrink-0" />
                    <div className="flex min-w-0 items-baseline gap-1.5" title={enderecoTexto ? `${enderecoTexto} · ${cidade}` : cidade} data-testid="nota-cidade" data-reticencias-com-title="">
                      <span className="shrink-0 text-[10px] text-muted-foreground">Cidade/UF</span>
                      <span className="min-w-0 truncate text-[11px] font-medium">{cidade}</span>
                    </div>
                  </div>
                </div>
                <div className="campos-uma-linha flex w-[124px] shrink-0 flex-col items-stretch gap-1">
                  {precisaCadastrar && (
                    <Button type="button" size="sm" className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado} onClick={() => { void cadastrar(); }} data-testid="nota-cadastrar-fornecedor">
                      {ocupado === 'cadastrar' ? 'Cadastrando…' : res.filialDiferente ? 'Cadastrar esta filial' : 'Cadastrar com estes dados'}
                    </Button>
                  )}
                  {escolherEntre.length > 0 && (
                    <div className="w-full">
                      <SearchableSelect value="" onValueChange={(v) => setFavorecidoId(v || null)} semTodos allValue="" allLabel="Escolha o cadastro" dense
                        options={escolherEntre.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Buscar…" triggerClassName="h-[22px] text-[10.5px]" />
                    </div>
                  )}
                  {conflito && conflito.ativo && (
                    <Button type="button" size="sm" className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado} data-testid="nota-usar-este"
                      onClick={() => { setFavorecidoId(conflito.id); setConflito(null); setNovoPorEscolha(false); }}>Usar este</Button>
                  )}
                  {favorecidoId && (semDocumento || completar.length > 0) && (
                    <Button type="button" size="sm" variant={semDocumento ? 'default' : 'outline'} className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado}
                      onClick={() => { void completarCadastro(); }} data-testid="nota-completar-fornecedor"
                      title={semDocumento ? 'Completar este cadastro com o CNPJ (e o que estiver vazio) em vez de criar outro.' : `Preenche no cadastro só o que está vazio: ${fraseDoCompletar(completar)}.`}>
                      {ocupado === 'completar' ? 'Completando…' : semDocumento ? 'Completar com o CNPJ' : 'Completar cadastro'}
                    </Button>
                  )}
                  {((semDocumento && favorecidoId === res.propostoId) || escolherEntre.length > 0) && (
                    <button type="button" className="h-[16px] text-[10px] text-muted-foreground underline underline-offset-2" disabled={!!ocupado} data-testid="nota-cadastrar-outro"
                      onClick={() => { setNovoPorEscolha(true); setFavorecidoId(null); }}>Cadastrar outro</button>
                  )}
                </div>
              </div>
            </section>
            </div>
            {/* as abas (altura fixa; nada some): Parcelas × sistema · Como vai ficar · Itens · Lançamento (estreita: Arquivo antes) */}
            {procurandoNoSistema ? (
              /* o esqueleto: as abas DESENHADAS e desabilitadas (nada focável: o foco do diálogo nunca cai num botão que vai sumir) */
              <span className="flex h-[22px] shrink-0 items-center gap-3 self-start rounded-md bg-card px-2 text-[10.5px] text-muted-foreground opacity-60" data-testid="nota-abas-procurando">
                {nomesJa.map((o) => <span key={o.valor}>{o.nome}</span>)}
              </span>
            ) : (
            <span className="shrink-0 self-start rounded-md bg-card" data-testid="nota-abas-ja">
              <Segmentado<AbaDaNotaJa> altura={22} valor={abaJa} onEscolher={irParaAba} opcoes={opcoesJa} />
            </span>
            )}
            </>)}
            {(!telaJa && (!estreito || aba === 'nota')) && (<>
            {/* ── NOTA ─────────────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-nota">
              <TituloDoBloco nome="Nota" acao={pelaChave
                ? <span className={CHIP_AVISO} data-testid="nota-chave" title="Da chave vêm o CNPJ, o número, a série e o mês; a emissão e o valor são seus.">{ROTULO_PELA_CHAVE}</span>
                : <span className={divergencias.length ? CHIP_ERRO : CHIP_OK} data-testid="nota-chave"
                title={avulsa ? 'Nota avulsa (série 890–899): emitida pelo fisco em nome do produtor; a chave traz o CNPJ do órgão emissor.' : undefined}>{fraseDaChave(divergencias, avulsa)}</span>} />
              <div className={GRADE_KV}>
                <Kv num k="NF" v={numeroDaNota(n.numero)} erro={erroEm('numero')} testid="nota-numero" />
                <Kv num k="Série" v={n.serie} erro={erroEm('serie')} />
                {pelaChave ? (<>
                  {/* P95 — o que a chave nao traz: campos em ambar, no lugar dos lidos */}
                  <Kv num k="Emissão" v={<DatePicker value={digitado.emissao} onChange={(v) => { setVencimento((x) => (!x || x === digitado.emissao ? v : x)); setDigitado((d) => ({ ...d, emissao: v })); }} data-testid="nota-emissao-campo" size="compact"
                    className={cn('h-4 w-[108px] text-[10px] border-amber-400 bg-amber-50', !digitado.emissao && 'border-destructive')} />} />
                  <Kv num k="Valor" v={<span data-testid="nota-valor-campo"><CampoMoeda valor={digitado.valorCent == null ? null : digitado.valorCent / 100}
                    onChange={(v) => setDigitado((d) => ({ ...d, valorCent: v == null ? null : Math.round(v * 100) }))}
                    className={cn('h-4 w-[120px] text-[10px] border-amber-400 bg-amber-50', !digitado.valorCent && 'border-destructive')} /></span>} />
                </>) : (<>
                  <Kv num k="Emissão" v={dataInteira(n.emissao)} erro={erroEm('mes')} />
                  <Kv num k="Valor" v={`R$ ${reais(n.totais.notaCent)}`} />
                </>)}
                <Kv k="Natureza" v={n.naturezaOperacao || '—'} titulo={n.naturezaOperacao} className="col-span-2" />
                {/* P95 — pela chave, o desconto nao e' conhecido: "—" (zero nunca substitui dado ausente) */}
                <Kv num k="Desconto" v={pelaChave ? '—' : `R$ ${reais(n.totais.descontoCent)}`} />
                <Kv k="Destinatário" v={`${n.destinatario.nome ? caixaDeTitulo(n.destinatario.nome) : '—'}${clienteNome ? ` · ${clienteNome}` : ''}`}
                  titulo={`${n.destinatario.nome ?? ''}${clienteNome ? ` · ${clienteNome}` : ''}`} />
                {/* NOTA-AVULSA-890-01 — UMA LINHA RESERVADA (nada se desloca de uma nota para outra): os dados adicionais da nota; na remessa
                    de entrega futura, o aviso (ambar, nunca bloqueio) */}
                {remessa ? (
                  <div className="col-span-full flex h-[16px] min-w-0 items-center rounded-sm bg-amber-50 px-1 text-[10px] text-amber-900" data-testid="nota-aviso-remessa" title={remessa}>
                    <span className="min-w-0 uma-linha-que-rola">{remessa}</span>
                  </div>
                ) : (
                  <div className="col-span-full flex h-[16px] min-w-0 items-center gap-1.5 px-1 text-[10px]" data-testid="nota-dados-adicionais" title={n.informacoesComplementares ?? undefined}>
                    <span className="shrink-0 text-muted-foreground">Dados adicionais</span>
                    <span className="min-w-0 uma-linha-que-rola">{n.informacoesComplementares || '—'}</span>
                  </div>
                )}
              </div>
            </section>

            {/* ── FORNECEDOR ───────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-fornecedor">
              <TituloDoBloco nome="Fornecedor" acao={chipFornecedor} />
              <div className="flex min-w-0 items-start gap-2.5">
                <div className={cn(GRADE_KV, 'min-w-0 flex-1')}>
                  <Kv k="Razão social" v={fornecedor ? fornecedor.nome : caixaDeTitulo(razaoSocial)} className="col-span-2"
                    titulo={fornecedor ? fornecedor.nome : `${caixaDeTitulo(razaoSocial)}${receita ? ' (Receita)' : ''} — no DANFE: ${n.emitente.nome}`} />
                  <Kv num k={soDigitos(n.emitente.documento).length === 11 ? 'CPF' : 'CNPJ'} v={documentoFormatado(n.emitente.documento)} erro={erroEm('cnpj')} testid="nota-documento-emitente" />
                  <Kv num k="IE" v={n.emitente.ie ?? '—'} />
                  <Kv k="Endereço" v={enderecoTexto || '—'} titulo={enderecoTexto} className="col-span-2" />
                  <Kv k="Cidade/UF" v={cidade} titulo={cidade} />
                  {conflito ? (
                    <Kv k="Já é de" v={`${conflito.nome}${conflito.ativo ? '' : ' (inativo)'}`} erro testid="nota-conflito"
                      titulo={`Este CNPJ já é de ${conflito.nome}${conflito.ativo ? ' (ativo)' : ' (inativo)'}. Use este cadastro.`} />
                  ) : semDocumento ? (
                    <Kv k="Cadastro" v={`sem CNPJ${uso ? ` · ${uso.lancamentos} lanç. · último ${uso.ultimo ? dataInteira(uso.ultimo) : '—'}` : ''}`} testid="nota-sem-cnpj"
                      titulo={`${fornecedor?.nome ?? ''} — cadastro achado pelo nome, sem CNPJ. Completar este cadastro com o CNPJ da nota em vez de criar outro.`} />
                  ) : (
                    <Kv k="Nome" v={receita ? <span className="text-[#1f7a45]">completo pela Receita</span> : <span className="text-amber-800">como no DANFE</span>}
                      titulo={receita ? 'Razão social inteira da consulta pública do CNPJ.' : (receitaFrase ?? 'Consultando a Receita…')} />
                  )}
                </div>
                <div className="campos-uma-linha flex w-[150px] shrink-0 flex-col items-stretch gap-1">
                  {precisaCadastrar && (
                    <Button type="button" size="sm" className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado} onClick={() => { void cadastrar(); }} data-testid="nota-cadastrar-fornecedor">
                      {ocupado === 'cadastrar' ? 'Cadastrando…' : res.filialDiferente ? 'Cadastrar esta filial' : 'Cadastrar com estes dados'}
                    </Button>
                  )}
                  {escolherEntre.length > 0 && (
                    <div className="w-full">
                      <SearchableSelect value="" onValueChange={(v) => setFavorecidoId(v || null)} semTodos allValue="" allLabel="Escolha o cadastro" dense
                        options={escolherEntre.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Buscar…" triggerClassName="h-[22px] text-[10.5px]" />
                    </div>
                  )}
                  {conflito && conflito.ativo && (
                    <Button type="button" size="sm" className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado} data-testid="nota-usar-este"
                      onClick={() => { setFavorecidoId(conflito.id); setConflito(null); setNovoPorEscolha(false); }}>Usar este</Button>
                  )}
                  {favorecidoId && (semDocumento || completar.length > 0) && (
                    <Button type="button" size="sm" variant={semDocumento ? 'default' : 'outline'} className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado}
                      onClick={() => { void completarCadastro(); }} data-testid="nota-completar-fornecedor"
                      title={semDocumento ? 'Completar este cadastro com o CNPJ (e o que estiver vazio) em vez de criar outro.' : `Preenche no cadastro só o que está vazio: ${fraseDoCompletar(completar)}.`}>
                      {ocupado === 'completar' ? 'Completando…' : semDocumento ? 'Completar com o CNPJ' : 'Completar cadastro'}
                    </Button>
                  )}
                  {((semDocumento && favorecidoId === res.propostoId) || escolherEntre.length > 0) && (
                    <button type="button" className="h-[16px] text-[10px] text-muted-foreground underline underline-offset-2" disabled={!!ocupado} data-testid="nota-cadastrar-outro"
                      onClick={() => { setNovoPorEscolha(true); setFavorecidoId(null); }}>Cadastrar outro</button>
                  )}
                </div>
              </div>
            </section>
            </>)}

            {(telaJa || !estreito || aba === 'lancamento') && (<>
            {/* ── NOTA-JA-LANCADA-01: no lugar de Parcelas e Itens, o que ja' esta' lancado (mesma altura: nada se desloca) ───── */}
            {procurandoNoSistema ? (
              /* o esqueleto da tela nova, enquanto a busca roda (nunca a tela antiga) */
              <section className={cn(BLOCO, 'min-h-0 flex-1 items-center justify-center')} data-testid="nota-procurando">
                <p className="text-[10.5px] text-muted-foreground">Procurando esta nota no sistema…</p>
              </section>
            ) : modoJa && jaLancada ? (abaJa === 'hoje' ? quadroDeHoje : abaJa === 'sistema' ? (
              /* P128a (NOTA-JA-LANCADA, mock aprovado 27/10) — ESTA NOTA JÁ ESTÁ NO SISTEMA: a frase do que foi achado, a TABELA SISTEMA × NOTA com todas
                 as parcelas (rola por dentro, cabeçalho preso; diferença em vermelho; nunca corrigida sozinha no realizado/conciliado) e os TRÊS
                 CAMINHOS lado a lado, cada um dizendo o que muda e o que não muda. Mesma altura do bloco de parcelas: nada se desloca. */
              <section className={cn(BLOCO, 'min-h-0 flex-1')} data-testid="nota-ja-lancada">
                <TituloDoBloco nome="Esta nota já está no sistema" acao={<span className={CHIP_AVISO}>
                  {/* P167 — a outra compra do mesmo fornecedor fica de fora (nunca recebe a nota) e o chip diz */}
                  {jaLancada.outraCompra.length ? <span data-testid="nota-outra-compra">{jaLancada.outraCompra.length} de outra compra (fica de fora)</span>
                    : jaLancada.outrosParecidos ? `+${jaLancada.outrosParecidos} parecido${jaLancada.outrosParecidos === 1 ? '' : 's'} (outra compra igual?)` : 'a ação em cada linha'}</span>} />
                {/* a frase: 2 linhas reservadas (nada se desloca), o texto inteiro no title */}
                <p className="h-[26px] shrink-0 overflow-hidden whitespace-normal text-[10px] leading-[13px] text-foreground" title={fraseAchado}
                  data-testid="nota-ja-lancada-resumo">{fraseDoCartao ?? fraseAchado}</p>
                {/* Caso 3 — as duas leituras da posição discordam: a tela PERGUNTA (lugar reservado; nada se grava antes da resposta) */}
                {noCartao && !noCartao.leituras.concordam && (
                  <div className="mb-1 flex h-[24px] shrink-0 items-center gap-2 rounded bg-amber-50 px-1.5 text-[10px] text-amber-900" data-testid="nota-cartao-pergunta">
                    <span className="shrink-0 font-medium">Qual a posição no cartão?</span>
                    <Segmentado<'descricao' | 'ordem'> altura={20} valor={leituraDoCartao ?? undefined} onEscolher={setLeituraDoCartao}
                      opcoes={opcoesDaLeitura} />
                  </div>
                )}
                {/* Mock da nota já lançada (29/10) — "PARCELAS × SISTEMA": cada parcela da NOTA ao lado do que está no SISTEMA HOJE (as passadas pagas/
                    conciliadas inclusive) e O QUE ACONTECE com ela — a Ação (escolha na linha) e o Efeito; os 3 cartões de caminho saíram. A diferença
                    da nota em vermelho; a parecida (achada só pelo valor) em âmbar. O quadro rola por dentro (de lado, na janela estreita). */}
                <div className="min-h-0 flex-1 overflow-auto" data-testid="nota-ja-lancada-rolagem">
                  {/* de 1024 para cima a tabela CABE (nada corta): Ação e Efeito curtos (o inteiro no title); estreita, rola de lado */}
                  <table className="w-full min-w-[780px] table-fixed border-collapse">
                    <colgroup><col style={{ width: 36 }} /><col style={{ width: 66 }} /><col style={{ width: 62 }} /><col style={{ width: 68 }} /><col style={{ width: 66 }} />
                      <col /><col style={{ width: 76 }} /><col style={{ width: 62 }} /><col style={{ width: 72 }} /><col style={{ width: 74 }} /><col style={{ width: 98 }} /></colgroup>
                    <thead className="sticky top-0 z-10 bg-primary">
                      <tr>
                        <th className={cn(TH9, 'text-center')} colSpan={3}>Na nota</th>
                        <th className={cn(TH9, 'border-l-2 border-primary-foreground/40 text-center')} colSpan={6}>No sistema hoje</th>
                        <th className={cn(TH9, 'border-l-2 border-primary-foreground/40 text-center')} colSpan={2}>O que acontece</th>
                      </tr>
                      <tr>
                        {[['Parc.', ''], ['Venc.', ''], ['Valor', 'n'], ['Venc.', 'sep'], ['Pgto.', ''], ['Descrição', ''], ['Conta', ''], ['Valor', 'n'], ['Status', ''], ['Ação', 'sep'], ['Efeito', '']].map(([h, a], i) => (
                          <th key={i} className={cn(TH9, a === 'n' && 'text-right', a === 'sep' && 'border-l-2 border-primary-foreground/40')} title={h}>{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {linhasDaTabela.map((x) => {
                        const l = x.sistema;
                        const conta = l?.contaBancariaId ? contas.find((c) => c.id === l.contaBancariaId) : undefined;
                        const nomeDaConta = conta ? (conta.nome_exibicao || conta.nome_conta) : '—';
                        const parecida = !!l && !l.por.some((q) => q === 'numero' || q === 'chave' || q === 'parcelamento');
                        const efeito = efeitoDaLinha(x);
                        const SEP = 'border-l-2 border-primary/30';
                        return (
                          <tr key={x.chave} className={cn('border-b border-border/50', parecida && 'bg-amber-50/70', l && l.id === partindoDe && 'font-semibold')}
                            data-testid="nota-ja-lancada-linha" data-situacao={x.situacao} data-este={l && l.id === partindoDe ? '' : undefined} data-parecida={parecida ? '' : undefined}>
                            <td className={cn(TDN9, 'text-left')} title={x.dica ?? undefined} data-testid="nota-ja-lancada-parc">{x.rotulo}</td>
                            <td className={cn(TDN9, 'text-left')}>{x.notaVencimento ? dataInteira(x.notaVencimento) : '—'}</td>
                            <td className={TDN9}>{x.notaValorCent !== null ? reais(x.notaValorCent) : '—'}</td>
                            {l ? (<>
                              <td className={cn(TDN9, SEP, 'text-left', x.difData && 'font-medium text-destructive')} data-testid="nota-ja-lancada-venc-sistema"
                                title={x.difData ? 'o vencimento do sistema difere do da nota' : undefined}>{dataInteira(l.vencimento ?? l.competencia)}</td>
                              <td className={cn(TDN9, 'text-left text-muted-foreground')} data-testid="nota-ja-lancada-pgto">{l.pagamento ? dataInteira(l.pagamento) : '—'}</td>
                              <td className={TD9} title={l.descricao ?? undefined} data-testid="nota-ja-lancada-descricao">{l.descricao || '—'}</td>
                              <td className={TD9} title={nomeDaConta} data-testid="nota-ja-lancada-conta">{nomeDaConta}</td>
                              <td className={cn(TDN9, x.difValor && 'font-medium text-destructive')} data-testid="nota-ja-lancada-valor-sistema"
                                title={x.difValor ? 'o valor do sistema difere do da nota' : undefined}>{reais(l.valorCent)}</td>
                              <td className={TD9} title={l.conciliado ? 'conciliada com o extrato: valor, data, conta e status nunca mudam' : TEXTO_DA_SITUACAO[x.situacao]}>
                                <span className={CHIP_DA_SITUACAO[x.situacao]} data-testid="nota-ja-lancada-situacao">{TEXTO_DA_SITUACAO[x.situacao]}</span></td>
                            </>) : (
                              <>
                                {/* seis células (nunca colSpan): cada valor na sua coluna (a regra soberana do alinhamento) */}
                                <td className={cn(TDN9, SEP, 'text-left text-muted-foreground')}>—</td>
                                <td className={cn(TDN9, 'text-left text-muted-foreground')}>—</td>
                                <td className={cn(TD9, 'text-muted-foreground')} title="não existe no sistema" data-testid="nota-ja-lancada-nao-existe">não existe no sistema</td>
                                <td className={cn(TD9, 'text-muted-foreground')}>—</td>
                                <td className={cn(TDN9, 'text-muted-foreground')}>—</td>
                                <td className={cn(TD9, 'text-muted-foreground')}>—</td>
                              </>
                            )}
                            <td className={cn(TD9, SEP)} data-testid="nota-ja-lancada-acao">{acaoDaLinhaUI(x, parecida)}</td>
                            <td className={TD9} title={`${l && l.id === partindoDe ? 'este lançamento · ' : ''}${efeito.texto}${efeito.cadeado ? ' · valor, data e conta não mudam' : ''}${l ? ` · documento hoje: ${l.temEstaNota ? 'com esta nota' : (l.documentos ?? 0) > 0 ? `${l.documentos} ${l.documentos === 1 ? 'arquivo' : 'arquivos'} · sem esta nota` : 'sem a nota'}` : ''}`} data-testid="nota-ja-lancada-efeito">
                              <span className="flex min-w-0 items-center gap-1">
                                <span className="min-w-0 truncate">{l && l.id === partindoDe ? `este lançamento · ${efeito.curto}` : efeito.curto}</span>
                                {efeito.cadeado && <Lock className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-label="valor, data e conta não mudam" data-testid="nota-ja-lancada-cadeado" />}
                              </span></td>
                          </tr>
                        );
                      })}
                      {/* D — os CANCELADOS desta nota: no fim, cinza, com o selo; nunca contam nem recebem a nota */}
                      {jaLancada.cancelados.map((l) => (
                        <tr key={l.id} className="border-b border-border/50 text-muted-foreground" data-testid="nota-ja-lancada-cancelado">
                          <td className={cn(TDN9, 'text-left')} title="cancelado: não conta como já lançada">—</td>
                          <td className={cn(TDN9, 'text-left')}>—</td>
                          <td className={TDN9}>—</td>
                          <td className={cn(TDN9, 'border-l-2 border-primary/30 text-left')}>{dataInteira(l.vencimento ?? l.competencia)}</td>
                          <td className={cn(TDN9, 'text-left')}>{l.pagamento ? dataInteira(l.pagamento) : '—'}</td>
                          <td className={TD9} title={l.descricao ?? ''}>{l.descricao ?? '—'}</td>
                          <td className={TD9}>—</td>
                          <td className={TDN9}>{reais(l.valorCent)}</td>
                          <td className={TD9} title={`cancelado (era ${l.status ?? '—'})`}><span className={CHIP_CANCELADO} data-testid="nota-selo-cancelado">cancelado</span></td>
                          <td className={cn(TD9, 'border-l-2 border-primary/30')}>—</td>
                          <td className={TD9} title="cancelado: não conta nem recebe a nota">fica como está</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* P96a — a NF digitada à mão numa das N que diverge da nota lida: mostrar, nunca trocar sozinho (2 linhas reservadas, P104) */}
                {nfDigitada && (
                  <div className="mt-1 flex shrink-0 items-center gap-2 rounded bg-amber-50 px-1.5 text-amber-900" data-testid="nota-nf-digitada">
                    <p className="h-[26px] min-w-0 flex-1 overflow-hidden whitespace-normal text-[9.5px] leading-[13px]" data-testid="nota-nf-digitada-frase">
                      {fraseDaNfDigitada(nfDigitada, notaLida)}</p>
                    <Button type="button" size="sm" variant="outline" className="h-[22px] shrink-0 px-2 text-[10.5px]" disabled={!!ocupado}
                      onClick={() => setConfirmarNotaLida(true)} data-testid="nota-usar-nota-lida">Usar a nota lida</Button>
                  </div>
                )}
                {/* P163-2 — o que DIFERE entre elas (a descrição, a competência, a conta): dito, nunca corrigido aqui (a aba 3 escolhe o que padronizar) */}
                {diferencasDasAchadas && (
                  <p className="mt-1 h-[26px] shrink-0 overflow-hidden whitespace-normal rounded bg-amber-50 px-1.5 text-[9.5px] leading-[13px] text-amber-900"
                    title={`${diferencasDasAchadas} A conta muda só nas não pagas; a safra vai pela competência; o resto fica como está.`} data-testid="nota-ja-lancada-diferencas">⚠ {diferencasDasAchadas}</p>
                )}
              </section>
            ) : abaJa === 'ficar' ? null : abaJa === 'arquivo' ? quadroDoArquivo : abaJa === 'lancamento' ? (nACriar > 0 ? null : (
              <section className={cn(BLOCO, 'min-h-0 flex-1 items-center justify-center text-center')} data-testid="nota-nada-a-criar">
                <p className="text-[10.5px] text-muted-foreground">Nada a criar: {faltamDaNota.length ? 'as parcelas que faltam ficam sem criar (a ação na linha).' : 'todas as parcelas da nota já estão no sistema.'}</p>
              </section>
            )) : (
              /* P163-2 — a aba 4 "Itens da nota", SEMPRE: sem itens legíveis (o PDF escaneado), a frase e "Anexar o XML desta nota" (a mesma chave;
                 os itens se guardam pela `fn_nota_fiscal_gravar` — o XML manda sobre o PDF) */
              itensFiscais ? (
                /* a MESMA vista do cadastro por NF: os itens e a conta de cada um (pendente; o Aplicar grava pela divisão de hoje) */
                <div className="flex min-h-0 flex-1 flex-col" data-testid="nota-aba-itens">
                  <ItensDaNota cabecalho={itensFiscais.cabecalho} lidos={itensFiscais.lidos} contaDoLancamento={contaDeHojeDosItens ? classificacoes.find((c) => c.id === contaDeHojeDosItens)?.subcentro ?? null : null} testId="nota-itens-fiscais"
                    vistaContas={divideNoAplicar ? (
                      <ContasDosItens itens={itensFiscais.lidos.itens} classificacoes={classificacoes} tipoOperacao={plano?.tipo_operacao || '2-Saídas'} aoSalvar
                        contaDeHoje={contaDeHojeDosItens} sugeridas={new Map()} gravando={ocupado === 'atualizar'} pendente={contasDosItens} onMudou={setContasDosItens}
                        onDividir={(mapa) => setContasDosItens(mapa)} />
                    ) : (
                      <p className="px-2 py-1 text-[10px] text-muted-foreground" data-testid="nota-itens-sem-dividir">
                        A conta por item grava com um lançamento só ou com as parcelas juntadas numa compra; aqui ela não se divide (junte as parcelas, ou divida pelo cadastro do parcelamento).</p>
                    )} />
                </div>
              ) : itensCarregando ? (
                /* o esqueleto da versão FINAL (a mesma moldura), enquanto os itens chegam — nunca a tabela simples */
                <section className={cn(BLOCO, 'min-h-0 flex-1')} data-testid="nota-aba-itens">
                  <TituloDoBloco nome="Itens da nota" dica="Valores · Fiscal · Contas" />
                  <p className="m-auto text-[10.5px] text-muted-foreground" data-testid="nota-itens-carregando">Carregando os itens da nota…</p>
                </section>
              ) : (
                <section className={cn(BLOCO, 'min-h-0 flex-1 items-center justify-center gap-2 text-center')} data-testid="nota-aba-itens">
                  <p className="text-[10.5px] text-foreground" data-testid="nota-sem-itens">A nota não trouxe itens legíveis.</p>
                  <p className="max-w-[420px] text-[10px] text-muted-foreground">Anexe o XML desta nota (a mesma chave): os itens vêm dele e ficam guardados com a nota.</p>
                  <label className={cn('inline-flex h-[24px] cursor-pointer items-center rounded-md border bg-card px-2.5 text-[10.5px] font-medium', (lendoXml || !!ocupado) && 'pointer-events-none opacity-50')}
                    data-testid="nota-anexar-xml">
                    {lendoXml ? 'Lendo o XML…' : 'Anexar o XML desta nota'}
                    <input type="file" accept=".xml,application/xml,text/xml" className="sr-only" data-testid="nota-anexar-xml-arquivo"
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void anexarXmlDosItens(f); }} />
                  </label>
                  <p className="h-[13px] text-[10px] text-destructive" data-testid="nota-anexar-xml-erro">{erroDoXml ?? ''}</p>
                </section>
              )
            )) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <section className={cn(BLOCO, 'min-h-0', como === 'cartao' && 'col-span-2')} data-testid="nota-bloco-parcelas">
                {/* P74 — "Como foi pago?" no lugar de "Parcelas da nota": a escolha no título; o conteúdo troca DENTRO do bloco (a altura é a
                    do bloco, nada de fora se desloca) */}
                {/* o seletor no título: suspenso (cabe em qualquer largura; o segmentado de três opções não cabia na meia coluna a 750px) e LOGO DEPOIS
                    do nome, à esquerda — no cartão o bloco fica mais largo, e na ponta direita o seletor andaria (o título é o do TituloDoBloco) */}
                <div className="mb-1 flex min-h-[16px] min-w-0 items-center gap-2 border-b border-border/60" data-titulo-do-bloco="">
                  <h3 className="shrink-0 text-[11px] font-semibold leading-[15px] text-foreground">Como foi pago?</h3>
                  <Select value={como} onValueChange={(v) => { if (v === 'duplicatas' || v === 'avista' || v === 'cartao') setComo(v); }}>
                    <SelectTrigger className="h-[18px] w-[128px] shrink-0 whitespace-nowrap px-1.5 text-[10px]" data-testid="nota-como-foi-pago" title={como === 'duplicatas' ? `Duplicatas da nota (${nDuplicatasDaNota})` : undefined}>
                      {/* no gatilho, o rótulo curto (largura fixa: nada anda de uma nota para outra); na lista, o nome inteiro */}
                      <SelectValue>{como === 'duplicatas' ? `Duplicatas (${nDuplicatasDaNota})` : como === 'avista' ? 'À vista' : 'Cartão em N×'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duplicatas" disabled={nDuplicatasDaNota === 0} title={nDuplicatasDaNota === 0 ? FRASE_NOTA_SEM_DUPLICATAS : undefined}
                        data-testid="nota-como-duplicatas">Duplicatas da nota ({nDuplicatasDaNota})</SelectItem>
                      <SelectItem value="avista" data-testid="nota-como-avista">À vista</SelectItem>
                      <SelectItem value="cartao" data-testid="nota-como-cartao">Cartão em N×</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {como === 'cartao' ? (
                  /* P74 — no cartão o bloco ocupa também o lugar dos Itens (a grade de sempre não cabe em meia coluna): os campos à esquerda, a
                     grade (Igual todo mês / Parcelas livres) à direita, na altura do bloco */
                  <div className="grid min-h-0 flex-1 gap-2" style={{ gridTemplateColumns: '176px minmax(0, 1fr)' }} data-testid="nota-cartao">
                    <div className="campos-uma-linha flex min-w-0 flex-col gap-1">
                      <div className="min-w-0">
                        <span className={cn(REGUA_ROTULO, !cartaoId && 'text-destructive')}>Cartão</span>
                        <ContaBancariaSelect value={cartaoId || '__none__'} onValueChange={(v) => { setCartaoId(v === '__none__' ? '' : v); setPrimeiraEditada(false); }}
                          contas={cartoes} placeholder="Selecione" prependItems={[{ value: '__none__', label: 'Selecione o cartão' }]}
                          className={cn('h-[22px] text-[10.5px]', !cartaoId && 'border-destructive')} />
                      </div>
                      <div className="min-w-0">
                        <span className={cn(REGUA_ROTULO, modoCartao === 'mensal' && !nCartaoValido && 'text-destructive')}>Parcelas</span>
                        <Input value={modoCartao === 'livres' ? String(livresCartao.length) : nCartaoTexto} onChange={(e) => setNCartaoTexto(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          disabled={modoCartao === 'livres'} inputMode="numeric" placeholder={`${MIN_PARCELAS_DO_CARTAO} a ${MAX_PARCELAS_DO_CARTAO}`} data-testid="nota-cartao-parcelas"
                          title={modoCartao === 'livres' ? 'Em Parcelas livres, acrescente ou retire na grade.' : undefined}
                          className={cn('h-[22px] px-2 text-[10.5px] tabular-nums', modoCartao === 'mensal' && !nCartaoValido && 'border-destructive')} />
                      </div>
                      <div className="min-w-0">
                        {/* P104 — o rótulo da sugestão em duas linhas RESERVADAS, fonte menor: nunca rola escondido no lugar */}
                        <span className={cn('mb-0.5 block h-[26px] overflow-hidden whitespace-normal break-words text-[9.5px] font-normal leading-[13px] text-muted-foreground',
                          sugeridaAtiva && 'text-amber-800', modoCartao === 'mensal' && !primeira && 'text-destructive')}
                          data-testid="nota-cartao-rotulo-fatura" title={sugeridaAtiva ? 'O dia mais frequente das faturas deste cartão nos últimos 12 meses, no mês seguinte à emissão.' : undefined}>
                          {sugeridaAtiva && diaSugerido ? rotuloDaSugestao(nomeDoCartao, diaSugerido) : '1ª fatura'}</span>
                        <DatePicker value={modoCartao === 'livres' ? (livresCartao[0]?.vencimento ?? '') : primeira} disabled={modoCartao === 'livres'} data-testid="nota-cartao-fatura"
                          onChange={(v) => { setPrimeira(v); setPrimeiraEditada(true); }}
                          className={cn('h-[22px] text-[10.5px]', sugeridaAtiva && 'border-amber-400 bg-amber-50', modoCartao === 'mensal' && !primeira && 'border-destructive')} />
                      </div>
                    </div>
                    <div className="min-h-0 min-w-0">
                      <GradeDeParcelas modo={modoCartao} onModo={trocarModoDoCartao} parcelas={gradeDoCartao} onParcelas={setLivresCartao} compraCent={n.totais.notaCent}
                        oQue={{ frase: 'a nota', rotulo: 'Valor da nota', passaAValer: 'A nota vale' }} base={baseLivresCartao} rotuloVoltar="Desfazer edições"
                        recado={gradeDoCartao.length && gradeDoCartao.every((x) => x.valorCent === gradeDoCartao[0].valorCent)
                          ? `${gradeDoCartao.length} × ${reais(gradeDoCartao[0].valorCent)} = valor da nota` : 'soma = valor da nota'}
                        altura="100%" compacta />
                    </div>
                  </div>
                ) : (
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="nota-parcelas-rolagem">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 90 }} /></colgroup>
                    <thead className="sticky top-0 z-10 bg-primary"><tr><th className={TH}>Nº</th><th className={TH}>Vencimento</th><th className={cn(TH, 'text-right')}>Valor</th></tr></thead>
                    <tbody>
                      {como === 'avista' ? (
                        /* P74 — à vista: UM lançamento, no vencimento escolhido no bloco Lançamento */
                        <tr className="border-b border-border/50" data-testid="nota-parcela-avista">
                          <td className={cn(TDN, 'text-left')}>1/1</td>
                          <td className={cn(TDN, 'text-left')}>{vencimento ? dataInteira(vencimento) : '—'}</td>
                          <td className={TDN}>{reais(p.valorCent)}</td>
                        </tr>
                      ) : p.duplicatas.map((d, i) => (
                        <tr key={`${d.numero}-${i}`} className="border-b border-border/50" data-testid="nota-parcela">
                          <td className={cn(TDN, 'text-left')}>{i + 1}/{nParcelas}</td>
                          <td className={cn(TDN, 'text-left')}>{dataInteira(d.vencimento)}</td>
                          <td className={TDN}>{reais(d.valorCent)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/60 font-semibold"><td className={TD}>Total</td><td className={TD} /><td className={TDN} data-testid="nota-parcelas-total">{reais(como === 'avista' ? p.valorCent : n.somaDuplicatasCent)}</td></tr>
                    </tbody>
                  </table>
                </div>
                )}
              </section>
              {como !== 'cartao' && quadroDosItens}
            </div>
            )}

            {/* ── LANCAMENTO ───────────────────────────────────────────────────────────────────────── */}
            {/* P163-2 — na nota JÁ LANÇADA o bloco só aparece na aba 3, no topo, como o "Para todas" (vale só nas linhas marcadas; e para a que falta) */}
            {/* P163 v4 — o "Para todas" é a 1ª linha da grade; o bloco só aparece (aba 3, embaixo) quando há parcela que FALTA: o que ela leva */}
            {(!telaJa || (modoJa && abaJa === 'lancamento' && nACriar > 0)) && (
            <section className={BLOCO} data-testid="nota-bloco-lancamento">
              <TituloDoBloco nome="Lançamento" dica={modoJa ? `o que a nota não diz para ${nACriar === 1 ? 'a parcela que nasce' : `as ${nACriar} que nascem`}` : 'o que a nota não diz, você escolhe'} acao={acaoDaIe === 'gravar' ? (
                <button type="button" className="text-[10px] font-medium text-primary underline-offset-2 hover:underline" onClick={() => setGravarIeAberto(true)} data-testid="nota-gravar-ie">
                  Gravar a IE {n.destinatario.ie} nesta fazenda
                </button>
              ) : acaoDaIe === 'diverge' ? (
                <span className="text-[10px] text-amber-800" data-testid="nota-ie-diverge"
                  title={`${nomeDaFazenda} tem a IE ${iesDasFazendas?.[fazendaId] ?? ''} e a nota traz ${n.destinatario.ie ?? ''}: a IE gravada não é trocada pela nota.`}>
                  {nomeDaFazenda} tem outra IE ({iesDasFazendas?.[fazendaId]}) · a nota traz {n.destinatario.ie}
                </span>
              ) : undefined} />
              <div className="campos-uma-linha grid grid-cols-4 gap-x-3 gap-y-1">
                <div className="min-w-0">
                  {/* P95 — a falta da fazenda como a do subcentro (rotulo e borda vermelhos; o rodape diz "Falta: fazenda"): a linha "Selecione a
                      fazenda…" do seletor obrigatorio aumentava o bloco e o deslocava ao escolher (a nota sem IE do destinatario, a da chave digitada) */}
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', fazendaPeloEndereco && 'text-amber-800', !fazendaId && 'text-destructive')} data-testid="nota-fazenda-origem">
                    Fazenda{p.fazendaId && fazendaId === p.fazendaId ? (fazendaPeloEndereco ? ` · ${ORIGEM_FAZENDA_PELO_ENDERECO}` : ' · pela IE') : ''}</span>
                  <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas} forcaAdministrativo={false} hideAviso
                    triggerClassName={cn('h-[22px] text-[10.5px]', !fazendaId && 'border-destructive')} />
                </div>
                <div className="min-w-0">
                  {/* P74 — com o cartão, a conta origem é a do cartão (só leitura) */}
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola')}>{como === 'cartao' ? 'Conta origem · pelo cartão' : 'Conta origem'}</span>
                  {como === 'cartao'
                    ? <div className="flex h-[22px] min-w-0 items-center rounded-md border bg-muted/40 px-2 text-[10.5px]" data-testid="nota-conta-pelo-cartao" title={nomeDoCartao || undefined}>
                        <span className="min-w-0 uma-linha-que-rola">{nomeDoCartao || '—'}</span></div>
                    : <ContaBancariaSelect value={contaId} onValueChange={setContaId} contas={contas} placeholder="Selecione" prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                        className="h-[22px] text-[10.5px]" />}
                </div>
                <div className="min-w-0" data-testid="nota-subcentro">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', !planoId && 'text-destructive')} title={origemPlano ? `Sugestão: o ${origemPlano}` : undefined}>Subcentro *{origemPlano ? ` · ${origemPlano}` : ''}</span>
                  <div title={plano?.subcentro}>
                    {/* SELETOR-CONTA-POR-ATIVIDADE-01 — o `EscolherConta` (a atividade primeiro, a busca ja' filtrada por ela) */}
                    <EscolherConta valor={planoId} onEscolher={(c) => { setPlanoId(c.id); setSafraEditada(false); }} classificacoes={saidas} tipoOperacao=""
                      triggerClassName={cn('h-[22px] px-2 text-[10.5px]', !planoId && 'border-destructive')} itemClassName="text-[10.5px]" />
                  </div>
                </div>
                <div className="min-w-0">
                  <span className={REGUA_ROTULO}>Status</span>
                  <div className="flex h-[22px] items-center rounded-md border bg-background px-2 text-[10.5px]" title="Nasce programado, como no Novo lançamento.">Programado</div>
                </div>
                {/* FIN-NOTA-PDF-01b — a segunda linha EXISTE SEMPRE (nada se desloca). NOTA-PREVIA-ATIVIDADE-01: na lavoura, Safra e Cultura
                    (a atividade no rotulo); nas outras, a ATIVIDADE (do subcentro, so' leitura) e a safra que sera' gravada (pela data) */}
                {lavoura ? (<>
                {/* FIN-NOTA-PDF-01b — a segunda linha EXISTE SEMPRE (nada se desloca): Safra e Cultura so' valem na lavoura */}
                <div className="min-w-0" data-testid="nota-safra">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', lavoura && !safraId && 'text-destructive')}>Safra * · Lavoura</span>
                  <div title={safras.find((sf) => sf.id === safraId)?.nome}>
                    <SearchableSelect value={safraId} onValueChange={(v) => { setSafraId(v); setSafraEditada(true); setCultura(null); }} semTodos allValue=""
                      allLabel={lavoura ? 'Selecione a safra…' : 'não se aplica'} dense disabled={!lavoura}
                      options={safrasDaLavoura.map((sf) => ({ value: sf.id, label: sf.nome }))} placeholder="Buscar safra…"
                      triggerClassName={cn('h-[22px] text-[10.5px]', lavoura && !safraId && 'border-destructive')} />
                  </div>
                </div>
                <div className="min-w-0" data-testid="nota-cultura">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', lavoura && cultura === null && 'text-destructive')}>Cultura *</span>
                  <Select value={cultura === null ? '' : cultura || SEM_CULTURA} disabled={!lavoura}
                    onValueChange={(v) => { setCultura(v === SEM_CULTURA ? '' : v); setSafraEditada(true); }}>
                    <SelectTrigger className={cn('h-[22px] text-[10.5px]', lavoura && cultura === null && 'border-destructive')} data-testid="nota-cultura-gatilho">
                      <SelectValue placeholder={lavoura ? 'Selecione…' : 'não se aplica'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_CULTURA}>Todas (rateia)</SelectItem>
                      {[...CULTURAS_LANCAMENTO.filter((c) => culturasDaSafra.includes(c.valor)), ...CULTURAS_LANCAMENTO.filter((c) => !culturasDaSafra.includes(c.valor))]
                        .map((c) => <SelectItem key={c.valor} value={c.valor}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                </>) : (<>
                <div className="min-w-0" data-testid="nota-atividade">
                  <span className={REGUA_ROTULO} title="A atividade vem do subcentro escolhido.">Atividade</span>
                  <div className="flex h-[22px] items-center rounded-md border bg-muted/40 px-2 text-[10.5px]" data-testid="nota-atividade-valor">{plano ? rotuloDaAtividade : '—'}</div>
                </div>
                <div className="min-w-0" data-testid="nota-safra-pela-data">
                  <span className={REGUA_ROTULO}>Safra · pela data</span>
                  <div className="flex h-[22px] min-w-0 items-center rounded-md border bg-muted/40 px-2 text-[10.5px] text-muted-foreground" data-testid="nota-safra-pela-data-valor"
                    title={safraPelaData ? safras.find((sf) => sf.id === safraPelaData)?.nome : undefined}>
                    <span className="min-w-0 uma-linha-que-rola">{!plano ? '—' : atividadeDoPlano === 'administrativo' ? 'sem safra (administrativo)'
                      : safraPelaData ? (safras.find((sf) => sf.id === safraPelaData)?.codigo || safras.find((sf) => sf.id === safraPelaData)?.nome || '—') : 'nenhuma safra nesta data'}</span>
                  </div>
                </div>
                </>)}
                <div className="col-span-2 min-w-0" data-testid="nota-vencimento">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', como !== 'cartao' && !cabeAqui && semDuplicata && 'text-amber-800')}>
                    {como === 'cartao' ? 'Vencimento · pelas faturas do cartão' : cabeAqui ? 'Vencimento · pelas parcelas da nota' : semDuplicata ? 'Vencimento · nota sem duplicata: confira o vencimento'
                      : como === 'avista' ? 'Vencimento · à vista' : 'Vencimento · da duplicata'}
                  </span>
                  {como === 'cartao' && !cabeAqui
                    ? <div className="flex h-[22px] items-center rounded-md border bg-muted/40 px-2 text-[10.5px] tabular-nums">—</div>
                    : cabeAqui
                    ? <div className="flex h-[22px] items-center rounded-md border bg-muted/40 px-2 text-[10.5px] tabular-nums">{dataInteira(p.duplicatas[0]?.vencimento)} a {dataInteira(p.duplicatas[nParcelas - 1]?.vencimento)}</div>
                    : <DatePicker value={vencimento} onChange={setVencimento} data-testid="nota-vencimento-campo"
                        className={cn('h-[22px] text-[10.5px]', semDuplicata && 'border-amber-400 bg-amber-50', !vencimento && 'border-destructive')} />}
                </div>
              </div>
            </section>
            )}
            </>)}

            {/* "Como vai ficar" (o mock v4) — SEMPRE montada na nota já lançada, escondida fora da aba: o botão único do rodapé grava por ela */}
            {modoJa && jaLancada && (
              <div className={abaJa === 'ficar' ? 'flex min-h-0 flex-1 flex-col gap-1.5' : 'hidden'} data-testid="nota-aba-ficar">
                {caminhosDaNota.some((c) => c.id === 'atualizar') && (
                  <label className="flex h-[18px] shrink-0 cursor-pointer items-center gap-1.5 text-[10px]" data-testid="nota-atualizar-nao-pagas"
                    title="As programadas levam o valor e o vencimento da nota; realizadas e conciliadas não mudam.">
                    <Checkbox checked={caminho === 'atualizar'} onCheckedChange={(v) => setCaminho(v === true ? 'atualizar' : 'completar')} className="h-3 w-3" />
                    <span className="min-w-0 uma-linha-que-rola">Atualizar valor e vencimento das programadas pela nota{programadasQueDiferem ? ` (${programadasQueDiferem} ${programadasQueDiferem === 1 ? 'difere' : 'diferem'})` : ' (nenhuma difere)'}</span>
                  </label>
                )}
                <PreviaCompletar embutida open onFechar={() => irParaAba('sistema')} clienteId={clienteId}
                  alvos={alvosDaPrevia} rotulos={rotulosDaPrevia} atualizarNaoPagas={caminho === 'atualizar'} juntar={juntarAgora} chave={n.chave || null} valorNotaCent={n.totais.notaCent}
                  todasIniciais={{ descricaoBase: baseDaDescricao(p.descricao), favorecidoId: favorecidoId ?? null, fazendaId: fazendaId || null, contaId: contaEscolhida,
                    planoContaId: planoId || null, numeroDocumento: formatNFNumber(p.numeroDocumento || n.numero),
                    competencia: n.emissao || null, safraId: lavoura && safraId ? safraId : null }}
                  onConfirmar={completarComNota} opcoes={opcoesDaPrevia} semRodape aoMudarEstado={setEstadoDaPrevia} />
              </div>
            )}

            {/* Mock da nota já lançada (29/10) — o RESULTADO, fixo acima do rodapé (2 linhas reservadas: nada se desloca, nada corta): quantas, a
                soma × a nota, o que vincula e o que nasce, e o JUNTAR (o padrão, a caixinha marcada; quando não junta, a frase do porquê) */}
            {procurandoNoSistema && (
              <div className="flex h-[24px] shrink-0 items-center rounded border border-blue-200 bg-blue-50/60 px-2 text-[10.5px] text-muted-foreground" data-testid="nota-resultado-procurando">
                <b className="mr-1.5 text-primary">Resultado:</b>procurando no sistema…</div>
            )}
            {modoJa && jaLancada && (
              /* Ajuste 29/10 14:02 (item 5) — o Resultado é UMA LINHA, altura fixa (a aba Itens ganha a altura): frases curtas, o detalhe no title —
                 "Resultado: 1 parcela · R$ 1.680,00 = nota · 1 vinculada · contas pelos itens · não junta (1 parcela) · DRE não muda" */
              <div className="flex h-[24px] shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded border border-blue-200 bg-blue-50/60 px-2 text-[10.5px]"
                data-testid="nota-resultado">
                <b className="shrink-0 text-primary">Resultado:</b>
                <span data-testid="nota-resultado-soma" className={cn('shrink-0', somaDosLigadosCent > n.totais.notaCent + 1 && 'text-destructive')}
                  title={Math.abs(somaDosLigadosCent - n.totais.notaCent) <= 1 ? undefined : `a nota é R$ ${reais(n.totais.notaCent)}`}>
                  {alvosEscolhidos.length + nACriar} parcela{alvosEscolhidos.length + nACriar === 1 ? '' : 's'} · R$ {reais(somaDosLigadosCent)} {Math.abs(somaDosLigadosCent - n.totais.notaCent) <= 1 ? '= nota' : somaDosLigadosCent < n.totais.notaCent ? '< nota' : '> nota'}</span>
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="shrink-0" title={alvosEscolhidos.some((l) => l.conciliado || l.status === 'realizado') ? 'as pagas: valor, data e conta não mudam' : undefined}>
                  {alvosEscolhidos.length} vinculada{alvosEscolhidos.length === 1 ? '' : 's'}</span>
                {nACriar > 0 && <><span className="shrink-0 text-muted-foreground">·</span><span className="shrink-0">{nACriar} criada{nACriar === 1 ? '' : 's'}</span></>}
                {nDeixadas > 0 && <><span className="shrink-0 text-muted-foreground">·</span><span className="shrink-0">{nDeixadas} fica{nDeixadas === 1 ? '' : 'm'}</span></>}
                {contasDosItens && divideNoAplicar && <><span className="shrink-0 text-muted-foreground">·</span>
                  <span className="shrink-0" data-testid="nota-resultado-divisao" title={`dividida em ${new Set(contasDosItens.values()).size} contas pelos itens da nota`}>contas pelos itens</span></>}
                <span className="shrink-0 text-muted-foreground">·</span>
                {soltas ? (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1" data-testid="nota-juntar"
                    title="As parcelas ficam como estão (id, valor, vencimento, pagamento, status); só ganham o elo com a compra.">
                    <Checkbox checked={juntarMarcado} onCheckedChange={(v) => setJuntarMarcado(v === true)} className="h-3 w-3" data-testid="nota-juntar-caixa" />
                    <span>junta as {soltas.n}</span>
                  </label>
                ) : juncao.frase ? (
                  <span className="shrink-0 text-amber-900" title={noCartao ? juncao.frase.replace(' duplicatas ', ' parcelas no cartão ') : juncao.frase} data-testid="nota-juntar-frase">
                    ⚠ não junta ({juncao.frase.includes('fica') ? 'uma fica como está' : juncao.frase.includes('já é parcela') || juncao.frase.includes('já são parcelas') ? 'já é parcela' : 'faltam ou sobram'})</span>
                ) : <span className="shrink-0 text-muted-foreground" data-testid="nota-nao-junta">não junta ({alvosEscolhidos.length + nACriar === 1 ? '1 parcela' : 'já é uma compra'})</span>}
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="min-w-0 shrink text-muted-foreground" title={estadoDaPrevia?.fraseDre ?? undefined} data-testid="nota-resultado-dre">
                  {!estadoDaPrevia?.fraseDre ? 'DRE: conferindo…' : estadoDaPrevia.fraseDre === 'DRE: não muda' ? 'DRE não muda' : 'DRE muda (veja o title)'}</span>
              </div>
            )}
          </div>
          )}
        </div>

        {/* ── RODAPE FIXO ──────────────────────────────────────────────────────────────────────────── */}
        <div className="flex h-[38px] shrink-0 items-center gap-2.5 border-t bg-card px-3 text-[10.5px]" data-testid="nota-rodape">
          {bloqueio ? (
            <span className="flex min-w-0 items-center gap-2 text-destructive" data-testid="nota-bloqueio">
              <span className="min-w-0 uma-linha-que-rola" title={bloqueio}>⚠ {bloqueio}</span>
              {registrada && <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => onAbrirRegistrada(registrada)} data-testid="nota-abrir-registrada">abrir</button>}
              {/* P146 — a verificacao que falhou se refaz daqui (o Criar so' volta quando ela responder) */}
              {!registrada && !divergencias.length && naoVerificado && (
                <button type="button" className="shrink-0 font-medium underline underline-offset-2" onClick={() => setTentativa((t) => t + 1)}
                  data-testid="nota-tentar-de-novo">Tentar de novo</button>
              )}
            </span>
          ) : erro ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" title={erro} data-testid="nota-erro">⚠ {erro}</span>
          ) : naoAchouOAberto && !jaLancada ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="nota-porta2-nao-achado"
              title="Aberta pelo Editar lançamento: a busca (nº, chave, soma) não achou este lançamento; criar daqui duplicaria a compra.">
              ⚠ O lançamento aberto não foi achado por esta nota. Nada será criado daqui.</span>
          ) : recusaDaCompra ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="nota-recusa-compra" title={recusaDaCompra}>⚠ {recusaDaCompra}</span>
          ) : faltasQueContam.length && !procurandoNoSistema ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="nota-falta">⚠ Falta: {faltasQueContam.join(', ')}</span>
          ) : null}
          {!bloqueio && !erro && modoJa && posicaoPendente ? (
            <span className="min-w-0 uma-linha-que-rola text-amber-900" data-testid="nota-cartao-falta-posicao">⚠ Diga a posição das parcelas no cartão (aba Parcelas × sistema).</span>
          ) : !bloqueio && !erro && jaLancada && modoJa && estadoDaPrevia?.impedimento ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" title={estadoDaPrevia.impedimento} data-testid="nota-previa-impede">⚠ {estadoDaPrevia.impedimento}</span>
          ) : !bloqueio && !erro && jaLancada && !recusaDaCompra && !faltasQueContam.length ? (
            <span className="min-w-0 uma-linha-que-rola font-medium text-amber-900" data-testid="nota-ja-lancada-frase">Nada é gravado antes de você clicar.</span>
          ) : !bloqueio && !erro && aberto && !telaJa ? (
            /* o pedido do Gabriel: ATUALIZAR o que ja' existe, em vez de criar outro (so' com confirmacao) — só na nota NOVA (na já lançada, a
               tabela já mostra o que existe; a faixa ao lado do "Falta:" o cortava) */
            <span className="flex min-w-0 items-center gap-2 text-amber-900" data-testid="nota-atualizar-faixa"
              title={abertos.map((a) => `${dataInteira(a.vencimento ?? a.competencia)} · ${a.descricao ?? ''} · R$ ${reais(a.valorCent)}`).join(' | ')}>
              <span className="min-w-0 uma-linha-que-rola">
                Já existe lançamento aberto deste fornecedor: {dataInteira(aberto.vencimento ?? aberto.competencia)} · {aberto.descricao ?? 'sem descrição'} · R$ {reais(aberto.valorCent)}
                {abertos.length > 1 ? ` · e mais ${abertos.length - 1}` : ''}
              </span>
              <button type="button" className="shrink-0 font-medium underline underline-offset-2" disabled={!!ocupado}
                onClick={() => setConfirmarAtualizar({ alvo: aberto, parcelar: parcelarAberto })} data-testid="nota-atualizar-este">
                {parcelarAberto ? 'Atualizar e parcelar' : 'Atualizar este'}
              </button>
            </span>
          ) : !bloqueio && !erro && !telaJa ? (
            /* só na nota NOVA: na já lançada o Resultado diz o que acontece com a nota */
            <span className="min-w-0 uma-linha-que-rola text-muted-foreground">
              {como === 'cartao' && cabeAqui && nomeDoCartao ? fraseDoRodapeDoCartao(lido.origem === 'pdf' ? 'PDF' : 'XML', nParcelas, numeroFalado(n.numero), nomeDoCartao)
                : `O ${lido.origem === 'pdf' ? 'PDF' : 'XML'} fica anexado ${cabeAqui ? `às ${nParcelas} parcelas` : 'ao lançamento'} como a NF ${numeroFalado(n.numero)}.`}
              {/* D — so' cancelados desta nota: ela NAO esta' lancada; diz, sem contar */}
              {canceladosSo.length > 0 && <span data-testid="nota-so-cancelados">{` ${canceladosSo.length === 1 ? 'Há 1 lançamento cancelado' : `Há ${canceladosSo.length} lançamentos cancelados`} desta nota (não contam).`}</span>}
            </span>
          ) : null}
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={!!ocupado} onClick={onClose}>Cancelar</Button>
          {/* P128a (porta 2) — aberta pelo Editar: o Novo lançamento criaria outro (o lugar fica reservado: nada se desloca) */}
          <Button type="button" size="sm" variant="outline" className={cn('h-[24px] shrink-0 px-2.5 text-[10.5px]', partindoDe && 'invisible')}
            disabled={!!ocupado || !!bloqueio || verificando || !!partindoDe} onClick={abrirNoLancamento}
            title="Abre o Novo lançamento com tudo o que foi lido e escolhido aqui (nada se perde)." data-testid="nota-abrir-no-lancamento">
            No Novo lançamento
          </Button>
          {/* o botao principal tem a MESMA largura nos dois estados (nada se desloca); "Criar mesmo assim" mora no bloco */}
          {/* P128a — o botão principal faz o CAMINHO escolhido no bloco (a MESMA largura em todos: nada se desloca) */}
          {/* P163-2 — "Criar um lançamento novo (duplica)" mora no ⋯ (pede o motivo, como sempre); a ação normal é completar. No "duplica" o ⋯
              fica (o lugar não some: nada se desloca) e leva de volta a completar */}
          {jaLancada && !bloqueio && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="outline" className="h-[24px] w-[28px] shrink-0 px-0 text-[12px]" disabled={!!ocupado} title="Mais"
                  data-testid="nota-mais">⋯</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {modoJa ? (
                  <DropdownMenuItem className="text-destructive" onSelect={() => setCaminho('criar')} data-testid="nota-mais-criar-novo">
                    Criar um lançamento novo (duplica)…
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setCaminho('completar')} data-testid="nota-mais-voltar-completar">
                    Voltar a completar com a nota
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {procurandoNoSistema ? (
            <Button type="button" size="sm" className="h-[24px] w-[210px] shrink-0 px-2.5 text-[10.5px]" disabled data-testid="nota-completar-revisar">Procurando no sistema…</Button>
          ) : modoJa ? (<>
            {/* P128b/P163-2 — o principal leva à aba 3 (a prévia campo a campo, que grava); nela o lugar fica reservado (nada se desloca) */}
            {/* mock da nota já lançada (29/10): o principal diz o que vai acontecer ("Aplicar: vincular 1 e criar 1") e leva à conferência campo a
                campo ("Como vai ficar"), onde se grava */}
            {/* Gabriel 29/10 10:38 — UM botão, que diz o que faz, e grava de qualquer aba (pela prévia "Como vai ficar", montada sempre) */}
            <Button type="button" size="sm" className="h-[24px] w-[210px] shrink-0 px-2.5 text-[10.5px]" data-testid="nota-completar-revisar"
              disabled={!!ocupado || !!recusaDaCompra || !estadoDaPrevia?.pode || alvosEscolhidos.length + nACriar === 0 || faltasQueContam.length > 0 || posicaoPendente}
              onClick={() => estadoDaPrevia?.gravar()}>
              {ocupado === 'atualizar' || estadoDaPrevia?.gravando ? 'Gravando…' : alvosEscolhidos.length + nACriar === 0 ? 'Nada a aplicar'
                : `Aplicar: ${[alvosEscolhidos.length ? `vincular ${alvosEscolhidos.length}` : '', nACriar ? `criar ${nACriar}` : ''].filter(Boolean).join(' e ')}`}
            </Button>
          </>
          ) : jaLancada && !bloqueio && caminho === 'criar' ? (
            <Button type="button" size="sm" variant="destructive" className="h-[24px] w-[180px] shrink-0 px-2.5 text-[10.5px]" data-testid="nota-criar-duplicando"
              disabled={!podeCriar} onClick={() => setMesmoAssim('')} title={podeCriar ? 'É outra compra: criar mesmo assim (pede o motivo).' : `Para criar, falta: ${faltas.join(', ')}`}>
              {ocupado === 'criar' ? 'Criando…' : 'Criar novo (duplica)'}
            </Button>
          ) : (
          <Button type="button" size="sm" className="h-[24px] w-[180px] shrink-0 px-2.5 text-[10.5px]" disabled={!podeCriar} onClick={() => { void criar(); }} data-testid="nota-criar"
            title={bloqueio ?? (verificando ? 'Verificando se esta nota já foi lançada…' : undefined)}>
            {ocupado === 'criar' ? 'Criando…' : cabeAqui ? `Criar ${nParcelas} parcelas` : 'Criar lançamento'}
          </Button>)}
        </div>
      </DialogContent>

      {telaJa && lido.origem === 'pdf' && (
        <VisualizadorDeDocumento open={vendoNota} onFechar={() => setVendoNota(false)} bytes={bytes} nome={arquivo.name} onNovaAba={abrirEmNovaAba} />
      )}

      <AlertDialog open={!!confirmarAtualizar} onOpenChange={(o) => { if (!o && ocupado !== 'atualizar') setConfirmarAtualizar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmarAtualizar?.parcelar ? 'Atualizar e parcelar este lançamento?' : 'Atualizar este lançamento com a nota?'}</AlertDialogTitle>
            <AlertDialogDescription data-testid="nota-confirmar-texto">
              {confirmarAtualizar ? `${dataInteira(confirmarAtualizar.alvo.vencimento ?? confirmarAtualizar.alvo.competencia)} · ${confirmarAtualizar.alvo.descricao ?? 'sem descrição'} · R$\u00a0${reais(confirmarAtualizar.alvo.valorCent)}. ` : ''}
              {!confirmarAtualizar?.parcelar
                ? `A ${p.rotuloNota} é anexada${confirmarAtualizar?.alvo.financiamentoId ? ' a todas as parcelas dele' : ''} e o número do documento é preenchido onde estiver vazio. Nenhum lançamento novo é criado.`
                : decisao?.tipo === 'diferenca'
                  ? `Já está pago com R$\u00a0${reais(decisao.pagoCent)}; a parcela 1 da nota é R$\u00a0${reais(decisao.parcela1Cent)} (diferença R$\u00a0${reais(Math.abs(decisao.diferencaCent))}). O valor pago não muda.${decisao.repartindo ? ` Repartir: a parcela 1 fica com R$\u00a0${reais(decisao.pagoCent)} e o resto da nota vai para as parcelas 2 a ${nParcelas}.` : ' O valor pago cobre a nota inteira: só dá para anexar a nota.'}`
                  : `Ele vira a parcela 1/${nParcelas} (R$\u00a0${reais(p.duplicatas[0]?.valorCent ?? 0)}, venc. ${dataInteira(p.duplicatas[0]?.vencimento)}) — o mesmo lançamento, com a conciliação e a trilha — e nascem as parcelas 2 a ${nParcelas}. A ${p.rotuloNota} fica anexada a todas.`}
              {confirmarAtualizar?.parcelar && faltas.length ? ` Antes, falta: ${faltas.join(', ')}.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado === 'atualizar'}>Voltar</AlertDialogCancel>
            {confirmarAtualizar?.parcelar && decisao?.tipo === 'diferenca' && (
              <Button type="button" variant="outline" disabled={ocupado === 'atualizar'} data-testid="nota-so-anexar"
                onClick={() => { if (confirmarAtualizar) void atualizar(confirmarAtualizar.alvo, null); }}>Só anexar a nota</Button>
            )}
            {(!confirmarAtualizar?.parcelar || decisao?.tipo === 'cabe' || (decisao?.tipo === 'diferenca' && decisao.repartindo)) && (
              <AlertDialogAction disabled={ocupado === 'atualizar' || (!!confirmarAtualizar?.parcelar && faltas.length > 0)} data-testid="nota-confirmar-atualizar"
                onClick={(e) => {
                  e.preventDefault();
                  if (!confirmarAtualizar) return;
                  const lista = !confirmarAtualizar.parcelar ? null : decisao?.tipo === 'diferenca' ? decisao.repartindo : parcelasDaNota(doXml);
                  void atualizar(confirmarAtualizar.alvo, lista);
                }}>
                {ocupado === 'atualizar' ? 'Atualizando…' : !confirmarAtualizar?.parcelar ? 'Atualizar este' : decisao?.tipo === 'diferenca' ? 'Repartir o resto nas demais' : 'Atualizar e parcelar'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* P96a — "Usar a nota lida": a troca da NF digitada só com confirmação; o digitado fica na Auditoria */}
      <AlertDialog open={confirmarNotaLida} onOpenChange={(o) => { if (!o && ocupado !== 'nota-lida') setConfirmarNotaLida(false); }}>
        <AlertDialogContent data-testid="nota-lida-confirmar">
          <AlertDialogHeader>
            <AlertDialogTitle>Usar a nota lida na NF da {nfDigitada?.rotulo ?? ''}?</AlertDialogTitle>
            <AlertDialogDescription data-testid="nota-lida-texto">
              {nfDigitada ? `Valor R$\u00a0${reais(nfDigitada.valorCent ?? 0)} → R$\u00a0${reais(notaLida.totalCent)}; emissão ${dataInteira(nfDigitada.emissao)} → ${dataInteira(notaLida.emissao)}. O que foi digitado fica na Auditoria do documento. Nenhum lançamento muda.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado === 'nota-lida'}>Voltar</AlertDialogCancel>
            <AlertDialogAction data-testid="nota-lida-gravar" disabled={!!ocupado} onClick={(e) => { e.preventDefault(); void trocarPelaNotaLida(); }}>
              {ocupado === 'nota-lida' ? 'Trocando…' : 'Usar a nota lida'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {comparar && favorecidoId && (
        <CompararCadastroDialog hoje={comparar} proposta={propostaDaNota} rotuloOrigem={receita ? 'Da nota (Receita)' : 'Da nota'}
          emitente={{ documento: n.emitente.documento, nomes: [n.emitente.nome, n.emitente.fantasia, receitaNome] }} uso={uso}
          onConfirmar={gravarComparacao} onClose={() => setComparar(null)}
          onEscolherOutro={() => { setComparar(null); setFavorecidoId(null); setNovoPorEscolha(false); }}
          onCadastrarNovo={() => { setComparar(null); setFavorecidoId(null); setNovoPorEscolha(true); }} />
      )}

      {/* NOTA-FAZENDA-PELA-IE-01 — gravar a IE do destinatario na fazenda escolhida (campo · hoje · da nota, trilha, desfazer) */}
      {gravarIeAberto && fazendaId && n.destinatario.ie && (
        <GravarIeDaFazendaDialog clienteId={clienteId} fazenda={{ id: fazendaId, nome: nomeDaFazenda }} ie={n.destinatario.ie} referencia={p.rotuloNota}
          onClose={() => setGravarIeAberto(false)}
          onGravada={(trilha) => {
            setIesDasFazendas((m) => ({ ...(m ?? {}), [fazendaId]: ieDaNota }));
            toast.success(`IE gravada em ${nomeDaFazenda}`, trilha ? {
              action: { label: 'Desfazer', onClick: () => { void desfazerIeDaFazenda(trilha, clienteId).then((e) => (e ? toast.error(e) : toast.success('Desfeito'))); } },
            } : undefined);
          }} />
      )}

      {/* NOTA-JA-LANCADA-01 — "Criar mesmo assim": e' outra compra; o motivo fica na observacao do que nasce */}
      <AlertDialog open={mesmoAssim !== null} onOpenChange={(o) => { if (!o && ocupado !== 'criar') setMesmoAssim(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar mesmo assim?</AlertDialogTitle>
            <AlertDialogDescription>
              {jaLancada ? `${jaLancada.alvos.length} lançamento${jaLancada.alvos.length === 1 ? '' : 's'} do cliente parece${jaLancada.alvos.length === 1 ? '' : 'm'} ser esta nota. ` : ''}
              Se é outra compra, diga por quê: o motivo fica na observação do que for criado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={mesmoAssim ?? ''} onChange={(ev) => setMesmoAssim(ev.target.value)} placeholder="Motivo (obrigatório)" className="min-h-[60px] text-[11px]" data-testid="nota-mesmo-assim-motivo" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado === 'criar'}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado === 'criar' || !(mesmoAssim ?? '').trim()} data-testid="nota-mesmo-assim-confirmar"
              onClick={(ev) => { ev.preventDefault(); const m = (mesmoAssim ?? '').trim(); if (m) void criar(m).then(() => setMesmoAssim(null)); }}>
              {ocupado === 'criar' ? 'Criando…' : 'Criar mesmo assim'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
