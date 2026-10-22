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
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { BLOCO_FORMULARIO, REGUA_ROTULO, TituloDoBloco } from '@/components/ui/bloco-formulario';
import { ContaBancariaSelect } from '@/components/shared/ContaBancariaSelect';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { PreviaDaNota } from './PreviaDaNota';
import {
  anexarAosJaLancados, atualizarComANota, atualizarEParcelar, criarLancamentoDaNota, criarParcelasDaNota, decisaoDoExistente, formDaNota, GRAVADORES, parcelasDaNota,
  prefillDoModal, type EscolhasDaNota, type Gravadores,
} from './criarDaNota';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { CULTURAS_LANCAMENTO, SEM_CULTURA } from '@/lib/agri/rateioLancamento';
import { safraSugerida } from '@/lib/agri/safraSugerida';
import { useCulturasDaSafra } from '@/hooks/useAreaPlantada';
import type { ParcelaDoPayload } from '@/lib/financiamentos/montarPayloadParcelamento';
import { gravarParcelamento } from './LancamentoV2Dialog';
import { ondeEsta } from './LancamentoDoXml';
import type { DoXml } from '@/lib/financeiro/nfePrefill';
import { resolverEmitente } from '@/lib/financeiro/nfe/resolverEmitente';
import { gravarItensSemTravar } from '@/lib/financeiro/itensDaNotaBanco';
import { casarJaLancados, parcelasParaCasar, type LancamentoJaLancado } from '@/lib/financeiro/nfe/jaLancada';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { CompararCadastroDialog } from './CompararCadastroDialog';
import { propostaDoEmitente, type CadastroParaComparar } from '@/lib/fornecedores/compararCadastro';
import type { NotaDoArquivo } from '@/lib/financeiro/nfe/lerNota';
import { ehSerieAvulsa, type CampoConferido, type CampoDaMarca } from '@/lib/financeiro/nfe/danfe';
import { fraseDaRemessa } from '@/lib/financeiro/nfe/remessaEntregaFutura';
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';
import { dataCurta, documentoFormatado, numeroDaNota, numeroFalado, reais, soDigitos } from '@/lib/financeiro/nfe/formatos';
import {
  camposQueOEmitenteCompleta, completarCadastroPeloXml, fornecedorPeloDocumento, lancamentosAbertosComValor,
  atualizarCamposDoCadastro, cadastroParaComparar, desfazerCamposDoCadastro, notaJaLancada, usoDoFornecedor, type CadastroComODocumento,
  type LancamentoAbertoDaNota, type OcorrenciaDaNota,
} from '@/lib/financeiro/nfeConsultas';
import { caixaDeTitulo, consultarCnpj, type DadosDoCnpj } from '@/lib/fornecedores/consultaCnpj';
import type { CampoDoEmitente } from '@/lib/fornecedores/cadastroDoFornecedor';
import type { ClassificacaoItem, ContaBancariaV2, FornecedorV2, LancamentoV2Form, Safra } from '@/hooks/useFinanceiroV2';
import type { Fazenda } from '@/contexts/FazendaContext';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

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
const TH = 'h-[19px] px-1.5 text-left text-[9.5px] font-medium text-primary-foreground truncate';
const TD = 'h-[19px] px-1.5 text-[10px] leading-none truncate';
const TDN = 'h-[19px] px-1.5 text-right text-[10px] leading-none whitespace-nowrap tabular-nums';
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

export interface NotaParaLancar { arquivo: File; bytes: ArrayBuffer; lido: NotaLidaOk; doXml: DoXml }

