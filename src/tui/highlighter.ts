import { createHighlighter } from 'shiki'

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null
const highlightCache = new Map<string, Promise<string>>()

export async function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'json',
        'python',
        'rust',
        'go',
        'bash',
        'shell',
        'markdown',
        'css',
        'html',
        'sql',
        'yaml',
        'toml',
        'dockerfile',
      ],
    })
  }
  return highlighterPromise
}

export async function highlightCode(code: string, lang: string = 'text'): Promise<string> {
  const cacheKey = `${lang}:${code.length}:${hashString(code)}`
  const cached = highlightCache.get(cacheKey)
  if (cached) return cached

  const highlighted = highlightCodeUncached(code, lang)
  highlightCache.set(cacheKey, highlighted)
  return highlighted
}

async function highlightCodeUncached(code: string, lang: string): Promise<string> {
  try {
    const highlighter = await getHighlighter()
    const lines = highlighter.codeToTokensBase(code, {
      lang: (lang || 'text') as any,
      theme: 'github-dark',
    })

    return lines
      .map((line) =>
        line
          .map((token) => token.color ? `${hexToAnsi(token.color)}${token.content}\x1b[39m` : token.content)
          .join(''),
      )
      .join('\n')
  } catch (error) {
    // Fallback to plain text if highlighting fails
    return code
  }
}

function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function hexToAnsi(hex: string): string {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)

  if (Number.isNaN(value)) {
    return ''
  }

  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255

  return `\x1b[38;2;${red};${green};${blue}m`
}
