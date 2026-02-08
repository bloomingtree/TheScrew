---
name: python
description: Python 代码执行能力。使用 Pyodide (WebAssembly Python) 安全执行 Python 代码，无需用户安装 Python。支持数学计算、数据处理、字符串操作等场景，完全沙箱隔离。
---

# Python 代码执行

## 概述

你可以在浏览器中使用 Pyodide 安全地执行 Python 代码。Pyodide 是一个将 CPython 编译为 WebAssembly 的项目，允许在浏览器中运行 Python 代码。

**关键特点：**
- **无需安装** - Pyodide 完全自包含在应用中
- **离线可用** - 首次加载后无需网络
- **安全沙箱** - 继承浏览器安全模型
- **Python 3.11** - 支持大多数 Python 3.11 特性

## 可用工具

### exec_python
执行 Python 代码：

```bash
exec_python(code="print(2 + 2)")
# 输出: 4
```

### validate_python
验证脚本安全性：

```bash
validate_python(code="import os; os.system('ls')")
# 返回验证错误
```

### get_python_status
检查运行时状态：

```bash
get_python_status()
# 返回 Pyodide 状态信息
```

## 安全限制

以下模块和函数被禁用（安全限制）：
- `os` - 操作系统接口
- `subprocess` - 子进程管理
- `eval()` - 动态代码执行
- `exec()` - 动态代码执行
- `__import__()` - 动态导入
- `compile()` - 代码编译

## 使用示例

### 数学计算

```python
# 基本运算
print(2 + 2)
print(2 ** 10)
print(100 / 3)

# 数学函数
import math
print(math.sqrt(16))
print(math.pi)
print(math.sin(math.pi / 2))
```

### 字符串处理

```python
# 基本操作
text = "hello world"
print(text.upper())
print(text.title())
print(text.split())

# 字符串格式化
name = "World"
print(f"Hello, {name}!")
```

### 数据结构

```python
# 列表
numbers = [1, 2, 3, 4, 5]
print(sum(numbers))
print(max(numbers))
print(min(numbers))
print(sorted(numbers, reverse=True))

# 字典
data = {"name": "test", "value": 42}
print(data.keys())
print(data.values())
print(data.get("name"))
```

### JSON 处理

```python
import json

# 解析 JSON
json_str = '{"name": "Alice", "age": 30}'
data = json.loads(json_str)
print(data["name"])

# 生成 JSON
data = {"name": "Bob", "age": 25}
json_output = json.dumps(data, indent=2)
print(json_output)
```

### 数据处理

```python
# 列表推导式
numbers = [1, 2, 3, 4, 5]
squares = [x ** 2 for x in numbers]
print(squares)

# 过滤
evens = [x for x in numbers if x % 2 == 0]
print(evens)

# Lambda 函数
from functools import reduce
nums = [1, 2, 3, 4, 5]
product = reduce(lambda x, y: x * y, nums)
print(product)
```

### 日期时间

```python
from datetime import datetime, timedelta

now = datetime.now()
print(now.strftime("%Y-%m-%d %H:%M:%S"))

# 时间计算
tomorrow = now + timedelta(days=1)
print(tomorrow.strftime("%Y-%m-%d"))
```

## 高级功能

### 加载额外包（需要网络）

某些 Python 包需要显式加载：

```python
# 加载 numpy（首次需要网络）
import micropip
await micropip.install("numpy")

import numpy as np
arr = np.array([1, 2, 3, 4, 5])
print(np.mean(arr))
print(np.std(arr))
```

**注意**：首次加载包需要从 CDN 下载，之后会缓存。

## 注意事项

1. **使用 `print()` 输出结果** - Pyodide 通过 stdout 捕获输出
2. **默认超时 30 秒** - 长时间运行的脚本会被终止
3. **输出大小限制 10MB** - 超过限制会被截断
4. **文件系统访问受限** - 使用浏览器虚拟文件系统
5. **网络访问受限** - 默认禁用网络请求

## 故障排除

### 脚本运行缓慢
- 首次运行需要初始化 Pyodide（~5-10秒）
- 后续运行会很快（已缓存在内存中）

### 模块导入错误
- 检查模块是否被 Pyodide 支持
- 某些模块需要使用 `micropip.install()` 安装

### 内存不足
- 减少数据处理量
- 避免创建过大的数据结构
- 及时释放不再需要的变量

## 参考资源

- [Pyodide 官方文档](https://pyodide.org/)
- [Pyodide 支持的包](https://pyodide.org/en/stable/usage/api/python-api.html)
