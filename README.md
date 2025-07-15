# LLM API 格式转换器

这是一个通用的 LLM API 格式转换器，支持在不同的 LLM API 格式之间进行请求和响应的转换，并提供智能的模型映射功能。

## 支持的 API 格式

- **OpenAI**: OpenAI ChatGPT API 格式
- **Claude**: Anthropic Claude API 格式  
- **Gemini**: Google Gemini API 格式
- **OpenRouter**: OpenRouter API 格式

## 使用方法

### URL 格式
```
POST /{source_platform}/{target_platform}
```

### 路径参数
- `source_platform`: 源平台 (openai/claude/gemini/openrouter)
- `target_platform`: 目标平台 (openai/claude/gemini/openrouter)

**注意**: 源格式会根据请求内容自动检测，URL中的源平台主要用作提示。

### 认证方式

支持多种认证方式，转换器会自动检测：

- **Authorization Header**: `Authorization: Bearer YOUR_TOKEN`
- **API Key Header**: `x-api-key: YOUR_TOKEN`
- **Google API Key**: `x-goog-api-key: YOUR_TOKEN`
- **URL 参数**: `?key=YOUR_TOKEN`

## 模型映射功能

转换器支持自动模型映射，**仅在目标平台是 OpenRouter 时生效**。这样可以将客户端使用的简单模型名称映射到 OpenRouter 要求的完整模型标识符：

### 内置映射规则

```javascript
// Claude 模型映射 (仅在 OpenRouter 下生效)
'claude-sonnet-4' → 'anthropic/claude-sonnet-4'
'claude-3-sonnet-20240229' → 'anthropic/claude-3-sonnet-20240229'
'claude-3-opus-20240229' → 'anthropic/claude-3-opus-20240229'

// OpenAI 模型映射 (仅在 OpenRouter 下生效)
'gpt-4' → 'openai/gpt-4'
'gpt-4-turbo' → 'openai/gpt-4-turbo'
'gpt-3.5-turbo' → 'openai/gpt-3.5-turbo'

// Gemini 模型映射 (仅在 OpenRouter 下生效)
'gemini-pro' → 'google/gemini-pro'
'gemini-1.5-pro' → 'google/gemini-1.5-pro'

// 其他模型映射 (仅在 OpenRouter 下生效)
'llama-3-70b' → 'meta-llama/llama-3-70b-instruct'
```

### 映射规则说明

- 映射**仅在目标平台是 `openrouter` 时生效**
- 其他平台（openai、claude、gemini）不会应用映射
- 如果模型名称在映射表中不存在，则保持原样

### 自定义映射

您可以在 `worker.js` 中的 `API_FORMATS.openrouter.modelMappings` 对象中添加自定义映射规则：

```javascript
const API_FORMATS = {
    openrouter: {
        // ... 其他配置
        modelMappings: {
            // 添加您的自定义映射
            'your-model-name': 'provider/actual-model-name',
            'custom-gpt-4': 'openai/gpt-4',
            'my-claude': 'anthropic/claude-3-sonnet-20240229'
        }
    }
}
```

## 使用场景

### 场景1: Claude Code 中使用 OpenAI 模型
客户端发送 Claude 风格请求，转换为 OpenAI 格式：

```bash
curl -X POST "https://your-worker.com/claude/openai" \
  -H "x-api-key: YOUR_OPENAI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 1000
  }'
```

### 场景2: OpenAI 客户端使用 Claude API
客户端发送 OpenAI 风格请求，转换为 Claude 格式：

```bash
curl -X POST "https://your-worker.com/openai/claude" \
  -H "Authorization: Bearer YOUR_CLAUDE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 1000,
    "temperature": 0.7
  }'
```

### 场景3: Gemini CLI 使用 OpenAI 后端
Gemini 客户端使用 OpenAI 风格的后端模型：

```bash
curl -X POST "https://your-worker.com/gemini/openai" \
  -H "x-goog-api-key: YOUR_OPENAI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [{"text": "Hello, how are you?"}]
      }
    ],
    "generationConfig": {
      "maxOutputTokens": 1000,
      "temperature": 0.7
    }
  }'
```

