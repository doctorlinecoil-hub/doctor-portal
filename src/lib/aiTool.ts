import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Asks the model for a structured answer through one tool. Newer models don't accept a forced tool choice,
 * so the tool is offered with "auto" and the prompt requires it; if the answer still comes back as text,
 * the JSON inside it is used.
 */
export async function askTool<T>(opts: { model: string; maxTokens: number; tool: Anthropic.Tool; content: Anthropic.ContentBlockParam[] }): Promise<T> {
  const client = new Anthropic();
  const content: Anthropic.ContentBlockParam[] = [
    ...opts.content,
    { type: 'text', text: `החזר את התשובה רק על ידי קריאה לכלי ${opts.tool.name}, פעם אחת, עם כל השדות. בלי טקסט נוסף.` },
  ];
  const msg = await client.messages
    .stream({ model: opts.model, max_tokens: opts.maxTokens, tools: [opts.tool], tool_choice: { type: 'auto' }, messages: [{ role: 'user', content }] })
    .finalMessage();
  const block = msg.content.find((b) => b.type === 'tool_use');
  if (block && block.type === 'tool_use') return block.input as T;
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { /* below */ }
  }
  throw new Error('לא התקבלה תשובה מובנית מה־AI. נסו שוב.');
}
