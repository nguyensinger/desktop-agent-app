// config.js
// Lưu trữ config đơn giản bằng file JSON trong thư mục userData của app.
// Không dùng electron-store vì từ v9 trở lên là pure ESM, không tương thích
// với main process CommonJS truyền thống.
//
// QUAN TRỌNG: agentName/agentUserId KHÔNG được nhập tay - luôn lấy từ server qua
// API /api/v1/whoami ngay sau khi xác thực API key thành công, để đảm bảo tên hiển
// thị luôn khớp đúng với chính user thật đứng sau API key đó (xem main.js).

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');

const DEFAULTS = {
  odooBaseUrl: '',
  apiKey: '',
  agentUserId: null,
  agentName: '',
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (err) {
    return { ...DEFAULTS };
  }
}

function writeConfig(config) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfig() {
  return readConfig();
}

function setConfig(partialConfig) {
  const current = readConfig();
  const updated = { ...current, ...partialConfig };
  writeConfig(updated);
  return updated;
}

function isConfigured() {
  const c = readConfig();
  return Boolean(c.odooBaseUrl && c.apiKey && c.agentName);
}

module.exports = { getConfig, setConfig, isConfigured, CONFIG_FILE };
