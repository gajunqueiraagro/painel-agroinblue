/**
 * "NOVO LANCAMENTO · DA NOTA FISCAL" — FIN-NOTA-PDF-01, o mock aprovado pelo Gabriel (claude.ai/artifact/ANnN6PwtPMZEgfkm5kphNq).
 * O PDF a' esquerda, com o que foi lido em amarelo; a' direita, em blocos, Nota · Fornecedor · Parcelas · Itens · Lancamento; o
 * rodape FIXO diz o que falta e cria as N parcelas com o PDF anexado a todas como a NF. MODAL FIXO, SEM ROLAGEM.
 *
 * ⚠ NADA E' LIDO AQUI: a nota chega pronta (`lerNota` -> `proporLancamento` -> `resolverEmitente`, o caminho do XML). Aqui so' se
 *   escolhe o que a nota nao diz (subcentro, conta) e se grava pelo gravador de sempre (`criarDaNota.ts`).
 * ⚠ NUNCA ADIVINHA: subcentro e' escolha do operador ou a sugestao de sempre (o ultimo lancamento classificado do fornecedor).
 * ⚠ BARRA, NAO AVISA: chave que nao confere com o lido (campo vermelho) e nota ja' registrada no cliente (com o link) nao criam nada.
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
import { atualizarComANota, criarParcelasDaNota, GRAVADORES, type Gravadores } from './criarDaNota';
import { gravarParcelamento } from './LancamentoV2Dialog';
import { ondeEsta } from './LancamentoDoXml';
import type { DoXml } from '@/lib/financeiro/nfePrefill';
import type { NotaDoArquivo } from '@/lib/financeiro/nfe/lerNota';
import type { CampoConferido, CampoDaMarca } from '@/lib/financeiro/nfe/danfe';
import type { EmitenteNFe } from '@/lib/financeiro/nfe/tipos';
import { dataCurta, documentoFormatado, numeroDaNota, numeroFalado, reais, soDigitos } from '@/lib/financeiro/nfe/formatos';
import {
  camposQueOEmitenteCompleta, completarCadastroPeloXml, gravarDocumentoNoCadastro, lancamentosAbertosComValor,
  type LancamentoAbertoDaNota, type OcorrenciaDaNota,
} from '@/lib/financeiro/nfeConsultas';
import { caixaDeTitulo, consultarCnpj, type DadosDoCnpj } from '@/lib/fornecedores/consultaCnpj';
import type { CampoDoEmitente } from '@/lib/fornecedores/cadastroDoFornecedor';
import type { ClassificacaoItem, ContaBancariaV2, FornecedorV2 } from '@/hooks/useFinanceiroV2';
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
export const fraseDaChave = (d: readonly CampoConferido[]) => (d.length === 0 ? 'chave confere: CNPJ, nº, série e mês' : `chave não confere: ${d.map((x) => NOME_DO_CONFERIDO[x]).join(', ')}`);

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
  open, onClose, clienteId, clienteNome, nota, fazendas, contas, classificacoes, fornecedores, onCriarFornecedor, onAbrirNoLancamento,
  onAbrirRegistrada, onCriado, gravadores, consultarReceita = consultarCnpj,
}: {
  open: boolean;
  onClose: () => void;
  clienteId: string;
  clienteNome: string | null;
  nota: NotaParaLancar;
  fazendas: Fazenda[];
  contas: ContaBancariaV2[];
  classificacoes: ClassificacaoItem[];
  fornecedores: readonly FornecedorV2[];
  onCriarFornecedor: (nome: string, fazendaId: string | null, cpfCnpj?: string) => Promise<FornecedorV2 | null>;
  /** O que este modal nao cria (nota de uma parcela so', subcentro de lavoura): o Novo lancamento de sempre, com a nota. */
  onAbrirNoLancamento: (d: DoXml) => void;
  onAbrirRegistrada: (o: OcorrenciaDaNota) => void;
  onCriado: () => void;
  /** So' para teste: os gravadores (padrao: os do banco). */
  gravadores?: Gravadores;
  /** So' para teste: a consulta da Receita (padrao: `consultarCnpj`). */
  consultarReceita?: typeof consultarCnpj;
}) {
  const qc = useQueryClient();
  const { lido, doXml, bytes, arquivo } = nota;
  const n = lido.nota;
  const p = doXml.proposta;
  const res = doXml.resolucao;

  const [favorecidoId, setFavorecidoId] = useState<string | null>(p.favorecidoId);
  const [fazendaId, setFazendaId] = useState<string>(p.fazendaId ?? '');
  const [contaId, setContaId] = useState<string>('__none__');
  const [planoId, setPlanoId] = useState<string>(p.classificacao?.plano_conta_id ?? '');
  const [receita, setReceita] = useState<DadosDoCnpj | null>(null);
  const [receitaFrase, setReceitaFrase] = useState<string | null>(null);
  const [completar, setCompletar] = useState<CampoDoEmitente[]>([]);
  const [abertos, setAbertos] = useState<LancamentoAbertoDaNota[]>([]);
  const [confirmarAtualizar, setConfirmarAtualizar] = useState<LancamentoAbertoDaNota | null>(null);
  const [ocupado, setOcupado] = useState<null | 'cadastrar' | 'completar' | 'criar' | 'atualizar'>(null);
  const [erro, setErro] = useState<string | null>(null);

  /* a Receita: o nome inteiro (o DANFE corta) e o endereco escrito direito; nunca trava */
  useEffect(() => {
    let vivo = true;
    if (soDigitos(n.emitente.documento).length !== 14) return;
    void consultarReceita(n.emitente.documento).then((r) => {
      if (!vivo) return;
      if (r.ok === true) setReceita(r.dados); else setReceitaFrase(r.frase);
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

  const fornecedor = favorecidoId ? fornecedores.find((f) => f.id === favorecidoId) ?? null : null;
  const precisaCadastrar = !favorecidoId && (!res.achadoPor || res.filialDiferente);
  const escolherEntre = !favorecidoId && res.candidatos.length > 1 ? res.candidatos : [];
  const saidas = useMemo(() => classificacoes.filter((c) => !!c.id && c.tipo_operacao.startsWith('2')), [classificacoes]);
  const plano = saidas.find((c) => c.id === planoId) ?? null;
  const lavoura = plano?.escopo_negocio === 'agricultura';
  const nParcelas = p.duplicatas.length;
  const cabeAqui = nParcelas >= 2;
  const registrada = doXml.ocorrencias[0] ?? null;
  const divergencias = lido.divergencias;
  const somaItens = n.itens.reduce((s, i) => s + i.valorCent, 0);

  const faltas: string[] = [];
  if (!favorecidoId) faltas.push('fornecedor');
  else if (res.inativo && favorecidoId === p.favorecidoId) faltas.push('fornecedor ativo');
  if (!fazendaId) faltas.push('fazenda');
  if (!planoId) faltas.push('subcentro');
  const bloqueio = divergencias.length ? `A chave não confere com o lido (${divergencias.map((x) => NOME_DO_CONFERIDO[x]).join(', ')}). Nada será criado.`
    : registrada ? `Nota já registrada neste cliente · ${ondeEsta(registrada)}` : null;
  const podeCriar = !bloqueio && faltas.length === 0 && cabeAqui && !lavoura && !ocupado;

  const cadastrar = async () => {
    setOcupado('cadastrar'); setErro(null);
    try {
      const novo = await onCriarFornecedor(razaoSocial, fazendaId || null, documentoFormatado(n.emitente.documento));
      if (!novo) return;
      setFavorecidoId(novo.id);
      const e = await completarCadastroPeloXml(clienteId, novo.id, emitente);
      if (e) toast.error(`Fornecedor criado, mas os dados da nota não foram gravados nele: ${e}`);
    } finally { setOcupado(null); }
  };
  const completarCadastro = async () => {
    if (!favorecidoId) return;
    setOcupado('completar'); setErro(null);
    try {
      if (res.cadastroSemDocumento && favorecidoId === p.favorecidoId) {
        const e1 = await gravarDocumentoNoCadastro(clienteId, favorecidoId, n.emitente.documento);
        if (e1) { setErro(e1); return; }
      }
      const e = await completarCadastroPeloXml(clienteId, favorecidoId, emitente);
      if (e) { setErro(e); return; }
      setCompletar([]);
      toast.success('Cadastro do fornecedor completado com os dados da nota');
    } finally { setOcupado(null); }
  };
  const g: Gravadores = gravadores ?? { ...GRAVADORES, gravar: (payload, cli) => gravarParcelamento(payload, cli, () => qc.invalidateQueries()) };
  const criar = async () => {
    if (!podeCriar || !favorecidoId || !plano?.id) return;
    setOcupado('criar'); setErro(null);
    try {
      const r = await criarParcelasDaNota(clienteId, doXml, {
        fazendaId, favorecidoId, contaBancariaId: contaId && contaId !== '__none__' ? contaId : null, planoContaId: plano.id, escopoNegocio: plano.escopo_negocio || null,
      }, g);
      if (r.ok === false) { setErro(r.erro); return; }
      if (r.erroDoDocumento) toast.error(r.erroDoDocumento); else toast.success(`${r.parcelas} parcelas criadas · ${p.rotuloNota} anexada`);
      onCriado(); onClose();
    } finally { setOcupado(null); }
  };
  const atualizar = async (alvo: LancamentoAbertoDaNota) => {
    if (!favorecidoId) return;
    setOcupado('atualizar'); setErro(null);
    try {
      const r = await atualizarComANota(clienteId, { id: alvo.id, financiamentoId: alvo.financiamentoId }, doXml, favorecidoId, g);
      if (r.ok === false) { setErro(r.erro); return; }
      toast.success(`Lançamento atualizado · ${p.rotuloNota} anexada`);
      onCriado(); onClose();
    } finally { setOcupado(null); setConfirmarAtualizar(null); }
  };

  const marcasVermelhas = divergencias.flatMap((d) => MARCA_DO_CONFERIDO[d]);
  const erroEm = (c: CampoConferido) => divergencias.includes(c);
  const chipFornecedor = favorecidoId
    ? (res.inativo && favorecidoId === p.favorecidoId ? <span className={CHIP_AVISO}>inativo no cadastro</span>
      : res.achadoPor === 'nome' && favorecidoId === p.favorecidoId ? <span className={CHIP_AVISO}>achado pelo nome</span>
        : <span className={CHIP_OK}>cadastrado</span>)
    : escolherEntre.length ? <span className={CHIP_AVISO}>dois cadastros com este CNPJ</span>
      : res.filialDiferente ? <span className={CHIP_AVISO}>outra filial no cadastro</span>
        : <span className={CHIP_AVISO}>não cadastrado neste cliente</span>;
  const end = emitente.endereco;
  const enderecoTexto = [[end?.logradouro, end?.numero].filter(Boolean).join(', '), end?.bairro, end?.cep ? `${end.cep.slice(0, 5)}-${end.cep.slice(5)}` : null].filter(Boolean).join(' · ');
  const cidade = end?.municipio ? `${receita ? end.municipio : caixaDeTitulo(end.municipio)}/${end.uf ?? ''}` : '—';
  const opcoesPlano = saidas.map((c) => ({ value: c.id ?? '', label: c.subcentro, sub: [c.centro_custo, c.grupo_custo].filter(Boolean).join(' · ') }));
  const aberto = abertos[0] ?? null;
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
              <TituloDoBloco nome="Nota" acao={<span className={divergencias.length ? CHIP_ERRO : CHIP_OK} data-testid="nota-chave">{fraseDaChave(divergencias)}</span>} />
              <div className={GRADE_KV}>
                <Kv num k="NF" v={numeroDaNota(n.numero)} erro={erroEm('numero')} testid="nota-numero" />
                <Kv num k="Série" v={n.serie} erro={erroEm('serie')} />
                <Kv num k="Emissão" v={dataInteira(n.emissao)} erro={erroEm('mes')} />
                <Kv num k="Valor" v={`R$ ${reais(n.totais.notaCent)}`} />
                <Kv k="Natureza" v={n.naturezaOperacao || '—'} titulo={n.naturezaOperacao} className="col-span-2" />
                <Kv num k="Desconto" v={`R$ ${reais(n.totais.descontoCent)}`} />
                <Kv k="Destinatário" v={`${n.destinatario.nome ? caixaDeTitulo(n.destinatario.nome) : '—'}${clienteNome ? ` · ${clienteNome}` : ''}`}
                  titulo={`${n.destinatario.nome ?? ''}${clienteNome ? ` · ${clienteNome}` : ''}`} />
              </div>
            </section>

            {/* ── FORNECEDOR ───────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-fornecedor">
              <TituloDoBloco nome="Fornecedor" acao={chipFornecedor} />
              <div className="flex min-w-0 items-start gap-2.5">
                <div className={cn(GRADE_KV, 'min-w-0 flex-1')}>
                  <Kv k="Razão social" v={fornecedor ? fornecedor.nome : caixaDeTitulo(razaoSocial)} className="col-span-2"
                    titulo={fornecedor ? fornecedor.nome : `${caixaDeTitulo(razaoSocial)}${receita ? ' (Receita)' : ''} — no DANFE: ${n.emitente.nome}`} />
                  <Kv num k="CNPJ" v={documentoFormatado(n.emitente.documento)} erro={erroEm('cnpj')} />
                  <Kv num k="IE" v={n.emitente.ie ?? '—'} />
                  <Kv k="Endereço" v={enderecoTexto || '—'} titulo={enderecoTexto} className="col-span-2" />
                  <Kv k="Cidade/UF" v={cidade} titulo={cidade} />
                  <Kv k="Nome" v={receita ? <span className="text-[#1f7a45]">completo pela Receita</span> : <span className="text-amber-800">como no DANFE</span>}
                    titulo={receita ? 'Razão social inteira da consulta pública do CNPJ.' : (receitaFrase ?? 'Consultando a Receita…')} />
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
                  {favorecidoId && completar.length > 0 && (
                    <Button type="button" size="sm" variant="outline" className="h-[22px] px-2 text-[10.5px]" disabled={!!ocupado} onClick={() => { void completarCadastro(); }} data-testid="nota-completar-fornecedor"
                      title={`Preenche no cadastro só o que está vazio: ${fraseDoCompletar(completar)}.`}>
                      {ocupado === 'completar' ? 'Completando…' : 'Completar cadastro'}
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {/* ── PARCELAS E ITENS ─────────────────────────────────────────────────────────────────── */}
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

            {/* ── LANCAMENTO ───────────────────────────────────────────────────────────────────────── */}
            <section className={BLOCO} data-testid="nota-bloco-lancamento">
              <TituloDoBloco nome="Lançamento" dica="o que a nota não diz, você escolhe" />
              <div className="campos-uma-linha grid grid-cols-4 gap-x-3">
                <div className="min-w-0">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola')}>Fazenda{p.fazendaId && fazendaId === p.fazendaId ? ' · pela nota' : ''}</span>
                  <FazendaSelect value={fazendaId} onChange={setFazendaId} fazendas={fazendas} forcaAdministrativo={false} obrigatorio hideAviso triggerClassName="h-[22px] text-[10.5px]" />
                </div>
                <div className="min-w-0">
                  <span className={REGUA_ROTULO}>Status das parcelas</span>
                  <div className="flex h-[22px] items-center rounded-md border bg-background px-2 text-[10.5px]" title="O parcelamento nasce programado, como no Novo lançamento.">Programado</div>
                </div>
                <div className="min-w-0">
                  <span className={REGUA_ROTULO}>Conta origem</span>
                  <ContaBancariaSelect value={contaId} onValueChange={setContaId} contas={contas} placeholder="Selecione" prependItems={[{ value: '__none__', label: 'Nenhuma' }]}
                    className="h-[22px] text-[10.5px]" />
                </div>
                <div className="min-w-0" data-testid="nota-subcentro">
                  <span className={cn(REGUA_ROTULO, 'uma-linha-que-rola', !planoId && 'text-destructive')} title={origemPlano ? `Sugestão: o ${origemPlano}` : undefined}>Subcentro *{origemPlano ? ` · ${origemPlano}` : ''}</span>
                  <div title={plano?.subcentro}>
                    <SearchableSelect value={planoId} onValueChange={setPlanoId} semTodos allValue="" allLabel="Selecione o subcentro…" dense options={opcoesPlano}
                      placeholder="Buscar subcentro…" triggerClassName={cn('h-[22px] text-[10.5px]', !planoId && 'border-destructive')} />
                  </div>
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
            <span className="shrink-0 text-destructive" data-testid="nota-falta">⚠ Falta: {faltas.join(', ')}</span>
          ) : lavoura || !cabeAqui ? (
            <span className="min-w-0 uma-linha-que-rola text-amber-800" data-testid="nota-no-lancamento">
              {lavoura ? 'Subcentro de lavoura pede safra e cultura: abra no Novo lançamento.' : 'Nota de uma parcela só: abra no Novo lançamento.'}
            </span>
          ) : null}
          {!bloqueio && !erro && aberto ? (
            /* o pedido do Gabriel: ATUALIZAR o que ja' existe, em vez de criar outro (so' com confirmacao) */
            <span className="flex min-w-0 items-center gap-2 text-amber-900" data-testid="nota-atualizar-faixa"
              title={abertos.map((a) => `${dataInteira(a.vencimento ?? a.competencia)} · ${a.descricao ?? ''} · R$ ${reais(a.valorCent)}`).join(' | ')}>
              <span className="min-w-0 uma-linha-que-rola">
                Já existe lançamento aberto deste fornecedor: {dataInteira(aberto.vencimento ?? aberto.competencia)} · {aberto.descricao ?? 'sem descrição'} · R$ {reais(aberto.valorCent)}
                {abertos.length > 1 ? ` · e mais ${abertos.length - 1}` : ''}
              </span>
              <button type="button" className="shrink-0 font-medium underline underline-offset-2" disabled={!!ocupado} onClick={() => setConfirmarAtualizar(aberto)} data-testid="nota-atualizar-este">
                Atualizar este
              </button>
            </span>
          ) : !bloqueio && !erro && cabeAqui ? (
            <span className="min-w-0 uma-linha-que-rola text-muted-foreground" title={`O PDF fica anexado às ${nParcelas} parcelas como a NF ${numeroFalado(n.numero)}.`}>
              O {lido.origem === 'pdf' ? 'PDF' : 'XML'} fica anexado às {nParcelas} parcelas como a NF {numeroFalado(n.numero)}.
            </span>
          ) : null}
          <span className="ml-auto" />
          <Button type="button" size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[10.5px]" disabled={!!ocupado} onClick={onClose}>Cancelar</Button>
          {(lavoura || !cabeAqui) && !bloqueio ? (
            <Button type="button" size="sm" className="h-[24px] w-[150px] shrink-0 px-2.5 text-[10.5px]" disabled={!!ocupado} onClick={() => onAbrirNoLancamento(doXml)} data-testid="nota-abrir-no-lancamento">
              Abrir no Novo lançamento
            </Button>
          ) : (
            <Button type="button" size="sm" className="h-[24px] w-[150px] shrink-0 px-2.5 text-[10.5px]" disabled={!podeCriar} onClick={() => { void criar(); }} data-testid="nota-criar">
              {ocupado === 'criar' ? 'Criando…' : `Criar ${nParcelas} parcelas`}
            </Button>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={!!confirmarAtualizar} onOpenChange={(o) => { if (!o && ocupado !== 'atualizar') setConfirmarAtualizar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Atualizar este lançamento com a nota?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarAtualizar ? `${dataInteira(confirmarAtualizar.vencimento ?? confirmarAtualizar.competencia)} · ${confirmarAtualizar.descricao ?? 'sem descrição'} · R$ ${reais(confirmarAtualizar.valorCent)}. ` : ''}
              A {p.rotuloNota} é anexada{confirmarAtualizar?.financiamentoId ? ' a todas as parcelas dele' : ''} e o número do documento é preenchido onde estiver vazio. Nenhum lançamento novo é criado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado === 'atualizar'}>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={ocupado === 'atualizar'} onClick={(e) => { e.preventDefault(); if (confirmarAtualizar) void atualizar(confirmarAtualizar); }} data-testid="nota-confirmar-atualizar">
              {ocupado === 'atualizar' ? 'Atualizando…' : 'Atualizar este'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
