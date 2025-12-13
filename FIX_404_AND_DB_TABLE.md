# 修复 404 错误和数据库表问题

## 问题描述

从日志中看到两个问题：

1. **404 错误**：`GET /api/v1/chapters/7/document HTTP/1.1" 404 Not Found`
2. **数据库表不存在**：`relation "document_sync_history" does not exist`

## 已修复的问题

### 1. 章节文档端点 404 错误 ✅

**问题**：当 ShareDB 文档不存在时，端点返回 404，导致前端无法正常初始化编辑器。

**修复**：
- 修改 `chapters_router.py` 中的 `get_chapter_document` 端点
- 当 ShareDB 文档不存在时，返回空内容而不是 404
- 这样前端可以正常初始化编辑器，用户可以开始编辑

**代码变更**：
```python
# 修复前：返回 404
if not document:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="ShareDB文档不存在"
    )

# 修复后：返回空内容
if not document:
    logger.warning(f"ShareDB文档不存在: chapter_{chapter_id}，返回空内容")
    document = {
        "id": f"chapter_{chapter_id}",
        "content": chapter.content or "",
        "version": 1,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
```

### 2. 数据库表不存在警告 ✅

**问题**：`document_sync_history` 表不存在，导致保存同步历史时出现警告。

**状态**：
- 代码已经正确处理了这种情况（只记录警告，不影响同步功能）
- 表会在数据库初始化时自动创建

**解决方案**：
运行数据库初始化脚本创建表：

```bash
cd backend
python3 -c "
import asyncio
from memos.api.core.database import init_db

asyncio.run(init_db())
print('数据库表初始化完成')
"
```

或者使用 Alembic 迁移：

```bash
cd backend
alembic upgrade head
```

## 验证修复

### 1. 验证章节文档端点

```bash
# 测试端点（即使ShareDB文档不存在也应该返回200）
curl -X GET "http://localhost:8001/api/v1/chapters/7/document" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**预期结果**：
- 状态码：200 OK
- 返回内容包含空文档结构（如果ShareDB文档不存在）

### 2. 验证数据库表

```sql
-- 连接到数据库
psql -U your_user -d your_database

-- 检查表是否存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'document_sync_history';

-- 如果表不存在，运行初始化脚本
```

## 相关文件

- `backend/src/memos/api/routers/chapters_router.py` - 章节路由（已修复）
- `backend/src/memos/api/services/sharedb_service.py` - ShareDB服务（已处理表不存在的情况）
- `backend/src/memos/api/core/database.py` - 数据库初始化
- `backend/src/memos/api/models/document.py` - 文档同步历史模型

## 注意事项

1. **数据库表初始化**：
   - 如果表不存在，同步功能仍然可以正常工作
   - 只是不会保存同步历史记录
   - 建议运行初始化脚本创建表，以便记录同步历史

2. **ShareDB文档不存在**：
   - 现在会返回空内容，而不是404
   - 前端可以正常初始化编辑器
   - 用户开始编辑后，文档会自动创建

3. **日志警告**：
   - 如果看到 "保存同步历史失败" 的警告，说明表不存在
   - 这不影响同步功能，只是不会记录历史
   - 运行数据库初始化脚本可以解决

## 下一步

1. 运行数据库初始化脚本创建 `document_sync_history` 表
2. 测试章节文档端点，确认不再返回404
3. 测试同步功能，确认警告消失

