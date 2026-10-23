# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **WASD / phím mũi tên:** di chuyển hoặc lái xe theo hướng màn hình.
- **E:** lên/xuống xe, tương tác nhiệm vụ gần điểm màu cam. **M:** mở bảng nhiệm vụ; **Esc:** đóng bảng.
- **Shift:** chạy nhanh. **Space:** phanh.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** phóng to, thu nhỏ. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm khi tay không). **1–4 / Q:** đổi vũ khí.
- Có 6 nhiệm vụ để chọn và chơi lại, thưởng từ 100.000đ đến 250.000đ. Sau nhiệm vụ giao hàng đầu tiên, **Tiệm súng** (ô xanh trên bản đồ) mở cửa: súng lục, súng săn, tiểu liên.
- Bắn, đấm hoặc tông xe vào người đi đường làm họ ngã kiểu ragdoll; phóng nhanh đâm tường thì chính bạn văng khỏi xe.
- Nút **FPS** trên thanh trên cùng mở cài đặt đồ họa (Tự động / Cao / Cân bằng / Hiệu năng) và cho biết trình duyệt đang vẽ bằng GPU nào.
- Điện thoại có các nút cảm ứng. Trên máy tính nên dùng trình duyệt hỗ trợ WebGL và bật tăng tốc phần cứng.

## Nhiệm vụ

| Nhiệm vụ | Cách chơi | Phần thưởng |
| --- | --- | --- |
| Cà phê sáng | Nhận rồi giao cà phê, nhấn E ở mỗi điểm | 100.000đ · 50 điểm |
| Chuyến hàng từ chợ | Lấy nguyên liệu ở chợ và mang về quán | 130.000đ · 70 điểm |
| Bưu tá phố nhỏ | Nhận hai bưu kiện rồi giao theo thứ tự | 180.000đ · 100 điểm |
| Một vòng Phố Việt | Đi bộ hoặc lái xe qua bốn vòng sáng | 120.000đ · 80 điểm |
| Góc phố xanh | Xuống xe, nhấn E dọn rác ở bốn điểm | 150.000đ · 90 điểm |
| Tay lái phố Việt | Nhấn E trên xe ở vạch xuất phát, qua sáu chốt trong 100 giây | 250.000đ · 150 điểm |

Mỗi lượt hoàn thành chỉ nhận thưởng một lần; chọn chơi lại để bắt đầu lượt mới. Đổi nhiệm vụ xóa tiến độ đang làm nhưng giữ tiền, điểm và lịch sử hoàn thành trong lượt chơi hiện tại. Vòng đua kết thúc nếu hết giờ hoặc ngã xe. Đồng hồ tạm dừng khi mở bảng nhiệm vụ, hướng dẫn, tiệm súng hoặc chuyển sang tab khác. Các chốt cần đi theo đường phố, không phải luôn đi thẳng tới điểm trên bản đồ.

## Phạm vi bản thử nghiệm

Có khu phố 3D, va chạm công trình, xe máy cá nhân, sáu nhiệm vụ và người chơi khác được đồng bộ qua máy chủ. Phòng dùng HTTP polling khoảng 350 ms cộng thời gian mạng, nội suy hiển thị ở phía trình duyệt; chưa phải máy chủ mô phỏng vật lý có thẩm quyền. Điểm và di chuyển do máy khách gửi, không phù hợp thi đấu có thưởng. Người chơi vắng mặt bị ẩn sau 15 giây, phiên hết hạn sau 30 phút không hoạt động. Nhiệm vụ, tiền, vũ khí, người đi đường và ragdoll chỉ chạy trong máy của từng người chơi, chưa đồng bộ qua phòng. Chưa có cảnh sát, chat hoặc lưu tiến trình dài hạn.

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
node --experimental-transform-types --test scripts/missions.test.mjs
node --experimental-transform-types --experimental-sqlite --test scripts/room.test.mjs
```

Bộ kiểm tra dùng SQLite thật và migration đã sinh để kiểm tra đồng bộ hai người, mã phiên, giới hạn 8 người, dữ liệu lỗi, hết hạn và thu hồi chỗ trống. Giới hạn 8 người là giới hạn logic đã kiểm tra, không phải kết quả benchmark mạng.

Kiểm thử nhiệm vụ bao phủ thứ tự mục tiêu, khoảng cách tương tác, yêu cầu lên/xuống xe, hết giờ/ngã xe, thưởng một lần, đổi nhiệm vụ và chơi lại.
