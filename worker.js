addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

// 支持的API格式配置
const API_FORMATS = {
    openai: {
        baseUrl: 'https://api.openai.com',
        headers: {
            'Authorization': 'Bearer {token}',
            'Content-Type': 'application/json'
        },
        endpoint: '/v1/chat/completions',
        format: 'openai'
    },
    anthropic: {
        baseUrl: 'https://api.anthropic.com',
        headers: {
            'x-api-key': '{token}',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        endpoint: '/v1/messages',
        format: 'anthropic'
    },
    gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        headers: {
            'Content-Type': 'application/json'
        },
        endpoint: '/v1beta/models/{model}:generateContent',
        format: 'gemini'
    },
    openrouter: {
        baseUrl: 'https://openrouter.ai/api',
        headers: {
            'Authorization': 'Bearer {token}',
            'Content-Type': 'application/json'
        },
        endpoint: '/v1/chat/completions',
        // 模型映射配置（仅在 OpenRouter 下使用）
        modelMappings: {
            'claude-sonnet-4': 'moonshotai/kimi-k2:free',
            'claude-opus-4-20250514': 'moonshotai/kimi-k2:free',
        },
        format: 'openai'
    },
    groq: {
        baseUrl: 'https://api.groq.com',
        headers: {
            'Authorization': 'Bearer {token}',
            'Content-Type': 'application/json'
        },
        endpoint: '/openai/v1/chat/completions',
        // 模型映射配置
        modelMappings: {
            'claude-sonnet-4': 'moonshotai/kimi-k2-instruct',
            'claude-opus-4-20250514': 'moonshotai/kimi-k2-instruct'
        },
        format: 'openai'
    }
}

/**
 * 处理传入的请求并进行格式转换
 * @param {Request} request - 传入的 HTTP 请求
 * @returns {Promise<Response>} - 返回转换后的响应
 */
