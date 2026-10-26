/**
 * Compile-time check that the story UI's view types (app/story-ui/types.ts, self-contained on purpose) keep the
 * same vocabulary as the runner, the interrogation table and the stealth types. Type-only: nothing here exists
 * at run time and nothing imports it; `tsc --noEmit` fails on the line whose two sides drift apart.
 */
import type * as UI from '../../story-ui/types.ts';
import type { ChoiceStyle, Difficulty, EvidenceKind, Medal } from './types.ts';
import type { Approach, StatementView } from './interrogation.ts';
import type { AlarmLevel, CoverKind, Detection, Difficulty as StealthDifficulty, ZoneKind } from '../stealth-types.ts';
import type { StoryApi } from './host.ts';

type UiAct<T extends UI.StoryUiAction['type'], O = unknown> = Extract<UI.StoryUiAction, { type: T } & (O extends string ? { op: O } : unknown)>;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Sub<A, B> = [A] extends [B] ? true : false;
type Expect<T extends true> = T;

export type UiCompat = [
  Expect<Same<UI.Difficulty, Difficulty>>,
  Expect<Same<StealthDifficulty, Difficulty>>,
  Expect<Same<UI.Approach, Approach>>,
  Expect<Same<UI.ChoiceStyle, ChoiceStyle>>,
  Expect<Same<UI.Grade, Medal['grade']>>,
  /** The UI's evidence kinds are a superset of the runner's. */
  Expect<Sub<EvidenceKind, UI.EvidenceKind>>,
  Expect<Same<UI.InterrogationStatement['state'], StatementView['state']>>,
  Expect<Same<UI.CoverView['zone'], ZoneKind>>,
  Expect<Same<UI.CoverView['kind'], CoverKind>>,
  Expect<Same<UI.Detection, Detection>>,
  Expect<Same<UI.StealthView['alarm'], AlarmLevel>>,
  /** Every title kind the runner sends has a card. */
  Expect<Sub<'chapter' | 'time' | 'place', UI.CardKind>>,
  /** StoryLayer's onAction feeds engine.story.ui, and the actions carry what the StoryApi calls take. */
  Expect<Same<Parameters<StoryApi['ui']>[0], UI.StoryUiAction>>,
  Expect<Sub<[UiAct<'board', 'link'>['a'], UiAct<'board', 'link'>['b']], Parameters<StoryApi['link']>>>,
  Expect<Sub<[UiAct<'board', 'propose'>['hyp'], UiAct<'board', 'propose'>['cards']], Parameters<StoryApi['propose']>>>,
  Expect<Sub<[UiAct<'board', 'deduce'>['option']], Parameters<StoryApi['answer']>>>,
  Expect<Same<UiAct<'interrogation', 'present'>['approach'], Parameters<StoryApi['present']>[1]>>,
  Expect<Same<UiAct<'menu', 'new'>['difficulty'], Parameters<StoryApi['newGame']>[1]['difficulty']>>,
  Expect<Sub<[UiAct<'menu', 'replay'>['mission']], Parameters<StoryApi['replay']>>>,
];
