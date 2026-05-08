# /qa-ai: AI Agent Compliance QA

基于 `/qa` 指令的 AI 功能专项测试。对 Aedifex 的 AI 对话助手进行穷举式场景覆盖测试，验证所有 AI 工具调用、验证规则、边界条件和 UI 状态的正确性。

## 前置条件

1. 启动开发服务器 (`pnpm dev`)
2. 打开编辑器，创建一个包含以下内容的测试场景：
   - 至少一个 Level
   - 至少一个 Zone（房间区域）
   - 至少 4 面墙围成的房间
   - 至少 1 个已放置的家具（Item）
   - 至少 1 扇门和 1 扇窗
3. 打开 AI 面板（侧边栏 AI tab）
4. 使用有头浏览器 (`$B`) 进行所有交互

## 测试矩阵

### 一、基础工具调用 (13 个工具)

#### 1.1 add_item — 添加家具

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.1.1 | 精确 slug 匹配 | "放一个 couch-medium 在房间中央" | 解析出 catalogSlug=couch-medium，位置在 zone 中心附近 | ghost preview 出现蓝色半透明物体 |
| 1.1.2 | 模糊名称匹配 | "放一张沙发" | catalog resolver 模糊匹配到沙发类物品 | 匹配结果合理，不是随机物品 |
| 1.1.3 | 不存在的物品 | "放一个火箭发射台" | catalog 无匹配，AI 应回复无法找到 | 不产生 tool call，或产生但 status=invalid |
| 1.1.4 | 指定旋转 | "放一张沙发面朝北墙" | rotationY 应为合理角度 | 旋转方向与描述一致 |
| 1.1.5 | 位置越界 | "在 (999, 0, 999) 放一张桌子" | validateAddItem 自动修正到 zone 边界内 | status=adjusted，position 被 clamp |
| 1.1.6 | 碰撞检测 | "在已有沙发的位置再放一张桌子" | tryAutoOffset 触发偏移 | 物品位置自动调整避免重叠 |
| 1.1.7 | 空场景 | 无 zone 时 "放一张沙发" | 提示用户先创建房间/zone | 不执行放置操作 |

#### 1.2 remove_item — 移除家具

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.2.1 | 正常移除 | "移除沙发" | AI 识别场景中的沙发 nodeId，调用 remove_item | 物品从场景消失 |
| 1.2.2 | 不存在的 nodeId | AI 返回了不存在的 nodeId | status=invalid，提示节点不存在 | 不执行任何删除 |
| 1.2.3 | 移除非 item 类型 | AI 试图用 remove_item 移除墙体 | 验证器拒绝（remove_item 仅适用于 item） | status=invalid |
| 1.2.4 | 确定性跳过反馈 | remove_item 在 DETERMINISTIC_TOOLS 中 | 执行后不再循环回 LLM | agentic loop 直接 break |

#### 1.3 move_item — 移动家具

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.3.1 | 正常移动 | "把沙发移到窗户旁边" | AI 计算新位置，ghost preview 显示新位置 | 预览位置合理 |
| 1.3.2 | 移动到越界位置 | "把沙发移到房间外面" | 位置 clamp 到 zone 边界内 | status=adjusted |
| 1.3.3 | 移动并旋转 | "把沙发转 90 度" | rotationY 变化 | 旋转正确 |
| 1.3.4 | 不存在的 nodeId | AI 返回错误 nodeId | status=invalid | 无操作 |

#### 1.4 update_material — 更新材质

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.4.1 | 正常更新 | "把沙发改成蓝色" | material 字段更新 | ghost preview 显示材质变化 |
| 1.4.2 | 不存在的节点 | AI 返回错误 nodeId | status=invalid | 无操作 |
| 1.4.3 | 空材质值 | material 为空字符串 | 验证失败 | status=invalid |

