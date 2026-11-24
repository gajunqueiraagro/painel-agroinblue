/**
 * FORN-FORMA-PELO-EXTRATO-01 (mock aprovado 24/11; ajustes: cabeçalho só com a 1ª maiúscula, SEM rolagem lateral) — a forma de pagamento de
 * cada fornecedor pelo extrato conciliado. 1 · Prévia por fornecedor (marcar) → Gravar (o banco simula, a barra diz o que muda → Confirmar)
 * → 2 · Gravado (Desfazer por fornecedor, com motivo). Quem decide é o banco (lote 113520); a tela só mostra e marca.
 * Largura fixa: as colunas de número/forma/chave têm px; só Fornecedor e "O que o extrato mostra" encolhem (… + title). Nada rola de lado.
 * Entradas: Cadastros › Fornecedores ("Forma pelo extrato") e o atalho do "Faltando" do pronto para pagar (Lançamentos).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { Ajuda } from '@/components/ui/ajuda';
import { supabase } from '@/integrations/supabase/client';
import { notificarLancamentosMudaram } from '@/hooks/useFinanceiroV2';
import { notificarFornecedoresMudaram } from '@/hooks/useFornecedoresDoCliente';
import {
  fraseDaChave, fraseDaGravacao, fraseDoDesfazer, lerGravacoes, lerResultadoDaGravacao, lerResultadoDoDesfazer, lerSugestoes,
  marcadoAoAbrir, noCadastro, somaDaMarcacao, type GravacaoDeForma, type SugestaoDeForma,
} from '@/lib/fornecedores/formaPeloExtrato';

const FRASE_NAO_LEU = 'Não consegui ler o extrato agora. Tente de novo.';
const FRASE_NAO_GRAVOU = 'Não consegui gravar agora. Nada foi gravado. Tente de novo.';

/* o banco, injetável no teste */
export interface FontesDaForma {
  ler: (cliente: string) => Promise<unknown>;
  gravar: (cliente: string, ids: readonly string[], simular: boolean) => Promise<unknown>;
  gravacoes: (cliente: string) => Promise<unknown>;
  desfazer: (op: string, motivo: string, simular: boolean) => Promise<unknown>;
}
/* a frase pronta do banco (P0001/22023) vai à tela; o resto vai ao console e a tela diz a frase da casa */
function fraseDoErro(e: unknown, padrao: string): string {
  const m = e !== null && typeof e === 'object' ? Reflect.get(e, 'message') : null;
  const c = e !== null && typeof e === 'object' ? Reflect.get(e, 'code') : null;
  if (typeof m === 'string' && (c === 'P0001' || c === '22023') && m.trim()) return m;
  console.error('[FormaPeloExtrato]', e);
  return padrao;
}
async function rpc(nome: string, args: Record<string, unknown>): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(nome, args);
  if (error) throw error;
  return data;
}
export const FONTES_DO_BANCO: FontesDaForma = {
  ler: (cliente) => rpc('fn_forma_pelo_extrato_previa', { p_cliente: cliente }),
  gravar: (cliente, ids, simular) => rpc('fn_forma_pelo_extrato_gravar', { p_cliente: cliente, p_fornecedores: [...ids], p_simular: simular }),
  gravacoes: async (cliente) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('fornecedor_forma_extrato_ops')
      .select('id, fornecedor_id, forma, chave, lancamentos, recusados, feita_em, fornecedor:financeiro_fornecedores(nome)')
      .eq('cliente_id', cliente).is('desfeita_em', null).order('feita_em', { ascending: false }).limit(300);
    if (error) throw error;
    return data;
  },
  desfazer: (op, motivo, simular) => rpc('fn_forma_pelo_extrato_desfazer', { p_op: op, p_motivo: motivo, p_simular: simular }),
};

const TH = 'h-[22px] px-1 py-0 text-left align-middle text-[9.5px] font-medium text-primary-foreground bg-primary whitespace-nowrap';
const TD = 'h-[19px] px-1 py-0 align-middle text-[10px] leading-none';
const TDT = `${TD} truncate`;
const TDN = `${TD} text-right tabular-nums whitespace-nowrap`;
const SELO = 'inline-block rounded-full border px-1.5 text-[9.5px] leading-[14px]';
const dataHora = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

