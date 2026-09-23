import type { Category, IndicatorCode } from '../types';
import { deepFreeze } from './immutable.ts';

export const STRATEGY_RULES = deepFreeze({
  budget: 100,
  requiredMeasureCount: 5,
  maxSelectionsPerMeasure: 1,
  maxMeasuresPerCategory: 2,
} as const);

export const CATEGORIES = deepFreeze([
  'Transport', 'Ecology', 'Social', 'Safety', 'Services',
] as const satisfies readonly Category[]);

export const INDICATOR_CODES = deepFreeze([
  'T1', 'T2', 'E1', 'E2', 'S1', 'S2', 'B1', 'B2', 'C1', 'C2',
] as const satisfies readonly IndicatorCode[]);

export const INDICATOR_WEIGHTS = deepFreeze({
  T1: 0.10, T2: 0.10, E1: 0.09, E2: 0.11, S1: 0.11,
  S2: 0.11, B1: 0.09, B2: 0.09, C1: 0.10, C2: 0.10,
} as const satisfies Readonly<Record<IndicatorCode, number>>);
