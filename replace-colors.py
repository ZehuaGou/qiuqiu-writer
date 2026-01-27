#!/usr/bin/env python3
"""
批量替换CSS文件中的颜色值
将彩色值替换为对应的灰色值
"""

import os
import re
import json
from pathlib import Path

# 颜色映射表
COLOR_MAPPING = {
    # 彩色到灰色映射
    "#34d399": "#666666",  # 绿色 -> 深灰
    "#10b981": "#444444",  # 深绿 -> 深灰黑
    "#059669": "#333333",  # 更深绿 -> 深灰
    "#60a5fa": "#999999",  # 蓝色 -> 中灰
    "#3b82f6": "#666666",  # 深蓝 -> 深灰
    "#2563eb": "#444444",  # 更深蓝 -> 深灰黑
    "#a78bfa": "#cccccc",  # 紫色 -> 中浅灰
    "#8b5cf6": "#999999",  # 深紫 -> 中灰
    "#7c3aed": "#666666",  # 更深紫 -> 深灰
    "#fb923c": "#cccccc",  # 橙色 -> 中浅灰
    "#f97316": "#999999",  # 深橙 -> 中灰
    "#ea580c": "#666666",  # 更深橙 -> 深灰
    "#f472b6": "#cccccc",  # 粉色 -> 中浅灰
    "#ec4899": "#999999",  # 深粉 -> 中灰
    "#db2777": "#666666",  # 更深粉 -> 深灰
    "#6366f1": "#666666",  # 靛蓝 -> 深灰
    "#8b5cf6": "#999999",  # 紫色 -> 中灰
    "#4f46e5": "#444444",  # 深靛蓝 -> 深灰黑
    "#f59e0b": "#999999",  # 警告橙 -> 中灰
    "#ef4444": "#666666",  # 错误红 -> 深灰
    "#3b82f6": "#999999",  # 信息蓝 -> 中灰
    "#d1fae5": "#e0e0e0",  # 浅绿边框 -> 浅灰
    "#bfdbfe": "#e0e0e0",  # 浅蓝边框 -> 浅灰
    "#e9d5ff": "#e0e0e0",  # 浅紫边框 -> 浅灰
    "#fed7aa": "#e0e0e0",  # 浅橙边框 -> 浅灰
    "#fbcfe8": "#e0e0e0",  # 浅粉边框 -> 浅灰
    "#374151": "#444444",  # 深色边框 -> 深灰黑
    "#1f2937": "#222222",  # 深色背景 -> 深灰黑
    "#111827": "#111111",  # 更深背景 -> 深黑
    "#f9fafb": "#f8f8f8",  # 浅色文字 -> 浅白
    "#d1d5db": "#cccccc",  # 浅灰文字 -> 中浅灰
    "#9ca3af": "#999999",  # 中灰文字 -> 中灰
    "#6b7280": "#666666",  # 深灰文字 -> 深灰
    "#475569": "#444444",  # 更深灰文字 -> 深灰黑
    "#0f172a": "#000000",  # 最深文字 -> 纯黑
    "#f8fafc": "#f8f8f8",  # 浅色背景 -> 浅白
    "#f1f5f9": "#f0f0f0",  # 浅灰背景 -> 浅灰白
    "#e2e8f0": "#e0e0e0",  # 浅灰边框 -> 浅灰
    "#cbd5e1": "#cccccc",  # 中浅灰边框 -> 中浅灰
    "#94a3b8": "#999999",  # 中灰文字 -> 中灰
    "#64748b": "#666666",  # 深灰文字 -> 深灰
    "#1890ff": "#666666",  # Ant Design蓝色 -> 深灰
    "#40a9ff": "#999999",  # Ant Design浅蓝 -> 中灰
    "#ff4d4f": "#666666",  # Ant Design红色 -> 深灰
    "#fff2f0": "#f8f8f8",  # Ant Design浅红背景 -> 浅白
    "#bfbfbf": "#cccccc",  # Ant Design灰色 -> 中浅灰
    "#666": "#666666",     # 简写灰色 -> 完整深灰
    "#333": "#333333",     # 简写深灰 -> 完整深灰
    "#f5f5f5": "#f5f5f5",  # 浅灰保持不变
    "#e0e0e0": "#e0e0e0",  # 浅灰保持不变
    "#cccccc": "#cccccc",  # 中浅灰保持不变
    "#999999": "#999999",  # 中灰保持不变
    "#666666": "#666666",  # 深灰保持不变
    "#444444": "#444444",  # 深灰黑保持不变
    "#333333": "#333333",  # 深灰保持不变
    "#222222": "#222222",  # 深灰黑保持不变
    "#111111": "#111111",  # 深黑保持不变
    "#000000": "#000000",  # 纯黑保持不变
    "#ffffff": "#ffffff",  # 纯白保持不变
    "#f8f8f8": "#f8f8f8",  # 浅白保持不变
    "#f0f0f0": "#f0f0f0",  # 浅灰白保持不变
    "#e8e8e8": "#e8e8e8",  # 浅灰保持不变
}

