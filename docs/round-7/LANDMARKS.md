# Vòng 7 – Địa danh mới: Ba Đình, Văn Miếu, Công viên Thủ Lệ

Vị trí và hướng của mọi công trình lấy từ OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0), tải bằng
`scripts/geo/fetch-osm-hoan-kiem.mjs` (thêm vùng Ba Đình `21.0300,105.8300,21.0405,105.8405` và Thủ Lệ
`21.0270,105.8015,21.0350,105.8090`, cùng hồ nước có đảo và bãi cỏ). Khoảng cách trong game là mét thật theo
toạ độ OSM, nên đi từ Hồ Gươm tới Lăng Bác hay Thủ Lệ dài đúng như ngoài đời. Không dùng dữ liệu Google Maps.

Số đo lấy từ Wikipedia (đọc ngày 25/11/2026). Những gì Wikipedia không ghi là **ước lượng của mình**, ghi rõ bên dưới.
Đây là mô hình dựng bằng khối đơn giản, chưa qua bước duyệt ảnh đối chiếu của `docs/LANDMARK_VISUAL_QA.md`:
nhận ra được, tỉ lệ chính đúng số liệu, nhưng chi tiết trang trí đã giản lược.

| Công trình | Số liệu theo nguồn | Ước lượng của mình | Nguồn |
|---|---|---|---|
| Lăng Chủ tịch Hồ Chí Minh | cao 21,6 m, rộng 41,2 m; 3 lớp (bậc thềm tam cấp, thân có hàng cột vuông đá hoa cương, mái tam cấp); dòng chữ "CHỦ TỊCH HỒ-CHÍ-MINH" đá đỏ mặt chính; cửa hướng Đông; 2 lễ đài dài 65 m hai bên, 7 bậc | số cột (10 mỗi mặt), chiều cao từng lớp, độ sâu 36 m (khớp footprint OSM); vị trí lễ đài theo khối OSM | [vi.wikipedia Lăng Chủ tịch Hồ Chí Minh](https://vi.wikipedia.org/wiki/L%C4%83ng_Ch%E1%BB%A7_t%E1%BB%8Bch_H%E1%BB%93_Ch%C3%AD_Minh), [en.wikipedia Ho Chi Minh Mausoleum](https://en.wikipedia.org/wiki/Ho_Chi_Minh_Mausoleum) |
| Quảng trường Ba Đình | 210 ô cỏ (7 × 30), lối đi 1,4 m; cột cờ cao 30 m | bãi cỏ theo polygon OSM (≈ 85 × 365 m, Wikipedia ghi 100 × 320 m); cột cờ đặt trên khối đế OSM trên trục Lăng | [vi.wikipedia Quảng trường Ba Đình](https://vi.wikipedia.org/wiki/Qu%E1%BA%A3ng_tr%C6%B0%E1%BB%9Dng_Ba_%C4%90%C3%ACnh) |
| Cột cờ Hà Nội | 3 tầng đế vuông 42,5 m × 3,1 m, 27 m × 3,7 m, 12,8 m × 5,1 m; cửa Đông, Nam, Tây ở tầng 3; thân bát giác cạnh 2,13 m cao 18,2 m; vọng lâu 3,3 m 8 cửa sổ; cột treo cờ 8 m | lỗ cửa sổ thân tháp, lan can răng cưa, bậc lên phía Nam | [vi.wikipedia Cột cờ Hà Nội](https://vi.wikipedia.org/wiki/C%E1%BB%99t_c%E1%BB%9D_H%C3%A0_N%E1%BB%99i) |
| Chùa Một Cột | cột đá đường kính 1,2 m cao 4 m; điện vuông 3 m mỗi cạnh, mái ngói 4 góc cong; hồ Linh Chiểu, lan can gạch men xanh | cầu thang đi theo dải đất OSM cắt vào hồ; kích thước mái | [vi.wikipedia Chùa Một Cột](https://vi.wikipedia.org/wiki/Ch%C3%B9a_M%E1%BB%99t_C%E1%BB%99t) |
| Văn Miếu – Khuê Văn Các, Văn Miếu Môn | Khuê Văn Các đế vuông 6,8 m, 4 trụ gạch 1 m, gác vuông, 8 mái; Văn Miếu Môn tam quan, gian giữa 2 tầng | chiều cao từng tầng, kích thước cổng | [vi.wikipedia Văn Miếu – Quốc Tử Giám](https://vi.wikipedia.org/wiki/V%C4%83n_Mi%E1%BA%BFu_%E2%80%93_Qu%E1%BB%91c_T%E1%BB%AD_Gi%C3%A1m) |
| Công viên Thủ Lệ | 29 ha, 6 ha mặt hồ, dải đất hình giọt lệ giữa hồ | — (hồ, đảo, bãi cỏ, cây là dữ liệu OSM; chưa dựng cổng vì không có tư liệu) | [vi.wikipedia Công viên Thủ Lệ](https://vi.wikipedia.org/wiki/V%C6%B0%E1%BB%9Dn_th%C3%BA_H%C3%A0_N%E1%BB%99i) |

Ảnh đối chiếu nên xem (chỉ để so sánh, không đưa vào game): Wikimedia Commons
[Ho Chi Minh Mausoleum](https://commons.wikimedia.org/wiki/Category:Ho_Chi_Minh_Mausoleum),
[Ba Đình Square](https://commons.wikimedia.org/wiki/Category:Ba_%C4%90%C3%ACnh_Square),
[Flag Tower of Hanoi](https://commons.wikimedia.org/wiki/Category:Flag_Tower_of_Hanoi),
[One Pillar Pagoda](https://commons.wikimedia.org/wiki/Category:One_Pillar_Pagoda),
[Temple of Literature, Hanoi](https://commons.wikimedia.org/wiki/Category:Temple_of_Literature,_Hanoi),
[Thủ Lệ Park](https://commons.wikimedia.org/wiki/Category:Th%E1%BB%A7_L%E1%BB%87_Park).

Ảnh trong game: `3-lang-front.png`, `3-lang-34.png`, `3-ba-dinh-tren-cao.png`, `3-cot-co.png`, `3-chua-mot-cot.png`,
`3-khue-van-cac.png`, `3-cong-vien-thu-le.png`.

Chưa làm / hạn chế đã biết: Đoan Môn và Hoàng thành vẫn là khối OSM thường; Bảo tàng Hồ Chí Minh, Phủ Chủ tịch,
Nhà Quốc hội là nhà OSM chung; nhiều khu dân cư quanh Thủ Lệ trên OSM chưa có đường viền nhà nên trông trống.