async function handleRequest(request) {
    try {
        // 处理 CORS 预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-api-key, x-goog-api-key, anthropic-version, anthropic-beta, cache-control',
                    'Access-Control-Max-Age': '86400'
                }
            })
        }

        if (request.method !== 'POST') {
            // 添加对根路由的GET请求处理
            if (request.method === 'GET') {
                const url = new URL(request.url)
                if (url.pathname === '/') {
                    return new Response(JSON.stringify({
                        name: "API格式转换服务",
                        description: "这是一个通用的AI API格式转换服务，支持在不同AI平台之间进行API格式转换",
                        version: "1.0.0",
                        supported_platforms: ["openai", "anthropic", "gemini", "openrouter", "groq"],
                        supported_formats: ["openai", "anthropic", "gemini"],
                        usage: {
                            endpoint: "/{platform}/{client_format}",
                            method: "POST",
                            description: "将客户端格式转换为平台格式，或直接转发（如果格式相同）",
                            example: "/openai/anthropic - 使用OpenAI平台，返回Claude格式"
                        },
                        features: [
                            "平台和格式分离设计",
                            "自动格式转换",
                            "支持多种认证方式",
                            "模型名称映射（部分平台）",
                            "请求和响应格式转换",
                            "跨域支持",
                            "流式响应支持"
                        ],
                        authentication: {
                            methods: ["Authorization Bearer", "x-api-key", "x-goog-api-key", "URL参数key"],
                            note: "根据目标平台自动选择合适的认证方式"
                        }
                    }), {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/json; charset=utf-8',
                            'Access-Control-Allow-Origin': '*'
                        }
                    })
                }
            }
            return new Response('Method Not Allowed', { status: 405 })
        }

        const url = new URL(request.url)
        const pathParts = url.pathname.split('/').filter(Boolean)
        
        // 支持两种路由格式：
        // 1. /{platform}/{client_format} - 原始格式
        // 2. /{platform}/{client_format}/v1/messages - Claude Code 格式
        // 3. /{platform}/{client_format}/v1/chat/completions - 其他客户端格式
        if (pathParts.length < 2) {
            return new Response('Invalid path format. Expected: /{platform}/{client_format}', { status: 400 })
        }

        const platform = pathParts[0].toLowerCase()
        const clientFormat = pathParts[1].toLowerCase()
        
        // 检查是否有额外的路径段（如 /v1/messages）
        const hasApiPath = pathParts.length > 2
        if (hasApiPath) {
            // 验证API路径格式
            const apiPath = '/' + pathParts.slice(2).join('/')
            const validApiPaths = ['/v1/messages', '/v1/chat/completions', '/v1beta/models']
            const isValidApiPath = validApiPaths.some(path => apiPath.startsWith(path))
            
            if (!isValidApiPath) {
                return new Response(`Invalid API path: ${apiPath}. Supported paths: ${validApiPaths.join(', ')}`, { status: 404 })
            }
        }

        // 验证平台是否支持
        if (!API_FORMATS[platform]) {
            return new Response('Unsupported platform', { status: 400 })
        }

        // 验证客户端格式是否支持
        const supportedFormats = ['openai', 'anthropic', 'gemini']
        if (!supportedFormats.includes(clientFormat)) {
            return new Response('Unsupported client format', { status: 400 })
        }

        // 获取请求体
        const requestBody = await request.json()
        
        // 获取平台的实际格式
        const platformFormat = API_FORMATS[platform].format
        
        // 获取认证信息
        const authToken = extractAuthToken(request, platformFormat)
        if (!authToken) {
            return new Response('Missing authentication token', { status: 401 })
        }
        
        // 认证和格式验证完成

        // 如果平台格式和客户端格式相同，直接转发
        if (platformFormat === clientFormat) {
            // 对于特定平台，即使格式相同也需要特殊处理
            let finalRequestBody = requestBody
            
            // 对于 groq 平台，限制 max_tokens 不超过 16384
            if (platform === 'groq') {
                finalRequestBody = { ...requestBody }
                if (finalRequestBody.max_tokens && finalRequestBody.max_tokens > 16384) {
                    finalRequestBody.max_tokens = 16384
                }
            }
            
            // 对于 OpenRouter 平台，处理 cache_control
            if (platform === 'openrouter') {
                // 清理所有消息中的 cache_control（无论是否为 Claude 模型）
                finalRequestBody = { ...requestBody }
                finalRequestBody.messages = removeCacheControlFromMessages(finalRequestBody.messages)
                
                // 只有 Claude 模型且有 anthropic-beta 请求头时才添加 cache_control
                const anthropicBeta = request.headers.get('anthropic-beta')
                if (anthropicBeta && anthropicBeta.includes('prompt-caching') && isClaudeModel(requestBody.model)) {
                    finalRequestBody.messages = addCacheControlToMessages(finalRequestBody.messages)
                }
            }
            
            // 直接转发请求到目标平台
            const targetConfig = API_FORMATS[platform]
            const targetUrl = buildTargetUrl(targetConfig, finalRequestBody.model, platformFormat)
            const targetHeaders = buildTargetHeaders(targetConfig, authToken, platformFormat, request)
            
            // 发送请求到目标平台
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: targetHeaders,
                body: JSON.stringify(finalRequestBody)
            })

            if (!response.ok) {
                const errorText = await response.text()
                return new Response(`Platform API Error: ${errorText}`, { 
                    status: response.status 
                })
            }

            // 检查是否为流式响应
            if (requestBody.stream) {
                // 对于流式响应，直接转发响应流
                return new Response(response.body, {
                    status: response.status,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS'
                    }
                })
            }

            const responseData = await response.json()
            
            return new Response(JSON.stringify(responseData), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            })
        }

        // 需要格式转换
        // 1. 将客户端格式转换为平台格式
        const convertedRequest = convertRequest(requestBody, clientFormat, platformFormat, request, platform)
        
        // 2. 应用模型映射（如果平台支持）
        const mappedRequest = applyModelMapping(convertedRequest, platform)
        
        // 3. 构建目标API请求
        const targetConfig = API_FORMATS[platform]
        const targetUrl = buildTargetUrl(targetConfig, mappedRequest.model, platformFormat)
        const targetHeaders = buildTargetHeaders(targetConfig, authToken, platformFormat, request)

        // 4. 发送请求到目标API
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: targetHeaders,
            body: JSON.stringify(mappedRequest)
        })

        if (!response.ok) {
            const errorText = await response.text()
            return new Response(`Platform API Error: ${errorText}`, { 
                status: response.status 
            })
        }

        // 检查是否为流式响应
        if (mappedRequest.stream) {
            // 对于流式响应且需要格式转换的情况
            return await handleStreamResponse(response, platformFormat, clientFormat)
        }

        // 5. 转换响应格式
        const responseData = await response.json()
        const convertedResponse = convertResponse(responseData, platformFormat, clientFormat)

        return new Response(JSON.stringify(convertedResponse), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        })

    } catch (error) {
        return new Response(`Internal Error: ${error.message}`, { status: 500 })
    }
}

