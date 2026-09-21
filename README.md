# 畅课 Hack

中国传媒大学畅课（TronClass）视频页助手 userscript。

> 适用于 `https://courses.cuc.edu.cn`。脚本不包含任何账号信息，任何用户登录自己的账号后即可使用。
> 其他学校的 TronClass 实例需修改 `config.js` / `webpack.config.js` 中的域名与路由。

## 功能

- **默认 10 倍速播放**（内置，无需设置）
- **一键完成**：把当前视频标记为已完成，秒出进度
- **完成所选**：勾选任意几个视频，一次性刷完
- **全部完成**：全选后一次刷完整门课（用「全选/取消」+「完成所选」）
- **抓包器**：面板底部实时显示页面发出的真实请求与响应，便于排障

面板按钮：`一键完成`（当前视频）、`完成所选`（勾选的视频）、`全选/取消`；
下方是可勾选的视频列表（显示标题与时长）。

## 一键完成原理

畅课驱动「完成度」的接口是：

```
POST /api/course/activities-read/{activityId}
Content-Type: application/json

{ "start": 0, "end": 363 }
```

其中 `end` 是已观看到的秒数（等于视频时长即视为看完）。

**关键坑**：服务器限制**单次上报时长 ≤ 125 秒**，超过会返回：

```
The set time duration（448s） is too long, maximum is 125s
```

而畅课自己的播放器上报的是整段时长（例如 448s），因此**它自己的上报也会被拒**，
这就是「视频播完了但进度不动」的根因。

本脚本的「一键完成」按 **120 秒分段**连续上报（`0-120`、`120-240` … 直到视频时长），
每段间隔 0.4 秒，全部返回 `completeness: "full"` 即完成。

## 安装

直接访问发布路径，Tampermonkey 会弹出安装页：

```
https://github.com/CUC-Life-Hack/tronclass-hack/raw/master/dist/main.user.js
```

安装步骤：

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 打开上面的发布路径（或 Tampermonkey → 实用工具 → 从文件导入 `dist/main.user.js`）。
3. Tampermonkey 弹出安装页，点「安装」。
4. 登录畅课，进入任意视频活动页，右上角出现面板即生效。

## 使用

1. 打开任意课程页（`.../course/{id}`）或视频活动页，右上角出现「畅课 Hack」面板。
2. 面板下方列出本课程所有视频（含时长），**默认全选**。
3. 想刷哪几个就勾哪几个，点 **「完成所选」**；或点 **「全选/取消」** 后一次刷完整门课。
4. 只刷当前正在看的视频：点 **「一键完成」**。
5. 状态行实时显示 `上报中：3/12（活动 xxx，448s）…`，结束给出 `成功 X / 失败 Y / 共 Z`。
6. 刷新课程页查看进度。

> 每个视频按 120 秒分段上报，段间间隔 0.3 秒；视频越多耗时越长（几十个约 1–2 分钟）。

> 若站点改版后按钮失效，可看面板底部「捕获的请求」，把 `activities-read` 那条的
> URL 与 body 反馈出来即可定位。

## 开发

```bash
npm install
npm run build      # 生产构建 → dist/main.user.js
npm run dev        # 开发监听 → dev/main.user.js
```

## 目录

```
src/
  main.js           # 主逻辑（路由判断、视频补丁、进度上报、抓包器、面板）
  base/
    index.js        # 内置 userscript-base 出口
    hack.js         # Hack 运行器（初始化重试 + 面板挂载 + SPA 路由监听）
    panel.js        # 右上角浮层面板
    panel.css       # 面板样式
    ajax.js         # Delay / Ajax / PostAjax / unsafeWindow 桥接
```

## 修复记录

原项目 `CUC-Life-Hack/tronclass-hack` 失效的原因及本项目的修复：

1. **依赖仓库已删除** — `git+https://github.com/CUC-Life-Hack/userscript-base.git` 已 404，
   `npm install` 直接失败。→ 把 `userscript-base` 内置到 `src/base/`。
2. **构建工具链冲突** — `webpack-userscript@2` 锁死 `webpack@4`。→ 升级到 `webpack@5` + `webpack-userscript@3`。
3. **构建输出目录错误** — 产物错误写进 `dev/`。→ 改为读取 `--mode`，正确输出 `dist/`。
4. **站点升级** — 不再暴露全局 `videojs`。→ 改为直接操作页面 `<video>` 元素。
5. **路由变化** — 视频页由 `/learning-activity/full-screen#/{id}` 变为 `/learning-activity#/{id}`，
   且为 SPA 无刷新跳转。→ `@include` 放宽到整站，运行时判断路由并监听 `hashchange`。
6. **进度不上报** — 站点自身上报因 125s 上限被拒。→ 按 120s 分段上报。

## 已知限制

- 进度上报按 120 秒分段，超长视频会连续发多段请求（每段间隔 0.4s）。
- 播放倍速上限受浏览器限制为 16x（脚本内置 10x）。
- 若畅课再次改版（域名 / 路由 / 接口 / 时长上限变化），可能需要跟进调整。

## 免责声明

本项目仅供学习与技术研究，使用者需自行承担使用风险。请遵守学校与平台的相关规定。

## License

GPL-3.0-or-later
