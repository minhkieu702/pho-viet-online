# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **Đi bộ:** WASD / phím mũi tên theo hướng camera, **Shift** chạy.
- **Lái xe:** **W / S** tiến, lùi · **A / D** rẽ · **Space** phanh. Camera tự xoay ra sau xe khi đang chạy.
- **E:** lên/xuống xe, cướp ô tô đang chạy, tương tác nhiệm vụ gần điểm màu cam, vào cửa hàng. **M:** mở bảng nhiệm vụ; **Esc:** đóng bảng.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** zoom. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm). **1–4 / Q** đổi vũ khí. **Giữ Tab:** mở túi súng, thời gian chậm lại.
- Có 6 nhiệm vụ để chọn và chơi lại, thưởng từ 100.000đ đến 250.000đ: giao cà phê, hàng chợ, bưu kiện, khám phá, dọn phố và đua xe máy.
- **Tiệm súng** (ô xanh dương, mở sau nhiệm vụ giao hàng đầu tiên): súng lục, súng săn, tiểu liên.
- **Cửa hàng xe máy** (ô xanh lá): xe số Cub, tay ga, Vespa, xe côn tay và ngựa. Xe hỏng dần khi va chạm hoặc bị bắn, bốc khói rồi chết máy; sửa hoặc mua xe mới tại đây.
- Ô tô chạy theo làn trên mọi tuyến đường. Người đi đường có máu, thanh máu hiện khi bị đánh; hết máu thì ngã kiểu ragdoll và chảy máu.
- **Truy nã 1–5 sao:** đánh, bắn, tông người hoặc cướp xe sẽ bị xe cảnh sát truy đuổi. Cảnh sát xuống xe còng tay, vụt dùi cui, từ 2 sao thì nổ súng. Trốn khỏi tầm mắt một lúc để thoát. Bị bắt mất 30% tiền, bị hạ gục mất 20%.
- **Phòng chung:** người chơi đấm, bắn, tông được nhau; máu, vũ khí, phương tiện và trạng thái gục được đồng bộ qua máy chủ.
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
| Tay lái phố Việt | Nhấn E trên xe máy ở vạch xuất phát, qua sáu chốt trong 100 giây | 250.000đ · 150 điểm |

Điểm giao cà phê thay đổi khi bạn chọn hoặc chơi lại nhiệm vụ này.

Mỗi lượt hoàn thành chỉ nhận thưởng một lần; chọn chơi lại để bắt đầu lượt mới. Đổi nhiệm vụ xóa tiến độ đang làm nhưng giữ tiền, điểm và lịch sử hoàn thành trong lượt chơi hiện tại. Vòng đua kết thúc nếu hết giờ hoặc ngã xe. Đồng hồ tạm dừng khi mở bảng nhiệm vụ, hướng dẫn, tiệm súng hoặc chuyển sang tab khác. Các chốt cần đi theo đường phố, không phải luôn đi thẳng tới điểm trên bản đồ.

## Phạm vi bản thử nghiệm

Có khu phố 3D, va chạm công trình, xe máy cá nhân, sáu nhiệm vụ có thể chơi lại và người chơi khác được đồng bộ qua máy chủ. Phòng dùng HTTP polling khoảng 350 ms cộng thời gian mạng, nội suy hiển thị ở phía trình duyệt; chưa phải máy chủ mô phỏng vật lý có thẩm quyền. Điểm và di chuyển do máy khách gửi, không phù hợp thi đấu có thưởng. Người chơi vắng mặt bị ẩn sau 15 giây, phiên hết hạn sau 30 phút không hoạt động. Nhiệm vụ, tiền, xe, người đi đường, giao thông, cảnh sát và ragdoll chạy riêng trong máy từng người; giữa người chơi đồng bộ vị trí, máu, vũ khí, phương tiện, sao truy nã và các đòn đánh trúng nhau (máy khách tự báo, không chống gian lận). Chưa có chat hoặc lưu tiến trình dài hạn.

## Deploy lên Cloudflare

Đặt `D1_DATABASE_ID` là ID database D1 thật khi build (bỏ trống thì dùng ID giả của Sites), áp các migration mới bằng `wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/<tệp>.sql`, rồi `wrangler deploy --config dist/server/wrangler.json`.

## Hiệu năng

- Bóng đổ của khu phố được vẽ một lần (bản đồ tĩnh); nhân vật và xe dùng bóng mờ instanced nên mỗi khung hình không phải vẽ lại shadow map.
- Gần 50 người đi đường, toàn bộ ô tô, cảnh sát, giọt máu, thanh máu và mây đều là instanced mesh: mỗi nhóm chỉ tốn vài lần vẽ dù phố đông.
- Chế độ **Tự động** đo nhịp khung hình mỗi giây, so với tần số quét màn hình và hạ dần (bóng đổ → độ phân giải → tắt bóng) khi rớt khung, rồi nâng lại khi ổn định.
- Lần đầu chạy, cấp đồ họa được chọn theo tên GPU (GPU tích hợp, điện thoại hoặc render bằng CPU bắt đầu ở mức nhẹ). Khi trình duyệt tắt tăng tốc phần cứng, game cảnh báo vì WebGL đang chạy trên CPU.
- FPS bị giới hạn bởi tần số quét màn hình: 120 FPS cần màn hình 120 Hz trở lên.

## Phát triển

Node.js 22.13 trở lên. Frontend React/Vinext + Three.js, backend Cloudflare Worker + D1. Trang dùng Sites hosting, giữ cấu hình trong `.openai/hosting.json`.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_unknown_skullbuster.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_pvp_hits.sql
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
