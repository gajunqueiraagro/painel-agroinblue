/**
 * FOLHA-01 · PR B (telas) — o CADASTRO do funcionário (novo e editar), modal em blocos no molde do `BemDialog` (1000 × 540, tamanho fixo).
 * Contrato §3.1: `fn_folha_funcionario_gravar` · `fn_folha_salario_gravar` · `fn_folha_atuacao_gravar` · `_desligar` · `_reativar`.
 * ⚠ TODO GESTO PASSA PELA PRÉVIA (`p_simular = true`) e só grava se ela passar; a recusa do banco (P0001) vai para o rodapé, nunca toast
 *   (UX-TOAST-01). Campo obrigatório que falta fica vermelho com a frase e nada vai ao banco (UX-OBRIGATORIOS-01).
 * ⚠ O GRAVADOR SOBRESCREVE: o pedido é o registro INTEIRO (`pedidoDoFuncionario`), com o `recorrencia_origem_id` que veio.
 * ⚠ PIX/BANCO/CONTATO NÃO ESTÃO AQUI: são do fornecedor (o favorecido), sem 2ª fonte.
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
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, TD_REGUA_NUM } from '@/components/ui/regua-tabela';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { useFazenda } from '@/contexts/FazendaContext';
import { useFicha, useFolhaApi, useRelerFolha } from '@/hooks/useFolha';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import {
  ATIVIDADES, competenciaBR, dataBR, FORM_VAZIO, formDoCadastro, n2, pedidoDoFuncionario, pendenciasDoForm, problemaDaAtuacao,
  rotuloAAtualizar, rotuloAtividade, rotuloSituacao, VINCULOS, type FormFuncionario,
} from '@/lib/folha/folhaTela';

type Aba = 'cadastro' | 'salario' | 'situacao';
interface LinhaAtuacao { fazenda_id: string; atividade: string; pct: number | null }
const TH = cn(TH_REGUA, 'sticky top-0 z-10 bg-primary text-left');

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
  /* salário novo */
  const [salDesde, setSalDesde] = useState(hojeLocal().slice(0, 8) + '01');
  const [salValor, setSalValor] = useState<number | null>(null);
  const [salParte, setSalParte] = useState<number | null>(100);
  const [salMotivo, setSalMotivo] = useState('');
  /* atuação nova */
  const [atuDesde, setAtuDesde] = useState(hojeLocal().slice(0, 8) + '01');
  const [atuacao, setAtuacao] = useState<LinhaAtuacao[]>([]);
  /* situação */
  const [deslData, setDeslData] = useState(hojeLocal());
  const [sitMotivo, setSitMotivo] = useState('');

  useEffect(() => {
    if (!ficha || carregado) return;
    setForm(formDoCadastro(ficha.funcionario));
    const atual = ficha.atuacoes.filter(a => a.desde === ficha.atuacoes[0]?.desde);
    setAtuacao(atual.map(a => ({ fazenda_id: a.fazenda_id ?? '', atividade: a.atividade ?? '', pct: a.pct })));
    setCarregado(true);
  }, [ficha, carregado]);

  const set = <K extends keyof FormFuncionario>(k: K, v: FormFuncionario[K]) => { setForm(f => ({ ...f, [k]: v })); setErros(e => ({ ...e, [k]: undefined })); setRodape(null); };
  const titulo = funcionarioId ? `Funcionário · ${ficha?.funcionario.nome ?? '…'}` : 'Novo funcionário';
  const desligado = ficha?.funcionario.situacao === 'desligado';

  /** prévia → grava; a recusa vai ao rodapé */
  const emDoisPassos = async (passo: (simular: boolean) => Promise<{ ok: boolean; erro?: string; dados?: Record<string, unknown> }>, ok: string): Promise<Record<string, unknown> | null> => {
    setIndo(true); setRodape(null);
    try {
      const previa = await passo(true);
      if (!previa.ok) { setRodape(previa.erro ?? 'O banco recusou.'); return null; }
      const r = await passo(false);
      if (!r.ok) { setRodape(r.erro ?? 'O banco recusou.'); return null; }
      toast.success(ok);
      await reler();
      return r.dados ?? {};
    } finally { setIndo(false); }
  };

  const salvarCadastro = async () => {
    const pend = pendenciasDoForm(form);
    if (Object.keys(pend).length) { setErros(pend); setRodape(Object.values(pend)[0] ?? null); return; }
    const pedido = pedidoDoFuncionario(form, ficha?.funcionario ?? null);
    const r = await emDoisPassos(s => api.gravarFuncionario(clienteId, pedido, s), funcionarioId ? 'Cadastro salvo.' : 'Funcionário criado.');
    if (r && !funcionarioId && typeof r.id === 'string') aoCriar(r.id);
  };
  const gravarSalario = async () => {
    if (!funcionarioId) return;
    if (salValor == null || salValor <= 0) { setRodape('Informe o salário.'); return; }
    if (!salDesde) { setRodape('Informe desde quando vale o salário.'); return; }
    const r = await emDoisPassos(s => api.gravarSalario(funcionarioId, salDesde, salValor, salParte ?? 100, salMotivo.trim() || null, s), 'Salário gravado.');
    if (r) { setSalValor(null); setSalMotivo(''); }
  };
  const gravarAtuacao = async () => {
    if (!funcionarioId) return;
    const problema = problemaDaAtuacao(atuacao);
    if (problema) { setRodape(problema); return; }
    await emDoisPassos(s => api.gravarAtuacao(funcionarioId, atuDesde, atuacao.map(a => ({ fazenda_id: a.fazenda_id, atividade: a.atividade, pct: a.pct ?? 0 })), s), 'Atuação gravada.');
  };
  const mudarSituacao = async () => {
    if (!funcionarioId) return;
    if (!sitMotivo.trim()) { setRodape('Informe o motivo.'); return; }
    const r = desligado
      ? await emDoisPassos(s => api.reativar(funcionarioId, sitMotivo.trim(), s), 'Funcionário reativado.')
      : await emDoisPassos(s => api.desligar(funcionarioId, deslData, sitMotivo.trim(), s), 'Funcionário desligado.');
    if (r) setSitMotivo('');
  };

  const fazOpcoes = fazendasDoCliente.map(f => ({ value: f.id, label: f.codigo ? `${f.codigo} · ${f.nome}` : f.nome }));
  const somaAtuacao = atuacao.reduce((s, a) => s + (a.pct ?? 0), 0);

  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(540px,calc(100vh-16px))] w-[min(1000px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="funcionario-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Cadastro do funcionário da folha</DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center gap-3 border-b bg-card px-3">
          <Segmentado altura={22} valor={aba} onEscolher={a => { setAba(a); setRodape(null); }} opcoes={[
            { valor: 'cadastro', rotulo: 'Cadastro' },
            { valor: 'salario', rotulo: 'Salário e atuação', desabilitada: !funcionarioId, title: funcionarioId ? undefined : 'salve o cadastro primeiro' },
            { valor: 'situacao', rotulo: 'Situação', desabilitada: !funcionarioId, title: funcionarioId ? undefined : 'salve o cadastro primeiro' },
          ]} />
          <span className="min-w-0 flex-1 truncate text-[10px] text-amber-800" title={ficha?.funcionario.a_atualizar.map(rotuloAAtualizar).join(', ')}>
            {ficha && ficha.funcionario.a_atualizar.length > 0 ? `a atualizar: ${ficha.funcionario.a_atualizar.map(rotuloAAtualizar).join(', ')}` : ''}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-muted p-2" data-testid={`funcionario-aba-${aba}`} data-desloca-livre="">
          {funcionarioId && isLoading ? <p className="text-[11px] text-muted-foreground">Carregando…</p> : aba === 'cadastro' ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <BlocoFormulario titulo="Pessoa" className="min-h-0">
                <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1fr)_130px]')}>
                  <div><Rotulo texto="Nome" obrig /><Input value={form.nome} onChange={e => set('nome', e.target.value)} className={cn(REGUA_CAMPO, erros.nome && 'border-destructive')} data-testid="funcionario-nome" /></div>
                  <div><Rotulo texto="CPF" /><Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" className={cn(REGUA_CAMPO, 'tabular-nums', erros.cpf && 'border-destructive')} /></div>
                </div>
                <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-3')}>
                  <div><Rotulo texto="Nascimento" /><DatePicker value={form.nascimento} onChange={v => set('nascimento', v ?? '')} /></div>
                  <div><Rotulo texto="PIS" /><Input value={form.pis} onChange={e => set('pis', e.target.value)} className={cn(REGUA_CAMPO, 'tabular-nums', erros.pis && 'border-destructive')} /></div>
                  <div><Rotulo texto="CTPS" /><Input value={form.ctps} onChange={e => set('ctps', e.target.value)} className={REGUA_CAMPO} /></div>
                </div>
                <div className="mt-1">
                  <Rotulo texto="Favorecido (o fornecedor que recebe: Pix, banco e contato moram nele)" />
                  <FavorecidoSelect value={form.favorecido_id} onChange={id => set('favorecido_id', id)} clienteId={clienteId} triggerClassName={REGUA_CAMPO} />
                </div>
                <div className="mt-1"><Rotulo texto="Observação" /><Input value={form.observacao} onChange={e => set('observacao', e.target.value)} className={REGUA_CAMPO} /></div>
              </BlocoFormulario>
              <BlocoFormulario titulo="Contrato" className="min-h-0">
                <div className={cn(GRADE_FORMULARIO, 'grid-cols-2')}>
                  <div><Rotulo texto="Vínculo" /><SearchableSelect value={form.vinculo} onValueChange={v => set('vinculo', v)} semTodos allLabel="vínculo" allValue=""
                    options={VINCULOS.map(v => ({ value: v.valor, label: v.rotulo }))} triggerClassName={REGUA_CAMPO} /></div>
                  <div><Rotulo texto="Admissão" /><DatePicker value={form.admissao} onChange={v => set('admissao', v ?? '')} /></div>
                </div>
                <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[minmax(0,1fr)_96px]')}>
                  <div><Rotulo texto="Cargo" /><Input value={form.cargo} onChange={e => set('cargo', e.target.value)} className={REGUA_CAMPO} /></div>
                  <div><Rotulo texto="CBO" /><Input value={form.cbo} onChange={e => set('cbo', e.target.value)} className={REGUA_CAMPO} /></div>
                </div>
                <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[minmax(0,1fr)_120px]')}>
                  <div><Rotulo texto="Registro (empregador · CEI/CAEPF)" /><Input value={form.empregador_registro} onChange={e => set('empregador_registro', e.target.value)} className={REGUA_CAMPO} /></div>
                  <div><Rotulo texto="Código no contador" /><Input value={form.codigo_contador} onChange={e => set('codigo_contador', e.target.value)} className={REGUA_CAMPO} /></div>
                </div>
                <p className="mt-1 h-[13px] text-[9.5px] leading-[13px] text-muted-foreground">O salário e a atuação têm data "desde": ficam na aba ao lado.</p>
              </BlocoFormulario>
            </div>
          ) : aba === 'salario' && ficha ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <BlocoFormulario titulo="Salário" dica="o histórico; o novo vale desde a data" className="min-h-0 flex-1">
                <div className="min-h-0 flex-1 overflow-y-scroll rounded border bg-card" data-testid="funcionario-salarios">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 74 }} /><col style={{ width: 84 }} /><col style={{ width: 52 }} /><col /></colgroup>
                    <thead className="text-primary-foreground"><tr className="h-[22px]"><th className={TH}>Desde</th><th className={cn(TH, 'text-right')}>Salário</th><th className={cn(TH, 'text-right')}>Parte</th><th className={TH}>Motivo</th></tr></thead>
                    <tbody>
                      {ficha.salarios.map((s, i) => (
                        <tr key={i} className="h-[19px] border-b border-border/40">
                          <td className={cn(TD_REGUA_NUM, 'text-left')}>{dataBR(s.desde)}</td>
                          <td className={TD_REGUA_NUM}>{s.salario == null ? '—' : n2(s.salario)}</td>
                          <td className={TD_REGUA_NUM}>{s.parte_pct == null ? '—' : `${s.parte_pct.toLocaleString('pt-BR')}%`}</td>
                          <td className={TD_REGUA_TEXTO} title={s.motivo ?? undefined}>{s.motivo ?? '—'}</td>
                        </tr>
                      ))}
                      {ficha.salarios.length === 0 && <tr className="h-[19px]"><td colSpan={4} className={cn(TD_REGUA, 'py-3 text-center italic text-amber-700')}>a confirmar (pelo holerite)</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className={cn(GRADE_FORMULARIO, 'mt-1.5 shrink-0 grid-cols-[110px_124px_70px_minmax(0,1fr)]')}>
                  <div><Rotulo texto="Desde" obrig /><DatePicker value={salDesde} onChange={v => setSalDesde(v ?? '')} /></div>
                  <div><Rotulo texto="Salário" obrig /><CampoMoeda valor={salValor} onChange={setSalValor} className={REGUA_CAMPO} /></div>
                  <div><Rotulo texto="Parte %" /><CampoPercentual valor={salParte} onChange={setSalParte} className={REGUA_CAMPO} title="a parte do salário que este cliente paga" /></div>
                  <div><Rotulo texto="Motivo" /><Input value={salMotivo} onChange={e => setSalMotivo(e.target.value)} placeholder="reajuste, dissídio…" className={REGUA_CAMPO} /></div>
                </div>
                <div className="mt-1 flex h-[26px] shrink-0 justify-end">
                  <Button size="sm" className="h-[24px] w-[110px] text-[11px]" disabled={indo} onClick={() => void gravarSalario()} data-testid="funcionario-gravar-salario">Gravar salário</Button>
                </div>
              </BlocoFormulario>
              <BlocoFormulario titulo="Atuação" dica="fazenda e atividade em %, para o rateio do custo" className="min-h-0 flex-1">
                <div className="flex h-[44px] shrink-0 items-end gap-2">
                  <div className="w-[120px]"><Rotulo texto="Desde" obrig /><DatePicker value={atuDesde} onChange={v => setAtuDesde(v ?? '')} /></div>
                  <span className={cn('pb-1.5 text-[10px] tabular-nums', somaAtuacao === 100 ? 'text-muted-foreground' : 'text-amber-700')}>soma {somaAtuacao.toLocaleString('pt-BR')}%</span>
                </div>
                <div className="mt-1 min-h-0 flex-1 overflow-y-scroll rounded border bg-card" data-testid="funcionario-atuacao">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 70 }} /><col style={{ width: 20 }} /></colgroup>
                    <thead className="text-primary-foreground"><tr className="h-[22px]"><th className={TH}>Fazenda</th><th className={TH}>Atividade</th><th className={cn(TH, 'text-right')}>%</th><th className={TH} /></tr></thead>
                    <tbody>
                      {atuacao.map((a, i) => (
                        <tr key={i} className="h-[30px] border-b border-border/40">
                          <td className="px-1"><SearchableSelect value={a.fazenda_id} onValueChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, fazenda_id: v } : y)))}
                            semTodos allLabel="fazenda" allValue="" options={fazOpcoes} triggerClassName="h-[24px] text-[10.5px]" /></td>
                          <td className="px-1"><SearchableSelect value={a.atividade} onValueChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, atividade: v } : y)))}
                            semTodos allLabel="atividade" allValue="" options={ATIVIDADES.map(t => ({ value: t.valor, label: t.rotulo }))} triggerClassName="h-[24px] text-[10.5px]" /></td>
                          <td className="px-1"><CampoPercentual valor={a.pct} onChange={v => setAtuacao(x => x.map((y, j) => (j === i ? { ...y, pct: v } : y)))} className="h-[24px] text-[10.5px]" /></td>
                          <td className="px-0 text-center"><button type="button" aria-label="Tirar a linha" className="text-muted-foreground hover:text-destructive"
                            onClick={() => setAtuacao(x => x.filter((_, j) => j !== i))}><X className="mx-auto h-3 w-3" /></button></td>
                        </tr>
                      ))}
                      {atuacao.length === 0 && <tr className="h-[19px]"><td colSpan={4} className={cn(TD_REGUA, 'py-3 text-center italic text-amber-700')}>a confirmar</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 flex h-[26px] shrink-0 items-center justify-between">
                  <button type="button" className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                    onClick={() => setAtuacao(x => [...x, { fazenda_id: '', atividade: '', pct: x.length === 0 ? 100 : null }])}><Plus className="h-3 w-3" /> linha</button>
                  <span className="min-w-0 flex-1 truncate px-2 text-[9.5px] text-muted-foreground"
                    title={ficha.atuacoes.map(a => `desde ${competenciaBR(a.desde)}: ${a.fazenda ?? ''} · ${rotuloAtividade(a.atividade)} ${a.pct}%`).join(' · ')}>
                    {ficha.atuacoes.length ? `gravada desde ${competenciaBR(ficha.atuacoes[0]?.desde)}` : ''}
                  </span>
                  <Button size="sm" className="h-[24px] w-[110px] text-[11px]" disabled={indo} onClick={() => void gravarAtuacao()} data-testid="funcionario-gravar-atuacao">Gravar atuação</Button>
                </div>
              </BlocoFormulario>
            </div>
          ) : aba === 'situacao' && ficha ? (
            <BlocoFormulario titulo={desligado ? 'Reativar' : 'Desligar'} dica={rotuloSituacao(ficha.funcionario)} className="w-[520px]">
              <div className={cn(GRADE_FORMULARIO, desligado ? 'grid-cols-1' : 'grid-cols-[120px_minmax(0,1fr)]')}>
                {!desligado && <div><Rotulo texto="Data do desligamento" obrig /><DatePicker value={deslData} onChange={v => setDeslData(v ?? '')} /></div>}
                <div><Rotulo texto="Motivo" obrig /><Input value={sitMotivo} onChange={e => setSitMotivo(e.target.value)} placeholder={desligado ? 'readmitido, desligado por engano…' : 'pedido de demissão, rescisão…'}
                  className={REGUA_CAMPO} data-testid="funcionario-motivo" /></div>
              </div>
              {desligado && ficha.funcionario.desligamento_motivo && (
                <p className="mt-1 truncate text-[10px] text-muted-foreground" title={ficha.funcionario.desligamento_motivo}>motivo do desligamento: {ficha.funcionario.desligamento_motivo}</p>
              )}
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant={desligado ? 'default' : 'destructive'} className="h-[26px] w-[110px] text-[11px]" disabled={indo}
                  onClick={() => void mudarSituacao()} data-testid="funcionario-situacao">{desligado ? 'Reativar' : 'Desligar'}</Button>
              </div>
            </BlocoFormulario>
          ) : null}
        </div>

        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <p className={cn('min-w-0 flex-1 truncate text-[10px]', rodape ? 'text-destructive' : 'text-muted-foreground')} title={rodape ?? undefined} data-testid="funcionario-rodape">
            {rodape ?? (aba === 'cadastro' ? 'Salvar confere com o banco antes de gravar.' : '')}
          </p>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Fechar</Button>
          {/* o Salvar é do Cadastro; nas outras abas fica INVISÍVEL no mesmo lugar (o "Fechar" não anda) */}
          <Button size="sm" className={cn('h-[26px] w-[72px] text-[11px]', aba !== 'cadastro' && 'invisible')} disabled={indo || !carregado || aba !== 'cadastro'}
            onClick={() => void salvarCadastro()} data-testid="funcionario-salvar" aria-hidden={aba !== 'cadastro'}>
            {indo ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
