#!/usr/bin/env python3
"""
修复组件内联样式中的颜色值
"""

import os
import re

# 内联样式颜色替换映射
INLINE_COLOR_MAPPING = {
    "#ef4444": "var(--error, #666666)",  # 错误红色 -> 灰色
    "#3b82f6": "var(--info, #999999)",   # 信息蓝色 -> 中灰
    "#6b7280": "var(--text-tertiary, #666666)",  # 深灰文字 -> 深灰
    "#64748b": "var(--text-tertiary, #666666)",  # 深灰文字 -> 深灰
    "#999": "var(--text-tertiary, #666666)",     # 简写中灰 -> 深灰
    "#666": "var(--text-tertiary, #666666)",     # 简写深灰 -> 深灰
    "#000000": "var(--text-primary, #000000)",   # 黑色 -> CSS变量
}

def fix_inline_styles_in_file(file_path):
    """修复单个文件中的内联样式颜色"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # 替换硬编码颜色为CSS变量
        for old_color, new_color in INLINE_COLOR_MAPPING.items():
            # 匹配 style={{ ... color: '#ef4444' ... }} 模式
            pattern = re.compile(r"style={{[^}]*color:\s*'" + re.escape(old_color) + r"'[^}]*}}")
            content = pattern.sub(lambda m: m.group(0).replace(f"'{old_color}'", f"'{new_color}'"), content)

            # 匹配 style={{ ... color: "#ef4444" ... }} 模式（双引号）
            pattern2 = re.compile(r'style={{[^}]*color:\s*"' + re.escape(old_color) + r'"[^}]*}}')
            content = pattern2.sub(lambda m: m.group(0).replace(f'"{old_color}"', f'"{new_color}"'), content)

            # 匹配 style={{ ... backgroundColor: '#ef4444' ... }} 模式
            pattern3 = re.compile(r"style={{[^}]*backgroundColor:\s*'" + re.escape(old_color) + r"'[^}]*}}")
            content = pattern3.sub(lambda m: m.group(0).replace(f"'{old_color}'", f"'{new_color}'"), content)

            # 匹配 style={{ ... background: '#ef4444' ... }} 模式
            pattern4 = re.compile(r"style={{[^}]*background:\s*'" + re.escape(old_color) + r"'[^}]*}}")
            content = pattern4.sub(lambda m: m.group(0).replace(f"'{old_color}'", f"'{new_color}'"), content)

            # 匹配 style={{ ... borderColor: '#ef4444' ... }} 模式
            pattern5 = re.compile(r"style={{[^}]*borderColor:\s*'" + re.escape(old_color) + r"'[^}]*}}")
            content = pattern5.sub(lambda m: m.group(0).replace(f"'{old_color}'", f"'{new_color}'"), content)

        # 处理动态颜色（保持逻辑但建议使用灰色）
        # 这里我们主要处理硬编码颜色，动态颜色保持原样

        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False

    except Exception as e:
        print(f"处理文件 {file_path} 时出错: {e}")
        return False

def main():
    # 需要处理的文件列表
    files_to_fix = [
        "/Users/pang/Documents/wawawriter/frontend/src/components/ThemeSelector.tsx",
        "/Users/pang/Documents/wawawriter/frontend/src/components/editor/WorkInfoManager.tsx",
        "/Users/pang/Documents/wawawriter/frontend/src/pages/NovelEditorPage.tsx",
        "/Users/pang/Documents/wawawriter/frontend/src/pages/UserWorksPage.tsx",
    ]

    print("修复内联样式颜色...")
    modified_count = 0
    for file_path in files_to_fix:
        if os.path.exists(file_path):
            print(f"处理文件: {file_path}")
            if fix_inline_styles_in_file(file_path):
                modified_count += 1
                print(f"  ✓ 已修复")
        else:
            print(f"  ⚠ 文件不存在: {file_path}")

    print(f"\n完成！修复了 {modified_count} 个文件")

if __name__ == "__main__":
    main()