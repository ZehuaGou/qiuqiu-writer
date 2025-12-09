/**
 * 拆书分析 API 服务层
 * 基于 SmartReads 的分析逻辑，预留从 memos 后端获取模型服务的接口
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface AnalysisSettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // 预留其他配置项
}

export interface AnalysisProgress {
  text?: string;
  error?: string;
  metadata?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    duration?: number;
    estimated_tokens?: number;
    start_time?: string;
    end_time?: string;
  };
}

/**
 * 获取分析提示词模板
 * 与 SmartReads 的提示词保持一致
 */
export function getAnalysisPrompt(content: string): string {
  return `# 角色
你是一位经验丰富的小说编辑和金牌剧情分析师。你擅长解构故事，洞察每一章节的功能、节奏和情感，并能将其转化为高度结构化的分析报告。

# 任务
我将提供一部小说的部分章节正文。你的任务是通读并深刻理解这些章节，然后逐章进行分析，最终输出一个单一、完整的Markdown格式的章节规划分析表。

# 表格结构与规则
输出的表格必须严格遵循以下8列结构和内容要求：

| 栏目 | 填写指南 |
| :--- | :--- |
| **1. 章节号** | **准确提取**章节标题中的数字（无论是阿拉伯数字还是中文数字），并统一转换为阿拉伯数字。**必须与原文的章节号保持一致**，例如，如果章节标题是"第五十一章"，则此列应填写"51"。 |
| **2. 章节标题** | 准确提取该章节的标题。 |
| **3. 章节核心剧情梗概** | **[摘要能力]** 用2-3句精炼地概括本章的核心事件。必须清晰地回答：**谁？做了什么？导致了什么？** |
| **4. 本章核心功能/目的** | **[分析能力]** 站在作者的角度，分析本章对整个故事的战略意义。例如：**引入核心冲突、塑造主角性格、制造关键误会、为后期剧情埋下伏笔、揭示世界观设定、推动感情线发展**等。 |
| **5. 画面感/镜头序列** | **[视觉化能力]** 想象本章的影视化改编。列出3-5个最关键、最具代表性的视觉画面或镜头。**必须使用JSON数组格式**，例如：\`["主角在雨中奔跑", "反派在暗处微笑的特写", "一个重要信物掉落在地"]\`。 |
| **6. 关键情节点 (Key Points)** | **[结构化能力]** 提炼出本章情节发展的几个关键节点，这些是驱动本章故事前进的骨架。**必须使用JSON数组格式**，例如：\`["主角接到一个神秘电话", "主角与盟友发生争执", "结尾处发现新的线索"]\`。 |
| **7. 本章氛围/情绪** | **[情感洞察能力]** 描述本章带给读者的主要情感体验或整体氛围。**必须使用JSON数组格式**，例如：\`["紧张悬疑", "温馨治愈", "悲伤压抑", "轻松幽默"]\`。 |
| **8. 结尾"钩子" (Hook)** | **[悬念设置能力]** 提炼出章节结尾留给读者的最大悬念、疑问或期待。是什么让读者迫不及待地想看下一章？ |

# 学习范例
为了确保你完全理解任务要求，请参考以下范例：

| 章节号 | 章节标题 | 章节核心剧情梗概 | 本章核心功能/目的 | 画面感/镜头序列 | 关键情节点 (Key Points) | 本章氛围/情绪 | 结尾"钩子" (Hook) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 重逢 | 女主角倪雾带女儿岁岁去医院看病，偶遇主治医生竟是七年前的前男友裴淮聿。他没认出改名换姓且变瘦的她。回家后，岁岁问给她看病的医生叔叔是不是爸爸。 | 引入男女主及核心人物（女儿），建立七年后再遇的核心戏剧冲突，抛出"他没认出她"和"女儿身世"两大悬念。 | \`["诊室门被推开", "裴淮聿戴着金丝眼镜抬头", "倪雾脸色煞白，匆忙戴上口罩", "过去与现在的裴淮聿形象重叠", "女儿仰头问妈妈：那是爸爸吗？"]\` | \`["倪雾与裴淮聿在诊室重逢。", "裴淮聿未认出已改名换姓的倪雾。", "裴淮聿从高中班长电话中听到旧名"程青渺"，情绪波动。", "女儿岁岁直接提问："医生叔叔是爸爸吗？""]\` | \`["震惊", "紧张", "心痛", "昔日回忆的苦涩", "悬念感"]\` | 女儿关于"爸爸"的惊人提问，直接将剧情推向第一个小高潮。 |

# 输出要求
请严格按照上述规则和范例，开始分析我接下来提供的正文，并生成完整的章节分析
**绝对禁止**在你的回答中包含任何Markdown表格之外的内容。
你的回答**必须**以 \`| 章节号 |\` 开头，并以表格的最后一行结束。
不要添加任何介绍、总结、解释或任何其他文字。

以下是小说正文：

${content}`;
}

