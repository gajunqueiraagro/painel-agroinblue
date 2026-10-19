/**
 * FORN-MESCLAR-01 — "Mesclar fornecedores": escolher o que fica e os que são absorvidos, ver ANTES o que muda (a simulação do
 * banco, por módulo, com o CPF/CNPJ de cada um) e gravar numa transação; "Mesclagens recentes" desfaz. Tamanho fixo, um
 * scrollport por lista, recusas escritas no lugar reservado (nunca toast). A regra é do banco (`fn_fornecedor_mesclar`); a tela
 * só lê e escreve o que ele devolve. Sugestões de repetidos (`fn_fornecedor_repetidos`) só SUGEREM: nada é escolhido sozinho.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { FavorecidoSelect } from '@/components/shared/FavorecidoSelect';
import { supabase } from '@/integrations/supabase/client';
import { useFornecedoresDoCliente, notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { formatarDocumento } from '@/lib/fornecedores/fornecedorTexto';
import {
  MOTIVO_DESFAZER_SEM_MOTIVO, MOTIVO_SEM_PREVIA, MODULOS_DA_MESCLAGEM, fraseDoGrupo, fraseDoResultado, lerGruposRepetidos, lerMesclagens,
  lerPreviaDaMesclagem, type FornecedorDaMesclagem, type GrupoRepetido, type MesclagemFeita, type PreviaDaMesclagem,
} from '@/lib/fornecedores/mesclarFornecedores';

const TH = 'h-[18px] px-1.5 text-left text-[9.5px] font-semibold uppercase tracking-wide text-primary-foreground bg-primary';
const TD = 'h-[18px] px-1.5 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis';
const doc = (d: string | null) => (d ? formatarDocumento(d) : '—');

/** FORN-CADASTRO-02 — `inicial`: o cadastro abre esta ferramenta já com o par (o que fica e o duplicado) escolhido; nada é gravado
 *  sem a prévia e a confirmação de sempre. */
