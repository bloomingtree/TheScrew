---
name: python
description: Python 代码执行能力。通过嵌入式 Python 运行时执行 Python 代码，支持完整的标准库和文件系统访问。使用 bash 工具调用 python 命令。
---

# Python 代码执行

## 概述

你可以通过 bash 工具执行 Python 代码。系统内置 Python 3.8.10 嵌入式运行时，无需用户额外安装。

**关键特点：**
- **内置运行时** - Python 3.8.10 嵌入式，开箱即用
- **完整标准库** - 支持大部分 Python 标准库模块
- **文件系统访问** - 可直接读写本地文件
- **中文支持** - UTF-8 编码，支持中文参数

## 使用方式

通过 bash 工具调用 Python：

```bash
bash(command="python -c \"print(2 + 2)\"")
# 输出: 4
```

执行 Python 脚本文件：

```bash
bash(command="python script.py")
```

## 使用示例

### 数学计算

```python
import math
print(math.sqrt(16))
print(math.pi)
print(round(100 / 3, 2))
```

### 文件操作

```python
# 读取文件
with open("data.txt", "r", encoding="utf-8") as f:
    content = f.read()
    print(content)
```

### JSON 处理

```python
import json

data = {"name": "Alice", "age": 30}
print(json.dumps(data, indent=2, ensure_ascii=False))
```

### 数据处理

```python
import csv
import json

# 读取 CSV 并转 JSON
with open("data.csv", "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    rows = list(reader)
    print(json.dumps(rows, indent=2, ensure_ascii=False))
```

## 注意事项

1. **编码** - 始终指定 `encoding="utf-8"` 读写文件
2. **输出** - 使用 `print()` 输出结果
3. **路径** - 使用工作区内的相对路径或绝对路径
4. **超时** - 长时间运行的脚本可能被终止
