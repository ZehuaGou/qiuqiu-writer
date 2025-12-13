# 组件Prompt管理说明

## 概述

系统现在支持将每个组件的生成prompt和验证prompt存储在`prompt_templates`表中，支持全局和作品级别的组件prompt管理。

## 数据库结构

### 新增字段

在`prompt_templates`表中新增了以下字段：

- `component_id`: 组件ID（如：`char-cards`、`cp-relations`等）
- `component_type`: 组件类型（如：`character-card`、`relation-graph`等）
- `prompt_category`: prompt类别，值为`generate`（生成）或`validate`（验证）
- `work_id`: 关联的作品ID（如果prompt是作品级别的，否则为NULL表示全局prompt）

### 索引

- `idx_prompt_templates_component`: 基于`component_id`和`component_type`的索引
- `idx_prompt_templates_work_component`: 基于`work_id`、`component_id`和`prompt_category`的复合索引

## API接口

### 1. 获取组件的prompt

```http
GET /api/v1/prompt-templates/component/{component_id}?work_id={work_id}
```

**参数**：
- `component_id`: 组件ID（必需）
- `work_id`: 作品ID（可选，如果提供则获取作品级别的prompt，否则获取全局prompt）

**响应**：
```json
{
  "component_id": "char-cards",
  "work_id": 1,
  "generate": {
    "id": 1,
    "name": "char-cards - 生成prompt",
    "prompt_content": "...",
    "component_type": "character-card",
    "prompt_category": "generate",
    ...
  },
  "validate": {
    "id": 2,
    "name": "char-cards - 验证prompt",
    "prompt_content": "...",
    "component_type": "character-card",
    "prompt_category": "validate",
    ...
  }
}
```

### 2. 创建或更新组件的prompt

```http
POST /api/v1/prompt-templates/component/{component_id}
Content-Type: application/json

{
  "component_type": "character-card",
  "work_id": 1,  // 可选
  "generate_prompt": "...",  // 可选
  "validate_prompt": "..."   // 可选
}
```

**参数**：
- `component_id`: 组件ID（路径参数）
- `component_type`: 组件类型（请求体，必需）
- `work_id`: 作品ID（请求体，可选）
- `generate_prompt`: 生成prompt内容（请求体，可选）
- `validate_prompt`: 验证prompt内容（请求体，可选）

**说明**：
- 如果组件prompt已存在，则更新；否则创建新的
- 可以只更新生成prompt或验证prompt，也可以同时更新两个

**响应**：
```json
{
  "generate": {
    "id": 1,
    "name": "char-cards - 生成prompt",
    "prompt_content": "...",
    ...
  },
  "validate": {
    "id": 2,
    "name": "char-cards - 验证prompt",
    "prompt_content": "...",
    ...
  }
}
```

### 3. 获取作品所有组件的prompt

```http
GET /api/v1/prompt-templates/work/{work_id}/components
```

**响应**：
```json
{
  "work_id": 1,
  "components": {
    "char-cards": {
      "component_id": "char-cards",
      "component_type": "character-card",
      "generate": {...},
      "validate": {...}
    },
    "cp-relations": {
      "component_id": "cp-relations",
      "component_type": "relation-graph",
      "generate": {...},
      "validate": {...}
    }
  }
}
```

## 使用示例

### 示例1：创建全局组件prompt

```python
import requests

# 创建全局的角色卡片组件的生成和验证prompt
response = requests.post(
    "http://localhost:8001/api/v1/prompt-templates/component/char-cards",
    json={
        "component_type": "character-card",
        "generate_prompt": "根据以下信息生成角色：\n{所有角色}\n\n请生成一个新角色。",
        "validate_prompt": "验证以下角色信息是否完整：\n{角色信息}\n\n检查是否有遗漏的字段。"
    },
    headers={"Authorization": "Bearer <token>"}
)

print(response.json())
```

### 示例2：创建作品级别的组件prompt

```python
# 为特定作品创建组件prompt（会覆盖全局prompt）
response = requests.post(
    "http://localhost:8001/api/v1/prompt-templates/component/char-cards",
    json={
        "component_type": "character-card",
        "work_id": 1,
        "generate_prompt": "根据作品《{作品标题}》的信息生成角色：\n{所有角色}\n\n请生成一个新角色。",
        "validate_prompt": "验证角色信息是否符合作品《{作品标题}》的风格。"
    },
    headers={"Authorization": "Bearer <token>"}
)
```

