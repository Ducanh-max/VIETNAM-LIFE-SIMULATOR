# Hiệu năng WebGL tại đầu Cầu Thê Húc

## Bản cuối đã căn cao độ sân đền — `7bf0d4b`

Đo lại các cấu hình sau khi cập nhật riêng phép biến đổi mặt sân. Cùng máy, trình duyệt, vị trí xuất phát, ánh sáng, DPR 1, viewport và drawing buffer 1258 × 709 như phép đo bản ứng viên bên dưới. Hai số FPS trong mỗi ô là bản gốc `32c3512` và bản cuối `7bf0d4b`; những cột còn lại là số đo của bản cuối.

| Chế độ | FPS trước → sau | CPU submit ms | GPU ms | Draw | Tam giác | Texture | Material | Geometry |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| low | 60,00 → 60,00 | 9,71 | 7,99 | 486 | 727837 | 44 | 2941 | 1093 |
| medium | 59,88 → 60,00 | 11,15 | 6,49 | 491 | 770708 | 45 | 2941 | 1283 |
| high | 59,20 → 60,00 | 10,64 | 7,59 | 491 | 770708 | 45 | 2941 | 1283 |
| high/motion | 58,70 → 59,41 | 13,48 | 10,16 | 791 | 3301116 | 45 | 2941 | 1294 |

Trên bản cuối ở **1920 × 1080** native High, đứng yên từ bờ hồ, ghi 1801 khung hình trong 30,02 giây, **60,00 FPS**, CPU submit 11,10 ms, GPU 9,57 ms (113 mẫu). Đây là một lượt trên cùng GPU Intel UHD Graphics và camera nói trên.

[Dữ liệu 5 lượt trên bản cuối](performance/bridge-7bf0d4b.json)

## Phân tích trước khi chỉnh cao độ sân — `32c3512` và `dea8192`

Hai bản build local tại commit `32c3512` và `dea8192` trên Windows, Chrome Headless 157, ANGLE D3D11, Intel UHD Graphics 0xA7A8. Kết quả chỉ áp dụng cho máy và viewport này. Số FPS 21–29 từng thấy trên HUD Vercel là quan sát ngắn trong trình duyệt khác.

Mỗi dòng là một lần đo ít nhất 30 giây/commit sau khi cả ba GLB mount và ổn định thêm 5,5 giây. Tab foreground, ban ngày, DPR thiết bị và renderer đều bằng 1, viewport và drawing buffer thực đều 1258 × 709 px. Low tắt antialias và shadow. Medium/High bật antialias, shadow map tương ứng 1024²/2048². Chất lượng được chọn khi khởi tạo Canvas mới cho từng lượt. Camera tĩnh nhìn từ điểm bắt đầu về cổng đền, cùng hướng và FOV. Điểm bắt đầu bản sau dịch ngang 0,54 m để căn giữa đường đi. Lượt high/motion dùng chính xác cùng quỹ đạo camera dao động dài 30 giây gần đầu cầu.

Số đầu mỗi ô là bản trước, số sau là bản sửa. Draw và triangle là trung bình mỗi frame, gồm cả pass bóng, làm tròn. Texture/geometry lấy từ WebGLRenderer.info.memory ở cuối lượt. Material là số instance vật liệu khác nhau gắn trong scene, kể cả mesh ẩn. CPU là thời gian trình duyệt gọi gl.render trả về (có thể gồm chờ driver), không bao quát toàn bộ JavaScript/game. GPU đo bằng EXT_disjoint_timer_query_webgl2 mỗi 16 frame và bỏ kết quả disjoint.

| Chế độ | FPS | CPU submit ms | GPU ms | Draw | Tam giác | Texture | Material | Geometry |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| low | 60.00 → 60.00 | 9.44 → 9.12 | 6.12 → 6.45 | 541 → 486 | 729817 → 727837 | 42 → 44 | 3215 → 2941 | 1194 → 1093 |
| medium | 59.88 → 60.00 | 12.85 → 10.84 | 9.92 → 7.55 | 856 → 491 | 3306294 → 770708 | 43 → 45 | 3215 → 2941 | 1389 → 1283 |
| high | 59.20 → 60.00 | 12.55 → 11.25 | 10.67 → 7.54 | 856 → 491 | 3306294 → 770708 | 43 → 45 | 3215 → 2941 | 1387 → 1283 |
| high/motion | 58.70 → 59.34 | 14.16 → 13.12 | 10.12 → 10.67 | 844 → 791 | 3305840 → 3301113 | 43 → 45 | 3215 → 2941 | 1403 → 1294 |

