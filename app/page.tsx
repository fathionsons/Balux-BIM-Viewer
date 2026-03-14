import Image from "next/image";
import Link from "next/link";

const techStack = [
  "Next.js + TypeScript",
  "React + Tailwind CSS",
  "three.js",
  "@thatopen/components + @thatopen/components-front",
  "@thatopen/fragments + web-ifc",
  "three-mesh-bvh",
  "Zustand",
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(170deg,#f8fbfd_0%,#ecf4f3_52%,#e8f0f6_100%)] text-slate-800">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-10 md:px-10 md:py-14">
        <div className="rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_20px_55px_-35px_rgba(15,23,42,0.5)] backdrop-blur md:p-10">
          <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <section>
              <p className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Inspired by Dalux
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                BALUX BIM Viewer
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
                A clean and fast browser BIM experience for model navigation, sectioning, measuring, filtering, and
                property inspection.
              </p>
              <p className="mt-3 text-sm font-medium text-slate-700">By Fathi</p>
              <p className="mt-2 max-w-2xl text-xs text-slate-500 md:text-sm">
                Disclaimer: This is a non-commercial demonstration project inspired by BIM workflows and created to
                showcase my technical work. It is not affiliated with or endorsed by Dalux.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/viewer"
                  className="inline-flex items-center rounded-xl bg-[hsl(var(--balux-green))] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[hsl(var(--balux-green-strong))]"
                >
                  Enter Viewer
                </Link>
                <a
                  href="https://github.com/fathionsons/Balux-BIM-Viewer"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-xl bg-[hsl(var(--balux-blue-gray))] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[hsl(var(--balux-blue-gray)/0.88)]"
                >
                  View GitHub Repo
                </a>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-[linear-gradient(145deg,#f9fcff_0%,#edf5f8_100%)] p-4 shadow-inner md:p-5">
              <Image
                src="/BaluxwithBackground.png"
                alt="Balux logo"
                width={1200}
                height={675}
                className="h-auto w-full rounded-xl border border-slate-200 object-cover"
                priority
              />
            </section>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-[0_20px_55px_-35px_rgba(15,23,42,0.5)] backdrop-blur md:p-10">
          <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">Tech Stack Used In This Tool</h2>
          <p className="mt-2 text-sm text-slate-600">
            Built for reliable BIM performance in modern browsers using a focused 3D and web stack.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {techStack.map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 md:text-sm"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
