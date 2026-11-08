import { createSerwistRoute } from "@serwist/turbopack";

// El service worker se sirve en /serwist/sw.js (alcance "/").
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/offline", revision: "1" }],
  // los chunks muy grandes (mapa) se cachean en tiempo de ejecución, no en la precarga
  maximumFileSizeToCacheInBytes: 700_000,
});
