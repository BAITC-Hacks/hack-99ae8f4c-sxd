import type { Incompatibility, Synergy } from '../types';
import { deepFreeze } from './immutable.ts';

export const SYNERGIES = deepFreeze([
  { id: 'M1+M2', districtMeasureId: 'M1', cityMeasureId: 'M2', effects: [{ indicator: 'T1', delta: 2 }] },
  { id: 'M10+M12', districtMeasureId: 'M10', cityMeasureId: 'M12', effects: [{ indicator: 'B1', delta: 2 }] },
  { id: 'M5+M6', districtMeasureId: 'M5', cityMeasureId: 'M6', effects: [{ indicator: 'E2', delta: 2 }] },
] as const satisfies readonly Synergy[]);

export const INCOMPATIBILITIES = deepFreeze([
  { id: 'M1+M3', scope: 'anywhere', measureIds: ['M1', 'M3'] },
  { id: 'M4+M7', scope: 'same-district', measureIds: ['M4', 'M7'] },
  { id: 'M5+M13', scope: 'same-district', measureIds: ['M5', 'M13'] },
] as const satisfies readonly Incompatibility[]);
