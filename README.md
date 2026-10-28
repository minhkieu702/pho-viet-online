# Phố Việt Online

Bản thử nghiệm game thế giới mở 3D trên trình duyệt, lấy bối cảnh khu phố An Hòa hư cấu ở Việt Nam. Đồ họa được dựng bằng hình học Three.js và biển hiệu canvas, không dùng tài sản của GTA.

## Chơi

- Nhập tên, chọn **Tạo phòng cùng bạn bè** hoặc **Dạo phố một mình**. Màn hình chính còn có **Chế độ Zombie** và **Chế độ Siêu anh hùng**, là hai lượt chơi riêng dành cho một người.
- Gửi link mời hoặc mã phòng 6 ký tự cho người có quyền truy cập trang. Một phòng có tối đa 8 người đang kết nối.
- **Đi bộ:** WASD / phím mũi tên theo hướng camera, **Shift** chạy. Nhân vật có khớp gối và khuỷu tay: đi thì gối gập, tay vung; chạy thì người đổ về trước, tay đánh mạnh, nghiêng người khi rẽ; nhảy co chân, tiếp đất khuỵu gối; đấm có xoay vai; trúng đòn thì giật người; đứng yên thì thở; thùng giao hàng sau lưng nảy theo nhịp chạy. Người đi đường và cảnh sát cũng đổ người về trước khi chạy.
- **Lái xe (xe máy, ô tô, ngựa):** **W** ga · **S** phanh rồi lùi · **A / D** lái · **Space** phanh tay (ô tô trượt đuôi khi ôm cua). Xe có quán tính và độ bám đường kiểu GTA: đánh lái vào cua mượt dần, buông tay lái thì xe tự trả thẳng; chạy nhanh thì tay lái đầm hơn, trời mưa đường trơn, xịt lốp thì khó giữ lái. Tay lái nhạy, bẻ cua gắt (xe máy gắt hơn ô tô). Xe máy nghiêng **vào phía đang rẽ** đúng góc cân bằng theo tốc độ (rẽ phải nghiêng phải, rẽ trái nghiêng trái), người lái ngả theo thêm một chút; xe máy chạy ngoài đường cũng vậy. Xe ngoài đường vào cua theo đường vòng cung thay vì quay ngoắt tại chỗ.
- **Va chạm giữa các xe:** ô tô với ô tô, xe máy với ô tô, xe máy với xe máy đều va chạm thật: xe như những khối có khối lượng (ô tô 1,3 tấn, xe cảnh sát 1,5 tấn, xe máy kể cả người lái khoảng 260 kg), cú đâm truyền động lượng và làm xe xoay theo chỗ bị tông. Xe bị tông văng khỏi làn, trượt ngang rồi dừng, tài xế bình tĩnh lại thì chạy tiếp; xe máy bị tông mạnh thì đổ, người lái văng ra. Có tia lửa, mảnh nhựa/kính/sơn văng ra và nằm lại trên đường một lúc, tiếng va chạm (kèm tiếng kính vỡ khi đâm mạnh), rung camera, xe hư hỏng theo lực va chạm (đâm đủ mạnh thì bốc khói, cháy, nổ). Tài xế bị tông thò đầu ra quát và bấm còi. Bạn đi xe máy đâm mạnh vào xe khác thì ngã xe. Xe cảnh sát đang đuổi theo húc dạt xe khác sang bên.
- **Đèn giao thông:** mọi ngã tư có cột đèn ở góc phải mỗi hướng, một cụm đèn treo trên cần vươn ra giữa làn và một cụm thấp trên cột. Chu kỳ 34 giây (xanh 13 giây, vàng 3 giây, rồi đỏ), các ngã tư lệch pha nhau tạo "làn sóng xanh"; ban đêm đèn sáng rõ, chế độ Zombie thì mất điện. Xe ngoài đường dừng đúng vạch khi đèn đỏ, gặp đèn vàng thì dừng nếu còn kịp phanh, xếp hàng sau xe phía trước. Người đi bộ đứng chờ trên vỉa hè tới khi xe hướng cắt ngang bị đèn đỏ chặn mới sang đường (trừ người đang chạy trốn). Vượt đèn đỏ ngay trước mặt cảnh sát thì bị truy nã 1 sao. Camera tự xoay ra sau xe, góc nhìn rộng ra khi chạy nhanh. Vẫn bắn được khi đang lái (click chuột hoặc F). Cướp xe thì nhân vật của bạn ngồi trên xe; người lái cũ bị lôi xuống.
- **E:** lên/xuống xe, cướp ô tô hoặc xe máy đang chạy, tương tác nhiệm vụ ở điểm màu cam, nhận việc phụ, vào cửa hàng và bệnh viện, thuê ca nô, lên đài quan sát, cướp ngân hàng. **M:** bảng nhiệm vụ; **Esc:** đóng.
- **Bơi:** đứng trên đường ven sông quay mặt ra sông nhấn **Space** để nhảy qua lan can, hoặc đi ra đầu cầu tàu rồi bước xuống. Dưới nước nhân vật đạp nước (đầu nhô lên) khi đứng yên và bơi sải khi di chuyển, **Shift** bơi nhanh, không cầm súng được. Lên bờ bằng bậc thang cạnh mỗi cầu tàu, hoặc bơi sát bờ kè / cầu tàu rồi nhấn **Space** để leo lên. Tàu thuyền chạy qua sẽ giảm tốc khi có người bơi phía trước; bị thuyền chạy nhanh va phải thì mất máu. Cảnh sát và zombie không xuống nước được.
- **Ca nô:** ở bến **AN HÒA** và **BẾN DU THUYỀN** (chấm xanh dương trên bản đồ) nhấn **E** thuê ca nô 30.000đ. **W** ga · **S** lùi · **A / D** bẻ lái (bánh lái chỉ ăn khi có tốc độ, thân tàu trượt nhẹ và nghiêng vào cua) · **Space** thắng · **E** cập bến (gần cầu tàu hay bậc thang thì bước lên bờ, ngoài sông thì nhảy xuống bơi). Ca nô neo lại chỗ bạn rời đi, quay lại nhấn E để lên tiếp.
- **Đài quan sát & nhảy dù:** cửa **THÁP PHƯƠNG NAM** (tòa 232 m, ô vuông tím trên bản đồ) nhấn **E** mua vé 50.000đ lên nóc tháp, đi dạo ngắm thành phố. **Space** nhảy xuống rơi tự do, **Space** lần nữa để bung dù (dù tự bung nếu để quá lâu); **A / D** lái, **W** lao nhanh, **S** hãm. Dù lượn qua được nóc nhà thấp, bị tòa nhà cao chặn lại; tiếp đất an toàn được cộng điểm, rơi tự do chạm đất thì bị thương nặng, rơi xuống sông thì bơi. **E** trên nóc tháp để đi thang máy xuống.
- **Cướp ngân hàng:** cầm súng tới cửa **NGÂN HÀNG PHƯƠNG NAM** (ô tròn xanh lá) nhấn **E**, rồi đứng gần quầy khoảng 9 giây cho két mở. Đi xa là thất bại. Vét két được 1,2–2,1 triệu đồng nhưng bị truy nã 4 sao; ngân hàng bị phong tỏa 5 phút sau mỗi vụ.
- **Chuột phải kéo / Z, C:** xoay camera. **Lăn chuột:** zoom. **V:** đặt lại góc nhìn. Điện thoại: kéo một ngón để xoay, chụm hai ngón để zoom.
- **B:** đổi giữa góc nhìn thứ nhất và góc nhìn thứ ba; cũng có nút đổi góc nhìn trên HUD. Góc nhìn thứ nhất dùng được trong Dạo phố, phòng multiplayer, Zombie, Siêu anh hùng và Cốt truyện, khi đi bộ, lái xe, bơi, đi thuyền, nhảy dù hoặc bay bằng sức mạnh. Camera trong cửa hàng và các cảnh dàn dựng tạm dùng góc quay riêng, rồi trở về lựa chọn của bạn.
- **Chỉ trong Chế độ Siêu anh hùng:** **J** đổi bộ sức mạnh, **K** dùng kỹ năng, **G** bật/tắt bay khi chọn Iron Man. Bảng sức mạnh trên màn hình có các nút tương ứng cho điện thoại. **H** vẫn là đầu hàng và **R** vẫn là nạp đạn ở mọi chế độ.
- **Click chuột / F:** bắn theo con trỏ (hoặc đấm). **1–6 / Q** đổi vũ khí. **R** nạp đạn. **Giữ Tab:** túi súng, thời gian chậm lại.
- **Ngắm bắn:** tâm ngắm đi theo chuột, chuyển đỏ khi đang nhắm trúng một mục tiêu không bị tường che; đạn bay từ nòng súng tới đúng điểm dưới tâm ngắm (trỏ vào đầu là bắn vào đầu, sát thương gấp 2,5 lần, với zombie gấp 3). Bắn liên tục thì tâm nở ra (độ giật), bắn từ xe thì kém chính xác hơn. **Không có tự ngắm:** click hoặc F bắn đúng vào điểm dưới con trỏ chuột, chỉ trúng khi con trỏ nằm trên mục tiêu; trên điện thoại nút bắn bắn thẳng theo hướng nhân vật đang nhìn. Có vệt đạn bay và dấu ✕ khi trúng (đỏ khi trúng đầu); súng phóng lựu tự tính đường cầu vồng để rơi đúng chỗ ngắm.
- **Chế độ Zombie** (nút ở màn hình chính): khu phố hậu tận thế, mất điện, xe cháy bỏ hoang, đổ nát, chướng ngại cát và thùng lửa; toàn bộ người dân đã thành zombie. Zombie bò lên từ mặt đất hoặc lảo đảo bước ra từ nhà, nghe tiếng súng thì kéo đến, đi vòng theo vỉa hè khi có nhà chắn. Có zombie đi bộ, zombie chạy (nhiều hơn về đêm) và zombie khổng lồ từ đợt 3. Sống sót qua từng đợt; hết đợt được tiếp tế đạn, máu, tiền và nghỉ 20 giây. Có đèn pin khi trời tối, chấm zombie trên bản đồ, kỷ lục đợt được lưu lại. Bấm **Về phố** để quay lại khu phố bình thường.
- **Thành phố:** bản đồ khoảng 490 m × 340 m. Phía tây là khu phố An Hòa (nhà ống, chợ, công viên, bệnh viện, đồn công an, trường học, chùa, trạm xe buýt). Phía đông là **Quận Trung Tâm** kiểu Sài Gòn / New York với đại lộ Nguyễn Huệ, Đồng Khởi, Hàm Nghi, Tôn Đức Thắng: tháp chọc trời bó ống 232 m có đài quan sát, tháp búp sen có sân đỗ trực thăng nhô ra, cao ốc art-deco giật cấp có chóp nhọn kiểu New York, tháp kính văn phòng và ngân hàng, khách sạn 5 sao có biển neon trên nóc, trung tâm thương mại có màn hình LED quảng cáo, chung cư đôi có cầu nối trên cao và vườn trên mái, chung cư ban công, Nhà hát Thành phố kiểu Pháp (cột, mái tam giác, vòm), dãy nhà phố 5–9 tầng có cửa hàng, khách sạn mini, biển quảng cáo trên mái. Có **phố đi bộ** với đài phun nước và **công viên trung tâm**. Ban đêm cửa sổ các tòa sáng đèn theo từng dãy văn phòng, đèn đỏ hàng không nhấp nháy trên nóc nhà cao. Phía bắc là **sông** chạy dọc cả bản đồ: bờ kè có lan can, 4 bến (cầu tàu gỗ, bậc thang xuống nước), bên kia sông là dãy cao ốc trong sương. Trên sông có thuyền ba lá người chèo đội nón lá, tàu buýt sông dừng ở từng bến, tàu nhà hàng giăng đèn, sà lan chở cát, ca nô và thuyền đánh cá vẽ mắt; mỗi thuyền chạy làn riêng, nhấp nhô theo sóng và để lại vệt sóng chữ V. **Mép bản đồ** có tường rào, đường chạy ra ngoài bị chặn bằng rào chắn sọc đỏ trắng có biển "ĐƯỜNG CẤM", hai đầu sông có dây phao, bờ bên kia có lan can; nếu bị hất văng hay kẹt vào chỗ không đi được thì nhân vật (hoặc xe, ca nô) tự được đưa ra chỗ trống gần nhất. Bản đồ nhỏ đi theo người chơi, điểm đến ngoài khung hiện ở mép để chỉ hướng. Có ngày đêm (một ngày bằng 24 phút), nắng, mây, mưa (mưa phủ kín khung nhìn dù zoom xa). Đường nhựa có vỉa hè lát gạch, bó vỉa cao hơn lòng đường; người đi bộ đi trên vỉa hè và chỉ băng qua ở vạch kẻ đường. Ô tô và xe máy chạy theo làn, có người lái thật ngồi trên xe, dừng cho người qua đường. Xe được dựng theo hình dáng thật: sedan, hatchback, SUV, taxi, bán tải và xe cảnh sát (kính, gương, đèn pha, đèn hậu, biển số, nội thất, đèn sáng về đêm); xe máy gồm tay ga, xe số, Vespa và côn tay giống hệt các mẫu trong cửa hàng xe, bánh xe quay khi chạy. Có chó, mèo, sóc, chim bồ câu.
- **Người dân có lịch sinh hoạt:** khoảng 108 người, mỗi người có nhà riêng (nhà ống hoặc căn hộ chung cư), sáng bước ra cửa đi làm (có cả văn phòng, ngân hàng, khách sạn, trung tâm thương mại ở trung tâm), đi học, đi chợ; trưa ăn; chiều ra công viên, phố đi bộ, bờ sông; tối về nhà. Bong bóng thoại hiện điều họ đang nói. Người đứng trước nhà, trước tiệm hay ở quầy chợ **không đứng im như tượng**: dồn trọng tâm từ chân này sang chân kia, xem điện thoại, nghe gọi điện, vươn vai, gãi đầu, khoanh tay, chống nạnh, ngó quanh, đi qua đi lại vài bước; người bán hàng mời khách, với lấy hàng hai bên quầy, quạt quạt giấy; chủ tiệm cầm chổi quét trước cửa; thấy bạn đi ngang (không cầm súng) thì vẫy tay chào; người hiếu kỳ giơ điện thoại quay lại sự cố.
- **6 nhiệm vụ chính** chọn và chơi lại bằng phím M (xem bảng bên dưới). Thêm **20 việc phụ** nhận ở chấm vàng trên bản đồ: chở khách, đua xe, tìm mèo, bắt cướp giật, dọn rác công viên, thách đấu băng đảng…
- **Vào bên trong cửa hàng:** nhấn E ở Tiệm súng, Cửa hàng xe máy hoặc Bệnh viện thì camera chuyển vào trong một căn phòng 3D bày đúng món cửa hàng đó bán, bảng mua hàng nằm bên cạnh. Tiệm súng có tường treo súng, tủ kính, kệ đạn và người bán; cửa hàng xe có các xe trên bục xoay, chuồng ngựa và góc sửa xe; bệnh viện có quầy tiếp đón, giường bệnh, tủ thuốc, y tá và bác sĩ. Món nào cũng có bảng giá (hiện "Đã có"/"Đang dùng" khi đã mua). Rê chuột lên món trong bảng thì camera lại gần món đó; click vào món trong phòng 3D thì món đó được chọn trong bảng. Esc hoặc nút ✕ để ra phố.
- **Phố đèn đỏ (18+):** dãy phố ở đường phía đông bắc (chấm hồng trên bản đồ) có cổng chào "PHỐ ĐÈN ĐỎ", dây lồng đèn đỏ, viền neon và quầng sáng màu về đêm. Gồm Bar Neon, Karaoke Ánh Sao, Vũ trường Moonlight, Spa & Massage, Nhà nghỉ Hoa Hồng (và quán bia hơi để ngắm). Lần đầu vào sẽ hỏi xác nhận đủ 18 tuổi. Mỗi quán có phòng 3D riêng và bảng dịch vụ: uống bia/cocktail/rượu (hồi máu, say lảo đảo một lúc), hát karaoke, vào vũ trường (cộng điểm), xông hơi/massage (hồi máu), thuê nhà nghỉ (tua giờ, ngủ qua đêm còn giúp cắt đuôi cảnh sát khi bị truy nã tối đa 2 sao). Mọi dịch vụ diễn ra sau màn hình đen, không có nội dung khiêu dâm. Chế độ Zombie thì các quán đóng cửa.
- **Tiệm súng:** súng lục, súng săn, tiểu liên, súng phóng lựu, bazooka, có đạn và hộp đạn. **Cửa hàng xe máy:** Cub, tay ga, Vespa, xe côn tay, ngựa; xe hỏng dần, bốc cháy rồi nổ.
- **Cướp:** chĩa súng vào người dân thì họ giơ tay, giữ ngắm thì họ đưa tiền (chủ quán đưa cả két). Hạ ai thì rơi tiền ngẫu nhiên, đi qua để nhặt.
- **Băng đảng Rắn Đen và Hổ Vàng:** giữ địa bàn; đánh, chĩa súng hay cầm súng lảng vảng ở đó thì cả băng xông vào đánh, giận hơn thì rút súng.
- **Truy nã 1–5 sao:** phạm tội xong phải có người báo công an rồi xe mới tới: tội nhẹ khoảng 15 giây, tội nặng (bắn cảnh sát) khoảng 5 giây; sao truy nã nhấp nháy kèm đồng hồ đếm ngược "Cảnh sát tới sau …s" để bạn kịp chuồn. Nếu cảnh sát đang ở ngay gần thì họ ra tay luôn. Đội đầu tiên chạy xe tới từ xa với còi hú. Cảnh sát ngày càng gắt theo số sao: dùi cui và súng điện, rồi súng lục, súng săn, SWAT với tiểu liên; rải bẫy đinh làm xịt lốp, lập chốt chặn ở ngã tư, vây bọc và đón đầu, ép xe (PIT), lao vào quật ngã khi bạn bỏ chạy, lôi bạn ra khỏi xe đang đứng, ném lựu đạn cay từ 3 sao, nấp sau xe khi bạn cầm súng, trực thăng soi đèn từ 4 sao. Nhấn **H** để giơ tay đầu hàng: cảnh sát thôi bắn và tới còng tay. Khi bị bắt, nhân vật giơ tay, quỳ xuống, bị còng tay và áp giải. Bị bắt thì ra đồn, bị hạ gục thì tỉnh lại ở bệnh viện sau 5 giây; trả tiền ở bệnh viện để hồi máu.
- **Ragdoll:** người có khuỷu tay, đầu gối; nổ hay súng săn sát người có thể làm đứt tay chân. Động vật cũng ngã kiểu ragdoll.
- **Phòng chung:** người chơi đấm, bắn, tông được nhau (và bị truy nã); máu, vũ khí, phương tiện và trạng thái gục được đồng bộ qua máy chủ.
- Nút **FPS** trên thanh trên cùng mở cài đặt đồ họa (Tự động / Cao / Cân bằng / Hiệu năng) và cho biết trình duyệt đang vẽ bằng GPU nào.
- Điện thoại có các nút cảm ứng. Trên máy tính nên dùng trình duyệt hỗ trợ WebGL và bật tăng tốc phần cứng.

