import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-sm rounded-[32px] bg-panel p-7 shadow-book">
        <p className="text-sm tracking-[0.3em] text-muted">家长中心</p>
        <h1 className="mt-1 font-display text-4xl text-cinnabar">登录</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          小朋友听故事不用登录。家长登录后，可以在这台设备上记下听过的书。
        </p>
        <div className="mt-6 space-y-3">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <button
                key={p.providerId}
                type="button"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
                className="h-12 w-full rounded-full border border-line bg-paper text-base text-ink transition-transform duration-150 ease-out hover:bg-paper-deep active:scale-[0.96]"
              >
                使用 {p.label} 继续
              </button>
            ))
          ) : (
            <p className="text-sm text-muted">登录已关闭。</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-6 block text-center text-sm text-ink-soft underline-offset-4 hover:underline"
        >
          回书架，先听故事
        </Link>
      </div>
    </main>
  );
}
