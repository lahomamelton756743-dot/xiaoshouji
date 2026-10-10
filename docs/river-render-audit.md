# 独立时间河实际渲染审计

审计对象：`android/app/src/main/assets/littlephone/index.html`（main 当前代码）。

## 实际入口

- 首页 `renderRiver()`：渲染 `#riverTrack`，按日常册日期升序，横向轨迹。它不是独立时间河的渲染函数。
- 独立页面 `renderRiverApp()`：渲染 `#riverAppTrack`，按日常册日期**降序**；使用 `galaxyRiver`、`galaxyNode`、`galaxyBubble`、`galaxyMist`、`braidStrand`、`braidFlow`。
- 独立页面点击 `[data-app-book-id]` 调用原有 `openBook(id)`，必须保留。
- `riverClassicVertical`、`riverClassicNode`、`riverClassicBubble` 等存在于 CSS，但没有找到对应的当前 HTML/JS 生成引用。它们**可能是废弃规则**，不能当作实际渲染效果的依据。

## 现有布局的具体问题

1. 节点 `cx(i)=50+sin(i*.91+.35)*14+sin(i*.37+1.1)*5`：横向位置随索引波动，但 `bank=(100-x)>=x?'right':'left'` 是基于空间计算，几乎所有节点都可能偏向同一侧，未保证左右交替。
2. `w=Math.max(116,Math.min(168,Math.round(room*2.55)))`：宽度根据节点空间变化；卡片还通过 `getBoundingClientRect()` 在下一帧做二次平移，可能出现首次绘制后跳动。
3. `step=112` 是固定纵向间距，若卡片文字换行、系统字体缩放或窄屏布局，可能拥挤。
4. 根节点 `root.style.height` 在空数据分支没有全部复位；从有数据变空数据时存在残留高度风险。
5. `renderRiverApp()` 按日期降序，首页 `renderRiver()` 升序。这可以是产品设计，但应明确一致的时间方向，而非无意差异。
6. `galaxyStar` 动态生成多个装饰节点、六条 `braidStrand` 路径；应测量 Android WebView 动画与绘制开销后再决定保留数量。

## 变更顺序（禁止盲删）

- 首先抽离纯数据排序与节点布局计算；建立空/单条/多条/窄屏测试。
- 明确设计规范：独立时间河的时间方向、节点交错、卡片最大宽度、与河线的间距。
- 仅在确认 DOM 无引用后，分批移除 `riverClassic*` 遗留样式；保留现有 `galaxy*` 直至替代版通过视觉回归。
- 不动 `renderRiver()` 首页预览、不改 `openBook()`、不改 D1 数据。
- 需要 Android WebView 实机或截图验收，不能把纯代码检查当作视觉测试。

**结论**：当前真实页面由 `galaxyRiver` 渲染，旧 `riverClassic` 规则不一定生效。此前“旧样式相互冲突导致不好看”尚不能作为已证实根因。