Ở góc nhìn thứ nhất, nhấp vào khung game để giữ chuột và nhìn quanh; **Esc** thả chuột. Tâm ngắm nằm giữa màn hình. Nếu trình duyệt không cho giữ chuột, dùng chuột phải kéo để nhìn quanh và click hoặc **F** để bắn. Điện thoại kéo một ngón trên cảnh để nhìn quanh, rồi dùng các nút di chuyển và bắn. Góc nhìn là lựa chọn riêng của mỗi người, không đổi góc nhìn của người khác trong phòng.

## Chế độ Siêu anh hùng

Chọn **Chế độ Siêu anh hùng** ở màn hình chính để bắt đầu một lượt chơi tự do, một mình với **Iron Man**. Trong chế độ này, chọn một trong bốn bộ sức mạnh lấy cảm hứng từ Avengers, hoặc **Người dân** để tạm ngừng dùng sức mạnh:

| Bộ sức mạnh | Kỹ năng |
| --- | --- |
| Iron Man | Bắn năng lượng và bay bằng năng lượng có giới hạn |
| Thor | Gọi sét xuống vị trí mục tiêu |
| Hulk | Đập đất, tạo sóng xung kích quanh người |
| Captain America | Ném khiên bay đi rồi quay về |

Các kỹ năng có thời gian hồi riêng và dùng chung một thanh năng lượng; đổi nhân vật không xóa thời gian hồi hay nạp lại năng lượng. Xuống xe và đóng các bảng tạm dừng để dùng sức mạnh. Khi bay cần hạ cánh trước khi đổi anh hùng, tương tác nhiệm vụ hoặc lên xe. Bảng sức mạnh hiển thị trạng thái sẵn sàng, thời gian hồi và năng lượng. Iron Man bay dọc các khoảng trống trên phố, chưa bay xuyên hoặc vượt qua mái công trình; hết năng lượng sẽ tự hạ cánh.

