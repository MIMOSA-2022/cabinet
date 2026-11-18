# 橱柜设计 Web App

规格见 `SPEC.md`，已确认的决定见 `DECISIONS.md`（这两个只在本地，不放上网）。

## 网站

- 网址：https://mimosa-2022.github.io/cabinet/
- 程序放在 GitHub：MIMOSA-2022/cabinet（GitHub Pages，main 分支根目录）。推上去 1～2 分钟后网站就更新。
- 登入和资料：Supabase 项目 CABINET（新加坡）。资料表设定在 `supabase/schema.sql`，可以重复执行。
- 设定：`src/config.js` 放 Supabase 网址和 publishable key（可以公开）。secret / service_role key 绝对不要放进程序。

### 邀请同事

Supabase → Authentication → Users → **Invite user** → 填同事的 email。
同事收到 email，按链接进到网站，设一个密码就能用。不想让某人再用：在同一页把他删掉。

### 每个人的资料

- 项目：每个人自己的，只有自己看得到；电脑、平板、手机登入后同一份；每次修改自动存。
- 资料库：每人一份，所有同事都看得到，只能改自己的；拿别人的来用 = 复制一份。

## 在自己电脑上试（开发用）

在这个资料夹里执行：

```
powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1
```

然后用浏览器打开 http://localhost:8765 。

不需要安装 Node.js：页面直接用浏览器的 ES 模块，three.js 从 jsDelivr CDN 载入（所以要连网）。

## 程序结构（`src/`）

| 文件 | 做什么 |
|---|---|
| `model.js` | 项目资料结构、默认值、"上一次填的"记忆 |
| `geometry.js` | 从墙的长度和转角算出房间形状、墙角斜接、洞口、对角线算角度 |
| `symbols.js` | 立面线条：窗格子、门、插座等（3D 和以后的立面图/PDF 共用） |
| `plan.js` | 平面图（SVG）：墙、门窗、虚线 Pelmet/Beam、蓝色尺寸线、墙标 |
| `view3d.js` | 黑白线条 3D（three.js）：白色面挡住后面的线，墙外面朝镜头时自动藏起来 |
| `cabinet.js` | 柜子资料、默认值、算出每一片板、柜面、拉手、踢脚 |
| `units.js` | 冰箱、油烟机、Filler、Exposed Panel |
| `countertop.js` | 台面：垫板、戴帽、接缝、水盆和炉头开孔、自动生成 |
| `cabui.js` | 柜子、冰箱、台面、滑轨规格表的输入栏 |
| `ui.js` | 左边输入栏、右边属性栏、弹出栏 |
| `dims.js` | 每面墙自动算出蓝色尺寸线（宽度、高度、台面高度、总尺寸） |
| `overlay.js` | 叠在 3D 图上的尺寸线和红字说明（屏幕和 PDF 共用） |
| `output.js` | "图纸"分页：开门、尺寸线开关和位置、红字说明 |
| `pdf.js` | 导出 A3 PDF（jsPDF，从 CDN 载入） |
| `library.js` | 资料库：存、拿出来用、改名、删除、导出导入（每笔记着 owner 和 source，给第二步共用准备） |
| `main.js` | 撤销/重做、自动保存（浏览器 localStorage）、导入/导出 |

## 进度

- [x] 阶段 1：墙、门窗、天花（Pelmet / Beam / 柱子）、墙上的东西、平面图、3D 线条图
- [x] 阶段 2：柜子（下座橱、上座橱、高橱，每片板、门和抽屉拼块、拉手、踢脚、平面图拖动）
- [x] 阶段 3：水盆橱、电气炉橱、Oven Microwave 橱、转角橱、Filler、Exposed Panel、冰箱、油烟机、配件、滑轨规格表、台面
- [x] 阶段 4：衣橱（挂衣杆、橱身里的抽屉、镜子、烫衣板、LED 灯条、玻璃柜、坐凳和书桌台面板、门洞、饰面编号）
- [x] 阶段 5：成品图（自动蓝色尺寸线、红字说明、全部/单扇开门、导出 A3 PDF）
- [x] 阶段 6：资料库（柜子、冰箱/油烟机/板、窗、门、天花、台面、门板款式和拉手、配件、滑轨规格表、整个项目；导出/导入）
- [x] 第二步：登入（只限邀请）、项目存网上自动保存、同事共用资料库、平板手指操作、放上 GitHub Pages
- [ ] 第三步：手机查看和基本使用、试用后发现的东西

.ref/ 和 .debug/ 是开发时用的（参考 PDF 和测试截图），可以删掉。
