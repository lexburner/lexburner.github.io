---
title: 一个看板娘入住你的个人博客只需要三步
date: 2019-10-09 19:01:38
tags:
- live2d
categories:
- 技术杂谈
---

最近在浏览别人博客时，一个萌物给了我意外的惊喜，原来博客还可以这么玩

![小恶魔](https://kirito.iocoder.cn/%E5%B0%8F%E6%81%B6%E9%AD%94)

于是果断审查元素，发现这个萌萌哒的看板娘背后使用的是一个叫 live2d 的技术，并且凭借 Google 迅速找到对应的开源代码：https://github.com/xiazeyu/live2d-widget.js，https://github.com/EYHN/hexo-helper-live2d

你可以在我的博客中先目睹下它的实际效果：<https://www.cnkirito.moe/>，点击会有音效哦~

在浏览 live2-widget.js 的说明文档时，发现它对 hexo 的支持非常友好，恰好我的博客是通过 hexo 搭建的，所以本文会介绍一下如何为 hexo 集成一只看板娘。

<!-- more -->

## 安装

使用 npm 在 hexo 下安装 hexo-helper-live2d，它将 live2d-widget.js 与 hexo 进行了整合，使得我们只需要通过简单的配置，即可生效

```
npm install --save hexo-helper-live2d
```

接着下载一个 Kirito 良心推荐的看板娘：shizuku，也是我正在用的

```
npm install live2d-widget-model-shizuku
```

如果安装成功，我们可以在 node_modules 目录中找到 live2d-widget 和 live2d-widget-model-shizuku 两个目录

## 配置

向 hexo 的 `_config.yml` 添加如下的配置

```yaml
live2d:
  enable: true
  scriptFrom: local
  pluginRootPath: node_modules/
  pluginJsPath: lib/
  pluginModelPath: assets/
  tagMode: false
  debug: false
  model:
    use: live2d-widget-model-shizuku
  display:
    position: right
    width: 150
    height: 300
  mobile:
    show: true
  react:
    opacity: 0.7
```

需要留意的是 live2d.model.use 这个标签的值，是用于指定博客使用哪一个看板娘模型的。

## 发布

接着只需要正常编译并发布，你的 hexo 博客就获得了一枚萌妹子了

```
hexo g
hexo d
```

## 模型推荐

除了上述推荐的 shizuku 看板娘，作者还提供了其他一些不错的模型，下面罗列一部分，不知道你会 pick 哪一个呢？

**miku**

![img](https://huaji8.top/img/live2d/miku.gif)

**haru**

![haru](https://huaji8.top/img/live2d/haru.gif?imageMogr2/thumbnail/640x640/format/webp/blur/1x0/quality/75|imageslim)

**koharu**

![koharu](https://huaji8.top/img/live2d/koharu.gif)

**haruto**

![haruto](https://huaji8.top/img/live2d/haruto.gif)

**nipsilon**

![nipsilon](https://huaji8.top/img/live2d/nipsilon.gif)

**shizuku**

![shizuku](https://huaji8.top/img/live2d/shizuku.gif)

**z16**

![z16](https://huaji8.top/img/live2d/z16.gif)

**hibiki**

![hibiki](https://huaji8.top/img/live2d/hibiki.gif)

**Unitychan**

![Unitychan](https://huaji8.top/img/live2d/Unitychan.gif)

**hijiki**

![hijiki](https://huaji8.top/img/live2d/hijiki.gif)

## 尾记

Live2d 的确是很有意思的一个技术，可以让静态博客有了一些生机，如果你对其感兴趣，还可以自己采集模型，自己发布模型，甚至在了解这样技术的同时，我还见识到一些科技感满满的博主把 AI 机器人的特性添加给了看板娘，让其可以与正在使用鼠标浏览的你进行互动，这些我就不过多介绍了，如果你也有一个博客，那就赶紧试试这个 idea 吧。