### 示例3：获取组件的prompt

```python
# 获取全局prompt
response = requests.get(
    "http://localhost:8001/api/v1/prompt-templates/component/char-cards"
)
prompts = response.json()
print(f"生成prompt: {prompts['generate']['prompt_content']}")
print(f"验证prompt: {prompts['validate']['prompt_content']}")

# 获取作品级别的prompt（如果存在）
response = requests.get(
    "http://localhost:8001/api/v1/prompt-templates/component/char-cards",
    params={"work_id": 1}
)
```

### 示例4：获取作品所有组件的prompt

```python
response = requests.get(
    "http://localhost:8001/api/v1/prompt-templates/work/1/components"
)
work_prompts = response.json()

for comp_id, comp_data in work_prompts["components"].items():
    print(f"组件 {comp_id}:")
    if comp_data["generate"]:
        print(f"  生成prompt: {comp_data['generate']['prompt_content'][:50]}...")
    if comp_data["validate"]:
        print(f"  验证prompt: {comp_data['validate']['prompt_content'][:50]}...")
```

## 优先级规则

1. **作品级别优先**：如果存在作品级别的组件prompt，优先使用作品级别的
2. **全局作为默认**：如果不存在作品级别的，使用全局的组件prompt
3. **向后兼容**：如果都不存在，组件可以使用默认的硬编码prompt

## 前端集成建议

### 1. 组件配置界面

在组件配置界面中，可以添加"AI Prompt设置"部分：

```typescript
interface ComponentConfig {
  id: string;
  type: ComponentType;
  label: string;
  config: {...};
  // AI Prompt配置（从后端获取）
  generatePrompt?: string;
  validatePrompt?: string;
}
```

### 2. 获取组件prompt

```typescript
async function getComponentPrompts(
  componentId: string,
  workId?: number
): Promise<{ generate?: string; validate?: string }> {
  const url = `/api/v1/prompt-templates/component/${componentId}`;
  const params = workId ? { work_id: workId } : {};
  
  const response = await fetch(`${url}?${new URLSearchParams(params)}`);
  const data = await response.json();
  
  return {
    generate: data.generate?.prompt_content,
    validate: data.validate?.prompt_content,
  };
}
```

### 3. 保存组件prompt

```typescript
async function saveComponentPrompts(
  componentId: string,
  componentType: string,
  generatePrompt?: string,
  validatePrompt?: string,
  workId?: number
) {
  const url = `/api/v1/prompt-templates/component/${componentId}`;
  const body: any = {
    component_type: componentType,
  };
  
  if (workId) body.work_id = workId;
  if (generatePrompt) body.generate_prompt = generatePrompt;
  if (validatePrompt) body.validate_prompt = validatePrompt;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  
  return response.json();
}
```

## 数据库迁移

如果需要为现有数据库添加新字段，需要执行以下SQL：

```sql
-- 添加新字段
ALTER TABLE prompt_templates
ADD COLUMN component_id VARCHAR(100),
ADD COLUMN component_type VARCHAR(50),
ADD COLUMN prompt_category VARCHAR(20),
ADD COLUMN work_id INTEGER REFERENCES works(id) ON DELETE CASCADE;

-- 创建索引
CREATE INDEX idx_prompt_templates_component ON prompt_templates(component_id, component_type);
CREATE INDEX idx_prompt_templates_work_component ON prompt_templates(work_id, component_id, prompt_category);

-- 为component_id和prompt_category添加索引（如果还没有）
CREATE INDEX IF NOT EXISTS idx_prompt_templates_component_id ON prompt_templates(component_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_prompt_category ON prompt_templates(prompt_category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_work_id ON prompt_templates(work_id);
```

## 总结

组件prompt管理功能提供了：

✅ **集中管理**：所有组件的prompt都存储在统一的表中

✅ **灵活配置**：支持全局和作品级别的prompt

✅ **易于扩展**：可以轻松添加新的组件类型和prompt类别

✅ **向后兼容**：不影响现有的prompt模板功能

✅ **性能优化**：通过索引快速查询组件prompt