# RGBA颜色映射
RGBA_MAPPING = {
    "rgba(52, 211, 153, 0.1)": "rgba(102, 102, 102, 0.1)",
    "rgba(52, 211, 153, 0.15)": "rgba(102, 102, 102, 0.15)",
    "rgba(16, 185, 129, 0.1)": "rgba(68, 68, 68, 0.1)",
    "rgba(245, 158, 11, 0.1)": "rgba(153, 153, 153, 0.1)",
    "rgba(239, 68, 68, 0.1)": "rgba(102, 102, 102, 0.1)",
    "rgba(59, 130, 246, 0.1)": "rgba(153, 153, 153, 0.1)",
    "rgba(99, 102, 241, 0.1)": "rgba(102, 102, 102, 0.1)",
    "rgba(99, 102, 241, 0.25)": "rgba(102, 102, 102, 0.25)",
    "rgba(24, 144, 255, 0.1)": "rgba(102, 102, 102, 0.1)",  # Ant Design蓝色透明
    "rgba(24, 144, 255, 0.2)": "rgba(102, 102, 102, 0.2)",
    "rgba(255, 77, 79, 0.1)": "rgba(102, 102, 102, 0.1)",   # Ant Design红色透明
}

def replace_colors_in_file(file_path):
    """替换单个文件中的颜色值"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        # 替换十六进制颜色
        for old_color, new_color in COLOR_MAPPING.items():
            # 匹配完整的十六进制颜色（包括#号）
            pattern = re.compile(r'(?<![a-zA-Z0-9\-_])' + re.escape(old_color) + r'(?![a-zA-Z0-9\-_])')
            content = pattern.sub(new_color, content)

        # 替换RGBA颜色
        for old_rgba, new_rgba in RGBA_MAPPING.items():
            content = content.replace(old_rgba, new_rgba)

        # 替换简写的十六进制颜色（3位）
        short_hex_pattern = re.compile(r'(?<![a-zA-Z0-9\-_])#([0-9a-fA-F]{3})(?![0-9a-fA-F])')
        def expand_short_hex(match):
            hex_color = match.group(1)
            # 将3位简写扩展为6位
            expanded = '#' + ''.join([c*2 for c in hex_color])
            # 如果扩展后的颜色在映射表中，使用映射值
            return COLOR_MAPPING.get(expanded.lower(), expanded)

        content = short_hex_pattern.sub(expand_short_hex, content)

        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False

    except Exception as e:
        print(f"处理文件 {file_path} 时出错: {e}")
        return False

def find_css_files(root_dir):
    """查找所有CSS文件"""
    css_extensions = {'.css', '.scss', '.less'}
    css_files = []

    for root, dirs, files in os.walk(root_dir):
        # 跳过node_modules目录
        if 'node_modules' in root:
            continue

        for file in files:
            if Path(file).suffix.lower() in css_extensions:
                css_files.append(os.path.join(root, file))

    return css_files

def main():
    root_dir = "/Users/pang/Documents/wawawriter/frontend/src"

    print("查找CSS文件...")
    css_files = find_css_files(root_dir)
    print(f"找到 {len(css_files)} 个CSS文件")

    modified_count = 0
    for i, file_path in enumerate(css_files, 1):
        print(f"处理文件 {i}/{len(css_files)}: {file_path}")
        if replace_colors_in_file(file_path):
            modified_count += 1
            print(f"  ✓ 已修改")

    print(f"\n完成！修改了 {modified_count} 个文件")

if __name__ == "__main__":
    main()