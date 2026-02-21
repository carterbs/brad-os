import express, { type Request, type Response } from 'express';
import cors from 'cors';

// Debug UI doesn't need stripPathPrefix, express.json(), or App Check
const app = express();
app.use(cors({ origin: true }));

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meal Plan Debug UI</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
  h1 { margin-bottom: 16px; }
  .controls { display: flex; gap: 8px; margin-bottom: 16px; }
  button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
  .btn-primary { background: #2563eb; color: white; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-success { background: #16a34a; color: white; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; background: white; border-radius: 8px; overflow: hidden; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
  th { background: #f0f0f0; font-weight: 600; }
  .critique-form { display: flex; gap: 8px; margin-bottom: 16px; }
  .critique-form input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }
  .explanation { background: #e0f2fe; padding: 12px; border-radius: 4px; margin-bottom: 16px; display: none; }
  .history { margin-bottom: 16px; }
  .history-item { padding: 8px 12px; margin-bottom: 4px; border-radius: 4px; font-size: 13px; }
  .history-user { background: #dbeafe; }
  .history-assistant { background: #dcfce7; }
  .debug-toggle { cursor: pointer; color: #666; font-size: 13px; margin-bottom: 8px; }
  .debug-content { display: none; background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; max-height: 400px; overflow-y: auto; }
  .status { padding: 8px 12px; border-radius: 4px; margin-bottom: 16px; font-size: 14px; }
  .status-loading { background: #fef3c7; }
  .status-error { background: #fecaca; }
  .status-success { background: #dcfce7; }
</style>
</head>
<body>
<h1>Meal Plan Debug UI</h1>

<div class="controls">
  <button class="btn-primary" id="generateBtn" onclick="generatePlan()">Generate Plan</button>
  <button class="btn-success" id="finalizeBtn" onclick="finalizePlan()" disabled>Finalize</button>
  <button class="btn-danger" id="regenerateBtn" onclick="generatePlan()" style="display:none">Regenerate</button>
</div>

<div id="status" class="status" style="display:none"></div>

<table id="planTable" style="display:none">
  <thead>
    <tr><th>Day</th><th>Breakfast</th><th>Lunch</th><th>Dinner</th></tr>
  </thead>
  <tbody id="planBody"></tbody>
</table>

<div class="critique-form" id="critiqueForm" style="display:none">
  <input type="text" id="critiqueInput" placeholder="Describe changes you want..." onkeydown="if(event.key==='Enter')sendCritique()">
  <button class="btn-primary" id="critiqueBtn" onclick="sendCritique()">Send Critique</button>
</div>

<div id="explanation" class="explanation"></div>

<div class="history" id="historySection" style="display:none">
  <h3>Conversation History</h3>
  <div id="historyList"></div>
</div>

<div>
  <div class="debug-toggle" onclick="toggleDebug()">Toggle Debug JSON</div>
  <div class="debug-content" id="debugContent"></div>
</div>

<script>
const BASE_URL = window.location.port === '5001'
  ? 'http://localhost:5002/api/dev/mealplans'
  : window.location.origin + '/api/dev/mealplans';
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
let sessionId = null;

function showStatus(msg, type) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status status-' + type;
  el.style.display = 'block';
}

function hideStatus() {
  document.getElementById('status').style.display = 'none';
}

function renderPlan(plan) {
  const tbody = document.getElementById('planBody');
  tbody.innerHTML = '';
  for (let d = 0; d < 7; d++) {
    const row = document.createElement('tr');
    row.innerHTML = '<td><strong>' + DAY_NAMES[d] + '</strong></td>';
    ['breakfast', 'lunch', 'dinner'].forEach(function(mt) {
      const entry = plan.find(function(e) { return e.day_index === d && e.meal_type === mt; });
      const cell = document.createElement('td');
      cell.textContent = entry ? (entry.meal_name || '(empty)') : '(missing)';
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  }
  document.getElementById('planTable').style.display = 'table';
}

function renderHistory(history) {
  const list = document.getElementById('historyList');
  list.innerHTML = '';
  if (!history || history.length === 0) {
    document.getElementById('historySection').style.display = 'none';
    return;
  }
  document.getElementById('historySection').style.display = 'block';
  history.forEach(function(item) {
    const div = document.createElement('div');
    div.className = 'history-item history-' + item.role;
    div.textContent = (item.role === 'user' ? 'You: ' : 'Assistant: ') + item.content;
    list.appendChild(div);
  });
}

function appendDebug(label, data) {
  const el = document.getElementById('debugContent');
  el.textContent += '--- ' + label + ' ---\\n' + JSON.stringify(data, null, 2) + '\\n\\n';
}

function toggleDebug() {
  const el = document.getElementById('debugContent');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function generatePlan() {
  showStatus('Generating plan...', 'loading');
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('debugContent').textContent = '';
  sessionId = null;

  try {
    const resp = await fetch(BASE_URL + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await resp.json();
    appendDebug('Generate Response', data);

    if (!data.success) {
      showStatus('Error: ' + (data.error ? data.error.message : 'Unknown'), 'error');
      return;
    }

    sessionId = data.data.session_id;
    renderPlan(data.data.plan);
    document.getElementById('critiqueForm').style.display = 'flex';
    document.getElementById('finalizeBtn').disabled = false;
    document.getElementById('regenerateBtn').style.display = 'inline-block';
    document.getElementById('explanation').style.display = 'none';
    renderHistory([]);
    hideStatus();
  } catch (e) {
    showStatus('Network error: ' + e.message, 'error');
  } finally {
    document.getElementById('generateBtn').disabled = false;
  }
}

async function sendCritique() {
  const input = document.getElementById('critiqueInput');
  const text = input.value.trim();
  if (!text || !sessionId) return;

  showStatus('Processing critique...', 'loading');
  document.getElementById('critiqueBtn').disabled = true;

  try {
    const resp = await fetch(BASE_URL + '/' + sessionId + '/critique', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ critique: text })
    });
    const data = await resp.json();
    appendDebug('Critique Response', data);

    if (!data.success) {
      showStatus('Error: ' + (data.error ? data.error.message : 'Unknown'), 'error');
      return;
    }

    renderPlan(data.data.plan);
    const expEl = document.getElementById('explanation');
    expEl.textContent = data.data.explanation;
    expEl.style.display = 'block';

    if (data.data.errors && data.data.errors.length > 0) {
      expEl.textContent += '\\n\\nOperation errors: ' + data.data.errors.join(', ');
    }

    // Fetch full session to get history
    const sessResp = await fetch(BASE_URL + '/' + sessionId);
    const sessData = await sessResp.json();
    if (sessData.success) {
      renderHistory(sessData.data.history);
    }

    input.value = '';
    hideStatus();
  } catch (e) {
    showStatus('Network error: ' + e.message, 'error');
  } finally {
    document.getElementById('critiqueBtn').disabled = false;
  }
}

async function finalizePlan() {
  if (!sessionId) return;
  showStatus('Finalizing...', 'loading');
  document.getElementById('finalizeBtn').disabled = true;

  try {
    const resp = await fetch(BASE_URL + '/' + sessionId + '/finalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await resp.json();
    appendDebug('Finalize Response', data);

    if (!data.success) {
      showStatus('Error: ' + (data.error ? data.error.message : 'Unknown'), 'error');
      document.getElementById('finalizeBtn').disabled = false;
      return;
    }

    showStatus('Plan finalized!', 'success');
    document.getElementById('critiqueForm').style.display = 'none';
  } catch (e) {
    showStatus('Network error: ' + e.message, 'error');
    document.getElementById('finalizeBtn').disabled = false;
  }
}
</script>
</body>
</html>`;

// GET /mealplan-debug/
app.get('/', (_req: Request, res: Response) => {
  res.type('html').send(HTML_PAGE);
});

export const mealplanDebugApp = app;
