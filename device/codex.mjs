import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export function resultReader() {
  let result = ''
  let completed = false
  let failed = false
  return {
    line(line) {
      if (!line.trim()) return
      const event = JSON.parse(line)
      if (event.type === 'turn.failed') failed = true
      if (event.type === 'turn.completed') completed = true
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') {
        if (!event.item.phase || event.item.phase === 'final_answer') result = event.item.text
      }
    },
    result(code) {
      if (code !== 0 || failed || !completed) throw new Error('Codex did not report a successful turn. A cue was not sent.')
      return result.trim() || 'Codex reported that the run finished.'
    },
  }
}

export async function trackCodex(prompt) {
  const child = spawn('codex', ['exec', '--json', '-'], {
    cwd: process.env.INIT_CWD || process.cwd(), stdio: ['pipe', 'pipe', 'inherit'],
  })
  const done = new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  const reader = resultReader()
  const lines = createInterface({ input: child.stdout })
  let parseError
  lines.on('line', (line) => {
    try { reader.line(line) } catch (error) { parseError = error }
  })
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
  const code = await done
  if (parseError) throw new Error('Codex returned an invalid JSONL event.', { cause: parseError })
  return reader.result(code)
}
