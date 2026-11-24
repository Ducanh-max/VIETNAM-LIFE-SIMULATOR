# ĐỜI VIỆT — Vietnam Life (Hà Nội 3D)

Game web 3D mô phỏng cuộc sống Việt Nam, bắt đầu từ khu Hồ Hoàn Kiếm. Viết bằng React, TypeScript, Three.js và React Three Fiber. Mọi công trình (Tháp Rùa, Cầu Thê Húc, Đền Ngọc Sơn), cây cối, phố xá và nhân vật đều được dựng bằng code Three.js; dự án không dùng file mô hình GLB/Blender.

## Chạy trên máy (localhost)

Cần [Node.js 22+](https://nodejs.org) và pnpm (`npm install -g pnpm`).

```bash
git clone https://github.com/Ducanh-max/VIETNAM-LIFE-SIMULATOR.git
cd VIETNAM-LIFE-SIMULATOR
git checkout feat/rebuild-hanoi
pnpm install
pnpm dev
```

Mở http://localhost:5173 trên Chrome hoặc Edge. Bản build thử: `pnpm build` rồi `pnpm preview` (http://localhost:4173).

## Cách chơi

1. Nhập tên của bạn.
2. Trên bản đồ Việt Nam (có giờ Việt Nam chạy theo thời gian thực), chọn **Hà Nội**. Các tỉnh thành khác hiện "Sắp ra mắt".
3. Trong game: **WASD** đi, **Shift** chạy, chuột (sau khi nhấp vào cảnh) hoặc giữ chuột phải để xoay camera, cuộn chuột để phóng to, **V** bật drone (Space/Ctrl lên xuống), **Esc** tạm dừng.

Ánh sáng (ngày, hoàng hôn, đêm) mặc định theo giờ Việt Nam lúc vào game và có thể đổi trong Cài đặt.

## Cấu trúc

```text
src/
├─ App.tsx                 Luồng màn hình, HUD, cài đặt
├─ ui/                     Màn hình nhập tên, đồng hồ giờ Việt Nam, bản đồ Việt Nam
├─ data/
│  ├─ hoanKiem.json        Bờ hồ, hai đảo, tuyến cầu (OpenStreetMap)
│  └─ vietnamMap.ts        Đường viền Việt Nam (Natural Earth, góc nhìn Việt Nam, có Hoàng Sa, Trường Sa)
└─ game/
   ├─ geo.ts               Toạ độ, các vành phố quanh hồ, va chạm
   ├─ World.tsx            Ánh sáng, bầu trời, mức đồ họa, ghép cảnh
   ├─ Player.tsx           Nhân vật, camera góc ba, drone
   └─ world/
      ├─ TurtleTower.tsx   Tháp Rùa và đảo
      ├─ NgocSon.tsx       Đền Ngọc Sơn: cổng, ba toà điện, Trấn Ba Đình, cờ, cây
      ├─ Bridge.tsx        Cầu Thê Húc, lá sen
      ├─ Lakeside.tsx      Mặt nước, kè đá, đường dạo, đường vòng hồ, cây liễu, đèn, ghế
      ├─ City.tsx          Nhà ống, nhà phố có biển hiệu, biệt thự Pháp, khối phố phía sau
      ├─ Roof.tsx, roof.ts Mái cong đầu đao dùng chung
      ├─ Vegetation.tsx    Cây (instancing)
      └─ textures.ts       Texture vẽ bằng canvas (gạch, đá, mặt tiền, ngói, nước)
```

## Hiệu năng

- Lặp lại (cây, đèn, lan can, nhà, đá) đều dùng `InstancedMesh`, mỗi loại một lượt vẽ.
- Texture vẽ bằng canvas ngay trong trình duyệt nên không phải tải ảnh.
- Bóng đổ chỉ tính trong vùng 140 m quanh người chơi nên shadow map nhỏ vẫn nét.
- Mặt nước phản chiếu thật chỉ bật ở High/Ultra; Low/Medium dùng mặt nước normal map rẻ hơn.
- Đo ở góc nhìn xuất phát, mức Medium: khoảng 440 lượt vẽ (gồm cả lượt bóng đổ) và khoảng 400.000 tam giác. Bước tiếp theo là gộp hình học tĩnh của từng công trình để giảm lượt vẽ.

## Dữ liệu

- Bờ hồ, đảo, cầu: © [OpenStreetMap contributors](https://www.openstreetmap.org/relation/198437), ODbL 1.0.
- Bản đồ Việt Nam: [Natural Earth](https://www.naturalearthdata.com/) (public domain), bản góc nhìn Việt Nam. Tạo lại bằng `scripts/geo/build-vietnam-map.py`.

Quy ước toạ độ: 1 đơn vị = 1 mét, Y hướng lên, bắc là −Z, gốc tại 21.0288313°N, 105.8525357°E.
