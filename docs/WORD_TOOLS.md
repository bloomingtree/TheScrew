# Word 工具使用指南

本文档介绍了如何使用 Word 文档操作工具。

## 概述

Word 工具提供了一套完整的 API，用于在 Electron 应用中读取、创建和编辑 Microsoft Word (.docx) 文档，包括页眉页脚的完整操作。

## 可用工具

### 1. read_word
读取 Word 文档的文本内容和结构信息。

**参数：**
- `filepath` (必需): Word 文件路径（相对于工作空间）

**返回：**
- `success`: 是否成功
- `content`: 文档文本内容
- `structure`: 文档结构信息（段落、表格、图片等）
- `path`: 文件路径

**示例：**
```json
{
  "name": "read_word",
  "arguments": "{\"filepath\": \"documents/example.docx\"}"
}
```

### 2. create_word
创建新的 Word 文档。

**参数：**
- `filepath` (必需): 保存路径（相对于工作空间）
- `content` (必需): 文档内容（支持 HTML 格式）
- `title` (可选): 文档标题

**示例：**
```json
{
  "name": "create_word",
  "arguments": "{\"filepath\": \"documents/new.docx\", \"content\": \"这是一个新文档\\n\\n第二段内容\", \"title\": \"我的文档\"}"
}
```

### 3. open_word
打开 Word 文档以供编辑。

**参数：**
- `filepath` (必需): Word 文件路径（相对于工作空间）

**示例：**
```json
{
  "name": "open_word",
  "arguments": "{\"filepath\": \"documents/example.docx\"}"
}
```

### 4. save_word
保存当前编辑的 Word 文档。

**参数：**
- `filepath` (可选): 保存路径（不提供则覆盖原文件）

**示例：**
```json
{
  "name": "save_word",
  "arguments": "{}"
}
```

### 5. get_structure
获取 Word 文档的详细结构信息。

**参数：**
- `filepath` (可选): Word 文件路径（不提供则使用当前打开的文档）

**示例：**
```json
{
  "name": "get_structure",
  "arguments": "{\"filepath\": \"documents/example.docx\"}"
}
```

### 6. edit_paragraph
修改指定段落的文本内容。

**参数：**
- `paragraphIndex` (必需): 段落索引（从 0 开始）
- `newText` (必需): 新的文本内容

**示例：**
```json
{
  "name": "edit_paragraph",
  "arguments": "{\"paragraphIndex\": 0, \"newText\": \"这是新的第一段内容\"}"
}
```

### 7. add_paragraph
在指定位置添加新段落。

**参数：**
- `text` (必需): 段落文本内容
- `position` (可选): 插入位置（索引，默认添加到末尾）
- `heading` (可选): 标题级别（1-6）

**示例：**
```json
{
  "name": "add_paragraph",
  "arguments": "{\"text\": \"这是新添加的段落\", \"position\": 1}"
}
```

### 8. replace_text
替换文档中的所有匹配文本。

**参数：**
- `searchText` (必需): 要搜索的文本
- `replaceWith` (必需): 替换后的文本
- `caseSensitive` (可选): 是否区分大小写（默认 false）

**示例：**
```json
{
  "name": "replace_text",
  "arguments": "{\"searchText\": \"旧文本\", \"replaceWith\": \"新文本\"}"
}
```

### 9. add_table
在文档中添加表格。

**参数：**
- `rows` (必需): 行数
- `columns` (必需): 列数
- `data` (可选): 表格数据（二维数组）
- `position` (可选): 插入位置（段落索引）
- `hasHeader` (可选): 是否包含表头（默认 true）

**示例：**
```json
{
  "name": "add_table",
  "arguments": "{\"rows\": 3, \"columns\": 2, \"data\": [[\"姓名\", \"年龄\"], [\"张三\", \"25\"], [\"李四\", \"30\"]]}"
}
```

### 10. edit_table
编辑表格中的指定单元格内容。

**参数：**
- `tableIndex` (必需): 表格索引（从 0 开始）
- `rowIndex` (必需): 行索引（从 0 开始）
- `columnIndex` (必需): 列索引（从 0 开始）
- `newText` (必需): 新的单元格内容

