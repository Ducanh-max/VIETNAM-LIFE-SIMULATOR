# Báo cáo nâng cấp Hồ Hoàn Kiếm — ĐỜI VIỆT

## Kiểm tra production ngày 18/11/2026

- GitHub `main` trước lần sửa này ở commit `1fb6a117633ce3b72ab8a954328392bb5d0a7d3b`; GitHub báo trạng thái Vercel thành công cho project `vietnam-life-simulator` ở commit đó.
- URL production phục vụ `index-DRDs_Mrv.js`. SHA-256 của file JavaScript tải từ production **trùng hoàn toàn** SHA-256 của bản build local từ mã commit trên (`7AE73F09…C7EB71F55C`). Điều này xác nhận mã mới đã đến website ở mức file phục vụ, dù không xác nhận được cấu hình nhánh production từ Vercel dashboard.
- HTML trả `Cache-Control: public, max-age=0, must-revalidate`; mã nguồn không có service worker. Không tìm thấy bằng chứng cache đang giữ JavaScript cũ.
- Kiểm tra WebGL trực tiếp cho thấy điểm xuất phát/camera bị tán cây che lớn, cầu và đền nằm lệch khỏi khung hình. Đây là lý do chính cảnh nhìn gần như không đổi mặc dù bundle mới đã chạy. Console không có lỗi hoặc cảnh báo ở lần mở đó; HUD ghi 56–58 FPS trong cửa sổ trình duyệt nhỏ, **không phải** kết quả 1080p.
- Vercel connector đang kết nối không liệt kê hoặc mở được project `vietnam-life-simulator`; vì vậy không thể đọc cấu hình production branch/deployment metadata qua Vercel API. GitHub commit status và nội dung website là hai nguồn xác minh thay thế có giới hạn như nêu trên.

## Sửa lỗi lần này

- Chuyển điểm xuất phát ra khỏi tán cây; camera nhìn dọc cầu và hướng tới đền. Tạo khoảng trống cây trước đầu cầu.
- Bổ sung texture đá cũ và gờ tầng cho Tháp Rùa; mái đền có viền ngói và xà gỗ; thêm biển chữ cho điện chính/cổng; cầu có dầm cong hai bên.
- Nhà phố xa có thêm mái che cửa hàng, khung cửa, bậu và một số ban công; gợn nước phối hợp hai hướng sóng để giảm nhịp lặp.
- Mục Giới thiệu và HUD hiển thị mã commit build. `src/world/landmarkAssets.ts` là điểm tích hợp GLB riêng từng công trình; hiện chưa có GLB phù hợp. Xem `docs/ASSETS.md`.
- Bản triển khai `de3adf2` đã hiện trên production. Cảnh đầu thấy cầu và đền, không còn bị tán cây che; console không có lỗi. FPS trong cửa sổ xem trước: High khoảng 35–42, Medium khoảng 42, Low khoảng 57. Đây chỉ là số tham khảo của máy/trình duyệt này, không phải phép đo 1080p.
- Vòng tối ưu tiếp theo gộp thân và mái 100 nhà phố thành hai `InstancedMesh`, giảm khoảng 200 mesh render; dời nhân vật về giữa đường dạo và làm mã commit dễ đọc hơn. Cần đo lại sau khi vòng này triển khai.
- Bản `8b53ac4` đã lên production; cùng cửa sổ xem trước 615 × 603 px (canvas 923 × 905 ở DPR 1,5) hiển thị khoảng 57–60 FPS ở preset High. Không thể đổi kích thước viewport của trình duyệt kiểm thử lên 1920 × 1080; vì vậy không có số FPS 1080p đáng tin cậy.
- Vòng hoàn thiện tiếp theo lát thêm sân dẫn từ đường dạo vào đầu cầu và làm các góc mái đền cong rõ hơn. Kết quả cần xem lại sau triển khai.
- Bản `c9adae0` đã lên production, HUD hiển thị đúng và console không có lỗi; ảnh WebGL cho thấy UV của sân dẫn bị kéo giãn. Đã sửa UV theo chiều dài/rộng thực của sân để texture đá lặp với tỷ lệ tương tự vỉa hè. Cần kiểm tra lại bản sửa UV sau triển khai.

## File đã sửa

