# Vòng 19: ba xe theo "vehicle asset bible" (dáng Kia Carnival, Seltos, Sorento)

## Quy tắc nhãn hiệu

Dự án không dùng logo hay chữ của hãng thật, nên trên xe không có logo Kia, không có chữ KIA/CARNIVAL/SELTOS/SORENTO, không chép chi tiết thiết kế đã đăng ký. Mỗi xe có tên riêng do game đặt, một logo riêng (vòng tròn với chiếc lá sen cách điệu) và biển số giả lập (30A-…).

| Trong game | Kiểu xe | Dựng theo kích thước của |
|---|---|---|
| **Lữ Hành** | MPV 7 chỗ | Kia New Carnival 2.2D Premium 7S |
| **Phố Nhỏ** | SUV đô thị 5 chỗ | Kia New Seltos 1.5L Premium |
| **Đồi Xa** | SUV 7 chỗ | Kia New Sorento 2.5G Signature FWD |

Kích thước, chiều dài cơ sở, khoảng sáng gầm, lốp, số ghế và giá đều lấy theo hồ sơ (số liệu Kia Việt Nam công bố, tra ngày 27/11/2026). Mặt cắt thân xe, vị trí trục, vệt bánh và màu sơn là số liệu hồ sơ đề xuất cho game, không phải bản vẽ CAD.

## Cách dựng (`src/game/cars/`)

- `carSpecs.ts`: thông số ba xe, bảng màu.
- `carGeometry.ts`: dựng xe từ code, không dùng file mô hình.
  - **Thân xe:** loft theo các mặt cắt trong hồ sơ (bảng t = z/L). Ở LOD0 có 7 điểm hông để hốc bánh tròn.
  - **Hốc bánh:** thân xe thụt vào thật quanh bánh, có lớp lót tối và viền nhựa đen; bánh không xuyên thân.
  - **Cabin:** để rỗng. Kính, trụ A/B/C/D sơn đen, mái, viền cao su là các phần riêng; kính tối phía sau trụ B.
  - **Cửa và cốp:** cắt ra từ chính lớp vỏ thành nhóm có bản lề riêng, có tấm ốp trong. Lữ Hành có cửa sau trượt (đẩy ra 12 cm rồi trượt về sau).
  - **Bánh:** nhóm đánh lái chứa nhóm quay. Hoa văn mâm riêng từng xe: Lữ Hành 10 chấu hình học, Phố Nhỏ 5 chấu kép, Đồi Xa 20 chấu mảnh.
  - **Đèn:** từng nhóm phát sáng riêng (định vị, cos, phanh, hậu, xi-nhan, lùi). Kiểu đèn hậu khác nhau: Lữ Hành thanh ngang + đèn góc dọc; Phố Nhỏ dải nối liền; Đồi Xa cặp đèn dọc mỗi bên, không nối ngang.
  - **Chi tiết ngoài:** lưới tản nhiệt hoa văn đa giác, ốp bạc cản trước/sau, gương có xi-nhan, tay nắm, khe cửa, nắp xăng, giá nóc (SUV), cánh gió, ăng-ten vây cá, biển số, khay gầm tối.
  - **Nội thất (LOD0):**
    - sàn, thảm, trần, tấm ốp hông theo thân xe;
    - táp-lô có cửa gió, hộc găng, màn hình đôi (CanvasTexture vẽ lại khoảng 6 lần/giây: tốc độ, số, nhiên liệu, bản đồ nhỏ);
    - vô lăng (Torus) bên trái, bàn đạp, bệ trung tâm với núm xoay (Lữ Hành, Đồi Xa) hoặc cần số (Phố Nhỏ), sạc không dây, hộc cốc, tỳ tay;
    - tấm che nắng, gương trong;
    - ghế đúng cấu hình 2+2+3 / 2+3 / 2+3+2, có tựa đầu, dây đai và khoá đỏ. Lữ Hành có hai ghế VIP hàng 2 với đệm chân và tay vịn;
    - khoang hành lý có đồ; hàng ghế cuối gập được.
- `CarModel.tsx`:
  - `THREE.LOD` 4 mức, có độ trễ 12% để không nhấp nháy khi đổi mức.
  - Cửa chạy theo trạng thái CLOSED/OPENING/OPEN/CLOSING, có làm mượt và tính theo deltaTime; không mở khi xe đang chạy.
  - Bánh quay theo quãng đường chia bán kính lốp. Vô lăng xoay theo góc lái. Vật liệu đèn theo trạng thái.
