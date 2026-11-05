/**
 * "Trocar senha" (ACESSO-CONVITE-01 PR 1, Gabriel 03/11 D5): a pessoa logada troca a própria senha.
 *   · pede a SENHA ATUAL e confere no Supabase antes de gravar (`signInWithPassword` com o e-mail de quem está logado): quem pega o
 *     computador destravado não troca a senha de ninguém;
 *   · a nova tem no mínimo 8 caracteres e não pode ser igual à atual (`pendenciasDaSenhaNova`, a MESMA regra da página do link);
 *   · todo erro fica NO CAMPO, em vermelho, com lugar reservado (UX-OBRIGATORIOS-01 / UX-TOAST-01); só o "Senha alterada." é aviso;
 *   · o gatilho é de quem monta (a barra do topo, que existe no computador E no celular).
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { KeyRound } from 'lucide-react';
import {
  FRASE_SENHA_ALTERADA, FRASE_SENHA_ATUAL_ERRADA, SENHA_MINIMA_NOVA, fraseDoErroDaSenha, pendenciasDaSenhaNova, temPendencia,
  type PendenciasDaSenha,
} from '@/lib/auth/senhaEConvite';

interface AlterarSenhaDialogProps {
  trigger?: React.ReactNode;
}

const ERRO_DO_CAMPO = 'mt-0.5 min-h-[14px] text-[11px] leading-[14px] text-destructive';

export function AlterarSenhaDialog({ trigger }: AlterarSenhaDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [pendencias, setPendencias] = useState<PendenciasDaSenha>({});
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const limpar = () => { setAtual(''); setNova(''); setConfirmar(''); setPendencias({}); setErro(null); };
  const mudarAberto = (v: boolean) => { if (gravando) return; setOpen(v); if (!v) limpar(); };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gravando) return;
    setErro(null);
    const p = pendenciasDaSenhaNova({ atual, nova, confirmar }, true);
    setPendencias(p);
    if (temPendencia(p)) return;
    const email = user?.email;
    if (!email) { setErro('Não consegui identificar o seu login. Saia e entre de novo.'); return; }
    setGravando(true);
    try {
      const conferida = await supabase.auth.signInWithPassword({ email, password: atual });
      if (conferida.error) {
        console.warn('[trocar-senha] conferir a atual', conferida.error.message);
        if (/invalid login credentials/i.test(conferida.error.message)) setPendencias({ atual: FRASE_SENHA_ATUAL_ERRADA });
        else setErro('Não consegui conferir a senha atual agora. Tente de novo em instantes.');
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: nova });
      if (error) { console.warn('[trocar-senha] gravar', error.message); setPendencias({ nova: fraseDoErroDaSenha(error.message) }); return; }
      toast.success(FRASE_SENHA_ALTERADA);
      setOpen(false);
      limpar();
    } finally {
      setGravando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={mudarAberto}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <KeyRound className="h-4 w-4" />
            Trocar senha
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm" data-testid="trocar-senha" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="text-[13px]">Trocar senha</DialogTitle>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-2" noValidate>
          <div>
            <Label htmlFor="senha-atual" className="text-[11px]">Senha atual</Label>
            <Input id="senha-atual" type="password" autoComplete="current-password" value={atual}
              onChange={(e) => { setAtual(e.target.value); setPendencias((x) => ({ ...x, atual: undefined })); }}
              className={pendencias.atual ? 'mt-0.5 h-8 border-destructive' : 'mt-0.5 h-8'} />
            <p className={ERRO_DO_CAMPO} data-testid="trocar-senha-erro-atual">{pendencias.atual ?? ''}</p>
          </div>
          <div>
            <Label htmlFor="senha-nova-logado" className="text-[11px]">Senha nova</Label>
            <Input id="senha-nova-logado" type="password" autoComplete="new-password" value={nova}
              onChange={(e) => { setNova(e.target.value); setPendencias((x) => ({ ...x, nova: undefined })); }}
              placeholder={`Mínimo ${SENHA_MINIMA_NOVA} caracteres`}
              className={pendencias.nova ? 'mt-0.5 h-8 border-destructive' : 'mt-0.5 h-8'} />
            <p className={ERRO_DO_CAMPO} data-testid="trocar-senha-erro-nova">{pendencias.nova ?? ''}</p>
          </div>
          <div>
            <Label htmlFor="senha-confirmar-logado" className="text-[11px]">Repita a senha nova</Label>
            <Input id="senha-confirmar-logado" type="password" autoComplete="new-password" value={confirmar}
              onChange={(e) => { setConfirmar(e.target.value); setPendencias((x) => ({ ...x, confirmar: undefined })); }}
              className={pendencias.confirmar ? 'mt-0.5 h-8 border-destructive' : 'mt-0.5 h-8'} />
            <p className={ERRO_DO_CAMPO} data-testid="trocar-senha-erro-confirmar">{pendencias.confirmar ?? ''}</p>
          </div>
          {/* a faixa do erro geral: lugar reservado (nada se desloca quando ela aparece) */}
          <p className="min-h-[16px] text-[11px] leading-[16px] text-destructive" data-testid="trocar-senha-erro">{erro ?? ''}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => mudarAberto(false)} disabled={gravando}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={gravando}>{gravando ? 'Aguarde…' : 'Trocar senha'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
