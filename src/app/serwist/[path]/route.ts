import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    // If set to `false`, Serwist will attempt to use `esbuild-wasm`.
    useNativeEsbuild: true,
    // Serwist precaches all of public/ by default. Each phone uses at most one
    // of the 26 iOS startup images (src/lib/splash-screens.ts), and iOS fetches
    // that one itself, so precaching them would only download the other 25 to
    // every member's phone, Android included. The first entry is Serwist's
    // default, which a custom list replaces.
    globIgnores: ["**/node_modules/**/*", "public/splash/**"],
  });
