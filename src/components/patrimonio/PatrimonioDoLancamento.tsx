/**
 * LANC-PATRIMONIO-VINCULO-01 — "Patrimônio" no rodapé do Editar lançamento (mock v1, aprovado pelo Gabriel 15/11 07:48; a RPC 116270
 * no proto pelo lote 9, 16/11 07:17).
 *
 * O pedaço do rodapé: (a) investimento sem bem → botão "Patrimônio" com o selo âmbar "sem bem" (D5: pendência, nunca bloqueio);
 * (b) já ligado → "↔ CÓDIGO nome" (abre o bem) + "desligar" (motivo; nada se apaga); conta que não é Investimento na Fazenda fora do
 * RH, ou lançamento cancelado → nada (D1). O botão abre o minimodal: "Ligar a um bem" (a busca; primeiro os da categoria sugerida pela
 * conta e da mesma fazenda) | "Criar o bem" (UMA ida ao banco: `fn_patrimonio_bem_criar_e_ligar` — ou nasce já ligado, ou nada nasce).
 * ⚠ LIGAR SÓ LIGA: o lançamento não muda (valor, data, conta, status, conciliação). A PRÉVIA É A DO BANCO (`p_simular`), e a recusa vem
 *   pronta dele. D2: previsto/agendado fica parado com o motivo (exceto parcela de contrato). D4: compra parcelada liga o contrato inteiro.
 * ⚠ INJETÁVEL: `api` (padrão = o banco); a bancada do gate de tela passa uma em memória.
 * ⚠ TAMANHO FIXO (720 × 440), um scrollport (a lista de bens), régua da casa, a prévia num lugar reservado de 24px.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Landmark, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Rotulo, REGUA_CAMPO } from '@/components/ui/bloco-formulario';
import { cn } from '@/lib/utils';
import { brl, dataBR, n2, rotuloVida, type BemDaLista } from '@/lib/patrimonio/patrimonio';
import type { ItemDoVinculo, PreviaLigar } from '@/lib/patrimonio/patrimonioApi';
import {
  atividadeDaConta, bensParaLigar, categoriaSugerida, comOContrato, estadoDoBotao, faltamDoContrato, fraseDaPrevia, itensParaLigar,
  motivoDoPrevisto, partesDeInvestimento, previaDeixaGravar, tituloDoSemBem, type CategoriaComContas, type PatrimonioDoLancamentoLido,
} from '@/lib/patrimonio/patrimonioDoLancamento';
import { apiDoLancamentoDoBanco, type PatrimonioDoLancamentoApi, type RespostaCriar } from '@/lib/patrimonio/patrimonioDoLancamentoApi';
import { PedirMotivo, QUADRO_MODAL, TD_MODAL, TD_MODAL_NUM, TD_MODAL_TEXTO, TH_MODAL, TH_MODAL_NUM } from './pecas';

export const FRASE_ESCOLHA_CATEGORIA = 'Escolha a categoria';
export const FRASE_SEM_FAZENDA = 'O lançamento não tem fazenda: crie o bem pela tela do Patrimônio.';

export interface PatrimonioDoLancamentoProps {
  lancamentoId: string; clienteId: string; descricao: string | null; valor: number;
  fornecedor?: string | null; fazendaRotulo?: string | null;
  /** abre a ficha do bem no Patrimônio (o Editar lançamento fecha antes) */
  onAbrirBem?: (bemId: string) => void;
  /** premissa fiscal: o cliente é contribuinte de IBS/CBS (o padrão) */
  contribuinte?: boolean;
  api?: PatrimonioDoLancamentoApi;
  /** a bancada abre o minimodal já aberto, numa aba */
  abertoEm?: 'ligar' | 'criar';
}