**示例：**
```json
{
  "name": "edit_table",
  "arguments": "{\"tableIndex\": 0, \"rowIndex\": 1, \"columnIndex\": 0, \"newText\": \"王五\"}"
}
```

### 11. add_image
在文档中添加图片。

**参数：**
- `imagePath` (必需): 图片文件路径（相对于工作空间）
- `position` (可选): 插入位置（段落索引）
- `width` (可选): 图片宽度（像素，默认自动）
- `height` (可选): 图片高度（像素，默认自动）

**示例：**
```json
{
  "name": "add_image",
  "arguments": "{\"imagePath\": \"images/logo.png\", \"position\": 2}"
}
```

### 12. export_as_html
将 Word 文档导出为 HTML 格式（用于预览）。

**参数：**
- `filepath` (可选): Word 文件路径（不提供则使用当前打开的文档）
- `outputPath` (可选): HTML 输出路径

**示例：**
```json
{
  "name": "export_as_html",
  "arguments": "{\"filepath\": \"documents/example.docx\", \"outputPath\": \"output/preview.html\"}"
}
```

### 13. modify_header_footer_distance
修改页眉页脚距离和页面边距（单位：缇，1英寸=1440缇）。

**参数：**
- `headerDistance` (可选): 页眉距离页面的距离（缇）
- `footerDistance` (可选): 页脚距离页面的距离（缇）
- `margin` (可选): 页面边距设置
  - `top`: 上边距（缇）
  - `bottom`: 下边距（缇）
  - `left`: 左边距（缇）
  - `right`: 右边距（缇）

**示例：**
```json
{
  "name": "modify_header_footer_distance",
  "arguments": "{\"headerDistance\": 720, \"footerDistance\": 720, \"margin\": {\"top\": 1440, \"bottom\": 1440, \"left\": 1800, \"right\": 1800}}"
}
```

**常用距离参考：**
- 1 英寸 = 1440 缇
- 1 厘米 = 567 缇
- 标准 A4 纸张边距：上下左右各 1440 缇（1 英寸）

### 14. edit_header
编辑页眉内容。

**参数：**
- `headerText` (必需): 页眉文本内容
- `headerType` (可选): 页眉类型（even-偶数页、default-默认/奇数页、first-首页）
- `align` (可选): 对齐方式（left、center、right）

**示例：**
```json
{
  "name": "edit_header",
  "arguments": "{\"headerText\": \"公司机密文档\", \"align\": \"center\"}"
}
```

### 15. edit_footer
编辑页脚内容。

**参数：**
- `footerText` (必需): 页脚文本内容（支持 {PAGE} 表示页码，{NUMPAGES} 表示总页数）
- `footerType` (可选): 页脚类型（even-偶数页、default-默认/奇数页、first-首页）
- `align` (可选): 对齐方式（left、center、right）

**示例：**
```json
{
  "name": "edit_footer",
  "arguments": "{\"footerText\": \"第 {PAGE} 页 / 共 {NUMPAGES} 页\", \"align\": \"center\"}"
}
```

### 16. add_header_text
添加或更新页眉文本（自动创建页眉）。

**参数：**
- `headerText` (必需): 页眉文本内容
- `headerType` (可选): 页眉类型（even-偶数页、default-默认/奇数页、first-首页）
- `align` (可选): 对齐方式（left、center、right）

**示例：**
```json
{
  "name": "add_header_text",
  "arguments": "{\"headerText\": \"项目报告\", \"align\": \"left\"}"
}
```

### 17. add_footer_text
添加或更新页脚文本（支持页码，自动创建页脚）。

**参数：**
- `footerText` (必需): 页脚文本内容（支持 {PAGE} 表示页码，{NUMPAGES} 表示总页数）
- `footerType` (可选): 页脚类型（even-偶数页、default-默认/奇数页、first-首页）
- `align` (可选): 对齐方式（left、center、right）

**示例：**
```json
{
  "name": "add_footer_text",
  "arguments": "{\"footerText\": \"页码：{PAGE}\", \"align\": \"right\"}"
}
```

