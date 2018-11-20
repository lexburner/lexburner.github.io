---
title: JCTools -- 高性能内存队列探秘(写作中...)
date: 2018-09-01 19:47:28
tags:
- JCTools
- 队列
categories:
- JAVA并发合集
---


```
Benchmark                    (burstSize)  (qCapacity)            (queueType)  Mode  Cnt        Score        Error  Units
QueueBenchmark.offerAndPoll       100000       132000     ArrayBlockingQueue  avgt   15  3746839.904 ± 214308.618  ns/op
QueueBenchmark.offerAndPoll       100000       132000    LinkedBlockingQueue  avgt   15  6537598.922 ± 611003.544  ns/op
QueueBenchmark.offerAndPoll       100000       132000  ConcurrentLinkedQueue  avgt   15  2944479.279 ±  41621.277  ns/op
QueueBenchmark.offerAndPoll       100000       132000         MpscArrayQueue  avgt   15  1199839.760 ±  65991.348  ns/op
```





**欢迎关注我的微信公众号：「Kirito的技术分享」，关于文章的任何疑问都会得到回复，带来更多 Java 相关的技术分享。**

![关注微信公众号](http://kirito.iocoder.cn/qrcode_for_gh_c06057be7960_258%20%281%29.jpg)

