import { loadPyodide, type PyodideInterface } from 'pyodide';

type PyodideState = 'idle' | 'loading' | 'ready' | 'error';

let pyodide: PyodideInterface | null = null;
let currentState: PyodideState = 'idle';
let loadPromise: Promise<PyodideInterface> | null = null;
const listeners: Set<(state: PyodideState, progress?: string) => void> = new Set();

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

_orig_show = plt.show
def _new_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    data = base64.b64encode(buf.read()).decode('utf-8')
    print(f'[[PLOT_DATA_START]]' + data + '[[PLOT_DATA_END]]')
    plt.close('all')
plt.show = _new_show
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
}

const PLOT_MARKER_START = '[[PLOT_DATA_START]]';
const PLOT_MARKER_END = '[[PLOT_DATA_END]]';

export async function runPython(code: string): Promise<ExecutionResult> {
  const pyo = await ensurePyodideLoaded();

  const wrapped = `
import sys
import io
import base64
import matplotlib.pyplot as plt

def _capture_plot():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', dpi=100)
    buf.seek(0)
    data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    return "${PLOT_MARKER_START}" + data + "${PLOT_MARKER_END}"

_old_stdout = sys.stdout
_old_stderr = sys.stderr
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

# Patch plt.show
_orig_show = plt.show
def _new_show(*args, **kwargs):
    print(_capture_plot())
plt.show = _new_show

try:
    plt.clf() # Clean state
    exec(compile(${JSON.stringify(code)}, '<code>', 'exec'))
    # Auto-capture
    if len(plt.get_fignums()) > 0:
        print(_capture_plot())
except Exception as e:
    import traceback
    print(f"Error: {str(e)}\\n{traceback.format_exc()}", file=sys.stderr)
finally:
    _stdout = sys.stdout.getvalue()
    _stderr = sys.stderr.getvalue()
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr
`;

  const stdout: string[] = [];
  const stderr: string[] = [];
  const plots: string[] = [];

  try {
    pyo.runPython(wrapped);

    const stdoutRaw = pyo.runPython('_stdout') as string;
    const stderrRaw = pyo.runPython('_stderr') as string;

    for (const line of stdoutRaw.split('\n')) {
      const plotMatch = line.match(new RegExp(`${PLOT_MARKER_START}(.+?)${PLOT_MARKER_END}`));
      if (plotMatch) {
        plots.push(plotMatch[1]);
      } else if (line.trim()) {
        stdout.push(line);
      }
    }

    if (stderrRaw.trim()) {
      stderr.push(stderrRaw.trim());
    }

    return {
      stdout: stdout.join('\n'),
      stderr: stderr.join('\n'),
      plots,
      success: stderr.length === 0,
    };
  } catch (err: any) {
    return {
      stdout: stdout.join('\n'),
      stderr: err.message || String(err),
      plots,
      success: false,
      error: err.message || String(err),
    };
  }
}