export function NotaFiscalDialog({
  open, onClose, clienteId, clienteNome, nota, fazendas, contas, classificacoes, safras = [], fornecedores, onCriarFornecedor, onCriarLancamento,
  onAbrirNoLancamento, onAbrirRegistrada, onCriado, gravadores, consultarReceita = consultarCnpj, gravarItens = gravarItensSemTravar,
}: {
  open: boolean;
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
  /** So' para teste: a consulta da Receita (padrao: `consultarCnpj`). */
  consultarReceita?: typeof consultarCnpj;
  /** ITENS-NOTA-01 — guarda os itens da nota depois de criar (padrao: `gravarItensSemTravar`; o teste troca). */
  gravarItens?: (clienteId: string, arquivo: ArrayBuffer) => Promise<string | null>;
}) {
  const qc = useQueryClient();
  const { lido, doXml, bytes, arquivo } = nota;
  const n = lido.nota;
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
  const [contaId, setContaId] = useState<string>('__none__');
  const [planoId, setPlanoId] = useState<string>(p.classificacao?.plano_conta_id ?? '');
  const [receita, setReceita] = useState<DadosDoCnpj | null>(null);
  const [receitaFrase, setReceitaFrase] = useState<string | null>(null);
  const [completar, setCompletar] = useState<CampoDoEmitente[]>([]);
  const [abertos, setAbertos] = useState<LancamentoAbertoDaNota[]>([]);
  const [confirmarAtualizar, setConfirmarAtualizar] = useState<{ alvo: LancamentoAbertoDaNota; parcelar: boolean } | null>(null);
  const [ocupado, setOcupado] = useState<null | 'cadastrar' | 'completar' | 'criar' | 'atualizar'>(null);
  /* FIN-NOTA-PDF-01b — lavoura: a safra e a cultura ('' = "Todas (rateia)"; `null` = ainda sem resposta) */
  const [safraId, setSafraId] = useState('');
  const [cultura, setCultura] = useState<string | null>(null);
  const [safraEditada, setSafraEditada] = useState(false);
  /* nota de UMA parcela: o vencimento da duplicata; sem duplicata, a emissao (em ambar, para conferir) */
  const [vencimento, setVencimento] = useState(p.duplicatas[0]?.vencimento ?? n.emissao);
  const [erro, setErro] = useState<string | null>(null);
  /* NOTA-JA-LANCADA-01 — os lancamentos que ja' parecem ser esta nota (qualquer status; cadastro parecido; numero; chave) */
  const [achados, setAchados] = useState<LancamentoJaLancado[] | null>(null);
  const [trocarFornecedor, setTrocarFornecedor] = useState(false);
  const [criarFaltam, setCriarFaltam] = useState(true);
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
    if (!favorecidoId) { setCompletar([]); setAbertos([]); return; }
    void camposQueOEmitenteCompleta(clienteId, favorecidoId, emitente).then((c) => { if (vivo) setCompletar(c.filter((x) => x !== 'tipo_pessoa')); });
    if (doXml.ocorrencias.length === 0) {
      void lancamentosAbertosComValor(clienteId, favorecidoId, [n.totais.notaCent, ...p.duplicatas.map((d) => d.valorCent)])
        .then((l) => { if (vivo) setAbertos(l); });
    }
    return () => { vivo = false; };
  }, [clienteId, favorecidoId, emitente, doXml.ocorrencias.length, n.totais.notaCent, p.duplicatas]);

  /* NOTA-JA-LANCADA-01 — antes de oferecer criar: a nota ja' esta' lancada? (refeito quando a Receita traz a razao social inteira) */
  const parcelasDaBusca = useMemo(() => parcelasParaCasar(p.duplicatas, n.totais.notaCent, p.duplicatas[0]?.vencimento ?? n.emissao),
    [p.duplicatas, n.totais.notaCent, n.emissao]);
  useEffect(() => {
    let vivo = true;
    if (doXml.ocorrencias.length > 0) { setAchados([]); return; }
    void notaJaLancada(clienteId, {
      parcelas: parcelasDaBusca, numero: p.numeroDocumento || n.numero, chave: n.chave, emitenteDocumento: n.emitente.documento,
      nomes: [n.emitente.nome, n.emitente.fantasia, receitaNome],
    }).then((l) => { if (vivo) setAchados(l); }, () => { if (vivo) setAchados([]); });
    return () => { vivo = false; };
  }, [clienteId, doXml.ocorrencias.length, parcelasDaBusca, p.numeroDocumento, n.numero, n.chave, n.emitente.documento, n.emitente.nome, n.emitente.fantasia, receitaNome]);
  const jaLancada = useMemo(() => (achados ? casarJaLancados(parcelasDaBusca, achados) : null), [achados, parcelasDaBusca]);

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
  const plano = saidas.find((c) => c.id === planoId) ?? null;
  const lavoura = plano?.escopo_negocio === 'agricultura';
  const nParcelas = p.duplicatas.length;
  const cabeAqui = nParcelas >= 2;
  const semDuplicata = nParcelas === 0;
  const culturasDaSafra = useCulturasDaSafra(lavoura && safraId ? safraId : null);
  const safrasDaLavoura = useMemo(() => safras.filter((sf) => (sf.escopo_negocio ?? '') === 'agricultura' || sf.id === safraId), [safras, safraId]);

  /* a SUGESTAO DE SEMPRE: o ultimo lancamento do fornecedor com este subcentro (safra e cultura dele); sem ele, a safra pela data,
     como no Novo lancamento (sem desempate: o operador decide). Cultura nunca se adivinha fora da sugestao do fornecedor. */
  useEffect(() => {
    if (!lavoura) { setSafraId(''); setCultura(null); setSafraEditada(false); return; }
    if (safraEditada) return;
    const ult = p.classificacao;
    if (ult && ult.plano_conta_id === planoId && ult.safra_id) { setSafraId(ult.safra_id); setCultura(ult.cultura ?? ''); return; }
    setSafraId(safraSugerida(p.competencia, 'agricultura', safras, { desempatar: false }) ?? '');
    setCultura(null);
  }, [lavoura, planoId, safraEditada, p.classificacao, p.competencia, safras]);
  const registrada = doXml.ocorrencias[0] ?? null;
  const divergencias = lido.divergencias;
  const avulsa = ehSerieAvulsa(n.serie) || ehSerieAvulsa(n.chave.slice(22, 25));
  const remessa = fraseDaRemessa(n);
  const somaItens = n.itens.reduce((s, i) => s + i.valorCent, 0);

  const faltas: string[] = [];
  if (!favorecidoId) faltas.push('fornecedor');
  else if (res.inativo && favorecidoId === p.favorecidoId) faltas.push('fornecedor ativo');
  if (!fazendaId) faltas.push('fazenda');
  if (!planoId) faltas.push('subcentro');
  if (lavoura && !safraId) faltas.push('safra');
  if (lavoura && cultura === null) faltas.push('cultura');
  if (!cabeAqui && !vencimento) faltas.push('vencimento');
  const bloqueio = divergencias.length ? `A chave não confere com o lido (${divergencias.map((x) => NOME_DO_CONFERIDO[x]).join(', ')}). Nada será criado.`
    : registrada ? `Nota já registrada neste cliente · ${ondeEsta(registrada)}` : null;
  const podeCriar = !bloqueio && faltas.length === 0 && !ocupado;
  const contaEscolhida = contaId && contaId !== '__none__' ? contaId : null;
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
      /* o CNPJ ja' cadastrado (a lista pode estar velha): conferido no BANCO antes de criar — conflito vira frase e "Usar este" */
      const ja = await fornecedorPeloDocumento(clienteId, n.emitente.documento);
      if (ja) { setConflito(ja); return; }
      const novo = await onCriarFornecedor(razaoSocial, fazendaId || null, documentoFormatado(n.emitente.documento));
      if (!novo) { setConflito(await fornecedorPeloDocumento(clienteId, n.emitente.documento)); return; }
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
        if (ja && ja.id !== favorecidoId) { setConflito(ja); return; }
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
  /** NOTA-JA-LANCADA-01 — "Anexar a nota a estes N" (e criar so' as que faltam, se marcado); nada muda em valor, data, status, conta. */
  const anexarJaLancados = async () => {
    if (!jaLancada) return;
    const donoDaNota = favorecidoId ?? jaLancada.alvos[0]?.fornecedorId ?? null;
    if (!donoDaNota) return;
    const e = escolhas();
    const comFaltam = criarFaltam && jaLancada.faltam.length > 0;
    if (comFaltam && (!e || !plano || faltas.length)) return;
    setOcupado('atualizar'); setErro(null);
    try {
      const numeroDe = (id: string) => jaLancada.porParcela.find((x) => x.lancamento?.id === id)?.parcela.n ?? 0;
      const r = await anexarAosJaLancados(clienteId, doXml, jaLancada.alvos.map((l) => ({ id: l.id, numero: numeroDe(l.id) })), donoDaNota, {
        faltam: comFaltam && e && plano ? jaLancada.faltam.map((f) => ({ numero: f.n, form: {
          ...formDaNota(doXml, e, f.vencimento, plano), valor: f.valorCent / 100, data_vencimento: f.vencimento,
          descricao: `${p.descricao} ${f.n}/${parcelasDaBusca.length}`,
        } })) : [],
        trocarPara: trocarFornecedor && favorecidoId ? favorecidoId : null,
        motivoTroca: `fornecedor da ${p.rotuloNota}`,
      }, { ...g, lancamento: g.lancamento ?? onCriarLancamento });
      if (r.ok === false) { setErro(r.erro); return; }
      for (const a of r.avisos) toast.error(a);
      if (!r.avisos.length) toast.success(`${p.rotuloNota} anexada a ${jaLancada.alvos.length} lançamento${jaLancada.alvos.length === 1 ? '' : 's'}${r.criados ? ` · ${r.criados} criado${r.criados === 1 ? '' : 's'}` : ''}`);
      const erroItens = await gravarItens(clienteId, bytes);
      if (erroItens) toast.error(`Os itens da nota não foram guardados: ${erroItens}`);
      onCriado(); onClose();
    } finally { setOcupado(null); }
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
        : <span className={CHIP_OK} data-testid="nota-chip-fornecedor">cadastrado</span>)
    : conflito ? <span className={CHIP_ERRO} data-testid="nota-chip-fornecedor">CNPJ já cadastrado</span>
    : escolherEntre.length ? <span className={CHIP_AVISO}>{res.achadoPor === 'nome' ? 'achado pelo nome: escolha' : 'dois cadastros com este CNPJ'}</span>
      : res.filialDiferente ? <span className={CHIP_AVISO}>outra filial no cadastro</span>
        : <span className={CHIP_AVISO}>não cadastrado neste cliente</span>;
  const end = emitente.endereco;
  const enderecoTexto = [[end?.logradouro, end?.numero].filter(Boolean).join(', '), end?.bairro, end?.cep ? `${end.cep.slice(0, 5)}-${end.cep.slice(5)}` : null].filter(Boolean).join(' · ');
  const cidade = end?.municipio ? `${receita ? end.municipio : caixaDeTitulo(end.municipio)}/${end.uf ?? ''}` : '—';
  const opcoesPlano = saidas.map((c) => ({ value: c.id ?? '', label: c.subcentro, sub: [c.centro_custo, c.grupo_custo].filter(Boolean).join(' · ') }));
  const aberto = abertos[0] ?? null;
  /* a' vista existente + nota parcelada: o gesto e' "Atualizar e parcelar" */
  const parcelarAberto = !!aberto && !aberto.financiamentoId && cabeAqui;
  const decisao = confirmarAtualizar?.parcelar ? decisaoDoExistente(confirmarAtualizar.alvo, doXml) : null;
  const origemPlano = p.classificacao && planoId === p.classificacao.plano_conta_id ? `último · ${dataCurta(p.classificacao.data)}` : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !ocupado) onClose(); }}>
      <DialogContent className="flex h-[min(600px,95vh)] w-[min(1094px,97vw)] max-w-none flex-col gap-0 overflow-hidden p-0" data-testid="nota-fiscal">
        <div className="flex h-9 shrink-0 items-center gap-2.5 bg-primary px-3.5 pr-10">
          <DialogTitle className="text-[13px] font-semibold leading-none text-primary-foreground">Novo lançamento · da nota fiscal</DialogTitle>
          <span className="text-[11px] text-primary-foreground/80">{lido.origem === 'pdf' ? 'PDF lido' : 'XML lido'} · confira antes de criar</span>
          <DialogDescription className="sr-only">O que foi lido da nota fiscal, para criar o lançamento parcelado.</DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 bg-muted p-2" style={{ gridTemplateColumns: 'minmax(160px, 28%) minmax(0, 1fr)' }}>
          {/* ── ARQUIVO ─────────────────────────────────────────────────────────────────────────────── */}
          <section className={cn(BLOCO, 'min-h-0')} data-testid="nota-bloco-arquivo">
            <TituloDoBloco nome="Arquivo" acao={<span className={CHIP_OK}>{lido.origem === 'pdf' ? 'PDF com texto · leitura direta' : 'XML da nota'}</span>} />
            {lido.origem === 'pdf'
              ? <PreviaDaNota bytes={bytes} marcas={lido.marcas} tamanho={lido.tamanhos[0] ?? null} divergentes={marcasVermelhas} />
              : <div className="flex flex-1 items-center justify-center rounded border bg-[#f7f7f5] text-[10px] text-muted-foreground">XML: os dados vêm direto do arquivo.</div>}
            <div className="mt-1 flex h-4 shrink-0 items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span className="min-w-0 uma-linha-que-rola" title={arquivo.name}>{arquivo.name} · {Math.max(1, Math.round(arquivo.size / 1024))} KB</span>
              {lido.origem === 'pdf' && <span className="shrink-0">amarelo = lido</span>}
            </div>
          </section>

          <div className="flex min-h-0 min-w-0 flex-col gap-1.5">
            {/* ── NOTA ─────────────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-nota">
              <TituloDoBloco nome="Nota" acao={<span className={divergencias.length ? CHIP_ERRO : CHIP_OK} data-testid="nota-chave"
                title={avulsa ? 'Nota avulsa (série 890–899): emitida pelo fisco em nome do produtor; a chave traz o CNPJ do órgão emissor.' : undefined}>{fraseDaChave(divergencias, avulsa)}</span>} />
              <div className={GRADE_KV}>
                <Kv num k="NF" v={numeroDaNota(n.numero)} erro={erroEm('numero')} testid="nota-numero" />
                <Kv num k="Série" v={n.serie} erro={erroEm('serie')} />
                <Kv num k="Emissão" v={dataInteira(n.emissao)} erro={erroEm('mes')} />
                <Kv num k="Valor" v={`R$ ${reais(n.totais.notaCent)}`} />
                <Kv k="Natureza" v={n.naturezaOperacao || '—'} titulo={n.naturezaOperacao} className="col-span-2" />
                <Kv num k="Desconto" v={`R$ ${reais(n.totais.descontoCent)}`} />
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

            {/* ── NOTA-JA-LANCADA-01: no lugar de Parcelas e Itens, o que ja' esta' lancado (mesma altura: nada se desloca) ───── */}
            {jaLancada && !bloqueio ? (
              <section className={cn(BLOCO, 'min-h-0 flex-1')} data-testid="nota-ja-lancada">
                <TituloDoBloco nome="Esta nota parece já lançada" acao={<span className={CHIP_AVISO}>
                  {jaLancada.outrosParecidos ? `+${jaLancada.outrosParecidos} parecido${jaLancada.outrosParecidos === 1 ? '' : 's'} (outra compra igual?)` : 'confira antes de anexar'}</span>} />
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="nota-ja-lancada-rolagem">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 52 }} /><col style={{ width: 78 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 96 }} /><col style={{ width: '30%' }} /></colgroup>
                    <thead className="sticky top-0 z-10 bg-primary"><tr>
                      {['Parc.', 'Vencimento', 'Descrição', 'Valor', 'Status', 'Fornecedor'].map((h) => (
                        <th key={h} className={cn(TH, h === 'Valor' && 'text-right')} title={h}>{h}</th>))}
                    </tr></thead>
                    <tbody>
                      {[...jaLancada.porParcela.map((x) => ({ chave: `p${x.parcela.n}`, rotulo: `${x.parcela.n}/${jaLancada.porParcela.length}`, l: x.lancamento, parcela: x.parcela })),
                        ...jaLancada.pelaNota.map((l) => ({ chave: l.id, rotulo: 'nº doc.', l, parcela: null }))].map((x) => (
                        <tr key={x.chave} className={cn('border-b border-border/50', !x.l && 'bg-amber-50/60')} data-testid="nota-ja-lancada-linha">
                          <td className={cn(TDN, 'text-left')}>{x.rotulo}</td>
                          {x.l ? (<>
                            <td className={cn(TDN, 'text-left')}>{dataInteira(x.l.vencimento ?? x.l.pagamento ?? x.l.competencia)}</td>
                            <td className={TD} title={x.l.descricao ?? ''}>{x.l.descricao ?? '—'}</td>
                            <td className={TDN}>{reais(x.l.valorCent)}</td>
                            <td className={TD} title={x.l.conciliado ? 'conciliado com o extrato' : undefined}>{x.l.status ?? '—'}{x.l.conciliado ? ' · conc.' : ''}</td>
                            <td className={TD} title={`${x.l.fornecedorNome ?? ''}${x.l.fornecedorPor === 'nome' ? ' — sem CNPJ, nome parecido' : x.l.fornecedorPor === 'mesclado' ? ' — mesclado' : ''}`}>{x.l.fornecedorNome ?? '—'}</td>
                          </>) : (<>
                            <td className={cn(TDN, 'text-left')}>{dataInteira(x.parcela?.vencimento)}</td>
                            <td className={cn(TD, 'text-amber-800')} title="falta · não achada no cliente">falta · não achada no cliente</td>
                            <td className={TDN}>{reais(x.parcela?.valorCent ?? 0)}</td>
                            <td className={TD}>—</td><td className={TD}>—</td>
                          </>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 flex h-5 shrink-0 items-center gap-3 text-[10px]">
                  {jaLancada.faltam.length > 0 && (
                    <label className="flex shrink-0 items-center gap-1.5" data-testid="nota-criar-faltam">
                      <Checkbox checked={criarFaltam} onCheckedChange={(v) => setCriarFaltam(v === true)} className="h-3 w-3" />
                      Criar só {jaLancada.faltam.length === 1 ? 'a parcela que falta' : `as ${jaLancada.faltam.length} parcelas que faltam`}
                    </label>
                  )}
                  {favorecidoId && fornecedor && jaLancada.alvos.some((l) => l.fornecedorId !== favorecidoId) && (
                    <label className="flex min-w-0 items-center gap-1.5" data-testid="nota-trocar-fornecedor" title={`Troca o fornecedor dos lançamentos achados para ${fornecedor.nome} (com trilha e desfazer).`}>
                      <Checkbox checked={trocarFornecedor} onCheckedChange={(v) => setTrocarFornecedor(v === true)} className="h-3 w-3" />
                      <span className="min-w-0 uma-linha-que-rola">Trocar o fornecedor para {fornecedor.nome}</span>
                    </label>
                  )}
                  <span className="ml-auto min-w-0 uma-linha-que-rola text-muted-foreground" title="Anexar põe a NF nos lançamentos achados; valor, data, status, conta e conciliação não mudam.">Valor, data, status e conciliação não mudam.</span>
                  <button type="button" className="shrink-0 font-medium text-primary underline underline-offset-2 disabled:opacity-50" disabled={!podeCriar}
                    onClick={() => setMesmoAssim('')} data-testid="nota-criar-mesmo-assim" title={podeCriar ? 'É outra compra: criar mesmo assim (pede o motivo).' : `Para criar, falta: ${faltas.join(', ')}`}>Criar mesmo assim</button>
                </div>
              </section>
            ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <section className={cn(BLOCO, 'min-h-0')} data-testid="nota-bloco-parcelas">
                <TituloDoBloco nome="Parcelas da nota" acao={nParcelas === 0 ? <span className={CHIP_AVISO}>sem duplicatas</span>
                  : n.somaDuplicatasCent === n.totais.notaCent ? <span className={CHIP_OK}>soma = valor da nota</span>
                    : <span className={CHIP_AVISO}>soma {reais(n.somaDuplicatasCent)} ≠ nota</span>} />
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="nota-parcelas-rolagem">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 90 }} /></colgroup>
                    <thead className="sticky top-0 z-10 bg-primary"><tr><th className={TH}>Nº</th><th className={TH}>Vencimento</th><th className={cn(TH, 'text-right')}>Valor</th></tr></thead>
                    <tbody>
                      {p.duplicatas.map((d, i) => (
                        <tr key={`${d.numero}-${i}`} className="border-b border-border/50" data-testid="nota-parcela">
                          <td className={cn(TDN, 'text-left')}>{i + 1}/{nParcelas}</td>
                          <td className={cn(TDN, 'text-left')}>{dataInteira(d.vencimento)}</td>
                          <td className={TDN}>{reais(d.valorCent)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/60 font-semibold"><td className={TD}>Total</td><td className={TD} /><td className={TDN} data-testid="nota-parcelas-total">{reais(n.somaDuplicatasCent)}</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>
              <section className={cn(BLOCO, 'min-h-0')} data-testid="nota-bloco-itens">
                <TituloDoBloco nome="Itens" dica="vão para Produto / descrição" />
                <div className="min-h-0 flex-1 overflow-y-auto" data-testid="nota-itens-rolagem">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col /><col style={{ width: 56 }} /><col style={{ width: 62 }} /><col style={{ width: 90 }} /></colgroup>
                    <thead className="sticky top-0 z-10 bg-primary"><tr><th className={TH} title="Produto">Produto</th><th className={cn(TH, 'text-right')}>Qtd</th><th className={cn(TH, 'text-right')}>Unit.</th><th className={cn(TH, 'text-right')}>Total</th></tr></thead>
                    <tbody>
                      {n.itens.map((it, i) => {
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
            </div>
            )}

            {/* ── LANCAMENTO ───────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-lancamento">
              <TituloDoBloco nome="Lançamento" dica="o que a nota não diz, você escolhe" />
              <div className="campos-uma-linha grid grid-cols-4 gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola')}>Fazenda{p.fazendaId && fazendaId === p.fazendaId ? ' · pela nota' : ''}</span>
                  <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas} forcaAdministrativo={false} obrigatorio hideAviso triggerClassName="h-[22px] text-[10.5px]" />
                </div>
                <div className="min-w-0">
                  <span className={REGUA_ROTULO}>Conta origem</span>
                  <ContaBancariaSelect value={contaId} onValueChange={setContaId} contas={contas} placeholder="Selecione" prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className="h-[22px] text-[10.5px]" />
                </div>
                <div className="min-w-0" data-testid="nota-subcentro">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', !planoId && 'text-destructive')} title={origemPlano ? `Sugestão: o ${origemPlano}` : undefined}>Subcentro *{origemPlano ? ` · ${origemPlano}` : ''}</span>
                  <div title={plano?.subcentro}>
                    <SearchableSelect value={planoId} onValueChange={(v) => { setPlanoId(v); setSafraEditada(false); }} semTodos allValue="" allLabel="Selecione o subcentro…" dense options={opcoesPlano}
                      placeholder="Buscar subcentro…" triggerClassName={cn('h-[22px] text-[10.5px]', !planoId && 'border-destructive')} />
                  </div>
                </div>
                <div className="min-w-0">
                  <span className={REGUA_ROTULO}>Status</span>
                  <div className="flex h-[22px] items-center rounded-md border bg-background px-2 text-[10.5px]" title="Nasce programado, como no Novo lançamento.">Programado</div>
                </div>
                {/* FIN-NOTA-PDF-01b — a segunda linha EXISTE SEMPRE (nada se desloca): Safra e Cultura so' valem na lavoura */}
                <div className="min-w-0" data-testid="nota-safra">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', lavoura && !safraId && 'text-destructive')}>{lavoura ? 'Safra *' : 'Safra · só lavoura'}</span>
                  <div title={safras.find((sf) => sf.id === safraId)?.nome}>
                    <SearchableSelect value={safraId} onValueChange={(v) => { setSafraId(v); setSafraEditada(true); setCultura(null); }} semTodos allValue=""
                      allLabel={lavoura ? 'Selecione a safra…' : 'não se aplica'} dense disabled={!lavoura}
                      options={safrasDaLavoura.map((sf) => ({ value: sf.id, label: sf.nome }))} placeholder="Buscar safra…"
                      triggerClassName={cn('h-[22px] text-[10.5px]', lavoura && !safraId && 'border-destructive')} />
                  </div>
                </div>
                <div className="min-w-0" data-testid="nota-cultura">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', lavoura && cultura === null && 'text-destructive')}>{lavoura ? 'Cultura *' : 'Cultura · só lavoura'}</span>
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
                <div className="col-span-2 min-w-0" data-testid="nota-vencimento">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', !cabeAqui && semDuplicata && 'text-amber-800')}>
                    {cabeAqui ? 'Vencimento · pelas parcelas da nota' : semDuplicata ? 'Vencimento · nota sem duplicata: confira o vencimento' : 'Vencimento · da duplicata'}
                  </span>
                  {cabeAqui
                    ? <div className="flex h-[22px] items-center rounded-md border bg-muted/40 px-2 text-[10.5px] tabular-nums">{dataInteira(p.duplicatas[0]?.vencimento)} a {dataInteira(p.duplicatas[nParcelas - 1]?.vencimento)}</div>
                    : <DatePicker value={vencimento} onChange={setVencimento} data-testid="nota-vencimento-campo"
                        className={cn('h-[22px] text-[10.5px]', semDuplicata && 'border-amber-400 bg-amber-50', !vencimento && 'border-destructive')} />}
                </div>
              </div>
            </section>

          </div>
        </div>

        {/* ── RODAPE FIXO ──────────────────────────────────────────────────────────────────────────── */}
        <div className="flex h-[38px] shrink-0 items-center gap-2.5 border-t bg-card px-3 text-[10.5px]" data-testid="nota-rodape">
          {bloqueio ? (
            <span className="flex min-w-0 items-center gap-2 text-destructive" data-testid="nota-bloqueio">
              <span className="min-w-0 uma-linha-que-rola" title={bloqueio}>⚠ {bloqueio}</span>
              {registrada && <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => onAbrirRegistrada(registrada)} data-testid="nota-abrir-registrada">abrir</button>}
            </span>
          ) : erro ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" title={erro} data-testid="nota-erro">⚠ {erro}</span>
          ) : faltas.length ? (
            <span className="min-w-0 uma-linha-que-rola text-destructive" data-testid="nota-falta">⚠ Falta: {faltas.join(', ')}</span>
          ) : null}
          {!bloqueio && !erro && jaLancada ? (
            <span className="min-w-0 uma-linha-que-rola font-medium text-amber-900" data-testid="nota-ja-lancada-frase">
              Esta nota parece já lançada: {jaLancada.porParcela.length - jaLancada.faltam.length} de {jaLancada.porParcela.length} {jaLancada.porParcela.length === 1 ? 'parcela' : 'parcelas'}
              {jaLancada.faltam.length ? ` · faltam ${jaLancada.faltam.map((f) => `${f.n}/${jaLancada.porParcela.length}`).join(', ')}` : ''}. Nada será criado em dobro.
            </span>
          ) : !bloqueio && !erro && aberto ? (
            /* o pedido do Gabriel: ATUALIZAR o que ja' existe, em vez de criar outro (so' com confirmacao) */
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
          ) : !bloqueio && !erro ? (
            <span className="min-w-0 uma-linha-que-rola text-muted-foreground">
              O {lido.origem === 'pdf' ? 'PDF' : 'XML'} fica anexado {cabeAqui ? `às ${nParcelas} parcelas` : 'ao lançamento'} como a NF {numeroFalado(n.numero)}.
            </span>
          ) : null}
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={!!ocupado} onClick={onClose}>Cancelar</Button>
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={!!ocupado || !!bloqueio} onClick={abrirNoLancamento}
            title="Abre o Novo lançamento com tudo o que foi lido e escolhido aqui (nada se perde)." data-testid="nota-abrir-no-lancamento">
            No Novo lançamento
          </Button>
          {/* o botao principal tem a MESMA largura nos dois estados (nada se desloca); "Criar mesmo assim" mora no bloco */}
          {jaLancada && !bloqueio ? (<>
            <Button type="button" size="sm" className="h-[24px] w-[180px] shrink-0 px-2.5 text-[10.5px]" data-testid="nota-anexar-ja-lancados"
              disabled={!!ocupado || (criarFaltam && jaLancada.faltam.length > 0 && faltas.length > 0)} onClick={() => { void anexarJaLancados(); }}>
              {ocupado === 'atualizar' ? 'Anexando…' : criarFaltam && jaLancada.faltam.length
                ? `Anexar e criar ${jaLancada.faltam.length === 1 ? 'a que falta' : `as ${jaLancada.faltam.length} que faltam`}`
                : `Anexar a nota a ${jaLancada.alvos.length === 1 ? 'este' : `estes ${jaLancada.alvos.length}`}`}
            </Button>
          </>) : (
          <Button type="button" size="sm" className="h-[24px] w-[180px] shrink-0 px-2.5 text-[10.5px]" disabled={!podeCriar} onClick={() => { void criar(); }} data-testid="nota-criar">
            {ocupado === 'criar' ? 'Criando…' : cabeAqui ? `Criar ${nParcelas} parcelas` : 'Criar lançamento'}
          </Button>)}
        </div>
      </DialogContent>

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

      {comparar && favorecidoId && (
        <CompararCadastroDialog hoje={comparar} proposta={propostaDaNota} rotuloOrigem={receita ? 'Da nota (Receita)' : 'Da nota'}
          emitente={{ documento: n.emitente.documento, nomes: [n.emitente.nome, n.emitente.fantasia, receitaNome] }} uso={uso}
          onConfirmar={gravarComparacao} onClose={() => setComparar(null)}
          onEscolherOutro={() => { setComparar(null); setFavorecidoId(null); setNovoPorEscolha(false); }}
          onCadastrarNovo={() => { setComparar(null); setFavorecidoId(null); setNovoPorEscolha(true); }} />
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
