/**
 * OPENFINANCE-PILOTO-01 · P3 mínima (Gabriel 16/11 14:50) + OPENFINANCE-SEG-01 (Chat 15:31) + CONTAS-OF-LINHA-01 (mock aprovado 23/11 18:10) +
 * OPENFINANCE-PRONTO-NJ-01 (Gabriel 11:46) — o Open Finance do cliente em Contas bancárias:
 *  · QUEM: VÊ o admin AGROinBLUE, o PROPRIETÁRIO e o GESTOR; CONECTA/ESCOLHE AS CONTAS/RECONECTA só o admin e o PROPRIETÁRIO (`podeVerOpenFinance`,
 *    `podeConectarOpenFinance`; a borda confere de novo). O gestor vê os botões desabilitados com o motivo. Desconectar segue só o admin.
 *  · "Conectar" NA LINHA da conta (`pedido` 'conectar'): modal de altura fixa com o banco da linha e o TERMO (118150; versão + md5 do texto
 *    mostrado vão à borda, que grava o aceite ANTES do Widget) — "Conectar agora" (o Widget oficial da Pluggy PRESO ao Open Finance REGULADO;
 *    consentimento no app do banco, nunca login/senha) ou "Mandar link ao titular" (desabilitado, diz por quê); depois do consentimento,
 *    "Escolher contas" com a conta da linha marcada e a conta do sistema sugerida.
 *  · o SELO do título abre "Bancos conectados": as conexões COMO A PLUGGY AS VÊ (`openfinance-contas` 'conexoes': o webhook não traz o
 *    conector) — o NOME do banco, a situação (Conectado · Lendo o banco · Esperando o titular · Não completou) e, na que não completou, a
 *    FRASE (ex.: "O banco esperou a confirmação no app e o tempo acabou…") com "Tentar de novo". Nada some calado.
 *  · o webhook se registra SOZINHO depois da 1ª conexão bem-sucedida (idempotente na função).
 * A tela não grava nada direto: quem grava são as funções.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCliente } from '@/contexts/ClienteContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TD_FONTES, TD_FONTES_DATA, TD_FONTES_TEXTO, TH_FONTES, CONTROLE, TITULO_MODAL } from '@/components/ui/regua-fontes';
import { EscolherContasDoBanco } from './EscolherContasDoBanco';
import {
  carregarWidget, conectoresDaConexao, conexoesDaResposta, FRASE_CONECTAR_FALHOU, FRASE_CONEXOES_FALHOU, FRASE_DESCONECTAR_FALHOU,
  FRASE_REGISTRO_FALHOU, FRASE_SEM_REGULADOS, FRASE_WIDGET_FALHOU, fraseDoDesconectar, fraseDoItem, fraseDoRegistro, itemDoSucesso,
  lerRespostaDaBorda, podeVerOpenFinance, podeConectarOpenFinance, MOTIVO_SO_PROPRIETARIO, ROTULO_DA_SITUACAO, tokenDaConexao, type ConexaoDaJanela,
} from '@/lib/openfinance/openfinanceTela';

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** o que a tela pediu: a lista das conexões (o selo), conectar a partir de uma linha ou reconectar o item de uma linha */
export type PedidoOpenFinance =
  | { tipo: 'lista' }
  | { tipo: 'conectar'; banco: string; contaNome: string; finais: string[] }
  | { tipo: 'reconectar'; itemId: string };

/** por que o "Mandar link ao titular" está desabilitado (a fonte única do disabled, do title e da frase) */
export const MOTIVO_SEM_LINK = 'Em breve: o link do titular (24 h, uso único) já tem lugar no banco, mas a página dele ainda não foi feita.';
/** por que o "Conectar agora" está desabilitado antes do aceite */
export const MOTIVO_SEM_ACEITE = 'Leia o termo e marque "Li e aceito" para conectar.';

/** quem VÊ o Open Finance do cliente aberto (o admin AGROinBLUE, o proprietário e o gestor) */
export function usePodeOpenFinance(): boolean {
  const { isAdmin, clienteAtual } = useCliente();
  return podeVerOpenFinance(isAdmin, clienteAtual?.perfil);
}
/** quem CONECTA, escolhe as contas e reconecta (o admin AGROinBLUE e o proprietário; o gestor só vê) */
export function usePodeConectarOpenFinance(): boolean {
  const { isAdmin, clienteAtual } = useCliente();
  return podeConectarOpenFinance(isAdmin, clienteAtual?.perfil);
}

