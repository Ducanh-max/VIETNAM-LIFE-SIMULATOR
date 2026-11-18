# Tích hợp mô hình công trình

`thap-rua-heritage.glb` và `den-ngoc-son-heritage.glb` là các asset được tách từ file Blender do chủ dự án cung cấp và đã duyệt ở Vercel Preview. `thap-rua.glb` là bản GLB cũ, được giữ để so sánh. Mô hình procedural vẫn được dùng nếu GLB không tải được. Cầu Thê Húc tiếp tục dùng mô hình procedural vì cầu trong file Blender không khớp hướng và nhịp cầu trên bản đồ OSM.

Đặt file GLB đã tối ưu trong `public/models/`, rồi cập nhật từng URL trong `src/world/landmarkAssets.ts`. Mỗi mô hình dùng **1 đơn vị = 1 mét**, Y hướng lên, +X hướng đông, -Z hướng bắc, vật liệu PBR, không chứa đèn hay camera.

| Asset | Gốc mô hình | Hướng |
| --- | --- | --- |
| `thap-rua-heritage.glb` | tâm đảo Tháp Rùa, tại mặt đất | giữ hướng trong file Blender do chủ dự án cung cấp; cao 8,8 m sau khi căn tỉ lệ |
| `cau-the-huc.glb` | đầu cầu bờ đông, tại mặt đất | chiều dài dọc theo -X; code xoay theo trục cầu OSM; khoảng 46,3 m |
| `den-ngoc-son-heritage.glb` | gần tâm đảo Ngọc Sơn, tại mặt đất | +X từ chính điện qua cổng; trong game xoay theo đầu cầu trên đảo, dịch +4 m theo X và -12 m theo Z; chỉ chứa kiến trúc đền, không chứa cầu |

Giữ mesh va chạm riêng trong `geo.ts`; GLB chỉ thay phần hiển thị. Bản GLB đền được xuất bằng `scripts/heritage/export-game-temple.py` từ `heritage-work/heritage-optimized-working.blend`; script loại bỏ phần cầu trước khi nén Draco. Đường đi và va chạm của đền vẫn là bản đơn giản theo bản đồ; cần kiểm tra lại trực tiếp trên WebGL ở Low/High 1080p và đo FPS trên máy có GPU. Nếu GLB thiếu chi tiết hoặc không đúng vị trí, dùng fallback procedural và ghi rõ giới hạn.