/**
 * 调用 memos 后端的章节分析 API
 * 
 * @param content 章节内容
 * @param onProgress 进度回调函数
 * @param settings 分析设置
 * @returns 分析结果
 */
export async function analyzeChapterContent(
  content: string,
  onProgress?: (progress: AnalysisProgress) => void,
  settings?: AnalysisSettings
): Promise<string> {
  try {
    console.log('📡 调用后端 AI 分析接口...');
    
    const response = await fetch(`${API_BASE_URL}/ai/analyze-chapter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        prompt: getAnalysisPrompt(content),
        settings: settings || {},
      }),
    });

    if (!response.ok) {
      throw new Error(`API 调用失败: ${response.status} ${response.statusText}`);
    }

    // 处理流式响应 (SSE)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let result = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 解码数据块
      buffer += decoder.decode(value, { stream: true });
      
      // 按行分割
      const lines = buffer.split('\n');
      
      // 保留最后一个不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 处理 SSE 格式: "data: {...}"
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);
            const msgType = parsed.type;

            switch (msgType) {
              case 'start':
                console.log('✅', parsed.message);
                // 传递开始时的元数据
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'chunk':
                // 累积内容
                const chunkContent = parsed.content || '';
                if (chunkContent) {
                  result += chunkContent;
                  onProgress?.({ text: chunkContent });
                  // 调试：每100个字符打印一次
                  if (result.length % 500 === 0) {
                    console.log(`📝 已累积 ${result.length} 字符`);
                  }
                }
                break;
              
              case 'done':
                console.log('✅', parsed.message);
                console.log(`📊 最终内容长度: ${result.length} 字符`);
                // 传递完成时的元数据
                if (parsed.metadata && onProgress) {
                  onProgress({ metadata: parsed.metadata });
                }
                break;
              
              case 'error':
                throw new Error(parsed.message || '分析过程中出错');
              
              default:
                console.warn('未知的消息类型:', msgType, parsed);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== '分析过程中出错') {
              console.warn('解析 SSE 消息失败:', e, 'Line:', data);
            } else {
              throw e;
            }
          }
        }
      }
    }

    if (!result) {
      throw new Error('未收到任何分析结果');
    }

    console.log('✅ 章节分析完成');
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '分析请求失败';
    console.error('❌ 分析失败:', errorMessage);
    onProgress?.({ error: errorMessage });
    throw new Error(errorMessage);
  }
}

/**
 * 批量分析章节组
 * 
 * @param groups 章节组数组
 * @param onFileComplete 单个文件完成回调
 * @param onProgress 进度回调
 * @param settings 分析设置
 */
export async function analyzeMultipleChapterGroups(
  groups: Array<{ name: string; content: string }>,
  onFileComplete?: (
    fileName: string,
    result: string | null,
    index: number,
    total: number,
    error?: string
  ) => void,
  onProgress?: (progress: AnalysisProgress & { fileName?: string }) => void,
  settings?: AnalysisSettings
): Promise<Record<string, { success: boolean; result?: string; error?: string }>> {
  const results: Record<string, { success: boolean; result?: string; error?: string }> = {};

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];

    try {
      onProgress?.({ text: `开始分析 ${group.name}...`, fileName: group.name });

      const result = await analyzeChapterContent(
        group.content,
        (progress) => onProgress?.({ ...progress, fileName: group.name }),
        settings
      );

      results[group.name] = {
        success: true,
        result,
      };

      onFileComplete?.(group.name, result, i + 1, groups.length);

      // 文件间添加延迟，避免 API 限制
      if (i < groups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '分析失败';
      results[group.name] = {
        success: false,
        error: errorMessage,
      };

      onFileComplete?.(group.name, null, i + 1, groups.length, errorMessage);
    }
  }

  return results;
}

/**
 * 测试 API 连接
 * 连接 memos 后端检查 AI 服务是否可用
 */
export async function testAPIConnection(): Promise<{
  success: boolean;
  message: string;
  models?: string[];
}> {
  try {
    console.log('🔍 测试 AI 服务连接...');
    
    const response = await fetch(`${API_BASE_URL}/ai/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const result = await response.json();
      const data = result.data;
      
      console.log('✅ AI 服务连接成功', data);
      
      return {
        success: data.status === 'healthy',
        message: data.status === 'healthy' 
          ? `AI 服务正常运行，可用模型: ${data.models?.length || 0} 个` 
          : 'AI 服务不可用',
        models: data.models,
      };
    } else {
      const errorText = await response.text();
      console.error('❌ 连接失败:', response.status, errorText);
      return {
        success: false,
        message: `连接失败: ${response.status} ${response.statusText}`,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '连接失败';
    console.error('❌ API 连接错误:', errorMessage);
    return {
      success: false,
      message: errorMessage,
    };
  }
}

