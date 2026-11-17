# ĐỜI VIỆT — Hà Nội 3D

Bản thử nghiệm game web 3D tại khu Hồ Hoàn Kiếm. Dự án dùng React, Vite, TypeScript, Three.js, React Three Fiber, Drei và Tailwind CSS. Cảnh hiển thị bằng hình học WebGL thực, không dùng ảnh tĩnh làm gameplay.

## Trạng thái hiện tại

- Có trang chủ và trang game toàn màn hình.
- Có thể đi bằng WASD, chạy bằng Shift, xoay camera bằng chuột và qua Cầu Thê Húc đến đảo Ngọc Sơn. Nhấp vào cảnh để khóa con trỏ; nhấn Esc để thả con trỏ. Nhấn **V** để bật/tắt drone; drone bay bằng WASD, lên/xuống bằng Space/Ctrl và tăng tốc bằng Shift.
- Có va chạm đơn giản với mép hồ, nhà phố và hai tòa đền chính. Drone có thể bay qua các công trình và mặt hồ.
- Có ánh sáng ban ngày, hoàng hôn và ban đêm; bốn cấu hình Low / Medium / High / Ultra; HUD FPS đọc từ vòng lặp render thực tế.
- Bờ hồ, hai đảo và trục cầu lấy theo tọa độ OpenStreetMap. Diện tích xung quanh là một lát cắt cách điệu, chưa phải bản sao đô thị chính xác từng thửa đất.

**Mức độ mô hình:** Tháp Rùa, Cầu Thê Húc và khu Đền Ngọc Sơn hiện là mô hình hình học tự dựng để kiểm thử bố cục và gameplay. Chúng thể hiện các đặc điểm nhận diện chính như nhiều tầng/cửa vòm, cầu đỏ cong 15 nhịp và mái ngói/cổng đền. Chúng **chưa phải** mô hình khảo cứu kiến trúc chính xác hoặc asset hoàn thiện để nghiệm thu đồ họa cuối cùng. Chưa tích hợp GLB/GLTF bên ngoài.

## Chạy local

Yêu cầu Node.js 22+ và pnpm 11+.

```bash
pnpm install
pnpm dev
```

Mở địa chỉ Vite hiển thị trong terminal. Để kiểm tra bản production:

```bash
pnpm check:map
pnpm build
pnpm preview
```

Máy cần trình duyệt hỗ trợ WebGL 2. Game hiện ưu tiên desktop và bàn phím/chuột; chưa có điều khiển cảm ứng.

## Cấu trúc

```text
VIETNAM-LIFE-SIMULATOR/
├─ index.html                  Trang HTML gốc
├─ src/
│  ├─ App.tsx                  Trang chủ, HUD, cài đặt và renderer
│  ├─ main.tsx                 Điểm vào React
│  ├─ styles.css               Tailwind và giao diện
│  ├─ data/hoanKiem.json       Đường bờ, đảo, vị trí cầu từ OSM
│  └─ world/
│     ├─ geo.ts                Phép chiếu tọa độ, vùng đi lại
│     ├─ Landscape.tsx         Hồ, nước động, vỉa hè, đường, cây và đèn
│     ├─ Historic.tsx          Tháp Rùa, cầu và đền dạng hình học 3D
│     ├─ Urban.tsx             Nhà phố, biển hiệu, xe và người đi bộ
│     └─ Explorer.tsx          Nhân vật, điều khiển và camera
├─ scripts/check-map.mjs      Kiểm tra tỷ lệ và vị trí bản đồ
├─ vite.config.ts
├─ tsconfig.json
└─ vercel.json
```

## Dữ liệu và tài liệu tham khảo

