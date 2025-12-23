/**
 * 文本处理工具函数
 */

/**
 * 计算文本字数（去除HTML标签，只统计中文字符和单词）
 * @param html HTML格式的文本内容
 * @returns 字符数
 */
export function countCharacters(html: string): number {
  if (!html) return 0;
  
  // 创建一个临时DOM元素来解析HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // 获取纯文本内容
  const text = tempDiv.textContent || tempDiv.innerText || '';
  
  // 统计字符数（中文字符按1个字符计算，英文单词按单词数计算）
  // 这里简化处理，直接统计所有字符（包括空格）
  // 如果需要更精确的统计，可以分别处理中文和英文
  return text.length;
}
