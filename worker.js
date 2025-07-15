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
        endpoint: '/v1/chat/completions'
    },
    claude: {
        baseUrl: 'https://api.anthropic.com',
        headers: {
            'x-api-key': '{token}',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        },
        endpoint: '/v1/messages'
    },
    gemini: {
        baseUrl: 'https://generativelanguage.googleapis.com',
        headers: {
            'Content-Type': 'application/json'
        },
        endpoint: '/v1beta/models/{model}:generateContent'
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
            // Claude 模型映射
            'claude-3-sonnet-20240229': 'anthropic/claude-3-sonnet-20240229',
            'claude-3-opus-20240229': 'anthropic/claude-3-opus-20240229',
            'claude-3-haiku-20240307': 'anthropic/claude-3-haiku-20240307',
            'claude-3.5-sonnet-20240620': 'anthropic/claude-3.5-sonnet-20240620',
            'claude-sonnet-4': 'anthropic/claude-sonnet-4',
            
            // OpenAI 模型映射
            'gpt-4': 'openai/gpt-4',
            'gpt-4-turbo': 'openai/gpt-4-turbo',
            'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
            'gpt-4o': 'openai/gpt-4o',
            
            // Gemini 模型映射
            'gemini-pro': 'google/gemini-pro',
            'gemini-pro-vision': 'google/gemini-pro-vision',
            'gemini-1.5-pro': 'google/gemini-1.5-pro',
            
            // 其他模型映射
            'llama-3-70b': 'meta-llama/llama-3-70b-instruct',
            'llama-3-8b': 'meta-llama/llama-3-8b-instruct'
        }
    }
}

/**
 * 处理传入的请求并进行格式转换
 * @param {Request} request - 传入的 HTTP 请求
 * @returns {Promise<Response>} - 返回转换后的响应
 */
