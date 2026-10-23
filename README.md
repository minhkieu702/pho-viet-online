# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **Đi bộ:** WASD / phím mũi tên theo hướng camera, **Shift** chạy.
- **Lái xe:** **W / S** tiến, lùi · **A / D** rẽ · **Space** phanh. Camera tự xoay ra sau xe khi đang chạy.
- **E:** lên/xuống xe, cướp ô tô đang chạy, nhận/giao cà phê, vào cửa hàng.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** zoom. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm). **1–4 / Q** đổi vũ khí. **Giữ Tab:** mở túi súng, thời gian chậm lại.
- Nhận cà phê ở quán Cô Ba, giao cho người nhận đang vẫy tay (6 địa chỉ ngẫu nhiên), mỗi đơn 100.000đ.
- **Tiệm súng** (ô xanh dương, mở sau đơn đầu tiên): súng lục, súng săn, tiểu liên.
- **Cửa hàng xe máy** (ô xanh lá): xe số Cub, tay ga, Vespa, xe côn tay và ngựa. Xe hỏng dần khi va chạm hoặc bị bắn, bốc khói rồi chết máy; sửa hoặc mua xe mới tại đây.
- Ô tô chạy theo làn trên mọi tuyến đường. Người đi đường có máu, thanh máu hiện khi bị đánh; hết máu thì ngã kiểu ragdoll và chảy máu.
- **Truy nã 1–5 sao:** đánh, bắn, tông người hoặc cướp xe sẽ bị xe cảnh sát truy đuổi. Cảnh sát xuống xe còng tay, vụt dùi cui, từ 2 sao thì nổ súng. Trốn khỏi tầm mắt một lúc để thoát. Bị bắt mất 30% tiền, bị hạ gục mất 20%.
- **Phòng chung:** người chơi đấm, bắn, tông được nhau; máu, vũ khí, phương tiện và trạng thái gục được đồng bộ qua máy chủ.
- Điện thoại có các nút cảm ứng. Trên máy tính nên dùng trình duyệt hỗ trợ WebGL và bật tăng tốc phần cứng.

## Phạm vi bản thử nghiệm

Có khu phố 3D, va chạm công trình, xe máy cá nhân, nhiệm vụ giao cà phê lặp lại và người chơi khác được đồng bộ qua máy chủ. Phòng dùng HTTP polling khoảng 350 ms cộng thời gian mạng, nội suy hiển thị ở phía trình duyệt; chưa phải máy chủ mô phỏng vật lý có thẩm quyền. Điểm và di chuyển do máy khách gửi, không phù hợp thi đấu có thưởng. Người chơi vắng mặt bị ẩn sau 15 giây, phiên hết hạn sau 30 phút không hoạt động. Tiền, xe, người đi đường, giao thông, cảnh sát và ragdoll chạy riêng trong máy từng người; giữa người chơi chỉ đồng bộ vị trí, máu, vũ khí, phương tiện, sao truy nã và các đòn đánh trúng nhau (máy khách tự báo, không chống gian lận). Chưa có chat hoặc lưu tiến trình dài hạn.

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
node --experimental-transform-types --experimental-sqlite --test scripts/room.test.mjs
```

Bộ kiểm tra dùng SQLite thật và migration đã sinh để kiểm tra đồng bộ hai người, mã phiên, giới hạn 8 người, dữ liệu lỗi, hết hạn và thu hồi chỗ trống. Giới hạn 8 người là giới hạn logic đã kiểm tra, không phải kết quả benchmark mạng.
