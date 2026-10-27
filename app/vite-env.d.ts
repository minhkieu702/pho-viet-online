// The one Vite build-time flag the app reads (replaced with a constant in the client and SSR bundles).
interface ImportMetaEnv { readonly SSR: boolean }
interface ImportMeta { readonly env: ImportMetaEnv }
// A module bundled as a Web Worker (Vite's ?worker import): the default export constructs it (game.ts' ruin planner).
declare module '*?worker' { const WorkerConstructor: { new (options?: { name?: string }): Worker }; export default WorkerConstructor; }
