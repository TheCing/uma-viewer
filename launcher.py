# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Uma Viewer Launcher - Web-based control panel for easy operation.

Double-click launcher.bat to start, or run directly:
    python launcher.py

Opens a browser with buttons to:
1. Extract data from game (requires UmaExtractor + game running)
2. Enrich data with English names
3. Open the viewer
"""

import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 8080
SCRIPT_DIR = Path(__file__).parent.resolve()

# Store running processes and their output
processes = {}
output_buffers = {}


CONTROL_PANEL_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uma Viewer Launcher</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0d1117;
      --bg-panel: #161b22;
      --bg-card: #21262d;
      --bg-hover: #30363d;
      --border: #30363d;
      --text: #e6edf3;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --accent: #58a6ff;
      --green: #3fb950;
      --orange: #d29922;
      --red: #f85149;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'IBM Plex Sans', -apple-system, sans-serif;
      background: var(--bg-base);
      color: var(--text);
      min-height: 100vh;
      padding: 40px 20px;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
    }

    h1 {
      font-family: 'JetBrains Mono', monospace;
      font-size: 24px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    h1::before {
      content: '>';
      color: var(--green);
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 32px;
    }

    .steps {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .step {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      display: grid;
      grid-template-columns: 48px 1fr auto;
      gap: 16px;
      align-items: center;
    }

    .step-number {
      width: 48px;
      height: 48px;
      background: var(--bg-card);
      border: 2px solid var(--border);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-muted);
    }

    .step.completed .step-number {
      background: var(--green);
      border-color: var(--green);
      color: #000;
    }

    .step.running .step-number {
      background: var(--orange);
      border-color: var(--orange);
      color: #000;
      animation: pulse 1.5s infinite;
    }

    .step.error .step-number {
      background: var(--red);
      border-color: var(--red);
      color: #fff;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .step-info h3 {
      font-size: 16px;
      margin-bottom: 4px;
    }

    .step-info p {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .step-info a {
      color: var(--accent);
      text-decoration: none;
      font-size: 12px;
    }

    .step-info a:hover {
      text-decoration: underline;
    }

    .step-action button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;
      min-width: 120px;
    }

    .step-action button:hover:not(:disabled) {
      opacity: 0.9;
    }

    .step-action button:disabled {
      background: var(--bg-hover);
      color: var(--text-muted);
      cursor: not-allowed;
    }

    .step.completed .step-action button {
      background: var(--green);
    }

    .step.running .step-action button {
      background: var(--orange);
    }

    .output-section {
      margin-top: 24px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }

    .output-header {
      padding: 12px 16px;
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .output-header button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }

    .output-header button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .output-content {
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.6;
      max-height: 300px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .output-content:empty::before {
      content: '// output will appear here...';
      color: var(--text-muted);
    }

    .output-content .error {
      color: var(--red);
    }

    .output-content .success {
      color: var(--green);
    }

    .status-bar {
      margin-top: 24px;
      padding: 12px 16px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
      color: var(--text-secondary);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .status-bar .files {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
    }

    .status-bar .file-exists {
      color: var(--green);
    }

    .status-bar .file-missing {
      color: var(--text-muted);
    }

    .prereqs {
      margin-top: 32px;
      padding: 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
    }

    .prereqs h4 {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .prereqs ul {
      list-style: none;
      color: var(--text-secondary);
    }

    .prereqs li {
      padding: 4px 0;
      padding-left: 20px;
      position: relative;
    }

    .prereqs li::before {
      content: '•';
      position: absolute;
      left: 4px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>uma_viewer</h1>
    <p class="subtitle">Extract, enrich, and view your Uma Musume veteran data</p>

    <div class="steps">
      <div class="step" id="step1">
        <div class="step-number">1</div>
        <div class="step-info">
          <h3>Extract Data</h3>
          <p>Pull veteran data from the running game</p>
          <a href="https://github.com/FabulousCupcake/UmaExtractor/releases" target="_blank">Don't have UmaExtractor? Download it here →</a>
        </div>
        <div class="step-action">
          <button onclick="runStep('extract')">Extract</button>
        </div>
      </div>

      <div class="step" id="step2">
        <div class="step-number">2</div>
        <div class="step-info">
          <h3>Enrich Data</h3>
          <p>Add English names for characters, skills, sparks, and more</p>
        </div>
        <div class="step-action">
          <button onclick="runStep('enrich')">Enrich</button>
        </div>
      </div>

      <div class="step" id="step3">
        <div class="step-number">3</div>
        <div class="step-info">
          <h3>Open Viewer</h3>
          <p>Browse your collection in the web viewer</p>
        </div>
        <div class="step-action">
          <button onclick="runStep('view')">Open Viewer</button>
        </div>
      </div>
    </div>

    <div class="output-section">
      <div class="output-header">
        <span>// output</span>
        <button onclick="clearOutput()">clear</button>
      </div>
      <div class="output-content" id="output"></div>
    </div>

    <div class="status-bar">
      <span>Files:</span>
      <div class="files">
        <span id="file-data" class="file-missing">data.json</span> |
        <span id="file-enriched" class="file-missing">enriched_data.json</span>
      </div>
    </div>

    <div class="prereqs">
      <h4>Before Extracting</h4>
      <ul>
        <li>Uma Musume Pretty Derby must be running</li>
        <li>Navigate to the Veteran List page (Enhance → List)</li>
        <li>Wait for the page to fully load</li>
        <li>UmaExtractor must be installed (in Downloads or nearby folder)</li>
      </ul>
    </div>
  </div>

  <script>
    let polling = null;

    function log(msg, type = '') {
      const output = document.getElementById('output');
      if (type) {
        output.innerHTML += `<span class="${type}">${escapeHtml(msg)}</span>\\n`;
      } else {
        output.innerHTML += escapeHtml(msg) + '\\n';
      }
      output.scrollTop = output.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function clearOutput() {
      document.getElementById('output').innerHTML = '';
    }

    function setStepState(stepId, state) {
      const step = document.getElementById(stepId);
      step.className = 'step ' + state;
      const btn = step.querySelector('button');
      if (state === 'running') {
        btn.disabled = true;
        btn.textContent = 'Running...';
      } else if (state === 'completed') {
        btn.disabled = false;
        btn.textContent = 'Done!';
      } else if (state === 'error') {
        btn.disabled = false;
        btn.textContent = 'Retry';
      } else {
        btn.disabled = false;
      }
    }

    function resetButton(stepId, text) {
      const btn = document.getElementById(stepId).querySelector('button');
      btn.textContent = text;
    }

    async function runStep(action) {
      const stepMap = {
        'extract': 'step1',
        'enrich': 'step2',
        'view': 'step3'
      };
      const stepId = stepMap[action];

      if (action === 'view') {
        window.open('/viewer.html', '_blank');
        setStepState(stepId, 'completed');
        setTimeout(() => resetButton(stepId, 'Open Viewer'), 2000);
        return;
      }

      setStepState(stepId, 'running');
      log(`\\n=== Starting ${action} ===`);

      try {
        const response = await fetch(`/api/${action}`, { method: 'POST' });
        const data = await response.json();

        if (data.status === 'started') {
          // Start polling for output
          pollOutput(action, stepId);
        } else {
          log(data.message || 'Unknown error', 'error');
          setStepState(stepId, 'error');
        }
      } catch (err) {
        log('Failed to start: ' + err.message, 'error');
        setStepState(stepId, 'error');
      }
    }

    function pollOutput(action, stepId) {
      if (polling) clearInterval(polling);

      polling = setInterval(async () => {
        try {
          const response = await fetch(`/api/output/${action}`);
          const data = await response.json();

          if (data.output) {
            document.getElementById('output').innerHTML += escapeHtml(data.output);
            document.getElementById('output').scrollTop = document.getElementById('output').scrollHeight;
          }

          if (data.status === 'completed') {
            clearInterval(polling);
            polling = null;
            log('\\n=== Completed ===', 'success');
            setStepState(stepId, 'completed');
            checkFiles();
            
            // Reset button text after delay
            const btnText = action === 'extract' ? 'Extract' : 'Enrich';
            setTimeout(() => resetButton(stepId, btnText), 3000);
          } else if (data.status === 'error') {
            clearInterval(polling);
            polling = null;
            log('\\n=== Failed ===', 'error');
            setStepState(stepId, 'error');
            
            const btnText = action === 'extract' ? 'Extract' : 'Enrich';
            setTimeout(() => resetButton(stepId, btnText), 2000);
          }
        } catch (err) {
          // Ignore polling errors
        }
      }, 500);
    }

    async function checkFiles() {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();

        document.getElementById('file-data').className = 
          data.data_exists ? 'file-exists' : 'file-missing';
        document.getElementById('file-enriched').className = 
          data.enriched_exists ? 'file-exists' : 'file-missing';
      } catch (err) {
        // Ignore
      }
    }

    // Check files on load
    checkFiles();
  </script>
</body>
</html>
'''


class LauncherHandler(http.server.SimpleHTTPRequestHandler):
    """Handle both file serving and API requests."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SCRIPT_DIR), **kwargs)
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass
    
    def do_GET(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/' or parsed.path == '/index.html':
            # Serve control panel
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(CONTROL_PANEL_HTML.encode())
        
        elif parsed.path == '/api/status':
            # Check file existence
            data_exists = (SCRIPT_DIR / 'data.json').exists()
            enriched_exists = (SCRIPT_DIR / 'enriched_data.json').exists()
            
            self.send_json({
                'data_exists': data_exists,
                'enriched_exists': enriched_exists
            })
        
        elif parsed.path.startswith('/api/output/'):
            # Get output from running process
            action = parsed.path.split('/')[-1]
            
            if action in output_buffers:
                output = output_buffers[action].get('new', '')
                output_buffers[action]['new'] = ''
                
                status = 'running'
                if action in processes:
                    proc = processes[action]
                    if proc.poll() is not None:
                        # Process finished
                        status = 'completed' if proc.returncode == 0 else 'error'
                        del processes[action]
                
                self.send_json({'output': output, 'status': status})
            else:
                self.send_json({'output': '', 'status': 'idle'})
        
        else:
            # Serve static files
            super().do_GET()
    
    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/api/extract':
            self.run_script('extract', ['python', 'run_extractor.py', '--yes'])
        
        elif parsed.path == '/api/enrich':
            self.run_script('enrich', ['python', 'enrich_data.py'])
        
        else:
            self.send_error(404)
    
    def run_script(self, action, cmd):
        """Start a script in background and track its output."""
        if action in processes:
            self.send_json({'status': 'error', 'message': 'Already running'})
            return
        
        try:
            # Initialize output buffer
            output_buffers[action] = {'new': '', 'all': ''}
            
            # Start process
            proc = subprocess.Popen(
                cmd,
                cwd=str(SCRIPT_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                # For Windows: don't show console window
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            
            processes[action] = proc
            
            # Start thread to read output
            def read_output():
                for line in proc.stdout:
                    output_buffers[action]['new'] += line
                    output_buffers[action]['all'] += line
                proc.stdout.close()
            
            thread = threading.Thread(target=read_output, daemon=True)
            thread.start()
            
            self.send_json({'status': 'started'})
        
        except Exception as e:
            self.send_json({'status': 'error', 'message': str(e)})
    
    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())


def main():
    print("=" * 50)
    print("  Uma Viewer Launcher")
    print("=" * 50)
    print()
    
    # Check for required files
    if not (SCRIPT_DIR / 'run_extractor.py').exists():
        print("[!] Warning: run_extractor.py not found")
    if not (SCRIPT_DIR / 'enrich_data.py').exists():
        print("[!] Warning: enrich_data.py not found")
    if not (SCRIPT_DIR / 'viewer.html').exists():
        print("[!] Warning: viewer.html not found")
    
    # Start server
    with socketserver.TCPServer(("", PORT), LauncherHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print(f"[OK] Server running at {url}")
        print()
        print("Opening browser...")
        print("(Close this window or press Ctrl+C to stop)")
        print()
        
        # Open browser
        webbrowser.open(url)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")


if __name__ == "__main__":
    main()