#### 1.5 add_wall — 添加墙体

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.5.1 | 正常添加 | "在 (0,0) 到 (5,0) 添加一面墙" | 创建 5m 长的水平墙 | ghost preview 显示墙体 |
| 1.5.2 | 网格对齐 | start/end 不在 0.5m 网格上 | 自动 snap 到 0.5m 网格 | 坐标被修正 |
| 1.5.3 | 零长度墙 | start 和 end 相同 | status=invalid，墙长度 < MIN_WALL_LENGTH(0.5m) | 不创建墙体 |
| 1.5.4 | 极短墙 | 长度 < 0.5m | status=invalid | 不创建墙体 |
| 1.5.5 | 自定义厚度 | thickness=0.3 | 使用指定厚度 | 墙体厚度正确 |
| 1.5.6 | 自定义高度 | height=3.5 | 使用指定高度 | 墙体高度正确 |
| 1.5.7 | 默认值 | 不指定 thickness/height | thickness=0.2, height=2.8 | 使用默认值 |
| 1.5.8 | 创建完整房间 | "创建一个 5m x 4m 的房间" | AI 使用 batch_operations 创建 4 面墙 | 4 面墙围合正确 |

#### 1.6 add_door — 添加门

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.6.1 | 正常添加 | "在北墙上添加一扇门" | AI 选择正确 wallId，合理 positionAlongWall | ghost preview 显示门 |
| 1.6.2 | 无效 wallId | wallId 不存在 | status=invalid | 不创建门 |
| 1.6.3 | wallId 非墙类型 | wallId 指向一个 item 节点 | status=invalid（验证器检查类型） | 不创建门 |
| 1.6.4 | 位置超出墙体 | positionAlongWall > 墙长度 | clampToWall() 修正到墙体范围内 | status=adjusted |
| 1.6.5 | 门宽超出墙长 | 门宽 > 墙长度 | clampToWall() 修正 | 门宽被限制 |
| 1.6.6 | 与已有门重叠 | 在已有门旁边放太近 | hasWallChildOverlap() 检测 | adjustForWallClearance 或 invalid |
| 1.6.7 | 与已有窗重叠 | 放在窗户位置 | 重叠检测 | 位置调整或拒绝 |
| 1.6.8 | 自定义参数 | width=1.2, height=2.4, side=front, hingesSide=left | 使用指定参数 | 参数正确传递 |
| 1.6.9 | 默认参数 | 不指定 width/height | width=0.9, height=2.1 | 使用默认值 |
| 1.6.10 | swingDirection | inward / outward | 正确设置 | 门开启方向正确 |

#### 1.7 add_window — 添加窗户

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.7.1 | 正常添加 | "在南墙上添加一扇窗户" | AI 选择正确 wallId | ghost preview 显示窗户 |
| 1.7.2 | 无效 wallId | wallId 不存在 | status=invalid | 不创建窗户 |
| 1.7.3 | 位置超出墙体 | positionAlongWall 越界 | clampToWall() 修正 | status=adjusted |
| 1.7.4 | 自定义高度位置 | heightFromFloor=1.5 | 使用指定窗台高度 | 窗户高度正确 |
| 1.7.5 | 默认参数 | 不指定尺寸 | width=1.5, height=1.5, centerY≈1.2m | 默认值正确 |
| 1.7.6 | 与已有元素重叠 | 放在门的位置 | 重叠检测 | 位置调整或拒绝 |
| 1.7.7 | side 参数 | side=front / back | 窗户朝向正确 | 渲染面正确 |

#### 1.8 remove_node — 移除节点（墙/门/窗）

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.8.1 | 移除墙体 | "移除北墙" | AI 识别墙体 nodeId | 墙体及其子节点（门窗）一起移除 |
| 1.8.2 | 移除门 | "移除客厅的门" | 仅移除门 | 墙体保留 |
| 1.8.3 | 移除窗户 | "移除窗户" | 仅移除窗户 | 墙体保留 |
| 1.8.4 | 不存在的 nodeId | nodeId 无效 | status=invalid | 无操作 |
| 1.8.5 | 不允许的类型 | 尝试移除 zone/level | status=invalid（仅允许 wall/door/window/item） | 不执行 |
| 1.8.6 | 确定性跳过 | remove_node 在 DETERMINISTIC_TOOLS 中 | 不循环回 LLM | agentic loop break |