### 场景4: 使用 OpenRouter 统一接口
通过 OpenRouter 访问各种模型，自动应用模型映射：

```bash
curl -X POST "https://your-worker.com/openai/openrouter" \
  -H "Authorization: Bearer YOUR_OPENROUTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 1000
  }'
```

**注意**: 
- 上述请求中的 `claude-sonnet-4` 会自动映射为 `anthropic/claude-sonnet-4`
- 模型映射仅在目标平台是 OpenRouter 时生效

## 请求格式转换示例

### OpenAI 格式 → OpenRouter 格式 (带模型映射)
```javascript
// 输入 (OpenAI)
{
  "model": "claude-sonnet-4",
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1000
}

// 输出 (OpenRouter) - 仅在目标平台是 OpenRouter 时应用映射
{
  "model": "anthropic/claude-sonnet-4",  // 自动映射
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1000
}
```

### Claude 格式 → Gemini 格式
```javascript
// 输入 (Claude)
{
  "model": "claude-3-sonnet-20240229",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 1000
}

// 输出 (Gemini)
{
  "contents": [
    {
      "role": "user",
      "parts": [{"text": "Hello"}]
    }
  ],
  "generationConfig": {
    "maxOutputTokens": 1000,
    "temperature": 0.7
  }
}
```

## 响应格式转换示例

### Claude 响应 → OpenAI 响应
```javascript
// 输入 (Claude API 响应)
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello! I'm doing well."}],
  "model": "claude-3-sonnet-20240229",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 20
  }
}

// 输出 (OpenAI 格式)
{
  "id": "msg_123",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "claude-3-sonnet-20240229",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! I'm doing well."
    },
    "finish_reason": "end_turn"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

## 部署

### Cloudflare Workers
1. 将 `worker.js` 部署到 Cloudflare Workers
2. 配置自定义域名（可选）
3. 设置环境变量（如需要）

### 本地测试
```bash
# 使用 Cloudflare Workers CLI
wrangler dev
```

## 注意事项

1. **认证令牌**: 确保使用正确的认证方式和有效的 API 令牌
2. **模型名称**: 使用目标 API 支持的正确模型名称
3. **速率限制**: 遵守各个 API 提供商的速率限制
4. **错误处理**: 转换器会返回详细的错误信息以便调试

## 错误响应

```javascript
// 格式错误
{
  "error": "Invalid path format. Expected: /source_platform/target_platform",
  "status": 400
}

// 认证错误
{
  "error": "Missing authentication token",
  "status": 401
}

// 不支持的平台
{
  "error": "Unsupported API platform",
  "status": 400
}
```

## 扩展支持

### 添加新的 API 平台

要添加新的 API 平台，需要：

1. 在 `API_FORMATS` 中添加新的配置
2. 在 `toStandardFormat` 和 `fromStandardFormat` 中添加转换逻辑
3. 在 `responseToStandardFormat` 和 `responseFromStandardFormat` 中添加响应转换逻辑
4. 更新 `detectSourceFormat` 函数以支持新格式的自动检测

### 添加模型映射

要添加新的模型映射，只需在相应平台的 `modelMappings` 配置中添加映射规则：

```javascript
const API_FORMATS = {
    openrouter: {
        // ... 其他配置
        modelMappings: {
            // 添加您的自定义映射
            'your-model-name': 'provider/actual-model-name',
            'custom-gpt-4': 'openai/gpt-4',
            'my-claude': 'anthropic/claude-3-sonnet-20240229'
        }
    }
    // 未来可以为其他平台添加 modelMappings
}
```

### 高级功能

- **自动格式检测**: 根据请求内容自动识别源格式
- **灵活认证**: 支持多种认证方式的自动检测
- **智能模型映射**: 自动将客户端模型名称映射到目标平台格式
- **错误处理**: 详细的错误信息便于调试

这样就可以支持更多的 LLM API 平台和模型了。 