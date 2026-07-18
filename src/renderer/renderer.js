// renderer.js — chạy trong renderer process, chỉ gọi qua window.itSupportAgentApp (preload bridge)

const els = {
  agentNameLabel: document.getElementById('agentNameLabel'),
  btnLogout: document.getElementById('btnLogout'),
  loginPanel: document.getElementById('loginPanel'),
  listPanel: document.getElementById('listPanel'),
  detailPanel: document.getElementById('detailPanel'),
};

let currentTab = 'mine';
let currentTicketId = null;
let subscribedChannel = null;
let unsubscribeRealtimeListener = null;

async function init() {
  bindEvents();
  const config = await window.itSupportAgentApp.getConfig();
  if (config.odooBaseUrl && config.apiKey && config.agentName) {
    showList();
  } else {
    showLogin();
  }
}

function hideAllPanels() {
  els.loginPanel.style.display = 'none';
  els.listPanel.style.display = 'none';
  els.detailPanel.style.display = 'none';
}

function showLogin() {
  hideAllPanels();
  els.loginPanel.style.display = 'block';
  els.agentNameLabel.textContent = '';
  els.btnLogout.style.display = 'none';
}

async function showList() {
  hideAllPanels();
  els.listPanel.style.display = 'block';
  const config = await window.itSupportAgentApp.getConfig();
  els.agentNameLabel.textContent = config.agentName || '';
  els.btnLogout.style.display = 'inline-block';
  await subscribeDispatch();
  await loadTicketList();
}

async function showDetail(ticketId) {
  hideAllPanels();
  els.detailPanel.style.display = 'block';
  currentTicketId = ticketId;
  await loadTicketDetail(ticketId);
  await subscribeTicketChannel(ticketId);
}

function bindEvents() {
  document.getElementById('btnLogin').addEventListener('click', onLogin);
  document.getElementById('btnLogout').addEventListener('click', onLogout);
  document.getElementById('btnRefreshList').addEventListener('click', () => loadTicketList());
  document.getElementById('btnBackToList').addEventListener('click', async () => {
    await window.itSupportAgentApp.unsubscribeRealtime();
    subscribedChannel = null;
    currentTicketId = null;
    await showList();
  });
  document.getElementById('btnSendChat').addEventListener('click', onSendChat);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onSendChat();
  });
  document.querySelectorAll('#listTabs .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('#listTabs .tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      loadTicketList();
    });
  });

  if (!unsubscribeRealtimeListener) {
    unsubscribeRealtimeListener = window.itSupportAgentApp.onRealtimeEvent((data) => {
      if (currentTicketId && data.channel === subscribedChannel) {
        loadTicketDetail(currentTicketId, { silent: true });
      } else if (!currentTicketId) {
        loadTicketList({ silent: true });
      }
    });
  }
}

async function onLogin() {
  const baseUrl = document.getElementById('loginBaseUrl').value.trim();
  const apiKey = document.getElementById('loginApiKey').value.trim();
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!baseUrl || !apiKey) {
    errorEl.textContent = 'Please enter both server address and API key.';
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    await window.itSupportAgentApp.login(baseUrl, apiKey);
    await showList();
  } catch (err) {
    errorEl.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
}

async function onLogout() {
  await window.itSupportAgentApp.unsubscribeRealtime();
  subscribedChannel = null;
  currentTicketId = null;
  await window.itSupportAgentApp.logout();
  showLogin();
}

async function subscribeDispatch() {
  try {
    const channel = await window.itSupportAgentApp.getDispatchChannel();
    await window.itSupportAgentApp.subscribeRealtime(channel);
    subscribedChannel = channel;
  } catch (err) {
    console.error('[subscribeDispatch] failed:', err.message);
  }
}

