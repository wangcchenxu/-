import json
import urllib.request
import urllib.error
import ssl

# 忽略SSL验证警告
ssl._create_default_https_context = ssl._create_unverified_context

if __name__ == '__main__':
    # 华为云配置（和你之前的一样）
    url = "https://api.modelarts-maas.com/v2/chat/completions"
    api_key = "30k5XoEaAQ4nI2l6jNumtxBbXFnfWi3BdztfZd6U87NGhq5DaLv8s7JAXQf3FTNCVfHCAPO13Y5xNbwuSk3MVg"  # 替换成你自己的API Key
    model_name = "qwen3-30b-a3b"

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }

    data = {
        "model": model_name,
        "messages": [
            {"role": "system", "content": "你是一个专业的Python代码助手，帮用户分析代码问题、优化性能、生成注释。"},
            {"role": "user", "content": "帮我分析下面这段代码：def add(a, b): return a + b"}
        ],
        "stream": False,
        "max_tokens": 2048
    }

    try:
        # 用Python自带的urllib发送请求，不需要requests
        req = urllib.request.Request(
            url,
            data=json.dumps(data, ensure_ascii=False).encode('utf-8'),
            headers=headers,
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            print("状态码:", response.getcode())
            if response.getcode() == 200:
                result = json.loads(response.read().decode('utf-8'))
                print("AI回复:")
                print(result["choices"][0]["message"]["content"])
            else:
                print("错误信息:", response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print("HTTP错误:", e.code, e.read().decode('utf-8'))
    except Exception as e:
        print("请求失败:", str(e))