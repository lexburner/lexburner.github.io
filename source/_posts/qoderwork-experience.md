---
title: QoderWork 来了！AI 接管电脑是什么体验？
toc: true
type: 1
date: 2026-02-01 21:09:50
category:
- Qoder
tags:
- Qoder
---

**TL;DR**

- QoderWork 是 Qoder 推出的桌面级通用智能体助手，将 AI 能力从代码开发扩展到日常办公
- 核心能力覆盖文件整理、PPT 生成、信息图批量制作、视频合成等场景
- 本文分享了我结合自定义 Skill 的实战技巧：批量信息图制作、特定风格 PPT 生成等
- 关键洞察：**Skill 是差异化的关键**——同样的产品 + 不同的 Skill = 完全不同的产出质量
- 我的 Skill 合集：https://github.com/lexburner/skill-collection



## **前言**

最近 AI 热点实在太多了，我的钉钉工作群、朋友圈基本被 Claude Cowork、OpenClaw 这些新产品、新概念刷屏了，想不关注到都难。

就在 1月底，Qoder 发布了 QoderWork 新产品， 跟上边两个工具定位类似，但做了国内适配，免去了复杂的安装步骤，我也是迫不及待试用了一下，跟大家一起看看是怎么一回事。

目前 QoderWork 还在内测阶段，一周内估计就会正式开放，申请邀测：https://qoder.com/qoderwork