/**
 * 应用模型映射（如果平台支持）
 * @param {object} request - 请求对象
 * @param {string} platform - 目标平台
 * @returns {object} - 应用映射后的请求
 */
function applyModelMapping(request, platform) {
    const mappedRequest = { ...request }
    
    // 获取平台的配置
    const platformConfig = API_FORMATS[platform]
    
    // 只有当平台有模型映射配置且请求中有模型时才应用映射
    if (platformConfig && platformConfig.modelMappings && request.model) {
        const mappedModel = platformConfig.modelMappings[request.model]
        if (mappedModel) {
            mappedRequest.model = mappedModel
        }
    }
    
    return mappedRequest
}

/**
 * 提取认证令牌
 * @param {Request} request - 请求对象
 * @param {string} platformFormat - 平台格式
 * @returns {string|null} - 认证令牌
 */
function extractAuthToken(request, platformFormat) {
    // 尝试多种认证方式
    const authHeader = request.headers.get('Authorization')
    const apiKey = request.headers.get('x-api-key')
    const googApiKey = request.headers.get('x-goog-api-key')
    const urlKey = new URL(request.url).searchParams.get('key')
    
    if (authHeader) {
        // 移除Bearer前缀（如果存在）
        return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader
    }
    
    if (apiKey) {
        return apiKey
    }
    
    if (googApiKey) {
        return googApiKey
    }
    
    if (urlKey) {
        return urlKey
    }
    
    return null
}

/**
 * 构建目标API的URL
 * @param {object} config - API配置
 * @param {string} model - 模型名称
 * @param {string} format - API格式
 * @returns {string} - 目标URL
 */
function buildTargetUrl(config, model, format) {
    if (format === 'gemini') {
        // 对于 Gemini，需要从模型名称中提取实际的模型标识
        const actualModel = model.includes('/') ? model.split('/')[1] : model
        return `${config.baseUrl}${config.endpoint.replace('{model}', actualModel)}`
    }
    return `${config.baseUrl}${config.endpoint}`
}

/**
 * 构建目标API的请求头
 * @param {object} config - API配置
 * @param {string} token - 认证令牌
 * @param {string} format - API格式
 * @param {Request} originalRequest - 原始请求对象，用于获取额外的请求头
 * @returns {object} - 请求头
 */
function buildTargetHeaders(config, token, format, originalRequest = null) {
    const headers = {}
    
    for (const [key, value] of Object.entries(config.headers)) {
        if (value === '{token}') {
            // 检查是否是 Authorization 头，如果是则添加 Bearer 前缀
            if (key === 'Authorization') {
                headers[key] = `Bearer ${token}`
            } else {
                headers[key] = token
            }
        } else if (value.includes('{token}')) {
            // 替换 {token} 占位符
            headers[key] = value.replace('{token}', token)
        } else if (format === 'gemini' && key === 'x-goog-api-key') {
            headers[key] = token
        } else {
            headers[key] = value
        }
    }
    
    // 对于 Anthropic 格式，添加额外的请求头支持
    if (format === 'anthropic' && originalRequest) {
        const anthropicBeta = originalRequest.headers.get('anthropic-beta')
        if (anthropicBeta) {
            headers['anthropic-beta'] = anthropicBeta
        }
        
        const cacheControl = originalRequest.headers.get('cache-control')
        if (cacheControl) {
            headers['cache-control'] = cacheControl
        }
    }
    
    return headers
}

