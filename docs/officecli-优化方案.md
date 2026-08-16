# OfficeCLI 工具优化方案

> **文档版本**：v1.0（2026-08-06）
> **评估依据**：`D:/work/希望小学智慧食堂建设项目/officecli-docx-深度评测报告.md`（2026-08-05）
> **评估对象**：`officecli-lite/`（项目自研轻量版，位于 [officecli-lite/](../officecli-lite/)）+ [OfficeCLITools.ts](../electron/main/tools/OfficeCLITools.ts)
> **重要前提**：评测报告针对的是 `.config/bin/officecli.exe`（基于 nanobot 的 officecli-bundle.js，旧版工具），而项目实际使用的是自研 `officecli-lite`。本方案先做"问题映射"，再针对 officecli-lite 给出具体优化措施。

---

## 一、评测结论与现状映射

### 1.1 评测核心结论（摘录）

> officecli 目前是一个**"段落级文档读写器 + 可用的模板替换器"**；表格是最大的短板——
> 写进去的表格在 Word 里是空表、并发写必丢数据、remove 表格行静默失败、
> find/view 看不到表格内容、样式属性挂错位置。

### 1.2 问题在 officecli-lite 上的存在情况

| 评测报告问题 | 旧版 bundle.js | officecli-lite 现状 | 是否需修 |
|---|---|---|---|
| **P0** 表格写入非法 XML（`w:tc > w:r` 直接子节点） | ❌ 存在 | ❌ **同样存在**（[docx.ts:441-463](../officecli-lite/src/formats/docx.ts#L441-L463) 的 `setElementProp('text')` 分支，目标元素若是 `w:tc`，会把新建的 `w:r` 直接 unshift 到 tc.children） | 🔴 **必修** |
| **P0** 并发丢数据（无锁读-改-写） | ❌ 存在 | ❌ **同样存在**（[ooxml.ts](../officecli-lite/src/core/ooxml.ts) 的 `saveDocument` 直接 `fs.writeFileSync` 覆盖，无锁、无原子写） | 🔴 **必修** |
| **P0** view 不显示表格单元格内容 | ❌ 存在 | ❌ **同样存在**（[docx.ts:80-84](../officecli-lite/src/formats/docx.ts#L80-L84) 仅返回 `rows`/`cols`） | 🔴 **必修** |
| **P1** add 不支持 row/column | ❌ 存在 | ❌ **同样存在**（[docx.ts:142-181](../officecli-lite/src/formats/docx.ts#L142-L181) 只支持 paragraph/pageBreak/table） | 🟡 应修 |
| **P1** remove 表格行静默失败 | ❌ 存在 | ⚠️ **疑似 bug**（[docx.ts:186-198](../officecli-lite/src/formats/docx.ts#L186-L198) 的 `remove` 调用 `removeChild(body, elem)`，但 `elem` 可能是 `w:tr`/`w:tc`——父节点并非 body，需查 `removeChild` 实现是否做了正确父级查找） | 🟡 应修 |
| **P1** find 与 replace 表格处理不一致 | ❌ 存在 | ✅ **lite 版无此问题**（[docx.ts:220-236](../officecli-lite/src/formats/docx.ts#L220-L236) find 已遍历表格；replace 走 `replaceInTree` 全节点遍历，行为一致） | — |
| **P2** alignment/width 等属性挂错位置 | ❌ 存在 | ❌ **同样存在**（[docx.ts:481-487](../officecli-lite/src/formats/docx.ts#L481-L487) `default` 分支 `elem.attrs[prop] = value` 把属性直接挂到元素根标签，未映射到 `w:pPr/w:jc`、`w:tblPr/w:tblW`） | 🟢 可优化 |
| **P2** validate 不可用 | ❌ 轻量版不可用 | ❌ **lite 版无此命令**（[OfficeCLITools.ts:284](../electron/main/tools/OfficeCLITools.ts#L284) 工具直接返回固定提示） | 🟢 可优化 |
| **P2** get 不支持 rows/cols/cells | ❌ 存在 | ❌ **同样存在**（[docx.ts:394-426](../officecli-lite/src/formats/docx.ts#L394-L426) `getElementProp` 只支持 text/style/bold/italic/fontSize/color） | 🟢 可优化 |
| **P2** 中文路径乱码 | ❌ 存在 | ⚠️ **部分缓解**（项目层 `OfficeCLITools.ts` 通过 stdin + `execOfficeCLIWithStdin` 减少了 argv 编码问题，但 officecli-lite CLI 直接调用仍可能踩坑） | 🟢 可优化 |

**总体判断**：officecli-lite 解决了 find/replace 一致性问题，但表格相关的 3 个 P0 级致命问题与并发安全问题完全沿用，**优化重点必须围绕表格正确性与并发安全**。

---

## 二、优化方案（按优先级）

### 🔴 P0-1：修复表格单元格写入的非法 XML 结构

**问题定位**：[docx.ts:441-463](../officecli-lite/src/formats/docx.ts#L441-L463)

```
case 'text': {
  let run = childrenOf(elem, 'w:r')[0];
  if (!run) {
    run = el('w:r', {}, [el('w:t', {...}, [txt(value)])]);
    elem.children!.unshift(run);  // ← 当 elem 是 w:tc 时，w:r 被直接塞到 tc 下
    ...
  }
}
```

**根因**：当目标元素是 `w:tc` 时，OOXML 内容模型要求 `w:tc` 的第一个子元素必须是块级元素（`w:p` 或 `w:tbl`），`w:r` 只能放在 `w:p` 内部。当前代码未识别"目标元素是 cell"的语义，直接 unshift 导致 `<w:tc><w:r>...</w:r><w:p/></w:tc>` 非法结构，Word/python-docx 按规范读不到内容（**写入提示成功，实际空表**）。

**优化措施**：

1. **在 setElementProp 入口识别 cell 语义**：若 `elem.tag === 'w:tc'`，定位/创建其中的第一个 `w:p`，把后续 run 操作的目标改为该 `w:p`，而不是 `w:tc` 自身。
2. **抽象 `ensureParagraphInCell(elem)` helper**：统一处理"cell 内必须有 w:p"的约束，被 `set text/bold/italic/fontSize/color` 复用。
3. **写入后做结构自检**：调用一个新的 `validateCellStructure(elem)` 局部函数，断言 `w:tc` 直接子元素中 `w:r` 不能出现在 `w:p` 之前；发现非法时直接抛错（而不是"提示成功但 Word 不认"）。**失败要响亮**，不能静默。
4. **加单测**：复现评测报告 2.5 节用例（set 4 个单元格 → python-docx 读回应能读到全部文本），作为回归基线。

**验收标准**：
- 用 officecli-lite set 写入的表格，python-docx 解析能读到全部单元格文本
- `office_view` 后再用 officecli-lite 写入 cell，结构合法

---

### 🔴 P0-2：增加文件锁 + 原子写入

**问题定位**：[ooxml.ts](../officecli-lite/src/core/ooxml.ts) 的 `saveDocument` 直接 `fs.writeFileSync(target, generated)` 全量覆盖

**根因**：每次操作都是「读旧文件 → 改内存 → 全量覆盖写回」，无文件锁、无版本校验、无原子写。多进程并发（AI 同时调多个工具、用户手动并行触发）时后写回者基于旧快照覆盖前者修改。

**优化措施**（按代价从低到高）：

1. **原子写入（必做，低代价）**：所有写操作改为「写临时文件 `xxx.tmp` → `fs.renameSync(tmp, target)`」模式。`rename` 在同分区是原子操作，保证文件要么是旧版要么是新版，永远不会写到一半。评测报告 P0 第二条明确建议。
2. **进程级文件锁（推荐，中等代价）**：在 officecli-lite 入口加 lockfile 机制：
   - 每次写操作前创建 `<file>.lock`（带 PID + 时间戳 + 随机数），存在则重试 N 次后报错
   - 操作结束（成功/失败）都删除 lock
   - 进程异常退出时通过 stale 检测（lock 时间戳超时）自动接管
   - Node 生态可用 `proper-lockfile` 作为参考，但为保持零依赖可手写
3. **跨进程锁强化（可选，高代价）**：在 Electron 主进程 [OfficeCLITools.ts](../electron/main/tools/OfficeCLITools.ts) 层维护一个「同文件串行队列」（基于 Map<path, Promise>），确保同一 docx 的多次工具调用串行执行。这是评测报告中"工具层面串行"的建议落实点。

**风险**：
- 加锁后单次操作延迟略增，但 officecli 单次执行通常 <200ms，影响可忽略
- 临时文件若异常残留需手动清理，建议 lock 文件按 `*.lock` 模式加入 `.gitignore` 与打包排除

**验收标准**：两个并发 `office_set` 写入同一 docx 不同路径，**两条修改都保留**（不再丢一条）。

---

### 🔴 P0-3：view 输出表格单元格内容

**问题定位**：[docx.ts:80-84](../officecli-lite/src/formats/docx.ts#L80-L84) 仅输出 `{ path, type: 'table', rows, cols }`

**优化措施**：

1. **扩展 view 的 table 项**：增加 `cells: string[][]` 字段（二维字符串矩阵），每个元素是对应 `w:tc` 内所有 `w:p/w:r/w:t` 拼接出的纯文本（评测报告 P0 第三条明确建议）。
2. **截断保护**：单元格内容超长（如 >200 字符）时截断并加省略号标记；表格规模超阈值（如 >50 行或 >10 列）时只输出前 N 行/列并在 `truncated: true` 标记。
3. **避免破坏现有调用方**：保持原有 `rows`/`cols` 字段不变，仅**新增** `cells` 字段，向后兼容。

**验收标准**：`office_view` 后用户/AI 能直接看到表格内容，不再需要 fallback 到 `office_raw --xpath`。

---

### 🟡 P1-1：补齐表格行/列增删

**现状**：
- `add type=row/column` 直接报 `Unknown add type`（[docx.ts:181](../officecli-lite/src/formats/docx.ts#L181)）
- `remove /table[N]/row[R]` 调用 `removeChild(body, elem)`（[docx.ts:195](../officecli-lite/src/formats/docx.ts#L195)）—— **疑似 bug**：`elem` 是 `w:tr`，其父级是 `w:tbl` 而非 `body`，需查 `removeChild` 是否做了实际父级查找，否则就是"静默失败"。

**优化措施**：

1. **`add row` / `add column`**：
   - path 形如 `/table[N]`，可选 `--count` 指定数量、`--at` 指定位置（默认末尾）
   - row：克隆现有 `w:tr` 结构（保留列数与单元格空 `<w:p/>`），append 到 `w:tbl`；如行不存在则按当前 cols 创建空行
   - column：遍历所有 `w:tr`，在每个末尾插入空 `<w:tc><w:p/></w:tc>`；同步更新 `w:tblGrid` 增加 `<w:gridCol>`
2. **修复 remove 的父级查找**：把 `removeChild(body, elem)` 改为 `removeChild(elem.parent, elem)` 或在 `removeChild` 内部用 `elem.parent` 兜底；同时让 `remove` 返回 `{ removed: 1 }` 而非空 success，**让"删了几条"可观测**（评测报告 P1 第二条建议）。
3. **路径扩展**：支持 `/table[N]/row[R]/cell[C]/paragraph[P]`（单元格内多段落操作，覆盖评测报告 2.13 节"表格内多段落"用例）。

**验收标准**：
- `office_add ... /table[1] row --count 3` 后 view 行数 +3
- `office_remove ... /table[1]/row[2]` 后该行消失，且返回 `{ removed: 1 }`

---

### 🟡 P1-2：扩展 get 支持表格语义属性

**现状**：[docx.ts:394-426](../officecli-lite/src/formats/docx.ts#L394-L426) `getElementProp` 不识别 `rows`/`cols`/`cells`/`runs`。

**优化措施**：
1. 新增 case：
   - `rows` → `childrenOf(elem, 'w:tr').length`
   - `cols` → `childrenOf(childrenOf(elem,'w:tr')[0], 'w:tc').length`
   - `cells` → 返回所有单元格文本的二维数组（同 view 但只针对单个表）
   - `runs` → 返回 `[{ text, bold, italic, fontSize, color }]` 的 run 级数组（评测报告 P2 第二条建议）
2. **`style` 属性增强**：当前只读 `w:pStyle`，读不到行内格式（[docx.ts:398-403](../officecli-lite/src/formats/docx.ts#L398-L403)）。新增合并逻辑：若无 `w:pStyle`，回退到首 run 的 `w:rPr` 聚合样式描述。

**验收标准**：`office_get /table[1] cells` 返回矩阵；`office_get /paragraph[1] runs` 返回 run 数组。

---

### 🟢 P2-1：修复样式/属性写入位置

**现状**：[docx.ts:481-487](../officecli-lite/src/formats/docx.ts#L481-L487) `default` 分支 `elem.attrs[prop] = value` 把 alignment 等挂到 `<w:p>` 根标签。

**优化措施**：扩展 `setElementProp` 的 case 分支，建立 **OOXML 属性映射表**：

| 用户传入 prop | 实际写入位置 |
|---|---|
| `alignment` | `<w:p><w:pPr><w:jc w:val="..."/></w:pPr>` |
| `width`（on table） | `<w:tbl><w:tblPr><w:tblW w:w="..." w:type="..."/></w:tblPr>` |
| `indent` | `<w:pPr><w:ind w:left="..."/></w:pPr>` |
| `spacing` | `<w:pPr><w:spacing w:after="..."/></w:pPr>` |
| `heading` | `<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>` |

default 分支保留为"挂属性"（兜底），但日志 warn 提示该属性可能不被 Word 识别。

**验收标准**：set alignment=center 后，python-docx 读 paragraph.alignment 返回 CENTER。

---

### 🟢 P2-2：恢复 validate 能力

**现状**：[OfficeCLITools.ts:284](../electron/main/tools/OfficeCLITools.ts#L284) 直接返回"轻量版暂不可用"。

**优化措施**：
1. 在 officecli-lite 加 `validate` 命令，做轻量结构校验：
   - 所有 `w:tc` 的第一个子元素是块级（`w:p` 或 `w:tbl`）
   - 所有 `w:tr` 的子 `w:tc` 数量一致（列数对齐）
   - `w:tbl` 必须含 `w:tblGrid`
   - 关键 XML 命名空间声明齐全
2. **写入后自动校验**（可选 hook）：在 `set/add/remove` 写回前调用 validate 子集，失败时拒绝写入并返回明确错误。这是评测报告 P0 第一条"提交前 OOXML 结构校验"的落地。

**验收标准**：`office_validate <file>` 返回 `{ valid, issues: [...] }`。

---

### 🟢 P2-3：统一中文路径处理

**现状**：项目层 [OfficeCLITools.ts](../electron/main/tools/OfficeCLITools.ts) 通过 `execOfficeCLIWithStdin` 缓解了 argv 编码问题，但 CLI 直接调用仍可能乱码。

**优化措施**：
1. 在 officecli-lite 入口统一 `process.argv` 解码（强制 UTF-8）
2. 文档明确：在 Windows zh-CN 下，bash 直接调用 officecli.exe 传中文路径需用引号包裹并确保终端 UTF-8 codepage
3. 推荐通过 stdin JSON 传参（batch 模式）规避 argv 编码问题，作为最佳实践

---

## 三、实施路线图

### Phase 1（紧急，1-2 天）—— P0 全部修完
- [ ] P0-1：set cell 非法结构修复 + 结构自检
- [ ] P0-2：原子写入 + 进程级 lockfile
- [ ] P0-3：view 输出 cells 矩阵
- [ ] 加针对评测报告 2.5/2.6/2.7 节用例的回归测试（python-docx 校验）

### Phase 2（常规，3-5 天）—— P1 全部补齐
- [ ] P1-1：add row/column + 修复 remove 父级 bug + 返回 removed 计数
- [ ] P1-2：get 支持 rows/cols/cells/runs，style 增强解析
- [ ] 路径扩展支持 cell 内 paragraph 操作

### Phase 3（增强，按需）—— P2 完善
- [ ] P2-1：OOXML 属性映射表
- [ ] P2-2：validate 命令 + 写入自检 hook
- [ ] P2-3：中文路径统一处理

---

## 四、风险与回退策略

| 风险 | 缓解措施 |
|---|---|
| **修复表格写入逻辑可能破坏既有调用方** | set text 分支保持向后兼容（目标元素是 `w:p` 时行为不变），只在 `elem.tag === 'w:tc'` 时走新分支；加 feature flag 兜底 |
| **加文件锁后死锁** | lock 设置最大持有时间（如 30s）+ stale 检测；提供 `--no-lock` 强制绕过参数 |
| **view 输出 cells 后单条消息变大** | 截断保护 + `truncated` 标记；现有 [OfficeCLITools.ts](../electron/main/tools/OfficeCLITools.ts) 的 30000 字符截断兜底依然生效 |
| **OOXML 属性映射不全遗漏用户常用属性** | 先覆盖评测报告明确提到的 alignment/width，其余保留 default 分支 + warn 日志，按实际使用反馈增量补全 |

---

## 五、与旧版 bundle.js 的关系

评测报告基于 `.config/bin/officecli.exe`（bundle.js）测试，但项目已切到 officecli-lite。建议：

1. **清理旧版**：在打包脚本与 [OfficeCLITools.ts:23-39](../electron/main/tools/OfficeCLITools.ts#L23-L39) 的 `getCLICommand()` 中移除对 `officecli-bundle.js` 与 `officecli.exe` 的双模式回退，统一走 officecli-lite（`node-v12.exe` + lite bundle 或 lite 自身的单文件）。
2. **文档同步**：评测报告中"工具内部对表格的处理不一致"等结论在 lite 版上已部分解决（find 会遍历表格），避免误读为"lite 版仍存在所有问题"。
3. **回归用例归档**：把评测报告附录的 `verify_docx.py`/`xml_check.py`/`open_check.py` 改造为项目内自动化测试，长期守护 officecli-lite 的 OOXML 合规性。

---

## 六、优先级一句话总结

> **先修对（P0：表格结构合法化 + 并发安全 + 表格可见），再补全（P1：表格增删改 + 富属性读回），最后打磨（P2：样式映射 + validate + 编码）。**
> 评测报告中"写入成功但 Word 是空表"是用户最痛的体验，**P0-1 必须最先修**。
