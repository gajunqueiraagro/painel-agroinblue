/**
 * "Você não tem acesso a esta tela" — ACESSOS-02a. O molde da `V2NaoEncontrada`, dentro do shell.
 *
 * ⚠ ESCONDER O ITEM IMPEDE O CLIQUE, NAO O ENDERECO: a rota do `V2Index` consulta o mesmo dono do menu (`nivelDaTela`) e, quando
 *   a resposta e' 'nao', desenha ISTO no lugar da tela — por endereco digitado, parametro de URL ou navegacao interna.
 * ⚠ COM UM CAMINHO DE VOLTA: a primeira tela permitida para a pessoa. Sem nenhuma, diz isso e a quem pedir.
 */
interface Props {
  /** A primeira tela permitida (rotulo do menu) e como ir ate' ela. `null` = nenhuma tela liberada para o perfil. */
  primeira: { rotulo: string; ir: () => void } | null;
}

export default function V2SemAcesso({ primeira }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-background px-6 text-center" data-testid="sem-acesso">
      <span className="text-4xl" aria-hidden>🔒</span>
      <h1 className="text-[15px] font-medium text-foreground">Você não tem acesso a esta tela</h1>
      {primeira ? (
        <>
          <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
            Esta tela não está liberada para o seu perfil. Se você precisa dela, fale com o administrador.
          </p>
          <button type="button" onClick={primeira.ir}
            className="mt-1 rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90">
            Ir para {primeira.rotulo}
          </button>
        </>
      ) : (
        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground" data-testid="sem-acesso-nenhuma">
          Nenhuma tela liberada para o seu perfil. Fale com o administrador.
        </p>
      )}
    </div>
  );
}
