---
title: Nacos Client 1.4.1 版本踩坑记录
toc: true
type: 1
date: 2021-05-27 20:08:52
categories:
  - 微服务
tags:
- Nacos
---

## 问题发现

就在这周，我接到 MSE Nacos 用户的反馈，说线上 Nacos 不可用，服务都下线了，日志里面也是一堆报错，我下意识以为线上炸了，赶紧上线排查。本文主要记录这次问题的排查过程，以及解决方案。

首先看用户反馈的报错，日志如下：

![](https://image.cnkirito.cn/image-20210527201838722.png)

并且用户反馈业务日志也出现了大量的服务地址找不到的报错，说明 Nacos 服务都下线了。

我立刻查看了服务端的监控，发现用户的 MSE Nacos 集群并无异常，cpu/内存等指标有下降，并没有异常行为，排除了服务端异常的可能性。

随即将视线聚焦在了客户端。老实说，这个报错我第一次见，看异常堆栈，字面意思便是域名解析出问题了。这个报错大概持续了 10 分钟，立刻让用户在业务节点上使用 ping、dig 等工具确认域名解析是否正常，测试发现均无异常。继续让用户 telnet mse-xx.com 8848，发现也能够 telnet 通。

根据这些现象，大概能得出结论：用户的机器上出现了短暂的域名解析问题，导致短时间访问不通 MSE Nacos。但用户继续反馈说，一部分重启以后的机器已经恢复了，但没有重启的机器，竟然还会出现调用报错。不然怎么说重启大法好呢，但也加深了问题的诡异性。

正当一筹莫展时，另一用户也找上来了，竟然也是一样的问题，并且由于第二个用户还同时使用了 redis，报错日志中除了出现 nacos 的域名解析问题，还报了 redis 的域名解析报错。至此，更加坚定了我之前推测，根因肯定是域名解析出现了故障，导致这两个用户收到了影响。但问题在于，为什么短暂的域名解析失败（大概 10 分钟），会导致持续性的 Nacos 问题呢？并且只有重启才能恢复。

分析两个用户的共性，最终我和同事将可疑点锁定在了 Nacos 客户端版本上，对比发现，用户都是同一个报错，并且竟然都是 nacos-client 1.4.1 版本。

##Nacos 1.4.1 版本引入的 bug

在问题发生时，Nacos 1.x 最新的版本已经是 Nacos 1.4.2 了，将源码 checkout 到 1.4.1 版本，追踪堆栈附近的问题，

![](https://image.cnkirito.cn/image-20210527204942162.png)

上述这段代码是 Nacos 访问服务端的一段代码，进入 595 行，一探究竟。

![](https://image.cnkirito.cn/image-20210527205751308.png)

我们成功找到了堆栈中的直接报错，就是这段 IsIPv4 的判断触发。splitIPPortStr 这个方法的主要逻辑是从 Nacos 的连接串筛选出连接地址，主要是为了做默认端口号的判断，如果用户没有携带 8848，会默认带上 8848。

但问题恰恰便是出现在这儿：

![](https://image.cnkirito.cn/image-20210527210716610.png)

InetAddress.getByName(addr) 是一个内置的方法，描述如下：

```
Given the name of a host, returns an array of its IP addresses, based on the configured name service on the system.
```

意思是把一个域名传给操作系统，返回一串 IP，这不就是域名解析吗！我当时就很好奇，你说你判断 IPv4 格式，为啥要这么判断呢？直接判断 IPv4 的 pattern 不行吗？而这段代码，恰恰是导致问题的凶手之一。

我们看看 1.4.2，已经修复了这个逻辑了，直接改成了正则判断。

![](https://image.cnkirito.cn/image-20210527211141214.png)

但疑问还是存在的，域名解析短暂失败了，为啥会导致服务全都下线了，并且解析恢复后，服务依旧没有上线呢？

继续追踪这段代码，发现 callServer 这段代码会被 com.alibaba.nacos.client.naming.beat.BeatReactor 持有，用于维持自身和 Nacos 的心跳。

![](https://image.cnkirito.cn/image-20210527211801891.png)

而由于上述域名解析失败，抛出的异常是 `IllegalArgumentException`，并没有被里层方法转换成 NacosException，从而导致心跳线程没有 catch 住异常，彻底停止发送心跳了！

这也就成功解释了，为什么短暂的域名解析失败，会导致服务全部下线了。（Nacos 是利用心跳维护和 server 端的存活状态的）

## 改进建议

1. 修改 isIPv6 和 isIPv4 的判断方式，改为正则匹配。上文提及，这点已经在 1.4.2 修复了。
2. 心跳线程要保证不被异常中断下一次心跳的提交。

![](https://image.cnkirito.cn/image-20210527212347213.png)

第二点，也已经被修复了。

## 总结

nacos-client 1.4.1 存在严重的 bug，客户端与 Nacos Server 如果发生短暂的域名解析问题，会导致心跳永久丢失，进而引发服务全量下线，即使网络恢复，也不会自动恢复心跳。

域名解析失败常见于网络抖动或者 K8s 环境下的 coreDNS 访问超时等场景，为避免域名解析对 Nacos 造成的重大影响，请务必自查应用代码中使用的 nacos-client 的版本。

该问题仅存在于 1.4.1 版本，低于此版本不受此问题的影响，使用 1.4.1 的用户建议升级至 1.4.2 以避免此问题。

使用 SpringCloud/Dubbo 的用户，需要确认实际框架使用的 nacos-client 版本，可以通过显式指定 nacos-client 的版本以覆盖框架默认的版本。其中 Dubbo 用户要格外小心，Dubbo 的 2.7.11 版本默认使用了 nacos-client 1.4.1，务必显式指定 nacos-client 的版本到 1.4.2，Dubbo 也将在下个 release 版本替换 Nacos 的默认版本。