- Dữ liệu đường bờ Hồ Hoàn Kiếm, hai đảo và tuyến Cầu Thê Húc: [OpenStreetMap contributors](https://www.openstreetmap.org/relation/198437), giấy phép [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Dữ liệu lưu trong `src/data/hoanKiem.json`; cần giữ ghi công khi phân phối.
- [Cục Di sản văn hóa](https://dsvh.gov.vn/di-tich-lich-su-va-danh-lam-thang-canh-ho-hoan-kiem-va-den-ngoc-son-2978): Cầu Thê Húc dài khoảng 45 m, rộng 2,6 m, 15 nhịp.
- [Cổng thông tin Thăng Long - Hà Nội](https://thanglong.chinhphu.vn/english/ngoc-son-temple-and-hoan-kiem-lake-110195.htm): các hạng mục khu đền, cầu và cổng.
- Website Du lịch Đà Nẵng Online chỉ là tham khảo phong cách do người dùng cung cấp. Không sao chép hình ảnh, mô hình hay mã nguồn từ trang đó.

## Tài sản còn thiếu và quy tắc tích hợp

| Hạng mục | Hiện trạng | Cần bổ sung |
| --- | --- | --- |
| Tháp Rùa | Mô hình hình học nhiều tầng, cửa vòm | GLB có tỷ lệ/hoa văn/mặt đứng đối chiếu ảnh và đo đạc thực tế; texture tường cũ, mái, chi tiết chữ |
| Đền Ngọc Sơn | Mô hình tổng thể sân, hai điện, cổng, tường | Các hạng mục Đắc Nguyệt Lầu, Trấn Ba Đình, bút tháp, nghiên mực; mái và trang trí chuẩn xác |
| Cầu Thê Húc | Hình học đỏ cong, 15 nhịp, lan can và cột | Chi tiết kết cấu, vật liệu sơn/gỗ, hoa văn và số đo khảo cứu |
| Nhà phố | Mặt tiền được tạo bằng mã, biển hiệu tiếng Việt | Asset nhà phố, cửa hàng và texture ảnh thực tế có quyền sử dụng |
| Nhân vật/NPC/xe | Hình học đơn giản, hoạt cảnh chân tay cơ bản | GLB rigged và animation đứng/đi/chạy; xe máy, ô tô, NPC chất lượng cao |
| Mặt nước | Shader gợn sóng và màu trời | Phản chiếu cảnh thật theo mức đồ họa; hiện chỉ mô phỏng màu/ánh sáng |

Quy ước asset mới: **1 đơn vị = 1 mét**, Y hướng lên, phía bắc là **-Z**, gốc tọa độ tại `21.0288313°N, 105.8525357°E`. Đặt GLB tối ưu trong `public/models/`; chuẩn hóa origin ở chân công trình, scale theo mét, UV không chồng lấn với light/ao map, texture KTX2 hoặc WebP khi phù hợp. Thay từng component trong `Historic.tsx` bằng `useGLTF` sau khi có asset đúng quyền sử dụng. Giữ collision riêng để có thể cập nhật theo mesh mới. Nếu mô hình chưa đạt, gắn nhãn prototype trong UI/tài liệu.

## Hiệu năng và giới hạn

Cây và cột đèn dùng `InstancedMesh`, cảnh dùng frustum culling mặc định của Three.js, bóng đổ có khoảng cách giới hạn, và chất lượng được chọn theo DPR/độ phân giải bóng. Chưa có LOD động, texture compression, tải tài nguyên theo khu vực hay streaming thực sự. Nên bổ sung các kỹ thuật đó khi chuyển sang GLB có texture lớn. Chỉ số FPS cần đo trên máy và trình duyệt đích ở 1080p; không có cam kết 60 FPS.

## Triển khai Vercel

Import repository `Ducanh-max/VIETNAM-LIFE-SIMULATOR` trong Vercel. Framework là **Vite**; lệnh build `pnpm build`; thư mục output `dist`. File `vercel.json` đã khai báo các giá trị này. Vì ứng dụng hiện là SPA tĩnh dùng hash `#play`, không cần backend hoặc biến môi trường. Tên package nội bộ vẫn là `doi-viet-3d`.
