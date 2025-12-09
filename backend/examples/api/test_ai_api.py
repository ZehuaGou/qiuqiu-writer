#!/usr/bin/env python3
"""
测试AI接口的示例脚本

使用方法：
1. 确保后端服务已启动（python -m memos.api.product_api --port 8001）
2. 运行此脚本：python examples/api/test_ai_api.py
"""

import json

import requests


BASE_URL = "http://localhost:8001/api/ai"
HEADERS = {"Content-Type": "application/json"}


def test_health_check():
    """测试健康检查接口"""
    print("\n" + "=" * 60)
    print("测试 1: 健康检查接口")
    print("=" * 60)

    url = f"{BASE_URL}/health"
    print(f"[*] 请求URL: {url}")

    try:
        response = requests.get(url, timeout=10)
        print(f"[*] 响应状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"[✓] 服务状态: {data['data']['status']}")
            print(f"[✓] 可用模型: {', '.join(data['data']['models'])}")
            print(f"[✓] 检查时间: {data['data']['timestamp']}")
        else:
            print(f"[✗] 请求失败: {response.text}")

    except Exception as e:
        print(f"[✗] 错误: {str(e)}")


def test_default_prompt():
    """测试获取默认提示词接口"""
    print("\n" + "=" * 60)
    print("测试 2: 获取默认提示词接口")
    print("=" * 60)

    url = f"{BASE_URL}/default-prompt"
    print(f"[*] 请求URL: {url}")

    try:
        response = requests.get(url, timeout=10)
        print(f"[*] 响应状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"[✓] 提示词版本: {data['data']['version']}")
            print(f"[✓] 提示词长度: {len(data['data']['prompt'])} 字符")
            print(f"[✓] 提示词预览:\n{data['data']['prompt'][:200]}...")
        else:
            print(f"[✗] 请求失败: {response.text}")

    except Exception as e:
        print(f"[✗] 错误: {str(e)}")


def test_analyze_chapter_stream():
    """测试章节分析接口（流式响应）"""
    print("\n" + "=" * 60)
    print("测试 3: 章节分析接口（流式响应）")
    print("=" * 60)

    url = f"{BASE_URL}/analyze-chapter"
    print(f"[*] 请求URL: {url}")

    # 测试章节内容
    test_content = """第一章 邂逅

    在一个阳光明媚的下午，李明走在回家的路上。
    突然，他看到了一个熟悉的身影——是他多年未见的大学同学张华。

    "张华！"李明兴奋地喊道。

    张华转过身来，脸上露出了惊喜的表情："李明？真的是你！这么多年了，你还好吗？"

    两人在街边的咖啡馆坐下，开始回忆起那些美好的大学时光。
    他们聊起了共同的朋友，聊起了曾经的梦想，聊起了这些年各自的经历。

    时间过得很快，天色渐暗。临别时，他们互留了联系方式，约定以后常联系。

    李明走在回家的路上，心里感到格外温暖。这次偶然的相遇，让他想起了很多过去的事情。"""

    data = {
        "content": test_content,
        "settings": {
            "model": "gpt-3.5-turbo",
            "temperature": 0.7,
            "max_tokens": 2000,
        },
    }

    print(f"[*] 章节内容长度: {len(test_content)} 字符")
    print(f"[*] 使用模型: {data['settings']['model']}")
    print(f"[*] 开始流式请求...\n")

    try:
        with requests.post(url, headers=HEADERS, json=data, stream=True, timeout=60) as response:
            print(f"[*] 响应状态码: {response.status_code}\n")

            if response.status_code == 200:
                full_content = ""
                for line in response.iter_lines():
                    if not line:
                        continue

                    line_str = line.decode("utf-8")
                    if line_str.startswith("data: "):
                        try:
                            message = json.loads(line_str[6:])
                            msg_type = message.get("type")

                            if msg_type == "start":
                                print(f"[→] {message.get('message')}")
                            elif msg_type == "chunk":
                                content = message.get("content", "")
                                full_content += content
                                print(content, end="", flush=True)
                            elif msg_type == "done":
                                print(f"\n\n[✓] {message.get('message')}")
                                print(f"[✓] 总共生成: {len(full_content)} 字符")
                            elif msg_type == "error":
                                print(f"\n[✗] 错误: {message.get('message')}")

                        except json.JSONDecodeError as e:
                            print(f"\n[!] JSON解析错误: {e}")
                            print(f"[!] 原始数据: {line_str}")

            else:
                print(f"[✗] 请求失败: {response.text}")

    except Exception as e:
        print(f"\n[✗] 错误: {str(e)}")


def test_analyze_chapter_error():
    """测试章节分析接口的错误处理"""
    print("\n" + "=" * 60)
    print("测试 4: 错误处理（空内容）")
    print("=" * 60)

    url = f"{BASE_URL}/analyze-chapter"
    print(f"[*] 请求URL: {url}")

    data = {
        "content": "",  # 空内容应该返回错误
        "settings": {"model": "gpt-3.5-turbo"},
    }

    print("[*] 发送空内容，预期返回错误...\n")

    try:
        response = requests.post(url, headers=HEADERS, json=data, timeout=10)
        print(f"[*] 响应状态码: {response.status_code}")

        if response.status_code == 400:
            print("[✓] 正确返回了400错误")
            print(f"[✓] 错误信息: {response.json()}")
        else:
            print(f"[!] 意外的响应: {response.text}")

    except Exception as e:
        print(f"[✗] 错误: {str(e)}")


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("AI接口测试脚本")
    print("=" * 60)
    print(f"基础URL: {BASE_URL}")
    print("请确保后端服务已启动在 http://localhost:8001")

    # 运行所有测试
    test_health_check()
    test_default_prompt()
    test_analyze_chapter_stream()
    test_analyze_chapter_error()

    print("\n" + "=" * 60)
    print("所有测试完成！")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()

