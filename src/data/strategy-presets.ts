import type { Strategy } from '../types/index.ts';
import { deepFreeze } from './immutable.ts';

export interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  selections: Strategy;
}

/** Fixed, editable starting portfolios; all use the same official district baseline. */
export const STRATEGY_PRESETS = deepFreeze([
  { id: 'mobility', name: 'Industrial-Mobility', description: 'Bus lanes in Esil, smart signals, safer crossings and reliable city services.', selections: [
    { measureId: 'M1', districtId: 'esil' }, { measureId: 'M2' }, { measureId: 'M11', districtId: 'almaty' }, { measureId: 'M12' }, { measureId: 'M14' },
  ] },
  { id: 'green', name: 'Green Growth', description: 'Cleaner fuel and parks in Saryarka, sports, digital services and emergency teams.', selections: [
    { measureId: 'M4', districtId: 'saryarka' }, { measureId: 'M5', districtId: 'saryarka' }, { measureId: 'M14' }, { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' },
  ] },
  { id: 'social', name: 'Social wellbeing', description: 'Schools and healthcare in Nura with safe streets and accessible services.', selections: [
    { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M11', districtId: 'nura' }, { measureId: 'M12' },
  ] },
  { id: 'safety', name: 'Safety', description: 'Lighting in Baikonur, crossings in Almaty and coordinated traffic control.', selections: [
    { measureId: 'M10', districtId: 'baikonur' }, { measureId: 'M11', districtId: 'almaty' }, { measureId: 'M2' }, { measureId: 'M9', districtId: 'baikonur' }, { measureId: 'M12' },
  ] },
  { id: 'utilities', name: 'Utilities and services', description: 'Renew Almaty networks, strengthen emergency response and clean Saryarka air.', selections: [
    { measureId: 'M13', districtId: 'almaty' }, { measureId: 'M14' }, { measureId: 'M5', districtId: 'saryarka' }, { measureId: 'M10', districtId: 'baikonur' }, { measureId: 'M9', districtId: 'nura' },
  ] },
  { id: 'lrt', name: 'LRT and city connections', description: 'LRT in Almaty, smart signals and city-wide greening, supported by sports and services.', selections: [
    { measureId: 'M3', districtId: 'almaty' }, { measureId: 'M2' }, { measureId: 'M6' }, { measureId: 'M9', districtId: 'nura' }, { measureId: 'M12' },
  ] },
  { id: 'families', name: 'Esil family neighbourhoods', description: 'Schools, healthcare and safer streets for families in Esil.', selections: [
    { measureId: 'M7', districtId: 'esil' }, { measureId: 'M8', districtId: 'esil' }, { measureId: 'M10', districtId: 'esil' }, { measureId: 'M11', districtId: 'esil' }, { measureId: 'M12' },
  ] },
  { id: 'nura', name: 'Nura catch-up', description: 'Close school, healthcare and bus-access gaps in Nura with reliable utilities.', selections: [
    { measureId: 'M1', districtId: 'nura' }, { measureId: 'M7', districtId: 'nura' }, { measureId: 'M8', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M14' },
  ] },
  { id: 'clean-air', name: 'Clean air and warm homes', description: 'Clean fuel and windbreaks for Saryarka alongside modern Almaty utilities.', selections: [
    { measureId: 'M5', districtId: 'saryarka' }, { measureId: 'M6' }, { measureId: 'M13', districtId: 'almaty' }, { measureId: 'M9', districtId: 'saryarka' }, { measureId: 'M12' },
  ] },
  { id: 'active', name: 'Active green neighbourhoods', description: 'Parks, sports and safe routes in Almaty with city-wide greening.', selections: [
    { measureId: 'M4', districtId: 'almaty' }, { measureId: 'M6' }, { measureId: 'M9', districtId: 'almaty' }, { measureId: 'M10', districtId: 'almaty' }, { measureId: 'M11', districtId: 'almaty' },
  ] },
  { id: 'resilient', name: 'Resilient city services', description: 'Emergency teams and digital requests, smart signals and safer Almaty streets.', selections: [
    { measureId: 'M12' }, { measureId: 'M14' }, { measureId: 'M2' }, { measureId: 'M10', districtId: 'almaty' }, { measureId: 'M11', districtId: 'almaty' },
  ] },
  { id: 'balanced', name: 'Balanced development', description: 'One initiative per sector: mobility, parks, schools, safety and utilities.', selections: [
    { measureId: 'M1', districtId: 'esil' }, { measureId: 'M4', districtId: 'saryarka' }, { measureId: 'M7', districtId: 'nura' }, { measureId: 'M10', districtId: 'baikonur' }, { measureId: 'M14' },
  ] },
] as const satisfies readonly StrategyPreset[]);


export function presetPrompt(preset: StrategyPreset): string {
  return `Create a ${preset.name} strategy.`;
}
