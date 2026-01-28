#!/usr/bin/env python3
"""
修复遗漏的RGBA颜色值
"""

import os
import re

# RGBA颜色替换映射
RGBA_REPLACEMENTS = {
    # 绿色系
    "rgba(16, 185, 129,": "rgba(68, 68, 68,",  # #10b981 -> #444444
    "rgba(52, 211, 153,": "rgba(102, 102, 102,",  # #34d399 -> #666666
    # 橙色系
    "rgba(245, 158, 11,": "rgba(153, 153, 153,",  # #f59e0b -> #999999
    # 蓝色系
    "rgba(59, 130, 246,": "rgba(153, 153, 153,",  # #3b82f6 -> #999999
    # 红色系
    "rgba(239, 68, 68,": "rgba(102, 102, 102,",  # #ef4444 -> #666666
    # 靛蓝系
    "rgba(99, 102, 241,": "rgba(102, 102, 102,",  # #6366f1 -> #666666
    # Ant Design蓝色
    "rgba(24, 144, 255,": "rgba(102, 102, 102,",  # #1890ff -> #666666
    # Ant Design红色
    "rgba(255, 77, 79,": "rgba(102, 102, 102,",  # #ff4d4f -> #666666
}

def fix_rgba_in_file(file_path):
    """修复单个文件中的RGBA颜色"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content

        for old_prefix, new_prefix in RGBA_REPLACEMENTS.items():
            # 使用正则表达式匹配完整的rgba值
            pattern = re.compile(re.escape(old_prefix) + r'([^)]+)\)')

            def replace_rgba(match):
                alpha_value = match.group(1)
                return f"{new_prefix}{alpha_value})"

            content = pattern.sub(replace_rgba, content)

        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False

    except Exception as e:
        print(f"处理文件 {file_path} 时出错: {e}")
        return False

def find_files_with_colored_rgba():
    """查找包含彩色RGBA值的文件"""
    import subprocess
    result = subprocess.run(
        ['grep', '-r', '-l', 'rgba(', '/Users/pang/Documents/wawawriter/frontend/src',
         '--include=*.css', '--include=*.scss', '--include=*.less'],
        capture_output=True,
        text=True
    )

    files = result.stdout.strip().split('\n')
    if files == ['']:
        return []

    # 过滤出包含彩色RGBA值的文件
    colored_files = []
    for file in files:
        if not file:
            continue
        # 检查文件是否包含彩色RGBA值
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()
            if any(old_prefix in content for old_prefix in RGBA_REPLACEMENTS.keys()):
                colored_files.append(file)

    return colored_files

def main():
    # 查找需要修复的文件
    print("查找包含彩色RGBA值的文件...")
    files_to_fix = find_files_with_colored_rgba()
    print(f"找到 {len(files_to_fix)} 个需要修复的文件")

    print("修复RGBA颜色...")
    modified_count = 0
    for file_path in files_to_fix:
        if os.path.exists(file_path):
            print(f"处理文件: {file_path}")
            if fix_rgba_in_file(file_path):
                modified_count += 1
                print(f"  ✓ 已修复")
        else:
            print(f"  ⚠ 文件不存在: {file_path}")

    print(f"\n完成！修复了 {modified_count} 个文件")

if __name__ == "__main__":
    main()