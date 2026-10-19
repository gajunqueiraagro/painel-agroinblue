/**
 * FORN-MESCLAR-01 / 02b — "Mesclar fornecedores" com comparação lado a lado (mock aprovado pelo Gabriel 19/10/2026 08:27).
 * À esquerda as sugestões (`fn_fornecedor_repetidos`: grupos ligados por documento OU nome; só sugerem) e as mesclagens recentes; à
 * direita uma coluna por cadastro (2 ou mais): quem fica (rádio no cabeçalho), os campos lado a lado, a linha amarela onde discordam
 * com o rádio do valor que fica, e o resultado ao vivo; a aba Uso mostra onde cada um é usado (`fn_fornecedor_uso`). Gravar é UMA
 * chamada (`fn_fornecedor_mesclar` com `p_valores`), simulada antes; o rodapé diz o que passa com os números do banco.
 * Tamanho fixo (~1120 x 420, limitado pela janela); só a tabela rola por dentro; recusas escritas no rodapé (nunca toast).
 * A regra é do banco; as linhas, o padrão do "fica" e as frases são de `mesclarFornecedores.ts` (puro). Nenhuma conta aqui.
 * FORN-MESCLAR-02c — a busca é VISÍVEL: sem colunas, um campo grande no centro (com foco ao abrir); com colunas, um campo com lupa
 * na barra (não um seletor). Os dois são o mesmo `BuscaDeCadastro`, sobre `buscarCadastros` (sem acento, sem caixa).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { Search } from 'lucide-react';
import { MENU_ITEM, MENU_PALETA, MENU_REALCE_HOVER, MENU_SECUNDARIO, MENU_VAZIO } from '@/components/ui/menuPadrao';
import { supabase } from '@/integrations/supabase/client';
import { useFornecedoresDoCliente, notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { ehRateio, formatarDocumento, rotulosDosFornecedores, sufixoDoRotulo } from '@/lib/fornecedores/fornecedorTexto';
import { lerTodasAsPaginas } from '@/v2/lib/importLanc/lerTodasAsPaginas';
import {
  MOTIVO_DESFAZER_SEM_MOTIVO, PLACEHOLDER_BUSCA_CADASTRO, TEXTO_DO_VAZIO_DA_MESCLAGEM, bloqueioDoRateio, buscarCadastros, ficaPadrao, fraseDoGrupo, fraseDoQuePassa, fraseDoResultado, lerGruposRepetidos,
  lerMesclagens, lerPreviaDaMesclagem, lerUso, linhasDaComparacao, resultadoAoVivo, valoresParaGravar,
  type CadastroComparado, type FornecedorDaMesclagem, type GrupoRepetido, type MesclagemFeita, type PreviaDaMesclagem, type UsoDoCadastro,
} from '@/lib/fornecedores/mesclarFornecedores';

/* UI-SEM-CORTE-01 — nenhum texto com reticências: o que não cabe quebra a linha (a linha cresce), nunca "…". */
const TH = 'h-[22px] px-1.5 py-[3px] text-left align-middle text-[10.5px] leading-[16px] font-semibold text-primary-foreground bg-primary break-words';
const TD = 'h-[22px] px-1.5 py-[3px] align-middle text-[10.5px] leading-[16px] break-words';
/* data, hora e número: nunca quebram nem cortam — a coluna tem a largura do pior caso medido */
const TD_NUM = 'h-[22px] px-1.5 py-[3px] align-middle text-[10.5px] leading-[16px] whitespace-nowrap tabular-nums';
const DATA = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const HORA = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const doc = (d: string | null) => (d ? formatarDocumento(d) : '—');

/** FORN-MESCLAR-02c — o campo de busca de cadastros (grande no vazio, compacto na barra). A lista abre por cima (não muda altura de
 *  nada), no padrão de menu da casa: razão social · fantasia · CNPJ · situação · Pec.3M. Clicar (ou Enter no primeiro) acrescenta a
 *  coluna; Esc limpa o texto (e só fecha o diálogo com o campo vazio — ver `onEscapeKeyDown`). */
