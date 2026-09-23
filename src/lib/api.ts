import { OfficialStrategyValidationError } from './official.ts';
import { OperationTimeoutError } from './integration.ts';
import type { Selection } from './simulator';

export class RequestError extends Error {}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    const body = await request.text();
    if (body.length > 16_000) throw new RequestError('Request is too large.');
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError('Send a valid JSON object.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError('Send a JSON object.');
  return value as Record<string, unknown>;
}
export function readText(value: unknown, name: string, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new RequestError(`${name} must contain 1–2000 characters.`);
  return value.trim();
}
export function readSelections(value: unknown): Selection[] {
  if (!Array.isArray(value) || value.length > 20) throw new RequestError('selectedMeasures must be an array of measure selections.');
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.measureId !== 'string' ||
      (item.districtId !== undefined && typeof item.districtId !== 'string')) throw new RequestError('Each selection requires a measureId and an optional districtId string.');
    return { measureId: item.measureId, ...(item.districtId !== undefined ? { districtId: item.districtId } : {}) };
  });
}
export function apiError(error: unknown): Response {
  if (error instanceof OperationTimeoutError) return Response.json({ error: error.message }, { status: 504 });
  if (error instanceof OfficialStrategyValidationError) return Response.json({ error: 'Strategy violates official rules.', validation: error.validation }, { status: 422 });
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ error: 'Unable to complete this operation. Please try again.' }, { status: 500 });
}
