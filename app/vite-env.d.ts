// The one Vite build-time flag the app reads (replaced with a constant in the client and SSR bundles).
interface ImportMetaEnv { readonly SSR: boolean }
interface ImportMeta { readonly env: ImportMetaEnv }
