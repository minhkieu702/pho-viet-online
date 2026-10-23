# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **Đi bộ:** WASD / phím mũi tên theo hướng camera, **Shift** chạy.
- **Lái xe (xe máy, ô tô, ngựa):** **W / S** tiến, lùi · **A / D** rẽ · **Space** phanh. Camera tự xoay ra sau xe. Vẫn bắn được khi đang lái (click chuột hoặc F).
- **E:** lên/xuống xe, cướp ô tô hoặc xe máy đang chạy, nhận/giao cà phê, nhận việc phụ, vào cửa hàng và bệnh viện.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** zoom. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm). **1–6 / Q** đổi vũ khí. **R** nạp đạn. **Giữ Tab:** túi súng, thời gian chậm lại.
- **Thành phố:** bản đồ 270 m × 270 m với bệnh viện, đồn công an, trường học, chùa, trạm xe buýt. Có ngày đêm (một ngày bằng 24 phút), nắng, mây, mưa. Ô tô và xe máy chạy theo làn, dừng cho người qua vạch kẻ đường. Có chó, mèo, sóc, chim bồ câu.
- **Người dân có lịch sinh hoạt:** mỗi người có nhà riêng, sáng bước ra cửa đi làm, đi học, đi chợ; trưa ăn; chiều ra công viên; tối về nhà. Bong bóng thoại hiện điều họ đang nói.
- **Giao cà phê:** nhận ở quán Cô Ba, giao cho người nhận đang vẫy tay, mỗi đơn 100.000đ. Thêm **20 việc phụ** (chấm vàng trên bản đồ): chở khách, đua xe, tìm mèo, bắt cướp giật, dọn rác công viên, thách đấu băng đảng…
- **Tiệm súng:** súng lục, súng săn, tiểu liên, súng phóng lựu, bazooka, có đạn và hộp đạn. **Cửa hàng xe máy:** Cub, tay ga, Vespa, xe côn tay, ngựa; xe hỏng dần, bốc cháy rồi nổ.
- **Cướp:** chĩa súng vào người dân thì họ giơ tay, giữ ngắm thì họ đưa tiền (chủ quán đưa cả két). Hạ ai thì rơi tiền ngẫu nhiên, đi qua để nhặt.
- **Băng đảng Rắn Đen và Hổ Vàng:** giữ địa bàn; đánh, chĩa súng hay cầm súng lảng vảng ở đó thì cả băng xông vào đánh, giận hơn thì rút súng.
- **Truy nã 1–5 sao:** cảnh sát ngày càng gắt: dùi cui và súng điện, rồi súng lục, súng săn, SWAT với tiểu liên; rải bẫy đinh làm xịt lốp, lập chốt chặn ở ngã tư, vây bọc và đón đầu. Bị bắt thì ra đồn, bị hạ gục thì tỉnh lại ở bệnh viện sau 5 giây; trả tiền ở bệnh viện để hồi máu.
- **Ragdoll:** người có khuỷu tay, đầu gối; nổ hay súng săn sát người có thể làm đứt tay chân. Động vật cũng ngã kiểu ragdoll.
- **Phòng chung:** người chơi đấm, bắn, tông được nhau (và bị truy nã); máu, vũ khí, phương tiện và trạng thái gục được đồng bộ qua máy chủ.
- Điện thoại có các nút cảm ứng. Trên máy tính nên dùng trình duyệt hỗ trợ WebGL và bật tăng tốc phần cứng.

## Phạm vi bản thử nghiệm

Có khu phố 3D, va chạm công trình, xe máy cá nhân, nhiệm vụ giao cà phê lặp lại và người chơi khác được đồng bộ qua máy chủ. Phòng dùng HTTP polling khoảng 350 ms cộng thời gian mạng, nội suy hiển thị ở phía trình duyệt; chưa phải máy chủ mô phỏng vật lý có thẩm quyền. Điểm và di chuyển do máy khách gửi, không phù hợp thi đấu có thưởng. Người chơi vắng mặt bị ẩn sau 15 giây, phiên hết hạn sau 30 phút không hoạt động. Tiền, xe, người dân, động vật, giao thông, thời tiết, cảnh sát và ragdoll chạy riêng trong máy từng người; giữa người chơi chỉ đồng bộ vị trí, máu, vũ khí, phương tiện, sao truy nã và các đòn đánh trúng nhau (máy khách tự báo, không chống gian lận). Chưa có chat hoặc lưu tiến trình dài hạn.

## Deploy lên Cloudflare

Đặt `D1_DATABASE_ID` là ID database D1 thật khi build (bỏ trống thì dùng ID giả của Sites), áp các migration mới bằng `wrangler d1 execute DB --remote --config dist/server/wrangler.json --file drizzle/<tệp>.sql`, rồi `wrangler deploy --config dist/server/wrangler.json`.

## Hiệu năng

- Bóng đổ của khu phố được vẽ một lần (bản đồ tĩnh); nhân vật và xe dùng bóng mờ instanced nên mỗi khung hình không phải vẽ lại shadow map.
- Người dân, động vật, ô tô, xe máy, cảnh sát, ragdoll, giọt máu, thanh máu, mảnh vỡ và mây đều là instanced mesh: mỗi nhóm chỉ tốn vài lần vẽ dù phố đông. Mưa là một shader, không tốn CPU cho từng giọt.
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
