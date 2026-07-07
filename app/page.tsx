import Link from "next/link";
import { Nav } from "./components/Nav";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-950 px-6 py-16 font-sans text-zinc-100">
      <main className="w-full max-w-lg">
        <Nav />
        <span className="mb-4 inline-block rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-300">
          Savoir
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Slack knowledge platform</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Connect Slack, index your workspace messages into Neo4j, and ask the bot questions
          grounded in your team&apos;s conversations.
        </p>
        <Link
          href="/signin"
          className="mt-8 inline-flex rounded-lg bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-500"
        >
          Get started →
        </Link>
      </main>
    </div>
  );
}