function BuscaDeCadastro({ candidatos, colunas, aoEscolher, grande }: {
  candidatos: readonly FornecedorDaMesclagem[]; colunas: readonly string[]; aoEscolher: (id: string) => void; grande: boolean;
}) {
  const [texto, setTexto] = useState('');
  const { itens, total } = useMemo(() => buscarCadastros(candidatos, texto, colunas), [candidatos, texto, colunas]);
  const escolher = (id: string) => { aoEscolher(id); setTexto(''); };
  return (
    <div className="relative w-full">
      <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${grande ? 'left-2.5 h-4 w-4' : 'left-1.5 h-3 w-3'}`} aria-hidden />
      <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={PLACEHOLDER_BUSCA_CADASTRO} aria-label={PLACEHOLDER_BUSCA_CADASTRO}
        data-busca-cadastro="sim" data-testid={grande ? 'busca-cadastro-vazio' : 'busca-cadastro'}
        className={grande ? 'h-[32px] pl-8 text-[12px]' : 'h-[22px] pl-6 text-[10.5px]'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && itens[0]) { e.preventDefault(); escolher(itens[0].id); }
          if (e.key === 'Escape' && texto) { e.preventDefault(); setTexto(''); }
        }} />
      {texto.trim() !== '' && (
        <div className={`absolute top-full z-20 mt-0.5 overflow-hidden rounded border shadow-md ${MENU_PALETA} ${grande ? 'left-0 right-0' : 'right-0 w-[440px]'}`}
          data-testid="resultado-da-busca-cadastro">
          {itens.map((f) => (
            <button key={f.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(f.id)} data-testid="cadastro-achado"
              className={`flex w-full items-start gap-1.5 text-left ${MENU_ITEM} ${MENU_REALCE_HOVER}`}
              title={[f.nome, f.nomeFantasia, f.cpfCnpj ? formatarDocumento(f.cpfCnpj) : 'sem CNPJ/CPF', f.ativo ? 'ativo' : 'inativo'].filter(Boolean).join(' · ')}>
              <span className="min-w-0 flex-1 break-words">{f.nome}</span>
              {f.nomeFantasia && <span className={`min-w-0 max-w-[30%] break-words ${MENU_SECUNDARIO}`}>{f.nomeFantasia}</span>}
              <span className={`shrink-0 tabular-nums ${MENU_SECUNDARIO}`}>{f.cpfCnpj ? formatarDocumento(f.cpfCnpj) : 'sem CNPJ'}</span>
              <span className={`shrink-0 ${f.ativo ? MENU_SECUNDARIO : 'text-amber-300'}`}>{f.ativo ? 'ativo' : 'inativo'}</span>
              {ehRateio(f.nome) && <span className="shrink-0 rounded bg-zinc-500 px-1 text-[9px]">Pec.3M</span>}
            </button>
          ))}
          <div className={`px-2 py-[3px] ${MENU_VAZIO}`}>
            {total === 0 ? `Nenhum cadastro com “${texto.trim()}”.` : total > itens.length ? `Mostrando ${itens.length} de ${total} — digite mais para refinar.` : `${total} ${total === 1 ? 'cadastro' : 'cadastros'}`}
          </div>
        </div>
      )}
    </div>
  );
}

const LINHAS_DO_USO: ReadonlyArray<{ rotulo: string; valor: (u: UsoDoCadastro) => string }> = [
  { rotulo: 'Lançamentos', valor: (u) => String(u.lancamentos) },
  { rotulo: 'Compras parceladas', valor: (u) => String(u.comprasParceladas) },
  { rotulo: 'Recorrências', valor: (u) => String(u.recorrencias) },
  { rotulo: 'Documentos', valor: (u) => String(u.documentos) },
  { rotulo: 'Financiamentos', valor: (u) => String(u.financiamentos) },
  { rotulo: 'OC', valor: (u) => String(u.operacoes) },
  { rotulo: 'Último uso', valor: (u) => (u.ultimoUso ? new Date(`${u.ultimoUso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—') },
];

/** FORN-CADASTRO-02 — `inicial`: o cadastro abre esta ferramenta já com o par (o que fica e o duplicado) escolhido; nada é gravado
 *  sem a prévia e a confirmação de sempre. */
export function MesclarFornecedoresDialog({ aberto, aoFechar, clienteId, inicial }: {
  aberto: boolean; aoFechar: () => void; clienteId: string; inicial?: { manter: string; absorver: string[] };
}) {
  const [vista, setVista] = useState<'comparar' | 'recentes'>('comparar');
  const [aba, setAba] = useState<'comparar' | 'uso'>('comparar');
  /* as colunas da comparação (a ordem da tela) e quem fica; `fica` vazio = o padrão (`ficaPadrao`) assim que os dados chegam */
  const [colunas, setColunas] = useState<string[]>([]);
  const [fica, setFica] = useState('');
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [grupos, setGrupos] = useState<GrupoRepetido[]>([]);
  const [cadastros, setCadastros] = useState<Map<string, CadastroComparado>>(new Map());
  const [uso, setUso] = useState<Map<string, UsoDoCadastro>>(new Map());
  const [previa, setPrevia] = useState<PreviaDaMesclagem | null>(null);
  const [lendoPrevia, setLendoPrevia] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null);
  const [recentes, setRecentes] = useState<MesclagemFeita[]>([]);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  /* FORN-ABSORVER-INATIVOS-01 — os INATIVOS não mesclados do cliente: o leitor só traz ativos */
  const [inativos, setInativos] = useState<FornecedorDaMesclagem[]>([]);
  const lidos = useFornecedoresDoCliente(clienteId);

  const recarregar = useCallback(async () => {
    const [{ data: g }, { data: l }] = await Promise.all([
      (supabase as any).rpc('fn_fornecedor_repetidos', { p_cliente: clienteId }),
      (supabase as any).from('fornecedor_mesclagem_log').select('id, mantido_id, absorvidos, criado_em, resumo, antes, desfeito_em, desfeito_motivo')
        .eq('cliente_id', clienteId).order('criado_em', { ascending: false }).limit(50),
    ]);
    setGrupos(lerGruposRepetidos(g) ?? []);
    setRecentes(lerMesclagens(l) ?? []);
    try {
      const linhas = await lerTodasAsPaginas<FornecedorDaMesclagem>(async (de, ate, contar) => {
        const { data, error, count } = await supabase.from('financeiro_fornecedores')
          .select('id, nome, nome_fantasia, cpf_cnpj, ativo', { count: contar ? 'exact' : undefined })
          .eq('cliente_id', clienteId).eq('ativo', false).is('fundido_em_id', null)
          .order('nome').order('id').range(de, ate);
        if (error) throw new Error(error.message);
        return { data: (data ?? []).map((f) => ({ id: f.id, nome: f.nome, nomeFantasia: f.nome_fantasia, cpfCnpj: f.cpf_cnpj, ativo: false })), count: typeof count === 'number' ? count : null };
      });
      setInativos(linhas);
    } catch { setInativos([]); }
  }, [clienteId]);
  useEffect(() => { if (aberto) void recarregar(); }, [aberto, recarregar]);

  /* o par pedido pelo cadastro entra UMA vez por abertura: depois de mesclar ele não volta sozinho (FORN-MESCLAR-DEPOIS-01) */
  const inicialAplicado = useRef(false);
  useEffect(() => {
    if (!aberto) { inicialAplicado.current = false; return; }
    if (inicial && !inicialAplicado.current) {
      inicialAplicado.current = true;
      setColunas([inicial.manter, ...inicial.absorver.filter((x) => x !== inicial.manter)]); setFica(inicial.manter); setEscolhas({});
    }
  }, [aberto, inicial]);

  /* a linha inteira de cada coluna, o subcentro padrão dela e o uso — lidos uma vez por cadastro */
  const chaveDasColunas = colunas.join(',');
  useEffect(() => {
    const faltam = colunas.filter((id) => !cadastros.has(id));
    if (faltam.length === 0) return;
    let vivo = true;
    void (async () => {
      const { data } = await (supabase as any).from('financeiro_fornecedores').select('*').in('id', faltam);
      const linhas: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];
      const planos = [...new Set(linhas.map((l) => l.plano_padrao_id).filter((x): x is string => typeof x === 'string'))];
      const { data: pl } = planos.length
        ? await (supabase as any).from('financeiro_plano_contas').select('id, subcentro, ativo, cliente_id').in('id', planos)
        : { data: [] };
      const porPlano = new Map<string, { subcentro: string; ok: boolean }>();
      for (const p of Array.isArray(pl) ? pl : []) porPlano.set(p.id, { subcentro: p.subcentro ?? '—', ok: p.ativo === true && (p.cliente_id === null || p.cliente_id === clienteId) });
      const usos = await Promise.all(faltam.map(async (id) => [id, lerUso((await (supabase as any).rpc('fn_fornecedor_uso', { p_fornecedor: id })).data)] as const));
      if (!vivo) return;
      setCadastros((m) => {
        const n = new Map(m);
        for (const l of linhas) {
          const linha: Record<string, string | null> = {};
          for (const [k, x] of Object.entries(l)) linha[k] = x === null || x === undefined ? null : typeof x === 'string' ? x : String(x);
          const plano = typeof l.plano_padrao_id === 'string' ? porPlano.get(l.plano_padrao_id) : undefined;
          n.set(String(l.id), { id: String(l.id), nome: String(l.nome ?? ''), ativo: l.ativo !== false, linha,
            planoNome: plano ? plano.subcentro : typeof l.plano_padrao_id === 'string' ? '(subcentro removido)' : null,
            planoNoPlano: typeof l.plano_padrao_id === 'string' ? plano?.ok ?? false : null });
        }
        return n;
      });
      setUso((m) => { const n = new Map(m); for (const [id, u] of usos) if (u) n.set(id, u); return n; });
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relê só quando as colunas mudam
  }, [chaveDasColunas, clienteId]);

  const comparados = useMemo(() => colunas.map((id) => cadastros.get(id)).filter((c): c is CadastroComparado => !!c), [colunas, cadastros]);
  const prontos = comparados.length === colunas.length && colunas.length > 0;
  /* quem fica: o escolhido; sem escolha, o padrão (com documento > mais uso > ativo) quando tudo chegou */
  const ficaEfetivo = fica && colunas.includes(fica) ? fica : prontos ? ficaPadrao(comparados, uso) ?? '' : '';
  const linhas = useMemo(() => (ficaEfetivo ? linhasDaComparacao(comparados, ficaEfetivo, escolhas) : []), [comparados, ficaEfetivo, escolhas]);
  const valores = useMemo(() => valoresParaGravar(linhas), [linhas]);
  const absorvidos = colunas.filter((id) => id !== ficaEfetivo);
  const bloqueio = ficaEfetivo ? bloqueioDoRateio(comparados, ficaEfetivo, ehRateio) : null;

  const chaveDaPrevia = ficaEfetivo && absorvidos.length && !bloqueio ? `${ficaEfetivo}|${absorvidos.join(',')}|${JSON.stringify(valores)}` : '';
  useEffect(() => {
    setConfirmando(false);
    if (!chaveDaPrevia) { setPrevia(null); return; }
    let vivo = true; setLendoPrevia(true);
    const t = setTimeout(() => {
      const [m, abs, val] = chaveDaPrevia.split('|');
      void (supabase as any).rpc('fn_fornecedor_mesclar', { p_manter: m, p_absorver: abs.split(','), p_simular: true, p_valores: JSON.parse(val) })
        .then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
          if (!vivo) return;
          setLendoPrevia(false);
          if (error) { setPrevia(null); setRecado({ tom: 'erro', texto: error.message ?? 'Não foi possível calcular a prévia.' }); return; }
          setPrevia(lerPreviaDaMesclagem(data));
        });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [chaveDaPrevia]);

  const abrirGrupo = (g: GrupoRepetido) => {
    setColunas(g.fornecedores.map((f) => f.id)); setFica(''); setEscolhas({}); setRecado(null); setVista('comparar');
  };
  const tirarColuna = (id: string) => { setColunas((c) => c.filter((x) => x !== id)); if (fica === id) setFica(''); setEscolhas({}); };

  const gravar = async () => {
    if (!previa || previa.recusa || !chaveDaPrevia) return;
    setGravando(true); setRecado(null);
    const { data, error } = await (supabase as any).rpc('fn_fornecedor_mesclar', { p_manter: ficaEfetivo, p_absorver: absorvidos, p_simular: false, p_valores: valores });
    setGravando(false); setConfirmando(false);
    if (error) { setRecado({ tom: 'erro', texto: error.message ?? 'Não foi possível mesclar.' }); return; }
    const feito = lerPreviaDaMesclagem(data);
    /* FORN-MESCLAR-DEPOIS-01 — volta ao estado inicial (nenhuma coluna, Mesclar apagado); a frase de sucesso fica no rodapé */
    setColunas([]); setFica(''); setEscolhas({}); setPrevia(null); setCadastros(new Map()); setUso(new Map());
    setRecado({ tom: 'ok', texto: feito ? fraseDoResultado(feito) : 'Mesclado.' });
    notificarFornecedoresMudaram(clienteId); notificarLancamentosMudaram(clienteId);
    void recarregar();
  };

  const desfazer = async (id: string) => {
    if (!motivo.trim()) { setRecado({ tom: 'erro', texto: MOTIVO_DESFAZER_SEM_MOTIVO }); return; }
    setGravando(true); setRecado(null);
    const { data, error } = await (supabase as any).rpc('fn_fornecedor_mesclagem_desfazer', { p_mesclagem_id: id, p_motivo: motivo.trim(), p_simular: false });
    setGravando(false);
    if (error) { setRecado({ tom: 'erro', texto: error.message ?? 'Não foi possível desfazer.' }); return; }
    const voltaram = typeof data === 'object' && data !== null && 'voltaram' in data ? Number(data.voltaram) : 0;
    const ficaram = typeof data === 'object' && data !== null && 'ficaram' in data ? Number(data.ficaram) : 0;
    setRecado({ tom: 'ok', texto: `Mesclagem desfeita: ${voltaram} referências voltaram${ficaram ? ` · ${ficaram} mudaram depois e ficaram` : ''}.` });
    setDesfazendo(null); setMotivo(''); setCadastros(new Map()); setUso(new Map());
    notificarFornecedoresMudaram(clienteId); notificarLancamentosMudaram(clienteId);
    void recarregar();
  };

  /* quem pode entrar como coluna: os ativos do leitor, os inativos não mesclados e os das sugestões. O "Pec.3M-" do outro lado
     entra (a pessoa pode acrescentar à mão) e a tela bloqueia com o motivo escrito; o banco também recusa. */
  const candidatos = useMemo(() => {
    const m = new Map<string, FornecedorDaMesclagem>();
    for (const f of lidos.fornecedores) m.set(f.id, { id: f.id, nome: f.nome, nomeFantasia: f.nome_fantasia ?? null, cpfCnpj: f.cpf_cnpj, ativo: f.ativo });
    for (const f of inativos) if (!m.has(f.id)) m.set(f.id, f);
    for (const g of grupos) for (const f of g.fornecedores) if (!m.has(f.id)) m.set(f.id, f);
    return m;
  }, [lidos.fornecedores, inativos, grupos]);
  const listaDeCandidatos = useMemo(() => [...candidatos.values()], [candidatos]);
  const acrescentar = (id: string) => { setColunas((c) => (c.includes(id) ? c : [...c, id])); setEscolhas({}); setRecado(null); };
  /* o nome exibido (FORN-NOME-EXIBIDO-01): o final do documento entre os parecidos DESTA comparação, e a marca de inativo */
  const rotulos = useMemo(() => rotulosDosFornecedores(comparados.map((c) => ({ id: c.id, nome: c.nome, cpf_cnpj: c.linha.cpf_cnpj, ativo: c.ativo }))), [comparados]);
  const nomeDe = (id: string) => candidatos.get(id)?.nome ?? cadastros.get(id)?.nome ?? id.slice(0, 8);

  const motivoDoBotao = colunas.length < 2 ? 'Escolha uma sugestão ou busque ao menos dois cadastros.'
    : !prontos ? 'Lendo os cadastros…' : bloqueio ? bloqueio : lendoPrevia ? 'Calculando a prévia…' : previa?.recusa ? previa.recusa.frase : null;
  const textoDoRodape = recado?.texto
    ?? (vista === 'comparar' ? motivoDoBotao ?? (previa ? (confirmando ? 'Confere? Isto move as referências e inativa os outros cadastros (pode ser desfeito). ' : '') + fraseDoQuePassa(previa, absorvidos.length) : '') : '');
  const rodapeEmErro = recado?.tom === 'erro' || (!recado && (!!bloqueio || !!previa?.recusa));

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(420px,calc(100vh-16px))] w-[min(1120px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-testid="mesclar-fornecedores"
        onEscapeKeyDown={(e) => { const el = document.activeElement; if (el instanceof HTMLInputElement && el.dataset.buscaCadastro && el.value) e.preventDefault(); }}>
        <div className="flex h-[34px] shrink-0 items-center gap-3 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Mesclar fornecedores</DialogTitle>
          <DialogDescription className="sr-only">Comparar cadastros repetidos e juntar num só</DialogDescription>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] max-[759px]:grid-cols-1">
          <aside className="flex min-h-0 flex-col border-r bg-muted/20 max-[759px]:hidden" data-testid="coluna-sugestoes">
            <div className="h-[22px] shrink-0 px-2 pt-1 text-[10.5px] font-semibold text-muted-foreground">Sugestões</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1" data-testid="sugestoes-de-repetidos">
              {grupos.length === 0 && <div className="px-1 text-[10.5px] text-muted-foreground">Nenhum cadastro repetido.</div>}
              {grupos.map((g) => (
                <button key={g.chave} type="button" onClick={() => abrirGrupo(g)} data-testid="sugestao-de-repetido"
                  className="block min-h-[34px] w-full rounded px-1 py-[2px] text-left hover:bg-muted" title={g.fornecedores.map((f) => f.nome).join(' · ')}>
                  <span className="block break-words text-[10.5px] font-semibold leading-[14px]">{g.fornecedores[0].nome}</span>
                  <span className="block text-[10px] leading-[14px] text-muted-foreground">{fraseDoGrupo(g)}</span>
                </button>
              ))}
            </div>
            <button type="button" className={`h-[26px] shrink-0 border-t px-2 text-left text-[10.5px] ${vista === 'recentes' ? 'font-semibold text-primary' : 'text-primary underline'}`}
              onClick={() => { setVista((x) => (x === 'recentes' ? 'comparar' : 'recentes')); setRecado(null); }} data-testid="abrir-recentes">
              Mesclagens recentes ({recentes.length})
            </button>
          </aside>

          {vista === 'comparar' ? (
            <div className="flex min-h-0 min-w-0 flex-col gap-1 px-3 pt-1.5">
              <div className="flex h-[24px] shrink-0 items-center gap-2">
                <Segmentado altura={22} valor={aba} onEscolher={setAba} opcoes={[{ valor: 'comparar', rotulo: 'Comparar cadastros' }, { valor: 'uso', rotulo: 'Uso' }]} />
                <span className="min-w-0 flex-1 break-words text-[10px] leading-[12px] text-muted-foreground">amarelo: os cadastros discordam — marque o valor que fica</span>
                <div className="w-[260px] shrink-0" data-testid="lugar-da-busca">
                  {colunas.length > 0 && <BuscaDeCadastro candidatos={listaDeCandidatos} colunas={colunas} aoEscolher={acrescentar} grande={false} />}
                </div>
              </div>

              <div className={`min-h-0 flex-1 rounded border ${colunas.length === 0 ? 'overflow-visible' : 'overflow-auto'}`} data-testid="tabela-comparacao">
                {colunas.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 pt-10" data-testid="vazio-da-mesclagem">
                    <div className="w-full max-w-[560px]"><BuscaDeCadastro candidatos={listaDeCandidatos} colunas={colunas} aoEscolher={acrescentar} grande /></div>
                    <p className="text-[10.5px] text-muted-foreground">{TEXTO_DO_VAZIO_DA_MESCLAGEM}</p>
                  </div>
                ) : (
                  <table className="w-full table-fixed border-collapse">
                    <colgroup><col style={{ width: 118 }} />{colunas.map((id) => <col key={id} />)}</colgroup>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className={TH}>{aba === 'uso' ? 'Uso' : 'Campo'}</th>
                        {colunas.map((id) => { const r = rotulos.get(id); const suf = sufixoDoRotulo(r); return (
                          <th key={id} className={`${TH} ${id === ficaEfetivo ? 'bg-[#1e4a7a]' : ''}`} title={r?.title ?? nomeDe(id)} data-testid={`coluna-${id}`}>
                            <span className="flex items-center gap-1">
                              <input type="radio" name="fica" className="h-3 w-3 shrink-0" checked={id === ficaEfetivo} onChange={() => { setFica(id); setEscolhas({}); }}
                                aria-label={`fica: ${nomeDe(id)}`} data-testid={`fica-${id}`} />
                              <span className="min-w-0 break-words">{nomeDe(id)}</span>
                              {suf && <span className="shrink-0 text-[10px] font-normal opacity-80">{suf}</span>}
                              {id === ficaEfetivo && <span className="shrink-0 text-[10px] font-normal">· fica</span>}
                              <button type="button" className="ml-auto shrink-0 text-[10.5px] leading-none opacity-80 hover:opacity-100" title="tirar esta coluna"
                                onClick={() => tirarColuna(id)} data-testid={`tirar-${id}`}>✕</button>
                            </span>
                          </th>
                        ); })}
                      </tr>
                    </thead>
                    <tbody>
                      {aba === 'comparar' ? linhas.map((l) => (
                        <tr key={l.chave} className={`border-b ${l.divergente ? 'bg-[#fef9c3]' : ''}`} data-testid={`linha-${l.chave}`} data-divergente={l.divergente ? 'sim' : 'nao'}>
                          <td className={`${TD} text-muted-foreground`}>{l.rotulo}</td>
                          {l.celulas.map((c) => (
                            <td key={c.id} className={`${TD} ${c.id === ficaEfetivo && !l.divergente ? 'bg-[#e0ecf8]' : ''}`} title={c.title ?? undefined}>
                              <span className="flex min-w-0 items-center gap-1">
                                {l.divergente && l.campo && c.texto !== null && (
                                  <input type="radio" name={`valor-${l.chave}`} className="h-3 w-3 shrink-0" disabled={!c.escolhivel} checked={l.escolhido === c.id}
                                    onChange={() => setEscolhas((e) => ({ ...e, [l.campo as string]: c.id }))} data-testid={`valor-${l.chave}-${c.id}`}
                                    aria-label={`${l.rotulo}: ${c.texto}`} />
                                )}
                                <span className={`min-w-0 break-words ${c.texto === null ? 'text-muted-foreground' : ''} ${!c.escolhivel && l.campo && c.texto !== null ? 'text-muted-foreground' : ''}`}>{c.texto ?? '—'}</span>
                              </span>
                            </td>
                          ))}
                        </tr>
                      )) : LINHAS_DO_USO.map((u) => (
                        <tr key={u.rotulo} className="border-b">
                          <td className={`${TD} text-muted-foreground`}>{u.rotulo}</td>
                          {colunas.map((id) => { const x = uso.get(id); return (
                            <td key={id} className={`${TD} tabular-nums ${id === ficaEfetivo ? 'bg-[#e0ecf8] font-semibold' : ''}`}>{x ? u.valor(x) : '…'}</td>
                          ); })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="min-h-[22px] shrink-0 break-words py-[3px] text-[10.5px] leading-[16px]" data-testid="resultado-ao-vivo">
                {linhas.length ? resultadoAoVivo(linhas) : ''}
              </div>
            </div>
          ) : (
            /* UI-SEM-CORTE-01 — o container que rola começa NO cabeçalho (sem padding acima dele): nada aparece por cima do cabeçalho preso */
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
            <div className="min-h-0 flex-1 overflow-y-auto" data-testid="mesclagens-recentes">
              <table className="w-full table-fixed border-collapse">
                {/* larguras pelo conteúdo medido na bancada a 10,5px: "19/10/2026" 61 · "14:26" 30 · "Referências" 63 · "mesclada" 47 (+ 12 de padding) */}
                <colgroup><col style={{ width: 78 }} /><col style={{ width: 46 }} /><col /><col /><col style={{ width: 78 }} /><col style={{ width: 70 }} /><col style={{ width: 66 }} /></colgroup>
                <thead className="sticky top-0 z-10"><tr><th className={TH}>Data</th><th className={TH}>Hora</th><th className={TH}>Fica</th><th className={TH}>Absorvidos</th>
                  <th className={`${TH} text-right`}>Referências</th><th className={TH}>Situação</th><th className={TH} /></tr></thead>
                <tbody>
                  {recentes.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className={TD_NUM}>{DATA(l.criadoEm)}</td>
                      <td className={TD_NUM}>{HORA(l.criadoEm)}</td>
                      <td className={TD}>{nomeDe(l.mantidoId)}</td>
                      <td className={TD}>{l.absorvidosNomes.join(' · ') || `${l.absorvidos.length} cadastros`}</td>
                      <td className={`${TD_NUM} text-right`}>{l.total}</td>
                      <td className={TD} title={l.desfeitoEm ? `desfeita em ${DATA(l.desfeitoEm)} ${HORA(l.desfeitoEm)}${l.desfeitoMotivo ? ` · motivo: ${l.desfeitoMotivo}` : ''}` : undefined}>{l.desfeitoEm ? 'desfeita' : 'mesclada'}</td>
                      <td className="h-[22px] p-0 text-center text-[10.5px] leading-none">{!l.desfeitoEm && (
                        <button type="button" className="text-[10.5px] text-primary underline" data-testid="desfazer-mesclagem" onClick={() => { setDesfazendo(l.id); setMotivo(''); setRecado(null); }}>Desfazer</button>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recentes.length === 0 && <div className="pt-2 text-[10.5px] text-muted-foreground">Nenhuma mesclagem.</div>}
            </div>
            </div>
          )}
        </div>

        <div className="flex min-h-[38px] shrink-0 items-center gap-2 border-t px-3 py-1">
          {/* FORN-MESCLAR-02a / UI-SEM-CORTE-01 — a recusa do banco aparece INTEIRA, quebrando a linha (o rodapé cresce), nunca com "…" */}
          <span className={`min-w-0 flex-1 break-words text-[10.5px] leading-[14px] ${rodapeEmErro ? 'text-destructive' : recado ? 'text-[#15803d]' : 'text-muted-foreground'}`}
            title={textoDoRodape || undefined} data-testid="recado-da-mesclagem">
            {textoDoRodape}
          </span>
          {vista === 'recentes' && desfazendo && (
            <>
              <Input className="h-[24px] w-[220px] text-[10.5px]" placeholder="motivo para desfazer *" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-desfazer" />
              <Button size="sm" className="h-[24px] text-[10.5px]" disabled={gravando} onClick={() => void desfazer(desfazendo)} data-testid="confirmar-desfazer">Desfazer mesclagem</Button>
            </>
          )}
          <Button size="sm" variant="outline" className="h-[24px] text-[10.5px]" onClick={aoFechar}>Fechar</Button>
          {vista === 'comparar' && (
            confirmando
              ? <Button size="sm" className="h-[24px] bg-cta text-[10.5px] font-semibold text-cta-foreground hover:bg-cta-hover" disabled={gravando} onClick={() => void gravar()} data-testid="confirmar-mesclagem">Confirmar mesclagem</Button>
              : <Button size="sm" className="h-[24px] bg-cta text-[10.5px] font-semibold text-cta-foreground hover:bg-cta-hover" disabled={!!motivoDoBotao || gravando || !previa} onClick={() => setConfirmando(true)} data-testid="mesclar">
                  Mesclar {colunas.length} cadastros
                </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
