import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    // If set to `false`, Serwist will attempt to use `esbuild-wasm`.
    useNativeEsbuild: true,
  });
