// main.js
// Main process của Desktop Agent App - ứng dụng cho nhân viên IT support:
// xem/nhận ticket, Start/End session, chat với khách hàng.

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');

const { getConfig, setConfig } = require('./config');
const api = require('./api');

// Windows yêu cầu app có AppUserModelID đăng ký để Action Center chịu hiện toast
// notification - mặc định khi chạy dev (npm start / electron .) không có sẵn cái
// này (chỉ có khi cài qua installer .exe có Start Menu shortcut), khiến
// new Notification(...) tạo thành công nhưng Windows âm thầm không hiện gì cả,
// không báo lỗi. Set thủ công ở đây giúp thông báo hiện được ngay cả ở dev mode.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.vmtech.itsupportagentapp');
}

let mainWindow = null;
let tray = null;

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 480,
    height: 760,
    minWidth: 420,
    minHeight: 600,
    title: 'VM TECH Desktop Support',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toUpperCase() === 'I')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }
  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip('VM TECH Desktop Support');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open VM TECH Desktop Support', click: () => createWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => createWindow());
}

app.whenReady().then(() => {
  createTray();
  createWindow();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

ipcMain.handle('config:get', () => getConfig());

ipcMain.handle('auth:login', async (event, { baseUrl, email, password }) => {
  // /api/v1/agent/login đã tự kiểm tra email/password VÀ quyền Agent/Manager phía
  // server - nếu gọi thành công (không throw) thì chắc chắn hợp lệ, không cần whoami()
  // riêng nữa. Server trả luôn 1 API key mới, dùng cho mọi request sau này y hệt như
  // khi dán tay 1 key có sẵn trước đây.
  const result = await api.login(baseUrl, email, password);
  setConfig({
    odooBaseUrl: baseUrl,
    apiKey: result.api_key,
    agentUserId: result.user_id,
    agentName: result.name,
    isManager: !!result.is_manager,
  });
  return result;
});

ipcMain.handle('auth:logout', () => {
  setConfig({ odooBaseUrl: '', apiKey: '', agentName: '', agentUserId: null, isManager: false });
});

ipcMain.handle('ticket:list', async (event, opts) => api.getTickets(opts || {}));

ipcMain.handle('ticket:detail', async (event, ticketId) => api.getTicketDetail(ticketId));

ipcMain.handle('ticket:assign', async (event, ticketId) => api.assignToMe(ticketId));

ipcMain.handle('ticket:sessionStart', async (event, { ticketId, supportMode }) =>
  api.startSession(ticketId, supportMode));

ipcMain.handle('ticket:sessionEnd', async (event, { ticketId, note, resolutionStatus }) =>
  api.endSession(ticketId, note, resolutionStatus));

ipcMain.handle('ticket:done', async (event, ticketId) => api.markDone(ticketId));

ipcMain.handle('ticket:getMessages', async (event, ticketId) => api.getMessages(ticketId));

ipcMain.handle('ticket:postMessage', async (event, { ticketId, body }) =>
  api.postMessage(ticketId, body));

let realtimeSubscription = null;

async function realtimePollLoop(channel) {
  let last = 0;
  while (realtimeSubscription && realtimeSubscription.channel === channel && !realtimeSubscription.stopped) {
    try {
      const notifications = await api.poll([channel], last);
      if (notifications && notifications.length > 0) {
        for (const notif of notifications) {
          last = Math.max(last, notif.id || 0);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('realtime:event', { channel, notifications });
        }
      }
    } catch (err) {
      console.error('[realtime poll] lỗi, thử lại sau 5s:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

ipcMain.handle('realtime:subscribe', async (event, channel) => {
  if (realtimeSubscription) {
    realtimeSubscription.stopped = true;
  }
  realtimeSubscription = { channel, stopped: false };
  realtimePollLoop(channel);
  return { channel };
});

ipcMain.handle('realtime:unsubscribe', () => {
  if (realtimeSubscription) {
    realtimeSubscription.stopped = true;
    realtimeSubscription = null;
  }
});

ipcMain.handle('realtime:getTicketChannel', async (event, ticketId) => {
  const result = await api.getRealtimeChannel(ticketId);
  return result.channel;
});

ipcMain.handle('realtime:getDispatchChannel', async () => {
  const result = await api.getDispatchChannel();
  return result.channel;
});

ipcMain.handle('booking:list', async () => api.getBookingRequests());

ipcMain.handle('booking:createTicket', async (event, bookingId) => api.createTicketFromBooking(bookingId));

ipcMain.handle('app:focusWindow', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});
