/**
 * OPENFINANCE-PILOTO-01 · P3 mínima (Gabriel 16/11 14:50) + OPENFINANCE-SEG-01 (Chat 15:31) + CONTAS-OF-LINHA-01 (mock aprovado 23/11 18:10) —
 * o Open Finance do ADMIN AGROinBLUE em Contas bancárias. Os 3 botões soltos da barra SAÍRAM; o que eles faziam ficou assim:
 *  · "Conectar banco"     → o "Conectar" NA LINHA da conta (`pedido` 'conectar'): modal pequeno de altura fixa com o banco da linha —
 *    "Conectar agora" (`openfinance-conectar` → o Widget oficial da Pluggy PRESO aos bancos do Open Finance REGULADO; consentimento no app
 *    do banco, nunca login/senha) ou "Mandar link ao titular" (o link de 24 h do 118150: a função da borda e a página do titular ainda NÃO
 *    existem — a opção aparece desabilitada e diz por quê); depois do consentimento, "Escolher contas" com a conta da linha já marcada;
 *  · "Bancos conectados"  → o SELO do título ("Open Finance · N bancos conectados", `SeloOpenFinance`, `pedido` 'lista'): as conexões DESTE
 *    cliente (`conexoesDoCliente`): Escolher contas · Reconectar · Desconectar (com confirmação → `openfinance-desconectar`);
 *  · "Registrar webhook"  → AUTOMÁTICO: depois da 1ª conexão bem-sucedida a tela chama `openfinance-webhook-registrar` (idempotente na
 *    função: registrado, não duplica); falhou, só o console (a conexão já valeu e o diário da Pluggy segue).
 * Fora do admin, nada aparece. A tela não grava nada direto: quem grava são as funções.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EscolherContasDoBanco } from './EscolherContasDoBanco';
import {
  carregarWidget, conectoresDaConexao, conexoesDoCliente, FRASE_CONECTAR_FALHOU, FRASE_DESCONECTAR_FALHOU, FRASE_REGISTRO_FALHOU,
  FRASE_SEM_REGULADOS, FRASE_WIDGET_FALHOU, fraseDoDesconectar, fraseDoItem, fraseDoRegistro, itemDoSucesso, lerRespostaDaBorda, tokenDaConexao,
  type ConexaoDoCliente, type EventoDaFila,
} from '@/lib/openfinance/openfinanceTela';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** o que a tela pediu: a lista das conexões (o selo), conectar a partir de uma linha ou reconectar o item de uma linha */
export type PedidoOpenFinance =
  | { tipo: 'lista' }
  | { tipo: 'conectar'; banco: string; contaNome: string; finais: string[] }
  | { tipo: 'reconectar'; itemId: string };

/** por que o "Mandar link ao titular" está desabilitado (a fonte única do disabled, do title e da frase) */
export const MOTIVO_SEM_LINK = 'Em breve: o link do titular (24 h, uso único) já tem lugar no banco, mas a página dele ainda não foi feita.';

/** o selo do título: "Open Finance · N bancos conectados ⓘ" — abre as conexões (só o admin) */
export function SeloOpenFinance({ n, onAbrir }: { n: number | null; onAbrir: () => void }) {
  const { isAdmin } = useCliente();
  if (!isAdmin) return null;
  const texto = n === null ? 'Open Finance · …' : `Open Finance · ${n} ${n === 1 ? 'banco conectado' : 'bancos conectados'}`;
  return (
    <button type="button" onClick={onAbrir} data-testid="openfinance-selo"
      title="Admin AGROinBLUE · os bancos conectados deste cliente: escolher as contas que entram, reconectar ou desconectar"
      className="flex h-[18px] flex-none items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 text-[10px] text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
      <span className="tabular-nums">{texto}</span><span aria-hidden>ⓘ</span>
    </button>
  );
}

