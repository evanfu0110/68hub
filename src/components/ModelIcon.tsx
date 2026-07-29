type IconKey =
  | 'deepseek'
  | 'glm'
  | 'grok'
  | 'hy3'
  | 'kimi'
  | 'mimo'
  | 'minimax'
  | 'qwen'
  | 'generic';

const modelIconPatterns: Array<[RegExp, IconKey]> = [
  [/deepseek/i, 'deepseek'],
  [/glm|zhipu|chatglm/i, 'glm'],
  [/grok|xai|x\.ai/i, 'grok'],
  [/(?:^|[/_.-])hy3(?:$|[/_.-])/i, 'hy3'],
  [/kimi|moonshot|(?:^|[-_.])k[23](?:\b|[-_.])/i, 'kimi'],
  [/mimo/i, 'mimo'],
  [/minimax/i, 'minimax'],
  [/qwen/i, 'qwen'],
];

const legacyIconPatterns: Array<[RegExp, string]> = [
  [/gpt|o1|o3|chatgpt|openai|dall-e|whisper|tts|embed/i, 'openai'],
  [/claude|anthropic/i, 'anthropic'],
  [/gemini|gemma/i, 'google'],
  [/llama|meta/i, 'meta'],
  [/mistral/i, 'mistral'],
  [/cohere|command/i, 'cohere'],
  [/yi-/i, '01'],
  [/phi/i, 'microsoft'],
];

export const OPEN_CODE_GO_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.1',
  'glm-5.2',
  'grok-4.5',
  'hy3',
  'kimi-k2.6',
  'kimi-k2.7-code',
  'kimi-k3',
  'mimo-v2.5',
  'mimo-v2.5-pro',
  'minimax-m2.7',
  'minimax-m3',
  'qwen3.6-plus',
  'qwen3.7-max',
  'qwen3.7-plus',
] as const;

export function getModelIconKey(model: string): IconKey {
  for (const [pattern, icon] of modelIconPatterns) {
    if (pattern.test(model)) return icon;
  }
  return 'generic';
}

function getLegacyIconSlug(model: string): string | null {
  for (const [pattern, slug] of legacyIconPatterns) {
    if (pattern.test(model)) return slug;
  }
  return null;
}

function IconArtwork({ icon }: { icon: IconKey }) {
  switch (icon) {
    case 'deepseek':
      return (
        <>
          <path
            fill="#4D6BFE"
            d="M3.2 11.1c1.4.3 2.7.1 3.8-.8.9-.7 1.6-1.8 2-3.1.8 1.5 2.1 2.5 3.8 2.8 1.8.3 3.7-.1 5.3-1.1-.3 2.8-1.8 5.3-4.1 6.7-2.2 1.4-5 1.7-7.4.7-2.2-.9-3.6-2.8-3.4-5.2Z"
          />
          <path
            fill="none"
            stroke="#4D6BFE"
            strokeLinecap="round"
            strokeWidth="1.9"
            d="M7.3 9.8C6.2 8.3 4.6 7.7 3 8.1m12.7 1.4c.3-1.6 1.5-2.9 3.1-3.4"
          />
          <circle cx="14.6" cy="12.2" r="1" fill="white" />
        </>
      );
    case 'glm':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="#246BFE" />
          <path
            fill="none"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.25"
            d="M7.1 8.1 10 5.7h4l2.9 2.4-2.2 2.1M16.9 15.9 14 18.3h-4l-2.9-2.4 2.2-2.1m.4-3.1 4.6 2.6"
          />
        </>
      );
    case 'grok':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="#111111" />
          <path fill="white" d="M6.2 5.7h3.1l8.5 12.6h-3.1L6.2 5.7Zm8.7 0h2.9l-4.2 5.1-1.5-2.2 2.8-2.9ZM6.2 18.3l4.4-5.2 1.5 2.2-2.9 3H6.2Z" />
        </>
      );
    case 'hy3':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="#11A8A0" />
          <path
            fill="none"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6.7 7.2v9.6m0-4.8h5.1m0-4.8V12l2.7 2.4v2.4m2.8-9.6-5.5 4.8"
          />
        </>
      );
    case 'kimi':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="#101828" />
          <path fill="#6D8CFF" d="M15.9 5.6a7.2 7.2 0 1 0 2.5 10.7 6 6 0 1 1-2.5-10.7Z" />
          <circle cx="17.2" cy="8" r="1.2" fill="white" />
        </>
      );
    case 'mimo':
      return (
        <>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="#FF6900" />
          <path
            fill="none"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M6.3 16V9.7h5.2V16m-2.6 0v-3.8m6.5-2.5V16m2.3-6.3V16"
          />
        </>
      );
    case 'minimax':
      return (
        <>
          <circle cx="12" cy="12" r="10" fill="#F4F1FF" />
          <path
            fill="none"
            stroke="#7C3AED"
            strokeLinecap="round"
            strokeWidth="2.5"
            d="M5.5 14.8c1.4-4.5 3.2-6.7 5.3-6.7 3.1 0 2.7 7.8 5.2 7.8 1 0 1.8-1.1 2.5-3.2"
          />
          <circle cx="5.6" cy="14.7" r="1.3" fill="#FF4D8D" />
          <circle cx="18.5" cy="12.6" r="1.3" fill="#4D8DFF" />
        </>
      );
    case 'qwen':
      return (
        <>
          <circle cx="12" cy="12" r="2.2" fill="#615CED" />
          <g fill="none" stroke="#615CED" strokeWidth="1.8">
            <ellipse cx="12" cy="6.5" rx="3.2" ry="2.3" />
            <ellipse cx="12" cy="17.5" rx="3.2" ry="2.3" />
            <ellipse cx="6.8" cy="9.2" rx="3.2" ry="2.3" transform="rotate(-60 6.8 9.2)" />
            <ellipse cx="17.2" cy="14.8" rx="3.2" ry="2.3" transform="rotate(-60 17.2 14.8)" />
            <ellipse cx="17.2" cy="9.2" rx="3.2" ry="2.3" transform="rotate(60 17.2 9.2)" />
            <ellipse cx="6.8" cy="14.8" rx="3.2" ry="2.3" transform="rotate(60 6.8 14.8)" />
          </g>
        </>
      );
    default:
      return (
        <>
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="#EEF0F4" />
          <path
            fill="none"
            stroke="#7A8090"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            d="m9 8-4 4 4 4m6-8 4 4-4 4m-1.5-10-3 12"
          />
        </>
      );
  }
}

export function ModelIcon({ model, className = 'w-4 h-4' }: { model: string; className?: string }) {
  const icon = getModelIconKey(model);
  const legacySlug = icon === 'generic' ? getLegacyIconSlug(model) : null;

  if (legacySlug) {
    return (
      <span
        className={`${className} relative inline-flex shrink-0`}
        role="img"
        aria-label={`${model} icon`}
        title={model}
      >
        <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
          <IconArtwork icon="generic" />
        </svg>
        <img
          src={`https://cdn.simpleicons.org/${legacySlug}`}
          className="absolute inset-0 h-full w-full"
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </span>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} shrink-0`}
      role="img"
      aria-label={`${model} icon`}
    >
      <title>{model}</title>
      <IconArtwork icon={icon} />
    </svg>
  );
}
