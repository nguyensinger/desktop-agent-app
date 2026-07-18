// api.js
// Client gọi REST API của module it_support_management trên Odoo, dành cho
// Desktop Agent App (nhân viên IT support) - khác với Desktop Client App (khách hàng).

const axios = require('axios');
const { getConfig } = require('./config');

function client(timeout) {
  const { odooBaseUrl, apiKey } = getConfig();
  if (!odooBaseUrl || !apiKey) {
    throw new Error('Chưa cấu hình odooBaseUrl hoặc apiKey. Vui lòng đăng nhập lại.');
  }
  return axios.create({
    baseURL: odooBaseUrl.replace(/\/+$/, ''),
    timeout: timeout || 15000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Odoo controller type='jsonrpc' tự bọc giá trị return của method vào
 * {jsonrpc: "2.0", id, result: <giá trị return>}. Method chỉ return dict/list thuần,
 * KHÔNG bọc thêm 1 lớp 'result' nữa (xem _json_ok trong controller Odoo).
 */
async function callApi(path, params = {}, timeout) {
  const http = client(timeout);
  const response = await http.post(path, {
    jsonrpc: '2.0',
    method: 'call',
    params,
  });
  const data = response.data;

  if (data.error) {
    const msg = data.error.data?.message || data.error.message || 'Lỗi không xác định từ server';
    throw new Error(msg);
  }

  const result = data.result;
  if (result && typeof result === 'object' && !Array.isArray(result) && result.error) {
    throw new Error(result.error);
  }
  return result;
}

async function whoami() {
  return callApi('/api/v1/whoami', {});
}

async function getTickets({ state, mine } = {}) {
  const params = {};
  if (state) params.state = state;
  if (mine) params.mine = 1;
  return callApi('/api/v1/tickets', params);
}

async function getTicketDetail(ticketId) {
  return callApi(`/api/v1/ticket/${ticketId}`, {});
}

async function assignToMe(ticketId) {
  return callApi(`/api/v1/ticket/${ticketId}/assign`, {});
}

async function startSession(ticketId, supportMode) {
  return callApi(`/api/v1/ticket/${ticketId}/session/start`, {
    support_mode: supportMode,
  });
}

async function endSession(ticketId, note, resolutionStatus) {
  return callApi(`/api/v1/ticket/${ticketId}/session/end`, {
    note,
    resolution_status: resolutionStatus,
  });
}

async function markDone(ticketId) {
  return callApi(`/api/v1/ticket/${ticketId}/done`, {});
}

async function getMessages(ticketId) {
  return callApi(`/api/v1/ticket/${ticketId}/messages`, {});
}

async function postMessage(ticketId, body) {
  // Không gửi from_customer - đây là agent IT nhắn, không cần tự thông báo email
  // cho chính mình (xem logic trong controller Odoo: _notify_agents_new_customer_message
  // chỉ chạy khi from_customer=true, dành cho desktop client của khách hàng).
  return callApi(`/api/v1/ticket/${ticketId}/message`, { body });
}

async function getRealtimeChannel(ticketId) {
  return callApi(`/api/v1/ticket/${ticketId}/realtime_channel`, {});
}

async function getDispatchChannel() {
  return callApi('/api/v1/dispatch_channel', {});
}

async function poll(channels, last = 0) {
  // Long-polling: request này có thể treo lại trên server vài chục giây
  // chờ có event mới, nên đặt timeout dài hơn các API khác.
  return callApi('/api/v1/poll', { channels, last }, 65000);
}

module.exports = {
  whoami,
  getTickets,
  getTicketDetail,
  assignToMe,
  startSession,
  endSession,
  markDone,
  getMessages,
  postMessage,
  getRealtimeChannel,
  getDispatchChannel,
  poll,
};