#### 1.9 batch_operations — 批量操作

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.9.1 | 正常批量 | "布置一个客厅，包括沙发、茶几和电视柜" | 多个 add_item 操作 | 所有物品都出现在 preview |
| 1.9.2 | 混合类型批量 | "创建房间并放家具" | add_wall + add_item 混合 | 墙体和家具都创建 |
| 1.9.3 | 部分失败 | 批量中某些操作无效 | 有效操作执行，无效标记 invalid | 部分成功的结果正确显示 |
| 1.9.4 | 空操作列表 | operations 为空数组 | 无操作 | 不报错 |
| 1.9.5 | 大批量 | 10+ 个操作 | 全部处理 | 性能可接受，preview 正确 |

#### 1.10 propose_placement — 多方案提议

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.10.1 | 正常提议 | "沙发放哪里好？给我几个方案" | AI 返回 2-3 个选项 | 方案 tabs 出现在 UI |
| 1.10.2 | 方案切换 | 点击不同方案 tab | 场景切换到对应方案 | 预览正确更新 |
| 1.10.3 | 确认方案 | 选择方案后确认 | 该方案的操作被执行 | 物品创建成功 |
| 1.10.4 | 拒绝方案 | 拒绝所有方案 | 场景恢复原状 | 无物品添加 |

#### 1.11 ask_user — 向用户提问

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.11.1 | 模糊指令 | "放点东西" | AI 调用 ask_user 询问具体需求 | 显示问题 + 建议选项 |
| 1.11.2 | 回答问题 | 回答 AI 的问题 | agentic loop 恢复 | 继续执行 |
| 1.11.3 | loop 暂停 | ask_user 触发 | loopState='paused', processing=false | UI 不显示 loading |
| 1.11.4 | suggestions | AI 提供建议选项 | 建议按钮显示在 UI | 点击建议自动填入 |

#### 1.12 confirm_preview — 确认预览

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.12.1 | 用户确认 | 点击确认按钮 | confirmGhostPreview 执行 | ghost 节点变为真实节点 |
| 1.12.2 | 截图对比 | 确认后 | after screenshot 被捕获 | before/after 对比显示 |
| 1.12.3 | 操作日志 | 确认后 | addOperationLog 记录 | 日志可查看 |
| 1.12.4 | Undo 支持 | 确认后按 Ctrl+Z | Zundo undo 恢复 | 物品消失 |

#### 1.13 reject_preview — 拒绝预览

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 1.13.1 | 用户拒绝 | 点击拒绝按钮 | clearGhostPreview 执行 | ghost 节点移除，场景恢复 |
| 1.13.2 | 状态更新 | 拒绝后 | operationStatus='rejected' | UI 显示已拒绝标记 |

---

### 二、验证规则覆盖

#### 2.1 Catalog Resolver

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 2.1.1 | 精确 ID 匹配 | slug 完全一致 → 立即返回 | 第一阶段匹配 |
| 2.1.2 | 精确名称匹配 | name 完全一致 → 返回 | 第二阶段匹配 |
| 2.1.3 | 模糊匹配 | 部分名称匹配 score>0.3 | 第三阶段，返回最高分 |
| 2.1.4 | 无匹配 | score<0.3 且无精确匹配 | 返回 suggestions 列表 |
| 2.1.5 | 按类别过滤建议 | 无匹配时按类别返回同类物品 | suggestions 相关性高 |