async function loadTicketList(opts = {}) {
  const container = document.getElementById('ticketListContainer');
  if (!opts.silent) container.innerHTML = '<p class="hint">Loading...</p>';
  try {
    let tickets;
    if (currentTab === 'mine') {
      tickets = await window.itSupportAgentApp.getTickets({ mine: true });
    } else {
      tickets = await window.itSupportAgentApp.getTickets({ state: 'new' });
      tickets = tickets.filter((t) => !t.agent);
    }
    renderTicketList(tickets);
  } catch (err) {
    container.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}

function stateLabel(state) {
  const labels = {
    new: 'New', assigned: 'Assigned', in_progress: 'In progress',
    paused: 'Paused', done: 'Done', cancelled: 'Cancelled',
  };
  return labels[state] || state;
}

function renderTicketList(tickets) {
  const container = document.getElementById('ticketListContainer');
  if (!tickets || tickets.length === 0) {
    container.innerHTML = '<p class="hint">No tickets to show.</p>';
    return;
  }
  container.innerHTML = '';
  tickets.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'ticket-card';
    card.innerHTML = `
      <div class="ticket-card-top">
        <span class="ticket-card-name">
          <span class="priority-dot priority-${escapeAttr(t.priority)}"></span>${escapeHtml(t.name)}
        </span>
        <span class="badge badge-${escapeAttr(t.state)}">${escapeHtml(stateLabel(t.state))}</span>
      </div>
      <div class="ticket-card-subject">${escapeHtml(t.subject)}</div>
      <div class="ticket-card-customer">${escapeHtml(t.customer || '')}</div>
      <div class="ticket-card-tags">
        ${t.support_type ? `<span class="badge badge-assigned">${escapeHtml(t.support_type)}</span>` : ''}
        ${t.agent ? `<span class="badge badge-in_progress">${escapeHtml(t.agent)}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => showDetail(t.id));
    container.appendChild(card);
  });
}