export function MesclarFornecedoresDialog({ aberto, aoFechar, clienteId, inicial }: {
  aberto: boolean; aoFechar: () => void; clienteId: string; inicial?: { manter: string; absorver: string[] };
}) {
  const [aba, setAba] = useState<'mesclar' | 'recentes'>('mesclar');
  const [manter, setManter] = useState('');
  const [absorver, setAbsorver] = useState<string[]>([]);
  const [grupos, setGrupos] = useState<GrupoRepetido[]>([]);
  const [previa, setPrevia] = useState<PreviaDaMesclagem | null>(null);
  const [lendoPrevia, setLendoPrevia] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'erro' | 'ok'; texto: string } | null>(null);
  const [recentes, setRecentes] = useState<MesclagemFeita[]>([]);
  const [desfazendo, setDesfazendo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const lidos = useFornecedoresDoCliente(clienteId);

  const recarregar = useCallback(async () => {
    const [{ data: g }, { data: l }] = await Promise.all([
      (supabase as any).rpc('fn_fornecedor_repetidos', { p_cliente: clienteId }),
      (supabase as any).from('fornecedor_mesclagem_log').select('id, mantido_id, absorvidos, criado_em, resumo, antes, desfeito_em, desfeito_motivo')
        .eq('cliente_id', clienteId).order('criado_em', { ascending: false }).limit(50),
    ]);
    setGrupos(lerGruposRepetidos(g) ?? []);
    setRecentes(lerMesclagens(l) ?? []);
  }, [clienteId]);
  useEffect(() => { if (aberto) void recarregar(); }, [aberto, recarregar]);
  useEffect(() => { if (aberto && inicial) { setManter(inicial.manter); setAbsorver(inicial.absorver); } }, [aberto, inicial]);

  /* quem pode ser absorvido: os ativos do leitor e os cadastros das sugestões (inativos inclusive), fora o que fica */
  const candidatos = useMemo(() => {
    const m = new Map<string, FornecedorDaMesclagem>();
    for (const f of lidos.fornecedores) m.set(f.id, { id: f.id, nome: f.nome, cpfCnpj: f.cpf_cnpj, ativo: f.ativo });
    for (const g of grupos) for (const f of g.fornecedores) if (!m.has(f.id)) m.set(f.id, f);
    return m;
  }, [lidos.fornecedores, grupos]);

  const chaveDaPrevia = manter && absorver.length ? `${manter}|${[...absorver].sort().join(',')}` : '';
  useEffect(() => {
    setConfirmando(false);
    if (!chaveDaPrevia) { setPrevia(null); return; }
    let vivo = true; setLendoPrevia(true);
    const t = setTimeout(() => {
      const [m, abs] = chaveDaPrevia.split('|');
      void (supabase as any).rpc('fn_fornecedor_mesclar', { p_manter: m, p_absorver: abs.split(','), p_simular: true })
        .then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
          if (!vivo) return;
          setLendoPrevia(false);
          if (error) { setPrevia(null); setRecado({ tom: 'erro', texto: error.message ?? 'Não foi possível calcular a prévia.' }); return; }
          setPrevia(lerPreviaDaMesclagem(data));
        });
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [chaveDaPrevia]);

  const escolherGrupo = (g: GrupoRepetido) => {
    const fica = g.fornecedores.find((f) => f.ativo) ?? g.fornecedores[0];
    setManter(fica.id); setAbsorver(g.fornecedores.filter((f) => f.id !== fica.id).map((f) => f.id)); setRecado(null);
  };

  const gravar = async () => {
    if (!previa || previa.recusa || !chaveDaPrevia) return;
    setGravando(true); setRecado(null);
    const { data, error } = await (supabase as any).rpc('fn_fornecedor_mesclar', { p_manter: manter, p_absorver: absorver, p_simular: false });
    setGravando(false); setConfirmando(false);
    if (error) { setRecado({ tom: 'erro', texto: error.message ?? 'Não foi possível mesclar.' }); return; }
    const feito = lerPreviaDaMesclagem(data);
    setRecado({ tom: 'ok', texto: feito ? fraseDoResultado(feito) : 'Mesclado.' });
    setAbsorver([]); setPrevia(null);
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
    setDesfazendo(null); setMotivo('');
    notificarFornecedoresMudaram(clienteId); notificarLancamentosMudaram(clienteId);
    void recarregar();
  };

  const nomeDe = (id: string) => candidatos.get(id)?.nome ?? id.slice(0, 8);
  const opcoesAbsorver = [...candidatos.values()].filter((f) => f.id !== manter && !absorver.includes(f.id))
    .map((f) => ({ value: f.id, label: f.nome, hint: `${f.ativo ? '' : 'inativo · '}${doc(f.cpfCnpj)}` }));
  const mantido = candidatos.get(manter) ?? null;
  const motivoDoBotao = !chaveDaPrevia ? MOTIVO_SEM_PREVIA : lendoPrevia ? 'Calculando a prévia…' : previa?.recusa ? previa.recusa.frase : null;

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(520px,calc(100vh-16px))] w-[min(900px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-testid="mesclar-fornecedores">
        <div className="flex h-[34px] shrink-0 items-center gap-3 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Mesclar fornecedores</DialogTitle>
          <DialogDescription className="sr-only">Mover as referências de cadastros repetidos para um só</DialogDescription>
        </div>
        <div className="flex h-[32px] shrink-0 items-center border-b px-3">
          <Segmentado altura={22} valor={aba} onEscolher={setAba} opcoes={[{ valor: 'mesclar', rotulo: 'Mesclar' }, { valor: 'recentes', rotulo: `Mesclagens recentes · ${recentes.length}` }]} />
        </div>

        {aba === 'mesclar' ? (
          <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r bg-muted/20">
              <div className="h-[22px] shrink-0 px-2 pt-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">Sugestões · só sugerem</div>
              <div className="min-h-0 flex-1 overflow-y-auto px-1" data-testid="sugestoes-de-repetidos">
                {grupos.length === 0 && <div className="px-1 text-[10px] text-muted-foreground">Nenhum cadastro repetido.</div>}
                {grupos.map((g) => (
                  <button key={`${g.motivo}|${g.chave}`} type="button" onClick={() => escolherGrupo(g)} data-testid="sugestao-de-repetido"
                    className="block h-[30px] w-full rounded px-1 text-left hover:bg-muted" title={g.fornecedores.map((f) => f.nome).join(' · ')}>
                    <span className="block truncate text-[10px] font-medium">{g.fornecedores[0].nome}</span>
                    <span className="block truncate text-[9.5px] text-muted-foreground">{fraseDoGrupo(g)}</span>
                  </button>
                ))}
              </div>
            </aside>
            <div className="flex min-h-0 min-w-0 flex-col gap-2 px-3 pt-2">
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
                <div className="min-w-0">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">Fica *</div>
                  <FavorecidoSelect value={manter} onChange={(id) => { setManter(id); setAbsorver((a) => a.filter((x) => x !== id)); }} clienteId={clienteId} />
                </div>
                <div className="min-w-0">
                  <div className="text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground">Absorver *</div>
                  <SearchableSelect value="" onValueChange={(id) => { if (id) setAbsorver((a) => [...a, id]); }} options={opcoesAbsorver}
                    semTodos allValue="" allLabel="+ acrescentar cadastro…" placeholder="Buscar fornecedor..." dense />
                </div>
              </div>
              <div className="h-[96px] shrink-0 overflow-y-auto rounded border" data-testid="lista-absorvidos">
                <table className="w-full table-fixed border-collapse">
                  <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 70 }} /><col style={{ width: 22 }} /></colgroup>
                  <thead className="sticky top-0"><tr><th className={TH}>Cadastro</th><th className={TH}>CPF/CNPJ</th><th className={TH}>Situação</th><th className={TH} /></tr></thead>
                  <tbody>
                    {mantido && (
                      <tr className="bg-primary/10"><td className={`${TD} font-semibold`} title={mantido.nome}>{mantido.nome} · fica</td>
                        <td className={`${TD} tabular-nums`}>{doc(mantido.cpfCnpj)}</td><td className={TD}>{mantido.ativo ? 'ativo' : 'inativo'}</td><td /></tr>
                    )}
                    {absorver.map((id) => { const f = candidatos.get(id); return (
                      <tr key={id} className="border-b"><td className={TD} title={f?.nome}>{nomeDe(id)}</td>
                        <td className={`${TD} tabular-nums`}>{doc(f?.cpfCnpj ?? null)}</td><td className={TD}>{f?.ativo === false ? 'inativo' : 'ativo'}</td>
                        <td className="h-[18px] p-0 text-center text-[10px] leading-none"><button type="button" className="h-4 text-[10px] leading-none text-muted-foreground hover:text-destructive" title="tirar da lista"
                          onClick={() => setAbsorver((a) => a.filter((x) => x !== id))}>✕</button></td></tr>
                    ); })}
                  </tbody>
                </table>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded border" data-testid="previa-da-mesclagem">
                <table className="w-full table-fixed border-collapse">
                  <colgroup><col /><col style={{ width: 120 }} /></colgroup>
                  <thead className="sticky top-0"><tr><th className={TH}>O que passa para o que fica</th><th className={`${TH} text-right`}>Referências</th></tr></thead>
                  <tbody>
                    {MODULOS_DA_MESCLAGEM.map((m) => { const q = previa?.porModulo.find((x) => x.modulo === m)?.quantidade ?? 0; return (
                      <tr key={m} className="border-b"><td className={TD}>{m}</td>
                        <td className={`${TD} text-right tabular-nums ${q ? 'font-semibold' : 'text-muted-foreground'}`} data-testid={`previa-${m}`}>{previa && !previa.recusa ? q : '—'}</td></tr>
                    ); })}
                    <tr className="bg-muted/60"><td className={`${TD} font-semibold`}>Total</td>
                      <td className={`${TD} text-right font-semibold tabular-nums`} data-testid="previa-total">{previa && !previa.recusa ? previa.total : '—'}</td></tr>
                    <tr><td colSpan={2} className={`${TD} text-muted-foreground`} title={previa?.apelidos.join(' · ')}>
                      apelidos do que fica: {previa && !previa.recusa ? (previa.apelidos.join(' · ') || '—') : '—'}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2" data-testid="mesclagens-recentes">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col style={{ width: 74 }} /><col /><col /><col style={{ width: 78 }} /><col style={{ width: 120 }} /><col style={{ width: 70 }} /></colgroup>
              <thead className="sticky top-0"><tr><th className={TH}>Data</th><th className={TH}>Fica</th><th className={TH}>Absorvidos</th>
                <th className={`${TH} text-right`}>Referências</th><th className={TH}>Situação</th><th className={TH} /></tr></thead>
              <tbody>
                {recentes.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className={`${TD} tabular-nums`}>{new Date(l.criadoEm).toLocaleDateString('pt-BR')}</td>
                    <td className={TD} title={nomeDe(l.mantidoId)}>{nomeDe(l.mantidoId)}</td>
                    <td className={TD} title={l.absorvidosNomes.join(' · ')}>{l.absorvidosNomes.join(' · ') || `${l.absorvidos.length} cadastros`}</td>
                    <td className={`${TD} text-right tabular-nums`}>{l.total}</td>
                    <td className={TD} title={l.desfeitoMotivo ?? undefined}>{l.desfeitoEm ? `desfeita · ${l.desfeitoMotivo ?? ''}` : 'mesclada'}</td>
                    <td className="h-[18px] p-0 text-center text-[10px] leading-none">{!l.desfeitoEm && (
                      <button type="button" className="text-[10px] text-primary underline" data-testid="desfazer-mesclagem" onClick={() => { setDesfazendo(l.id); setMotivo(''); setRecado(null); }}>Desfazer</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentes.length === 0 && <div className="pt-2 text-[10px] text-muted-foreground">Nenhuma mesclagem.</div>}
          </div>
        )}

        <div className="flex h-[36px] shrink-0 items-center gap-2 border-t px-3">
          {/* FORN-MESCLAR-02a — a recusa do banco aparece INTEIRA: até duas linhas de 14px dentro do rodapé de 36px (layout fixo); era
              `truncate` e a frase ("Subcentro … nao existe no plano de contas…") cortava. O texto inteiro segue no `title`. */}
          <span className={`min-w-0 flex-1 line-clamp-2 break-words text-[10px] leading-[14px] ${recado?.tom === 'erro' || (!recado && previa?.recusa) ? 'text-destructive' : recado ? 'text-[#15803d]' : 'text-muted-foreground'}`}
            title={recado?.texto ?? motivoDoBotao ?? undefined} data-testid="recado-da-mesclagem">
            {recado?.texto ?? (aba === 'mesclar' ? motivoDoBotao ?? (confirmando ? 'Confere? Isto move as referências e inativa os absorvidos (pode ser desfeito).' : '') : '')}
          </span>
          {aba === 'recentes' && desfazendo && (
            <>
              <Input className="h-[24px] w-[220px] text-[10px]" placeholder="motivo para desfazer *" value={motivo} onChange={(e) => setMotivo(e.target.value)} data-testid="motivo-desfazer" />
              <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => void desfazer(desfazendo)} data-testid="confirmar-desfazer">Desfazer mesclagem</Button>
            </>
          )}
          <Button size="sm" variant="outline" className="h-[24px] text-[10px]" onClick={aoFechar}>Fechar</Button>
          {aba === 'mesclar' && (
            confirmando
              ? <Button size="sm" className="h-[24px] text-[10px]" disabled={gravando} onClick={() => void gravar()} data-testid="confirmar-mesclagem">Confirmar mesclagem</Button>
              : <Button size="sm" className="h-[24px] text-[10px]" disabled={!!motivoDoBotao || gravando} onClick={() => setConfirmando(true)} data-testid="mesclar">Mesclar</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
