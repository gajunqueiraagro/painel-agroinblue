/**
 * PATR-01 · PR B — O MODAL DO BEM (gabarito: mock v4 — abrir o trator, a terra e a "Reforma de pastagem — 6 pastos").
 *
 * ⚠ TAMANHO FIXO (1000 × 540, ou a janela − 16 px), O MODAL NÃO ROLA: só a tabela de dentro de cada aba rola. Trocar de aba não muda
 * tamanho nem posição de nada — as SEIS abas ficam sempre no mesmo lugar; a que não vale para a categoria fica APAGADA com o motivo
 * (`abasDoBem`): Pastos só para pastagem, Depreciação apagada para a terra, Valor de mercado apagado para a pastagem.
 * ⚠ A FAIXA DE RESUMO É DA LISTA (`fn_patrimonio_lista`): situação · aquisição · depreciação acumulada · contábil · mercado.
 * ⚠ SALVAR = PRÉVIA ANTES (`p_simular`). Bem que já depreciou: mudar a situação ou o mês do "em uso" é CORREÇÃO — a prévia mostra a
 * acumulada antes × depois e pede o motivo (ajuste 3.5 do Chat); a trilha é do banco. Validação e recusa ficam no RODAPÉ (nunca em
 * toast, UX-TOAST-01); o campo pendente fica vermelho. Bem novo: Dados e Lançamentos (o valor sem lançamento — a terra — entra já na
 * criação e grava no mesmo Salvar); depois do primeiro Salvar o modal segue aberto no bem.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DatePicker } from '@/components/ui/date-picker';
import { CampoNumeroComConta } from '@/components/ui/campo-numero-com-conta';
import { FazendaSelect } from '@/components/shared/FazendaSelect';
import { BlocoFormulario, Rotulo, REGUA_CAMPO, GRADE_FORMULARIO } from '@/components/ui/bloco-formulario';
import { TextoReservado } from '@/components/ui/regua-tabela';
import { useFazenda } from '@/contexts/FazendaContext';
import { hojeLocal } from '@/lib/datas/hojeLocal';
import { cn } from '@/lib/utils';
import {
  useCadastroDoBem, useCategoriasPatrimonio, useLancamentosDoBem, usePastosDoBem, useAvaliacoesDoBem, useDocumentosDoBem,
  usePatrimonioApi, useRelerPatrimonio,
} from '@/hooks/usePatrimonio';
import { abasDoBem, brl, jaDeprecia, mesBR, ROTULO_SITUACAO, type AbaBem, type BemDaLista, type CategoriaBem } from '@/lib/patrimonio/patrimonio';
import type { FormBem, PastoLigado } from '@/lib/patrimonio/patrimonioApi';
import { AbaLancamentos } from './AbaLancamentos';
import { AbaPastos } from './AbaPastos';
import { AbaDepreciacao } from './AbaDepreciacao';
import { AbaMercado } from './AbaMercado';
import { AbaDocumentos } from './AbaDocumentos';

const formNovo = (clienteId: string): FormBem => ({
  id: null, versao: null, cliente_id: clienteId, fazenda_id: '', categoria_id: '', descricao: '', marca: '', modelo: '', ano_fabricacao: null,
  identificacao: '', observacao: '', situacao: 'em_formacao', em_uso_desde: '', atividade: 'pecuaria', financiamento_id: null,
  origem_valor: 'lancamentos', valor_sem_lancamento: null, estimativa_rs_ha: null, estimativa_area_ha: null, area_ha: null,
  matricula: '', nirf: '', seguradora: '', apolice: '', seguro_vence_em: '', vida_util_meses: null, residual_pct: null,
});

type Campo = 'categoria' | 'fazenda' | 'descricao' | 'em_uso_desde' | 'motivo' | 'area_ha' | 'valor';

/** O que falta antes de ir ao banco (o banco recusa de novo, com a mesma frase). */
export function pendenciasDoBem(f: FormBem, categoria: CategoriaBem | null): Partial<Record<Campo, string>> {
  const p: Partial<Record<Campo, string>> = {};
  if (!f.categoria_id || !categoria) p.categoria = 'Escolha a categoria do bem.';
  if (!f.fazenda_id) p.fazenda = 'Escolha a fazenda do bem.';
  if (!f.descricao.trim()) p.descricao = 'Informe a descrição do bem.';
  if (f.situacao === 'em_uso' && !f.em_uso_desde) p.em_uso_desde = 'Informe desde quando o bem está em uso.';
  if (f.em_uso_desde && f.em_uso_desde > hojeLocal()) p.em_uso_desde = 'A data de "em uso desde" não pode ser no futuro.';
  if (f.origem_valor === 'sem_lancamento' && !((f.valor_sem_lancamento ?? 0) > 0)) p.valor = 'Informe o valor sem lançamento (aba Lançamentos).';
  if (f.origem_valor === 'estimativa' && !((f.estimativa_rs_ha ?? 0) > 0 && (f.estimativa_area_ha ?? 0) > 0)) p.valor = 'Informe o R$/ha e a área da estimativa (aba Lançamentos).';
  return p;
}