/**
 * 转换请求格式
 * @param {object} requestBody - 原始请求体
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 * @param {Request} originalRequest - 原始请求对象
 * @param {string} platform - 目标平台
 * @returns {object} - 转换后的请求体
 */
function convertRequest(requestBody, sourceFormat, targetFormat, originalRequest = null, platform = null) {
    // 首先统一转换为标准格式
    const standardRequest = toStandardFormat(requestBody, sourceFormat)
    
    // 然后从标准格式转换为目标格式
    return fromStandardFormat(standardRequest, targetFormat, originalRequest, platform)
}

/**
 * 转换为标准格式
 * @param {object} request - 原始请求
 * @param {string} sourceFormat - 源格式
 * @returns {object} - 标准格式请求
 */
function toStandardFormat(request, sourceFormat) {
    const standard = {
        messages: [],
        model: request.model || '',
        max_tokens: request.max_tokens || 2048,
        temperature: request.temperature || 0.7,
        stream: request.stream || false
    }

    switch (sourceFormat) {
        case 'openai':
        case 'openrouter':
            standard.messages = request.messages || []
            standard.model = request.model || ''
            standard.max_tokens = request.max_tokens || 2048
            standard.temperature = request.temperature || 0.7
            standard.stream = request.stream || false
            break

        case 'anthropic':
            standard.messages = request.messages || []
            standard.model = request.model || ''
            standard.max_tokens = request.max_tokens || 2048
            standard.temperature = request.temperature || 0.7
            standard.stream = request.stream || false
            // Claude特有的系统消息处理
            if (request.system) {
                standard.system = request.system
            }
            break

        case 'gemini':
            // Gemini格式转换
            if (request.contents) {
                standard.messages = request.contents.map(content => ({
                    role: content.role === 'user' ? 'user' : 'assistant',
                    content: content.parts.map(part => part.text).join('')
                }))
            }
            if (request.generationConfig) {
                standard.max_tokens = request.generationConfig.maxOutputTokens || 2048
                standard.temperature = request.generationConfig.temperature || 0.7
            }
            // 从请求内容中推断模型
            if (!standard.model) {
                standard.model = 'gemini-pro' // 默认模型
            }
            break
    }

    return standard
}

/**
 * 检查是否为 Claude 模型
 * @param {string} model - 模型名称
 * @returns {boolean} - 是否为 Claude 模型
 */
function isClaudeModel(model) {
    if (!model) return false
    const modelLower = model.toLowerCase()
    return modelLower.includes('claude') || modelLower.includes('anthropic')
}

/**
 * 从标准格式转换为目标格式
 * @param {object} standard - 标准格式请求
 * @param {string} targetFormat - 目标格式
 * @param {Request} originalRequest - 原始请求对象，用于获取额外信息
 * @param {string} platform - 目标平台
 * @returns {object} - 目标格式请求
 */
