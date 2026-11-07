/**
 * A tela de entrada. ACESSO-CONVITE-01 PR 1 (Gabriel 03/11, D1): o sistema é SÓ POR CONVITE — o "Criar conta" público saiu (o
 * cadastro público também foi desligado no painel do Supabase). Entrou o "Esqueci minha senha": o e-mail recebe um link para a
 * página `/definir-senha`. Todo erro fica NA TELA, sob o campo (UX-TOAST-01); a resposta do "esqueci" é sempre a mesma.
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import logo from '@/assets/logo.png';
import { FRASE_ESQUECI_ENVIADO, enderecoDeVolta, fraseDoErroDoLogin } from '@/lib/auth/senhaEConvite';

export default function AuthPage() {
  const { signIn } = useAuth();
  const [modo, setModo] = useState<'entrar' | 'esqueci'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const trocarModo = (m: 'entrar' | 'esqueci') => { setModo(m); setErro(null); setAviso(null); };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErro(null);
    if (!email.trim() || !password) { setErro('Digite o e-mail e a senha.'); return; }
    setLoading(true);
    try {
      const { error } = await signIn(email.trim(), password);
      if (error) { console.warn('[entrar]', error.message); setErro(fraseDoErroDoLogin(error.message)); }
    } finally {
      setLoading(false);
    }
  };

  const pedirLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErro(null); setAviso(null);
    if (!email.trim()) { setErro('Digite o seu e-mail.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDeVolta(window.location.origin) });
      /* a resposta é a MESMA com ou sem login para este e-mail (não revela quem está cadastrado); só o limite de envio vira erro */
      if (error && /rate|limit|too many/i.test(error.message)) { setErro('Muitos pedidos seguidos. Espere alguns minutos e tente de novo.'); return; }
      if (error) console.warn('[esqueci]', error.message);
      setAviso(FRASE_ESQUECI_ENVIADO);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" data-testid="tela-entrada">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <img src={logo} alt="AgroInBlue" className="h-20 mx-auto" />
          <h1 className="text-2xl font-extrabold text-foreground mt-2">Controle de Rebanho</h1>
          <p className="text-muted-foreground text-sm mt-1">{modo === 'entrar' ? 'Entre na sua conta' : 'Esqueci minha senha'}</p>
        </div>

        <form onSubmit={modo === 'entrar' ? entrar : pedirLink} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="entrada-email" className="font-bold text-foreground">E-mail</Label>
            <Input id="entrada-email" type="email" autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(null); }} placeholder="seu@email.com" className="mt-1" />
          </div>
          {modo === 'entrar' && (
            <div>
              <Label htmlFor="entrada-senha" className="font-bold text-foreground">Senha</Label>
              <Input id="entrada-senha" type="password" autoComplete="current-password" value={password}
                onChange={(e) => { setPassword(e.target.value); setErro(null); }} placeholder="••••••••" className="mt-1" />
            </div>
          )}
          {modo === 'esqueci' && (
            <p className="text-[12px] leading-[16px] text-muted-foreground">Vamos mandar um link para este e-mail. Pelo link você cria uma senha nova.</p>
          )}
          {/* a faixa do erro e do aviso: lugar reservado (nada se desloca quando ela aparece) */}
          <p className={`min-h-[32px] text-[12px] leading-[16px] ${erro ? 'text-destructive' : 'text-foreground'}`} data-testid="entrada-mensagem" role={erro ? 'alert' : undefined}>
            {erro ?? aviso ?? ''}
          </p>
          <Button type="submit" className="w-full font-bold touch-target" disabled={loading}>
            {loading ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Enviar o link'}
          </Button>
        </form>

        <p className="text-center text-sm">
          <button type="button" onClick={() => trocarModo(modo === 'entrar' ? 'esqueci' : 'entrar')} className="font-bold text-primary underline"
            data-testid="entrada-trocar-modo">
            {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para entrar'}
          </button>
        </p>
      </div>
    </div>
  );
}
