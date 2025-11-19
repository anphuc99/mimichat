# Tính năng Quan điểm giữa các Nhân vật

## Mô tả
Tính năng này cho phép mỗi nhân vật có suy nghĩ và quan điểm riêng về:
- **Người dùng**: Nhân vật nghĩ gì về người dùng
- **Các nhân vật khác**: Mối quan hệ và suy nghĩ giữa các nhân vật

## Cấu trúc dữ liệu

### RelationInfo
```typescript
interface RelationInfo {
  opinion: string;           // Suy nghĩ/quan điểm (văn bản tự do)
  sentiment?: 'positive' | 'neutral' | 'negative';  // Cảm xúc
  closeness?: number;        // Độ thân thiết (0.0 - 1.0)
}
```

### Character (cập nhật)
```typescript
interface Character {
  // ... các trường hiện có
  relations?: { [targetCharacterId: string]: RelationInfo };  // Quan điểm về nhân vật khác
  userOpinion?: RelationInfo;  // Quan điểm về người dùng
}
```

## Cách sử dụng

### 1. Chỉnh sửa quan điểm
1. Mở **Quản lý nhân vật** (biểu tượng 👥 trên thanh header)
2. Nhấn nút **Sửa** (✏️) bên cạnh nhân vật bạn muốn chỉnh sửa
3. Kéo xuống và nhấn vào **💭 Quan điểm về người khác** để mở rộng
4. Điền thông tin:
   - **Về người dùng**: Nhân vật này nghĩ gì về người dùng
   - **Về các nhân vật khác**: Quan điểm về từng nhân vật khác
   - **Cảm xúc**: Chọn Tích cực 😊, Trung tính 😐, hoặc Tiêu cực 😞
   - **Độ thân**: Điều chỉnh thanh trượt từ 0% (xa lạ) đến 100% (rất thân)
5. Nhấn **Lưu** để hoàn tất

### 2. Tạo nhân vật mới
Khi tạo nhân vật mới, các trường `relations` và `userOpinion` sẽ được khởi tạo rỗng tự động. Bạn có thể chỉnh sửa sau.

## Phiên bản dữ liệu

- **Version 4** (mới nhất): Hỗ trợ `relations` và `userOpinion`
- **Version 2-3**: Tương thích ngược - khi load sẽ tự động khởi tạo các trường mới với giá trị mặc định
- **Version 1**: Tương thích ngược - khi load sẽ sử dụng `initialCharacters`

## Tính năng tương lai (chưa triển khai)

1. **Tự động tạo quan điểm**: Sử dụng AI để tạo quan điểm dựa trên tính cách nhân vật
2. **Cập nhật động**: Quan điểm thay đổi theo thời gian dựa trên các cuộc trò chuyện
3. **Tích hợp vào prompt**: Sử dụng quan điểm để ảnh hưởng đến cách nhân vật trả lời
4. **Hiển thị quan hệ**: Biểu đồ trực quan hóa mối quan hệ giữa các nhân vật

## Ghi chú kỹ thuật

- Dữ liệu được lưu trong `SavedData` với `version: 4`
- Backward compatibility được đảm bảo cho version 2 và 3
- UI được thiết kế dạng collapsible để tiết kiệm không gian
- Tất cả các trường đều optional để tránh lỗi khi load dữ liệu cũ