function fromStandardFormat(standard, targetFormat, originalRequest = null, platform = null) {
    switch (targetFormat) {
        case 'openai':
        case 'openrouter':
            const openaiRequest = {
                model: standard.model,
                messages: standard.messages,
                max_tokens: standard.max_tokens,
                temperature: standard.temperature,
                stream: standard.stream
            }
            
            // 对于 groq 平台，限制 max_tokens 不超过 16384
            if (platform === 'groq') {
                // groq 平台的 max_tokens 限制为 16384
                openaiRequest.max_tokens = Math.min(openaiRequest.max_tokens, 16384)
            }
            
            // 对于 OpenRouter 平台，根据模型类型处理 cache_control
            if (platform === 'openrouter') {
                // 清理所有消息中的 cache_control（无论是否为 Claude 模型）
                openaiRequest.messages = removeCacheControlFromMessages(openaiRequest.messages)
                
                // 只有 Claude 模型且有 anthropic-beta 请求头时才添加 cache_control
                if (originalRequest) {
                    const anthropicBeta = originalRequest.headers.get('anthropic-beta')
                    if (anthropicBeta && anthropicBeta.includes('prompt-caching') && isClaudeModel(standard.model)) {
                        openaiRequest.messages = addCacheControlToMessages(openaiRequest.messages)
                    }
                }
            }
            
            return openaiRequest

        case 'anthropic':
            const anthropicRequest = {
                model: standard.model,
                messages: standard.messages,
                max_tokens: standard.max_tokens,
                temperature: standard.temperature,
                stream: standard.stream
            }
            
            // 处理系统消息
            if (standard.system) {
                anthropicRequest.system = standard.system
            } else {
                // 如果有系统消息在messages中，提取出来
                const systemMessage = standard.messages.find(msg => msg.role === 'system')
                if (systemMessage) {
                    anthropicRequest.system = systemMessage.content
                    anthropicRequest.messages = standard.messages.filter(msg => msg.role !== 'system')
                }
            }
            
            return anthropicRequest

        case 'gemini':
            const contents = standard.messages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }))

            return {
                contents: contents,
                generationConfig: {
                    maxOutputTokens: standard.max_tokens,
                    temperature: standard.temperature
                }
            }

        default:
            return standard
    }
}

/**
 * 为消息添加 cache_control 支持
 * @param {Array} messages - 消息数组
 * @returns {Array} - 添加了 cache_control 的消息数组
 */
function addCacheControlToMessages(messages) {
    if (!messages || messages.length === 0) {
        return messages
    }
    
    // 复制消息数组
    const modifiedMessages = [...messages]
    
    // 为最后一条用户消息添加 cache_control
    for (let i = modifiedMessages.length - 1; i >= 0; i--) {
        const message = modifiedMessages[i]
        if (message.role === 'user') {
            // 如果内容是字符串，转换为数组格式
            if (typeof message.content === 'string') {
                modifiedMessages[i] = {
                    ...message,
                    content: [
                        {
                            type: 'text',
                            text: message.content,
                            cache_control: {
                                type: 'ephemeral'
                            }
                        }
                    ]
                }
            } else if (Array.isArray(message.content)) {
                // 如果内容是数组，为最后一个文本部分添加 cache_control
                const content = [...message.content]
                const lastTextIndex = content.length - 1
                if (lastTextIndex >= 0 && content[lastTextIndex].type === 'text') {
                    content[lastTextIndex] = {
                        ...content[lastTextIndex],
                        cache_control: {
                            type: 'ephemeral'
                        }
                    }
                }
                modifiedMessages[i] = {
                    ...message,
                    content: content
                }
            }
            break
        }
    }
    
    return modifiedMessages
}

/**
 * 移除消息中的 cache_control
 * @param {Array} messages - 消息数组
 * @returns {Array} - 移除了 cache_control 的消息数组
 */
function removeCacheControlFromMessages(messages) {
    if (!messages || messages.length === 0) {
        return messages
    }
    
    return messages.map(message => {
        // 如果 content 是字符串，直接返回
        if (typeof message.content === 'string') {
            return message
        }
        
        // 如果 content 是数组，处理每个部分
        if (Array.isArray(message.content)) {
            const cleanContent = message.content.map(part => {
                // 创建一个新对象，排除 cache_control 属性
                const { cache_control, ...cleanPart } = part
                return cleanPart
            })
            
            return {
                ...message,
                content: cleanContent
            }
        }
        
        // 其他情况直接返回
        return message
    })
}

/**
 * 转换响应格式
 * @param {object} response - 原始响应
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 转换后的响应
 */
function convertResponse(response, sourceFormat, targetFormat) {
    // 首先转换为标准格式
    const standardResponse = responseToStandardFormat(response, sourceFormat)
    
    // 然后从标准格式转换为目标格式
    return responseFromStandardFormat(standardResponse, targetFormat)
}

/**
 * 响应转换为标准格式
 * @param {object} response - 原始响应
 * @param {string} sourceFormat - 源格式
 * @returns {object} - 标准格式响应
 */
