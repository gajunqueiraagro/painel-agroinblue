/**
 * CAD-CONTAS-BANCARIAS-01 — o modal da conta bancaria (mock aprovado 20/10 12h53): 780x500 fixo, sem rolagem, fundo cinza com blocos
 * brancos, quatro abas — Dados da conta · Banco e gerente · Saldo inicial · Importacao e vinculos. Nova conta: o mesmo modal, vazio, a aba
 * Saldo inicial com o selo "obrigatório" e o botao "Criar".
 *
 * ⚠ GRAVA PELO ESCRITOR UNICO (`fn_conta_bancaria_salvar`), e SO' O QUE MUDOU (`mudancas`). Saldo inicial e data seguem a semente do mes
 *   em `financeiro_saldos_bancarios_v2` (o caminho de sempre), a Auditoria registra quem, quando, antes -> depois.
 * ⚠ SENHA NUNCA: nenhum campo de senha ou acesso de internet banking (e o escritor recusa chave fora da lista).
 * ⚠ "Efeito na Conciliacao" e' o DONO da Conciliacao (P58: `fn_conta_bancaria_efeito_conciliacao`, a mesma interna do status mensal), lido so' quando a
 *   aba abre — nenhum calculo paralelo.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { BlocoFormulario, CorpoFormulario, GRADE_FORMULARIO, REGUA_CAMPO, Rotulo } from '@/components/ui/bloco-formulario';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker, formatIsoToBr } from '@/components/ui/date-picker';
import { CampoMoeda } from '@/components/ui/campo-moeda';
import { AreaDeArquivo } from '@/components/ui/area-de-arquivo';
import { cn } from '@/lib/utils';
import { REGRA_ARQUIVO_DO_DOCUMENTO } from '@/hooks/useLancamentoDocumentos';
import { anexarSaldoDocumento, cancelarSaldoDocumento, useSaldoDocumentos } from '@/hooks/useExtratoDaConta';
import { invalidarDono } from '@/hooks/useResumoConciliacao';
import { avisarContaBancariaMudou } from '@/lib/financeiro/canalContasBancarias';
import {
  brl, faltasDoFormulario, formularioDaConta, mudancas, mudaOSaldoInicial, nomeDaConta, subtituloDaConta,
  type BancoReferencia, type ContaBancariaCadastro, type FormatoNaTela, type FormularioConta, type TipoNaTela,
} from '@/lib/financeiro/contasBancarias';

export type AbaDaConta = 'dados' | 'gerente' | 'saldo' | 'importacao';
const ABAS: Array<{ valor: AbaDaConta; rotulo: string }> = [
  { valor: 'dados', rotulo: 'Dados da conta' },
  { valor: 'gerente', rotulo: 'Banco e gerente' },
  { valor: 'saldo', rotulo: 'Saldo inicial' },
  { valor: 'importacao', rotulo: 'Importação e vínculos' },
];

const TIPOS: Array<{ valor: TipoNaTela; rotulo: string }> = [
  { valor: 'cc', rotulo: 'Conta corrente' }, { valor: 'inv', rotulo: 'Investimento' },
  { valor: 'cartao', rotulo: 'Cartão' }, { valor: 'caixa', rotulo: 'Caixa físico' },
];
const FORMATOS: Array<{ valor: FormatoNaTela; rotulo: string }> = [
  { valor: 'ofx', rotulo: 'OFX' }, { valor: 'planilha', rotulo: 'Planilha' }, { valor: 'pdf', rotulo: 'PDF' }, { valor: 'sem_extrato', rotulo: 'Sem extrato' },
];
const SEM_VINCULO = '__nenhuma__';
export const FRASE_SEM_SENHA = 'Senhas e acessos do internet banking nunca ficam no sistema.';
/* P59 (Gabriel 23/10/2026) — medido no CAD-CONTAS: so' o MES SEGUINTE parte do saldo inicial; os outros partem do saldo do proprio banco.
   A frase antiga ("refaz os saldos de todos os meses seguintes") dizia mais do que acontece. */
export const FRASE_AVISO_SALDO = 'Mudar o saldo ou a data muda o ponto de partida da Conciliação (o mês seguinte começa daqui). A alteração fica na Auditoria com quem fez e quando.';
export const FRASE_SEM_EXTRATO = 'Conta sem extrato não exige a ponta dela nas transferências.';

