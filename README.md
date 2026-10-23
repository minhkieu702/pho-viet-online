# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **Đi bộ:** WASD / phím mũi tên theo hướng camera, **Shift** chạy.
- **Lái xe (xe máy, ô tô, ngựa):** **W** ga · **S** phanh rồi lùi · **A / D** lái · **Space** phanh tay (ô tô trượt đuôi khi ôm cua). Xe có quán tính và độ bám đường kiểu GTA: chạy nhanh thì tay lái đầm hơn, trời mưa đường trơn, xịt lốp thì khó giữ lái. Camera tự xoay ra sau xe, góc nhìn rộng ra khi chạy nhanh. Vẫn bắn được khi đang lái (click chuột hoặc F). Cướp xe thì nhân vật của bạn ngồi trên xe; người lái cũ bị lôi xuống.
- **E:** lên/xuống xe, cướp ô tô hoặc xe máy đang chạy, tương tác nhiệm vụ ở điểm màu cam, nhận việc phụ, vào cửa hàng và bệnh viện. **M:** bảng nhiệm vụ; **Esc:** đóng.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** zoom. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm). **1–6 / Q** đổi vũ khí. **R** nạp đạn. **Giữ Tab:** túi súng, thời gian chậm lại.
- **Thành phố:** bản đồ 270 m × 270 m với bệnh viện, đồn công an, trường học, chùa, trạm xe buýt. Có ngày đêm (một ngày bằng 24 phút), nắng, mây, mưa (mưa phủ kín khung nhìn dù zoom xa). Đường nhựa có vỉa hè lát gạch, bó vỉa cao hơn lòng đường; người đi bộ đi trên vỉa hè và chỉ băng qua ở vạch kẻ đường. Ô tô và xe máy chạy theo làn, có người lái thật ngồi trên xe, dừng cho người qua đường. Có chó, mèo, sóc, chim bồ câu.
- **Người dân có lịch sinh hoạt:** mỗi người có nhà riêng, sáng bước ra cửa đi làm, đi học, đi chợ; trưa ăn; chiều ra công viên; tối về nhà. Bong bóng thoại hiện điều họ đang nói.
- **6 nhiệm vụ chính** chọn và chơi lại bằng phím M (xem bảng bên dưới). Thêm **20 việc phụ** nhận ở chấm vàng trên bản đồ: chở khách, đua xe, tìm mèo, bắt cướp giật, dọn rác công viên, thách đấu băng đảng…
- **Tiệm súng:** súng lục, súng săn, tiểu liên, súng phóng lựu, bazooka, có đạn và hộp đạn. **Cửa hàng xe máy:** Cub, tay ga, Vespa, xe côn tay, ngựa; xe hỏng dần, bốc cháy rồi nổ.
- **Cướp:** chĩa súng vào người dân thì họ giơ tay, giữ ngắm thì họ đưa tiền (chủ quán đưa cả két). Hạ ai thì rơi tiền ngẫu nhiên, đi qua để nhặt.
- **Băng đảng Rắn Đen và Hổ Vàng:** giữ địa bàn; đánh, chĩa súng hay cầm súng lảng vảng ở đó thì cả băng xông vào đánh, giận hơn thì rút súng.
- **Truy nã 1–5 sao:** cảnh sát ngày càng gắt: dùi cui và súng điện, rồi súng lục, súng săn, SWAT với tiểu liên; rải bẫy đinh làm xịt lốp, lập chốt chặn ở ngã tư, vây bọc và đón đầu, ép xe (PIT), lao vào quật ngã khi bạn bỏ chạy, lôi bạn ra khỏi xe đang đứng, ném lựu đạn cay từ 3 sao, nấp sau xe khi bạn cầm súng, trực thăng soi đèn từ 4 sao. Nhấn **H** để giơ tay đầu hàng: cảnh sát thôi bắn và tới còng tay. Khi bị bắt, nhân vật giơ tay, quỳ xuống, bị còng tay và áp giải. Bị bắt thì ra đồn, bị hạ gục thì tỉnh lại ở bệnh viện sau 5 giây; trả tiền ở bệnh viện để hồi máu.
- **Ragdoll:** người có khuỷu tay, đầu gối; nổ hay súng săn sát người có thể làm đứt tay chân. Động vật cũng ngã kiểu ragdoll.
- **Phòng chung:** người chơi đấm, bắn, tông được nhau (và bị truy nã); máu, vũ khí, phương tiện và trạng thái gục được đồng bộ qua máy chủ.
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

