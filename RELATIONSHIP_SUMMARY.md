# Tính năng Tóm tắt Bối cảnh Mối quan hệ

## Mô tả
Tính năng tự động tóm tắt mối quan hệ giữa các nhân vật và người dùng, được AI cập nhật sau mỗi cuộc hội thoại.

## Cách hoạt động

### 1. Tự động cập nhật
- **Khi nào**: Sau mỗi lần nhấn "Kết thúc ngày" (handleEndDay)
- **AI làm gì**: Phân tích cuộc hội thoại và tạo tóm tắt ngắn gọn (4-5 câu) bằng tiếng Việt
- **Nội dung**: 
  - Mối quan hệ giữa các nhân vật với nhau
  - Mối quan hệ giữa từng nhân vật với người dùng
  - Các sự kiện quan trọng vừa xảy ra

### 2. Chỉnh sửa thủ công
- Hiển thị trong textarea dưới phần "Bối cảnh" ở màn hình chat
- Người dùng có thể sửa trực tiếp
- Thay đổi được lưu cùng dữ liệu

### 3. Tích hợp vào AI
- Relationsh ip Summary được đưa vào system prompt
- Đặt ngay sau "CONVERSATION SETTING" và trước "CHARACTERS IN THIS SCENE"
- Giúp AI hiểu rõ bối cảnh và tương tác tự nhiên hơn

## Ví dụ Relationship Summary

```
Mimi và Lisa là bạn thân từ nhỏ, rất tin tưởng nhau. Klee là hàng xóm mới, đang dần hòa nhập vào nhóm.
Người dùng đã quen với Mimi qua nhiều cuộc trò chuyện, Mimi thấy người dùng rất kiên nhẫn và tốt bụng.
Lisa còn đang tìm hiểu về người dùng nhưng tỏ ra tò mò. Klee rất háo hức kết bạn với người dùng.
Gần đây họ đã cùng nhau học về đồ ăn Hàn Quốc và chia sẻ về sở thích cá nhân.
```

## Vị trí trong System Prompt

```
CONVERSATION SETTING:
at Mimi's house

RELATIONSHIP CONTEXT:
[Tóm tắt bối cảnh mối quan hệ ở đây]

CHARACTERS IN THIS SCENE:
- Mimi (girl): ...
  * Opinion about the user (positive): ...
  * Relationships:
    - About Lisa (positive): ...
```

## Cấu trúc dữ liệu

### SavedData (cập nhật)
```typescript
interface SavedData {
  version: 4;
  journal: ChatJournal;
  characters: Character[];
  activeCharacterIds: string[];
  context: string;
  relationshipSummary?: string;  // Mới thêm
}
```

### initChat (cập nhật signature)
```typescript
export const initChat = async (
  activeCharacters: Character[],
  context: string,
  history: Content[] = [],
  contextSummary: string = '',
  relationshipSummary: string = ''  // Mới thêm
): Promise<Chat>
```

## Lợi ích

1. **Liên tục bối cảnh**: AI nhớ mối quan hệ qua nhiều cuộc trò chuyện
2. **Tự động hóa**: Không cần nhập thủ công sau mỗi lần chat
3. **Ngắn gọn**: Chỉ 4-5 câu, tiết kiệm token
4. **Linh hoạt**: Có thể chỉnh sửa nếu cần
5. **Tương tác tự nhiên**: AI phản ứng phù hợp với mối quan hệ đã thiết lập

## Sự khác biệt với Character Opinions

| Tính năng | Relationship Summary | Character Opinions |
|-----------|---------------------|-------------------|
| **Loại** | Tổng quan chung | Chi tiết từng nhân vật |
| **Cập nhật** | Tự động sau mỗi ngày | Thủ công trong Character Manager |
| **Ngôn ngữ** | Tiếng Việt | Tiếng Anh |
| **Độ dài** | 4-5 câu | Không giới hạn |
| **Mục đích** | Bối cảnh tổng thể | Tính cách sâu chi tiết |

## Flow hoạt động

```
1. User chat với các nhân vật
2. User nhấn "Kết thúc ngày"
3. AI tạo summary cuộc trò chuyện
4. AI tạo relationship summary mới (dựa trên summary cũ + cuộc hội thoại mới)
5. Lưu relationshipSummary vào state
6. Reinit chat với relationshipSummary mới
7. Lưu vào file khi save data
```

## Tương thích ngược

- Dữ liệu version 2, 3, 4 đều được hỗ trợ
- Nếu không có relationshipSummary, khởi tạo chuỗi rỗng
- Không ảnh hưởng đến dữ liệu cũ khi load