async function handleRequest(request) {
    try {
        if (request.method !== 'POST') {
            // 添加对根路由的GET请求处理
            if (request.method === 'GET') {
                const url = new URL(request.url)
                if (url.pathname === '/') {
                    return new Response(JSON.stringify({
                        name: "API格式转换服务",
                        description: "这是一个通用的AI API格式转换服务，支持在不同AI平台之间进行API格式转换",
                        version: "1.0.0",
                        supported_platforms: ["openai", "claude", "gemini", "openrouter"],
                        usage: {
                            endpoint: "/{source_platform}/{target_platform}",
                            method: "POST",
                            description: "将源平台的API格式转换为目标平台的格式",
                            example: "/openai/claude - 将OpenAI格式转换为Claude格式"
                        },
                        features: [
                            "自动检测源API格式",
                            "支持多种认证方式",
                            "模型名称映射（OpenRouter）",
                            "请求和响应格式转换",
                            "跨域支持"
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
        
        // 解析路径: /source_platform/target_platform
        if (pathParts.length < 2) {
            return new Response('Invalid path format. Expected: /source_platform/target_platform', { status: 400 })
        }

        const sourcePlatform = pathParts[0].toLowerCase()
        const targetPlatform = pathParts[1].toLowerCase()

        // 验证平台是否支持
        if (!API_FORMATS[sourcePlatform] || !API_FORMATS[targetPlatform]) {
            return new Response('Unsupported API platform', { status: 400 })
        }

        // 获取请求体
        const requestBody = await request.json()
        
        // 自动判断源格式（如果与URL中的源平台不匹配，以实际格式为准）
        const actualSourceFormat = detectSourceFormat(requestBody, sourcePlatform)
        
        // 获取认证信息
        const authToken = extractAuthToken(request, actualSourceFormat)
        if (!authToken) {
            return new Response('Missing authentication token', { status: 401 })
        }

        // 转换请求格式
        const convertedRequest = convertRequest(requestBody, actualSourceFormat, targetPlatform)
        
        // 应用模型映射（仅在目标平台是 OpenRouter 时）
        const mappedRequest = applyModelMapping(convertedRequest, targetPlatform)
        
        // 构建目标API请求
        const targetConfig = API_FORMATS[targetPlatform]
        const targetUrl = buildTargetUrl(targetConfig, mappedRequest.model, targetPlatform)
        const targetHeaders = buildTargetHeaders(targetConfig, authToken, targetPlatform)

        // 发送请求到目标API
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: targetHeaders,
            body: JSON.stringify(mappedRequest)
        })

        if (!response.ok) {
            const errorText = await response.text()
            return new Response(`Target API Error: ${errorText}`, { 
                status: response.status 
            })
        }

        // 转换响应格式
        const responseData = await response.json()
        const convertedResponse = convertResponse(responseData, targetPlatform, actualSourceFormat)

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
 * 自动检测源格式
 * @param {object} requestBody - 请求体
 * @param {string} platformHint - 平台提示
 * @returns {string} - 检测到的源格式
 */
function detectSourceFormat(requestBody, platformHint) {
    // 检测 Gemini 格式
    if (requestBody.contents && Array.isArray(requestBody.contents)) {
        return 'gemini'
    }
    
    // 检测 Claude 格式
    if (requestBody.system || (requestBody.messages && !requestBody.model)) {
        return 'claude'
    }
    
    // 检测 OpenAI 格式
    if (requestBody.messages && requestBody.model) {
        return 'openai'
    }
    
    // 如果无法自动检测，使用平台提示
    return platformHint
}

/**
 * 应用模型映射（仅在目标平台是 OpenRouter 时）
 * @param {object} request - 请求对象
 * @param {string} targetPlatform - 目标平台
 * @returns {object} - 应用映射后的请求
 */
function applyModelMapping(request, targetPlatform) {
    const mappedRequest = { ...request }
    
    // 获取目标平台的配置
    const targetConfig = API_FORMATS[targetPlatform]
    
    // 只有当目标平台有模型映射配置且请求中有模型时才应用映射
    if (targetConfig && targetConfig.modelMappings && request.model) {
        const mappedModel = targetConfig.modelMappings[request.model]
        if (mappedModel) {
            mappedRequest.model = mappedModel
        }
    }
    
    return mappedRequest
}

/**
 * 提取认证令牌
 * @param {Request} request - 请求对象
 * @param {string} sourceFormat - 源格式
 * @returns {string|null} - 认证令牌
 */
function extractAuthToken(request, sourceFormat) {
    // 尝试多种认证方式
    const authHeader = request.headers.get('Authorization')
    const apiKey = request.headers.get('x-api-key')
    const googApiKey = request.headers.get('x-goog-api-key')
    const urlKey = new URL(request.url).searchParams.get('key')
    
    if (authHeader) {
        return authHeader.replace('Bearer ', '')
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
 * @returns {object} - 请求头
 */
function buildTargetHeaders(config, token, format) {
    const headers = {}
    
    for (const [key, value] of Object.entries(config.headers)) {
        if (value === '{token}') {
            headers[key] = token
        } else if (format === 'gemini' && key === 'x-goog-api-key') {
            headers[key] = token
        } else {
            headers[key] = value
        }
    }
    
    return headers
}

/**
 * 转换请求格式
 * @param {object} requestBody - 原始请求体
 * @param {string} sourceFormat - 源格式
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 转换后的请求体
 */
function convertRequest(requestBody, sourceFormat, targetFormat) {
    // 首先统一转换为标准格式
    const standardRequest = toStandardFormat(requestBody, sourceFormat)
    
    // 然后从标准格式转换为目标格式
    return fromStandardFormat(standardRequest, targetFormat)
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

        case 'claude':
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
 * 从标准格式转换为目标格式
 * @param {object} standard - 标准格式请求
 * @param {string} targetFormat - 目标格式
 * @returns {object} - 目标格式请求
 */
function fromStandardFormat(standard, targetFormat) {
    switch (targetFormat) {
        case 'openai':
        case 'openrouter':
            return {
                model: standard.model,
                messages: standard.messages,
                max_tokens: standard.max_tokens,
                temperature: standard.temperature,
                stream: standard.stream
            }

        case 'claude':
            const claudeRequest = {
                model: standard.model,
                messages: standard.messages,
                max_tokens: standard.max_tokens,
                temperature: standard.temperature,
                stream: standard.stream
            }
            
            // 处理系统消息
            if (standard.system) {
                claudeRequest.system = standard.system
            } else {
                // 如果有系统消息在messages中，提取出来
                const systemMessage = standard.messages.find(msg => msg.role === 'system')
                if (systemMessage) {
                    claudeRequest.system = systemMessage.content
                    claudeRequest.messages = standard.messages.filter(msg => msg.role !== 'system')
                }
            }
            
            return claudeRequest

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

        case 'claude':
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

        case 'claude':
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
