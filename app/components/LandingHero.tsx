"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingHero() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden
      >
        <source src="/shader.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-black/20" aria-hidden />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Savoir
          </h1>
          <p className="text-base text-white/80 sm:text-lg">
            Slack knowledge platform
          </p>
        </div>

        <Button
          variant="outline"
          className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          render={<Link href="/signin" />}
          nativeButton={false}
        >
          Sign in
        </Button>
      </div>
    </div>
  );
}