- `carRegistry.ts`: danh sách xe sở hữu (modelId, trim, màu, ownerId, vehicleId, số ghế, giá, nhiên liệu, ô hành lý, featureFlags, chỗ đỗ). Lưu localStorage, có số phiên bản dữ liệu.
- `world/Dealership.tsx`: showroom "Ô tô Đời Việt" trên bãi trống cạnh phố Kim Mã.
  - Ba xe đứng trên bàn xoay. Bấm E ở xe thì mở chế độ xem: xoay 360°, các góc trước / hông / sau / trên / chéo trước / chéo sau, vào ghế lái.
  - Chọn màu, mở cửa, mở cốp, gập ghế, xem bảng thông số.
  - Mua bằng tiền trong game: kiểm tra ví trước, trừ tiền một lần, cấp vehicleId, xe đỗ ngay trước showroom.

## Xe 1: Lữ Hành (MPV, dáng Carnival)

Ảnh trong game:
- [trước](luhanh-front.png), [hông](luhanh-side.png), [sau](luhanh-rear.png), [trên](luhanh-top.png)
- [chéo trước](luhanh-front34.png), [chéo sau](luhanh-rear34.png)
- [cửa mở: cửa trước bản lề, cửa sau trượt, cốp nâng](luhanh-doors.png)
- [ghế lái](luhanh-interior.png)

