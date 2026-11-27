# Vòng 20: hệ thống ô tô ĐỜI VIỆT, xe 1 "Lữ Hành" dựng bằng Blender

Làm theo master prompt "Hệ thống ô tô toàn cầu":
- xe do game tự thiết kế, thuộc thương hiệu hư cấu;
- dựng bằng script Python trong Blender, xuất GLB nhiều mức chi tiết, nạp vào Three.js.

Hai mẫu Carnival tải từ Sketchfab (của geyges và tonielpro520) không được dùng và không có trong repo. Cả hai là bản sao nguyên vẹn xe thật; một mẫu có dấu hiệu là tài nguyên tách từ game khác. Nếu giữ lại, chúng chỉ được để tham khảo nội bộ (REFERENCE_ONLY).

## Thương hiệu hư cấu: Sen Việt

| | |
|---|---|
| Biểu tượng | Vòng tròn với nụ sen ba cánh. Logo được vẽ trong script Blender và gắn trên capo, cửa cốp, chụp mâm, vô lăng. |
| Ngôn ngữ thiết kế ngoài | "Đường sen": dải LED ban ngày liền một nét, cong lên ở hai đầu như cánh sen. Lưới tản nhiệt thấp hình "nụ cười". Mui nổi với khung kính đen. Mâm 5 cánh kép. Đèn hậu là một thanh ngang có đuôi cánh hoa. |
| Ngôn ngữ thiết kế trong | Táp-lô nằm ngang. Hai màn hình chung một tấm kính. Ốp gỗ và dải bạc, đèn viền vàng ấm, ghế da. |
| Đặt tên | Tên tiếng Việt gợi hành trình và nơi chốn: Lữ Hành, Phố Nhỏ, Đồi Xa. |
| Kiểm tra tên | `REVIEW_REQUIRED`: phải tra cứu nhãn hiệu trước khi phát hành thương mại. |

## Cấu trúc

- **`tools/blender/vehicles/build_vehicle.py`** (cùng `vehicle_full.py`, `vehicle_full2.py`): script dùng chung cho mọi xe, đọc một file thiết kế `designs/<xe>.json`. Các bước:
  1. Lồng điều khiển (control cage) gồm các mặt cắt thân xe, mỗi mặt cắt 11 điểm, dựng nửa xe.
  2. Mirror → Subdivision Surface cấp 3. Đặt crease ở đường dây kính và mép kính.
  3. Cắt hốc bánh bằng boolean, thêm lớp lót hốc bánh.
  4. Tách cửa trước (bản lề), cửa sau (trượt) và cốp theo đúng đường lưới của lồng, mỗi phần có trục quay riêng.
  5. Đèn, lưới tản nhiệt, viền, logo, biển số được chiếu bám theo bề mặt thân xe.
  6. Bánh: lốp tiện tròn có hông lốp, mâm cánh sen, đĩa phanh, cùm phanh.
  7. Nội thất đủ bộ, các điểm neo, collision proxy.
  8. Xuất `.blend` + GLB LOD0 / LOD1 / LOD2 + metadata JSON + 12 ảnh render.
- **`assets-source/vehicles/senviet/luhanh/luhanh.blend`**: file nguồn. Mỗi bộ phận là một object riêng có tên chuẩn (Headlight_L, Door_FL, …).
- **`public/assets/vehicles/senviet/luhanh/`**:
  - `luhanh_lod0/1/2.glb`, đã nén meshopt: 412 / 228 / 125 KB;
  - `luhanh.json` (metadata, `rightsStatus: ORIGINAL_DESIGN`).

  File GLB chỉ tải khi người chơi lại gần showroom (dưới khoảng 140 m).
- **`src/game/cars/vehicleRegistry.ts`**:
  - `VehicleConfig` có đủ các trường của spec (vehicleId, brandId, …, rightsStatus, referenceSources, assetLicense);
  - enum `RightsStatus` (ORIGINAL_DESIGN / LICENSED / REFERENCE_ONLY / REVIEW_REQUIRED / BLOCKED_FOR_RELEASE);
  - `BRANDS`.

  `modelAsset()` chỉ trả về file khi trạng thái là ORIGINAL_DESIGN hoặc LICENSED. Tên xe thật tham chiếu chỉ nằm trong dữ liệu nội bộ, không hiện trong game.
- **`src/game/cars/GltfCar.tsx`**: phần hiển thị cho xe dựng bằng Blender.
  - Đổi màu sơn bằng cách thay vật liệu `Paint` (clearcoat), không xuất lại GLB.
  - Kính trong suốt nhẹ. Màn hình táp-lô vẽ tốc độ, số, nhiên liệu, bản đồ nhỏ. Biển số giả lập.
  - Chạy animation theo tên node chuẩn: `Door_*_Pivot`, `Trunk_Pivot`, `Wheel_*_Spin`, `Wheel_F*_Steer`, `SteeringWheel_Pivot`, `SeatFold_R3`.
  - Bật tắt đèn theo vật liệu `Light_*`.
  - Camera nội thất đọc vị trí từ `Anchor_CameraInterior` / `Anchor_RearSeats`.
