// preload.js
// Expose 1 API an toàn, có kiểm soát cho renderer process, tuân thủ contextIsolation.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('itSupportAgentApp', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  login: (baseUrl, apiKey) => ipcRenderer.invoke('auth:login', { baseUrl, apiKey }),
  logout: () => ipcRenderer.invoke('auth:logout'),

  getTickets: (opts) => ipcRenderer.invoke('ticket:list', opts),
  getTicketDetail: (ticketId) => ipcRenderer.invoke('ticket:detail', ticketId),
  assignToMe: (ticketId) => ipcRenderer.invoke('ticket:assign', ticketId),
  startSession: (ticketId, supportMode) => ipcRenderer.invoke('ticket:sessionStart', { ticketId, supportMode }),
  endSession: (ticketId, note, resolutionStatus) =>
    ipcRenderer.invoke('ticket:sessionEnd', { ticketId, note, resolutionStatus }),
  markDone: (ticketId) => ipcRenderer.invoke('ticket:done', ticketId),

  getMessages: (ticketId) => ipcRenderer.invoke('ticket:getMessages', ticketId),
  postMessage: (ticketId, body) => ipcRenderer.invoke('ticket:postMessage', { ticketId, body }),

  // Realtime: subscribe bắt đầu vòng lặp long-polling nền trong main process.
  subscribeRealtime: (channel) => ipcRenderer.invoke('realtime:subscribe', channel),
  unsubscribeRealtime: () => ipcRenderer.invoke('realtime:unsubscribe'),
  getTicketChannel: (ticketId) => ipcRenderer.invoke('realtime:getTicketChannel', ticketId),
  getDispatchChannel: () => ipcRenderer.invoke('realtime:getDispatchChannel'),
  onRealtimeEvent: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('realtime:event', handler);
    return () => ipcRenderer.removeListener('realtime:event', handler);
  },
});
