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
      <section className="relative flex max-w-xl flex-col items-center gap-6 text-center">
        <span className="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-slate-300 uppercase">
          Ready to build
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Your app starts here
        </h1>
        <p className="text-base leading-relaxed text-slate-400 sm:text-lg">
          Describe what you want in the chat and the AI will design and build it into this live
          page — screens, data, and all.
        </p>
        <div className="mt-2 grid w-full gap-3 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-slate-200">"Build a leave request app"</p>
            <p className="mt-1 text-xs text-slate-500">Forms, approvals, and a dashboard</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-medium text-slate-200">"สร้างระบบจองห้องประชุม"</p>
            <p className="mt-1 text-xs text-slate-500">Thai works too — try your own idea</p>
          </div>
        </div>
      </section>
    </main>
  );
}