function responseToStandardFormat(response, sourceFormat) {
    const standard = {
        id: '',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: '',
        choices: [],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        }
    }

    switch (sourceFormat) {
        case 'openai':
        case 'openrouter':
            return response // OpenAI格式就是标准格式

        case 'anthropic':
            standard.id = response.id || ''
            standard.model = response.model || ''
            standard.choices = [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: response.content?.[0]?.text || ''
                },
                finish_reason: response.stop_reason || 'stop'
            }]
            standard.usage = {
                prompt_tokens: response.usage?.input_tokens || 0,
                completion_tokens: response.usage?.output_tokens || 0,
                total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
            }
            break

        case 'gemini':
            standard.id = 'gemini-' + Date.now()
            standard.model = 'gemini'
            if (response.candidates && response.candidates.length > 0) {
                const candidate = response.candidates[0]
                standard.choices = [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: candidate.content?.parts?.[0]?.text || ''
                    },
                    finish_reason: candidate.finishReason?.toLowerCase() || 'stop'
                }]
            }
            // Gemini通常不返回token使用情况
            break
    }

    return standard
}

/**
 * 从标准格式转换为目标响应格式
 * @param {object} standard - 标准格式响应
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 目标格式响应
 */
function responseFromStandardFormat(standard, targetFormat) {
    switch (targetFormat) {
        case 'openai':
        case 'openrouter':
            return standard

        case 'anthropic':
            const choice = standard.choices[0]
            return {
                id: standard.id,
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: choice?.message?.content || ''
                }],
                model: standard.model,
                stop_reason: choice?.finish_reason || 'end_turn',
                usage: {
                    input_tokens: standard.usage.prompt_tokens,
                    output_tokens: standard.usage.completion_tokens
                }
            }

        case 'gemini':
            const geminiChoice = standard.choices[0]
            return {
                candidates: [{
                    content: {
                        parts: [{
                            text: geminiChoice?.message?.content || ''
                        }],
                        role: 'model'
                    },
                    finishReason: geminiChoice?.finish_reason?.toUpperCase() || 'STOP',
                    index: 0
                }]
            }

        default:
            return standard
    }
}

/**
 * 处理流式响应并进行格式转换
 * @param {Response} response - 原始流式响应
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 * @returns {Response} - 转换后的流式响应
 */
async function handleStreamResponse(response, sourceFormat, targetFormat) {
    const { readable, writable } = new TransformStream()
    
    // 异步处理流式数据
    processStreamData(response.body, writable.getWriter(), sourceFormat, targetFormat)
    
    return new Response(readable, {
        status: response.status,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
        }
    })
}

/**
 * 处理流式数据转换
 * @param {ReadableStream} inputStream - 输入流
 * @param {WritableStreamDefaultWriter} writer - 输出写入器
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 */
async function processStreamData(inputStream, writer, sourceFormat, targetFormat) {
    const reader = inputStream.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            
            // 按行处理数据
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // 保留最后一行（可能不完整）
            
            for (const line of lines) {
                await processStreamLine(line, writer, sourceFormat, targetFormat)
            }
        }
        
        // 处理剩余的缓冲区数据
        if (buffer) {
            await processStreamLine(buffer, writer, sourceFormat, targetFormat)
        }
        
    } catch (error) {
        console.error('Stream processing error:', error)
        await writer.write(new TextEncoder().encode(`data: {"error": "Stream processing error: ${error.message}"}\n\n`))
    } finally {
        await writer.close()
    }
}

