/** Server-only call site: imported by API routes, never by the dashboard. */
export function modelConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? '';
  const timeout = Number(process.env.FARSIGHT_LLM_TIMEOUT_MS ?? 18000);
  return {
    provider: 'openai' as const,
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    apiKey,
    enabled: process.env.FARSIGHT_AI_MODE !== 'local' && !!apiKey && apiKey !== 'your_api_key_here',
    timeoutMs: Number.isInteger(timeout) && timeout >= 1 && timeout <= 60000 ? timeout : 18000,
  };
}
export function modelConfigured(): boolean { return modelConfig().enabled; }
/** Only unusable content is repairable; outages, refusals and timeouts fall back immediately. */
export class ModelOutputError extends Error {}
export class ModelServiceError extends Error {}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export async function structuredModelOutput(
  name: string, schema: Record<string, unknown>, instructions: string, input: string,
): Promise<unknown> {
  const config = modelConfig();
  if (!config.enabled) throw new ModelServiceError('Model is not configured');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Bound the entire operation, including body reads, even if a transport ignores abort.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new ModelServiceError('Model request timed out'));
      controller.abort();
    }, config.timeoutMs);
  });
  const request = async () => {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.model, store: false, instructions, input, max_output_tokens: 2200,
          text: { format: { type: 'json_schema', name, strict: true, schema } },
        }),
      });
    } catch { throw new ModelServiceError('Model service unavailable'); }
    if (!response.ok) throw new ModelServiceError(`Model service unavailable (HTTP ${response.status})`);
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new ModelOutputError('Model returned malformed JSON'); }
    if (!record(result) || result.status !== 'completed' || !Array.isArray(result.output)) {
      throw new ModelOutputError('Model response was incomplete or malformed');
    }
    const content = result.output.filter(record).filter(item => item.type === 'message')
      .flatMap(item => Array.isArray(item.content) ? item.content : []).filter(record);
    if (content.some(item => item.type === 'refusal')) throw new ModelServiceError('Model declined the request');
    const output = content.filter(item => item.type === 'output_text' && typeof item.text === 'string')
      .map(item => item.text).join('');
    if (!output) throw new ModelOutputError('Model returned no structured response');
    try { return JSON.parse(output) as unknown; }
    catch { throw new ModelOutputError('Model returned invalid structured JSON'); }
  };
  try { return await Promise.race([request(), deadline]); }
  finally { clearTimeout(timer); }
}