export function OpenFinanceDoAdmin({ clienteId, pedido, onFechar, onMudou }: {
  clienteId: string | null; pedido: PedidoOpenFinance | null; onFechar: () => void; onMudou?: () => void;
}) {
  const { isAdmin } = useCliente();
  const [ocupado, setOcupado] = useState<'conectar' | 'desconectar' | null>(null);
  const [daLinha, setDaLinha] = useState<{ banco: string; contaNome: string; finais: string[] } | null>(null);
  const [finaisDaEscolha, setFinaisDaEscolha] = useState<string[]>([]);
  const [lista, setLista] = useState<ConexaoDoCliente[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<ConexaoDoCliente | null>(null);
  const [escolher, setEscolher] = useState<string | null>(null); // P3a: o item cujas contas o admin escolhe
  const fecharEscolher = useCallback(() => { setEscolher(null); setFinaisDaEscolha([]); onMudou?.(); }, [onMudou]);

  /* o pedido da tela: o selo abre a lista; o "⚠ Reconectar" da linha vai direto ao banco; o "Conectar" abre o modal da linha */
  useEffect(() => {
    if (!pedido || !isAdmin) return;   // sem admin, o corpo abaixo nem existe (retorno antes das funções)
    if (pedido.tipo === 'lista') void abrirDesconectar();
    else if (pedido.tipo === 'reconectar') void conectar(pedido.itemId);
    else setDaLinha({ banco: pedido.banco, contaNome: pedido.contaNome, finais: pedido.finais });
    onFechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage SÓ a um pedido novo (cada clique é um objeto novo)
  }, [pedido]);

  if (!isAdmin) return null;

  /* "Registrar webhook" saiu da tela: depois da 1ª conexão, a tela registra sozinha (a função é idempotente: não duplica) */
  const registrarSozinho = async () => {
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-webhook-registrar', { body: {} }), FRASE_REGISTRO_FALHOU);
      if (r.ok === false) console.warn('[openfinance] webhook:', r.frase); else console.info('[openfinance] webhook:', fraseDoRegistro(r.corpo));
    } catch (e) { console.warn('[openfinance] webhook:', e); }
  };

  /* OF-ATUALIZAR-DO-BANCO-01 — com `itemId`: RECONECTAR (o Widget em modo atualização desse item: o banco pede o titular de novo) */
  const conectar = async (itemId?: string, finais: string[] = []) => {
    if (!clienteId) { toast.error('Escolha o cliente antes de conectar o banco.'); return; }
    setOcupado('conectar');
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-conectar',
        { body: itemId ? { cliente_id: clienteId, item_id: itemId } : { cliente_id: clienteId } }), FRASE_CONECTAR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      const token = tokenDaConexao(r.corpo);
      if (!token) { toast.error(FRASE_CONECTAR_FALHOU); return; }
      const regulados = conectoresDaConexao(r.corpo);
      if (regulados.length === 0) { toast.error(FRASE_SEM_REGULADOS); return; }
      let Widget;
      try { Widget = await carregarWidget(); } catch { toast.error(FRASE_WIDGET_FALHOU); return; }
      const w = new Widget({
        connectToken: token,
        includeSandbox: false,
        connectorIds: regulados, // SÓ o Open Finance regulado: o banco pede o consentimento no app dele; nunca login/senha aqui
        ...(itemId ? { updateItem: itemId } : {}),
        // P3a: logo depois de conectar, o admin escolhe as contas que entram (nada entra sem marcar)
        onSuccess: (dados) => {
          if (itemId) { toast.success('Conexão confirmada no banco. A Pluggy volta a atualizar sozinha.'); onMudou?.(); return; }
          toast.success(fraseDoItem(dados)); setFinaisDaEscolha(finais); setEscolher(itemDoSucesso(dados));
          void registrarSozinho();
        },
        onError: () => toast.error('A conexão com o banco não terminou. Nada foi gravado; tente de novo.'),
      });
      await w.init();
    } catch { toast.error(FRASE_CONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  const abrirDesconectar = async () => {
    if (!clienteId) { toast.error('Escolha o cliente antes de desconectar um banco.'); return; }
    setConfirmar(null); setLista(null); setAberto(true);
    const { data, error } = await (supabase as any).from('openfinance_eventos')
      .select('evento, item_id, cliente_id, client_user_id, connector_id, recebido_em')
      .or(`cliente_id.eq.${clienteId},client_user_id.eq.${clienteId}`).order('recebido_em');
    if (error) { setAberto(false); toast.error('Não consegui ler as conexões deste cliente. Tente de novo.'); return; }
    const eventos: EventoDaFila[] = Array.isArray(data) ? data : [];
    setLista(conexoesDoCliente(eventos, clienteId));
  };

  const desconectar = async (c: ConexaoDoCliente) => {
    if (!clienteId) return;
    setOcupado('desconectar');
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-desconectar', { body: { cliente_id: clienteId, item_id: c.itemId } }), FRASE_DESCONECTAR_FALHOU);
      if (r.ok === false) { toast.error(r.frase); return; }
      toast.success(fraseDoDesconectar(r.corpo));
      setLista(atual => (atual ?? []).filter(x => x.itemId !== c.itemId));
      setConfirmar(null); onMudou?.();
    } catch { toast.error(FRASE_DESCONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  return (
    <div className="contents" data-testid="openfinance-admin">
      {/* o "Conectar" da linha: modal pequeno, ALTURA FIXA, com o banco da linha; duas saídas */}
      <Dialog open={daLinha !== null} onOpenChange={(v) => { if (!v && ocupado === null) setDaLinha(null); }}>
        <DialogContent className="flex h-[300px] max-w-[440px] flex-col gap-2" data-testid="openfinance-conectar-linha">
          <DialogHeader>
            <DialogTitle className="text-[13px]">Conectar {daLinha?.banco ?? ''}</DialogTitle>
            <DialogDescription className="truncate text-[11px]" title={daLinha?.contaNome}>a partir de {daLinha?.contaNome ?? ''} · Open Finance, só leitura</DialogDescription>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">
            O titular da conta autoriza no app do {daLinha?.banco ?? 'banco'}. Uma autorização vale para todas as contas dele nesse banco; depois você escolhe quais entram.
          </p>
          <button type="button" disabled={ocupado !== null} data-testid="openfinance-conectar-agora"
            onClick={() => { const d = daLinha; setDaLinha(null); void conectar(undefined, d?.finais ?? []); }}
            className="flex h-[52px] flex-none items-center gap-2 rounded-md border px-2 text-left hover:border-primary hover:bg-primary/5 disabled:opacity-50">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">1</span>
            <span className="min-w-0"><span className="block text-[12px] font-semibold">Conectar agora</span>
              <span className="block text-[11px] text-muted-foreground">O titular está aqui e aprova no celular dele.</span></span>
          </button>
          <button type="button" disabled title={MOTIVO_SEM_LINK} data-testid="openfinance-mandar-link"
            className="flex h-[52px] flex-none cursor-not-allowed items-center gap-2 rounded-md border px-2 text-left opacity-60">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">2</span>
            <span className="min-w-0"><span className="block text-[12px] font-semibold">Mandar link ao titular</span>
              <span className="block text-[10px] text-muted-foreground" data-testid="openfinance-motivo-sem-link">{MOTIVO_SEM_LINK}</span></span>
          </button>
          <div className="mt-auto flex justify-end">
            <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setDaLinha(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aberto} onOpenChange={(v) => { if (!v && ocupado !== 'desconectar') setAberto(false); }}>
        <DialogContent className="max-w-[540px]" data-testid="openfinance-desconectar-dialogo">
          <DialogHeader>
            <DialogTitle className="text-[13px]">Bancos conectados</DialogTitle>
            <DialogDescription className="text-[11px]">
              Conexões do Open Finance deste cliente. Só as contas escolhidas entram. Desconectar apaga a conexão na Pluggy e o consentimento cai; os extratos já importados ficam.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-[96px] rounded-md border text-[11px]">
            {lista === null ? <div className="p-2 text-muted-foreground">Lendo as conexões…</div>
              : lista.length === 0 ? <div className="p-2 text-muted-foreground" data-testid="openfinance-sem-conexao">Nenhum banco conectado para este cliente.</div>
              : lista.map(c => (
                <div key={c.itemId} className="flex h-[26px] items-center gap-2 border-b px-2 last:border-b-0" data-testid="openfinance-conexao">
                  <span className="min-w-0 flex-1 truncate" title={`Conexão ${c.itemId}`}>Banco (conector {c.connectorId ?? '—'})</span>
                  <span className="w-[86px] flex-none tabular-nums text-muted-foreground">desde {dataCurta(c.desde)}</span>
                  <Button size="sm" variant="ghost" className="h-5 flex-none px-2 text-[11px]" disabled={ocupado !== null}
                    onClick={() => { setAberto(false); setConfirmar(null); setEscolher(c.itemId); }} data-testid="openfinance-escolher-contas">Escolher contas</Button>
                  <Button size="sm" variant="ghost" className="h-5 flex-none px-2 text-[11px]" disabled={ocupado !== null}
                    title="O banco pede o titular de novo (confirmação ou consentimento vencido): abre o banco para confirmar esta conexão"
                    onClick={() => { setAberto(false); void conectar(c.itemId); }} data-testid="openfinance-reconectar">Reconectar</Button>
                  <Button size="sm" variant="ghost" className="h-5 flex-none px-2 text-[11px] text-rose-700" disabled={ocupado !== null}
                    onClick={() => setConfirmar(c)} data-testid="openfinance-desconectar-este">Desconectar</Button>
                </div>
              ))}
          </div>
          {confirmar && (
            <div className="space-y-1 rounded-md border border-rose-200 bg-rose-50 p-2" data-testid="openfinance-confirmar">
              <div className="text-[11px] font-semibold text-rose-700">
                Desconectar o banco (conector {confirmar.connectorId ?? '—'})? A Pluggy apaga a conexão; não dá para desfazer (conecta-se de novo).
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={ocupado !== null} onClick={() => setConfirmar(null)}>Voltar</Button>
                <Button size="sm" variant="destructive" className="h-6 text-[11px]" disabled={ocupado !== null}
                  onClick={() => void desconectar(confirmar)} data-testid="openfinance-confirmar-desconectar">Desconectar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {clienteId && <EscolherContasDoBanco clienteId={clienteId} itemId={escolher} onFechar={fecharEscolher} marcarFinais={finaisDaEscolha} />}
    </div>
  );
}
