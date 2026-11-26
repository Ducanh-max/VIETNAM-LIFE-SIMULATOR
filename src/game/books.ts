/*
 * What you read when you open a book from the balo. Each book has a few short pages written for the game:
 * an introduction to the author and the work and a retelling in our own words (not the books' text). Truyện Kiều
 * (Nguyễn Du, early 19th century) is long in the public domain, so its opening lines are quoted as written.
 */
export const BOOK_PAGES: Record<string, { author: string; pages: string[] }> = {
  demen: {
    author: 'Tô Hoài',
    pages: [
      'Dế Mèn phiêu lưu ký là truyện đồng thoại Tô Hoài viết năm 1941, đến nay vẫn là cuốn sách thiếu nhi được yêu thích nhất Việt Nam và đã được dịch ra nhiều thứ tiếng.',
      'Dế Mèn là một chú dế khoẻ mạnh nhưng kiêu căng. Một trò đùa ác của Mèn với chị Cốc đã làm Dế Choắt, người hàng xóm ốm yếu, phải chết oan. Trước khi mất, Choắt khuyên Mèn bỏ thói hung hăng.',
      'Ân hận, Mèn rời hang đi chu du thiên hạ. Mèn gặp Dế Trũi rồi kết làm anh em, cùng nhau qua bao vùng đất, bị bắt làm trò mua vui, rồi tự giải thoát.',
      'Cuối truyện, Mèn và Trũi giúp muôn loài sống hoà thuận, không còn cảnh mạnh hiếp yếu. Bài học: biết nhận lỗi, biết sống vì người khác.',
      '(Đây là phần tóm tắt và giới thiệu viết riêng cho game, không phải nguyên văn của tác giả.)',
    ],
  },
  sodo: {
    author: 'Vũ Trọng Phụng',
    pages: [
      'Số đỏ là tiểu thuyết trào phúng Vũ Trọng Phụng in năm 1936, lấy bối cảnh Hà Nội những năm 1930 với phong trào "Âu hoá" rầm rộ.',
      'Xuân Tóc Đỏ vốn là một kẻ lông bông nhặt bóng ở sân quần vợt. Nhờ một loạt tình cờ và may mắn, Xuân lần lượt trở thành nhân viên tiệm may Âu Hoá, "giáo sư" quần vợt, rồi được tôn là "nhà cải cách".',
      'Qua những bước nhảy vọt của Xuân, tác giả giễu cợt lối sống chạy theo mốt, sự giả dối và háo danh của một bộ phận thị dân đương thời.',
      'Đọc Số đỏ, người ta vẫn bật cười vì những màn kịch được dựng lên quanh Xuân, và nhận ra những thói xấu ấy chưa bao giờ cũ.',
      '(Đây là phần tóm tắt và giới thiệu viết riêng cho game, không phải nguyên văn của tác giả.)',
    ],
  },
  kieu: {
    author: 'Nguyễn Du',
    pages: [
      'Truyện Kiều (Đoạn trường tân thanh) là truyện thơ lục bát của Nguyễn Du, gồm 3.254 câu, viết đầu thế kỷ 19 và được coi là kiệt tác của văn học Việt Nam.',
      'Trăm năm trong cõi người ta,\nChữ tài chữ mệnh khéo là ghét nhau.\nTrải qua một cuộc bể dâu,\nNhững điều trông thấy mà đau đớn lòng.',
      'Lạ gì bỉ sắc tư phong,\nTrời xanh quen thói má hồng đánh ghen.\nCảo thơm lần giở trước đèn,\nPhong tình cổ lục còn truyền sử xanh.',
      'Thuý Kiều tài sắc vẹn toàn, đính ước với Kim Trọng, nhưng gia đình gặp nạn nên nàng bán mình chuộc cha. Mười lăm năm lưu lạc, qua bao đau khổ, Kiều mới được đoàn tụ với gia đình.',
      '(Trang 2 và 3 là nguyên văn mở đầu Truyện Kiều, tác phẩm đã thuộc phạm vi công cộng; phần còn lại là giới thiệu viết riêng cho game.)',
    ],
  },
  hanoi36: {
    author: 'Thạch Lam',
    pages: [
      'Hà Nội băm sáu phố phường là tập tuỳ bút của Thạch Lam (nhóm Tự Lực Văn Đoàn), in năm 1943, viết về những món quà, thú chơi và nếp sống của người Hà Nội.',
      'Thạch Lam viết nhiều về quà Hà Nội: phở, bún chả, bánh cuốn, cốm làng Vòng… với con mắt trân trọng, coi cái ăn cũng là một nét văn hoá tinh tế của đất kinh kỳ.',
      'Ông cũng viết về phố cổ, những gánh hàng rong, những buổi sáng mùa thu, và mong người Hà Nội biết giữ những cái hay của mình.',
      'Ngồi bên Hồ Gươm đọc cuốn này, rồi đi ăn một bát phở hay một suất bún chả, là cách đọc hợp nhất.',
      '(Đây là phần tóm tắt và giới thiệu viết riêng cho game, không phải nguyên văn của tác giả.)',
    ],
  },
  map: {
    author: 'Bản đồ du lịch',
    pages: [
      'Hồ Hoàn Kiếm: Tháp Rùa giữa hồ, Cầu Thê Húc đỏ dẫn vào Đền Ngọc Sơn. Đi bộ quanh hồ khoảng 1,8 km.',
      'Phố cổ phía bắc hồ: Hàng Đào, Hàng Bạc, Tạ Hiện, chợ Đồng Xuân. Phía nam: Nhà hát Lớn, Tràng Tiền, Nhà thờ Lớn ở phía tây.',
      'Ba Đình: Lăng Chủ tịch Hồ Chí Minh, Quảng trường Ba Đình, Chùa Một Cột, Cột cờ Hà Nội. Văn Miếu – Quốc Tử Giám ở phía nam.',
      'Đi xa hơn về phía tây: Công viên Thủ Lệ và Lotte Center Hà Nội với đài quan sát tầng 65.',
      'Mẹo: mở điện thoại (P), app Bản đồ để tìm đường; app Đen SM để gọi xe; app Food để đặt đồ ăn.',
    ],
  },
};
