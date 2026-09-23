import { CATEGORIES } from '../data/rules.ts';
import { MEASURES } from '../data/measures.ts';
import { DISTRICTS } from '../data/districts.ts';
import { validateStrategy } from './validator.ts';
import type { StrategySelection } from './validator.ts';
import type { GeneratedStrategy } from '../types/product.ts';
import type { Strategy } from '../types/index.ts';

export function createManualStrategy(selections: readonly StrategySelection[], name = 'My city strategy'): GeneratedStrategy {
  const validation = validateStrategy(selections);
  if (!validation.valid) throw new Error(validation.errors.map(error => error.message).join(' '));
  const selectedMeasures = selections.map(selection => ({ ...selection })) as Strategy;
  return {
    id: selectedMeasures.map(s => `${s.measureId}:${s.districtId ?? 'city'}`).join('|'),
    name, description: 'Five decisions selected by you, checked against the official catalogue rules.',
    selectedMeasures, totalBudget: validation.totalCost,
    priorities: CATEGORIES.map(category => ({ category,
      weight: selections.filter(s => MEASURES.find(m => m.id === s.measureId)?.category === category).length / selections.length,
      rationale: 'Share of your five selected decisions.',
    })),
    targetedDistricts: [...new Set(selectedMeasures.flatMap(s => s.districtId ? [s.districtId] : DISTRICTS.map(d => d.id)))],
    generation: { mode: 'manual', repaired: false, note: 'User-selected measures and districts. The server validates them again before calculation.' },
  };
}