#### 2.2 碰撞检测

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 2.2.1 | 无碰撞 | 空位置放置 | status=valid |
| 2.2.2 | 有碰撞自动偏移 | tryAutoOffset 在 8 方向寻找空位 | status=adjusted, 新位置无碰撞 |
| 2.2.3 | 8 方向全碰撞 | 所有偏移方向都被占用 | status=invalid (无法放置) |
| 2.2.4 | 边界碰撞 | 物品部分在 zone 外 | position clamp 到边界内 |

#### 2.3 墙体验证

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 2.3.1 | 0.5m 网格 snap | 坐标 (1.3, 2.7) → (1.5, 2.5) | 对齐到最近网格点 |
| 2.3.2 | 最小长度 | < 0.5m → invalid | 拒绝创建 |
| 2.3.3 | 负坐标 | start=(-5, -5) | 正常创建（允许负坐标） |
| 2.3.4 | 重叠墙体 | 完全相同的 start/end | 不检测墙体重叠（当前设计） |

#### 2.4 门窗墙上定位

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 2.4.1 | clampToWall | positionAlongWall < halfWidth → clamp 到 halfWidth | 门不超出墙体起点 |
| 2.4.2 | clampToWall | positionAlongWall > wallLen - halfWidth → clamp | 门不超出墙体终点 |
| 2.4.3 | 门宽 > 墙长 | width > wallLength | 门宽被限制为 wallLength - margin |
| 2.4.4 | overlap 检测 | 两个门间距 < 0.1m | hasWallChildOverlap=true |
| 2.4.5 | adjustForWallClearance | 有重叠时自动调整 | 新位置无重叠 |
| 2.4.6 | 调整失败 | 墙上已满，无法放下 | status=invalid |

---

### 三、Agentic Loop 行为

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 3.1 | 正常循环 | 用户发消息 → LLM → tool call → execute → tool result → LLM → done | 最终有文字回复 |
| 3.2 | 最大迭代 | 触发 5 次循环 | MAX_ITERATIONS=5 后强制退出 | 不无限循环 |
| 3.3 | 无 tool call 退出 | LLM 仅回复文字 | 循环立即结束 | iteration=1 |
| 3.4 | 确定性工具跳过 | remove_item/remove_node/confirm/reject | 成功后不循环回 LLM | loop break |
| 3.5 | ask_user 暂停 | AI 调用 ask_user | loopState='paused'，等待用户回答 | UI 可交互 |
| 3.6 | ask_user 恢复 | 用户回答问题 | loop 恢复执行 | 继续处理 |
| 3.7 | propose_placement 退出 | AI 返回方案 | 循环退出，显示方案 UI | 不继续循环 |
| 3.8 | 错误处理 | 流式连接失败 | setStreamError 设置错误信息 | UI 显示错误 |
| 3.9 | 场景上下文刷新 | 每次迭代重新序列化场景 | 第 2 次迭代看到第 1 次操作的结果 | 上下文准确 |
| 3.10 | tool result 回传 | mutation 执行后结果回传 LLM | LLM 能基于结果调整 | 反馈循环生效 |

---

### 四、System Prompt 遵循

| # | 场景 | 输入指令 | 预期行为 | 验证点 |
|---|------|---------|---------|-------|
| 4.1 | 语言匹配 | 中文提问 | 中文回复 | 回复语言与用户一致 |
| 4.2 | 英文提问 | "Place a sofa" | 英文回复 | 语言匹配 |
| 4.3 | 空间推理 | "把沙发放在靠墙的位置" | 位置在墙边 | 空间理解正确 |
| 4.4 | 场景感知 | "还有什么可以添加的？" | 基于当前场景给建议 | 建议与已有物品互补 |
| 4.5 | 冲突检测 | "在已有沙发上放另一张沙发" | AI 主动提示冲突 | 不盲目执行 |
| 4.6 | 批量布局 | "帮我布置一个温馨的客厅" | 使用 batch_operations 多物品 | 布局合理 |
| 4.7 | 工具选择正确 | "移除北墙" | 使用 remove_node 而非 remove_item | 工具选择正确 |
| 4.8 | 墙体坐标系 | "创建一个 5m x 4m 的房间" | start/end 使用 [x,z] 世界坐标 | 坐标正确 |
| 4.9 | 门窗坐标系 | "在墙中间加一扇门" | positionAlongWall ≈ 墙长/2 | 位置正确 |
| 4.10 | 拒绝非法操作 | "删除所有东西" | 合理处理（逐个删除或确认） | 不跳过确认 |