Lượt bổ sung trên `dea8192`, High ban ngày đứng yên ở đầu cầu, cả viewport và drawing buffer **1920 × 1080**, DPR 1. Ghi 1.801 khung hình trong 30,015 giây, tương ứng **60,00 FPS**. Thời gian submit trung bình 10,25 ms và GPU 9,21 ms (113 mẫu). Trung bình 492 draw calls và 770.720 tam giác mỗi frame. Ở cuối lượt renderer ghi nhận 45 texture, 1.284 geometry, toàn scene có 2.941 material. Đây là một góc tĩnh trên GPU nêu trên; chưa đo 1080p khi chạy qua cổng hoặc khi drone bay qua cả hồ.

### Tách chi phí trên bản gốc ở High

Mỗi lượt 30 giây giữ các điều kiện khác. shadows tắt riêng shadow pass. water thay riêng shader nước bằng màu phẳng. direct ẩn directional light, nên mất cả shadow phụ thuộc đèn đó. bridge ẩn đúng group GLB cầu trong cả pass chính và pass bóng. Dữ liệu không cho thấy shader nước là nút thắt tại góc quan sát này.

| Thử nghiệm | FPS | CPU submit ms | GPU ms | Draw | Tam giác |
|---|---:|---:|---:|---:|---:|
| high | 59.20 | 12.55 | 10.67 | 856 | 3306294 |
| high/shadows | 59.97 | 11.12 | 6.99 | 541 | 729817 |
| high/water | 58.54 | 13.62 | 10.91 | 856 | 3306294 |
| high/direct | 59.89 | 9.66 | 7.73 | 541 | 729817 |
| high/bridge | 59.04 | 13.13 | 9.64 | 850 | 3090832 |

### Tải tài nguyên và giới hạn phép đo

GLB tải một lần theo URL trong cache useGLTF, Draco giải nén vertex và index trước khi upload lên GPU. Đổi cấu hình đồ họa tạo WebGL context mới. Tài nguyên render cũ được giải phóng khi context bị dispose. Bản sửa giải phóng rõ texture nền, geometry địa hình và shader nước do Landscape tạo. Bộ nhớ CPU từ cache GLB có thể tiếp tục tồn tại khi về trang chủ vì game vẫn giữ cảnh 3D.

WebGL không cung cấp số byte VRAM thật. Từ accessor trong GLB, tổng dung lượng thuộc tính và chỉ số hình học giải mã của tháp/đền/cầu lần lượt khoảng 54,43/49,02/10,66 MiB (cầu cũ 11,04). Nếu mỗi ảnh nhúng trở thành một texture RGBA8 với đủ mip, ước tính texture của ba GLB lần lượt 64/96/33,33 MiB (cầu cũ 32). Đây là ước tính theo tệp, chưa tính shadow target, framebuffer MSAA, tài nguyên thành phố hay cách driver quản lý bộ nhớ. Không đo được VRAM toàn tiến trình hoặc mức bộ nhớ sau khi đóng tab.

Bản sửa gom kính và khung cửa theo cụm nhà, giữ vật liệu và cách cull từng đoạn phố. Shadow map giữ nguyên độ phân giải, cập nhật mỗi frame khi camera chuyển động và khoảng mỗi giây khi đứng yên; asset xuất hiện muộn trong cảnh tĩnh có thể mất đến một giây mới có bóng mới. Kết quả fixed-orbit cho thấy chi phí khi camera chuyển động. Vsync khoảng 60 Hz giới hạn FPS tĩnh, nên đọc cả GPU ms và số tam giác đã submit.

[Dữ liệu từng lượt đo, camera, frame count và user agent](performance/bridge-32c3512-dea8192.json)

### Đo lại

Từ checkout đã cài dependency với pnpm, chạy `node scripts/performance/run.mjs`. Server sẽ in địa chỉ loopback và tên file JSONL. Mở `http://127.0.0.1:4185/?run=before#play` trong một tab foreground và giữ nguyên cửa sổ trong suốt 8 lượt. Dùng `?run=after#play` để chỉ chạy Low, Medium, High và High chuyển động. Script nhận thêm đối số đường dẫn tới checkout cần đo nếu so sánh hai commit đã cài dependency. Bản build có bộ đo nằm riêng trong `heritage-work/`. Dừng server bằng Ctrl+C. Kích thước viewport và DPR trong JSONL là kích thước trình duyệt thực tại thời điểm đo.

