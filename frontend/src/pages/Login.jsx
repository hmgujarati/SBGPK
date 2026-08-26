import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Diamond } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/");
    } catch (e2) {
      setErr(apiError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden lg:block">
        <img
          src="https://images.pexels.com/photos/5912127/pexels-photo-5912127.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          alt="Diamond sorting"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-zinc-950/70" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <Diamond size={34} weight="fill" className="mb-5 text-[#B4975A]" />
          <h2 className="font-heading text-4xl font-bold leading-[1.05] tracking-tight">
            Every carat
            <br />
            accounted for.
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/60">
            Track kapan from marking to filling — sarine, laser sawing, shape cutting, ghat,
            polish, nats and filling, with live weight reconciliation.
          </p>
        </div>
      </div>

      <div className="flex items-center bg-[#FAFAFA] px-6 py-14 sm:px-14">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center bg-zinc-900 text-[#B4975A]">
              <Diamond size={17} weight="fill" />
            </span>
            <span className="font-heading text-base font-bold uppercase tracking-[0.18em]">
              Polki<span className="text-[#B4975A]">Track</span>
            </span>
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-zinc-500">Manufacturing control panel</p>

          <form onSubmit={submit} className="mt-7 space-y-4" data-testid="login-form">
            <div>
              <Label className="text-xs uppercase tracking-wider text-zinc-600">Email</Label>
              <Input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@polki.com"
                className="mt-1.5 h-11 rounded-none border-black/15 bg-white focus-visible:ring-2 focus-visible:ring-zinc-900"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-zinc-600">Password</Label>
              <Input
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 h-11 rounded-none border-black/15 bg-white focus-visible:ring-2 focus-visible:ring-zinc-900"
              />
            </div>
            {err && (
              <p data-testid="login-error" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#DC2626]">
                {err}
              </p>
            )}
            <Button
              data-testid="login-submit-button"
              type="submit"
              disabled={busy}
              className="h-11 w-full rounded-none bg-zinc-900 text-sm font-semibold uppercase tracking-widest transition-colors hover:bg-zinc-800"
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