- **`world/Dealership.tsx`**: showroom dùng xe Blender cho Lữ Hành. Xe tự dựng bằng code hiện tạm trong lúc GLB đang tải. Có thêm nút "Ngồi ghế sau". Mua xe, lưu xe và ID xe đã sở hữu không đổi.

Node trong GLB: VehicleRoot, BodyRoot, BodyShell, Glass, Door_FL/FR/RL/RR_Pivot, Trunk_Pivot, Wheel_FL/FR_Steer, Wheel_FL/FR/RL/RR_Spin, SteeringWheel_Pivot, Interior, Dashboard, Seats, SeatFold_R3, Lights, Anchors (Anchor_DriverSeat, Anchor_FrontPassenger, Anchor_RearSeats, Anchor_ThirdRow, Anchor_EnterDriver, Anchor_ExitDriver, Anchor_Cargo, Anchor_CameraInterior, Anchor_CameraThirdPerson, Anchor_CameraRear, Anchor_CameraShowroom), CollisionProxies.

Để giảm lệnh vẽ, khi xuất GLB các mesh được gộp theo từng bộ phận chuyển động: 257 → 91 lệnh vẽ ở LOD0. Vì vậy trong GLB, đèn tách theo kênh vật liệu (Light_Head, Light_DRL, Light_Tail, Light_Brake, Light_Reverse, Light_Indicator, Light_Interior). Các node đèn riêng (Headlight_L, …) vẫn còn đủ trong file `.blend`.

## Ảnh

Render từ mô hình Blender thật (Workbench, bóng cavity):
- [trước](luhanh-blender-front.png), [sau](luhanh-blender-rear.png), [trái](luhanh-blender-left.png), [phải](luhanh-blender-right.png)
- [chéo trước](luhanh-blender-front34.png), [chéo sau](luhanh-blender-rear34.png), [trên](luhanh-blender-top.png)
- [khoang lái](luhanh-blender-cockpit.png), [hàng ghế sau](luhanh-blender-rearseats.png), [cốp](luhanh-blender-boot.png)
- [mở cửa](luhanh-blender-doors_open.png), [wireframe](luhanh-blender-wireframe.png)

Trong game (showroom phố Kim Mã):
- [toàn cảnh showroom](luhanh-game-showroom.png)
- [chéo trước](luhanh-game-front34.png), [hông](luhanh-game-side.png), [chéo sau](luhanh-game-rear34.png), [trước](luhanh-game-front.png)
- [mở cửa trượt và cốp](luhanh-game-doors.png), [ghế lái](luhanh-game-driver.png), [ghế sau](luhanh-game-rearseats.png), [đổi màu đỏ](luhanh-game-red.png)

## Số đo

| | LOD0 (< 18 m) | LOD1 (18–50 m) | LOD2 (> 50 m) |
|---|---|---|---|
| Tam giác | 78.046 | 25.615 | 5.405 |
| Lệnh vẽ (primitive) | 91 | 79 | 71 |
| GLB (meshopt) | 412 KB | 228 KB | 125 KB |
| Ngân sách spec | 25–60k | 8–20k | 1–4k |

Cả ba mức đều vượt ngân sách của spec.
- LOD0 dư phần lớn ở thân subdivision cấp 3 và nội thất.
- LOD1 và LOD2 chưa giảm tiếp; lệnh vẽ ở LOD1 và LOD2 vẫn còn cao vì nhiều bộ phận nhỏ giữ vật liệu riêng.

FPS đo trong showroom (Edge headless, 1280×800, máy đang tải nặng):
- có xe Blender: 16–24 FPS;
- cùng kịch bản, thay bằng xe tự dựng bằng code: 21–38 FPS.

Xe Blender làm giảm FPS thấy rõ. Đã tắt bóng đổ cho mọi phần trừ thân sơn.

## Đánh giá thật về hình ảnh

Đạt:
- Nhìn ra một MPV 7 chỗ hiện đại, tỷ lệ đúng kích thước 5,155 × 2,01 × 1,775 m.
- Thân liền mạch, bo cong.
- Hốc bánh thật, bánh xe có hông lốp và mâm riêng.
- Đầu xe có nhận diện riêng của Sen Việt (đường sen, lưới nụ cười), không giống xe thật nào.
- Cửa trước mở bản lề, cửa sau trượt, cốp nâng, hàng ghế 3 gập.
- Nội thất đủ: táp-lô, 2 màn hình, vô lăng có logo, ghế 2+2+3, ghế VIP hàng 2, dây đai, đèn trần, gương, tấm che nắng, đồ trong cốp.

Chưa đạt, cần làm tiếp:
- Capo và mũi xe còn tròn và phồng. Gương chiếu hậu hình quả trứng.
- Khung kính đi theo cửa nên khi mở cửa trước có một "vây" đen dựng lên.
- Nội thất khá tối trong showroom. Biển số trước bị cản che.
- Mép cắt hốc bánh hơi răng cưa khi nhìn gần.
- Chưa lái được: hệ thống lái là phần phiên khác đang làm dở, chưa commit. Hệ đó dùng `createCar()` với cùng kiểu node (bánh có pivot, cửa, đèn, neo), nên có thể nối vào sau.
- Phố Nhỏ và Đồi Xa vẫn là xe tự dựng bằng code, chưa có bản Blender.
