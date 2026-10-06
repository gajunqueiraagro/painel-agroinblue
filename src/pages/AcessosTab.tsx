/**
 * ACESSOS — quem entra em cada cliente e com qual perfil. ACESSOS-TELA-01 (Gabriel, 06/10/2026).
 *
 * ⚠ A TELA NAO ESCREVE EM TABELA: criar, redefinir senha e remover sao das edge functions (`criar-usuario`,
 *   `redefinir-senha`, `remover-membro`), que no piloto so' atendem o admin do AGROinBLUE. Aqui so' se LE a lista
 *   (`cliente_membros` + `profiles` + `fazenda_membros`) e se escreve o que a funcao devolveu.
 * ⚠ A SENHA so' vive no campo e no corpo da chamada: nao e' exibida de novo, nao vai a log, console, toast nem URL, e o
 *   campo e' limpo depois de cada tentativa bem-sucedida.
 * ⚠ ERRO E AVISO FICAM ESCRITOS ao lado do botao (UX-TOAST-01) — esta tela nao tem toast.
 * ⚠ LAYOUT FIXO: lista com cabecalho preso e so' o corpo rolando; formulario de largura fixa com um slot de mensagem por
 *   campo (sempre presente); redefinir e remover em dialogos de tamanho fixo.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFazenda } from '@/contexts/FazendaContext';
import { useCliente } from '@/contexts/ClienteContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Eye, EyeOff, KeyRound, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ehAdminAgroinblue, lerRespostaDaFuncao, pendenciasDoNovoAcesso,
  FRASE_CRIADO, FRASE_LOGIN_EXISTENTE, FRASE_SEM_CLIENTE, FRASE_SO_ADMIN_NA_TELA, MOTIVO_LINHA_ADMIN, MOTIVO_LINHA_PROPRIA,
  PERFIL_INICIAL, PERFIS_DA_TELA, ROTULO_PERFIL, SENHA_MINIMA,
} from '@/lib/acessos/acessosDaTela';

interface Membro {
  id: string;
  user_id: string;
  perfil: string;
  nome: string | null;
  email: string | null;
  fazendas: string[];
}

const TH = 'sticky top-0 z-10 h-[18px] whitespace-nowrap bg-primary px-1.5 py-0 text-center text-[9.5px] font-semibold leading-[18px] text-primary-foreground';
const TD = 'h-[18px] overflow-hidden text-ellipsis whitespace-nowrap px-1.5 py-0 text-[10px] leading-[18px]';
const ROTULO = 'block text-[10px] font-medium text-foreground';
const CAMPO = 'h-[24px] px-2 text-[11px]';
/* O slot da mensagem do campo: existe sempre, com ou sem mensagem. */
const SLOT = 'block h-[12px] overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] leading-[12px] text-destructive';

