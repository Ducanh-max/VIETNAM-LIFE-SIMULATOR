# Đối chiếu kiến trúc Tháp Rùa

Mô hình `public/models/thap-rua.glb` được dựng lại bằng `scripts/build-thap-rua.py`.
Không có ảnh tham khảo nào được nhúng vào GLB. Bốn ảnh render Blender xuất ở thư
mục `outputs/` cạnh project; mặt nước và đảo trong render chỉ là cảnh kiểm tra.

## Nguồn và kích thước

- [Hoàn Kiếm 360 – Tháp Rùa](https://hoankiem360.tourism.vn/chi_tiet_ho_hoan_kiem/thap-rua.html):
  hai tầng dưới có cửa Gothic; mặt dài ba cửa, mặt ngắn hai cửa; kích thước
  các tầng 6,28 × 4,54 m, 4,80 × 3,64 m, 2,97 × 1,90 m; cửa tròn phía
  đông đường kính 0,68 m; tổng cao 8,8 m; phần mái theo kiến trúc Việt Nam.
- [Ban quản lý di tích danh thắng Hà Nội](https://banqldtdthanoi.vn/di-tich-do-ban-quan-ly-truc-tiep/cum-di-tich-quoc-gia-dac-biet-ho-hoan-kiem-va-den-ngoc-son-di-tich-den-ba-kieu/):
  xác nhận cấu trúc ba tầng nhỏ dần, hai tầng cửa cuốn Gothic và mái cong.
- Ảnh chính diện và mái do người dùng cung cấp trong yêu cầu ngày 18/11/2026.
- Ảnh Wikimedia Commons được dùng để kiểm tra thêm góc nhìn; chỉ liên kết,
  không sao chép vào asset:
  [mặt đông](https://commons.wikimedia.org/wiki/File:TurtleTower_HoanKiemLake_Hanoi.jpg),
  [mặt hai cửa từ xa](https://commons.wikimedia.org/wiki/File:Tortoise_Tower_in_Hoan_Kiem_Lake_(9753113362).jpg),
  [góc chéo](https://commons.wikimedia.org/wiki/File:Thap_Rua_(Tortoise_Tower)_in_Hoan_Kiem_Lake_(9753371474).jpg),
  [cận cảnh mái](https://commons.wikimedia.org/wiki/File:Th%C3%A1p_R%C3%B9a_5.jpg),
  [từ bờ hồ](https://commons.wikimedia.org/wiki/File:Hoan_Kiem_Lake_from_east_(3694364435).jpg).

## Đối chiếu bốn góc

| Render | Ảnh thực tương ứng | Tỷ lệ, cửa và silhouette | Mái, lan can và tầng đỉnh |
| --- | --- | --- | --- |
| `thap-rua-east-long.png` | Ảnh người dùng; ảnh mặt đông Wikimedia | Mặt đông dài 6,28 m với ba cửa vòm xuyên tường mỗi tầng dưới. Tầng giữa dài 4,80 m, tầng trên 2,97 m. Cửa tròn đường kính 0,68 m ở mặt đông. | Mái là mặt cong dốc thật, không còn ống trắng. Lan can tầng một thành tường chắn thấp; tầng hai là con tiện đá mảnh. |
| `thap-rua-north-short.png` | Ảnh mặt hai cửa từ xa; ảnh góc chéo | Mặt ngắn có hai cửa vòm mỗi tầng dưới; chiều sâu các tầng 4,54 m, 3,64 m và 1,90 m. | Thấy rõ hai tầng thu vào, lan can thấp và góc mái vút nhẹ. |
| `thap-rua-oblique.png` | Ảnh góc chéo; ảnh mái cận cảnh | Cùng lúc thấy mặt dài ba cửa và mặt ngắn hai cửa, vòm có chiều sâu và khoảng lùi tầng. | Mái tối màu, bốn góc nhô nhẹ. Tầng đỉnh nhỏ hơn nhiều so với bản trước. |
| `thap-rua-shore.png` | Ảnh từ bờ phía đông | Silhouette ba tầng trên gò, tổng cao đo bằng Blender 8,73 m. | Mái và cửa vẫn đọc được khi nhìn xa; trang trí rồng còn giản lược. |

## Những phần chưa phục dựng chính xác

- Mô hình là diễn giải semi-realistic theo kích thước và ảnh, chưa có đo đạc
  hiện trạng/scan tại chỗ.
- Đầu đao và biểu tượng trên nóc là hình khối gợi dáng; chưa thể hiện chính xác
  các đôi rồng chầu và hoa văn ngói ở ảnh cận cảnh.
- Chữ khắc, sự mòn của từng viên đá và mảng rêu được giản lược để giữ GLB nhẹ.
- Ảnh render Blender được dùng để so hình học. Cần kiểm tra thêm trong WebGL
  ở cự ly chơi thực tế sau mỗi lần thay GLB.
