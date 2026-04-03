<div align="center">

# Aedifex

**基于 WebGPU 的开源 3D 建筑编辑器**

在浏览器中创建、编辑和可视化建筑空间。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[**English**](./README.md) | [**中文**](./README.zh-CN.md)

https://github.com/user-attachments/assets/8b50e7cf-cebe-4579-9cf3-8786b35f7b6b

</div>

## 功能特性

### 结构与布局

- **墙体系统** — 绘制墙体，自动斜接处理，可调节厚度和高度，自动对齐 0.5m 网格。
- **门窗系统** — 在墙上放置门窗，支持自定义尺寸、开启方向和铰链位置。
- **房间识别** — 墙体围合后自动检测房间（Zone），显示面积、形状分析和空间信息。
- **多楼层** — 支持楼层堆叠、展开、独显模式，每层独立平面图。
- **楼板、天花板与屋顶** — 基于多边形的楼板、天花板和屋顶分段绘制。

### 家具与物品

- **内置目录** — 沙发、桌椅、床、书架、灯具、树木等丰富的家具目录。
- **智能放置** — 碰撞检测、墙面吸附对齐、房间边界约束，确保物品始终在房间内。
- **可交互物品** — 开关灯光、调节灯亮度等交互功能。

### 材质系统

- **10 种预设** — 白色、砖块、混凝土、木材、玻璃、金属、石膏、瓷砖、大理石和自定义。
- **自定义属性** — 每个节点独立设置颜色、粗糙度、金属度、透明度。
- **全节点支持** — 墙体、楼板、门、窗、天花板、屋顶均可应用材质。

### 视图与导航

- **街景漫游** — 第一人称步行模式，WASD 移动、鼠标环顾、Q/E 上下浮动，从室内视角体验设计。
- **明暗主题** — 一键切换亮色/暗色视口主题。
- **指南针** — 始终可见的方位指示器。
- **相机控制** — 鼠标和触摸板操作。Mac 触摸板优化：双指滑动平移 + 捏合缩放 + 右键旋转。

### 导出

- **GLB** — glTF 二进制格式，适用于 Web 和游戏引擎。
- **STL** — 用于 3D 打印。
- **OBJ** — 通用交换格式。

### AI 设计助手

- **自然语言** — 用文字描述需求：*「创建一个 5m x 4m 的房间，布置成卧室。」*
- **16 种工具** — 添加/移除/移动家具、创建墙体、放置门窗、修改墙高/门宽/窗户尺寸、批量操作、多方案提议、询问澄清等。
- **幽灵预览** — AI 建议以半透明预览显示，确认后才执行。
- **智能循环** — AI 自动迭代调整位置，处理碰撞和边界约束，在请求模糊时主动向用户提问。
- **目录匹配** — 模糊名称匹配 + 形状变体警告（如请求圆桌但只有方桌时会提醒）。

---

## 快速开始

```bash
# 克隆
git clone https://github.com/AedifexOrg/aedifex.git
cd aedifex

# 安装依赖
pnpm install

# 启动开发服务器（所有包 + 编辑器）
pnpm dev

# 打开 http://localhost:3002
```

> **环境要求：** Node.js 20+，pnpm 9+。需要支持 WebGPU 的浏览器（Chrome 113+、Edge 113+、或 Firefox Nightly）。

---

## 操作指南

### 鼠标

| 操作 | 输入 |
|------|------|
| 选择 | 左键点击 |
| 平移 | 中键拖动，或 空格 + 左键拖动 |
| 旋转 | 右键拖动 |
| 缩放 | 滚轮 |

### 触摸板（Mac）

| 操作 | 手势 |
|------|------|
| 平移 | 双指滑动 |
| 缩放 | 双指捏合 |
| 旋转 | 右键拖动（双指点按 + 拖动） |

### 街景漫游

| 操作 | 输入 |
|------|------|
| 移动 | WASD |
| 环顾 | 鼠标 |
| 上升/下降 | Q / E |
| 退出 | Escape |

---

## 架构

Turborepo 单仓库，三个包：

```
aedifex/
├── apps/editor/       # Next.js 16 应用
├── packages/core/     # 数据模型、状态管理（Zustand）、几何系统、空间查询
└── packages/viewer/   # 3D 渲染（React Three Fiber + WebGPU）
```

| 包 | 职责 |
|---|------|
| **core** | 节点 Schema（Zod）、场景存储 + 撤销重做（Zundo）、几何系统、空间网格、事件总线 |
| **viewer** | 渲染器、相机、灯光、后处理、楼层/扫描/参考系统 |
| **editor** | 工具、面板、选择管理、AI 助手、自定义相机控制 |

### 场景数据模型

节点存储为**扁平字典**，通过 `parentId` 表达层级：

```
Site → Building → Level → Wall → Door / Window
                        → Zone（房间）
                        → Slab / Ceiling / Roof
                        → Item（家具）
```

### 关键文件

| 路径 | 说明 |
|------|------|
| `packages/core/src/schema/` | 节点类型定义（Zod schemas） |
| `packages/core/src/schema/material.ts` | 材质系统（10 种预设 + 自定义属性） |
| `packages/core/src/store/use-scene.ts` | 场景状态存储 |
| `packages/core/src/systems/` | 几何生成系统 |
| `packages/viewer/src/components/renderers/` | 节点渲染器 |
| `packages/viewer/src/components/viewer/` | Viewer 主组件 |
| `packages/editor/src/components/tools/` | 编辑器工具（墙体、区域、物品、楼板） |
| `packages/editor/src/components/ai/` | AI 助手（Prompt、Agent 循环、验证器） |
| `packages/editor/src/components/editor/first-person-controls.tsx` | 街景漫游模式 |
| `packages/editor/src/components/editor/export-manager.tsx` | 场景导出（GLB、STL、OBJ） |

### 技术栈

| 层级 | 技术 |
|------|------|
| 渲染 | Three.js（WebGPU）、React Three Fiber、Drei |
| 框架 | React 19、Next.js 16 |
| 状态 | Zustand + Zundo（撤销/重做） |
| 校验 | Zod |
| 几何 | three-bvh-csg（布尔运算） |
| 工具 | TypeScript 5、Turborepo、pnpm |

---

## 贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md) 了解开发规范。

```bash
# 构建所有包
turbo build

# 构建指定包
turbo build --filter=@aedifex/core
```

---

## 致谢

Aedifex 基于 Pascal Group Inc. 的开源项目 [Pascal Editor](https://github.com/pascalorg/editor) 构建，采用 MIT 协议。感谢原作者在 3D 建筑编辑器核心方面的出色工作。

---

## 许可证

[MIT](LICENSE)