/** Campo de senha: `type="password"`, com "mostrar". Nunca nasce visivel. */
function CampoSenha({ valor, onMudar, invalido, testid, autoFocus, desabilitado }: {
  valor: string; onMudar: (v: string) => void; invalido?: boolean; testid: string; autoFocus?: boolean; desabilitado?: boolean;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <Input type={visivel ? 'text' : 'password'} value={valor} onChange={e => onMudar(e.target.value)} disabled={desabilitado}
        autoComplete="new-password" autoFocus={autoFocus} data-testid={testid} aria-invalid={invalido || undefined}
        placeholder={`mínimo ${SENHA_MINIMA} caracteres`}
        className={cn(CAMPO, 'pr-7', invalido && 'border-destructive')} />
      <button type="button" onClick={() => setVisivel(v => !v)} disabled={desabilitado}
        title={visivel ? 'ocultar a senha' : 'mostrar a senha'} aria-label={visivel ? 'ocultar a senha' : 'mostrar a senha'}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40">
        {visivel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function AcessosTab() {
  const { fazendas } = useFazenda();
  const { clienteAtual, isAdmin } = useCliente();
  const { user } = useAuth();

  const [membros, setMembros] = useState<Membro[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState(PERFIL_INICIAL);
  const [fazendasMarcadas, setFazendasMarcadas] = useState<string[]>([]);
  const [tentou, setTentou] = useState(false);
  const [criando, setCriando] = useState(false);
  const [recado, setRecado] = useState<{ tom: 'ok' | 'erro'; texto: string } | null>(null);

  const [alvoSenha, setAlvoSenha] = useState<Membro | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [alvoRemover, setAlvoRemover] = useState<Membro | null>(null);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [recadoDaLista, setRecadoDaLista] = useState<string | null>(null);

  const clienteId = clienteAtual?.id ?? null;
  const fazendaIds = fazendas.map(f => f.id).join(',');

  const carregar = useCallback(async () => {
    if (!clienteId) { setMembros([]); return; }
    setCarregando(true);
    setErroDaLista(null);
    try {
      const { data: linhas, error } = await supabase.from('cliente_membros')
        .select('id, user_id, perfil').eq('cliente_id', clienteId).eq('ativo', true);
      if (error) throw error;
      const ids = (linhas ?? []).map(m => m.user_id);
      if (ids.length === 0) { setMembros([]); return; }
      const { data: perfis, error: erroPerfis } = await supabase.from('profiles').select('user_id, nome, email').in('user_id', ids);
      if (erroPerfis) throw erroPerfis;
      const dePerfil = new Map((perfis ?? []).map(p => [p.user_id, p]));
      const idsDeFazenda = fazendaIds ? fazendaIds.split(',') : [];
      const nomeDaFazenda = new Map(fazendas.map(f => [f.id, f.nome]));
      const porUsuario = new Map<string, string[]>();
      if (idsDeFazenda.length > 0) {
        const { data: fm, error: erroFm } = await supabase.from('fazenda_membros')
          .select('user_id, fazenda_id').in('user_id', ids).in('fazenda_id', idsDeFazenda);
        if (erroFm) throw erroFm;
        for (const x of fm ?? []) {
          porUsuario.set(x.user_id, [...(porUsuario.get(x.user_id) ?? []), nomeDaFazenda.get(x.fazenda_id) ?? x.fazenda_id]);
        }
      }
      const lista = (linhas ?? []).map((m): Membro => ({
        id: m.id, user_id: m.user_id, perfil: m.perfil,
        nome: dePerfil.get(m.user_id)?.nome ?? null, email: dePerfil.get(m.user_id)?.email ?? null,
        fazendas: porUsuario.get(m.user_id) ?? [],
      }));
      lista.sort((a, b) => (a.nome ?? a.email ?? '').localeCompare(b.nome ?? b.email ?? '', 'pt-BR'));
      setMembros(lista);
    } catch {
      setErroDaLista('Não foi possível ler os acessos deste cliente.');
    } finally {
      setCarregando(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, fazendaIds]);

  useEffect(() => { void carregar(); }, [carregar]);
  /* Trocar de cliente limpa o formulario e os recados: nada digitado para um cliente vaza para o outro. */
  useEffect(() => {
    setNome(''); setEmail(''); setSenha(''); setPerfil(PERFIL_INICIAL); setFazendasMarcadas([]);
    setTentou(false); setRecado(null); setRecadoDaLista(null);
  }, [clienteId]);

  const pendencias = pendenciasDoNovoAcesso({ nome, email, senha, perfil, fazendas: fazendasMarcadas });
  const motivoDoFormulario = !clienteAtual ? FRASE_SEM_CLIENTE : !isAdmin ? FRASE_SO_ADMIN_NA_TELA : null;
  const formularioParado = motivoDoFormulario != null || criando;

  const criar = async () => {
    setTentou(true);
    setRecado(null);
    if (!clienteAtual || !isAdmin || Object.keys(pendencias).length > 0) return;
    setCriando(true);
    try {
      const res = await supabase.functions.invoke('criar-usuario', {
        body: { email: email.trim(), senha, nome: nome.trim(), cliente_id: clienteAtual.id, perfil, fazenda_ids: fazendasMarcadas },
      });
      const r = await lerRespostaDaFuncao(res, 'Não foi possível criar o acesso.');
      if (r.ok === false) { setRecado({ tom: 'erro', texto: r.frase }); return; }
      /* A senha sai da tela aqui e nao volta: nao e' exibida de novo em lugar nenhum. */
      setNome(''); setEmail(''); setSenha(''); setPerfil(PERFIL_INICIAL); setFazendasMarcadas([]); setTentou(false);
      setRecado({ tom: 'ok', texto: r.loginExistente ? FRASE_LOGIN_EXISTENTE : FRASE_CRIADO });
      await carregar();
    } catch {
      setRecado({ tom: 'erro', texto: 'Não foi possível criar o acesso.' });
    } finally {
      setCriando(false);
    }
  };

  const redefinir = async () => {
    if (!alvoSenha) return;
    if (novaSenha.length < SENHA_MINIMA) { setErroSenha(`Mínimo de ${SENHA_MINIMA} caracteres.`); return; }
    setOcupado(true); setErroSenha(null);
    try {
      const res = await supabase.functions.invoke('redefinir-senha', { body: { user_id: alvoSenha.user_id, nova_senha: novaSenha } });
      const r = await lerRespostaDaFuncao(res, 'Não foi possível redefinir a senha.');
      if (r.ok === false) { setErroSenha(r.frase); return; }
      setRecadoDaLista(`Senha de ${alvoSenha.nome ?? alvoSenha.email ?? 'usuário'} redefinida. Passe a senha nova por um canal separado do e-mail.`);
      setAlvoSenha(null); setNovaSenha('');
    } catch {
      setErroSenha('Não foi possível redefinir a senha.');
    } finally {
      setOcupado(false);
    }
  };

  const remover = async () => {
    if (!alvoRemover) return;
    setOcupado(true); setErroRemover(null);
    try {
      const res = await supabase.functions.invoke('remover-membro', { body: { membro_id: alvoRemover.id } });
      const r = await lerRespostaDaFuncao(res, 'Não foi possível remover o acesso.');
      if (r.ok === false) { setErroRemover(r.frase); return; }
      setRecadoDaLista(`Acesso de ${alvoRemover.nome ?? alvoRemover.email ?? 'usuário'} removido.`);
      setAlvoRemover(null);
      await carregar();
    } catch {
      setErroRemover('Não foi possível remover o acesso.');
    } finally {
      setOcupado(false);
    }
  };

  const alternarFazenda = (id: string) =>
    setFazendasMarcadas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const todasMarcadas = fazendas.length > 0 && fazendasMarcadas.length === fazendas.length;
  const quem = (m: Membro) => m.nome ?? m.email ?? 'este usuário';
  const erroDe = (campo: keyof typeof pendencias) => (tentou ? pendencias[campo] ?? '' : '');

  return (
    <div className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-5xl flex-col bg-background" data-testid="tela-acessos">
      <div className="shrink-0 px-4 pb-1.5 pt-2">
        <h1 className="truncate text-[20px] font-bold leading-none tracking-tight text-foreground" data-testid="acessos-titulo"
          title={clienteAtual ? `Acessos de ${clienteAtual.nome}` : 'Acessos'}>
          {clienteAtual ? `Acessos de ${clienteAtual.nome}` : 'Acessos'}
        </h1>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {clienteAtual ? 'quem entra neste cliente e com qual perfil · o cliente é o do seletor do topo' : FRASE_SEM_CLIENTE}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 px-4 pb-3">
        {/* A LISTA — cabecalho preso; so' o corpo rola. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-md border" data-testid="acessos-rolagem">
            <table className="w-full table-fixed border-collapse">
              <colgroup>
                <col /><col style={{ width: 150 }} /><col style={{ width: 104 }} /><col style={{ width: 52 }} /><col style={{ width: 60 }} />
              </colgroup>
              <thead><tr>
                <th className={cn(TH, 'text-left')}>E-mail</th><th className={cn(TH, 'text-left')}>Nome</th>
                <th className={TH}>Perfil</th><th className={TH}>Situação</th><th className={TH} aria-label="ações" />
              </tr></thead>
              <tbody>
                {membros.length === 0 && (
                  <tr><td colSpan={5} className={cn(TD, 'text-center text-muted-foreground')} data-testid="acessos-vazio">
                    {!clienteAtual ? FRASE_SEM_CLIENTE : carregando ? 'Carregando…' : erroDaLista ?? 'Nenhum acesso neste cliente.'}
                  </td></tr>
                )}
                {membros.map((m, i) => {
                  const admin = ehAdminAgroinblue(m.perfil);
                  const proprio = m.user_id === user?.id;
                  const motivo = admin ? MOTIVO_LINHA_ADMIN : proprio ? MOTIVO_LINHA_PROPRIA : !isAdmin ? FRASE_SO_ADMIN_NA_TELA : null;
                  return (
                    <tr key={m.id} data-testid="linha-membro" data-user={m.user_id}
                      className={cn('border-t border-slate-100', i % 2 === 1 && 'bg-muted/30')}>
                      <td className={TD} title={m.email ?? 'sem e-mail no perfil'}>{m.email ?? '—'}</td>
                      <td className={TD} title={`${m.nome ?? 'sem nome'}${m.fazendas.length > 0 ? ` · fazendas: ${m.fazendas.join(', ')}` : ' · sem fazenda liberada'}`}>
                        {m.nome ?? '—'}
                      </td>
                      {/* A linha do admin do AGROinBLUE nao tem perfil de cliente nem acoes: as tres ultimas colunas viram a frase
                          (medido: a frase pede ~200px e a coluna Perfil tem 104). */}
                      {admin && (
                        <td colSpan={3} className={cn(TD, 'text-center text-muted-foreground')} title={MOTIVO_LINHA_ADMIN} data-testid="linha-admin">
                          {MOTIVO_LINHA_ADMIN}
                        </td>
                      )}
                      {!admin && <td className={cn(TD, 'text-center')} title={ROTULO_PERFIL[m.perfil] ?? m.perfil}>{ROTULO_PERFIL[m.perfil] ?? m.perfil}</td>}
                      {!admin && <td className={cn(TD, 'text-center text-[#15803d]')}>Ativo</td>}
                      {!admin && <td className={cn(TD, 'text-center')} data-testid="acoes-membro" title={motivo ?? undefined}>
                        {motivo == null && (
                          <span className="inline-flex items-center gap-1.5 align-middle">
                            <button type="button" title={`redefinir a senha de ${quem(m)}`} aria-label={`redefinir a senha de ${quem(m)}`}
                              onClick={() => { setAlvoSenha(m); setNovaSenha(''); setErroSenha(null); }}
                              className="text-muted-foreground hover:text-foreground"><KeyRound className="h-3 w-3" /></button>
                            <button type="button" title={`remover o acesso de ${quem(m)}`} aria-label={`remover o acesso de ${quem(m)}`}
                              onClick={() => { setAlvoRemover(m); setErroRemover(null); }}
                              className="text-destructive/80 hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                          </span>
                        )}
                      </td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Slot fixo do recado da lista (senha redefinida, acesso removido, erro de leitura). */}
          <div className={cn('h-[16px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-[16px]',
            erroDaLista ? 'text-destructive' : 'text-[#15803d]')} data-testid="acessos-recado-lista"
            title={erroDaLista ?? recadoDaLista ?? undefined}>
            {membros.length > 0 ? erroDaLista ?? recadoDaLista ?? '' : ''}
          </div>
        </div>

        {/* O FORMULARIO — largura fixa; cada campo tem o seu slot de mensagem. */}
        <form className="flex w-[292px] shrink-0 flex-col rounded-md border bg-card px-3 py-2" noValidate data-testid="acessos-form"
          onSubmit={e => { e.preventDefault(); void criar(); }}>
          <div className="mb-1 text-[12px] font-semibold text-foreground">Novo acesso</div>
          <label className={ROTULO}>Nome *
            <Input value={nome} onChange={e => setNome(e.target.value)} disabled={formularioParado} data-testid="acesso-nome"
              className={cn(CAMPO, erroDe('nome') && 'border-destructive')} />
          </label>
          <span className={SLOT} data-testid="erro-nome">{erroDe('nome')}</span>
          <label className={ROTULO}>E-mail (login) *
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={formularioParado} autoComplete="off"
              data-testid="acesso-email" className={cn(CAMPO, erroDe('email') && 'border-destructive')} />
          </label>
          <span className={SLOT} data-testid="erro-email">{erroDe('email')}</span>
          <label className={ROTULO}>Senha provisória *
            <CampoSenha valor={senha} onMudar={setSenha} invalido={!!erroDe('senha')} testid="acesso-senha" desabilitado={formularioParado} />
          </label>
          <span className={SLOT} data-testid="erro-senha">{erroDe('senha')}</span>
          <div className={ROTULO}>Perfil *
            <Select value={perfil} onValueChange={setPerfil} disabled={formularioParado}>
              <SelectTrigger className={cn(CAMPO, 'w-full')} data-testid="acesso-perfil"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERFIS_DA_TELA.map(p => (
                  <SelectItem key={p.valor} value={p.valor} disabled={p.motivo != null} title={p.motivo ?? undefined}
                    data-testid={`perfil-${p.valor}`}>
                    {p.motivo ? `${p.rotulo} · ${p.motivo}` : p.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className={SLOT} data-testid="erro-perfil">{erroDe('perfil')}</span>
          <div className="flex items-center justify-between">
            <span className={ROTULO}>Fazendas liberadas *</span>
            <button type="button" disabled={formularioParado || fazendas.length === 0}
              onClick={() => setFazendasMarcadas(todasMarcadas ? [] : fazendas.map(f => f.id))}
              className="text-[9.5px] text-primary underline disabled:opacity-40">
              {todasMarcadas ? 'desmarcar todas' : 'marcar todas'}
            </button>
          </div>
          {/* Altura fixa: a lista de fazendas rola por dentro. */}
          <div className={cn('h-[74px] shrink-0 overflow-y-auto rounded-md border px-1.5 py-1', erroDe('fazendas') && 'border-destructive')}
            data-testid="acesso-fazendas">
            {fazendas.length === 0
              ? <span className="text-[10px] text-muted-foreground">Nenhuma fazenda neste cliente.</span>
              : fazendas.map(f => (
                <label key={f.id} className="flex h-[16px] cursor-pointer items-center gap-1.5 text-[10px]">
                  <Checkbox className="h-3 w-3" checked={fazendasMarcadas.includes(f.id)} disabled={formularioParado}
                    onCheckedChange={() => alternarFazenda(f.id)} />
                  <span className="truncate" title={f.nome}>{f.nome}</span>
                </label>
              ))}
          </div>
          <span className={SLOT} data-testid="erro-fazendas">{erroDe('fazendas')}</span>
          {/* O botao e, AO LADO dele, o que aconteceu — erro do banco, sucesso ou o motivo de estar parado. */}
          <div className="mt-0.5 flex h-[50px] shrink-0 items-start gap-2">
            <Button type="submit" size="sm" disabled={formularioParado} className="h-[24px] shrink-0 px-2.5 text-[11px]" data-testid="acesso-criar">
              {criando ? 'Criando…' : 'Criar acesso'}
            </Button>
            <span className={cn('min-w-0 flex-1 overflow-hidden text-[9.5px] leading-[12px]',
              motivoDoFormulario || recado?.tom === 'erro' ? 'text-destructive' : 'text-[#15803d]',
              motivoDoFormulario && 'text-muted-foreground')}
              data-testid="acesso-recado" role="status" aria-live="polite" title={motivoDoFormulario ?? recado?.texto ?? undefined}>
              {motivoDoFormulario ?? recado?.texto ?? ''}
            </span>
          </div>
        </form>
      </div>

      {/* REDEFINIR SENHA — dialogo de tamanho fixo; o erro fica escrito ao lado do botao. */}
      <Dialog open={alvoSenha != null} onOpenChange={o => { if (!o && !ocupado) { setAlvoSenha(null); setNovaSenha(''); setErroSenha(null); } }}>
        <DialogContent className="h-[176px] w-[380px] max-w-[380px] gap-0 p-3" data-testid="dialogo-senha">
          <DialogTitle className="truncate text-[13px] font-semibold" title={alvoSenha ? `Redefinir a senha de ${quem(alvoSenha)}` : undefined}>
            Redefinir a senha de {alvoSenha ? quem(alvoSenha) : ''}
          </DialogTitle>
          <p className="mt-1 truncate text-[10px] text-muted-foreground" title={alvoSenha?.email ?? undefined}>
            {alvoSenha?.email ?? 'sem e-mail no perfil'}{clienteAtual ? ` · ${clienteAtual.nome}` : ''}
          </p>
          <label className={cn(ROTULO, 'mt-2')}>Senha nova *
            <CampoSenha valor={novaSenha} onMudar={v => { setNovaSenha(v); setErroSenha(null); }} invalido={!!erroSenha}
              testid="senha-nova" autoFocus desabilitado={ocupado} />
          </label>
          <div className="mt-2 flex h-[40px] items-start gap-2">
            <Button size="sm" className="h-[24px] shrink-0 px-2.5 text-[11px]" disabled={ocupado} onClick={() => { void redefinir(); }} data-testid="senha-confirmar">
              {ocupado ? 'Redefinindo…' : 'Redefinir'}
            </Button>
            <Button size="sm" variant="outline" className="h-[24px] shrink-0 px-2.5 text-[11px]" disabled={ocupado}
              onClick={() => { setAlvoSenha(null); setNovaSenha(''); setErroSenha(null); }}>Cancelar</Button>
            <span className="min-w-0 flex-1 overflow-hidden text-[9.5px] leading-[12px] text-destructive" data-testid="senha-erro" role="alert"
              title={erroSenha ?? undefined}>{erroSenha ?? ''}</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* REMOVER — confirmacao no padrao da casa, dizendo QUEM e DE QUAL CLIENTE. */}
      <AlertDialog open={alvoRemover != null} onOpenChange={o => { if (!o && !ocupado) { setAlvoRemover(null); setErroRemover(null); } }}>
        <AlertDialogContent className="max-w-[420px]" data-testid="dialogo-remover">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px]">Remover o acesso?</AlertDialogTitle>
            <AlertDialogDescription className="text-[11px]">
              {alvoRemover ? `${quem(alvoRemover)}${alvoRemover.email && alvoRemover.nome ? ` (${alvoRemover.email})` : ''}` : ''} deixa de entrar em{' '}
              <b>{clienteAtual?.nome ?? 'este cliente'}</b>. O login continua existindo; só o acesso a este cliente é removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="h-[24px] overflow-hidden text-[10px] leading-[12px] text-destructive" data-testid="remover-erro" role="alert">{erroRemover ?? ''}</div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ocupado} className="h-[26px] text-[11px]">Cancelar</AlertDialogCancel>
            <Button variant="destructive" size="sm" className="h-[26px] text-[11px]" disabled={ocupado} onClick={() => { void remover(); }} data-testid="remover-confirmar">
              {ocupado ? 'Removendo…' : 'Remover o acesso'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
