/** Only requests to perform a comparison open the picker; mentions stay in chat. */
export function comparisonIntent(message: string): { pair?: [string, string] } | null {
  const text = message.trim().replace(/[.!?]+$/, '').trim();
  const command = text.replace(/^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?/i, '')
    .replace(/^(?:(?:можешь|можете)\s+)?(?:пожалуйста[,\s]+)?/i, '');
  const direct = command.match(/^(?:compare\b|сравни(?:те)?(?=\s|$))\s*(.*)$/i);
  if (direct) {
    const pair = direct[1].match(/^(.+?)\s+(?:with|against|to|and|versus|vs\.?|с|и)\s+(.+)$/i);
    return pair ? { pair: [pair[1], pair[2]] } : {};
  }
  if (/^(?:open|start|create|show)(?:\s+me)?\s+(?:a\s+|the\s+)?comparison\b/i.test(command) ||
      /^(?:открой|начни|создай|покажи)\s+сравнение(?:\s|$)/i.test(command) ||
      /^(?:comparison|сравнение)$/i.test(command)) return {};
  const combined = command.match(/^(?:create|generate|build|design|создай|составь)\s+(.+?)\s+(?:and\s+compare\s+(?:it\s+)?(?:with|against|to)|и\s+сравни\s+с)\s+(.+)$/i);
  return combined ? { pair: [combined[1], combined[2]] } : null;
}
