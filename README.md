# 冠军图鉴 · Pokémon Champions Dex

《宝可梦冠军》玩家用的可用宝可梦速查与队伍工具（微信小程序）。

- 图鉴：可用宝可梦（含超级进化与地区/特殊形态）的种族值、特性、招式
- 招式库：可用招式的威力 / 命中 / PP / 效果
- 榜单：单打（Smogon BSS）与双打（Limitless）使用率 TOP 50 及配置统计，全部精灵都可查
- 队伍：6 只编队、特性/道具/性格/努力值配置、伤害计算

> 数据规模随版本变化，以 `data/pokedex.js` 的 `META` 为准（`node scripts/update-data.js status` 可直接查看当前版本）。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/数据更新指南.md](docs/数据更新指南.md) | **怎么把数据更新到最新**：脚本用法、数据源、远程热更新、自动化 |
| [docs/小程序界面交互设计规范.md](docs/小程序界面交互设计规范.md) | 通用的小程序界面与交互规范（含验收清单） |
| [docs/界面重构说明.md](docs/界面重构说明.md) | 本次重构的问题诊断、逐页改动、验证方式 |
| [docs/preview/](docs/preview/) | 按 375×812 渲染的界面预览图 |

## 开发

```bash
node scripts/update-data.js status   # 数据版本 / 新鲜度体检
node scripts/update-data.js usage    # 拉 Smogon 最新月份使用率（--dry-run 先看差异）
node scripts/update-data.js pokedex  # 从 OP.GG 更新图鉴（--dry-run / --sprites / --items）
node scripts/update-data.js check    # 数据自洽校验 + 代码包体积
node scripts/update-data.js reformat # 按当前数据重排 data/*.js（不联网，修体积用）
node scripts/update-data.js publish  # 生成远程热更新包 dist/usage.json（版本号自动 +1）
node scripts/validate.js             # 静态校验：JSON/JS/WXML/WXSS/组件/路由/资源/色值
node scripts/smoke.js                # 运行时冒烟测试：真跑每个页面的 onLoad 与主要交互
node scripts/report-size.js          # 代码包体积：源码包 / 压缩后 / 微信 2MB 限制自查
node scripts/preview.js              # 生成 docs/preview/*.png（需要 Chrome）
node scripts/preview.js --zoom 图鉴   # 单帧 2x 放大
python scripts/make_tabbar_icons.py  # 重新生成 tabBar 图标
```

`scripts/`、`docs/`、`*.md`、`*.py` 已在 `project.config.json` 的 `packOptions.ignore` 中排除，不会打进小程序包。

> **别把 `data/*.js` 改成多行对象字面量**：开发者工具编译会用 Babel 重排大对象，`data/pokedex.js` 会从 497 KB 涨到 2837 KB，整包超过「源码包 2MB」上限导致上传失败。详见 [数据更新指南 §3.5](docs/数据更新指南.md)。

## 结构

```
app.js / app.json / app.wxss     入口、页面注册与 tabBar、设计令牌与基础样式
components/                      nav-bar / segmented / sheet / empty-state
pages/                           index 图鉴 · detail 详情 · rankings 榜单
                                 teams 队伍列表 · team 队伍编辑 · picker 选择宝可梦
                                 member 成员配置 · calc 伤害计算 · profile 我的
data/                            pokedex.js 图鉴 · usage.js 使用率 · items.js 道具
utils/                           mon/favs/format/routes/system/ui + 队伍/伤害/属性克制
assets/                          精灵图与 tabBar 图标
scripts/                         data 更新 / 静态校验 / 冒烟测试 / 预览 / 图标生成
```

## 数据

- **图鉴数据**（宝可梦、招式、特性、道具）随版本发布，来自 OP.GG Champions Pokédex。
- **使用率数据**支持远程 JSON 热更新：在 `config.js` 填 `usageRemote.url` 后，小程序启动就会自动拉新数据（版本号变大才替换），未配置或请求失败时自动用内置数据。
- 更新方法见 [docs/数据更新指南.md](docs/数据更新指南.md)。

本作品为非官方粉丝作品，与 Nintendo、Creatures、GAME FREAK 及 The Pokémon Company 无任何关联。