---

### 五、UI 状态覆盖

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 5.1 | 流式输出 | AI 回复逐字出现 | streaming 动画正常 |
| 5.2 | 操作卡片 pending | tool call 执行后 | 显示确认/拒绝按钮 |
| 5.3 | 操作卡片 confirmed | 用户确认后 | 按钮消失，显示已确认 |
| 5.4 | 操作卡片 rejected | 用户拒绝后 | 显示已拒绝 |
| 5.5 | 错误状态 | AI 连接失败 | 显示错误提示 |
| 5.6 | AI 处理中 | 等待 AI 回复 | 输入框禁用，显示 loading |
| 5.7 | before/after 截图 | 确认操作后 | 操作卡片显示前后对比 |
| 5.8 | 操作日志 | 多次操作后 | 日志按时间排列 |
| 5.9 | 方案 tabs | propose_placement 后 | A/B/C tabs 可切换 |
| 5.10 | 方案切换 | 点击不同 tab | 3D 视口更新对应方案 |
| 5.11 | 操作类型标签 | 不同工具类型 | 添加墙体/添加门/添加窗户/移除X 标签正确 |
| 5.12 | 节点类型识别 | remove_node 显示 | "移除墙体"/"移除门"/"移除窗户" 准确 |
| 5.13 | 对话历史 | 多轮对话 | 消息正确保留，可滚动 |
| 5.14 | 会话摘要 | 20+ 条消息后 | 自动触发 summarizeIfNeeded | 上下文压缩 |

---

### 六、Ghost Preview 系统

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 6.1 | Item preview | add_item 后 | 蓝色半透明方块 + 线框 | 视觉效果正确 |
| 6.2 | Wall preview | add_wall 后 | 墙体预览出现 | 位置尺寸正确 |
| 6.3 | Door preview | add_door 后 | 门预览出现在墙上 | 位置正确 |
| 6.4 | Window preview | add_window 后 | 窗户预览出现 | 位置正确 |
| 6.5 | 确认转实体 | 确认后 ghost → 真实节点 | metadata.isGhostPreview 移除 |
| 6.6 | 拒绝清除 | 拒绝后所有 ghost 移除 | 场景恢复原状 |
| 6.7 | Zundo 隔离 | ghost preview 期间 | undo 栈不受影响 | pause/resume 正确 |
| 6.8 | 批量 preview | batch 多个操作 | 所有 ghost 同时显示 | 全部可见 |

---

### 七、场景序列化

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 7.1 | 空场景 | 无节点 | items=[], walls=[], zones=[] | 不报错 |
| 7.2 | 无 level | levelId 为空 | 返回空上下文 | 不报错 |
| 7.3 | 物品列表 | 场景有 3 个物品 | 全部序列化，含 position/rotation/dimensions | 信息完整 |
| 7.4 | 墙体列表 | 场景有 4 面墙 | 含 start/end/thickness/length/children | 信息完整 |
| 7.5 | 墙上子节点 | 墙有门和窗 | children 包含 type/id/localX/width | 子节点信息正确 |
| 7.6 | Zone 信息 | 有 zone | 含 polygon/bounds/center/area/shape | 语义描述正确 |
| 7.7 | 墙体语义 | 水平/垂直/斜墙 | orientation 标注正确 (horizontal/vertical/diagonal) | 描述准确 |
| 7.8 | 最长墙标记 | 多面墙 | [LONGEST] 标记正确 | 标记准确 |
| 7.9 | 象限分析 | zone + items | 4 象限占用状态 (EMPTY/N items) | 分析正确 |
| 7.10 | activeZone | 选中 zone | activeZone 字段设置 | 选中状态正确 |

