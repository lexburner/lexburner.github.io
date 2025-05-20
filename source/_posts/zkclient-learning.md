---
title: 使用 zkclient 操作 zookeeper 的学习过程记录
date: 2016-08-16 15:52:52
tags: 
- zookeeper
categories: 
- JAVA
toc: true
---

前言
--

最近开发的分布式 (使用 motan) 项目中使用 zookeeper 作为服务中心来提供注册服务 (`@MotanService`) 和发现服务(`@MotanRefer)`, 虽然 motan 这个 rpc 框架对服务模块进行了很好的封装，但是以防以后会出现定制化的需求，以及对服务更好的监控，所以有必要了解一下 zookeeper 的基本知识和使用方法。关于 zookeeper 的知识点，网上很多的博客都已经介绍的很详尽了，我写这篇的博客的用意其实也就是将一些零散的却很精妙的博客整理出来，方便以后查阅。短篇以 cp 的方式，长篇的以 url 的方式。

zookeeper 是什么？
-------------


> ZooKeeper 是一个分布式的，开放源码的分布式应用程序协调服务，是 Google 的 Chubby 一个开源的实现，是 Hadoop 和 Hbase 的重要组件。它是一个为分布式应用提供一致性服务的软件，提供的功能包括：配置维护、域名服务、分布式同步、组服务等。
> ZooKeeper 的目标就是封装好复杂易出错的关键服务，将简单易用的接口和性能高效、功能稳定的系统提供给用户。
> ZooKeeper 包含一个简单的原语集，提供 Java 和 C 的接口。 ZooKeeper 代码版本中，提供了分布式独享锁、选举、队列的接口。
>
> ---- 百度百科

一开始看的云里雾里的，幸好我之前搞过一点 hadoop，对他的生态体系有所了解，这才大概知道他想说什么。提炼几个关键词，并且加入我后面学习的理解，总结一下就是 --

> zookeeper 是一个组件，需要安装客户端和服务端，一般用于解决分布式开发下的一些问题。化抽象为具体，你可以把整个 zookeeper 理解成一个树形数据结构，也可以理解为一个文件系统的结构，每个叶子节点都会携带一些信息 (data)，并且也可能会携带一些操作 (op)。分布式场景中，每一个客户端都可以访问到这些叶子节点，并且进行一些操作。我们所有使用 zookeeper 的场景几乎都是在 CRUD 某一个或者某些叶子节点，然后会触发对应的操作... 即 zookeeper 本身可以理解为一个 shareData。
> ---- 来自于博主的口胡

zookeeper 怎么学？
-------------
学一个新的中间件的最好方法是先在脑子里面有一个想法：我为什么要学他，是想解决什么问题，他大概是个什么东西，我觉得打开思路的最好方式是看几篇博客 (大多数情况你一开始看不懂，但是混个眼熟)，然后看视频，这里我自己是了解过了 zookeeper 原生的 api 之后看了[极客学院](http://www.jikexueyuan.com/course/zookeeper/) 的视频

<!-- more -->

zkclient 的使用
-----------
学完原生 api 之后一般我们不直接使用，类比 redis 的客户端 jedis，再到 spring 提供的 redisTemplate; 类比 jdbc 到 dbutils，再到 orm 框架。所以作为小白，我建议使用这个比较简单的客户端 zkclient，当后期需求需要一些定制化需求时使用原生的 api 自己重写，或者使用更高级一点的其他客户端。

zkclient 我学完之后觉得非常轻量级，设计也很规范，大概可以参考以下的博客。
[博客园 - 房继诺](http://www.cnblogs.com/f1194361820/p/5575206.html)
原作者非常用心，里面给出了一张 zkclient 的 uml 类图，如下
![这里写图片描述](http://img.blog.csdn.net/20170204020203065?watermark/2/text/aHR0cDovL2Jsb2cuY3Nkbi5uZXQvdTAxMzgxNTU0Ng==/font/5a6L5L2T/fontsize/400/fill/I0JBQkFCMA==/dissolve/70/gravity/SouthEast)
顺便也复习一下 uml 类图的知识，理解清楚图中用到的聚合，组合，关联，泛化，实现的箭头含义。uml 建模没有学好的同学的移步这个 [链接](http://justsee.iteye.com/blog/808799)，里面对应了 java 讲解，还算详细。
掌握这个客户端之后，还需要补充一些注意点

    1.  create 方法: 创建节点时, 如果节点已经存在, 仍然抛出 NodeExistException, 可是我期望它不在抛出此异常.
    2.  retryUtilConnected: 如果向 zookeeper 请求数据时 (create,delete,setData 等), 此时链接不可用, 那么调用者将会被阻塞直到链接建立成功; 不过我仍然需要一些方法是非阻塞的, 如果链接不可用, 则抛出异常, 或者直接返回.
    3.  create 方法: 创建节点时, 如果节点的父节点不存在, 我期望同时也要创建父节点, 而不是抛出异常.
    4.  data 监测: 我需要提供一个额外的功能来补充 watch 的不足, 开启一个线程, 间歇性的去 zk server 获取指定的 path 的 data, 并缓存起来.. 归因与 watch 可能丢失, 以及它不能持续的反应 znode 数据的每一次变化, 所以只能手动去同步获取.

回到开始
----
这个时候看看你当初为啥要学习 zookeeper，看看能不能解决你当时遇到的问题。如果你有兴趣，可以自己去试试 zookeeper 前面提到的那些可以实现的功能：分布式锁、选举、队列等等

