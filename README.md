# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **WASD / phím mũi tên:** di chuyển hoặc lái xe theo hướng màn hình.
- **E:** lên/xuống xe, nhận/giao cà phê gần điểm màu cam.
- **Shift:** chạy nhanh. **Space:** phanh.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** phóng to, thu nhỏ. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm khi tay không). **1–4 / Q:** đổi vũ khí.
- Mỗi đơn giao cà phê được 100.000đ. Sau đơn đầu tiên, **Tiệm súng** (ô xanh trên bản đồ) mở cửa: súng lục, súng săn, tiểu liên.
- Bắn, đấm hoặc tông xe vào người đi đường làm họ ngã kiểu ragdoll; phóng nhanh đâm tường thì chính bạn văng khỏi xe.
- Nút **FPS** trên thanh trên cùng mở cài đặt đồ họa (Tự động / Cao / Cân bằng / Hiệu năng) và cho biết trình duyệt đang vẽ bằng GPU nào.
- Điện thoại có các nút cảm ứng. Trên máy tính nên dùng trình duyệt hỗ trợ WebGL và bật tăng tốc phần cứng.

## Phạm vi bản thử nghiệm

Có khu phố 3D, va chạm công trình, xe máy cá nhân, nhiệm vụ giao cà phê lặp lại và người chơi khác được đồng bộ qua máy chủ. Phòng dùng HTTP polling khoảng 350 ms cộng thời gian mạng, nội suy hiển thị ở phía trình duyệt; chưa phải máy chủ mô phỏng vật lý có thẩm quyền. Điểm và di chuyển do máy khách gửi, không phù hợp thi đấu có thưởng. Người chơi vắng mặt bị ẩn sau 15 giây, phiên hết hạn sau 30 phút không hoạt động. Tiền, vũ khí, người đi đường và ragdoll chỉ chạy trong máy của từng người chơi, chưa đồng bộ qua phòng. Chưa có cảnh sát, chat hoặc lưu tiến trình dài hạn.

## Hiệu năng

- Bóng đổ của khu phố được vẽ một lần (bản đồ tĩnh); nhân vật và xe dùng bóng mờ instanced nên mỗi khung hình không phải vẽ lại shadow map.
- Chế độ **Tự động** đo nhịp khung hình mỗi giây, so với tần số quét màn hình và hạ dần (bóng đổ → độ phân giải → tắt bóng) khi rớt khung, rồi nâng lại khi ổn định.
- Lần đầu chạy, cấp đồ họa được chọn theo tên GPU (GPU tích hợp, điện thoại hoặc render bằng CPU bắt đầu ở mức nhẹ). Khi trình duyệt tắt tăng tốc phần cứng, game cảnh báo vì WebGL đang chạy trên CPU.
- FPS bị giới hạn bởi tần số quét màn hình: 120 FPS cần màn hình 120 Hz trở lên.

## Phát triển

Node.js 22.13 trở lên. Frontend React/Vinext + Three.js, backend Cloudflare Worker + D1. Trang dùng Sites hosting, giữ cấu hình trong `.openai/hosting.json`.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_unknown_skullbuster.sql
npm run dev
```

Chỉ chạy migration trên cơ sở dữ liệu local mới; không chạy lại tệp SQL đã áp dụng. Bản hosted tự áp dụng migration qua quy trình Sites. Lỗi trình khởi chạy `npm.cmd` trên một số môi trường Windows có thể được tránh bằng cách gọi `node` với đường dẫn tuyệt đối tới `npm-cli.js` của bản Node đã cài.

## Kiểm tra

```sh
npx tsc --noEmit
node --experimental-transform-types --experimental-sqlite --test scripts/room.test.mjs
```

Bộ kiểm tra dùng SQLite thật và migration đã sinh để kiểm tra đồng bộ hai người, mã phiên, giới hạn 8 người, dữ liệu lỗi, hết hạn và thu hồi chỗ trống. Giới hạn 8 người là giới hạn logic đã kiểm tra, không phải kết quả benchmark mạng.