---

### 八、SSE 流式通信

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 8.1 | 正常流式 | 发送消息 | data: 行逐行解析 | 文本逐字显示 |
| 8.2 | tool_calls 解析 | AI 返回 tool_use | index-based 累积解析 | 工具参数正确 |
| 8.3 | 多 tool_call | 一次返回 2+ 个 tool call | pendingTools Map 按 index 累积 | 全部解析 |
| 8.4 | finish_reason | stream 结束 | onComplete 回调触发 | 文本和工具全部返回 |
| 8.5 | 无 finish_reason | stream 意外结束 | flush pending tools | 不丢失数据 |
| 8.6 | JSON 解析失败 | 畸形 data 行 | continue 跳过 | 不崩溃 |
| 8.7 | [DONE] 信号 | stream 结束标记 | 跳过处理 | 正常结束 |
| 8.8 | 429 限流 | 超过频率限制 | "AI 请求频率超限，请稍后再试" | 错误信息友好 |
| 8.9 | 非 200 响应 | 服务端错误 | 解析错误消息并显示 | 错误处理正确 |
| 8.10 | AbortController | 取消请求 | 不触发 onError | 静默取消 |

---

### 九、速率限制

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 9.1 | 正常请求 | 限额内 | 正常处理 | 200 响应 |
| 9.2 | 超过请求频率 | >60 req/hour | 429 + "Rate limit exceeded" | 被限制 |
| 9.3 | 超过 token 限额 | >500K tokens/hour | 429 + token 相关提示 | 被限制 |
| 9.4 | 不同 IP | 不同客户端 | 独立计数 | 互不影响 |

---

### 十、边界条件与异常

| # | 场景 | 预期行为 | 验证点 |
|---|------|---------|-------|
| 10.1 | 空消息 | 发送空字符串 | 不发起请求或提示输入 | 无异常 |
| 10.2 | 超长消息 | 发送 10000+ 字符 | 正常处理或截断提示 | 不崩溃 |
| 10.3 | 连续快速发送 | 快速点击发送 | AI 处理中禁止再次发送 | 不产生竞态 |
| 10.4 | AI 处理中切换面板 | 切换到其他 tab 再切回 | 状态保持 | 消息不丢失 |
| 10.5 | 无 ANTHROPIC_API_KEY | 环境变量缺失 | 500 错误 + 明确提示 | 不泄露信息 |
| 10.6 | 并发操作锁定 | AI 处理中手动编辑 | 应锁定或隔离 | 不产生冲突 |
| 10.7 | 特殊字符 | 输入含 HTML/JS 代码 | 消息正确显示，不执行 | XSS 防护 |
| 10.8 | Unicode/Emoji | 输入含 emoji | 正常处理 | 不乱码 |
| 10.9 | 网络断开 | 请求中断网 | 显示连接错误 | 不卡死 |
| 10.10 | 页面刷新 | AI 操作中刷新 | 状态重置 | 不报错 |

---

## 执行方式

使用有头浏览器按上述矩阵逐项测试。每个测试场景：

1. 在 AI 聊天面板输入对应指令
2. 观察 AI 回复和操作卡片
3. 检查 3D 视口中的 ghost preview
4. 验证确认/拒绝后的场景状态
5. 检查浏览器 console 是否有错误
6. 截图记录结果

对于验证规则类场景，可能需要直接构造特定条件（如清空场景、手动放置碰撞物品等）来触发边界条件。

## 评分标准

- **Critical**: AI 执行了错误操作（添加到错误位置/删除错误物品/崩溃）
- **High**: 验证规则未生效（碰撞未检测/越界未修正）
- **Medium**: UI 状态不一致（操作卡片状态错误/截图缺失）
- **Low**: 体验问题（回复语言不匹配/空间推理不准确）
