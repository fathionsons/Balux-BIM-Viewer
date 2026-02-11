"use client";

import dynamic from "next/dynamic";

const AppShell = dynamic(
  () => import("../components/app-shell/AppShell").then((m) => m.AppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-screen items-center justify-center text-sm text-slate-600">
        Initializing viewer...
      </div>
    ),
  }
);

export default function HomePage() {
  return <AppShell />;
}
