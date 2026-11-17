# Báo cáo bản đầu tiên — ĐỜI VIỆT

## Kết quả thực hiện

- Tạo dự án mới `doi-viet-3d` bằng React + Vite + TypeScript, Three.js, React Three Fiber, Drei và Tailwind CSS.
- Dựng cảnh Hồ Hoàn Kiếm bằng đường bờ thực từ OpenStreetMap: trục bắc–nam khoảng **634 m**, trục đông–tây khoảng **249 m**. Hai đảo được giữ đúng tương quan; tuyến Cầu Thê Húc theo dữ liệu bản đồ dài khoảng **46,3 m**.
- Dựng mô hình 3D tự tạo cho Tháp Rùa, Cầu Thê Húc và khu Đền Ngọc Sơn; thêm đường nhựa, vỉa hè, cây, đèn, ghế, nhà phố, biển hiệu tiếng Việt, xe và người làm cảnh.
- Thêm trang chủ, trang game, HUD, cài đặt, tạm dừng, hướng dẫn, nhân vật đi/chạy, camera góc nhìn thứ ba và drone bật/tắt bằng phím V.
- Shader mặt nước gợn nhẹ; vật liệu đường/vỉa hè/cỏ có color, roughness và normal map tạo từ mã.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript `tsc -b` | Đạt, không có lỗi kiểu |
| `scripts/check-map.mjs` | Đạt: hồ 634 × 249 m, cầu 46,3 m |
| Vite production build | Đạt, 596 modules; JS 1.180 kB (333 kB gzip), CSS 15,86 kB (4,49 kB gzip) |
| Trình duyệt/WebGL runtime | Chưa kiểm tra được: cổng quyền truy cập trình duyệt từ chối mở `http://127.0.0.1:5173/` |
| FPS ở 1080p | Chưa đo được; HUD sẽ hiển thị FPS khi chạy trên trình duyệt |
| Ảnh gameplay thực tế | Chưa có vì không thể mở bản xem trước trong môi trường này |

Vite có cảnh báo chunk JS trên 500 kB. Cần kiểm tra thời gian tải và tách chunk khi có thêm asset; cảnh báo này không làm build thất bại. Không thể xác nhận “không có lỗi console nghiêm trọng” cho tới khi chạy kiểm thử WebGL trên trình duyệt.

## Mô hình đã có và còn thiếu

Các mô hình **đã có** là hình học tự dựng trong mã: Tháp Rùa ba tầng/cửa vòm; Cầu Thê Húc đỏ 15 nhịp; hai điện đền, cổng và sân; nhà phố, cây, đèn, ghế, xe và người đơn giản. Không có GLB/GLTF bên ngoài.

Các asset **còn thiếu** để đạt mục tiêu đồ họa cuối: mô hình khảo cứu chính xác cho Tháp Rùa/Đền Ngọc Sơn/Cầu Thê Húc, chi tiết bề mặt và hoa văn, nhân vật rigged có animation, texture và xe chất lượng cao. Mặt nước chưa có phản chiếu hình học của công trình/cây. Xem bảng tích hợp trong `README.md`.

## Các bước kiểm tra tiếp theo

1. Mở game trên Chrome/Edge desktop có WebGL 2 và đi từ bờ đông bắc qua cầu đến đảo.
2. Xem console, kiểm tra mặt nước/đảo/nhà phố không có lỗi shader hoặc mesh.
3. Đo FPS ở 1920×1080 trên PC tầm trung cho từng preset; điều chỉnh bóng, số nhà và tán cây theo số đo.
4. Thay dần mô hình tự dựng bằng GLB khảo cứu đúng kiến trúc và có quyền sử dụng; thêm LOD, nén texture, tải theo khu vực.

Hướng dẫn chạy và triển khai Vercel ở `README.md`.
