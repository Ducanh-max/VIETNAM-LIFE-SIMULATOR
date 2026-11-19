# Tích hợp mô hình công trình

`thap-rua-heritage.glb` và `den-ngoc-son-heritage.glb` là các asset được tách từ file Blender do chủ dự án cung cấp. GLB cũ được lưu trong lịch sử Git. **Không dùng fallback hình học procedural trong scene:** GLB không tải được thì báo lỗi và không hiển thị công trình cũ. Nhánh đánh giá cầu sử dụng thêm `cau-the-huc-heritage.glb` từ cùng nguồn Blender; nhánh này phải được duyệt trong Preview trước khi merge.

Đặt file GLB đã tối ưu trong `public/models/`, rồi cập nhật từng URL trong `src/world/landmarkAssets.ts`. Mỗi mô hình dùng **1 đơn vị = 1 mét**, Y hướng lên, +X hướng đông, -Z hướng bắc, vật liệu PBR, không chứa đèn hay camera.

| Asset | Gốc mô hình | Hướng |
| --- | --- | --- |
| `thap-rua-heritage.glb` | tâm đảo Tháp Rùa, tại mặt đất | giữ hướng trong file Blender do chủ dự án cung cấp; cao 8,8 m sau khi căn tỉ lệ |
| `cau-the-huc-heritage.glb` | đầu cầu bờ đông, mặt đi bộ cao khoảng 0,35 m | chiều dài dọc -X; xoay -0,099 rad theo trục cầu OSM; mặt ván dài khoảng 46,26 m |
| `den-ngoc-son-heritage.glb` | gần tâm đảo Ngọc Sơn | +X từ chính điện qua cổng; trong game xoay khoảng +0,635 rad, đặt theo templePlacement ở khoảng (-13,863; -1,55; -216,635) để tâm cửa nằm trên trục đường đi, cách đầu cầu phía đảo 1,55 m; chỉ chứa kiến trúc đền, không chứa cầu |

Va chạm trong `geo.ts` dùng khung tọa độ cổng Blender khi GLB đền đã tải; trước khi GLB tải xong có thể dùng kiểm tra va chạm tạm trong logic nhưng không render bất kỳ kiến trúc cũ nào. Từ cc224d7, cao độ sân gạch tăng 0,594 m và phần chân cổng đã lọc được ghi trực tiếp trong GLB khi xuất Blender. Loader không nâng sân hoặc lọc lại tam giác. GLB đền có sáu mesh theo vật liệu và không chứa cầu; sân gạch là thành phần kiến trúc, còn đảo cỏ trong `Landscape.tsx` chỉ là địa hình nền. `Historic.tsx` chỉ render ba GLB được chọn; các mô hình procedural cũ đã bị loại bỏ khỏi đường render. Khi tải chậm hoặc lỗi không được vẽ mô hình cũ.

Hai script `export-game-temple.py` và `export-game-bridge.py` trong `scripts/heritage/` xuất từng công trình từ `heritage-work/heritage-optimized-working.blend`. Nhịp cầu theo hai mốc OSM dài 46,256 m. Hai ngưỡng gỗ chìa thêm 6 cm để tiếp giáp đường đi. Mặt ván rộng 3,00 m. Tính cả kết cấu bên dưới, bề rộng lớn nhất xấp xỉ 4,24 m. Lối đi cho nhân vật rộng 2,50 m.

`bridge_finish.py` lấy mẫu mặt ván của cầu từ Blender để căn cao độ. Tay vịn nằm cao khoảng 1,05 m so với sàn. Các thanh gỗ trên mặt cầu được dựng lại theo tâm cột lấy từ mesh nguồn. Ở đoạn mất dấu một cột, vị trí 37,55 m là trung điểm ước lượng giữa hai dấu cột còn lại. Các ngưỡng gỗ và hai dải ván rộng 22 cm khép mép sàn. Hai texture tạo vân và độ nổi của mối ghép ngang. GLB cầu có 46.460 tam giác, ba vật liệu PBR và dung lượng 900.296 byte.

Xem [hướng dẫn xuất và kiểm tra lại GLB](../scripts/heritage/README.md) và [kết quả kiểm tra gameplay](BRIDGE_INTEGRATION_QA.md).
