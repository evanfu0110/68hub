import {
  Anthropic,
  Cohere,
  DeepSeek,
  Google,
  Grok,
  Hunyuan,
  Meta,
  Microsoft,
  Minimax,
  Mistral,
  Moonshot,
  OpenAI,
  Qwen,
  XiaomiMiMo,
  ZeroOne,
  Zhipu,
} from '@lobehub/icons';
import type { IconType } from '@lobehub/icons';

const map: [RegExp, IconType][] = [
  [/qwen/i, Qwen.Color],
  [/deepseek/i, DeepSeek.Color],
  [/kimi|k2|moonshot/i, Moonshot],
  [/glm|zhipu|chatglm/i, Zhipu.Color],
  [/hy3|hunyuan/i, Hunyuan.Color],
  [/mimo/i, XiaomiMiMo],
  [/minimax/i, Minimax.Color],
  [/gpt|o1|o3|chatgpt|openai|dall-e|whisper|tts|embed/i, OpenAI],
  [/claude|anthropic/i, Anthropic],
  [/gemini|gemma/i, Google.Color],
  [/llama|meta/i, Meta.Color],
  [/mistral/i, Mistral.Color],
  [/cohere|command/i, Cohere.Color],
  [/yi-/i, ZeroOne.Color],
  [/phi/i, Microsoft.Color],
  [/grok/i, Grok],
];

function matchIcon(model: string): IconType | null {
  for (const [re, icon] of map) {
    if (re.test(model)) return icon;
  }
  return null;
}

export function ModelIcon({ model, className = 'w-4 h-4' }: { model: string; className?: string }) {
  const Icon = matchIcon(model);
  if (!Icon) {
    return (
      <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-label={model} role="img">
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
        <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return <Icon className={`${className} shrink-0`} aria-label={model} title={model} />;
}