/**
 * 处理单行流式数据
 * @param {string} line - 单行数据
 * @param {WritableStreamDefaultWriter} writer - 输出写入器
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 */
async function processStreamLine(line, writer, sourceFormat, targetFormat) {
    try {
        // 空行直接转发
        if (line.trim() === '') {
            await writer.write(new TextEncoder().encode('\n'))
            return
        }
        
        // 解析 Server-Sent Events 格式
        if (line.startsWith('data: ')) {
            const dataStr = line.substring(6) // 移除 'data: ' 前缀
            
            // 跳过特殊消息
            if (dataStr === '[DONE]' || dataStr.trim() === '') {
                await writer.write(new TextEncoder().encode(line + '\n\n'))
                return
            }
            
            try {
                const data = JSON.parse(dataStr)
                
                // 转换数据格式
                const convertedData = convertStreamChunk(data, sourceFormat, targetFormat)
                
                // 写入转换后的数据
                const outputLine = `data: ${JSON.stringify(convertedData)}\n\n`
                await writer.write(new TextEncoder().encode(outputLine))
                
            } catch (parseError) {
                // 如果无法解析 JSON，直接转发
                await writer.write(new TextEncoder().encode(line + '\n\n'))
            }
        } else {
            // 非数据行直接转发（如 event:, id:, retry: 等）
            await writer.write(new TextEncoder().encode(line + '\n'))
        }
        
    } catch (error) {
        console.error('Line processing error:', error)
        await writer.write(new TextEncoder().encode(`data: {"error": "Line processing error: ${error.message}"}\n\n`))
    }
}

/**
 * 转换流式数据块
 * @param {object} chunk - 原始数据块
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 转换后的数据块
 */
function convertStreamChunk(chunk, sourceFormat, targetFormat) {
    // 如果格式相同，直接返回
    if (sourceFormat === targetFormat) {
        return chunk
    }
    
    // 首先转换为标准格式
    const standardChunk = streamChunkToStandardFormat(chunk, sourceFormat)
    
    // 然后转换为目标格式
    return streamChunkFromStandardFormat(standardChunk, targetFormat)
}

/**
 * 将流式数据块转换为标准格式
 * @param {object} chunk - 原始数据块
 * @param {string} sourceFormat - 源格式
 * @returns {object} - 标准格式数据块
 */
function streamChunkToStandardFormat(chunk, sourceFormat) {
    const standard = {
        id: chunk.id || '',
        object: 'chat.completion.chunk',
        created: chunk.created || Math.floor(Date.now() / 1000),
        model: chunk.model || '',
        choices: []
    }
    
    switch (sourceFormat) {
        case 'openai':
        case 'openrouter':
            return chunk // OpenAI 格式就是标准格式
            
        case 'anthropic':
            // Claude 流式格式转换
            if (chunk.type === 'content_block_delta') {
                standard.choices = [{
                    index: 0,
                    delta: {
                        content: chunk.delta?.text || ''
                    },
                    finish_reason: null
                }]
            } else if (chunk.type === 'message_stop') {
                standard.choices = [{
                    index: 0,
                    delta: {},
                    finish_reason: 'stop'
                }]
            }
            break
            
        case 'gemini':
            // Gemini 流式格式转换
            if (chunk.candidates && chunk.candidates.length > 0) {
                const candidate = chunk.candidates[0]
                standard.choices = [{
                    index: 0,
                    delta: {
                        content: candidate.content?.parts?.[0]?.text || ''
                    },
                    finish_reason: candidate.finishReason?.toLowerCase() || null
                }]
            }
            break
    }
    
    return standard
}

/**
 * 从标准格式转换为目标流式格式
 * @param {object} standard - 标准格式数据块
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 目标格式数据块
 */
function streamChunkFromStandardFormat(standard, targetFormat) {
    switch (targetFormat) {
        case 'openai':
        case 'openrouter':
            return standard
            
        case 'anthropic':
            const choice = standard.choices[0]
            if (choice?.delta?.content) {
                return {
                    type: 'content_block_delta',
                    index: 0,
                    delta: {
                        type: 'text_delta',
                        text: choice.delta.content
                    }
                }
            } else if (choice?.finish_reason) {
                return {
                    type: 'message_stop'
                }
            }
            break
            
        case 'gemini':
            const geminiChoice = standard.choices[0]
            if (geminiChoice?.delta?.content) {
                return {
                    candidates: [{
                        content: {
                            parts: [{
                                text: geminiChoice.delta.content
                            }],
                            role: 'model'
                        },
                        finishReason: geminiChoice.finish_reason?.toUpperCase() || null,
                        index: 0
                    }]
                }
            }
            break
    }
    
    return standard
}