Có khu phố 3D, va chạm công trình, xe máy cá nhân, sáu nhiệm vụ có thể chơi lại và người chơi khác được đồng bộ qua WebSocket. Một Cloudflare Durable Object quản lý từng phòng, nhận và phát trạng thái khoảng 20 lần/giây khi có thay đổi. Trình duyệt nội suy với bộ đệm 120 ms và chỉ dự đoán thêm tối đa 120 ms khi thiếu bản tin. Đây là thông số thiết kế, không phải cam kết độ trễ trên mọi mạng.

Điểm và di chuyển vẫn do máy khách gửi; chưa phải máy chủ mô phỏng vật lý có thẩm quyền, không phù hợp thi đấu có thưởng. Nhiệm vụ, tiền, xe, người dân, động vật, giao thông, thời tiết, cảnh sát và ragdoll chạy riêng trong máy từng người; giữa người chơi đồng bộ vị trí, máu, vũ khí, phương tiện, sao truy nã và các đòn đánh trúng nhau. Chưa có chat hoặc lưu tiến trình dài hạn.

### Cách đồng bộ

- HTTP `/api/room` chỉ tạo, tham gia hoặc rời phòng. Vị trí đi qua `/api/room/socket?room=CODE`; mã bí mật được gửi trong bản tin xác thực đầu tiên, không nằm trong URL hay danh sách người chơi.
- Trạng thái chuyển động ở bộ nhớ Durable Object; không truy vấn D1 theo từng bước di chuyển. Object lưu tên phòng và mã phiên đã băm khi thay đổi thành viên, định kỳ khoảng 60 giây và khi ngắt kết nối cuối. Vị trí được gửi lại từ trình duyệt sau khi object khởi động lại.
- Tự nối lại với thời gian chờ tăng dần; bỏ qua trạng thái chuyển động cũ khi đường truyền đầy. Đòn đánh có ID, xác nhận và gửi lại trong tối đa 10 giây; chống trùng được giữ qua lần nối lại của cùng trang. Hàng đợi có giới hạn; đây không phải nhật ký chiến đấu bền vững qua khởi động lại máy chủ hoặc tải lại trang.
- Mỗi phòng tối đa 8 chỗ đang hoạt động. Mất kết nối 15 giây sẽ nhường chỗ; mã phiên có thể nối lại trong 30 phút nếu phòng còn chỗ. Sau nhiều lượt ra/vào, object chỉ giữ tối đa 64 phiên gần đây. Kết nối mới của cùng phiên thay thế kết nối cũ.
- Nội suy người chơi khác dùng đồng hồ riêng, không bị chậm theo thao tác mở túi súng. Độ trễ hiển thị trong game là thời gian ping khứ hồi, không gồm bộ đệm nội suy.

## Deploy lên Cloudflare

Chỉ triển khai khi muốn cập nhật bản đang chơi. Push GitHub không tự chạy lệnh deploy trong repository này.

`vite.config.ts` khai báo binding `ROOMS`, lớp export `RealtimeRoom` và migration SQLite `v1-realtime-rooms`. Bản build phải giữ cả ba trong `dist/server/wrangler.json`; Wrangler áp migration Durable Object khi deploy. Tài khoản/hosting đích phải hỗ trợ Durable Objects và cho phép WebSocket upgrade.

