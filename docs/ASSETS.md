# Tích hợp mô hình công trình

Hiện chưa có GLB đủ chất lượng và quyền sử dụng để thay ba mô hình dựng bằng mã. Đừng bật URL trong `src/world/landmarkAssets.ts` khi file chưa được kiểm tra trong game.

Đặt file GLB đã tối ưu trong `public/models/`, rồi cập nhật từng URL trong `src/world/landmarkAssets.ts`. Mỗi mô hình dùng **1 đơn vị = 1 mét**, Y hướng lên, +X hướng đông, -Z hướng bắc, vật liệu PBR, không chứa đèn hay camera.

| Asset | Gốc mô hình | Hướng |
| --- | --- | --- |
| `thap-rua.glb` | tâm đảo Tháp Rùa, tại mặt đất | mặt chính hướng +X; cao khoảng 12 m |
| `cau-the-huc.glb` | đầu cầu bờ đông, tại mặt đất | chiều dài dọc theo -X; code xoay theo trục cầu OSM; khoảng 46,3 m |
| `den-ngoc-son.glb` | tâm đảo Ngọc Sơn, tại mặt đất | +X hướng bờ cầu; bao gồm cổng, điện, đình và cảnh quan trong đảo |

Giữ mesh va chạm riêng trong `geo.ts`; GLB chỉ thay phần hiển thị. Trước khi đưa vào production: đối chiếu ảnh thực, kiểm tra giấy phép, giảm polygon, nén texture khi cần, thử Low/High ở 1080p và đo FPS. Nếu GLB thiếu chi tiết hoặc không đúng vị trí, giữ mô hình procedural hiện tại và ghi rõ giới hạn.