export function BemDialog({ bemId, clienteId, posicao, linha, aoFechar, aoCriar }: {
  bemId: string | null; clienteId: string; posicao: string; linha: BemDaLista | null; aoFechar: () => void; aoCriar: (id: string) => void;
}) {
  const api = usePatrimonioApi();
  const reler = useRelerPatrimonio();
  const { fazendas } = useFazenda();
  const { data: categorias = [] } = useCategoriasPatrimonio();
  const { data: cadastro } = useCadastroDoBem(bemId);
  const { data: lancamentos = [] } = useLancamentosDoBem(bemId, clienteId);
  const { data: pastosGravados } = usePastosDoBem(bemId);
  const { data: avaliacoes = [] } = useAvaliacoesDoBem(bemId);
  const { data: documentos = [] } = useDocumentosDoBem(bemId);

  const [form, setForm] = useState<FormBem>(() => formNovo(clienteId));
  const [carregado, setCarregado] = useState(bemId == null);
  const [aba, setAba] = useState<AbaBem>('dados');
  const [pastos, setPastos] = useState<PastoLigado[] | null>(null);
  const [motivo, setMotivo] = useState('');
  const [pedeMotivo, setPedeMotivo] = useState<string | null>(null);
  const [erros, setErros] = useState<Partial<Record<Campo, string>>>({});
  const [rodape, setRodape] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /* o cadastro gravado chega uma vez por bem; depois o formulário é do operador */
  useEffect(() => {
    if (bemId && cadastro && (!carregado || form.id !== cadastro.id)) { setForm(cadastro); setCarregado(true); }
  }, [bemId, cadastro, carregado, form.id]);
  useEffect(() => { if (pastosGravados && pastos == null) setPastos(pastosGravados); }, [pastosGravados, pastos]);

  const categoria = useMemo(() => categorias.find(c => c.id === form.categoria_id) ?? null, [categorias, form.categoria_id]);
  const salvo = form.id != null;
  const abas = abasDoBem(categoria, salvo);
  const hoje = hojeLocal();
  const deprecia = !!linha && jaDeprecia({ deprecia: linha.deprecia, situacao: linha.situacao, em_uso_desde: linha.em_uso_desde }, hoje);
  const tipoDaLinha: 'terra' | 'pastagem' | 'bem' = categoria?.base_mercado === 'terra' ? 'terra' : categoria?.tem_pastos ? 'pastagem' : 'bem';
  const fazendaCodigo = fazendas.find(f => f.id === form.fazenda_id)?.codigo ?? null;
  const pastosDirty = pastos != null && pastosGravados != null && JSON.stringify(pastos) !== JSON.stringify(pastosGravados);

  const set = <K extends keyof FormBem>(k: K, v: FormBem[K]) => {
    setForm(f => ({ ...f, [k]: v })); setRodape(null);
    const doValor = k === 'origem_valor' || k === 'valor_sem_lancamento' || k === 'estimativa_rs_ha' || k === 'estimativa_area_ha';
    setErros(e => ({ ...e, [k]: undefined, ...(doValor ? { valor: undefined } : {}) }));
  };
  const escolherCategoria = (id: string) => {
    const c = categorias.find(x => x.id === id) ?? null;
    setForm(f => ({
      ...f, categoria_id: id,
      /* bem que ainda não depreciou nasce com a vida/residual da categoria (sugestão, editável na aba Depreciação) */
      ...(deprecia ? {} : { vida_util_meses: c?.vida_util_anos ? Math.round(c.vida_util_anos * 12) : null, residual_pct: c ? c.residual_pct : null }),
    }));
    setErros(e => ({ ...e, categoria: undefined })); setRodape(null);
  };

  const salvar = async () => {
    const pend = pendenciasDoBem(form, categoria);
    if (pastos?.some(p => !(p.area_ha > 0))) pend.area_ha = 'Informe a área de cada pasto marcado (aba Pastos).';
    if (Object.keys(pend).length) { setErros(pend); setRodape(Object.values(pend)[0] ?? null); return; }
    setSalvando(true); setRodape(null);
    try {
      const m = motivo.trim() || null;
      const previa = await api.salvarBem(form, true, m);
      if (!previa.ok) { setRodape(previa.erro); return; }
      const corr = previa.dados.correcao;
      if (corr && typeof corr === 'object' && !Array.isArray(corr)) {
        const antes = Number(Reflect.get(corr, 'acumulada_antes') ?? 0); const depois = Number(Reflect.get(corr, 'acumulada_depois') ?? 0);
        const frase = `Correção: a depreciação acumulada até hoje passa de ${brl(antes)} para ${brl(depois)}.`;
        if (!m) { setPedeMotivo(frase); setErros({ motivo: 'Informe o motivo da correção.' }); setRodape(`${frase} Informe o motivo e salve de novo.`); return; }
      }
      const r = await api.salvarBem(form, false, m);
      if (!r.ok) { setRodape(r.erro); return; }
      const id = typeof r.dados.id === 'string' ? r.dados.id : form.id;
      const versao = typeof r.dados.versao === 'number' ? r.dados.versao : form.versao;
      if (id && pastosDirty && categoria?.tem_pastos && pastos) {
        const p = await api.salvarPastos(id, pastos, false);
        if (!p.ok) { setRodape(p.erro); setForm(f => ({ ...f, id, versao })); await reler(); return; }
      }
      setForm(f => ({ ...f, id, versao }));
      setMotivo(''); setPedeMotivo(null); setErros({});
      toast.success(form.id ? 'Bem salvo.' : 'Bem criado. Agora dá para ligar lançamentos, pastos e documentos.');
      await reler();
      if (!form.id && id) aoCriar(id);
    } finally { setSalvando(false); }
  };

  const titulo = form.id ? (form.descricao || 'Bem') : 'Novo bem';
  const resumo: Array<{ rotulo: string; valor: string; cor?: string }> = [
    { rotulo: 'situação', valor: linha ? ROTULO_SITUACAO[linha.situacao] : ROTULO_SITUACAO[form.situacao] },
    { rotulo: 'valor de aquisição', valor: linha ? brl(linha.aquisicao) : '—' },
    { rotulo: 'depreciação acumulada', valor: !linha ? '—' : !linha.deprecia ? 'não deprecia' : linha.situacao === 'em_formacao' ? 'começa no uso' : brl(linha.depreciacao_acumulada) },
    { rotulo: 'valor contábil', valor: linha ? brl(linha.valor_contabil) : '—' },
    { rotulo: 'valor de mercado', valor: linha?.mercado_valor != null ? brl(linha.mercado_valor) : '—', cor: linha?.mercado_valor != null ? 'text-emerald-800' : undefined },
  ];
  const contagem: Partial<Record<AbaBem, number>> = {
    lancamentos: lancamentos.length, pastos: pastos?.length ?? 0, mercado: avaliacoes.length, documentos: documentos.length,
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(540px,calc(100vh-16px))] w-[min(1000px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:text-primary-foreground [&>button]:top-2.5"
        data-testid="bem-dialog">
        <div className="flex h-[34px] shrink-0 items-center bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="min-w-0 truncate text-[11px] font-semibold" title={titulo}>{titulo}</DialogTitle>
          <DialogDescription className="sr-only">Cadastro do bem do patrimônio</DialogDescription>
        </div>

        {/* A FAIXA DE RESUMO — fixa, cinco lugares */}
        <div className="grid h-[36px] shrink-0 grid-cols-5 border-b bg-card" data-testid="bem-resumo">
          {resumo.map(r => (
            <div key={r.rotulo} className="min-w-0 border-r px-3 py-1 last:border-r-0">
              <div className="text-[9.5px] leading-none text-muted-foreground">{r.rotulo}</div>
              <div className={cn('mt-1 whitespace-nowrap text-[12px] font-semibold leading-none tabular-nums', r.cor)}>{r.valor}</div>
            </div>
          ))}
        </div>

        {/* AS SEIS ABAS — sempre no mesmo lugar; a apagada diz por quê */}
        <div className="flex h-[32px] shrink-0 items-center border-b bg-card px-3">
          <Segmentado altura={22} valor={aba} onEscolher={setAba} opcoes={abas.map(a => ({
            valor: a.aba, desabilitada: a.apagada, title: a.motivo,
            rotulo: contagem[a.aba] != null
              ? <span>{a.rotulo} <TextoReservado texto={a.apagada ? '' : String(contagem[a.aba])} reserva="999" className="ml-0.5 text-[9.5px] opacity-80" /></span>
              : a.rotulo,
          }))} />
        </div>

        {/* o miolo de cada aba troca de propósito (outros blocos): `data-desloca-livre`, como no ContaBancariaModal; título, resumo, abas e rodapé ficam medidos */}
        <div className="flex min-h-0 flex-1 flex-col bg-muted p-2" data-testid={`bem-aba-${aba}`} data-desloca-livre="">
          {aba === 'dados' && (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
              <BlocoFormulario titulo="Identificação" className="min-h-0">
                <div className={cn(GRADE_FORMULARIO, 'grid-cols-2')}>
                  <div>
                    <Rotulo texto="Categoria" obrig />
                    <SearchableSelect value={form.categoria_id} onValueChange={escolherCategoria} semTodos allLabel="escolha a categoria" allValue=""
                      options={categorias.map(c => ({ value: c.id, label: c.nome }))} triggerClassName={cn(REGUA_CAMPO, erros.categoria && 'border-destructive')} />
                  </div>
                  <div>
                    <Rotulo texto="Fazenda" obrig />
                    <FazendaSelect value={form.fazenda_id} onChange={v => set('fazenda_id', v)} fazendas={fazendas} forcaAdministrativo={false}
                      triggerClassName={cn(REGUA_CAMPO, erros.fazenda && 'border-destructive')} hideAviso />
                  </div>
                  <div className="col-span-2">
                    <Rotulo texto="Descrição" obrig />
                    <Input value={form.descricao} onChange={e => set('descricao', e.target.value)} className={cn(REGUA_CAMPO, erros.descricao && 'border-destructive')}
                      placeholder={tipoDaLinha === 'terra' ? 'Terra nua 850 ha' : tipoDaLinha === 'pastagem' ? 'Reforma de pastagem — 6 pastos' : 'Trator Valtra A950 4x4'} data-testid="bem-descricao" />
                  </div>
                </div>
                {/* a linha que muda com o TIPO do bem (máquina · terra · pastagem) — mesma altura nas três */}
                {tipoDaLinha === 'terra' ? (
                  <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-3')} data-testid="bem-linha-terra">
                    <div><Rotulo texto="Área (ha)" /><CampoNumeroComConta valor={form.area_ha} onChange={v => set('area_ha', v)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="Matrícula" /><Input value={form.matricula} onChange={e => set('matricula', e.target.value)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="NIRF" /><Input value={form.nirf} onChange={e => set('nirf', e.target.value)} className={REGUA_CAMPO} /></div>
                  </div>
                ) : tipoDaLinha === 'pastagem' ? (
                  <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-3')} data-testid="bem-linha-pastagem">
                    <div className="col-span-1">
                      <Rotulo texto="Área (ha) — soma dos pastos" />
                      <div className={cn(REGUA_CAMPO, 'flex items-center justify-end rounded-md border bg-muted/60 px-2 tabular-nums')}>
                        {(pastos ?? []).reduce((t, p) => t + p.area_ha, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <p className="col-span-2 self-end pb-1.5 text-[10px] text-muted-foreground">os pastos se marcam na aba Pastos; o custo se divide pela área</p>
                  </div>
                ) : (
                  <div className={cn(GRADE_FORMULARIO, 'mt-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px_minmax(0,1.2fr)]')} data-testid="bem-linha-maquina">
                    <div><Rotulo texto="Marca" /><Input value={form.marca} onChange={e => set('marca', e.target.value)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="Modelo" /><Input value={form.modelo} onChange={e => set('modelo', e.target.value)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="Ano" /><Input inputMode="numeric" maxLength={4} value={form.ano_fabricacao != null ? String(form.ano_fabricacao) : ''}
                      onChange={e => { const d = e.target.value.replace(/\D/g, ''); set('ano_fabricacao', d ? Number(d) : null); }} className={cn(REGUA_CAMPO, 'tabular-nums')} /></div>
                    <div><Rotulo texto="Placa / chassi / nº de série" /><Input value={form.identificacao} onChange={e => set('identificacao', e.target.value)} className={REGUA_CAMPO} /></div>
                  </div>
                )}
                <div className="mt-1">
                  <Rotulo texto="Observação" />
                  <Input value={form.observacao} onChange={e => set('observacao', e.target.value)} className={REGUA_CAMPO} />
                </div>
              </BlocoFormulario>

              <div className="flex min-h-0 flex-col gap-1.5">
                <BlocoFormulario titulo="Uso">
                  <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]')}>
                    <div>
                      <Rotulo texto="Situação" />
                      <Segmentado altura={28} valor={form.situacao} onEscolher={v => set('situacao', v)} opcoes={[
                        { valor: 'em_formacao', rotulo: 'Em formação', title: 'acumula lançamentos, ainda não deprecia' },
                        { valor: 'em_uso', rotulo: 'Em uso', title: 'deprecia desde o mês de "em uso desde"' },
                        { valor: 'baixado', rotulo: 'Baixado / vendido', desabilitada: true, title: 'a baixa chega num PR seguinte' },
                      ]} />
                    </div>
                    <div>
                      <Rotulo texto="Em uso desde" obrig={form.situacao === 'em_uso'} />
                      <div className={cn(erros.em_uso_desde && '[&_input]:border-destructive')}>
                        <DatePicker value={form.em_uso_desde} onChange={v => set('em_uso_desde', v ?? '')} disabled={form.situacao !== 'em_uso'} className={REGUA_CAMPO} />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Rotulo texto="Atividade que usa o bem — compartilhado divide pelo rateio administrativo" />
                      <Segmentado altura={28} valor={form.atividade} onEscolher={v => set('atividade', v)} opcoes={[
                        { valor: 'pecuaria', rotulo: 'Pecuária' }, { valor: 'lavoura', rotulo: 'Lavoura' }, { valor: 'compartilhado', rotulo: 'Compartilhado' },
                      ]} />
                    </div>
                    {/* O LUGAR DO MOTIVO DA CORREÇÃO — sempre ocupado; liga só quando o bem já deprecia (3.5) */}
                    <div className="col-span-2">
                      <Rotulo texto={deprecia ? `Motivo da correção — o bem já deprecia desde ${mesBR(linha?.em_uso_desde)}` : 'Motivo da correção'} obrig={!!pedeMotivo} />
                      <Input value={motivo} onChange={e => { setMotivo(e.target.value); setErros(x => ({ ...x, motivo: undefined })); }} disabled={!deprecia}
                        placeholder={deprecia ? 'só se mudar a situação ou o mês do "em uso"' : 'só para bem que já deprecia'}
                        className={cn(REGUA_CAMPO, erros.motivo && 'border-destructive')} data-testid="bem-motivo" />
                    </div>
                  </div>
                </BlocoFormulario>
                <BlocoFormulario titulo="Seguro">
                  <div className={cn(GRADE_FORMULARIO, 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px]')}>
                    <div><Rotulo texto="Seguradora" /><Input value={form.seguradora} onChange={e => set('seguradora', e.target.value)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="Apólice" /><Input value={form.apolice} onChange={e => set('apolice', e.target.value)} className={REGUA_CAMPO} /></div>
                    <div><Rotulo texto="Vencimento" /><DatePicker value={form.seguro_vence_em} onChange={v => set('seguro_vence_em', v ?? '')} className={REGUA_CAMPO} /></div>
                  </div>
                </BlocoFormulario>
              </div>
            </div>
          )}
          {aba === 'lancamentos' && (
            <AbaLancamentos bemId={form.id} clienteId={clienteId} form={form} set={set} lancamentos={lancamentos} linha={linha} erroValor={!!erros.valor}
              ehPastagem={!!categoria?.tem_pastos} areaDosPastos={(pastos ?? []).reduce((t, p) => t + p.area_ha, 0)} />
          )}
          {aba === 'pastos' && form.id && (
            <AbaPastos fazendaId={form.fazenda_id} fazendaCodigo={fazendaCodigo} pastos={pastos ?? []} setPastos={p => { setPastos(p); setRodape(null); }}
              aquisicao={linha?.aquisicao ?? 0} contabil={linha?.valor_contabil ?? 0} />
          )}
          {aba === 'depreciacao' && form.id && (
            <AbaDepreciacao bemId={form.id} clienteId={clienteId} posicao={posicao} form={form} set={set} categoria={categoria} jaDeprecia={deprecia} linha={linha} />
          )}
          {aba === 'mercado' && form.id && (
            <AbaMercado bemId={form.id} avaliacoes={avaliacoes} categoria={categoria} areaDoBem={form.area_ha} contabil={linha?.valor_contabil ?? null} />
          )}
          {aba === 'documentos' && form.id && <AbaDocumentos bemId={form.id} documentos={documentos} />}
        </div>

        {/* O RODAPÉ — a frase da pendência/recusa à esquerda (lugar reservado), Fechar e Salvar à direita */}
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <p className={cn('min-w-0 flex-1 truncate text-[10px]', rodape ? 'text-destructive' : 'text-muted-foreground')} title={rodape ?? undefined} data-testid="bem-rodape">
            {rodape ?? (pastosDirty ? 'pastos marcados ainda não gravados — Salvar grava' : '')}
          </p>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Fechar</Button>
          <Button size="sm" className="h-[26px] w-[72px] text-[11px]" disabled={salvando || (bemId != null && !carregado)} onClick={() => void salvar()} data-testid="bem-salvar">
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