Ảnh hãng dùng để so (chỉ để link, không đưa vào repo):
- [đầu xe chéo](https://kiavietnam.com.vn/storage/new-carnival/new-carnival-ngoai-thatjpg.webp)
- [hông](https://kiavietnam.com.vn/storage/new-carnival/new-carnival-ngoai-that-2.webp)
- [đuôi](https://kiavietnam.com.vn/storage/new-carnival/new-carnival-ngoai-that-3.webp)

Đã sửa sau khi so ảnh:
- Kính lái nghiêng hơn (đỉnh kính lùi về sau).
- Toàn bộ trụ sơn đen, tạo dáng mái nổi như ảnh.
- Kính tối phía sau trụ B.
- Đèn pha có vỏ tối.
- Thêm viền nhựa đen quanh hốc bánh.
- Lùi ghế và táp-lô về đúng vị trí cabin. Hồ sơ ghi toạ độ ghế là "tạm"; ghế đặt theo toạ độ đó thì vô lăng nằm ngay trước mặt người lái.

### Bản 2: sửa sau góp ý của chủ dự án ("chưa mua được xe", "ngoại thất xấu")

Trước và sau, cùng góc máy:
- [chéo trước](luhanh-before-after-front34.png)
- [hông](luhanh-before-after-side.png)
- [chéo sau](luhanh-before-after-rear34.png)

Ảnh so cạnh ảnh hãng chỉ gửi cho chủ dự án, không đưa vào repo vì ảnh hãng có bản quyền.

**Vì sao chưa mua được xe**
1. Ví admin luôn được nạp lại đến 999.999.999đ. Lữ Hành giá 1,499 tỷ, Đồi Xa 1,199 tỷ, nên admin cũng bị báo không đủ tiền. Người chơi thường bắt đầu với 300.000đ nên không mua được xe nào.
2. Khung showroom canh giữa màn hình và không cuộn được. Nút "Mua xe" nhỏ, nằm ở đáy khung, nên trên màn hình thấp (laptop 768 px trừ thanh trình duyệt) nút bị đẩy ra ngoài, không bấm được. Thông báo "không đủ tiền" cũng nằm ở dưới, dễ bị che.

**Đã sửa**
- Khung giá ở đầu panel: giá lớn, nút đỏ "Mua xe · 1.499.000.000đ". Bấm vào thì hiện bước xác nhận "Mua Lữ Hành màu … với giá …?" với nút Xác nhận mua / Huỷ.
- Mua xong: thông báo ngay trong khung, toast "Đã mua … · biển …", xe đỗ trước cửa showroom và được lưu (localStorage).
- Thiếu tiền: nút chuyển xám, ghi rõ còn thiếu bao nhiêu.
- Admin mua không bị trừ tiền; lịch sử ví ghi "admin, không trừ tiền".
- Panel cuộn được, không bao giờ cao quá màn hình.
- Đã thử trong game ở màn 1366×620, bấm phím E thật rồi bấm các nút:
  - [bước xác nhận](luhanh-buy-confirm.png), [đã mua](luhanh-buy-done.png);
  - người chơi có 2 tỷ: mua được, ví còn 501 triệu;
  - admin với ví 300.000đ: mua được, không bị trừ tiền.

**Ngoại thất đã làm lại**
- Thân xe mượt hơn: mặt cắt dày hơn (8 cm thay vì 12 cm), 9 điểm hông thay vì 7. Hông hơi phồng ở giữa, có đường gân ngay dưới kính để bắt sáng.
- Capo dài và dốc xuống mũi, mép trước capo bo tròn. Mũi xe bo tròn hơn khi nhìn từ trên.
- Dây kính cao hơn: kính hông thấp lại, thân dày hơn như xe thật.
- Mặt trước:
  - lưới tản nhiệt rộng gần hết mặt xe, viền chrome, các thanh ngang;
  - đèn pha dọc mảnh ở hai góc, dải LED chạy ngang trên lưới;
  - đèn sương mù và hốc gió ở góc cản.
- Sơn: MeshPhysicalMaterial có lớp clearcoat, kim loại hơn. Xe dùng một env map nhỏ (RoomEnvironment) chỉ cho vật liệu của xe, nên chrome, bạc và kính có phản chiếu mà không đổi ánh sáng của cả thành phố.
- Thân: nẹp chrome chạy dọc chân kính, mảng bạc ở trụ D, giá nóc màu bạc.
- Mâm và lốp:
  - lốp tiện tròn (lathe) có hông lốp phồng và vai lốp bo;
  - mâm có lòng chảo, chấu thuôn từ tâm ra vành;
  - chụp tâm có logo riêng, 5 ốc bánh.
- Gương: vỏ bo tròn trên chân gương, mặt gương phản chiếu, xi-nhan.
- Đuôi:
  - dải đèn hậu liền suốt chiều ngang, cụm đèn dọc ở hai góc;
  - phản quang ở cản, ốp bạc với các khe kiểu khuếch tán gió.
- Sửa lỗi cũ: mặt đuôi xe bị lật mặt (chiều tam giác ngược), nên bị cắt mất và nhìn thấy khoang hành lý đen bên trong. Giờ mặt đuôi hiện đúng màu sơn.

| Số đo (đo trong game, bản 2) | LOD0 | LOD1 | LOD2 | LOD3 |
|---|---|---|---|---|
| Tam giác | 18.332 | 6.844 | 2.016 | 200 |
| Mesh (≈ draw call) | 100 | 32 | 27 | 5 |
| Mục tiêu hồ sơ | 6–12k | 2–5k | 0,7–1,5k | 150–500 |

Bản 1 là 11.928 / 4.984 / 1.636 / 200. Thân mượt hơn và mâm mới làm LOD0, LOD1, LOD2 vượt mục tiêu của hồ sơ. LOD0 chỉ hiện khi đứng cách xe dưới 18 m.

FPS: Edge headless, 1280×800, trong showroom có 3 xe ở LOD0, đo được 36–46 FPS ở các góc chụp. Bản 1 đo được 13–25 FPS, nhưng lúc đó máy đang tải nặng hơn, nên hai số không so trực tiếp được.

### Còn khác ảnh thật hoặc chưa làm

- **Mặt trước:** vẫn là một mặt phẳng đứng, chưa có độ cong như xe thật. Xe thật có lưới và đèn ôm theo mặt cong.
- **Cửa sổ và trụ D:** xe thật có đường cửa sổ nâng lên ở trụ D; trong game chân kính vẫn thẳng.
- **Mâm:** mâm thật hai tông tối/bạc; trong game là bạc.
- **Lái xe:** chưa lái được ba xe này. Hệ thống ô tô người chơi lái (`src/game/vehicle/`, `Player.tsx`) là phần phiên khác đang làm dở, chưa commit, nên mình chưa nối vào được. Xe mua về hiện đứng đỗ.
- **Phần chưa làm:** gửi xe vào hầm Lotte, hành khách ngồi theo ghế, cốp chứa đồ (hàng tồn sẽ làm sau khi đủ ba xe).