- `src/world/Historic.tsx`: dựng lại hình khối Tháp Rùa, mái/hiên khu đền và Cầu Thê Húc.
- `src/world/Explorer.tsx`: điểm xuất phát và góc nhìn mặc định hướng dọc cầu.
- `src/world/Landscape.tsx`: mặt nước, mép kè, bờ đảo, dải cây và tán cây nhiều biến thể.
- `src/world/Urban.tsx`: bảy biến thể nhà phố, chi tiết cửa hàng và mức chi tiết theo khoảng cách.
- `src/styles.css`: tăng độ rõ mã commit trên HUD.
- `src/world/landmarkAssets.ts`, `src/world/LandmarkModel.tsx`, `docs/ASSETS.md`: cấu hình/loader GLB và quy tắc tích hợp; chưa có GLB để bật.
- `src/App.tsx`: hiển thị mã commit trong HUD và Giới thiệu.
- `README.md`, `BAO_CAO.md`: cập nhật trạng thái và giới hạn.

## Cải thiện hình ảnh

Hồ vẫn theo dữ liệu OpenStreetMap, khoảng 634 × 249 m; tuyến cầu dài khoảng 46,3 m. Đường bờ được làm mềm nhẹ. Kè có thành và viền đá, đảo có thân nổi thay vì một mặt phẳng. Vỉa hè có dải trồng cây. Tán cây gồm ba khối tròn biến thiên kích thước, vị trí và màu bằng instancing.

Tháp Rùa có ba tầng thu nhỏ dần, cửa vòm xuyên tường, gờ tầng, trụ góc và chân đế. Đền có hai điện mái ngói cong, hiên cột đỏ, sân, cổng hai tầng, đình nhỏ và bút tháp cách điệu. Cầu Thê Húc có mặt cầu cong liền mạch, 15 nhịp, trụ, tay vịn và cột lan can. Bảy biến thể nhà phố thay đổi chiều cao, mặt tiền, mái, cửa hàng, ban công và ô cửa. Shader nước kết hợp nhiễu nhiều tỷ lệ, gợn nhẹ và phản xạ Fresnel giả lập.

## Kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| TypeScript `tsc -b` | Đạt, không có lỗi kiểu |
| `scripts/check-map.mjs` | Đạt: hồ 634 × 249 m, cầu 46,3 m |
| Vite production build | Đạt; 598 module; JS chính 1,198 MB (339 kB gzip), loader GLB tách riêng 77 kB (23 kB gzip) |
| Trình duyệt/WebGL runtime | Đã xác minh production trước sửa: render hoạt động, không thấy lỗi console; bản mới cần kiểm tra lại sau khi Vercel triển khai |
| FPS ở 1080p | Chưa đo được; cửa sổ production nhỏ trước sửa ghi 56–58 FPS |
| Ảnh gameplay | Đã chụp cảnh production trước sửa; bản sau cần chụp/đối chiếu khi triển khai |

Vite cảnh báo JS chunk chính lớn hơn 500 kB. Build vẫn thành công. Chưa thể xác nhận bản sau sửa không có lỗi WebGL/console cho đến khi Vercel phục vụ bundle mới. Không tuyên bố đạt 50–60 FPS ở 1080p khi chưa đo.

## Còn đơn giản

Các công trình vẫn là mô hình procedural stylized, chưa phải GLB/GLTF khảo cứu chính xác. Mái, hoa văn, mặt đứng Đắc Nguyệt Lầu, Trấn Ba Đình và bút tháp còn cách điệu. Nước chưa phản chiếu cây và công trình thật. Nhà phố không theo đúng từng thửa quanh hồ; nhân vật, xe và người đi bộ còn đơn giản. Chưa có texture ảnh thực, LOD đầy đủ hoặc tải asset theo khu vực.

## Bước tiếp theo

1. Chạy trên Chrome/Edge ở 1920×1080; xem trực tiếp các góc bờ đông, cầu, đảo và Tháp Rùa; kiểm tra console và đo FPS cho từng preset.
2. Điều chỉnh bố cục và vật liệu theo ảnh gameplay thực tế, đặc biệt cổng đền, mái ngói và mặt tiền nhà phố.
3. Tạo GLB khảo cứu cho ba công trình chính từ ảnh thực có quyền dùng; thêm vật liệu PBR và LOD theo khoảng cách.

Hướng dẫn chạy local và triển khai Vercel ở `README.md`.
