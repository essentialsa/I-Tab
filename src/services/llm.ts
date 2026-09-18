import {
  ClassificationResult,
  TabbitGroup,
  LLMConfig,
  TabItem,
  TabbitColorName,
} from '../types';

const ALLOWED_COLORS: TabbitColorName[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'cyan',
];

function sanitizeJson(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  // 稳健提取最外层 JSON 对象，抵御模型前后多余文字干扰
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    cleaned = match[0];
  }
  return cleaned.trim();
}

export async function testConnection(
  config: LLMConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.apiKey) {
    return { success: false, message: '请先填写 API Key' };
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Reply with the single word: "OK"',
          },
        ],
        max_tokens: 10,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        message: `请求失败 (${res.status}): ${errText.slice(0, 100)}`,
      };
    }

    return { success: true, message: '连接成功！大模型接口响应正常' };
  } catch (err: any) {
    return { success: false, message: `网络或地址异常: ${err.message || err}` };
  }
}

export async function classifyTabs(
  config: LLMConfig,
  unassignedTabs: TabItem[],
  existingGroups: TabbitGroup[]
): Promise<ClassificationResult> {
  if (unassignedTabs.length === 0) {
    return { appendToExisting: [], newGroups: [] };
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  // 1. 拦截思考模型，保证极速体验：
  // 若用户配置了 deepseek-reasoner 或 r1 深度思考模型，其思维链会导致 10~30 秒卡顿
  // 标签页归类属于基础语义结构化任务，毫秒级快速模型才是最佳选择
  let effectiveModel = (config.model || 'deepseek-chat').trim();
  if (
    effectiveModel.toLowerCase().includes('reasoner') ||
    effectiveModel.toLowerCase().includes('r1')
  ) {
    console.warn(
      `[I-Tab] 检测到思考模型 "${effectiveModel}"，自动切换为高速对话模型 deepseek-chat 以确保秒级响应。`
    );
    effectiveModel = 'deepseek-chat';
  }

  // 2. 精炼 Payload：保留关键语义信息，标题保留 80 字符以避免中文字符截断关键主题
  const tabsInput = unassignedTabs.map((t) => ({
    id: t.id,
    title: (t.title || t.domain).slice(0, 80),
    domain: t.domain,
  }));

  const existingInput = existingGroups.map((g) => ({
    id: g.id,
    title: g.title,
    emoji: g.emoji,
  }));

  const systemPrompt = `你是一个专业的浏览器标签页智能语义整理助手。你的任务是根据标签页的【域名】与【网页标题】，进行精准、符合人类直觉的场景聚类与分组。

【核心分类与命名规范】
1. 分组名称必须统一采用【四字中文短语】（通俗易懂、场景清晰），典型场景参考：
   - 影音娱乐（视频网站、音乐电台、游戏动漫、直播流媒体）
   - 技术开发（代码仓库、技术问答社区、官方开发者文档、API手册）
   - 人工智能（大模型对话、AI 绘图、AI 效率工具、算法前沿）
   - 日常办公（文档协同、电子邮箱、云盘存储、日历看板）
   - 知识阅读（深度博客、资讯知乎、百科全书、学习笔记）
   - 社交通讯（微博、微信、Twitter/X、交流论坛）
   - 电商购物（淘宝、京东、拼多多、海淘网购）
   - 设计资源（UI设计、矢量图标、图库素材、灵感社区）
   - 常用工具（在线转换工具、网速测试、翻译查询、日常轻工具）
2. 为每个新分组选择 1 个贴切的 Emoji 与 1 个主题色。colorName 必须选自: [${ALLOWED_COLORS.join(', ')}]。

【高优先级分类铁律（防止误分类）】
1. 知名视频与音频流媒体网站（如 bilibili.com、youtube.com、iqiyi.com、youku.com、v.qq.com、music.163.com、douyin.com 等）：
   - 其第一场景属性绝对为音视频平台！无论其视频标题中含有何种关键词（哪怕含有编程教学、软件测评或科技开箱），必须优先归入「影音娱乐」或「视听娱乐」，绝对禁止归入「技术开发」！
2. 「技术开发」分类仅限于：
   - 代码托管平台（如 github.com、gitee.com、gitlab.com）
   - 技术社区与问答（如 stackoverflow.com、juejin.cn、v2ex.com、segmentfault.com）
   - 官方开发者文档与语言手册（如 developer.mozilla.org、react.dev、vuejs.org 等）
3. 严禁收纳或创建空白页（New Tab、about:blank），若输入中存在，直接跳过或归入「常用工具」，绝不单独创建重复分组。

【聚类吸附规则】
1. 严禁跨领域强行吸附 (appendToExisting)：
   - 只有当网页与已有分组 (existingGroups) 场景高度吻合时，才可吸附加入已有组。
   - 严禁把娱乐、视频、社交类网页硬塞进已有的「技术开发」或「日常办公」分组中！如无匹配分组，必须在 newGroups 中新建分组。
2. 弹性分组策略 (newGroups)：
   - 依据待分类标签页的数量灵活新建：若只有 1~3 个标签页，归入 1~2 个最贴切的分组即可，切勿强行凑数拆分。
3. 严格完整：所有输入的有效标签页必须且只能分配到一个分组中，严禁遗漏，且同一个 tabId 不得分配至多个组。

【输出格式】
直接输出纯 JSON 对象，严禁包含任何 Markdown 标记或解释文字：
{
  "appendToExisting": [
    { "tabId": 123, "groupId": "已有分组ID" }
  ],
  "newGroups": [
    {
      "title": "影音娱乐",
      "emoji": "🎬",
      "colorName": "pink",
      "tabIds": [456]
    }
  ]
}`;

  const userContent = JSON.stringify({
    existingGroups: existingInput,
    unassignedTabs: tabsInput,
  });

  const requestBody: Record<string, any> = {
    model: effectiveModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 0.1, // 0.1 兼顾极速解码稳定性与语义分类灵活性
  };

  // 3. 显式禁用大模型深度思考/思维链 (Chain of Thought)
  // 针对阿里通义千问 (DashScope) 禁用思考模式
  if (config.provider === 'qwen' || config.baseUrl.includes('aliyuncs.com')) {
    requestBody.enable_thinking = false;
  }
  // 针对 DeepSeek 官方接口显式关闭 thinking
  if (config.provider === 'deepseek' || config.baseUrl.includes('deepseek')) {
    requestBody.thinking = { type: 'disabled' };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey.trim()}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`大模型接口异常 (${response.status}): ${errorBody.slice(0, 150)}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content || '{}';
  const cleanJson = sanitizeJson(rawText);

  try {
    const parsed = JSON.parse(cleanJson);
    return {
      appendToExisting: Array.isArray(parsed.appendToExisting)
        ? parsed.appendToExisting.map((a: any) => ({
            tabId: Number(a.tabId),
            groupId: String(a.groupId),
          }))
        : [],
      newGroups: Array.isArray(parsed.newGroups)
        ? parsed.newGroups.map((g: any) => ({
            title: String(g.title || '常用网页'),
            emoji: String(g.emoji || '🗂️'),
            colorName: ALLOWED_COLORS.includes(g.colorName)
              ? g.colorName
              : 'blue',
            tabIds: Array.isArray(g.tabIds) ? g.tabIds.map(Number) : [],
          }))
        : [],
    };
  } catch (parseErr) {
    console.error('Failed to parse LLM JSON output:', cleanJson, parseErr);
    throw new Error('大模型返回内容无法被解析为合法 JSON');
  }
}
