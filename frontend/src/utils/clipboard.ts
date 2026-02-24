/**
 * 复制文本到剪贴板
 * 提供了 navigator.clipboard.writeText 的回退方案，以支持旧版浏览器和移动端
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 优先使用最新的 Clipboard API
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Clipboard API copy failed: ', err);
      // 如果 Clipboard API 失败，尝试回退方案
    }
  }

  // 回退方案：使用隐藏的 textarea 和 document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    
    // 确保 textarea 在屏幕外且不可见
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    // 对于 iOS，可能需要更复杂的选中逻辑
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textArea.setSelectionRange(0, 999999);
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    
    if (selection) {
      selection.removeAllRanges();
    }
    
    return successful;
  } catch (err) {
    console.error('Fallback copy failed: ', err);
    return false;
  }
}