Binding D1 cũ vẫn được giữ để bảo toàn dữ liệu và cấu hình hiện có, nhưng multiplayer mới không dùng các bảng đó. Đặt `D1_DATABASE_ID` là ID database D1 thật khi build cho tài khoản Cloudflare riêng (bỏ trống thì dùng ID giả của Sites). Sau khi kiểm tra cấu hình, dùng `wrangler deploy --config dist/server/wrangler.json`. Không chạy lại migration D1 cũ để bật WebSocket.

Phòng D1 của phiên bản polling không được chuyển sang Durable Object; sau khi triển khai phiên bản này, tải lại trang và tạo phòng mới. Giữ `.openai/hosting.json` để bảo toàn định danh Sites; cần xác nhận hosting hỗ trợ binding/migration mới trước khi xuất bản lên đó.

## Hiệu năng

- Bóng đổ của khu phố được vẽ một lần (bản đồ tĩnh); nhân vật và xe dùng bóng mờ instanced nên mỗi khung hình không phải vẽ lại shadow map.
- Gần 50 người đi đường, toàn bộ ô tô, cảnh sát, giọt máu, thanh máu và mây đều là instanced mesh: mỗi nhóm chỉ tốn vài lần vẽ dù phố đông.
- Chế độ **Tự động** đo nhịp khung hình mỗi giây, so với tần số quét màn hình và hạ dần (bóng đổ → độ phân giải → tắt bóng) khi rớt khung, rồi nâng lại khi ổn định.
- Lần đầu chạy, cấp đồ họa được chọn theo tên GPU (GPU tích hợp, điện thoại hoặc render bằng CPU bắt đầu ở mức nhẹ). Khi trình duyệt tắt tăng tốc phần cứng, game cảnh báo vì WebGL đang chạy trên CPU.
- FPS bị giới hạn bởi tần số quét màn hình: 120 FPS cần màn hình 120 Hz trở lên.

- Người dân, động vật, ô tô, xe máy, cảnh sát, ragdoll, giọt máu, thanh máu, mảnh vỡ và mây đều là instanced mesh: mỗi nhóm chỉ tốn vài lần vẽ dù phố đông. Mưa là một shader, không tốn CPU cho từng giọt.

## Phát triển

Node.js 22.13 trở lên. Frontend React/Vinext + Three.js, backend Cloudflare Worker + Durable Objects. Local dùng runtime của Cloudflare, không cần đăng nhập tài khoản hoặc database remote.

```sh
npm ci
npm run build
npm start
```

Mở địa chỉ local mà Wrangler in ra (thường là `http://127.0.0.1:8787`). `npm run dev` dùng cho chỉnh sửa giao diện; kiểm tra WebSocket trên bản build với `npm start` để chạy đúng entrypoint của Worker. Không cần migration D1 cho phòng mới. Lỗi trình khởi chạy `npm.cmd` trên một số môi trường Windows có thể được tránh bằng cách gọi `node` với đường dẫn tuyệt đối tới `npm-cli.js` của bản Node đã cài.

## Kiểm tra

```sh
npx tsc --noEmit
npm test
# Khi npm start đang chạy trong terminal khác:
npm run test:realtime
```

Bộ kiểm tra bao phủ vòng đời phòng, xác thực, giới hạn 8 người, hết hạn, nội suy và tự nối lại. Kiểm tra tích hợp dùng HTTP/WebSocket thật qua Worker và Durable Object local: hai chiều chuyển động, phòng riêng biệt, bản tin cũ/lỗi, thay thế kết nối, xác nhận đòn đánh và nhường chỗ sau mất mạng. Có thể đặt `TEST_BASE_URL` để đổi cổng local; bộ kiểm tra từ chối host remote. Giới hạn 8 người là giới hạn logic đã kiểm tra, không phải kết quả benchmark mạng Internet.

Kiểm thử nhiệm vụ bao phủ thứ tự mục tiêu, khoảng cách tương tác, yêu cầu lên/xuống xe, hết giờ/ngã xe, thưởng một lần, đổi nhiệm vụ và chơi lại.
