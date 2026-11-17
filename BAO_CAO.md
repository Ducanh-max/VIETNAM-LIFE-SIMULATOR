# Báo cáo nâng cấp Hồ Hoàn Kiếm — ĐỜI VIỆT

## File đã sửa

- `src/world/Historic.tsx`: dựng lại hình khối Tháp Rùa, mái/hiên khu đền và Cầu Thê Húc.
- `src/world/Landscape.tsx`: mặt nước, mép kè, bờ đảo, dải cây và tán cây nhiều biến thể.
- `src/world/Urban.tsx`: bảy biến thể nhà phố, chi tiết cửa hàng và mức chi tiết theo khoảng cách.
- `src/world/geo.ts`: làm mềm đường bờ từ dữ liệu OSM và khớp độ cao đi bộ trên cầu.
- `src/App.tsx`: cân lại ánh sáng, bóng và tone mapping.
- `README.md`, `BAO_CAO.md`: cập nhật trạng thái và giới hạn.

## Cải thiện hình ảnh

Hồ vẫn theo dữ liệu OpenStreetMap, khoảng 634 × 249 m; tuyến cầu dài khoảng 46,3 m. Đường bờ được làm mềm nhẹ. Kè có thành và viền đá, đảo có thân nổi thay vì một mặt phẳng. Vỉa hè có dải trồng cây. Tán cây gồm ba khối tròn biến thiên kích thước, vị trí và màu bằng instancing.

Tháp Rùa có ba tầng thu nhỏ dần, cửa vòm xuyên tường, gờ tầng, trụ góc và chân đế. Đền có hai điện mái ngói cong, hiên cột đỏ, sân, cổng hai tầng, đình nhỏ và bút tháp cách điệu. Cầu Thê Húc có mặt cầu cong liền mạch, 15 nhịp, trụ, tay vịn và cột lan can. Bảy biến thể nhà phố thay đổi chiều cao, mặt tiền, mái, cửa hàng, ban công và ô cửa. Shader nước kết hợp nhiễu nhiều tỷ lệ, gợn nhẹ và phản xạ Fresnel giả lập.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript `tsc -b` | Đạt, không có lỗi kiểu |
| `scripts/check-map.mjs` | Đạt: hồ 634 × 249 m, cầu 46,3 m |
| Vite production build | Đạt; 596 module; JS khoảng 1,19 MB (336 kB gzip), CSS khoảng 16,3 kB (4,6 kB gzip) |
| Trình duyệt/WebGL runtime | Chưa kiểm tra được: quyền truy cập trình duyệt của tác nhân vẫn chặn `http://127.0.0.1:5173/` |
| FPS ở 1080p | Chưa đo được; HUD sẽ hiển thị FPS khi chạy trên trình duyệt |
| Ảnh gameplay | Chưa có ảnh chụp runtime đã xác thực |

Vite cảnh báo JS chunk lớn hơn 500 kB. Build vẫn thành công. Chưa thể xác nhận không có lỗi WebGL/console cho đến khi xem trong trình duyệt. Không tuyên bố đạt 50–60 FPS khi chưa đo.

## Còn đơn giản

Các công trình vẫn là mô hình procedural stylized, chưa phải GLB/GLTF khảo cứu chính xác. Mái, hoa văn, mặt đứng Đắc Nguyệt Lầu, Trấn Ba Đình và bút tháp còn cách điệu. Nước chưa phản chiếu cây và công trình thật. Nhà phố không theo đúng từng thửa quanh hồ; nhân vật, xe và người đi bộ còn đơn giản. Chưa có texture ảnh thực, LOD đầy đủ hoặc tải asset theo khu vực.

## Bước tiếp theo

1. Chạy trên Chrome/Edge ở 1920×1080; xem trực tiếp các góc bờ đông, cầu, đảo và Tháp Rùa; kiểm tra console và đo FPS cho từng preset.
2. Điều chỉnh bố cục và vật liệu theo ảnh gameplay thực tế, đặc biệt cổng đền, mái ngói và mặt tiền nhà phố.
3. Tạo GLB khảo cứu cho ba công trình chính từ ảnh thực có quyền dùng; thêm vật liệu PBR và LOD theo khoảng cách.

Hướng dẫn chạy local và triển khai Vercel ở `README.md`.
