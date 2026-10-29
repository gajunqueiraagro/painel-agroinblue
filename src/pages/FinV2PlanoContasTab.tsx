import { casaNaBusca } from '@/lib/texto/busca';
import { Fragment, useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCliente } from '@/contexts/ClienteContext';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { useAlturaAteOFim } from '@/hooks/useAlturaAteOFim';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TH_REGUA, TD_REGUA, TD_REGUA_TEXTO, QUADRO_REGUA, RODAPE_REGUA, TextoReservado } from '@/components/ui/regua-tabela';
import { cn } from '@/lib/utils';
import { Search, Pencil } from 'lucide-react';
import { DIVIDENDO_MACRO, loadPlanoContasCompleto, type PlanoContasItem } from '@/lib/financeiro/planoContasBuilder';
import {
  FN_SUBCENTRO_CLIENTE, MOLDES_SUBCENTRO_CLIENTE, fraseDaPrevia, lerRespostaDoSubcentro, moldeDaConta,
  type GestoDoSubcentro, type MoldeDeSubcentro, type RespostaDoSubcentro,
} from '@/lib/financeiro/subcentroDoCliente';

/* P172 — a régua da casa (cabeçalho navy 22px, linha 19px a 10px, nada em CAIXA ALTA). Colunas em px; o Subcentro fica com o resto
   (e nunca menos que `SUBCENTRO_MIN`): abaixo disso o quadro rola de lado, dentro dele. */
const COL = { macro: 112, grupo: 112, centro: 140, dre: 32, tipo: 90, acoes: 152 } as const;
const SUBCENTRO_MIN = 170;
/* as cores do mock aprovado (29/10): faixa do grupo cinza-azulada, zebra suave */
const FAIXA_DO_GRUPO = 'bg-[#e4e9f0]';
const ZEBRA = 'bg-[#f8f9fb]';
const SELO = 'inline-block shrink-0 rounded-full px-1.5 text-[9.5px] font-medium leading-[14px] align-middle';
const COR_DO_TIPO: Record<string, string> = {
  Receita: 'bg-[#e6f4ea] text-[#1e7a44]',
  Despesa: 'bg-[#fde8e8] text-[#b42318]',
  'Transferência': 'bg-[#e0ecf8] text-[#1e3a5f]',
};
const LINK = 'text-[10px] text-primary hover:underline disabled:opacity-50 disabled:no-underline';

const TIPO_ORDER: Record<string, number> = { 'Receita': 0, 'Despesa': 1, 'Transferência': 2 };

const tipoLabel = (t: string) => {
  if (t.startsWith('1')) return 'Receita';
  if (t.startsWith('2')) return 'Despesa';
  if (t.toLowerCase().includes('transf')) return 'Transferência';
  return t;
};

const chaveDoGrupo = (tipo: string, macro: string, grupo: string | null) => `${tipoLabel(tipo)} › ${macro}${grupo ? ' › ' + grupo : ''}`;

type Linha =
  | { tipo: 'conta'; item: PlanoContasItem }
  | { tipo: 'novo'; molde: MoldeDeSubcentro };

/** o gesto aberto: o formulário do nome (criar / renomear) ou a confirmação (inativar / reativar), com a prévia do banco */
type Gesto = {
  gesto: GestoDoSubcentro;
  molde: MoldeDeSubcentro;
  conta: PlanoContasItem | null;
  nome: string;
  previa: RespostaDoSubcentro | null;
};

/* P171: a tela não escreve no plano. Cada gesto chama a função do escritor único, sempre SIMULANDO antes. */
async function chamarSubcentro(gesto: GestoDoSubcentro, args: Record<string, unknown>): Promise<RespostaDoSubcentro> {
  const { data, error } = await (supabase as any).rpc(FN_SUBCENTRO_CLIENTE[gesto], args);
  return lerRespostaDoSubcentro(data, error);
}

function argumentos(g: Gesto, clienteId: string, simular: boolean): Record<string, unknown> {
  if (g.gesto === 'criar') return { p_cliente_id: clienteId, p_molde: g.molde.chave, p_nome: g.nome.trim(), p_simular: simular };
  if (g.gesto === 'renomear') return { p_id: g.conta?.id, p_nome: g.nome.trim(), p_simular: simular };
  return { p_id: g.conta?.id, p_simular: simular };
}

const TITULO_DO_GESTO: Record<GestoDoSubcentro, string> = {
  criar: 'Novo subcentro do cliente',
  renomear: 'Renomear subcentro do cliente',
  inativar: 'Inativar subcentro do cliente',
  reativar: 'Reativar subcentro do cliente',
};
const FEITO: Record<GestoDoSubcentro, string> = {
  criar: 'Subcentro criado', renomear: 'Subcentro renomeado', inativar: 'Subcentro inativado', reativar: 'Subcentro reativado',
};

