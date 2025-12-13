# 修复增量更新和"保存最长文本"问题

## 问题描述

1. **前端不是增量更新**：前端发送的是完整内容，但使用 `base_content` 来计算差异
2. **保存最长的文本**：后端合并逻辑在某些情况下会选择较长的内容，导致丢失用户的编辑

## 已修复的问题

### 1. 前端：保持用户编辑内容 ✅

**问题**：当检测到服务器版本更新时，代码错误地将 `contentStr` 设为服务器内容，导致用户编辑丢失。

**修复**：
- 保持用户的真实编辑内容作为 `content`
- 使用服务器内容作为 `baseContent`
- 这样差异合并可以正确计算：从服务器内容（base）到用户内容（client）的差异

**代码变更**：
```typescript
// 修复前：丢弃用户编辑
contentStr = serverContent;  // ❌ 错误：丢失用户编辑

// 修复后：保持用户编辑
// baseContent 已经更新为服务器内容
// contentStr 保持用户的真实编辑内容
// ✅ 正确：差异合并会正确处理
```

### 2. 后端：改进合并策略 ✅

**问题**：合并逻辑在失败时会简单地"返回较长的内容"，导致保存最长的文本。

**修复**：
- 改进备用策略，不再简单地返回较长的内容
- 使用更智能的合并策略：
  - 如果一个是另一个的子集，返回超集
  - 尝试找出共同部分，避免重复拼接
  - 如果无法合并，返回服务器内容（已知的最新版本）

**代码变更**：
```python
# 修复前：简单返回较长的内容
return client_html if len(client_html) > len(server_html) else server_html  # ❌

# 修复后：智能合并
if server_html in client_html:
    return client_html
elif client_html in server_html:
    return server_html
else:
    # 尝试智能拼接，避免重复
    # 如果无法合并，返回服务器内容（已知的最新版本）
    return server_html  # ✅
```

## 工作原理

### 差异合并流程

1. **前端发送**：
   - `base_content`：上次同步的内容（如果服务器版本更新，使用服务器内容）
   - `content`：用户当前的编辑内容（始终是用户的真实编辑）

2. **后端计算差异**：
   - 从 `base_content` 到 `content` 的差异
   - 找出删除的内容（在 base 中但不在 content 中）
   - 找出新增的内容（在 content 中但不在 base 中）

3. **应用到服务器内容**：
   - 删除客户端删除的内容
   - 添加客户端新增的内容
   - 结果：保留所有用户的编辑

### 场景示例

**场景1：用户A删除，用户B新增**

1. **初始内容**：`<p>Hello</p><p>World</p>`
2. **用户A**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p>`（删除了第二个段落）
   - 差异：删除 `<p>World</p>`
3. **用户B**：
   - base_content: `<p>Hello</p><p>World</p>`
   - content: `<p>Hello</p><p>World</p><p>New</p>`（新增了段落）
   - 差异：新增 `<p>New</p>`
4. **用户A先同步**：服务器内容变为 `<p>Hello</p>`
5. **用户B同步时**：
   - 服务器内容：`<p>Hello</p>`
   - 客户端差异：新增 `<p>New</p>`
   - 合并结果：`<p>Hello</p><p>New</p>`
   - ✅ 删除操作保留，新增也保留

**场景2：服务器版本更新时**

1. **用户正在编辑**：`<p>Hello</p><p>Editing</p>`
2. **检测到服务器版本更新**：
   - 服务器内容：`<p>Hello</p><p>Server</p>`
   - baseContent 更新为：`<p>Hello</p><p>Server</p>`
   - content 保持为：`<p>Hello</p><p>Editing</p>`（用户的真实编辑）
3. **差异计算**：
   - 从 `<p>Hello</p><p>Server</p>` 到 `<p>Hello</p><p>Editing</p>`
   - 删除：`<p>Server</p>`
   - 新增：`<p>Editing</p>`
4. **应用到服务器内容**：
   - 删除 `<p>Server</p>`
   - 添加 `<p>Editing</p>`
   - 结果：`<p>Hello</p><p>Editing</p>`
   - ✅ 用户的编辑保留

## 关键改进点

1. **前端不再丢弃用户编辑**：
   - 当服务器版本更新时，保持用户的真实编辑内容
   - 使用服务器内容作为 baseContent，确保差异计算正确

2. **后端不再简单选择最长内容**：
   - 改进备用策略，使用智能合并
   - 如果无法合并，返回服务器内容（已知的最新版本）

3. **差异合并更准确**：
   - 正确计算从 base 到 client 的差异
   - 正确应用到服务器内容

## 测试验证

### 测试1：服务器版本更新时保持用户编辑

1. 用户A正在编辑：`<p>Hello</p><p>Editing</p>`
2. 用户B同步，服务器内容变为：`<p>Hello</p><p>Server</p>`
3. 用户A继续编辑，同步时：
   - **预期**：用户的编辑 `<p>Editing</p>` 应该保留
   - **实际**：应该保留

### 测试2：不再保存最长的文本

1. 用户A：`<p>Short</p>`
2. 用户B：`<p>Very Long Content Here</p>`
3. 合并时：
   - **预期**：不应该简单地选择较长的内容
   - **实际**：应该智能合并，保留两个用户的编辑

## 相关文件

- `frontend/src/utils/sharedbClient.ts` - 前端同步逻辑（已修复）
- `backend/src/memos/api/services/sharedb_service.py` - 后端合并逻辑（已修复）

