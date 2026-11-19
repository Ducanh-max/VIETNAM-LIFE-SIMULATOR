# Tích hợp mô hình công trình

`thap-rua-heritage.glb` và `den-ngoc-son-heritage.glb` là các asset được tách từ file Blender do chủ dự án cung cấp. `thap-rua.glb` là bản GLB cũ, được giữ để so sánh. Mô hình procedural chỉ được dùng nếu GLB không tải được. Nhánh đánh giá cầu sử dụng thêm `cau-the-huc-heritage.glb` từ cùng nguồn Blender; nhánh này phải được duyệt trong Preview trước khi merge.

Đặt file GLB đã tối ưu trong `public/models/`, rồi cập nhật từng URL trong `src/world/landmarkAssets.ts`. Mỗi mô hình dùng **1 đơn vị = 1 mét**, Y hướng lên, +X hướng đông, -Z hướng bắc, vật liệu PBR, không chứa đèn hay camera.

| Asset | Gốc mô hình | Hướng |
| --- | --- | --- |
| `thap-rua-heritage.glb` | tâm đảo Tháp Rùa, tại mặt đất | giữ hướng trong file Blender do chủ dự án cung cấp; cao 8,8 m sau khi căn tỉ lệ |
| `cau-the-huc-heritage.glb` | đầu cầu bờ đông, mặt đi bộ cao khoảng 0,35 m | chiều dài dọc -X; xoay -0,099 rad theo trục cầu OSM; dài khoảng 46,7 m cả gờ cuối |
| `den-ngoc-son-heritage.glb` | gần tâm đảo Ngọc Sơn | +X từ chính điện qua cổng; trong game xoay khoảng +0,635 rad, dịch +4 m X, -12 m Z và hạ Y xuống -1,55 m để sân gạch chạm mặt đảo; chỉ chứa kiến trúc đền, không chứa cầu |

Giữ va chạm riêng trong `geo.ts`; GLB chỉ thay phần hiển thị. GLB đền có sáu mesh theo vật liệu và không chứa cầu; sân gạch là thành phần kiến trúc, còn đảo cỏ trong `Landscape.tsx` chỉ là địa hình nền. Không có component đền procedural nào render đồng thời với GLB sau khi tải thành công. Trong khi tải, `Suspense` không vẽ fallback; fallback chỉ hiện nếu GLB lỗi.

Đền được xuất bằng `scripts/heritage/export-game-temple.py` và cầu bằng `scripts/heritage/export-game-bridge.py` từ `heritage-work/heritage-optimized-working.blend`. Cầu xuất bằng tỉ lệ **đồng nhất** 0,397764 để chạm hai đầu OSM, không bóp méo mesh. Mặt cầu sau đó rộng khoảng 7,1 m; mẫu cầu cũ chỉ rộng khoảng 2,7 m. Đây là sai khác đáng kể về tỉ lệ thẩm mỹ, cần duyệt ảnh Preview trước khi merge. Đường đi và va chạm đền vẫn là bản đơn giản theo bản đồ. Cần kiểm tra WebGL ở Low/High 1080p và đo FPS trên máy có GPU; build không chứng minh chất lượng hình ảnh.