interface Termo { versao: number; texto: string; md5: string }

/** o selo do título: "Open Finance · N bancos conectados ⓘ" — abre as conexões */
export function SeloOpenFinance({ n, onAbrir }: { n: number | null; onAbrir: () => void }) {
  const pode = usePodeOpenFinance();
  if (!pode) return null;
  const texto = n === null ? 'Open Finance · …' : `Open Finance · ${n} ${n === 1 ? 'banco conectado' : 'bancos conectados'}`;
  return (
    <button type="button" onClick={onAbrir} data-testid="openfinance-selo"
      title="Os bancos conectados deste cliente: escolher as contas que entram, ver as tentativas que não completaram, reconectar"
      className="flex h-[18px] flex-none items-center gap-1 whitespace-nowrap rounded-full border border-blue-200 bg-blue-50 px-2 text-[10px] text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
      <span className="tabular-nums">{texto}</span><span aria-hidden>ⓘ</span>
    </button>
  );
}

const COR_DA_SITUACAO: Record<ConexaoDaJanela['situacao'], string> = {
  conectado: 'text-emerald-700 dark:text-emerald-400', lendo: 'text-blue-700 dark:text-blue-300',
  esperando: 'text-amber-700 dark:text-amber-400', erro: 'text-rose-700 dark:text-rose-400',
};

