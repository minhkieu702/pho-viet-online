/**
 * Plans zombie mode's ruins off the main thread (game.ts prepareZombie): a packed RuinInput in, its packed RuinPlan out
 * (ruin-pack.ts: typed arrays moved, not cloned). planRuins is pure and deterministic, so every client's worker plans
 * the same ruins as a main-thread call would.
 */
import { planRuins } from './apocalypse.ts';
import { packPlan, planTransfer, unpackInput, type PackedInput } from './ruin-pack.ts';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<PackedInput>) => void) | null; postMessage(message: unknown, transfer: Transferable[]): void };
scope.onmessage = (event) => { const plan = packPlan(planRuins(unpackInput(event.data))); scope.postMessage(plan, planTransfer(plan)); };