![](https://image.cnkirito.cn/a5ccd58f-5b30-4f25-b616-d7ff83e03591-20260201181625110.png)

<!-- more -->

## **QoderWork 是什么？**

QoderWork 定位是桌面级通用智能体助手，slogan 叫 “为真实工作而生”。

Qoder IDE/Qoder CLI/Qoder JB 更多还是开发者在使用，QoderWork 则覆盖到日常办公场景的所有人群。

与传统 AI 助手的对话式交互不同，QoderWork 是"任务驱动"的工作流引擎：

| **传统 AI 助手** | **QoderWork** |
| ---------------- | ------------- |
| 对话式交互       | 任务驱动      |
| 输出文本建议     | 直接操作电脑  |
| 需要人工执行     | 自动化执行    |
| 单次问答         | 复杂任务编排  |

可以在左下角切换【语言】，在【设置】中配置 Skill 和 MCP。

可以看到内置的 Skill 包含了 word、pdf、ppt 等常见办公场景涉及到的文档格式。也支持自定义 Skill，在本文后边的章节里面我也会分享我个人的一些工作流和自定义 Skill。

![](https://image.cnkirito.cn/0c23ddd5-7555-4dd9-a540-9c3ced806f6a.png)

官方给出的三类主要场景：

- 文件整理：智能整理和管理本地文件。提示词示例：扫描我的 Downloads 文件夹，找出所有重复的文件，保留最新版本。
- 内容创作：创作演示文稿、文档和多媒体内容。提示词示例：生成一个用于演示光的折射原理的动画视频，并帮我制作一个 PPT 课件，将这个视频作为素材插入 PPT 中。
- 文档处理：处理和分析文档数据。提示词示例：将『提案文件』文件夹中的 10 份 Word 文档统一调整为：标题宋体加粗 18 号、正文宋体 12 号、1.5 倍行距、首行缩进 2 字符。

## **文件整理**

如果没有 QoderWork，我更倾向于把所有日常工作用到的文件全堆到 Download 目录下，寻找最近使用的文件还可以按照时间排序，但是想要定位一些之前的文件，就很麻烦了。

![](https://image.cnkirito.cn/8d9ecc08-089d-4b0e-9f40-8e5a28da3213.png)



经过 QoderWork 整理后，瞬间清爽多了。

![](https://image.cnkirito.cn/bad1f673-140a-4d51-91b2-6e0e4d752e6f.png)



可能这么一项技能还不足以打动你，不过这只是开胃菜。

## **制作 PPT**

作为一个知识分享博主，我比较熟练的是进行文字内容的创作，但是偶尔也会进行一些现场技术交流，这里就涉及到将 markdown 格式的文字稿转成 PPT 的工作了，如果没有 QoderWork，我需要自己完成：观点提取、章节拆分、内容精简、排版等一系列复杂的工作，在 QoderWork 下一切变得简单了。

就拿我最近刚写的[《Qoder Quest 1.0：把执行交给 AI，把选择留给人类》](https://www.cnkirito.moe/qoder-quest/)来测试下：

![](https://image.cnkirito.cn/eb564ad0-b657-4786-9025-b16ad5b5d731.png)



这是一句话提示词制作出来的效果：

![](https://image.cnkirito.cn/image-20260201211305633.png)

可以发现基本已经能用了，但排版和配色缺乏品牌调性，而且有浓浓的 AI 味道——没错，是 AI 偏爱的渐变紫。

不过别急，我们可以通过 Skill 来定制特定风格。比如我这里准备了一个 Qoder 品牌风格的 Skill 来指导 QoderWork 生成 PPT。

![](https://image.cnkirito.cn/3e406d6a-baf1-4447-8d0d-64d5e8112492.png)



效果如下：

![](https://image.cnkirito.cn/image-20260201211511856.png)

配色和排版符合预期风格了。同理，你也可以定制自己公司的品牌风格、极简风格、学术风格等任意 Skill。

这给我一个启发：**有没有 Skill 差距很大**。未来即使使用相同的 QoderWork 产品，不同人搭配不同的 Skill，制作出来的产物质量也会有显著差异。

这个 qoder-ppt Skill 我也开源了，有需要可以自取：https://github.com/lexburner/skill-collection/tree/main/.qoder/skills/qoder-ppt

## **批量制作信息图**

对于一些自媒体创作者、偏运营的用户，一定有过这样的感受，现在大家越来越不愿意阅读长文了，而信息图则通过插画 + 内容的方式形象地达到运营的效果，更适合传播和达成完播率。

对于日常我们写一些 PPT 和文章来说，希望能展示出图文并茂的效果，同样也需要信息图来搭配。但是现在大多数 AI 图片生成的网站都只支持图片提示词和参考图片上传，不支持上传文章附件，这样的产品形态更像一个 API 而不是一个 Agent。过去这些工作我需要依赖 notebooklm、youmind 等垂类产品去搞定，但现在直接就可以在 QoderWork 中闭环了。

以下信息长图就是 QoderWork +[《Qoder Quest 1.0：把执行交给 AI，把选择留给人类》](https://www.cnkirito.moe/qoder-quest/)的产物。

Notion 小女孩风格：

![](https://image.cnkirito.cn/4167ed71-1f6f-41e7-ae6b-5f467da96bcf.png)



舰 C 岛风风格：

![](https://image.cnkirito.cn/74940a0d-1730-4437-b9c0-6cb623501066.png)



在没有 QoderWork 时想达到相同的效果，痛点还是非常明显的：

1. 需要人工将文章拆解为多个图片主题
2. 每张图的提示词都需要手动保持风格一致
3. 生成效果不满意时反复调整，耗时耗力

那我是怎么做到信息图制作的呢？也同样是依赖了 Skill：

![](https://image.cnkirito.cn/8688f5b1-9bb4-4a59-93fe-98ab5db3a4ec.png)



通过自定义的 Skill，配合 QoderWork 自带的 imageGen 工具，就可以达到批量出图的效果，QoderWork 会自行根据文章语义拆分段落，组装图片提示词，并保障组图的一致性。对了，最后如果想像我一样把多张图片拼接成一个长图，也可以自然语言对话让 QoderWork 完成，不用再去找其他工具了。

这 2 个 Skill 我也开源了，有需要可以自取：

notion 小女孩风格：https://github.com/lexburner/skill-collection/tree/main/.qoder/skills/notion-infographic

舰 C 岛风风格：https://github.com/lexburner/skill-collection/tree/main/.qoder/skills/kancolle-infographic

## **出行小助手**

想出去玩但懒得做攻略、比价机票？这些事现在也可以交给 QoderWork。

我让 QoderWork 帮我制作一个出行攻略：“从杭州去三亚旅游，帮我去飞猪携程搜索机票比价，然后帮我制定一个旅行攻略，生成一个 PDF，并且把日程加到 mac 自带的日历里边”，

![](https://image.cnkirito.cn/f0583526-c812-4957-932d-d003010deda3.png)



结果它直接接管了我的电脑，直接打开浏览器帮我进行比价，抓取数据并进行了分析



![](https://image.cnkirito.cn/434a9169-88f1-40dc-a2af-64db66fe722f.png)



并且提供了一份 PDF，详细介绍了旅游攻略：

![](https://image.cnkirito.cn/3f4209e6-82af-442d-b478-ceb7cbab277e.png)



还可以直接把行程加到日历里面

![](https://image.cnkirito.cn/33f35e0c-278c-4441-8601-9d81c51e0c20.png)



看到这详细的时间安排，原本我只是想做个功能演示，突然真的想去三亚了！

## **视频创作**

上文中提到的两个视频，其实也不是我自己录制的，也是 QoderWork 帮我合成的。

提示词示例：

@[file:local:/Users/xujingfeng/qoder/qoder-quest-presentation.pptx] 打开这个 ppt，浏览每一页 ppt，然后制作成一个视频，尽量时长短一点

QoderWork 的视频能力还支持添加字幕、配音等，适合需要快速产出演示视频的场景。不过我本人并不是视频内容创作者，这方面实践较少，大家感兴趣可以自行探索。

## **结语**

以上工作流和 Skill，包括一些还没分享出来的小技巧，我早先就在 Qoder Quest 中日常使用了。但 Qoder 的定位毕竟是 AI IDE，产品形态决定了它很难兼顾非开发者人群。QoderWork 的推出则补齐了这块拼图——更面向办公场景，界面简洁，开箱即用。

QoderWork 的发布，标志着 Qoder 从"AI Coding 工具"向"AI 办公平台"的领域拓宽。

2026 年，AI 不再是遥远的概念，而是像 QoderWork 这样的产品，真正走进我们的工作环境，期待 QoderWork 的持续迭代。

**延伸阅读**：

- 我的常用 Skill 合集：https://github.com/lexburner/skill-collection
