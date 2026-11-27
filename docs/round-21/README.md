# Vòng 21: bản thử nghiệm riêng (chỉ người được mời)

Chủ dự án muốn xem thử một mẫu xe đầy đủ (ngoại thất và nội thất) trên web, ở một đường dẫn riêng mà chỉ người được cấp quyền mới vào được. Bản game công khai không đổi.

## Cách hoạt động

- **Cờ build:** `VITE_PRIVATE_BUILD=true` bật cổng đăng nhập cho cả app (`src/ui/PrivateGate.tsx`).
  - Người vào được: admin (`vlife_admins`) và người được mời (`vlife_testers/{email viết thường}`).
  - Người khác thấy màn "Bạn chưa được cấp quyền".
- **Bảng admin:** admin có nút "👥 Người được xem bản thử" để thêm hoặc thu quyền theo email, ngay trong game.
- **Luật Firestore:**
  - mỗi người chỉ đọc được tài liệu `vlife_testers` của chính email mình;
  - chỉ admin được xem danh sách, thêm, xoá.
  - Luật đã đăng trên Firebase ngày 27/11/2026.
- **Mô hình thử:**
  - không nằm trong repo (`public/private-assets/` đã cho vào `.gitignore`), tên file ngẫu nhiên;
  - đường dẫn file chỉ có trong biến môi trường lúc build (`VITE_PRIVATE_CAR_URL`), không có trong code.
- **Triển khai:** bản build riêng được tải thẳng từ máy lên một dự án Vercel tách biệt, không nối với GitHub. Trang có `noindex` (thẻ meta, header `X-Robots-Tag`, `robots.txt`).

## Giới hạn, nói thẳng

- Cổng đăng nhập che giao diện app và đường dẫn, nhưng chính file mô hình vẫn tải được bởi ai biết đúng đường dẫn ngẫu nhiên của nó.
- Muốn khoá cả file phải để file trong Firebase Storage có luật kiểm tra danh sách; việc này có thể cần nâng gói Firebase trả phí.
- Mẫu thử hiện tại là bản sao một xe thật, nên chỉ dùng xem nội bộ, không đưa vào bản phát hành.

Ảnh: [màn đăng nhập của bản riêng](private-gate.png). Ảnh có mô hình thử không đưa vào repo vì mô hình không thuộc quyền của dự án.
