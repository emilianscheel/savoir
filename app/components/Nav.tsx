import Link from "next/link";

export function Nav() {
  return (
    <nav className="mb-8 flex flex-wrap gap-4 text-sm">
      <Link href="/" className="text-zinc-400 hover:text-zinc-100">
        Home
      </Link>
      <Link href="/signin" className="text-zinc-400 hover:text-zinc-100">
        Sign in
      </Link>
      <Link href="/onboarding" className="text-zinc-400 hover:text-zinc-100">
        Onboarding
      </Link>
      <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-100">
        Dashboard
      </Link>
    </nav>
  );
}
