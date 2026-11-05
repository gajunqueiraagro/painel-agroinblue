/**
 * ACESSO-CONVITE-01 PR 1 — a página do LINK DO E-MAIL (`/definir-senha`): convite ("Crie a sua senha"), recuperação ("Crie uma nova
 * senha") e troca de e-mail ("Confirme o seu novo e-mail"). Fica FORA da guarda de login (o `AppRouter` a desenha antes do
 * `if (!user)`): quem chega pelo link ainda não tem senha.
 *   · o link SÓ É VERIFICADO NO CLIQUE (`verifyOtp` com o `token_hash`): o leitor de segurança do e-mail que "abre" o link antes não
 *     queima o convite;
 *   · sem `token_hash` mas já logado (um link antigo, do fluxo implícito, que já criou a sessão) = só grava a senha nova;
 *   · todo erro fica NA PÁGINA, no campo ou na faixa (UX-TOAST-01); o texto cru do Supabase vai para o console.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '@/assets/logo.png';
import {
  FRASE_LINK_INCOMPLETO, SENHA_MINIMA_NOVA, fraseDoErroDaSenha, fraseDoErroDoLink, lerLinkDoEmail, pendenciasDaSenhaNova,
  temPendencia, textosDoLink, type PendenciasDaSenha,
} from '@/lib/auth/senhaEConvite';

export default function DefinirSenhaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const link = useMemo(() => lerLinkDoEmail(window.location.search), []);
  const tipo = link?.tipo ?? (user ? 'recovery' : null);
  const textos = textosDoLink(tipo);
  const pedeSenha = tipo !== 'email_change';
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [pendencias, setPendencias] = useState<PendenciasDaSenha>({});
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  /* o link é de uso único: verificado uma vez, a 2ª tentativa (a senha recusada) só grava a senha */
  const [verificado, setVerificado] = useState(false);
  const semLink = !link && !user;

  const entrarNoSistema = () => navigate('/', { replace: true });

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gravando || semLink) return;
    setErro(null);
    if (pedeSenha) {
      const p = pendenciasDaSenhaNova({ nova, confirmar });
      setPendencias(p);
      if (temPendencia(p)) return;
    }
    setGravando(true);
    try {
      if (link && !verificado) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.tipo });
        if (error) { console.warn('[definir-senha] verifyOtp', error.message); setErro(fraseDoErroDoLink(error.message)); return; }
        setVerificado(true);
      }
      if (pedeSenha) {
        const { error } = await supabase.auth.updateUser({ password: nova });
        if (error) { console.warn('[definir-senha] updateUser', error.message); setPendencias({ nova: fraseDoErroDaSenha(error.message) }); return; }
      }
      entrarNoSistema();
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="definir-senha">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={logo} alt="AgroInBlue" className="h-20 mx-auto" />
          <h1 className="text-xl font-extrabold text-foreground mt-2">{semLink ? 'Link incompleto' : textos.titulo}</h1>
        </div>

        {semLink ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive" data-testid="definir-senha-erro">{FRASE_LINK_INCOMPLETO}</p>
            <Button type="button" className="w-full" onClick={entrarNoSistema}>Ir para a tela de entrada</Button>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4" noValidate>
            {pedeSenha && (<>
              <div>
                <Label htmlFor="senha-nova" className="font-bold text-foreground">Senha nova</Label>
                <Input id="senha-nova" type="password" autoComplete="new-password" value={nova}
                  onChange={(e) => { setNova(e.target.value); setPendencias((p) => ({ ...p, nova: undefined })); }}
                  placeholder={`Mínimo ${SENHA_MINIMA_NOVA} caracteres`} className={pendencias.nova ? 'mt-1 border-destructive' : 'mt-1'} />
                <p className="mt-0.5 min-h-[14px] text-[11px] leading-[14px] text-destructive" data-testid="definir-senha-erro-nova">{pendencias.nova ?? ''}</p>
              </div>
              <div>
                <Label htmlFor="senha-confirmar" className="font-bold text-foreground">Repita a senha nova</Label>
                <Input id="senha-confirmar" type="password" autoComplete="new-password" value={confirmar}
                  onChange={(e) => { setConfirmar(e.target.value); setPendencias((p) => ({ ...p, confirmar: undefined })); }}
                  className={pendencias.confirmar ? 'mt-1 border-destructive' : 'mt-1'} />
                <p className="mt-0.5 min-h-[14px] text-[11px] leading-[14px] text-destructive" data-testid="definir-senha-erro-confirmar">{pendencias.confirmar ?? ''}</p>
              </div>
            </>)}
            {/* a faixa do erro do link: lugar reservado (nada se desloca quando ela aparece) */}
            <p className="min-h-[32px] text-[11px] leading-[16px] text-destructive" data-testid="definir-senha-erro">{erro ?? ''}</p>
            <Button type="submit" className="w-full font-bold" disabled={gravando}>{gravando ? 'Aguarde…' : textos.botao}</Button>
          </form>
        )}
      </div>
    </div>
  );
}
