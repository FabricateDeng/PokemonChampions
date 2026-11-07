# 冠军图鉴 · Pokémon Champions Dex

《宝可梦冠军》玩家用的可用宝可梦速查与队伍工具（微信小程序）。

- 图鉴：348 只可用宝可梦（含 81 个超级进化与地区/特殊形态）的种族值、特性、招式
- 招式库：510 个可用招式的威力 / 命中 / PP / 效果
- 榜单：单打（Smogon BSS）与双打（Limitless）使用率 TOP 50 及配置统计
- 队伍：6 只编队、特性/道具/性格/努力值配置、伤害计算

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/小程序界面交互设计规范.md](docs/小程序界面交互设计规范.md) | 通用的小程序界面与交互规范（含验收清单） |
| [docs/界面重构说明.md](docs/界面重构说明.md) | 本次重构的问题诊断、逐页改动、验证方式 |
| [docs/preview/](docs/preview/) | 按 375×812 渲染的界面预览图 |

## 开发

```bash
node scripts/validate.js        # 静态校验：JSON/JS/WXML/WXSS/组件/路由/资源/色值
node scripts/smoke.js           # 运行时冒烟测试：真跑每个页面的 onLoad 与主要交互
node scripts/preview.js         # 生成 docs/preview/*.png（需要 Chrome）
node scripts/preview.js --zoom 图鉴   # 单帧 2x 放大
python scripts/make_tabbar_icons.py    # 重新生成 tabBar 图标
```

`scripts/`、`docs/`、`*.md` 已在 `project.config.json` 的 `packOptions.ignore` 中排除，不会打进小程序包。

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
```

## 数据

图鉴数据随版本发布；使用率数据支持远程 JSON 热更新（见 `config.js`，未配置地址或请求失败时自动使用内置数据）。

本作品为非官方粉丝作品，与 Nintendo、Creatures、GAME FREAK 及 The Pokémon Company 无任何关联。
