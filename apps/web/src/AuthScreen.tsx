import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  confirmEmail,
  confirmEmailCode,
  emailTaken,
  loginAccount,
  registerAccount,
  requestPasswordReset,
  resendConfirmation,
  resetPassword,
  type SessionUser,
} from "./api";

const fieldClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition duration-200 focus:border-accent focus:ring-2 focus:ring-accent-soft";

const EMAIL_NOT_VERIFIED = "Confirme seu e-mail para entrar.";

type Mode = "login" | "register" | "forgot" | "reset" | "confirm";

function tokensFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    reset: params.get("reset")?.trim() ?? "",
    confirm: params.get("confirm")?.trim() ?? "",
  };
}

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: SessionUser) => void;
}) {
  const initial = tokensFromUrl();
  const [mode, setMode] = useState<Mode>(
    initial.confirm ? "confirm" : initial.reset ? "reset" : "login",
  );
  const [resetToken] = useState(initial.reset);
  const [confirmToken] = useState(initial.confirm);
  const [pendingEmail, setPendingEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(Boolean(initial.confirm));
  const [linkConfirmFailed, setLinkConfirmFailed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmStarted = useRef(false);

  useEffect(() => {
    if (!confirmToken || confirmStarted.current) return;
    confirmStarted.current = true;
    confirmEmail(confirmToken)
      .then((user) => {
        window.history.replaceState({}, "", window.location.pathname);
        onAuthenticated(user);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o e-mail.");
        setLinkConfirmFailed(true);
        setPending(false);
      });
  }, [confirmToken, onAuthenticated]);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === "forgot") {
        await requestPasswordReset(String(form.get("email") ?? ""));
        setNotice("Se o e-mail existir, você receberá as instruções.");
        return;
      }
      if (mode === "reset") {
        const password = String(form.get("password") ?? "");
        const confirmPassword = String(form.get("confirmPassword") ?? "");
        if (password !== confirmPassword) {
          throw new Error("As senhas não coincidem.");
        }
        const user = await resetPassword({ token: resetToken, password });
        window.history.replaceState({}, "", window.location.pathname);
        onAuthenticated(user);
        return;
      }
      if (mode === "confirm") {
        const email = pendingEmail || String(form.get("email") ?? "");
        const code = String(form.get("code") ?? "").replace(/\D/g, "");
        if (code.length === 6) {
          const user = await confirmEmailCode(email, code);
          onAuthenticated(user);
          return;
        }
        await resendConfirmation(email);
        setPendingEmail(email.trim());
        setNotice("Enviamos um novo código para o seu e-mail.");
        return;
      }
      if (mode === "register") {
        const result = await registerFromForm(form);
        setPendingEmail(String(form.get("email") ?? "").trim());
        go("confirm");
        if (result.mailSent) {
          setNotice("Enviamos um código de 6 dígitos para o seu e-mail.");
        } else {
          setError("Conta criada, mas o e-mail de confirmação não saiu. Use Reenviar código.");
        }
        return;
      }
      const email = String(form.get("email") ?? "");
      try {
        const user = await loginAccount({
          email,
          password: String(form.get("password") ?? ""),
        });
        onAuthenticated(user);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "";
        if (message === EMAIL_NOT_VERIFIED) {
          setPendingEmail(email.trim());
          go("confirm");
          setNotice("Sua conta ainda não foi confirmada. Use o código ou o link do e-mail de confirmação; qualquer um deles vale.");
          return;
        }
        throw cause;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível continuar.");
    } finally {
      setPending(false);
    }
  }

  const title =
    mode === "login"
      ? "Entrar"
      : mode === "register"
        ? "Criar conta"
        : mode === "forgot"
          ? "Esqueci a senha"
          : mode === "confirm"
            ? "Confirme seu e-mail"
            : "Nova senha";
  const subtitle =
    mode === "login"
      ? "Use o e-mail e a senha da sua conta."
      : mode === "register"
        ? "Cadastro individual: nome, e-mail, cargo e senha."
        : mode === "forgot"
          ? "Informe o e-mail da conta. Se ele existir, enviaremos um link."
          : mode === "confirm" && confirmToken && !linkConfirmFailed
            ? "Estamos confirmando o e-mail do link. Isso já libera o acesso."
            : mode === "confirm"
              ? "Digite o código de 6 dígitos do e-mail, ou entre de novo para receber outro."
              : "Defina uma senha nova para voltar a entrar.";

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <section className="relative hidden w-[42%] flex-col justify-between bg-ink px-10 py-10 text-white lg:flex">
        <div>
          <p className="text-2xl font-semibold tracking-tight">Adgenda</p>
          <p className="mt-2 text-sm text-accent-glow">Agenda de viagens corporativas</p>
        </div>
        <div className="space-y-4 text-sm leading-6 text-accent-glow/90">
          <p>Cada funcionário tem uma conta individual.</p>
          <p>Crie agendas, convide integrantes e acompanhe as viagens com histórico e notificações.</p>
        </div>
        <p className="text-[11px] text-accent-glow/80">
          Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com
        </p>
      </section>

      <section className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
          <p className="text-lg font-semibold lg:hidden">Adgenda</p>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>

          {mode === "login" || mode === "register" ? (
            <div className="mt-5 flex rounded-full bg-surface-muted p-1">
              <ModeButton active={mode === "login"} onClick={() => go("login")}>
                Entrar
              </ModeButton>
              <ModeButton active={mode === "register"} onClick={() => go("register")}>
                Criar conta
              </ModeButton>
            </div>
          ) : null}

          {mode === "confirm" && confirmToken && !linkConfirmFailed ? (
            <p className="mt-6 text-sm text-muted">Confirmando e-mail e liberando o acesso…</p>
          ) : null}

          <form
            ref={formRef}
            key={mode}
            className={mode === "confirm" && confirmToken && !linkConfirmFailed ? "hidden" : "mt-6 space-y-3"}
            onSubmit={onSubmit}
          >
            {mode === "register" ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Nome</span>
                  <input className={fieldClass} name="name" autoComplete="name" required minLength={2} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted">Cargo</span>
                  <input className={fieldClass} name="role" autoComplete="organization-title" required minLength={2} />
                </label>
              </>
            ) : null}

            {mode !== "reset" && !(mode === "confirm" && (pendingEmail || (confirmToken && !linkConfirmFailed))) ? (
              <label className="block text-sm">
                <span className="mb-1 block text-muted">E-mail</span>
                <input
                  className={fieldClass}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required={mode !== "confirm"}
                  defaultValue={pendingEmail}
                  onChange={() => {
                    if (error === "Já existe uma conta com este e-mail.") {
                      setError(null);
                    }
                  }}
                  onBlur={async (event) => {
                    if (mode !== "register") return;
                    try {
                      const result = await emailTaken(event.currentTarget.value);
                      if (result.taken) {
                        setError("Já existe uma conta com este e-mail.");
                      }
                    } catch {
                      /* o envio valida de novo */
                    }
                  }}
                />
              </label>
            ) : null}

            {mode === "confirm" && pendingEmail && !(confirmToken && !linkConfirmFailed) ? (
              <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">{pendingEmail}</p>
            ) : null}

            {mode === "confirm" && !(confirmToken && !linkConfirmFailed) ? (
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Código de 6 dígitos</span>
                <input
                  className={`${fieldClass} tracking-[0.4em]`}
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="000000"
                />
              </label>
            ) : null}

            {mode === "login" || mode === "register" || mode === "reset" ? (
              <label className="block text-sm">
                <span className="mb-1 block text-muted">{mode === "reset" ? "Nova senha" : "Senha"}</span>
                <input
                  className={fieldClass}
                  name="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={8}
                />
              </label>
            ) : null}

            {mode === "login" ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => go("forgot")}
                  className="text-xs text-accent transition duration-200 hover:underline"
                >
                  Esqueci a senha
                </button>
              </div>
            ) : null}

            {mode === "register" || mode === "reset" ? (
              <label className="block text-sm">
                <span className="mb-1 block text-muted">Confirmar senha</span>
                <input
                  className={fieldClass}
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </label>
            ) : null}

            {error ? (
              <p className="form-error rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{error}</p>
            ) : null}
            {notice ? (
              <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink">{notice}</p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              className="mt-2 w-full rounded-full bg-accent py-2.5 text-sm font-medium text-white transition duration-200 ease-[var(--ease-out-soft)] hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
            >
              {pending
                ? "Aguarde..."
                : mode === "login"
                  ? "Entrar"
                  : mode === "register"
                    ? "Criar conta"
                    : mode === "forgot"
                      ? "Enviar instruções"
                      : mode === "confirm" && confirmToken && !linkConfirmFailed
                        ? "Confirmando e-mail..."
                        : mode === "confirm"
                          ? "Confirmar código"
                          : "Salvar senha e entrar"}
            </button>
            {mode === "confirm" && confirmToken && linkConfirmFailed ? (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  setError(null);
                  setPending(true);
                  try {
                    const user = await confirmEmail(confirmToken);
                    window.history.replaceState({}, "", window.location.pathname);
                    onAuthenticated(user);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o e-mail.");
                  } finally {
                    setPending(false);
                  }
                }}
                className="w-full text-sm text-accent transition duration-200 hover:underline disabled:opacity-70"
              >
                Tentar o link de novo
              </button>
            ) : null}
            {mode === "confirm" && !(confirmToken && !linkConfirmFailed) ? (
              <button
                type="button"
                disabled={pending}
                onClick={async () => {
                  const form = formRef.current;
                  const email = pendingEmail || (form ? String(new FormData(form).get("email") ?? "") : "");
                  setError(null);
                  setPending(true);
                  try {
                    await resendConfirmation(email);
                    if (email.trim()) setPendingEmail(email.trim());
                    setNotice("Enviamos um novo código para o seu e-mail. Os anteriores continuam valendo.");
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "Não foi possível reenviar.");
                  } finally {
                    setPending(false);
                  }
                }}
                className="w-full text-sm text-accent transition duration-200 hover:underline disabled:opacity-70"
              >
                Reenviar código
              </button>
            ) : null}
          </form>

          {mode === "forgot" || mode === "reset" || mode === "confirm" ? (
            <button
              type="button"
              onClick={() => go("login")}
              className="mt-4 w-full text-center text-sm text-accent transition duration-200 hover:underline"
            >
              Voltar ao login
            </button>
          ) : null}

          <p className="mt-6 text-center text-[11px] text-muted">
            Desenvolvido por Victor Paschoal (alt: kodimier) kodimier@gmail.com
          </p>
        </div>
      </section>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition duration-200 ease-[var(--ease-out-soft)] ${
        active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

async function registerFromForm(form: FormData) {
  const password = String(form.get("password") ?? "");
  const confirmPassword = String(form.get("confirmPassword") ?? "");
  if (password !== confirmPassword) {
    throw new Error("As senhas não coincidem.");
  }
  return registerAccount({
    name: String(form.get("name") ?? ""),
    email: String(form.get("email") ?? ""),
    role: String(form.get("role") ?? ""),
    password,
  });
}
