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

| Số đo (đo trong game) | LOD0 | LOD1 | LOD2 | LOD3 |
|---|---|---|---|---|
| Tam giác | 11.928 | 4.984 | 1.636 | 200 |
| Mesh (≈ draw call) | 90 | 31 | 26 | 5 |
| Mục tiêu hồ sơ | 6–12k | 2–5k | 0,7–1,5k | 150–500 |

LOD2 hơi vượt mục tiêu (1.636 so với tối đa 1.500). LOD0 nhiều draw call vì cửa, bánh, nội thất là các nhóm riêng để chạy hiệu ứng.

FPS: Edge headless, 1280×800, trong showroom có 3 xe ở LOD0, dao động 13–25 FPS. Cùng máy, cùng bãi đất trước khi có showroom đo được 12–32 FPS. Máy đang tải nặng, số chỉ để tham khảo.

### Còn khác ảnh thật hoặc chưa làm

- **Mũi xe:** Lữ Hành vẫn vuông hơn xe thật. Xe thật có capo dốc hơn và mép trước bo tròn.
- **Đường cửa sổ và trụ D:** xe thật có đường cửa sổ nâng lên ở trụ D và nẹp bạc; trong game chưa có.
- **Mâm:** mâm hình học ở mức đơn giản.
- **Lái xe:** chưa lái được ba xe này. Hệ thống ô tô người chơi lái (`src/game/vehicle/`, `Player.tsx`) là phần phiên khác đang làm dở, chưa commit, nên mình chưa nối vào được. Xe mua về hiện đứng đỗ.
- **Phần chưa làm:** gửi xe vào hầm Lotte, hành khách ngồi theo ghế, cốp chứa đồ (hàng tồn sẽ làm sau khi đủ ba xe).