interface Painel {
  extratos?: { quantos?: number; primeiro?: string | null; ultimo?: string | null } | null;
  lancamentos?: { quantos?: number; primeiro?: string | null; ultimo?: string | null } | null;
  recorrencias?: { quantos?: number; primeiro?: string | null; ultimo?: string | null } | null;
  ultima_alteracao?: { em?: string | null; por?: string | null } | null;
}

const dataBr = (iso: string | null | undefined): string => (iso ? formatIsoToBr(String(iso).slice(0, 10)) : '');
const fimDoMes = (anoMes: string): string => {
  const [a, m] = anoMes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

export function ContaBancariaModal({ aberto, onFechar, clienteId, clienteNome, conta, contas, bancos, fazendas, abaInicial = 'dados', onSalvo }: {
  aberto: boolean;
  onFechar: () => void;
  clienteId: string;
  clienteNome?: string | null;
  /** null = nova conta */
  conta: ContaBancariaCadastro | null;
  /** as contas do cliente (para o vinculo de investimento) */
  contas: readonly ContaBancariaCadastro[];
  bancos: readonly BancoReferencia[];
  fazendas: ReadonlyArray<{ id: string; nome: string }>;
  abaInicial?: AbaDaConta;
  /** a conta salva e as de investimento cujo vínculo mudou (o vínculo mora nelas) */
  onSalvo: (contasRelidas: string[]) => void;
}) {
  const nova = !conta;
  const qc = useQueryClient();
  const internaAtual = useMemo(
    () => (conta ? contas.find(c => c.tipo_conta === 'inv' && c.consolida_em_conta_id === conta.id)?.id ?? null : null), [conta, contas]);
  const original = useMemo(() => (conta ? formularioDaConta(conta, '', internaAtual) : null), [conta, internaAtual]);
  const [form, setForm] = useState<FormularioConta>(() => formularioDaConta(conta, fazendas[0]?.id ?? '', internaAtual));
  const [aba, setAba] = useState<AbaDaConta>(abaInicial);
  const [novoNome, setNovoNome] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setForm(formularioDaConta(conta, fazendas[0]?.id ?? '', internaAtual));
    setAba(abaInicial); setNovoNome(''); setArquivo(null); setErro(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reabre o formulario quando o modal abre ou troca de conta
  }, [aberto, conta?.id]);

  const muda = <K extends keyof FormularioConta>(k: K, v: FormularioConta[K]) => setForm(f => ({ ...f, [k]: v }));
  const caixa = form.tipo === 'caixa';
  const diff = useMemo(() => mudancas(original, form), [original, form]);
  const faltas = faltasDoFormulario(form, nova);
  const nadaMudou = !nova && Object.keys(diff).length === 0 && !arquivo;

  /* ─── leituras ─────────────────────────────────────────────────────────── */
  const painel = useQuery({
    queryKey: ['conta-bancaria-painel', conta?.id],
    enabled: aberto && !!conta,
    queryFn: async (): Promise<Painel | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data, error } = await (supabase as any).rpc('fn_conta_bancaria_painel', { p_conta_id: conta!.id });
      if (error) throw error;
      return (data ?? null) as Painel | null;
    },
  });
  const autorId = painel.data?.ultima_alteracao?.por ?? null;
  const autor = useQuery({
    queryKey: ['nomes-dos-autores', clienteId, autorId],
    enabled: !!autorId,
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
      const { data } = await (supabase as any).rpc('fn_nomes_dos_autores', { p_cliente_id: clienteId, p_user_ids: [autorId] });
      const r = Array.isArray(data) ? data[0] : null;
      return r?.nome || r?.email || null;
    },
  });

  /* "Efeito na Conciliação" — P58 (Gabriel 23/10/2026): UMA ida ao banco (`fn_conta_bancaria_efeito_conciliacao`): os meses conciliados,
     o último e o saldo dele, pela MESMA interna do status mensal da Conciliação, só desta conta (antes: o status do ano de TODAS as contas,
     um pedido por ano — ~25 s no NJ). A igualdade com a régua antiga foi provada no banco (Vera 6 e NJ 17 contas, 0 diferenças). */
  const mesInicio = conta?.mes_inicio && /^\d{4}-\d{2}$/.test(conta.mes_inicio) ? conta.mes_inicio : null;
  const efeitoLido = useQuery({
    queryKey: ['conta-bancaria-efeito-conciliacao', conta?.id, mesInicio],
    enabled: aberto && aba === 'saldo' && !!conta && !!mesInicio,
    queryFn: async () => lerEfeitoDaConciliacao(await efeitoDaConciliacaoDoBanco(conta!.id)),
  });
  const efeito = efeitoLido.data ? { meses: efeitoLido.data.meses, ultimo: efeitoLido.data.ultimo } : null;
  const saldoDoUltimo = { data: efeitoLido.data && efeitoLido.data.ultimo ? { saldo_final: efeitoLido.data.saldoFinal, saldo_data: efeitoLido.data.saldoData } : null };

  /* o comprovante do saldo: o anexo do mês de início (`financeiro_saldo_documentos`, o mesmo da Conciliação) */
  const [anoIni, mesIni] = mesInicio ? mesInicio.split('-').map(Number) : [0, 0];
  const docs = useSaldoDocumentos(conta && mesInicio ? clienteId : null, conta?.id ?? null, anoIni, mesIni);
  const comprovante = docs.documentos[0] ?? null;

  /* ─── opções ───────────────────────────────────────────────────────────── */
  const opcoesBanco = useMemo(() => bancos.filter(b => b.nome_curto !== 'Dinheiro').map(b => ({
    value: b.nome_curto, label: b.codigo_banco !== '000' ? `${b.codigo_banco} ${b.nome_banco}` : b.nome_banco,
    busca: `${b.codigo_banco} ${b.nome_curto}`,
  })), [bancos]);
  const opcoesBancoComAtual = useMemo(() => (form.banco && !opcoesBanco.some(o => o.value === form.banco)
    ? [{ value: form.banco, label: form.banco, busca: form.banco }, ...opcoesBanco] : opcoesBanco), [opcoesBanco, form.banco]);
  const opcoesFazenda = useMemo(() => fazendas.filter(f => f.id !== '__global__').map(f => ({ value: f.id, label: f.nome })), [fazendas]);
  const opcoesVinculo = useMemo(() => {
    const alvoTipo = form.tipo === 'inv' ? 'cc' : 'inv';
    const lista = contas.filter(c => c.id !== conta?.id && (c.tipo_conta || 'cc') === alvoTipo && (c.ativa || c.id === form.contaVinculada))
      .map(c => ({ value: c.id, label: nomeDaConta(c) }));
    return [{ value: SEM_VINCULO, label: 'Nenhuma' }, ...lista];
  }, [contas, conta?.id, form.tipo, form.contaVinculada]);

  /* ─── gravar ───────────────────────────────────────────────────────────── */
  const salvar = async () => {
    if (gravando || faltas.length > 0) return;
    setGravando(true); setErro(null);
    try {
      let contaId = conta?.id ?? null;
      if (Object.keys(diff).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
        const { data, error } = await (supabase as any).rpc('fn_conta_bancaria_salvar', { p_cliente_id: clienteId, p_conta_id: contaId, p_dados: diff });
        if (error) { setErro(error.message || 'Não foi possível salvar a conta.'); return; }
        contaId = (data as { id?: string } | null)?.id ?? contaId;
      }
      const mes = (diff.mes_inicio as string | undefined) ?? conta?.mes_inicio ?? null;
      if (arquivo && contaId && mes) {
        const r = await anexarSaldoDocumento({ clienteId, contaId, anoMes: mes, file: arquivo });
        if (!r.ok) toast.error(`Conta salva, mas o comprovante não subiu: ${r.erro ?? 'erro'}`);
        else if (comprovante && mes === mesInicio) {
          await cancelarSaldoDocumento({ documentoId: comprovante.id, clienteId, motivo: 'substituído no cadastro da conta' });
        }
      }
      if (contaId) {
        avisarContaBancariaMudou(clienteId, contaId);
        if (mudaOSaldoInicial(diff) || 'sem_extrato_bancario' in diff || 'conta_interna_id' in diff || 'consolida_em_conta_id' in diff) invalidarDono(qc, clienteId);
        void qc.invalidateQueries({ queryKey: ['conta-bancaria-painel', contaId] });
        toast.success(nova ? 'Conta criada' : 'Conta atualizada');
        onSalvo([contaId, ...(internaAtual ? [internaAtual] : []), ...(form.contaVinculada ? [form.contaVinculada] : [])]);
      }
      onFechar();
    } finally {
      setGravando(false);
    }
  };

  const adicionarNome = () => {
    const n = novoNome.trim();
    if (!n) return;
    if (!form.nomesReconhecimento.some(x => x.toLowerCase() === n.toLowerCase())) muda('nomesReconhecimento', [...form.nomesReconhecimento, n]);
    setNovoNome('');
  };

  const titulo = nova ? 'Nova conta bancária' : 'Editar conta';
  const subtitulo = conta ? subtituloDaConta(conta, bancos) : (clienteNome ?? '');
  const ultimaAlteracao = painel.data?.ultima_alteracao?.em
    ? `Última alteração ${dataBr(painel.data.ultima_alteracao.em)}${autor.data ? ` por ${autor.data}` : ''}` : '';
  const rodapeTexto = erro ? erro : faltas.length > 0 && !nova ? `Falta: ${faltas.join(', ')}` : nova ? 'Campos com * são obrigatórios' : ultimaAlteracao;

  const campo = (k: keyof FormularioConta, rotulo: string, opts: { obrig?: boolean; span?: string; placeholder?: string; testId?: string; desabilitado?: boolean } = {}) => (
    <label className={cn('min-w-0', opts.span)}>
      <Rotulo texto={rotulo} obrig={opts.obrig} />
      <Input className={REGUA_CAMPO} value={String(form[k] ?? '')} placeholder={opts.desabilitado ? 'não se aplica' : opts.placeholder}
        disabled={opts.desabilitado} onChange={e => muda(k, e.target.value as never)} data-testid={opts.testId} />
    </label>
  );

  const usoLinhas: Array<[string, Painel['extratos']]> = [
    ['Extratos importados', painel.data?.extratos], ['Lançamentos financeiros', painel.data?.lancamentos], ['Recorrências', painel.data?.recorrencias],
  ];
  const semUso = !conta || usoLinhas.every(([, u]) => !u?.quantos);

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="flex h-[min(500px,calc(100vh-16px))] w-[min(780px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button.absolute]:hidden"
        data-testid="modal-conta-bancaria" onPointerDownOutside={(e) => e.preventDefault()}>
        <div className="flex h-[32px] shrink-0 items-center gap-2.5 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="shrink-0 whitespace-nowrap text-[13px] font-semibold">{titulo}</DialogTitle>
          <DialogDescription className="uma-linha-que-rola min-w-0 flex-1 text-[11px] text-primary-foreground/80" title={subtitulo} data-testid="subtitulo-conta">
            {subtitulo}
          </DialogDescription>
          <button type="button" onClick={onFechar} className="shrink-0 rounded p-0.5 hover:bg-white/10" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="flex shrink-0 gap-0.5 overflow-x-auto border-b bg-card px-2" role="tablist">
          {ABAS.map(a => (
            <button key={a.valor} type="button" role="tab" aria-selected={aba === a.valor} onClick={() => setAba(a.valor)} data-testid={`aba-conta-${a.valor}`}
              className={cn('-mb-px whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[11px]',
                aba === a.valor ? 'border-primary font-semibold text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {a.rotulo}
              {a.valor === 'saldo' && nova && <span className="ml-1 text-amber-700 dark:text-amber-400">obrigatório</span>}
            </button>
          ))}
        </div>

        {/* o miolo de cada aba troca de propósito (outros campos): `data-desloca-livre`; cabeçalho, abas e rodapé ficam medidos */}
        <div className="flex min-h-0 flex-1 flex-col" data-desloca-livre="">
        <CorpoFormulario className="min-h-0 flex-1 overflow-hidden">
          {aba === 'dados' && (<>
            <BlocoFormulario titulo="Identificação" testId="bloco-identificacao">
              <div className={cn(GRADE_FORMULARIO, 'grid-cols-4')}>
                {campo('nome', 'Nome da conta', { obrig: true, span: 'col-span-2', testId: 'campo-nome-conta' })}
                {campo('codigo', 'Código curto', { placeholder: nova ? 'gerado ao criar' : '' })}
                <div className="min-w-0">
                  <Rotulo texto="Situação" />
                  <div className="flex h-7 items-center gap-1.5 text-[11px]">
                    <Switch checked={form.ativa} onCheckedChange={v => muda('ativa', v)} data-testid="campo-situacao" />{form.ativa ? 'Ativa' : 'Inativa'}
                  </div>
                </div>
                <div className="col-span-2 min-w-0">
                  <Rotulo texto="Tipo" obrig />
                  <Segmentado altura={28} valor={form.tipo} onEscolher={v => muda('tipo', v)} opcoes={TIPOS} />
                </div>
                <div className="col-span-2 min-w-0">
                  <Rotulo texto="Fazenda" obrig />
                  <SearchableSelect value={form.fazendaId} onValueChange={v => muda('fazendaId', v)} options={opcoesFazenda}
                    semTodos allValue="" allLabel="Selecione" placeholder="Selecione" dense triggerClassName={REGUA_CAMPO} />
                </div>
              </div>
            </BlocoFormulario>
            <BlocoFormulario titulo="Dados bancários" testId="bloco-dados-bancarios">
              <div className={cn(GRADE_FORMULARIO, 'grid-cols-4')}>
                <div className="col-span-2 min-w-0">
                  <Rotulo texto="Banco" />
                  {caixa
                    ? <Input className={REGUA_CAMPO} disabled value="Caixa físico" readOnly />
                    : <SearchableSelect value={form.banco} onValueChange={v => muda('banco', v)} options={opcoesBancoComAtual}
                        semTodos allValue="" allLabel="Selecione" placeholder="Selecione" dense triggerClassName={REGUA_CAMPO} />}
                </div>
                {campo('agencia', 'Agência', { desabilitado: caixa })}
                {campo('contaComDigito', 'Conta e dígito', { desabilitado: caixa, placeholder: '00000-0' })}
                {campo('titular', 'Titular', { span: 'col-span-2' })}
                {campo('titularDocumento', 'CPF ou CNPJ do titular')}
                {campo('chavePix', 'Chave Pix')}
                <label className="col-span-4 min-w-0">
                  <Rotulo texto="Observação" />
                  <Textarea className="h-[44px] min-h-0 resize-none px-2 py-1 text-[11px]" value={form.observacao} onChange={e => muda('observacao', e.target.value)} />
                </label>
              </div>
            </BlocoFormulario>
          </>)}

          {aba === 'gerente' && (<>
            <BlocoFormulario titulo="Gerente" testId="bloco-gerente">
              <div className={cn(GRADE_FORMULARIO, 'grid-cols-3')}>
                {campo('gerenteNome', 'Nome')}
                {campo('gerenteTelefone', 'Telefone')}
                {campo('gerenteCelular', 'Celular ou WhatsApp')}
                {campo('gerenteEmail', 'E-mail', { span: 'col-span-2' })}
                <div className="min-w-0">
                  <Rotulo texto="Desde" />
                  <DatePicker value={form.gerenteDesde} onChange={v => muda('gerenteDesde', v)} className={REGUA_CAMPO} />
                </div>
              </div>
            </BlocoFormulario>
            <BlocoFormulario titulo="Agência" testId="bloco-agencia">
              <div className={cn(GRADE_FORMULARIO, 'grid-cols-3')}>
                {campo('agenciaEndereco', 'Endereço', { span: 'col-span-2' })}
                {campo('agenciaCidadeUf', 'Cidade e UF')}
                {campo('agenciaTelefone', 'Telefone da agência')}
                {campo('agenciaOutroContato', 'Outro contato', { span: 'col-span-2' })}
                <label className="col-span-3 min-w-0">
                  <Rotulo texto="Observação de contato" />
                  <Textarea className="h-[44px] min-h-0 resize-none px-2 py-1 text-[11px]" value={form.agenciaObservacao} onChange={e => muda('agenciaObservacao', e.target.value)} />
                </label>
              </div>
            </BlocoFormulario>
            <p className="px-1 text-[10.5px] text-muted-foreground" data-testid="frase-sem-senha">{FRASE_SEM_SENHA}</p>
          </>)}

          {aba === 'saldo' && (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 min-[820px]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <BlocoFormulario titulo="Ponto de partida da conta" testId="bloco-saldo-inicial">
                <div className={cn(GRADE_FORMULARIO, 'grid-cols-2')}>
                  <div className="min-w-0">
                    <Rotulo texto="Saldo em" obrig />
                    {/* o saldo é do 1º dia do mês (a Conciliação é mensal): a data escolhida vira o dia 1º do mês dela */}
                    <DatePicker value={form.saldoEm} onChange={v => muda('saldoEm', v ? `${v.slice(0, 7)}-01` : '')} className={REGUA_CAMPO} data-testid="campo-saldo-em" />
                  </div>
                  <div className="min-w-0">
                    <Rotulo texto="Saldo inicial" obrig />
                    <CampoMoeda valor={form.saldoInicial} onChange={v => muda('saldoInicial', v)} aceitaNegativo className={REGUA_CAMPO} />
                  </div>
                  <div className="col-span-2 min-w-0">
                    <Rotulo texto="Comprovante do saldo" />
                    <AreaDeArquivo regra={REGRA_ARQUIVO_DO_DOCUMENTO} className="h-7" testId="comprovante-saldo"
                      onArquivos={(a) => setArquivo(a[0] ?? null)}
                      conteudo={arquivo ? arquivo.name : comprovante ? comprovante.nome : undefined}
                      tituloDoConteudo={arquivo ? arquivo.name : comprovante?.nome}
                      fixo={arquivo || comprovante ? 'trocar' : undefined}
                      onRemover={arquivo ? () => setArquivo(null) : undefined} />
                  </div>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
                  É o saldo real do banco no início do dia 1º do mês escolhido. Tudo o que a Conciliação calcula parte daqui.
                </p>
                {!nova && (
                  <p className={cn('mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10.5px] leading-snug text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                    mudaOSaldoInicial(diff) && 'font-semibold')} data-testid="aviso-saldo-inicial">{FRASE_AVISO_SALDO}</p>
                )}
              </BlocoFormulario>
              <BlocoFormulario titulo="Efeito na Conciliação" className="hidden min-[820px]:flex" testId="bloco-efeito-conciliacao">
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 text-[11px]">
                  <dt className="whitespace-nowrap text-muted-foreground">Conciliação desde</dt>
                  <dd className="whitespace-nowrap font-medium tabular-nums">
                    {form.saldoEm ? formatIsoToBr(form.saldoEm) : <span className="font-normal text-muted-foreground">a data do saldo</span>}
                  </dd>
                  {!nova && (<>
                    <dt className="whitespace-nowrap text-muted-foreground">Meses conciliados</dt>
                    <dd className="whitespace-nowrap font-medium tabular-nums" data-testid="meses-conciliados">
                      {efeito ? efeito.meses : <span className="font-normal text-muted-foreground">{mesInicio ? 'lendo…' : 'sem início'}</span>}
                    </dd>
                    <dt className="whitespace-nowrap text-muted-foreground">Último saldo conferido</dt>
                    <dd className="whitespace-nowrap font-medium tabular-nums">
                      {efeito?.ultimo ? dataBr(saldoDoUltimo.data?.saldo_data ?? fimDoMes(efeito.ultimo)) : <span className="font-normal text-muted-foreground">{efeito ? 'nenhum' : ''}</span>}
                    </dd>
                    {efeito?.ultimo && (<>
                      <dt className="whitespace-nowrap text-muted-foreground">Saldo em {dataBr(saldoDoUltimo.data?.saldo_data ?? fimDoMes(efeito.ultimo))}</dt>
                      <dd className="whitespace-nowrap font-medium tabular-nums">{saldoDoUltimo.data?.saldo_final != null ? brl(Number(saldoDoUltimo.data.saldo_final)) : ''}</dd>
                    </>)}
                  </>)}
                </dl>
              </BlocoFormulario>
            </div>
          )}

          {aba === 'importacao' && (<>
            <BlocoFormulario titulo="Como a conta é reconhecida na importação" dica="nomes que aparecem no extrato ou na planilha" testId="bloco-reconhecimento">
              <div className="flex min-h-7 flex-wrap items-center gap-1 rounded-md border bg-card px-1 py-0.5" data-testid="nomes-reconhecimento">
                {form.nomesReconhecimento.map(n => (
                  <span key={n} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 text-[11px] text-primary">
                    {n}
                    <button type="button" aria-label={`Tirar ${n}`} className="text-muted-foreground hover:text-foreground"
                      onClick={() => muda('nomesReconhecimento', form.nomesReconhecimento.filter(x => x !== n))}>✕</button>
                  </span>
                ))}
                <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="+ nome" data-testid="novo-nome-reconhecimento"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarNome(); } }} onBlur={adicionarNome}
                  className="h-6 min-w-[80px] flex-1 bg-transparent px-1 text-[11px] outline-none placeholder:text-muted-foreground" />
              </div>
              <div className={cn(GRADE_FORMULARIO, 'mt-1.5 grid-cols-3')}>
                <div className="min-w-0">
                  <Rotulo texto="Formato do extrato" />
                  <Segmentado altura={28} valor={(form.formato ?? '') as FormatoNaTela} onEscolher={v => muda('formato', v)} opcoes={FORMATOS} />
                </div>
                {(form.tipo === 'cc' || form.tipo === 'inv') && (
                  <div className="col-span-2 min-w-0">
                    <Rotulo texto={form.tipo === 'inv' ? 'Conta corrente onde esta vive' : 'Conta de investimento que vive dentro desta'} />
                    <SearchableSelect value={form.contaVinculada || SEM_VINCULO} onValueChange={v => muda('contaVinculada', v === SEM_VINCULO ? '' : v)}
                      options={opcoesVinculo} semTodos allValue={SEM_VINCULO} allLabel="Nenhuma" placeholder="Nenhuma" dense triggerClassName={REGUA_CAMPO} />
                  </div>
                )}
              </div>
              <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
                {form.formato === 'sem_extrato' ? FRASE_SEM_EXTRATO : 'A conta de investimento aparece separada na Conciliação e somada nos saldos por conta.'}
              </p>
            </BlocoFormulario>
            <BlocoFormulario titulo="Uso da conta" className="min-h-0 flex-1" testId="bloco-uso">
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full border-separate border-spacing-0 text-[11px]">
                  <thead><tr className="sticky top-0 bg-muted text-left text-[10.5px] text-muted-foreground">
                    <th className="h-[21px] border-b px-1.5 font-semibold">O quê</th><th className="h-[21px] border-b px-1.5 text-right font-semibold">Quantos</th>
                    <th className="h-[21px] border-b px-1.5 font-semibold">Primeiro</th><th className="h-[21px] border-b px-1.5 font-semibold">Último</th>
                  </tr></thead>
                  <tbody>
                    {semUso
                      ? <tr><td colSpan={4} className="h-[21px] px-1.5 text-muted-foreground">{conta && painel.isLoading ? 'lendo…' : 'A conta ainda não tem uso.'}</td></tr>
                      : usoLinhas.map(([o, u]) => (
                        <tr key={o}>
                          <td className="h-[21px] whitespace-nowrap border-b px-1.5">{o}</td>
                          <td className="h-[21px] whitespace-nowrap border-b px-1.5 text-right tabular-nums">{(u?.quantos ?? 0).toLocaleString('pt-BR')}</td>
                          <td className="h-[21px] whitespace-nowrap border-b px-1.5 tabular-nums">{dataBr(u?.primeiro)}</td>
                          <td className="h-[21px] whitespace-nowrap border-b px-1.5 tabular-nums">{dataBr(u?.ultimo)}</td>
                        </tr>))}
                  </tbody>
                </table>
              </div>
            </BlocoFormulario>
          </>)}
        </CorpoFormulario>
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t bg-card px-3 py-1.5">
          <span className={cn('uma-linha-que-rola min-w-0 flex-1 text-[11px]', erro ? 'text-destructive' : 'text-muted-foreground')} title={rodapeTexto}
            data-testid="rodape-conta">{rodapeTexto}</span>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={() => void salvar()} disabled={gravando || faltas.length > 0 || nadaMudou}
            title={faltas.length > 0 ? `Falta: ${faltas.join(', ')}` : undefined} data-testid="salvar-conta">
            {gravando ? 'Salvando…' : nova ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** P58 — a resposta de `fn_conta_bancaria_efeito_conciliacao`, lida sem cast. `ultimo` = 'AAAA-MM' (ou nulo). */
export interface EfeitoDaConciliacao { meses: number; ultimo: string | null; saldoData: string | null; saldoFinal: number | null }
export function lerEfeitoDaConciliacao(r: unknown): EfeitoDaConciliacao {
  const o = r && typeof r === 'object' ? r : {};
  const txt = (k: string) => { const v: unknown = Reflect.get(o, k); return typeof v === 'string' && v ? v : null; };
  const n: unknown = Reflect.get(o, 'saldo_final');
  return { meses: Number(Reflect.get(o, 'meses')) || 0, ultimo: txt('ultimo'), saldoData: txt('saldo_data'), saldoFinal: n == null ? null : Number(n) };
}
async function efeitoDaConciliacaoDoBanco(contaId: string): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- idioma documentado: o `.rpc` do repo
  const { data, error } = await (supabase as any).rpc('fn_conta_bancaria_efeito_conciliacao', { p_conta_id: contaId });
  if (error) throw error;
  return data;
}
