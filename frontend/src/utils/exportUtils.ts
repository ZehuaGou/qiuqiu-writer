/**
 * 导出工具函数
 * 支持导出作品为 Text、Word、PDF 格式
 */

import { chaptersApi, type Chapter } from './chaptersApi';
import { worksApi, type Work } from './worksApi';

/**
 * 从 HTML 内容中提取纯文本
 */
function htmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

/**
 * 导出为 Text 格式
 */
export async function exportAsText(work: Work): Promise<void> {
  try {
    // 获取所有章节
    const chaptersResponse = await chaptersApi.listChapters({
      work_id: work.id,
      size: 1000, // 获取所有章节
      sort_by: 'chapter_number',
      sort_order: 'asc',
    });

    const chapters = chaptersResponse.chapters;

    // 构建文本内容
    let content = `${work.title}\n`;
    if (work.description) {
      content += `\n${work.description}\n`;
    }
    content += `\n${'='.repeat(50)}\n\n`;

    // 获取每个章节的内容
    for (const chapter of chapters) {
      try {
        // 尝试从 ShareDB 获取最新内容
        const docResponse = await chaptersApi.getChapterDocument(chapter.id);
        let chapterContent = '';
        
        if (docResponse.content && typeof docResponse.content === 'object') {
          chapterContent = docResponse.content.content || '';
        } else if (typeof docResponse.content === 'string') {
          chapterContent = docResponse.content;
        }

        // 如果没有内容，尝试从章节详情获取
        if (!chapterContent) {
          const chapterDetail = await chaptersApi.getChapter(chapter.id);
          chapterContent = chapterDetail.content || '';
        }

        // 将 HTML 转换为纯文本
        const textContent = htmlToText(chapterContent);

        content += `第 ${chapter.chapter_number} 章 ${chapter.title}\n`;
        content += `${'-'.repeat(50)}\n\n`;
        content += `${textContent}\n\n\n`;
      } catch (err) {
        console.warn(`获取章节 ${chapter.id} 内容失败:`, err);
        content += `第 ${chapter.chapter_number} 章 ${chapter.title}\n`;
        content += `${'-'.repeat(50)}\n\n`;
        content += `[内容获取失败]\n\n\n`;
      }
    }

    // 创建并下载文件
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${work.title}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出 Text 失败:', error);
    throw new Error('导出失败，请稍后重试');
  }
}

/**
 * 导出为 Word 格式
 */
export async function exportAsWord(work: Work): Promise<void> {
  try {
    // 获取所有章节
    const chaptersResponse = await chaptersApi.listChapters({
      work_id: work.id,
      size: 1000,
      sort_by: 'chapter_number',
      sort_order: 'asc',
    });

    const chapters = chaptersResponse.chapters;

    // 构建 HTML 内容
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${work.title}</title>
        <style>
          body {
            font-family: "Microsoft YaHei", "SimSun", serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }
          h2 {
            font-size: 20px;
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
          }
          .chapter-content {
            margin-bottom: 40px;
            text-indent: 2em;
          }
        </style>
      </head>
      <body>
        <h1>${work.title}</h1>
    `;

    if (work.description) {
      htmlContent += `<div class="description">${work.description}</div>`;
    }

    // 获取每个章节的内容
    for (const chapter of chapters) {
      try {
        const docResponse = await chaptersApi.getChapterDocument(chapter.id);
        let chapterContent = '';
        
        if (docResponse.content && typeof docResponse.content === 'object') {
          chapterContent = docResponse.content.content || '';
        } else if (typeof docResponse.content === 'string') {
          chapterContent = docResponse.content;
        }

        if (!chapterContent) {
          const chapterDetail = await chaptersApi.getChapter(chapter.id);
          chapterContent = chapterDetail.content || '';
        }

        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">${chapterContent}</div>
        `;
      } catch (err) {
        console.warn(`获取章节 ${chapter.id} 内容失败:`, err);
        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">[内容获取失败]</div>
        `;
      }
    }

    htmlContent += `
      </body>
      </html>
    `;

    // 创建并下载文件
    const blob = new Blob([htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${work.title}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出 Word 失败:', error);
    throw new Error('导出失败，请稍后重试');
  }
}

/**
 * 导出为 PDF 格式
 * 使用浏览器打印功能生成 PDF
 */
export async function exportAsPdf(work: Work): Promise<void> {
  try {
    // 获取所有章节
    const chaptersResponse = await chaptersApi.listChapters({
      work_id: work.id,
      size: 1000,
      sort_by: 'chapter_number',
      sort_order: 'asc',
    });

    const chapters = chaptersResponse.chapters;

    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('无法打开打印窗口，请检查浏览器弹窗设置');
    }

    // 构建 HTML 内容
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${work.title}</title>
        <style>
          @media print {
            body {
              margin: 0;
              padding: 20px;
            }
            .page-break {
              page-break-before: always;
            }
          }
          body {
            font-family: "Microsoft YaHei", "SimSun", serif;
            line-height: 1.8;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            font-size: 14px;
          }
          h1 {
            text-align: center;
            font-size: 24px;
            margin-bottom: 10px;
          }
          .description {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }
          h2 {
            font-size: 20px;
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
            page-break-after: avoid;
          }
          .chapter-content {
            margin-bottom: 40px;
            text-indent: 2em;
          }
          .chapter-content p {
            margin: 0.8em 0;
          }
        </style>
      </head>
      <body>
        <h1>${work.title}</h1>
    `;

    if (work.description) {
      htmlContent += `<div class="description">${work.description}</div>`;
    }

    // 获取每个章节的内容
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      try {
        const docResponse = await chaptersApi.getChapterDocument(chapter.id);
        let chapterContent = '';
        
        if (docResponse.content && typeof docResponse.content === 'object') {
          chapterContent = docResponse.content.content || '';
        } else if (typeof docResponse.content === 'string') {
          chapterContent = docResponse.content;
        }

        if (!chapterContent) {
          const chapterDetail = await chaptersApi.getChapter(chapter.id);
          chapterContent = chapterDetail.content || '';
        }

        // 添加分页（除了第一章）
        if (i > 0) {
          htmlContent += '<div class="page-break"></div>';
        }

        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">${chapterContent}</div>
        `;
      } catch (err) {
        console.warn(`获取章节 ${chapter.id} 内容失败:`, err);
        if (i > 0) {
          htmlContent += '<div class="page-break"></div>';
        }
        htmlContent += `
          <h2>第 ${chapter.chapter_number} 章 ${chapter.title}</h2>
          <div class="chapter-content">[内容获取失败]</div>
        `;
      }
    }

    htmlContent += `
      </body>
      </html>
    `;

    // 写入内容并打印
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // 等待内容加载完成后打印
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        // 打印后关闭窗口（可选）
        // printWindow.close();
      }, 500);
    };
  } catch (error) {
    console.error('导出 PDF 失败:', error);
    throw new Error('导出失败，请稍后重试');
  }
}

