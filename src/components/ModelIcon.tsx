const map: [RegExp, string][] = [
  [/qwen/i, 'qwen'],
  [/deepseek/i, 'deepseek'],
  [/kimi|k2|moonshot/i, 'moonshotai'],
  [/glm|zhipu|chatglm/i, '__fallback__zhipuai.cn'],
  [/mimo/i, 'xiaomi'],
  [/minimax/i, 'minimax'],
  [/gpt|o1|o3|chatgpt|openai|dall-e|whisper|tts|embed/i, 'openai'],
  [/claude|anthropic/i, 'anthropic'],
  [/gemini|gemma/i, 'google'],
  [/llama|meta/i, 'meta'],
  [/mistral/i, 'mistral'],
  [/cohere|command/i, 'cohere'],
  [/yi-/i, '01'],
  [/phi/i, 'microsoft'],
  [/grok/i, '__fallback__x.ai'],
];

function matchIcon(model: string): string | null {
  for (const [re, slug] of map) {
    if (re.test(model)) return slug;
  }
  return null;
}

export function ModelIcon({ model, className = 'w-4 h-4' }: { model: string; className?: string }) {
  const slug = matchIcon(model);
  if (!slug) return null;

  if (slug.startsWith('__fallback__')) {
    const domain = slug.replace('__fallback__', '');
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
        className={`${className} shrink-0`}
        alt={model}
        title={model}
        loading="lazy"
      />
    );
  }

  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}`}
      className={`${className} shrink-0`}
      alt={model}
      title={model}
      loading="lazy"
    />
  );
}