Bấm **Về phố** trên bảng chế độ để bắt đầu lại ở khu phố bình thường. Dạo phố, Zombie và phòng multiplayer thường không bật sức mạnh; các phím J/K/G và bảng chọn anh hùng chỉ hoạt động trong Chế độ Siêu anh hùng. Đây là chế độ chơi một mình, chưa có phòng multiplayer riêng cho siêu anh hùng. Hiệu ứng hình học được dựng trong game; không sử dụng clip phim hoặc mô hình tải từ phim.

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

Có thành phố 3D (khu phố, trung tâm cao tầng, sông), va chạm công trình, xe máy cá nhân, ca nô, sáu nhiệm vụ có thể chơi lại và người chơi khác được đồng bộ qua WebSocket. Một Cloudflare Durable Object quản lý từng phòng, nhận và phát trạng thái khoảng 20 lần/giây khi có thay đổi. Trình duyệt nội suy với bộ đệm 120 ms và chỉ dự đoán thêm tối đa 120 ms khi thiếu bản tin. Đây là thông số thiết kế, không phải cam kết độ trễ trên mọi mạng.

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

Kiểm thử nhiệm vụ bao phủ thứ tự mục tiêu, khoảng cách tương tác, yêu cầu lên/xuống xe, hết giờ/ngã xe, thưởng một lần, đổi nhiệm vụ và chơi lại. Kiểm thử sức mạnh bao phủ bật/tắt theo chế độ, năng lượng, hồi chiêu khi đổi anh hùng, bay/hạ cánh, giới hạn độ cao, quỹ đạo khiên, phạm vi đòn đánh và bản tin multiplayer tương thích máy khách cũ.

Kiểm thử camera bao phủ đổi góc nhìn, giới hạn nhìn lên/xuống, vị trí mắt theo phương tiện/độ cao và giữ hướng nhìn tương đối khi xe rẽ. Kiểm thử mô hình xe và xe buýt xác nhận chế độ góc nhìn thứ nhất chỉ ẩn hình vẽ của phương tiện đang ngồi, giữ nguyên mô phỏng và hiện lại khi đổi về góc nhìn thứ ba.
