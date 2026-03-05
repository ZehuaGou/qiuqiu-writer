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

  // 只统计汉字、英文字母和数字，去除空格、换行、标点等
  const matches = text.match(/[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g);
  return matches ? matches.length : 0;
}