export function PatrimonioDoLancamento({ lancamentoId, clienteId, descricao, valor, fornecedor, fazendaRotulo, onAbrirBem,
  contribuinte = true, api = apiDoLancamentoDoBanco, abertoEm }: PatrimonioDoLancamentoProps) {
  const [lido, setLido] = useState<PatrimonioDoLancamentoLido | null>(null);
  const [seq, setSeq] = useState(0);
  const [aberto, setAberto] = useState<'ligar' | 'criar' | null>(abertoEm ?? null);
  const [desligando, setDesligando] = useState<{ bem_id: string; codigo: string; parte_ordem: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    void api.ler(lancamentoId, clienteId).then((r) => { if (vivo) setLido(r.ok ? r.dados : null); });
    return () => { vivo = false; };
  }, [api, lancamentoId, clienteId, seq]);
  const reler = useCallback(() => setSeq((s) => s + 1), []);

  const estado = estadoDoBotao(lido);
  if (estado.tipo === 'nada' || !lido) return null;
  const botao = (selo: boolean) => (
    <Button variant="outline" size="sm" className="h-[22px] shrink-0 gap-1 px-[9px] text-[10px]" onClick={() => setAberto('ligar')}
      data-testid="acao-patrimonio" title={selo ? tituloDoSemBem(contribuinte) : 'Ligar a outra parte deste lançamento a um bem'}>
      <Landmark className="h-3 w-3" /> Patrimônio
      {/* o selo tem lugar fixo: o botão não muda de largura (nada se desloca) */}
      <span className={cn('rounded-[7px] bg-amber-100 px-[4px] text-[9.5px] font-semibold leading-[13px] text-amber-800', !selo && 'invisible')}
        data-testid="selo-sem-bem">sem bem</span>
    </Button>
  );
  return (
    <span className="flex min-w-0 items-center gap-1 text-[10px]" data-testid="patrimonio-do-lancamento" data-estado={estado.tipo}>
      {estado.tipo === 'ligado' ? (
        <>
          {estado.vinculos.map((v) => (
            <span key={`${v.bem_id}#${v.parte_ordem}`} className="flex min-w-0 items-center gap-1">
              <button type="button" className="min-w-0 max-w-[220px] truncate font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                disabled={!onAbrirBem} onClick={() => onAbrirBem?.(v.bem_id)} title={`Patrimônio: ${v.codigo} ${v.descricao} · abrir o bem`}
                data-testid="abrir-bem-do-lancamento">↔ <span className="tabular-nums">{v.codigo}</span> {v.descricao}</button>
              <button type="button" className="shrink-0 text-destructive hover:underline" onClick={() => setDesligando(v)} data-testid="desligar-bem">desligar</button>
            </span>
          ))}
          {estado.faltam > 0 && botao(true)}
        </>
      ) : botao(true)}
      {aberto && (
        <PatrimonioDoLancamentoDialog lido={lido} lancamentoId={lancamentoId} clienteId={clienteId} descricao={descricao} valor={valor}
          fornecedor={fornecedor ?? null} fazendaRotulo={fazendaRotulo ?? null} api={api} abaInicial={aberto}
          aoFechar={() => setAberto(null)} aoGravar={reler} />
      )}
      <PedirMotivo titulo="Desligar o lançamento do bem" rotuloDoBotao="Desligar" aberto={!!desligando} aoFechar={() => setDesligando(null)}
        frase={desligando ? `O lançamento deixa de compor ${desligando.codigo}. Nada se apaga; ele volta para "Investimentos sem bem".` : ''}
        aoConfirmar={async (motivo) => {
          if (!desligando) return null;
          const r = await api.desligar(desligando.bem_id, [{ lancamento_id: lancamentoId, parte_ordem: desligando.parte_ordem }], motivo);
          if (!r.ok) return r.erro;
          reler();
          return null;
        }} />
    </span>
  );
}

type Aba = 'ligar' | 'criar';

