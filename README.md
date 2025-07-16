# AI API 格式转换服务

通用的 AI API 格式转换服务，支持在不同平台和格式之间进行转换。

## 支持的平台和格式

**平台**: `openai`, `anthropic`, `gemini`, `openrouter`, `groq`  
**格式**: `openai`, `anthropic`, `gemini`

## 核心用法

### 路由格式
```
POST /{platform}/{client_format}
POST /{platform}/{client_format}/v1/messages
POST /{platform}/{client_format}/v1/chat/completions
```

- `platform`: 实际调用的平台
- `client_format`: 客户端需要的响应格式

### Cache Control 支持

服务参考 [claude-code-router](https://github.com/musistudio/claude-code-router) 的设计，智能处理 Claude 的 prompt caching 功能：

- **默认行为**: 对所有模型移除 `cache_control` 参数，确保兼容性
- **Claude 模型**: 当检测到 `anthropic-beta: prompt-caching-*` 请求头且模型为 Claude 时，会重新添加 `cache_control` 参数
- **非 Claude 模型**: 完全移除 `cache_control` 参数，避免不兼容错误

这种设计确保了：
1. 非 Claude 模型不会因为 `cache_control` 参数而出错
2. Claude 模型可以正确使用 prompt caching 功能
3. 与 Claude Code 的完全兼容性

```bash
# Claude 模型会正确处理 cache control
curl -X POST "https://your-worker.com/openrouter/anthropic/v1/messages" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "anthropic-beta: prompt-caching-2024-07-31" \
  -d '{"model": "claude-sonnet-4", "messages": [...]}'

# GPT 模型会自动移除 cache control，避免错误
curl -X POST "https://your-worker.com/openrouter/anthropic/v1/messages" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "anthropic-beta: prompt-caching-2024-07-31" \
  -d '{"model": "gpt-4", "messages": [...]}'
```

## 使用示例

### 使用OpenAI平台，返回Claude格式
```bash
curl -X POST "https://your-worker.com/openai/anthropic" \
  -H "Authorization: Bearer YOUR_OPENAI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "max_tokens": 1000
  }'
```

### 使用Groq平台，返回OpenAI格式
```bash
curl -X POST "https://your-worker.com/groq/openai" \
  -H "Authorization: Bearer YOUR_GROQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3-70b",
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

### 使用OpenRouter平台，返回Gemini格式
```bash
curl -X POST "https://your-worker.com/openrouter/gemini" \
  -H "Authorization: Bearer YOUR_OPENROUTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic-sonnet-4",
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'
```

## 模型映射

OpenRouter平台支持模型映射，自动将简单模型名转换为完整标识符：

```javascript
// 配置示例
modelMappings: {
    'anthropic-sonnet-4': 'moonshotai/kimi-k2:free',
    // 添加更多映射...
}
```

## 工作原理

1. **格式相同**: 直接转发请求到目标平台
2. **格式不同**: 客户端格式 → 平台格式 → 平台API → 客户端格式

## 流式响应支持

服务支持流式响应（Server-Sent Events），包括：

- **直接转发**: 当平台格式与客户端格式相同时，直接转发流式响应
- **格式转换**: 当需要格式转换时，实时解析和转换流式数据块

### 流式格式转换示例

```bash
# OpenRouter 平台，返回 Claude 格式的流式响应
curl -X POST "https://your-worker.com/openrouter/anthropic" \
  -H "Authorization: Bearer YOUR_OPENROUTER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  --no-buffer \
  -d '{
    "model": "your-model",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

### 支持的流式格式转换

- **OpenAI ↔ Claude**: 双向流式格式转换
- **OpenAI ↔ Gemini**: 双向流式格式转换  
- **Claude ↔ Gemini**: 双向流式格式转换

## 部署

### Cloudflare Workers
```bash
# 部署到 Cloudflare Workers
wrangler publish

# 本地开发
wrangler dev
```

## API信息

访问根路径获取服务信息：
```bash
curl https://your-worker.com/
```

## 错误处理

```json
// 平台不支持
{"error": "Unsupported platform", "status": 400}

// 格式不支持  
{"error": "Unsupported client format", "status": 400}

// 缺少认证
{"error": "Missing authentication token", "status": 401}
``` 