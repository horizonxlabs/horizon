import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-950 p-6">
      <div
        aria-hidden="true"
        className="absolute -top-32 right-[-10vw] h-[480px] w-[480px] rounded-full bg-brand-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[-20vh] left-[-8vw] h-[420px] w-[420px] rounded-full bg-teal-400/10 blur-3xl"
      />
      <section className="relative flex w-full max-w-2xl flex-col items-center gap-5 text-center">
        <div className="relative mb-1 aspect-[16/7] w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-slate-900/60 shadow-2xl shadow-brand-950/40">
          <img
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            src="https://dash.gethorizon.org/creator/horizon-ai-coding-banner.webp"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-slate-950/10"
          />
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/70 px-3 py-2 shadow-lg backdrop-blur-md">
              <img
                alt="Horizon"
                className="h-5 w-auto"
                src="https://dash.gethorizon.org/creator/horizon-mark.png"
              />
              <span className="text-xs font-medium tracking-wide text-white">Horizon</span>
            </div>
          </div>
        </div>
        <Badge variant="outline" className="border-white/15 bg-white/5 tracking-wide text-slate-300 uppercase">
          Horizon AI is coding
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Your app will appear here soon
        </h1>
        <p className="text-base leading-relaxed text-slate-400 sm:text-lg">
          Horizon AI is turning your request into a working app. The live preview will appear
          automatically as soon as it&apos;s ready.
        </p>
        <div className="mt-2 grid w-full gap-3 text-left sm:grid-cols-2">
          <Card className="border-white/10 bg-white/5 text-slate-200 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-medium">Building your app</p>
              <p className="mt-1 text-xs text-slate-500">Writing your interface and features</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/5 text-slate-200 shadow-none">
            <CardContent className="p-4">
              <p className="text-sm font-medium">Preparing live preview</p>
              <p className="mt-1 text-xs text-slate-500">This page refreshes automatically</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