export function PatrimonioDoLancamentoDialog({ lido, lancamentoId, clienteId, descricao, valor, fornecedor, fazendaRotulo, api, abaInicial, aoFechar, aoGravar }: {
  lido: PatrimonioDoLancamentoLido; lancamentoId: string; clienteId: string; descricao: string | null; valor: number;
  fornecedor: string | null; fazendaRotulo: string | null; api: PatrimonioDoLancamentoApi; abaInicial: Aba; aoFechar: () => void; aoGravar: () => void;
}) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  const partes = partesDeInvestimento(lido).filter((p) => !lido.vinculos.some((v) => v.parte_ordem === p.parte_ordem));
  const p0 = partes[0] ?? null;
  const itensBase = useMemo(() => itensParaLigar(lido, lancamentoId), [lido, lancamentoId]);
  const motivoPrevisto = motivoDoPrevisto(partes);
  const somaDasPartes = partes.reduce((t, p) => t + p.valor, 0);
  const dividido = (p0?.partes_total ?? 1) > 1;

  const [bens, setBens] = useState<BemDaLista[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaComContas[]>([]);
  useEffect(() => {
    let vivo = true;
    void api.bens(clienteId).then((r) => { if (vivo) setBens(r.ok ? r.dados : []); });
    void api.categorias(clienteId).then((c) => { if (vivo) setCategorias(c); });
    return () => { vivo = false; };
  }, [api, clienteId]);
  const sugerida = useMemo(() => categoriaSugerida(categorias, p0?.plano_conta_id ?? null), [categorias, p0?.plano_conta_id]);

  /* ── Ligar a um bem ── */
  const [busca, setBusca] = useState('');
  const [bemId, setBemId] = useState<string | null>(null);
  const lista = useMemo(() => bensParaLigar(bens ?? [], sugerida?.id ?? null, p0?.fazenda_id ?? null, busca), [bens, sugerida?.id, p0?.fazenda_id, busca]);
  const bem = (bens ?? []).find((b) => b.bem_id === bemId) ?? null;

  /* ── Criar o bem ── */
  const [nome, setNome] = useState(descricao ?? '');
  const [categoriaId, setCategoriaId] = useState('');
  useEffect(() => { if (sugerida && !categoriaId) setCategoriaId(sugerida.id); }, [sugerida, categoriaId]);
  const categoria = categorias.find((c) => c.id === categoriaId) ?? null;

  /* ── a prévia do banco (as duas abas) ── */
  const [itens, setItens] = useState<ItemDoVinculo[]>(itensBase);
  const [previa, setPrevia] = useState<PreviaLigar | null>(null);
  const [criada, setCriada] = useState<RespostaCriar | null>(null);
  const [confirmaRepetidas, setConfirmaRepetidas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const bemNovo = useMemo(() => (p0?.fazenda_id && categoriaId && nome.trim()
    ? { cliente_id: clienteId, fazenda_id: p0.fazenda_id, categoria_id: categoriaId, descricao: nome.trim(), atividade: atividadeDaConta(p0.escopo_negocio, p0.subcentro) }
    : null), [clienteId, p0?.fazenda_id, p0?.escopo_negocio, p0?.subcentro, categoriaId, nome]);

  useEffect(() => {
    let vivo = true;
    setPrevia(null); setCriada(null); setErro(null);
    if (!itens.length) return;
    if (aba === 'ligar' && bemId) {
      void api.ligar(bemId, itens, confirmaRepetidas, true).then((r) => {
        if (!vivo) return;
        if (!r.ok) { setErro(r.erro); return; }
        if (faltamDoContrato(r.dados) > 0) { setItens((i) => comOContrato(i, r.dados)); return; }  // D4: o contrato inteiro
        setPrevia(r.dados);
      });
    }
    if (aba === 'criar' && bemNovo) {
      const t = setTimeout(() => {
        void api.criarELigar(bemNovo, itens, confirmaRepetidas, true).then((r) => {
          if (!vivo) return;
          if (!r.ok) { setErro(r.erro); return; }
          if (r.dados.ligar && faltamDoContrato(r.dados.ligar) > 0) { setItens((i) => comOContrato(i, r.dados.ligar ?? previaVazia)); return; }
          setCriada(r.dados); setPrevia(r.dados.ligar);
        });
      }, 300);
      return () => { vivo = false; clearTimeout(t); };
    }
    return () => { vivo = false; };
  }, [api, aba, bemId, bemNovo, itens, confirmaRepetidas]);

  const nContrato = itens.length - itensBase.length;
  const motivo = motivoPrevisto
    ?? (aba === 'criar' && !p0?.fazenda_id ? FRASE_SEM_FAZENDA : null)
    ?? (aba === 'criar' && !categoriaId ? FRASE_ESCOLHA_CATEGORIA : null)
    ?? (aba === 'criar' && !nome.trim() ? 'Informe o nome do bem.' : null)
    ?? (aba === 'ligar' && !bemId ? 'Escolha o bem na lista.' : null)
    ?? (erro ?? null)
    ?? (!previa ? 'Conferindo com o banco…' : null)
    ?? (previaDeixaGravar(previa, confirmaRepetidas) ? null : fraseDaPrevia(previa, null, n2));
  const textoDaPrevia = erro ?? (previa
    ? (aba === 'criar' && criada?.codigo && previaDeixaGravar(previa, confirmaRepetidas)
      ? `Nasce ${criada.codigo} já ligado a ${previa.n_ligar} ${previa.n_ligar === 1 ? 'lançamento' : 'lançamentos'} (R$ ${n2(previa.soma)})`
      : fraseDaPrevia(previa, aba === 'ligar' && bem ? { codigo: bem.codigo, aquisicaoAntes: bem.aquisicao } : null, n2))
    : '');

  const gravar = async () => {
    if (motivo) return;
    setIndo(true); setErro(null);
    const r = aba === 'ligar' && bemId ? await api.ligar(bemId, itens, confirmaRepetidas, false)
      : bemNovo ? await api.criarELigar(bemNovo, itens, confirmaRepetidas, false) : null;
    setIndo(false);
    if (!r) return;
    if (!r.ok) { setErro(r.erro); return; }
    toast.success(aba === 'ligar' ? `Ligado a ${bem?.codigo ?? 'o bem'}.` : `Bem ${'codigo' in r.dados && r.dados.codigo ? r.dados.codigo : ''} criado e ligado.`);
    aoGravar();
    aoFechar();
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(440px,calc(100vh-16px))] w-[min(720px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0 [&>button]:top-2.5 [&>button]:text-primary-foreground"
        data-testid="patrimonio-do-lancamento-dialog" data-desloca-livre>
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 pr-10 text-primary-foreground">
          <DialogTitle className="shrink-0 text-[11px] font-semibold">{aba === 'ligar' ? 'Patrimônio · ligar este lançamento' : 'Patrimônio · criar o bem deste lançamento'}</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 truncate text-[10px] text-primary-foreground/80" title={descricao ?? undefined}>{descricao ?? '—'}</DialogDescription>
          <span className="shrink-0 text-[10px] tabular-nums">{brl(valor)}</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 bg-muted p-2">
          <div className="flex h-[26px] shrink-0 items-center gap-2">
            <Segmentado valor={aba} onEscolher={setAba} opcoes={[{ valor: 'ligar', rotulo: 'Ligar a um bem' }, { valor: 'criar', rotulo: 'Criar o bem' }]} />
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground"
              title={dividido ? `parte de investimento · ${brl(somaDasPartes)} (a outra parte não entra)` : undefined}>
              {dividido ? `liga só a parte de investimento · ${brl(somaDasPartes)}` : 'ligar só liga: nada muda no lançamento'}
              {nContrato > 0 ? ` · + ${nContrato} parcela(s) do contrato` : ''}
            </span>
          </div>
          {aba === 'ligar' ? (
            <>
              <div className="relative w-[300px] shrink-0">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, nome, fazenda…" className="h-[24px] pl-6 text-[10px]"
                  autoFocus data-testid="busca-do-bem" />
              </div>
              <div className={QUADRO_MODAL}>
                <table className="w-full table-fixed border-collapse">
                  <colgroup><col style={{ width: 24 }} /><col style={{ width: 76 }} /><col /><col style={{ width: 80 }} /><col style={{ width: 110 }} /></colgroup>
                  <thead className="text-primary-foreground">
                    <tr className="h-[22px]"><th className={TH_MODAL} /><th className={TH_MODAL}>Código</th><th className={TH_MODAL}>Bem</th><th className={TH_MODAL}>Fazenda</th><th className={TH_MODAL_NUM}>Aquisição R$</th></tr>
                  </thead>
                  <tbody>
                    {lista.map((b) => (
                      <tr key={b.bem_id} className={cn('h-[19px] cursor-pointer border-b border-border/40 hover:bg-muted/40', b.bem_id === bemId && 'bg-primary/10')}
                        onClick={() => setBemId(b.bem_id)} data-testid="bem-para-ligar">
                        <td className={cn(TD_MODAL, 'px-1 text-center text-[10px]')}>{b.bem_id === bemId ? '◉' : '○'}</td>
                        <td className={cn(TD_MODAL, 'whitespace-nowrap tabular-nums')}>{b.codigo}</td>
                        <td className={TD_MODAL_TEXTO} title={b.descricao}>{b.descricao}</td>
                        <td className={cn(TD_MODAL, 'whitespace-nowrap')}>{b.fazenda_codigo ?? '—'}</td>
                        <td className={TD_MODAL_NUM}>{n2(b.aquisicao)}</td>
                      </tr>
                    ))}
                    {lista.length === 0 && (
                      <tr className="h-[19px]"><td colSpan={5} className={cn(TD_MODAL, 'py-4 text-center text-muted-foreground')}>
                        {bens === null ? 'Carregando…' : busca.trim() ? `Nada para “${busca.trim()}”.` : 'Nenhum bem cadastrado: use "Criar o bem".'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr] content-start gap-x-3 gap-y-1 overflow-hidden rounded border bg-card p-2" data-testid="criar-o-bem">
              <div className="col-span-2">
                <Rotulo texto="Nome" obrig />
                <Input value={nome} onChange={(e) => setNome(e.target.value)} className={cn(REGUA_CAMPO, !nome.trim() && 'border-destructive')} data-testid="nome-do-bem" />
              </div>
              <div>
                <Rotulo texto={sugerida && categoriaId === sugerida.id ? 'Categoria · sugerida pela conta' : 'Categoria'} obrig />
                <SearchableSelect value={categoriaId} onValueChange={setCategoriaId} semTodos allLabel={FRASE_ESCOLHA_CATEGORIA} allValue=""
                  options={categorias.map((c) => ({ value: c.id, label: c.nome }))} triggerClassName={cn(REGUA_CAMPO, !categoriaId && 'border-destructive text-destructive')} />
              </div>
              <Info rotulo="Código" valor={criada?.codigo ?? (categoria?.prefixo ? `${categoria.prefixo}-…` : '—')} nota="o próximo; o banco decide ao gravar" testId="codigo-do-bem" />
              <Info rotulo="Fazenda" valor={fazendaRotulo ?? (p0?.fazenda_id ? 'a do lançamento' : '—')} nota="do lançamento" />
              <Info rotulo="Data de aquisição" valor={dataBR(p0?.data_pagamento ?? p0?.data_competencia ?? null)} nota="do pagamento" />
              <Info rotulo="Valor de aquisição" valor={brl(previa?.soma ?? somaDasPartes)} nota="soma do que se liga (não se digita)" />
              <Info rotulo="Fornecedor" valor={fornecedor ?? '—'} nota="do lançamento" />
              <Info rotulo="Vida útil · residual"
                valor={categoria ? `${rotuloVida(criada?.vida_util_meses ?? (categoria.vida_util_anos != null ? Math.round(categoria.vida_util_anos * 12) : null))} · ${n2(criada?.residual_pct ?? categoria.residual_pct)}%` : '—'}
                nota="da categoria (editável depois na ficha)" />
            </div>
          )}
          {/* A PRÉVIA — lugar fixo: o que o banco disse */}
          <div className="flex h-[24px] shrink-0 items-center gap-2 text-[10px]" data-testid="previa-do-patrimonio">
            {previa && previa.n_repetidas > 0 ? (
              <label className="flex shrink-0 items-center gap-1.5 text-amber-800">
                <Checkbox checked={confirmaRepetidas} onCheckedChange={(v) => setConfirmaRepetidas(v === true)} className="h-3 w-3" data-testid="confirmo-nao-repetido" />
                Confirmo que não é repetido
              </label>
            ) : null}
            <span className={cn('min-w-0 flex-1 truncate', erro || previa?.n_recusas ? 'text-destructive' : 'text-muted-foreground')} title={textoDaPrevia || undefined}>
              {textoDaPrevia ? `Prévia: ${textoDaPrevia}` : ''}
            </span>
          </div>
        </div>
        <div className="flex h-[40px] shrink-0 items-center gap-2 border-t bg-card px-3">
          <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground" data-testid="motivo-do-patrimonio" title={motivo ?? undefined}>{motivo ?? ''}</span>
          <Button variant="outline" size="sm" className="h-[26px] text-[11px]" onClick={aoFechar}>Voltar</Button>
          <Button size="sm" className="h-[26px] w-[96px] text-[11px]" disabled={indo || !!motivo} onClick={() => void gravar()} data-testid="gravar-patrimonio">
            {aba === 'ligar' ? 'Ligar' : 'Criar e ligar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const previaVazia: PreviaLigar = { ok: true, soma: 0, n_ligar: 0, n_recusas: 0, n_repetidas: 0, itens: [], contratos: [] };

function Info({ rotulo, valor, nota, testId }: { rotulo: string; valor: string; nota: string; testId?: string }) {
  return (
    <div className="min-w-0">
      <Rotulo texto={rotulo} />
      <div className="flex h-7 items-center gap-1.5 text-[11px]">
        <span className="shrink-0 tabular-nums" data-testid={testId}>{valor}</span>
        <span className="min-w-0 truncate text-[9.5px] text-muted-foreground" title={nota}>{nota}</span>
      </div>
    </div>
  );
}
