# IT Support Agent App (Desktop)

Ứng dụng Electron dành cho **nhân viên IT support** (khác với **IT Support Desktop Client**,
app cài trên máy khách hàng). Cho phép agent:

- Xem danh sách ticket ("Của tôi" / "Chưa gán")
- Nhận ticket (Assign to Me)
- Start / End session để tính giờ công (chọn Online/Onsite lúc Start)
- Đánh dấu ticket hoàn thành
- Chat 2 chiều với khách hàng theo từng ticket
- Nhận thông báo realtime khi có ticket mới hoặc tin nhắn mới (long-polling)

Đây là bản desktop tương đương với Mobile App (Flutter) đã có — cùng nghiệp vụ, cùng gọi
REST API của module `it_support_management`, khác nền tảng UI.

## Cài đặt (môi trường phát triển)

```bash
npm install
npm start
```

## Build file cài đặt

```bash
npm run build:win   # Windows (.exe)
npm run build:mac   # macOS (.dmg)
```

## Đăng nhập

Mỗi nhân viên IT support cần **API key cá nhân riêng** (không dùng chung), tạo tại:

Odoo: Settings > Users & Companies > Users > (mở user của agent) > Account Security >
New API Key > **chọn "Persistent Key"** (không chọn thời hạn ngắn, tránh tự hết hạn).

Khi đăng nhập, app gọi `/api/v1/whoami` để:
1. Xác thực API key hợp lệ.
2. Lấy đúng tên thật của agent từ server (không nhập tay).
3. Kiểm tra tài khoản có thuộc group "IT Support Agent"/"Manager" không - nếu không, từ
   chối đăng nhập.

## Lưu ý mạng (test với giả lập / máy khác)

- Nếu Odoo chạy trên máy khác trong cùng mạng LAN: dùng IP thật của máy đó, ví dụ
  `http://192.168.1.x:8069`.
- Không dùng `localhost` nếu Odoo server không chạy trên cùng máy với app này.

## Cấu trúc thư mục

```
src/
  main.js          # Main process: window, tray, IPC handlers, realtime polling loop
  preload.js        # contextBridge - cầu nối an toàn renderer <-> main
  config.js          # Lưu config cục bộ (server, apiKey, agentName lấy từ whoami)
  api.js              # Gọi REST API của module Odoo it_support_management
  renderer/
    index.html
    style.css
    renderer.js     # Logic UI: login, danh sách ticket, chi tiết/chat
```

## Realtime

- Ở danh sách ticket: subscribe channel "dispatch" chung, báo khi có ticket mới/chưa gán.
- Khi mở chi tiết 1 ticket: subscribe channel riêng của ticket đó (chat mới, đổi trạng
  thái, session start/end từ phía khách hàng hoặc từ thiết bị khác của chính agent).
- Cùng cơ chế long-polling `/api/v1/poll` đã dùng ở Desktop Client App và Mobile App.

## Remote control (chưa có)

Tính năng remote control (xem/điều khiển màn hình khách hàng ngay trong app) đang được
cân nhắc kỹ trước khi triển khai, vì:
- Các thư viện remote desktop mã nguồn mở phổ biến (RustDesk...) là ứng dụng độc lập,
  không cung cấp SDK để nhúng UI vào app khác.
- Tự viết remote control từ đầu (capture màn hình, mã hóa video, truyền P2P, gửi input)
  là một dự án kỹ thuật lớn, rủi ro an ninh cao nếu làm không kỹ.

Hiện tại field `ultraview_id` của từng thiết bị khách hàng vẫn hiển thị trên Odoo backend
(`it.customer.device`) để agent tự mở UltraViewer/RustDesk như công cụ rời, nhập đúng ID đó.
