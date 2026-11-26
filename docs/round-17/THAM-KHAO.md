# Vòng 17 – Đường phố theo video tham khảo

Video chủ dự án gửi (chỉ để tham khảo, không đưa hình từ video vào repo):
- "Toàn cảnh Hà Nội // Hanoi from above // Flycam 4K Hà Nội" – Hachi8Media: https://www.youtube.com/watch?v=MT8vPndyDa8
- "THINGS TO KNOW BEFORE YOU GO TO HANOI" – Creative Travel Guide: https://www.youtube.com/watch?v=C8J2Kad8NNM

Ghi chú khi xem (tua và chụp mỗi 30–50 giây):
- Phố cổ (video 2, ~2:00, ~4:40): mái hiên vải/bạt nhiều màu (xanh lá, đỏ, xanh dương) chìa ra trên vỉa hè;
  biển hiệu dọc hẹp chìa vuông góc với mặt nhà; cờ đỏ sao vàng và đèn lồng; dây điện chằng chịt trên cột bê tông;
  vỉa hè lát gạch, xe máy dựng sát nhau, ghế nhựa thấp đỏ/xanh, hàng rong.
- Phố rộng (video 2, ~0:25, ~2:50): cây xanh tán rộng hai bên, gốc cây quét vôi trắng; vạch kẻ trắng giữa đường; xe máy đông.
- Trên cao (video 1, ~0:20, ~2:20): mái nhà phố cổ nhiều màu, nhiều cây xanh quanh hồ; Hồ Gươm giữa khu phố đông đúc;
  cầu Long Biên (dầm thép) và cầu Nhật Tân bắc qua sông Hồng (ngoài phạm vi bản đồ hiện tại).

Đã làm trong game:
- Mái hiên, biển dọc (chữ chung: PHỞ, CƠM, CAFÉ, MAY ĐO, SỬA XE…, không thương hiệu), cờ đỏ sao vàng, cột điện + bó
  dây điện võng giữa các cột, ghế nhựa trên vỉa hè – đặt dọc mặt nhà thật theo OSM (world/StreetDressing.tsx).
- Cây theo loài: sấu, bàng (tán tầng), xà cừ, phượng (hoa đỏ), lộc vừng ven hồ (chùm hoa đỏ rủ), liễu; gốc quét vôi.
- Đường sắt theo OSM (scripts/geo/fetch-railways.mjs, world/Railways.tsx): ba-lát, tà vẹt bê tông, ray khổ 1 m màu gỉ,
  cỏ mọc giữa tà vẹt; tuyến Hà Nội – Đồng Đăng chạy trên cầu cạn gạch (trụ gạch, lan can) dọc Phùng Hưng; rào chắn
  sọc đỏ trắng (đang nâng, chưa có tàu) và biển "CHÚ Ý TÀU HOẢ" ở 35 điểm giao cắt OSM; nhà lấp chỗ trống chừa đường ray.
- Vạch kẻ đường theo QCVN 41: tim đường vàng (đứt quãng; vạch đôi liền trên đường chính), vạch phân làn trắng đứt,
  vạch biên trắng trên đường lớn, vạch dừng và mũi tên đi thẳng trước đèn giao thông.

Chưa làm: cầu Long Biên chỉ có đoạn đầu trong bản đồ (phần qua sông nằm ngoài phạm vi), mái nhà nhiều màu nhìn từ trên cao.
