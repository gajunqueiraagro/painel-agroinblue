/**
 * FOLHA-01 · PR B (telas) — o CADASTRO do funcionário (novo e editar), modal em blocos no molde do `BemDialog` (1000 × 540, tamanho fixo).
 * Contrato §3.1: `fn_folha_funcionario_gravar` · `fn_folha_salario_gravar` · `fn_folha_atuacao_gravar` · `_desligar` · `_reativar`.
 * ⚠ TODO GESTO PASSA PELA PRÉVIA (`p_simular = true`) e só grava se ela passar; a recusa do banco (P0001) vai para o rodapé, nunca toast
 *   (UX-TOAST-01). Campo obrigatório que falta fica vermelho com a frase e nada vai ao banco (UX-OBRIGATORIOS-01).
 * ⚠ O GRAVADOR SOBRESCREVE: o pedido é o registro INTEIRO (`pedidoDoFuncionario`), com o `recorrencia_origem_id` que veio.
 * ⚠ PIX/BANCO/CONTATO SÃO DO FAVORECIDO (fonte única): a aba Cadastro os EDITA (FOLHA-FUNC-CADASTRO-01) e o Salvar grava o funcionário E o
 *   favorecido (`fn_fornecedor_atualizar_campos`, só o que mudou) — as duas prévias antes, as duas gravações depois.
 * ⚠ NOVO: só a aba Cadastro; salário, atuação e situação abrem depois de salvar (o funcionário precisa existir).
 */
import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoMoeda, CampoPercentual } from '@/components/ui/campo-moeda';
import { BlocoFormulario, Rotulo, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import {
  ALTURA_CONTROLE, CAMPO_DATA, CONTROLE, FONTE_CONTROLE, LARGURA_CAMPO_DATA, LINHA_COM_CONTROLE, LINHA_FONTES, TD_FONTES, TD_FONTES_DATA,
  TD_FONTES_NUM, TD_FONTES_TEXTO, TEXTO_ROTULO, TH_FONTES, TITULO_MODAL, larguraDoSeletor,
} from '@/components/ui/regua-fontes';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFicha, useFolhaApi, useRelerFolha } from '@/hooks/useFolha';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import {
  ATIVIDADES, dataBR, FORM_VAZIO, formDoCadastro, n2, pedidoDoFuncionario, pendenciasDoForm,
  problemaDaAtuacao, rotuloAAtualizar, rotuloAtividade, rotuloSituacao, type FormFuncionario,
} from '@/lib/folha/folhaTela';
import { atuacaoVigente, avisoDoDesde, desdeInicial } from '@/lib/folha/admissao';
import {
  aAtualizarDoTopo, camposQueMudaram, EXTRAS_VAZIO, FAVORECIDO_VAZIO, formDoFavorecido, formDosExtras, oQueFaltaPorBloco, pedidoDosExtras,
  type FormExtras, type FormFavorecido,
} from '@/lib/folha/fichaCadastro';
import { useCadastroCompleto, useFichaCadastroApi } from '@/hooks/useFichaCadastro';
import { AbaCadastroFuncionario } from './AbaCadastroFuncionario';

type Aba = 'cadastro' | 'salario' | 'situacao';
type Passo = (simular: boolean) => Promise<{ ok: boolean; erro?: string; dados?: Record<string, unknown> }>;
interface LinhaAtuacao { fazenda_id: string; atividade: string; pct: number | null }
/* UI-FONTES-REGUA-01 (Gabriel 25/11 07:41): este modal veste a régua nova de fontes e alturas (`regua-fontes`) */
const TH = cn(TH_FONTES, 'sticky top-0 z-10 bg-primary text-left');

