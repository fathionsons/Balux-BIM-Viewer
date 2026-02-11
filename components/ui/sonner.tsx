"use client";

import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "bg-white/95 border border-slate-200 text-slate-900 shadow-panel backdrop-blur",
          title: "font-medium",
          description: "text-slate-600",
          actionButton: "bg-slate-900 text-white",
          cancelButton: "bg-slate-100 text-slate-900",
        },
      }}
    />
  );
}