### 18. delete_header
删除指定类型的页眉。

**参数：**
- `headerType` (可选): 页眉类型（even-偶数页、default-默认/奇数页、first-首页）

**示例：**
```json
{
  "name": "delete_header",
  "arguments": "{\"headerType\": \"default\"}"
}
```

### 19. delete_footer
删除指定类型的页脚。

**参数：**
- `footerType` (可选): 页脚类型（even-偶数页、default-默认/奇数页、first-首页）

**示例：**
```json
{
  "name": "delete_footer",
  "arguments": "{\"footerType\": \"default\"}"
}
```

### 20. get_header_footer_info
获取文档的页眉页脚信息。

**参数：**
无

**返回：**
- `success`: 是否成功
- `info`: 页眉页脚信息
  - `headerDistance`: 页眉距离
  - `footerDistance`: 页脚距离
  - `margins`: 页面边距
  - `headers`: 页眉内容
  - `footers`: 页脚内容

**示例：**
```json
{
  "name": "get_header_footer_info",
  "arguments": "{}"
}
```

## 工作流程

### 典型使用流程：

1. **读取文档**
   ```
   read_word → 查看内容和结构
   ```

2. **编辑文档**
   ```
   open_word → edit_paragraph / add_paragraph / replace_text / add_table / edit_table / add_image
   ```

3. **管理页眉页脚**
   ```
   get_header_footer_info → add_header_text / add_footer_text / modify_header_footer_distance
   ```

4. **保存文档**
   ```
   save_word → 保存更改
   ```

5. **创建新文档**
   ```
   create_word → 直接创建新文档
   ```

### 页眉页脚操作示例：

```
用户：帮我设置页眉为"项目报告"，居中显示
助手：[使用 add_header_text 工具添加页眉]

用户：设置页脚显示"第 X 页"，居中
助手：[使用 add_footer_text 工具添加页脚，使用 {PAGE} 变量]

用户：调整页眉距离为 0.5 英寸
助手：[使用 modify_header_footer_distance 工具，headerDistance = 720]

用户：删除页脚
助手：[使用 delete_footer 工具]
```

## 技术细节

### 依赖库
- **docxtemplater**: 功能强大的 Word 模板引擎，支持复杂的文档编辑
- **pizzip**: 读取/修改 .docx ZIP 结构
- **docx**: 创建新 Word 文档

### 页眉页脚类型
- **default**: 默认页眉页脚（用于奇数页）
- **even**: 偶数页页眉页脚
- **first**: 首页页眉页脚

### 格式保留
- 所有工具都会尽可能保留原有文档的格式
- 文本编辑会保留段落样式
- 表格操作会保留表格样式
- 图片插入会保持图片质量
- 页眉页脚编辑会保留原有样式

### 距离单位
所有距离和边距都使用"缇"（twip）作为单位：
- 1 英寸 = 1440 缇
- 1 厘米 = 567 缇
- 1 毫米 = 57 缇

### 限制
- 编辑现有文档时，非常复杂的格式（如宏、复杂布局）可能无法完全保留
- 图片大小目前使用默认值（可自定义）
- 表格样式使用默认网格样式
- 页眉页脚支持基本的文本和对齐设置，暂不支持复杂的样式

## 注意事项

1. **工作路径**: 所有路径都是相对于工作空间的
2. **文件格式**: 只支持 .docx 格式，不支持 .doc
3. **编码**: 文档内容使用 UTF-8 编码
4. **错误处理**: 所有工具都有完善的错误处理，会返回错误信息
5. **并发控制**: 同时只能打开一个文档进行编辑
6. **页码变量**: 页脚中使用 `{PAGE}` 表示当前页码，`{NUMPAGES}` 表示总页数
7. **距离单位**: 所有距离参数都使用缇（twip）作为单位

## 集成说明

Word 工具已集成到 ToolManager 中，会自动注册到聊天系统中。大模型可以通过工具调用自动使用这些功能。

工具注册位置：`electron/main/ipc/chat.ts:28-36`
