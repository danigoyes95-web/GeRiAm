"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { SerwistProvider } from "@serwist/turbopack/react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 2 },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </SerwistProvider>
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "!bg-surface-1 !border-border !text-fg !shadow-panel",
            description: "!text-fg-muted",
          },
        }}
      />
    </QueryClientProvider>
  );
}
