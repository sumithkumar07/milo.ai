import { loadPyodide, type PyodideInterface } from 'pyodide';

type PyodideState = 'idle' | 'loading' | 'ready' | 'error';

let pyodide: PyodideInterface | null = null;
let currentState: PyodideState = 'idle';
let loadPromise: Promise<PyodideInterface> | null = null;
let executionController: { abort: () => void } | null = null;
const listeners: Set<(state: PyodideState, progress?: string) => void> = new Set();
const EXECUTION_TIMEOUT_MS = 30_000;

function notify(state: PyodideState, progress?: string) {
  currentState = state;
  listeners.forEach(fn => fn(state, progress));
}

export function onPyodideStateChange(listener: (state: PyodideState, progress?: string) => void) {
  listeners.add(listener);
  listener(currentState);
  return () => { listeners.delete(listener); };
}

export function getPyodideState(): PyodideState {
  return currentState;
}

export function isExecutionRunning(): boolean {
  return executionController !== null;
}

export function interruptExecution() {
  if (executionController) {
    executionController.abort();
    executionController = null;
  }
}

export async function ensurePyodideLoaded(): Promise<PyodideInterface> {
  if (pyodide && currentState === 'ready') return pyodide;
  if (loadPromise) return loadPromise;

  notify('loading', 'Downloading Python runtime...');

  loadPromise = loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/',
  }).then(async (pyo) => {
    notify('loading', 'Installing matplotlib, numpy, pandas...');
    await pyo.loadPackage(['matplotlib', 'numpy', 'pandas', 'pillow']);

    pyo.runPython(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io
import base64

# Store captured plots separately instead of printing markers
_captured_plots = []

def _capture_plot():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    return data

_orig_show = plt.show
def _new_show(*args, **kwargs):
    data = _capture_plot()
    _captured_plots.append(data)
plt.show = _new_show

def _get_captured_plots():
    plots = _captured_plots.copy()
    _captured_plots.clear()
    return plots
`);

    pyodide = pyo;
    notify('ready');
    return pyo;
  }).catch((err) => {
    console.error('Pyodide load error:', err);
    notify('error', `Failed to load: ${err.message}`);
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  plots: string[];
  success: boolean;
  error?: string;
  executionTimeMs?: number;
}

export async function runPython(code: string): Promise<ExecutionResult> {
  const pyo = await ensurePyodideLoaded();
  const startTime = performance.now();
  let timedOut = false;
  let wasInterrupted = false;

  executionController = { abort: () => { wasInterrupted = true; } };

  try {
    const wrapped = `
import sys
import io
import base64
import matplotlib.pyplot as plt

_old_stdout = sys.stdout
_old_stderr = sys.stderr
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

# Reset plot capture
_captured_plots.clear()

# Patch plt.show
_orig_show = plt.show
def _new_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    _captured_plots.append(data)
plt.show = _new_show

# Clear any existing figures
plt.close('all')

try:
    exec(compile(${JSON.stringify(code)}, '<code>', 'exec'))
    # Auto-capture any remaining figures
    if len(plt.get_fignums()) > 0:
        buf = io.BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        data = base64.b64encode(buf.read()).decode('utf-8')
        plt.close('all')
        _captured_plots.append(data)
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\\n{traceback.format_exc()}", file=sys.stderr)
finally:
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr
`;

    const timeoutId = setTimeout(() => { timedOut = true; }, EXECUTION_TIMEOUT_MS);

    try {
      await pyo.runPythonAsync(wrapped);
    } finally {
      clearTimeout(timeoutId);
    }

    if (wasInterrupted) {
      return {
        stdout: '',
        stderr: 'Execution interrupted by user.',
        plots: [],
        success: false,
        error: 'Interrupted',
        executionTimeMs: performance.now() - startTime,
      };
    }

    if (timedOut) {
      return {
        stdout: '',
        stderr: `Execution timed out after ${EXECUTION_TIMEOUT_MS / 1000}s. Code may contain an infinite loop or long-running operation.`,
        plots: [],
        success: false,
        error: 'Timeout',
        executionTimeMs: performance.now() - startTime,
      };
    }

    const stdoutRaw = pyo.runPython('sys.stdout.getvalue()') as string;
    const stderrRaw = pyo.runPython('sys.stderr.getvalue()') as string;
    const plotsB64 = pyo.runPython('_get_captured_plots()') as string[];

    return {
      stdout: stdoutRaw.replace(/\n$/, ''),
      stderr: stderrRaw.replace(/\n$/, ''),
      plots: plotsB64 || [],
      success: stderrRaw.trim().length === 0,
      executionTimeMs: performance.now() - startTime,
    };
  } catch (err: any) {
    if (wasInterrupted) {
      return {
        stdout: '',
        stderr: 'Execution interrupted by user.',
        plots: [],
        success: false,
        error: 'Interrupted',
        executionTimeMs: performance.now() - startTime,
      };
    }
    return {
      stdout: '',
      stderr: err.message || String(err),
      plots: [],
      success: false,
      error: err.message || String(err),
      executionTimeMs: performance.now() - startTime,
    };
  } finally {
    executionController = null;
  }
}