async function loadTicketDetail(ticketId, opts = {}) {
  try {
    const ticket = await window.itSupportAgentApp.getTicketDetail(ticketId);
    const messages = await window.itSupportAgentApp.getMessages(ticketId);
    renderTicketHeader(ticket);
    renderActions(ticket);
    renderMessages(messages);
  } catch (err) {
    if (!opts.silent) {
      document.getElementById('detailHeader').innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
  }
}

function renderTicketHeader(ticket) {
  const el = document.getElementById('detailHeader');
  el.innerHTML = `
    <h2>${escapeHtml(ticket.name)}</h2>
    <div class="meta">${escapeHtml(ticket.subject)}</div>
    <div class="meta">${escapeHtml(ticket.customer || '')} &middot; ${escapeHtml(ticket.device || '-')}</div>
    <div class="tags">
      <span class="badge badge-${escapeAttr(ticket.state)}">${escapeHtml(stateLabel(ticket.state))}</span>
      ${ticket.support_type ? `<span class="badge badge-assigned">${escapeHtml(ticket.support_type)}</span>` : ''}
      <span class="badge badge-done">${(ticket.total_duration || 0).toFixed(2)} h</span>
    </div>
  `;
}

function renderActions(ticket) {
  const el = document.getElementById('detailActions');
  el.innerHTML = '';
  if (ticket.state === 'done' || ticket.state === 'cancelled') return;

  if (!ticket.agent) {
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = 'Assign to Me';
    btn.addEventListener('click', () => onAssign(ticket.id));
    el.appendChild(btn);
    return;
  }

  if (!ticket.has_running_session) {
    const btn = document.createElement('button');
    btn.className = 'btn-start';
    btn.textContent = 'Start';
    btn.addEventListener('click', () => onStart(ticket.id));
    el.appendChild(btn);
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn-end';
    btn.textContent = 'End';
    btn.addEventListener('click', () => onEnd(ticket.id));
    el.appendChild(btn);
  }

  const doneBtn = document.createElement('button');
  doneBtn.className = 'btn-secondary';
  doneBtn.textContent = 'Mark Done';
  doneBtn.addEventListener('click', () => onMarkDone(ticket.id));
  el.appendChild(doneBtn);
}

async function onAssign(ticketId) {
  try {
    await window.itSupportAgentApp.assignToMe(ticketId);
    await loadTicketDetail(ticketId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function onStart(ticketId) {
  const mode = await pickSupportMode();
  if (!mode) return;
  try {
    await window.itSupportAgentApp.startSession(ticketId, mode);
    await loadTicketDetail(ticketId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function pickSupportMode() {
  return new Promise((resolve) => {
    const mode = window.prompt('Support mode: type "online" or "onsite"', 'online');
    if (!mode) return resolve(null);
    const normalized = mode.trim().toLowerCase();
    resolve(normalized === 'onsite' ? 'onsite' : 'online');
  });
}

const RESOLUTION_STATUS_OPTIONS = [
  { value: 'resolved', label: 'Resolved' },
  { value: 'partially_resolved', label: 'Partially Resolved' },
  { value: 'not_resolved', label: 'Not Resolved' },
  { value: 'escalated', label: 'Escalated' },
];

// Modal "End Session" dựng bằng JS, dùng lại các class đã có trong style.css
// (.modal-overlay/.modal-box/.modal-actions, label/select/textarea/.error/.btn-primary/
// .btn-secondary đã được style global) để đồng bộ giao diện, không tạo style riêng.
// Resolve về { note, resolutionStatus } nếu xác nhận hợp lệ, null nếu Cancel.
function showEndSessionModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <h3>End Session</h3>
        <label for="esResolutionStatus">Resolution status *</label>
        <select id="esResolutionStatus">
          <option value="">-- Select --</option>
          ${RESOLUTION_STATUS_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
        </select>
        <label for="esNote">Work performed *</label>
        <textarea id="esNote" rows="4" placeholder="Describe what was done..."></textarea>
        <p class="error" id="esError"></p>
        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="esCancelBtn">Cancel</button>
          <button type="button" class="btn-primary" id="esSubmitBtn">End Session</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = (result) => {
      document.body.removeChild(overlay);
      resolve(result);
    };

    overlay.querySelector('#esCancelBtn').addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    overlay.querySelector('#esSubmitBtn').addEventListener('click', () => {
      const resolutionStatus = overlay.querySelector('#esResolutionStatus').value;
      const note = overlay.querySelector('#esNote').value.trim();
      const errorEl = overlay.querySelector('#esError');
      if (!resolutionStatus) {
        errorEl.textContent = 'Please select a resolution status.';
        return;
      }
      if (!note) {
        errorEl.textContent = 'Please describe the work performed.';
        return;
      }
      close({ note, resolutionStatus });
    });
  });
}

async function onEnd(ticketId) {
  const result = await showEndSessionModal();
  if (!result) return; // user cancelled
  try {
    await window.itSupportAgentApp.endSession(ticketId, result.note, result.resolutionStatus);
    await loadTicketDetail(ticketId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function onMarkDone(ticketId) {
  if (!window.confirm('Mark this ticket as done? Any running session will be closed automatically.')) return;
  try {
    await window.itSupportAgentApp.markDone(ticketId);
    await loadTicketDetail(ticketId);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function subscribeTicketChannel(ticketId) {
  try {
    await window.itSupportAgentApp.unsubscribeRealtime();
    const channel = await window.itSupportAgentApp.getTicketChannel(ticketId);
    await window.itSupportAgentApp.subscribeRealtime(channel);
    subscribedChannel = channel;
  } catch (err) {
    console.error('[subscribeTicketChannel] failed:', err.message);
  }
}

function stripHtml(htmlText) {
  const div = document.createElement('div');
  div.innerHTML = htmlText || '';
  return (div.textContent || div.innerText || '').trim();
}

function renderMessages(messages) {
  const messagesEl = document.getElementById('chatMessages');
  messagesEl.innerHTML = '';
  messages.forEach((m) => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble other';
    bubble.innerHTML = `<span class="author">${escapeHtml(m.author || 'Unknown')}</span>${escapeHtml(stripHtml(m.body))}`;
    messagesEl.appendChild(bubble);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function onSendChat() {
  if (!currentTicketId) return;
  const input = document.getElementById('chatInput');
  const body = input.value.trim();
  if (!body) return;
  input.value = '';
  try {
    await window.itSupportAgentApp.postMessage(currentTicketId, body);
    await loadTicketDetail(currentTicketId, { silent: true });
  } catch (err) {
    alert(`Could not send message: ${err.message}`);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

init();
