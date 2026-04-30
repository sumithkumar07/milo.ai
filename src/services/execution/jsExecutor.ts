export interface ExecutionResult {
  stdout: string;
  stderr: string;
  success: boolean;
  error?: string;
  executionTimeMs?: number;
}

const EXECUTION_TIMEOUT_MS = 10_000;

export function runJavaScript(code: string): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.sandbox = 'allow-scripts';
    document.body.appendChild(iframe);

    let resolved = false;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        document.body.removeChild(iframe);
        resolve({
          stdout: '',
          stderr: `Execution timed out after ${EXECUTION_TIMEOUT_MS / 1000}s.`,
          success: false,
          error: 'Timeout',
          executionTimeMs: performance.now() - startTime,
        });
      }
    }, EXECUTION_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.data?.type !== 'js-execution-result') return;

      clearTimeout(timeoutId);
      resolved = true;
      document.body.removeChild(iframe);
      window.removeEventListener('message', handler);

      resolve({
        stdout: event.data.stdout || '',
        stderr: event.data.stderr || '',
        success: event.data.success,
        error: event.data.error,
        executionTimeMs: event.data.executionTimeMs || (performance.now() - startTime),
      });
    };

    window.addEventListener('message', handler);

    const sandboxed = `
      <script>
        (function() {
          const startTime = performance.now();
          let stdout = '';
          let stderr = '';
          let success = true;
          let error = null;

          const origLog = console.log;
          const origError = console.error;
          const origWarn = console.warn;

          console.log = function(...args) {
            stdout += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
            if (origLog) origLog.apply(console, args);
          };
          console.error = function(...args) {
            stderr += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
            success = false;
            if (origError) origError.apply(console, args);
          };
          console.warn = function(...args) {
            stderr += '[Warning] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
            if (origWarn) origWarn.apply(console, args);
          };

          try {
            ${code}
          } catch (e) {
            success = false;
            error = e.message;
            stderr += 'Error: ' + e.message + '\\n' + (e.stack || '');
          }

          window.parent.postMessage({
            type: 'js-execution-result',
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            success: success,
            error: error,
            executionTimeMs: performance.now() - startTime
          }, '*');
        })();
      <\/script>
    `;

    iframe.srcdoc = `<!DOCTYPE html><html><body>${sandboxed}</body></html>`;
  });
}