export function OpenFinanceDoAdmin({ clienteId, pedido, onFechar, onMudou }: {
  clienteId: string | null; pedido: PedidoOpenFinance | null; onFechar: () => void; onMudou?: () => void;
}) {
  const { isAdmin } = useCliente();
  const pode = usePodeOpenFinance();
  const conecta = usePodeConectarOpenFinance();
  const [ocupado, setOcupado] = useState<'conectar' | 'desconectar' | null>(null);
  const [daLinha, setDaLinha] = useState<{ banco: string; contaNome: string; finais: string[] } | null>(null);
  const [termo, setTermo] = useState<Termo | null>(null);
  const [aceito, setAceito] = useState(false);
  const [finaisDaEscolha, setFinaisDaEscolha] = useState<string[]>([]);
  const [lista, setLista] = useState<ConexaoDaJanela[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<ConexaoDaJanela | null>(null);
  const [escolher, setEscolher] = useState<string | null>(null); // P3a: o item cujas contas se escolhem
  const fecharEscolher = useCallback(() => { setEscolher(null); setFinaisDaEscolha([]); onMudou?.(); }, [onMudou]);

  /* o pedido da tela: o selo abre a lista; o "⚠ Reconectar" da linha vai direto ao banco; o "Conectar" abre o modal da linha */
  useEffect(() => {
    if (!pedido || !pode) return;   // quem não pode: o corpo abaixo nem existe (retorno antes das funções)
    if (pedido.tipo === 'lista') void abrirLista();
    else if (!conecta) toast.error(MOTIVO_SO_PROPRIETARIO);   // o gestor só vê (a tela já desabilita; aqui é a última porta)
    else if (pedido.tipo === 'reconectar') void conectar(pedido.itemId);
    else { setDaLinha({ banco: pedido.banco, contaNome: pedido.contaNome, finais: pedido.finais }); setAceito(false); void lerTermo(); }
    onFechar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage SÓ a um pedido novo (cada clique é um objeto novo)
  }, [pedido]);

  if (!pode) return null;

  /* o termo vigente (catálogo, legível por todos): o texto, a versão e o md5 do banco vão juntos no aceite */
  const lerTermo = async () => {
    setTermo(null);
    const { data, error } = await (supabase as any).from('openfinance_termo_versoes').select('versao, texto, texto_md5')
      .order('versao', { ascending: false }).limit(1);
    const t = !error && Array.isArray(data) ? data[0] : null;
    if (t && typeof t.versao === 'number' && typeof t.texto === 'string' && typeof t.texto_md5 === 'string') {
      setTermo({ versao: t.versao, texto: t.texto, md5: t.texto_md5 });
    } else toast.error('Não consegui ler o termo do Open Finance. Tente de novo.');
  };

  /* "Registrar webhook" saiu da tela: depois da 1ª conexão, a tela registra sozinha (a função é idempotente: não duplica; só o admin) */
  const registrarSozinho = async () => {
    if (!isAdmin) return;
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-webhook-registrar', { body: {} }), FRASE_REGISTRO_FALHOU);
      if (r.ok === false) console.warn('[openfinance] webhook:', r.frase); else console.info('[openfinance] webhook:', fraseDoRegistro(r.corpo));
    } catch (e) { console.warn('[openfinance] webhook:', e); }
  };

  /* OF-ATUALIZAR-DO-BANCO-01 — com `itemId`: RECONECTAR (o Widget em modo atualização desse item: o banco pede o titular de novo) */
  const conectar = async (itemId?: string, finais: string[] = [], aceite?: Termo) => {
    if (!clienteId) { toast.error('Escolha o cliente antes de conectar o banco.'); return; }
    setOcupado('conectar');
    try {
      const corpo = itemId ? { cliente_id: clienteId, item_id: itemId } : { cliente_id: clienteId, termo: aceite ? { versao: aceite.versao, md5: aceite.md5 } : null };
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-conectar', { body: corpo }), FRASE_CONECTAR_FALHOU);
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
        // P3a: logo depois de conectar, escolhem-se as contas que entram (nada entra sem marcar)
        onSuccess: (dados) => {
          if (itemId) { toast.success('Conexão confirmada no banco. A Pluggy volta a atualizar sozinha.'); onMudou?.(); setEscolher(itemId); return; }
          toast.success(fraseDoItem(dados)); setFinaisDaEscolha(finais); setEscolher(itemDoSucesso(dados));
          void registrarSozinho();
        },
        onError: () => { toast.error('A conexão com o banco não terminou. Ela aparece em "Bancos conectados" com o motivo; tente de novo.'); onMudou?.(); },
      });
      await w.init();
    } catch { toast.error(FRASE_CONECTAR_FALHOU); } finally { setOcupado(null); }
  };

  const abrirLista = async () => {
    if (!clienteId) { toast.error('Escolha o cliente antes de abrir os bancos conectados.'); return; }
    setConfirmar(null); setLista(null); setAberto(true);
    try {
      const r = await lerRespostaDaBorda(await supabase.functions.invoke('openfinance-contas', { body: { acao: 'conexoes', cliente_id: clienteId } }), FRASE_CONEXOES_FALHOU);
      if (r.ok === false) { setAberto(false); toast.error(r.frase); return; }
      setLista(conexoesDaResposta(r.corpo));
    } catch { setAberto(false); toast.error(FRASE_CONEXOES_FALHOU); }
  };

  const desconectar = async (c: ConexaoDaJanela) => {
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

  const conectarAgora = () => {
    const d = daLinha; const t = termo;
    if (!t || !aceito) return;
    setDaLinha(null);
    void conectar(undefined, d?.finais ?? [], t);
  };

  return (
    <div className="contents" data-testid="openfinance-admin">
      {/* o "Conectar" da linha: modal de ALTURA FIXA, com o banco da linha, o termo e as duas saídas (régua de fontes nova: os cartões
          são blocos com o botão de 26px dentro; nada de botão-cartão de 52px) */}
      <Dialog open={daLinha !== null} onOpenChange={(v) => { if (!v && ocupado === null) setDaLinha(null); }}>
        <DialogContent className="flex h-[440px] max-w-[480px] flex-col gap-2 text-[11px]" data-testid="openfinance-conectar-linha">
          <DialogHeader>
            <DialogTitle className={TITULO_MODAL}>Conectar {daLinha?.banco ?? ''}</DialogTitle>
            <DialogDescription className="truncate text-[11px]" title={daLinha?.contaNome}>a partir de {daLinha?.contaNome ?? ''} · Open Finance, só leitura</DialogDescription>
          </DialogHeader>
          <p className="text-[11px] text-muted-foreground">
            O titular da conta autoriza no app do {daLinha?.banco ?? 'banco'}, com o celular em mãos (o banco dá 20 minutos). Conta de empresa: quem aprova é o representante, e alguns bancos pedem mais de um sócio.
          </p>
          <div className="flex h-[118px] flex-none flex-col gap-1 rounded-md border bg-muted/40 px-2 py-1" data-testid="openfinance-termo">
            <p className="text-[10px] leading-[13px] text-foreground" data-testid="openfinance-termo-texto">{termo ? termo.texto : 'Lendo o termo…'}</p>
            <label className="mt-auto flex items-center gap-1.5 text-[10px]">
              <Checkbox className="h-3.5 w-3.5" checked={aceito} disabled={!termo || ocupado !== null} onCheckedChange={(v) => setAceito(v === true)} data-testid="openfinance-termo-aceito" />
              Li e aceito {termo ? `(versão ${termo.versao})` : ''}
            </label>
          </div>
          <div className="flex h-[52px] flex-none items-center gap-2 rounded-md border px-2">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">1</span>
            <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">Conectar agora</span>
              <span className="block text-[11px] text-muted-foreground" data-testid="openfinance-motivo-conectar">{aceito ? 'O titular está aqui e aprova no celular dele.' : MOTIVO_SEM_ACEITE}</span></span>
            <Button size="sm" className={`${CONTROLE} w-[92px] flex-none`} disabled={ocupado !== null || !termo || !aceito} data-testid="openfinance-conectar-agora"
              title={!aceito ? MOTIVO_SEM_ACEITE : undefined} onClick={conectarAgora}>Conectar</Button>
          </div>
          <div className="flex h-[52px] flex-none items-center gap-2 rounded-md border px-2 opacity-70">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">2</span>
            <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">Mandar link ao titular</span>
              <span className="block text-[10px] text-muted-foreground" data-testid="openfinance-motivo-sem-link">{MOTIVO_SEM_LINK}</span></span>
            <Button size="sm" variant="outline" className={`${CONTROLE} w-[92px] flex-none`} disabled title={MOTIVO_SEM_LINK} data-testid="openfinance-mandar-link">Mandar link</Button>
          </div>
          <div className="mt-auto flex justify-end">
            <Button size="sm" variant="ghost" className={CONTROLE} onClick={() => setDaLinha(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aberto} onOpenChange={(v) => { if (!v && ocupado !== 'desconectar') setAberto(false); }}>
        <DialogContent className="max-w-[680px] text-[11px]" data-testid="openfinance-desconectar-dialogo">
          <DialogHeader>
            <DialogTitle className={TITULO_MODAL}>Bancos conectados</DialogTitle>
            <DialogDescription className="text-[11px]">
              As conexões do Open Finance deste cliente, como a Pluggy as vê — inclusive as tentativas que não completaram. Só as contas escolhidas entram.
            </DialogDescription>
          </DialogHeader>
          {/* régua de fontes nova: uma tabela (nome com "…" e o inteiro no title); a frase da que não completou numa linha própria, abaixo */}
          <div className="h-[240px] overflow-y-auto rounded-md border" data-testid="openfinance-conexoes">
            <table className="w-full table-fixed border-collapse">
              <colgroup><col /><col style={{ width: 132 }} /><col style={{ width: 76 }} /><col style={{ width: 272 }} /></colgroup>
              <thead className="sticky top-0 z-[1] bg-primary">
                <tr><th className={`${TH_FONTES} text-left`}>Banco</th><th className={`${TH_FONTES} text-left`}>Situação</th>
                  <th className={`${TH_FONTES} text-left`}>Desde</th><th className={TH_FONTES} /></tr>
              </thead>
              <tbody>
                {lista === null ? <tr><td colSpan={4} className={`${TD_FONTES} text-muted-foreground`}>Lendo as conexões na Pluggy…</td></tr>
                  : lista.length === 0 ? <tr><td colSpan={4} className={`${TD_FONTES} text-muted-foreground`} data-testid="openfinance-sem-conexao">Nenhum banco conectado para este cliente.</td></tr>
                  : lista.flatMap(c => {
                    const viva = c.situacao === 'conectado' || c.situacao === 'lendo';
                    const nome = `${c.banco}${c.empresa ? ' · Empresa' : ''}`;
                    const linha = (
                      <tr key={c.itemId} className={c.frase ? '' : 'border-b'} data-testid="openfinance-conexao" data-situacao={c.situacao}>
                        <td className={`${TD_FONTES_TEXTO} font-medium`} title={`${nome} · conexão ${c.itemId}`} data-testid="openfinance-conexao-banco">{nome}</td>
                        <td className={`${TD_FONTES} whitespace-nowrap ${COR_DA_SITUACAO[c.situacao]}`} data-testid="openfinance-conexao-situacao">● {ROTULO_DA_SITUACAO[c.situacao]}</td>
                        <td className={`${TD_FONTES_DATA} text-muted-foreground`}>{c.criadoEm ? dataCurta(c.criadoEm) : '—'}</td>
                        <td className={`${TD_FONTES} whitespace-nowrap text-right`}>
                          {viva && <Button size="sm" variant="ghost" className="h-5 px-1 text-[11px]" disabled={ocupado !== null || !conecta}
                            title={conecta ? undefined : MOTIVO_SO_PROPRIETARIO}
                            onClick={() => { setAberto(false); setConfirmar(null); setEscolher(c.itemId); }} data-testid="openfinance-escolher-contas">Escolher contas</Button>}
                          <Button size="sm" variant="ghost" className="h-5 px-1 text-[11px]" disabled={ocupado !== null || !conecta}
                            title={!conecta ? MOTIVO_SO_PROPRIETARIO : viva ? 'O banco pede o titular de novo (confirmação ou consentimento vencido): abre o banco para confirmar esta conexão'
                              : 'Abre o banco de novo para o titular aprovar no app, com o celular em mãos'}
                            onClick={() => { setAberto(false); void conectar(c.itemId); }} data-testid="openfinance-reconectar">{viva ? 'Reconectar' : 'Tentar de novo'}</Button>
                          {isAdmin && <Button size="sm" variant="ghost" className="h-5 px-1 text-[11px] text-rose-700" disabled={ocupado !== null}
                            onClick={() => setConfirmar(c)} data-testid="openfinance-desconectar-este">{viva ? 'Desconectar' : 'Descartar'}</Button>}
                        </td>
                      </tr>
                    );
                    return c.frase ? [linha, (
                      <tr key={`${c.itemId}-frase`} className="border-b">
                        <td colSpan={4} className={`${TD_FONTES_TEXTO} h-[18px] pb-1 text-[10px] text-muted-foreground`} title={c.frase} data-testid="openfinance-conexao-frase">{c.frase}</td>
                      </tr>
                    )] : [linha];
                  })}
              </tbody>
            </table>
          </div>
          {/* o gestor só vê: o motivo dos botões desabilitados, escrito (a regra da casa: botão desabilitado diz por quê) */}
          {!conecta && <p className="text-[10px] text-muted-foreground" data-testid="openfinance-so-proprietario">{MOTIVO_SO_PROPRIETARIO}</p>}
          {confirmar && (
            <div className="space-y-1 rounded-md border border-rose-200 bg-rose-50 p-2" data-testid="openfinance-confirmar">
              <div className="text-[11px] font-semibold text-rose-700">
                {confirmar.situacao === 'conectado' || confirmar.situacao === 'lendo'
                  ? `Desconectar ${confirmar.banco}? A Pluggy apaga a conexão e o consentimento cai; os extratos já importados ficam. Não dá para desfazer (conecta-se de novo).`
                  : `Descartar a tentativa de ${confirmar.banco}? A Pluggy apaga a conexão que não completou.`}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className={CONTROLE} disabled={ocupado !== null} onClick={() => setConfirmar(null)}>Voltar</Button>
                <Button size="sm" variant="destructive" className={CONTROLE} disabled={ocupado !== null}
                  onClick={() => void desconectar(confirmar)} data-testid="openfinance-confirmar-desconectar">
                  {confirmar.situacao === 'conectado' || confirmar.situacao === 'lendo' ? 'Desconectar' : 'Descartar'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {clienteId && conecta && <EscolherContasDoBanco clienteId={clienteId} itemId={escolher} onFechar={fecharEscolher} marcarFinais={finaisDaEscolha} />}
    </div>
  );
}
