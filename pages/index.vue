<script setup lang="ts">
const sampleJson = `{
  "project": "JSON Glow",
  "features": ["beautify", "validate", "minify", "copy", "download"],
  "theme": {
    "mode": "modern",
    "accent": "aurora"
  },
  "ready": true
}`

const input = ref(sampleJson)
const output = ref('')
const error = ref('')
const indent = ref(2)
const sortKeys = ref(false)
const copied = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const inputEditor = ref<HTMLTextAreaElement | null>(null)
const inputMirror = ref<HTMLElement | null>(null)

const highlightedInput = computed(() => highlightJson(input.value))
const highlightedOutput = computed(() => highlightJson(output.value))

const stats = computed(() => {
  const source = output.value || input.value
  return {
    chars: source.length.toLocaleString('en-US'),
    lines: source ? source.split('\n').length.toLocaleString('en-US') : '0',
    size: formatBytes(new Blob([source]).size)
  }
})

const statusLabel = computed(() => (error.value ? 'Invalid JSON' : output.value ? 'Valid JSON' : 'Ready'))
const statusClass = computed(() => (error.value ? 'is-error' : output.value ? 'is-valid' : 'is-idle'))

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const sizeIndex = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, sizeIndex)
  return `${size.toFixed(size >= 10 || sizeIndex === 0 ? 0 : 1)} ${units[sizeIndex]}`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function highlightJson(value: string) {
  const tokenPattern = /"(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\btrue\b|\bfalse\b|\bnull\b/g
  let highlighted = ''
  let lastIndex = 0

  value.replace(tokenPattern, (match, offset: number) => {
    const nextChunk = value.slice(offset + match.length)
    let tokenType = 'json-number'

    if (match.startsWith('"')) {
      tokenType = /^\s*:/.test(nextChunk) ? 'json-key' : 'json-string'
    } else if (match === 'true' || match === 'false') {
      tokenType = 'json-boolean'
    } else if (match === 'null') {
      tokenType = 'json-null'
    }

    highlighted += escapeHtml(value.slice(lastIndex, offset))
    highlighted += `<span class="${tokenType}">${escapeHtml(match)}</span>`
    lastIndex = offset + match.length
    return match
  })

  highlighted += escapeHtml(value.slice(lastIndex))
  return highlighted
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }

  return value
}

function parseInput() {
  try {
    const parsed = JSON.parse(input.value)
    const normalized = sortKeys.value ? sortObjectKeys(parsed) : parsed
    error.value = ''
    return normalized
  } catch (caught) {
    output.value = ''
    error.value = caught instanceof Error ? caught.message : 'Unable to parse JSON.'
    return null
  }
}

function beautifyJson() {
  const parsed = parseInput()
  if (parsed === null) return
  output.value = JSON.stringify(parsed, null, indent.value)
}

function minifyJson() {
  const parsed = parseInput()
  if (parsed === null) return
  output.value = JSON.stringify(parsed)
}

function clearJson() {
  input.value = ''
  output.value = ''
  error.value = ''
}

function loadSample() {
  input.value = sampleJson
  beautifyJson()
}

async function copyOutput() {
  const text = output.value || input.value
  if (!text) return

  await navigator.clipboard.writeText(text)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1600)
}

function downloadJson() {
  const text = output.value || input.value
  if (!text) return

  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'beautified.json'
  link.click()
  URL.revokeObjectURL(url)
}

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    input.value = String(reader.result || '')
    beautifyJson()
    target.value = ''
  }
  reader.readAsText(file)
}

function syncInputHighlightScroll() {
  if (!inputEditor.value || !inputMirror.value) return

  inputMirror.value.scrollTop = inputEditor.value.scrollTop
  inputMirror.value.scrollLeft = inputEditor.value.scrollLeft
}

watch([indent, sortKeys], () => {
  if (output.value && !error.value) {
    beautifyJson()
  }
})

onMounted(() => {
  beautifyJson()
})
</script>

<template>
  <main class="app-shell">
    <section class="workspace">
      <header class="topbar">
        <div class="brand-lockup">
          <img class="brand-logo" src="/favicon-jb.png" alt="JSON Glow logo">
          <div>
            <p class="eyebrow">Nuxt JSON toolkit</p>
            <h1>JSON Glow</h1>
          </div>
        </div>
        <div class="status-pill" :class="statusClass">
          <span />
          {{ statusLabel }}
        </div>
      </header>

      <section class="control-strip" aria-label="JSON controls">
        <button class="primary-action" type="button" @click="beautifyJson">
          Beautify
        </button>
        <button type="button" @click="minifyJson">
          Minify
        </button>
        <button type="button" @click="copyOutput">
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button type="button" @click="downloadJson">
          Download
        </button>
        <button type="button" @click="openFilePicker">
          Upload
        </button>
        <button type="button" @click="loadSample">
          Sample
        </button>
        <button type="button" @click="clearJson">
          Clear
        </button>

        <label class="indent-control">
          <span>Indent</span>
          <select v-model.number="indent">
            <option :value="2">2 spaces</option>
            <option :value="4">4 spaces</option>
            <option :value="8">8 spaces</option>
          </select>
        </label>

        <label class="toggle-control">
          <input v-model="sortKeys" type="checkbox">
            <span>Sort keys</span>
        </label>

        <input ref="fileInput" class="file-input" type="file" accept=".json,application/json,text/plain"
          @change="handleFileUpload">
      </section>

      <p v-if="error" class="error-banner">
        {{ error }}
      </p>

      <section class="editor-grid">
        <article class="editor-panel input-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Input</h2>
                <span>Paste or upload JSON</span>
              </div>
            </div>
            <strong class="panel-badge">Source</strong>
          </div>
          <div class="code-surface">
            <div class="line-rail" aria-hidden="true">
              <span>01</span>
              <span>02</span>
              <span>03</span>
              <span>04</span>
              <span>05</span>
            </div>
            <div class="input-editor-stack">
              <pre ref="inputMirror" class="json-highlight input-highlight" aria-hidden="true"
                v-html="highlightedInput" />
              <textarea ref="inputEditor" v-model="input" class="json-input" spellcheck="false"
                placeholder="{ &quot;hello&quot;: &quot;world&quot; }" @scroll="syncInputHighlightScroll"
                @keydown.meta.enter.prevent="beautifyJson" @keydown.ctrl.enter.prevent="beautifyJson" />
            </div>
          </div>
        </article>

        <article class="editor-panel output-panel">
          <div class="panel-heading">
            <div class="panel-title">
              <span class="panel-dot" />
              <div>
                <h2>Output</h2>
                <span>Formatted result</span>
              </div>
            </div>
            <strong class="panel-badge">Pretty</strong>
          </div>
          <div class="code-surface">
            <div class="line-rail" aria-hidden="true">
              <span>01</span>
              <span>02</span>
              <span>03</span>
              <span>04</span>
              <span>05</span>
            </div>
            <pre v-if="output" class="json-highlight" v-html="highlightedOutput" />
            <div v-else class="empty-output">
              <span>{ }</span>
              <strong>Formatted JSON will appear here</strong>
            </div>
          </div>
        </article>
      </section>

      <footer class="stats-row" aria-label="JSON statistics">
        <div>
          <span>Characters</span>
          <strong>{{ stats.chars }}</strong>
        </div>
        <div>
          <span>Lines</span>
          <strong>{{ stats.lines }}</strong>
        </div>
        <div>
          <span>Size</span>
          <strong>{{ stats.size }}</strong>
        </div>
      </footer>
    </section>
  </main>
</template>
