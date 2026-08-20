import { Link } from "@tanstack/react-router";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-10 w-16 animate-pulse rounded-full bg-ink/10" />;
  }
  if (user) {
    const label = user.displayName ?? user.primaryEmail ?? "家长";
    return (
      <div className="flex items-center gap-2">
        {user.profileImageUrl ? (
          <img src={user.profileImageUrl} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-cinnabar text-sm text-panel">
            {label.slice(0, 1)}
          </span>
        )}
        {authEnabled && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm text-ink-soft underline-offset-4 hover:underline"
          >
            退出
          </button>
        )}
      </div>
    );
  }
  return (
    <Link
      to="/login"
      className="rounded-full border border-line bg-panel/80 px-3 py-2 text-sm text-ink-soft transition-transform duration-150 ease-out hover:bg-panel active:scale-[0.96]"
    >
      家长
    </Link>
  );
}
