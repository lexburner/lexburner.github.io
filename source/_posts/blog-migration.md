---
title: 博客搬家
date: 2017-08-22 16:38:44
categories:
- 技术杂谈
banner: /css/images/banner/1.jpg
toc: true
---

陆陆续续，写博客已经写了有 4 年多了，之前一直在 CSDN 维护博客（[博客旧址](http://blog.csdn.net/u013815546)），最近有了点空余时间，使用 hexo 搭了这个博客，的确比 CSDN 清爽多了，首先感谢 @程序猿 DD 推荐的 icarus 模板，国人开发的一个 hexo 模板，插件支持可能不是很完善，但是样式非常让人喜欢。

作为一个前端弱渣，搭建博客的过程还是遇到了不少的困难。原先是打算直接使用 github 个人主页作为博客地址，hexo 对 git 有很好的支持，源代码和博客静态页面都托管在了 github，master 分支放静态页面，hexo 分支放源文件。可惜的是国内坑爹的网速,github.io 的访问速度不尽如人意（github.com 倒还好），于是在宇泽学妹 @ntzyz 的帮助下，搞了 github 的 hook，本地提交到 github 时，代理服务器自动向 master 分支拉取页面，同时设置反向代理和 https。由于 hexo 是静态文件搭建的博客，这种方式可以说是非常合适的。所以，国内的朋友浏览本博客可以直接访问 [https://www.cnkirito.moe](https://www.cnkirito.moe)，如果有国外代理的朋友可以直接访问我的 github 个人主页 [https://lexburner.github.io](https://lexburner.github.io)。

目前博客功能还不算完善，缺少评论，分享，和一些小插件，以后逐渐完善，不过不影响主要功能。以后这儿就作为我主要更新博客的地方了！

