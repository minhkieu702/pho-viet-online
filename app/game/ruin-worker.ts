/**
 * Plans zombie mode's ruins off the main thread (game.ts prepareZombie): a RuinInput in, its RuinPlan out. planRuins is
 * pure and deterministic, so every client's worker plans the same ruins as a main-thread call would.
 */
import { planRuins, type RuinInput } from './apocalypse.ts';

const scope = globalThis as unknown as { onmessage: ((event: MessageEvent<RuinInput>) => void) | null; postMessage(message: unknown): void };
scope.onmessage = (event) => { scope.postMessage(planRuins(event.data)); };