/** FOLHA-ADMISSAO-01 — o lugar fixo (26px) ao lado do Gravar: o aviso do "Desde" antes da admissão, ou a oferta de gravar a data como admissão */
function AvisoDoBloco({ aviso, oferta, indo, onGravarAdmissao, testid }: {
  aviso: string | null; oferta: string | null; indo: boolean; onGravarAdmissao: (data: string) => void; testid: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2 px-2" data-testid={testid}>
      {oferta ? (
        <>
          <span className={cn('whitespace-nowrap text-amber-800', TEXTO_ROTULO)}>admissão vazia: gravar {dataBR(oferta)} como admissão?</span>
          <Button size="sm" variant="outline" className={cn(CONTROLE, 'shrink-0')} disabled={indo} onClick={() => onGravarAdmissao(oferta)}
            data-testid="funcionario-gravar-admissao">Gravar admissão</Button>
        </>
      ) : <span className={cn('whitespace-nowrap text-amber-800', TEXTO_ROTULO)}>{aviso ?? ''}</span>}
    </span>
  );
}

export function FuncionarioDialog({ clienteId, funcionarioId, aoFechar, aoCriar }: {
  clienteId: string; funcionarioId: string | null; aoFechar: () => void; aoCriar: (id: string) => void;
}) {
  const api = useFolhaApi();
  const reler = useRelerFolha();
  const { data: ficha, isLoading } = useFicha(funcionarioId);
  const { fazendas } = useFazenda();
  const fazendasDoCliente = useMemo(() => fazendas.filter(f => f.id !== '__global__'), [fazendas]);
  const [aba, setAba] = useState<Aba>('cadastro');
  const [form, setForm] = useState<FormFuncionario>(FORM_VAZIO);
  const [carregado, setCarregado] = useState(funcionarioId == null);
  const [erros, setErros] = useState<Partial<Record<keyof FormFuncionario, string>>>({});
  const [rodape, setRodape] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  /* salário novo — FOLHA-ADMISSAO-01: o "Desde" nasce na admissão (1ª linha) ou VAZIO (linha nova), nunca hoje (`desdeInicial`) */
  const [salDesde, setSalDesde] = useState('');
  const [salValor, setSalValor] = useState<number | null>(null);
  const [salParte, setSalParte] = useState<number | null>(100);
  const [salMotivo, setSalMotivo] = useState('');
  /* atuação nova */
  const [atuDesde, setAtuDesde] = useState('');
  const [atuacao, setAtuacao] = useState<LinhaAtuacao[]>([]);
  /* situação */
  const [deslData, setDeslData] = useState(hojeLocal());
  const [sitMotivo, setSitMotivo] = useState('');
  /* FOLHA-ADMISSAO-01: a admissão vazia e o 1º salário/atuação gravado com uma data → oferecer essa data como admissão (ele confirma) */
  const [ofertaAdmissao, setOfertaAdmissao] = useState<{ data: string; onde: 'salario' | 'atuacao' } | null>(null);
  /* FOLHA-FUNC-CADASTRO-01: os campos novos do funcionário e o pagamento/contato do favorecido */
  const apiFicha = useFichaCadastroApi();
  const [extras, setExtras] = useState<FormExtras>(EXTRAS_VAZIO);
  const [extrasCarregados, setExtrasCarregados] = useState(false);
  const [fav, setFavForm] = useState<FormFavorecido>(FAVORECIDO_VAZIO);
  const [favDoForm, setFavDoForm] = useState<string | null>(null);
  const { data: cadastro } = useCadastroCompleto(funcionarioId, form.favorecido_id || null);

  useEffect(() => {
    if (!ficha || carregado) return;
    setForm(formDoCadastro(ficha.funcionario));
    const atual = atuacaoVigente(ficha.atuacoes, hojeLocal())?.itens ?? ficha.atuacoes.filter(a => a.desde === ficha.atuacoes[0]?.desde);
    setAtuacao(atual.map(a => ({ fazenda_id: a.fazenda_id ?? '', atividade: a.atividade ?? '', pct: a.pct })));
    setSalDesde(desdeInicial(ficha.salarios.length > 0, ficha.funcionario.admissao));
    setAtuDesde(desdeInicial(ficha.atuacoes.length > 0, ficha.funcionario.admissao));
    setCarregado(true);
  }, [ficha, carregado]);
  useEffect(() => {
    if (!cadastro || extrasCarregados) return;
    setExtras(formDosExtras(cadastro.extras));
    setExtrasCarregados(true);
  }, [cadastro, extrasCarregados]);
  /* o favorecido trocou (ou chegou): o formulário de pagamento/contato passa a ser o DELE */
  useEffect(() => {
    const id = cadastro?.favorecido?.id ?? null;
    if (!cadastro || id === favDoForm) return;
    setFavForm(formDoFavorecido(cadastro.favorecido));
    setFavDoForm(id);
  }, [cadastro, favDoForm]);

  const set = <K extends keyof FormFuncionario>(k: K, v: FormFuncionario[K]) => { setForm(f => ({ ...f, [k]: v })); setErros(e => ({ ...e, [k]: undefined })); setRodape(null); };
  const setExtra = <K extends keyof FormExtras>(k: K, v: FormExtras[K]) => { setExtras(x => ({ ...x, [k]: v })); setRodape(null); };
  const setFav = <K extends keyof FormFavorecido>(k: K, v: FormFavorecido[K]) => { setFavForm(x => ({ ...x, [k]: v })); setRodape(null); };
  const titulo = funcionarioId ? `Funcionário · ${ficha?.funcionario.nome ?? '…'}` : 'Novo funcionário';
  const desligado = ficha?.funcionario.situacao === 'desligado';

  /** prévia → grava; a recusa vai ao rodapé. Com `depois` (o favorecido no Salvar do Cadastro): as DUAS prévias antes, as duas gravações depois */
  const emDoisPassos = async (passo: Passo, ok: string, depois?: Passo | null): Promise<Record<string, unknown> | null> => {
    setIndo(true); setRodape(null);
    try {
      const previa = await passo(true);
      if (!previa.ok) { setRodape(previa.erro ?? 'O banco recusou.'); return null; }
      if (depois) { const p2 = await depois(true); if (!p2.ok) { setRodape(p2.erro ?? 'O banco recusou o pagamento/contato.'); return null; } }
      const r = await passo(false);
      if (!r.ok) { setRodape(r.erro ?? 'O banco recusou.'); return null; }
      if (depois) {
        const r2 = await depois(false);
        if (!r2.ok) { await reler(); setRodape(`O cadastro foi salvo, mas o pagamento/contato não: ${r2.erro ?? 'o banco recusou'}.`); return null; }
      }
      toast.success(ok);
      await reler();
      return r.dados ?? {};
    } finally { setIndo(false); }
  };

  const salvarCadastro = async () => {
    const pend = pendenciasDoForm(form);
    if (Object.keys(pend).length) { setErros(pend); setRodape(Object.values(pend)[0] ?? null); return; }
    const pedido = { ...pedidoDoFuncionario(form, ficha?.funcionario ?? null), ...pedidoDosExtras(extras) };
    /* o favorecido: só o que mudou, e só o do formulário (trocou de favorecido = o formulário já é o do novo) */
    const favId = form.favorecido_id && cadastro?.favorecido?.id === form.favorecido_id ? form.favorecido_id : null;
    const campos = favId ? camposQueMudaram(cadastro?.favorecido ?? null, fav) : {};
    const doFavorecido: Passo | null = favId && Object.keys(campos).length > 0 ? s => apiFicha.gravarFavorecido(favId, campos, s) : null;
    const r = await emDoisPassos(s => api.gravarFuncionario(clienteId, pedido, s), funcionarioId ? 'Cadastro salvo.' : 'Funcionário criado.', doFavorecido);
    if (r && !funcionarioId && typeof r.id === 'string') aoCriar(r.id);
    /* a 1ª linha ainda por gravar acompanha a admissão salva (as gravadas, o banco move com trilha) */
    if (r && ficha) {
      if (ficha.salarios.length === 0) setSalDesde(form.admissao);
      if (ficha.atuacoes.length === 0) setAtuDesde(form.admissao);
    }
  };
  /** grava SÓ a admissão (o cadastro como está no banco + a data), quando ele aceita a oferta */
  const gravarAdmissao = async (data: string) => {
    if (!ficha) return;
    const pedido = pedidoDoFuncionario({ ...formDoCadastro(ficha.funcionario), admissao: data }, ficha.funcionario);
    const r = await emDoisPassos(s => api.gravarFuncionario(clienteId, pedido, s), 'Admissão gravada.');
    if (r) { setForm(f => ({ ...f, admissao: data })); setOfertaAdmissao(null); }
  };
  const gravarSalario = async () => {
    if (!funcionarioId) return;
    if (salValor == null || salValor <= 0) { setRodape('Informe o salário.'); return; }
    if (!salDesde) { setRodape('Informe desde quando vale o salário.'); return; }
    const r = await emDoisPassos(s => api.gravarSalario(funcionarioId, salDesde, salValor, salParte ?? 100, salMotivo.trim() || null, s), 'Salário gravado.');
    if (r) {
      if (ficha && !ficha.funcionario.admissao) setOfertaAdmissao({ data: salDesde, onde: 'salario' });
      setSalDesde(''); setSalValor(null); setSalMotivo('');
    }
  };
  const gravarAtuacao = async () => {
    if (!funcionarioId) return;
    const problema = problemaDaAtuacao(atuacao);
    if (problema) { setRodape(problema); return; }
    if (!atuDesde) { setRodape('Informe desde quando vale a atuação.'); return; }
    const r = await emDoisPassos(s => api.gravarAtuacao(funcionarioId, atuDesde, atuacao.map(a => ({ fazenda_id: a.fazenda_id, atividade: a.atividade, pct: a.pct ?? 0 })), s), 'Atuação gravada.');
    if (r) {
      if (ficha && !ficha.funcionario.admissao) setOfertaAdmissao({ data: atuDesde, onde: 'atuacao' });
      setAtuDesde('');
    }
  };
  const mudarSituacao = async () => {
    if (!funcionarioId) return;
    if (!sitMotivo.trim()) { setRodape('Informe o motivo.'); return; }
    const r = desligado
      ? await emDoisPassos(s => api.reativar(funcionarioId, sitMotivo.trim(), s), 'Funcionário reativado.')
      : await emDoisPassos(s => api.desligar(funcionarioId, deslData, sitMotivo.trim(), s), 'Funcionário desligado.');
    if (r) setSitMotivo('');
  };

  const fazOpcoes = useMemo(() => fazendasDoCliente.map(f => ({ value: f.id, label: f.codigo ? `${f.codigo} · ${f.nome}` : f.nome })), [fazendasDoCliente]);
  const admissao = ficha?.funcionario.admissao ?? null;
  /* FOLHA-FUNC-CADASTRO-01: o selo de cada bloco e o "a atualizar" do topo (junta o que falta de todos os blocos + as marcas gravadas) */
  const opFazendasRegistro = useMemo(() => fazendasDoCliente.map(f => ({ value: f.id, label: f.codigo || f.nome, title: f.nome })), [fazendasDoCliente]);
  const faltas = oQueFaltaPorBloco(form, extras, fav, !!form.favorecido_id);
  const marcas = ficha ? aAtualizarDoTopo(faltas, ficha.funcionario, ficha.salarios.length > 0, rotuloAAtualizar) : [];
  const vigente = ficha ? atuacaoVigente(ficha.atuacoes, hojeLocal()) : null;
  const avisoSal = avisoDoDesde(salDesde, admissao);
  const avisoAtu = avisoDoDesde(atuDesde, admissao);
  const somaAtuacao = atuacao.reduce((s, a) => s + (a.pct ?? 0), 0);
  /* UI-FONTES-REGUA-01 — o seletor tem a largura do maior nome da lista (o vazio conta) */
  const opAtividade = useMemo(() => ATIVIDADES.map(t => ({ value: t.valor, label: t.rotulo })), []);
  const larguraAtividade = useMemo(() => larguraDoSeletor(['atividade', ...opAtividade.map(o => o.label)]) + 8, [opAtividade]);
  const larguraFazenda = useMemo(() => larguraDoSeletor(['fazenda', ...fazOpcoes.map(o => o.label)]) + 8, [fazOpcoes]);

  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(540px,calc(100vh-16px))] w-[min(1000px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="funcionario-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className={cn('min-w-0 truncate', TITULO_MODAL)} title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Cadastro do funcionário da folha</DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center gap-3 border-b bg-card px-3">
          <Segmentado altura={ALTURA_CONTROLE} fonte={FONTE_CONTROLE} valor={aba} onEscolher={a => { setAba(a); setRodape(null); }} opcoes={[
            { valor: 'cadastro', rotulo: 'Cadastro' },
            { valor: 'salario', rotulo: 'Salário e atuação', desabilitada: !funcionarioId, title: funcionarioId ? undefined : 'salve o cadastro primeiro' },
            { valor: 'situacao', rotulo: 'Situação', desabilitada: !funcionarioId, title: funcionarioId ? undefined : 'salve o cadastro primeiro' },
          ]} />
          <span className={cn('min-w-0 flex-1 truncate text-amber-800', TEXTO_ROTULO)} title={marcas.join(', ')} data-testid="funcionario-a-atualizar">
            {marcas.length > 0 ? `a atualizar: ${marcas.join(', ')}` : ''}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-muted p-2" data-testid={`funcionario-aba-${aba}`} data-desloca-livre="">
          {funcionarioId && isLoading ? <p className={cn(TEXTO_ROTULO, 'text-muted-foreground')}>Carregando…</p> : aba === 'cadastro' ? (
            <AbaCadastroFuncionario form={form} set={set} erros={erros} extras={extras} setExtra={setExtra} fav={fav} setFav={setFav} faltas={faltas}
              clienteId={clienteId} opFazendas={opFazendasRegistro} favorecidoNome={cadastro?.favorecido?.nome ?? null} />
          ) : aba === 'salario' && ficha ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <BlocoFormulario titulo="Salário" dica="o histórico; o novo vale desde a data" className="min-h-0 flex-1">
                <div className="min-h-0 flex-1 overflow-y-scroll rounded border bg-card" data-testid="funcionario-salarios">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 74 }} /><col style={{ width: 84 }} /><col style={{ width: 52 }} /><col /></colgroup>
                    <thead className="text-primary-foreground"><tr className="h-[22px]"><th className={TH}>Desde</th><th className={cn(TH, 'text-right')}>Salário</th><th className={cn(TH, 'text-right')}>Parte</th><th className={TH}>Motivo</th></tr></thead>
                    <tbody>
                      {ficha.salarios.map((s, i) => (
                        <tr key={i} className={cn(LINHA_FONTES, 'border-b border-border/40')}>
                          <td className={TD_FONTES_DATA}>{dataBR(s.desde)}</td>
                          <td className={TD_FONTES_NUM}>{s.salario == null ? '—' : n2(s.salario)}</td>
                          <td className={TD_FONTES_NUM}>{s.parte_pct == null ? '—' : `${s.parte_pct.toLocaleString('pt-BR')}%`}</td>
                          <td className={TD_FONTES_TEXTO} title={s.motivo ?? undefined}>{s.motivo ?? '—'}</td>
                        </tr>
                      ))}
                      {ficha.salarios.length === 0 && <tr className={LINHA_FONTES}><td colSpan={4} className={cn(TD_FONTES, 'py-3 text-center italic text-amber-700')}>a confirmar (pelo holerite)</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className={cn(GRADE_FORMULARIO, 'mt-1.5 shrink-0 grid-cols-[112px_124px_70px_minmax(0,1fr)]')}>
                  <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Desde" obrig /><DatePicker value={salDesde} onChange={v => setSalDesde(v ?? '')} className={CAMPO_DATA} data-testid="funcionario-sal-desde" /></div>
                  <div><Rotulo texto="Salário" obrig /><CampoMoeda valor={salValor} onChange={setSalValor} className={CONTROLE} /></div>
                  <div><Rotulo texto="Parte %" /><CampoPercentual valor={salParte} onChange={setSalParte} className={CONTROLE} title="a parte do salário que este cliente paga" /></div>
                  <div><Rotulo texto="Motivo" /><Input value={salMotivo} onChange={e => setSalMotivo(e.target.value)} placeholder="reajuste, dissídio…" className={CONTROLE} /></div>
                </div>
                <div className="mt-1 flex h-[26px] shrink-0 items-center justify-between gap-2">
                  <AvisoDoBloco aviso={avisoSal} oferta={ofertaAdmissao?.onde === 'salario' ? ofertaAdmissao.data : null} indo={indo}
                    onGravarAdmissao={d => void gravarAdmissao(d)} testid="funcionario-aviso-salario" />
                  <Button size="sm" className={cn(CONTROLE, 'w-[110px] shrink-0')} disabled={indo} onClick={() => void gravarSalario()} data-testid="funcionario-gravar-salario">Gravar salário</Button>
                </div>
              </BlocoFormulario>
              <BlocoFormulario titulo="Atuação" dica="fazenda e atividade em %, para o rateio do custo" className="min-h-0 flex-1">
                <div className="flex h-[44px] shrink-0 items-end gap-2">
                  <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Desde" obrig /><DatePicker value={atuDesde} onChange={v => setAtuDesde(v ?? '')} className={CAMPO_DATA} data-testid="funcionario-atu-desde" /></div>
                  <span className={cn('pb-1.5 tabular-nums', TEXTO_ROTULO, somaAtuacao === 100 ? 'text-muted-foreground' : 'text-amber-700')}>soma {somaAtuacao.toLocaleString('pt-BR')}%</span>
                  {/* FOLHA-ADMISSAO-01: a atuação que VALE hoje e desde quando (as vigências iguais seguidas contam como uma) */}
                  <span className={cn('pb-1.5 whitespace-nowrap tabular-nums text-muted-foreground', TEXTO_ROTULO)} data-testid="funcionario-atuacao-vigente"
                    title={ficha.atuacoes.map(a => `desde ${dataBR(a.desde)}: ${a.fazenda ?? ''} · ${rotuloAtividade(a.atividade)} ${a.pct}%`).join(' · ')}>
                    {vigente ? `vale desde ${dataBR(vigente.desde)}` : ficha.atuacoes.length ? `a partir de ${dataBR(ficha.atuacoes[ficha.atuacoes.length - 1]?.desde)}` : ''}
                  </span>
                </div>
                <div className="mt-1 min-h-0 flex-1 overflow-x-auto overflow-y-scroll rounded border bg-card" data-testid="funcionario-atuacao">
                  {/* o seletor mostra o nome inteiro: a coluna tem o maior nome da lista (+ 8px da célula); a Fazenda fica com a sobra; o % tem 80px
                      ("100,00 %" a 11px inteiro — com 70 o campo mostrava "100,0 %") */}
                  <table className="w-full table-fixed border-collapse" style={{ minWidth: larguraFazenda + larguraAtividade + 80 + 20 }}>
                    <colgroup><col style={{ minWidth: larguraFazenda }} /><col style={{ width: larguraAtividade }} /><col style={{ width: 80 }} /><col style={{ width: 20 }} /></colgroup>
                    <thead className="text-primary-foreground"><tr className="h-[22px]"><th className={TH}>Fazenda</th><th className={TH}>Atividade</th><th className={cn(TH, 'text-right')}>%</th><th className={TH} /></tr></thead>
                    <tbody>
                      {atuacao.map((a, i) => (
                        <tr key={i} className={cn(LINHA_COM_CONTROLE, 'border-b border-border/40')}>
                          <td className="px-1"><SearchableSelect value={a.fazenda_id} onValueChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, fazenda_id: v } : y)))}
                            semTodos allLabel="fazenda" allValue="" options={fazOpcoes} triggerClassName={CONTROLE} /></td>
                          <td className="px-1"><SearchableSelect value={a.atividade} onValueChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, atividade: v } : y)))}
                            semTodos allLabel="atividade" allValue="" options={opAtividade} triggerClassName={CONTROLE} /></td>
                          <td className="px-1"><CampoPercentual valor={a.pct} onChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, pct: v } : y)))} className={CONTROLE} /></td>
                          <td className="px-0 text-center"><button type="button" aria-label="Tirar a linha" className="text-muted-foreground hover:text-destructive"
                            onClick={() => setAtuacao(x => x.filter((_, j) => j !== i))}><X className="mx-auto h-3 w-3" /></button></td>
                        </tr>
                      ))}
                      {atuacao.length === 0 && <tr className={LINHA_FONTES}><td colSpan={4} className={cn(TD_FONTES, 'py-3 text-center italic text-amber-700')}>a confirmar</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 flex h-[26px] shrink-0 items-center justify-between">
                  <button type="button" className={cn(CONTROLE, 'inline-flex items-center gap-1 font-medium text-primary hover:underline')}
                    onClick={() => setAtuacao(x => [...x, { fazenda_id: '', atividade: '', pct: x.length === 0 ? 100 : null }])}><Plus className="h-3 w-3" /> linha</button>
                  <AvisoDoBloco aviso={avisoAtu} oferta={ofertaAdmissao?.onde === 'atuacao' ? ofertaAdmissao.data : null} indo={indo}
                    onGravarAdmissao={d => void gravarAdmissao(d)} testid="funcionario-aviso-atuacao" />
                  <Button size="sm" className={cn(CONTROLE, 'w-[110px] shrink-0')} disabled={indo} onClick={() => void gravarAtuacao()} data-testid="funcionario-gravar-atuacao">Gravar atuação</Button>
                </div>
              </BlocoFormulario>
            </div>
          ) : aba === 'situacao' && ficha ? (
            <BlocoFormulario titulo={desligado ? 'Reativar' : 'Desligar'} dica={rotuloSituacao(ficha.funcionario)} className="w-[520px]">
              <div className={cn(GRADE_FORMULARIO, desligado ? 'grid-cols-1' : 'grid-cols-[112px_minmax(0,1fr)]')}>
                {!desligado && <div className={LARGURA_CAMPO_DATA}><Rotulo texto="Data do desligamento" obrig /><DatePicker value={deslData} onChange={v => setDeslData(v ?? '')} className={CAMPO_DATA} /></div>}
                <div><Rotulo texto="Motivo" obrig /><Input value={sitMotivo} onChange={e => setSitMotivo(e.target.value)} placeholder={desligado ? 'readmitido, desligado por engano…' : 'pedido de demissão, rescisão…'}
                  className={CONTROLE} data-testid="funcionario-motivo" /></div>
              </div>
              {desligado && ficha.funcionario.desligamento_motivo && (
                <p className={cn('mt-1 truncate text-muted-foreground', TEXTO_ROTULO)} title={ficha.funcionario.desligamento_motivo}>motivo do desligamento: {ficha.funcionario.desligamento_motivo}</p>
              )}
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant={desligado ? 'default' : 'destructive'} className={cn(CONTROLE, 'w-[110px]')} disabled={indo}
                  onClick={() => void mudarSituacao()} data-testid="funcionario-situacao">{desligado ? 'Reativar' : 'Desligar'}</Button>
              </div>
            </BlocoFormulario>
          ) : null}
        </div>

        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <p className={cn('min-w-0 flex-1 truncate', TEXTO_ROTULO, rodape ? 'text-destructive' : 'text-muted-foreground')} title={rodape ?? undefined} data-testid="funcionario-rodape">
            {rodape ?? (aba === 'cadastro' ? 'Salvar confere com o banco antes de gravar.' : '')}
          </p>
          <Button variant="outline" size="sm" className={CONTROLE} onClick={aoFechar}>Fechar</Button>
          {/* o Salvar é do Cadastro; nas outras abas fica INVISÍVEL no mesmo lugar (o "Fechar" não anda) */}
          <Button size="sm" className={cn(CONTROLE, 'w-[110px]', aba !== 'cadastro' && 'invisible')} disabled={indo || !carregado || aba !== 'cadastro'}
            onClick={() => void salvarCadastro()} data-testid="funcionario-salvar" aria-hidden={aba !== 'cadastro'}>
            {indo ? 'Salvando…' : 'Salvar cadastro'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
