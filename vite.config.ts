import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { connectorPreview } from "./scripts/vite/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";
// Set D1_DATABASE_ID to deploy to your own Cloudflare account; Sites fills in the placeholder itself.
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID;

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  durable_objects: { bindings: [{ name: "ROOMS", class_name: "RealtimeRoom" }] },
  migrations: [{ tag: "v1-realtime-rooms", new_sqlite_classes: ["RealtimeRoom"] }],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: D1_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

/**
 * The P1 map worker (app/game/map/world-map-worker.ts, the client's `?worker` import in world-map-start.ts) is bundled
 * once, and Vite emits its script into every environment's output, the server's (rsc, ssr) too, where wrangler would
 * attach it to the Worker as two unused modules. Map generation must not ship in or run on the Worker (WIRING-PLAN §2):
 * the server bundles drop it; the client keeps it at /_next/static/.
 */
function clientOnlyMapWorker(): Plugin {
  return {
    name: "pvo:client-only-map-worker",
    apply: "build",
    applyToEnvironment: (environment) => environment.name !== "client",
    generateBundle(_options, bundle) {
      for (const file of Object.keys(bundle)) {
        if (/(^|\/)world-map-worker-[\w-]+\.js$/.test(file)) delete bundle[file];
      }
    },
  };
}

export default defineConfig(async ({ command }) => {
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      clientOnlyMapWorker(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./scripts/connector-preview/worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