export function FormaPeloExtratoDialog({ aberto, clienteId, aoFechar, fontes = FONTES_DO_BANCO }: {
  aberto: boolean; clienteId: string; aoFechar: () => void; fontes?: FontesDaForma;
}) {
  const [passo, setPasso] = useState<'previa' | 'gravado'>('previa');
  const [sugestoes, setSugestoes] = useState<SugestaoDeForma[] | null>(null);
  const [gravacoes, setGravacoes] = useState<GravacaoDeForma[] | null>(null);
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ fornecedores: number; lancamentos: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [desfazendo, setDesfazendo] = useState<{ id: string; motivo: string } | null>(null);

  const recarregar = useCallback(async () => {
    setErro(null);
    try {
      const [s, gs] = await Promise.all([fontes.ler(clienteId), fontes.gravacoes(clienteId)]);
      const lidas = lerSugestoes(s); const lidasG = lerGravacoes(gs);
      if (!lidas || !lidasG) { setErro(FRASE_NAO_LEU); return; }
      setSugestoes(lidas); setGravacoes(lidasG);
      setMarcados(new Set(lidas.filter(marcadoAoAbrir).map((x) => x.fornecedorId)));
    } catch (e) { setErro(fraseDoErro(e, FRASE_NAO_LEU)); }
  }, [clienteId, fontes]);
  useEffect(() => { if (aberto) void recarregar(); }, [aberto, recarregar]);

  const soma = useMemo(() => somaDaMarcacao(sugestoes ?? [], marcados), [sugestoes, marcados]);
  const alternar = (id: string) => { setConfirmar(null); setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const pedirGravar = async () => {
    if (ocupado || soma.fornecedores === 0) return;
    setOcupado(true); setRecado(null);
    try {
      const r = lerResultadoDaGravacao(await fontes.gravar(clienteId, [...marcados], true));
      if (!r) { setRecado(FRASE_NAO_GRAVOU); return; }
      setConfirmar(r);
    } catch (e) { setRecado(fraseDoErro(e, FRASE_NAO_GRAVOU)); } finally { setOcupado(false); }
  };
  const gravar = async () => {
    if (ocupado || !confirmar) return;
    setOcupado(true); setRecado(null);
    try {
      const r = lerResultadoDaGravacao(await fontes.gravar(clienteId, [...marcados], false));
      if (!r) { setRecado(FRASE_NAO_GRAVOU); return; }
      notificarFornecedoresMudaram(clienteId, [...marcados]); notificarLancamentosMudaram(clienteId);
      setConfirmar(null); setRecado(fraseDaGravacao(r)); setPasso('gravado');
      await recarregar();
    } catch (e) { setRecado(fraseDoErro(e, FRASE_NAO_GRAVOU)); } finally { setOcupado(false); }
  };
  const desfazer = async () => {
    if (ocupado || !desfazendo) return;
    if (!desfazendo.motivo.trim()) { setRecado('Escreva por que desfaz.'); return; }
    setOcupado(true); setRecado(null);
    try {
      const r = lerResultadoDoDesfazer(await fontes.desfazer(desfazendo.id, desfazendo.motivo.trim(), false));
      if (!r) { setRecado(FRASE_NAO_GRAVOU); return; }
      notificarFornecedoresMudaram(clienteId); notificarLancamentosMudaram(clienteId);
      setDesfazendo(null); setRecado(fraseDoDesfazer(r));
      await recarregar();
    } catch (e) { setRecado(fraseDoErro(e, FRASE_NAO_GRAVOU)); } finally { setOcupado(false); }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) aoFechar(); }}>
      <DialogContent className="flex h-[min(560px,calc(100vh-16px))] w-[min(1000px,calc(100vw-16px))] max-w-none flex-col gap-0 overflow-hidden p-0"
        data-testid="forma-pelo-extrato">
        <div className="flex h-[34px] shrink-0 items-center gap-2 bg-primary px-3 text-primary-foreground">
          <DialogTitle className="text-[11px] font-semibold">Forma de pagamento pelo extrato</DialogTitle>
          <DialogDescription className="sr-only">Sugere a forma de pagamento de cada fornecedor pelos pagamentos conciliados</DialogDescription>
          <span className="text-[10px] opacity-75">pagamentos conciliados dos últimos 18 meses</span>
          <Ajuda titulo="Forma pelo extrato" className="text-primary-foreground"
            oQueE="A forma de pagamento que cada fornecedor recebe, lida no histórico do banco dos pagamentos já conciliados."
            porQue="Sem a forma, o lançamento fica com o ponto laranja (falta a forma) e não sai pronto para pagar."
            comoFazer="Só aparece quem tem 2 ou mais pagamentos e 80% ou mais com a mesma forma. Marque e grave: o cadastro recebe a forma e os lançamentos em aberto com a forma em branco também. A chave PIX só vem quando o extrato mostra o mesmo CPF/CNPJ do cadastro. Desfazer volta tudo, por fornecedor." />
        </div>

        <div className="flex h-[32px] shrink-0 items-center gap-2 border-b px-3">
          <Segmentado altura={22} valor={passo} onEscolher={(v) => { setPasso(v); setRecado(null); setConfirmar(null); }} opcoes={[
            { valor: 'previa', rotulo: `1 · Prévia por fornecedor (${sugestoes ? sugestoes.length.toLocaleString('pt-BR') : '—'})` },
            { valor: 'gravado', rotulo: `2 · Gravado (${gravacoes ? gravacoes.length.toLocaleString('pt-BR') : '—'})` },
          ]} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-1.5" data-testid="forma-corpo">
          {erro ? (
            <div className="flex flex-col items-start gap-2 pt-6 text-[10.5px]" data-testid="forma-erro">
              <span>{erro}</span>
              <Button size="sm" variant="outline" className="h-[24px] text-[10.5px]" onClick={() => { void recarregar(); }}>Tentar de novo</Button>
            </div>
          ) : !sugestoes || !gravacoes ? (
            <div className="pt-6 text-[10.5px] text-muted-foreground">Lendo o extrato…</div>
          ) : passo === 'previa' ? (
            sugestoes.length === 0 ? (
              <div className="pt-6 text-[10.5px] text-muted-foreground" data-testid="forma-vazio">Nenhum fornecedor com forma clara no extrato conciliado.</div>
            ) : (
              <table className="w-full table-fixed border-collapse" data-testid="forma-tabela">
                <colgroup><col style={{ width: 26 }} /><col /><col style={{ width: 70 }} /><col style={{ width: 118 }} /><col style={{ width: 50 }} />
                  <col style={{ width: 112 }} /><col style={{ width: 168 }} /><col style={{ width: 82 }} /><col style={{ width: 104 }} /></colgroup>
                <thead className="sticky top-0 z-10"><tr>
                  <th className={TH} /><th className={TH}>Fornecedor</th><th className={`${TH} text-right`}>Pagamentos</th><th className={TH}>O que o extrato mostra</th>
                  <th className={`${TH} text-right`}>Iguais</th><th className={TH}>Forma sugerida</th><th className={TH}>Chave PIX sugerida</th>
                  <th className={`${TH} text-right`}>Abertos s/ forma</th><th className={TH}>Hoje no cadastro</th>
                </tr></thead>
                <tbody>
                  {sugestoes.map((s) => {
                    const cad = noCadastro(s); const chave = fraseDaChave(s);
                    return (
                      <tr key={s.fornecedorId} className="border-b hover:bg-muted/40" data-testid="forma-linha" data-fornecedor={s.fornecedorId}>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={marcados.has(s.fornecedorId)} onChange={() => alternar(s.fornecedorId)}
                          aria-label={`Gravar a forma de ${s.nome}`} data-testid="forma-marcar" /></td>
                        <td className={TDT} title={s.nome}>{s.nome}</td>
                        <td className={TDN}>{s.pagamentos.toLocaleString('pt-BR')}</td>
                        <td className={`${TDT} text-muted-foreground`} title={s.exemplo}>{s.exemplo || '—'}</td>
                        <td className={TDN}>{s.iguaisPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                        <td className={TDT} title={s.forma}><span className={`${SELO} border-[#1F7A4D] text-[#1F7A4D]`}>{s.forma}</span></td>
                        <td className={`${TDT} ${s.chaveSugerida ? '' : 'text-muted-foreground'}`} title={chave}>{chave}</td>
                        <td className={TDN}>{s.abertosSemForma.toLocaleString('pt-BR')}</td>
                        <td className={TDT} title={s.hojeForma ?? 'em branco'}>
                          {cad === 'em_branco' ? <span className="text-muted-foreground">em branco</span>
                            : cad === 'igual' ? <span className={`${SELO} border-[#1F7A4D] text-[#1F7A4D]`}>igual</span>
                            : <span className={`${SELO} border-[#E08A00] text-[#9a5b00]`}>{s.hojeForma}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : gravacoes.length === 0 ? (
            <div className="pt-6 text-[10.5px] text-muted-foreground" data-testid="forma-gravado-vazio">Nada gravado pelo extrato ainda.</div>
          ) : (
            <table className="w-full table-fixed border-collapse" data-testid="forma-gravacoes">
              <colgroup><col /><col style={{ width: 120 }} /><col style={{ width: 190 }} /><col style={{ width: 96 }} /><col style={{ width: 118 }} /><col style={{ width: 80 }} /></colgroup>
              <thead className="sticky top-0 z-10"><tr>
                <th className={TH}>Fornecedor</th><th className={TH}>Forma gravada</th><th className={TH}>Chave PIX</th>
                <th className={`${TH} text-right`}>Lançamentos</th><th className={TH}>Gravado em</th><th className={TH} />
              </tr></thead>
              <tbody>
                {gravacoes.map((x) => (
                  <tr key={x.id} className="border-b" data-testid="forma-gravacao">
                    <td className={TDT} title={x.nome}>{x.nome}</td>
                    <td className={TDT} title={x.forma}>{x.forma}</td>
                    <td className={`${TDT} ${x.chave ? '' : 'text-muted-foreground'}`} title={x.chave ?? '—'}>{x.chave ?? '—'}</td>
                    <td className={TDN} title={x.recusados > 0 ? `${x.recusados} recusado(s) pelo banco (mês fechado ou trava)` : undefined}>{x.lancamentos.toLocaleString('pt-BR')}</td>
                    <td className={`${TD} tabular-nums whitespace-nowrap`}>{dataHora(x.feitaEm)}</td>
                    <td className={`${TD} text-right`}>
                      <Button size="sm" variant="outline" className="h-[17px] px-1.5 text-[9.5px]" data-testid="forma-desfazer"
                        onClick={() => { setDesfazendo({ id: x.id, motivo: '' }); setRecado(null); }}>Desfazer</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* a barra de baixo: altura fixa; a frase tem 2 linhas reservadas (quebra, nunca corta) e os botões ficam no lugar */}
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-t px-3" data-testid="forma-barra">
          <span className="line-clamp-2 min-w-0 flex-1 break-words text-[10.5px] leading-[14px]" data-testid="forma-recado">
            {recado ?? (desfazendo ? 'Desfazer volta o cadastro e tira a forma só dos lançamentos que esta gravação preencheu e ninguém mexeu depois.'
              : passo === 'previa' && sugestoes ? (confirmar
                ? `Vai gravar ${confirmar.fornecedores.toLocaleString('pt-BR')} ${confirmar.fornecedores === 1 ? 'cadastro' : 'cadastros'} e preencher ${confirmar.lancamentos.toLocaleString('pt-BR')} ${confirmar.lancamentos === 1 ? 'lançamento' : 'lançamentos'} em aberto. Confirma?`
                : `${soma.fornecedores.toLocaleString('pt-BR')} ${soma.fornecedores === 1 ? 'fornecedor marcado' : 'fornecedores marcados'} · ${soma.lancamentos.toLocaleString('pt-BR')} ${soma.lancamentos === 1 ? 'lançamento em aberto recebe' : 'lançamentos em aberto recebem'} a forma`)
              : '')}
          </span>
          {desfazendo && (
            <Input value={desfazendo.motivo} onChange={(e) => setDesfazendo({ ...desfazendo, motivo: e.target.value })} placeholder="Por que desfaz?"
              className="h-[26px] w-[220px] shrink-0 text-[10.5px]" data-testid="forma-desfazer-motivo" aria-label="Por que desfaz" />
          )}
          <Button size="sm" variant="outline" className="h-[26px] shrink-0 text-[11px]"
            onClick={() => { if (desfazendo) setDesfazendo(null); else if (confirmar) setConfirmar(null); else aoFechar(); }}>
            {desfazendo || confirmar ? 'Voltar' : 'Fechar'}
          </Button>
          {desfazendo ? (
            <Button size="sm" className="h-[26px] w-[96px] shrink-0 text-[11px]" disabled={ocupado} onClick={() => { void desfazer(); }} data-testid="forma-desfazer-confirmar">Desfazer</Button>
          ) : passo === 'previa' && (
            <Button size="sm" className="h-[26px] w-[96px] shrink-0 text-[11px]" disabled={ocupado || soma.fornecedores === 0}
              onClick={() => { void (confirmar ? gravar() : pedirGravar()); }} data-testid="forma-gravar">{confirmar ? 'Confirmar' : 'Gravar'}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