export function FinV2PlanoContasTab({ onAbrirDividendos }: { onAbrirDividendos?: () => void } = {}) {
  const { clienteAtual, isAdmin } = useCliente();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<PlanoContasItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInativos, setShowInativos] = useState(false);
  const [aberto, setAberto] = useState<Gesto | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const quadro = useAlturaAteOFim();
  /* P172: as ações (criar, renomear, inativar, reativar, o link dos Dividendos) são só do admin AGROinBLUE; o banco recusa os outros */
  const admin = isAdmin === true;

  /* a leitura que chega depois de trocar o cliente não escreve na tela */
  const leitura = useRef(0);
  const load = useCallback(async () => {
    if (!clienteAtual?.id) return;
    const vez = ++leitura.current;
    setLoading(true);
    /* P172: "Mostrar inativos" funciona — a tela lê também as inativas e as esconde até o interruptor */
    const data = await loadPlanoContasCompleto(clienteAtual.id, { incluirInativos: true });
    if (vez !== leitura.current) return;
    setItems(data);
    setLoading(false);
  }, [clienteAtual?.id]);

  useEffect(() => { load(); }, [load]);

  const buscaAtiva = search.trim() !== '';
  const filtered = items
    .filter(i => {
      if (!showInativos && !i.ativo) return false;
      if (!search) return true;
      /* P134: sem acento, cedilha e maiúscula nos dois lados (`casaNaBusca`, a regra única) */
      return (
        casaNaBusca(i.subcentro, search) ||
        casaNaBusca(i.centro_custo, search) ||
        casaNaBusca(i.grupo_custo, search) ||
        casaNaBusca(i.macro_custo, search) ||
        casaNaBusca(i.tipo_operacao, search)
      );
    })
    .sort((a, b) => {
      const ta = TIPO_ORDER[tipoLabel(a.tipo_operacao)] ?? 99;
      const tb = TIPO_ORDER[tipoLabel(b.tipo_operacao)] ?? 99;
      if (ta !== tb) return ta - tb;
      if (a.ordem_exibicao !== b.ordem_exibicao) return a.ordem_exibicao - b.ordem_exibicao;
      return (a.subcentro ?? '').localeCompare(b.subcentro ?? '', 'pt-BR');
    });

  /* P172: cada grupo (Tipo › Macro › Grupo) aparece UMA vez, no lugar da 1ª conta dele na ordem do plano, com as contas dele na ordem do
     plano. A ordem do plano intercala grupos (no NJ, 29/10: "Outras Saídas" em 5010, 10005–10006 e 16005, com outros entre elas — 33 blocos
     para 29 grupos): agrupar só na troca de vizinho repetia o grupo. */
  const groups: { label: string; contas: number; linhas: Linha[] }[] = [];
  const grupoDe = new Map<string, (typeof groups)[number]>();
  for (const item of filtered) {
    const key = chaveDoGrupo(item.tipo_operacao, item.macro_custo, item.grupo_custo);
    let g = grupoDe.get(key);
    if (!g) {
      g = { label: key, contas: 0, linhas: [] };
      grupoDe.set(key, g);
      groups.push(g);
    }
    g.linhas.push({ tipo: 'conta', item });
    g.contas += 1;
  }
  /* P172: "+ Novo subcentro do cliente" ao fim de cada centro que aceita (o molde do P171), só para o admin. Sem subcentro ainda, o
     centro não existe no cliente: a linha entra no lugar dele pela ordem do molde. Com busca, só se a busca alcança o centro. */
  if (admin) {
    for (const m of MOLDES_SUBCENTRO_CLIENTE) {
      if (buscaAtiva && !(casaNaBusca(m.centro_custo, search) || casaNaBusca(m.grupo_custo, search) || casaNaBusca(m.macro_custo, search))) continue;
      const g = groups.find(x => x.label === chaveDoGrupo(m.tipo_operacao, m.macro_custo, m.grupo_custo));
      if (!g) continue;
      let at = -1;
      g.linhas.forEach((l, k) => { if (l.tipo === 'conta' && l.item.centro_custo === m.centro_custo) at = k; });
      if (at < 0) g.linhas.forEach((l, k) => { if (l.tipo === 'conta' && l.item.ordem_exibicao <= m.ordem_exibicao) at = k; });
      g.linhas.splice(at + 1, 0, { tipo: 'novo', molde: m });
    }
  }

  const colunas = admin ? 7 : 6;
  const minTabela = COL.macro + COL.grupo + COL.centro + SUBCENTRO_MIN + COL.dre + COL.tipo + (admin ? COL.acoes : 0);
  const inativos = items.filter(i => !i.ativo).length;

  const aposGravar = useCallback((clienteId: string) => {
    load();
    /* quem mostra o plano (os seletores) e os lançamentos relê sem F5 — o mesmo aviso do cadastro de Dividendos */
    queryClient.invalidateQueries({ queryKey: ['fin-classificacoes-plano', clienteId] });
    notificarLancamentosMudaram(clienteId);
  }, [load, queryClient]);

  /* abrir: criar/renomear abrem o formulário (a prévia vem do "Conferir"); inativar/reativar simulam já e abrem a confirmação */
  const abrir = async (gesto: GestoDoSubcentro, molde: MoldeDeSubcentro, conta: PlanoContasItem | null) => {
    const g: Gesto = { gesto, molde, conta, nome: gesto === 'renomear' ? (conta?.subcentro ?? '') : '', previa: null };
    if (gesto === 'criar' || gesto === 'renomear' || !clienteAtual?.id) { setAberto(g); return; }
    setOcupado(true);
    try {
      setAberto({ ...g, previa: await chamarSubcentro(gesto, argumentos(g, clienteAtual.id, true)) });
    } finally { setOcupado(false); }
  };

  const conferir = async () => {
    if (!aberto || !clienteAtual?.id || ocupado) return;
    setOcupado(true);
    try {
      const previa = await chamarSubcentro(aberto.gesto, argumentos(aberto, clienteAtual.id, true));
      setAberto(a => (a ? { ...a, previa } : a));
    } finally { setOcupado(false); }
  };

  /* gravar só depois da prévia que passou; a recusa na hora de gravar volta ao lugar da prévia (nunca toast) */
  const confirmar = async () => {
    if (!aberto || !clienteAtual?.id || ocupado || aberto.previa?.ok !== true) return;
    const clienteId = clienteAtual.id;
    setOcupado(true);
    try {
      const r = await chamarSubcentro(aberto.gesto, argumentos(aberto, clienteId, false));
      if (r.ok === false) { setAberto(a => (a ? { ...a, previa: r } : a)); return; }
      toast.success(FEITO[aberto.gesto]);
      setAberto(null);
      aposGravar(clienteId);
    } finally { setOcupado(false); }
  };

  const comNome = aberto?.gesto === 'criar' || aberto?.gesto === 'renomear';
  const previaOk = aberto?.previa?.ok === true;

  return (
    <div className="w-full min-w-0 px-4 pb-1 pt-2 animate-fade-in" data-testid="tela-plano-contas">
      {/* o interruptor no tamanho da casa: o `h-4 w-7` de antes deixava a bolinha (20px fixos) sair do trilho e cobrir o rótulo */}
      <div className="mb-2 flex h-[26px] items-center gap-2.5">
        <h2 className="min-w-0 flex-1 truncate whitespace-nowrap text-[14px] font-semibold text-foreground">Plano de contas</h2>
        <div className="relative w-56 flex-none">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar conta…"
            className="h-[26px] pl-7 text-[11px]"
            data-testid="busca-plano"
          />
        </div>
        <div className="flex flex-none items-center gap-1.5">
          <Switch id="show-inativos" checked={showInativos} onCheckedChange={setShowInativos} data-testid="mostrar-inativos" />
          <Label htmlFor="show-inativos" className="cursor-pointer whitespace-nowrap text-[11px] text-muted-foreground">Mostrar inativos</Label>
        </div>
      </div>

      {/* o quadro na régua da casa: altura até o fim da janela, só o corpo rola (cabeçalho navy preso), a contagem na barra do pé */}
      <div ref={quadro.ref} className={QUADRO_REGUA} style={{ height: quadro.altura }} data-testid="quadro-plano">
        <div className="min-h-0 flex-1 overflow-auto rolagem-fina" data-testid="lista-do-plano">
          <table className="w-full table-fixed border-separate border-spacing-0" style={{ minWidth: minTabela }}>
            <colgroup>
              <col style={{ width: COL.macro }} />
              <col style={{ width: COL.grupo }} />
              <col style={{ width: COL.centro }} />
              <col />
              <col style={{ width: COL.dre }} />
              <col style={{ width: COL.tipo }} />
              {admin && <col style={{ width: COL.acoes }} />}
            </colgroup>
            <thead>
              <tr>
                {['Macro', 'Grupo', 'Centro', 'Subcentro', 'DRE', 'Tipo'].map(r => (
                  <th key={r} scope="col" className={cn(TH_REGUA, 'sticky top-0 z-[2] bg-primary text-left')}>{r}</th>
                ))}
                {admin && <th scope="col" className={cn(TH_REGUA, 'sticky top-0 z-[2] bg-primary')} aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && (
                <tr><td colSpan={colunas} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Carregando…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={colunas} className={cn(TD_REGUA, 'py-4 text-center text-muted-foreground')}>Nenhuma conta</td></tr>
              )}
              {groups.map(g => (
                <Fragment key={`grp-${g.label}`}>
                  <tr className="h-[19px]" data-testid="faixa-do-grupo">
                    <td colSpan={colunas} className={cn(TD_REGUA_TEXTO, FAIXA_DO_GRUPO, 'border-t border-[#cfd6df] font-semibold')}
                      title={`${g.label} · ${g.contas} ${g.contas === 1 ? 'conta' : 'contas'}`}>
                      {g.label} <span className="font-normal text-muted-foreground">· {g.contas} {g.contas === 1 ? 'conta' : 'contas'}</span>
                    </td>
                  </tr>
                  {g.linhas.map((l, k) => l.tipo === 'novo' ? (
                    <tr key={`novo-${l.molde.chave}`} className={cn('h-[19px]', k % 2 === 1 && ZEBRA)} data-testid="linha-novo-subcentro">
                      <td className={cn(TD_REGUA_TEXTO, 'border-t border-border/60')} title={l.molde.macro_custo}>{l.molde.macro_custo}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'border-t border-border/60')} title={l.molde.grupo_custo}>{l.molde.grupo_custo}</td>
                      <td className={cn(TD_REGUA_TEXTO, 'border-t border-border/60')} title={l.molde.centro_custo}>{l.molde.centro_custo}</td>
                      <td className={cn(TD_REGUA, 'border-t border-border/60 whitespace-nowrap')}>
                        <button type="button" className={cn(LINK, 'font-semibold')} disabled={ocupado} data-testid="novo-subcentro"
                          onClick={() => abrir('criar', l.molde, null)}>+ Novo subcentro do cliente</button>
                      </td>
                      <td className={cn(TD_REGUA, 'border-t border-border/60')} colSpan={3} />
                    </tr>
                  ) : (
                    <LinhaDaConta key={l.item.id} item={l.item} zebra={k % 2 === 1} admin={admin} ocupado={ocupado}
                      onAbrirDividendos={onAbrirDividendos} onGesto={abrir} />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className={cn(RODAPE_REGUA, 'flex h-[23px] items-center gap-2 whitespace-nowrap px-1.5')} data-testid="rodape-plano">
          <TextoReservado testid="contagem-plano" reserva="9.999 contas · 9.999 inativas"
            texto={`${filtered.length.toLocaleString('pt-BR')} ${filtered.length === 1 ? 'conta' : 'contas'}${showInativos && inativos > 0 ? ` · ${inativos.toLocaleString('pt-BR')} ${inativos === 1 ? 'inativa' : 'inativas'}` : ''}`} />
        </div>
      </div>

      <Dialog open={!!aberto} onOpenChange={o => { if (!o && !ocupado) setAberto(null); }}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm">{aberto ? TITULO_DO_GESTO[aberto.gesto] : ''}</DialogTitle>
          </DialogHeader>
          {aberto && (
            <div className="space-y-2 text-[11px]">
              <p className="text-muted-foreground" title={`${aberto.molde.macro_custo} › ${aberto.molde.grupo_custo} › ${aberto.molde.centro_custo}`}>
                {aberto.molde.grupo_custo} › {aberto.molde.centro_custo}
                {aberto.conta && aberto.gesto !== 'renomear' ? <> › <span className="font-medium text-foreground">{aberto.conta.subcentro}</span></> : null}
              </p>
              {comNome && (
                <div className="space-y-1">
                  <Label htmlFor="nome-subcentro" className="text-[11px]">Nome do subcentro</Label>
                  <Input id="nome-subcentro" autoFocus value={aberto.nome} maxLength={60} className="h-7 text-[11px]" data-testid="nome-subcentro"
                    onChange={e => { const nome = e.target.value; setAberto(a => (a ? { ...a, nome, previa: null } : a)); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void (previaOk ? confirmar() : conferir()); } }} />
                </div>
              )}
              {/* o lugar da prévia existe sempre (duas linhas): a frase do banco, ou a recusa em vermelho */}
              <p className={cn('min-h-[30px] leading-[15px]', aberto.previa?.ok === false ? 'text-destructive' : 'text-foreground')} data-testid="previa-subcentro">
                {aberto.previa ? (aberto.previa.ok === false
                  ? aberto.previa.frase
                  : fraseDaPrevia(aberto.gesto, aberto.previa, aberto.molde.centro_custo)) : ''}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={ocupado} onClick={() => setAberto(null)}>Cancelar</Button>
            {comNome && !previaOk ? (
              <Button size="sm" className="h-7 text-xs" disabled={ocupado || !aberto?.nome.trim()} onClick={() => void conferir()} data-testid="conferir-subcentro">Conferir</Button>
            ) : (
              <Button size="sm" className="h-7 text-xs" disabled={ocupado || !previaOk} onClick={() => void confirmar()} data-testid="confirmar-subcentro">Confirmar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinhaDaConta({ item: i, zebra, admin, ocupado, onAbrirDividendos, onGesto }: {
  item: PlanoContasItem; zebra: boolean; admin: boolean; ocupado: boolean; onAbrirDividendos?: () => void;
  onGesto: (gesto: GestoDoSubcentro, molde: MoldeDeSubcentro, conta: PlanoContasItem) => void;
}) {
  const dividendo = i.macro_custo === DIVIDENDO_MACRO;
  const doCliente = dividendo || !!i.cliente_id;
  const molde = moldeDaConta(i);
  const tipo = tipoLabel(i.tipo_operacao);
  const borda = 'border-t border-border/60';
  const sub = i.subcentro || '—';
  /* P172: o dividendo sem conta no plano não traz `compoe_dre`; a regra do banco por macro (`fn_compoe_dre_por_macro`) diz Dividendos = false
     (e as 39 contas de Dividendos do proto, 29/10, são todas fora do DRE): "não", nunca "—" */
  const dre = i.compoe_dre ?? (dividendo ? false : null);
  return (
    <tr className={cn('h-[19px] hover:bg-muted/40', zebra && ZEBRA, !i.ativo && 'text-muted-foreground')} data-testid="linha-conta"
      data-inativa={i.ativo ? undefined : ''}>
      <td className={cn(TD_REGUA_TEXTO, borda)} title={i.macro_custo}>{i.macro_custo}</td>
      <td className={cn(TD_REGUA_TEXTO, borda)} title={i.grupo_custo ?? undefined}>{i.grupo_custo || '—'}</td>
      <td className={cn(TD_REGUA_TEXTO, borda)} title={i.centro_custo}>{i.centro_custo}</td>
      <td className={cn(TD_REGUA, borda)}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate" title={sub}>{sub}</span>
          {doCliente && <span className={cn(SELO, 'bg-[#fdf0dc] text-[#b45309]')} data-testid="selo-do-cliente">do cliente</span>}
          {!i.ativo && <span className={cn(SELO, 'bg-muted text-muted-foreground')} data-testid="selo-inativa"
            title="Conta inativa: não é oferecida em lançamentos novos">inativa</span>}
        </span>
      </td>
      <td className={cn(TD_REGUA, borda, 'whitespace-nowrap text-muted-foreground')}>
        {dre == null ? '—' : dre ? 'sim' : 'não'}
      </td>
      <td className={cn(TD_REGUA, borda, 'whitespace-nowrap')}>
        <span className={cn(SELO, COR_DO_TIPO[tipo] ?? 'bg-muted text-muted-foreground', !i.ativo && 'opacity-60')}>{tipo}</span>
      </td>
      {admin && (
        <td className={cn(TD_REGUA, borda, 'whitespace-nowrap')} data-testid="acoes-da-conta">
          {molde && i.ativo && (
            <span className="flex items-center gap-1">
              <button type="button" className={cn(LINK, 'inline-flex items-center gap-0.5')} disabled={ocupado} data-testid="renomear-subcentro"
                onClick={() => onGesto('renomear', molde, i)}><Pencil className="h-2.5 w-2.5" />renomear</button>
              <span className="text-muted-foreground">·</span>
              <button type="button" className={LINK} disabled={ocupado} data-testid="inativar-subcentro"
                onClick={() => onGesto('inativar', molde, i)}>inativar</button>
            </span>
          )}
          {molde && !i.ativo && (
            <button type="button" className={LINK} disabled={ocupado} data-testid="reativar-subcentro"
              onClick={() => onGesto('reativar', molde, i)}>reativar</button>
          )}
          {dividendo && (onAbrirDividendos
            ? <button type="button" className={LINK} onClick={onAbrirDividendos} data-testid="ir-dividendos">no cadastro de Dividendos ↗</button>
            : <span className="text-[10px] text-muted-foreground">no cadastro de Dividendos</span>)}
        </td>
      )}
    </tr>
  );
}
